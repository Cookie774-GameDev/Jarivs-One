# Sakura accessibility contract

Status: measured token feasibility is complete; browser, assistive-technology, zoom, and
native evidence are pending.

## Thresholds

- Normal text AA: at least 4.5:1.
- Large text AA: at least 3:1 (24 CSS px regular or 18.66 CSS px bold).
- Essential component boundaries, focus indicators, and meaningful graphics: at least 3:1
  against adjacent colors.
- Never round 4.49 or 2.93 into a pass. Disabled/decorative content exemptions cannot be used
  for required information or state.

## Measured opaque pairs

| Foreground | Night | Night2 | Indigo | Periwinkle | Normal-text result |
|---|---:|---:|---:|---:|---|
| Ivory | 17.48 | 14.20 | 11.64 | 6.92 | AA all |
| Pink | 9.82 | 7.98 | 6.54 | 3.89 | fail Periwinkle |
| Coral | 6.43 | 5.23 | 4.28 | 2.55 | fail Indigo and Periwinkle |
| Gold | 13.61 | 11.06 | 9.06 | 5.39 | AA all |
| Mint | 10.72 | 8.71 | 7.14 | 4.24 | fail Periwinkle |
| Peach | 12.81 | 10.41 | 8.53 | 5.07 | AA all |
| Lavender | 5.52 | 4.49 | 3.68 | 2.19 | normal text only on Night |

Night text on Pink/Coral/Gold/Mint/Peach measures 9.82/6.43/13.61/10.72/12.81.

## Alpha text

Ivory at 0.64/0.70/0.72 measures:

- Night: 7.53/8.85/9.32
- Night2: 6.65/7.61/8.00
- Indigo: 5.74/6.54/6.82
- Periwinkle: 3.91/4.34/4.50

Exact minimum Ivory alpha for normal AA is 0.466 Night, 0.491 Night2, 0.537 Indigo, and 0.720
Periwinkle. Tertiary 0.42/0.46/0.48 reaches only 3.89/4.42/4.73 on Night,
3.67/4.13/4.36 on Night2, 3.35/3.72/3.91 on Indigo, and 2.59/2.79/2.92 on Periwinkle.
Essential copy must be promoted to a passing token.

## Material evidence

Night at 0.72/0.76/0.82/0.92 over reference Peach `#F6CBC4` composites to
`#534359`/`#4A3B54`/`#3D304B`/`#261D3C`. Ivory measures 8.57/9.70/11.52/14.99; Ivory at
0.64 measures 4.61/5.06/5.73/6.93. The 0.72 panel has little margin. Production must bound
the scene underlay or add a guaranteed dark scrim; a Peach-only measurement does not prove
arbitrary imagery.

Opaque Night/Night2/Indigo fallbacks with Ivory measure 17.48/14.20/11.64; with 0.64 Ivory
they measure 7.53/6.65/5.74.

## Destructive

Derived `#B33A55` with Ivory measures 5.43. Its fill edge is 3.22 against Night, 2.62 against
Night2, and 2.14 against Indigo. Require a separate Pink or Ivory outline on Night2/Indigo and
a persistent icon/text label. It is 2.00 against Coral and 3.05 against Pink, so hue alone
cannot communicate destruction. Coral remains primary and must never double as destructive.

## Keyboard, forced colors, and motion

- Preserve semantic controls, labels, radio behavior, focus order, Escape behavior, and
  minimum targets. Focus must be visible on every surface.
- Under `forced-colors: active`, allow system adjustment; map focus to `Highlight`, filled
  actions to `Highlight`/`HighlightText`, and ordinary surfaces/text to suitable
  `Canvas`/`CanvasText` system colors. Status retains text/icon meaning when authored hues are
  discarded.
- Under `prefers-reduced-motion: reduce`, set animation and transitions to none and
  `scroll-behavior:auto` for Sakura descendants and pseudo-elements. Decorative petals stop;
  final content/state appears immediately.
- Decorative scene and petals are `aria-hidden` and `pointer-events:none`. Pause scene motion
  when the document is hidden.

Future acceptance includes keyboard-only navigation, screen reader naming, 200% zoom, narrow
desktop, high contrast/forced colors, reduced motion, and Windows native verification. No such
browser/native pass is claimed here.
