# Sakura semantic token specification

Status: production token, scene, shared primitive, shell, route, and overlay presentation is
implemented.

`design-tokens.json` is the machine-readable palette and contrast authority integrated by the
shared theme contract. The exact-root-scoped stylesheet applies those semantics to the scene,
bounded materials, shared primitives, shell, representative routes, and overlays. Browser
evidence is bounded to the deterministic 8/8 real-app matrix; it does not establish pixel-diff
equivalence or native behavior. Native, assistive-technology, zoom, and performance evidence
remain pending.

The JSON keeps the prototype’s observed `sceneGradient` separate from the active
`productionSceneGradient`, which uses approved palette tokens rather than silently rewriting
reference provenance.

## Authoritative palette roles

| Role                |                 Value | Allowed intent                       |
| ------------------- | --------------------: | ------------------------------------ |
| Night / Night2      | `#140E30` / `#232051` | strongest and secondary ink surfaces |
| Indigo / Periwinkle | `#2F2B71` / `#4E518A` | depth and secondary surfaces         |
| Orchid / Lavender   | `#916285` / `#A082AA` | atmospheric/accent support           |
| Pink                |             `#EEABB7` | active and selected state            |
| Coral               |             `#EF6F88` | primary action, not destructive      |
| Peach               |             `#F5CEC8` | sky/pale control/highlight           |
| Ivory               |             `#FFF7F2` | primary foreground                   |
| Gold                |             `#FFD978` | warning, attention, next action      |
| Mint                |             `#9ED0B8` | success/online only                  |
| Derived destructive |             `#B33A55` | destructive surface only             |

## Activated generic semantic mapping

Sakura CSS is scoped under `html[data-theme='sakura']` and maps existing generic variables
(`--background`, `--panel`, `--elevated`, `--border`, `--ring`, `--foreground`,
`--muted-foreground`, `--primary`, status variables, radii, and shadows). The dedicated
stylesheet also exposes bounded material variables, while components consume semantics instead
of raw palette values.

Coral primary controls use dark Night text. Destructive controls use `#B33A55` with Ivory
(5.43:1) plus persistent destructive label/icon. On Night2 and Indigo, the destructive fill
edge alone fails 3:1, so a separate >=3:1 outline is required.

## Active material authority

- Main panels use 76% Night2 and strong elevated panels use 91% Indigo, with an opaque semantic
  fill declared first and 14px backdrop blur added only through feature detection.
- Soft cards use 7% Ivory mixed over Night2 when `color-mix()` exists; the preblended opaque
  `#322F5C` fallback is the first declaration.
- Decorative hairlines use 19% or 32% Ivory. Essential controls use at least 39%; destructive
  boundaries use 52%.
- Grain is a local CSS-gradient overlay at 8% opacity. There are no remote fonts, images, or
  imports in the Sakura stylesheet.
- Radius authority is 10–12px for compact controls, 16px for standard large surfaces, 23px for
  feature surfaces, and 24px for shell-scale geometry.
- Section labels are 10px, weight 700, with `0.12em` tracking. Hover lift is capped at 1px and
  calm transitions are 180–220ms.

## Alpha and boundary rules

- Secondary Ivory may be 0.64 on Night, Night2, and Indigo; on Periwinkle it must be at least
  0.72 (exact measured 4.50, so opaque Ivory is preferred where composition may vary).
- 0.40–0.48 tertiary Ivory cannot carry essential normal text across the palette.
- Reference strokes at 0.19/0.32 are decorative only. Minimum essential Ivory-stroke alphas
  are 0.353 Night, 0.360 Night2, 0.390 Indigo, and 0.511 Periwinkle.
- Normal text and essential boundaries may never rely on an unknown image underlay.

## Fallback and modes

Declare an opaque passing fill before any `backdrop-filter`, alpha material, blend, or
`color-mix()` enhancement. Forced-colors and reduced-motion behavior are independent modes,
not optional polish. The 64% Pink selection wash with Night text measures 4.63:1 after
compositing. Exact gates are in `ACCESSIBILITY.md`.
