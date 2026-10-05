# Product 008 — remaining implementation, testing and client demo

## Baseline and scope

Planning baseline: `d547fb1619a40dcc24594ee17fea93a7b2043542`.
This document is a plan, not evidence that its steps have been executed.
Active scope: cases 1–13, 21 and 22. Current live acceptance: 0/15 recorded passes.
Cases 14–20 (S3/Product 007/deployment/hostname/rollback) remain deferred.

Exact-SHA synchronization, webhook verification, bounded workers, evidence reporting and merge-queue helpers already exist. Do not rebuild them. Remaining work is production wiring, recovery hardening, live measurement and final delivery. Historical offline verification reports 114 passing tests; this planning turn does not rerun them.

## Phase 1 — reconcile baseline and live prerequisites

Owner: implementation assistant plus trusted runner operator.

- Reconcile STATUS, WORKERS, CONFIGURATION, PROTECTED-RUNNER and ACCEPTANCE-REPORT against current source. Remove obsolete claims that synchronization and all workers are absent. Keep pnpm 10.12.4/pnpm-lock.yaml as the selected frozen contract; an npm migration is not required by this plan.
- Reverify browser/harness types, production build and offline suite before using this revision as control.
- Inspect GitHub App repository scope, permissions, installation-token refresh, Valkey connectivity, Docker and compatible Chromium availability. Probe OpenAI inference only with explicit cost consent.
- Confirm availability of native GitHub merge queue for the target repository and plan. If unavailable, record a blocker; never bypass protection or substitute a direct merge.
- Select an independent Fit reviewer and trusted Mac operator. Establish explicit provider-write and AI-cost consent.
- Approve a durable, access-controlled, non-S3 evidence location. GitHub checks/reviews plus sanitized evidence attachments or a client-approved archive must remain retrievable; local .safi paths alone do not establish durability.

Exit: secret-free readiness report and recorded prerequisites/blockers. Never expose keys in chat, browser variables, logs or screenshots.

## Phase 2 — finish authenticated wakeup delivery

Owner: implementation assistant; installation by trusted operator.

- Connect existing signature validation to a bounded trusted Node-only listener or provider adapter, outside the React/browser runtime.
- Enforce raw-body size limits before buffering, repository/event allowlists, signature validation and safe fixed error responses.
- Replace per-process-only replay claims for installed delivery with shared bounded TTL claims, using the existing transient coordination infrastructure. Support duplicate delivery across concurrent receivers and receiver restart. Valkey remains coordination, never approval truth.
- Define claim/dispatch-failure recovery: a claimed but undispatched delivery cannot silently lose useful work. Periodic authoritative discovery remains the recovery path if event delivery or transient state is lost.
- Connect accepted wakeups to existing bounded role discovery, never directly to privileged writes or payload-provided SHAs.
- Install the endpoint with TLS and GitHub delivery configuration only after offline receiver tests pass. No credentials enter candidate processes.

Tests: valid delivery; invalid signature; foreign repository; oversized payload; duplicate/concurrent delivery; restart; coordination outage; dispatcher failure; real GitHub redelivery. Verify that every privileged action still re-fetches GitHub truth.
Exit: a real verified delivery triggers fresh discovery, duplicates cause no duplicate privileged work, and a dropped wakeup is recoverable.

## Phase 3 — complete trusted merge-group/main execution

Owner: implementation assistant and GitHub administrator/operator.

- Wire existing queue polling/helpers to a real CLI/controller path and protected executor. Validate actual GitHub GraphQL response shapes/API availability against the configured repository before relying on offline models.
- Add authorized synchronization for verified synthetic queue refs/SHAs; do not assume that a synthetic merge-group candidate is a work-branch head accepted by current worker synchronization.
- Bind queue entry, constituent PR identities/heads, synthetic SHA, accepted Fit lineages and current main to freshly fetched provider truth.
- Define multi-PR merge-group Fit/coverage validation rather than reusing a single-work candidate contract blindly. Protected control/dependency equality remains required.
- Execute credential-free protected build/browser checks on the exact synthetic SHA; publish App-bound checks only from real results under current ownership.
- Wire exact-SHA/App-bound check validation into completion, require completed check status and matching runner provenance, and reject old successful checks superseded by failures.
- Verify native merge outcome against the actual PR merge record and Git ancestry/provider compare result. Main merely changing is not sufficient proof that this work merged.
- Apply the agreed protected-main verification policy to the actual resulting main SHA. Capture real post-merge execution where required; distinguish it from pre-merge synthetic checks and from deployment.
- Handle queue cancellation, changed heads, ambiguous writes, expired ownership and failed checks without bypassing protection or blindly retrying.

Tests: forged/wrong-App check; wrong SHA; stale success; moved PR; cancelled queue; unrelated main advancement; changed merge group; failing synthetic check; confirmed native merge; resulting-main verification.
Exit: exact source/synthetic/main identities, check URLs and genuine native merge evidence are recorded. No release qualification is claimed.

## Phase 4 — approve runner and exercise human/repair lifecycles

Owner: implementation assistant, trusted operator and independent human reviewer.

