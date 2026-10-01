import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import { GitHub } from "../git/github.js";
import { intake, intakePacket } from "../intake/index.js";
import { parseIssueRequest, loadIssueRequest, sourceContent } from "../intake/issue.js";
import { reconcileOnce } from "../work/reconcile.js";
import { workRecords } from "../work/records.js";
import { pollingBackoff, reconciliationOptions } from "../work/command.js";
import { parseWakeup, readWakeup } from "../events/wakeup.js";

const body = "### Description\n\nImprove menu search.\n\n### Acceptance criteria\n\n- Matching items appear.\n- [ ] Clearing search restores items.\n";
const sha = "b".repeat(40); const base = "a".repeat(40); const branch = "work/issue-17";
const lease = { async assertOwned() {} };
const hash = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
function fixture(options: { existing?: boolean; closedIssue?: boolean; prIssue?: boolean; fork?: boolean; closedPR?: boolean; orphan?: boolean; advance?: boolean; symlinkSource?: boolean; forgedBlob?: boolean; rateBlob?: boolean; duplicatePR?: boolean; extraBranches?: number; foreignCheck?: boolean; truncated?: boolean; oversized?: boolean } = {}) {
  let present = options.existing ?? false;
  let issueBody = body;
  let headReads = 0;
  let pull: Record<string, unknown> | undefined;
  const records = new Map<string, string>();
  const request = parseIssueRequest(17, "Menu search", body);
  const source = { version: 1 as const, kind: "github-issue" as const, repository: "a/b", number: 17, issueId: 1700, url: "https://github.com/a/b/issues/17", bodyDigest: createHash("sha256").update(body).digest("hex") };
  const makePull = (number = 1, fork = false) => ({ number, state: options.closedPR ? "closed" : "open", html_url: `https://github.com/a/b/pull/${number}`, draft: true, head: { sha, ref: branch, repo: { full_name: fork ? "evil/b" : "a/b" } }, base: { ref: "main" } });
  if (present) {
    records.set("changes/issue-17/request.json", intakePacket(request).content);
    records.set("changes/issue-17/source.json", sourceContent(source));
    if (!options.orphan) pull = makePull();
  }
  const writes: string[] = []; const reads: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const path = decodeURIComponent(url.pathname); const method = init?.method ?? "GET";
    if (method === "GET") reads.push(path); else writes.push(`${method} ${path}`);
    let data: unknown; let status = 200; let headers: Record<string, string> = {};
    if (path === "/repos/a/b") data = { full_name: "a/b", default_branch: "main", archived: false, disabled: false };
    else if (path === "/repos/a/b/issues/17") data = { number: 17, id: 1700, title: "Menu search", body: issueBody, state: options.closedIssue ? "closed" : "open", html_url: source.url, ...(options.prIssue ? { pull_request: {} } : {}) };
    else if (path === "/repos/a/b/branches") data = present ? [{ name: branch }, ...Array.from({ length: options.extraBranches ?? 0 }, (_, index) => ({ name: `work/item-${String(index).padStart(3, "0")}` }))] : [];
    else if (path === "/repos/a/b/git/ref/heads/main") data = { object: { sha: base } };
    else if (path.startsWith("/repos/a/b/git/ref/heads/work/")) {
      headReads++;
      if (present) data = { object: { sha: options.advance && headReads > 1 ? "e".repeat(40) : sha } };
      else { status = 404; data = {}; }
    }
    else if (path.startsWith("/repos/a/b/git/commits/") && method === "GET") data = { sha: path.split("/").at(-1), tree: { sha: "c".repeat(40) } };
    else if (path === `/repos/a/b/git/trees/${"c".repeat(40)}`) data = { truncated: options.truncated ?? false, tree: [...records].map(([path, content]) => ({ path, type: "blob", size: options.oversized ? 65537 : Buffer.byteLength(content), mode: options.symlinkSource && path.endsWith("source.json") ? "120000" : "100644", sha: hash(content) })) };
    else if (path.startsWith("/repos/a/b/contents/")) {
      const recordPath = path.slice("/repos/a/b/contents/".length); const content = records.get(recordPath);
      if (url.searchParams.get("ref") === base || content === undefined) { status = 404; data = {}; }
      else data = { type: "file", encoding: "base64", sha: hash(content), size: Buffer.byteLength(content), content: Buffer.from(content).toString("base64") };
    }
    else if (path.startsWith("/repos/a/b/git/blobs/")) {
      const oid = path.split("/").at(-1)!; const content = [...records.values()].find(content => hash(content) === oid)!;
      data = { sha: oid, encoding: "base64", size: Buffer.byteLength(content), content: Buffer.from(options.forgedBlob ? "x".repeat(Buffer.byteLength(content)) : content).toString("base64") };
      if (options.rateBlob) { status = 429; headers = { "retry-after": "120" }; data = {}; }
    }
    else if (path === "/repos/a/b/git/trees" && method === "POST") {
      const packet = JSON.parse(String(init?.body));
      assert.deepEqual(packet.tree.map((entry: { path: string }) => entry.path), ["changes/issue-17/request.json", "changes/issue-17/source.json"]);
      for (const entry of packet.tree) records.set(entry.path, entry.content);
      data = { sha: "d".repeat(40) };
    }
    else if (path === "/repos/a/b/git/commits" && method === "POST") data = { sha };
    else if (path === "/repos/a/b/git/refs") { present = true; data = { object: { sha } }; }
    else if (path === "/repos/a/b/pulls" && method === "POST") { pull = makePull(); data = pull; }
    else if (path === "/repos/a/b/pulls" && method === "GET") {
      const state = url.searchParams.get("state"); const head = url.searchParams.get("head");
      let result = pull && (state !== "open" || pull.state === "open") ? [pull] : [];
      if (head && head !== `a:${branch}`) result = [];
      if (options.duplicatePR && result.length) result.push(makePull(2));
      if (options.fork && !head && state === "open") result.push(makePull(3, true));
      data = result;
    }
    else if (path === `/repos/a/b/commits/${sha}/check-runs`) data = { total_count: 5, check_runs: ["fit", "developer", "build", "test", "regression"].map((name, index) => ({ id: index + 1, name: `safi/${name}`, app: { id: options.foreignCheck ? 99 : 42 }, head_sha: sha, status: "completed", conclusion: "success" })) };
    else throw new Error(`Unexpected offline route ${method} ${path}`);
    const response = new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
    Object.defineProperty(response, "url", { value: url.href }); return response;
  };
  const github = new GitHub("a/b", new Octokit({ request: { fetch: fetcher }, log: { debug() {}, info() {}, warn() {}, error() {} } }), async () => ({ appId: 42 }));
  return { github, records, writes, reads, request, source, editIssue() { issueBody = body + "- New requirement.\n"; } };
}

