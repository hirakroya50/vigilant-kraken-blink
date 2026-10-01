import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { hostname } from "node:os";
import { chromium } from "@playwright/test";
import OpenAI from "openai";
import type { Configuration } from "./config/index.js";
import { ConfigurationError } from "./config/index.js";
import { GitHubApp } from "./auth/github-app.js";
import { connectValkey } from "./coordination/lease.js";
import { emitDiagnostic, safeFailure, type Diagnostic } from "./logging/index.js";

const exec = promisify(execFile);
export async function doctor(config: Configuration, aiProbe = false) {
  const results: Diagnostic[] = [];
  async function probe(check: string, operation: () => Promise<string>) {
    let result: Diagnostic;
    try { result = { check, status: "passed", detail: await operation() }; }
    catch (error) { result = { check, status: "blocked", detail: safeFailure(error) }; }
    results.push(result); emitDiagnostic(result);
  }
  await probe("github-app", async () => JSON.stringify(await (await GitHubApp.create(config)).verify()));
  if (config.GITHUB_TOKEN) emitDiagnostic({ check: "pat", status: "blocked", detail: "Development discovery fallback configured; never authorized for trusted qualification." });
  await probe("valkey-readiness", async () => {
    if (!config.VALKEY_URL) throw new ConfigurationError(["VALKEY_URL"]);
    const redis = connectValkey(config.VALKEY_URL);
    redis.on("error", () => {});
    try { await redis.connect(); if (await redis.ping() !== "PONG") throw new Error(); }
    finally { redis.disconnect(); }
    return "PING succeeded; no keys written. Lease behavior requires separate integration evidence.";
  });
  await probe("openai-model", async () => {
    if (!config.OPENAI_API_KEY) throw new ConfigurationError(["OPENAI_API_KEY"]);
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 15000, maxRetries: 0 });
    await client.models.retrieve(config.OPENAI_MODEL);
    return `Model ${config.OPENAI_MODEL} visible; inference and billing not established by discovery.`;
  });
  await probe("openai-inference", async () => {
    if (!aiProbe) throw new ConfigurationError(["inference not exercised; doctor --ai-probe authorizes a bounded paid probe"]);
    if (!config.OPENAI_API_KEY) throw new ConfigurationError(["OPENAI_API_KEY"]);
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 15000, maxRetries: 0 });
    const response = await client.chat.completions.create({ model: config.OPENAI_MODEL, messages: [{ role: "user", content: "Reply with OK only." }], max_completion_tokens: 8 });
    if (response.choices[0]?.message.content?.trim() !== "OK") throw new ConfigurationError(["inference probe output"]);
    return "Bounded inference succeeded; this is access evidence, not reviewed Fit or SOW evidence.";
  });
  await probe("docker", async () => {
    await exec("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 15000, maxBuffer: 65536, env: { PATH: process.env.PATH } });
    return "Daemon responds. Snapshot isolation and protected acceptance execution not yet qualified.";
  });
  await probe("chromium", async () => {
    await access(chromium.executablePath());
    const browser = await chromium.launch({ headless: true, timeout: 15000 });
    try { await browser.newPage(); } finally { await browser.close(); }
    return "Local Chromium launches; this is readiness, not candidate browser acceptance.";
  });
  emitDiagnostic({ check: "runner", status: "passed", detail: `${hostname()} (${process.platform}/${process.arch}); operator must attest this is the reviewed trusted Mac.` });
  return results.every(result => result.status === "passed");
}
