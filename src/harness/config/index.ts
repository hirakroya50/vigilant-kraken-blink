import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { z } from "zod";

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) { super(`Invalid or missing configuration: ${fields.join(", ")}`); }
}
const optional = z.preprocess(value => value === "" ? undefined : value, z.string().min(1).optional());
const id = z.preprocess(value => value === "" ? undefined : value, z.string().regex(/^[1-9]\d*$/).refine(value => Number.isSafeInteger(Number(value))).optional());
const schema = z.object({
  GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  SAFI_GITHUB_APP_ID: id,
  SAFI_GITHUB_INSTALLATION_ID: id,
  SAFI_GITHUB_APP_PRIVATE_KEY_PATH: optional,
  GITHUB_TOKEN: optional,
  VALKEY_URL: z.preprocess(value => value === "" ? undefined : value, z.string().url().refine(value => ["redis:", "rediss:"].includes(new URL(value).protocol)).optional()),
  OPENAI_API_KEY: optional,
  SAFI_WEBHOOK_SECRET: z.preprocess(value => value === "" ? undefined : value, z.string().min(1).max(256).optional()),
  OPENAI_MODEL: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/).default("gpt-4.1"),
});
export type Configuration = z.infer<typeof schema>;
export function validateConfiguration(env: Record<string, string | undefined>): Configuration {
  const exposed = Object.keys(env).filter(key => /^VITE_.*(TOKEN|SECRET|PRIVATE_KEY|OPENAI|VALKEY)/i.test(key));
  if (exposed.length) throw new ConfigurationError(exposed);
  const result = schema.safeParse(env);
  if (!result.success) throw new ConfigurationError([...new Set(result.error.issues.map(issue => issue.path.join(".")))]);
  return result.data;
}
export async function loadConfiguration(path = resolve(".env"), env: Record<string, string | undefined> = process.env) {
  let local: Record<string, string> = {};
  try { local = parse(await readFile(path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ConfigurationError([".env readability"]); }
  // The caller's environment wins; loading does not mutate process.env.
  return validateConfiguration({ ...local, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) });
}
