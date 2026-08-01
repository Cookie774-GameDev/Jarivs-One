# Sakura deterministic visual test plan

Status: the account-free real-app browser matrix passes 8/8. It produces evidence captures and
DOM/computed-style assertions; it intentionally makes no pixel-match claim.

## Implemented harness

The harness targets an externally owned loopback app at `http://127.0.0.1:5187` (or a validated
loopback override), starts no process, requires no account, blocks service workers, and uses
deterministic local/test-only state with real production components. It records the binding
reference path/hash in configuration and fixtures.

## Viewports and modes

Verified projects are 1440×900 and 1024×768 at DPR 1. Each runs normal representative routes,
reduced motion, forced colors, and ordinary/default-theme isolation. The previously proposed
1672×941, 1280×800, narrower desktop, high-DPI, and opaque-filter-fallback cases are not
claimed as captured.

## Capture matrix

The passing matrix has four tests in each of two projects:

1. Chat, Canvas, Kanban, Schedule, and Benchmarks composition/material/overflow.
2. Reduced-motion shell/scene preservation with petals suppressed.
3. Forced-colors route and visible-focus semantics with scenic dependency removed.
4. Default-theme isolation with no Sakura shell, scene, or petals.

This yields 8/8 test results and 16 named evidence captures. The broader route/surface inventory
in `ROUTE_MATRIX.md` remains useful for later exhaustive capture; the current matrix is
representative.

## Reference comparison

For the deterministic 1440×900 fixture, weight shell/scene 20%, top bar 8%, navigation 12%,
tabs 5%, central content 20%, messages 10%, composer 10%, inspector 10%, decoration 5%.
Track major edge delta, color delta, radius delta, fallback state, pixel diff, SSIM where
available, and manual review.

The implemented matrix checks composition hooks, nontransparent material, positive radius,
enhanced/static scene behavior, route selection, no Vite error overlay, and no horizontal
overflow. It uses ordinary screenshots as evidence but no `toHaveScreenshot` baselines.
Geometry-within-4px, Delta E, panel-radius delta, pixel diff, SSIM, and rendered-font
equivalence remain unmeasured goals. `preview.png` remains the full-page authority.

## Accessibility overlay

Reduced motion and forced colors have browser evidence as described above. Complete
keyboard-only traversal, 200% zoom/reflow, long-content/state coverage, screen-reader names,
native high contrast, and packaged Tauri behavior remain pending. Use `ACCESSIBILITY.md`
thresholds; never use visual similarity as a substitute.

## Evidence naming

Each artifact records commit SHA, platform/build, viewport/DPR, theme, route, state, mode,
timestamp, fixture ID, and command. Store only sanitized deterministic evidence. A missing or
unrun capture is `PENDING`, never `PASS`.
