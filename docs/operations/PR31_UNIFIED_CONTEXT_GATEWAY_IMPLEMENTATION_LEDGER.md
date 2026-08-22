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

## 2026-08-22 — Bounded Gateway receipt-lifetime checkpoint

- Closed an authority-lifetime gap where focused/deep Context receipts and their evidence-handle records remained process-reusable indefinitely unless explicitly cancelled. Receipt evidence now expires after 15 minutes by default, is hard-capped at one hour even when configured, is removed immediately when an expired receipt is verified or opened, and is opportunistically pruned before subsequent Gateway turns.
- Expiry is internal authority state and adds no prompt, source content, credential, or reusable handle to logs or UI. Exact request/scope/route/generation verification remains unchanged while current; direct and unavailable receipts still grant no evidence authority.
- TDD red proved the old receipt remained verifiable at the configured expiry boundary. Fresh focused/adjacent verification passed 7 files / 40 tests across Gateway policy/production, expiry, ADE receipt enforcement, safe projection, terminal revocation, and cancellation. Full typecheck remains limited to the same four actively owned SiYuan-test diagnostics, with no owned-file error.

## 2026-08-22 — Gateway request/receipt collision checkpoint

- Closed two collision races at the shared authority boundary. A second concurrent call using an already-active request ID now fails with a typed conflict before it can overwrite cancellation ownership, join a backend flight, or issue a receipt. A newly generated focused/deep receipt ID that collides with current unexpired evidence authority now fails closed without replacing the prior receipt or its evidence handles.
- Required collision failures remain sanitized as `retrieval-failed` receipts; no colliding caller gains the first request's prompt block, evidence, scope authority, or cancellation controller. The original request remains cancellable, and its evidence authority remains intact after a later receipt collision.
- TDD red reproduced both the orphaning timeout and receipt overwrite. Fresh focused/adjacent verification passed 7 files / 42 tests across Gateway policy/production, ADE enforcement, terminal revocation, expiry, collisions, scope, and cancellation. The last full typecheck remained limited to the same four active SiYuan-test diagnostics with no owned-file error.

## 2026-08-22 — External-abort backend propagation checkpoint

- External caller abort now enters the Gateway's authoritative `cancel(requestId)` path instead of aborting only the local consumer controller. The consumer is removed from its single-flight set, cancellation generation advances, and the backend flight is aborted immediately when no live consumer remains; shared work continues only for other live consumers.
- TDD red proved the sole-consumer backend signal remained live after the caller aborted. Fresh focused/adjacent verification passed 7 files / 43 tests across Gateway policy/production, ADE cancellation, terminal identity revocation, expiry, collisions, and external abort. Full typecheck again reached only the four actively owned SiYuan-test diagnostics with no owned-file error.

## 2026-08-22 — Cancelled evidence-authority checkpoint

- Closing or cancelling a Gateway request now revokes its already-issued evidence authority as well as its required-receipt dispatch authority. `openEvidence` compares the current request generation with the immutable receipt generation, removes a revoked receipt record, and fails without returning source text.
- TDD red proved a cancelled completed request still opened its evidence handle before the fix. Fresh focused/adjacent verification passed 7 files / 43 tests across Gateway policy/production, ADE receipt enforcement and cancellation, terminal identity revocation, expiry, collisions, and external abort. Full TypeScript project verification passed with zero diagnostics.

## 2026-08-22 — ADE completion-scope checkpoint

- The ADE dispatcher completion contract now requires the actually observed account/workspace/project/worktree revision as well as the actually observed provider/model/effort/Fast identity. A completion from any different scope fails closed, drops its output, and records the existing safe `context-scope-mismatch` lifecycle result.
- TDD red proved a wrong-worktree completion was previously accepted. Fresh focused/adjacent verification passed 7 files / 44 tests across ADE lifecycle, exact completion identity/scope, shared Gateway policy, terminal linking/revocation, and cancellation. Full TypeScript project verification passed with zero diagnostics.
- Fresh app-scoped native inspection kept VibeSpace open on Local Models, confirmed Ollama 0.21.0 ready with both registered exact model IDs, and the in-app `llama3.2:latest` compatibility probe completed as `Agent ready` with a safe structured tool-call roundtrip. This supplements, rather than replaces, the earlier 55-minute alternating two-model endurance evidence.

