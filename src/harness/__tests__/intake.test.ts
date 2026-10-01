import test from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";
import { GitHub } from "../git/github.js";
import { intake, intakePacket, IntakeError } from "../intake/index.js";

const request = { version: 1 as const, id: "menu-search", title: "Improve menu search", description: "Search menu labels", acceptance: ["Matching items appear"] };
const base = "a".repeat(40); const candidate = "b".repeat(40);
const lease = { async assertOwned() {} };
function fixture(options: { collision?: boolean; refRace?: boolean; ambiguousPR?: boolean; closed?: boolean; protectedRequest?: boolean } = {}) {
  let branch: string | undefined;
  let record = request;
  let pull: Record<string, unknown> | undefined;
  const writes: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const path = decodeURIComponent(url.pathname);
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push(`${method} ${path}`);
    let status = 200; let data: unknown;
    if (path === "/repos/a/b") data = { full_name: "a/b", default_branch: "main", archived: false, disabled: false };
    else if (path === "/repos/a/b/git/ref/heads/work/menu-search") { if (branch) data = { object: { sha: branch } }; else { status = 404; data = {}; } }
    else if (path === "/repos/a/b/git/ref/heads/main") data = { object: { sha: base } };
    else if (path.startsWith("/repos/a/b/git/commits/") && method === "GET") data = { tree: { sha: "c".repeat(40) } };
    else if (path === `/repos/a/b/git/trees/${"c".repeat(40)}`) data = { truncated: false, tree: [{ path: "changes/menu-search/request.json", mode: "100644", type: "blob", sha: "f".repeat(40) }] };
    else if (path === "/repos/a/b/contents/changes/menu-search/request.json") {
      if (url.searchParams.get("ref") === base && !options.protectedRequest) { status = 404; data = {}; }
      else data = { type: "file", sha: "f".repeat(40), encoding: "base64", size: 500, content: Buffer.from(intakePacket(record).content).toString("base64") };
    }
    else if (path === "/repos/a/b/git/trees") {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.tree.map((item: { path: string }) => item.path), ["changes/menu-search/request.json"]);
      data = { sha: "d".repeat(40) };
    }
    else if (path === "/repos/a/b/git/commits") data = { sha: candidate };
    else if (path === "/repos/a/b/git/refs") {
      branch = candidate;
      if (options.collision) record = { ...request, description: "Conflicting request" };
      status = options.refRace || options.collision ? 422 : 201;
      data = status === 201 ? { object: { sha: branch } } : {};
    }
    else if (path === "/repos/a/b/pulls" && method === "GET") data = pull ? [pull] : [];
    else if (path === "/repos/a/b/pulls" && method === "POST") {
      const body = JSON.parse(String(init?.body)); assert.equal(body.draft, true);
      pull = { number: 1, html_url: "https://github.com/a/b/pull/1", state: options.closed ? "closed" : "open", head: { ref: "work/menu-search", repo: { full_name: "a/b" } }, base: { ref: "main" } };
      status = options.ambiguousPR ? 500 : 201; data = status === 201 ? pull : {};
    }
    else throw new Error(`Unexpected offline route: ${method} ${path}`);
    const response = new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: url.href });
    return response;
  };
  const api = new Octokit({ request: { fetch: fetcher } });
  return { api, github: new GitHub("a/b", api, async () => ({ appId: 1 })), writes, advance() { branch = "e".repeat(40); }, close() { if (pull) pull.state = "closed"; } };
}

test("manual intake creates only a request commit, work branch and draft PR; replay writes nothing", async () => {
  const f = fixture();
  const first = await intake(f.github, request, lease);
  assert.equal(first.branch, "work/menu-search"); assert.equal(first.sha, candidate); assert.equal(first.pullRequest, 1);
  assert.equal(f.writes.length, 4);
  const second = await intake(f.github, request, lease);
  assert.deepEqual(second, first); assert.equal(f.writes.length, 4);
});
test("replay after implementation returns current SHA without resetting branch", async () => {
  const f = fixture(); await intake(f.github, request, lease); f.advance();
  const replay = await intake(f.github, request, lease);
  assert.equal(replay.sha, "e".repeat(40)); assert.equal(f.writes.length, 4);
});
test("closed PR is returned, not silently reopened or duplicated", async () => {
  const f = fixture(); await intake(f.github, request, lease); f.close();
  assert.equal((await intake(f.github, request, lease)).state, "closed"); assert.equal(f.writes.length, 4);
});
test("concurrent branch creation is reconciled without force updates", async () => {
  const f = fixture({ refRace: true });
  assert.equal((await intake(f.github, request, lease)).sha, candidate);
  assert.equal(f.writes.some(path => path.startsWith("PATCH")), false);
});
test("ambiguous PR response reconciles remote PR instead of blindly retrying", async () => {
  const f = fixture({ ambiguousPR: true });
  assert.equal((await intake(f.github, request, lease)).pullRequest, 1);
  assert.equal(f.writes.filter(path => path === "POST /repos/a/b/pulls").length, 1);
});
test("same work ID with different content rejects without overwriting", async () => {
  const f = fixture({ collision: true });
  await assert.rejects(intake(f.github, request, lease), IntakeError);
  assert.equal(f.writes.length, 3);
});
test("request inherited from main is not overwritten", async () => {
  const f = fixture({ protectedRequest: true });
  await assert.rejects(intake(f.github, request, lease), IntakeError); assert.equal(f.writes.length, 0);
});
test("PAT cannot create request objects or branches", async () => {
  const f = fixture(); const pat = new GitHub("a/b", f.api);
  await assert.rejects(intake(pat, request, lease), /GitHub App/); assert.equal(f.writes.length, 0);
});
test("lost lease prevents writes", async () => {
  const f = fixture();
  await assert.rejects(intake(f.github, request, { async assertOwned() { throw new Error("lost lease"); } }), /lost lease/);
  assert.equal(f.writes.length, 0);
});
test("unsafe request identity rejected before API access", async () => {
  const f = fixture();
  await assert.rejects(intake(f.github, { ...request, id: "../escape" }, lease)); assert.equal(f.writes.length, 0);
});
