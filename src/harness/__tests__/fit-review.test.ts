import test from "node:test";
import assert from "node:assert/strict";
import { assertFitOnlyCommit, selectHumanFitApproval } from "../work/fit-review.js";
import { WorkError } from "../work/records.js";

const requestSha = "a".repeat(40); const head = "b".repeat(40);
function review(login: string, state: string, overrides: Record<string, unknown> = {}) {
  return { id: 1, user: { login, type: "User" }, author_association: "COLLABORATOR", state, commit_id: head, submitted_at: "2026-10-01T12:00:00.000Z", html_url: `https://github.com/a/b/pull/1#pullrequestreview-${login}`, ...overrides };
}
function commit(files = [`changes/menu-search/fit.json`], overrides: Record<string, unknown> = {}) {
  return { status: "ahead", ahead_by: 1, merge_base_commit: { sha: requestSha }, commits: [{ parents: [{ sha: requestSha }] }], files: files.map(filename => ({ filename })), ...overrides };
}
test("Fit commit must be exactly one child commit that adds only the Fit record", () => {
  assert.doesNotThrow(() => assertFitOnlyCommit(commit(), requestSha, head, "menu-search"));
  const attacks = [
    commit(["src/pages/Menu.tsx", "changes/menu-search/fit.json"]),
    commit(["package.json"]),
    commit(undefined, { ahead_by: 2, commits: [{ parents: [{ sha: requestSha }] }, { parents: [{ sha: head }] }] }),
    commit(undefined, { status: "diverged" }),
    commit(undefined, { merge_base_commit: { sha: "c".repeat(40) } }),
    commit(undefined, { commits: [{ parents: [{ sha: "c".repeat(40) }] }] }),
    commit(undefined, { files: undefined }),
  ];
  for (const attack of attacks) assert.throws(() => assertFitOnlyCommit(attack, requestSha, head, "menu-search"), WorkError);
});
test("exact-head repository collaborator approval is accepted; self, bots, outsiders and stale reviews are not", () => {
  const approval = review("reviewer", "APPROVED");
  assert.equal(selectHumanFitApproval([approval], head, "app-bot").user?.login, "reviewer");
  for (const invalid of [
    review("app-bot", "APPROVED"),
    review("bot-reviewer", "APPROVED", { user: { login: "bot-reviewer", type: "Bot" } }),
    review("outsider", "APPROVED", { author_association: "CONTRIBUTOR" }),
    review("reviewer", "APPROVED", { commit_id: requestSha }),
    review("reviewer", "COMMENTED"),
    review("reviewer", "APPROVED", { submitted_at: "not-a-date" }),
  ]) assert.throws(() => selectHumanFitApproval([invalid], head, "app-bot"), /No non-author repository collaborator/);
});
test("a collaborator's latest decision controls; unresolved changes block until explicitly cleared", () => {
  const approval = review("reviewer", "APPROVED", { id: 1, submitted_at: "2026-10-01T12:00:00Z" });
  const requestChanges = review("reviewer", "CHANGES_REQUESTED", { id: 2, submitted_at: "2026-10-01T12:01:00Z" });
  assert.throws(() => selectHumanFitApproval([approval, requestChanges], head, "app-bot"), /requests changes/);
  const resolution = review("reviewer", "APPROVED", { id: 3, submitted_at: "2026-10-01T12:02:00Z" });
  assert.equal(selectHumanFitApproval([approval, requestChanges, resolution], head, "app-bot").id, 3);
  const dismissed = review("reviewer", "DISMISSED", { id: 4, submitted_at: "2026-10-01T12:03:00Z" });
  assert.throws(() => selectHumanFitApproval([approval, requestChanges, dismissed], head, "app-bot"), /No non-author repository collaborator/);
});
test("newer reviewer decisions replace older decisions deterministically", () => {
  const old = review("reviewer", "CHANGES_REQUESTED", { id: 1, submitted_at: "2026-10-01T12:00:00Z" });
  const next = review("reviewer", "APPROVED", { id: 2, submitted_at: "2026-10-01T12:01:00Z" });
  assert.equal(selectHumanFitApproval([old, next], head, "app-bot").id, 2);
  assert.equal(selectHumanFitApproval([next, old], head, "app-bot").id, 2);
});
