# Product 008 — partial delivery, not Stage A completion

## Confirmed context

- Repository: `hirakroya50/vigilant-kraken-blink`; no new repository creation is required by the accepted plan.
- Trusted initial runner: user's Mac; credential-free candidate execution must use Docker.
- Developer/Fixer editing and Fit acceptance remain human-approved through Dyad.
- AI: OpenAI, configurable `gpt-4.1`, subject to runtime access validation.
- Historical baseline: `28968a37045c11d8e30fcf3194257293641c940f`. HEAD observed before this increment: `912c1fcb8bd975facec0d68670353e5a3a2295ee`; neither is a claim about the eventual committed increment SHA.

## Existing fixture and bootstrap

Responsive Bun & Ember SPA, demo roles/payments, validated browser persistence/reset, integer-cent pricing, idempotent simulated checkout and current-menu revalidation remain unchanged. Desktop/mobile browser acceptance source exists. Separate Node contracts, discovery/eligibility helpers, Valkey leases and guarded worktree adapters are present; none alone establishes worker readiness or a protected release gate.

## New M0 foundations implemented

- Explicit non-mutating `.env` loading and validated configuration with field-only errors.
- External owner-restricted RSA PEM checks, GitHub App authentication with SDK token refresh and bounded request timeouts.
- Live App/installation identity, suspension, repository scope, token-expiry and configured permission verification paths.
- App-first discovery; explicit labelled development PAT fallback cannot publish trusted checks.
- Publication adapter revalidates App authorization and lease ownership before writes. Full provenance/lineage readiness remains pending.
- Bounded `doctor` probes for App, Valkey PING, OpenAI visibility/optional authorized inference, Docker and Chromium. No disposable write diagnostics or protection changes.
- Unit coverage source for configuration, PEM boundaries, error redaction and PAT publication denial.
- Separate fixture/harness builds, unit/live integration commands and explicit unit step in fixture CI.
- Key-file exclusions and [configuration documentation](CONFIGURATION.md).

## M0 remains incomplete

The new diagnostic paths were not executed against the user's credentials in this implementation session. Runtime App authentication, permission exercise, OpenAI billing/model access and isolated-runner prerequisites are not proven. Full retry/rate-limit policy and runtime refresh/denial tests remain pending. No committed npm lockfile exists; fixture CI still uses the existing pnpm lockfile. Frozen npm reproducibility is not established.

Earlier successful GitHub discovery and local Valkey collision/renewal/release/expiry recovery are **reported local adapter evidence**, not worker/SOW passes and not new App validation.

## Implementation still pending

- M1: actual desktop/mobile acceptance, reviewed control/test digests, protected path attacks, Docker snapshot isolation and exact-SHA artifact capture.
- M2: intake/duplicate detection, accepted-Fit/provenance readiness, events/reconciliation, branch locks and durable recovery.
- M3–M4: all five role lifecycles, bounded reviewed role AI, human claim/acknowledge/complete, trusted Tester, read-only diagnosis and stale-safe repair. Reserved role commands still exit blocked; no fake checks or handoffs.
- M5: useful overlapping work, actual GitHub/Valkey recovery/security proof and the 15 Stage A live cases. Protection configuration requires separate explicit approval.
- M6–M7: protected integration and independently qualified main SHA, immutable S3 manifests/uploads, real Product 007 expected-route promotion, hostname verification and guarded rollback; all Stage B acceptance.

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

Current type checking and fixture + strict harness production compilation passed. New unit test source compiled but was not executed in this session; fixture CI now invokes it explicitly. No browser or live provider diagnostic was executed here. See [LOCAL-VERIFICATION.md](LOCAL-VERIFICATION.md).

The evidence registry remains unchanged: all 22 live cases blocked. No check, branch/PR, artifact, deployment or protection setting was published by this increment. Product 008 cannot be called complete until all 22 cases have verified durable real evidence and the final commit/clean-tree gates are satisfied.
