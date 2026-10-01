import { createHash } from "node:crypto";
import { z } from "zod";
import { requestSchema } from "../contracts/index.js";
import type { GitHub } from "../git/github.js";
import { IntakeError } from "./index.js";

export const issueSourceSchema = z.object({
  version: z.literal(1), kind: z.literal("github-issue"), repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/).refine(value => !/[\r\n]/.test(value)),
  number: z.number().int().positive().safe(), issueId: z.number().int().positive().safe(),
  url: z.string().url(), bodyDigest: z.string().length(64).regex(/^[a-f0-9]+$/),
}).strict();
export type IssueSource = z.infer<typeof issueSourceSchema>;
export function parseIssueRequest(number: number, title: string, body: string) {
  if (!Number.isSafeInteger(number) || number < 1 || Buffer.byteLength(body) > 10000) throw new IntakeError("Issue number or request body exceeds intake limits.");
  const headers = [...body.matchAll(/^#{2,3} (Description|Acceptance criteria)\s*$/gm)];
  const allHeaders = [...body.matchAll(/^#{2,3} .+$/gm)];
  if (headers.length !== 2 || allHeaders.length !== 2 || headers[0][1] !== "Description" || headers[1][1] !== "Acceptance criteria" || body.slice(0, headers[0].index).trim()) throw new IntakeError("Issue must contain Description followed by Acceptance criteria sections only.");
  const description = body.slice(headers[0].index! + headers[0][0].length, headers[1].index).trim();
  const lines = body.slice(headers[1].index! + headers[1][0].length).trim().split(/\r?\n/).filter(line => line.trim());
  const acceptance = lines.map(line => {
    const match = /^- (?:\[[ xX]\]\s+)?(.+)$/.exec(line.trim());
    if (!match) throw new IntakeError("Each acceptance criterion must be a nonempty Markdown bullet.");
    return match[1].trim();
  });
  if (description === "_No response_") throw new IntakeError("Issue description is required.");
  return requestSchema.parse({ version: 1, id: `issue-${number}`, title, description, acceptance });
}
export async function loadIssueRequest(github: GitHub, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new IntakeError("Issue number must be a positive safe integer.");
  const issue = (await github.api.issues.get({ owner: github.owner, repo: github.repo, issue_number: number })).data;
  const repository = `${github.owner}/${github.repo}`.toLowerCase();
  const url = `https://github.com/${repository}/issues/${number}`;
  if (issue.number !== number || issue.pull_request || issue.state !== "open" || issue.html_url.toLowerCase() !== url) throw new IntakeError("Intake requires an open issue in the configured repository, not a pull request.");
  const body = issue.body ?? "";
  const request = parseIssueRequest(number, issue.title, body);
  const source = issueSourceSchema.parse({ version: 1, kind: "github-issue", repository, number, issueId: issue.id, url, bodyDigest: createHash("sha256").update(body).digest("hex") });
  return { request, source };
}
export function sourceContent(source: IssueSource) {
  return JSON.stringify(issueSourceSchema.parse(source), null, 2) + "\n";
}
