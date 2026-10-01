import { createHash } from "node:crypto";
import type { z } from "zod";
import { requestSchema, shaSchema } from "../contracts/index.js";
import type { GitHub } from "../git/github.js";

export class IntakeError extends Error {}
export type IntakeResult = {
  workId: string; branch: string; sha: string; requestDigest: string;
  pullRequest: number; url: string; state: "open" | "closed";
};
export type IntakeAuthority = { assertOwned(): Promise<void> };

export function intakePacket(input: unknown) {
  const request = requestSchema.parse(input);
  const content = JSON.stringify(request, null, 2) + "\n";
  return { request, content, digest: createHash("sha256").update(content).digest("hex"), branch: `work/${request.id}`, path: `changes/${request.id}/request.json` };
}
function notFound(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

/** GitHub branch/request/PR state is durable; the lease only coordinates concurrent writers. */
export async function intake(github: GitHub, input: z.infer<typeof requestSchema>, lease: IntakeAuthority): Promise<IntakeResult> {
  const packet = intakePacket(input);
  const { api, owner, repo } = github;
  const repository = (await api.repos.get({ owner, repo })).data;
  if (repository.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase() || repository.archived || repository.disabled) throw new IntakeError("Repository is not available for intake.");
  const base = repository.default_branch;
  if (!base || base === packet.branch) throw new IntakeError("Repository default branch is invalid for intake.");
  let sha: string | undefined;
  try { sha = await github.head(packet.branch); } catch (error) { if (!notFound(error)) throw error; }
  if (!sha) {
    const baseRef = await api.git.getRef({ owner, repo, ref: `heads/${base}` });
    const baseSha = shaSchema.parse(baseRef.data.object.sha);
    const baseCommit = await api.git.getCommit({ owner, repo, commit_sha: baseSha });
    // Never overwrite an existing request inherited from the default branch.
    try {
      await api.repos.getContent({ owner, repo, path: packet.path, ref: baseSha });
      throw new IntakeError("Request identity already exists on the default branch; use its original work branch.");
    } catch (error) { if (!notFound(error)) throw error; }
    await github.assertWriteAuthority(lease);
    const tree = await api.git.createTree({ owner, repo, base_tree: baseCommit.data.tree.sha, tree: [{ path: packet.path, mode: "100644", type: "blob", content: packet.content }] });
    await github.assertWriteAuthority(lease);
    const commit = await api.git.createCommit({ owner, repo, message: `SAFI request ${packet.request.id}`, tree: tree.data.sha, parents: [baseSha] });
    await github.assertWriteAuthority(lease);
    try {
      await api.git.createRef({ owner, repo, ref: `refs/heads/${packet.branch}`, sha: commit.data.sha });
    } catch (error) {
      // A concurrent/ambiguous write is reconciled from remote truth, never force-pushed.
      try { sha = await github.head(packet.branch); } catch { throw error; }
    }
    sha = sha ?? await github.head(packet.branch);
  }
  const headCommit = await api.git.getCommit({ owner, repo, commit_sha: sha });
  const tree = await api.git.getTree({ owner, repo, tree_sha: headCommit.data.tree.sha, recursive: "1" });
  const requestEntry = tree.data.tree.find(entry => entry.path === packet.path);
  if (tree.data.truncated || !requestEntry || requestEntry.type !== "blob" || requestEntry.mode !== "100644") throw new IntakeError("Work branch request must be a regular non-executable blob in a complete tree.");
  const record = (await api.repos.getContent({ owner, repo, path: packet.path, ref: sha })).data;
  if (Array.isArray(record) || record.type !== "file" || !("content" in record) || record.encoding !== "base64" || record.size > 65536 || record.sha !== requestEntry.sha) throw new IntakeError("Work branch request is not a bounded regular file.");
  let remote: unknown;
  try { remote = JSON.parse(Buffer.from(record.content, "base64").toString("utf8")); } catch { throw new IntakeError("Work branch request is invalid JSON."); }
  if (intakePacket(remote).digest !== packet.digest) throw new IntakeError("Work ID already belongs to a different request; no branch was overwritten.");
  const findPR = async () => {
    const pulls = await api.paginate(api.pulls.list, { owner, repo, state: "all", head: `${owner}:${packet.branch}`, per_page: 100 });
    const matches = pulls.filter(pr => pr.head.ref === packet.branch && pr.head.repo?.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase());
    if (matches.length > 1 || (matches[0] && matches[0].base.ref !== base)) throw new IntakeError("Existing pull request lineage is ambiguous; operator review required.");
    return matches[0];
  };
  let pull: { number: number; html_url: string; state: string } | undefined = await findPR();
  if (!pull) {
    await github.assertWriteAuthority(lease);
    try {
      pull = (await api.pulls.create({ owner, repo, head: packet.branch, base, draft: true, title: `[SAFI ${packet.request.id}] ${packet.request.title}`, body: `Request record: \`${packet.path}\`\n\nSHA-256: \`${packet.digest}\`\n\nHuman Fit acceptance and fresh exact-SHA qualification are required. Intake does not approve implementation or tests.` })).data;
    } catch (error) {
      pull = await findPR();
      if (!pull) throw error;
    }
  }
  await github.assertWriteAuthority(lease);
  // Return the current head, including valid progress made since original intake.
  const current = await github.head(packet.branch);
  if (current !== sha) throw new IntakeError("Work head changed during intake; reconcile before proceeding.");
  return { workId: packet.request.id, branch: packet.branch, sha: current, requestDigest: packet.digest, pullRequest: pull.number, url: pull.html_url, state: pull.state === "closed" ? "closed" : "open" };
}
