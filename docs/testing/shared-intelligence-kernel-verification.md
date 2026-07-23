# Shared Intelligence Kernel verification record

This document records the sanitized Task 22 verification state. It is a
documentation record, not a substitute for the ignored raw evidence. No
prompt, credential, private filesystem path, provider payload, PID, port,
profile location, or launch nonce is reproduced here.

## Revision and checkout

| Item                                         | Recorded value                                          |
| -------------------------------------------- | ------------------------------------------------------- |
| Branch                                       | `codex/shared-intelligence-kernel-design-20260716`      |
| Worktree                                     | `.worktrees/shared-intelligence-kernel-design-20260716` |
| Branch merge base with `origin/main`         | `8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`              |
| `origin/main` observed during documentation  | `65931c1cbb2982e6991238af45a3cf39702c7802`              |
| Verified product/test head                   | `27a89c0927470be19279219c22e490188e1f284f`              |
| Final product correction                     | `691e1b25657ca8d34accbc1d61d57397ee2b4b80`              |
| Canonical scheduled-retry fixture correction | `27a89c0927470be19279219c22e490188e1f284f`              |
| Documentation revision                       | This document's containing commit                       |

The checkout retained protected, pre-existing Rust edits and the unrelated
`install/install.ps1` working-tree deletion while this record was written.
Task 22 did not alter, stage, discard, or commit them. The older
`410`-file / `3,875`-test result in
`.superpowers/sdd/evidence/task-22/20260722T040654Z/` is superseded by the
current full-suite result below.

## Repository verification gates

All PASS results below returned exit code `0` at the recorded product/test
head unless the row names the immediately preceding product commit. The
ignored evidence root is
`.superpowers/sdd/evidence/task-22/20260723T015815Z-final/`.

| Gate and exact command                                                                                               | Sanitized result                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm --prefix app test -- --pool=threads --maxWorkers=1`                                                             | **PASS** — `412` files and `3,950` tests; `1,956.59 s` Vitest duration.                              |
| `npm --prefix app test -- src/lib/jarvis --pool=threads --maxWorkers=1`                                              | **PASS** — `60` files and `1,395` tests against the exact fixture correction committed as `27a89c0`. |
| `npm --prefix app run typecheck`                                                                                     | **PASS** — TypeScript completed without diagnostics.                                                 |
| `npm run test:release-manifest`                                                                                      | **PASS** — the release-manifest test passed.                                                         |
| `npm run build` with process-local `NODE_OPTIONS=--max-old-space-size=1536`                                          | **PASS** — `3,873` modules transformed; built in `1m 3s`.                                            |
| `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`                                                      | **PASS**.                                                                                            |
| `cargo check --manifest-path app/src-tauri/Cargo.toml`                                                               | **PASS** — warnings only; `2.29 s`.                                                                  |
| `cargo check --release --manifest-path app/src-tauri/Cargo.toml`                                                     | **PASS** — warnings only; `28.16 s`.                                                                 |
| `cargo build --manifest-path app/src-tauri/Cargo.toml --example vibespace_kernel_smoke_cli`                          | **PASS** — warnings only; `47.70 s`.                                                                 |
| `cargo test --manifest-path app/src-tauri/Cargo.toml`                                                                | **PASS** — library `93` passed and `7` ignored; main/doc targets had zero tests and zero failures.   |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -ValidateOnly` | **PASS** — script validation and `playwright-core@1.61.1` availability.                              |

The default Vitest forks pool could not start its final Windows worker while
the host had very low free virtual memory; no assertion failed, but that
incomplete invocation is not counted as PASS. The authoritative run changed
only the pool and worker-count resource controls and executed the complete
unchanged `412`-file scope. Likewise, the first build transformed all `3,873`
modules before a native `0xC0000409` resource exit; the bounded Node-heap retry
above completed. Rust used `CARGO_BUILD_JOBS=1`,
`CARGO_PROFILE_DEV_DEBUG=0`, and a merged `TAURI_CONFIG` override containing
`app.macOSPrivateApi: true`. These resource controls did not relax a test or
product assertion.

The remaining focused Task 22.1 results were:

| Scope                                                             | Sanitized result                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Account identity                                                  | **PASS** — `1` file / `6` tests at `691e1b2`; the later fixture-only commit did not touch this scope. |
| Kernel database and migrations                                    | **PASS** — `5` files / `128` tests.                                                                   |
| AI runtime, transport, and attempt evidence                       | **PASS** — `4` files / `87` tests.                                                                    |
| Plugin credentials, authorization, runtime, UI, and security host | **PASS** — `12` files / `60` tests.                                                                   |
| Voice                                                             | **PASS** — `23` files / `200` tests.                                                                  |
| Schedule                                                          | **PASS** — `8` files / `76` tests.                                                                    |
| JARVIS runs                                                       | **PASS** — `6` files / `25` tests.                                                                    |
| Browser approval path                                             | **PASS** — `3` files / `60` tests.                                                                    |
| Command Center and chat projection                                | **PASS** — `6` files / `66` tests.                                                                    |
| Smoke contracts and deterministic provider                        | **PASS** — `7` files / `94` tests.                                                                    |

The focused security/runtime rows include the production-inaccessibility
contract: the development smoke surface is unavailable without the explicit
isolated native-smoke flags and binding checks.

## Performance and selector bounds

The final focused performance and selector runs used the Task 22.2 files:

```text
npm --prefix app test -- src/lib/jarvis/promptCompiler.performance.test.ts
npm --prefix app test -- src/lib/jarvis/response/pipeline.performance.test.ts
npm --prefix app test -- src/lib/db/jarvisRepositories.test.ts src/lib/jarvis/executionJournal/recovery.test.ts src/features/jarvis-command-center/selectors.test.ts
```

All three commands returned exit code `0`. The final recorded measurements
were:

| Harness                                         | Samples / sanitized size                                             |        p50 |        p95 |    Maximum | Acceptance             |
| ----------------------------------------------- | -------------------------------------------------------------------- | ---------: | ---------: | ---------: | ---------------------- |
| Request envelope plus prompt compilation        | `200` samples; `4,862` context chars; `11,314` compiled system chars | `3.705 ms` | `5.380 ms` | `6.694 ms` | **PASS**, p95 `<25 ms` |
| Deterministic response classification plus lint | `500` samples; `43` response chars; `0` violations; `0` repair calls | `0.132 ms` | `0.305 ms` | `1.301 ms` | **PASS**, p95 `<15 ms` |

The repository/recovery/selector command passed `3` files and `101` tests.
It covers selector limits `0`, `501`, and very large values being rejected or
clamped, no query returning above `500`, and zero Live Systems/graph calls
while the Command Center is collapsed.

## Isolated native scenario matrix

Evidence references are repository-relative. A PASS means the final scenario
JSON reports `"outcome": "PASS"`; earlier failed attempts are retained in the
ignored evidence tree but are not represented as final outcomes.

