import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { validateConfiguration, loadConfiguration, ConfigurationError } from "../config/index.js";
import { readAppKey } from "../auth/github-app.js";
import { safeFailure } from "../logging/index.js";
import { GitHub } from "../git/github.js";
import type { Lease } from "../coordination/lease.js";
import type { checkSchema } from "../contracts/index.js";
import type { z } from "zod";

const base = { GITHUB_REPOSITORY: "hirakroya50/vigilant-kraken-blink" };
test("configuration defaults, malformed IDs/URLs and browser-exposed secrets", () => {
  assert.equal(validateConfiguration(base).OPENAI_MODEL, "gpt-4.1");
  for (const env of [{ SAFI_GITHUB_APP_ID: "client-secret" }, { SAFI_GITHUB_INSTALLATION_ID: "9007199254740993" }, { VALKEY_URL: "https://secret:password@example.com" }, { VITE_OPENAI_API_KEY: "secret" }]) {
    assert.throws(() => validateConfiguration({ ...base, ...env }), ConfigurationError);
  }
  assert.throws(() => validateConfiguration({ ...base, SAFI_GITHUB_APP_ID: "secret-value" }), error => !String(error).includes("secret-value"));
});
test("dotenv loads explicitly, respects environment, and does not mutate it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "safi-config-"));
  try {
    await writeFile(join(dir, ".env"), "GITHUB_REPOSITORY=a/b\nOPENAI_MODEL=local-model\n");
    const env = { ...base, OPENAI_MODEL: "override-model" };
    const copy = { ...env };
    assert.equal((await loadConfiguration(join(dir, ".env"), env)).OPENAI_MODEL, "override-model");
    assert.deepEqual(env, copy);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("private keys must be external, owner-only RSA files, not secrets or EC keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "safi-key-"));
  const root = await mkdtemp(join(tmpdir(), "safi-root-"));
  try {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const file = join(dir, "app.pem");
    await writeFile(file, rsa, { mode: 0o600 });
    assert.equal(await readAppKey(file, root), rsa);
    await assert.rejects(readAppKey(file, dir), ConfigurationError);
    const open = join(dir, "open.pem");
    await writeFile(open, rsa, { mode: 0o644 });
    await assert.rejects(readAppKey(open, root), ConfigurationError);
    const bad = join(dir, "secret.pem");
    await writeFile(bad, "not-a-key-secret", { mode: 0o600 });
    await assert.rejects(readAppKey(bad, root), ConfigurationError);
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await writeFile(bad, ec);
    await assert.rejects(readAppKey(bad, root), ConfigurationError);
  } finally { await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});
test("provider diagnostics suppress payloads and stack traces", () => {
  assert.equal(safeFailure(new Error("token=secret https://password@example.com" )).includes("secret"), false);
  assert.match(safeFailure({ status: 429, message: "secret" }), /quota/);
  assert.match(safeFailure({ status: 401 }), /Authentication/);
});
test("PAT cannot publish or spoof publication authority", async () => {
  assert.throws(() => new GitHub("a/b", "pat", async () => ({ appId: 42 })), /PAT/);
  const github = new GitHub("a/b", "pat");
  await assert.rejects(github.publish({} as z.infer<typeof checkSchema>, {} as Lease), /discovery PAT is read-only/);
});
