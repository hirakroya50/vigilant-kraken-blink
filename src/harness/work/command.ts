import { setTimeout as delay } from "node:timers/promises";
import type { Configuration } from "../config/index.js";
import { GitHubApp } from "../auth/github-app.js";
import { GitHub } from "../git/github.js";
import { readWakeup } from "../events/wakeup.js";
import { reconcileOnce, validateWorkBranch } from "./reconcile.js";
import { WorkError } from "./records.js";

export function pollingBackoff(error: unknown, now = Date.now()) {
  const headers = (error as { response?: { headers?: Record<string, string> } } | null)?.response?.headers ?? {};
  const retry = headers["retry-after"];
  const seconds = typeof retry === "string" && /^\d+$/.test(retry) ? Number(retry) * 1000 : typeof retry === "string" ? Date.parse(retry) - now : 0;
  const reset = headers["x-ratelimit-remaining"] === "0" && /^\d+$/.test(headers["x-ratelimit-reset"] ?? "") ? Number(headers["x-ratelimit-reset"]) * 1000 - now : 0;
  return Math.min(3600000, Math.max(30000, Number.isFinite(seconds) ? seconds : 0, Number.isFinite(reset) ? reset : 0));
}
export function reconciliationOptions(args: string[]) {
  let watch = false; let once = false; let after: string | undefined; let eventPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--watch" && !watch) watch = true;
    else if (flag === "--once" && !once) once = true;
    else if (flag === "--after" && after === undefined && args[index + 1] && !args[index + 1].startsWith("--")) after = args[++index];
    else if (flag === "--event" && eventPath === undefined && args[index + 1] && !args[index + 1].startsWith("--")) eventPath = args[++index];
    else throw new WorkError("Unknown, duplicate or incomplete reconciliation argument.");
  }
  if (watch && once) throw new WorkError("Select bounded --once or local --watch, not both.");
  if (after) validateWorkBranch(after);
  return { watch, after, eventPath };
}
export async function reconcileCommand(config: Configuration, options: ReturnType<typeof reconciliationOptions>) {
  const wakeup = options.eventPath ? await readWakeup(options.eventPath, config.GITHUB_REPOSITORY) : undefined;
  const app = await GitHubApp.create(config);
  const github = new GitHub(config.GITHUB_REPOSITORY, app.api, () => app.verify());
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  let after = options.after;
  try {
    do {
      let waitMs = 30000;
      try {
        const identity = await app.verify();
        if (controller.signal.aborted) break;
        const report = await reconcileOnce(github, identity.appId, after, controller.signal);
        console.log(JSON.stringify({ ...report, wakeup }, null, 2));
        if (!options.watch) {
          process.exitCode = report.observations.some(work => work.status === "blocked") || report.nextAfter ? 2 : 0;
          break;
        }
        after = report.nextAfter;
      } catch (error) {
        if (!options.watch || controller.signal.aborted) throw error;
        waitMs = pollingBackoff(error);
        console.log(JSON.stringify({ scope: "read-only-GitHub-reconciliation", status: "blocked", qualificationPublished: false, retryAfterMs: waitMs, reason: "Reconciliation temporarily unavailable; verify App access, rate limits and remote connectivity. No write performed." }));
      }
      await delay(waitMs, undefined, { signal: controller.signal });
    } while (!controller.signal.aborted);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
