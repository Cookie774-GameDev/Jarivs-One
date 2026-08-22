# PR31 `/doctor` coordination

## 2026-08-22 — Claim

- Agent/task: `VS-CODEX-SLASH-DOCTOR-20260822` / `PR31-CHAT-SLASH-DOCTOR`.
- Branch/base: `integration/UnifiedChungus-final` at `537207aa1c3b88355249f42e83261429c79d81d2`; shared dirty work preserved.
- Exact boundary: register and execute `/doctor` in Chat, with a new deterministic coordinator and focused tests. Existing Composer changes for connection provenance and picker stacking are preserved and excluded from staging.
- Safety contract: Enter may run non-destructive checks, bounded local-storage retry, OpenCode detect/reuse, and approved install recovery when needed. Persistent storage repair remains backup-first and explicitly confirmed. Unknown or unsupported error categories are reported, never guessed or silently cleaned.

## 2026-08-22 — implementation and native verification checkpoint

- `/doctor` is registered as a local utility command. Selecting it with Enter runs immediately, posts progress and the final report into the active chat, and never enters provider/model dispatch.
- The deterministic report covers local chat storage, OpenCode readiness/recovery, agent roster readability, installed skill catalog readability, recent terminal-session storage, token-optimization settings/model-protection truth, and settings storage. The added subsystem checks are read-only; each failure is isolated and rendered with a stable diagnostic code rather than exposing private exception details.
- Official native proof: the real Tauri WebView reported all supported checks healthy in 255 ms: storage healthy, OpenCode system 1.18.21 ready, 6 agents loaded, 5 skills available, terminal history readable, optimization normal with selected-model protection, and settings readable. No destructive action or inference was performed.
- Verification: focused Doctor/Composer/slash/storage/OpenCode matrix 6 files / 68 tests passed; full app TypeScript typecheck passed.
