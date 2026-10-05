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
import { activeScopeReport, renderAcceptanceReport } from "./evidence/acceptance.js";
import { dispatchWebhook, MemoryDeliveryStore, boundedWakeup } from "./events/dispatch.js";
import { prepareRunner, readRunnerRecord } from "./testing/prepare.js";
import { runProtected } from "./testing/run.js";
import { runnerSmoke } from "./testing/smoke.js";
import { reconcileCommand, reconciliationOptions } from "./work/command.js";
import { inspectFitReview } from "./work/fit-review.js";
import { fitWriteCommand } from "./work/fit-command.js";
import { IntakeError } from "./intake/index.js";
import { actionCommand } from "./workers/actions.js";
import { inspectIntegration, enqueueIntegration } from "./work/integration.js";

const [command, ...args] = process.argv.slice(2);
async function main() {
  if (command === "session-action" || command === "diagnosis-review") {
    console.log(JSON.stringify(await actionCommand(process.cwd(), command, args), null, 2));
    return;
  }
  if (command === "integration-inspect" || command === "integrate") {
    if (args.length !== (command === "integrate" ? 2 : 1) || (command === "integrate" && args[1] !== "--approve-write")) throw new Error("Integration requires work ID; enrollment additionally requires --approve-write.");
    const config = await loadConfiguration();
    const app = await GitHubApp.create(config);
    await app.verify();
    const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
    if (command === "integration-inspect") {
      console.log(JSON.stringify(await inspectIntegration(github, args[0]), null, 2));
      return;
    }
    const redis = connectValkey(config.VALKEY_URL ?? "");
    redis.on("error", () => {});
    let lease: Lease | null = null;
    try {
      await redis.connect();
      const { workIdSchema } = await import("./contracts/index.js");
      const workId = workIdSchema.parse(args[0]);
      lease = await Lease.acquire(redis, `integration:${config.GITHUB_REPOSITORY.replace("/", ":")}:${workId}`);
      if (!lease) throw new Error("Another integrator holds this work item.");
      lease.heartbeat(() => {});
      console.log(JSON.stringify(await enqueueIntegration(github, workId, lease), null, 2));
    } finally { if (lease) await lease.release().catch(() => {}); redis.disconnect(); }
    return;
  }
  if (command === "fit-commit" || command === "fit-publish") {
    if (args.length !== 2 || args[1] !== "--approve-write" || args[0].startsWith("--")) throw new Error("Fit writes require a draft JSON file or work ID and explicit --approve-write.");
    await fitWriteCommand(await loadConfiguration(), command === "fit-commit" ? "commit" : "publish", args[0]);
    return;
  }
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
    console.log(JSON.stringify({ scope: report.scope, verification: report.verification, total: report.total, recordedPasses: report.recordedPasses, deferredCases: report.deferredCases }));
    console.table(report.entries.map(entry => ({ case: entry.caseId, status: entry.status, reason: entry.reason })));
    process.exitCode = report.allRecordedPassed ? 0 : 2;
    return;
  }
  if (command === "acceptance-status" || command === "acceptance-report") {
    if (args.length > 1) throw new Error("Acceptance reporting accepts at most one registry path.");
    const registry = JSON.parse(await readFile(args[0] ?? "docs/product-008/evidence.json", "utf8"));
    const report = activeScopeReport(registry);
    if (command === "acceptance-status") {
      console.log(JSON.stringify({ scope: "stage-A", activePassed: report.activePassed, activeTotal: report.activeTotal, deferredCases: report.deferredCases, verification: "registry-validation-only; live evidence is not independently verified" }, null, 2));
    } else {
      console.log(renderAcceptanceReport(registry, { generatedAt: new Date().toISOString(), commands: ["pnpm run typecheck", "pnpm run build", "pnpm run harness -- doctor", "pnpm run harness -- lease-probe"] }));
    }
    process.exitCode = report.activePassed === report.activeTotal ? 0 : 2;
    return;
  }
  if (command === "webhook-dispatch") {
    if (args.length !== 4) throw new Error("Webhook dispatch requires payload file, event name, delivery ID and GitHub signature.");
    const config = await loadConfiguration();
    if (!config.SAFI_WEBHOOK_SECRET) throw new Error("SAFI_WEBHOOK_SECRET is required for webhook dispatch.");
    const result = await dispatchWebhook({ body: await readFile(args[0]), headers: { event: args[1], deliveryId: args[2], signature: args[3] }, secret: config.SAFI_WEBHOOK_SECRET, repository: config.GITHUB_REPOSITORY }, new MemoryDeliveryStore(), async event => console.log(JSON.stringify(boundedWakeup(event))));
    console.log(JSON.stringify(result));
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
    const result = await (await import("./workers/index.js")).runRole(command, args);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = ["completed", "no-work"].includes(String(result.status)) ? 0 : 2;
    return;
  }
  console.log("Safi Product 008\nCommands: doctor [--ai-probe], ai-propose <input.json> --approve-cost, intake <request.json> --approve-write, intake-issue <number> --approve-write, reconcile [--once|--watch] [--after work/id] [--event file.json], fit-review <work-id>, fit-commit <draft.json> --approve-write, fit-publish <work-id> --approve-write, evidence [registry] [--stage-a], acceptance-status [registry], acceptance-report [registry], webhook-dispatch <payload.json> <event> <delivery-id> <sha256=signature>, discover [--pat], lease-probe\nProtected execution: runner-prepare <control-sha> <official-image@digest> --approve-reviewed-control-build; runner-smoke <record.json>; runner-test <candidate-sha> <record.json>\nWorkers: fitter --paths <comma-separated-paths> --approve-write --approve-cost; developer --approve-write; tester --runner <record.json> --approve-write; triager --approve-write --approve-cost; fixer --approve-write. Optional --once (default), --watch (20 bounded cycles), --event <hint.json>, --session-minutes <1..120>.\nHuman actions: session-action <directory> <private-action.json>; diagnosis-review <directory> <approve|cancel> --approve-review\nIntegration: integration-inspect <work-id>; integrate <work-id> --approve-write (native protected merge queue only)\nRelease/S3/Product 007 are deferred. Live SOW acceptance requires actual execution, not offline checks.");
  if (command) process.exitCode = 2;
}
main().catch(error => { console.error(safeFailure(error)); process.exitCode = 1; });
