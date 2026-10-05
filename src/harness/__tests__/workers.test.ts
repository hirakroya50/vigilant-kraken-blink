import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, symlink, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Redis } from "ioredis";
import type { GitHub } from "../git/github.js";
import { Lease } from "../coordination/lease.js";
import { claimNext, latestChecks, testReadiness, type WorkTarget, type RemoteCheck } from "../workers/discovery.js";
import { workerOptions } from "../workers/options.js";
import { fitCoverage, testingEvidence, reviewedDiagnosis } from "../workers/roles.js";
import { privateJson, createSessionDirectory, submitSessionAction } from "../workers/local-session.js";
import { actionCommand } from "../workers/actions.js";
import { HumanSession, handoffSchema } from "../work/session-state.js";
import { assertApplicationTrees } from "../work/candidate-fit.js";
import { inspectRepair } from "../work/session-completion.js";
import { assertMergeRules } from "../work/integration.js";
import { summarizeBrowserReport } from "../testing/artifacts.js";
import { docker } from "../testing/docker.js";
import { failureContext } from "../workers/failure-context.js";
import type { Proposal } from "../ai/openai.js";
import type { runProtected } from "../testing/run.js";

const sha = "a".repeat(40), fitSha = "b".repeat(40), digest = "c".repeat(64);
const title = "shop.spec.ts::search, categories, unavailable items";
const handoff = () => handoffSchema.parse({ version: 1, sessionId: randomUUID(), role: "developer", workId: "menu", branch: "work/menu", expectedSha: sha, fitSha, fitDigest: digest, allowedPaths: ["src/pages/Menu.tsx"], checkout: "/tmp/isolated", createdAt: new Date().toISOString(), deadline: new Date(Date.now() + 60000).toISOString(), fitCheckUrl: "https://github.com/a/b/runs/1", requestPath: "changes/menu/request.json", fitPath: "changes/menu/fit.json", operatorBoundary: "same-os-user-local-human", instructions: "Edit in Dyad" });
const check = (name: string, conclusion: string, id = 1, candidate = sha, app = 7) => ({ name, conclusion, id, head_sha: candidate, app: { id: app }, status: "completed", html_url: `https://github.com/a/b/runs/${id}`, output: { summary: "evidence" } }) as RemoteCheck;
function redisFixture() {
  const values = new Map<string, string>();
  const redis = { async set(key: string, value: string) { if (values.has(key)) return null; values.set(key, value); return "OK"; }, async get(key: string) { return values.get(key) ?? null; }, async eval(script: string, _count: number, key: string, owner: string) { if (values.get(key) !== owner) return 0; if (script.includes("'del'")) values.delete(key); return 1; } } as unknown as Redis;
  return { redis, values };
}
function runnerFixture() {
  const record = { version: 1 as const, controlSha: "d".repeat(40), controlDigest: digest, testDigest: digest, dependencyDigest: digest, imageId: `sha256:${digest}`, baseImage: `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:${digest}`, preparedAt: new Date().toISOString(), review: "operator-declared-control-review" as const };
  const target = { workId: "menu", branch: "work/menu", sha, pullRequest: 1, createdAt: new Date().toISOString(), priority: 0, fitPresent: true, fit: { fitSha, fit: { acceptance: [{ id: "search", test: title }] }, lineage: { fitDigest: digest } } } as WorkTarget;
  const result = { directory: `/tmp/${sha}-Abc123`, candidateSha: sha, controlSha: record.controlSha, controlDigest: record.controlDigest, testDigest: record.testDigest, dependencyDigest: record.dependencyDigest, imageId: record.imageId, baseImage: record.baseImage, build: "passed", browser: "passed", status: "passed", cleanupFailures: [], browserSummary: { complete: true, passedTests: { "desktop-chromium": [title], "mobile-chromium": [title] } }, artifactDigest: digest, artifactFiles: [], evidence: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString() } as unknown as Awaited<ReturnType<typeof runProtected>>;
  return { record, target, result };
}

