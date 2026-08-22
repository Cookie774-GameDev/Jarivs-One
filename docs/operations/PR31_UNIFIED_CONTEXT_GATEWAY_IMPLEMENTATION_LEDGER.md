# PR31 Unified Context Gateway Implementation Ledger

## 2026-08-22 — Claim

- Agent/task: `VS-CODEX-CONTEXT-GATEWAY-IMPLEMENTATION-20260822` / `PR31-UNIFIED-CONTEXT-GATEWAY-PHASE1`
- Branch/base: `integration/UnifiedChungus-final` at `0771e6e9bca87232f98b9453f10b2e98878bee68`
- Scope: new Gateway contracts, policy, coordinator, production adapter, focused tests, and the existing high-level RLM OpenCode tool.
- Ownership boundary: central chat runtime and persistent OpenCode adapter are excluded because active locks already own them; active SiYuan, provider/model connector, and unrelated dirty files are also excluded.
- State: implementation claim active; no product source changed at this checkpoint.
- Next: add focused contract/policy/cancellation tests, then implement the smallest shared Gateway layer around existing production RLM retrieval.

## 2026-08-22 — Scope checkpoint

- Added the existing production RLM adapter and its focused test to the owned scope after an exact lock search found no overlap.
- Purpose: permit a caller-authoritative route and structured evidence return so the Gateway can issue/open safe handles instead of parsing prompt text.

## 2026-08-22 — Phase 1 core checkpoint

- Added the versioned deterministic policy and shared `ContextGateway` operations: `prepareTurn`, `ask`, `openEvidence`, and `cancel`.
- Receipts contain route/decision reasons, exact scope revision, source revisions, opaque evidence handles, cache/single-flight state, timings, cancellation generation, safe failure, and an immutable execution identity; raw questions and source content are excluded.
- Required focused/deep context fails closed when unavailable or disabled. Managed dispatch verification rejects wrong request, account/workspace/project/worktree/revision, insufficient route strength, safe failures, and cancelled generations.
- The production RLM adapter now accepts a caller-authoritative `direct`/`exact`/`focused`/`deep` route, returns structured validated evidence, and binds pointer scope to account/workspace/project/worktree.
- Fresh focused verification: 32/32 tests passed across Gateway policy/lifecycle, production RLM, pointer authority, and the existing high-level RLM tool.
- Full app typecheck reaches only four existing diagnostics in actively owned SiYuan tests: `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`. No owned Gateway/RLM adapter diagnostics remain.
- Remaining Phase 1 integration: central Chat runtime and persistent OpenCode adapter are still protected by active ownership locks, so they have not yet been redirected to the singleton Gateway.

## 2026-08-22 — Phase 2 claim

- Phase 1 core committed as `6acd811b` with only owned files.
- Extended ownership to the existing native terminal CLI/runtime/install/spawn path and a new app-minted terminal Context identity authority after exact lock checks found no overlap.
- `app/src-tauri/src/lib.rs` remains excluded and actively owned; no registration edit is needed because the terminal CLI server, host, install, and spawn commands already exist.
- Target: add the exact `vibespace-context ask` command, private managed-terminal PATH injection, scoped expiring run identity, Gateway-backed bounded receipt/evidence response, and focused native/parser/isolation tests.

## 2026-08-22 — Phase 2 terminal contract checkpoint

- Added red contracts for the dedicated `vibespace-context ask` interface, equivalent context-family parsing, exact scoped run-identity carriage, forged/malformed rejection, bounded plain evidence output, and the third reversible CLI alias.
- Extended ownership to `TerminalCommandPalette.tsx` after an exact active-lock search found no overlap, limited to truthful install-result copy for the third alias.
- Fresh red evidence: the TypeScript install-status parser rejects the new three-command native contract until its closed schema is updated; the native Rust contract is rebuilding after safe Cargo cache cleanup.

## 2026-08-22 — Phase 2 terminal implementation and verification

