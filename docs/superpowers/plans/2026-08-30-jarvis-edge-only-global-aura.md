# Jarvis Edge-Only Global Aura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global screen-edge aura Jarvis's only visible voice interaction while preserving the existing voice/session engine and projecting real microphone, playback, task, permission, completion, and error truth.

**Architecture:** A pure deterministic selector in the main renderer converts existing voice/task authority into a small versioned snapshot. A dedicated Rust supervisor owns one transparent, click-through, no-activation WebView per monitor and replicates snapshots to an isolated Canvas renderer. The existing `VoiceModal` remains the lifecycle implementation but is visually suppressed by the new root host; no locked legacy voice presentation file is edited.

**Tech Stack:** React 19, TypeScript, Zustand, Canvas 2D, Tauri 2, Rust, Windows WebView2/Win32, Vitest, Cargo tests, Playwright attached to the official native app.

**Spec:** `docs/superpowers/specs/2026-08-30-jarvis-ambient-windows-overlay-design.md`

## Global Constraints

- The edge aura is the only visible ordinary Jarvis voice-session presentation.
- Preserve existing microphone, transcription, session binding, TTS, command, approval, and task authority.
- Do not download a model, add a daemon, capture input, steal focus, or intercept mouse/keyboard events.
- Render one transparent overlay per physical monitor and fail closed to invisible idle.
- State priority is `needs > error > speaking > listening > working > done > idle`.
- Listening and speaking use real measured energy with 150% visual gain and no transcript-derived fake loudness.
- Working uses the approved 2.4-second dark-blue clockwise loop; needs uses 2.2-second black/yellow; error uses 1.8-second black/red.
- Official visual acceptance uses Playwright attached to the already-running native VibeSpace WebView; do not start a second app instance.

---

### Task 1: Deterministic ambient state and energy contracts

**Files:**

- Create: `app/src/features/jarvis-ambient/types.ts`
- Create: `app/src/features/jarvis-ambient/projection.ts`
- Test: `app/src/features/jarvis-ambient/projection.test.ts`
- Create: `app/src/features/jarvis-ambient/voiceEnergy.ts`
- Test: `app/src/features/jarvis-ambient/voiceEnergy.test.ts`
- Modify: `app/src/features/voice/voiceSignal.ts`
- Modify: `app/src/features/voice/voiceSignal.test.ts`

**Interfaces:**

- Consumes: `VoiceState`, `JarvisTaskRunProjection`, microphone RMS, and Jarvis playback energy.
- Produces: `JarvisAmbientSnapshot`, `projectJarvisAmbientSnapshot(input)`, `setJarvisInputEnergy(level)`, and `subscribeJarvisInputEnergy(listener)`.

- [ ] **Step 1: Write selector tests** that prove priority, transient completion, failed-task red, working-task dark blue, and energy clamping.
- [ ] **Step 2: Run `npm --prefix app test -- --run src/features/jarvis-ambient/projection.test.ts`** and confirm it fails because the new modules do not exist.
- [ ] **Step 3: Implement the closed snapshot contract and pure selector** with no model call or persistence.
- [ ] **Step 4: Write input-energy tests** that prove an initial zero sample, clamping, subscription cleanup, and a microphone controller publication.
- [ ] **Step 5: Run the focused energy tests** and confirm RED before connecting `voiceSignal.ts`.
- [ ] **Step 6: Publish the smoothed real input level from `voiceSignal.ts`** without adding React rerenders or a second transcription stream.
- [ ] **Step 7: Run all Task 1 tests** and confirm GREEN.

### Task 2: Isolated Canvas edge renderer

**Files:**

- Create: `app/src/features/jarvis-ambient/JarvisEdgeAura.tsx`
- Create: `app/src/features/jarvis-ambient/JarvisEdgeAura.css`
- Test: `app/src/features/jarvis-ambient/JarvisEdgeAura.test.tsx`
- Create: `app/src/features/jarvis-ambient/presets.ts`
- Test: `app/src/features/jarvis-ambient/presets.test.ts`

**Interfaces:**

- Consumes: a validated `JarvisAmbientSnapshot` received through `jarvis://ambient-snapshot`.
- Produces: a transparent full-window Canvas renderer with `data-jarvis-ambient-state` evidence and a renderer-ready acknowledgement.

- [ ] **Step 1: Write renderer and preset tests** for exact solid RGB palettes, geometry, timing, state attributes, invalid-snapshot idle fallback, and reduced motion.
- [ ] **Step 2: Run the focused tests** and confirm RED because renderer/presets are absent.
- [ ] **Step 3: Implement a DPR-bounded Canvas 2D ring renderer** using only opacity, gradient, and a single requestAnimationFrame loop while visible.
- [ ] **Step 4: Make speech energy drive band depth, brightness, glow, and travel speed** with the approved 150% gain and no hue mixing.
- [ ] **Step 5: Implement dark-blue working travel, yellow permission flash, red error flash, steady done, invisible idle, and reduced-motion fallbacks.**
- [ ] **Step 6: Run focused tests and TypeScript** and confirm GREEN.

