# VibeSpace Paper World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing VibeSpace index into a reference-faithful paper-world experience while preserving and improving every embedded interactive demo and the cinematic Origami scroll chapter.

**Architecture:** Keep the proven HTML IDs and JavaScript integrations intact. Add a small amount of semantic paper-frame and simulator-control markup, load a dedicated final override stylesheet, and add one contained desktop-shell state path to the existing simulator controller. This isolates visual risk while allowing the entire page to be restyled consistently.

**Tech Stack:** Static HTML5, CSS custom properties and responsive CSS, vanilla JavaScript, Node test runner, Playwright visual/runtime checks.

## Global Constraints

- Preserve all existing Living Desktop, iPhone, install, voice, calling, and scroll-world behavior.
- The Origami chapter remains a distinct full-bleed section in the same `index.html`.
- Use only local assets and existing Google font imports; add no runtime dependency.
- Keep exact existing IDs and data hooks used by JavaScript.
- Add reduced-motion and keyboard-focus coverage.
- Do not touch the unrelated deleted `../install/install.ps1` user change.

---

### Task 1: Structural contract tests

**Files:**
- Create: `tests/paper-world.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing `#desktopOS`, `#simTabs`, and `#vibespaceOrigamiWorld` hooks.
- Produces: `.paper-world-frame`, `.paper-world-ribbon`, `.desktop-shell-switch`, and the final `css/paper-world.css` link.

- [ ] **Step 1: Write the failing test**

  Assert that `index.html` has the paper-world body hook and inert frame, loads `css/paper-world.css` after the other site styles, exposes two desktop-shell buttons, and keeps `data-cinematic-ready="true"` on `#vibespaceOrigamiWorld`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test tests/paper-world.test.mjs`

  Expected: FAIL because the paper-world stylesheet and structural hooks do not exist.

- [ ] **Step 3: Add the minimum markup contract**

  Add the body class, inert edge-decoration container, top faceted ribbon, revised hero copy labels, always-visible simulator labels, and the shell switch inside the existing desktop menu bar.

- [ ] **Step 4: Run test to verify the HTML contract passes**

  Run: `node --test tests/paper-world.test.mjs`

  Expected: PASS for structural assertions after the stylesheet is added in Task 2.

### Task 2: Paper-world visual system

**Files:**
- Create: `css/paper-world.css`
- Modify: `index.html`
- Test: `tests/paper-world.test.mjs`

**Interfaces:**
- Consumes: existing CSS classes from `style.css`, `desktop-os.css`, `phone-os.css`, and `origami-scroll-world.css`.
- Produces: named color tokens, paper texture, folded geometry, responsive rules, and reduced-motion overrides.

- [ ] **Step 1: Extend the test with token and signature assertions**

  Require `--paper-ivory`, `--paper-coral`, `--paper-lavender`, `.paper-world-frame`, clipped corner geometry, a mobile breakpoint, and `prefers-reduced-motion`.

- [ ] **Step 2: Run the test to verify the CSS assertions fail**

  Run: `node --test tests/paper-world.test.mjs`

  Expected: FAIL because `css/paper-world.css` is absent.

- [ ] **Step 3: Implement the page-wide paper system**

  Theme the document base, navigation, hero, simulator folio, proof strip, section sheets, headings, cards, terminal swarm, flow diagram, Hive, calling demo, pricing, hotkeys, downloads, letter, FAQ, and footer. Add paper-grain overlays, faceted ribbons, controlled shadows, focus-visible states, 960px/620px breakpoints, and reduced-motion handling.

- [ ] **Step 4: Run the structural suite**

  Run: `node --test tests/paper-world.test.mjs tests/origami-scroll-world.test.mjs`

  Expected: PASS with the original Origami data chain unchanged.

### Task 3: Living OS paper skin and platform switch

**Files:**
- Modify: `css/paper-world.css`
- Modify: `js/desktop-os.js`
- Test: `tests/paper-world.test.mjs`

**Interfaces:**
- Consumes: `.desktop-shell-option[data-shell]` controls.
- Produces: `frame.dataset.shell` with `mac` or `windows`, persisted in `sessionStorage` key `vs-desktop-shell`.

- [ ] **Step 1: Add failing JavaScript contract assertions**

  Assert that the desktop controller reads and writes `vs-desktop-shell`, updates `frame.dataset.shell`, and toggles `aria-pressed` on the shell controls.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/paper-world.test.mjs`

  Expected: FAIL because shell selection is not initialized.

- [ ] **Step 3: Implement shell selection and simulator skins**

  Add an `initShellSwitch()` function called from `init()`. Style macOS and Windows menu chrome separately while keeping the same app/window manager. Reskin the iPhone home, app tiles, nav bars, and call surfaces with paper colors without changing its navigation handlers.

- [ ] **Step 4: Run the contract suite**

  Run: `node --test tests/paper-world.test.mjs`

  Expected: PASS.

### Task 4: Runtime and visual regression audit

**Files:**
- Create: `tests/paper-world.visual.mjs`
- Modify: `css/paper-world.css` as defects are found
- Modify: `index.html` only for verified layout/accessibility defects

**Interfaces:**
- Consumes: local server at `http://127.0.0.1:5173/index.html` and Playwright Chromium.
- Produces: `artifacts/paper-world-hero-desktop.png`, `artifacts/paper-world-sections-desktop.png`, `artifacts/paper-world-iphone.png`, and JSON QA output.

- [ ] **Step 1: Write the visual/runtime audit**

  Check style load, hero visibility, desktop/iPhone switching, macOS/Windows selection and persistence, button accessibility state, no horizontal overflow, representative feature/pricing/FAQ visibility, six scroll sections, eleven scroll segments, and zero local/console/page failures.

- [ ] **Step 2: Run the audit and inspect screenshots**

  Run: `node tests/paper-world.visual.mjs C:/Users/viper/Documents/input/vibespace-origami-ui-lab/node_modules/playwright-core`

  Expected: PASS and three readable screenshots with no clipping.

- [ ] **Step 3: Correct every verified defect**

  Apply only evidence-backed CSS/markup fixes, rerunning the audit after each batch.

- [ ] **Step 4: Run final verification**

  Run: `node --test tests/paper-world.test.mjs tests/origami-scroll-world.test.mjs`

  Run: `node tests/paper-world.visual.mjs C:/Users/viper/Documents/input/vibespace-origami-ui-lab/node_modules/playwright-core`

  Run: `node tests/origami-index.visual.mjs C:/Users/viper/Documents/input/vibespace-origami-ui-lab/node_modules/playwright-core`

  Expected: all checks pass, scroll video seeking remains healthy, and no browser errors occur.

- [ ] **Step 5: Open the finished site**

  Open `http://127.0.0.1:5173/index.html` in Chrome and leave the local server running for the user.

## Self-review

- Spec coverage: the plan covers the paper frame, hero, all existing marketing chapters, Living Desktop/iPhone, desktop OS switching, the separate Origami chapter, accessibility, responsiveness, and verification.
- Placeholder scan: the implementation paths, hooks, storage key, commands, and expected results are explicit.
- Interface consistency: HTML emits `.desktop-shell-option[data-shell]`; JavaScript writes `frame.dataset.shell`; CSS selects `#desktopOS[data-shell="windows"]`; tests exercise the same contract.
