# VibeSpace — Cinematic Product World

Copper Core is a complete static website variation. Ivory Architecture and Signal Chamber are independent hero/workspace motion studies. All nine generated art references, twelve rendered concept captures, and desktop/mobile section captures are preserved. Generated references are explicitly distinguished from actual product screenshots.

## Preview

Run from this checkout:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

- Complete site: http://127.0.0.1:8765/
- References: http://127.0.0.1:8765/concepts/
- Rendered comparison and results: http://127.0.0.1:8765/concepts/review.html
- Studies: `/concepts/copper/`, `/concepts/ivory/`, `/concepts/signal/`.

## Restoration

Repository: `Cookie774-GameDev/VibeSpace`. Branch: `codex/cinematic-product-world-20260907`.

| Milestone | Exact restoration reference |
| --- | --- |
| Public baseline, unchanged | `d08c7340e27cb3af509db4a9c81bfb2d1b6aaba2` |
| Baseline, nine design references, dependencies, state contracts | `46153ea` |
| First complete Copper Core plus all three working studies | `77374b3` |
| Final polished variation and evidence | Draft PR branch HEAD; see `FINAL-RESULTS.md` |

From the isolated checkout, create a **new, unused** inspection directory:

```powershell
git worktree add --detach ../inspect-vibespace-baseline d08c7340e27cb3af509db4a9c81bfb2d1b6aaba2
git worktree add --detach ../inspect-vibespace-first-variation 77374b3
```

This preserves the working branch and every other checkout. Serve the selected worktree's `site/` to inspect it. Do not replace a dirty checkout or rewrite a shared branch. Production publication requires a separate decision; no merge, deployment, billing, authentication, desktop, or infrastructure mutation belongs to this variation.

The saved live baseline and source homepage matched byte-for-byte: SHA-256 `A5AE64C14A8273B9023E40417540306B48FDA572432F44054ADD274E08B3C949`.

## Implementation

- `site/index.html`: semantic HTML, all product copy and controls, existing public chapters plus legacy `pricing` and `download` aliases.
- `site/css/cinematic.css`: typography, compositions, responsive layouts, contrast, focus and reduced-motion rules.
- `site/js/cinematic-app.mjs`: routing, approval workflow, context controls, plans, navigation, assembly and one coordinated ticker.
- `site/js/cinematic-scenes.mjs`: one shared transparent Three.js renderer, lazy scene construction, offscreen disposal, procedural metal, software-renderer quality path and WebGL fallback.
- `site/js/cinematic-voice.mjs`: explicit mic activation, permission cancellation, analyser-driven waveform, browser sample playback, stop/clear/copy and error states.
- `site/js/cinematic-state.mjs`: pure conversation, approval, pricing and map contracts.
- `author.py`: reproducible static HTML authoring. Edit its templates before regenerating HTML. `build-review.mjs` builds the comparison from current evidence.
- Local Three.js 0.166.1, GSAP/ScrollTrigger 3.13.0 and three font families; notices preserved in `site/vendor/`.

## Design decisions and saved X references

| Direction | Composition and clarity | Motion | Mobile and performance |
| --- | --- | --- | --- |
| Copper Core | Clear sans headline alongside a physical copper V; alternating graphite, green, ivory and copper chapters | Layer separation connects to the HTML workspace assembly | Stacked hero; CTA stays above sculpture; shared renderer and no hero-image download |
| Ivory Architecture | Architectural daylight, serif headline and calm open spacing | Three pale structural layers; same reversible workspace reveal | Dark text on warm ivory; workspace contrast audited separately |
| Signal Chamber | Serif text, fine copper paths, wireframe V and deeper atmosphere | Filaments converge around the visible central object | Filament sculpture moves beneath the text on mobile; shared lazy renderer |

Reviewed the user's `X-Likes-AI-Tools-Research-2026-08-18` index and relevant saved X evidence under `SUPERPOWERS/X-POST-TOOLS/_EVIDENCE/live-x-audit-2026-08-18`. Relevant references included the story-driven Three.js katana concept, Meng To parallax/particle technique repost, Jets 3D website tooling, and Da7em's living particle website. The saved Jets screenshot did not contain the post body, so it was not treated as visual proof. Da7em's saved image showed the atmospheric particle lettering; its linked live page was also read. These informed the emphasis on one strong object, connected motion, sparse controls and native chapter navigation. No third-party site code or assets were copied.

The selected local design guidance included frontend-design, gpt-taste and cinematic GSAP motion guidance. The nine image-generation briefs explored: copper precision and machined layers; ivory architectural mass and daylight; dark signal paths and orchestration. Each direction had its own desktop, portrait mobile and exploded workspace reference. The implementation uses live geometry and HTML, not a flattened screenshot of a generated page.

## Verification

Run a local preview first, then:

```powershell
node --test site/tests/cinematic-state.test.mjs site/tests/access-pricing.test.mjs
node site/tests/cinematic-browser.mjs
node site/tests/cinematic-concepts.mjs
node site/tests/cinematic-performance.mjs
```

`browser-results.json` records behavioral results; `axe-*.json` and `concept-accessibility.json` record accessibility checks; `performance.json` gives exact cold-cache conditions, hardware/browser identifiers, three LCP/CLS runs and frame intervals. `required-results.json` records repository-required check exit codes, with raw logs alongside it.

The original website suite had **9 failures out of 18 tests before writes**. This variation fixes the four Access disclosure/onboarding/accessibility/link failures. Five already-failing assertions still expect the old origami/appearance HTML and script order; their source assets and tests remain preserved. They are not represented as new runtime regressions or as passing tests. The new state contracts are additional tests.

Browser checks cover the requested widths, a 1280×720 laptop, forward/reverse scrolling, anchor jumps/back, keyboard/touch, all model routes and plan selections, approval/decline/reset, context/layer controls, image-dialog focus, sample playback, mic denial/unsupported APIs/late permission, reduced motion, no JS, failed assets and real WebGL refusal. Physical microphone quality, audible voice quality, Safari/Firefox and production field Core Web Vitals are not claimed by the Chromium automation.

## Scope and review

Unique agent/task: `codex-copper-20260907-r1` / `cinematic-product-world`. Website-only isolated clone inside the established website workspace. No subagents. Source main was rechecked via the GitHub connector and remained at the baseline commit. Cloudflare's previously connected account did not identify this domain or a matching Pages project; its role is unverified and untouched. The repository's existing GitHub Pages workflow still owns `site/` delivery.

Self-review checked dependency failure boundaries, DOM-first content, approval gating, mic cancellation, context-loss recovery, no offscreen decorative frames, public links, pricing arithmetic, licensing and exact write scope. Final check results and any remaining repository failures are in `FINAL-RESULTS.md`.
