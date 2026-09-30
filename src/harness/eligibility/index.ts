import { shaSchema } from "../contracts/index.js";
export type Check = { name: string; head_sha: string; app: { id: number } | null; status: string; conclusion: string | null; id: number };
export function candidateState(sha: string, checks: Check[], trustedAppId: number) {
  shaSchema.parse(sha);
  if (!Number.isSafeInteger(trustedAppId) || trustedAppId <= 0) throw new Error("Trusted GitHub App ID is required.");
  const latest = new Map<string, Check>();
  for (const check of checks) {
    if (check.head_sha !== sha || check.app?.id !== trustedAppId) continue;
    if (!latest.has(check.name) || latest.get(check.name)!.id < check.id) latest.set(check.name, check);
  }
  const success = (name: string) => latest.get(name)?.status === "completed" && latest.get(name)?.conclusion === "success";
  const failed = ["safi/build", "safi/test", "safi/regression"].some(name => latest.get(name)?.status === "completed" && latest.get(name)?.conclusion === "failure");
  const fit = success("safi/fit");
  const developed = success("safi/developer") || success("safi/fixer");
  const tested = ["safi/build", "safi/test", "safi/regression"].every(success);
  return {
    fitter: !fit,
    developer: fit && !developed,
    tester: fit && developed && !tested && !failed,
    triager: failed && !success("safi/triage"),
    fixer: failed && success("safi/triage") && !success("safi/fixer"),
    qualified: fit && developed && tested,
  };
}
