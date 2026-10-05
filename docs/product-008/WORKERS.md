# Independent Stage A workers

The five CLI roles are implemented as bounded independent local workers, not one global state machine. Live acceptance is still unmeasured. No Product 007, S3 upload, deployment, live verification or rollback is attempted.

## Prerequisites and authority

Use the trusted Mac with configured GitHub App, reachable Valkey and approved OpenAI model. Candidate commits must already be fetched into the trusted local Git repository by an authorized operator; workers never silently fetch/execute an arbitrary remote checkout. Fitter/Triager source comes from exact Git blobs, not dirty files. Tester needs a reviewed committed control and matching pinned Docker image. The existing local image may predate this increment and cannot certify the new control automatically.

`--approve-write` consents to role commits/checks. Fitter/Triager also require `--approve-cost`. Only Fitter accepts trusted enumerated application `--paths`; all other roles obtain paths from accepted Fit. Tester requires `--runner` with the reviewed image record. Missing prerequisites fail closed before qualification. No credential is passed to candidate build/browser containers.

## Command reference

These are CLI interfaces, not a claim that they were executed against live providers:

| Mode | Required options | Behavior |
| --- | --- | --- |
| `fitter` | `--paths <comma-separated application paths> --approve-write --approve-cost` | Drafts Fit using bounded verified source; creates one Fit-only commit. On a later pass, fresh independent exact-Fit-head GitHub collaborator approval permits `safi/fit` publication. |
| `developer` | `--approve-write` | Claims an accepted Fit-only head, prepares isolated checkout and waits for acknowledged human Dyad work. |
| `tester` | `--runner <record.json> --approve-write` | Executes actual protected network-disabled build/browser containers; publishes exact-SHA Fit conformity, build, test and regression evidence. Never edits implementation. |
| `triager` | `--approve-write --approve-cost` | Reads same-SHA failures, bounded available local browser/build logs, source and parent diff; creates AI diagnosis and waits for explicit human review. Publishes diagnosis on the failed SHA without committing/editing implementation. |
| `fixer` | `--approve-write` | Requires latest same-SHA failure plus trusted bounded diagnosis; prepares acknowledged isolated human repair. Stops on moved head. |
| `release` | none | Explicitly deferred; no synthetic release/live success. |

Common options: `--once` (default), `--watch` (at most 20 discovery cycles, 30-second normal intervals), `--event <hint.json>` and `--session-minutes <1..120>` (default 30). Watch workers exit on execution errors/ambiguous writes; only read-only discovery retries with bounded provider backoff. An adapter permits at most four AI calls. Restarting is an explicit new operator decision, not an unlimited cost loop.

Discovery includes draft PRs only for initial Fit drafting. A human marks the PR ready for independent GitHub review. Active candidates are ordered by request priority (0–100, higher first), then PR creation time and work identity. Each worker reads current GitHub truth; no permanent READY/NEXT data is stored.

## Leases and cancellation

Role leases use `safi:leases:<role>:<repository>:<full-sha>`; modifying roles additionally share `writer:<repository>:<work-id>`. A collision skips that candidate and tries other eligible work. Heartbeats renew while humans/containers work. Ownership loss aborts waiting and Docker execution and prevents subsequent publication. Containers are forcibly cleaned up by identity. SIGINT/SIGTERM cancel the worker. Lease release is owner-safe; Valkey disconnects on all exit paths. No global five-role lock exists.

Git checks are published individually. A crash may leave partial checks; a fresh worker reconstructs remaining work from GitHub. No all-or-nothing check batch is claimed. A network-ambiguous write is not blindly retried. An old owner must reacquire and revalidate after expiry.

## Human Dyad sessions

The worker prints its private `.safi/sessions/session-*` directory, isolated checkout, session ID and deadline. Open the isolated checkout in Dyad. The harness does not fabricate source edits.

`session-action <session-directory> <owner-only-action.json>` accepts exactly:

- `{"action":"acknowledge","sessionId":"<uuid>"}`
- `{"action":"complete","sessionId":"<uuid>","candidateSha":"<full-40-character-sha>"}`
- `{"action":"cancel","sessionId":"<uuid>"}`

