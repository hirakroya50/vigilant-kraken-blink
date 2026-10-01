import { readFile } from "node:fs/promises";
import { connectValkey, Lease } from "./coordination/lease.js";
import { roleSchema } from "./contracts/index.js";
import { GitHub } from "./git/github.js";
import { GitHubApp } from "./auth/github-app.js";
import { loadConfiguration } from "./config/index.js";
import { doctor } from "./doctor.js";
import { safeFailure } from "./logging/index.js";
import { proposeCommand } from "./ai/propose-command.js";
import { intakeCommand } from "./intake/command.js";
import { inspectRegistry } from "./evidence/registry.js";

const [command, ...args] = process.argv.slice(2);
async function main() {
  if (command === "intake") {
    if (args.length !== 2 || args[1] !== "--approve-write" || args[0].startsWith("--")) throw new Error("Intake requires a JSON request file and explicit --approve-write.");
    await intakeCommand(await loadConfiguration(), args[0]);
    return;
  }
  if (command === "ai-propose") {
    if (args.length !== 2 || args[1] !== "--approve-cost" || args[0].startsWith("--")) throw new Error("Use an input JSON packet and explicit --approve-cost consent.");
    await proposeCommand(await loadConfiguration(), args[0]);
    return;
  }
  if (command === "doctor") {
    if (args.some(arg => arg !== "--ai-probe")) throw new Error("Unknown doctor argument.");
    process.exitCode = await doctor(await loadConfiguration(), args.includes("--ai-probe")) ? 0 : 2;
    return;
  }
  if (command === "evidence") {
    const stageA = args.includes("--stage-a");
    const paths = args.filter(arg => arg !== "--stage-a");
    if (paths.length > 1 || paths.some(arg => arg.startsWith("--")) || args.filter(arg => arg === "--stage-a").length > 1) throw new Error("Unknown evidence argument.");
    const registry = JSON.parse(await readFile(paths[0] ?? "docs/product-008/evidence.json", "utf8"));
    const report = inspectRegistry(registry, stageA ? "A" : "all");
    console.log(JSON.stringify({ scope: report.scope, verification: report.verification, total: report.total, recordedPasses: report.recordedPasses }));
    console.table(report.entries.map(entry => ({ case: entry.caseId, status: entry.status, reason: entry.reason })));
    process.exitCode = report.allRecordedPassed ? 0 : 2;
    return;
  }
  if (command === "discover") {
    const config = await loadConfiguration();
    const pat = args.length === 1 && args[0] === "--pat";
    if (args.length && !pat) throw new Error("Unknown discovery argument.");
    let github: GitHub;
    if (pat) {
      console.log(JSON.stringify({ authentication: "limited-development-PAT", qualificationAuthority: false }));
      github = new GitHub(config.GITHUB_REPOSITORY, config.GITHUB_TOKEN ?? "");
    } else {
      const app = await GitHubApp.create(config);
      await app.verify();
      github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
    }
    console.log(JSON.stringify(await github.discover(), null, 2));
    return;
  }
  if (command === "lease-probe") {
    const config = await loadConfiguration();
    const redis = connectValkey(config.VALKEY_URL ?? "");
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
  console.log("Safi Product 008 foundation\nCommands: doctor [--ai-probe], ai-propose <input.json> --approve-cost, intake <request.json> --approve-write, evidence [registry] [--stage-a], discover [--pat], lease-probe\nReserved worker modes (currently blocked): fitter, developer, tester, triager, fixer, release\nThis milestone is not Stage A completion.");
  if (command) process.exitCode = 2;
}
main().catch(error => { console.error(safeFailure(error)); process.exitCode = 1; });
