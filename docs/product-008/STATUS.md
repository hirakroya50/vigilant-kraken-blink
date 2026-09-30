# Product 008 — partial delivery, not Stage A completion

## Delivered in this milestone

- Responsive Bun & Ember SPA with all seven routes, demo accounts (two customers, manager, owner), role-checked service mutations, validated/versioned browser persistence, reset, integer prices, order snapshots, idempotent simulated checkout, and current-menu revalidation.
- Browser acceptance source for desktop and mobile Chromium; external image/font requests are isolated in tests.
- Separate strict Node build. Versioned Request/Fit/diagnosis/check/evidence contracts and protected-path policy.
- GitHub REST adapter: own-repository work-PR discovery, full-SHA heads/check reads, lease-guarded check publication and evidence identity conflict checks.
- Real Valkey protocol adapter: atomic owner-token acquisition, TTL, compare-owner renewal/release, heartbeat and loss detection. Optional live integration test skips if no Valkey URL exists.
- Unique detached worktrees outside the trusted repository; ancestral, expected-head branch pushes.
- Candidate-specific discovery signals requiring an explicitly trusted GitHub App ID. These are discovery helpers, NOT the final readiness gate.
- Diagnostic CLI: evidence validation, GitHub discovery, and live lease smoke probe.
- Ordinary unprivileged fixture CI. This workflow is NOT the protected harness gate.
- All 22 SOW cases initialized as blocked. Unit tests and local adapter smoke results never populate live pass records.

## Not implemented yet (implementation pending, not merely configuration blocked)

- All five worker lifecycles: Fitter, Developer, Tester, Triager, Fixer. Reserved role commands exit with blocked status; no placeholder success/checks.
- Accepted Fit conformity across new SHAs, reviewed AI adapter, intake idempotency/events/reconciliation, and trusted candidate execution isolation.
- Human claim/acknowledge/complete session renewal, PR handoffs, stale completion validation, and active role concurrency.
- Trusted protected browser tests independent of candidate source and a release qualification gate.
- Stage B release manifest, S3 immutable upload, real Product 007 promotion, hostname testing and guarded rollback.
- npm lockfile migration: Dyad currently manages the existing pnpm lockfile. npm scripts are available, but frozen npm installs are not yet reproducible. Fixture CI temporarily uses the existing generated pnpm lockfile; this is an explicit deviation from the accepted npm-only target.

## Missing external prerequisites

No new remote repository was created, no external checks were published, and no deployment happened. Authorization was not provided in this session.

| Prerequisite | Required information/evidence |
| --- | --- |
| GitHub | Owner, new repository name, authorized GitHub App/token, App ID, permissions for contents/PR/check writes, runner identity |
| Trusted runner | Separate control plane and credential-free candidate sandbox, protected acceptance checkout and branch/path review |
| Valkey | Reachable TLS endpoint and credentials, short-lived lease namespace permissions |
| AI | Provider choice, protected credentials, model, bounded schema-reviewed output |
| Stage B | Runtime IAM, S3 bucket, actual Product 007 route contract and production hostname |

## New repository using GitHub and a Git client UI

1. In GitHub, choose **New repository** under the authorized owner, choose the agreed name and visibility, and leave README/license/gitignore initialization disabled (this local repository already has history).
2. Create the repository and copy its HTTPS or SSH URL. No particular owner/name is assumed here.
3. In an authorized desktop Git client's repository settings, add a remote named `origin` with that URL. Publish the existing `main` branch. Verify GitHub's main commit is the same full 40-character local SHA; do not reinitialize history or force-overwrite an existing remote.
4. Record the repository URL and SHA in the infrastructure record. Connect the least-privilege GitHub App and set the trusted App ID. Do not put write tokens in candidate jobs.
5. Set up protected checks only after the independent trusted gate exists. The fixture CI workflow alone does not provide test-weakening protection.

Repository creation and publication remain pending until an authorized operator supplies evidence.

## Verification interpretation

The production build runs the Vite build, strict harness compilation, and harness unit tests. Browser test source is present; browser execution requires Chromium installation on a supported runner. CI artifacts are temporary supplemental evidence only, never the sole durable SOW truth. See `evidence.json` for the live result registry.
