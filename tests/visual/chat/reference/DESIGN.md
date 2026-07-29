# VibeSpace Origami Chat — Locked Design Specification

## Status

This file defines the approved visual system for **only the default VibeSpace Chat page**.

The canonical reference is:

`references/target-chat.png`

The reference image is the visual source of truth. The live repository is the functional source of truth.

After the implementation agent validates this specification against the reference, it should update only measured values that are demonstrably wrong, record the correction, and then treat this file as locked. Do not repeatedly regenerate the design system.

## Non-goals

This is not a global application theme.

Do not restyle Terminals, Kanban, Schedule, Benchmarks, History, Agents, Skills, Tools, Files, Settings, Account, Providers, Plugins, or unrelated modals.

Do not redesign features, add controls, remove controls, rename labels, hardcode dynamic content, replace real React controls with screenshots, or use the complete target image as a background.

## Design character

The page must look like a physical handcrafted desktop workspace assembled from layered paper:

- Warm cream paper canvas
- Slightly irregular cardstock panels
- Folded corners with visible triangular facets
- Paper fibers and grain on nearly every surface
- Narrow upper-left highlights
- Warm lower-right contact shadows
- Coral, lavender, sage, dusty-blue, peach, and gold paper accents
- Sculpted origami flower, foliage, crane, and ribbon artwork
- Tiny differences in depth that make surfaces feel physically stacked
- Printed dark-brown typography rather than neutral black
- Controls that look cut, folded, and raised rather than rounded SaaS pills

The result is rejected if it looks like an ordinary cream dashboard with rounded rectangles and basic CSS triangles.

## Canonical geometry

The reference viewport is exactly:

- Width: 1672 px
- Height: 941 px
- Device scale factor: 1
- Browser zoom: 100%

Read exact diagnostic regions from `reference-spec.json`.

The full screenshot remains authoritative. Crops are diagnostic tools only. A crop correction may never be accepted until the full page is recaptured and still improves.

## Initial sampled palette

These are starting values sampled from the target. Verify them with the provided palette script before final lock.

| Token | Initial value | Role |
|---|---:|---|
| `--paper-canvas` | `#f4d8be` | Main background paper |
| `--paper-panel` | `#f7ddc6` | Large cards and sidebar |
| `--paper-raised` | `#f9e1cb` | Raised strips, controls |
| `--paper-highlight` | `#fff1df` | Upper/left edge light |
| `--paper-edge` | `#d3b296` | Fold edges and borders |
| `--paper-shadow` | `#9d7970` | Warm contact shadow |
| `--ink-primary` | `#4b3120` | Primary printed text |
| `--ink-muted` | `#755842` | Secondary text |
| `--coral-primary` | `#fbae8e` | Active Chat, Agent Mode |
| `--coral-deep` | `#f0a280` | Coral fold depth |
| `--lavender-primary` | `#c5b0d2` | Ribbon, shortcut, accents |
| `--lavender-deep` | `#8e6fa4` | Deep lavender facets |
| `--sage-primary` | `#758766` | Foliage |
| `--sage-light` | `#a7b38d` | Foliage highlights |
| `--dusty-blue` | `#879eb7` | Leaf facets |
| `--gold-primary` | `#e6a04f` | Badge and small accents |
| `--status-green` | `#9fb667` | Idle badge |
| `--waveform-orange` | `#ef7f25` | Jarvis waveform |

Do not alter global theme tokens. Scope the tokens beneath the Chat page origami root.

## Material recipes

### Base canvas

The canvas needs at least four layers:

1. Warm base color
2. Fine low-opacity paper grain
3. Very soft directional gradient
4. Faint fibers or stains

Avoid high-contrast noise. Grain should be visible at 100% zoom but should not damage legibility.

### Raised paper surface

Every major raised surface should have:

- Fine paper grain
- 1–2 px bright top/left edge
- Thin paper-colored border
- Small contact shadow
- Larger warm diffuse shadow for floating cards
- Fold-corner overlays or a nine-slice frame

### Fold

