import test from "node:test";
import assert from "node:assert/strict";
import { assertPermittedDiff, evidenceSchema, shaSchema } from "../contracts/index.js";
import { candidateState } from "../eligibility/index.js";
const a = "a".repeat(40); const b = "b".repeat(40);
test("contract accepts full SHA only", () => { assert.equal(shaSchema.safeParse(a).success, true); assert.equal(shaSchema.safeParse("abc123").success, false); });
test("new candidates inherit no qualification", () => {
  const checks = ["fit", "developer", "build", "test", "regression"].map((name, id) => ({ name: `safi/${name}`, head_sha: a, app: { id: 42 }, status: "completed", conclusion: "success", id }));
  assert.equal(candidateState(a, checks, 42).qualified, true);
  assert.equal(candidateState(b, checks, 42).qualified, false);
  assert.equal(candidateState(a, checks, 9).qualified, false);
});
test("protected tests cannot be authorized by candidate Fit", () => {
  assert.throws(() => assertPermittedDiff(["src/tests/browser/shop.spec.ts"], ["src/tests/browser/shop.spec.ts"]));
  assert.throws(() => assertPermittedDiff(["src/pages/../../tests/x"], ["src/pages/../../tests/x"]));
  assert.doesNotThrow(() => assertPermittedDiff(["src/pages/Menu.tsx"], ["src/pages/Menu.tsx"]));
});
test("mock or missing evidence cannot be marked live passed", () => {
  assert.equal(evidenceSchema.safeParse({ caseId: 2, status: "passed", timestamp: new Date().toISOString(), workers: [], checkUrls: [], logs: [], artifacts: [], reason: "unit test" }).success, false);
});
test("later failed rerun takes precedence", () => {
  const checks = [{ name: "safi/fit", head_sha: a, app: { id: 42 }, status: "completed", conclusion: "success", id: 1 }, { name: "safi/fit", head_sha: a, app: { id: 42 }, status: "completed", conclusion: "failure", id: 2 }];
  assert.equal(candidateState(a, checks, 42).developer, false);
});
