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
| `test:integration` | Opt-in live Valkey and Docker runner tests; explicit inputs required, otherwise skipped |
| `test:runner:live` | Live pinned Docker isolation smoke and exact-SHA protected production/browser execution |
| `test:browser` | Local development-server Playwright mobile/desktop fixture tests |
| `harness` | CLI: diagnostics/intake/reconciliation/evidence, protected runner, independent five-role workers, human actions and protected integration inspection/enrollment |

Independent `fitter`, `developer`, `tester`, `triager` and `fixer` modes now implement bounded renewable-lease lifecycles. They require explicit write consent; AI roles additionally require cost consent. Developer/Fixer wait for acknowledged human Dyad edits, Tester publishes actual isolated execution results, and Triager requires reviewed read-only diagnosis. No worker fabricates source edits or test success. `release` is explicitly deferred. See [worker contracts and recovery](docs/product-008/WORKERS.md).

The evidence command exits 2 until the selected cases have schema-valid recorded passes; registry validation does not independently verify referenced live evidence. The lease probe labels its scope adapter-smoke-only. GitHub App SDK authentication loads the external owner-only RSA PEM and refreshes installation tokens; live credential verification still requires the trusted runner.

Manual/issue intake requires explicit write consent and creates/reconciles a request commit, work branch and draft PR; it does not approve Fit or tests. Issue source is captured with requirements. Read-only reconciliation reconstructs exact GitHub records without Valkey, handles event-file hints/local polling and never grants role readiness from check names alone. See [intake/reconciliation boundaries](docs/product-008/INTAKE-RECONCILIATION.md).

`ai-propose` remains an unapproved local draft operation. Role Fit publication requires independent exact-head GitHub review; diagnosis requires explicit local human review. Test qualification requires every accepted assertion to map to an actually passing protected test title on desktop/mobile Chromium. Read [configuration](docs/product-008/CONFIGURATION.md) and [AI limits](docs/product-008/AI.md).

**Verified: isolated production fixture/harness build and 109 offline tests passed. Live Stage A: 0/15 recorded passes.** Exact-SHA synchronization, HMAC/replay-safe wakeup dispatch, active-scope evidence transitions/reporting, and bounded merge-group/main verification are implemented and covered by offline controls; live provider execution, useful five-role concurrency, and clean committed SOW delivery remain unresolved. The existing pnpm lockfile is the frozen dependency contract; no npm lockfile is claimed.

## Product 008 documentation

- [SOW-to-code audit and plan](docs/product-008/SOW-AUDIT.md)
- [Delivery status and remaining blockers](docs/product-008/STATUS.md)
- [Implemented workers and human sessions](docs/product-008/WORKERS.md)
- [Trusted execution and recovery](docs/product-008/RUNBOOK.md)
- [Protected Docker production/browser runner](docs/product-008/PROTECTED-RUNNER.md)
- [Machine-readable live SOW evidence](docs/product-008/evidence.json)

The local runner requires reviewed committed control and a digest-pinned official Playwright base. Standalone runner operations produce bounded local artifacts; the Tester worker can publish verified real-result GitHub checks after fresh lineage/coverage validation. Neither operation automatically certifies a live SOW case.

Stage B deliberately has no mock release implementation. S3 uploads and Product 007 are excluded by the current request, not passed.
