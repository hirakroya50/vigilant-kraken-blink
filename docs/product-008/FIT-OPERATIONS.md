# Fit commit and trusted publication

## Delivery boundary

The client has deferred S3 and Product 007 for now. The active delivery target is Stage A (cases 1–13, 21 and 22); cases 14–20 remain blocked/deferred, not passed. This increment completes two bounded Fit operations, not all five worker lifecycles or Stage A acceptance.

## Operations

CLI argument references:

- `fit-commit <draft.json> --approve-write`
- `fit-publish <work-id> --approve-write`

Both require verified GitHub App access and reachable Valkey. The explicit flag authorizes repository/check writes. It does not approve the Fit, configure branch protections, approve a runner image, or permit arbitrary candidate execution. PAT authentication cannot publish trusted results.

Both operations acquire renewable candidate-specific Fitter and repository/work-specific branch-writer leases. Ownership is rechecked before privileged operations. Lease loss stops further writes. Crashes may leave unreachable Git objects; a completed ref write remains discoverable in Git.

### Commit

The input is a regular JSON file up to 64 KiB:

```json
{
  "version": 1,
  "workId": "menu-search",
  "requestSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "summary": "Add customer-entered menu search while preserving checkout.",
  "allowedPaths": ["src/pages/Index.tsx"],
  "acceptance": [
    {
      "id": "search",
      "assertion": "Matching items appear and clearing the input restores the menu.",
      "test": "Human-reviewed protected acceptance test reference"
    }
  ]
}
```

The illustrated SHA must be replaced with the actual immutable intake request SHA. This is a schema example, not an approved request or executed test.

The operation verifies bounded, hash-matching Git blobs, request identity, open same-repository PR and unchanged issue provenance where applicable. It creates exactly one Fit-only child commit on the request SHA, adding `changes/<id>/fit.json`. Only non-force fast-forward ref updates are permitted. A competing head blocks publication. A matching one-commit replay returns existing work without writes; different Fit content is never overwritten.

The operation does not generate AI output, publish a passing check, or mark a draft PR ready. A human must make the PR ready for review and arrange an independent repository collaborator's exact-head approval. Assertions in the Fit file are specifications, not executable browser evidence.

### Publish

The publisher verifies the existing human-review protocol: one Fit-only child commit, unchanged request/source, open ready same-repository PR, and non-author collaborator approval of the current SHA. Canonical GitHub review ID/URL, request/Fit digests, reviewer/time, accepted paths and exact Fit SHA are persisted in the App-authored `safi/fit` summary.

The review and remote head are freshly reconstructed before publication, before replay reuse, and after publication. Withdrawn approvals, stale heads, changed issues and lost role/writer ownership block a successful return. Evidence IDs are content-derived. A matching check is reused; conflicting content under an existing identity is rejected.

GitHub cannot atomically transact a review change with check creation. If review/head changes in the final network window, the check remains evidence on its old exact SHA and the operation cannot return successful current readiness. Downstream workers must independently revalidate the same review lineage before acting. A check name or old approval alone never authorizes implementation.

Publishing `safi/fit` does not qualify the candidate, create a Developer session, dispatch workers, attach build/test success, or certify a SOW case.

## Remaining gates

- Fitter source discovery, bounded proposal generation and independent worker loop.
- Human Developer/Fixer claim/acknowledge/complete sessions and expected-head publication.
- Accepted-Fit lineage/conformity for subsequent implementation and merged SHAs.
- Trusted Tester and read-only Triager lifecycles, independent scheduling and recovery.
- Approved committed runner control and matching image, followed by actual Docker/browser measurements.
- Live Stage A acceptance evidence and five-role useful concurrency.

Offline HTTP tests verify these two operations' boundaries; mock collaborator reviews are not actual human approval or live SOW evidence.
