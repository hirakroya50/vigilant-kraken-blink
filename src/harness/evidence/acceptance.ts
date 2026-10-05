import { evidenceSchema, shaSchema, workIdSchema } from "../contracts/index.js";
import { stageACases } from "./registry.js";
import { z } from "zod";

const activeCaseSet = new Set<number>(stageACases);
const passedInputSchema = z.object({
  caseId: z.number().int().refine(value => activeCaseSet.has(value), "Only active Stage A cases can pass."),
  acceptanceRunId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  timestamp: z.string().datetime(),
  workId: workIdSchema,
  branch: z.string().regex(/^work\/[a-z0-9][a-z0-9-]{0,63}$/),
  sha: shaSchema,
  workers: z.array(z.string().min(1)).min(1).max(50),
  sessionIds: z.array(z.string().min(1)).min(1).max(50),
  checkUrls: z.array(z.string().url()).min(1),
  logs: z.array(z.string().min(1)).min(1),
  artifacts: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  observedResult: z.string().min(1),
  failureRecovery: z.array(z.string().min(1)).default([]),
  leaseEvents: z.array(z.string().min(1)).default([]),
  runner: z.object({ controlSha: shaSchema, controlDigest: z.string().regex(/^[a-f0-9]{64}$/), testDigest: z.string().regex(/^[a-f0-9]{64}$/), dependencyDigest: z.string().regex(/^[a-f0-9]{64}$/), imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict().optional(),
}).strict();
export type PassedAcceptanceEvidence = z.infer<typeof passedInputSchema> & { status: "passed" };

export function buildPassedEvidence(input: unknown): PassedAcceptanceEvidence {
  const parsed = passedInputSchema.parse(input);
  return evidenceSchema.parse({ ...parsed, status: "passed" }) as PassedAcceptanceEvidence;
}

export function reconcileEvidence(registry: unknown, observation: unknown) {
  if (!Array.isArray(registry) || registry.length !== 22) throw new Error("Evidence reconciliation requires the complete 22-case registry.");
  const current = registry.map(entry => evidenceSchema.parse(entry));
  const next = evidenceSchema.parse(observation);
  if (!activeCaseSet.has(next.caseId) && next.status === "passed") throw new Error("Deferred Stage B cases cannot be marked passed by Stage A acceptance.");
  const index = current.findIndex(entry => entry.caseId === next.caseId);
  if (index < 0) throw new Error("Evidence case is missing from registry.");
  const previous = current[index];
  if (previous.status === "passed") {
    if (next.status !== "passed" || previous.sha !== next.sha || previous.acceptanceRunId !== next.acceptanceRunId) throw new Error("Verified evidence cannot be replaced by stale or different evidence.");
    return current;
  }
  if (new Date(next.timestamp).getTime() < new Date(previous.timestamp).getTime()) throw new Error("Older evidence cannot overwrite the current observation.");
  current[index] = next;
  return current;
}

export function activeScopeReport(registry: unknown) {
  if (!Array.isArray(registry) || registry.length !== 22) throw new Error("Report requires all 22 cases.");
  const entries = registry.map(entry => evidenceSchema.parse(entry)).sort((a, b) => a.caseId - b.caseId);
  if (new Set(entries.map(entry => entry.caseId)).size !== 22 || entries.some(entry => entry.caseId >= 14 && entry.caseId <= 20 && entry.status === "passed")) throw new Error("Report cannot accept duplicate cases or passed deferred cases.");
  return {
    activeCases: entries.filter(entry => activeCaseSet.has(entry.caseId)),
    deferredCases: entries.filter(entry => !activeCaseSet.has(entry.caseId)).map(entry => ({ caseId: entry.caseId, status: entry.status, reason: entry.reason })),
    activePassed: entries.filter(entry => activeCaseSet.has(entry.caseId) && entry.status === "passed").length,
    activeTotal: stageACases.length,
  };
}

export function renderAcceptanceReport(registry: unknown, metadata: { generatedAt: string; controlSha?: string; commands: string[] }) {
  const report = activeScopeReport(registry);
  const control = metadata.controlSha ? shaSchema.parse(metadata.controlSha) : "not recorded";
  const lines = [
    "# Product 008 Stage A acceptance report",
    "",
    `Generated: ${metadata.generatedAt}`,
    `Trusted control SHA: ${control}`,
    `Active scope: ${report.activePassed}/${report.activeTotal} passed from durable live evidence`,
    "",
    "This report distinguishes implementation/offline verification from live SOW evidence. It does not promote a case from source inspection, a simulated provider response, or a local-only path.",
    "",
    "## Commands and setup",
    ...metadata.commands.map(command => `- \`${command}\``),
    "",
    "## Active cases",
  ];
  for (const entry of report.activeCases) {
    lines.push(`### Case ${entry.caseId}: ${entry.status}`);
    lines.push(`- Timestamp: ${entry.timestamp}`);
    lines.push(`- Work/branch/SHA: ${entry.workId ?? "not recorded"} / ${entry.branch ?? "not recorded"} / ${entry.sha ?? "not recorded"}`);
    lines.push(`- Workers: ${entry.workers.join(", ") || "not recorded"}`);
    lines.push(`- Sessions: ${entry.sessionIds?.join(", ") || "not recorded"}`);
    lines.push(`- Check URLs: ${entry.checkUrls.join(", ") || "not recorded"}`);
    lines.push(`- Logs: ${entry.logs.join(", ") || "not recorded"}`);
    lines.push(`- Artifacts: ${entry.artifacts.join(", ") || "not recorded"}`);
    lines.push(`- Observed result: ${entry.observedResult ?? entry.reason}`);
    if (entry.failureRecovery?.length) lines.push(`- Failure/recovery: ${entry.failureRecovery.join("; ")}`);
    lines.push("");
  }
  lines.push("## Deferred Stage B cases");
  for (const entry of report.deferredCases) lines.push(`- Case ${entry.caseId}: **${entry.status}** — ${entry.reason}`);
  lines.push("", "## Delivery boundary", "Cases 14–20 remain deferred because S3, Product 007 route promotion, hostname verification, deployment and rollback are excluded. No release path is simulated.");
  return lines.join("\n") + "\n";
}
