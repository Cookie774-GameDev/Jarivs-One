# PR31 Pet presentation coordination — August 23

## Claim and root-cause checkpoint

- Agent/task: `VS-CODEX-PET-PRESENTATION-20260823` / `PR31-PET-PERSISTENT-HIDE-AND-MUTUAL-EXCLUSION`.
- Base: `66344fc0` on `integration/UnifiedChungus-final` in `C:\Users\viper\VibeSpace-UnifiedChungus-Final`.
- Exact clean scope: `PetHost.tsx` and its overlay-recovery test; `PetOverlayWindow.tsx` and test; Settings `Pets.tsx` plus one new focused controls test; this record and lock.
- Exclusions: native `lib.rs`/`pets.rs`, Pet animation/Pixi/assets, all active or dirty concurrent work, and production services.
- Reproduced source boundary: an intentional hide is reverted by `PetHost` whenever the Pet remains enabled; the native overlay does not pass a Close callback; Settings directly opens one surface without closing the other.
- Hypothesis: respecting persisted `overlayVisible`, wiring native Close to that authority, and routing Settings through confirmed mutually-exclusive operations will stop close/reopen loops and prevent simultaneous overlay/panel presentation without touching animation behavior.

## Official-native reproduction and native scope extension

- Verified target: `C:\Users\viper\VibeSpace-UnifiedChungus-Final\app\src-tauri\target\debug\jarvis.exe`, PID `38908`, official `ai.jarvis.desktop\EBWebView` profile, Playwright/CDP port `9223`, Tauri bridge present.
- Current stored Pet state was enabled, requested visible, Axolotl selected, and edge snapping enabled.
- Exact command result: `pet_is_overlay_visible=false`; `pet_show_overlay={created:false, visible:false, topmostApplied:false, rendererReady:null, reason:"visibility_check_failed"}`; no `pet-overlay` WebView target existed afterward.
- Root cause: `get_or_create_pet_overlay` trusts any label-registered handle. The stale handle remains in the manager but native visibility operations fail, so every retry reuses the same unusable handle.
- Extended exact scope to the previously clean and unlocked `app/src-tauri/src/pets.rs`. `app/src-tauri/src/lib.rs` remains excluded and untouched.

## Implementation and verification checkpoint

- Renderer ownership fixes: intentional Close now persists `overlayVisible=false`; `Show Pet` closes/unmounts the mini panel before restoring the Pet; Settings uses the confirmed mutually-exclusive panel path; the detached overlay wires its Close action to the native hide command.
- Native ownership fix: healthy hidden/visible handles remain reusable; a handle whose visibility call fails is treated as stale; stale label retirement gets a bounded 25 ms × 20 retry only on the recovery path; sanitized `stale_window_retire_failed` and `window_label_conflict` reasons cross the typed renderer bridge without being collapsed.
- Automated evidence: focused renderer/bridge boundary passes 7 files / 44 tests; native Pet suite passes 27/27; `cargo +1.95.0 check --lib --no-default-features --features jarvis-voice` passes with warnings only; exact Prettier/Cargo formatting and diff checks pass.
- Playwright Local renderer evidence on `http://localhost:5173/?route=account`: initial Pet `1` / panel `0`; click Pet produced Pet `0` / visible panel `1`; `jarvis:pet:show` produced Pet `1` / visible panel `0`; context-menu Close remained Pet `0` / panel `0` after 2.2 seconds with persisted `overlayVisible=false`; the requested visible state was restored afterward.
- Whole-app typecheck has no diagnostic in this Pet scope. It remains non-green on the four known SiYuan test nullability diagnostics plus an actively owned OpenCode System Log missing export in `OpenCodeSystemLogWindow.tsx`.
- Native caveat: the current shared native app was rebuilt successfully after the separate runtime-profile capability repair, but its Tauri command dispatcher stalled during the app-only Playwright Pet sequence. The app process remained responsive and the renderer stayed live, but even a later read-only `pet_is_overlay_visible` invoke timed out. Because another active native configuration/QA scope owns that shared process and configuration, this slice does not claim a completed native always-on-top/show-panel-close acceptance pass and does not kill or overwrite that process.

## Release checkpoint

- Product commit: `f189f946` (`fix(pets): stabilize overlay and panel presentation`).
- Exact scope released at `2026-08-23T14:44:00-05:00`; all unrelated dirty files, active locks, services, and processes remain preserved.
