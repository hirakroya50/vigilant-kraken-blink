# Product 008 Stage A delivery boundary

## Scope

Stage A comprises live acceptance cases 1–13, 21 and 22. S3, Product 007 routing, deployment, live production verification and rollback are deferred. Deferral does not turn their seven cases into passes or change full-SOW completion criteria.

Implemented foundations include manual/issue intake, read-only GitHub reconstruction and event/poll wakeups, guarded candidate-diff validation, Stage A-scoped reporting and a local protected Docker production/browser runner. They do **not** deliver the remaining five worker lifecycles or certify any live acceptance case.

## Protected execution

The user reports Mac setup validation complete. The implemented runner exports exact-SHA Git blobs, checks protected control paths, prepares a reviewed dependency/browser image and runs separate network-disabled build/browser containers. Neither container has secrets, Git metadata, Docker socket or writable host mounts. Artifacts and browser evidence are bounded and validated before materialization. Local manifests do not publish GitHub qualification. See [PROTECTED-RUNNER.md](PROTECTED-RUNNER.md) for explicit review/image prerequisites, operations and live verification boundaries.

## Manual intake

CLI argument reference: `intake <request.json> --approve-write`.

Input is a regular UTF-8 JSON file of at most 64 KiB containing:

```json
{
  "version": 1,
  "id": "menu-search",
  "title": "Improve menu search",
  "description": "Match customer-entered text against menu labels.",
  "acceptance": ["A matching burger is displayed after entering its name."]
}
```

Prerequisites: validated GitHub App configuration, contents/pull-request/check write permissions and reachable Valkey. PAT discovery cannot authorize intake writes. Consent is explicit because intake creates GitHub objects; it is not a read-only diagnostic.

Intake uses a renewable, repository/request-specific `safi:leases:` lease and revalidates App authority and ownership before each write. It creates one immutable request commit on `work/<id>` and one draft PR against the current default branch. The request lives at `changes/<id>/request.json` and receives a canonical SHA-256 digest. The request must be a bounded, non-executable regular blob; symlinks and truncated tree listings are rejected.

Duplicate intake returns existing work without resetting progress or reopening a closed PR. Different request content under the same ID is rejected. Existing default-branch records and ambiguous PR lineage require operator review. Branch creation is atomic and never force-updated. Ambiguous branch/PR writes are reconciled from remote truth, not blindly retried. If an operation fails after creating the branch, re-submit the same packet after checking ownership/connectivity to reconcile and create/find the draft PR. A crash may leave unreferenced Git objects; it does not grant qualification.

Output includes the current SHA, branch, request digest, PR URL/number/state and `qualification: not-qualified`. The returned SHA is intake identity, not accepted Fit/build/browser provenance. Intake does not execute candidate code, call OpenAI, publish qualification checks, change protections, or deploy.

Issue intake is now implemented through `intake-issue <number> --approve-write`, with request/source committed together and reserved issue work IDs. Read-only `reconcile` reconstructs GitHub records, distinguishes orphan/closed work, observes exact-SHA App checks without granting readiness, and supports bounded passes, local polling and untrusted event-file wakeups. Authenticated webhook transport and automatic Actions dispatch remain pending. See [INTAKE-RECONCILIATION.md](INTAKE-RECONCILIATION.md).

## Guarded candidate pushes

`pushExpectedHead` now requires explicit accepted application paths and checks the exact expected/candidate diff before publishing. The allowed-path boundary is shared with Fit validation. Raw NUL-delimited Git diffs use no rename detection, external diff or text conversion. Protected deletions cannot be hidden inside renames. Changes to symlinks, submodules, executable files, non-application/control paths and noncanonical paths are rejected. Git control operations disable hooks and fsmonitor.

These controls are not a Docker isolation boundary. Human-session validation, accepted Fit authenticity, intermediate-commit policies and remote publication recovery remain pending. A future role must verify that allowed paths came from genuinely accepted Fit, not candidate assertions.

## Evidence reporting

CLI argument reference: `evidence [registry.json] --stage-a` selects the 15 Stage A cases from a complete 22-case registry. Full reporting remains the default. Missing/duplicate cases and malformed pass records are rejected. Reporting states explicitly that it validates registry shape and does not independently verify linked evidence. A zero exit status means all selected entries claim a schema-valid pass, not an independent SOW certification.

Do not convert offline tests or local Git attack tests into live case passes. The live registry remains unchanged.

## Next implementation gates

1. Preserve the user-reported Mac readiness distinction; retain live diagnostic evidence, approved write exercises, remaining retry/rate-limit policy and reproducible dependency migration.
2. Review a committed control revision and matching official base digest, prepare the implemented image and measure actual isolation/desktop/mobile execution and attacks.
3. Verify issue/read-only reconciliation live, then implement authenticated event dispatch, accepted-Fit lineage, sessions, branch writer locks and durable role recovery.
4. Complete Fitter/Developer/Tester/Triager/Fixer, including real human acceptance/edit/repair and trusted exact-SHA publication.
5. Useful concurrent work and live crash/lease-loss/security proofs for all 15 cases.

No complete Stage A claim is allowed until actual referenced evidence is verified and final commit/clean-tree gates are satisfied.
