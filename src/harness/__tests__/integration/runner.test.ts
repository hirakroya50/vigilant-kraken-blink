import test from "node:test";
import assert from "node:assert/strict";
import { readRunnerRecord } from "../../testing/prepare.js";
import { runnerSmoke } from "../../testing/smoke.js";
import { runProtected } from "../../testing/run.js";

const recordPath = process.env.SAFI_RUNNER_RECORD;
const candidateSha = process.env.SAFI_RUNNER_CANDIDATE_SHA;
test("live pinned Docker runner isolation smoke", { skip: !recordPath && "Explicit SAFI_RUNNER_RECORD is required; local Docker readiness is not execution evidence." }, async () => {
  const result = await runnerSmoke(await readRunnerRecord(recordPath!));
  assert.equal(result.status, "passed"); assert.equal(result.sowEvidence, false);
});
test("live exact-SHA protected production/browser acceptance", { skip: (!recordPath || !candidateSha) && "Explicit reviewed record and candidate SHA are required; no implicit current-HEAD qualification." }, async () => {
  const result = await runProtected(process.cwd(), candidateSha!, await readRunnerRecord(recordPath!));
  assert.equal(result.status, "passed", result.reason);
  assert.equal(result.browserSummary?.skipped, 0);
  assert.equal(result.qualificationPublished, false);
});