## 2026-08-22 — Evidence-authority ambiguity checkpoint

- The shared Gateway now rejects backend results before caching or receipt issuance when an evidence handle is duplicated or an evidence item is not bound to an exact issued source ID/revision pair. This prevents last-write-wins handle replacement and stale-source evidence from receiving scoped open authority.
- TDD red proved two different evidence records with one handle previously collapsed into the receipt map. Focused regressions also cover mismatched source revisions. Fresh focused/adjacent verification passed 7 files / 46 tests across Gateway, ADE, production policy, and terminal revocation; the full TypeScript project check remained clean.

## 2026-08-22 — Managed-terminal required-receipt gate checkpoint

- `vibespace-context ask` now independently checks that retrieval returned a required, current, non-failed receipt bound to the exact app-minted account/workspace/project/worktree/revision and the fixed local Context Gateway execution identity. It then asks the shared Gateway to verify the exact receipt/request/scope/minimum-route authority before releasing the bounded evidence block.
- Cross-worktree, optional/direct, stale, cancelled, expired, insufficient-route, or otherwise unverifiable receipts fail closed as `context_unavailable`; no evidence prompt block is returned. The production runtime uses the singleton Gateway verifier rather than a terminal-specific cache or policy.
- TDD red proved a wrong-worktree receipt was returned successfully before the fix. Fresh terminal/Gateway verification passed 4 files / 35 tests, including explicit optional-direct rejection. The broader owned Gateway/RLM/terminal matrix passed 12 files / 113 tests; the only notices were the known non-fatal jsdom canvas messages. The full TypeScript project check passed with zero diagnostics.

## 2026-08-22 — Shared-flight consumer cancellation checkpoint

- A caller cancelled while sharing a single-flight retrieval now rejects immediately through its own request controller. Its consumer membership and receipt generation are revoked without aborting the shared backend while another authorized consumer remains; the live consumer still completes from the one backend call.
- TDD red proved a cancelled shared caller waited on the surviving caller's full backend duration before rejecting. The focused Gateway suite passed 17/17 after the fix, including explicit sub-50 ms cancellation observation and proof that the shared backend signal stayed live. Fresh adjacent Gateway/ADE/terminal verification passed 7 files / 47 tests. Full TypeScript verification passed with zero diagnostics.

## 2026-08-22 — Bounded revision-cache checkpoint

- The shared revision/query cache is now bounded to 256 distinct entries by default and hard-capped at 2,048 even when configured higher. Expired entries are pruned before turns and insertions; when full, the oldest distinct lookup is evicted before a new validated backend result is cached.
- TDD red proved three distinct lookups remained resident despite a configured two-entry ceiling. Focused verification passed 18/18 and fresh adjacent Gateway/ADE/terminal verification passed 7 files / 48 tests. Full TypeScript verification passed with zero diagnostics.

## 2026-08-22 — Immutable ADE run-identity checkpoint

- Every published ADE run ID is now one-shot for the adapter lifetime, not merely unique while active. Completed, blocked, failed, and cancelled run IDs cannot be reused to overwrite their snapshot/history identity or trigger a second Context/provider dispatch under the same task identity.
- TDD red proved a completed run ID could be replayed with a different request ID and dispatched twice. Fresh adjacent Gateway/ADE/terminal verification passed 7 files / 49 tests, including active-run collision and terminal cancellation coverage. Full TypeScript verification passed with zero diagnostics.

## 2026-08-22 — ADE lifecycle streaming checkpoint

- The ADE adapter now exposes a run-scoped snapshot subscription for its UI. Subscribers receive safe `preparing-context`, `dispatching`, and terminal snapshots as the authoritative lifecycle advances; late subscribers receive only the current terminal state, terminal listener sets are released, and a broken presentation listener cannot interrupt context enforcement or dispatch.
- TDD red proved no executable subscription surface existed. Fresh ADE verification passed 3 files / 16 tests and adjacent Gateway/ADE/terminal verification passed 7 files / 50 tests. Full TypeScript verification passed with zero diagnostics.

## 2026-08-22 — Terminal identity expiry-boundary checkpoint

