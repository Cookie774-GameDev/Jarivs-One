# PR31 Pet desktop-overlay reliability ledger

## 2026-08-22 13:42 CT — Phase 1 claim: truthful overlay outcomes

- Agent/task: `VS-CODEX-PET-OVERLAY-RESULTS-20260822` / `PR31-PET-DESKTOP-OVERLAY-RESULT-CONTRACT`.
- Starting state: `integration/UnifiedChungus-final` at `f9f2151f441bf4758df1a13905efac06e1664c33`, upstream `origin/UnifiedChungus`, shared dirty work preserved, no merge/rebase/cherry-pick state. C: has `961,212,416` bytes free.
- Exact claimed files: `app/src-tauri/src/pets.rs`, `app/src/features/pets/petTauriBridge.ts`, `app/src/features/pets/petTauriBridge.test.ts`, `app/src/features/pets/petPanelOpen.test.ts`, and this ledger.
- Reproduced source boundary: native `pet_show_overlay` returns after scheduling a main-thread callback; later create/show errors are only logged. The renderer bridge maps native invoke failure to `null`, and callers cannot distinguish absence, create failure, or unverified visibility. Native manual baseline is **BLOCKED**: the existing executable predates this branch and `npm run tauri:dev` previously hit Windows Application Control; no browser/Playwright result is product proof.
- Hypothesis: awaiting a bounded, main-thread completion result with an explicit visibility verification, then propagating the typed result through the Pet bridge, will remove the false-success boundary without changing panel/Pixi behavior.
- Next: add the smallest RED bridge/native-contract tests, make the native result truthful, run focused renderer/Rust tests if capacity permits, then record exact results before a narrow commit.

## 2026-08-22 14:22 CT — Phase 1 checkpoint: outcome contract verified

- Agent/task/branch/base: `VS-CODEX-PET-OVERLAY-RESULTS-20260822` / `PR31-PET-DESKTOP-OVERLAY-RESULT-CONTRACT` on `integration/UnifiedChungus-final`, base `f9f2151f441bf4758df1a13905efac06e1664c33`, upstream `origin/UnifiedChungus`.
- Owned change: `pets::pet_show_overlay` now waits for a bounded main-thread create/show callback and returns `PetOverlayShowResult` only after `is_visible()` succeeds. Its safe categories distinguish creation, scheduling, geometry, topmost, show, visibility, callback, and timeout failures without exposing raw WebView/OS text. `rendererReady` remains `null` because native window APIs cannot prove a Pixi paint; `topmostApplied` means Tauri accepted the topmost request, not an untestable guarantee against every OS surface.
- Bridge change: `showPetOverlay` coalesces and propagates the typed result; it broadcasts `vibespace:pet-overlay-show` only for a validated visible native result. Missing Tauri, rejected native invocation, and malformed/legacy response are typed failures with no success signal.
- TDD evidence: the first RED test showed rejected creation returned `undefined` and still emitted the success signal. A second RED test showed an `undefined` native response threw at `result.mode`. The focused suite is now green: `npm exec vitest run src/features/pets/petPanelOpen.test.ts src/features/pets/petTauriBridge.test.ts --reporter=dot` → 2 files / 12 tests passed. `cargo test pets::tests --lib` → 24 passed. `cargo fmt --check` and owned-file `git diff --check` passed.
- Native compile correction: the first Rust compilation correctly rejected the initial implementation because a `MutexGuard<PetGeometryState>` crossed an `await`. The geometry mutation is now block-scoped before the await; the targeted native contract test then passed. This is a fixed implementation defect, not an environmental result.
- Broader check: `npm run typecheck` completed with exit 1 only in pre-existing/unowned `src/features/context/siyuanRlmProduction.test.ts:110` and `src/features/context/siyuanRlmRepository.test.ts:215,254,271`; none reference an owned Pet file. No unrelated source was changed.
- Native manual matrix: **BLOCKED** for this uncommitted source revision. The currently running/built executable predates these changes; no browser/Playwright or computer-control result is being recorded as product proof. Previous Rust attempt initially hit paging-file error 1455; after memory pressure cleared, the focused Rust suite compiled and passed. Current C: free space observed after tests: approximately 10 GiB.
- Defect queue: (1) Tauri-mode PetHost still has an inline fallback after separate visibility polling; reserved for Phase 2 under a new exact claim. (2) Panel command acknowledgements and cross-window ready protocol remain unmodified. (3) Pixi/asset fallback and native manual acceptance remain pending.
- Next: make the narrow Phase 1 commit after final ownership/status verification; then release this exact source lock before claiming a non-overlapping Phase 2 slice.

## 2026-08-22 14:24 CT — Phase 1 committed

