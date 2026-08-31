# PR31 Unified Chungus architecture map

Updated: 2026-08-30T03:03:00-05:00

## Required vertical slice

```text
Chat UI
  → exact live OpenCode catalog + requested identity
  → managed native OpenCode transport/public-part timeline
  → Tool Gateway / Context Gateway
  → project-scoped RLM retrieval
  → SiYuan durable hierarchy + hydration
  → grounded answer
  → public citations + receipts + durable journal
```

The first acceptance slice must preserve provider, model, effort, Fast, CWD, session, ordered public text/tool parts, approval/question state, cancellation, reconnect, isolation, and reload. No local fallback or Ollama route is permitted.

## Existing authorities to extend

| Concern | Existing authority | Required extension |
|---|---|---|
| Chat chronology | `features/chat/**`, `lib/ai/adapters/opencodePersistent*`, `lib/harness/OpenCodeTextAccumulator*` | Current-worktree native Phase 0 proof; preserve public-part truth and no duplicate dispatch. |
| OpenCode native transport | `src-tauri/src/harness/server.rs`, `lib/harness/openCodeNativeTransport*` | Exact identity, bounded streaming, approvals/questions/reconnect and safe failure receipts. Inherited staged edits are protected until reconciled. |
| Context/RLM | `features/context/contextRlmProduction*`, `rlmRuntime*`, Context Gateway/tool publication modules | One project-scoped retrieval/hydration route with provenance, cancellation, budgets, and no silent fallback. |
| SiYuan | `features/context/siyuan*`, `siyuanContextMapIntegration*`, `src-tauri/src/siyuan/**` | Current official-native graph/count/summary/restart and grounded Chat acceptance. |
| Journal/run safety | `lib/jarvis/contracts/execution*`, `executionJournal/**`, `codingRunRuntime*`, `approvalEngine*` | Parent CAO goal/work-item state, leases, messages, retries, tests/builds/commits/receipts, bounded retention, replay, and searchable provenance. |
| Learning | `features/jarvis-memory/**` | Correlate interventions with before/after target state and verified outcomes; compile safe policy candidates; grade fixed ten-message fixture. |
| Schedule | `features/schedule/jarvisScheduleRunner*`, `jarvisScheduleDispatch*`, `SchedulePage*` | Sole recurrence authority for CAO, exactly four checks in one hour, restart/retry/dedup and journal receipts. |
| Terminal fleet | `features/terminals/**`, native PTY commands | Durable paged scrollback and CAO-owned target leases without a second terminal implementation. |
| Workbench/native surfaces | `features/workbench/**`, `features/browser-chat/**`, native surface/window modules | AI-app/native-app panel lifecycle, exact profile/process/window identity, geometry/focus/DPI/recovery and five-site batch. |
| Plugin/MCP/credentials | plugin manager, unified MCP registry, connection supervisor, native secure credentials | Keep provider sessions, API keys, stdio MCP, remote MCP/OAuth, and tunnel credentials separate and scope-safe. |
| MD and unified refs | Chat Markdown command, Files/Context artifact paths, agent/plugin/file/skill descriptors | Default `attachToChat:false`, typed versioned artifacts, and one stable identity/provenance/permission-aware reference engine. |
| Native acceptance | `features/context/gateway/contextGatewayAcceptanceSuite*`, `contextGatewayAcceptanceSchema*`, `scripts/context-gateway-acceptance.ts`, `scripts/pr31-native-acceptance-harness*`, `scripts/pr31-native-question-a*`, `src-tauri/tauri.cdp.conf.json` | One machine-checked Phase 0 saved-failure matrix plus direct Playwright attachment only to the verified official Tauri WebView. Bind every proof to one immutable commit/runtime generation; reject stale executables, HMR-affected turns, and standalone-browser evidence. |

## Missing CAO authority to add

```text
User @CAO / ordinary-language intent
  → CAO intent + exclusion policy
  → durable parent goal and dependency graph
  → bounded work-item leases / heartbeats / inbox
  → observe real target evidence
  → diagnose first broken boundary
  → approve or execute scoped recovery
  → verify outcome and grade confidence
  → journal receipt + learning candidate
  → Schedule-owned next check
  → sanitized real-time Operations Floor projection
```

The Operations Floor is a projection, never a second scheduler or persistence authority. Every label, count, status, animation, retry, duration, blocker, and receipt must come from sanitized CAO/runtime state. The supplied warehouse HTML contributes visual language only; its hard-coded test counts, random events, and fake progress must not enter product code.

## Safety boundaries

- No Ollama process or `11434`; authenticated cloud routes fail closed when unavailable.
- No duplicate database, terminal, MCP registry, approval engine, scheduler, or provider-surface authority.
- Secrets remain in native credential storage, never journals, learning files, layouts, provider DOM, or evidence packets.
- Provider WebViews remain origin-isolated and untrusted; user/third-party DOM text is never executable instruction.
- All writes use exact project/account/work-item authority, explicit claims, cancellation, receipts, rollback where applicable, and current-head validation.
- Native evidence must prove the intended `jarvis.exe` and descendant WebView profile before and after the scenario.
- Requested and observed provider/model/variant/effort/Fast/CWD identity must compare equal; a UI `HIGH` label alongside a Gateway `provider-default` receipt is a failure, not a cosmetic discrepancy.
- Acceptance must record automatic and explicit `/rlm on`, empty-first continuation, exact permitted reads, denied external paths, binary metadata without RLM text, cancellation/retry/reconnect/reload, isolation, verified artifact output, resolvable canonical provenance, a materially different authenticated route, and zero Ollama before/during/after.
