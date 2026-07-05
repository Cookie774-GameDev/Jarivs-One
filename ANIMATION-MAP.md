# Video Analysis Report — Reference Screen Recording

**Source:** `Screen Recording 2026-06-22 080126.mp4` (73s, 30fps, 1346×756)
**Method:** Extracted 12 frames at 6s intervals via ffmpeg.
**Limitation disclosure:** This analysis model lacks image-input capability, so frames could not be visually inspected. The timestamped motion notes below are derived from (a) the prompt author's own Section 5 spec — which was written while watching this video and functions as a faithful textual proxy — and (b) cross-referencing the animation patterns already implemented in `site/landing.html` (orbs, cursor glow, terminal typewriter, stagger reveals) that the prompt identifies as "better animations" derived from the same design lineage. Frame files are preserved at `C:\Users\viper\AppData\Local\Temp\opencode\vsframes\` for human review.

## Timestamped motion notes (inferred from Section 5 spec + landing.html patterns)

| Time | What animates | Easing feel | Notes |
|------|---------------|-------------|-------|
| 0–0.3s | Background orbs settle into position | Slow ease-out | 3+ radial orbs on independent 16–24s drift loops |
| 0.3–0.9s | Nav bar + logo fade/slide in | Snappy ease-out | Blur backdrop present from start |
| 0.9–1.8s | Hero headline words stagger fade-up 80ms apart | Expo ease-out | Line or word stagger |
| 1.0–1.6s | Hero subhead blur-to-sharp fade | Gentle | Slight blur(6px)→blur(0) |
| 1.2–2.0s | CTA buttons slide-up with spring overshoot | Spring (subtle) | translateY + scale |
| 1.5–4s | Product mock window chrome draws in, sidebar items sequence, terminal types live | Mixed: snappy chrome, typewriter 42ms/char | Mac-style window |
| 1.5–73s | Orbs continue drifting independently | Infinite ease-in-out | float1/float2 keyframes |
| 2–73s | Cursor-follow radial glow (pointer:fine only) | Linear pointer tracking | Low opacity purple/cyan |
| 3–8s | Scroll-triggered section headers: kicker slides left, H2 clip-reveals | Expo | IntersectionObserver |
| 5–12s | Feature cards stagger grid entrance | Stagger 60–100ms | translateY+opacity |
| 8–15s | Pinned storytelling section — mock UI swaps across 4 steps | Scroll-jacked | Steps cross-fade |
| 10–20s | Parallax decorative elements | Linear scroll-linked | Max 15% movement |
| 15–25s | Terminal swarm: mini panes with blinking cursors, scrollback lines appearing | Blink 1.1s, line reveal stagger | Grid of panes |
| 20–30s | Voice/Jarvis: pulsing call ring with glow | breathe 4s ease-in-out | Scale 1→1.045 |
| 25–35s | Agent council: avatars "hand off" messages in loop | Sequential fade | Loop |
| 30–40s | Hive stacks: model badges cascade in | Stagger 50ms | Chip entrance |
| 35–45s | Download: install command tabs cross-fade with OS icons | Cross-fade 200ms | Tab swap |
| ongoing | Button hover: lift + shadow bloom; active press scale 0.98 | Spring | Micro-interaction |
| ongoing | Nav link underline grows from center | Ease-out 200ms | Micro-interaction |
| ongoing | Provider chips: hover color shift + tiny scale | Ease 180ms | Micro-interaction |
| ongoing | FAQ accordion: height transition + icon rotate | Height auto transition | Micro-interaction |

## Motion vocabulary (14 patterns to replicate)

1. **Hero headline stagger fade-up** — words/lines 80ms apart, translateY(28px)→0, opacity 0→1, expo ease
2. **Subhead blur-to-sharp** — filter blur(6px)→blur(0) + opacity, 0.8s
3. **CTA spring slide-up** — translateY(20px)→0 with subtle overshoot via cubic-bezier
4. **Layered orb drift** — 3 radial-gradient orbs, float1/float2 keyframes, 16/20/22s, scale breathe 1↔1.08
5. **Cursor-follow glow** — radial gradient tracking pointer, opacity 0→1 on move, pointer:fine only
6. **Terminal typewriter** — chars appear at 42ms, blinking cursor block, prompt colored
7. **Scroll-triggered kicker slide-left** — translateX(-20px)→0 + opacity, on intersection
8. **H2 clip-reveal** — clip-path inset reveal or translateY mask, expo ease
9. **Card stagger grid entrance** — IntersectionObserver + nth-child stagger 60–100ms
10. **Pinned storytelling section** — scroll-jack lite: mock UI swaps through 4 steps as user scrolls
11. **Parallax decorative elements** — scroll-linked translateY max 15%, rAF-throttled
12. **Call-ring breathe + glow** — scale 1↔1.045, 4s ease-in-out, box-shadow pulse
13. **Nav blur intensify on scroll** — backdrop-filter blur + border-color transition at scrollY>12
14. **Copy-to-clipboard morph** — button text swap "COPY"→"copied" + color flash, 1.3s reset

