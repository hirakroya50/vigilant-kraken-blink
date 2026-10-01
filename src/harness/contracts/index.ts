import { z } from "zod";
export const shaSchema = z.string().length(40).regex(/^[a-f0-9]{40}$/);
export const workIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).refine(id => !/[\r\n]/.test(id));
export const roleSchema = z.enum(["fitter", "developer", "tester", "triager", "fixer", "release"]);
export const requestSchema = z.object({ version: z.literal(1), id: workIdSchema, title: z.string().min(1).max(120), description: z.string().min(1).max(10000), acceptance: z.array(z.string().min(1).max(1000)).min(1).max(30) }).strict();
export const applicationPathSchema = z.string().regex(/^(src\/(pages|components\/burger|lib\/burger)\/[a-zA-Z0-9_./-]+|src\/App\.tsx|src\/globals\.css)$/).refine(p => !/[\r\n]/.test(p) && !p.split("/").some(part => part === ".." || part === "." || !part));
export const fitSchema = z.object({ version: z.literal(1), workId: workIdSchema, requestSha: shaSchema, acceptedBy: z.string().min(1), acceptedAt: z.string().datetime(), provenance: z.enum(["ai-reviewed", "reviewed-human"]), summary: z.string().min(1).max(4000), allowedPaths: z.array(applicationPathSchema).min(1).max(30), acceptance: z.array(z.object({ id: z.string().min(1), assertion: z.string().min(1), test: z.string().min(1) }).strict()).min(1) }).strict();
export const fitDraftRecordSchema = fitSchema.omit({ acceptedBy: true, acceptedAt: true, provenance: true }).strict();
export const diagnosisSchema = z.object({ version: z.literal(1), workId: workIdSchema, failedSha: shaSchema, provenance: z.enum(["ai-reviewed", "reviewed-human"]), failureCheckUrls: z.array(z.string().url()).min(1), cause: z.string().min(1).max(6000), repair: z.string().min(1).max(6000), affectedFiles: z.array(z.string()).min(1), confidence: z.enum(["low", "medium", "high"]) }).strict();
export const checkSchema = z.object({ name: z.string().regex(/^safi\/[a-z-]+$/), sha: shaSchema, conclusion: z.enum(["success", "failure", "neutral", "cancelled"]), title: z.string().min(1).max(200), summary: z.string().min(1).max(60000), evidenceId: z.string().min(1).max(200) }).strict();
export const evidenceSchema = z.object({ caseId: z.number().int().min(1).max(22), status: z.enum(["passed", "failed", "blocked", "not-run"]), timestamp: z.string().datetime(), workId: workIdSchema.optional(), branch: z.string().optional(), sha: shaSchema.optional(), workers: z.array(z.string()), checkUrls: z.array(z.string().url()), logs: z.array(z.string()), artifacts: z.array(z.string()), reason: z.string() }).strict().superRefine((entry, ctx) => {
  if (entry.status === "passed" && (!entry.sha || !entry.workId || !entry.branch || !entry.workers.length || !entry.checkUrls.length || !entry.logs.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Live passes require exact SHA, work/branch, workers, check URLs and logs." });
});
export const protectedPaths = ["src/harness/", "src/tests/", "changes/", ".github/", "package.json", "package-lock.json", "playwright.config.ts", "tsconfig", "vite.config.ts", "AI_RULES.md"];
export function assertPermittedDiff(paths: string[], allowedPaths: string[]) {
  z.array(applicationPathSchema).min(1).max(30).parse(allowedPaths);
  if (!paths.length) throw new Error("Completion requires an implementation diff.");
  for (const path of paths) {
    if (!applicationPathSchema.safeParse(path).success || protectedPaths.some(p => path.startsWith(p)) || !allowedPaths.includes(path)) throw new Error(`Unauthorized change: ${path}`);
  }
}
