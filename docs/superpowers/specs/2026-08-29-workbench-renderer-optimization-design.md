# Workbench Renderer Optimization Design

## Goal

Reduce Workbench input latency and renderer CPU without changing its UI, panel behavior, native routing, persistence schema, or feature set.

## Approved scope

- Prevent unchanged panel subtrees from rendering during camera-only translation.
- Coalesce high-frequency camera input to at most one store write per animation frame while preserving the final pointer/wheel position.
- Replace allocation-heavy minimap bounds aggregation with an equivalent single-pass calculation.
- Add regression coverage for final camera state, cancellation/flush behavior, panel render isolation, and geometry equivalence.

## Invariants

- Panel DOM, controls, accessibility, drag/resize/minimize/close semantics, selection, zoom, and minimap behavior remain unchanged.
- Panel object or selection/zoom changes still render the affected panel.
- Pointer release flushes the most recent pan position even when its frame has not run.
- Wheel deltas accumulate within a frame instead of being dropped.
- No store, persistence, wallpaper, CSS, native command, or native-runtime change is included in this slice. A bounded BrowserPanel desired-URL reconciliation repair is allowed if the full matrix proves it is required to preserve working navigation.
- Verification is offline only; VibeSpace is not started.

## Architecture

`WorkbenchPanel` becomes a memoized boundary. Existing stable handler objects and stable panel references allow translation-only canvas renders to stop at that boundary. The canvas owns a small requestAnimationFrame scheduler for camera patches. Pan events replace the pending absolute position; wheel events accumulate deltas against the latest pending/current camera. Pointer-up and unmount synchronously flush or cancel pending work as appropriate.

Minimap bounds are calculated in one pass over panels and extras, preserving minimum dimensions, minimized height, padding, and empty-state behavior exactly.

The Browser panel keeps its render-driven native bounds path. Its desired URL is updated only by navigation and prop synchronization, preventing a temporarily stale parent prop from overwriting an in-flight native navigation.

## Verification

Focused tests prove render isolation and exact final camera output under coalesced pointer/wheel input. Existing Workbench canvas, panel, minimap, browser, preview, persistence, and wallpaper tests protect behavior. TypeScript, production build, formatting, diff, staged scope, and secret scanning gate the commit.
