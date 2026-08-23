# PR31 Warm Settings Surface + 24/7 Mix Refinement

## Coordination

- Agent/task: `VS-CODEX-WARM-SETTINGS-247-MIX-20260823` / `PR31-WARM-SETTINGS-SURFACE-AND-247-MIX`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch/upstream: `integration/UnifiedChungus-final` / `origin/UnifiedChungus`
- Base HEAD: `66344fc0b07bd07d7f409006076af10ce04927f3`
- Exact ownership: `.agent-coordination.lock/VS-CODEX-WARM-SETTINGS-247-MIX-20260823.txt`
- QA constraint: localhost browser Playwright plus focused automated tests only; no native/full-app Playwright or computer control.

## Root-Cause Evidence

- User screenshot reproduced in localhost Warm Settings → Voice.
- Browser Playwright measured five direct Voice layout sections with `background: rgba(242, 225, 205, 0.48)`, a paper shadow, and `border-radius: 0px`.
- The source is the broad Warm selector targeting every Settings tab `section`/`article`. A separate selector already styles explicit rounded bordered cards, so the broad rule creates the unwanted rectangular underlay rather than the intended cards.
- `AmbientAudioHost` already routes an enabled saved project to `playProject(clips, loop, ambientVolume)`, and the engine already applies order, trim boundaries, playback speed, loop state, and live volume.
- The product gap is selection/presentation: Ambient's track selector omits the project, and Preview always calls `play(ambientTrack, ambientVolume)` even when the project is active.

## Acceptance Matrix

1. Layout-only sections/articles in every Warm Settings tab remain transparent and shadow-free.
2. Explicit rounded bordered Settings cards keep their subtle paper surface, border, and radius.
3. Other themes and MonoChrome rules remain unchanged.
4. Ambient source selector exposes `VibeSpace Mix` with the current clip count.
5. Selecting the mix persists it as the active ambience/24-7 source; selecting a catalog track deactivates the mix.
6. Mix preview calls `playProject` with saved order, edits, loop, and current volume; catalog preview calls `play`.
7. The 24/7 host routes the selected mix with current volume and reroutes on settings changes without a second engine.
8. Browser Playwright verifies Voice and at least one other Settings tab after the change; focused automated tests and production bundle run before completion.
9. Previewing one selected song exposes its elapsed/duration state and a scrub control; seeking moves only that active preview. The control stays hidden during full-mix playback.

## Checkpoints / Commits

- 2026-08-23 preflight/root cause: ownership claimed at `66344fc0`; browser-only reproduction captured the five unwanted rectangular Voice group surfaces and the hidden/hard-wired mix selection gap. Scope then extended to the released Music Studio/audio-engine files for a user-requested single-song preview scrubber; the current engine exposes neither progress nor seek. TDD and implementation pending.
- 2026-08-23 implementation: Warm Settings layout groups are transparent/shadow-free while the existing explicit rounded-card selector remains intact. Ambient now presents the saved 64-song project as `VibeSpace Mix`, persists mix-versus-catalog selection, and previews/routes project order, trim, speed, loop, and live volume through the existing single audio engine. The engine now exposes normalized project progress and bounded seek; Music Studio displays the elapsed/total scrubber only for the selected-song preview.
- 2026-08-23 browser Playwright evidence (existing localhost Vite instance; VibeSpace was not started by this task):
  - Warm Voice: all five layout sections changed from `rgba(242, 225, 205, 0.48)` plus paper shadow to transparent plus no shadow; rounded choice cards remained visible.
  - Warm Ambient: `VibeSpace Mix · 64 songs · loops` was selected; preview status reported `Now playing: VibeSpace Mix (64 songs) · preview (15s)` at volume `55%`; all seven layout sections were transparent/shadow-free.
  - Music Studio selected-song preview: `Ain't No Time Like Now - BLAEKER` exposed `Preview position…` with min `0`, max `179.296854`, and live elapsed/total output. Switching to full-mix playback removed the per-song scrubber (`0` matching controls).
- 2026-08-23 verification at shared-branch HEAD `70e367082238ccaccb2df2941fd9e1300f0d1804`:
  - Focused matrix: **PASS**, 5 files / 11 tests.
  - Adjacent Ambient + Warm Settings + MonoChrome matrix: **PASS**, 12 files / 33 tests. Existing React `act(...)` warnings remain in `settingsVoiceSurfaces.monochromeAppearance.test.tsx` and are unrelated to this slice.
  - Direct Vite production bundle: **PASS**, 4,960 modules transformed; existing chunk-size/dynamic-import warnings remain.
  - Repository TypeScript build: **BLOCKED by unrelated pre-existing SiYuan test diagnostics** in `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`; none is in this owned scope.
  - Commit SHA: pending.
