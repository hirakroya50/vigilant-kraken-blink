import { createHash } from "node:crypto";
import type { GitHub } from "../git/github.js";
import { shaSchema } from "../contracts/index.js";

export class WorkError extends Error {}
export async function workRecords(github: GitHub, sha: string, signal?: AbortSignal) {
  shaSchema.parse(sha);
  signal?.throwIfAborted();
  const scope = { owner: github.owner, repo: github.repo };
  const commit = (await github.api.git.getCommit({ ...scope, commit_sha: sha })).data;
  if (commit.sha !== sha) throw new WorkError("Commit identity mismatch during reconstruction.");
  signal?.throwIfAborted();
  const tree = (await github.api.git.getTree({ ...scope, tree_sha: shaSchema.parse(commit.tree.sha), recursive: "1" })).data;
  if (tree.truncated) throw new WorkError("Work tree is truncated; reconstruction is blocked.");
  return async (path: string, required = false): Promise<unknown | undefined> => {
    signal?.throwIfAborted();
    const entry = tree.tree.find(file => file.path === path);
    if (!entry) {
      if (required) throw new WorkError("Required durable work record is missing.");
      return undefined;
    }
    if (entry.mode !== "100644" || entry.type !== "blob" || !entry.sha || !shaSchema.safeParse(entry.sha).success) throw new WorkError("Work record must be a non-executable regular Git blob.");
    if (!Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > 65536) throw new WorkError("Work record tree entry exceeds the bounded size policy.");
    const blob = (await github.api.git.getBlob({ ...scope, file_sha: entry.sha })).data;
    if (blob.sha !== entry.sha || blob.encoding !== "base64" || typeof blob.size !== "number" || !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > 65536 || blob.content.length > 100000) throw new WorkError("Work record identity, encoding or size is invalid.");
    const normalized = blob.content.replace(/\r?\n/g, "");
    const data = Buffer.from(normalized, "base64");
    const actualSha = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    if (data.length !== entry.size || data.length !== blob.size || data.length > 65536 || data.toString("base64") !== normalized || actualSha !== entry.sha) throw new WorkError("Work record bytes do not match the immutable Git blob.");
    try { return JSON.parse(data.toString("utf8")); } catch { throw new WorkError("Durable work record is invalid JSON."); }
  };
}
