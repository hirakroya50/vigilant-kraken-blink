# Product 008 — partial delivery, not Stage A completion

## Confirmed context

- Repository: `hirakroya50/vigilant-kraken-blink`; no new repository creation is required by the accepted plan.
- Trusted initial runner: user's Mac; credential-free candidate execution must use Docker.
- Developer/Fixer editing and Fit acceptance remain human-approved through Dyad.
- AI: OpenAI, configurable `gpt-4.1`, subject to runtime access validation.
- Historical baseline: `28968a37045c11d8e30fcf3194257293641c940f`. HEAD observed before this increment: `ce29bdd046f1150701d7ce810af386a91aa63577`; neither is a claim about the eventual committed increment SHA.

## Existing fixture and bootstrap

Responsive Bun & Ember SPA, demo roles/payments, validated browser persistence/reset, integer-cent pricing, idempotent simulated checkout and current-menu revalidation remain unchanged. Desktop/mobile browser acceptance source exists. Separate Node contracts, discovery/eligibility helpers, Valkey leases and guarded worktree adapters are present; none alone establishes worker readiness or a protected release gate.

## New M0 foundations implemented

- Explicit non-mutating `.env` loading and validated configuration with field-only errors.
- External owner-restricted RSA PEM checks, GitHub App authentication with SDK token refresh and bounded request timeouts.
- Live App/installation identity, suspension, repository scope, token-expiry and configured permission verification paths.
- App-first discovery; explicit labelled development PAT fallback cannot publish trusted checks.
- Publication adapter revalidates App authorization and lease ownership before writes. Full provenance/lineage readiness remains pending.
- Bounded `doctor` probes for App, Valkey PING, OpenAI visibility/optional authorized inference, Docker and Chromium. No disposable write diagnostics or protection changes.
- External absolute-path RSA PEM diagnostics and issued-token permissions validated in addition to installation permissions.
- OpenAI SDK adapter for schema-constrained Fit/diagnosis drafts: input/output/call caps, timeout, zero automatic retries, official endpoint, SDK payload logging off, scope enforcement and mandatory human-review status.
- Cost-consented `ai-propose` command writes private local drafts only; declared source SHA is not independently verified. It is not a Fitter/Triager lifecycle.
- **25 offline unit tests executed and passed**, including configuration/PEM boundaries, App identity/scope/permissions/expiry, error redaction, PAT denial, and invalid/refused/out-of-scope AI output.
- Separate fixture/harness builds and offline/live integration commands; aggregate production build runs offline units only. Fixture CI does not run units twice.
- Key/local-draft exclusions and [configuration](CONFIGURATION.md)/[AI proposal documentation](AI.md).

## M0 remains incomplete

The diagnostic paths were not executed against the user's credentials in this implementation session. Runtime App authentication, permission exercise, OpenAI billing/model access and isolated-runner prerequisites are not proven. Full retry/rate-limit policy and live token-refresh validation remain pending. No committed npm lockfile exists; fixture CI still uses the existing pnpm lockfile. Frozen npm reproducibility is not established.

Earlier successful GitHub discovery and local Valkey collision/renewal/release/expiry recovery are **reported local adapter evidence**, not worker/SOW passes and not new App validation.

## Stage A continuation

Current requested scope is Stage A only; S3, Product 007 and production deployment are deferred, not passed. The user reports Mac setup validation complete; this is user-reported readiness, not independently rerun diagnostics or SOW evidence.