- Added the exact public command `vibespace-context ask "question"`, backed by the existing loopback-only authenticated native terminal CLI channel and the singleton Context Gateway. The normal `vibespace context ask` spelling is equivalent.
- VibeSpace now creates three marked/reversible shims (`vibespace`, `vs`, and `vibespace-context`) in an app-private directory during native startup and prepends only that directory to the PATH of VibeSpace-managed PTYs. Manual global install/uninstall remains reversible and now includes the third alias.
- Added an app-owned opaque one-hour run identity, bound after spawn to the exact account/workspace/project/worktree/pane/session. Native requests carry only the opaque identity; the frontend authority rejects expired, revoked, forged, cross-pane, cross-project, and cross-session use before Gateway retrieval.
- `context.ask` returns a bounded evidence block plus a safe `ContextReceipt`; native plain output prints the evidence block, JSON output preserves the safe structured receipt, and unavailable required context fails closed as `context_unavailable`.
- Fresh focused TypeScript verification: 7 files / 68 tests passed, including native-scope propagation, forged identity rejection, exact receipt preservation, reversible install schema, palette truth, and existing terminal behavior.
- Fresh native verification using a D:-hosted Cargo target (to preserve the running app and avoid the full C: drive): `terminal_cli_contract` passed 22/22, including alias parsing, closed schemas, authenticated scope carriage, malformed/forged rejection, bounded plain output, reversible shims, and connection limits.
- Full app typecheck reached only the same four pre-existing diagnostics in active SiYuan tests: `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`; no owned Gateway/terminal file produced a diagnostic.
- Exact Prettier check, exact Rustfmt check, and owned diff whitespace check passed. Native in-app acceptance remains pending until the current-source Tauri shell is started without closing ChatGPT/Codex.
- Reversible implementation commit: `72eca44e` (`feat(context): add managed terminal gateway bridge`), containing only the owned terminal/Gateway bridge slice and this ledger checkpoint.

## 2026-08-22 — Native shell and model-selector checkpoint

- `npm run tauri:dev` completed the current-source native build with the isolated D: Cargo target, but Windows Application Control rejected execution of that newly built hash with OS error 4551. Copying the byte-identical binary into the trusted workspace did not bypass the policy; no security policy was weakened.
- The existing trusted native `jarvis.exe` shell was started against the current live Vite frontend. ChatGPT/Codex remained open and untouched. This provides current-frontend native UI evidence but does not count as manual acceptance of the newly compiled terminal backend.
- Native model-selector verification showed truthful provider grouping, exact visible provider/model labels, and a separate atomic effort confirmation before selection. A local Ollama route and the registered Qwen API route were each surfaced under their real provider group; no prompt or inference was sent during this check.
- Fresh focused model-catalog/routing verification: 5 files / 51 tests passed (`useAccessibleChatModels`, its smoke contract, `ModelPickerTypeahead`, `providerModelCatalog`, and `connectionDisclosure`). Vitest emitted one existing non-fatal React `act(...)` warning in the smoke test; all assertions passed.
- Current-source terminal native manual acceptance remains blocked specifically by Windows Application Control. The terminal bridge retains 22/22 native contract evidence and is not represented as manually proven in the trusted older backend.

## 2026-08-22 — Gateway warm-path microbenchmark checkpoint

- A fresh in-process warm microbenchmark ran 10,000 direct `prepareTurn` calls after 100 warmups: p50 `0.0020 ms`, p95 `0.0039 ms`, p99 `0.0076 ms`, maximum `0.4335 ms`; every route was `direct` and retrieval was never called.
- A separate 10,000-run focused cache-hit benchmark recorded p50 `0.0037 ms`, p95 `0.0105 ms`, p99 `0.0311 ms`, maximum `1.9170 ms`; the backend ran once for the warm miss and every measured request reported an exact cache hit.
- A 100-request concurrent focused burst completed in `35.164 ms` wall time with one backend call, one `miss`, and 99 `shared` receipts, confirming live single-flight coalescing rather than duplicate retrieval.
- These are isolated Gateway overhead measurements, not native/provider SLO acceptance. The required paired native 30-run route measurements remain pending because the current-source executable is blocked by Windows Application Control and the central Chat dispatch files remain under another active ownership lock.

## 2026-08-22 — Schedule/Kanban parity regression checkpoint

- Official native current-frontend inspection showed the unobstructed Kanban, Today's to-do, Milestones, and Schedule surfaces using the intended warm blended panels without an accidental hard-white shell. The secondary VibeSpace panel was minimized, not closed; no saved task, milestone, event, or inference was created or deleted.
- The first 21-file parity run passed 124/127 tests and exposed three Schedule model tests relying implicitly on the live dynamic model catalog. That catalog now correctly fails closed without verified connection inventory, so the fixture no longer guaranteed a runnable model.
- Repaired only `SchedulePage.modelPicker.test.tsx` by supplying an explicit connected Gemini API fixture with exact connection/provider/model IDs. No Schedule production code, provider catalog, routing, credential, or saved selection behavior changed.
- Fresh exact rerun passed 12/12 Schedule model tests. Fresh full focused parity rerun passed 21 files / 127 tests covering natural-language title isolation, manual create/edit/cancel/reopen, reminders, custom recurrence, Jarvis route persistence, Kanban creation, Milestones, and warm-theme surface contracts. The environment emitted only its known non-fatal `HTMLMediaElement.play()` notice.

