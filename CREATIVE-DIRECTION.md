# Creative Direction — "Cozy Cosmic Workshop"

## Synthesis of three inputs
1. **Reference video** (motion ambition): staggered hero, orb drifts, terminal typewriter, scroll storytelling, card stagger, cursor glow, pinned section
2. **landing.html** (dark cinematic): purple/cyan/copper on near-black, floating orbs, cursor glow, terminal typewriter, chip hovers
3. **index.html** (warm editorial): paper/cream/copper/sage, serif headlines (Iowan Old Style), "Built by a vibe coder" maker tone, install one-liner with copy

## Chosen aesthetic
**Full dark with warm copper accents** — "cozy cosmic workshop." Dark base (not pure black, warm-tinted #0c0a08) with copper #B5613A/#D68A4E as primary accent, sage #6F8F66 and cyan #34D6E6 as secondary. Film grain overlay. Layered radial orb lights (copper, sage, cyan, plum) drifting. Editorial serif for H1/H2 (Fraunces — distinctive, free, variable). Body in Inter (clean, available). Mono in JetBrains Mono / ui-monospace.

**Why dark:** landing.html's motion vocabulary (orbs, glow, typewriter) only sings on dark. The video's reference motion implies cinematic dark. Warm copper prevents "cold enterprise."

## Color tokens
```
--bg: #0c0a08          (warm near-black)
--bg-2: #14110d        (raised surface)
--panel: #1a1612       (card)
--panel-2: #221d17     (hover/raised)
--border: #2e2820      (subtle)
--border-glow: #4a3d2e (hover)
--fg: #f5efe6          (warm white)
--muted: #a89e90       (warm gray)
--faint: #6b6357
--copper: #d68a4e      (primary accent — brighter for dark bg)
--copper-deep: #b5613a
--copper-glow: rgba(214,138,78,0.35)
--sage: #8fb87e        (secondary — brightened)
--cyan: #34d6e6        (secondary — terminal/tech)
--plum: #a472f0        (tertiary — agent/council)
--amber: #e8a96b
```

## Typography
- **Display (H1/H2):** Fraunces (Google Fonts, variable, optical sizing) — warm serif with character, not generic
- **Body:** Inter (Google Fonts) — clean, legible
- **Mono:** JetBrains Mono (Google Fonts) — for terminal/code
- Scale: H1 clamp(44px,7vw,84px), H2 clamp(30px,4.5vw,52px), H3 20px, body 16px, lead 19px

## Spacing / radii / shadows
- Radius: cards 18px, buttons 999px (pill), code 12px, window 14px
- Shadow-soft: 0 2px 8px rgba(0,0,0,.3), 0 12px 40px rgba(0,0,0,.2)
- Shadow-glow: 0 0 0 1px var(--copper-glow), 0 20px 60px -20px var(--copper-glow)
- Section padding: 88px 24px; max-width 1200px

## Motion tokens
```
--ease-out-expo: cubic-bezier(0.16,1,0.3,1)
--ease-spring: cubic-bezier(0.34,1.56,0.64,1)
--ease-out: cubic-bezier(0.22,1,0.36,1)
--dur-fast: 180ms
--dur-base: 400ms
--dur-slow: 700ms
--dur-hero: 900ms
--stagger-card: 80ms
--stagger-word: 80ms
```

## Component list
- `btn` (primary copper, ghost, dark) — hover lift + shadow bloom, active scale 0.98
- `card` — border-glow on hover, translateY(-4px)
- `chip` (provider) — hover color shift + scale 1.04
- `mock-window` — Mac chrome, sidebar sequence, terminal typewriter
- `code-pill` — install command + copy button with morph
- `nav` — blur backdrop, intensifies on scroll, link underline from center
- `orb` — radial gradient, float keyframes, blur(80px)
- `call-ring` — breathe + glow pulse
- `faq details` — height transition + chevron rotate

## Emotional target
A warm workshop at night: ten AI agents, terminals, and voice working together around a copper-lit table. Alive, not sterile. Premium, not corporate. Maker-built, not template.

## Page load sequence
- 0–300ms: dark bg + orbs settle (orbs animate from scale 0.8→1)
- 300–900ms: nav + logo fade in
- 900–1800ms: hero headline stagger + subhead blur + CTA spring + mock chrome draw
- No white flash ever — themed background on first paint


## VibeSpace appearance (vibespace)

Selectable skin under `data-theme='vibespace'` only. Locked origami palette: cream paper-0/1/2, coral primary, lavender/sage/sky support, wood/ink structure. Styles live in `app/src/styles/vibespace-theme.css`; production site shares tokens via `site/css/origami-paper.css`. Does not alter Dark/Light/Jarvis token blocks.

