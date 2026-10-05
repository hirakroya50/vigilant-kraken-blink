import { createHash } from "node:crypto";
import type { Lease } from "../coordination/lease.js";
import type { GitHub } from "../git/github.js";
import { git, validateCandidateDiff } from "../git/worktrees.js";
import { readSnapshot } from "../testing/snapshot.js";
import { diagnosisSchema } from "../contracts/index.js";
import { inspectCandidateFit } from "./candidate-fit.js";
import { HumanSession } from "./session-state.js";
import { WorkError } from "./records.js";

export async function inspectRepair(github: GitHub, workId: string, sha: string, allowedPaths: string[]) {
  const identity = await github.assertWriteAuthority({ async assertOwned() {} });
  const observed = (await github.checks(sha)).filter(check => check.app?.id === identity.appId && check.head_sha === sha).sort((a, b) => b.id - a.id);
  const checks = observed.filter((check, index) => observed.findIndex(other => other.name === check.name) === index);
  const failures = checks.filter(check => ["safi/build", "safi/test", "safi/regression"].includes(check.name) && check.status === "completed" && check.conclusion === "failure");
  const triage = checks.find(check => check.name === "safi/triage");
  if (!failures.length || !triage || triage.status !== "completed" || triage.conclusion !== "success" || !triage.output.summary || triage.output.summary.length > 60000) throw new WorkError("Fixer requires exact-SHA failure and trusted diagnosis evidence.");
  let input: unknown;
  try { input = JSON.parse(triage.output.summary); } catch { throw new WorkError("Diagnosis evidence is malformed."); }
  const diagnosis = diagnosisSchema.parse(input);
  const digest = createHash("sha256").update(triage.output.summary).digest("hex");
  if (triage.external_id !== `triage:${digest}` || diagnosis.workId !== workId || diagnosis.failedSha !== sha || !diagnosis.affectedFiles.every(path => allowedPaths.includes(path)) || !diagnosis.failureCheckUrls.every(url => failures.some(check => check.html_url === url))) throw new WorkError("Diagnosis is stale, untrusted or outside accepted Fit scope.");
  return { diagnosis, checkUrl: triage.html_url, digest };
}

export async function completeHumanSession(github: GitHub, session: HumanSession, candidateSha: string, roleLease: Lease, writerLease: { assertOwned(): Promise<void> }) {
  session.beginCompletion(session.handoff.sessionId, candidateSha);
  const handoff = session.handoff;
  const scope = { owner: github.owner, repo: github.repo };
  const revalidate = async () => {
    session.assertActive(); await roleLease.assertOwned(); await writerLease.assertOwned();
    if (await github.head(handoff.branch) !== handoff.expectedSha) throw new WorkError("Branch advanced; stale human edits were not applied.");
    const current = await inspectCandidateFit(github, handoff.workId, handoff.expectedSha);
    if (current.fitSha !== handoff.fitSha || current.lineage.fitDigest !== handoff.fitDigest || JSON.stringify(current.fit.allowedPaths) !== JSON.stringify(handoff.allowedPaths)) throw new WorkError("Accepted Fit changed during the human session.");
    if (handoff.role === "fixer") {
      const repair = await inspectRepair(github, handoff.workId, handoff.expectedSha, handoff.allowedPaths);
      if (JSON.stringify(repair.diagnosis) !== JSON.stringify(handoff.diagnosis)) throw new WorkError("Diagnosis changed during the repair session.");
    }
  };
  await revalidate();
  const checkout = handoff.checkout;
  if (await git(checkout, ["rev-parse", "HEAD"]) !== candidateSha || await git(checkout, ["status", "--porcelain", "--untracked-files=all"])) throw new WorkError("Completion requires a clean isolated checkout at the declared committed candidate.");
  const parents = (await git(checkout, ["rev-list", "--parents", "-n", "1", candidateSha])).split(" ");
  if (parents.length !== 2 || parents[1] !== handoff.expectedSha) throw new WorkError("Human completion must be one non-merge commit directly on the claimed SHA.");
  const paths = await validateCandidateDiff(checkout, handoff.expectedSha, candidateSha, handoff.allowedPaths);
  const snapshot = await readSnapshot(checkout, candidateSha);
  const selected = paths.map(path => snapshot.find(file => file.path === path));
  if (selected.some(file => file && (file.mode !== "100644" || file.data.length > 1024 * 1024)) || selected.reduce((total, file) => total + (file?.data.length ?? 0), 0) > 4 * 1024 * 1024) throw new WorkError("Human completion exceeds regular-file publication bounds.");
  const base = (await github.api.git.getCommit({ ...scope, commit_sha: handoff.expectedSha })).data;
  const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
  for (let i = 0; i < paths.length; i++) {
    const file = selected[i];
    await github.assertWriteAuthority({ assertOwned: async () => { session.assertActive(); await roleLease.assertOwned(); await writerLease.assertOwned(); } });
    if (file) {
      const blob = (await github.api.git.createBlob({ ...scope, content: file.data.toString("base64"), encoding: "base64" })).data;
      if (blob.sha !== file.oid) throw new WorkError("Uploaded application bytes have a different Git identity.");
      tree.push({ path: paths[i], mode: "100644", type: "blob", sha: blob.sha });
    } else tree.push({ path: paths[i], mode: "100644", type: "blob", sha: null });
  }
  await revalidate();
  const newTree = (await github.api.git.createTree({ ...scope, base_tree: base.tree.sha, tree })).data;
  if (newTree.sha !== await git(checkout, ["rev-parse", `${candidateSha}^{tree}`])) throw new WorkError("Remote implementation tree differs from the committed human candidate.");
  await revalidate();
  const commit = (await github.api.git.createCommit({ ...scope, message: `SAFI ${handoff.role} ${handoff.workId}\n\nHuman session: ${handoff.sessionId}\nSource commit: ${candidateSha}`, tree: newTree.sha, parents: [handoff.expectedSha] })).data;
  await revalidate();
  await github.assertWriteAuthority({ assertOwned: async () => { session.assertActive(); await roleLease.assertOwned(); await writerLease.assertOwned(); } });
  await github.api.git.updateRef({ ...scope, ref: `heads/${handoff.branch}`, sha: commit.sha, force: false });
  // Git history is durable if publication is interrupted here; no test success is inherited.
  const freshFit = async () => {
    session.assertActive(); await writerLease.assertOwned();
    const fit = await inspectCandidateFit(github, handoff.workId, commit.sha);
    if (fit.fitSha !== handoff.fitSha || fit.lineage.fitDigest !== handoff.fitDigest) throw new WorkError("New candidate no longer conforms to its accepted Fit lineage.");
  };
  const summary = JSON.stringify({ version: 1, role: handoff.role, workId: handoff.workId, sessionId: handoff.sessionId, acknowledged: true, operatorBoundary: handoff.operatorBoundary, expectedSha: handoff.expectedSha, localSourceSha: candidateSha, candidateSha: commit.sha, fitSha: handoff.fitSha, fitDigest: handoff.fitDigest, paths, testsPassed: false, releaseQualified: false }, null, 2);
  const evidenceId = `session:${createHash("sha256").update(summary).digest("hex")}`;
  const checkUrl = await github.publish({ name: `safi/${handoff.role}`, sha: commit.sha, conclusion: "success", title: "Human implementation committed; new testing required", summary, evidenceId }, roleLease, freshFit);
  await freshFit(); await roleLease.assertOwned();
  session.completed();
  return { workId: handoff.workId, branch: handoff.branch, sha: commit.sha, sourceSha: candidateSha, checkUrl, testingRequired: true, qualificationPublished: false };
}
