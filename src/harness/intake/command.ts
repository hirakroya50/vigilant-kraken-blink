import { open } from "node:fs/promises";
import type { Configuration } from "../config/index.js";
import { GitHubApp } from "../auth/github-app.js";
import { GitHub } from "../git/github.js";
import { connectValkey, Lease } from "../coordination/lease.js";
import { intake, intakePacket, IntakeError } from "./index.js";

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
  const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
  const redis = connectValkey(config.VALKEY_URL ?? "");
  redis.on("error", () => {});
  let lease: Lease | null = null;
  try {
    await redis.connect();
    lease = await Lease.acquire(redis, `intake:${config.GITHUB_REPOSITORY.replace("/", ":")}:${packet.request.id}`);
    if (!lease) throw new IntakeError("Another intake owns this request; retry after reconciliation.");
    lease.heartbeat(() => {});
    const result = await intake(github, packet.request, lease);
    console.log(JSON.stringify({ ...result, qualification: "not-qualified", scope: "manual-intake-only" }, null, 2));
  } finally {
    if (lease) await lease.release().catch(() => {});
    redis.disconnect();
  }
}
