import type { GitHub } from "../git/github.js";
import { fitDraftRecordSchema, requestSchema, shaSchema, workIdSchema } from "../contracts/index.js";
import { inspectCandidateFit } from "../work/candidate-fit.js";
import { inspectFitReview } from "../work/fit-review.js";
import { inspectRepair } from "../work/session-completion.js";
import { workRecords, WorkError } from "../work/records.js";
import type { WorkerRole } from "./options.js";

export type CandidateFit = Awaited<ReturnType<typeof inspectCandidateFit>>;
export type WorkTarget = { workId: string; branch: string; sha: string; pullRequest: number; createdAt: string; priority: number; fit?: CandidateFit; fitPresent: boolean };
export type RemoteCheck = Awaited<ReturnType<GitHub["checks"]>>[number];
export function latestChecks(checks: RemoteCheck[], sha: string, appId: number) {
  const latest = new Map<string, RemoteCheck>();
  for (const check of checks) {
    if (check.head_sha !== sha || check.app?.id !== appId) continue;
    if ((latest.get(check.name)?.id ?? -1) < check.id) latest.set(check.name, check);
  }
  return latest;
}
export function testReadiness(checks: Map<string, RemoteCheck>) {
  const names = ["safi/build", "safi/test", "safi/regression"];
  const failure = names.some(name => checks.get(name)?.status === "completed" && checks.get(name)?.conclusion === "failure");
  const passed = names.every(name => checks.get(name)?.status === "completed" && checks.get(name)?.conclusion === "success");
  return { failed: failure, passed, needsTest: !failure && !passed };
}
export async function discoverEligible(github: GitHub, appId: number, role: WorkerRole, signal?: AbortSignal) {
  const scope = { owner: github.owner, repo: github.repo };
  const pulls = [];
  for (let page = 1; page <= 11; page++) {
    signal?.throwIfAborted();
    const data = (await github.api.pulls.list({ ...scope, state: "open", per_page: 100, page })).data;
    if (page === 11 && data.length) throw new WorkError("Worker discovery exceeds 1000 open PRs.");
    pulls.push(...data);
    if (data.length < 100) break;
  }
  const matches = pulls.filter(pr => pr.head.repo?.full_name.toLowerCase() === `${github.owner}/${github.repo}`.toLowerCase() && pr.head.ref.startsWith("work/") && workIdSchema.safeParse(pr.head.ref.slice(5)).success);
  const targets: WorkTarget[] = [];
  for (const pr of matches) {
    signal?.throwIfAborted();
    const workId = pr.head.ref.slice(5), branch = pr.head.ref, sha = shaSchema.parse(pr.head.sha);
    if (matches.filter(other => other.head.ref === branch).length !== 1) continue;
    try {
      if (await github.head(branch) !== sha) continue;
      const read = await workRecords(github, sha, signal);
      const request = requestSchema.parse(await read(`changes/${workId}/request.json`, true));
      if (request.id !== workId) continue;
      const raw = await read(`changes/${workId}/fit.json`);
      const target: WorkTarget = { workId, branch, sha, pullRequest: pr.number, createdAt: pr.created_at, priority: request.priority ?? 0, fitPresent: raw !== undefined };
      if (role === "fitter") {
        if (raw === undefined) targets.push(target);
        else if (!pr.draft) {
          fitDraftRecordSchema.parse(raw);
          const checks = latestChecks(await github.checks(sha), sha, appId);
          if (checks.get("safi/fit")?.conclusion !== "success") {
            await inspectFitReview(github, workId);
            targets.push(target);
          }
        }
      } else if (!pr.draft && raw !== undefined) {
        target.fit = await inspectCandidateFit(github, workId, sha);
        const state = testReadiness(latestChecks(await github.checks(sha), sha, appId));
        if (role === "developer" && sha === target.fit.fitSha) targets.push(target);
        if (role === "tester" && sha !== target.fit.fitSha && state.needsTest) targets.push(target);
        if (role === "triager" && state.failed) {
          const checks = latestChecks(await github.checks(sha), sha, appId);
          if (checks.get("safi/triage")?.conclusion !== "success") targets.push(target);
        }
        if (role === "fixer" && state.failed) {
          await inspectRepair(github, workId, sha, target.fit.fit.allowedPaths);
          targets.push(target);
        }
      }
    } catch (error) {
      if (!(error instanceof WorkError) && !(error instanceof Error && error.name === "ZodError")) throw error;
      // Invalid or unreviewed work cannot grant readiness; unrelated valid work remains eligible.
    }
    if (targets.length >= 50) break;
  }
  return targets.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.workId.localeCompare(b.workId));
}

export async function claimNext<T>(targets: T[], claim: (target: T) => Promise<{ release(): Promise<unknown> } | null>) {
  for (const target of targets) {
    const lease = await claim(target);
    if (lease) return { target, lease };
  }
  return null;
}