- App-minted terminal/ADE link identities now expire at `expiresAt`, not one millisecond after it. Binding and authorization use the same closed boundary, and authorization at that boundary cancels every registered Gateway/ADE request before deleting authority.
- TDD red reproduced both continued authorization and missing cancellation at the exact expiry timestamp. Fresh terminal/ADE verification passed 5 files / 33 tests, and full TypeScript verification passed with zero diagnostics.

## 2026-08-22 — ADE durable Jarvis-history claim

- Extended exact ownership at base `7e62e883` to the existing Jarvis request-surface enum/validator/schema plus new files under `app/src/features/ade/` only. Exact active-lock search found no overlap.
- Target: register `chatgpt_ade` as a first-class existing Jarvis run/history source and provide a scope-safe lifecycle bridge to the existing run/event repositories without editing the locked Chat runtime, kernel, provider dispatcher, repository internals, or SiYuan code.

## 2026-08-22 — ADE durable Jarvis-history implementation checkpoint

- Registered `chatgpt_ade` as an exact request/run surface in the existing contract validator and persisted row schema. Added a narrow lifecycle writer over the existing idempotent-run and compare-and-append repository methods: queued -> compiling -> running -> completed/failed/cancelled, with exact expected-state checks and replay-safe terminal handling.
- Context receipt provenance is persisted only as an app-verified private `context_node` source reference. Fixed summaries never contain the receipt, terminal identity, evidence handles, prompts, or source content; queued inputs are detached from caller mutation and unsafe receipt identifiers fail closed.
- Fresh ADE/Jarvis verification passed 6 files / 502 tests. Full project typecheck has no diagnostics in this owned change; it currently stops on the same four concurrently owned SiYuan test diagnostics (`siyuanRlmProduction.test.ts` once and `siyuanRlmRepository.test.ts` three times), which remain outside this lock.

## 2026-08-22 — ADE production history binding checkpoint

- Added a run-scoped production factory that binds the ADE adapter to the existing Jarvis run repository. It validates the durable account/workspace/project/connection/provider/model selection, persists the queued seed before context work, settles compiling/running history before provider dispatch, and settles the terminal transition before returning.
- Lifecycle-storage failure now fails closed before provider dispatch as `history-unavailable`. Initial validation or terminal-authorization blocks correctly persist queued -> failed rather than creating a transition conflict.
- Fresh ADE/Jarvis verification passed 6 files / 505 tests. Exact formatting passed; full typecheck again reports only the same four active, out-of-scope SiYuan test diagnostics and no owned-file diagnostics.

## 2026-08-22 — ADE durable reopen and terminal-link proof

- Added a real fake-IndexedDB/Dexie integration test that writes the complete ADE lifecycle through the production Jarvis repository implementation, closes the database, reopens it, and verifies the `chatgpt_ade` run plus ordered compiling/running/completed events and private receipt provenance.
- Authorized terminal linkage now persists as a separate app-verified private `terminal` source reference. Receipt and terminal identifiers remain absent from titles/summaries, invalid identifiers and cross-kind ID collisions fail closed, and no terminal permission or credential material is persisted.
- Fresh ADE/Jarvis verification passed 6 files / 507 tests; the corrected exact-model endurance run reached 33/33 with zero failures across both literal installed Ollama tags at this checkpoint.

## 2026-08-22 — ADE lifecycle replay hardening checkpoint

- Lifecycle replay now validates timestamp and receipt/terminal provenance before considering an already-durable status idempotent. Only an exact detached event signature may replay without another write; changed valid provenance, malformed provenance, and unverifiable external compare-and-set wins fail closed as transition conflicts.
- TDD RED proved malformed and changed terminal provenance previously bypassed validation after the first durable transition. Fresh ADE/Jarvis verification passed 6 files / 510 tests, including exact replay idempotence and real database reopen coverage.
- Fresh Vite production bundling succeeded across 4,926 transformed modules. The combined owned Gateway/RLM/terminal matrix passed 16 files / 130 tests. A fresh native Rust rebuild remains blocked only by Windows Application Control error 4551 on a newly compiled dependency helper; no native pass is claimed from that attempt.

## 2026-08-22 — ADE repository postcondition checkpoint

