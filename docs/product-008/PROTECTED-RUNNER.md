# Stage A protected production/browser runner

## Scope and trust

The operator reports Mac setup validation complete. That is user-reported infrastructure readiness, not a runner execution or SOW acceptance result. This increment implements local protected execution; it does not implement the five role lifecycles, publish trusted GitHub checks, or deploy.

The runner must be invoked from the trusted control checkout, not an unreviewed human/candidate worktree. A human reviews a full committed control SHA containing the runner programs, browser suite and frozen dependency files. Explicit image-preparation approval records an **operator-declared review**, not independently authenticated Fit acceptance or durable GitHub review provenance. The eventual Tester lifecycle must validate those authorities before publishing qualification.

No privileged environment is loaded by runner commands. Do not put tokens, private keys or secret values in command arguments, source, VITE variables or image configuration.

## Operator workflow (CLI argument reference)

1. Select the reviewed full control SHA after the implementation is committed. A prior SHA missing these runner files is rejected.
2. Select an official `mcr.microsoft.com/playwright:v<version>-noble@sha256:<64 hex digits>` base digest. Its Playwright version must match the frozen dependency version (currently 1.63.0); no image digest is invented or implicitly approved.
3. `runner-prepare <control-sha> <official-image@digest> --approve-reviewed-control-build` builds the local toolchain image and produces a private review record under `.safi/runner-images/`. Approval authorizes public dependency/image downloads. It does not authorize GitHub writes or production changes.
4. `runner-smoke <record.json>` exercises a synthetic host-secret canary, non-root execution, no inherited provider secrets, read-only controls/source, no Docker socket/Git metadata and network denial. It is explicitly local isolation smoke evidence, not a SOW pass.
5. `runner-test <candidate-sha> <record.json>` tests an already fetched exact local commit and produces `.safi/runs/<sha>-<unique>/manifest.json` plus local artifacts/evidence. No implicit current-HEAD selection.

Image preparation uses only committed reviewed package.json/pnpm-lock.yaml, test definitions and five container programs. It installs pnpm 10.12.4 and uses frozen, script-disabled dependency installation. It never copies the host node_modules, HOME, `.env`, private PEM, Docker socket or Git metadata into its build context. Native dependencies and browser/image version compatibility must succeed at runtime; a frozen-install error is blocking, not a reason to silently unlock versions. npm lockfile migration remains a separate outstanding gate.

The resulting image is selected by full immutable local `sha256:` image ID; each use checks control/dependency/test labels against the record and actual Git source. The unique image tag is retained for operator-managed cleanup. Preparation failures retain private failure logs.

## Candidate snapshots and protected paths

The host reads bounded Git blobs for the exact SHA using native Git with hooks/fsmonitor disabled. It does not check out candidate code, run filters, load candidate Git config or execute candidate scripts on the host. Dirty/untracked files are ignored. Tree entries reject symlinks, submodules, Git metadata, node_modules, path escapes and credential filenames. The reviewed nonsecret root `.env.example` is allowed; actual `.env` variants, PEM and key files are rejected. Limits are 5,000 files, 8 MiB per blob and 64 MiB total.

Candidate harness/tests/workflows, dependencies, TS/Vite/Tailwind/PostCSS config and AI_RULES must match the reviewed control. Protected deletion, test skipping changes, dependency edits and added control files are rejected before Docker execution. Legitimate control updates require a separately reviewed revision/image. The candidate must carry matching control files; the runner does not silently overlay a candidate's deleted tests and call that candidate compliant.

## Two separate containers

**Build:** read-only source snapshot; fixed trusted Vite invocation; frozen image dependencies; writable private tmpfs only. Candidate compilation has no network and no writable host mount. Build artifact bytes are exported in a bounded JSON packet, validated on the host, and materialized only as regular files. Artifact limits are 2,000 files, 8 MiB each and 32 MiB total; index.html is required.

**Browser:** a different container receives only the validated production artifact, read-only. It executes the image's reviewed Playwright definitions and trusted static SPA server, not candidate dev/server/test scripts. Both desktop/mobile Chromium projects run without retries, `.only` or skipped coverage. Current baseline is 11 tests per project (22 executions). Each test collects bounded console, page errors, HTTP failures and failed requests; expected remote-image/font aborts remain visible in evidence. Uncaught browser errors and failed local application responses fail acceptance. Failure screenshots and traces are retained.

Both containers have no network, non-root UID 1000, read-only root, dropped capabilities, no-new-privileges, CPU/memory/PID limits, unique names, no published ports, no host secret/Git/socket mounts, and bounded tmpfs output. Test artifacts also return through bounded packets—there is no writable host-results mount. Browser evidence limits are 2,000 files, 16 MiB each and 64 MiB total. All outputs are validated for canonical encoding, regular-file paths and duplicate identities before saving.

Containers are force-removed in cleanup after normal success, failure or command timeout. Abruptly killing the host controller can leave a named container until its child/global timeout exits; inspect only this runner's unique `safi-` container identity during authorized recovery. Worker lease-loss cancellation and durable publication recovery belong to the still-pending Tester lifecycle.

## Evidence and completion boundary

Manifests identify candidate/control SHAs, source/control/test/dependency digests, pinned image/base identity, timestamps, artifact bytes/checksums and browser evidence checksums. Successful local runs are `local-protected-run-only` with `qualificationPublished: false`. A browser success needs zero failing/skipped/flaky tests, no global errors, complete baseline desktop/mobile coverage and a successful process exit. Failed/partial outputs never qualify. Raw logs remain private and untrusted; never execute their contents.

Local evidence is Git-ignored, not permanent SOW evidence. Future trusted publication must attach durable summaries/references, validate accepted Fit/provenance and active lease authority, and retain artifacts according to policy. This module deliberately cannot mark the live 15-case registry passed.

`test:runner:live` is separate from ordinary builds/offline tests. Explicit `SAFI_RUNNER_RECORD` and `SAFI_RUNNER_CANDIDATE_SHA` select live execution; without them tests skip with reasons rather than claim runtime success. No automatic .env loading or provider-secret injection. Browser/Docker execution must be measured before it is reported passed.
