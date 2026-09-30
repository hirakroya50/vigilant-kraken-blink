import { readFile } from "node:fs/promises";
import { connectValkey, Lease } from "./coordination/lease.js";
import { evidenceSchema, roleSchema } from "./contracts/index.js";
import { GitHub } from "./git/github.js";

const [command, ...args] = process.argv.slice(2);
async function main() {
  if (command === "evidence") {
    const registry = JSON.parse(await readFile(args[0] ?? "docs/product-008/evidence.json", "utf8"));
    if (!Array.isArray(registry) || registry.length !== 22) throw new Error("Evidence registry must contain all 22 cases.");
    const entries = registry.map(entry => evidenceSchema.parse(entry));
    if (new Set(entries.map(entry => entry.caseId)).size !== 22) throw new Error("Duplicate acceptance case.");
    console.table(entries.map(entry => ({ case: entry.caseId, status: entry.status, reason: entry.reason })));
    process.exitCode = entries.every(entry => entry.status === "passed") ? 0 : 2;
    return;
  }
  if (command === "discover") {
    const github = new GitHub(process.env.GITHUB_REPOSITORY ?? "", process.env.GITHUB_TOKEN ?? "");
    console.log(JSON.stringify(await github.discover(), null, 2));
    return;
  }
  if (command === "lease-probe") {
    const redis = connectValkey(process.env.VALKEY_URL ?? "");
    // Do not expose connection URLs (which may contain passwords) in output.
    redis.on("error", () => {});
    let lease: Lease | null = null;
    try {
      await redis.connect();
      lease = await Lease.acquire(redis, `probe:${crypto.randomUUID()}`, 3000);
      if (!lease) throw new Error("Probe could not acquire lease.");
      const collision = await Lease.acquire(redis, lease.key.slice("safi:leases:".length), 3000);
      if (collision) { await collision.release(); throw new Error("Lease collision unexpectedly succeeded."); }
      await lease.renew(); await lease.assertOwned();
      if (!await lease.release()) throw new Error("Owner release failed.");
      lease = null;
      console.log(JSON.stringify({ status: "passed", scope: "adapter-smoke-only", sowEvidence: false, actions: ["acquire", "collision-denied", "renew", "owner-release"] }));
    } finally { if (lease) await lease.release().catch(() => {}); redis.disconnect(); }
    return;
  }
  if (roleSchema.safeParse(command).success) {
    console.log(JSON.stringify({ role: command, status: "blocked", reason: "Role lifecycle is not implemented in this bootstrap milestone. No lease, check, handoff, test or release was published." }));
    process.exitCode = 2;
    return;
  }
  console.log("Safi Product 008 foundation\nCommands: evidence [registry], discover, lease-probe\nReserved worker modes (currently blocked): fitter, developer, tester, triager, fixer, release\nThis milestone is not Stage A completion.");
  if (command) process.exitCode = 2;
}
main().catch(() => { console.error("Harness operation failed. Check input schema, authorization, and infrastructure configuration. Secret-bearing provider errors are intentionally suppressed."); process.exitCode = 1; });
