import { createHash, randomUUID } from "node:crypto";
import { join, basename } from "node:path";
import { writeFile } from "node:fs/promises";
import type { GitHub } from "../git/github.js";
import type { Lease } from "../coordination/lease.js";
import type { Configuration } from "../config/index.js";
import { requestSchema, diagnosisSchema, fitDraftRecordSchema } from "../contracts/index.js";
import { OpenAIAdapter, type Proposal } from "../ai/openai.js";
import { fitDraftSchema, diagnosisDraftSchema } from "../ai/contracts.js";
import { readSnapshot } from "../testing/snapshot.js";
import { readRunnerRecord } from "../testing/prepare.js";
import { runProtected } from "../testing/run.js";
import { inspectCandidateFit } from "../work/candidate-fit.js";
import { commitFitDraft, publishReviewedFit } from "../work/fit-write.js";
import { workRecords, WorkError } from "../work/records.js";
import { latestChecks, type WorkTarget, type RemoteCheck } from "./discovery.js";
import { createSessionDirectory, waitDiagnosisReview } from "./local-session.js";
import type { WorkerOptions, WorkerRole } from "./options.js";
import type { RunnerRecord } from "../testing/docker.js";
import { failureContext } from "./failure-context.js";

export type RoleContext = {
  github: GitHub; config: Configuration; repository: string; appId: number; role: WorkerRole;
  target: WorkTarget; lease: Lease; signal: AbortSignal; options: WorkerOptions; ai?: OpenAIAdapter;
  assertActive(): Promise<void>;
  log(action: string, result: string, extra?: Record<string, unknown>): void;
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function revalidate(ctx: RoleContext) {
  ctx.signal.throwIfAborted(); await ctx.assertActive();
  if (await ctx.github.head(ctx.target.branch) !== ctx.target.sha) throw new WorkError("Work head changed; stale role publication blocked.");
  if (ctx.target.fit) {
    const fit = await inspectCandidateFit(ctx.github, ctx.target.workId, ctx.target.sha);
    if (fit.lineage.fitDigest !== ctx.target.fit.lineage.fitDigest || fit.fitSha !== ctx.target.fit.fitSha) throw new WorkError("Accepted Fit changed during role work.");
  }
  ctx.signal.throwIfAborted(); await ctx.assertActive();
}
async function applicationContext(ctx: RoleContext, paths: string[]) {
  const files = await readSnapshot(ctx.repository, ctx.target.sha);
  const source = files.filter(file => paths.includes(file.path)).map(file => {
    if (file.mode !== "100644" || file.data.length > 18000) throw new WorkError("AI source exceeds permitted regular-file context bounds.");
    return { path: file.path, content: file.data.toString("utf8") };
  });
  if (!source.length) throw new WorkError("AI work requires at least one existing permitted application source file.");
  return { source, snapshot: files };
}
export async function runFitter(ctx: RoleContext) {
  await revalidate(ctx);
  if (ctx.target.fitPresent) {
    const result = await publishReviewedFit(ctx.github, ctx.target.workId, ctx.lease, { assertOwned: ctx.assertActive });
    return { status: "completed", ...result };
  }
  if (!ctx.ai) throw new WorkError("Fitter requires a cost-consented AI adapter.");
  const read = await workRecords(ctx.github, ctx.target.sha);
  const request = requestSchema.parse(await read(`changes/${ctx.target.workId}/request.json`, true));
  const context = await applicationContext(ctx, ctx.options.paths);
  const protectedTests = context.snapshot.filter(file => /^src\/tests\/browser\/.+\.spec\.ts$/.test(file.path)).flatMap(file => [...file.data.toString("utf8").matchAll(/\btest\("([^"\n]+)"/g)].map(match => `${file.path.split("/").at(-1)}::${match[1]}`)).slice(0, 200);
  const proposal = await ctx.ai.propose({ kind: "fit", candidateSha: ctx.target.sha, request, permittedPaths: ctx.options.paths, files: context.source, protectedTests });
  await revalidate(ctx);
  const draft = fitDraftSchema.parse(proposal.draft);
  if (draft.acceptance.length !== request.acceptance.length) throw new WorkError("Fit must retain one reviewed assertion for every original acceptance criterion.");
  const record = fitDraftRecordSchema.parse({
    version: 1, workId: ctx.target.workId, requestSha: ctx.target.sha, ...draft,
    goal: request.goal ?? request.description, protected: request.protected ?? [], out_of_scope: request.out_of_scope ?? [],
    constraints: ["Only accepted application paths may change", "Protected tests and control must not be weakened"], dependencies: [],
  });
  const directory = await createSessionDirectory(ctx.repository);
  await writeFile(join(directory, "proposal.json"), JSON.stringify({ ...proposal, sourceVerification: "exact-local-git-sha", record }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  const result = await commitFitDraft(ctx.github, record, { assertOwned: ctx.assertActive });
  ctx.log("fit-draft", "awaiting-independent-github-review", { directory, fitSha: result.sha, pullRequest: result.pullRequest });
  return { status: "needs-human-review", ...result, directory, instructions: "Mark the draft PR ready for review in GitHub. A non-author repository collaborator must approve the Fit-only commit; subsequent Fitter discovery publishes accepted Fit. Set each acceptance.test to a protected '<file.spec.ts>::<exact test title>' mapping before approving. New acceptance requires separately reviewed protected tests/control." };
}

export function fitCoverage(acceptance: { id: string; test: string }[], passedTests: Record<string, string[]>) {
  return acceptance.map(item => ({ id: item.id, test: item.test, covered: ["desktop-chromium", "mobile-chromium"].every(project => passedTests[project]?.includes(item.test)) }));
}
export function testingEvidence(result: Awaited<ReturnType<typeof runProtected>>, target: WorkTarget, record: RunnerRecord) {
  if (!target.fit || result.candidateSha !== target.sha || result.controlSha !== record.controlSha || result.controlDigest !== record.controlDigest || result.testDigest !== record.testDigest || result.dependencyDigest !== record.dependencyDigest || result.imageId !== record.imageId || result.baseImage !== record.baseImage) throw new WorkError("Runner result does not match the claimed candidate and approved control.");
  const coverage = fitCoverage(target.fit.fit.acceptance, result.browserSummary?.passedTests ?? {});
  const complete = coverage.length > 0 && coverage.every(item => item.covered);
  const cleanup = result.cleanupFailures.length === 0;
  const summary = JSON.stringify({ version: 1, workId: target.workId, branch: target.branch, sha: target.sha, fitSha: target.fit.fitSha, fitDigest: target.fit.lineage.fitDigest, runner: { controlSha: result.controlSha, controlDigest: result.controlDigest, testDigest: result.testDigest, dependencyDigest: result.dependencyDigest, imageId: result.imageId, baseImage: result.baseImage }, build: result.build, browser: result.browser, browserSummary: result.browserSummary, coverage, artifactDigest: result.artifactDigest, artifactFileCount: result.artifactFiles.length, evidenceFileCount: result.evidence.length, manifestDigest: digest(JSON.stringify(result)), cleanupFailures: result.cleanupFailures, startedAt: result.startedAt, completedAt: result.completedAt, localEvidenceDirectory: `.safi/runs/${basename(result.directory)}`, releaseQualified: false }, null, 2);
  if (summary.length > 60000) throw new WorkError("Runner check summary exceeds publication bounds; private manifest is preserved.");
  const conclusions = {
    "safi/build": cleanup && result.build === "passed" ? "success" : "failure",
    "safi/test": cleanup && result.browser === "passed" && complete ? "success" : result.browser === "passed" && !complete ? "neutral" : "failure",
    "safi/regression": cleanup && result.browser === "passed" ? "success" : "failure",
  } as const;
  return { summary, conclusions, digest: digest(summary), coverageComplete: complete };
}
export async function runTester(ctx: RoleContext) {
  if (!ctx.options.runner || !ctx.target.fit) throw new WorkError("Tester needs accepted Fit and reviewed runner record.");
  await revalidate(ctx);
  const record = await readRunnerRecord(ctx.options.runner);
  const result = await runProtected(ctx.repository, ctx.target.sha, record, ctx.signal);
  await revalidate(ctx);
  const evidence = testingEvidence(result, ctx.target, record);
  const lineage = JSON.stringify(ctx.target.fit.lineage, null, 2);
  const urls: (string | null)[] = [];
  // Fit is re-earned on this exact candidate through fresh immutable-lineage verification, not test inheritance.
  urls.push(await ctx.github.publish({ name: "safi/fit", sha: ctx.target.sha, conclusion: "success", title: "Accepted Fit lineage verified on exact candidate", summary: lineage, evidenceId: `fit:${digest(lineage)}` }, ctx.lease, () => revalidate(ctx)));
  for (const name of ["safi/build", "safi/test", "safi/regression"] as const) {
    urls.push(await ctx.github.publish({ name, sha: ctx.target.sha, conclusion: evidence.conclusions[name], title: name === "safi/test" && !evidence.coverageComplete ? "Acceptance test mapping incomplete; not qualified" : `${name}: real protected execution`, summary: evidence.summary, evidenceId: `runner:${evidence.digest}:${name.slice(5)}` }, ctx.lease, () => revalidate(ctx)));
  }
  return { status: result.status === "passed" && evidence.coverageComplete ? "completed" : "not-qualified", sha: ctx.target.sha, checkUrls: urls, directory: result.directory, coverageComplete: evidence.coverageComplete, testsPassed: result.browser === "passed", implementationModified: false };
}

function failures(checks: Map<string, RemoteCheck>) {
  return ["safi/build", "safi/test", "safi/regression"].map(name => checks.get(name)).filter((check): check is RemoteCheck => !!check && check.status === "completed" && check.conclusion === "failure" && !!check.html_url && !!check.output.summary);
}
export function reviewedDiagnosis(proposal: Proposal, workId: string, sha: string, checkUrls: string[]) {
  if (proposal.kind !== "diagnosis" || proposal.workId !== workId || proposal.candidateSha !== sha) throw new WorkError("Diagnosis proposal identity mismatch.");
  return diagnosisSchema.parse({ version: 1, workId, failedSha: sha, provenance: "ai-reviewed", failureCheckUrls: checkUrls, ...diagnosisDraftSchema.parse(proposal.draft) });
}
export async function runTriager(ctx: RoleContext) {
  if (!ctx.ai || !ctx.target.fit) throw new WorkError("Triager needs a cost-consented AI adapter and accepted Fit.");
  await revalidate(ctx);
  const failed = failures(latestChecks(await ctx.github.checks(ctx.target.sha), ctx.target.sha, ctx.appId));
  if (!failed.length) throw new WorkError("No trusted exact-SHA failure evidence available.");
  const context = await applicationContext(ctx, ctx.target.fit.fit.allowedPaths);
  const { git } = await import("../git/worktrees.js");
  const parent = await git(ctx.repository, ["rev-parse", `${ctx.target.sha}^`]);
  const diff = await git(ctx.repository, ["diff", "--no-ext-diff", "--no-textconv", parent, ctx.target.sha, "--", ...ctx.target.fit.fit.allowedPaths]);
  const failureInputs = await Promise.all(failed.map(async check => ({ checkUrl: check.html_url!, summary: await failureContext(ctx.repository, ctx.target.sha, check.output.summary!) })));
  const proposal = await ctx.ai.propose({ kind: "diagnosis", workId: ctx.target.workId, candidateSha: ctx.target.sha, fit: ctx.target.fit.fit, permittedPaths: ctx.target.fit.fit.allowedPaths, files: context.source, failures: failureInputs, diff: diff.slice(0, 18000) });
  await revalidate(ctx);
  const diagnosis = reviewedDiagnosis(proposal, ctx.target.workId, ctx.target.sha, failed.map(check => check.html_url!));
  const summary = JSON.stringify(diagnosis, null, 2);
  const directory = await createSessionDirectory(ctx.repository);
  const sessionId = randomUUID(), identity = digest(summary), deadline = Date.now() + ctx.options.sessionMinutes * 60000;
  const review = { version: 1, sessionId, workId: ctx.target.workId, sha: ctx.target.sha, digest: identity, deadline: new Date(deadline).toISOString(), diagnosis, proposal, operatorBoundary: "same-os-user-local-human" };
  await writeFile(join(directory, "diagnosis.json"), JSON.stringify(review, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  ctx.log("diagnosis-draft", "waiting-human", { directory, sessionId, digest: identity, deadline: review.deadline });
  if (!await waitDiagnosisReview(ctx, directory, sessionId, identity, deadline)) return { status: "cancelled", implementationModified: false, directory };
  const currentFailures = async () => {
    await revalidate(ctx);
    const fresh = failures(latestChecks(await ctx.github.checks(ctx.target.sha), ctx.target.sha, ctx.appId));
    if (JSON.stringify(fresh.map(check => ({ id: check.id, url: check.html_url, summary: check.output.summary }))) !== JSON.stringify(failed.map(check => ({ id: check.id, url: check.html_url, summary: check.output.summary })))) throw new WorkError("Failure evidence changed during diagnosis review.");
  };
  const checkUrl = await ctx.github.publish({ name: "safi/triage", sha: ctx.target.sha, conclusion: "success", title: "Human-reviewed read-only diagnosis; not a test pass", summary, evidenceId: `triage:${identity}` }, ctx.lease, currentFailures);
  await writeFile(join(directory, "completion.json"), JSON.stringify({ sha: ctx.target.sha, checkUrl, digest: identity, reviewed: true, operatorBoundary: review.operatorBoundary, implementationModified: false }) + "\n", { mode: 0o600, flag: "wx" });
  return { status: "completed", sha: ctx.target.sha, checkUrl, directory, implementationModified: false, testsPassed: false };
}
