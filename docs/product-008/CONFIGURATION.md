# Product 008 trusted Mac configuration

## Scope

Implemented foundations cover configuration/App authentication, bounded diagnostics, manual/issue intake, read-only reconstruction/event-file polling and local protected Docker production/browser execution. The five worker lifecycles and trusted Tester publication remain pending. S3/Product 007/deployment are deferred. None of the 22 SOW cases is newly passed.

Repository: `hirakroya50/vigilant-kraken-blink`. The trusted operator is the user's Mac. The user reports setup validation complete; independently captured execution evidence remains separate. The provider is OpenAI with configurable `gpt-4.1`.

Issue intake additionally needs Issues:read App access. No installation permission or protection setting is changed by this increment. Event-file wakeups are unauthenticated read-only hints, not a public webhook or approval authority.

## Local inputs

Use the Git-ignored `.env` on the trusted runner, following `.env.example`. Environment values override file values; loading does not mutate the process environment. Diagnostics never load `.env` into a child candidate process.

- `GITHUB_REPOSITORY`: exact owner/repository.
- `SAFI_GITHUB_APP_ID`, `SAFI_GITHUB_INSTALLATION_ID`: positive safe integer IDs.
- `SAFI_GITHUB_APP_PRIVATE_KEY_PATH`: RSA PEM outside the repository, owned by the current user, with no group/other access (0600 or 0400). Symlinks resolve before containment checks. A client secret is not a private key.
- `GITHUB_TOKEN`: optional limited development discovery fallback only; never a qualification credential.
- `VALKEY_URL`: redis/rediss URL; production connectivity should use TLS. Never expose the URL in evidence.
- `SAFI_WEBHOOK_SECRET`: optional GitHub HMAC secret for the bounded webhook adapter; never print or expose it through browser variables.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: provider key and model identifier. No privileged values belong in `VITE_` variables, source, GitHub comments, or chat.

`.pem` and `.key` files are ignored as defense in depth, not permission to keep App keys inside the repository.

## CLI behavior

CLI operations are available through the existing harness script and compiled Node entry point. Argument reference (not shell setup instructions):

| Operation | Effect |
| --- | --- |
| `doctor` | App/installation identity, suspension, repository scope, token expiry, configured write permissions, Valkey PING, model visibility, Docker daemon and local Chromium launch. Each result is JSON; blocked checks cause exit 2. No remote writes. |
| `doctor --ai-probe` | Additionally authorizes one small, potentially paid inference request, with an 8-token output limit, 30-second SDK timeout, and no automatic retries. Account-wide spend accounting is not implemented. |
| `ai-propose <input.json> --approve-cost` | Produces one local schema-validated, unapproved Fit/diagnosis draft from a bounded operator-supplied packet. No GitHub writes or candidate qualification; see [AI.md](AI.md). |
| `discover` | Requires verified App authentication; lists own-repository work PRs. Does not grant role readiness. |
| `discover --pat` | Explicitly labels limited-development PAT discovery. Cannot publish checks through the adapter. No automatic fallback from rejected App credentials. |
| `lease-probe` | Writes unique transient lease keys only; adapter smoke evidence, not SOW evidence. |
| `intake <request.json> --approve-write` | Creates/reconciles a manual request commit, work branch and draft PR using App auth and a renewable lease. Reserved issue IDs require issue intake. No qualification or candidate execution. |
| `intake-issue <number> --approve-write` | Fetches an open same-repository issue and captures request/source together on a work branch/draft PR. Conflicts reject rather than overwrite. Requires Issues:read. |
| `reconcile [--once\|--watch] [--after work/id] [--event file.json]` | Read-only bounded/polling reconstruction from GitHub with event hints, orphan/closed detection, exact-blob validation and cursor continuation. Never grants role readiness or publishes qualification. See [INTAKE-RECONCILIATION.md](INTAKE-RECONCILIATION.md). |
| `fit-review <work-id>` | Read-only check of an exact-head GitHub collaborator approval over a one-file Fit-only commit. Does not publish `safi/fit` or dispatch Developer. See [FIT-REVIEW.md](FIT-REVIEW.md). |
| `fit-commit <draft.json> --approve-write` | Commits one validated Fit-only child on the request SHA under role/writer leases. Matching replay reuses the existing commit. Human approval remains required. See [FIT-OPERATIONS.md](FIT-OPERATIONS.md). |
| `fit-publish <work-id> --approve-write` | Publishes/reuses exact-SHA `safi/fit` only after fresh verified collaborator review; persists review lineage. Does not dispatch Developer or qualify a candidate. |
| `evidence` | Validates the 22-case registry shape; does not independently certify referenced live actions. |
| `evidence --stage-a` | Selects cases 1–13, 21 and 22 while keeping all 22 registry records. Reports registry validation only. |
| `runner-prepare <control-sha> <official-image@digest> --approve-reviewed-control-build` | Downloads/builds a frozen reviewed local runner image. Explicit operator-declared control review and download consent; no GitHub writes. |
| `runner-smoke <record.json>` | Live canary-based Docker isolation smoke; no SOW certification. |
| `runner-test <candidate-sha> <record.json>` | Local protected production/browser execution with bounded artifact/evidence manifest. No .env loading or GitHub qualification. See [PROTECTED-RUNNER.md](PROTECTED-RUNNER.md). |

Without `--ai-probe`, doctor intentionally reports inference as blocked rather than claiming that model discovery proves billing/access. SDK installation-token hooks refresh cached tokens. GitHub requests use bounded timeouts and verification checks both installation and issued-token permissions. Error output contains field names or fixed diagnoses, never provider response bodies, raw messages or stack traces. PEM errors distinguish absent/relative paths, owner/mode issues, oversized files and malformed RSA keys.

Installation permission settings are **not** a disposable write/check exercise. Such a diagnostic requires explicit approval and remains pending. Runtime credentials must not have administration permissions; no repository protection settings are changed here.

## Build and verification separation

- `build:fixture`: Vite application only. This is the intended application build command for a future credential-free snapshot runner; using this command alone does not provide isolation.
- `build:harness`: strict separate Node compilation.
- `build`: fixture and harness compilation followed by offline harness unit tests. It never invokes doctor, credentialed inference, live integration or browser tests.
- `test:harness`: offline unit tests, excluding live integration. GitHub/OpenAI tests use explicit fake HTTP transports and generated temporary unit keys, never local `.env` credentials.
- `test:integration`: opt-in live adapter/runner suite; cases skip without explicit environment inputs. No `.env` auto-loading in the test suite.
- `test:runner:live`: only the live Docker smoke and production/browser suite, selected by SAFI_RUNNER_RECORD and SAFI_RUNNER_CANDIDATE_SHA. Separate from ordinary builds/offline tests.
- `test:browser`: local development-server Playwright suite. Protected production acceptance uses runner-test and image-pinned definitions instead.

Fixture CI relies on build for the offline unit step. It remains read-only development CI, not a trusted App gate. A committed npm lockfile is still pending; do not claim frozen npm reproducibility from the existing pnpm lockfile. The protected image uses the reviewed existing pnpm lockfile with frozen installation rather than an unlocked fallback.

## Next gates

Mac readiness is user-reported complete. Preserve actual diagnostic evidence and finish remaining retry/rate-limit and npm migration work. M1 needs human control/base-image review and measured execution/attack proof for the implemented protected runner. Issue intake and read-only reconciliation now exist; M2–M5 still need authenticated dispatch, accepted-Fit/session provenance, branch locks, actual workers, human sessions, role recovery and useful concurrency. S3/Product 007/deployment are deferred; no mocked promotion or successful stub may qualify Stage B.
