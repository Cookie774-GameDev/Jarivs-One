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
