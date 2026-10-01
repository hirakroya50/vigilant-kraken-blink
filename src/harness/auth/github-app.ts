import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { createPrivateKey } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { Configuration } from "../config/index.js";
import { ConfigurationError } from "../config/index.js";

export async function readAppKey(path: string, repositoryRoot = process.cwd()): Promise<string> {
  if (!isAbsolute(path)) throw new ConfigurationError(["SAFI_GITHUB_APP_PRIVATE_KEY_PATH must be absolute"]);
  let keyPath: string; let root: string;
  try { [keyPath, root] = await Promise.all([realpath(path), realpath(repositoryRoot)]); }
  catch { throw new ConfigurationError(["SAFI_GITHUB_APP_PRIVATE_KEY_PATH must point to a readable existing file"]); }
  const within = relative(root, keyPath);
  const outside = within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within);
  if (!outside) throw new ConfigurationError(["private key must be outside repository"]);
  let pem: string;
  try {
    const info = await stat(keyPath);
    if (!info.isFile() || ![0o600, 0o400].includes(info.mode & 0o777) || (process.getuid && info.uid !== process.getuid())) throw new ConfigurationError(["private key owner and mode (0600/0400 required)"]);
    if (info.size > 32768) throw new ConfigurationError(["private key exceeds expected PEM size"]);
    pem = await readFile(keyPath, "utf8");
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError(["private key file readability"]);
  }
  let key;
  try { key = createPrivateKey(pem); } catch { throw new ConfigurationError(["RSA PEM private key (not client secret)"]); }
  if (key.asymmetricKeyType !== "rsa") throw new ConfigurationError(["RSA PEM private key"]);
  return pem;
}

export class GitHubApp {
  readonly api: Octokit;
  private readonly auth;
  private constructor(readonly config: Configuration, privateKey: string, fetchImplementation?: typeof fetch) {
    const options = { timeout: 15000, ...(fetchImplementation ? { fetch: fetchImplementation } : {}) };
    const request = new Octokit({ request: options }).request;
    this.auth = createAppAuth({ appId: config.SAFI_GITHUB_APP_ID!, installationId: Number(config.SAFI_GITHUB_INSTALLATION_ID), privateKey, request });
    this.api = new Octokit({ authStrategy: createAppAuth, auth: { appId: config.SAFI_GITHUB_APP_ID, installationId: Number(config.SAFI_GITHUB_INSTALLATION_ID), privateKey }, request: options, userAgent: "safi-product-008" });
    this.appRequest = request;
  }
  private readonly appRequest: Octokit["request"];
  static async create(config: Configuration, fetchImplementation?: typeof fetch) {
    const missing = ["SAFI_GITHUB_APP_ID", "SAFI_GITHUB_INSTALLATION_ID", "SAFI_GITHUB_APP_PRIVATE_KEY_PATH"] as const;
    if (missing.some(key => !config[key])) throw new ConfigurationError(missing.filter(key => !config[key]));
    return new GitHubApp(config, await readAppKey(config.SAFI_GITHUB_APP_PRIVATE_KEY_PATH!), fetchImplementation);
  }
  async verify() {
    const jwt = await this.auth({ type: "app" });
    const headers = { authorization: `Bearer ${jwt.token}` };
    const app = await this.appRequest("GET /app", { headers });
    if (String(app.data?.id) !== this.config.SAFI_GITHUB_APP_ID) throw new ConfigurationError(["App identity mismatch"]);
    const installation = await this.appRequest("GET /app/installations/{installation_id}", { installation_id: Number(this.config.SAFI_GITHUB_INSTALLATION_ID), headers });
    if (String(installation.data.app_id) !== this.config.SAFI_GITHUB_APP_ID || installation.data.suspended_at) throw new ConfigurationError(["installation identity or suspension"]);
    const token = await this.auth({ type: "installation" });
    if (Date.parse(token.expiresAt) <= Date.now() + 60000) throw new ConfigurationError(["installation token expiry"]);
    const repositories = await this.api.paginate("GET /installation/repositories", { per_page: 100 });
    if (!repositories.some(repo => repo.full_name === this.config.GITHUB_REPOSITORY)) throw new ConfigurationError(["repository not in installation scope"]);
    const [owner, repo] = this.config.GITHUB_REPOSITORY.split("/");
    await this.api.repos.get({ owner, repo });
    const permissions = installation.data.permissions ?? {};
    const required = ["contents", "pull_requests", "checks"] as const;
    const missing = required.filter(name => permissions[name] !== "write" || token.permissions[name] !== "write");
    if (missing.length) throw new ConfigurationError(missing.map(name => `installation ${name}:write permission`));
    return { appId: app.data!.id, installationId: installation.data.id, expiresAt: token.expiresAt, permissions: required.map(name => `${name}:write`), writeExercise: "not performed; explicit approval required" };
  }
}
