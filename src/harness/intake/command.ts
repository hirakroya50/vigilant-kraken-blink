import { open } from "node:fs/promises";
import type { z } from "zod";
import type { requestSchema } from "../contracts/index.js";
import type { Configuration } from "../config/index.js";
import { GitHubApp } from "../auth/github-app.js";
import { GitHub } from "../git/github.js";
import { connectValkey, Lease } from "../coordination/lease.js";
import { intake, intakePacket, IntakeError } from "./index.js";
import { loadIssueRequest, sourceContent, type IssueSource } from "./issue.js";

async function submit(config: Configuration, github: GitHub, request: z.infer<typeof requestSchema>, source?: IssueSource) {
  const redis = connectValkey(config.VALKEY_URL ?? "");
  redis.on("error", () => {});
  let lease: Lease | null = null;
  try {
    await redis.connect();
    lease = await Lease.acquire(redis, `intake:${config.GITHUB_REPOSITORY.replace("/", ":")}:${request.id}`);
    if (!lease) throw new IntakeError("Another intake owns this request; retry after reconciliation.");
    lease.heartbeat(() => {});
    const result = await intake(github, request, lease, source);
    if (source) {
      const current = await loadIssueRequest(github, source.number);
      if (sourceContent(current.source) !== sourceContent(source) || intakePacket(current.request).digest !== intakePacket(request).digest) throw new IntakeError("Issue changed during intake; captured work is not approved. Reconcile before continuing.");
    }
    await lease.assertOwned();
    console.log(JSON.stringify({ ...result, source: source ?? { kind: "manual" }, qualification: "not-qualified", scope: source ? "issue-intake-only" : "manual-intake-only" }, null, 2));
  } finally {
    if (lease) await lease.release().catch(() => {});
    redis.disconnect();
  }
}
export async function intakeCommand(config: Configuration, path: string) {
  const file = await open(path, "r");
  let input: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 65536) throw new IntakeError("Intake input must be a regular JSON file of at most 64 KiB.");
    const buffer = Buffer.alloc(65537);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 65536) throw new IntakeError("Intake input exceeds 64 KiB.");
    try { input = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")); } catch { throw new IntakeError("Intake input must contain valid JSON."); }
  } finally { await file.close(); }
  const packet = intakePacket(input);
  const app = await GitHubApp.create(config);
  await app.verify();
  await submit(config, new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify()), packet.request);
}
export async function issueIntakeCommand(config: Configuration, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new IntakeError("Issue number must be a positive safe integer.");
  const app = await GitHubApp.create(config);
  await app.verify();
  const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
  const packet = await loadIssueRequest(github, number);
  await submit(config, github, packet.request, packet.source);
}
