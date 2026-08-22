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
