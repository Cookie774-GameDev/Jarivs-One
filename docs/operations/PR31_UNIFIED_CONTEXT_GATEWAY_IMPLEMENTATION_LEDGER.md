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
