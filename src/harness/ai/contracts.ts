import { z } from "zod";
import { fitSchema, requestSchema, shaSchema, workIdSchema } from "../contracts/index.js";

export const applicationPath = z.string().max(240).refine(path => {
  const parts = path.split("/");
  return !parts.some(part => part === ".." || part === "." || !part) && (/^src\/(pages|components\/burger|lib\/burger)\/[A-Za-z0-9_./-]+$/.test(path) || ["src/App.tsx", "src/globals.css"].includes(path));
}, "An application-only, normalized path is required.");
const paths = z.array(applicationPath).min(1).max(30).refine(list => new Set(list).size === list.length);
const source = z.array(z.object({ path: applicationPath, content: z.string().max(18000) }).strict()).min(1).max(30).refine(list => new Set(list.map(file => file.path)).size === list.length);
export const fitInputSchema = z.object({
  kind: z.literal("fit"), candidateSha: shaSchema, request: requestSchema,
  permittedPaths: paths, files: source, protectedTests: z.array(z.string().min(1).max(500)).max(200).optional(),
}).strict().refine(input => input.files.every(file => input.permittedPaths.includes(file.path)), "Source must stay within the trusted permitted paths.");
export const diagnosisInputSchema = z.object({
  kind: z.literal("diagnosis"), workId: workIdSchema, candidateSha: shaSchema,
  fit: fitSchema, permittedPaths: paths, files: source,
  failures: z.array(z.object({ checkUrl: z.string().url().refine(url => /^https:\/\/github\.com\//.test(url)), summary: z.string().min(1).max(8000) }).strict()).min(1).max(10),
  diff: z.string().max(18000),
}).strict().refine(input => input.fit.workId === input.workId && input.files.every(file => input.permittedPaths.includes(file.path)) && input.permittedPaths.every(path => input.fit.allowedPaths.includes(path)), "Diagnosis scope must match the accepted Fit.");
export const proposalInputSchema = z.union([fitInputSchema, diagnosisInputSchema]);
export type ProposalInput = z.infer<typeof proposalInputSchema>;
export const fitDraftSchema = z.object({
  summary: z.string().min(1).max(4000), allowedPaths: paths,
  acceptance: z.array(z.object({ id: z.string().min(1).max(80), assertion: z.string().min(1).max(1000), test: z.string().min(1).max(500) }).strict()).min(1).max(30).refine(list => new Set(list.map(item => item.id)).size === list.length),
}).strict();
export const diagnosisDraftSchema = z.object({
  cause: z.string().min(1).max(6000), repair: z.string().min(1).max(6000),
  affectedFiles: paths, confidence: z.enum(["low", "medium", "high"]),
}).strict();

export function responseSchema(kind: ProposalInput["kind"], permittedPaths: string[]) {
  const pathList = { type: "array", minItems: 1, maxItems: 30, items: { type: "string", enum: permittedPaths } };
  const text = { type: "string" };
  return kind === "fit" ? {
    type: "object", additionalProperties: false, required: ["summary", "allowedPaths", "acceptance"],
    properties: { summary: text, allowedPaths: pathList, acceptance: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "assertion", "test"], properties: { id: text, assertion: text, test: text } } } },
  } : {
    type: "object", additionalProperties: false, required: ["cause", "repair", "affectedFiles", "confidence"],
    properties: { cause: text, repair: text, affectedFiles: pathList, confidence: { type: "string", enum: ["low", "medium", "high"] } },
  };
}
