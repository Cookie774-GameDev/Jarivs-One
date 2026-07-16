# VibeSpace Pixel Pets Implementation Plan

- Date: 2026-07-11
- Agent: `AGENT-20260711-111338-PX7L`
- Branch: `agent/pixel-pets-axolotl`
- Status: awaiting explicit user approval

## Outcome

Implement the complete, production-ready VibeSpace Pixel Pets system described by the authoritative 1,824-line specification, with the supplied 136-layer Axolotl as the first finished character. The feature will use deterministic local asset processing, pre-rendered native-pixel animation atlases, an imperative PixiJS runtime, separate least-privilege Tauri Pet windows, privacy-safe event adapters, existing chat/terminal session identities, current settings patterns, and full automated/manual evidence.

No implementation starts until the user explicitly approves this plan.

## Non-negotiable invariants

- Preserve the archival PSD, ORA, manifest, original PNG, layer PNGs, reports, previews, and scripts byte-for-byte.
- Do not rerun broad segmentation or background removal unless a required canonical layer fails validation.
- Keep all generated work local. Do not upload images or use paid/cloud image APIs.
- Never mirror either V logo. Directional frames mirror eligible parts and counter-composite upright logos.
- Use integer-pixel authoring, nearest-neighbor scaling, bounded palettes, and hard alpha for solid geometry.
- Preserve partial alpha only for classified effects, shadows, glows, and documented soft highlights.
- Reuse chat IDs, terminal session IDs, PTYs, persistence, routing, cancellation, and error behavior. Pet slots are presentation only.
- Pet events carry only privacy-safe state. No prompts, message text, command text, transcript text, secrets, raw errors, or credentials.
- Preserve the existing app UI, layout, branding, and legitimate features. Add Pet UI only where explicitly required.
- Do not touch Supabase, Stripe, billing, authentication, production data, deployments, releases, or migrations.
- Do not stage or modify the unrelated `install/install.ps1` deletion.
- Do not merge or deploy. Finish with a pushed branch and draft PR only.

## Chosen architecture

### Asset plane

The build pipeline copies the archival package into a versioned repository input location, hashes it, validates all formats, selects byte-identical canonical duplicates, and produces derived assets in a separate generated character directory.

The manifest and full-canvas layer PNGs are authoritative. ORA and PSD are cross-validation sources. Derived metadata maps source names to stable runtime roles without renaming archival files.

Major animation is authored as integer transforms over a build-time layer rig and rendered to native-pixel frames. Frames are palette/alpha/logo/grid validated before atlas packing. Face micro-motion and small effects may remain separate runtime layers.

### Runtime plane

One PixiJS `Application` runs in each active Pet window. React mounts and owns lifecycle/settings boundaries; an imperative `PetRuntime` owns the ticker, textures, frame playback, movement smoothing, and disposal. React state is not updated every frame.

The state machine accepts a small typed `PetDomainEvent` union. A priority/interrupt controller resolves the current animation. An event normalizer bridges existing VibeSpace sources without importing unrelated stores into rendering code.

### Window plane

Two labeled Tauri windows are added:

- `pet-overlay`: transparent, undecorated, tightly bounded, optionally always-on-top, skipped from taskbar where supported, safe work-area positioning, minimal focus capture.
- `pet-panel`: resizable/draggable mini-panel using existing chat/terminal presentation and confirmation rules.

Each window gets a dedicated capability file. The overlay receives only window/event permissions needed for movement and visibility. Session operations remain mediated by existing app modules; the Pet windows do not receive broad shell, updater, HTTP, or credential access.

### Session plane

The panel stores only presentation metadata such as pinned chat IDs and up to four terminal slot IDs. It resolves those IDs against existing repositories/stores. Closing or unpinning never destroys a chat or PTY unless the existing user-confirmed action explicitly does so.

## Phase 0 — Baseline and file-lock expansion

1. Update the coordination heartbeat and expand file locks to the exact Phase 1 paths only.
2. Install existing dependencies reproducibly with the repository's current lockfile.
3. Run baseline checks before feature changes:
   - targeted existing tests for `App`, notifications, chat runtime, terminal restore/session identity, UI-store migration, and Tauri library tests;
   - full frontend tests when practical;
   - typecheck;
   - production build;
   - Cargo check.