- Local protected runner implemented: reviewed exact-SHA image preparation, Git-blob snapshot export, protected-file comparison, separate network-disabled build/browser containers, bounded artifacts/evidence and local provenance manifests.
- Added explicit live canary smoke and protected browser integration operations. They require reviewed committed control, a matching digest-pinned official Playwright base and explicit candidate selection; no implicit success or current-HEAD qualification.
- Browser tests now collect console/page/HTTP/network evidence. Protected execution uses production output and image-pinned tests, not candidate dev/server/test scripts.
- Local runner results do not publish GitHub qualification or certify Stage A. Runtime Docker/browser execution remains unmeasured in this implementation session. See [PROTECTED-RUNNER.md](PROTECTED-RUNNER.md).
- Manual/issue App-authenticated intake creates a request commit, work branch and draft PR under a renewable repository/request lease. Issue provenance is committed with requirements. Replays preserve current progress/closed PRs; changed issue content, collisions and ambiguous writes are rejected/reconciled without force-updates.
- The GitHub issue form and explicit write-consented issue command are implemented. Issues:read is required; no App permission/settings change or automatic intake was performed.
- Read-only reconstruction verifies exact Git blob bytes, distinguishes orphan/closed work, detects stale heads/source/diagnosis and observes same-SHA App checks without granting role readiness. It does not use Valkey or a workflow database.
- Bounded/local polling and own-repository event-file wakeups re-fetch remote truth. Event files are untrusted hints, not authenticated webhooks or approval. Polling honors bounded provider backoff and never retries privileged writes. See [INTAKE-RECONCILIATION.md](INTAKE-RECONCILIATION.md).
- Guarded pushes require explicit application paths and raw exact-SHA diff validation; symlinks, executables, submodules and protected deletions disguised as renames are rejected. Git hooks/fsmonitor are disabled for control operations.
- `evidence --stage-a` reports the 15 Stage A cases without deleting the seven deferred cases or pretending registry validation verifies live evidence.
- Offline intake, registry and local Git attack tests are added. Verification results are recorded in LOCAL-VERIFICATION.md after execution.
- See [STAGE-A.md](STAGE-A.md) for operations, recovery and remaining boundaries.

## Implementation still pending

- M1: human review of committed control and base image digest, actual Docker isolation/browser runs, attack proof and artifact/evidence measurement. Runner code exists; execution is not yet measured here.
- M2: live issue/reconstruction validation, authenticated event dispatch, accepted-Fit/provenance readiness, branch writer locks and durable role recovery. Manual/issue intake and read-only reconstruction/polling are implemented; neither authenticates human completion.
- M3–M4: all five role lifecycles, bounded reviewed role AI, human claim/acknowledge/complete, trusted Tester publication/lease-loss cancellation, read-only diagnosis and stale-safe repair. Reserved role commands still exit blocked; no fake checks or handoffs.
- M5: useful overlapping work, actual GitHub/Valkey recovery/security proof and the 15 Stage A live cases. Protection configuration requires separate explicit approval.
- M6–M7: S3, Product 007 integration and production deployment are excluded from the current increment and deferred. Full-SOW acceptance still requires their seven cases later.

## External gates

| Gate | Required evidence |
| --- | --- |
| GitHub App | Local external PEM, installation/repository identity, runtime token validation, approved write/check diagnostics |
| Trusted Mac | Reviewed control revision; Docker/Chromium readiness and candidate isolation attacks |
| Valkey | Reachable configured endpoint, lease-loss/recovery and concurrent actual workers |
| OpenAI | Actual configured model inference/billing and reviewed bounded role output |
| Humans | Fit review plus acknowledged real Developer/Fixer sessions on independent work |
| Stage B | S3 bucket/region/runtime IAM, actual Product 007 contract, real hostname |

## Verification and completion boundary

Latest workspace type checking, isolated fixture production build, strict harness compilation and all **55 offline tests** passed (0 failed, 0 skipped). Tests exercised actual temporary Git snapshots/diffs, actual container-program syntax and bounded file-export attacks; GitHub intake tests used fake HTTP responses. Docker image preparation, isolation smoke, browser acceptance and live provider diagnostics were not executed here. See [LOCAL-VERIFICATION.md](LOCAL-VERIFICATION.md).

The evidence registry remains unchanged: all 22 live cases blocked, including all 15 Stage A cases. No live check, branch/PR, remote artifact, deployment or protection setting was published by this increment. Stage A cannot be called complete until its 15 cases have verified durable real evidence and final commit/clean-tree gates pass. Full Product 008 completion additionally requires the seven deferred Stage B cases.
