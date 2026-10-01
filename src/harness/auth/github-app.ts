import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { createPrivateKey } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { Configuration } from "../config/index.js";
import { ConfigurationError } from "../config/index.js";

export async function readAppKey(path: string, repositoryRoot = process.cwd()): Promise<string> {
  const [keyPath, root] = await Promise.all([realpath(path), realpath(repositoryRoot)]);
  const within = relative(root, keyPath);
  const outside = within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within);
  if (!outside) throw new ConfigurationError(["private key must be outside repository"]);
  const info = await stat(keyPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new ConfigurationError(["private key owner and mode (0600/0400 required)"]);
  const pem = await readFile(keyPath, "utf8");
  let key;
  try { key = createPrivateKey(pem); } catch { throw new ConfigurationError(["RSA PEM private key (not client secret)"]); }
  if (key.asymmetricKeyType !== "rsa") throw new ConfigurationError(["RSA PEM private key"]);
  return pem;
}

export class GitHubApp {
  readonly api: Octokit;
  private readonly auth;
  private constructor(readonly config: Configuration, privateKey: string) {
    const request = new Octokit({ request: { timeout: 15000 } }).request;
    this.auth = createAppAuth({ appId: config.SAFI_GITHUB_APP_ID!, installationId: Number(config.SAFI_GITHUB_INSTALLATION_ID), privateKey, request });
    // The SDK hook refreshes installation tokens; errors and tokens never enter logs.
    this.api = new Octokit({ authStrategy: createAppAuth, auth: { appId: config.SAFI_GITHUB_APP_ID, installationId: Number(config.SAFI_GITHUB_INSTALLATION_ID), privateKey }, request: { timeout: 15000 }, userAgent: "safi-product-008" });
  }
  static async create(config: Configuration) {
    const missing = ["SAFI_GITHUB_APP_ID", "SAFI_GITHUB_INSTALLATION_ID", "SAFI_GITHUB_APP_PRIVATE_KEY_PATH"] as const;
    if (missing.some(key => !config[key])) throw new ConfigurationError(missing.filter(key => !config[key]));
    return new GitHubApp(config, await readAppKey(config.SAFI_GITHUB_APP_PRIVATE_KEY_PATH!));
  }
  async verify() {
    const jwt = await this.auth({ type: "app" });
    const appApi = new Octokit({ auth: jwt.token, request: { timeout: 15000 } });
    const app = await appApi.apps.getAuthenticated();
    if (String(app.data?.id) !== this.config.SAFI_GITHUB_APP_ID) throw new ConfigurationError(["App identity mismatch"]);
    const installation = await appApi.apps.getInstallation({ installation_id: Number(this.config.SAFI_GITHUB_INSTALLATION_ID) });
    if (String(installation.data.app_id) !== this.config.SAFI_GITHUB_APP_ID || installation.data.suspended_at) throw new ConfigurationError(["installation identity or suspension"]);
    const token = await this.auth({ type: "installation" });
    if (Date.parse(token.expiresAt) <= Date.now() + 60000) throw new ConfigurationError(["installation token expiry"]);
    const repositories = await this.api.paginate("GET /installation/repositories", { per_page: 100 });
    if (!repositories.some(repo => repo.full_name === this.config.GITHUB_REPOSITORY)) throw new ConfigurationError(["repository not in installation scope"]);
    const [owner, repo] = this.config.GITHUB_REPOSITORY.split("/");
    await this.api.repos.get({ owner, repo });
    const permissions = installation.data.permissions ?? {};
    const required = ["contents", "pull_requests", "checks"] as const;
    const missing = required.filter(name => permissions[name] !== "write");
    if (missing.length) throw new ConfigurationError(missing.map(name => `installation ${name}:write permission`));
    return { appId: app.data!.id, installationId: installation.data.id, expiresAt: token.expiresAt, permissions: required.map(name => `${name}:write`), writeExercise: "not performed; explicit approval required" };
  }
}
