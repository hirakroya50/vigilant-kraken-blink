import { diagnosisSchema, fitSchema, workIdSchema } from "../contracts/index.js";
import type { GitHub } from "../git/github.js";
import { intakePacket } from "../intake/index.js";
import { issueSourceSchema, loadIssueRequest, sourceContent } from "../intake/issue.js";
import { workRecords, WorkError } from "./records.js";

export type WorkObservation = {
  branch: string; sha?: string; workId?: string; requestDigest?: string; title?: string;
  pullRequest?: number; url?: string; draft?: boolean;
  status: "observed" | "orphan" | "closed" | "blocked";
  source?: "manual" | "github-issue"; sourceCurrent?: "unchanged" | "changed" | "unverified";
  fit?: "missing" | "present-unverified"; diagnosis?: "missing" | "present-unverified" | "stale";
  checks?: { id: number; name: string; status: string; conclusion: string | null }[];
  qualified: false; reason: string;
};
export function validateWorkBranch(branch: string) {
  if (!branch.startsWith("work/") || !workIdSchema.safeParse(branch.slice(5)).success) throw new WorkError("Invalid or oversized work branch identity.");
}
function pauseForProvider(error: unknown) {
  const status = Number((error as { status?: number } | null)?.status);
  const code = (error as { code?: string } | null)?.code;
  return [401, 403, 429].includes(status) || (status >= 500 && status <= 599) || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(code ?? "");
}
export async function reconcileOnce(github: GitHub, trustedAppId: number, after?: string, signal?: AbortSignal) {
  if (!Number.isSafeInteger(trustedAppId) || trustedAppId < 1) throw new WorkError("Verified App identity is required for check observations.");
  if (after) validateWorkBranch(after);
  const scope = { owner: github.owner, repo: github.repo };
  const branches: string[] = [];
  let branchComplete = false;
  for (let page = 1; page <= 11; page++) {
    signal?.throwIfAborted();
    const data = (await github.api.repos.listBranches({ ...scope, per_page: 100, page })).data;
    if (page === 11 && data.length) throw new WorkError("Repository exceeds the 1000-branch reconciliation limit.");
    branches.push(...data.map(branch => branch.name).filter(branch => branch.startsWith("work/")));
    if (data.length < 100) { branchComplete = true; break; }
  }
  if (!branchComplete) throw new WorkError("Branch enumeration was incomplete.");
  const pulls: { number: number; branch: string; sha: string; url: string; draft: boolean }[] = [];
  let pullComplete = false;
  for (let page = 1; page <= 11; page++) {
    signal?.throwIfAborted();
    const data = (await github.api.pulls.list({ ...scope, state: "open", per_page: 100, page })).data;
    if (page === 11 && data.length) throw new WorkError("Repository exceeds the 1000-open-PR reconciliation limit.");
    pulls.push(...data.filter(pr => pr.head.repo?.full_name.toLowerCase() === `${github.owner}/${github.repo}`.toLowerCase() && pr.head.ref.startsWith("work/")).map(pr => ({ number: pr.number, branch: pr.head.ref, sha: pr.head.sha, url: pr.html_url, draft: pr.draft ?? false })));
    if (data.length < 100) { pullComplete = true; break; }
  }
  if (!pullComplete) throw new WorkError("PR enumeration was incomplete.");
  const names = [...new Set([...branches, ...pulls.map(pr => pr.branch)])].sort().filter(branch => !after || branch > after);
  const selected = names.slice(0, 50);
  const observations: WorkObservation[] = [];
  for (const branch of selected) {
    signal?.throwIfAborted();
    let sha: string | undefined;
    try {
      validateWorkBranch(branch);
      const matches = pulls.filter(pr => pr.branch === branch);
      if (matches.length > 1) throw new WorkError("Multiple open PRs share this branch; lineage review is required.");
      let pull = matches[0];
      let closed = false;
      if (!pull) {
        const history = (await github.api.pulls.list({ ...scope, state: "all", head: `${github.owner}:${branch}`, per_page: 100 })).data;
        if (history.length >= 100) throw new WorkError("PR history exceeds the bounded lineage lookup.");
        const relevant = history.filter(pr => pr.head.repo?.full_name.toLowerCase() === `${github.owner}/${github.repo}`.toLowerCase() && pr.head.ref === branch);
        if (relevant.length > 1) throw new WorkError("PR history is ambiguous; no work was reopened.");
        if (relevant[0]) {
          const previous = relevant[0];
          pull = { number: previous.number, branch, sha: previous.head.sha, url: previous.html_url, draft: previous.draft ?? false };
          closed = previous.state === "closed";
        }
      }
      signal?.throwIfAborted();
      sha = await github.head(branch);
      if (pull && pull.sha !== sha) throw new WorkError("PR and branch heads disagree; retry fresh reconciliation.");
      const read = await workRecords(github, sha, signal);
      const workId = branch.slice(5);
      const packet = intakePacket(await read(`changes/${workId}/request.json`, true));
      if (packet.request.id !== workId) throw new WorkError("Request record does not match its work branch.");
      const capturedSource = await read(`changes/${workId}/source.json`);
      let source: "manual" | "github-issue" = "manual";
      let sourceCurrent: WorkObservation["sourceCurrent"];
      if (capturedSource !== undefined) {
        const origin = issueSourceSchema.parse(capturedSource);
        if (workId !== `issue-${origin.number}` || origin.repository !== `${github.owner}/${github.repo}`.toLowerCase() || origin.url !== `https://github.com/${origin.repository}/issues/${origin.number}`) throw new WorkError("Issue source identity does not match the work branch.");
        source = "github-issue";
        try {
          const current = await loadIssueRequest(github, origin.number);
          sourceCurrent = sourceContent(current.source) === sourceContent(origin) && intakePacket(current.request).digest === packet.digest ? "unchanged" : "changed";
        } catch (error) {
          if (pauseForProvider(error) || signal?.aborted) throw error;
          sourceCurrent = "unverified";
        }
      } else if (workId.startsWith("issue-")) throw new WorkError("Issue work has no captured source provenance.");
      const fitRecord = await read(`changes/${workId}/fit.json`);
      const fit = fitRecord === undefined ? undefined : fitSchema.parse(fitRecord);
      if (fit && fit.workId !== workId) throw new WorkError("Fit identity does not match the work branch.");
      const diagnosisRecord = await read(`changes/${workId}/diagnosis.json`);
      const diagnosis = diagnosisRecord === undefined ? undefined : diagnosisSchema.parse(diagnosisRecord);
      if (diagnosis && diagnosis.workId !== workId) throw new WorkError("Diagnosis identity does not match the work branch.");
      signal?.throwIfAborted();
      const checks = (await github.checks(sha)).filter(check => check.app?.id === trustedAppId && /^safi\/[a-z-]+$/.test(check.name)).map(check => ({ id: check.id, name: check.name, status: check.status, conclusion: check.conclusion }));
      signal?.throwIfAborted();
      if (await github.head(branch) !== sha) throw new WorkError("Work head advanced during reconstruction; no eligibility was granted.");
      observations.push({ branch, sha, workId, requestDigest: packet.digest, title: packet.request.title, pullRequest: pull?.number, url: pull?.url, draft: pull?.draft, status: closed ? "closed" : pull ? "observed" : "orphan", source, sourceCurrent, fit: fit ? "present-unverified" : "missing", diagnosis: !diagnosis ? "missing" : diagnosis.failedSha === sha ? "present-unverified" : "stale", checks, qualified: false, reason: closed ? "Closed PR history preserved; work was not reopened or qualified." : pull ? "GitHub snapshot observed; human reviews, accepted-Fit lineage, sessions and execution provenance are not yet verified. Check names alone do not grant role readiness." : "Work branch/request exists without PR history. Replay the original intake packet under a lease to reconcile; discovery itself never creates a PR." });
    } catch (error) {
      if (pauseForProvider(error) || signal?.aborted) throw error;
      observations.push({ branch, sha, status: "blocked", qualified: false, reason: error instanceof WorkError ? error.message : "Work reconstruction failed; verify record schema, App access and remote availability. No eligibility was granted." });
    }
  }
  return { scope: "read-only-GitHub-reconciliation", timestamp: new Date().toISOString(), qualificationPublished: false, roleEligibilityVerified: false, nextAfter: names.length > selected.length ? selected.at(-1) : undefined, observations };
}
