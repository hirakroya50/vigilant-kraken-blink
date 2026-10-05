import { open } from "node:fs/promises";
import type { Configuration } from "../config/index.js";
import { GitHubApp } from "../auth/github-app.js";
import { GitHub } from "../git/github.js";
import { connectValkey, Lease } from "../coordination/lease.js";
import { workIdSchema } from "../contracts/index.js";
import { commitFitDraft, fitPacket, publishReviewedFit } from "./fit-write.js";
import { WorkError } from "./records.js";

export async function fitWriteCommand(config: Configuration, operation: "commit" | "publish", input: string) {
  let draft: unknown;
  let workId: string;
  if (operation === "commit") {
    const file = await open(input, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 65536) throw new WorkError("Fit draft must be a regular JSON file of at most 64 KiB.");
      const buffer = Buffer.alloc(65537);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 65536) throw new WorkError("Fit draft exceeds 64 KiB.");
      try { draft = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")); } catch { throw new WorkError("Fit draft must contain valid JSON."); }
      workId = fitPacket(draft).record.workId;
    } finally { await file.close(); }
  } else workId = workIdSchema.parse(input);
  const app = await GitHubApp.create(config);
  await app.verify();
  const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
  const redis = connectValkey(config.VALKEY_URL ?? "");
  redis.on("error", () => {});
  let roleLease: Lease | null = null;
  let branchLease: Lease | null = null;
  try {
    await redis.connect();
    const sha = await github.head(`work/${workId}`);
    const repository = config.GITHUB_REPOSITORY.replace("/", ":");
    roleLease = await Lease.acquire(redis, `fitter:${repository}:${sha}`);
    if (!roleLease) throw new WorkError("Another Fitter owns this candidate.");
    roleLease.heartbeat(() => {});
    branchLease = await Lease.acquire(redis, `writer:${repository}:${workId}`);
    if (!branchLease) throw new WorkError("Another writer owns this work branch.");
    branchLease.heartbeat(() => {});
    if (await github.head(`work/${workId}`) !== sha) throw new WorkError("Head changed while acquiring Fit leases; rediscover work.");
    const role = roleLease;
    const writer = branchLease;
    const authority = { assertOwned: async () => { await role.assertOwned(); await writer.assertOwned(); } };
    const result = operation === "commit" ? await commitFitDraft(github, draft, authority) : await publishReviewedFit(github, workId, role, authority);
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), role: "fitter", agentId: role.owner, action: `fit-${operation}`, result: "completed", ...result, sowAcceptance: false }, null, 2));
  } finally {
    if (branchLease) await branchLease.release().catch(() => {});
    if (roleLease) await roleLease.release().catch(() => {});
    redis.disconnect();
  }
}