test("worker modes validate consent, scope, costs, reviewed runner and bounds", () => {
  assert.equal(workerOptions("developer", ["--approve-write"]).sessionMinutes, 30);
  assert.equal(workerOptions("tester", ["--approve-write", "--runner", "record.json", "--watch"]).watch, true);
  for (const [role, args] of [
    ["developer", []], ["fitter", ["--approve-write"]], ["fitter", ["--approve-write", "--approve-cost", "--paths", "package.json"]],
    ["tester", ["--approve-write"]], ["triager", ["--approve-write"]], ["release", ["--approve-write"]],
    ["developer", ["--approve-write", "--once", "--watch"]], ["developer", ["--approve-write", "--approve-write"]],
    ["developer", ["--approve-write", "--session-minutes", "0"]], ["developer", ["--approve-write", "--session-minutes", "121"]],
    ["developer", ["--approve-write", "--paths", "src/pages/Menu.tsx"]], ["fixer", ["--approve-write", "--runner", "record.json"]],
  ] as [string, string[]][]) assert.throws(() => workerOptions(role, args));
});
test("collision fallback chooses other work instead of blocking independent candidates", async () => {
  const f = redisFixture();
  const occupied = await Lease.acquire(f.redis, `tester:${sha}`);
  const result = await claimNext([sha, fitSha], candidate => Lease.acquire(f.redis, `tester:${candidate}`));
  assert.equal(result?.target, fitSha);
  await result?.lease.release(); await occupied?.release();
  assert.equal(f.values.size, 0);
});
test("five roles can claim independent work at once; duplicate role/SHA claims cannot", async () => {
  const f = redisFixture();
  const roles = ["fitter", "developer", "tester", "triager", "fixer"];
  const leases = await Promise.all(roles.map((role, index) => Lease.acquire(f.redis, `${role}:${String(index).repeat(40)}`)));
  assert.equal(leases.filter(Boolean).length, 5);
  assert.equal(await Lease.acquire(f.redis, "tester:" + "2".repeat(40)), null);
  await Promise.all(leases.map(lease => lease!.release()));
});
test("lease loss is sticky, cannot renew and cannot release a replacement owner's claim", async () => {
  const f = redisFixture();
  const lease = (await Lease.acquire(f.redis, `tester:${sha}`))!;
  f.values.set(lease.key, "replacement");
  await assert.rejects(lease.assertOwned()); await assert.rejects(lease.renew());
  assert.equal(await lease.release(), false); assert.equal(f.values.get(lease.key), "replacement");
});
test("latest same-SHA trusted checks control test readiness, not old or foreign evidence", () => {
  const checks = [check("safi/test", "failure", 1), check("safi/test", "success", 2), check("safi/build", "success", 3), check("safi/regression", "success", 4), check("safi/test", "failure", 8, fitSha), check("safi/test", "failure", 9, sha, 99)];
  assert.equal(testReadiness(latestChecks(checks, sha, 7)).passed, true);
  assert.equal(testReadiness(latestChecks(checks, fitSha, 7)).failed, true);
  assert.equal(testReadiness(latestChecks(checks, "e".repeat(40), 7)).needsTest, true);
});
test("human sessions require acknowledgement and a new full-SHA candidate", () => {
  const h = handoff(); const session = new HumanSession(h);
  assert.throws(() => session.beginCompletion(h.sessionId, fitSha));
  assert.throws(() => session.acknowledge(randomUUID()));
  session.acknowledge(h.sessionId);
  assert.throws(() => session.beginCompletion(h.sessionId, sha));
  session.beginCompletion(h.sessionId, fitSha); session.completed();
  assert.equal(session.status, "completed"); assert.throws(() => session.assertActive());
});
test("expired and cancelled human sessions cannot publish or resume", () => {
  const h = handoff();
  const expired = new HumanSession(h, () => Date.parse(h.deadline));
  assert.throws(() => expired.acknowledge(h.sessionId)); assert.equal(expired.status, "expired");
  const cancelled = new HumanSession(h); cancelled.cancel(); assert.throws(() => cancelled.acknowledge(h.sessionId));
});
test("candidate tree guards reject tests, executable edits and scope changes", () => {
  const base = new Map([["src/pages/Menu.tsx", { mode: "100644", sha }], ["src/tests/test.ts", { mode: "100644", sha }]]);
  const valid = new Map(base); valid.set("src/pages/Menu.tsx", { mode: "100644", sha: fitSha });
  assert.deepEqual(assertApplicationTrees(base, valid, ["src/pages/Menu.tsx"]), ["src/pages/Menu.tsx"]);
  const invalid = new Map(valid); invalid.delete("src/tests/test.ts"); assert.throws(() => assertApplicationTrees(base, invalid, ["src/pages/Menu.tsx"]));
  valid.set("src/pages/Menu.tsx", { mode: "100755", sha: fitSha }); assert.throws(() => assertApplicationTrees(base, valid, ["src/pages/Menu.tsx"]));
});
test("coverage requires exact protected titles on both Chromium projects", () => {
  assert.equal(fitCoverage([{ id: "x", test: title }], { "desktop-chromium": [title] })[0].covered, false);
  assert.equal(fitCoverage([{ id: "x", test: "shop.spec.ts" }], { "desktop-chromium": [title], "mobile-chromium": [title] })[0].covered, false);
  assert.equal(fitCoverage([{ id: "x", test: title }], { "desktop-chromium": [title], "mobile-chromium": [title] })[0].covered, true);
});
test("runner evidence publishes real outcomes and no synthetic release qualification", () => {
  const f = runnerFixture();
  const evidence = testingEvidence(f.result, f.target, f.record);
  assert.equal(evidence.conclusions["safi/test"], "success");
  assert.equal(JSON.parse(evidence.summary).releaseQualified, false);
  assert.equal(JSON.parse(evidence.summary).localEvidenceDirectory, `.safi/runs/${sha}-Abc123`);
  assert.equal(evidence.digest, createHash("sha256").update(evidence.summary).digest("hex"));
  f.result.browser = "failed";
  assert.equal(testingEvidence(f.result, f.target, f.record).conclusions["safi/test"], "failure");
});
test("regression pass without Fit assertion coverage cannot become a test success", () => {
  const f = runnerFixture(); f.result.browserSummary!.passedTests = {};
  const evidence = testingEvidence(f.result, f.target, f.record);
  assert.equal(evidence.conclusions["safi/test"], "neutral"); assert.equal(evidence.coverageComplete, false);
});
test("different SHA/control/image identities and cleanup failures cannot qualify", () => {
  const f = runnerFixture();
  assert.throws(() => testingEvidence({ ...f.result, candidateSha: fitSha }, f.target, f.record));
  assert.throws(() => testingEvidence({ ...f.result, imageId: `sha256:${"f".repeat(64)}` }, f.target, f.record));
  const evidence = testingEvidence({ ...f.result, cleanupFailures: ["container"] }, f.target, f.record);
  assert.notEqual(evidence.conclusions["safi/test"], "success");
});
test("browser report coverage excludes skipped, expected-failing and flaky tests", () => {
  const input = { stats: { expected: 22, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: [{ file: "tests/shop.spec.ts", title: "coverage", tests: [{ projectName: "desktop-chromium", expectedStatus: "passed", status: "expected", results: [{ status: "passed" }] }, { projectName: "mobile-chromium", expectedStatus: "failed", status: "expected", results: [{ status: "failed" }] }] }] }] };
  const report = summarizeBrowserReport(input);
  assert.deepEqual(report.passedTests["desktop-chromium"], ["shop.spec.ts::coverage"]);
  assert.equal(report.passedTests["mobile-chromium"], undefined);
});
test("aborted Docker work does not spawn or return a fake failure result", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(docker(["version"], 1000, 1000, controller.signal), { name: "AbortError" });
});
test("private session actions are bounded, non-replayable and not remote writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-actions-"));
  try {
    const directory = await createSessionDirectory(root), h = handoff();
    await writeFile(join(directory, "handoff.json"), JSON.stringify(h), { mode: 0o600 });
    const action = { action: "acknowledge", sessionId: h.sessionId };
    assert.equal((await submitSessionAction(root, directory, action)).remoteWrite, false);
    await assert.rejects(submitSessionAction(root, directory, action));
    await assert.rejects(submitSessionAction(root, directory, { action: "cancel", sessionId: randomUUID() }));
    await writeFile(join(root, "public.json"), "{}", { mode: 0o644 });
    await assert.rejects(privateJson(join(root, "public.json")));
    await symlink(join(directory, "handoff.json"), join(root, "link.json"));
    await assert.rejects(privateJson(join(root, "link.json")));
    await assert.rejects(submitSessionAction(root, root, action));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("diagnosis review explicitly approves generated bytes without changing implementation", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-diagnosis-"));
  try {
    const directory = await createSessionDirectory(root);
    const diagnosis = { version: 1, workId: "menu", failedSha: sha, provenance: "ai-reviewed", failureCheckUrls: ["https://github.com/a/b/runs/1"], cause: "Observed assertion failed", repair: "Repair only menu search; rerun both Chromium projects", affectedFiles: ["src/pages/Menu.tsx"], confidence: "medium" };
    const identity = createHash("sha256").update(JSON.stringify(diagnosis, null, 2)).digest("hex");
    const record = { version: 1, sessionId: randomUUID(), workId: "menu", sha, digest: identity, deadline: new Date(Date.now() + 60000).toISOString(), diagnosis, proposal: {}, operatorBoundary: "same-os-user-local-human" };
    await writeFile(join(directory, "diagnosis.json"), JSON.stringify(record), { mode: 0o600 });
    const result = await actionCommand(root, "diagnosis-review", [directory, "approve", "--approve-review"]);
    assert.equal(result.remoteWrite, false); assert.equal(JSON.parse(await readFile(join(directory, "review.json"), "utf8")).digest, identity);
    await assert.rejects(actionCommand(root, "diagnosis-review", [directory, "approve", "--approve-review"]));
    await assert.rejects(actionCommand(root, "diagnosis-review", [directory, "approve"]));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("diagnosis identity cannot silently target a different SHA", () => {
  const proposal = { kind: "diagnosis", workId: "menu", candidateSha: sha, draft: { cause: "failure", repair: "minimal repair", affectedFiles: ["src/pages/Menu.tsx"], confidence: "medium" } } as Proposal;
  assert.equal(reviewedDiagnosis(proposal, "menu", sha, ["https://github.com/a/b/runs/1"]).failedSha, sha);
  assert.throws(() => reviewedDiagnosis(proposal, "menu", fitSha, ["https://github.com/a/b/runs/1"]));
});
test("Fixer cannot use an older failure after its latest trusted check succeeded", async () => {
  const diagnosis = { version: 1, workId: "menu", failedSha: sha, provenance: "reviewed-human", failureCheckUrls: ["https://github.com/a/b/runs/1"], cause: "failure", repair: "repair", affectedFiles: ["src/pages/Menu.tsx"], confidence: "medium" };
  const summary = JSON.stringify(diagnosis);
  const triage = { ...check("safi/triage", "success", 3), output: { summary }, external_id: `triage:${createHash("sha256").update(summary).digest("hex")}` };
  const github = { async assertWriteAuthority() { return { appId: 7 }; }, async checks() { return [check("safi/test", "failure", 1), check("safi/test", "success", 2), triage]; } } as unknown as GitHub;
  await assert.rejects(inspectRepair(github, "menu", sha, ["src/pages/Menu.tsx"]), /exact-SHA failure/);
});
test("protected-main integration requires native queue and App-bound mandatory checks", () => {
  const rules = [{ type: "merge_queue" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: ["safi/fit", "safi/build", "safi/test", "safi/regression"].map(context => ({ context, integration_id: 7 })) } }];
  assert.equal(assertMergeRules(rules, 7).nativeMergeQueue, true);
  assert.throws(() => assertMergeRules(rules.slice(1), 7));
  assert.throws(() => assertMergeRules(rules, 99));
  assert.throws(() => assertMergeRules([{ type: "merge_queue" }], 7));
});
test("failure-context extraction is bounded and bound to the exact local manifest", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "safi-failure-")));
  try {
    const relative = `.safi/runs/${sha}-Abc123`, directory = join(root, relative);
    await mkdir(directory, { recursive: true });
    const manifest = { version: 1, candidateSha: sha, controlSha: fitSha, controlDigest: digest, testDigest: digest };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(join(directory, "browser.log"), "Observed selector failure", { mode: 0o600 });
    const packet = { sha, runner: { controlSha: fitSha, controlDigest: digest, testDigest: digest }, localEvidenceDirectory: relative, manifestDigest: createHash("sha256").update(JSON.stringify({ directory, ...manifest })).digest("hex") };
    assert.match(await failureContext(root, sha, JSON.stringify(packet)), /Observed selector failure/);
    await assert.rejects(failureContext(root, sha, JSON.stringify({ ...packet, localEvidenceDirectory: "../../.env" })));
    await assert.rejects(failureContext(root, sha, JSON.stringify({ ...packet, manifestDigest: "0".repeat(64) })));
  } finally { await rm(root, { recursive: true, force: true }); }
});