4. Record all pre-existing failures/warnings separately.
5. Verify the source package and dirty installer incident have not changed.

Gate: baseline evidence recorded; no unexplained failure; exact locks held.

## Phase 1 — Immutable intake, validation, and normalized package

### Planned repository paths

- `grok/pets/input/characters.json`
- `grok/pets/input/characters/vibespace-axolotl-pixel/archival/**`
- `grok/pets/input/characters/vibespace-axolotl-pixel/layers/**`
- `grok/pets/input/characters/vibespace-axolotl-pixel/previews/**`
- `grok/pets/input/characters/vibespace-axolotl-pixel/scripts/**`
- `grok/pets/input/characters/vibespace-axolotl-pixel/notes.md`
- `tools/pets/pets_pipeline/**`
- `tools/pets/tests/**`
- `tools/pets/requirements.txt`
- `tools/pets/requirements-lock.txt`
- `tools/pets/setup.ps1`
- `tools/pets/setup.sh`
- `tools/pets/build-all.ps1`
- `tools/pets/validate-all.ps1`
- `app/src/assets/pets/schemas/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/qa/source-package-validation.json`
- `docs/pets/PETS_SOURCE_PACKAGE_VALIDATION.md`

### Work

1. Copy, never move, the canonical package and original flat source into the worktree.
2. Generate a complete source hash inventory before any derived processing.
3. Implement bounded file/path/image validation:
   - normalized relative paths only;
   - no traversal or symlink escape;
   - file count/size limits;
   - PNG dimension/decompression limits;
   - manifest schema and referential integrity.
4. Implement a small PSD structure reader for signature, canvas, layer records, section dividers, transparency-bearing records, and counts.
5. Validate ORA ZIP members, `mimetype`, XML, 136 layer entries, merged image, and thumbnail.
6. Validate manifest uniqueness, files, dimensions, alpha, pivots, attachments, branding, and default visibility.
7. Recompose the default pose and require exact equality to the supplied transparent preview.
8. Confirm the happy expression uses extracted source pixels.
9. Compare all duplicates by SHA-256. Preserve and report any future non-identical duplicate.
10. Produce the complete normalized `vibespace_axolotl_layered_package.zip` deterministically.

Gate: all required package facts independently pass; source hashes match after copy; canonical archive exists; validation exits non-zero on corrupt fixtures.

## Phase 2 — Native pixel, alpha, palette, rig mapping, and underlaps

### Planned repository paths