- Commit: `e6b736b6` — `fix(pets): acknowledge native overlay visibility`.
- Committed owned files: `app/src-tauri/src/pets.rs`, `app/src/features/pets/petTauriBridge.ts`, `app/src/features/pets/petPanelOpen.test.ts`, and this ledger. No other dirty or staged file was included.
- Final verification evidence before the commit: `npm exec vitest run src/features/pets/petPanelOpen.test.ts src/features/pets/petTauriBridge.test.ts --reporter=dot` → 12/12; `cargo test pets::tests --lib` → 24/24; `cargo fmt --check` → exit 0; owned-file `git diff --check` → exit 0. Rust emitted six pre-existing dead-code warnings outside this change.
- Manual native evidence: **BLOCKED**. The official executable has not been rebuilt with `e6b736b6`, so there is intentionally no PASS claim for native desktop visibility, click, drag, panel, app-focus, or external-app rows.
- Remaining risks: the full repository TypeScript check is red only in unowned SiYuan context test files (recorded above); topmost over normal desktop apps requires the required rebuilt-native matrix; true exclusive fullscreen and secure desktop remain expected platform limitations.
- Lock release: `VS-CODEX-PET-OVERLAY-RESULTS-20260822` is released after this ledger entry is committed. The next Pet phase must create a new exact claim.

## 2026-08-22 14:30 CT — Phase 2 claim: native panel acknowledgement

- Agent/task: `VS-CODEX-PET-PANEL-ACK-20260822` / `PR31-PET-PANEL-NATIVE-ACKNOWLEDGEMENT`.
- Starting state: `integration/UnifiedChungus-final` at `ced5775de21a1488237505dfdff6c1d4cdb9c346`, upstream `origin/UnifiedChungus`. The shared dirty worktree and all non-Pet files remain preserved; C: free space is approximately 10 GiB.
- Exact claim: `app/src-tauri/src/pets.rs`, `app/src/features/pets/petTauriBridge.ts`, `app/src/features/pets/petPanelOpen.test.ts`, `app/src/features/pets/PetHost.tsx`, `app/src/features/pets/PetHost.nativePanel.test.tsx`, and this ledger. No active lock overlaps this slice.
- Reproduced source boundary: `pet_open_or_focus_panel` ignores every size/position/topmost/unminimize/show/focus result and returns `Ok(())`; the bridge polls, then hides the detached overlay and selects `useInlineFallback:true` when the native panel does not confirm. `PetHost` renders that inline fallback even in Tauri. This violates native-first behavior and can hide the real desktop Pet after a failed panel attempt.
- Hypothesis: a safe typed native panel result plus bridge-side validated acknowledgement will retain the detached overlay on a Tauri failure, while browser/non-Tauri keeps its explicit inline panel. No Chat, terminal, activity, or Pixi rendering behavior changes are in this slice.
- Next: add RED tests for Tauri native-panel rejection/nonconfirmation and preserve-overlay behavior; replace swallowed panel operations with safe categories; run focused renderer/native tests and record exact outcomes.

## 2026-08-22 14:35 CT — Phase 2 checkpoint: native-panel acknowledgement verified

- Owned change: native `pet_open_or_focus_panel` now returns a safe `PetPanelOpenResult` only after size/position/topmost/restore/show/focus calls succeed and `is_visible`, `is_minimized`, and `is_focused` confirm a usable panel. It preserves whether the window was newly created, keeps `rendererReady:null`, and returns stable categories instead of raw platform errors. The overlay result also now preserves `created:true` when creation succeeded but a later show operation failed.
- Bridge change: `openOrFocusPetMiniPanel` validates the native result. In Tauri, rejection, malformed reply, or failed confirmation clears the panel flag and requests the detached overlay again; it returns `useInlineFallback:false`, `overlayVisible`, and a safe reason. Browser/non-Tauri remains the only explicit inline path. Panel visibility is still polled after the native acknowledgement to absorb late WebView presentation.
- Host change: Tauri is detected on the first render; the host never mounts its inline sprite or `PetMiniPanel` in Tauri, including stale cross-window panel flags and native failure. A confirmed native panel hides the sprite; a failed request clears host state so the bridge can restore the detached overlay. Chat/Terminal/Activity content remains untouched.
- TDD/verification: RED tests reproduced three old failures: structured native failure and invoke rejection both selected inline fallback/hid the overlay; non-Tauri results omitted explicit status. Green command: `npm exec vitest run src/features/pets/petPanelOpen.test.ts src/features/pets/PetHost.nativePanel.test.tsx src/features/pets/petTauriBridge.test.ts --reporter=dot` → 3 files / 15 tests passed. `cargo test pets::tests --lib` → 25 passed, including the native panel-result contract. `cargo fmt --check` passed. `npm run typecheck` remains exit 1 only at the same unowned SiYuan tests: `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`.
- Native manual matrix: **BLOCKED** for this source revision. The running official app has not been rebuilt/relaunched from these commits, and no browser/Playwright/computer-control result is product evidence. C: has approximately 9 GiB free after verification.
- Remaining risks/queue: typed hide-overlay acknowledgement is still pending (so a rare hide failure after panel confirmation needs a separate lifecycle slice); panel renderer/session readiness is not claimed by native window state; Pixi/asset resilience, Chat/Terminal/Activity survival, and exact-commit native matrix remain pending.
- Next: final staged ownership/diff review, narrow commit, final ledger SHA entry, release this lock, then claim the next non-overlapping lifecycle/render slice.

