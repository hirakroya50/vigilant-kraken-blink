# Local verification — Stage A intake and guarded-diff continuation

## Latest continuation: executed evidence

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
