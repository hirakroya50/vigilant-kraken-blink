# Product 008 trusted Mac configuration

## Scope

This increment implements M0 configuration, refreshing GitHub App authentication and bounded diagnostics. It does **not** implement the five worker lifecycles, a protected Docker Tester, or releases. None of the 22 SOW cases is newly passed.

Repository: `hirakroya50/vigilant-kraken-blink`. The trusted operator is the user's Mac. The provider is OpenAI with configurable `gpt-4.1`; actual model access and inference must be checked on that runner.

## Local inputs

Use the Git-ignored `.env` on the trusted runner, following `.env.example`. Environment values override file values; loading does not mutate the process environment. Diagnostics never load `.env` into a child candidate process.

- `GITHUB_REPOSITORY`: exact owner/repository.
- `SAFI_GITHUB_APP_ID`, `SAFI_GITHUB_INSTALLATION_ID`: positive safe integer IDs.
- `SAFI_GITHUB_APP_PRIVATE_KEY_PATH`: RSA PEM outside the repository, owned by the current user, with no group/other access (0600 or 0400). Symlinks resolve before containment checks. A client secret is not a private key.
- `GITHUB_TOKEN`: optional limited development discovery fallback only; never a qualification credential.
- `VALKEY_URL`: redis/rediss URL; production connectivity should use TLS. Never expose the URL in evidence.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: provider key and model identifier. No privileged values belong in `VITE_` variables, source, GitHub comments, or chat.

`.pem` and `.key` files are ignored as defense in depth, not permission to keep App keys inside the repository.

## CLI behavior

CLI operations are available through the existing harness script and compiled Node entry point. Argument reference (not shell setup instructions):

| Operation | Effect |
| --- | --- |
| `doctor` | App/installation identity, suspension, repository scope, token expiry, configured write permissions, Valkey PING, model visibility, Docker daemon and local Chromium launch. Each result is JSON; blocked checks cause exit 2. No remote writes. |
| `doctor --ai-probe` | Additionally authorizes one small, potentially paid inference request, with an 8-token output limit, 15-second timeout, and no automatic retries. Pricing/spend caps for role AI remain unimplemented. |
| `discover` | Requires verified App authentication; lists own-repository work PRs. Does not grant role readiness. |
| `discover --pat` | Explicitly labels limited-development PAT discovery. Cannot publish checks through the adapter. No automatic fallback from rejected App credentials. |
| `lease-probe` | Writes unique transient lease keys only; adapter smoke evidence, not SOW evidence. |
| `evidence` | Validates the 22-case registry shape; does not independently certify referenced live actions. |

Without `--ai-probe`, doctor intentionally reports inference as blocked rather than claiming that model discovery proves billing/access. SDK installation-token hooks refresh cached tokens. GitHub requests use bounded timeouts. Error output contains field names or fixed diagnoses, never provider response bodies, raw messages or stack traces.

Installation permission settings are **not** a disposable write/check exercise. Such a diagnostic requires explicit approval and remains pending. Runtime credentials must not have administration permissions; no repository protection settings are changed here.

## Build and verification separation

- `build:fixture`: Vite application only. This is the intended application build command for a future credential-free snapshot runner; using this command alone does not provide isolation.
- `build:harness`: strict separate Node compilation.
- `build`: fixture plus harness compilation, not tests or live integration.
- `test:harness`: local unit tests, excluding live integration.
- `test:integration`: opt-in live adapter suite; the Valkey case skips without its environment input. No `.env` auto-loading in the test suite.
- `test:browser`: fixture Playwright suite; it is not yet pinned protected acceptance.

Fixture CI explicitly runs unit tests after the separated build. It remains read-only development CI, not a trusted App gate. A committed npm lockfile is still pending; do not claim frozen npm reproducibility from the existing pnpm lockfile.

## Next gates

M0 still needs actual App/model/runner validation, approved write diagnostics, refresh/denial runtime tests, retry/rate-limit policy, and npm lockfile migration. M1 needs reviewed control/test digests, real desktop/mobile runs and Docker isolation attacks. M2–M5 need actual intake, workers, human sessions, durable readiness, recovery and useful concurrency. M6–M7 require S3/IAM, real Product 007 contract and hostname before any routing adapter is implemented. No guessed schema, mocked promotion or successful stub may qualify Stage B.
