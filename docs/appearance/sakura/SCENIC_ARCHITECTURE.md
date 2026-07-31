# Sakura scenic architecture

Status: derived future architecture; no asset, host, or runtime exists in Phase A.

## Proposed boundary

Create a future Sakura-only scene host mounted beside, not inside, route content. It must:

- mount only when resolved document theme is `sakura`;
- be `aria-hidden`, inert, and `pointer-events:none`;
- sit below production shell/content and never cover portals, focus rings, or Pixel Pet;
- expose bounded route intensity without reading or changing route data;
- unmount cleanly on every other theme;
- pause nonessential work when the document is hidden; and
- render an opaque Night fallback before optional SVG, transparency, blur, or grain.

Likely future seams are `app/src/components/layout/AppShell.tsx` for the host boundary, a new
theme-scoped feature under `app/src/features/appearance/` or a narrowly owned Sakura feature,
and a future `app/src/styles/sakura-theme.css` imported after generic styles. These paths are
proposals, not authorized writes.

## Layer model

1. peach-to-orchid sky;
2. pale distant mountains;
3. lavender ridge;
4. restrained tree silhouettes;
5. indigo water or mist;
6. Night Ink foreground;
7. optional small pavilion/lantern and sparse petals.

Use original, optimized vector shapes. Do not copy reference artwork or the prototype file
wholesale. Keep shape count and filters bounded; blur only fog/glow/distant atmosphere.
Decorative layers must not influence layout or accessible name computation.

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
