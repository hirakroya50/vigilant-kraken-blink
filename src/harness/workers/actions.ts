import { realpath, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { diagnosisSchema, shaSchema, workIdSchema } from "../contracts/index.js";
import { sessionActionSchema } from "../work/session-state.js";
import { WorkError } from "../work/records.js";
import { diagnosisActionSchema, privateJson, submitSessionAction } from "./local-session.js";

const reviewRecordSchema = z.object({ version: z.literal(1), sessionId: z.string().uuid(), workId: workIdSchema, sha: shaSchema, digest: z.string().regex(/^[a-f0-9]{64}$/), deadline: z.string().datetime(), diagnosis: diagnosisSchema, proposal: z.unknown(), operatorBoundary: z.literal("same-os-user-local-human") }).strict();
export async function actionCommand(repository: string, command: string, args: string[]) {
  if (command === "session-action") {
    if (args.length !== 2) throw new WorkError("Session action requires session directory and owner-only action JSON file.");
    return submitSessionAction(repository, args[0], sessionActionSchema.parse(await privateJson(args[1])));
  }
  if (args.length !== 3 || !["approve", "cancel"].includes(args[1]) || args[2] !== "--approve-review") throw new WorkError("Diagnosis review requires session directory, approve/cancel and explicit --approve-review.");
  const directory = await realpath(args[0]);
  const base = resolve(await realpath(repository), ".safi/sessions");
  if (await realpath(base) !== base || !/^session-[a-zA-Z0-9]+$/.test(relative(base, directory))) throw new WorkError("Diagnosis review must target one local session directory.");
  const record = reviewRecordSchema.parse(await privateJson(join(directory, "diagnosis.json")));
  const actual = createHash("sha256").update(JSON.stringify(record.diagnosis, null, 2)).digest("hex");
  if (actual !== record.digest || Date.now() >= Date.parse(record.deadline) || record.diagnosis.workId !== record.workId || record.diagnosis.failedSha !== record.sha) throw new WorkError("Diagnosis review identity changed or expired.");
  const action = diagnosisActionSchema.parse({ action: args[1], sessionId: record.sessionId, digest: record.digest });
  await writeFile(join(directory, "review.json"), JSON.stringify(action) + "\n", { flag: "wx", mode: 0o600 });
  return { submitted: true, remoteWrite: false, operatorBoundary: record.operatorBoundary, ...action };
}
