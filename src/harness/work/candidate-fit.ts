import { createHash } from "node:crypto";
import { z } from "zod";
import type { GitHub } from "../git/github.js";
import { applicationPathSchema, fitDraftRecordSchema, fitSchema, shaSchema, workIdSchema } from "../contracts/index.js";
import { fitPacket } from "./fit-write.js";
import { inspectFitReview, jsonBlob } from "./fit-review.js";
import { WorkError } from "./records.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const fitLineageSchema = z.object({
  version: z.literal(1), workId: workIdSchema, branch: z.string(), fitSha: shaSchema,
  requestSha: shaSchema, requestDigest: digest, fitDigest: digest,
  pullRequest: z.number().int().positive(), reviewId: z.number().int().positive(), reviewUrl: z.string().url(),
  acceptedBy: z.string().min(1), acceptedAt: z.string().datetime(), provenance: z.literal("reviewed-human"),
  sourceCurrent: z.enum(["manual", "unchanged"]), allowedPaths: z.array(applicationPathSchema).min(1).max(30),
}).strict();

export async function remoteTree(github: GitHub, sha: string) {
  const scope = { owner: github.owner, repo: github.repo };
  const commit = (await github.api.git.getCommit({ ...scope, commit_sha: shaSchema.parse(sha) })).data;
  if (commit.sha !== sha) throw new WorkError("Remote commit identity mismatch.");
  const tree = (await github.api.git.getTree({ ...scope, tree_sha: shaSchema.parse(commit.tree.sha), recursive: "1" })).data;
  if (tree.truncated || tree.tree.length > 5000) throw new WorkError("Candidate tree is incomplete or oversized.");
  const entries = new Map<string, { mode: string; sha: string; size?: number }>();
  for (const entry of tree.tree) {
    if (entry.type === "tree") continue;
    if (!entry.path || !entry.mode || !entry.sha || entries.has(entry.path)) throw new WorkError("Malformed remote tree.");
    entries.set(entry.path, { mode: entry.mode, sha: shaSchema.parse(entry.sha), size: entry.size });
  }
  return entries;
}
export function assertApplicationTrees(base: Awaited<ReturnType<typeof remoteTree>>, candidate: Awaited<ReturnType<typeof remoteTree>>, allowedPaths: string[], requireDiff = true) {
  const allowed = z.array(applicationPathSchema).min(1).max(30).parse(allowedPaths);
  const changed: string[] = [];
  for (const path of new Set([...base.keys(), ...candidate.keys()])) {
    const before = base.get(path), after = candidate.get(path);
    if (before?.sha === after?.sha && before?.mode === after?.mode) continue;
    if (!allowed.includes(path) || (before && before.mode !== "100644") || (after && after.mode !== "100644")) throw new WorkError("Candidate changed protected or unauthorized Git entries.");
    changed.push(path);
  }
  if (requireDiff && !changed.length) throw new WorkError("A new implementation candidate must change permitted application files.");
  return changed;
}

export async function inspectCandidateFit(github: GitHub, workId: string, expectedSha: string) {
  workIdSchema.parse(workId); shaSchema.parse(expectedSha);
  const branch = `work/${workId}`;
  if (await github.head(branch) !== expectedSha) throw new WorkError("Candidate is stale; rediscover current work.");
  const record = fitDraftRecordSchema.parse((await jsonBlob(github, expectedSha, `changes/${workId}/fit.json`))!.value);
  if (record.workId !== workId) throw new WorkError("Fit does not match candidate work identity.");
  const scope = { owner: github.owner, repo: github.repo };
  const compare = (await github.api.repos.compareCommitsWithBasehead({ ...scope, basehead: `${record.requestSha}...${expectedSha}`, per_page: 100 })).data;
  if (compare.status !== "ahead" || compare.merge_base_commit.sha !== record.requestSha || compare.ahead_by < 1 || compare.ahead_by > 51 || compare.commits.length !== compare.ahead_by) throw new WorkError("Candidate lineage is not a bounded descendant of its request.");
  const fitSha = shaSchema.parse(compare.commits[0].sha);
  const review = await inspectFitReview(github, workId, fitSha);
  const authority = await github.assertWriteAuthority({ async assertOwned() {} });
  const checks = (await github.checks(fitSha)).filter(check => check.app?.id === authority.appId && check.name === "safi/fit").sort((a, b) => b.id - a.id);
  const check = checks[0];
  if (!check || check.status !== "completed" || check.conclusion !== "success" || !check.output.summary || check.output.summary.length > 60000) throw new WorkError("Candidate requires trusted accepted-Fit publication.");
  let raw: unknown;
  try { raw = JSON.parse(check.output.summary); } catch { throw new WorkError("Accepted-Fit evidence is malformed."); }
  const lineage = fitLineageSchema.parse(raw);
  const identity = createHash("sha256").update(check.output.summary).digest("hex");
  if (check.external_id !== `fit:${identity}` || lineage.workId !== workId || lineage.branch !== branch || lineage.fitSha !== fitSha || lineage.requestSha !== record.requestSha || lineage.fitDigest !== fitPacket(record).digest || lineage.fitDigest !== review.fitDigest || lineage.requestDigest !== review.requestDigest || lineage.reviewId !== review.reviewId || lineage.reviewUrl !== review.reviewUrl || lineage.pullRequest !== review.pullRequest || lineage.acceptedBy !== review.acceptedBy || lineage.acceptedAt !== review.acceptedAt || JSON.stringify(lineage.allowedPaths) !== JSON.stringify(record.allowedPaths)) throw new WorkError("Accepted-Fit check does not match fresh human review lineage.");
  const fit = fitSchema.parse({ ...record, acceptedBy: review.acceptedBy, acceptedAt: review.acceptedAt, provenance: "reviewed-human" });
  const baseline = await remoteTree(github, fitSha);
  let parent = record.requestSha;
  for (const commit of compare.commits) {
    if (commit.parents.length !== 1 || commit.parents[0].sha !== parent) throw new WorkError("Candidate lineage must be linear without unreviewed merges.");
    if (commit.sha !== fitSha) assertApplicationTrees(baseline, await remoteTree(github, commit.sha), fit.allowedPaths);
    parent = commit.sha;
  }
  if (parent !== expectedSha || await github.head(branch) !== expectedSha) throw new WorkError("Candidate changed during lineage inspection.");
  return { fit, lineage, fitCheckUrl: check.html_url, sha: expectedSha, fitSha };
}
