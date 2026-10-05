import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { GitHubApp } from "../auth/github-app.js";
import { GitHub } from "../git/github.js";
import { loadConfiguration } from "../config/index.js";
import { connectValkey, Lease } from "../coordination/lease.js";
import { OpenAIAdapter } from "../ai/openai.js";
import { readWakeup } from "../events/wakeup.js";
import { safeFailure } from "../logging/index.js";
import { pollingBackoff } from "../work/command.js";
import { WorkError } from "../work/records.js";
import { discoverEligible, type WorkTarget } from "./discovery.js";
import { workerOptions, type WorkerRole } from "./options.js";
import { runFitter, runTester, runTriager, type RoleContext } from "./roles.js";
import { runHuman } from "./local-session.js";
import { synchronizeCandidate } from "../git/sync.js";

export { discoverEligible, claimNext } from "./discovery.js";
export { workerOptions } from "./options.js";
export async function runRole(roleName: string, args: string[] = [], repository = process.cwd()) {
  const options = workerOptions(roleName, args);
  const role = roleName as WorkerRole;
  const config = await loadConfiguration();
  const app = await GitHubApp.create(config);
  const identity = await app.verify();
  const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
  if (options.event) await readWakeup(options.event, config.GITHUB_REPOSITORY);
  const redis = connectValkey(config.VALKEY_URL ?? "");
  redis.on("error", () => {});
  const agentId = randomUUID();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const ai = options.approveCost && ["fitter", "triager"].includes(role) ? new OpenAIAdapter(config) : undefined;
  const log = (target: WorkTarget | undefined, action: string, result: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), role, agentId, workId: target?.workId ?? null, branch: target?.branch ?? null, commitSha: target?.sha ?? null, action, result, ...extra }));
  };
  let last: Record<string, unknown> = { status: "no-work", role };
  try {
    await redis.connect();
    for (let cycle = 0; cycle < (options.watch ? 20 : 1); cycle++) {
      controller.signal.throwIfAborted();
      let targets: WorkTarget[];
      try {
        targets = await discoverEligible(github, identity.appId, role, controller.signal);
      } catch (error) {
        if (!options.watch || controller.signal.aborted) throw error;
        const waitMs = pollingBackoff(error);
        log(undefined, "discovery", "blocked", { reason: safeFailure(error), retryAfterMs: waitMs });
        await delay(waitMs, undefined, { signal: controller.signal });
        continue;
      }
      let didWork = false;
      for (const target of targets) {
        controller.signal.throwIfAborted();
        try {
          await synchronizeCandidate({ repository: resolve(repository), expectedRepository: config.GITHUB_REPOSITORY, branch: target.branch, sha: target.sha });
          log(target, "synchronize", "validated");
        } catch (error) {
          log(target, "synchronize", "blocked", { reason: safeFailure(error) });
          continue;
        }
        const candidate = await Lease.acquire(redis, `${role}:${config.GITHUB_REPOSITORY.replace("/", ":")}:${target.sha}`);
        if (!candidate) { log(target, "claim", "collision-skipped"); continue; }
        log(target, "claim", "claimed", { leaseOwner: candidate.owner });
        let writer: Lease | null = null;
        const active = new AbortController();
        const abort = () => active.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        candidate.heartbeat(abort);
        try {
          if (["fitter", "developer", "fixer"].includes(role)) {
            writer = await Lease.acquire(redis, `writer:${config.GITHUB_REPOSITORY.replace("/", ":")}:${target.workId}`);
            if (!writer) { log(target, "writer-claim", "collision-skipped"); continue; }
            writer.heartbeat(abort);
          }
          const assertActive = async () => {
            active.signal.throwIfAborted(); await candidate.assertOwned(); await writer?.assertOwned(); active.signal.throwIfAborted();
          };
          await assertActive();
          if (await github.head(target.branch) !== target.sha) { log(target, "revalidate", "stale-skipped"); continue; }
          const ctx: RoleContext = { github, config, repository: resolve(repository), appId: identity.appId, role, target, lease: candidate, signal: active.signal, options, ai, assertActive, log: (action, result, extra) => log(target, action, result, extra) };
          log(target, "execute", "started", { leaseOwner: candidate.owner });
          const result = role === "fitter" ? await runFitter(ctx) : role === "tester" ? await runTester(ctx) : role === "triager" ? await runTriager(ctx) : await runHuman(ctx);
          await assertActive();
          log(target, "execute", result.status, result);
          last = { role, ...result };
          didWork = true;
          break;
        } catch (error) {
          log(target, "execute", "blocked", { reason: safeFailure(error), cancelled: active.signal.aborted });
          // A privileged write may have reached GitHub. Stop; fresh Git truth, never blind write retry, is recovery.
          throw error;
        } finally {
          active.abort();
          controller.signal.removeEventListener("abort", abort);
          if (writer) await writer.release().catch(() => {});
          await candidate.release().catch(() => {});
        }
      }
      if (!didWork) { last = { status: "no-work", role }; log(undefined, "discover", "no-unclaimed-eligible-work"); }
      if (options.watch && cycle < 19) await delay(30000, undefined, { signal: controller.signal });
    }
    return last;
  } catch (error) {
    if (controller.signal.aborted) return { status: "cancelled", role, publishedSuccess: false };
    throw error;
  } finally {
    redis.disconnect();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
