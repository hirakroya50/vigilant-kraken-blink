import { readFile } from "node:fs/promises";
import { connectValkey, Lease } from "./coordination/lease.js";
import { roleSchema } from "./contracts/index.js";
import { GitHub } from "./git/github.js";
import { GitHubApp } from "./auth/github-app.js";
import { loadConfiguration } from "./config/index.js";
import { doctor } from "./doctor.js";
import { safeFailure } from "./logging/index.js";
import { proposeCommand } from "./ai/propose-command.js";
import { intakeCommand, issueIntakeCommand } from "./intake/command.js";
import { inspectRegistry } from "./evidence/registry.js";
import { prepareRunner, readRunnerRecord } from "./testing/prepare.js";
import { runProtected } from "./testing/run.js";
import { runnerSmoke } from "./testing/smoke.js";
import { reconcileCommand, reconciliationOptions } from "./work/command.js";
import { inspectFitReview } from "./work/fit-review.js";
import { IntakeError } from "./intake/index.js";

const [command, ...args] = process.argv.slice(2);
async function main() {
  if (command === "fit-review") {
    if (args.length !== 1 || args[0].startsWith("--")) throw new Error("Fit review requires one work ID.");
    const config = await loadConfiguration();
    const app = await GitHubApp.create(config);
    const identity = await app.verify();
    const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
    console.log(JSON.stringify({ trustedAppId: identity.appId, ...await inspectFitReview(github, args[0]) }, null, 2));
    return;
  }
  if (command === "intake-issue") {
    if (args.length !== 2 || args[1] !== "--approve-write" || String(Number(args[0])) !== args[0] || !Number.isSafeInteger(Number(args[0])) || Number(args[0]) < 1) throw new IntakeError("Issue intake requires a positive issue number and explicit --approve-write.");
    await issueIntakeCommand(await loadConfiguration(), Number(args[0]));
    return;
  }
  if (command === "reconcile") {
    const options = reconciliationOptions(args);
    await reconcileCommand(await loadConfiguration(), options);
    return;
  }
  if (command === "runner-prepare") {
    if (args.length !== 3 || args[2] !== "--approve-reviewed-control-build") throw new Error("Runner image preparation requires reviewed control SHA, digest-pinned official base image and explicit approval.");
    console.log(JSON.stringify(await prepareRunner(process.cwd(), args[0], args[1]), null, 2));
    return;
  }
  if (command === "runner-smoke") {
    if (args.length !== 1) throw new Error("Runner smoke requires one review-record JSON file.");
    console.log(JSON.stringify(await runnerSmoke(await readRunnerRecord(args[0])), null, 2));
    return;
  }
  if (command === "runner-test") {
    if (args.length !== 2) throw new Error("Protected testing requires exact candidate SHA and a review-record JSON file.");
    const result = await runProtected(process.cwd(), args[0], await readRunnerRecord(args[1]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "passed" ? 0 : 2;
    return;
  }
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
  console.log("Safi Product 008 foundation\nCommands: doctor [--ai-probe], ai-propose <input.json> --approve-cost, intake <request.json> --approve-write, intake-issue <number> --approve-write, reconcile [--once|--watch] [--after work/id] [--event file.json], fit-review <work-id>, evidence [registry] [--stage-a], discover [--pat], lease-probe\nProtected execution: runner-prepare <control-sha> <official-image@digest> --approve-reviewed-control-build; runner-smoke <record.json>; runner-test <candidate-sha> <record.json>\nReserved worker modes (currently blocked): fitter, developer, tester, triager, fixer, release\nThis milestone is not Stage A completion.");
  if (command) process.exitCode = 2;
}
main().catch(error => { console.error(safeFailure(error)); process.exitCode = 1; });
