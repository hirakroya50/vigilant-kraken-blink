import { execFile as nodeExecFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { shaSchema, workIdSchema } from "../contracts/index.js";
import { RunnerError } from "../testing/snapshot.js";

const execFile = promisify(nodeExecFile);
const githubRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const branchSchema = /^work\/[a-z0-9][a-z0-9-]{0,63}$/;

type GitRunner = (args: string[]) => Promise<string>;
export type SyncRequest = {
  repository: string;
  branch: string;
  sha: string;
  expectedRepository?: string;
  baseSha?: string;
  remote?: string;
};
export type SyncResult = {
  repository: string;
  remote: string;
  branch: string;
  sha: string;
  fetched: boolean;
  ref: string;
};

export function normalizeRepository(value: string) {
  const normalized = value.trim().replace(/\.git$/, "").replace(/^https?:\/\//, "").replace(/^github\.com\//, "").replace(/^git@github\.com:/, "");
  if (!githubRepository.test(normalized) || normalized.includes("@") || normalized.includes("://")) throw new RunnerError("Synchronization requires a canonical GitHub owner/repository.");
  return normalized.toLowerCase();
}

export function assertAuthorizedRemote(remoteUrl: string, expectedRepository: string) {
  const expected = normalizeRepository(expectedRepository);
  let remote: URL | null = null;
  try {
    if (remoteUrl.startsWith("git@github.com:")) return assertRemotePath(remoteUrl.slice("git@github.com:".length), expected);
    remote = new URL(remoteUrl);
  } catch {
    throw new RunnerError("Synchronization remote is not a supported GitHub URL.");
  }
  if (remote.hostname.toLowerCase() !== "github.com" || remote.username || remote.password || (remote.protocol !== "https:" && remote.protocol !== "ssh:")) throw new RunnerError("Synchronization remote must be credential-free github.com HTTPS or SSH.");
  return assertRemotePath(remote.pathname, expected);
}

function assertRemotePath(pathname: string, expected: string) {
  const actual = pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  if (!githubRepository.test(actual) || actual.toLowerCase() !== expected) throw new RunnerError("Synchronization remote repository does not match configured repository.");
  return expected;
}

function safeGitEnvironment() {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
}

function gitArguments(repository: string, args: string[]) {
  return ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "credential.helper=", "-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never", "-C", repository, ...args];
}

async function defaultGit(repository: string, args: string[]) {
  const result = await execFile("git", gitArguments(repository, args), { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024, env: safeGitEnvironment() });
  return result.stdout;
}

function parseRef(output: string, ref: string) {
  const lines = output.trim().split("\n").filter(Boolean).map(line => line.split(/\s+/));
  const matches = lines.filter(parts => parts[1] === ref);
  if (matches.length !== 1 || !/^[a-f0-9]{40}$/.test(matches[0][0])) throw new RunnerError("Remote branch resolution was missing or ambiguous.");
  return matches[0][0];
}

export async function synchronizeCandidate(request: SyncRequest, runGit: GitRunner = args => defaultGit(resolve(request.repository), args)) {
  const repository = await realpath(resolve(request.repository));
  const expectedRepository = normalizeRepository(request.expectedRepository ?? request.repository);
  const branch = request.branch;
  const sha = shaSchema.parse(request.sha);
  if (!branchSchema.test(branch) || !workIdSchema.safeParse(branch.slice(5)).success) throw new RunnerError("Synchronization requires a canonical work branch.");
  if (request.baseSha) shaSchema.parse(request.baseSha);
  const remoteName = request.remote ?? "origin";
  if (!/^[A-Za-z0-9_.-]{1,32}$/.test(remoteName)) throw new RunnerError("Synchronization remote name is invalid.");
  const remoteUrl = (await runGit(["remote", "get-url", remoteName])).trim();
  assertAuthorizedRemote(remoteUrl, expectedRepository);
  const ref = `refs/heads/${branch}`;
  const before = parseRef(await runGit(["ls-remote", remoteName, ref]), ref);
  if (before !== sha) throw new RunnerError("Remote branch does not point at the requested exact SHA.");
  await runGit(["fetch", "--no-tags", "--no-write-fetch-head", remoteName, `+${sha}:refs/safi/sync/${sha}`]);
  const resolved = (await runGit(["rev-parse", `${sha}^{commit}`])).trim();
  if (resolved !== sha) throw new RunnerError("Fetched object is not the requested exact SHA commit.");
  if ((await runGit(["cat-file", "-t", sha])).trim() !== "commit") throw new RunnerError("Requested exact SHA is not a complete commit object.");
  if (request.baseSha && (await runGit(["merge-base", "--is-ancestor", request.baseSha, sha])).trim() !== "") throw new RunnerError("Candidate is not descended from the expected base SHA.");
  const after = parseRef(await runGit(["ls-remote", remoteName, ref]), ref);
  if (after !== before) throw new RunnerError("Remote branch moved during exact-SHA synchronization.");
  return { repository, remote: remoteName, branch, sha, fetched: true, ref: `refs/safi/sync/${sha}` } satisfies SyncResult;
}

export function syncEnvironment() {
  return { credentialInput: "disabled", systemConfig: "disabled", globalConfig: "disabled", hooks: "disabled", fsmonitor: "disabled", terminalPrompt: "disabled" } as const;
}