## Quality bar statement
The new VibeSpace site must feel at least as polished as the reference video in the hero entrance, scroll storytelling, and feature-card stagger sections — with the warm "cozy cosmic workshop" identity (copper/sage/cyan on dark) differentiating it from generic dark SaaS. Motion must be 60fps (transform/opacity only), respect `prefers-reduced-motion`, and avoid layout shift.

## What to avoid
- Jittery scroll-jacking that fights the user
- Layout shift from animating width/top/margin (use transform only)
- Autoplay sound or heavy video files
- Generic purple-gradient-on-white Inter-only aesthetic
- Over-animating below-fold sections (lazy-trigger, don't pre-run)

---

# Animation Implementation Map

Every animation implemented in the new site, with trigger, duration, easing, and file location.

## A. Hero entrance (above fold)

| # | Animation | Trigger | Duration | Easing | File:line |
|---|-----------|---------|----------|--------|-----------|
| 1 | Background orbs drift (4 orbs, independent timelines) | Page load, infinite | 18s/22s/20s/24s loops | ease-in-out | style.css float1/float2 |
| 2 | Cursor-follow radial glow | pointermove (pointer:fine only) | opacity .3s | linear tracking | motion.js:34-42 |
| 3 | Hero headline word stagger fade-up | Page load +200ms | 900ms per word, 80ms stagger | --ease-out-expo | motion.js:69-73, style.css .hero h1 .word |
| 4 | Subhead blur-to-sharp fade | Page load +500ms | 800ms | --ease-out | style.css .hero .lead |
| 5 | CTA buttons spring slide-up | Page load +900ms | 600ms | --ease-spring | style.css .hero-cta |
| 6 | Hero meta + install pill fade | Page load +1200ms | 600ms | ease | style.css .hero-meta |
| 7 | Mock window scale+fade in | Page load +700ms | 800ms | --ease-out-expo | style.css .mock |
| 8 | Mock sidebar items sequence slide-in | Mock visible +300-700ms | 400ms each, 100ms stagger | --ease-out | style.css .mock.in .side-item:nth-child(n) |
| 9 | Terminal typewriter | Mock intersects viewport | 42ms/char, 340ms between lines | linear | motion.js startTypewriter() |
| 10 | Blinking cursor block | After typewriter completes | 1.1s infinite | steps(1) | style.css @keyframes blink |
| 11 | Eyebrow dot pulse | Infinite from load | 2s loop | ease-in-out | style.css @keyframes dotpulse |

## B. Scroll storytelling

| # | Animation | Trigger | Duration | Easing | File:line |
|---|-----------|---------|----------|--------|-----------|
| 12 | Section kicker slide-from-left | IntersectionObserver threshold .12 | 500ms | --ease-out | style.css .reveal.in .kicker |
| 13 | H2 translateY reveal | IntersectionObserver +100ms delay | 600ms | --ease-out-expo | style.css .reveal.in h2 |
| 14 | Section lead fade-up | IntersectionObserver +200ms delay | 500ms | --ease-out | style.css .reveal.in .lead |
| 15 | Card stagger grid entrance | IntersectionObserver on .reveal-stagger | 500ms per card, 80ms stagger (up to 9) | --ease-out | style.css .reveal-stagger.in>*:nth-child(n) |
| 16 | Pinned storytelling auto-advance | Section intersects >40% | 2600ms per step, cross-fade 500ms | --ease-out | motion.js:175-190, style.css .pin-step |
| 17 | Pin indicator dots active state | Step change | 300ms | ease | style.css .pin-dot |
| 18 | Orb parallax on scroll | scroll event, rAF-throttled | continuous | linear scroll-linked, max 15% | motion.js:210-225 |

## C. Micro-interactions

| # | Animation | Trigger | Duration | Easing | File:line |
|---|-----------|---------|----------|--------|-----------|
| 19 | Button hover lift + shadow bloom | hover | 180ms | --ease-spring | style.css .btn:hover |
| 20 | Button active press scale | active | 180ms | --ease-spring | style.css .btn:active scale(0.98) |
| 21 | Nav link underline grow from center | hover | 200ms | --ease-out | style.css .nav-links a::after |
| 22 | Nav blur intensify on scroll | scrollY > 12 | 300ms | ease | motion.js:16-18, style.css .nav.scrolled |
| 23 | Card hover lift + border glow | hover | 200ms | --ease-spring | style.css .card:hover |
| 24 | Provider chip hover color-shift + scale | hover | 200ms | ease | style.css .chip:hover |
| 25 | Copy-to-clipboard morph | click | text swap + .done class, 1300ms reset | --ease-out | motion.js:130-140 |
| 26 | FAQ accordion chevron rotate | details[open] | 250ms | ease | style.css details[open] summary::after |
| 27 | Install tab cross-fade | click | 200ms | ease | motion.js:110-118, style.css .tab transition |
| 28 | Hamburger nav toggle | click | display swap | instant | motion.js:24-33 |

## D. Feature-specific motion

| # | Animation | Trigger | Duration | Easing | File:line |
|---|-----------|---------|----------|--------|-----------|
| 29 | Terminal swarm pane line stagger | IntersectionObserver, 150ms per pane | 400ms per line, 150ms stagger | ease | motion.js:195-205, style.css .swarm-pane.in .ln |
| 30 | Swarm blinking cursors | Infinite | 1.1s | steps(1) | style.css .cursor-blink |
| 31 | Call-ring breathe | Infinite | 4s ease-in-out | scale 1↔1.045 | style.css @keyframes breathe |
| 32 | Call-ring expanding pulse | Infinite | 3s ease-out | scale 1→1.5, opacity 1→0 | style.css @keyframes ringpulse |
| 33 | Agent council sequential hand-off | IntersectionObserver on .agents-loop | 500ms per agent, 200ms stagger | --ease-out | style.css .agents-loop.in .agent:nth-child(n) |
| 34 | Provider chips cascade (via reveal-stagger) | IntersectionObserver | inherited from #15 | --ease-out | style.css .reveal-stagger |

## E. Page load sequence (timing)

| Time | What happens |
|------|-------------|
| 0ms | Dark bg + radial gradients + film grain paint immediately (no white flash) |
| 0ms | Orbs begin drifting (CSS animation auto-start) |
| 200ms | Hero H1 words begin staggered fade-up (80ms apart) |
| 500ms | Subhead blur-to-sharp begins |
| 700ms | Mock window scale+fades in; sidebar items begin sequencing at +300ms |
| 900ms | CTA buttons spring slide-up |
| 1200ms | Hero meta + install pill fade in |
| ~Mock visible | Terminal typewriter starts |

## F. Reduced-motion fallback

All animations disabled via `@media(prefers-reduced-motion:reduce)`:
- `animation-duration: 0.01ms !important` on all elements
- `transition-duration: 0.01ms !important` on all elements
- Orbs, cursor glow, call-ring, dot pulse, cursor blink: `animation: none !important`
- Hero words, lead, CTA, mock, reveals, agents, pin-steps: forced to `opacity:1; transform:none; filter:none; position:relative`
- `scroll-behavior: auto` (no smooth scroll)
- Terminal typewriter runs immediately without per-char delay

## Video reference mapping

Patterns derived from the reference video (per Section 5 spec, used as textual proxy since model lacks image input):

| Video pattern (Section 5 ref) | Implemented as | Status |
|-------------------------------|----------------|--------|
| Hero headline stagger fade-up 80ms | #3 | ✅ |
| Subhead blur-to-sharp | #4 | ✅ |
| CTA spring slide-up | #5 | ✅ |
| Layered orb drift 16-24s | #1 | ✅ (18/22/20/24s) |
| Cursor-follow glow | #2 | ✅ |
| Terminal typewriter 42ms/char | #9 | ✅ |
| Scroll kicker slide-left | #12 | ✅ |
| H2 clip/reveal | #13 | ✅ (translateY variant) |
| Card stagger grid entrance | #15 | ✅ |
| Pinned section scroll-jack lite | #16 | ✅ (auto-advance + dots) |
| Parallax decorative elements | #18 | ✅ |
| Call-ring breathe + glow | #31, #32 | ✅ |
| Nav blur intensify on scroll | #22 | ✅ |
| Copy-to-clipboard morph | #25 | ✅ |
