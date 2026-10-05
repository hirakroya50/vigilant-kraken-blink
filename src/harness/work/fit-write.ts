import { createHash } from "node:crypto";
import { fitDraftSchema } from "../ai/contracts.js";
import { fitDraftRecordSchema, requestSchema, shaSchema } from "../contracts/index.js";
import type { Lease } from "../coordination/lease.js";
import type { GitHub } from "../git/github.js";
import { intakePacket } from "../intake/index.js";
import { issueSourceSchema, loadIssueRequest, sourceContent } from "../intake/issue.js";
import { assertFitOnlyCommit, inspectFitReview, jsonBlob } from "./fit-review.js";
import { WorkError } from "./records.js";

export function fitPacket(input: unknown) {
  const record = fitDraftRecordSchema.parse(input);
  fitDraftSchema.parse({ summary: record.summary, allowedPaths: record.allowedPaths, acceptance: record.acceptance });
  const content = JSON.stringify(record, null, 2) + "\n";
  if (Buffer.byteLength(content) > 65536) throw new WorkError("Fit record exceeds the 64 KiB boundary.");
  return { record, content, digest: createHash("sha256").update(JSON.stringify(record)).digest("hex") };
}

export async function commitFitDraft(github: GitHub, input: unknown, lease: { assertOwned(): Promise<void> }) {
  const packet = fitPacket(input);
  const { record } = packet;
  const branch = `work/${record.workId}`;
  const path = `changes/${record.workId}/fit.json`;
  const { owner, repo, api } = github;
  const head = await github.head(branch);
  const pulls = await api.paginate(api.pulls.list, { owner, repo, state: "all", head: `${owner}:${branch}`, per_page: 100 });
  const matching = pulls.filter(pr => pr.head.ref === branch && pr.head.repo?.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase());
  if (matching.length !== 1 || matching[0].state !== "open" || matching[0].head.sha !== head) throw new WorkError("Fit drafting requires one open same-repository PR at the current head.");
  const pull = matching[0];
  const request = requestSchema.parse((await jsonBlob(github, record.requestSha, `changes/${record.workId}/request.json`))!.value);
  if (request.id !== record.workId) throw new WorkError("Fit and immutable request identity differ.");
  const originalSource = await jsonBlob(github, record.requestSha, `changes/${record.workId}/source.json`, false);
  const validateSource = async () => {
    if (originalSource) {
      const source = issueSourceSchema.parse(originalSource.value);
      if (record.workId !== `issue-${source.number}` || source.repository !== `${owner}/${repo}`.toLowerCase()) throw new WorkError("Issue provenance does not match Fit identity.");
      const current = await loadIssueRequest(github, source.number);
      if (sourceContent(current.source) !== sourceContent(source) || intakePacket(current.request).digest !== intakePacket(request).digest) throw new WorkError("Issue requirements changed; Fit drafting is blocked.");
    } else if (record.workId.startsWith("issue-")) throw new WorkError("Issue-backed Fit requires source provenance.");
  };
  await validateSource();
  const existing = await jsonBlob(github, head, path, false);
  if (existing) {
    if (fitPacket(existing.value).digest !== packet.digest) throw new WorkError("A different Fit already exists; it will not be overwritten.");
    const compare = (await api.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${record.requestSha}...${head}`, per_page: 100 })).data;
    assertFitOnlyCommit(compare, record.requestSha, head, record.workId);
    await github.assertWriteAuthority(lease);
    if (await github.head(branch) !== head) throw new WorkError("Fit head advanced during replay.");
    return { workId: record.workId, branch, sha: head, fitDigest: packet.digest, pullRequest: pull.number, url: pull.html_url, reused: true, humanApprovalRequired: true, checkPublished: false };
  }
  if (head !== record.requestSha) throw new WorkError("Fit must be created directly on the immutable request SHA, before implementation begins.");
  const commit = (await api.git.getCommit({ owner, repo, commit_sha: head })).data;
  await github.assertWriteAuthority(lease);
  const tree = (await api.git.createTree({ owner, repo, base_tree: commit.tree.sha, tree: [{ path, mode: "100644", type: "blob", content: packet.content }] })).data;
  await github.assertWriteAuthority(lease);
  const candidate = (await api.git.createCommit({ owner, repo, message: `SAFI Fit ${record.workId}: pending human review`, tree: shaSchema.parse(tree.sha), parents: [head] })).data;
  const candidateSha = shaSchema.parse(candidate.sha);
  await validateSource();
  const freshPull = (await api.pulls.get({ owner, repo, pull_number: pull.number })).data;
  if (freshPull.state !== "open" || freshPull.head.sha !== head || await github.head(branch) !== head) throw new WorkError("Work changed during Fit creation; branch was not updated.");
  await github.assertWriteAuthority(lease);
  // Non-force fast-forward rejects a competing child commit, even after the head check.
  await api.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: candidateSha, force: false });
  if (await github.head(branch) !== candidateSha) throw new WorkError("Fit publication head differs; reconcile remote truth before retrying.");
  return { workId: record.workId, branch, sha: candidateSha, fitDigest: packet.digest, pullRequest: pull.number, url: pull.html_url, reused: false, humanApprovalRequired: true, checkPublished: false };
}

export async function publishReviewedFit(github: GitHub, workId: string, lease: Lease, branchLease: { assertOwned(): Promise<void> }) {
  const approved = await inspectFitReview(github, workId);
  if (!Number.isSafeInteger(approved.reviewId) || approved.reviewId! < 1 || approved.reviewUrl !== `https://github.com/${github.owner}/${github.repo}/pull/${approved.pullRequest}#pullrequestreview-${approved.reviewId}`) throw new WorkError("Fit approval must have a canonical durable GitHub review identity.");
  const lineage = {
    version: 1, workId: approved.workId, branch: approved.branch, fitSha: approved.sha,
    requestSha: approved.requestSha, requestDigest: approved.requestDigest, fitDigest: approved.fitDigest,
    pullRequest: approved.pullRequest, reviewId: approved.reviewId, reviewUrl: approved.reviewUrl,
    acceptedBy: approved.acceptedBy, acceptedAt: approved.acceptedAt,
    provenance: approved.provenance, sourceCurrent: approved.sourceCurrent, allowedPaths: approved.allowedPaths,
  };
  const summary = JSON.stringify(lineage, null, 2);
  const digest = createHash("sha256").update(summary).digest("hex");
  const revalidate = async () => {
    await branchLease.assertOwned();
    const fresh = await inspectFitReview(github, workId);
    if (fresh.sha !== approved.sha || fresh.fitDigest !== approved.fitDigest || fresh.requestDigest !== approved.requestDigest || fresh.reviewId !== approved.reviewId || fresh.acceptedBy !== approved.acceptedBy || fresh.acceptedAt !== approved.acceptedAt || fresh.reviewUrl !== approved.reviewUrl) throw new WorkError("Fit approval or branch changed before trusted publication.");
    await branchLease.assertOwned();
  };
  const checkUrl = await github.publish({ name: "safi/fit", sha: approved.sha, conclusion: "success", title: "Human-reviewed Fit accepted", summary, evidenceId: `fit:${digest}` }, lease, revalidate);
  await revalidate();
  await lease.assertOwned();
  return { ...lineage, checkUrl, checkPublished: true, qualificationPublished: false, developerHandoffPrepared: false };
}
