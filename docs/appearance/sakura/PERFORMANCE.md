# Sakura performance contract

Status: budgets are derived acceptance gates; no production trace has been captured.

## Budgets

- Do not add a runtime or font dependency.
- Prefer one optimized SVG scene host over per-component decoration.
- Keep five to seven broad layers, bounded path count, and no unbounded particle creation.
- Petals are sparse, deterministic, transform/opacity only, and paused when hidden.
- Avoid layout-affecting animation. Scene and material changes must not remount cached routes.
- Limit blur to a small number of large atmosphere/glow layers; opaque fallback must be usable
  when backdrop/filter support is absent or disabled.
- Avoid base64 noise when a tiny CSS/static approach suffices; no network fetch at runtime.
- Do not add scene work to remote webviews, terminal rendering, or user Canvas content.

## Future evidence

Capture a production performance trace at 1440×900 and a high-DPI/narrow case with Sakura
idle, route transition, sidebar/inspector transition, and reduced motion. Record CPU, GPU/frame
timing, memory, layout shift, long tasks, layer count, asset decoded size, and hidden-document
behavior. Compare against the same build/theme-neutral fixture before Sakura.

Acceptance requires no sustained idle animation cost, no route-state loss, no clipping or
layout shift, and no material regression when filters are unavailable. Numerical performance
limits must be set from the pre-Sakura baseline; Phase A does not invent a pass target.
