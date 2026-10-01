import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubApp, readAppKey } from "../auth/github-app.js";
import { validateConfiguration, ConfigurationError } from "../config/index.js";

const permissions = { contents: "write", pull_requests: "write", checks: "write" };
let id = 7000;
async function fixture(options: { mismatchedApp?: boolean; suspended?: boolean; missingRepository?: boolean; tokenReadOnly?: boolean; expiredToken?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "safi-app-auth-"));
  const key = join(directory, "app.pem");
  await writeFile(key, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString(), { mode: 0o600 });
  const appId = ++id; const installationId = ++id;
  const config = validateConfiguration({ GITHUB_REPOSITORY: "a/b", SAFI_GITHUB_APP_ID: String(appId), SAFI_GITHUB_INSTALLATION_ID: String(installationId), SAFI_GITHUB_APP_PRIVATE_KEY_PATH: key });
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input)); requests.push(url.pathname);
    let data: unknown;
    if (url.pathname === "/app") data = { id: options.mismatchedApp ? appId + 1 : appId };
    else if (url.pathname === `/app/installations/${installationId}`) data = { id: installationId, app_id: appId, suspended_at: options.suspended ? new Date().toISOString() : null, permissions };
    else if (url.pathname === `/app/installations/${installationId}/access_tokens`) data = { token: "unit-installation-token", expires_at: new Date(Date.now() + (options.expiredToken ? -1000 : 3600000)).toISOString(), permissions: options.tokenReadOnly ? { ...permissions, checks: "read" } : permissions, repository_selection: "selected" };
    else if (url.pathname === "/installation/repositories") data = { total_count: options.missingRepository ? 0 : 1, repositories: options.missingRepository ? [] : [{ full_name: "a/b", id: 1 }] };
    else if (url.pathname === "/repos/a/b") data = { full_name: "a/b", id: 1 };
    else throw new Error("Unexpected offline auth route");
    const response = new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    // Actual fetch responses include the final URL, which Octokit pagination requires.
    Object.defineProperty(response, "url", { value: url.href });
    return response;
  };
  return { directory, config, requests, fetcher };
}
test("SDK App flow validates identity/scope/permissions without reporting token values", async () => {
  const f = await fixture();
  try {
    const app = await GitHubApp.create(f.config, f.fetcher);
    const result = await app.verify();
    assert.equal(result.appId, Number(f.config.SAFI_GITHUB_APP_ID));
    assert.equal(JSON.stringify(result).includes("unit-installation-token"), false);
    assert.match(result.writeExercise, /not performed/);
    assert.ok(f.requests.some(path => path.endsWith("/access_tokens")));
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
for (const option of ["mismatchedApp", "suspended", "missingRepository", "tokenReadOnly", "expiredToken"] as const) {
  test(`App rejects ${option} with field-only diagnostics`, async () => {
    const f = await fixture({ [option]: true });
    try { await assert.rejects((await GitHubApp.create(f.config, f.fetcher)).verify(), ConfigurationError); }
    finally { await rm(f.directory, { recursive: true, force: true }); }
  });
}
test("missing, relative or absent key paths are actionable without leaking paths", async () => {
  await assert.rejects(readAppKey("relative.pem"), error => error instanceof ConfigurationError && /absolute/.test(error.message));
  await assert.rejects(readAppKey("/nonexistent-sensitive-path/app.pem"), error => error instanceof ConfigurationError && !error.message.includes("nonexistent-sensitive-path"));
  await assert.rejects(GitHubApp.create(validateConfiguration({ GITHUB_REPOSITORY: "a/b" })), ConfigurationError);
});