### Task 3: Native multi-monitor overlay supervisor

**Files:**

- Create: `app/src-tauri/src/jarvis_ambient_overlay.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Create: `app/src-tauri/capabilities/jarvis-ambient-overlay.json`

**Interfaces:**

- Consumes: `set_jarvis_ambient_snapshot(snapshot)` and `jarvis_ambient_renderer_ready(revision)` from the trusted main/overlay windows.
- Produces: one `jarvis-ambient-{index}` window per monitor and `jarvis://ambient-snapshot` replication.

- [ ] **Step 1: Add Rust unit tests** for enum validation, monotonic revisions, energy/timestamp bounds, trusted caller labels, stable monitor labels, and idle visibility.
- [ ] **Step 2: Run `cargo test --manifest-path app/src-tauri/Cargo.toml jarvis_ambient_overlay --lib`** and confirm RED because the module is absent.
- [ ] **Step 3: Implement the supervisor** with transparent background, physical monitor bounds, no decorations/shadow/taskbar entry, always-on-top, no activation, and cursor pass-through.
- [ ] **Step 4: Hide until renderer ready and hide all windows on idle** so malformed or crashed renderers never expose a white rectangle.
- [ ] **Step 5: Register only the two narrow Tauri commands and add a renderer capability** limited to ambient labels and core events.
- [ ] **Step 6: Run focused Rust tests and `cargo fmt --check`** and confirm GREEN.

### Task 4: Root projection and edge-only voice presentation

**Files:**

- Create: `app/src/features/jarvis-ambient/JarvisAmbientHost.tsx`
- Test: `app/src/features/jarvis-ambient/JarvisAmbientHost.test.tsx`
- Create: `app/src/features/jarvis-ambient/index.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/index.html`
- Modify: `app/public/theme-prepaint.js`

**Interfaces:**

- Consumes: `useVoiceStore`, `useJarvisTaskRunStore`, input/playback energy subscriptions, and Tauri invoke.
- Produces: main-window snapshot synchronization, a dedicated `view=jarvis-ambient-overlay` route, and a hidden lifecycle-only VoiceModal mount.

- [ ] **Step 1: Write host tests** proving ordinary voice opens no visible dialog, lifecycle content remains mounted, microphone/TTS energy reaches snapshots, task states map correctly, and IPC is quantized.
- [ ] **Step 2: Run the focused host tests** and confirm RED because the host is absent.
- [ ] **Step 3: Implement `JarvisAmbientHost`** and route snapshots at state changes plus bounded energy deltas.
- [ ] **Step 4: Add the isolated ambient renderer route before ordinary app boot** and transparent prepaint selectors to eliminate first-frame white.
- [ ] **Step 5: Replace `VoiceModalHost`'s visible presentation with a zero-layout lifecycle mount plus `JarvisAmbientHost`** without editing locked VoiceModal files.
- [ ] **Step 6: Run host, App boundary, transparency, full voice, and TypeScript tests** and confirm GREEN.

### Task 5: Official-app and repository verification

**Files:**

- Modify: `docs/AGENT_COORDINATION.md` (append-only checkpoint)
- Modify: `.agent-coordination.lock/VS-CODEX-JARVIS-EDGE-AURA-20260830-42.txt`

**Interfaces:**

- Consumes: the committed candidate in the existing official app process/build.
- Produces: native screenshot/timing/error evidence and one exact scoped commit.

- [ ] **Step 1: Run focused frontend/Rust suites, `npm run typecheck`, `npm --prefix app run test`, `npm run test:release-manifest`, `npm run build`, and `cargo check --manifest-path app/src-tauri/Cargo.toml`.**
- [ ] **Step 2: Attach Playwright to the already-running official Tauri WebView** and verify light-blue microphone response, blue speaking response, dark-blue working, yellow permission, red error, invisible idle, zero console/page errors, and no legacy voice panel.
- [ ] **Step 3: Verify Windows behavior**: click-through, no focus theft, always-on-top, correct monitor bounds, reduced motion, renderer recovery, idle CPU/GPU quiescence, and clean shutdown ownership.
- [ ] **Step 4: Run exact-file Prettier, `git diff --check`, and a scoped secret scan.**
- [ ] **Step 5: Stage only claimed files, audit the cached manifest, commit as `feat(jarvis): replace voice panel with global edge aura`, append final verification evidence, and release only this lock.**
