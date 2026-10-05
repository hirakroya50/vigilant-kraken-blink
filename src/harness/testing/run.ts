import { mkdir, mkdtemp, writeFile, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { docker, sandboxArguments, verifyImage, type RunnerRecord } from "./docker.js";
import { assertProtectedSnapshot, exportFiles, readSnapshot, snapshotDigest, RunnerError, type SnapshotFile } from "./snapshot.js";
import { controlIdentity } from "./prepare.js";
import { decodeBuildPacket, decodeTestPacket, summarizeBrowserReport } from "./artifacts.js";

function fileDigests(files: SnapshotFile[]) {
  return files.map(file => ({ path: file.path, bytes: file.data.length, sha256: createHash("sha256").update(file.data).digest("hex") }));
}
export async function runProtected(repository: string, candidateSha: string, record: RunnerRecord, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const [control, candidate] = await Promise.all([readSnapshot(repository, record.controlSha), readSnapshot(repository, candidateSha)]);
  signal?.throwIfAborted();
  const identity = controlIdentity(control);
  if (record.controlDigest !== identity.controlDigest || record.testDigest !== identity.testDigest || record.dependencyDigest !== identity.dependencyDigest) throw new RunnerError("Review record differs from actual control Git content.");
  assertProtectedSnapshot(control, candidate);
  await verifyImage(record);
  const base = resolve(repository, ".safi/runs");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const root = await realpath(await mkdtemp(join(base, `${candidateSha}-`)));
  const source = join(root, "source"); const artifact = join(root, "artifact"); const results = join(root, "results");
  for (const directory of [source, artifact, results]) await mkdir(directory, { mode: 0o755 });
  await exportFiles(source, candidate.filter(file => !file.path.startsWith("src/harness/") && !file.path.startsWith("src/tests/") && !file.path.startsWith(".github/") && !file.path.startsWith("changes/") && !file.path.startsWith(".dyad/")));
  const startedAt = new Date().toISOString();
  let build: "passed" | "failed" = "failed"; let browser: "passed" | "failed" | "not-run" = "not-run";
  let artifactDigest: string | null = null; let artifactFiles: ReturnType<typeof fileDigests> = [];
  let evidence: ReturnType<typeof fileDigests> = [];
  let browserSummary: ReturnType<typeof summarizeBrowserReport> | null = null;
  let phase: "build" | "browser" = "build";
  let reason = "";
  const cleanupFailures: string[] = [];
  const execute = async (purpose: "build" | "test") => {
    signal?.throwIfAborted();
    const name = `safi-${randomUUID()}`;
    try { return await docker(sandboxArguments(record.imageId, name, purpose === "build" ? source : artifact, purpose), purpose === "build" ? 360000 : 540000, purpose === "build" ? 64 * 1024 * 1024 : 96 * 1024 * 1024, signal); }
    finally { await docker(["rm", "--force", name]).catch(() => { cleanupFailures.push(name); }); }
  };
  try {
    const output = await execute("build");
    const packet = decodeBuildPacket(output.stdout);
    await writeFile(join(root, "build.log"), packet.log + output.stderr, { flag: "wx", mode: 0o600 });
    await exportFiles(artifact, packet.files);
    artifactDigest = snapshotDigest(packet.files);
    artifactFiles = fileDigests(packet.files);
    build = "passed"; phase = "browser";
    const tested = await execute("test");
    const testPacket = decodeTestPacket(tested.stdout);
    await writeFile(join(root, "browser.log"), testPacket.log + tested.stderr, { flag: "wx", mode: 0o600 });
    await exportFiles(results, testPacket.files);
    evidence = fileDigests(testPacket.files);
    const report = testPacket.files.find(file => file.path === "playwright.json");
    if (!report) throw new RunnerError("Protected browser report is missing.");
    browserSummary = summarizeBrowserReport(JSON.parse(report.data.toString("utf8")));
    browser = testPacket.exitCode === 0 && browserSummary.complete ? "passed" : "failed";
    reason = browser === "passed" ? "Local protected build/browser execution passed; no GitHub qualification or live SOW certification published." : "Browser execution failed or report has skipped tests/incomplete project coverage.";
  } catch (error) {
    if (phase === "browser") browser = "failed";
    const failure = error as { stdout?: string; stderr?: string };
    await writeFile(join(root, `${phase}-failure.log`), String(failure.stdout ?? "").slice(0, 2 * 1024 * 1024) + String(failure.stderr ?? "").slice(0, 2 * 1024 * 1024), { flag: "wx", mode: 0o600 });
    reason = phase === "build" ? "Build execution or artifact validation failed; inspect private logs." : "Protected browser execution/evidence validation failed; inspect available private reports and logs.";
  } finally { await rm(source, { recursive: true, force: true }); }
  signal?.throwIfAborted();
  if (cleanupFailures.length) reason = "Container cleanup failed; reconcile the listed runner container identities before retrying.";
  const manifest = {
    version: 1, scope: "local-protected-run-only", qualificationPublished: false,
    candidateSha, controlSha: record.controlSha, controlDigest: record.controlDigest, testDigest: record.testDigest,
    dependencyDigest: record.dependencyDigest, imageId: record.imageId, baseImage: record.baseImage,
    sourceDigest: snapshotDigest(candidate), artifactDigest, artifactFiles, evidence,
    startedAt, completedAt: new Date().toISOString(), build, browser, browserSummary, cleanupFailures,
    status: build === "passed" && browser === "passed" && !cleanupFailures.length ? "passed" : "failed", reason,
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { directory: root, ...manifest };
}
