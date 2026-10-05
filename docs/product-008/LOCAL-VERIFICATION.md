# Local verification — Product 008 Stage A foundations

## Latest continuation: independent bounded role workers

- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build and strict Node harness compilation: passed.
- Offline harness suite: **109 passed, 0 failed, 0 skipped** (85 existing plus 20 worker/security cases and four actual temporary-Git human completion cases).
- Tests cover concurrent independent claims/collision fallback, sticky lease loss/owner-safe release, explicit role consent/bounds, exact-head checks, acknowledged/expired human sessions, permitted remote tree/blob publication, fresh-testing new SHAs, stale heads, protected test weakening, title coverage on both Chromium projects, real-result check construction, aborted Docker subprocesses, private file/review replay boundaries, diagnosis identity/latest failures, native queue protection and exact local failure-manifest context.
- One initial new human-completion fixture failed because its request digest did not match the real intake content digest. Corrected it to use intakePacket; reran the complete build and all 109 tests passed.
- Git operations run against real temporary local repositories. Provider/Valkey/review responses are offline fixtures, not actual collaborator approval or live worker evidence.
- No live role, Docker/browser/provider/write/merge/protection/deployment operation was performed by this continuation. All 22 live registry cases are unchanged and blocked, including the 15 active Stage A cases.
- Prior uncommitted work was accounted for and preserved. No final committed control SHA or clean-tree SOW delivery is asserted.
- Remaining implementation and external acceptance boundaries are in [STATUS.md](STATUS.md) and [WORKERS.md](WORKERS.md).

## Previous continuation: Fit-only commit and trusted publication

- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build and strict Node harness compilation: passed.
- Offline harness suite: **85 passed, 0 failed, 0 skipped** (76 prior tests plus 9 Fit-write tests).
- Added tests cover Fit-only commits, non-force expected-parent writes, idempotent replay, conflicting drafts, closed/fork work, forged blob identities, head advancement, PAT denial, role/writer ownership loss, stale/self/withdrawn approvals and stable exact-SHA review lineage/check reuse.
- Publication tests use simulated HTTP/review records, not live GitHub or real collaborator approval.
- No actual Fit/check was published, no Docker/browser/provider execution occurred, and no worker or SOW case was certified. All 22 registry cases remain blocked.
- Client deferral of S3/Product 007 leaves Stage A as the active target; an approved runner control/image record is still unestablished.

## Previous continuation: exact-SHA human Fit-review inspector

- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build and strict Node harness compilation: passed.
- Offline harness suite: **76 passed, 0 failed, 0 skipped** (72 prior tests plus 4 Fit-review tests).
- New tests cover collaborator identity/state selection, stale approval, author self-review, bot/outsider exclusion, unresolved change requests, and exact one-commit/Fit-only compare boundaries.
- Review and GitHub records in offline tests are fixtures only. No real human approval or live GitHub review was inspected or published.
- No `safi/fit` check, Developer handoff, Docker/browser run, provider call/write, worker session, or registry evidence was created. The live registry remains unchanged: **0 of 15 Stage A cases recorded passed**.

## Previous continuation: issue intake and read-only GitHub reconciliation

- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build: passed.
- Strict Node harness compilation: passed.
- Offline harness suite: **72 passed, 0 failed, 0 skipped** (55 existing plus 17 new).
- New issue/reconciliation tests cover malformed/closed/PR issues, deterministic IDs, captured source provenance, changed/missing/symlink source records, duplicate/colliding work, orphan/closed PRs, forks, stale heads, blob-byte forgery, truncated/oversized trees, foreign checks, polling cursors, rate limits, cancellation, event-hint authority, file bounds, and polling argument/backoff rules.
- Mocked HTTP responses are offline adapter evidence only; they are not live GitHub intake, provider, worker, or SOW passes.
- The live registry was not modified; **0 of 15 Stage A cases recorded passed**. No GitHub/App/Valkey/API writes, events, live browser, worker sessions, S3, Product 007 or deployment were performed.

No active Docker smoke, pinned-image preparation, production browser run, public webhook or dispatch integration was executed. The reviewed committed control SHA and matching image digest remain prerequisites for those live runner steps.

## Previous continuation: protected runner code verification

