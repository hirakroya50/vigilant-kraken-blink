# Human-reviewed Fit inspection

## Current capability

`fit-review <work-id>` is a **read-only review verifier**; it does not run Fitter, create a Fit draft, change PR draft state, publish `safi/fit`, dispatch Developer, or claim SOW acceptance. It returns no verified-human result unless GitHub contains a non-author repository collaborator's approval of the exact current PR SHA and all records match.

The work PR must be open, same-repository, ready for review (not draft) and point to the current branch head. It must contain exactly one new commit directly on the original intake request SHA, changing only `changes/<work-id>/fit.json`. The bounded JSON draft uses `fitDraftRecordSchema` and includes work ID, original request SHA, summary, allowed application paths and acceptance assertions. It has no reviewer-name, accepted-time or self-approval field. The request blob must be byte-identical at the original request SHA and reviewed head; the Git comparison must prove the exact one-file Fit-only commit.

The inspector requires a GitHub pull-request review with state `APPROVED`, exact current head SHA, a real User, non-author identity, and GitHub `OWNER`, `MEMBER`, or `COLLABORATOR` association. A collaborator's later unresolved `CHANGES_REQUESTED` blocks acceptance; a subsequent explicit approval can clear that person's own latest decision. Comments, bot reviews, outsider contributor associations, self-reviews and stale approvals do not count. Reviewers need to take the existing draft PR out of draft and submit their approval through GitHub. This flow doesn't configure branch protection.

Issue-backed Fit also requires original issue body/request provenance still unchanged. Changed/closed issue, missing/forged provenance, modified dependencies/code/other files in the Fit commit, changed head, invalid blob hash or truncated tree blocks review. Unknown remote/provider failures fail closed.

The result can derive accepted reviewer and timestamp from GitHub, and returns the Fit draft digest and approved file scope. Its explicit flags remain `developerHandoffPrepared:false`, `checkPublished:false`, `qualificationPublished:false`. No author field in a committed Fit file becomes evidence. The separate write-consented `fit-publish` operation now acquires role/writer leases, revalidates the branch/review/head before publication and persists accepted-review lineage in exact-SHA `safi/fit`. See [FIT-OPERATIONS.md](FIT-OPERATIONS.md).

The separate `fit-commit` operation can now create a validated Fit-only draft commit. Automatic source discovery/proposal generation, the complete Fitter worker lifecycle, downstream human sessions/handoff, review account policy beyond GitHub collaborator association, and durable live evidence remain unimplemented. Offline tests exercise deterministic review selection, compare boundaries and publication/replay safety; mocked reviews are not human approvals or SOW passes. All 15 Stage A cases remain blocked.
