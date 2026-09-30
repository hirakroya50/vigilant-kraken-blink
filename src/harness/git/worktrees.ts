import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { shaSchema, roleSchema } from "../contracts/index.js";
import type { Lease } from "../coordination/lease.js";
const exec = promisify(execFile);
export async function git(repository: string, args: string[]) {
  const { stdout } = await exec("git", ["-C", resolve(repository), ...args], { maxBuffer: 8 * 1024 * 1024, timeout: 30000, env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: "0" } });
  return stdout.trim();
}
export async function prepareWorktree(repository: string, root: string, role: string, sha: string) {
  shaSchema.parse(sha); roleSchema.parse(role);
  const base = resolve(root);
  if (base === resolve(repository) || base.startsWith(resolve(repository) + "/")) throw new Error("Worktree root must be outside the trusted repository.");
  if (await git(repository, ["rev-parse", `${sha}^{commit}`]) !== sha) throw new Error("Candidate SHA is not a local commit; fetch it through the authorized control plane first.");
  await mkdir(base, { recursive: true });
  const path = join(base, `${role}-${sha}-${randomUUID()}`);
  await git(repository, ["worktree", "add", "--detach", path, sha]);
  return path;
}
export async function pushExpectedHead(repository: string, branch: string, expected: string, candidate: string, lease: Lease) {
  shaSchema.parse(expected); shaSchema.parse(candidate);
  if (!/^work\/[a-z0-9-]+$/.test(branch)) throw new Error("Only work branches may be updated.");
  if (candidate === expected) throw new Error("Completion must produce a new candidate.");
  await git(repository, ["merge-base", "--is-ancestor", expected, candidate]);
  await lease.assertOwned();
  await git(repository, ["push", `--force-with-lease=refs/heads/${branch}:${expected}`, "origin", `${candidate}:refs/heads/${branch}`]);
}
