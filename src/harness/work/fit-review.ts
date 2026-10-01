import { createHash } from "node:crypto";
import type { GitHub } from "../git/github.js";
import { fitDraftRecordSchema, fitSchema, requestSchema, shaSchema, workIdSchema } from "../contracts/index.js";
import { issueSourceSchema, loadIssueRequest } from "../intake/issue.js";
import { IntakeError, intakePacket } from "../intake/index.js";
import { WorkError } from "./records.js";

const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
type ReviewDecision = { id?: number; user?: { login?: string | null; type?: string | null } | null; author_association: string; state?: string | null; commit_id?: string | null; submitted_at?: string | null; html_url?: string | null };
export function selectHumanFitApproval(reviews: ReviewDecision[], head: string, author?: string | null) {
  const decisions = new Map<string, ReviewDecision>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || review.user?.type !== "User" || !trustedAssociations.has(review.author_association) || login === author || !["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state ?? "") || !review.submitted_at || !Number.isFinite(Date.parse(review.submitted_at))) continue;
    const old = decisions.get(login);
    const time = Date.parse(review.submitted_at);
    const oldTime = Date.parse(old?.submitted_at ?? "");
    if (!old || time > oldTime || (time === oldTime && (review.id ?? 0) > (old.id ?? 0))) decisions.set(login, review);
  }
  if ([...decisions.values()].some(review => review.state === "CHANGES_REQUESTED")) throw new WorkError("A repository collaborator's latest review requests changes; the Fit is not accepted.");
  const approval = [...decisions.values()].filter(review => review.state === "APPROVED" && review.commit_id === head).sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!))[0];
  if (!approval?.user?.login || !approval.submitted_at) throw new WorkError("No non-author repository collaborator has approved the current Fit commit.");
  return approval;
}
export function assertFitOnlyCommit(compare: { status: string; ahead_by: number; merge_base_commit: { sha: string }; commits: { parents: { sha: string }[] }[]; files?: { filename: string }[] }, requestSha: string, head: string, workId: string) {
  if (compare.status !== "ahead" || compare.ahead_by !== 1 || compare.merge_base_commit.sha !== requestSha || compare.files?.length !== 1 || compare.files[0].filename !== `changes/${workId}/fit.json` || compare.commits.length !== 1 || !compare.commits[0].parents.some(parent => parent.sha === requestSha)) throw new WorkError("Fit review branch must contain exactly one Fit-only commit directly on the immutable request SHA.");
}
async function jsonBlob(github: GitHub, sha: string, path: string, required = true) {
  const { owner, repo } = github;
  const commit = (await github.api.git.getCommit({ owner, repo, commit_sha: shaSchema.parse(sha) })).data;
  const tree = (await github.api.git.getTree({ owner, repo, tree_sha: shaSchema.parse(commit.tree.sha), recursive: "1" })).data;
  if (tree.truncated) throw new WorkError("Review commit tree is truncated.");
  const entry = tree.tree.find(file => file.path === path);
  if (!entry && !required) return undefined;
  if (!entry || entry.mode !== "100644" || entry.type !== "blob" || !entry.sha || !shaSchema.safeParse(entry.sha).success || !Number.isSafeInteger(entry.size) || entry.size! > 65536) throw new WorkError("Required review input must be a bounded regular Git blob.");
  const blob = (await github.api.git.getBlob({ owner, repo, file_sha: entry.sha })).data;
  const normalized = blob.content.replace(/\r?\n/g, "");
  const bytes = Buffer.from(normalized, "base64");
  if (blob.sha !== entry.sha || blob.encoding !== "base64" || blob.size !== entry.size || bytes.length !== entry.size || bytes.toString("base64") !== normalized || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== entry.sha) throw new WorkError("Review input bytes do not match their Git blob identity.");
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new WorkError("Review input is not valid JSON."); }
  return { value, sha: entry.sha };
}

