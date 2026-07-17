# Public OG Website and App Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to carry out this plan task by task, and `superpowers:verification-before-completion` before claiming success.

**Goal:** Preserve the production OG scroll cinematic exactly, add a persistent Default/VibeSpace appearance switch to the website and app, strengthen the app's VibeSpace paper/origami material system, and publish the focused result to `main`.

**Architecture:** The website uses a root `data-site-appearance` attribute initialized before paint and controlled by one small dependency-free module. The app quick switch reuses the existing persisted Zustand theme store, while named `AppShell` hooks enable strictly scoped VibeSpace-only paper layers. The OG runtime, scene configuration, stylesheet, and media remain immutable.

**Tech stack:** Static HTML/CSS/JavaScript, Node test runner, React 18, TypeScript, Zustand, Vitest, Testing Library, Vite, GitHub Pages.

## Global constraints

- Work only in `C:\Users\viper\VibeSpace\.worktrees\public-og-app-appearance-20260716`.
- Do not modify `site/js/scroll-world-engine.js`, `site/js/origami-scroll-world.js`, `site/css/origami-scroll-world.css`, or any path under `site/images/origami-scroll/{source,dives,connectors}`.
- Do not edit package manifests, workflows, updater/release files, Tauri/Rust, auth, billing, voice, sync, or Supabase files.
- Make no GitHub mutation except the one approved fast-forward push of the final focused commit chain to `origin/main`.
- Use red-green-refactor for every behavior change and preserve the existing four-theme Settings registry.

### Task 1: Lock the production OG contract and establish the test baseline

**Files:**

- Create: `site/tests/site-appearance.test.mjs`
- Read only: `site/index.html`
- Read only: `site/js/origami-scroll-world.js`
- Read only: `site/js/scroll-world-engine.js`
- Read only: `site/css/origami-scroll-world.css`
- Read only: `site/images/origami-scroll/**`

**Step 1: Record the immutable base and inventory.**

Run:

```powershell
git rev-parse HEAD
git ls-tree -r --name-only 8aa51f1 -- site/images/origami-scroll/source site/images/origami-scroll/dives site/images/origami-scroll/connectors
git diff --exit-code 8aa51f1 -- site/js/scroll-world-engine.js site/js/origami-scroll-world.js site/css/origami-scroll-world.css site/images/origami-scroll/source site/images/origami-scroll/dives site/images/origami-scroll/connectors
```

Expected: the branch descends from `8aa51f1`, the inventory contains six source images, six dive videos, and five connector videos, and the protected diff is empty.

**Step 2: Write the failing website contract test.**

Create a Node test that reads `site/index.html` and the upcoming appearance assets. It must assert:

- the head contains a synchronous pre-paint resolver before the first stylesheet;
- query parameter `appearance` recognizes only `default` and `vibespace`;
- storage key is exactly `vibespace-site-appearance` and fallback is `default`;
- the navigation has one group with exactly two buttons using `data-site-appearance-choice` values `default` and `vibespace`;
- the Origami mount is unchanged and is hidden in Default by the new CSS;
- the appearance controller is loaded before `origami-scroll-world.js` and calls `window.VibeSpaceOrigamiWorld.layout()` when VibeSpace is activated;
- all six source images, six dive clips, and five connector clips exist;
- `origami-scroll-world.js` still names the same eleven clip paths;
- the frozen runtime/config/style bytes equal `git show 8aa51f1:<path>`.

**Step 3: Prove the test is red for the missing feature.**

Run:

```powershell
node --test site/tests/site-appearance.test.mjs
```

Expected: FAIL because `site/css/site-appearance.css`, `site/js/site-appearance.js`, and switch markup do not exist yet. The OG preservation assertions should already pass.

### Task 2: Implement the public website appearance switch

**Files:**

- Modify: `site/index.html`
- Create: `site/css/site-appearance.css`
- Create: `site/js/site-appearance.js`
- Test: `site/tests/site-appearance.test.mjs`

**Step 1: Add the pre-paint resolver and asset ordering.**

At the top of `<head>`, before stylesheets, add an inline script that:

1. parses `new URLSearchParams(location.search).get('appearance')`;
2. accepts only `default` or `vibespace`;
3. otherwise reads `localStorage.getItem('vibespace-site-appearance')` inside `try/catch`;
4. falls back to `default`;
5. writes `document.documentElement.dataset.siteAppearance`.

Load `css/site-appearance.css` after the existing base CSS so its appearance-specific layers can override presentation without altering the OG stylesheet.

**Step 2: Add the exact two-choice navigation control.**

Insert one keyboard-native button group in the existing navigation:

