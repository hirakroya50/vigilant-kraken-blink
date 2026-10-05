import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Octokit } from "@octokit/rest";
import type { Lease } from "../coordination/lease.js";
import { GitHub } from "../git/github.js";
import { commitFitDraft, fitPacket, publishReviewedFit } from "../work/fit-write.js";

const requestSha = "a".repeat(40), fitSha = "b".repeat(40), treeSha = "c".repeat(40);
const request = { version: 1, id: "menu-search", title: "Search", description: "Search the menu", acceptance: ["Matching items appear"] };
const draft = { version: 1, workId: "menu-search", requestSha, summary: "Add menu search", allowedPaths: ["src/pages/Index.tsx"], acceptance: [{ id: "search", assertion: "Matching items appear", test: "shop.spec.ts" }] };
const owned = { async assertOwned() {} };
const roleLease = owned as Lease;
function fixture(options: { withFit?: boolean; closed?: boolean; invalidReview?: boolean; wrongDigest?: boolean; advanceOnCreate?: boolean; withdrawOnChecks?: boolean; selfReview?: boolean; fork?: boolean } = {}) {
  let head = options.withFit ? fitSha : requestSha;
  let record: unknown = options.withFit ? draft : undefined;
  let revoked = false;
  const writes: string[] = [];
  const checks: Record<string, unknown>[] = [];
  const blobs = new Map<string, Buffer>();
  const blob = (value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
    const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    blobs.set(sha, bytes);
    return { mode: "100644", type: "blob", sha, size: bytes.length };
  };
  const pull = () => ({ number: 1, html_url: "https://github.com/a/b/pull/1", user: { login: "author" }, state: options.closed ? "closed" : "open", draft: false, head: { sha: head, ref: "work/menu-search", repo: { full_name: options.fork ? "other/b" : "a/b" } } });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push(`${method} ${path}`);
    let data: unknown;
    if (path === "/repos/a/b/git/ref/heads/work/menu-search") data = { object: { sha: head } };
    else if (path.startsWith("/repos/a/b/git/commits/") && method === "GET") data = { tree: { sha: path.endsWith(requestSha) ? requestSha : fitSha } };
    else if (path.startsWith("/repos/a/b/git/trees/") && method === "GET") {
      const entries = [{ path: "changes/menu-search/request.json", ...blob(request) }];
      if (path.endsWith(fitSha) && record) entries.push({ path: "changes/menu-search/fit.json", ...blob(record) });
      data = { truncated: false, tree: entries };
    }
    else if (path.startsWith("/repos/a/b/git/blobs/")) {
      const sha = path.split("/").at(-1)!;
      const bytes = blobs.get(sha)!;
      data = { sha: options.wrongDigest ? "f".repeat(40) : sha, encoding: "base64", size: bytes.length, content: bytes.toString("base64") };
    }
    else if (path === "/repos/a/b/pulls" && method === "GET") data = options.closed && url.searchParams.get("state") === "open" ? [] : [pull()];
    else if (path === "/repos/a/b/pulls/1") data = pull();
    else if (path === "/repos/a/b/git/trees" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.tree.length, 1);
      assert.equal(body.tree[0].path, "changes/menu-search/fit.json");
      assert.equal(body.tree[0].mode, "100644");
      record = JSON.parse(body.tree[0].content);
      data = { sha: treeSha };
    }
    else if (path === "/repos/a/b/git/commits" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.parents, [requestSha]);
      if (options.advanceOnCreate) head = "d".repeat(40);
      data = { sha: fitSha };
    }
    else if (path === "/repos/a/b/git/refs/heads/work/menu-search" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.force, false);
      head = body.sha;
      data = { object: { sha: head } };
    }
    else if (path.startsWith("/repos/a/b/compare/")) data = { status: "ahead", ahead_by: 1, merge_base_commit: { sha: requestSha }, commits: [{ parents: [{ sha: requestSha }] }], files: [{ filename: "changes/menu-search/fit.json" }] };
    else if (path === "/repos/a/b/pulls/1/reviews") data = [{ id: 17, user: { login: options.selfReview ? "author" : "reviewer", type: "User" }, author_association: "COLLABORATOR", state: revoked ? "CHANGES_REQUESTED" : "APPROVED", commit_id: options.invalidReview ? requestSha : fitSha, submitted_at: "2026-10-01T12:00:00Z", html_url: "https://github.com/a/b/pull/1#pullrequestreview-17" }];
    else if (path === `/repos/a/b/commits/${fitSha}/check-runs`) {
      if (options.withdrawOnChecks) revoked = true;
      data = { total_count: checks.length, check_runs: checks };
    }
    else if (path === "/repos/a/b/check-runs" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const check = { ...body, id: checks.length + 1, app: { id: 1 }, html_url: "https://github.com/a/b/runs/1" };
      checks.push(check); data = check;
    }
    else throw new Error(`Unexpected offline route ${method} ${path}`);
    const response = new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: url.href });
    return response;
  };
  const api = new Octokit({ request: { fetch: fetcher } });
  return { github: new GitHub("a/b", api, async () => ({ appId: 1 })), api, writes, checks };
}

