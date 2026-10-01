import { mkdtemp, writeFile, open, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { baseImageSchema, docker, recordSchema, verifyImage } from "./docker.js";
import { readSnapshot, snapshotDigest, exportFiles, RunnerError, type SnapshotFile } from "./snapshot.js";

export const dependencyPaths = ["package.json", "pnpm-lock.yaml"];
const containerPaths = ["build.mjs", "serve.mjs", "playwright.config.mjs", "test.mjs", "collect.mjs"];
export function controlIdentity(files: SnapshotFile[]) {
  const dependencies = dependencyPaths.map(path => {
    const file = files.find(entry => entry.path === path);
    if (!file) throw new RunnerError("Reviewed control needs package.json and a frozen pnpm lockfile.");
    return file;
  });
  const tests = files.filter(file => file.path.startsWith("src/tests/browser/"));
  if (!tests.some(file => file.path === "src/tests/browser/shop.spec.ts") || !tests.some(file => file.path === "src/tests/browser/protected-fixtures.ts")) throw new RunnerError("Reviewed control needs the protected browser suite and evidence fixture.");
  const runtime = containerPaths.map(name => {
    const file = files.find(entry => entry.path === `src/harness/testing/container/${name}`);
    if (!file) throw new RunnerError("Reviewed control is missing the container runtime.");
    return file;
  });
  return { dependencies, tests, runtime, controlDigest: snapshotDigest(files), testDigest: snapshotDigest(tests), dependencyDigest: snapshotDigest(dependencies) };
}
export async function prepareRunner(repository: string, controlSha: string, baseImage: string) {
  baseImageSchema.parse(baseImage);
  const files = await readSnapshot(repository, controlSha);
  const identity = controlIdentity(files);
  const context = await mkdtemp(join(tmpdir(), "safi-image-"));
  const name = `safi-runner-${randomUUID()}`;
  const directory = resolve(repository, ".safi/runner-images");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const version = /playwright:v(\d+\.\d+\.\d+)-/.exec(baseImage)![1];
  try {
    await exportFiles(context, identity.dependencies);
    await mkdir(join(context, "gate/tests"), { recursive: true });
    for (const file of identity.tests) {
      const path = file.path.slice("src/tests/browser/".length);
      await exportFiles(join(context, "gate/tests"), [{ ...file, path }]);
    }
    for (const file of identity.runtime) await writeFile(join(context, "gate", file.path.split("/").at(-1)!), file.data, { flag: "wx" });
    const dockerfile = `FROM ${baseImage}\nUSER root\nWORKDIR /opt/fixture\nCOPY package.json pnpm-lock.yaml ./\nRUN npm install --global --ignore-scripts pnpm@10.12.4 && pnpm install --frozen-lockfile --ignore-scripts && node -e "if(require('/opt/fixture/node_modules/@playwright/test/package.json').version !== '${version}') process.exit(1)"\nCOPY gate /opt/gate\nRUN ln -s /opt/fixture/node_modules /opt/gate/node_modules && chmod -R a-w /opt/fixture /opt/gate\nLABEL safi.control-sha="${controlSha}" safi.control-digest="${identity.controlDigest}" safi.test-digest="${identity.testDigest}" safi.dependency-digest="${identity.dependencyDigest}" safi.base-image="${baseImage}"\nUSER 1000:1000\n`;
    await writeFile(join(context, "Dockerfile"), dockerfile, { flag: "wx" });
    await docker(["build", "--pull", "--network=default", "--tag", name, context], 900000, 8 * 1024 * 1024);
    const inspected = JSON.parse((await docker(["image", "inspect", name])).stdout);
    const record = recordSchema.parse({ version: 1, controlSha, controlDigest: identity.controlDigest, testDigest: identity.testDigest, dependencyDigest: identity.dependencyDigest, imageId: inspected[0]?.Id, baseImage, preparedAt: new Date().toISOString(), review: "operator-declared-control-review" });
    await verifyImage(record);
    const path = join(directory, `${randomUUID()}.json`);
    await writeFile(path, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return { recordPath: path, imageTag: name, ...record };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    await writeFile(join(directory, `${name}-failure.log`), String(failure.stdout ?? "") + String(failure.stderr ?? ""), { flag: "wx", mode: 0o600 });
    throw new RunnerError("Runner image preparation failed; inspect private .safi/runner-images failure logs and Docker readiness.");
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}
export async function readRunnerRecord(path: string) {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 16384) throw new RunnerError("Runner review record must be a bounded regular file.");
    const buffer = Buffer.alloc(16385);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 16384) throw new RunnerError("Runner review record exceeds size limit.");
    return recordSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
  } finally { await file.close(); }
}