```html
<div class="site-appearance-switch" role="group" aria-label="Website appearance">
  <button type="button" data-site-appearance-choice="default" aria-pressed="false">Default</button>
  <button type="button" data-site-appearance-choice="vibespace" aria-pressed="false">VibeSpace</button>
</div>
```

Do not duplicate the page or the Origami mount.

**Step 3: Implement the controller.**

`site/js/site-appearance.js` must:

- expose no dependencies and tolerate unavailable storage/history APIs;
- initialize from the pre-painted root value;
- update the root dataset, both buttons' `aria-pressed`, and the theme-color meta;
- persist the selected value to `vibespace-site-appearance`;
- set the shareable query with `history.replaceState`, preserving other parameters and the hash;
- call `window.VibeSpaceOrigamiWorld.layout()` through `requestAnimationFrame` when switching to VibeSpace;
- dispatch a `vibespace:appearancechange` custom event with `{ appearance }` detail.

Load this controller after the page markup and before the unchanged `origami-scroll-world.js`.

**Step 4: Build the website paper frame.**

In `site-appearance.css`:

- hide `#vibespaceOrigamiWorld` with `display: none` under Default and restore it under VibeSpace;
- style the switch as a 44px-minimum segmented control with pressed/focus-visible states;
- add VibeSpace-only fixed, pointer-inert paper edge/fold layers using pseudo-elements on `body`;
- use the locked parchment, ivory, warm ink, coral, lavender, sage, dusty blue, ochre, and indigo palette;
- keep content readable, prevent horizontal overflow, simplify edges below 720px, and disable nonessential transitions for reduced motion.

**Step 5: Run the website test until green.**

Run:

```powershell
node --test site/tests/site-appearance.test.mjs
```

Expected: PASS, including byte equality for every protected OG runtime file.

### Task 3: Add the app quick switch test-first

**Files:**

- Create: `app/src/components/layout/AppearanceQuickSwitch.test.tsx`
- Create: `app/src/components/layout/AppearanceQuickSwitch.tsx`
- Modify: `app/src/components/layout/TopBar.tsx`
- Read only: `app/src/stores/ui.ts`
- Read only: `app/src/features/appearance/themes.ts`
- Read only: `app/src/features/settings/sections/Appearance.tsx`

**Step 1: Write the failing component and integration tests.**

The Vitest suite must reset `useUIStore` between cases and prove:

- there are exactly two quick choices named Default and VibeSpace;
- Default is pressed only for theme `default`;
- VibeSpace is pressed only for theme `vibespace`;
- neither is pressed for `jarvis` or `light`;
- clicking each choice calls the existing `setTheme` path and updates store state;
- the compact variant remains accessibly named;
- `TopBar.tsx` renders the component in both normal and compact clusters;
- the Settings/theme registry still contains all four IDs: `jarvis`, `vibespace`, `default`, `light`.

**Step 2: Prove the focused suite is red.**

Run:

```powershell
npm --prefix app run test -- AppearanceQuickSwitch.test.tsx
```

Expected: FAIL because the component and TopBar integration do not exist.

**Step 3: Implement the focused component.**

Create a semantic `role="group"` control that selects only from the existing store:

```tsx
const theme = useUIStore((state) => state.theme);
const setTheme = useUIStore((state) => state.setTheme);
```

Render two `type="button"` controls with `aria-pressed`, stable `data-appearance-choice` hooks, visible focus styles, and a `compact?: boolean` prop. Do not create another preference, effect, or storage key.

**Step 4: Integrate both TopBar layouts.**

Import `AppearanceQuickSwitch`. Render it once in the normal right cluster and once with `compact` in `CompactRightCluster`, without removing existing controls or drag regions.

**Step 5: Run the focused suite until green.**

Run:

```powershell
npm --prefix app run test -- AppearanceQuickSwitch.test.tsx
```

Expected: PASS.

### Task 4: Build the app's structural paper/origami appearance test-first

**Files:**

- Modify: `app/src/components/layout/AppearanceQuickSwitch.test.tsx`
- Modify: `app/src/components/layout/AppShell.tsx`
- Modify: `app/src/styles/vibespace-theme.css`

**Step 1: Add failing shell and CSS contract assertions.**

Extend the focused suite to inspect the source contracts and require:

- named hooks `vibespace-shell`, `vibespace-shell__spine`, `vibespace-shell__sheet-stack`, and `vibespace-shell__workspace`;
- decorative layers marked `aria-hidden="true"`;
- all structural rules scoped below `html[data-theme='vibespace']`;
- the ten locked color values;
- clipped corners, a three-layer sheet stack, fold facets, fiber/crease gradients, and material shadows;
- narrow-window and `prefers-reduced-motion` rules.

Run the focused test and confirm it fails before implementation.

**Step 2: Add shell hooks without changing ownership.**

