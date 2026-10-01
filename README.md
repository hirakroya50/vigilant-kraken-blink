# Bun & Ember · Safi Product 008

A warm, mobile-first burger-shop fixture and the bootstrap foundations of a Git-native harness. **Partial Product 008; neither Stage A nor the full SOW is complete.**

## Try the fixture

- `/` — storefront and featured burgers
- `/menu` — search, categories, availability and add-to-bag
- `/cart` — quantities, removal and totals
- `/checkout` — customer-only, explicitly simulated payment
- `/orders` — signed-in customer's browser-local order history
- `/login` — Alex/Jamie (customer), Sam (manager), Robin (owner), sign-out
- `/manage/menu` — manager/owner creation and editing

No passwords, payment/card data, real revenue, delivery, production authentication or cross-device sync. Role controls and local storage are **not security boundaries**. Account switching clears the bag. Menu changes and orders persist. Use **Reset demo** in the footer to restore seeds and clear all local demo data. Malformed or incompatible storage recovers to seed data. Storage key: `safi-burger-v1`; schema version: 1.

Checkout uses a persisted cart token as its idempotent order identity and snapshots item names/prices. A changed price or unavailable item blocks checkout until the bag is reviewed. Prices are stored as integer USD cents.

## Code boundaries

Browser source stays in `src/pages`, `src/components/burger`, and `src/lib/burger`; all routes remain in `src/App.tsx`. Node-only code is in `src/harness`, excluded from browser compilation. Secrets must never use `VITE_` prefixes. No Vite API server or database is involved.

## npm script inventory

| Script | Purpose |
| --- | --- |
| `dev` | Vite preview development |
| `build` | Vite production build, harness build, harness unit tests |
| `build:harness` | Strict separate Node compilation |
| `typecheck` | Browser and Node TypeScript validation |
| `test:harness` | Offline contract/configuration/auth/AI tests; no local secrets or real provider calls |
| `test:integration` | Opt-in live Valkey test; requires environment injection and skips without its URL |
| `test:browser` | Playwright mobile/desktop Chromium fixture tests |
| `harness` | CLI: `doctor`, `ai-propose`, `evidence`, App-first `discover` (explicit PAT fallback), `lease-probe` |

Worker commands currently return blocked (exit 2), never synthetic successes. The evidence command also exits 2 until all 22 cases have real passing records. The lease probe tests a real endpoint but labels its scope adapter-smoke-only, not SOW completion. GitHub App SDK authentication now loads the external owner-only RSA PEM and refreshes installation tokens. Live credential verification still requires the trusted runner.

`ai-propose` requires explicit cost consent and produces an unapproved local draft only. Read [configuration](docs/product-008/CONFIGURATION.md) and [AI limits/review boundaries](docs/product-008/AI.md) before using it. Accepted Fit/diagnosis checks and five-role lifecycles are not implemented.

The current Dyad dependency flow retains a pnpm lockfile; migration to committed npm lockfile is still pending. Development CI uses this existing lockfile until that migration is completed.

## Product 008 documentation

- [Delivery status, blockers and repository creation](docs/product-008/STATUS.md)
- [Trusted execution and human handoff requirements](docs/product-008/RUNBOOK.md)
- [Machine-readable live SOW evidence](docs/product-008/evidence.json)

Stage B deliberately has no mock release implementation. S3 details and Product 007's actual routing contract are required before implementation.