test("issue form parser produces deterministic work IDs and observable requirements", () => {
  const request = parseIssueRequest(17, "Menu search", body);
  assert.equal(request.id, "issue-17"); assert.equal(request.acceptance.length, 2);
  assert.deepEqual(parseIssueRequest(17, "Menu search", body.replace(/\n/g, "\r\n")), request);
  assert.throws(() => parseIssueRequest(0, "Menu", body));
  assert.throws(() => parseIssueRequest(17, "Menu", body.replace("- Matching items appear.", "not a bullet")));
  assert.throws(() => parseIssueRequest(17, "Menu", body + "\n### Extra\nignored"));
  assert.throws(() => parseIssueRequest(17, "Menu", "x".repeat(10001)));
});
test("closed issues and PRs masquerading as issues cannot enter intake", async () => {
  for (const options of [{ closedIssue: true }, { prIssue: true }]) await assert.rejects(loadIssueRequest(fixture(options).github, 17));
});
test("issue intake commits request/provenance together and replay writes nothing", async () => {
  const f = fixture(); const packet = await loadIssueRequest(f.github, 17);
  const created = await intake(f.github, packet.request, lease, packet.source);
  assert.equal(created.branch, branch); assert.equal(f.writes.length, 4); assert.equal(f.records.size, 2);
  assert.deepEqual(await intake(f.github, packet.request, lease, packet.source), created); assert.equal(f.writes.length, 4);
});
test("issue edits conflict with captured work rather than overwrite it", async () => {
  const f = fixture({ existing: true }); f.editIssue(); const packet = await loadIssueRequest(f.github, 17);
  await assert.rejects(intake(f.github, packet.request, lease, packet.source)); assert.equal(f.writes.length, 0);
});
test("missing/symlink provenance and manual takeover of reserved issue IDs are rejected", async () => {
  const missing = fixture({ existing: true }); missing.records.delete("changes/issue-17/source.json");
  await assert.rejects(intake(missing.github, missing.request, lease, missing.source));
  const link = fixture({ existing: true, symlinkSource: true }); await assert.rejects(intake(link.github, link.request, lease, link.source));
  const manual = fixture(); await assert.rejects(intake(manual.github, manual.request, lease));
  assert.equal(manual.writes.length, 0);
});
test("reconciliation reconstructs immutable work and App checks but never grants qualification", async () => {
  const f = fixture({ existing: true, fork: true });
  const report = await reconcileOnce(f.github, 42);
  assert.equal(report.observations.length, 1); const work = report.observations[0];
  assert.equal(work.status, "observed"); assert.equal(work.sha, sha); assert.equal(work.sourceCurrent, "unchanged");
  assert.equal(work.checks?.length, 5); assert.equal(work.qualified, false); assert.equal(work.fit, "missing");
  assert.equal(report.roleEligibilityVerified, false); assert.equal(f.writes.length, 0);
  assert.equal(JSON.stringify(await reconcileOnce(f.github, 42)).includes('"qualificationPublished":true'), false);
});
test("orphan and closed work are distinguished without automatic PR creation/reopening", async () => {
  for (const [options, expected] of [[{ existing: true, orphan: true }, "orphan"], [{ existing: true, closedPR: true }, "closed"]] as const) {
    const f = fixture(options); const report = await reconcileOnce(f.github, 42);
    assert.equal(report.observations[0].status, expected); assert.equal(f.writes.length, 0);
  }
});
test("advanced heads, conflicting PRs and missing records block reconstruction", async () => {
  for (const options of [{ existing: true, advance: true }, { existing: true, duplicatePR: true }]) {
    const f = fixture(options); assert.equal((await reconcileOnce(f.github, 42)).observations[0].status, "blocked"); assert.equal(f.writes.length, 0);
  }
  const f = fixture({ existing: true }); f.records.delete("changes/issue-17/request.json");
  assert.equal((await reconcileOnce(f.github, 42)).observations[0].status, "blocked");
});
test("foreign App checks are excluded and changed issue bodies are visibly stale", async () => {
  const f = fixture({ existing: true, foreignCheck: true }); f.editIssue();
  const work = (await reconcileOnce(f.github, 42)).observations[0];
  assert.equal(work.checks?.length, 0); assert.equal(work.sourceCurrent, "changed"); assert.equal(work.qualified, false);
});
test("self-declared Fit review and old diagnosis remain unqualified and stale", async () => {
  const f = fixture({ existing: true });
  f.records.set("changes/issue-17/fit.json", JSON.stringify({ version: 1, workId: "issue-17", requestSha: base, acceptedBy: "human", acceptedAt: new Date().toISOString(), provenance: "reviewed-human", summary: "Plan", allowedPaths: ["src/pages/Menu.tsx"], acceptance: [{ id: "search", assertion: "Matches", test: "shop.spec.ts" }] }));
  f.records.set("changes/issue-17/diagnosis.json", JSON.stringify({ version: 1, workId: "issue-17", failedSha: base, provenance: "reviewed-human", failureCheckUrls: ["https://github.com/a/b/check/1"], cause: "Cause", repair: "Repair", affectedFiles: ["src/pages/Menu.tsx"], confidence: "high" }));
  const work = (await reconcileOnce(f.github, 42)).observations[0];
  assert.equal(work.fit, "present-unverified"); assert.equal(work.diagnosis, "stale"); assert.equal(work.qualified, false);
});
test("actual blob-byte forgery is rejected even when reported SHA/size are unchanged", async () => {
  const f = fixture({ existing: true, forgedBlob: true }); const read = await workRecords(f.github, sha);
  await assert.rejects(read("changes/issue-17/request.json", true), /immutable Git blob/);
  assert.equal((await reconcileOnce(f.github, 42)).observations[0].status, "blocked");
});
test("truncated trees and oversized records block before downloading blob content", async () => {
  for (const option of ["truncated", "oversized"] as const) {
    const f = fixture({ existing: true, [option]: true });
    assert.equal((await reconcileOnce(f.github, 42)).observations[0].status, "blocked");
    assert.equal(f.reads.some(path => path.includes("/git/blobs/")), false);
  }
});
test("rate limiting stops the pass rather than probing every work item", async () => {
  const f = fixture({ existing: true, rateBlob: true, extraBranches: 3 });
  await assert.rejects(reconcileOnce(f.github, 42), error => (error as { status: number }).status === 429);
  assert.equal(f.reads.filter(path => path.includes("/git/blobs/")).length, 1);
});
test("bounded passes expose continuation cursors and cancellation does not query GitHub", async () => {
  const f = fixture({ existing: true, extraBranches: 51 });
  const first = await reconcileOnce(f.github, 42); assert.equal(first.observations.length, 50); assert.ok(first.nextAfter);
  const last = await reconcileOnce(f.github, 42, first.nextAfter); assert.equal(last.observations.length, 2); assert.equal(last.nextAfter, undefined);
  const stopped = fixture({ existing: true }); const controller = new AbortController(); controller.abort();
  await assert.rejects(reconcileOnce(stopped.github, 42, undefined, controller.signal)); assert.equal(stopped.reads.length, 0);
});
test("event hints cannot confer authority; foreign repositories and privilege fields are rejected", () => {
  const packet = { event: "push", deliveryId: "delivery-1", payload: { repository: { full_name: "a/b" }, after: "fake", approved: true } };
  assert.equal(parseWakeup(packet, "a/b").writeAuthorized, false);
  assert.throws(() => parseWakeup(packet, "foreign/repo"));
  assert.throws(() => parseWakeup({ ...packet, execute: "attack" }, "a/b"));
  assert.throws(() => parseWakeup({ ...packet, event: "unknown" }, "a/b"));
});
test("event file boundaries reject invalid JSON, oversized files and directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "safi-wakeup-")); const path = join(root, "event.json");
  try {
    await writeFile(path, JSON.stringify({ event: "issues", deliveryId: "delivery-1", payload: { repository: { full_name: "a/b" } } }));
    assert.equal((await readWakeup(path, "a/b")).authority, "untrusted-wakeup-only");
    await writeFile(path, "{broken"); await assert.rejects(readWakeup(path, "a/b"));
    await writeFile(path, "x".repeat(256 * 1024 + 1)); await assert.rejects(readWakeup(path, "a/b"));
    await assert.rejects(readWakeup(root, "a/b"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("polling arguments and provider backoff are bounded and unambiguous", () => {
  assert.equal(reconciliationOptions([]).watch, false);
  assert.equal(reconciliationOptions(["--watch", "--event", "event.json"]).watch, true);
  for (const args of [["--watch", "--once"], ["--watch", "--watch"], ["--after"], ["--event", "--watch"], ["--after", "main"]]) assert.throws(() => reconciliationOptions(args));
  assert.equal(pollingBackoff(null), 30000);
  assert.equal(pollingBackoff({ response: { headers: { "retry-after": "120" } } }), 120000);
  assert.equal(pollingBackoff({ response: { headers: { "retry-after": "999999" } } }), 3600000);
  assert.equal(pollingBackoff({ response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "200" } } }, 100000), 100000);
});