| Scenario                        | Final status                               | Sanitized evidence directory                          | Verification summary                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transport_provider_success`    | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T155727Z/` | Protected provider transport completed through the canonical run.                                                                                                                                                                                         |
| `transport_cli_success`         | **BLOCKED_EXTERNAL**                       | `.superpowers/sdd/evidence/task-22/20260722T155727Z/` | The credential-free native example could not execute under Windows App Control without an accepted code signature. This row is not a product PASS.                                                                                                        |
| `voice_turn_stop`               | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T164109Z/` | Voice open/transcript/run binding, real Stop propagation, cancellation truth, and no stale assistant success were observed.                                                                                                                               |
| `native_stt_voice_turn`         | **BLOCKED_EXTERNAL** (`model_unavailable`) | `.superpowers/sdd/evidence/task-22/20260722T164420Z/` | The real `faster-whisper` / `small` path recorded the safe fixture digest and session binding, then failed closed because the native model was unavailable. No transcript injection was used; no run-bound transcript or PASS is claimed.                 |
| `command_center_reduced_motion` | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260723T014358Z/` | The full Command Center subtree (`23` DOM nodes plus discovered pseudo-elements) had zero computed animation, transition, or pulse; keyboard focus and canonical Outputs/Live Systems content were preserved.                                             |
| `approval_safe_auto`            | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T164420Z/` | Safe automatic approval followed the canonical approval contract.                                                                                                                                                                                         |
| `approval_confirm`              | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T164420Z/` | Independent confirm approval completed through the trusted path.                                                                                                                                                                                          |
| `approval_dangerous`            | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T165621Z/` | Dangerous approval required and recorded independent human approval.                                                                                                                                                                                      |
| `artifact_provider`             | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T172052Z/` | Provider artifact was accepted only with its producer receipt/result proof.                                                                                                                                                                               |
| `artifact_file_action`          | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T172052Z/` | File-action artifact used the matching producer proof; source-only candidates were not elevated.                                                                                                                                                          |
| `artifact_terminal`             | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T204919Z/` | Terminal artifact used the matching terminal producer proof.                                                                                                                                                                                              |
| `schedule_dispatch`             | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T215009Z/` | Scheduled dispatch reached the canonical protected kernel.                                                                                                                                                                                                |
| `schedule_transport_retry`      | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260723T012630Z/` | Attempt 1 persisted `retryable_failed` before response start with zero chunks, approvals, artifacts, actions, or executor claims. Restart did not auto-dispatch; explicit retry retained the run/snapshot, created request/attempt 2, and committed once. |
| `live_evidence_restart`         | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260723T014047Z/` | Same-profile restart reconstructed exactly the complete nonempty terminal proof set, with the same opaque proof and no additional node, while omitting the prior-process active-only proof; no UI event folding or authority write is claimed.            |
| `hive_dispatch`                 | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T223223Z/` | Hive final dispatch used the canonical protected kernel.                                                                                                                                                                                                  |
| `partial_response`              | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T224138Z/` | Partial-response truth and quiet-state handling were preserved.                                                                                                                                                                                           |
| `provider_failure`              | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T224304Z/` | Expected provider failure produced a failed canonical run with no assistant success.                                                                                                                                                                      |
| `cancel_before_claim`           | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T225010Z/` | Pre-claim cancellation preserved tombstone/handoff truth without execution.                                                                                                                                                                               |
| `cancel_running`                | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T225010Z/` | Running cancellation recorded signal delivery and matching terminal cancellation.                                                                                                                                                                         |
| `cancel_completion_race`        | **PASS**                                   | `.superpowers/sdd/evidence/task-22/20260722T225419Z/` | Completion/cancel race resolved to one canonical terminal truth.                                                                                                                                                                                          |

### Native isolation and cleanup protections

Every completed scenario record contains the four-way binding to the unique
native descendant, freshly selected loopback port, isolated profile digest,
and random launch nonce; binding failures are recorded as zero. The values
remain in ignored evidence and are intentionally not copied into this staged
document.

The helper used a disposable identifier/profile and explicit development-only
flags, selected the native descendant by canonical executable plus creation
time rather than by process name, and drove only stable `data-sik-evidence`
selectors. Its bounded cleanup was scoped to the captured descendant tree,
validated path and creation identity immediately before every stop, retried
only exact identities deepest-first during a bounded `60`-second exit wait,
and removed only a profile proven to be below the dedicated smoke-profile
base. Failure evidence survived profile cleanup.

The helper did not attach to, reuse, stop, or modify the unrelated production
VibeSpace instance, its profile/port/process tree, or the unrelated
`grok-workbench-pr25-v2` checkout. No branch or worktree outside this isolated
checkout was changed by native scenario execution.

## Security, installer, and diff protections

- No provider credential was required for the deterministic native matrix.
- Native evidence and this document contain only sanitized identifiers,
  digests, state/category values, and repository-relative evidence locations.
- Local-only records, prompts, source bodies, raw provider content, handles,
  raw audio, credentials, and private paths are not copied into this document.
- The pre-existing working-tree deletion of `install/install.ps1` remained
  unstaged and was not touched by this documentation task.
