# Sakura scenic architecture

Status: SK2 production scenic host and original local vector asset are active;
later route/component styling and performance traces remain pending.

## Production boundary

The Sakura-only scene host is mounted beside, not inside, route content. It:

- mounts only when resolved document theme is `sakura`;
- is `aria-hidden`, inert, and `pointer-events:none`;
- sits below production shell/content and never covers portals, focus rings, or Pixel Pet;
- exposes bounded route intensity without reading or changing route data;
- unmounts cleanly on every other theme;
- pauses nonessential work when the document is hidden; and
- renders an opaque Night fallback before optional SVG, transparency, blur, or grain.

The host boundary is `app/src/components/layout/AppShell.tsx`; its pure scene,
petal, visibility, performance, and route-intensity implementation is under
`app/src/features/appearance/sakura/`. Scenic selectors remain Sakura-root
scoped in `app/src/styles/sakura-theme.css`.

## Layer model

1. peach-to-orchid sky;
2. pale distant mountains;
3. lavender ridge;
4. restrained tree silhouettes;
5. indigo water or mist;
6. Night Ink foreground;
7. optional small pavilion/lantern and sparse petals.

The shipped `sakura-scene.svg` uses seven original, optimized broad-shape
vector groups with the frozen `0 0 1920 1080` / `xMidYMid slice` crop. The
reference palette and depth recipe informed it, but no prototype path geometry,
screenshot, mock/runtime content, or text was copied. Exact provenance, bytes,
and SHA-256 are frozen in `asset-manifest.json`. Decorative layers do not
influence layout or accessible name computation.

## Intensity

Route intensity is a presentation enum, not a route replacement:

- `quiet`: dense/technical/settings/account/terminal surfaces;
- `standard`: most routes;
- `open`: Chat landing or deterministic visual fixture only.

Unknown routes default to `quiet`. Cached Terminal, Canvas, Preview, and Browser surfaces must
not remount or lose state because scene intensity changes.

## Fallbacks and isolation

- Opaque passing background first; enhanced alpha/blur inside feature queries only.
- No `mix-blend-mode` or backdrop support may be required for legibility.
- No scene inside remote provider webviews or user Canvas content.
- Pet overlay view remains transparent and receives no Sakura body/scene background.
- Reduced motion removes petals and all scene transitions; forced colors removes scenic
  dependency and preserves system-color controls.

Performance budgets and verification are defined in `PERFORMANCE.md` and
`VISUAL_TEST_PLAN.md`.
