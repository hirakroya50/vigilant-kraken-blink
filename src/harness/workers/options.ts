import { applicationPathSchema, roleSchema } from "../contracts/index.js";
import { WorkError } from "../work/records.js";

export type WorkerRole = "fitter" | "developer" | "tester" | "triager" | "fixer";
export type WorkerOptions = {
  watch: boolean; approveWrite: boolean; approveCost: boolean; runner?: string; paths: string[];
  event?: string; sessionMinutes: number;
};
export function workerOptions(role: string, args: string[]): WorkerOptions {
  roleSchema.parse(role);
  const result: WorkerOptions = { watch: false, approveWrite: false, approveCost: false, paths: [], sessionMinutes: 30 };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new WorkError("Duplicate worker option.");
    seen.add(flag);
    if (flag === "--watch") result.watch = true;
    else if (flag === "--once") result.watch = false;
    else if (flag === "--approve-write") result.approveWrite = true;
    else if (flag === "--approve-cost") result.approveCost = true;
    else if (["--runner", "--paths", "--event", "--session-minutes"].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new WorkError("Worker option requires a value.");
      if (flag === "--runner") result.runner = value;
      if (flag === "--event") result.event = value;
      if (flag === "--paths") result.paths = value.split(",").map(path => applicationPathSchema.parse(path));
      if (flag === "--session-minutes") {
        result.sessionMinutes = Number(value);
        if (!/^\d+$/.test(value) || result.sessionMinutes < 1 || result.sessionMinutes > 120) throw new WorkError("Human session duration must be 1–120 minutes.");
      }
    } else throw new WorkError("Unknown worker option.");
  }
  if (seen.has("--once") && seen.has("--watch")) throw new WorkError("Select --once or --watch, not both.");
  if (role === "release") throw new WorkError("Release is deferred: Product 007 and S3 are excluded. No release check will be published.");
  if (!result.approveWrite) throw new WorkError("Workers require explicit --approve-write for remote commits/checks.");
  if (["fitter", "triager"].includes(role) && !result.approveCost) throw new WorkError("AI workers require explicit --approve-cost.");
  if (role === "fitter" && (!result.paths.length || result.paths.length > 30 || new Set(result.paths).size !== result.paths.length)) throw new WorkError("Fitter requires 1–30 unique trusted application --paths.");
  if (role === "tester" && !result.runner) throw new WorkError("Tester requires a reviewed --runner record.");
  if (role !== "fitter" && seen.has("--paths")) throw new WorkError("Only Fitter accepts --paths; other roles use accepted Fit scope.");
  if (role !== "tester" && result.runner) throw new WorkError("Only Tester accepts --runner.");
  return result;
}