- The durable history boundary now verifies an `applied` repository result proves the exact ADE run/account/source, requested next status and timestamp, forced run-state event, and original idempotency key before advancing in-memory authority. A forged or inconsistent success result fails closed as a transition conflict.
- TDD RED proved the injected repository result was previously trusted. Fresh ADE/Jarvis verification passed 6 files / 511 tests; the broader exact model-routing matrix also passed 8 files / 92 tests with no selection substitution.

## 2026-08-22 — One-hour exact local-model verification

- Ran a fresh corrected 60-minute alternating health sequence from `2026-08-22T05:41:20.0067645-05:00` through `2026-08-22T06:41:24.0179889-05:00` against the literal installed Ollama tags `llama3.2:latest` and `qwen2.5:1.5b-instruct-q4_K_M`. All 143/143 requests returned the requested exact model identity and an authoritative completed response; there were zero transport errors, timeouts, completion mismatches, or identity substitutions. An initial shortened-Qwen-tag calibration was rejected with 404, stopped, and excluded before this corrected run began.
- Final independent correctness checks returned exactly `323` for `17 * 19` on both models. Both models also emitted the exact structured `multiply(a=7,b=8)` tool call instead of answering directly. These checks passed before and after the endurance interval.
- Official native VibeSpace `jarvis.exe` PID 18556 remained open and responsive throughout. The final snapshot reported 40.6 MB working set; Ollama used two responsive processes and 729.8 MB combined working set. No app, model, connection, routing, Fast/Deep, escalation, or saved-selection setting was changed.
- Fresh supporting evidence in this interval: ADE/Jarvis 6 files / 511 tests; Jarvis repositories 81/81; database migrations/mappers 44/44; Gateway/RLM/terminal 16 files / 130 tests; warm Schedule/Kanban/Milestones/Local Models 24 files / 141 tests; exact model routing 8 files / 92 tests; and a successful Vite production bundle across 4,926 modules.

### Remaining definition-of-done gates (truthful audit)

- Central VibeSpace Chat still has no direct call to the shared production Context Gateway in `runtime.ts`; that exact file and related kernel/router authority remain actively owned elsewhere and were not edited here.
- The ADE core, UI-safe status projection, durable history, policy gate, cancellation, and terminal linkage exist, but no real dispatcher currently proves the complete connection/provider/model/effort/Fast/auth route and no ADE task-composer/navigation registration or official native ADE acceptance exists. Per the merge plan, full ADE remains `NOT IMPLEMENTED` rather than being inferred from Browser Chat or unit tests.
- Current-source native terminal acceptance remains blocked by Windows Application Control error 4551 on freshly compiled executables/helpers. The trusted existing native shell and the previously passing native terminal contract suite do not convert that OS-policy block into a current-source native pass.
- Thirty paired same-harness/provider direct-baseline runs, all supported terminal-harness native isolation tests, and the final packaged-runtime acceptance report remain required before the merge plan can be called complete.

## 2026-08-22 — ADE bounded output-stream checkpoint

- The ADE dispatcher contract now exposes one run-bound output callback. The adapter publishes ordered provider deltas through the same authoritative snapshot subscription used by lifecycle status, while keeping chunk updates out of the durable lifecycle event journal.
- Output is bounded to 2 MiB and rejects unsafe control characters. Chunks arriving after cancellation, terminal completion, or loss of run ownership are ignored. A streamed response must exactly equal the dispatcher's final response; divergence or invalid output fails closed and clears the visible output instead of accepting two competing truths.
- The status panel now renders the safe output as a polite accessible live log while retaining the existing route, context provenance, and terminal-link projection. It still receives no evidence handles, prompt blocks, credentials, or internal policy data.
- TDD RED reproduced the absent stream callback/UI, divergent-final acceptance gap, and missing output bound before the repair. Fresh combined ADE/Jarvis/Gateway/RLM/terminal verification passed 19 files / 607 tests. A direct Vite production bundle succeeded across 4,926 transformed modules. Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active, out-of-scope SiYuan test diagnostics.

## 2026-08-22 — ADE run-scoped task-surface checkpoint

