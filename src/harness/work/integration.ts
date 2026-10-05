import { createHash } from "node:crypto";
import { z } from "zod";
import type { GitHub } from "../git/github.js";
import type { Lease } from "../coordination/lease.js";
import { workIdSchema } from "../contracts/index.js";
import { inspectCandidateFit } from "./candidate-fit.js";
import { latestChecks } from "../workers/discovery.js";
import { WorkError } from "./records.js";

const required = ["safi/fit", "safi/build", "safi/test", "safi/regression"];
export function assertMergeRules(input: unknown, appId: number) {
  const rules = z.array(z.object({ type: z.string(), parameters: z.unknown().optional() }).passthrough()).parse(input);
  if (!rules.some(rule => rule.type === "merge_queue")) throw new WorkError("Protected main requires an active native GitHub merge-queue rule; no settings were changed.");
  const status = rules.find(rule => rule.type === "required_status_checks");
  const parameters = z.object({ strict_required_status_checks_policy: z.boolean(), required_status_checks: z.array(z.object({ context: z.string(), integration_id: z.number().nullable().optional() })) }).parse(status?.parameters);
  if (!parameters.strict_required_status_checks_policy || !required.every(name => parameters.required_status_checks.some(check => check.context === name && check.integration_id === appId))) throw new WorkError("Main must strictly require all four exact-SHA SAFI checks from the verified App.");
  return { nativeMergeQueue: true, requiredChecks: required, protectionChanged: false };
}
export async function inspectQualification(github: GitHub, workId: string) {
  workIdSchema.parse(workId);
  const sha = await github.head(`work/${workId}`);
  const fit = await inspectCandidateFit(github, workId, sha);
  if (sha === fit.fitSha) throw new WorkError("Fit-only commit is not an implementation candidate.");
  const authority = await github.assertWriteAuthority({ async assertOwned() {} });
  const checks = latestChecks(await github.checks(sha), sha, authority.appId);
  if (!required.every(name => checks.get(name)?.status === "completed" && checks.get(name)?.conclusion === "success")) throw new WorkError("Exact candidate does not have all mandatory successful checks.");
  let common: string | undefined;
  for (const name of ["safi/build", "safi/test", "safi/regression"]) {
    const check = checks.get(name)!;
    const summary = check.output.summary;
    if (!summary || summary.length > 60000 || check.external_id !== `runner:${createHash("sha256").update(summary).digest("hex")}:${name.slice(5)}` || (common !== undefined && common !== summary)) throw new WorkError("Qualification requires matching real runner provenance for all mandatory execution checks.");
    common = summary;
  }
  const execution = z.object({ version: z.literal(1), workId: z.literal(workId), branch: z.literal(`work/${workId}`), sha: z.literal(sha), fitSha: z.literal(fit.fitSha), fitDigest: z.literal(fit.lineage.fitDigest), build: z.literal("passed"), browser: z.literal("passed"), cleanupFailures: z.array(z.string()).length(0), artifactDigest: z.string().regex(/^[a-f0-9]{64}$/), coverage: z.array(z.object({ id: z.string(), test: z.string(), covered: z.literal(true) })), runner: z.object({ controlSha: z.string().regex(/^[a-f0-9]{40}$/), controlDigest: z.string().regex(/^[a-f0-9]{64}$/), testDigest: z.string().regex(/^[a-f0-9]{64}$/), dependencyDigest: z.string().regex(/^[a-f0-9]{64}$/), imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/), baseImage: z.string() }), browserSummary: z.object({ complete: z.literal(true) }) }).passthrough().parse(JSON.parse(common!));
  if (execution.coverage.length !== fit.fit.acceptance.length || !fit.fit.acceptance.every(item => execution.coverage.some(c => c.id === item.id && c.test === item.test))) throw new WorkError("Qualification coverage does not match every accepted assertion.");
  const fitCheck = checks.get("safi/fit")!;
  const fitSummary = JSON.stringify(fit.lineage, null, 2);
  if (fitCheck.output.summary !== fitSummary || fitCheck.external_id !== `fit:${createHash("sha256").update(fitSummary).digest("hex")}`) throw new WorkError("Exact candidate Fit check has invalid review lineage.");
  if (await github.head(`work/${workId}`) !== sha) throw new WorkError("Qualified head advanced; re-test the new candidate.");
  return { workId, branch: `work/${workId}`, sha, fit, checkUrls: required.map(name => checks.get(name)!.html_url), execution };
}
export async function inspectIntegration(github: GitHub, workId: string) {
  const qualified = await inspectQualification(github, workId);
  const identity = await github.assertWriteAuthority({ async assertOwned() {} });
  const response = await github.api.request("GET /repos/{owner}/{repo}/rules/branches/{branch}", { owner: github.owner, repo: github.repo, branch: "main" });
  const protection = assertMergeRules(response.data, identity.appId);
  const pull = (await github.api.pulls.get({ owner: github.owner, repo: github.repo, pull_number: qualified.fit.lineage.pullRequest })).data;
  if (pull.state !== "open" || pull.draft || pull.base.ref !== "main" || pull.head.ref !== qualified.branch || pull.head.sha !== qualified.sha || pull.head.repo?.full_name.toLowerCase() !== `${github.owner}/${github.repo}`.toLowerCase()) throw new WorkError("Integration requires the current same-repository non-draft PR targeting main.");
  return { ...qualified, protection, pullRequest: pull.number, nodeId: pull.node_id, url: pull.html_url, mainSha: await github.head("main"), releaseQualified: false };
}
export async function enqueueIntegration(github: GitHub, workId: string, lease: Lease) {
  const inspected = await inspectIntegration(github, workId);
  await github.assertWriteAuthority(lease);
  const fresh = await inspectIntegration(github, workId);
  if (fresh.sha !== inspected.sha || fresh.nodeId !== inspected.nodeId) throw new WorkError("PR advanced before merge-queue enrollment.");
  await github.assertWriteAuthority(lease);
  const response = await github.api.request("POST /graphql", {
    query: "mutation($id:ID!,$sha:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$sha}){mergeQueueEntry{id}}}",
    variables: { id: inspected.nodeId, sha: inspected.sha },
  });
  const body = z.object({ errors: z.array(z.unknown()).optional(), data: z.object({ enqueuePullRequest: z.object({ mergeQueueEntry: z.object({ id: z.string().min(1) }) }).nullable() }).optional() }).parse(response.data);
  if (body.errors?.length || !body.data?.enqueuePullRequest) throw new WorkError("Queue enrollment was not confirmed; inspect native GitHub queue before retrying.");
  return { workId, sha: inspected.sha, pullRequest: inspected.pullRequest, queueEntry: body.data.enqueuePullRequest.mergeQueueEntry.id, state: "enqueued-not-merged", releaseQualified: false, protectionChanged: false };
}
