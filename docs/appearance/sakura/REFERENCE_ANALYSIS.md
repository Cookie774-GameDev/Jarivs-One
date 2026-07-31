# Sakura Dusk reference analysis

## Visual thesis

**Authoritative:** Sakura is a calm, cel-painted dusk workspace, not a generic pink theme and
not traditional minimalist “Japan” branding. Five to seven broad layers move from peach sky
through orchid/lavender atmosphere into indigo water and Night Ink foreground. Crisp
silhouettes carry structure; blur belongs only to fog, distant light, and glow.

**Observed:** The 1440×900 shell uses a 14px inset, 24px outer radius, 48px top bar, 226px
expanded/64px collapsed prototype navigation, 40px tabs, and 278px inspector. The prototype
breaks at 1120px (inspector removed) and 920px (collapsed navigation) and declares an 880×600
minimum. These are reference measurements, not permission to replace production geometry.

## Palette and material

The exact palette is Night `#140E30`, Night2 `#232051`, Indigo `#2F2B71`, Periwinkle
`#4E518A`, Orchid `#916285`, Lavender `#A082AA`, Pink `#EEABB7`, Coral `#EF6F88`, Peach
`#F5CEC8`, Ivory `#FFF7F2`, Gold `#FFD978`, and Mint `#9ED0B8`.

**Observed:** Night panels use 0.72–0.92 alpha, soft Ivory surfaces use 0.05–0.11, borders use
Ivory-like `#FFEFF1` at 0.19 or 0.32, compact/card/feature radii are 9–12/16/23px, blur is
14–18px, and shadows are broad indigo rather than sharp black. Pink marks selection, Coral
primary action, Gold next/attention, and Mint success/online only.

**Measured constraint:** the reference border alphas are decorative. They do not reach 3:1
against the core dark surfaces. Essential control boundaries and focus must use separate,
stronger semantic tokens described in `ACCESSIBILITY.md`.

## Typography

Production already bundles Fraunces, Plus Jakarta Sans, Inter, and JetBrains Mono. Use
Fraunces sparingly for emotional headings, Plus Jakarta Sans or Inter for interface copy,
JetBrains Mono only for terminal/technical data, and narrow uppercase sans treatment for
section labels. Do not add a remote font. Terminal content remains terminal-owned and is not
recast as serif.

## Components and routes

The prototype demonstrates Chat, Workbench, Terminals, Kanban, and Schedule with a consistent
three-pane shell. It is useful for panel hierarchy, active-state logic, composer treatment,
route density, and restrained scene continuity. Its mock counts, conversations, provider
states, actions, and JavaScript handlers are not production inputs.

The production repository is richer than the prototype. It owns routing, state, voice,
terminal, browser, account, billing, access, and persistence behavior. Future Sakura styling
must use existing semantic variables and production components; see `component-mapping.md` and
`ROUTE_MATRIX.md`.

## Motion

**Observed:** the prototype creates 24 random petals with 13–25 second falls, 180–280ms-style
control transitions, glow, and a reduced-motion rule that suppresses petals and compresses
animation duration. **Derived production rule:** use deterministic sparse decoration, pause
when hidden, and eliminate all nonessential animation/transition under reduced motion while
leaving final content visible.

## Explicit exclusions

- Only Sakura Dusk ships; no Wisteria, Lantern Mist, or Sakura sub-theme selector.
- No external or reference artwork is copied.
- No decorative kanji without known meaning and appropriate context.
- No random blossoms, torii clichés, generic red/white branding, or pale-pink text wash.
- VibeSpace/Origami remains independently scoped; Sakura must never activate Origami assets.
- Remote provider content, user Canvas content, terminal content, and Pixel Pet transparency
  remain functionally and visually isolated.

Browser pixel matching, rendered font comparison, crop analysis, and production screenshots
are **pending**, not implied by this source analysis.