- Added an adapter-driven ChatGPT ADE task surface that can start exactly one active run, subscribe to its authoritative snapshots, render streamed output/status/provenance, cancel through the run authority, and release/cancel work on unmount. It creates no provider, retrieval, terminal, or model route of its own.
- The surface displays the exact inherited provider/model/effort/Fast selection, limits selectable access to the inherited ceiling, and cancels a live run if that ceiling is lowered. Explicit Context/deep intent and broad-change metadata flow as structured task-draft fields rather than relying on prompt prose.
- Every snapshot must retain the exact selected execution identity, account/workspace/project/worktree revision, harness, run ID, and request ID. Drift fails closed, cancels the authority, and never renders the mismatched snapshot. Duplicate starts, late post-cancel snapshots, synchronous setup failures, and unmount leakage are covered.
- TDD RED first proved the task surface did not exist. Fresh combined ADE/Jarvis/Gateway/RLM/terminal verification passed 20 files / 612 tests, and a direct Vite production bundle succeeded across 4,926 transformed modules. Full TypeScript verification contains no owned-file diagnostics and remains limited to the same four active SiYuan test diagnostics. Production dispatcher binding, navigation registration, and official native ADE acceptance remain unclaimed.

## 2026-08-22 — Truthful first-class ADE route checkpoint

- Registered `ade` in the canonical route schema, lazy page router, navigation pane, route breadcrumb, and quiet Sakura route matrix. The route loads its small page module directly rather than eagerly importing the staged runtime/history implementation.
- The page visibly and machine-readably publishes `not-implemented`. It states that the production model dispatcher is not bound and official native acceptance is pending; it does not reclassify another surface as ADE coverage or expose a runnable task control prematurely.
- TDD RED proved the route, breadcrumb, page, and navigation registration were absent. Fresh focused routing verification passed 6 files / 14 tests, the adjacent PageRouter/NavPane/TopBar/navigation matrix passed 12 files / 22 tests, and a direct Vite production bundle succeeded across 4,927 transformed modules. Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active SiYuan test diagnostics.

## 2026-08-22 — Fail-closed direct Gateway SLO acceptance checkpoint

- Added a pure acceptance calculator for the merge plan's controlled direct-route measurements. It refuses to publish a result with fewer than 30 warm pairs, any non-direct route, duplicate pair/baseline/receipt identity, invalid timing, or mixed harness, prompt hash, source revision, scope, or exact execution identity.
- Relative overhead is evaluated from each baseline/Gateway pair before p95/p99 aggregation, so slow unrelated baselines cannot hide a regressed request. Absolute 150 ms p95 and 250 ms p99 limits are enforced independently, and the effective lesser-of-relative-and-absolute budgets remain visible in the report.
- No native/provider measurement is invented by this slice; it supplies the fail-closed scoring boundary for the still-required native pairs. TDD RED proved the calculator was absent. Fresh focused Gateway verification passed 4 files / 47 tests. Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active SiYuan test diagnostics.

## 2026-08-22 — Fail-closed focused/deep retrieval acceptance checkpoint

- Added a separate retrieval acceptance calculator that requires at least 30 comparable warm runs from one route, harness, corpus revision, scope, and exact execution identity. Duplicate sample/receipt IDs, direct/cold rows, invalid timings, malformed candidate/hydration counts, mixed authority, and hydration beyond the ranked candidate count are rejected before reporting.
- Focused retrieval fails above 4 seconds p95. Deep retrieval independently fails above 8 seconds p95 or when any run crosses the 10-second hard pre-dispatch deadline; candidate and hydrated-count distributions remain visible without treating them as quality proof.
- No native/provider measurement or retrieval-quality result is invented. TDD RED proved the gate was absent. Fresh combined direct/focused/deep Gateway acceptance verification passed 5 files / 63 tests. Full TypeScript verification remains limited to the same four active, out-of-scope SiYuan test diagnostics from the immediately preceding slice.
- Follow-up TDD proved the general `ExecutionIdentity` type's optional observed-provider field could still enter an acceptance report. Both direct and retrieval gates now require a non-empty observed provider identity before scoring; the fresh combined matrix passes 5 files / 65 tests.
- A second direct-pair audit proved one shared identity field could not demonstrate that the baseline and Gateway observations actually agreed. Each pair now carries separate baseline and Gateway identities; every exact field must match within the pair and across the controlled run set before latency is scored. TDD RED reproduced the missing proof, and the combined Gateway matrix passes 5 files / 66 tests.
- Direct measurements now carry only the approved local timing stages: Context Pack, route decision, queue wait, dispatch, and ADE adapter. Each value must be finite/non-negative, the exact stage set is enforced, and the per-run sum must reconcile to the reported Gateway overhead within one microsecond. TDD RED proved unreconciled totals were accepted before this gate; stage distributions are included in the report.

