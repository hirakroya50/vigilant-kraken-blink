import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { shaSchema } from "../contracts/index.js";

const exec = promisify(execFile);
export class RunnerError extends Error {}
export type SnapshotFile = { path: string; mode: string; oid: string; data: Buffer };
export function validateSnapshotPath(path: string) {
  if (!/^[a-zA-Z0-9_./@-]+$/.test(path) || /[\r\n]/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || part === ".git" || part === "node_modules") || (path !== ".env.example" && /(^|\/)\.env($|\.)|\.(pem|key)$/i.test(path))) throw new RunnerError("Snapshot contains an unsafe path or credential file.");
}
export function parseTree(raw: string) {
  const fields = raw.split("\0");
  if (fields.pop() !== "") throw new RunnerError("Git tree is not NUL terminated.");
  return fields.map(field => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(field);
    if (!match) throw new RunnerError("Snapshot rejects symlinks, submodules and malformed tree entries.");
    validateSnapshotPath(match[3]);
    return { path: match[3], mode: match[1], oid: match[2] };
  });
}
async function gitBytes(repository: string, args: string[], maxBuffer = 8 * 1024 * 1024) {
  const result = await exec("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-C", resolve(repository), ...args], { encoding: "buffer", timeout: 30000, maxBuffer, env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: "0" } });
  return result.stdout;
}
export async function readSnapshot(repository: string, sha: string): Promise<SnapshotFile[]> {
  shaSchema.parse(sha);
  if ((await gitBytes(repository, ["rev-parse", `${sha}^{commit}`])).toString().trim() !== sha) throw new RunnerError("Snapshot requires a fetched exact commit SHA.");
  const entries = parseTree((await gitBytes(repository, ["ls-tree", "-r", "-z", "--full-tree", sha])).toString("utf8"));
  if (entries.length > 5000) throw new RunnerError("Snapshot exceeds file count limit.");
  const files: SnapshotFile[] = []; let total = 0;
  for (const entry of entries) {
    const data = await gitBytes(repository, ["cat-file", "blob", entry.oid]);
    total += data.length;
    if (total > 64 * 1024 * 1024) throw new RunnerError("Snapshot exceeds 64 MiB limit.");
    files.push({ ...entry, data });
  }
  return files;
}
export function snapshotDigest(files: SnapshotFile[]) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    hash.update(JSON.stringify([file.path, file.mode, file.oid, createHash("sha256").update(file.data).digest("hex")]));
    hash.update("\n");
  }
  return hash.digest("hex");
}
export function isProtectedFile(path: string) {
  return ["src/harness/", "src/tests/", ".github/"].some(prefix => path.startsWith(prefix)) || /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|playwright\.config\.ts|tsconfig[^/]*|vite\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|AI_RULES\.md|\.env\.example)$/.test(path);
}
export function assertProtectedSnapshot(control: SnapshotFile[], candidate: SnapshotFile[]) {
  const trusted = new Map(control.filter(file => isProtectedFile(file.path)).map(file => [file.path, `${file.mode}:${file.oid}`]));
  const proposed = new Map(candidate.filter(file => isProtectedFile(file.path)).map(file => [file.path, `${file.mode}:${file.oid}`]));
  if (trusted.size !== proposed.size || [...trusted].some(([path, identity]) => proposed.get(path) !== identity)) throw new RunnerError("Candidate changed protected tests, runner, dependencies or configuration; separate control review required.");
}
export async function exportFiles(root: string, files: SnapshotFile[]) {
  // root is a newly created private directory owned by the trusted runner.
  for (const file of files) {
    validateSnapshotPath(file.path);
    const path = join(root, file.path);
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    await writeFile(path, file.data, { flag: "wx", mode: 0o644 });
  }
}
