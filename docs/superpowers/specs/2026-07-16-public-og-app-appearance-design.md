# Public OG Website and App Appearance Design

## Approval and objective

The user approved one focused production change with one push to `main`:

1. Preserve the exact scroll cinematic currently live on `vibespaceos.com`.
2. Add a persistent `Default / VibeSpace` appearance switch to the website.
3. Add the same persistent quick switch to the desktop app top bar.
4. Make the app's VibeSpace appearance visibly more layered, folded, and origami-like.
5. Publish the website through the existing GitHub Pages workflow and make no other GitHub changes.

No pull request, issue, release, tag, workflow edit, package publication, installer build, or unrelated repository change is authorized.

## Current state

### Production website

`vibespaceos.com` is deployed from `site/` by `.github/workflows/pages.yml` when `main` changes. The live cinematic is the production OG chain:

- six source stills in `site/images/origami-scroll/source/`;
- six dive clips in `site/images/origami-scroll/dives/`;
- five connector clips in `site/images/origami-scroll/connectors/`;
- `site/js/scroll-world-engine.js`;
- `site/js/origami-scroll-world.js`;
- `site/css/origami-scroll-world.css`.

Those files and paths are immutable for this task. The experimental `work/higgsfield-test` chain is not part of the deployment.

### Desktop app

The app already persists four complete themes through `useUIStore`: `jarvis`, `vibespace`, `default`, and `light`. Settings already exposes all four. `vibespace-theme.css` currently changes tokens and background blooms but does not provide strong material structure. The top bar has no direct appearance control.

## Chosen architecture

### Website appearance

Use one document and one URL. A pre-paint bootstrap in `site/index.html` resolves `?appearance=default|vibespace`, then local storage key `vibespace-site-appearance`, then `default`. It writes `data-site-appearance` to the root element before styles load.

The top navigation contains an accessible two-button group labeled `Default` and `VibeSpace`. `site/js/site-appearance.js` owns state changes, URL sharing with `history.replaceState`, local persistence, `aria-pressed`, theme color, and scroll-world relayout when VibeSpace activates.

- `Default` hides the Origami mount with `display: none`, so it contributes no scroll height or video work.
- `VibeSpace` shows the unchanged OG Origami mount and adds the mature paper frame around the existing page.
- Reduced-motion behavior remains owned by the unchanged OG cinematic runtime.

### App quick switch

Create a focused `AppearanceQuickSwitch` component. It reads and writes the existing `useUIStore` theme; it does not introduce a second preference or storage key.

- `Default` calls `setTheme('default')`.
- `VibeSpace` calls `setTheme('vibespace')`.
- The switch appears persistently in both normal and compact top-bar layouts.
- Settings continues to expose Jarvis Core and Light. If either is active, neither quick-switch option claims to be selected; activating either quick choice moves to that exact theme.
- Buttons use semantic pressed state, visible focus, tooltips/labels, and minimum practical pointer targets without taking excessive terminal height.

### App paper material system

Keep the existing palette and theme token contract. Add structural styling only under `html[data-theme='vibespace']` and named shell hooks:

- a narrow folded perimeter spine using coral, lavender, sage, dusty blue, and ochre facets;
- a staggered three-sheet workspace canvas with visible paper offsets;
- top-bar fold facets and a paper-edge highlight;
- clipped paper corners on the quick switch and primary shell surfaces;
- diagonal crease lines, restrained fiber texture, and broad material shadows;
- mobile/narrow-window simplification and reduced-motion safeguards.

The signature element is the continuous folded spine feeding into the stacked workspace sheets. It is structural rather than decorative: the spine identifies the VibeSpace mode while the stacked sheets define the working canvas. Existing feature content, layout ownership, theme tokens, and interaction behavior stay intact.

Locked visual colors:

- parchment `#E9D4B7`;
- raised ivory `#F8E9D1`;
- paper edge `#FFF7E8`;
- warm ink `#3B2A20`;
- coral `#DF846F`;
- dusty lavender `#947DB7`;
- sage `#879A7C`;
- dusty blue `#7F98AA`;
- ochre `#C98C42`;
- deep indigo `#302E4D`.

## Accessibility and responsive behavior

- Both switches are keyboard reachable and expose current selection with `aria-pressed`.
- Focus is visibly distinct in every appearance.
- Narrow app windows keep the quick switch usable without forcing top-bar overflow; compact mode uses shortened labels only if measurement proves necessary.
- Website mobile targets are at least 44 CSS pixels high.
- Decorative fold layers are `aria-hidden` and pointer-inert.
- `prefers-reduced-motion: reduce` disables nonessential transitions without disabling theme changes.
- Text and controls retain existing semantic color-token contrast.

## Testing

Strict test-first implementation:

1. Website contract test proves pre-paint resolution, exactly two choices, Default isolation, OG file/hash preservation, and script/style order.
2. App component test proves persistent rendering in normal/compact contexts, exact store writes, pressed-state behavior, and no removal of the four-theme Settings registry.
3. Focused Vitest suites, website Node tests, root typecheck, production app build, and existing relevant appearance tests run before deployment.
4. Browser verification covers website Default/VibeSpace at desktop/mobile widths, OG video scrubbing, app preview quick switching, no horizontal overflow, and no console errors.

## Deployment and rollback

Implementation occurs in `.worktrees/public-og-app-appearance-20260716` on `agent/public-og-app-appearance-20260716`, created directly from `origin/main` at `8aa51f1`.

Before push:

- verify the three OG runtime source files and seventeen OG media paths are unchanged from `8aa51f1`;
- review the complete commit diff and exact path allowlist;
- confirm no secrets, installer changes, workflow changes, dependency changes, or unrelated files are staged;
- verify `origin/main` still equals the recorded base or rebase/retest before any push.

Publish with one fast-forward push of the focused commit chain to `origin/main`. Monitor the GitHub Pages workflow and fetch `https://vibespaceos.com/` until the deployed HTML contains the appearance switch and the OG media chain still responds.

Rollback is a focused revert of the deployment commit followed by the same Pages verification. No database, user data, auth, billing, or native capability changes are involved.

## Explicit exclusions

- No change to the OG scroll engine, OG scene configuration, OG Origami stylesheet, or OG still/video bytes.
- No app release, updater manifest, installer, Tauri/Rust, voice, auth, cloud sync, billing, or Supabase change.
- No second full website DOM, separate appearance route, or duplicated app theme store.
- No PR, issue, tag, release, workflow edit, branch deletion, or repository-setting change.
