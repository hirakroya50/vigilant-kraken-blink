import { open, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Configuration } from "../config/index.js";
import { OpenAIAdapter, AIError, aiLimits } from "./openai.js";

export async function proposeCommand(config: Configuration, inputPath: string) {
  // Read a bounded, explicitly supplied JSON packet; never auto-scan the runner or .env.
  const file = await open(resolve(inputPath), "r");
  let raw: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > aiLimits.inputBytes) throw new AIError("budget");
    const buffer = Buffer.alloc(aiLimits.inputBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > aiLimits.inputBytes) throw new AIError("budget");
    try { raw = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")); } catch { throw new AIError("invalid-input"); }
  } finally { await file.close(); }
  const proposal = await new OpenAIAdapter(config).propose(raw);
  const directory = resolve(".safi/proposals");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = join(directory, `${proposal.kind}-${proposal.workId}-${randomUUID()}.json`);
  await writeFile(output, JSON.stringify(proposal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: proposal.status, kind: proposal.kind, candidateSha: proposal.candidateSha, proposalFile: output, qualification: false, remoteWrites: false }));
}
