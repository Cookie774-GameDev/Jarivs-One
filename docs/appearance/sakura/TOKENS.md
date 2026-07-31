# Sakura semantic token specification

`design-tokens.json` is the machine-readable Phase A proposal. It is not a production contract
until the gated SK0B implementation integrates it with the shared theme contract.

## Authoritative palette roles

| Role | Value | Allowed intent |
|---|---:|---|
| Night / Night2 | `#140E30` / `#232051` | strongest and secondary ink surfaces |
| Indigo / Periwinkle | `#2F2B71` / `#4E518A` | depth and secondary surfaces |
| Orchid / Lavender | `#916285` / `#A082AA` | atmospheric/accent support |
| Pink | `#EEABB7` | active and selected state |
| Coral | `#EF6F88` | primary action, not destructive |
| Peach | `#F5CEC8` | sky/pale control/highlight |
| Ivory | `#FFF7F2` | primary foreground |
| Gold | `#FFD978` | warning, attention, next action |
| Mint | `#9ED0B8` | success/online only |
| Derived destructive | `#B33A55` | destructive surface only |

## Future generic semantic mapping

Future Sakura CSS should be scoped under `html[data-theme='sakura']` and map existing generic
variables (`--background`, `--panel`, `--elevated`, `--border`, `--ring`, `--foreground`,
`--muted-foreground`, `--primary`, status variables, radii, and shadows). A dedicated Sakura
stylesheet may add scene/material variables, but components should consume semantics instead
of raw palette values.

Coral primary controls use dark Night text. Destructive controls use `#B33A55` with Ivory
(5.43:1) plus persistent destructive label/icon. On Night2 and Indigo, the destructive fill
edge alone fails 3:1, so a separate >=3:1 outline is required.

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
not optional polish. Exact gates are in `ACCESSIBILITY.md`.
