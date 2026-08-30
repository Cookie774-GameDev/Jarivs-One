# Jarvis Ambient Windows Overlay Design

**Status:** Approved in chat on 2026-08-30; implementation requires a separate reviewed plan and clean file ownership.

## Goal

Port the visual language of the live [Omarchy Ambient Agent demo](https://fjalvarezdd.github.io/omarchy-ambient-agent/) into VibeSpace as a native Windows desktop overlay. Jarvis state must remain visible around the physical screen edge while the user works in another application, without pop-ups, focus theft, mouse interception, or a second app installation.

The port must preserve the reference's choreography rather than redesign it. Windows implementation details may change, but the visible colors, timing, edge geometry, motion, and state priority must remain faithful.

## Visual authority

The sources are authoritative in this order:

1. The live website's interactive states and **Play a real session** sequence.
2. The cloned website implementation in `docs/index.html`.
3. The bundled `demo.gif` and `docs/demo.gif` media.
4. `Service.qml` and `ambient-agent.json` for native overlay semantics and configuration bounds.

The live website intentionally contains a richer working-state animation than the basic QML overlay. Because the user explicitly selected the website effects, the website wins when they differ.

## Exact state language

| State | Visual behavior | Timing | Reference color |
| --- | --- | --- | --- |
| `idle` | Fully transparent; no edge or glow | indefinite | transparent |
| `working` | One cyan-white lit segment travels clockwise around the full edge. The remainder retains only a faint ambient cyan field. | `2.4s` linear revolution | `#7dcfff`, white head `#eafcff` |
| `needs` | Complete amber edge and inner glow breathe together. | `1.5s` ease-in-out pulse | `#e0af68` |
| `done` | Complete steady blue edge with no repeated pulse, followed by idle. | visible for `1.7s` | `#4c8dff` |
| `error` | Complete red/pink edge pulses with a sharper cadence than `needs`. | `1.1s` ease-in-out pulse | `#f7768e` |

Shared geometry is a `3px` sharp edge, approximately `26px` inward glow, `16px` corner radius, and a `350–500ms` color transition. The reference glow opacity is `0.40`. No label, pill, toast, text, icon, or decorative dashboard is part of the Windows overlay.

When multiple Jarvis activities overlap, the visible state uses the reference priority:

`needs > error > working > done > idle`

## Product behavior

The overlay is global, not confined to the VibeSpace window. It covers every connected monitor with one transparent overlay window per physical monitor.

- `working`: Jarvis is listening, interpreting, speaking, running a command, or executing an agent/task.
- `needs`: an authoritative permission, question, plan review, or other user decision is pending.
- `done`: the most recent active Jarvis operation completed successfully and no higher-priority state remains.
- `error`: the most recent active Jarvis operation failed and no `needs` state is pending.
- `idle`: no current or transient state is visible.

The overlay is projection only. It does not invent task truth, replace execution state, own approvals, or persist a second activity model.

## Architecture

### 1. Ambient state projection

A small frontend selector consumes existing authoritative VibeSpace state and produces a closed contract:

```ts
type JarvisAmbientState = 'idle' | 'working' | 'needs' | 'done' | 'error';

type JarvisAmbientSnapshot = {
  revision: number;
  state: JarvisAmbientState;
  source: 'voice' | 'approval' | 'question' | 'plan' | 'task' | 'agent' | 'command';
  observedAt: number;
  transientUntil?: number;
};
```

The selector applies the fixed priority and emits only when the resulting snapshot changes. `done` is transient for 1.7 seconds. `error` remains visible until superseded by new work, acknowledged through an existing product action, or explicitly cleared by the source authority. No model call participates in state selection.

### 2. Native overlay supervisor

A dedicated Tauri/Rust supervisor owns the Windows windows and current snapshot. It exposes narrow set/get/show/hide commands and publishes the latest versioned snapshot to every live overlay renderer.

For each connected monitor the supervisor creates one window with:

- transparent background;
- physical monitor bounds, including the taskbar edge;
- no decorations, taskbar entry, resize affordance, or shadow chrome;
- always-on-top and no-activation native styles;
- mouse click-through and no keyboard focus;
- a unique stable label derived from the monitor identity;
- no navigation authority beyond the packaged overlay route.

The supervisor reconciles monitor additions, removal, scale changes, orientation changes, renderer crashes, and VibeSpace resume. It never changes the foreground window. A failed renderer remains hidden rather than showing an opaque or white fallback window.

### 3. Packaged overlay renderer

The overlay uses a dedicated minimal React bootstrap and route, isolated from the main VibeSpace application tree. It renders only:

- the faint full-edge ambient field;
- the masked conic-gradient traveling segment for `working`;
- the sharp full-edge line;
- state transitions.

CSS custom properties hold the reference values. Animation remains compositor-friendly: opacity, filter, and a registered angle/transform drive motion; no per-frame React state or canvas readback occurs.

The renderer starts fully transparent and becomes visible only after receiving a valid snapshot and completing its first frame. Missing, malformed, stale, or unsupported snapshots fail closed to `idle`.

### 4. Reduced motion and power behavior

With reduced motion enabled:

- `working` becomes a steady faint cyan edge;
- `needs` and `error` become steady amber/red edges;
- `done` remains steady blue for 1.7 seconds;
- `idle` remains invisible.

When idle, animations are removed and overlay opacity is zero. Occluded/minimized main-app state must not start an animation loop unless a visible ambient state requires it. There is no daemon, downloaded model, or background polling loop.

## State flow

```text
Existing Jarvis/Voice/Task/Approval authorities
                    │
                    ▼
       deterministic ambient selector
                    │ versioned snapshot
                    ▼
        native Tauri overlay supervisor
                    │ replicated event
          ┌─────────┼─────────┐
          ▼         ▼         ▼
     monitor 1  monitor 2  monitor N
     renderer   renderer   renderer
```

Renderer acknowledgement is diagnostic only. It cannot mutate Jarvis task state.

## Fidelity and video workflow

The reference and implementation are recorded with the same fixed 1280×720 logical viewport and the exact website timeline:

- `0ms`: working
- `1400ms`: third agent enters working
- `3200ms`: needs
- `6000ms`: working
- `7600ms`: first agent done
- `8600ms`: error
- `10200ms`: third agent done
- `11000ms`: done
- `12700ms`: idle

The QA-only renderer fixture accepts an injected state clock so Playwright can freeze any timestamp deterministically. It is compiled out of ordinary production behavior and cannot be activated by user content.

Verification artifacts:

1. Playwright screenshots for all five static states.
2. A 30 fps frame sequence of the complete 12.7-second reference session.
3. A matching 30 fps frame sequence from the Windows renderer.
4. MP4 encodes of both sequences.
5. A side-by-side contact sheet at every transition plus working/needs/error pulse extrema.
6. Pixel-difference images cropped to the screen-edge region.

Visual acceptance requires:

- exact reference colors;
- transition boundaries within one 30 fps frame;
- sharp edge width within one logical pixel;
- radius and glow depth within two logical pixels;
- matching clockwise travel direction and segment profile;
- no added UI, white window, opaque background, or focus flash;
- zero console/page errors in all overlay renderers.

## Native acceptance

Official acceptance runs only in the real VibeSpace Tauri app, with Playwright attached to its actual WebView profile.

- Each monitor receives exactly one overlay window.
- Mouse clicks and wheel input reach the application beneath the overlay.
- Typing remains in the foreground application.
- Opening/closing VibeSpace surfaces never focuses an overlay.
- State changes remain synchronized across monitors.
- Display hot-plug and DPI changes reconstruct correct bounds without a white frame.
- Renderer recovery preserves the latest authoritative state.
- Idle CPU and GPU overhead are measured; no renderer performs work while idle.
- Reduced-motion behavior is verified.
- App shutdown closes every overlay process/window cleanly.

Windows borderless-fullscreen applications are supported. Exclusive-fullscreen games may render above ordinary desktop overlays; the product must not claim otherwise or use injection/game-hook techniques.

## Safety and accessibility

- The overlay never captures input, clipboard data, screenshots, window contents, or application identity.
- It never bypasses Windows focus, anti-cheat, protected-content, or exclusive-fullscreen boundaries.
- It contains no text necessary for understanding Jarvis; existing accessible status surfaces remain authoritative.
- High-contrast and reduced-motion settings suppress animation without changing application state.
- Native commands validate the caller window, enum values, monotonic revision, and bounded timestamps.

## Licensing

The upstream repository is MIT licensed. Any adapted CSS/state logic retains the required attribution and license notice in VibeSpace's third-party notices. VibeSpace owns the Windows host, state projection, tests, and integration code.

## Non-goals

- Replacing the Jarvis voice panel, orb, transcript, or controls.
- Adding a new task scheduler, agent runtime, approval system, or activity database.
- Adding labels, notifications, sound, or per-agent desktop widgets.
- Supporting game injection or guaranteed display above exclusive-fullscreen content.
- Downloading Omarchy, Quickshell, a model, or an external daemon.
- Automatically cycling effects in production.

## Implementation boundaries

The implementation plan must claim clean files in small milestones:

1. shared state contract, deterministic selector, and focused tests;
2. isolated renderer/bootstrap, reference CSS, and Playwright fixtures;
3. native Windows supervisor and monitor/click-through tests;
4. minimal integration with existing authorities;
5. official-native visual, input, recovery, performance, and video acceptance.

Active Voice, Pet, native-controller, CAO, Instant Command/Calyx, Chat, OpenCode, Schedule, and other owned files remain excluded until their owners release or explicitly hand off the exact required paths.
