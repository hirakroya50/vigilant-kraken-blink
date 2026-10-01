import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { git } from "../git/worktrees.js";
import { readSnapshot, parseTree, assertProtectedSnapshot, snapshotDigest, validateSnapshotPath, type SnapshotFile } from "../testing/snapshot.js";
import { sandboxArguments, baseImageSchema, recordSchema } from "../testing/docker.js";
import { decodeBuildPacket, decodeTestPacket, summarizeBrowserReport } from "../testing/artifacts.js";
import { controlIdentity } from "../testing/prepare.js";

const image = `sha256:${"a".repeat(64)}`;
const name = "safi-12345678-1234-1234-1234-123456789abc";
function file(path: string, text = "control"): SnapshotFile {
  const data = Buffer.from(text);
  return { path, mode: "100644", data, oid: createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex") };
}
test("build and browser containers have no network, privileges, writable host mounts or host env forwarding", () => {
  for (const purpose of ["build", "test"] as const) {
    const args = sandboxArguments(image, name, "/private/source", purpose);
    for (const flag of ["--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=1000:1000", "--memory=2g", "--pids-limit=256"]) assert.ok(args.includes(flag));
    const mounts = args.filter((_, index) => args[index - 1] === "--mount");
    assert.equal(mounts.length, 1); assert.ok(mounts.every(mount => mount.endsWith(",readonly")));
    assert.equal(args.includes("--privileged"), false); assert.equal(args.includes("--publish"), false);
    assert.equal(args.some(arg => /GITHUB|OPENAI|VALKEY|docker\.sock|env-file/.test(arg)), false);
  }
  assert.throws(() => sandboxArguments("latest", name, "/source", "build"));
  assert.throws(() => sandboxArguments(image, name, "/tmp/a,dst=/home", "build"));
  assert.throws(() => sandboxArguments(image, name, "relative", "build"));
});
test("base image and review records reject mutable images and self-reported qualification", () => {
  assert.equal(baseImageSchema.safeParse("mcr.microsoft.com/playwright:v1.63.0-noble").success, false);
  const baseImage = `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:${"b".repeat(64)}`;
  assert.equal(baseImageSchema.safeParse(baseImage).success, true);
  assert.equal(baseImageSchema.safeParse(baseImage + "\nRUN attack").success, false);
  const record = { version: 1, controlSha: "c".repeat(40), controlDigest: "d".repeat(64), testDigest: "e".repeat(64), dependencyDigest: "f".repeat(64), imageId: image, baseImage, preparedAt: new Date().toISOString(), review: "operator-declared-control-review" };
  assert.equal(recordSchema.safeParse(record).success, true);
  assert.equal(recordSchema.safeParse({ ...record, qualified: true }).success, false);
});
test("snapshot paths reject credentials, traversal, Git metadata and symlink tree modes", () => {
  for (const path of [".env", "src/.env.local", "keys/app.pem", "a/../b", "/etc/passwd", "a//b", ".git/config", "node_modules/a", "a\nb"]) assert.throws(() => validateSnapshotPath(path));
  assert.doesNotThrow(() => validateSnapshotPath("src/pages/Menu.tsx"));
  for (const mode of ["120000", "160000"]) assert.throws(() => parseTree(`${mode} blob ${"a".repeat(40)}\tsrc/pages/Menu.tsx\0`));
});
test("control comparison rejects test deletion, added gates, lock/config changes but allows application edits", () => {
  const control = [file("src/tests/browser/shop.spec.ts"), file("package.json"), file("vite.config.ts"), file("src/pages/Menu.tsx")];
  assert.doesNotThrow(() => assertProtectedSnapshot(control, [...control.slice(0, 3), file("src/pages/Menu.tsx", "changed")]));
  assert.throws(() => assertProtectedSnapshot(control, control.slice(1)));
  assert.throws(() => assertProtectedSnapshot(control, [...control, file("src/harness/forged.ts")]));
  assert.throws(() => assertProtectedSnapshot(control, [file("src/tests/browser/shop.spec.ts", "skip"), ...control.slice(1)]));
  assert.throws(() => assertProtectedSnapshot(control, [control[0], file("package.json", "scripts"), ...control.slice(2)]));
});
test("digests are stable across ordering and change with path, content or mode", () => {
  const a = file("src/a.ts"); const b = file("src/b.ts");
  assert.equal(snapshotDigest([a, b]), snapshotDigest([b, a]));
  assert.notEqual(snapshotDigest([a]), snapshotDigest([{ ...a, mode: "100755" }]));
  assert.notEqual(snapshotDigest([a]), snapshotDigest([file("src/a.ts", "modified")]));
});
test("reviewed controls require frozen dependencies, browser fixtures and all container programs", () => {
  assert.throws(() => controlIdentity([file("package.json")]));
  const files = [file("package.json"), file("pnpm-lock.yaml"), file("src/tests/browser/shop.spec.ts"), file("src/tests/browser/protected-fixtures.ts"), ...["build.mjs", "serve.mjs", "playwright.config.mjs", "test.mjs", "collect.mjs"].map(name => file(`src/harness/testing/container/${name}`))];
  assert.equal(controlIdentity(files).testDigest.length, 64);
});
test("artifact packets reject empty builds, escape paths, duplicates, malformed encoding and fabricated fields", () => {
  const item = { path: "index.html", data: Buffer.from("<html></html>").toString("base64") };
  const packet = { version: 1, log: "build", files: [item] };
  assert.equal(decodeBuildPacket(JSON.stringify(packet)).files.length, 1);
  assert.throws(() => decodeBuildPacket(JSON.stringify({ ...packet, files: [] })));
  assert.throws(() => decodeBuildPacket(JSON.stringify({ ...packet, files: [item, item] })));
  assert.throws(() => decodeBuildPacket(JSON.stringify({ ...packet, files: [{ ...item, path: "../host" }] })));
  assert.throws(() => decodeBuildPacket(JSON.stringify({ ...packet, files: [{ ...item, data: "!!!" }] })));
  assert.throws(() => decodeBuildPacket(JSON.stringify({ ...packet, qualified: true })));
  assert.equal(decodeTestPacket(JSON.stringify({ ...packet, exitCode: 1 })).exitCode, 1);
});
function report(overrides = {}) {
  return { stats: { expected: 22, unexpected: 0, skipped: 0, flaky: 0, ...overrides }, errors: [], suites: [{ specs: Array.from({ length: 11 }, () => ({ tests: [{ projectName: "desktop-chromium" }, { projectName: "mobile-chromium" }] })) }] };
}
test("browser success needs both projects, all baseline cases, no skips, no flakes and no global errors", () => {
  assert.equal(summarizeBrowserReport(report()).complete, true);
  for (const stats of [{ expected: 0 }, { unexpected: 1 }, { skipped: 1 }, { flaky: 1 }]) assert.equal(summarizeBrowserReport(report(stats)).complete, false);
  assert.equal(summarizeBrowserReport({ ...report(), suites: [] }).complete, false);
  assert.equal(summarizeBrowserReport({ ...report(), errors: [{ message: "failure" }] }).complete, false);
});
test("actual Git snapshot ignores dirty worktree and exports exact committed bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-snapshot-"));
  try {
    await git(root, ["init", "--initial-branch=main"]); await git(root, ["config", "user.name", "Offline test"]); await git(root, ["config", "user.email", "offline@example.invalid"]);
    await mkdir(join(root, "src")); await writeFile(join(root, "src/app.ts"), "committed");
    await git(root, ["add", "."]); await git(root, ["commit", "-m", "source"]);
    const sha = await git(root, ["rev-parse", "HEAD"]);
    await writeFile(join(root, "src/app.ts"), "dirty"); await writeFile(join(root, ".env"), "HOST_SECRET=canary");
    const files = await readSnapshot(root, sha);
    assert.equal(files.length, 1); assert.equal(files[0].data.toString(), "committed");
    await git(root, ["add", ".env"]); await git(root, ["commit", "-m", "unsafe"]);
    await assert.rejects(readSnapshot(root, await git(root, ["rev-parse", "HEAD"])));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("container Node programs pass actual syntax checks", async () => {
  const exec = promisify(execFile);
  for (const name of ["build.mjs", "collect.mjs", "serve.mjs", "test.mjs", "playwright.config.mjs"]) {
    const path = new URL(`../testing/container/${name}`, import.meta.url);
    await exec(process.execPath, ["--check", decodeURIComponent(path.pathname)]);
  }
});
test("container output collector rejects symlinks and enforces bounds using actual file reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-output-"));
  const exec = promisify(execFile);
  const program = new URL("../testing/container/collect.mjs", import.meta.url).href;
  const script = `import { collectFiles } from ${JSON.stringify(program)}; process.stdout.write(JSON.stringify(await collectFiles(${JSON.stringify(root)}, 32, 16)));`;
  try {
    await writeFile(join(root, "index.html"), "fixture");
    assert.equal(JSON.parse((await exec(process.execPath, ["--input-type=module", "-e", script])).stdout).length, 1);
    await symlink("index.html", join(root, "escape.html"));
    await assert.rejects(exec(process.execPath, ["--input-type=module", "-e", script]));
    await rm(join(root, "escape.html")); await writeFile(join(root, "oversize.js"), "x".repeat(17));
    await assert.rejects(exec(process.execPath, ["--input-type=module", "-e", script]));
  } finally { await rm(root, { recursive: true, force: true }); }
});