test("Fit packet rejects duplicate paths, acceptance IDs, self-approval and protected paths", () => {
  for (const input of [
    { ...draft, allowedPaths: ["package.json"] },
    { ...draft, allowedPaths: ["src/pages/Index.tsx", "src/pages/Index.tsx"] },
    { ...draft, acceptedBy: "me" },
    { ...draft, acceptance: [draft.acceptance[0], draft.acceptance[0]] },
    { ...draft, summary: "x".repeat(4001) },
  ]) assert.throws(() => fitPacket(input));
});
test("Fit commit writes only one Fit record and replays without branch changes", async () => {
  const f = fixture();
  const first = await commitFitDraft(f.github, draft, owned);
  assert.equal(first.sha, fitSha); assert.equal(first.humanApprovalRequired, true); assert.equal(first.checkPublished, false);
  assert.equal(f.writes.length, 3);
  const replay = await commitFitDraft(f.github, draft, owned);
  assert.equal(replay.reused, true); assert.equal(f.writes.length, 3);
});
test("different Fit cannot overwrite a prior draft", async () => {
  const f = fixture({ withFit: true });
  await assert.rejects(commitFitDraft(f.github, { ...draft, summary: "Different" }, owned), /different Fit/);
  assert.equal(f.writes.length, 0);
});
test("closed work, forks and invalid request bytes cannot receive Fit commits", async () => {
  for (const options of [{ closed: true }, { fork: true }, { wrongDigest: true }]) {
    const f = fixture(options);
    await assert.rejects(commitFitDraft(f.github, draft, owned));
    assert.equal(f.writes.length, 0);
  }
});
test("head advancement during draft creation prevents ref update", async () => {
  const f = fixture({ advanceOnCreate: true });
  await assert.rejects(commitFitDraft(f.github, draft, owned), /Work changed/);
  assert.equal(f.writes.some(w => w.startsWith("PATCH")), false);
});
test("Fit commit rejects lost ownership and PAT authority", async () => {
  const f = fixture();
  await assert.rejects(commitFitDraft(f.github, draft, { async assertOwned() { throw new Error("lost ownership"); } }), /lost ownership/);
  assert.equal(f.writes.length, 0);
  await assert.rejects(commitFitDraft(new GitHub("a/b", f.api), draft, owned), /GitHub App/);
  assert.equal(f.writes.length, 0);
});
test("reviewed Fit publishes stable exact-SHA lineage; replay reuses the check", async () => {
  const f = fixture({ withFit: true });
  const first = await publishReviewedFit(f.github, "menu-search", roleLease, owned);
  assert.equal(first.checkPublished, true); assert.equal(first.qualificationPublished, false);
  const check = f.checks[0];
  assert.equal(check.head_sha, fitSha); assert.equal(check.name, "safi/fit");
  const lineage = JSON.parse((check.output as { summary: string }).summary);
  assert.equal(lineage.reviewId, 17); assert.equal(lineage.requestSha, requestSha);
  assert.equal(lineage.fitDigest, fitPacket(draft).digest);
  await publishReviewedFit(f.github, "menu-search", roleLease, owned);
  assert.equal(f.checks.length, 1);
});
test("stale, self, missing and withdrawn approvals cannot publish success", async () => {
  for (const options of [{ invalidReview: true }, { selfReview: true }, { closed: true }, { withdrawOnChecks: true }]) {
    const f = fixture({ withFit: true, ...options });
    await assert.rejects(publishReviewedFit(f.github, "menu-search", roleLease, owned));
    assert.equal(f.checks.length, 0);
  }
});
test("branch-writer lease loss blocks trusted Fit publication", async () => {
  const f = fixture({ withFit: true });
  await assert.rejects(publishReviewedFit(f.github, "menu-search", roleLease, { async assertOwned() { throw new Error("writer lease lost"); } }), /writer lease lost/);
  assert.equal(f.checks.length, 0);
});