## 2026-08-22 — Official native truthful-ADE-route verification

- Verified in the already-running official VibeSpace `jarvis.exe` process without using a browser preview or closing/restarting the app. The live navigation exposes `ChatGPT ADE`; selecting it updates the native breadcrumb to `Current route: ChatGPT ADE` and renders the first-class route successfully.
- The native page visibly reports `NOT IMPLEMENTED`, `Production model dispatcher is not bound to the exact observed route`, and `Official native acceptance is pending for task, terminal, cancellation, and route identity behavior`. It exposes no runnable task control, performs no provider dispatch, changes no saved model/settings/data, and makes no unsupported ADE acceptance claim.
- This proves the truthful route presentation only. It does not satisfy production dispatcher binding, complete native ADE task acceptance, or the remaining paired/provider/native merge-plan gates.

## 2026-08-22 — Fail-closed final acceptance closure checkpoint

- Added a pure closure evaluator for the exact merge-plan matrix. A `passed` result requires exact commit/build/runtime metadata; passing direct reports and official-native proof for Chat, ADE, Codex, Claude, and OpenCode; passing focused/deep retrieval reports; feature parity; concurrent scope isolation; and non-empty rollback notes.
- Native proof is field-specific: official desktop, bound production dispatcher, observed exact identity, verified Context receipt, scope isolation, cancellation, visible streaming, and no duplicate dispatch. Missing rows remain `incomplete`; an observed failed gate is `failed`; genuine provider/auth blockers are reported separately as `blocked-external` only after all internal gates pass.
- This evaluator intentionally reports the current system as incomplete rather than converting the truthful ADE route or earlier local-model endurance into missing production/native evidence. TDD RED proved the closure boundary was absent. Fresh combined Gateway verification passed 6 files / 73 tests. Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active SiYuan test diagnostics.
- Follow-up TDD proved a hand-edited/stale report object could claim `passed` while carrying fewer than 30 runs or out-of-budget measurements. The closure evaluator now independently revalidates sample counts, monotonic finite distributions, direct relative/absolute p95/p99 limits, focused p95, deep p95, and the deep hard deadline. The combined Gateway matrix passes 6 files / 74 tests.
- Native rows now require a unique evidence ID, canonical ISO timestamp, full commit SHA, and runtime generation. Each row must bind to the exact evaluated build before its detailed native booleans can contribute to closure. TDD RED proved cross-build native proof was previously accepted; the combined Gateway matrix passes 6 files / 75 tests.

## 2026-08-22 — Fresh post-endurance local-model quality control

- A fresh exact-tag health check kept transport identity truthful and completed for both `llama3.2:latest` and `qwen2.5:1.5b-instruct-q4_K_M`. Llama returned the correct `391` for `23 * 17`; Qwen returned an incorrect `401`. This is preserved as a real model-quality failure and is not rewritten as a routing/system pass.
- The established Qwen control prompt still returned the correct `323` for `17 * 19`, and Qwen emitted the exact structured `multiply(a=23,b=17)` tool call without calculating directly. These controls show the installed tag, transport completion, observed identity, and tool schema remain healthy while raw arithmetic quality is not universally reliable.
- Official native VibeSpace remained open and responsive (PID 18556, approximately 51.8 MB working set) after the checks. No app-selected model, provider, connection, effort/Fast state, or saved setting changed.

## 2026-08-22 — Runnable Context Gateway acceptance evaluator checkpoint