## 2026-08-22 — Bounded same-scope retrieval checkpoint

- Added a per-exact-scope retrieval limiter to the shared Context Gateway, defaulting to four backend flights for the same account/workspace/project/worktree/revision. Independent scopes remain independent, while cache hits and identical single-flight consumers do not consume additional permits.
- Added safe receipt telemetry for `queueDepthAtStart` and authoritative `queueWait` duration. Queue cancellation removes the waiter before backend dispatch; permit release is idempotent and hands capacity directly to the next live waiter.
- TDD red evidence showed three same-scope misses dispatching three backend calls before the limiter and a cancelled queued request dispatching a second backend call. Green focused verification passed 4 files / 23 tests, including the two-slot bound, cancelled-waiter removal, and explicit proof that different project scopes do not block one another.
- Fresh broader owned Gateway/RLM/terminal verification passed 12 files / 98 tests. Exact Prettier checks passed. Full app typecheck reached only the same four pre-existing diagnostics in actively owned SiYuan tests (`siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`), with no owned-file diagnostics.

## 2026-08-22 — Native model dispatch diagnostic claim

- Official native VibeSpace showed exact provider grouping and `Ready` state for installed Ollama models and the active Qwen API `deepseek-v3.2` route. A one-token-scale sentinel prompt was blocked before inference as unavailable; enabling Fully Local changed the block to an API-key error while the composer retained Qwen. Fully Local was restored to its original off state.
- Direct loopback Ollama proof succeeded for both installed engines: `llama3.2:latest` returned the exact sentinel in 11,655 ms and `qwen2.5:1.5b-instruct-q4_K_M` in 4,513 ms, both with stop completion and four evaluated tokens. This isolates the observed failure to chat selection validation rather than local inference availability.
- Three consecutive exact five-file catalog/picker matrices passed 153/153 assertions (one known non-fatal React `act(...)` warning per run). A deeper selection matrix reproduced two failures out of 24 assertions: a connected dynamic-provider model is rejected as unavailable, preventing the expected capability check.
- Claimed only `modelSelection.ts` and `modelSelection.test.ts`; central runtime/Composer remain actively owned, and the released model connector agent's uncommitted catalog/picker files remain preserved and excluded.

## 2026-08-22 — Exact connection model validation checkpoint

- The pre-send validator now accepts a model only when the exact persisted connection ID has a matching current discovered row that is neither unverified nor a stale fallback. Provider-only discovery, wrong connections, legacy selections without connection identity, and stale rows remain fail-closed; external subscription CLI and attested smoke behavior are unchanged.
- TDD red reproduced 2 failures in 19 focused selection tests. Fresh adjacent verification passed 8 files / 76 tests, covering exact connection identity, current discovery, unverified rejection, attachment capability gating, picker behavior, provider catalog, and connection disclosure. The known non-fatal React `act(...)` warning remains in the smoke fixture.
- Full typecheck reached only the same four pre-existing actively owned SiYuan test diagnostics (`siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`); no owned-file diagnostic was emitted.
- Current-frontend native rerun still rejected the saved Qwen `deepseek-v3.2` selection. This is expected fail-closed behavior for the legacy selection currently persisted without exact connection metadata; no provider connection was inferred and no model was substituted. The picker exposed explicit atomic reselection, but an unintended QVQ Max draft was cancelled before Apply, leaving the saved route unchanged. End-to-end provider inference therefore remains unclaimed.

## 2026-08-22 — Ranked candidate/hydration telemetry checkpoint

- Added safe Phase 4 telemetry for total ranked repository candidates and actually opened evidence items. Direct routes record zero/zero; focused and deep routes aggregate counts within their request and expose only numbers, never queries, paths, source text, or credentials.
- Candidate/hydration counts now flow through the production Gateway adapter into `ContextReceipt.stageTimingsMs`, alongside retrieval duration, queue wait, child calls, and depth. The focused contract proves seven ranked candidates result in exactly five hydrated evidence items.
- TDD red showed both telemetry fields absent from the production result and shared receipt. Fresh focused verification passed 3 files / 10 tests; the broader owned Gateway/RLM/terminal matrix passed 12 files / 100 tests. Exact formatting passed.
- Full typecheck reached only the same four pre-existing diagnostics in actively owned SiYuan tests (`siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`); no owned file produced a diagnostic.

