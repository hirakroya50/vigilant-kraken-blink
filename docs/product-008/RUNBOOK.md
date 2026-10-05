# Trusted execution and recovery runbook

## Authority

Branch + PR is the work item; the full 40-character commit SHA is the candidate. Request/Fit belong under `changes/<id>/`. GitHub checks and Git history hold durable evidence. Valkey holds temporary owner-safe candidate/branch claims only. No global NEXT pointer, permanent READY flag or workflow database.

Use [WORKERS.md](WORKERS.md) for implemented role/action interfaces. Pure check helpers or check names alone never authorize qualification. Fresh accepted Fit provenance, current candidate, trusted App check identity, actual protected-run evidence and full acceptance coverage are required.

## Exact-SHA protected execution

- Commit Fit before attaching `safi/fit`; new implementation SHA requires fresh conformity/build/browser/regression evidence.
- Accepted Fit review must be independent, human, same-repository, exact-Fit-head and non-author. Request/source/Fit bytes remain immutable along the bounded linear candidate lineage.
- Reject unauthorized source, tests, contracts, workflows, dependency and harness edits. Broadening application scope requires protected review.
- Build/browser processes execute in separate network-disabled containers with read-only host mounts, pinned image/tests/dependencies, no capabilities and no forwarded provider credentials. Never run candidate code in a privileged host, `pull_request_target` or credentialed checkout.
- Triager diagnosis belongs on the failed exact-SHA check, not a branch-changing diagnosis commit.
- Missing protected test coverage is not a pass. New assertions require separately reviewed protected control.
- Qualification is feature evidence; native queue enrollment is not a merge. The synthetic/merged main SHA still needs independently trusted checks. Current fixture CI is not that protected dispatcher.

## Human sessions

Developer/Fixer actively hold renewable candidate/writer claims while the same local OS user reviews the handoff and edits the isolated checkout in Dyad. Explicit acknowledgement precedes completion. Completion checks live ownership/deadline, unchanged head/Fit/diagnosis, clean single-child commit, bounded permitted regular-file diff and exact uploaded blob/tree identity. New App commit SHA is published only as untested role completion.

Expired/cancelled/interrupted checkouts are retained, not force-deleted. They never retain privileged session authority. After recovery acquire fresh work and manually re-evaluate/transfer appropriate edits; do not replay old action files. The local human boundary is not production multiuser authentication.

## Lease and write recovery

- Only the unique current owner can atomically renew/release. TTL expires on worker death; old owners cannot delete replacement leases.
- Workers skip occupied candidates and try unrelated work. No global role lock.
- Heartbeat errors abort waiting/container work and prevent subsequent privileged publication. Containers are cleaned up by generated identity.
- Writers share a narrow branch-writer claim, re-fetch expected head and perform non-force updates of one child commit.
- Git/API writes cannot be rolled back transactionally across checks. A crash may leave a valid commit or partial check batch; reconstruct GitHub truth before recovery. Never blindly retry an ambiguous privileged write.
- SIGINT/SIGTERM cancel workers and disconnect Valkey. Retain private evidence/manifests and incomplete human checkouts.
- The adapter never flushes namespaces. For a lease-loss experiment only authorized transient `safi:leases:` keys may be removed. **Never flush Valkey or delete Product 007 route keys.**

## Events and runtime preparation

Workers accept repository-scoped event-file hints and independently perform fresh bounded discovery. Hints never provide authenticated approval, authoritative SHAs or write instructions. Authenticated event dispatch is not installed. Normal read-only discovery observes bounded provider backoff; failed executions exit for explicit reconciliation rather than retrying writes.

An authorized operator must fetch exact candidates into the trusted repository before source/worktree/runner use. Automatic authorized synchronization is not implemented. Existing local Docker records must be reviewed against the newly committed current control; never infer freshness from their mere existence.

## Durable acceptance evidence

Each live case requires timestamp, work identity/branch, exact SHA, actual worker/session identities, exact-SHA GitHub check URLs, logs and relevant artifact references. Concise check summaries have runner/lineage/manifest identities; preserve private full logs and traces for independent review/export. Registry schema validation cannot prove the infrastructure action occurred.

All 15 active Stage A cases remain unpassed here. Cases 14–20 are deferred. See [STATUS.md](STATUS.md) for verified offline results and remaining implementation/external gates.