In the normal `AppShell` branch:

- add `vibespace-shell` to the existing root;
- add a pointer-inert, `aria-hidden` folded-spine element;
- add `vibespace-shell__sheet-stack` to the existing center column;
- add `vibespace-shell__workspace` to the existing `<main>`.

Apply the root/workspace hooks consistently to the workbench-fullscreen branch, but do not change layout logic, navigation state, feature content, or event ownership.

**Step 3: Implement the paper material system.**

Expand `vibespace-theme.css` with only `html[data-theme='vibespace']` selectors:

- a continuous 10–14px left folded spine built from repeating conic/linear color facets;
- `::before` and `::after` sheet offsets behind the center column, producing three visible sheets total;
- an ivory foreground sheet with a clipped upper-right/lower-left corner;
- restrained repeating fiber and diagonal crease gradients;
- a folded top-bar edge and faceted quick-switch treatment;
- broad, low-opacity shadows instead of glass blur;
- `@media (max-width: 720px)` simplification and `@media (prefers-reduced-motion: reduce)` transition removal.

Keep selectors and pseudo-elements pointer-inert where decorative, and retain existing CSS variables as the semantic color source for content.

**Step 4: Run focused tests and typecheck.**

Run:

```powershell
npm --prefix app run test -- AppearanceQuickSwitch.test.tsx
npm run typecheck
```

Expected: PASS.

### Task 5: Verify behavior and visual quality locally

**Files:** No new files expected.

**Step 1: Run the relevant automated suite.**

```powershell
node --test site/tests/site-appearance.test.mjs
npm --prefix app run test -- AppearanceQuickSwitch.test.tsx
npm --prefix app run test
npm run typecheck
npm run build
```

If dependencies are absent, run the repository's documented `npm install` first without changing lockfiles. Fix only failures caused by this change; report unrelated baseline failures precisely.

**Step 2: Verify the website in a real browser.**

Serve the repository root locally and inspect the website at desktop and mobile widths. Confirm:

- Default paints without a flash, the switch is selected, and the Origami mount has no layout height;
- VibeSpace updates the URL and survives reload;
- the exact OG cinematic appears and scrubs through all sections without a cut/config change;
- keyboard focus and both buttons work;
- there is no horizontal overflow or console error.

**Step 3: Verify the app preview.**

Run the app in Vite web mode and inspect normal and compact widths. Confirm both quick switches write the existing persisted theme, Jarvis/Light show neither pressed, folded layers do not block controls, and Default removes all VibeSpace-only structure.

**Step 4: Re-prove immutable and scoped diffs.**

```powershell
git diff --exit-code 8aa51f1 -- site/js/scroll-world-engine.js site/js/origami-scroll-world.js site/css/origami-scroll-world.css site/images/origami-scroll/source site/images/origami-scroll/dives site/images/origami-scroll/connectors
git diff --check
git status --short
git diff --name-only 8aa51f1
```

Expected: no protected OG diff, no whitespace errors, and only the design/plan plus approved implementation/test paths changed.

### Task 6: Commit, fast-forward publish, and verify production

**Files:** Only the approved allowlist.

**Step 1: Review and commit intentionally.**

Inspect the complete diff, stage only the approved paths, verify `git diff --cached --name-only`, and commit with a focused message such as:

```powershell
git commit -m "feat: add persistent VibeSpace appearance"
```

Do not amend unrelated history.

**Step 2: Confirm the remote base is still safe.**

```powershell
git fetch origin main
git rev-parse origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected: `origin/main` remains `8aa51f1` and is an ancestor of the tested branch. If it moved, rebase the focused chain, rerun all verification, and re-check the diff before publishing.

**Step 3: Use the completion and verification skills.**

Read and apply `superpowers:finishing-a-development-branch` and rerun the final commands required by `superpowers:verification-before-completion`. Because the user explicitly selected direct production publication, do not open a PR or create a release.

**Step 4: Perform the one approved push.**

```powershell
git push origin HEAD:main
```

Expected: one fast-forward update to `main`. Do not push any other ref.

**Step 5: Monitor GitHub Pages and verify the custom domain.**

Observe the Pages workflow for the pushed SHA. Then repeatedly fetch `https://vibespaceos.com/` with cache-busting until it contains `data-site-appearance-choice`, and verify the new CSS/JS return HTTP 200. Confirm the live OG script still names the same eleven `/dives/` and `/connectors/` paths and sample all seventeen OG media URLs for HTTP 200/206.

**Step 6: Report the exact production outcome.**

Report the pushed SHA, checks run and results, deployed URL, appearance persistence behavior, OG immutability evidence, and any explicitly unverified native-only behavior. Do not claim a desktop binary release because this task publishes source and the website only.
