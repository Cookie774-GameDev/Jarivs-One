# PR31 OpenCode Reliability Coordination

## 2026-08-22 — native evidence and bounded claim

- Agent/task: `VS-CODEX-OPENCODE-RELIABILITY-20260822` / `PR31-OPENCODE-RELIABILITY-CATALOG-NATIVE`; branch `integration/UnifiedChungus-final`, base HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- Official native evidence: debug VibeSpace `jarvis.exe` PID 18556 is running. It owns one managed `opencode.exe serve` PID 24760 at version 1.18.16. A separate system OpenCode 1.18.21 PID 36824 is owned by an unrelated PowerShell process, not VibeSpace. Both meet the checked-in minimum 1.18.16.
- The current native VibeSpace screen shows an active OpenCode route and no update-required gate. The Windows helper captured the real app but reports stale 14×14 coordinate bounds; its accessibility click did not navigate. Preserve this as a native-control blocker unless a stable handle becomes available.
- Root cause from production data flow: repeated renderer Download/Retry calls are not single-flight and supersede one another, while the native installer lease truthfully rejects the second call as already running. Native server ensure similarly rejects concurrent callers instead of joining the one startup. The existing owned process is otherwise health-gated, persistent, and singular.
- Exact write scope is the runtime manager/gate and tests, native `harness/server.rs`, focused OpenCode catalog hook tests, this ledger, and the agent-scoped lock. Active chat runtime/Context work, provider credentials, download/manifest security policy, system policy, deployments, commits, and unrelated dirty files are excluded.

## 2026-08-22 — scope checkpoint

- Added `app/src/lib/ai/useAccessibleChatModels.ts` to this agent's exact scope after confirming all model-catalog-specific agent locks are released. This is limited to forced-refresh single-flight behavior and its focused tests; existing provider grouping/identity edits are preserved.

## 2026-08-22 — official native acceptance checkpoint

- Exact app identity: official VibeSpace `jarvis.exe` PID 26192 at `D:\VibeSpace-CargoTarget-20260822\debug\jarvis.exe`; its WebView2 debug host PID 33832 is parented by that process, uses `C:\Users\viper\AppData\Local\ai.jarvis.desktop\EBWebView`, and renders the live Vite source.
- Retry recovered a valid private server connection for installed system OpenCode 1.18.21. Detection completed without a blocking update prompt.
- Download was exercised twice concurrently. Both callers received the same promise, the compatible install was accepted without invoking a new download, and the one VibeSpace-owned `opencode.exe serve` PID 5888 was unchanged before/after.
- Exact private transport was exercised through `nativeOpenCodeRequest` using the manager's opaque generation. `/global/health` returned HTTP 200 with `healthy: true` and version 1.18.21 in 910 ms. No inference, prompt, provider mutation, or credential operation was performed.
- Automated verification: runtime manager, readiness gate, and catalog refresh suites passed 61/61. Exact TypeScript/Rust formatting and diff checks passed. The rebuilt native executable successfully compiled and ran the owned native server changes; focused Rust behavior is also covered by the new one-start-only and bounded-backoff unit tests.

## 2026-08-22 — cold renderer refresh fast-path checkpoint

- Root cause: a full renderer/HMR refresh creates a new runtime-manager singleton with no in-memory connection. The old refresh path skipped native server status in that cold state and unnecessarily entered the slower install-detection path even while VibeSpace already owned a healthy supervised OpenCode server.
- Repair: every refresh now asks the native supervisor for its current opaque connection first. A valid existing connection is adopted immediately; absent, changed, invalid, or failed status still falls through to the existing detection and health-gated startup path.
- Official native proof: a fresh runtime-manager module inside the real Tauri WebView (`jarvis.exe` PID 26192, official `ai.jarvis.desktop` profile) adopted system OpenCode 1.18.21 in 19 ms. The single VibeSpace-owned `opencode.exe serve` PID remained 37596 before and after; no second service process or update flow was created.
- Verification: focused OpenCode runtime manager 27/27; combined Doctor/Composer/storage/OpenCode matrix 68/68; full app TypeScript typecheck passed.

## 2026-08-22 — listener-registration startup gate removed

- Root cause: runtime activation awaited native lifecycle-listener registration before consulting the already health-gated supervisor connection. A delayed Tauri/WebView listener import could therefore leave Chat on “Checking OpenCode Harness…” even though the managed server was ready.
- Repair: activation now adopts or starts the supervised connection first. Lifecycle event registration remains supplemental and cannot overwrite a ready snapshot if it is delayed or fails.
- Verification: `npm exec vitest run -- src/lib/harness/runtimeManager.test.ts` — 1 file, 28 tests passed, including a pending-listener regression that proves readiness is published without waiting for registration.

## 2026-08-22 — provider-safe tool wire names and startup catalog consolidation

- Official failure evidence: the 18:08 CT DeepSeek V4 Flash turn reached exact provider dispatch, then Console Go rejected `tools[0].function.name` because a provider-facing tool name violated `^[a-zA-Z0-9_-]+$`. The same error was confirmed in the managed OpenCode log without recording prompt or credential material.
- Root cause refinement: renaming only `vibespace_context.query` was insufficient because the generated OpenCode plugin still exported other dotted names such as `terminal.list`. Some providers validate every supplied function schema even when a turn enables only one tool.
- Repair: every generated plugin export and matching OpenCode permission key now uses a provider-safe underscore wire name. The trusted loopback gateway still receives the original semantic name, so terminal, command, profile, memory, context, skill, plugin, task, schedule, and app behavior is preserved. Per-turn adapter policy applies the same deterministic semantic-to-wire mapping.
- Catalog startup: removed two redundant legacy OpenAI/Z.AI `listModels` calls that ran beside the authoritative persistent OpenCode catalog. The single live authenticated catalog remains the picker authority and five-minute refresh source.
- Verification: SDK/tool-wire and accessible-catalog suites passed 36/36; focused native generated-gateway test passed 1/1. Full TypeScript reached only the four known, separately owned SiYuan test diagnostics (`siyuanRlmProduction.test.ts:110`; `siyuanRlmRepository.test.ts:215,254,271`) and introduced no new diagnostic.
- Official native acceptance: rebuilt `D:\VibeSpace-CargoTarget-20260822\debug\jarvis.exe` was driven through its own WebView. The exact route `opencode/opencode-go/deepseek-v4-flash-vision-exp` completed a real protected turn in 10.7 seconds with live execution evidence, `protected turn completed`, and `@jarvis finished`; the previous canonical-completion failure did not recur. No credential, provider, deployment, or user-data mutation was performed.
- Startup evidence: a cold native launch reached ready in about 16.5 seconds; the previously verified warm supervised-process adoption remains 19 ms. The catalog repair removes redundant startup fetches, but no zero-latency or sub-second cold-launch claim is made.