export async function inspectFitReview(github: GitHub, id: string) {
  const workId = workIdSchema.parse(id);
  const branch = `work/${workId}`;
  const { owner, repo } = github;
  const head = await github.head(branch);
  const pullRequests = (await github.api.pulls.list({ owner, repo, state: "open", head: `${owner}:${branch}`, per_page: 100 })).data;
  const matching = pullRequests.filter(pr => pr.head.ref === branch && pr.head.repo?.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase());
  if (matching.length !== 1) throw new WorkError("Human Fit review needs exactly one open same-repository work PR.");
  const pull = matching[0];
  if (pull.head.sha !== head || pull.draft) throw new WorkError("Work PR must be ready for review at the current branch head.");

  const requestRecord = await jsonBlob(github, head, `changes/${workId}/request.json`);
  const request = requestSchema.parse(requestRecord!.value);
  const packet = intakePacket(request);
  if (request.id !== workId) throw new WorkError("Request record identity does not match its work branch.");
  const fitRecord = await jsonBlob(github, head, `changes/${workId}/fit.json`);
  const draft = fitDraftRecordSchema.parse(fitRecord!.value);
  if (draft.workId !== workId) throw new WorkError("Fit draft identity does not match its work branch.");
  const historicRequest = await jsonBlob(github, draft.requestSha, `changes/${workId}/request.json`);
  if (historicRequest!.sha !== requestRecord!.sha || intakePacket(historicRequest!.value).digest !== packet.digest) throw new WorkError("Fit was not based on this immutable request record.");
  const compare = (await github.api.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${draft.requestSha}...${head}`, per_page: 100 })).data;
  assertFitOnlyCommit(compare, draft.requestSha, head, workId);
  const sourceRecord = await jsonBlob(github, head, `changes/${workId}/source.json`, false);
  let sourceCurrent: "manual" | "unchanged" | "changed";
  if (sourceRecord) {
    const source = issueSourceSchema.parse(sourceRecord.value);
    if (workId !== `issue-${source.number}` || source.repository !== `${owner}/${repo}`.toLowerCase()) throw new WorkError("Issue source does not match the Fit work identity.");
    try {
      const current = await loadIssueRequest(github, source.number);
      sourceCurrent = current.source.bodyDigest === source.bodyDigest && current.source.issueId === source.issueId && current.source.repository === source.repository && current.source.url === source.url && intakePacket(current.request).digest === packet.digest ? "unchanged" : "changed";
    } catch (error) {
      if (error instanceof IntakeError) sourceCurrent = "changed";
      else throw error;
    }
    if (sourceCurrent !== "unchanged") throw new WorkError("Original GitHub issue changed or closed; human review of updated requirements is required.");
  } else {
    if (workId.startsWith("issue-")) throw new WorkError("Issue-backed Fit is missing durable source provenance.");
    sourceCurrent = "manual";
  }

  const reviews = await github.api.paginate(github.api.pulls.listReviews, { owner, repo, pull_number: pull.number, per_page: 100 });
  const approval = selectHumanFitApproval(reviews, head, pull.user?.login);
  const acceptedBy = approval.user?.login;
  const submittedAt = approval.submitted_at;
  if (!acceptedBy || !submittedAt) throw new WorkError("Verified review identity/time is incomplete.");
  if (await github.head(branch) !== head) throw new WorkError("Work head advanced during Fit review inspection; retry from fresh GitHub state.");

  const acceptedFit = fitSchema.parse({ ...draft, acceptedBy, acceptedAt: new Date(submittedAt).toISOString(), provenance: "reviewed-human" });
  return {
    scope: "human-fit-review-inspection-only", workId, branch, sha: head, requestSha: draft.requestSha,
    requestDigest: packet.digest, fitDigest: createHash("sha256").update(JSON.stringify(draft)).digest("hex"),
    pullRequest: pull.number, reviewUrl: approval.html_url, acceptedBy, acceptedAt: acceptedFit.acceptedAt,
    provenance: "reviewed-human", sourceCurrent, allowedPaths: acceptedFit.allowedPaths,
    humanFitReview: "verified", developerHandoffPrepared: false, checkPublished: false, qualificationPublished: false,
  };
}
