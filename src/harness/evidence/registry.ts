import { evidenceSchema } from "../contracts/index.js";

export const stageACases = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 21, 22] as const;
export function inspectRegistry(input: unknown, stage: "A" | "all" = "all") {
  if (!Array.isArray(input) || input.length !== 22) throw new Error("Registry must contain all 22 cases, including deferred Stage B.");
  const entries = input.map(entry => evidenceSchema.parse(entry));
  if (new Set(entries.map(entry => entry.caseId)).size !== 22) throw new Error("Registry contains duplicate cases.");
  const selected = entries.filter(entry => stage === "all" || stageACases.some(id => id === entry.caseId)).sort((a, b) => a.caseId - b.caseId);
  return {
    scope: stage === "A" ? "stage-A" : "full-SOW",
    verification: "registry-validation-only; referenced live evidence is not independently verified",
    total: selected.length,
    recordedPasses: selected.filter(entry => entry.status === "passed").length,
    allRecordedPassed: selected.every(entry => entry.status === "passed"),
    entries: selected,
  };
}