Files must be owner-only regular JSON files, not symlinks. Acknowledgement and finish are non-overwriting separate files. Completion requires acknowledgement, live leases, unchanged remote head/Fit/diagnosis, a clean checkout, one non-merge child commit, permitted regular-file diff and bounded exact blob/tree identity. The App uploads only allowed application blobs and creates a remote implementation commit with human session/source provenance. Its full SHA can differ from the local source commit because the App commit author/message differ; the exact tree must match. It publishes only role completion, never tested/release-ready status.

Incomplete/cancelled/expired checkouts are retained for recovery, never force-deleted. Completed clean checkouts are removed without force; concurrent human edits cause retention. Retained edits have **no surviving publication authority**. Reacquire a fresh session and manually transfer only still-permitted changes; do not replay old completion files.

This is an explicitly trusted **same-OS-user local human** boundary, not production remote authentication. GitHub Fit approval remains independent and externally identified. Do not share this OS account with untrusted users/candidate code.

## Protected acceptance coverage

Each Fit `acceptance.test` must identify `<file.spec.ts>::<exact protected test title>`, for example `shop.spec.ts::search, categories, unavailable items`. All accepted assertions must have a real passing test on desktop and mobile Chromium. Skips, flakes and expected-failure tests never count as assertion coverage.

An existing passing regression suite does **not** prove newly requested behavior. Missing mappings publish neutral `safi/test` and block qualification. New behavior needs separately authored, reviewed, committed protected tests/control before candidate work; Developer/Fixer cannot change that control themselves. If the frozen control changes, prepare/review the matching image and use new candidate evidence. No inference that string title matching proves an assertion's semantics is made: human Fit/control review owns that correspondence.

Tester concise checks carry SHA, immutable Fit lineage, runner/control/test/dependency/image identities, artifact digest, coverage and local-manifest digest. Full logs/trace/manifest remain private under `.safi/runs/<sha>-*`; preserve/export these for acceptance evidence. Local disk availability is required for detailed Triager context from this runner. These are not durable S3 artifact uploads.

## Diagnosis review

Triager prints a private `diagnosis.json` with candidate, reviewed draft bytes, digest, session ID and deadline. After actually reviewing it, `diagnosis-review <directory> <approve|cancel> --approve-review` submits a same-user acknowledgement. The running worker revalidates head, accepted Fit, leases and latest failure IDs/content before publication. Review does not modify the diagnosis or grant a test pass. Fixer validates the exact-SHA diagnosis digest, scope and current failure URLs. Old failures superseded by successful checks do not grant repair readiness.

## Native integration boundary

`integration-inspect <work-id>` verifies provenance-aware exact-SHA qualification and active effective main rules. `integrate <work-id> --approve-write` explicitly enrolls the PR in GitHub's native merge queue with `expectedHeadOid`; it does not merge directly or change settings. Main must have an active merge-queue rule plus strict required Fit/build/test/regression checks bound to the verified App. Queue/API availability is an external requirement. Duplicate/ambiguous queue results must be inspected in GitHub, not blindly replayed.

**Queue enrollment is not integration completion.** A trusted merge-group/main runner and actual native queue/protection configuration must independently test the synthetic/merged SHA. This increment does not install such a trusted dispatcher or assert any merged/main release qualification. Existing fixture CI is development CI only, not a protected SAFI gate.

## Acceptance still to execute

Review/commit current control, fetch prepared candidates, establish approved Docker image, exercise actual Fit/collaborator and Dyad sessions, and run useful overlapping roles on independent work. Capture lease collision, process kill/TTL recovery, stale repair, test weakening rejection and Valkey-loss reconstruction on actual GitHub/Valkey. Attach durable case-specific evidence to cases 1–13, 21, 22. Offline tests are security/logic evidence, not live SOW passes.

Remaining implementation/infrastructure work beyond this bounded continuation: automatic authorized candidate synchronization; authenticated event dispatcher (current event files are hints); trusted merge-group/main gate execution; frozen npm lockfile migration. Do not describe the entire in-scope SOW as completed until these and actual acceptance/clean-commit delivery are resolved.