- Added `npm run verify:context-gateway-acceptance -- <local-evidence.json>` so native/CI evidence can execute the same fail-closed evaluator rather than copying its logic into an ad hoc report. The command emits only the sanitized evaluation (`passed`, `failed`, `incomplete`, or `blocked-external`) and never echoes malformed evidence, parse errors, prompts, model output, credentials, or input contents.
- A repository fixture intentionally exercises the truthful incomplete state and lists every missing Chat/ADE/Codex/Claude/OpenCode, retrieval, native, build, and rollback gate with no false failures. Pass exits zero; every non-pass or invalid input exits nonzero, while the JSON status preserves the exact non-pass category.
- Manual CLI verification covered the incomplete fixture, missing argument usage, and an invalid JSON-shaped evidence file. The invalid case returned only the fixed safe error message.

## 2026-08-22 — ADE production-dispatch boundary re-audit

- Re-audited the live shared provider entry points against the ADE completion contract. `runAgent` provides streaming/cancellation and returns observed provider/model text, but it does not return the complete observed connection, transport adapter, auth/billing route, effort, Fast variant, or catalog revision required to construct an authoritative ADE `ExecutionIdentity`.
- Copying the selected values into the observed result would fabricate execution proof, and dispatching through the `jarvis:send` UI event would duplicate Chat persistence/lifecycle while still lacking run-bound output authority. Neither path was implemented.
- The required API extension belongs to the actively owned router/runtime/kernel integration boundary. Until that owner exposes the existing authoritative completion identity through one shared return contract and official native acceptance passes, the first-class ADE route correctly remains `NOT IMPLEMENTED`.

## 2026-08-22 — Fresh combined owned-boundary verification

- Ran the complete currently owned ADE, Context Gateway, Gateway acceptance, RLM, terminal bridge identity, terminal CLI/runtime/install/production, Context Pack, command palette, and terminal execution matrix together: 29 files / 254 tests passed.
- A fresh direct Vite production bundle then succeeded across 4,927 transformed modules. Existing tree-sitter browser externalization/eval and large-chunk warnings remain warnings; no new build failure occurred.
- Official native VibeSpace remained open throughout. This combined automated/build pass strengthens the owned implementation boundary but does not substitute for the still-missing full observed ADE dispatcher identity, current-source native backend acceptance, or required paired native/provider runs.

## 2026-08-22 — Safe acceptance JSON schema checkpoint

- Added a runtime exact-key schema before CLI evaluation. It bounds collections and strings; rejects controls, non-finite timing values, unknown failures/stages, and malformed nested reports; and refuses any unknown field at the build, direct-report, retrieval-report, native-proof, blocker, or top-level boundary.
- TDD proved raw prompt, model-output, and credential fields were previously ignored by the typed evaluator and could remain in the JSON artifact. All three are now rejected before scoring, as are oversized arrays and unsafe control text. Fresh acceptance verification passed 4 files / 50 tests, and the incomplete CLI fixture still reports the exact missing matrix.
- Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active, out-of-scope SiYuan test diagnostics.
- Follow-up TDD proved raw JSON accepted fractional run/candidate counts. Sample counts and candidate/hydration distributions now require non-negative safe integers, preventing values such as `30.5` from satisfying a minimum-run gate. Fresh schema/closure verification passes 2 files / 15 tests.
- Closure now independently revalidates every approved local-stage distribution rather than trusting the aggregate report. TDD proved a passed-looking report could carry a negative/descending stage percentile; fresh schema/metrics/closure verification passes 3 files / 35 tests.

## 2026-08-22 — Frozen-corpus retrieval quality acceptance checkpoint

- Retrieval samples now bind to unique opaque quality-case IDs and one fixed rubric revision in addition to the existing corpus revision, scope, harness, route, and observed execution identity. The evidence contract carries no prompt, answer, citation text, source path, or source identifier.
- Each focused/deep run records only whether the expected top result was correct, its citations were independently verified, and the frozen answer rubric passed. Acceptance reports publish aggregate rates and fail unless all three rates are exactly 100%; latency alone can no longer pass a quality-regressed route.
- The closure evaluator independently revalidates those rates instead of trusting a report's `passed` flag. The exact-key JSON schema bounds every rate to `[0,1]` and recognizes only the three approved quality failures. TDD RED reproduced six calculator gaps plus closure/schema bypasses before implementation; the fresh combined retrieval/schema/closure matrix passed 3 files / 39 tests. Full TypeScript verification reports no owned-file diagnostics and remains limited to the same four active, out-of-scope SiYuan test diagnostics.

