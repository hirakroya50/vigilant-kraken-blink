# Bounded OpenAI proposals — not autonomous worker completion

## Implemented scope

`src/harness/ai/openai.ts` uses the OpenAI SDK for schema-constrained Fit and diagnosis drafts. `ai-propose` writes a local proposal only. It does not inspect GitHub, acquire a worker lease, verify a source checkout, commit an accepted Fit, publish a diagnosis check, edit implementation or qualify a release. Those worker operations remain pending.

Drafts carry `needs-human-review`, `ai-unreviewed`, a declared full candidate SHA, model identity, context SHA-256 digest, timestamp, and provider-reported usage (null if absent). Their source verification is explicitly `operator-supplied-context-not-verified`. They are not accepted `fitSchema`/`diagnosisSchema` records. The model cannot fill acceptance identity or produce success evidence.

## Input boundary

The explicit JSON packet contains application source selected by the trusted operator. Never include `.env`, private keys, payment/card data, provider credentials or personal data. The adapter does not read files automatically or execute model output. Allowed paths are normalized fixture paths under `src/pages`, `src/components/burger`, `src/lib/burger`, plus `src/App.tsx` and `src/globals.css`. Harness/tests/config/dependencies are excluded.

Both the provider's strict JSON schema and local Zod validation restrict output. A local scope check ensures requested edits stay within the supplied permitted path list. Instructions classify source/diffs/requests/failure logs as untrusted data; this is not a guarantee against model manipulation. Human review and downstream protected gates remain necessary.

## Limits and consent

- Maximum serialized input: 60,000 UTF-8 bytes.
- Each source file: at most 18,000 characters; at most 30 files and 30 permitted paths.
- Maximum completion: 2,000 tokens; maximum accepted response: 18,000 UTF-8 bytes.
- At most four inference attempts per adapter instance, including failures/probes.
- 30-second SDK timeout, zero automatic retries.
- Official OpenAI endpoint pinned explicitly; SDK payload logging disabled.
- Refusals, truncation, malformed/extra fields, invalid scope and exhausted budgets reject the proposal.

These are request/instance caps, not an account-wide dollar spending limit. A new CLI process has a new budget. Configure provider-side project limits and monitor billing; durable per-work spend accounting remains future worker work. No retries or alternative-model substitution conceal a provider failure.

## CLI operation

Arguments: `ai-propose <input.json> --approve-cost`. This explicit flag authorizes one potentially paid structured inference call. Without it, the command rejects before calling the provider. Configuration comes from the Git-ignored `.env` plus caller environment overrides.

Output is a new, non-overwriting, owner-readable JSON file under Git-ignored `.safi/proposals/`. The CLI reports the file location and `qualification:false`, not draft contents or credentials. Review the draft locally. There is no implemented acceptance/publish action yet; do not manually treat a draft as `safi/fit` or `safi/triage` success.

### Fit packet example (illustrative, not actual SHA evidence)

```json
{
  "kind": "fit",
  "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "request": {
    "version": 1,
    "id": "menu-search",
    "title": "Improve menu search",
    "description": "Ensure menu search matches burger descriptions.",
    "acceptance": ["Searching a description term returns matching available burgers."]
  },
  "permittedPaths": ["src/pages/Menu.tsx"],
  "files": [{ "path": "src/pages/Menu.tsx", "content": "Insert the selected exact-commit application source here." }]
}
```

Replace the illustrative SHA and source with the actual selected candidate's data. This CLI cannot prove the supplied content belongs to that SHA; the future Fitter will gather and bind source from Git itself.

### Diagnosis packet

Use `kind:diagnosis`, `workId`, `candidateSha`, a schema-valid already accepted `fit`, `permittedPaths`, `files`, `diff`, and `failures` containing GitHub `checkUrl` and bounded `summary`. Work ID must match Fit and repair scope must remain within accepted Fit paths. Failure-check authenticity, exact failed SHA, read-only inspection and durable check publication belong to the pending Triager lifecycle.

## Testing interpretation

Offline tests route SDK calls to fake HTTP responses and verify request shape, scope, malformed/refused/truncated replies, failures, budget exhaustion and mandatory review status. They do not prove real OpenAI access, billing, diagnosis quality, or any SOW case. The `doctor --ai-probe` operation can exercise bounded live inference on the trusted runner when explicitly authorized.
