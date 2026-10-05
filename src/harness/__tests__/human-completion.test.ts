import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import type { Lease } from "../coordination/lease.js";
import { GitHub } from "../git/github.js";
import { git } from "../git/worktrees.js";
import { readSnapshot } from "../testing/snapshot.js";
import { HumanSession } from "../work/session-state.js";
import { completeHumanSession } from "../work/session-completion.js";
import { fitPacket } from "../work/fit-write.js";
import { intakePacket } from "../intake/index.js";

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "safi-human-completion-")));
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Offline human"]); await git(root, ["config", "user.email", "offline@example.invalid"]);
  await mkdir(join(root, "src/pages"), { recursive: true }); await mkdir(join(root, "src/tests"), { recursive: true }); await mkdir(join(root, "changes/menu"), { recursive: true });
  const request = { version: 1, id: "menu", title: "Headline", description: "Change headline", acceptance: ["New headline appears"] };
  await writeFile(join(root, "src/pages/Menu.tsx"), "export const headline = 'old';\n");
  await writeFile(join(root, "src/tests/protected.ts"), "protected test\n");
  await writeFile(join(root, "changes/menu/request.json"), JSON.stringify(request));
  await git(root, ["add", "."]); await git(root, ["commit", "-m", "request"]);
  const requestSha = await git(root, ["rev-parse", "HEAD"]);
  const draft = { version: 1, workId: "menu", requestSha, summary: "Change headline", allowedPaths: ["src/pages/Menu.tsx"], acceptance: [{ id: "headline", assertion: "New headline appears", test: "shop.spec.ts::home navigation and photography fallback" }] };
  await writeFile(join(root, "changes/menu/fit.json"), JSON.stringify(draft));
  await git(root, ["add", "."]); await git(root, ["commit", "-m", "Fit"]);
  const fitSha = await git(root, ["rev-parse", "HEAD"]);
  const fitDigest = fitPacket(draft).digest;
  const requestDigest = intakePacket(request).digest;
  const lineage = { version: 1, workId: "menu", branch: "work/menu", fitSha, requestSha, requestDigest, fitDigest, pullRequest: 1, reviewId: 17, reviewUrl: "https://github.com/a/b/pull/1#pullrequestreview-17", acceptedBy: "reviewer", acceptedAt: "2026-10-01T12:00:00.000Z", provenance: "reviewed-human", sourceCurrent: "manual", allowedPaths: draft.allowedPaths };
  const summary = JSON.stringify(lineage, null, 2);
  const checks: Record<string, unknown>[] = [{ id: 1, name: "safi/fit", head_sha: fitSha, app: { id: 7 }, status: "completed", conclusion: "success", html_url: "https://github.com/a/b/runs/1", output: { summary }, external_id: `fit:${createHash("sha256").update(summary).digest("hex")}` }];
  let head = fitSha, candidate = fitSha;
  const writes: { operation: string; input: Record<string, unknown> }[] = [];
  const pull = () => ({ number: 1, node_id: "PR_1", state: "open", draft: false, user: { login: "author" }, head: { sha: head, ref: "work/menu", repo: { full_name: "a/b" } }, base: { ref: "main" }, html_url: "https://github.com/a/b/pull/1" });
  const api = {
    paginate: async (method: (input: unknown) => Promise<{ data: unknown }>, input: unknown) => (await method(input)).data,
    git: {
      getRef: async () => ({ data: { object: { sha: head } } }),
      getCommit: async ({ commit_sha }: { commit_sha: string }) => ({ data: { sha: commit_sha, tree: { sha: await git(root, ["rev-parse", `${commit_sha}^{tree}`]) } } }),
      getTree: async ({ tree_sha }: { tree_sha: string }) => {
        const files = await readSnapshot(root, await git(root, ["rev-list", "--all"] ).then(async history => {
          for (const commit of [head, candidate, ...history.split("\n")]) if (await git(root, ["rev-parse", `${commit}^{tree}`]) === tree_sha) return commit;
          throw new Error("Missing offline tree");
        }));
        return { data: { truncated: false, tree: files.map(file => ({ path: file.path, mode: file.mode, type: "blob", sha: file.oid, size: file.data.length })) } };
      },
      getBlob: async ({ file_sha }: { file_sha: string }) => {
        const snapshots = await Promise.all([head, candidate, fitSha, requestSha].map(commit => readSnapshot(root, commit)));
        const file = snapshots.flat().find(file => file.oid === file_sha)!;
        return { data: { sha: file_sha, encoding: "base64", size: file.data.length, content: file.data.toString("base64") } };
      },
      createBlob: async (input: Record<string, unknown>) => {
        writes.push({ operation: "blob", input });
        const bytes = Buffer.from(String(input.content), "base64");
        return { data: { sha: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") } };
      },
      createTree: async (input: Record<string, unknown>) => { writes.push({ operation: "tree", input }); return { data: { sha: await git(root, ["rev-parse", `${candidate}^{tree}`]) } }; },
      createCommit: async (input: { tree: string; parents: string[]; message: string }) => {
        writes.push({ operation: "commit", input });
        const sha = await git(root, ["commit-tree", input.tree, "-p", input.parents[0], "-m", input.message]);
        return { data: { sha } };
      },
      updateRef: async (input: Record<string, unknown>) => { writes.push({ operation: "ref", input }); assert.equal(input.force, false); head = String(input.sha); return { data: {} }; },
    },
    pulls: {
      list: async () => ({ data: [pull()] }),
      get: async () => ({ data: pull() }),
      listReviews: async () => ({ data: [{ id: 17, user: { login: "reviewer", type: "User" }, author_association: "COLLABORATOR", state: "APPROVED", commit_id: fitSha, submitted_at: "2026-10-01T12:00:00Z", html_url: lineage.reviewUrl }] }),
    },
    repos: {
      compareCommitsWithBasehead: async ({ basehead }: { basehead: string }) => {
        const [base, end] = basehead.split("...");
        const commits = (await git(root, ["rev-list", "--reverse", `${base}..${end}`])).split("\n").filter(Boolean);
        const changes = (await git(root, ["diff", "--name-only", base, end])).split("\n").filter(Boolean);
        return { data: { status: "ahead", ahead_by: commits.length, merge_base_commit: { sha: base }, commits: await Promise.all(commits.map(async sha => ({ sha, parents: (await git(root, ["rev-list", "--parents", "-n", "1", sha])).split(" ").slice(1).map(sha => ({ sha })) }))), files: changes.map(filename => ({ filename })) } };
      },
    },
    checks: {
      listForRef: async ({ ref }: { ref: string }) => ({ data: checks.filter(check => check.head_sha === ref) }),
      create: async (input: Record<string, unknown>) => {
        writes.push({ operation: "check", input });
        const data = { ...input, app: { id: 7 }, id: checks.length + 1, html_url: `https://github.com/a/b/runs/${checks.length + 1}` }; checks.push(data); return { data };
      },
    },
  } as unknown as Octokit;
  const github = new GitHub("a/b", api, async () => ({ appId: 7 }));
  const handoff = { version: 1 as const, sessionId: randomUUID(), role: "developer" as const, workId: "menu", branch: "work/menu", expectedSha: fitSha, fitSha, fitDigest, allowedPaths: draft.allowedPaths, checkout: root, createdAt: new Date().toISOString(), deadline: new Date(Date.now() + 120000).toISOString(), fitCheckUrl: "https://github.com/a/b/runs/1", requestPath: "changes/menu/request.json", fitPath: "changes/menu/fit.json", operatorBoundary: "same-os-user-local-human" as const, instructions: "Edit in Dyad" };
  const session = new HumanSession(handoff); session.acknowledge(handoff.sessionId);
  return { root, github, session, handoff, writes, checks, setHead: (sha: string) => { head = sha; }, async edit(path = "src/pages/Menu.tsx") { await writeFile(join(root, path), "export const headline = 'new';\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "Human edit"]); candidate = await git(root, ["rev-parse", "HEAD"]); return candidate; } };
}
const owned = { async assertOwned() {} } as Lease;

test("acknowledged real Git completion uploads only accepted application blobs and creates a new untested SHA", async () => {
  const f = await fixture();
  try {
    const candidate = await f.edit();
    const result = await completeHumanSession(f.github, f.session, candidate, owned, owned);
    assert.equal(result.testingRequired, true); assert.equal(result.qualificationPublished, false); assert.equal(f.session.status, "completed");
    assert.notEqual(result.sha, candidate); assert.notEqual(result.sha, f.handoff.expectedSha);
    const tree = f.writes.find(write => write.operation === "tree")!.input.tree as { path: string }[];
    assert.deepEqual(tree.map(entry => entry.path), ["src/pages/Menu.tsx"]);
    assert.deepEqual(f.writes.filter(write => write.operation === "check").map(write => write.input.name), ["safi/developer"]);
    const published = f.writes.find(write => write.operation === "check")!.input;
    assert.equal(published.head_sha, result.sha);
    assert.equal(JSON.parse((published.output as { summary: string }).summary).testsPassed, false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("human completion refuses stale branch heads without uploading or publishing anything", async () => {
  const f = await fixture();
  try {
    const candidate = await f.edit(); f.setHead(candidate);
    await assert.rejects(completeHumanSession(f.github, f.session, candidate, owned, owned), /Branch advanced/);
    assert.equal(f.writes.length, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("human completion cannot weaken a protected test even with a clean committed checkout", async () => {
  const f = await fixture();
  try {
    const candidate = await f.edit("src/tests/protected.ts");
    await assert.rejects(completeHumanSession(f.github, f.session, candidate, owned, owned));
    assert.equal(f.writes.length, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("lost branch-writer lease prevents any human completion write", async () => {
  const f = await fixture();
  try {
    const candidate = await f.edit();
    await assert.rejects(completeHumanSession(f.github, f.session, candidate, owned, { async assertOwned() { throw new Error("lost writer"); } }), /lost writer/);
    assert.equal(f.writes.length, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