- `tools/pets/pets_pipeline/analyze_pixel_grid.py`
- `tools/pets/pets_pipeline/harden_pixel_alpha.py`
- `tools/pets/pets_pipeline/extract_palette.py`
- `tools/pets/pets_pipeline/map_source_layers.py`
- `tools/pets/pets_pipeline/estimate_pivots.py`
- `tools/pets/pets_pipeline/render_motion_test_matrix.py`
- `tools/pets/pets_pipeline/repair_underlaps.py`
- `tools/pets/pets_pipeline/build_pixel_face_assets.py`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/cleaned/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/layers/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/rig/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/previews/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/qa/**`

### Work

1. Implement logical-grid analysis using run-lengths, edge autocorrelation, transition spacing, block consistency, and visual candidate comparisons.
2. Choose a canonical scale only when quantitative and visual evidence agree; record alternatives and confidence.
3. Generate the cleaned full-resolution archival derivative and canonical native-pixel hard-alpha master using palette-preserving nearest/majority reconstruction.
4. Classify alpha by layer role before hardening:
   - solid geometry → 0/255;
   - glow/shadow/approved highlight → retain bounded partial alpha.
5. Remove checker/gray halos, snap edges to the native grid, and compare on light/dark backgrounds.
6. Extract and lock the canonical palette; validate frame color growth and intentional effect exceptions.
7. Normalize the 136 source layers into stable runtime roles; preserve unused archival roles.
8. Validate/refine pivots and constraints, including all six gills and non-mirrorable logos.
9. Render the complete motion-test matrix at the specified ranges.
10. Detect gaps, broken outlines, flat patches, palette mismatch, disconnected joints, and bad overlap order.
11. Repair derived underlap copies only; preserve exact source-to-derived mappings and confidence.
12. Refine all procedural expressions against the source happy face's native pixel thickness, scale, spacing, and palette.

Gate: no visible gaps across the approved motion matrix; exact upright logos; canonical scale/alpha/palette documented; comparison and contact sheets reviewed.

## Phase 3 — Animation frames, atlases, catalog, and one-command build

### Planned repository paths

- `tools/pets/pets_pipeline/build_pixel_rig.py`
- `tools/pets/pets_pipeline/render_animation_frames.py`
- `tools/pets/pets_pipeline/validate_palette.py`
- `tools/pets/pets_pipeline/pack_sprite_atlas.py`
- `tools/pets/pets_pipeline/render_previews.py`
- `tools/pets/pets_pipeline/validate_character_pack.py`
- `tools/pets/pets_pipeline/build_all_characters.py`
- `app/src/assets/pets/catalog.json`
- `app/src/assets/pets/schemas/*.schema.json`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/manifest.json`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/atlas/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/previews/**`
- `app/src/assets/pets/characters/vibespace-axolotl-pixel/README.md`

### Work

1. Author all required animations and expression presets using integer transforms and per-frame duration metadata.
2. Derive left/right motion through eligible-layer mirroring plus logo counter-composition.
3. Validate every frame for palette, alpha, bounds, logo direction, integer alignment, and required parts.
4. Pack deterministic 1×/2× atlases, targeting 1024×1024 and never exceeding 2048×2048 without documented justification.
5. Generate contact sheets, GIF/WebM previews, atlas debug views, and QA reports.
6. Add generalized rig profiles and safe optional-part fallbacks for the six required profile IDs.
7. Make `build-all.ps1` perform the full required 20-step command experience and return non-zero on unrecoverable failure.
8. Make `validate-all.ps1` validate without rebuilding source assets.

Gate: all required states resolve to valid frames or declared fallbacks; atlas and schema validation pass; deterministic rebuild hashes match.

## Phase 4 — PixiJS runtime and typed state machine

### Planned dependency changes

- `app/package.json`
- `package-lock.json`

Add a pinned compatible PixiJS 8 release after official release/license review. Do not add `@pixi/react` unless a small proof shows it reduces complexity without causing frame-rate React renders.

### Planned modules

- `app/src/features/pets/types/petTypes.ts`
- `app/src/features/pets/runtime/PetRuntime.ts`
- `app/src/features/pets/runtime/PetSpriteAtlas.ts`
- `app/src/features/pets/runtime/PetAnimationController.ts`
- `app/src/features/pets/runtime/PetStateMachine.ts`
- `app/src/features/pets/runtime/PetMovementController.ts`
- `app/src/features/pets/runtime/PetExpressionController.ts`
- `app/src/features/pets/runtime/PetAssetLoader.ts`
- `app/src/features/pets/runtime/PetPerformanceController.ts`
- `app/src/features/pets/components/PetCanvas.tsx`
- `app/src/features/pets/components/PetOverlay.tsx`
- `app/src/features/pets/components/PetFallback.tsx`
- corresponding focused test files

### Work

1. Load and schema-validate the catalog/character/atlas metadata.
2. Configure nearest textures, integer positioning, no smoothing, and bounded resolution.
3. Implement a deterministic priority/interrupt state machine covering every required event/state.
4. Implement distance-based gait phase, short velocity smoothing, facing hysteresis, settle, head/gill/tail lag, and safe reset.
5. Implement reduced-motion and Off/Calm/Normal/Playful modes.
6. Pause tickers while hidden, lazy-load unselected characters, and dispose all textures/listeners/tickers.
7. Provide a functional DOM fallback when WebGL/atlas loading fails.

Gate: unit tests cover priorities, interrupts, frame timing, no smoothing, integer placement, logo handling, movement, reduced motion, disposal, and corrupt-atlas fallback.

## Phase 5 — Tauri overlay/panel windows and secure capabilities

### Planned files

- `app/src-tauri/tauri.conf.json`
- `app/src-tauri/capabilities/default.json`
- `app/src-tauri/capabilities/pet-overlay.json`
- `app/src-tauri/capabilities/pet-panel.json`
- `app/src-tauri/src/pets.rs`
- `app/src-tauri/src/lib.rs`
- `app/src/App.tsx`
- `app/src/features/pets/windows/petWindow.ts`
- `app/src/features/pets/windows/petPanelWindow.ts`
- `app/src/features/pets/windows/petWindowBounds.ts`
- `app/src/features/pets/components/PetPanelBridge.tsx`
- focused Rust/frontend tests

### Work

1. Add explicit Pet view routing at the App root, leaving normal `WorkspaceRoot` unchanged.
2. Create or obtain labeled windows idempotently; prevent duplicate overlay/panel windows.
3. Keep creation authority with main/Rust and expose only validated settings/events to Pet windows.
4. Implement tight bounds, work-area recovery, DPI/multi-monitor conversion, remembered position/size, taskbar/always-on-top settings, and safe edge snapping.
5. Use native dragging where practical; emit bounded movement samples, never per-frame IPC.
6. Preserve existing close confirmations and active sessions.
7. Give overlay/panel separate least-privilege capabilities.

Gate: native tests and manual checks prove idempotent window creation, safe bounds recovery, no giant click-blocking region, and unchanged main/dictation behavior.

## Phase 6 — Real VibeSpace events, shared sessions, settings, and accessibility

### Planned modules

- `app/src/features/pets/events/petEvents.ts`
- `app/src/features/pets/events/petEventAdapter.ts`
- `app/src/features/pets/events/petEventReducer.ts`
- `app/src/features/pets/events/petEventRateLimiter.ts`
- `app/src/features/pets/sessions/petChatBridge.ts`
- `app/src/features/pets/sessions/petTerminalBridge.ts`
- `app/src/features/pets/sessions/petSessionRegistry.ts`
- `app/src/features/pets/settings/petSettings.ts`
- `app/src/features/pets/settings/PetSettingsSection.tsx`
- `app/src/features/settings/SettingsModal.tsx`
- `app/src/features/settings/settingsPrefetch.ts`
- `app/src/stores/ui.ts` or a dedicated persisted Pet store if discovery during implementation shows stronger isolation
- small adapter changes/tests at existing event producers only where no safe event exists

### Work

1. Normalize existing chat, terminal, agent, notification, tray, updater, sleep/wake, click, hover, drag, panel, and error sources into `PetDomainEvent`.
2. Add dedupe, priority, rate limiting, queue bounds, safe-code validation, and privacy tests.
3. Store presentation references only; enforce four terminal slots without duplicating PTYs.
4. Reuse existing chat/terminal components or their presentation primitives inside the panel; do not build fake replacements.
5. Add all requested settings through current patterns and migrations.
6. Respect `prefers-reduced-motion`, keyboard operation, focus visibility, labels, non-color-only errors, no flashing, and immediate interaction during animation.

Gate: adapter tests cover every specified mapping; integration tests prove stable shared IDs and no duplicate chats/PTYs.

## Phase 7 — Performance, platform/manual QA, documentation, and PR

### Documentation

Complete all required files under `docs/pets/`:

- `PETS_ARCHITECTURE.md`
- `PETS_PIXEL_ASSET_PIPELINE.md`
- `PETS_CHARACTER_AUTHORING.md`
- `PETS_ANIMATION_STATES.md`
- `PETS_EVENT_MAPPING.md`
- `PETS_PERFORMANCE_REPORT.md`
- `PETS_SECURITY_AND_PRIVACY.md`
- `PETS_TEST_REPORT.md`
- `PETS_KNOWN_LIMITATIONS.md`
- `PETS_ROLLBACK.md`

### Verification

Run and record:

- Pet pipeline tests and corrupt-fixture tests;
- Pet runtime/event/window/settings tests;
- existing chat/terminal/notification/store regressions;
- full Vitest suite;
- TypeScript typecheck;
- production frontend build;
- release-manifest test;
- Cargo check and relevant Rust tests;
- Tauri development smoke test;
- Tauri production/package smoke test when safe;
- secret scan;
- dependency/license report;
- complete asset validation;
- diff, staged-file, and prohibited-path review.

Manual evidence targets:

- every expression and animation state;
- left/right logo orientation;
- panel open/close and error expand/collapse;
- drag/walk/settle;
- shared chat and four terminal presentation slots;
- 100%, 125%, 150%, and 200% scaling;
- reduced motion and animation Off;
- dark/light edge inspection;
- tray hide/show, sleep/wake, updater relaunch;
- multi-monitor/taskbar-edge checks where available.

Unsupported environment checks must be marked SKIPPED, never inferred.

### Performance evidence

Measure rather than assume:

- drag/transition FPS;
- hidden and idle CPU;
- pointer-to-visual latency;
- per-frame main-thread work;
- atlas dimensions and bytes;
- decoded texture memory;
- listener/ticker/texture disposal.

### Git and PR

Commit only exact task paths in logical phases:

1. pixel asset pipeline;
2. generated character pack;
3. runtime/state machine;
4. VibeSpace integration;
5. tests/documentation.

Review each staged diff, push `agent/pixel-pets-axolotl`, and open a draft PR with previews, architecture, security, performance, tests, limitations, and rollback. Do not merge or deploy.

## Data, API, and compatibility effects

- Database/schema: none.
- Supabase/Stripe/auth/billing: none.
- External network services: none required for image/runtime processing.
- New local schemas: character catalog, rig, animations, and atlas metadata.
- New internal event contract: privacy-safe `PetDomainEvent`.
- New Tauri window labels/capabilities: `pet-overlay` and `pet-panel`.
- New persisted local preferences: Pet selection, enablement, position/panel bounds, animation intensity, reduced motion, always-on-top, lock/snap, notification reaction, sleep timeout, and panel side.
- Backward compatibility: Pet defaults disabled or safely nonintrusive for existing users until the setting/launch policy is explicitly confirmed in implementation; missing/corrupt assets fall back without breaking the workspace.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong native scale | Multi-signal analyzer plus side-by-side visual evidence; no premature resolution claim |
| Underlap gaps during motion | Mandatory full motion matrix before final frames; derived-only repairs |
| Blurry pixel rendering | Pre-rendered native frames, nearest scale mode, integer positions, scaling matrix tests |
| Backward V logo | Separate non-mirrorable layers, counter-composition, frame validator |
| Runtime overhead | Atlas playback, imperative ticker, hidden pause, lazy loading, measured budgets |
| Duplicate sessions | Slot registry stores stable IDs only and resolves existing sessions |
| Sensitive event leakage | Narrow event types, allowlisted fields, safe codes, privacy unit tests |
| Overprivileged Pet windows | Dedicated Tauri capabilities and main-controlled creation |
| Cross-PR terminal conflict | Small adapter boundary; no terminal persistence rewrite; explicit rebase review |
| Large generated diff | Deterministic build, generated-asset manifest, logical commits, reviewable previews |
| Accidental installer staging | Exact path staging and staged-diff verification before every commit |

## Rollback

1. Disable Pet creation through the local Pet setting/feature gate.
2. Revert the five logical Pixel Pets commits in reverse order.
3. Remove Pet window labels/capabilities and Pet view branches.
4. Remove PixiJS and restore the previous lockfile.
5. Remove generated Pet assets/tools/docs while leaving the external source package untouched.
6. Clear only versioned Pet local-storage keys/window state; do not touch chat, terminal, auth, billing, or general UI persistence.
7. Run the full baseline verification set.

No database or cloud rollback is required.

## Work division

The primary agent will perform the work sequentially and retain file ownership. No subagents are planned because none were requested and the shared coordination rules require explicit non-overlapping ownership. File locks will expand phase-by-phase before each edit.

## Approval gate

Implementation begins only after the user explicitly approves this plan. Approval authorizes repository changes, local dependency installation, local asset copying/derivation, tests, commits, branch push, and draft PR creation within the boundaries above. It does not authorize merge, deployment, release, production-service mutation, or destructive source edits.
