import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAuthorizedRemote, normalizeRepository, synchronizeCandidate, syncEnvironment } from "../git/sync.js";
import { dispatchWebhook, MemoryDeliveryStore } from "../events/dispatch.js";
import { verifyWebhook } from "../events/webhook.js";
import { buildPassedEvidence, reconcileEvidence, renderAcceptanceReport } from "../evidence/acceptance.js";
import { parseMergeGroupResponse, assertMergeGroupChecks } from "../work/integration.js";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);

function registry() {
  return Array.from({ length: 22 }, (_, index) => ({ caseId: index + 1, status: index >= 14 && index <= 20 ? "deferred" : "blocked", timestamp: "2026-01-01T00:00:00.000Z", workers: [], checkUrls: [], logs: [], artifacts: [], reason: "not executed" }));
}

test("candidate synchronization accepts only the configured credential-free GitHub remote and exact branch SHA", async () => {
  assert.equal(normalizeRepository("https://github.com/Acme/Project.git"), "acme/project");
  assert.equal(assertAuthorizedRemote("git@github.com:Acme/Project.git", "acme/project"), "acme/project");
  for (const remote of ["https://user:secret@github.com/a/b.git", "https://gitlab.com/a/b.git", "file:///tmp/a/b.git", "https://github.com/a/other.git"]) assert.throws(() => assertAuthorizedRemote(remote, "a/b"));
  const root = await mkdtemp(join(tmpdir(), "safi-sync-"));
  try {
    const calls: string[][] = [];
    const runGit = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "remote") return "https://github.com/a/b.git\n";
      if (args[0] === "ls-remote") return `${sha}\trefs/heads/work/menu\n`;
      if (args[0] === "rev-parse") return `${sha}\n`;
      if (args[0] === "cat-file") return "commit\n";
      return "";
    };
    const result = await synchronizeCandidate({ repository: root, expectedRepository: "a/b", branch: "work/menu", sha }, runGit);
    assert.equal(result.sha, sha); assert.equal(result.ref, `refs/safi/sync/${sha}`);
    assert.ok(calls.some(call => call[0] === "fetch" && call.includes("--no-tags") && call.includes("--no-write-fetch-head")));
    assert.deepEqual(syncEnvironment(), { credentialInput: "disabled", systemConfig: "disabled", globalConfig: "disabled", hooks: "disabled", fsmonitor: "disabled", terminalPrompt: "disabled" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("candidate synchronization rejects a moved or ambiguous remote branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-sync-"));
  try {
    let reads = 0;
    await assert.rejects(synchronizeCandidate({ repository: root, expectedRepository: "a/b", branch: "work/menu", sha }, async args => {
      if (args[0] === "remote") return "https://github.com/a/b.git\n";
      if (args[0] === "ls-remote") return `${reads++ ? otherSha : sha}\trefs/heads/work/menu\n`;
      return "";
    }), /moved|exact SHA/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("signed webhook dispatch is bounded, repository-scoped, and replay-safe", async () => {
  const secret = "test-secret"; const body = JSON.stringify({ repository: { full_name: "a/b" }, after: otherSha });
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const verified = verifyWebhook(body, { event: "push", deliveryId: "delivery-1", signature }, secret, "a/b");
  assert.equal(verified.writeAuthorized, false); assert.equal(verified.authority, "untrusted-wakeup-only");
  const store = new MemoryDeliveryStore(); let calls = 0;
  const input = { body, headers: { event: "push", deliveryId: "delivery-1", signature }, secret, repository: "a/b" };
  assert.equal((await dispatchWebhook(input, store, async () => { calls++; })).status, "accepted");
  assert.equal((await dispatchWebhook(input, store, async () => { calls++; })).status, "replay");
  assert.equal(calls, 1);
  assert.throws(() => verifyWebhook(body, { event: "push", deliveryId: "delivery-2", signature: signature.replace(/^sha256=./, "sha256=f") }, secret, "a/b"), /verification/);
  assert.throws(() => verifyWebhook(body, { event: "push", deliveryId: "delivery-3", signature }, secret, "other/repo"), /different repository/);
  assert.throws(() => verifyWebhook("x".repeat(256 * 1024 + 1), { event: "push", deliveryId: "delivery-4", signature }, secret, "a/b"), /256 KiB/);
});

test("active acceptance passes require durable evidence and cannot be downgraded", () => {
  const evidence = buildPassedEvidence({ caseId: 1, acceptanceRunId: "run-1", timestamp: "2026-01-02T00:00:00.000Z", workId: "menu", branch: "work/menu", sha, workers: ["worker-1"], sessionIds: ["session-1"], checkUrls: ["https://github.com/a/b/checks/1"], logs: ["evidence/run-1/worker.log"], artifacts: ["evidence/run-1/manifest.json"], reason: "exact live experiment succeeded", observedResult: "candidate passed" });
  const updated = reconcileEvidence(registry(), evidence);
  assert.equal(updated[0].status, "passed");
  assert.throws(() => reconcileEvidence(updated, { ...evidence, status: "blocked", timestamp: "2026-01-03T00:00:00.000Z" }), /cannot be replaced/);
  assert.throws(() => buildPassedEvidence({ ...evidence, artifacts: [] }), /artifacts/);
  const report = renderAcceptanceReport(updated, { generatedAt: "2026-01-03T00:00:00.000Z", commands: ["acceptance-status"] });
  assert.match(report, /Case 1: passed/); assert.match(report, /Cases 14–20 remain deferred/);
});

test("merge-group responses and checks stay bound to one exact synthetic SHA and App", () => {
  const mergeGroupSha = "c".repeat(40);
  assert.deepEqual(parseMergeGroupResponse({ data: { node: { state: "IN_PROGRESS", position: 1, mergeGroup: { oid: mergeGroupSha } } } }), { state: "IN_PROGRESS", position: 1, mergeGroupSha });
  const checks = ["fit", "build", "test", "regression"].map(name => ({ name: `safi/${name}`, sha: mergeGroupSha, appId: 42, conclusion: "success", url: `https://github.com/a/b/checks/${name}` }));
  assert.equal(assertMergeGroupChecks({ sha: mergeGroupSha, checks }, mergeGroupSha, 42).sha, mergeGroupSha);
  assert.throws(() => assertMergeGroupChecks({ sha: mergeGroupSha, checks: checks.map(check => check.name === "safi/test" ? { ...check, appId: 99 } : check) }, mergeGroupSha, 42), /trusted App/);
  assert.throws(() => parseMergeGroupResponse({ data: { node: { state: "UNKNOWN" } } }), /Invalid enum/);
});