- Review and commit current protected control and frozen dependencies; select a real digest-pinned official Playwright image matching the dependency version.
- Prepare its runner record and perform live isolation smoke, including secret canary, network denial, non-root/read-only execution and absence of Git metadata/Docker socket.
- Run full protected desktop/mobile suite and verify Fit acceptance-title coverage. Missing/skip/flaky coverage must block qualification.
- Exercise acknowledged Developer/Fixer checkouts in Dyad and independent exact-Fit-head GitHub approval. Do not replace humans with fabricated source edits or self-approval.
- Measure lease heartbeat, cancellation, retained interrupted checkouts, partial check publication and ambiguous-write reconciliation; fix only defects exposed by these experiments.
- Preserve reviewed same-SHA Triager diagnosis and prove stale-head/diagnosis rejection before repair. New repair SHA always requires fresh checks.

Exit: approved current runner identity plus one real successful path and one real failure/diagnosis/human-repair/retest path.

## Phase 5 — execute all active live acceptance cases

Owner: trusted operator with independent evidence review.

Use independent work items at staggered stages. Prepare at least three, adding more if needed so every role has useful eligible work. Never claim five-role concurrency from idle processes.

| Cases | Experiment and expected result |
| --- | --- |
| 1–3 | Discover branch/PR work; prove exact-SHA identity; advance head and show old checks cannot qualify the new candidate. |
| 4–6 | Demonstrate overlapping useful Fitter/Developer, Tester/Triager and Fixer activity on independent work. |
| 7–8 | Compete for one candidate and crash an owner; prove collision fallback, TTL recovery and old-owner write rejection. |
| 9–10 | Show Tester and Triager publish only allowed evidence and do not modify implementation. |
| 11 | Move failed head after diagnosis; prove stale Fixer refusal with no publication. |
| 12 | Repair a current failure through an acknowledged human session; show new SHA and fresh passing checks. |
| 13 | Submit a disposable candidate weakening protected tests; prove rejection before qualification. |
| 21 | Remove only authorized harness transient lease state; reconstruct from GitHub without losing durable work truth. |
| 22 | Show all five roles doing useful overlapping work, with identities, times, SHAs and outcomes. |

Record original SOW expectations alongside observations; the table is a preparation guide, not a replacement specification. Never flush Valkey or touch unrelated/Product 007 keys.

For each case archive run ID, timestamp, work branch/full SHA, request/Fit lineage, worker/session IDs, GitHub check/review/PR URLs, relevant lease observations, control/image/test/dependency digests, logs/artifacts and cleanup/recovery result. An independent reviewer must check actions and references, not just registry shape.

Exit: 15/15 genuine active passes, or an explicit case-by-case blocked/failed report. Deferred cases stay deferred.

## Phase 6 — final delivery

- Correct docs and evidence registry from verified observations only.
- Reverify types, build, offline tests and explicitly selected live suites. A skipped live test is not a pass.
- Review evidence for secrets and retrievability. Preserve permitted failure artifacts as well as successes.
- Commit related implementation/docs/evidence; record the full final SHA and clean Git status.
- Produce a concise delivery report separating implementation, offline results, live acceptance and deferred scope.

Full completion requires all preceding exit criteria, not merely a client demo.

## Client demo rehearsal and presentation

### Before the meeting

- Decide whether this is a progress demo or completed Stage A acceptance demonstration; use the correct label.
- Rehearse the exact sequence on the approved runner and record actual duration. Do not promise a live build will fit a meeting slot without measurement.
- Prepare separate approved, intentionally failing, stale-diagnosis and protected-test-attack work items on disposable demo branches; no destructive experiments on production main.
- Open the fixture preview, GitHub PR/check views, secret-free worker activity and evidence report. Show only application/session paths needed for the demonstration.
- Preserve a timestamped recording and evidence bundle from a real rehearsal as fallback. Label recordings as recorded; never present them as live.
- Keep costs/write consent bounded and confirm provider connectivity immediately before presenting.

### Suggested 20–30 minute presentation (subject to measured runtime)

1. Scope and fixture (3 minutes): Bun & Ember is the test application; browser roles/payments are demo-only. State current actual acceptance count and deferred scope.
2. Traceability and human boundary (5 minutes): show request, Fit, independent approval, isolated Dyad acknowledgement and exact candidate SHA. Use prepared human-approved stages if generation takes too long.
3. Real protected tests (5 minutes): show exact-SHA desktop/mobile results, App check identity, coverage and runner provenance. If runtime exceeds the slot, show transparently recorded results.
4. Failure to repair (5 minutes): show a real failed candidate, reviewed diagnosis, human Fixer result/new SHA and fresh retest. No self-approved AI repair claims.
5. Safety/concurrency (5 minutes): show wrong/stale SHA refusal, protected-test weakening rejection, and useful overlapping worker logs. Run crash/destructive cases during rehearsal and present their evidence.
6. Integration/status (3 minutes): if completed, show native queue synthetic checks and confirmed main outcome. Otherwise label integration blocked/pending and show the acceptance report honestly.

### Client sign-off checklist

- [ ] Exact request/Fit/candidate/check identities are visible and consistent.
- [ ] Independent approval and human edit acknowledgements are demonstrated.
- [ ] Passing protected results cover desktop and mobile, without skips/flakes.
- [ ] Failure produces diagnosis then new repair SHA and fresh tests.
- [ ] Safety refusals and useful concurrency have real supporting evidence.
- [ ] Native integration is either proven or explicitly labeled pending.
- [ ] Evidence links are retrievable and secrets are absent.
- [ ] Acceptance count is truthful; cases 14–20 remain deferred.

The browser preview alone demonstrates the fixture UI, not the five-role system, Docker isolation, GitHub authority or live SOW completion.
