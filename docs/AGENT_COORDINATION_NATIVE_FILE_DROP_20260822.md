# PR31 native chat file-drop coordination

## 2026-08-22 — Claim and reproduced root cause

- Agent/task: `VS-CODEX-NATIVE-FILE-DROP-20260822` / `PR31-NATIVE-BINARY-FILE-DROP`.
- Branch/base: `integration/UnifiedChungus-final` at `3063b84130c7f02dc09130fb472056eba88a854b`; upstream `origin/UnifiedChungus`; shared dirty work preserved.
- Exact scope: `ChatView.tsx`, a new native-file-drop bridge and focused test, this ledger, and this agent lock.
- Root cause: the current chat drop path reads only DOM `DataTransfer.files`. WebView2 strips filesystem paths from browser `File` objects, so binary MP3 drops enter `unsupportedWithoutPath` and show the screenshot error. Tauri 2 already exposes authoritative native drop events containing `paths`, but Chat never subscribes to that boundary.
- Repair hypothesis: subscribe to the current VibeSpace WebView’s Tauri `onDragDropEvent`, validate the physical drop position belongs to the active Chat surface, then dispatch each exact native path through the existing `jarvis:file:attach` route. Browser-only behavior and Composer safety remain unchanged.

## 2026-08-22 — Doctor localhost guard claim

- Localhost Playwright consistently logs a Tauri `appLocalDataDir` invoke failure from Doctor startup because the default `prepareRepair` calls the native receipt bridge even when `__TAURI_INTERNALS__` is absent.
- Exact additional scope: `storageDoctor.ts` and its focused test only. Native repair implementation, native storage backend, and all real user data remain excluded.
- Hypothesis: skip only the native receipt-preparation callback in a confirmed browser runtime; continue the ordinary IndexedDB health check/retry. Native Tauri behavior remains unchanged.

## 2026-08-22 — Verified implementation checkpoint

- Native file drop: subscribed the active Chat surface to Tauri's authoritative WebView drag/drop events, converted physical coordinates to CSS coordinates, and forwarded exact filesystem paths through the existing `jarvis:file:attach` contract. No Composer code or browser-only attachment safety was changed.
- Official native VibeSpace WebView proof: emitted the same Tauri `tauri://drag-drop` payload received from the desktop host, with an MP3 path and real composer coordinates. Chat forwarded the exact path and active chat ID; Composer rendered the attachment; the attachment was removed afterward and no message was sent.
- Doctor: localhost skips only the unavailable native pending-receipt bridge. The official native VibeSpace WebView completed a forced, non-destructive storage health check in 700 ms and ended in `healthy`. No repair or user-data mutation was performed.
- Automated verification: native/drop suite 8/8; Doctor suite 16/16; exact-file Prettier check passed. Full app typecheck reported only the four pre-existing SiYuan test diagnostics at `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`; no diagnostic is in this owned scope.
