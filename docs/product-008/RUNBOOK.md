# Trusted execution and recovery runbook

## Authority

Branch + PR is the work item; the full 40-character commit SHA is the candidate. Request/Fit belong under `changes/<id>/`. Checks and repository-associated records hold durable evidence. Valkey keys are temporary claims only: `safi:leases:<role>:<sha>` or a narrow branch-writer identity. No global NEXT pointer, permanent READY flag, or workflow database.

The bootstrap discovery helper does not validate an accepted Fit, remote head freshness, branch review or an active lease. Do not use it as release authorization. A worker must implement these additional checks before publishing results.

## Exact-SHA and trusted gate requirements

- Commit the Fit before attaching `safi/fit`; every changed SHA requires new conformity/build/test evidence.
- Reject unauthorized protected source, tests, contracts, workflow, dependency and harness edits. The starter path policy intentionally allows only enumerated application file paths; broadening it requires protected review.
- Trust checks from the configured App identity, not names alone. Keep a separately protected harness/acceptance checkout outside the candidate worktree.
- Candidate scripts are untrusted. Build/browser processes receive an allowlisted environment, no AWS/Valkey/AI/repository-write secrets, no persisted Git credentials, and no privileged workflow context. The Git subprocess wrapper also excludes provider tokens from its environment.
- Never run candidate PR code under `pull_request_target` or mount a privileged runner's credentials into its sandbox.
- Triager reports belong on the failed SHA check, not a report commit on the candidate branch.
- Protected feature checks gate integration; the resulting main SHA must separately qualify for release.

## Planned human session protocol (not yet implemented)

Developer/Fixer must have separate claim, acknowledgement and completion operations. A local active session renews its lease; no Actions job waits indefinitely for a human. Every handoff contains work ID, request/Fit links, role, target SHA, baseline SHA, affected paths, isolated checkout location, Dyad import/open instructions and completion evidence identity. Fixer adds diagnosis and failed check URLs.

Completion requires current ownership, active acknowledged session, unchanged expected remote head, a new ancestral implementation SHA, permitted diff, no protected path weakening, and expected-head push. Expired sessions cannot resume privileged publication: reacquire and revalidate. This must be implemented before the worker modes can be declared functional.

## Lease recovery

- A worker uses a unique owner token and TTL. Only the owner renews/releases with atomic comparison.
- Heartbeat errors or ownership loss stop privileged work. Renewal must be active while humans edit.
- After crash/TTL expiry another worker may acquire; an old owner cannot remove its claim.
- A role lease is not a branch-writer lock. Writers must also hold narrow branch coordination and use expected-head pushes.
- The supplied adapter never clears namespaces. For a lease-loss experiment delete only the transient `safi:leases:` keys through an authorized operator. **Never delete Product 007 routing keys or flush Valkey.**
- Rediscover truth from GitHub branches/PRs/checks after Valkey loss, not from reconstructed permanent lease state.

## Events and bounded workers still to deliver

Validate webhook/event repository identity; use independent event wakeups plus periodic reconciliation. Idempotency depends on check/evidence IDs and expected heads. Normal GitHub workflow-token pushes may not start follow-on workflows: explicitly dispatch bounded next work or use the authorized App, with loop prevention. Do not infer concurrency from five idle processes.

## Durable evidence

Each live case needs timestamp, work ID, branch, full SHA, worker/session identities, GitHub check URLs, logs and relevant artifacts. Publish concise durable content in the exact-SHA check; traces/artifacts supplement it. Evidence validators catch missing metadata but cannot prove that URLs refer to actual successful infrastructure actions; those require live review.

No SOW case is currently passed. All Stage B cases remain blocked until real contracts and infrastructure are available.
