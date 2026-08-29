# Workbench Renderer Optimization Implementation Plan

1. Add failing tests that count panel renders during camera-only movement and verify frame-coalesced pointer/wheel updates flush the exact final camera.
2. Memoize the Workbench panel boundary with shallow prop equivalence using the existing stable panel/handler identities.
3. Add a canvas-local animation-frame camera scheduler with pointer-up flush and unmount cleanup.
4. Add minimap bounds equivalence cases, then replace multi-map/spread aggregation with a single pass.
5. If the full Workbench matrix exposes a reproducible existing blocker, prove it in isolation and apply only the smallest behavior-preserving correction within released scope.
6. Run focused and full Workbench tests, TypeScript/build checks, formatting, diff/security checks, and commit only claimed files.
7. Append the final coordination checkpoint and release only this task lock.
