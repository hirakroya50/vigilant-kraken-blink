import { z } from "zod";
import { applicationPathSchema, shaSchema, workIdSchema } from "../contracts/index.js";

export const sessionIdSchema = z.string().uuid();
export const sessionRoleSchema = z.enum(["developer", "fixer"]);
export const sessionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge"), sessionId: sessionIdSchema }).strict(),
  z.object({ action: z.literal("complete"), sessionId: sessionIdSchema, candidateSha: shaSchema }).strict(),
  z.object({ action: z.literal("cancel"), sessionId: sessionIdSchema }).strict(),
]);
export const handoffSchema = z.object({
  version: z.literal(1), sessionId: sessionIdSchema, role: sessionRoleSchema, workId: workIdSchema,
  branch: z.string(), expectedSha: shaSchema, fitSha: shaSchema, fitDigest: z.string().regex(/^[a-f0-9]{64}$/),
  allowedPaths: z.array(applicationPathSchema).min(1).max(30), checkout: z.string().min(1),
  createdAt: z.string().datetime(), deadline: z.string().datetime(),
  fitCheckUrl: z.string().url(), requestPath: z.string(), fitPath: z.string(),
  diagnosis: z.unknown().optional(), operatorBoundary: z.literal("same-os-user-local-human"),
  instructions: z.string(),
}).strict();
export type Handoff = z.infer<typeof handoffSchema>;
export class HumanSession {
  private state: "claimed" | "acknowledged" | "completing" | "completed" | "cancelled" | "expired" = "claimed";
  constructor(readonly handoff: Handoff, private readonly now: () => number = Date.now) { handoffSchema.parse(handoff); }
  get status() { return this.state; }
  assertActive() {
    if (this.now() >= Date.parse(this.handoff.deadline)) this.state = "expired";
    if (["expired", "cancelled", "completed"].includes(this.state)) throw new Error("Human session is no longer active; reacquire and revalidate work.");
  }
  acknowledge(id: string) {
    this.assertActive();
    if (id !== this.handoff.sessionId || this.state !== "claimed") throw new Error("Acknowledgement requires this claimed session.");
    this.state = "acknowledged";
  }
  beginCompletion(id: string, candidate: string) {
    this.assertActive(); shaSchema.parse(candidate);
    if (id !== this.handoff.sessionId || this.state !== "acknowledged" || candidate === this.handoff.expectedSha) throw new Error("Completion requires an acknowledged session and a new candidate.");
    this.state = "completing";
  }
  completed() {
    this.assertActive();
    if (this.state !== "completing") throw new Error("Session has no validated completion in progress.");
    this.state = "completed";
  }
  cancel() { this.state = "cancelled"; }
}