## 2026-08-22 14:37 CT — Phase 2 committed

- Commit: `2219b115` — `fix(pets): keep panel fallback native in tauri`.
- Committed owned files: `app/src-tauri/src/pets.rs`, `app/src/features/pets/petTauriBridge.ts`, `app/src/features/pets/petPanelOpen.test.ts`, `app/src/features/pets/PetHost.tsx`, `app/src/features/pets/PetHost.nativePanel.test.tsx`, and this ledger. No unrelated dirty file was staged.
- Evidence: focused Pet suite 15/15, native Pet suite 25/25, Cargo formatting and owned diff checks passed. Full TypeScript check remains blocked by the same four unowned SiYuan diagnostics only. Native desktop/manual rows remain **BLOCKED** because the official application has not been rebuilt/relaunched from `2219b115`.
- Known risks: overlay hide still has no typed outcome; native lifecycle success cannot claim renderer/session readiness; no observed exact-commit panel UI, cross-app z-order, click, drag, or session-survival result yet.
- Lock release: `VS-CODEX-PET-PANEL-ACK-20260822` is released after this ledger entry is committed. The next slice requires a new exact non-overlapping claim.

## 2026-08-22 14:42 CT — Phase 3 claim: Pixi static-frame fallback

- Agent/task: `VS-CODEX-PET-PIXI-FALLBACK-20260822` / `PR31-PET-PIXI-STATIC-FALLBACK`; base `5dc6e7deae61b517735601d415598dc8304b63da` on `integration/UnifiedChungus-final`.
- Exact claim: `app/src/features/pets/PetOverlay.tsx`, `app/src/features/pets/petPixiRealPlayback.test.tsx`, and this ledger. No active lock overlaps this slice.
- Reproduced source boundary: `PixiAtlasPlayer` has context-loss cleanup/recovery and `PetOverlay` already owns a bundled transparent static preview, but enabled-animation `playAnim` failure only logs and leaves render readiness false; the static preview is rendered only when animation is intentionally off. That can produce a blank Pet while the native overlay remains clickable.
- Hypothesis: a local failed-render state can render the existing static preview with no opaque background, permit existing hard recovery to retry Pixi, and retain no new assets or renderer instances.

## 2026-08-22 14:40 CT — Phase 3 checkpoint: static Pixi fallback verified

- Owned change: `PetOverlay` now treats missing animation definitions and current-generation Pixi init/load failures as a static-frame fallback condition. The existing bundled character preview is absolutely overlaid within the transparent canvas host, preserving its size/alpha and preventing a failed Pixi canvas from pushing the image out of view. A successful cached or fresh Pixi animation clears the fallback; character/motion changes reset it so normal recovery can retry.
- TDD: RED test made the mocked enabled Pixi atlas load reject and observed no `data-pet-static-frame`; green test observes `data-pet-renderer="static-fallback"`, then its image load restores render readiness. The implementation deliberately does not claim an asset-loaded fallback when the static image itself errors.
- Verification: `npm exec vitest run src/features/pets/petPixiRealPlayback.test.tsx src/features/pets/PetOverlayWindow.test.tsx src/features/pets/PetHost.nativePanel.test.tsx src/features/pets/petPanelOpen.test.ts --reporter=dot` → 4 files / 28 tests passed. Full `npm run typecheck` remains exit 1 only at the four unowned SiYuan test diagnostics already listed. No native/Cargo source changed in this slice.
- Native manual matrix: **BLOCKED** — no rebuilt official executable of this source revision has been launched; test DOM output is not desktop-product proof.
- Remaining queue: typed overlay-hide acknowledgement, native panel/manual focus verification, exact Chat/Terminal/Activity close-reopen survival, and external-app topmost/click/drag checks remain pending.

## 2026-08-22 14:41 CT — Phase 3 committed

