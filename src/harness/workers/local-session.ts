import { constants } from "node:fs";
import { mkdir, mkdtemp, open, realpath, writeFile, rm } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { git, prepareWorktree } from "../git/worktrees.js";
import { handoffSchema, HumanSession, sessionActionSchema } from "../work/session-state.js";
import { completeHumanSession, inspectRepair } from "../work/session-completion.js";
import { WorkError } from "../work/records.js";
import type { RoleContext } from "./roles.js";

export async function privateJson(path: string, maxBytes = 65536): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new WorkError("Session input must be an owner-only bounded regular file.");
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new WorkError("Session input exceeds its size bound.");
    try { return JSON.parse(buffer.subarray(0, offset).toString("utf8")); } catch { throw new WorkError("Session input must contain valid JSON."); }
  } finally { await file.close(); }
}
export async function createSessionDirectory(repository: string) {
  const base = resolve(await realpath(repository), ".safi/sessions");
  await mkdir(base, { recursive: true, mode: 0o700 });
  if (await realpath(base) !== base) throw new WorkError("Session directories must not traverse symbolic links.");
  return mkdtemp(join(base, "session-"));
}
export async function submitSessionAction(repository: string, directory: string, raw: unknown) {
  const base = resolve(await realpath(repository), ".safi/sessions");
  const target = await realpath(directory);
  const rel = relative(base, target);
  if (await realpath(base) !== base || isAbsolute(rel) || rel.startsWith("..") || rel.includes("/") || !/^session-[a-zA-Z0-9]+$/.test(rel)) throw new WorkError("Action must target one local worker session directory.");
  const action = sessionActionSchema.parse(raw);
  const handoff = handoffSchema.parse(await privateJson(join(target, "handoff.json")));
  if (action.sessionId !== handoff.sessionId || Date.now() >= Date.parse(handoff.deadline)) throw new WorkError("Session identity is stale or expired.");
  const name = action.action === "acknowledge" ? "acknowledge.json" : "finish.json";
  await writeFile(join(target, name), JSON.stringify(action) + "\n", { mode: 0o600, flag: "wx" });
  return { action: action.action, sessionId: action.sessionId, submitted: true, remoteWrite: false };
}
async function optionalAction(path: string) {
  try { return await privateJson(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function runHuman(ctx: RoleContext) {
  const { target, github, role, signal } = ctx;
  if (role !== "developer" && role !== "fixer" || !target.fit) throw new WorkError("Human implementation requires an accepted Fit.");
  const fit = target.fit;
  const repair = role === "fixer" ? await inspectRepair(github, target.workId, target.sha, fit.fit.allowedPaths) : undefined;
  const root = await mkdtemp(join(tmpdir(), "safi-human-"));
  let checkout: string | undefined;
  let completed = false;
  const directory = await createSessionDirectory(ctx.repository);
  try {
    checkout = await prepareWorktree(ctx.repository, root, role, target.sha);
    const handoff = handoffSchema.parse({
      version: 1, sessionId: randomUUID(), role, workId: target.workId, branch: target.branch,
      expectedSha: target.sha, fitSha: fit.fitSha, fitDigest: fit.lineage.fitDigest, allowedPaths: fit.fit.allowedPaths,
      checkout, createdAt: new Date().toISOString(), deadline: new Date(Date.now() + ctx.options.sessionMinutes * 60000).toISOString(),
      fitCheckUrl: fit.fitCheckUrl, requestPath: `changes/${target.workId}/request.json`, fitPath: `changes/${target.workId}/fit.json`,
      ...(repair ? { diagnosis: repair.diagnosis } : {}), operatorBoundary: "same-os-user-local-human",
      instructions: "Open this isolated checkout in Dyad. Acknowledge this session, modify only accepted application paths, and produce one clean non-merge commit directly on expectedSha. Submit the committed full SHA for completion. Never modify tests, Fit, dependencies or harness. This is not remote user authentication; it trusts the same OS user.",
    });
    const session = new HumanSession(handoff);
    await writeFile(join(directory, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    ctx.log("human-handoff", "waiting-human", { directory, checkout, sessionId: handoff.sessionId, deadline: handoff.deadline });
    while (true) {
      signal.throwIfAborted(); session.assertActive(); await ctx.assertActive();
      if (await github.head(target.branch) !== target.sha) throw new WorkError("Branch advanced while awaiting human action; session cancelled.");
      if (session.status === "claimed") {
        const raw = await optionalAction(join(directory, "acknowledge.json"));
        if (raw !== undefined) {
          const action = sessionActionSchema.parse(raw);
          if (action.action !== "acknowledge") throw new WorkError("Invalid acknowledgement action.");
          session.acknowledge(action.sessionId);
          ctx.log("human-acknowledge", "acknowledged", { sessionId: handoff.sessionId });
        }
      }
      const raw = await optionalAction(join(directory, "finish.json"));
      if (raw !== undefined) {
        const action = sessionActionSchema.parse(raw);
        if (action.sessionId !== handoff.sessionId || action.action === "acknowledge") throw new WorkError("Finish action does not match this session.");
        if (action.action === "cancel") {
          session.cancel();
          return { status: "cancelled", directory, candidateCreated: false };
        }
        const result = await completeHumanSession(github, session, action.candidateSha, ctx.lease, { assertOwned: ctx.assertActive });
        await writeFile(join(directory, "completion.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600, flag: "wx" });
        completed = true;
        return { status: "completed", directory, ...result };
      }
      await delay(1000, undefined, { signal });
    }
  } finally {
    if (!checkout) await rm(root, { recursive: true, force: true });
    else if (completed) {
      // Never discard concurrent human edits, even after a successful remote completion.
      await git(ctx.repository, ["worktree", "remove", checkout]).then(() => rm(root, { recursive: true, force: true })).catch(() => {
        ctx.log("checkout-recovery", "retained", { checkout, directory });
      });
    } else ctx.log("checkout-recovery", "retained", { checkout, directory, sessionExpired: true });
    // Private handoff/action/evidence files remain; expired sessions are never resumed as authority.
  }
}

export const diagnosisActionSchema = z.object({ action: z.enum(["approve", "cancel"]), sessionId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function waitDiagnosisReview(ctx: RoleContext, directory: string, sessionId: string, digest: string, deadline: number) {
  while (Date.now() < deadline) {
    ctx.signal.throwIfAborted(); await ctx.assertActive();
    if (await ctx.github.head(ctx.target.branch) !== ctx.target.sha) throw new WorkError("Diagnosis head advanced; stale review cannot be published.");
    const raw = await optionalAction(join(directory, "review.json"));
    if (raw !== undefined) {
      const action = diagnosisActionSchema.parse(raw);
      if (action.sessionId !== sessionId || action.digest !== digest) throw new WorkError("Diagnosis review must identify the generated draft bytes.");
      return action.action === "approve";
    }
    await delay(1000, undefined, { signal: ctx.signal });
  }
  throw new WorkError("Diagnosis review session expired; rediscover current failure evidence.");
}