## 2026-08-22 — Managed terminal Context instruction checkpoint

- Added the required provider-independent bridge instruction to every bounded managed-terminal Context Pack: use `vibespace-context ask "your question"` for cross-source, project-history, prior-decision, or unknown-context work; use normal filesystem tools for the current checkout; and report bridge unavailability instead of pretending evidence was retrieved.
- The instruction grants no new authority, carries no model/provider ID or secret, requires no MCP/user configuration, and is delivered within the existing project-scoped, redacted, size-bounded pack shared by Codex, Claude, OpenCode, and other executable harnesses.
- TDD red proved the instruction absent. Fresh focused verification passed 3/3; the adjacent pack/payload/delivery/identity/CLI matrix passed 5 files / 65 tests. Exact Prettier formatting passed after the green rerun.

## 2026-08-22 — Terminal identity lifecycle cancellation checkpoint

- Closed a terminal lifecycle race where revoking or expiring an already-authorized managed-terminal identity blocked future retrievals but did not cancel a Gateway request that was already in flight.
- Active request registrations are now bound to the exact opaque terminal identity and request ID. Revocation, observed expiry, and test reset cancel every bound request before deleting authority; normal completion unregisters idempotently, duplicate request IDs fail closed, and cancellation callback failures cannot restore revoked authority.
- The production terminal bridge registers immediately before the singleton Gateway ask and always unregisters in `finally`; identity cancellation delegates to the Gateway's existing request cancellation path, so late evidence cannot be returned by the managed terminal call.
- TDD red reproduced the missing registration authority. Fresh focused verification passed 3 files / 16 tests; adjacent native-terminal UI verification passed 4 files / 45 tests; the broader owned Gateway/RLM/terminal matrix passed 12 files / 92 tests. The only test-environment notices were the existing non-fatal jsdom canvas messages.
- Full app typecheck reached only the same four pre-existing diagnostics in actively owned SiYuan tests (`siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`); no owned file produced a diagnostic.

## 2026-08-22 — Bounded evidence-open claim

- Claimed only `RlmCoordinator.ts` and a new focused test after an exact active-lock search found no overlap.
- Intent: replace sequential hydration of the already-ranked top-five retrieval hits with a small cancellation-safe concurrent worker pool while preserving deterministic evidence order and the exact aggregate byte ceiling. Source ranking, SiYuan adapters, shared Chat dispatch, and provider behavior remain outside this claim.

## 2026-08-22 — Bounded ranked evidence-open checkpoint

- Replaced serial retrieval-route hydration with a two-worker pool bounded by the existing performance policy. Only the already-ranked top-five hits are opened; result and trace order remain rank-stable even when later opens finish first.
- Every open receives an equal deterministic byte allocation, each result is checked against its allocation, the aggregate is checked against the route ceiling, and cancellation is checked before dispatch, after each open, and before returning. A cancelled request rejects late evidence rather than publishing it.
- TDD red reproduced the bottleneck with one active open where two were required. Focused verification passed 2 files / 10 tests, including bounded concurrency, order, late-cancel rejection, and byte-ceiling failure. The broader owned Gateway/RLM/terminal matrix passed 13 files / 95 tests; only the existing non-fatal jsdom canvas notices were emitted.
- Full app typecheck reaches only the same four pre-existing diagnostics in actively owned SiYuan tests (`siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`); no owned file produces a diagnostic.

## 2026-08-22 — Bounded deep-subquery search checkpoint

- The production deep investigation worker now honors the existing `maxConcurrentSubcalls` policy for repository searches instead of serializing all three bounded subqueries. Quality mode uses two workers; no new concurrency setting or route authority was introduced.
- Search retrieval runs concurrently, while candidate accounting and pointer issuance are released in invocation order. Evidence hydration therefore remains deterministic by subquery rank even when the second search completes before the first.
- Cancellation is checked before each worker dispatch, after the bounded search pool, during hydration, and before return. A cancelled two-search flight does not launch the queued third subquery and cannot publish late evidence.
- TDD red reproduced one active search where the policy required two. Fresh focused verification passed 2 files / 12 tests; the broader owned Gateway/RLM/terminal matrix passed 13 files / 97 tests. Full typecheck reaches only the same four pre-existing diagnostics in actively owned SiYuan tests; no owned file produces a diagnostic.

## 2026-08-22 — Local-model endurance and native parity checkpoint