A fold is not a single triangle. It should include:

- Main triangular plane
- Adjacent darker plane
- Narrow highlight on the crease
- Small occlusion shadow where the folded plane overlaps
- Consistent upper-left light direction

### Shadow hierarchy

- Contact: `0 2px 3px rgba(103,64,45,.20)`
- Raised: `0 7px 13px rgba(103,64,45,.25)`
- Floating: `0 11px 22px rgba(81,48,43,.28)`

Tune against the reference, but keep shadows warm. Do not use neutral black Material Design shadows.

## Page composition

### Header

- Approximate height: 79 px
- Warm paper strip spanning the page
- Coral and lavender folded ribbon across the top
- Existing top toolbar controls remain functional
- Existing buttons become compact raised paper tiles
- Workspace / Project breadcrumb becomes a folded paper strip
- Chat tab is a separate raised strip beneath the header

### Sidebar

- Approximate width: 334 px
- Layered cream paper column
- Individual folded navigation rows
- Active Chat row uses coral paper and stronger depth
- Preserve all existing labels, expand controls, plus controls, projects, chats, and agent entries
- Purple crane and left foliage are decorative layers with `pointer-events: none`

### Session panel

- Large raised panel near the top of the main canvas
- Six separate folded metric cards
- Preserve live values and handlers
- Idle badge uses sage paper
- Expand remains the existing control
- Strong lower contact shadow and clipped/folded corners

### User message

- Compact folded strip aligned to the right
- Dynamic text remains DOM content
- Warm paper and a subtle shadow

### Assistant message

- Avatar, name, age, model, and text remain live
- Message body sits in a large raised folded-paper card
- Thin colored left accent
- Paper grain, folded corners, and warm shadow

### Composer

- Wide raised paper tray fixed to the bottom layout
- Preserve textarea/input, model selector, Agent Mode, microphone, shortcut label, and send control
- Existing functionality and keyboard behavior remain untouched
- The purple shortcut key is paper, not a flat pill

### Jarvis voice/transcript module

Use the existing module and real handlers.

It must match:

- Top-right placement
- Folded paper frame
- Origami/star badge
- Jarvis heading
- Status line
- Orange waveform
- Microphone and close controls
- Transcript row
- Warm floating shadow

Do not create a duplicate or fake module.

## Decorative asset policy

Keep live UI in React/HTML.

Use extracted or generated transparent assets for:

- Top ribbon
- Purple crane
- Left foliage
- Bottom paper mountains
- Large lower-right flower
- Surrounding sage/lavender/blue leaves
- Complex fold overlays

The user-supplied reference may be used to extract these decorative assets. Do not use the full target screenshot as a page background.

Prefer:

- SVG for geometric scalable shapes
- Transparent WebP/PNG for detailed flower and foliage
- Nine-slice assets for scalable folded frames

All decorative layers must have:

```css
pointer-events: none;
user-select: none;
```

## Typography

- Dark brown ink rather than pure black
- Serif-like printed hierarchy for prominent headings
- Readable interface font for controls and metadata
- Do not bake live text into images
- Do not fetch remote fonts at runtime
- Reuse bundled/licensed fonts when available

## Interaction states

Hover, focus, active, disabled, and pressed states must preserve the paper material:

- Hover: slightly stronger highlight, no glowing neon
- Pressed: reduced lift and smaller shadow
- Focus: accessible outline that fits the palette
- Disabled: lower contrast but still tactile
- Active: coral paper layer, not a flat border-only state

## Responsiveness

The first acceptance target is exactly 1672 × 941.

After fidelity is strong there, check nearby desktop sizes. Do not redesign mobile behavior.

Decorations must not cover interactive controls at smaller desktop widths.

## Prohibited shortcuts

- Full-page screenshot background
- Static fake UI
- Hardcoded conversation values
- Global theme replacement
- Basic triangle-only decorations
- Generic rounded card system
- Unscoped selectors that alter other pages
- Remote image URLs
- Unnecessary architecture changes
- Broad dependency upgrades
