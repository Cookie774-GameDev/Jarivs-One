# Website Changelog

## 2026-06-22 — Full marketing site rewrite

### What changed
Complete rewrite of `site/index.html` as the canonical VibeSpace marketing homepage, replacing the previous light paper-themed v0.1.42 page.

**Aesthetic shift:** Warm paper/cream light theme → "Cozy Cosmic Workshop" dark theme (warm near-black #0c0a08 with copper #d68a4e, sage #8fb87e, cyan #34d6e6, and plum #a472f0 accents). Film grain overlay. Four drifting radial orbs. Cursor-follow glow on pointer:fine devices.

**Typography:** System sans → Fraunces (display serif) + Inter (body) + JetBrains Mono (code). Distinctive editorial pairing, not generic SaaS.

**Content updates:**
- Version bumped v0.1.42 → v0.1.45 throughout (14 references)
- Added v0.1.45 features: unified skills catalog, Inspector panel, milestone-driven Kanban, terminal agent coordination
- Clarified Jarvis voice ≠ AI phone call (separate FAQ entry)
- Added Inspector & Kanban section
- Added pinned storytelling section ("From idea to shipped in four moves")
- Updated changelog teaser with v0.1.43–0.1.45 highlights
- Added Apex billing tier mention
- Removed all `#discord-placeholder` and `#youtube-placeholder` links (hidden via JS)

**Animation system (new — was only basic fade + breathe):**
- Hero headline word-stagger (80ms apart, expo ease)
- Subhead blur-to-sharp reveal
- CTA spring slide-up with overshoot
- Mac-style mock window with sequenced sidebar items + live terminal typewriter
- Four drifting background orbs on independent 18–24s timelines
- Cursor-follow radial glow (pointer:fine only)
- Scroll-triggered section reveals with kicker slide-left + H2 translateY
- Staggered card grid entrances (80ms per card, up to 9 cards)
- Pinned storytelling section with auto-advancing steps + clickable indicators
- Terminal swarm demo with staggered line reveals + blinking cursors
- Call-ring breathe + expanding pulse glow
- Agent council sequential hand-off entrance
- Provider chip hover color-shift + scale
- Nav blur intensifies on scroll + link underline grows from center
- Copy-to-clipboard morph (COPY → copied + sage color flash)
- FAQ accordion height + chevron rotate
- Parallax on orbs (rAF-throttled scroll-linked, max 15% movement)
- Full `prefers-reduced-motion: reduce` fallback (all animations disabled, content visible)

**Technical:**
- Split into `css/style.css` (25KB) + `js/motion.js` (9KB) + `index.html` (34KB)
- Vanilla JS + IntersectionObserver, zero dependencies, zero CDN animation libraries
- Google Fonts preconnect + display=swap
- OpenGraph + Twitter card meta tags
- SoftwareApplication JSON-LD structured data
- Semantic HTML5, single H1, proper heading order
- Mobile breakpoints: 520px, 560px, 620px, 760px, 860px, 960px, 980px
- Hamburger nav for <860px
- All external links use `rel="noopener"`
- `loading` not needed (no img below fold except logo)

**404 page:** Restyled to match dark theme, renamed "Jarvis" → "VibeSpace" in title, 3s redirect to home.

### Files changed
- `site/index.html` — complete rewrite (34KB)
- `site/css/style.css` — new (25KB)
- `site/js/motion.js` — new (9KB)
- `site/404.html` — restyled to match
- `ANIMATION-MAP.md` — new deliverable
- `CREATIVE-DIRECTION.md` — new deliverable

### Known limitation
The reference video (`Screen Recording 2026-06-22 080126.mp4`) was extracted to 12 frames via ffmpeg, but this build model lacks image-input capability and could not visually inspect them. The motion system was built from the prompt's Section 5 spec (a detailed frame-by-frame description likely authored from the same video) cross-referenced with `landing.html`'s implemented animation patterns. A human should verify the result against the video and adjust if any specific motion pattern is missing.
