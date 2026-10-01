# Stage A issue intake and read-only reconciliation

## Delivery boundary

This increment implements GitHub issue-to-work intake, captured issue provenance, bounded GitHub reconstruction, untrusted event-file wakeups and independent local polling. It does not implement authenticated webhook hosting, automatic GitHub Actions dispatch, accepted-Fit provenance, human sessions, all five workers, or trusted execution publication. No live SOW case is certified by these commands.

Mac setup remains user-reported ready. Protected Docker/browser execution still needs an approved committed control revision and pinned image; this increment does not invent either approval or execution results. S3, Product 007 and production deployment remain excluded.

## Issue intake

The repository includes `.github/ISSUE_TEMPLATE/safi-work.yml`. GitHub renders its two required textareas as:

```markdown
### Description

Improve menu search so customers can find burgers by name.

### Acceptance criteria

- Matching items appear when entering a burger name.
- Clearing search restores items.
```

The parser accepts `##` or `###` headings, in that exact order, with no extra sections. Every criterion is a nonempty Markdown bullet; optional checkbox syntax is treated as requirement text, never a completed acceptance result. Title/description/criterion schema limits and a 10,000-byte issue body limit apply. Closed issues, pull requests exposed through the issues endpoint, wrong repository/issue identity and malformed requirements are rejected.

CLI argument reference: `intake-issue <positive-number> --approve-write`.

The App needs **Issues: read** in addition to existing Contents/Pull requests/Checks write permissions. The implementation does not change installation permissions or repository settings. The explicit flag consents to branch/PR writes, not to Fit acceptance, tests or release qualification.

The issue number maps deterministically to `work/issue-<number>`. The same request commit writes both:

- `changes/issue-<number>/request.json`: normalized requirements and canonical request digest.
- `changes/issue-<number>/source.json`: repository, issue number/global ID, official URL and SHA-256 of the original issue body.

Issue IDs are reserved; manual intake cannot impersonate issue provenance. Captured source must be a bounded regular blob. Replays reuse matching work and preserve closed PRs. Changed body/title/requirements or conflicting provenance reject rather than overwrite existing work. Metadata-only issue updates do not change source identity because updated_at is not used as the body revision. The source is re-fetched after intake; a concurrent edit/closure blocks a successful return and leaves the immutable captured history for review. GitHub cannot atomically transact issue edits with branch/PR creation; no captured request is automatically approved.

A genuinely changed request needs human resolution or a new issue, not a forced rewrite. Branch creation remains atomic; ambiguous writes are reconciled from remote truth. Valkey only owns renewable transient request leases.

## GitHub reconstruction

CLI argument references:

- `reconcile` or `reconcile --once`: bounded read-only pass.
- `reconcile --after work/<id>`: continue after the previous report's nextAfter cursor.
- `reconcile --watch`: local polling with cursor rotation; not an indefinitely waiting Actions job.
- `reconcile --event <envelope.json>`: read-only wakeup followed by fresh reconstruction.

Each pass enumerates at most 1,000 branches and 1,000 open PRs, then inspects up to 50 work branches. Incomplete/oversized enumeration blocks instead of pretending it is complete. Follow nextAfter to cover more work. Watch mode rotates that cursor and starts again after the final batch.

Reconstruction reads a fresh branch head and its exact commit/tree, verifies regular non-executable JSON blobs, bounded tree/blob sizes, canonical base64, actual Git blob hash and work identity, and rechecks the head before returning. It observes same-repository PR lineage, request/source, optional Fit/diagnosis and exact-SHA checks from the configured App. Fork PRs and foreign App checks do not become authority. Multiple matching PRs, missing records, invalid blobs, symlinks or head advancement block that work.

All-state PR lookup distinguishes a branch with no PR history (orphan) from preserved closed work. Neither is automatically reopened. An orphan can be reconciled by replaying its original intake packet under a lease; read-only discovery itself does not create a PR.

Issue source is compared with a fresh open issue when accessible. changed or unverified source remains visible. A valid Fit is only present-unverified until human review/provenance is independently established. Diagnosis for another SHA is stale. **Even five successful App-authored check names do not grant qualification.** Every observation has qualified:false; the report has roleEligibilityVerified:false and qualificationPublished:false.

Reconstruction uses no Valkey or workflow database, so transient lease loss cannot erase this source history. That architectural/offline property is not a live case 21 pass; actual loss/recovery proof with running workers remains pending.

## Polling and outages

The App is revalidated for every pass. Successful watch passes wait 30 seconds. Transient global failures stop the pass and produce a fixed redacted blocked message; later read-only passes re-fetch GitHub truth. Retry-After and exhausted quota reset headers increase wait time, bounded to 30 seconds–1 hour. Authentication/access/rate-limit/service errors do not trigger a request for every work item. Privileged writes are never retried by this polling loop.

SIGINT/SIGTERM cancels sleeps and stops new reconstruction calls; an already active bounded API request may finish before shutdown. Per-work schema failures are reported without granting readiness. This does not complete the wider App refresh/retry, branch-writer, human-session or publication recovery policies.

## Event-file boundary

Example local envelope:

```json
{
  "event": "push",
  "deliveryId": "delivery-123",
  "payload": {
    "repository": { "full_name": "hirakroya50/vigilant-kraken-blink" },
    "after": "untrusted-event-sha"
  }
}
```

Supported hints are issues, pull_request, push, check_run and workflow_run. Inputs are regular JSON files at most 256 KiB; foreign repositories and malformed envelopes are rejected. Extra payload fields are not executed or used as approval, candidate identity, handoff or write authority. The return explicitly states untrusted-wakeup-only and writeAuthorized:false.

No signature or sender authentication is claimed. There is **no public webhook endpoint** and no automatic privileged intake from event files. Duplicate/out-of-order events only cause fresh read-only queries; event SHAs never override remote heads or carry qualification forward. An authenticated event transport/dispatch layer is still pending.

## Evidence

Offline tests use simulated GitHub HTTP state; record hashes are computed from actual test bytes. They exercise duplicate issue intake, changed/missing/symlink provenance, forks, orphan/closed work, stale heads, blob forgery, truncated/oversized trees, rate limits, cursors, cancellation and untrusted event boundaries. They do not prove live permissions, useful worker concurrency or SOW acceptance. The 15-case Stage A registry stays blocked until actual durable evidence is collected and verified.
