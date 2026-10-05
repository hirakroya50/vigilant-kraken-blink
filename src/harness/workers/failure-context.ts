import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { z } from "zod";
import { WorkError } from "../work/records.js";

async function boundedText(path: string, limit: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new WorkError("Failure context file exceeds bounded regular-file policy.");
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally { await file.close(); }
}
export async function failureContext(repository: string, sha: string, summary: string) {
  let raw: unknown;
  try { raw = JSON.parse(summary); } catch { return summary.slice(0, 8000); }
  const packet = z.object({ sha: z.literal(sha), localEvidenceDirectory: z.string(), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/), runner: z.object({ controlSha: z.string(), controlDigest: z.string(), testDigest: z.string() }) }).passthrough().safeParse(raw);
  if (!packet.success) return summary.slice(0, 8000);
  if (!new RegExp(`^\\.safi/runs/${sha}-[A-Za-z0-9]+$`).test(packet.data.localEvidenceDirectory)) throw new WorkError("Runner evidence location is outside the exact-SHA local run directory.");
  const directory = resolve(await realpath(repository), packet.data.localEvidenceDirectory);
  if (await realpath(directory) !== directory) throw new WorkError("Failure context cannot traverse symbolic links.");
  const manifest: Record<string, unknown> = JSON.parse(await boundedText(join(directory, "manifest.json"), 1024 * 1024));
  z.object({ candidateSha: z.literal(sha), controlSha: z.literal(packet.data.runner.controlSha), controlDigest: z.literal(packet.data.runner.controlDigest), testDigest: z.literal(packet.data.runner.testDigest) }).passthrough().parse(manifest);
  if (createHash("sha256").update(JSON.stringify({ directory, ...manifest })).digest("hex") !== packet.data.manifestDigest) throw new WorkError("Local failure manifest differs from exact-SHA check evidence.");
  const excerpts: { file: string; excerpt: string }[] = [];
  for (const name of ["build-failure.log", "browser-failure.log", "build.log", "browser.log", "results/playwright.json"]) {
    try { excerpts.push({ file: name, excerpt: await boundedText(join(directory, name), 1500) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  // All excerpts are untrusted candidate output; the AI adapter treats them as data only.
  return JSON.stringify({ evidence: summary.slice(0, 1800), excerpts }).slice(0, 8000);
}
