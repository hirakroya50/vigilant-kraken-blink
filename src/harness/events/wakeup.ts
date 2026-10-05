import { open } from "node:fs/promises";
import { z } from "zod";
import { WorkError } from "../work/records.js";

export type Wakeup = { event: "issues" | "pull_request" | "push" | "check_run" | "workflow_run"; deliveryId: string; repository: string; authority: "untrusted-wakeup-only"; writeAuthorized: false };
const envelopeSchema = z.object({
  event: z.enum(["issues", "pull_request", "push", "check_run", "workflow_run"]),
  deliveryId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9-]+$/).refine(value => !/[\r\n]/.test(value)),
  payload: z.object({ repository: z.object({ full_name: z.string().max(200) }).passthrough() }).passthrough(),
}).strict();
export function parseWakeup(input: unknown, repository: string) {
  const envelope = envelopeSchema.parse(input);
  if (envelope.payload.repository.full_name.toLowerCase() !== repository.toLowerCase()) throw new WorkError("Wakeup belongs to a different repository.");
  // Event content is a hint only: it never supplies approval, authoritative SHA, code or a write instruction.
  return { event: envelope.event, deliveryId: envelope.deliveryId, repository: repository.toLowerCase(), authority: "untrusted-wakeup-only", writeAuthorized: false } as const;
}
export async function readWakeup(path: string, repository: string) {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 256 * 1024) throw new WorkError("Wakeup must be a regular JSON file of at most 256 KiB.");
    const buffer = Buffer.alloc(256 * 1024 + 1); let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 256 * 1024) throw new WorkError("Wakeup exceeds size limit.");
    let input: unknown;
    try { input = JSON.parse(buffer.subarray(0, offset).toString("utf8")); } catch { throw new WorkError("Wakeup must contain valid JSON."); }
    return parseWakeup(input, repository);
  } finally { await file.close(); }
}
