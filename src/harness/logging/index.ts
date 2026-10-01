import { ConfigurationError } from "../config/index.js";
import { AIError } from "../ai/openai.js";
import { RunnerError } from "../testing/snapshot.js";
import { IntakeError } from "../intake/index.js";
import { WorkError } from "../work/records.js";

export function safeFailure(error: unknown): string {
  if (error instanceof ConfigurationError || error instanceof AIError || error instanceof RunnerError || error instanceof IntakeError || error instanceof WorkError) return error.message;
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  if (status === 401) return "Authentication rejected; verify credential validity and installation identity.";
  if (status === 403) return "Access denied; verify repository permissions, provider billing, and rate limits.";
  if (status === 404) return "Resource unavailable to this identity; verify repository installation or model access.";
  if (status === 429) return "Provider rate/quota limit reached; retry only after the provider window or billing is resolved.";
  return "Operation failed; verify local prerequisites, provider access, and connectivity. Provider details suppressed.";
}
export type Diagnostic = { check: string; status: "passed" | "blocked"; detail: string };
export function emitDiagnostic(result: Diagnostic) { console.log(JSON.stringify(result)); }