## 2026-08-22 — Paired direct resource-evidence checkpoint

- Every direct baseline/Gateway pair now requires separate safe CPU-percent, working-set MiB, and process-count observations. CPU must be finite/non-negative, working set finite/positive, and process count a positive safe integer before a report can be produced.
- Reports preserve p50/p95/p99 resource distributions for both the direct baseline and Gateway run, making resource cost visible without inventing an unapproved pass threshold. The closure evaluator independently rejects negative/descending/non-finite distributions, zero memory, and fractional/zero process counts even if a report claims `passed`.
- The exact-key JSON schema accepts only the approved paired resource shape and integer process-count percentiles. TDD RED reproduced the absent distributions, three malformed raw metrics, a passed-looking fractional process distribution, and the schema bypass before implementation. Fresh full Gateway verification passed 7 files / 93 tests; full TypeScript verification has no owned diagnostics and remains limited to the same four active, out-of-scope SiYuan test diagnostics.

## 2026-08-22 — Paired direct lifecycle-evidence checkpoint

- Every controlled direct baseline/Gateway pair now records provider acceptance, first output, first visible paint, and completion as separate monotonic timings. Comparable SLO samples must be completed without cancellation or retry, preventing recovery work from being disguised as a clean direct route.
- Reports publish p50/p95/p99 lifecycle distributions separately for the baseline and Gateway run. The closure evaluator independently checks each distribution and cross-stage order at every percentile, so a hand-edited `passed` report cannot place visible paint before first output or completion before dispatch progress.
- The exact-key JSON schema accepts only the four approved lifecycle timings for both sides and rejects extra/raw lifecycle fields. Two TDD RED cycles reproduced the absent calculator enforcement plus closure/schema bypasses before implementation; focused metrics/schema/closure verification passed 3 files / 45 tests.

## 2026-08-22 — Reconciled retrieval-stage evidence checkpoint

- Every focused/deep sample now records only the approved retrieval stages: SiYuan readiness, queue wait, search, evidence hydration, and validation/hash. Each stage must be finite/non-negative and its per-run sum must reconcile to total retrieval duration within one microsecond.
- RLM subquery count must be a non-negative safe integer, and every deep run must prove at least one subquery. Reports publish p50/p95/p99/max for every stage and the subquery count alongside the existing latency, candidate/hydration, identity, and frozen-corpus quality evidence.
- Closure independently rejects malformed stage/count distributions and deep reports without subquery proof; the exact-key schema rejects unknown stages and fractional counts. Two TDD RED cycles reproduced the absent calculator data plus closure/schema bypasses before implementation; focused retrieval/schema/closure verification passed 3 files / 44 tests.

## 2026-08-22 — Fresh broad ADE/Gateway/RLM/terminal verification

- Ran the complete ADE, Context Gateway, Context RLM, and terminal feature directories together after the quality/resource/lifecycle/retrieval-stage acceptance additions: 84 files / 726 tests passed with zero failures.
- The root production command reached only the same four actively owned SiYuan test nullability diagnostics and emitted no owned-file diagnostic. A direct Vite production bundle then completed across 4,927 transformed modules in 40.85 seconds; existing tree-sitter externalization/eval, mixed-import, and large-chunk notices remained warnings.
- This is fresh automated and bundle evidence only. It does not substitute for current-source native backend execution, paired provider runs, the still-unbound complete observed ADE dispatcher identity, or official native acceptance.

## 2026-08-22 — Structured controlled-rollback proof checkpoint

- Final acceptance can no longer pass on free-form rollback notes alone. It additionally requires build-bound proof that the old internal route remains available only for rollback, shadow provider dispatch is disabled, user data is preserved, and the managed runtime pointer is restorable.
- Rollback proof carries an exact commit SHA and runtime generation and must match the evaluated build. Every false invariant is reported separately; absent proof remains `incomplete`, while a cross-build or failed invariant is `failed`.
- The exact-key JSON schema accepts only this safe boolean/build metadata and rejects extra fields such as output content. TDD RED reproduced notes-only acceptance, shadow-dispatch acceptance, cross-build acceptance, and schema rejection of the legitimate proof before implementation; focused closure/schema verification passed 2 files / 24 tests.