- The exact branch-wide added-line scan returned `895` lines: `384`
  documentation/requirement lines, `231` runtime or script lines consisting of
  secret-policy identifiers, schemas, guards, and redaction patterns, and
  `280` test-fixture/assertion lines. A second credential-shape scan found `15`
  high-confidence shapes, all in redaction/detection tests; a targeted
  assignment scan found `26` test locations. Manual classification and an
  independent read-only review found zero real credentials.
- `git log` and per-commit `diff-tree` inspection found zero successor commits
  touching `install/install.ps1`.
- `git diff --check`, `git diff --check origin/main...HEAD`, and
  `git show --check --stat 27a89c0` returned exit code `0`. The mixed worktree
  emitted only line-ending warnings for protected, unstaged Rust files.
- A private-absolute-path scan of the three Task 22 documents returned zero
  matches. The final cached manifest is exactly those three documents, with
  the installer and all protected dirty files absent.

## Independent final reviews

Every Critical or Important finding entered the separate locked TDD fix loop
from Task 22.5 before documentation staging resumed.

| Review                         | Findings                                                                                                                                 | Resolution and evidence                                                                                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retry/authority review         | `3` Important: provider-start exactness, zero-effect lifecycle schema/order, and scheduled-settlement authority coupling.                | Closed schemas and exact provider/model/request/attempt/result/time binding; duplicate and post-settlement activity rejection; degraded-only exact retry/uncertain settlement authority. RED `5` / GREEN `58` focused tests; typecheck PASS; affected native retry PASS at `20260723T012630Z`.   |
| Native process/evidence review | `1` Critical and `3` Important: PID/PPID reuse safety, phase deadline, exact restart proof equality, and descendant-wide reduced motion. | Launch-time path/creation anchors, verified parent chronology, per-phase deadline, exact bidirectional proof-set equality, and full subtree/pseudo-element computed-style attestation. RED/GREEN smoke contract coverage; live/reduced native PASS at `20260723T014047Z` and `20260723T014358Z`. |
| Exact-set re-review            | `1` Important: extra reconstructed terminal proof refs were not rejected.                                                                | Added observed-to-completed membership and set-size equality; RED `1/35`, GREEN `35/35`; re-review returned Ready with no findings; native exact-set PASS at `20260723T014047Z`.                                                                                                                 |
| Schedule persistence review    | No Critical/Important; `2` Minor test/API notes.                                                                                         | The latest-only and no-late-duplicate timer assertions were added. The explicit flush remains bound to synchronous `safeLocalStorage`; no route, repository, or sync scope changed. Review returned Ready.                                                                                       |
| Cleanup-bound re-review        | No Critical/Important; `1` Minor contract-test note.                                                                                     | Contract test now pins creation-time equality and deepest-first sorting as well as path identity and repeated stop. Review returned Ready; final cleanup and live restart PASS.                                                                                                                  |
| Canonical retry-fixture review | No findings; Ready.                                                                                                                      | Independently confirmed the fixture now uses the strict canonical model-snapshot identity and does not relax production validation. The focused file, full JARVIS scope, full app scope, and typecheck passed.                                                                                   |
| Added-line secret review       | No findings; zero real credential risks.                                                                                                 | Independently classified every credential-shaped follow-up location as synthetic detection/redaction data or a non-secret identifier/reference.                                                                                                                                                  |

Delegated retry-fixture and secret reviews were explicitly requested on
`gpt-5.6-sol` with `high` reasoning. The runtime did not expose a more specific
actual model identifier, so this record makes no stronger model claim. Product
corrections are `691e1b2` and `27a89c0`; the documentation SHA is this
document's containing commit and is recorded in the coordination ledger after
commit. Review acknowledgment is not a product approval gate.

## Remaining external-only limitations

1. Native STT remains `BLOCKED_EXTERNAL` because the required local
   `faster-whisper` `small` model was unavailable. The evidence correctly fails
   closed with `model_unavailable`; it must be rerun with the real model before
   the STT row can become PASS.
2. Credential-free CLI transport remains externally gated by Windows App
   Control/code-signing policy. It must be rerun with an accepted signed native
   example before the CLI row can become PASS.

These limitations do not convert either row into PASS and do not weaken the
production-inaccessibility, canonical-kernel, cleanup, or unrelated-instance
protections documented above.