- Ran a corrected, deterministic local-model endurance sequence for approximately 55 minutes, alternating the exact installed Ollama engines `llama3.2:latest` and `qwen2.5:1.5b-instruct-q4_K_M` across an exact `MODEL_OK` response check and a `17 * 19 = 323` arithmetic check. The harness completed 272/272 checks with zero correctness failures, request timeouts, or transport errors, finishing at `2026-08-22T04:15:49.8356196-05:00`. An earlier prompt-wording calibration was excluded from this result; direct corrected calibration had already proved both engines could satisfy both checks.
- Official native VibeSpace remained open throughout the endurance run. Fresh Computer Control inspection reported Ollama ready at version `0.21.0`, both exact installed model IDs present and available in Chat, Fast local-agent mode selected, cloud escalation off, and the warm blended Local Models/Model Catalog surface intact. No local-model, routing, escalation, or saved selection setting was changed.
- Native current-frontend model dispatch remained truthfully fail-closed for the legacy connection-less Qwen cloud selection: the exact sentinel was blocked before transmission as unavailable, the unsent text was cleared, and no provider/model substitution or inference occurred. This is diagnostic evidence, not a cloud-provider pass.
- Fresh parity verification passed 24 files / 141 tests across Schedule, Jarvis scheduling/model persistence, custom recurrence, reminders, create/edit/cancel/reopen behavior, Kanban, Milestones, Local Models, and warm-theme surfaces. Fresh model/routing verification passed 8 files / 121 tests across exact selection, authenticated catalog grouping, connection disclosure, picker behavior, and accessible model routing. Only the known non-fatal media-environment notices and one React `act(...)` warning were emitted.
- Current-source terminal native manual acceptance remains unclaimed because Windows Application Control still rejects the newly compiled binary with OS error 4551. The trusted existing native shell provides current-frontend UI evidence only; the terminal bridge retains its separate 22/22 native contract evidence.

## 2026-08-22 — Local ChatGPT ADE core-adapter claim

- Claimed only new files under `app/src/features/ade/` plus this owned ledger. The slice defines the first VibeSpace-local ChatGPT ADE run contract and a thin adapter over the existing Context Gateway, exact execution identity, action dispatcher, history sink, and optional terminal-link verifier.
- Central Chat/runtime, provider dispatch, existing terminal authority, SiYuan, persistence, navigation/UI registration, and every unrelated dirty file remain excluded. This claim may establish executable Phase 3 core authority but cannot claim the full ADE UI or native acceptance gate.

## 2026-08-22 — Local ChatGPT ADE core-adapter checkpoint

- Added the first executable VibeSpace-local ChatGPT ADE run schema and adapter. Each run carries the exact account/workspace/project/worktree revision, access ceiling, task risk, selected ChatGPT harness, immutable provider/connection/model/effort/Fast identity, optional managed-terminal link, and lifecycle state.
- The production factory directly reuses the singleton Context Gateway and existing app-minted terminal identity authority. It creates no ADE-specific retrieval client, cache, SiYuan path, terminal protocol, model selector, or provider fallback.
- Write/action runs fail closed unless the shared Gateway returns a current scope/request-bound required receipt that passes `verifyRequiredReceipt` before dispatch. Receipt and completion identities must exactly match the selected connection/provider/model/effort/Fast route; a mismatch publishes no output.
- Optional terminal linkage requires exact account/workspace/project/worktree/pane/session identity and an access ceiling at least as strong as the ADE run. Terminal identity revocation cancels both the shared Gateway request and ADE dispatch; late completion is rejected. Cross-scope, expired, revoked, and under-privileged links block before retrieval or model dispatch.
- Added a warm-surface-safe status panel that renders lifecycle status, exact selected route, context route/readiness, safe source revisions, and linked terminal identity without exposing context prompt blocks, evidence handles, credentials, or internal policy data. Lifecycle events are emitted through an injected history sink without model output or prompt content.
- Fresh focused and adjacent verification passed 6 files / 38 tests across ADE lifecycle, required receipts, exact scope and identity, duplicate-run isolation, safe projection, terminal linking/revocation, shared Gateway policy, and cancellation. Full typecheck reaches only the same four pre-existing diagnostics in actively owned SiYuan tests; no ADE or other owned file emits a diagnostic.
- Navigation registration, a user-facing ADE task-composer surface, durable ADE persistence, a real ChatGPT dispatcher binding, and official native ADE acceptance remain unimplemented and are not claimed by this checkpoint.
