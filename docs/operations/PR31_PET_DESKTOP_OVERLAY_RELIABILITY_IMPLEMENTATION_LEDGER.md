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