- The user reports Mac setup validation complete. This is recorded as user-reported readiness, not independently observed Docker/browser execution.
- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build and strict Node harness compilation: passed.
- Offline harness suite: **55 passed, 0 failed, 0 skipped** (44 existing plus 11 new).
- New tests verify sandbox argument restrictions, immutable image/review schema, protected control comparisons, snapshot/artifact boundaries, complete browser-report requirements and exact committed-byte export using a real temporary Git repository.
- All five container programs passed actual Node syntax checks. The output collector was exercised against actual temporary files, a symlink and an oversized file.
- Docker image preparation, isolation smoke and real desktop/mobile Chromium execution were **not executed**. A reviewed committed control revision containing this increment and a matching approved official Playwright base digest are still needed for a live run.
- Live runner integration tests were authored separately; they are not part of the offline build and were not counted as executed/skipped here.
- No live GitHub/Valkey/OpenAI calls, qualification checks, worker sessions, S3 uploads, Product 007 changes or deployments were performed. The live registry remains unchanged: **0 of 15 Stage A cases recorded passed**.

Production verification used an isolated working-tree overlay, not a published/qualified candidate SHA. Final commit/clean-tree and all five worker lifecycle gates remain outstanding.

## Previous intake/guarded-diff continuation: executed evidence

- Workspace TypeScript checks: passed, no diagnostics.
- Isolated SPA production build: passed.
- Strict Node harness compilation: passed.
- Offline harness suite: **44 passed, 0 failed, 0 skipped** (25 existing plus 19 new).
- New intake tests use fake GitHub HTTP responses, not real GitHub writes or Valkey.
- Three new tests execute actual Git operations in temporary local repositories: normal exact-SHA edits, symlink rejection and protected-test rename rejection. They are local security tests, not live SOW acceptance.
- The first strict build exposed differing Octokit list/create PR label types. Intake now keeps only the PR number/URL/state fields it uses; the subsequent complete build and test suite passed.
- No Mac credential diagnostics, Docker execution, browser acceptance, human sessions or live worker concurrency were executed in this continuation. No S3, Product 007 or deployment work was performed.
- The live evidence registry is unchanged: **0 of 15 Stage A cases recorded passed**. All five role commands still report blocked.

Verification used an isolated working-tree overlay, not a claimed published candidate/control SHA. No final commit or clean-tree completion is claimed.

## Previous authentication/AI increment: executed evidence

- Browser/application TypeScript check: passed, no diagnostics.
- SPA production build: passed in an isolated build snapshot.
- Strict Node harness compilation: passed in that snapshot.
- Offline harness suite: **25 passed, 0 failed, 0 skipped**.
- GitHub App tests use fake HTTP responses and generated temporary RSA keys; OpenAI tests use fake HTTP responses. No real credentials, provider calls or writes were exercised by this suite.
- The initial verification exposed missing final response URLs in the offline GitHub HTTP transport, which Octokit pagination requires. The test transport was corrected and the complete production build/offline suite rerun passed.

The suite covers configuration/loading, RSA key permissions/location, safe diagnostics, PAT publication rejection, SHA freshness/protected paths/evidence contracts, App/installation scope and token permissions, expired-token rejection, and bounded unapproved AI proposals with refusal/truncation/schema/scope/budget/provider-error rejection.

Observed repository HEAD before edits: `ce29bdd046f1150701d7ce810af386a91aa63577`. Verification executed a working-tree overlay, not a claimed published candidate SHA. The final commit SHA is assigned outside this report.

## Not executed here

- Live `doctor`, App permission write/check exercise, token refresh, OpenAI model/billing/inference validation.
- Desktop/mobile Playwright fixture suite or protected Docker acceptance.
- Five-role lifecycles, human sessions or concurrency.
- S3/Product 007/hostname release or rollback.

## Earlier user-reported local results

The user supplied successful GitHub discovery (`[]`), lease acquisition/collision/renewal/release smoke output, and a live Valkey expiry/owner-safe recovery test (1 passed, 0 skipped). These were local adapter results, not full-role or exact-SHA SOW evidence. They were not re-executed in this increment.

## Completion boundary

All 22 live SOW registry cases remain blocked. No branch, PR, check, deployment or repository protection was written in this increment. Offline unit results do not replace live evidence.

The Vite plugin esbuild deprecation and outdated Browserslist warnings remain non-fatal. No unrelated framework/plugin upgrade was made.
