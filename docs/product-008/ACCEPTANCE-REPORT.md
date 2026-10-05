# Product 008 Stage A acceptance report

## Status

**Implementation status: in progress. Live SOW status: 0/15 active cases passed.**

This report is intentionally conservative. Offline tests, source inspection, simulated provider responses, idle workers, and local-only runner output are not SOW acceptance evidence. Cases 1–13, 21, and 22 remain blocked until an independent operator records durable GitHub/Valkey/Docker/OpenAI/human evidence with the fields required by the acceptance controller.

Cases 14–20 are **deferred**, not passed. S3 artifact upload, Product 007 route promotion, hostname verification, deployment, and rollback are excluded from this scope and are not simulated.

## Baseline and implementation verification

- Baseline commit: `56fd340c500e2e12cd3f4e8d2d5ff2bfb0cf7203`
- Baseline working tree: clean before implementation.
- TypeScript checks: passed.
- Isolated production build: passed.
- Harness/offline suite: 109 passed, 0 failed, 0 skipped.
- Offline results validate logic and security boundaries only; they do not establish live acceptance.

## Implemented Stage A controls

- Repository-scoped exact-SHA synchronization validates the canonical GitHub remote, branch head, fetched commit object, optional ancestry, and branch movement. Git hooks, global/system config, fsmonitor, credential helpers, protocol extensions, prompts, and candidate execution are disabled for synchronization.
- GitHub webhook verification validates HMAC-SHA256, bounded payload size, delivery identity, event allowlist, and repository identity. Accepted events are replay-safe wakeups only; they do not authorize a write or supply candidate truth.
- Acceptance evidence now requires a run ID, exact SHA, branch, work ID, worker/session identities, check URLs, logs, artifacts, observed result, and timestamp before an active case can be marked passed. A verified pass cannot be replaced by stale or different evidence.
- Acceptance status/report commands distinguish registry validation from independently verified live evidence and list deferred cases explicitly.
- Native merge-group support adds bounded queue polling, exact synthetic-SHA trusted checks, terminal-state validation, and protected-main advancement checks. No custom merge, force update, branch-protection bypass, or release action is performed.

## Live setup and commands to archive

The operator must archive secret-free output and durable provider URLs for each experiment. Values, tokens, private keys, and local credential-bearing paths must not enter this report.

- `npm run typecheck`
- `npm run build`
- `npm run harness -- doctor`
- `npm run harness -- doctor --ai-probe` only with explicit cost consent
- `npm run harness -- lease-probe`
- reviewed runner preparation and smoke using a committed control SHA and digest-pinned official Playwright image
- protected runner execution for exact candidate SHAs
- five independent role workers, human handoffs, and native merge-queue/main verification
- `npm run harness -- acceptance-status docs/product-008/evidence.json`

## Active case registry

The committed registry is the source of current status. It contains 15 active Stage A cases and 7 deferred Stage B cases. Active entries currently contain no live worker/check/log/artifact evidence and therefore remain blocked.

| Cases | Scope | Current status | Passing rule |
| --- | --- | --- | --- |
| 1–3 | discovery, exact SHA, candidate invalidation | blocked | durable GitHub PR/check and exact-SHA evidence |
| 4–6 | useful concurrent role execution | blocked | independent worker and lease observations |
| 7–8 | collision and expiry/crash recovery | blocked | Valkey lease events plus recovery evidence |
| 9–10 | Tester/Triager read-only behavior | blocked | exact checks and protected-diff evidence |
| 11 | stale diagnosis/head refusal | blocked | stale experiment and refusal logs |
| 12 | Fixer new candidate and retest | blocked | new SHA and fresh checks |
| 13 | protected-test weakening rejection | blocked | runner/control rejection evidence |
| 21 | Valkey loss/reconstruction | blocked | transient lease loss and GitHub reconstruction evidence |
| 22 | all five roles useful concurrently | blocked | five role identities and useful results |
| 14–20 | S3/Product 007/deployment | deferred | out of scope; never mark passed |

## Evidence requirements for a future pass

Every passed active entry must include an immutable acceptance run ID; full work branch and SHA; request/Fit lineage; worker IDs and human session IDs; GitHub check, review, and PR URLs; relevant Valkey lease events; runner control/image/test/dependency digests; browser/build logs; durable artifact references; timestamp; and cleanup/recovery observations. The evidence controller rejects incomplete passes and stale replacements.

## Delivery boundary

A final delivery report cannot claim completion until the live experiments have actually succeeded, the evidence has been independently reviewed, the implementation is committed, final checks pass, and the working tree is clean. This report records the current implementation boundary and does not claim those external actions occurred.
