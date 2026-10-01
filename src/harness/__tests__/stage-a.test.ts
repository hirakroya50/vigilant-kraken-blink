import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRegistry, stageACases } from "../evidence/registry.js";
import { assertPermittedDiff } from "../contracts/index.js";
import { validateRawDiff } from "../git/candidate-diff.js";
import { git, validateCandidateDiff } from "../git/worktrees.js";

const path = "src/pages/Menu.tsx";
const raw = (before: string, after: string, status: string, name = path) => `:${before} ${after} ${"a".repeat(40)} ${"b".repeat(40)} ${status}\0${name}\0`;
test("Stage A selects exactly its 15 cases while retaining Stage B in the registry", () => {
  const registry = Array.from({ length: 22 }, (_, index) => ({ caseId: index + 1, status: "blocked", timestamp: new Date().toISOString(), workers: [], checkUrls: [], logs: [], artifacts: [], reason: "not executed" }));
  const report = inspectRegistry(registry, "A");
  assert.equal(report.total, 15); assert.equal(report.recordedPasses, 0); assert.equal(report.allRecordedPassed, false);
  assert.deepEqual(report.entries.map(entry => entry.caseId), [...stageACases]);
  assert.match(report.verification, /not independently verified/); assert.equal(registry.length, 22);
  assert.equal(inspectRegistry(registry).total, 22);
  assert.throws(() => inspectRegistry(registry.slice(0, 15), "A"));
  assert.throws(() => inspectRegistry([...registry.slice(0, 21), registry[0]], "A"));
});
test("raw diff permits only explicit ordinary application changes", () => {
  assert.deepEqual(validateRawDiff(raw("100644", "100644", "M"), [path]), [path]);
  assert.throws(() => validateRawDiff("", [path]));
  assert.throws(() => validateRawDiff(raw("100644", "100644", "M").slice(0, -1), [path]));
  assert.throws(() => validateRawDiff(raw("100644", "100644", "R100"), [path]));
});
for (const mode of ["120000", "160000", "100755"]) {
  test(`raw diff rejects forbidden Git mode ${mode}`, () => {
    assert.throws(() => validateRawDiff(raw("100644", mode, "T"), [path]));
    assert.throws(() => validateRawDiff(raw(mode, "000000", "D"), [path]));
  });
}
test("Fit cannot authorize credentials, lockfiles, control paths or noncanonical paths", () => {
  for (const name of [".env", "pnpm-lock.yaml", ".git/config", "src/tests/browser/shop.spec.ts", "src/pages/../Menu.tsx", "src/pages//Menu.tsx", "src/pages/Menu.tsx\n"]) {
    assert.throws(() => assertPermittedDiff([name], [name]));
  }
});

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "safi-diff-"));
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Offline test"]);
  await git(root, ["config", "user.email", "offline@example.invalid"]);
  await mkdir(join(root, "src/pages"), { recursive: true });
  await mkdir(join(root, "src/tests"), { recursive: true });
  await writeFile(join(root, path), "export const menu = 1;\n");
  await writeFile(join(root, "src/tests/protected.ts"), "protected acceptance\n");
  await git(root, ["add", "."]); await git(root, ["commit", "-m", "baseline"]);
  return { root, baseline: await git(root, ["rev-parse", "HEAD"]) };
}
async function commit(root: string) {
  await git(root, ["add", "-A"]); await git(root, ["commit", "-m", "candidate"]);
  return git(root, ["rev-parse", "HEAD"]);
}
test("actual Git exact-SHA diff accepts normal application edits", async () => {
  const f = await repository();
  try {
    await writeFile(join(f.root, path), "export const menu = 2;\n");
    const sha = await commit(f.root);
    assert.deepEqual(await validateCandidateDiff(f.root, f.baseline, sha, [path]), [path]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("actual Git symlink change is rejected", async () => {
  const f = await repository();
  try {
    await rm(join(f.root, path)); await symlink("../../.env", join(f.root, path));
    const sha = await commit(f.root);
    await assert.rejects(validateCandidateDiff(f.root, f.baseline, sha, [path]), /symlinks/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("actual Git rename cannot hide deletion of a protected test", async () => {
  const f = await repository();
  try {
    const destination = "src/pages/Acceptance.ts";
    await rename(join(f.root, "src/tests/protected.ts"), join(f.root, destination));
    const sha = await commit(f.root);
    await assert.rejects(validateCandidateDiff(f.root, f.baseline, sha, [destination]));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
