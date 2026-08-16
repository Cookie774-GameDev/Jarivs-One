# Integrate Origami Cinematic Into Index Implementation Plan

**Goal:** Make the existing VibeSpace `index.html` use the completed six-dive, five-connector Higgsfield cinematic directly inside its native Origami scroll section.

**Architecture:** Keep the existing `mountScrollWorld` engine and semantic fallback in `index.html`. Change only the Origami configuration’s media paths to the verified Kling Pro files, align its copy with the finished cinematic, and remove the redundant floating link to the separate showcase route.

**Tech Stack:** Plain HTML, CSS, JavaScript, Node test runner, Playwright.

## Global Constraints

- Preserve every existing Living OS section and interactive system.
- Use all six files in `images/origami-scroll/work/higgsfield-test/dives/`.
- Use all five files in `images/origami-scroll/work/higgsfield-test/connectors/`.
- Keep reduced-motion and semantic still-image fallbacks.
- Do not spend additional generation credits.

### Task 1: Require the New Chain on the Main Page

**Files:**
- Modify: `tests/origami-scroll-world.test.mjs`

- [ ] Add a test asserting that `js/origami-scroll-world.js` references six new dive paths and five new connector paths.
- [ ] Assert that `index.html` no longer contains the floating `origami-cinematic.html` shortcut.
- [ ] Run `node --test tests/origami-scroll-world.test.mjs` and confirm the new test fails for the old paths.

### Task 2: Integrate the Cinematic

**Files:**
- Modify: `js/origami-scroll-world.js`
- Modify: `index.html`

- [ ] Point each section clip at the matching verified Higgsfield dive.
- [ ] Point all five connectors at the exact-frame Higgsfield connector directory.
- [ ] Align scene copy and navigation labels with the finished six-scene journey.
- [ ] Remove the separate-route floating shortcut from `index.html`.
- [ ] Run the Node tests and confirm they pass.

### Task 3: Verify and Open the Main Website

**Files:**
- Modify: `tests/origami-index.visual.mjs`

- [ ] Load `index.html` through the local range-capable server.
- [ ] Scroll into the embedded Origami section and confirm cinematic mode, seekable video, connector playback, and no console/network errors.
- [ ] Capture desktop and iPhone screenshots.
- [ ] Run the complete test suite and syntax checks.
- [ ] Open `http://127.0.0.1:5173/index.html` in Chrome and leave the local server running.
