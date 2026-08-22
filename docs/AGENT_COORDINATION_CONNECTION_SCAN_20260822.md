# PR31 connection scan optimization

## 2026-08-22 — claim

- Exact scope: external connection auto-detection and its focused test only.
- Root cause evidence: one scan launches `detect()` independently for both `zai-coding-plan` and `opencode-cli`, even though both use the same managed OpenCode adapter. Those duplicate readiness operations race during startup and leave the OpenCode auth snapshot unknown while a direct authenticated probe succeeds immediately afterward.
- Intent: share only adapter installation/readiness detection within one scan. Connection-specific authentication probes and exact provider identities remain separate.

## 2026-08-22 — implementation checkpoint

- Baseline: `integration/UnifiedChungus-final` at `5440e986` (upstream `origin/UnifiedChungus`); inherited dirty work preserved.
- TDD evidence: the new shared-adapter regression failed because `detect()` ran twice. The implementation now memoizes one detection promise per adapter for each scan while retaining one `probeAuth(connection)` call per connection.
- Verification: `npm exec vitest run -- src/lib/ai/adapters/autoDetectConnections.test.ts` — 1 file, 10 tests passed.
- Scope remains limited to `autoDetectConnections.ts`, its focused test, and this ledger.