- Commit: `383944c5` — `fix(pets): show static frame after pixi failure`.
- Committed owned files: `app/src/features/pets/PetOverlay.tsx`, `app/src/features/pets/petPixiRealPlayback.test.tsx`, and this ledger. No unrelated dirty file was staged.
- Evidence: focused/adjacent Pet renderer suite 28/28; owned diff check passed. Full typecheck remains blocked only by the four unowned SiYuan test diagnostics. Native/manual rows are still **BLOCKED**; no desktop-app result is asserted.
- Lock release: `VS-CODEX-PET-PIXI-FALLBACK-20260822` is released after this ledger entry is committed.

## 2026-08-22 14:45 CT — native acceptance feasibility checkpoint

- Current source tip contains Pet commits `e6b736b6`, `2219b115`, and `383944c5` plus their ledger commits. The only observed running shared VibeSpace development executable is `D:\VibeSpace-CargoTarget-20260822\debug\jarvis.exe`, created at **14:35:10 CT**. It predates the Phase 3 renderer source and cannot be attributed to the current tip.
- Attempted normal native launch: `npm run tauri:dev` exited 1 before Cargo compilation because Vite port `5173` is already owned. The existing shared Vite process started at 14:12:27 CT; its shared Cargo process started at 14:29:25 CT. Restarting, killing, or replacing either would disrupt another agent's work and is out of scope.
- Official native acceptance matrix status for the current Pet commits: desktop overlay, click, drag, native panel Chat/Terminals/Activity, minimize/close/reopen survival, topmost over browser/windowed game, focus/no-focus-theft, and failure rows are all **BLOCKED**. No computer-control or browser/Playwright result has been substituted for these rows.
- Required next authority/state: a current-tip native executable launched through the shared Vite process or an explicitly authorized isolated build/run that does not interrupt it, followed by app-only manual interaction. Until then, the completed evidence is limited to committed focused code tests and native Rust unit tests.

## 2026-08-22 15:02 CT — reported-missing-Pet recovery claim

- Agent/task: `VS-CODEX-PET-OVERLAY-RECOVERY-20260822` / `PR31-PET-OVERLAY-MISSING-RECOVERY`; base `9bf69a28cb177fa481b0be6088128fd02d132002` on `integration/UnifiedChungus-final`, upstream `origin/UnifiedChungus`.
- Exact claim: `app/src/features/pets/PetHost.tsx`, `app/src/features/pets/PetHost.nativePanel.test.tsx`, `app/src/features/pets/PetHost.overlayRecovery.test.tsx`, and this ledger. No active lock overlaps the source/test slice.
- Reported reproduction: user reports that the Pet is not visible. The shared Vite/Cargo desktop process is kept untouched; its executable was created before the current Pet source tip, so it is not evidence for or against this change.
- Root-cause boundary: after the native-only Tauri change, `PetHost` calls `showPetOverlay()` once and ignores its typed failure result. A short-lived native creation/show race can therefore leave the Pet absent until an unrelated state change repeats the effect. The repair must make a bounded retry only while the Pet should be visible; it must never fall back inline in Tauri.
- Next: add a focused regression test first, implement the bounded recovery, then run the owned and adjacent Pet suites.

## 2026-08-22 15:05 CT — reported-missing-Pet recovery verified

- Change: `PetHost` now retries a failed typed native overlay show after 250 ms, 1 s, and 3 s only while the detached overlay should remain visible. A visible acknowledgement stops retries. Effect cleanup cancels a queued retry, so disabling, unmounting, shutdown, or a later visibility state cannot resurrect the Pet.
- TDD: the new `PetHost.overlayRecovery.test.tsx` failed before the change because one failed native show resulted in exactly one call; it now proves one transient failure is retried and a queued retry is cancelled on unmount. This preserves the existing native-only Tauri contract—no inline Pet or panel is introduced.
- Verification: `npm exec vitest run src/features/pets/PetHost.overlayRecovery.test.tsx src/features/pets/PetHost.nativePanel.test.tsx src/features/pets/petPanelOpen.test.ts src/features/pets/PetOverlayWindow.test.tsx src/features/pets/petPixiRealPlayback.test.tsx --reporter=dot` → **5 files / 30 tests passed**. `npm run typecheck` → **passed**. Exact-file Prettier check and `git diff --check` → **passed**.
- Native acceptance: **NOT CLAIMED**. The shared desktop executable predates this source slice and the user has prohibited computer-control UI interaction. The shared Vite/Cargo process remains untouched. A current-source desktop observation is still needed to mark the reported Pet-visible row as passed.
- Next: commit this exact source/test/ledger slice, then record its SHA and release only `VS-CODEX-PET-OVERLAY-RECOVERY-20260822`.
