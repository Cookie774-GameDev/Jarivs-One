# VibeSpace MonoChrome Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> to execute this plan task by task. Use
> `superpowers:test-driven-development` for every behavior change,
> `superpowers:systematic-debugging` for unexpected failures, and
> `superpowers:verification-before-completion` before any success claim.

**Goal:** Replace the selectable Light appearance with a reference-locked
MonoChrome appearance while preserving every other theme, feature, product
word, user record, route, native integration, and production boundary.

**Architecture:** Keep the existing four-theme registry and replace only its
fourth selectable member. Generate one versioned theme-contract dataset, then
apply boundary-specific storage, runtime, command, sync, document-resolution,
and prepaint policies from that dataset. Migrate the persisted UI store from
version 4 to version 5 without touching unrelated keys, validate even
current-version hydration through Zustand `merge`, and load a self-hosted
CSP-safe prepaint asset before React. Implement the visual system under the single root
selector `html[data-theme='monochrome']`, then theme shared primitives, the app
shell, and the post-integration route manifest without changing component
behavior.

**Tech stack:** TypeScript 5.6, React 18, Zustand 5, Tailwind CSS, CSS custom
properties, Vitest 4, xterm.js, Vite, Tauri 2, Playwright added or adapted to
the repository's final test conventions, and FFmpeg/ffprobe for local
reference analysis.

**Master goal source:**
`C:\Users\viper\Downloads\VibeSpace_MonoChrome_Appearance_Master_Goal.md`

**Source SHA-256:**
`3A944882AD3F76572BA7D6D183730F7129CE85AB99D2F8D1ED1B168D806D98E7`

**Program plan:** `docs/unified-goals/EXECUTION_PLAN.md`

**Branch:** `codex/shared-intelligence-kernel-design-20260716`

## 1. Design Direction

### Product subject, audience, and job

MonoChrome is VibeSpace's precise, low-distraction technical operating skin.
It is for users moving between chat, JARVIS, terminals, repositories, agents,
context, billing, and operational dashboards who need dense information to
remain legible without decorative surface noise. Its job is to make state,
hierarchy, boundaries, and actions instantly scannable while leaving every
feature's semantics and behavior intact.

### Visual thesis

- True black is the field; near-black panels establish depth through level and
  border, not glow, blur, texture, or large shadow.
- One-pixel neutral separators do most of the structural work.
- Body copy stays compact and readable; JetBrains Mono is reserved for
  metadata, measurements, section indexes, terminal content, and short labels.
- Corners are square or nearly square. The default radius vocabulary is 1px,
  2px, and 3px, with larger radii retained only where behavior or platform
  ergonomics genuinely require them.
- Purple, teal, amber, green, and red carry semantic state. Accent pixels are
  sparse enough that each one means something.
- The signature element is an indexed registration label: a restrained `//`
  marker plus mono index or section text aligned to the one-pixel layout grid.
  It appears only where it clarifies hierarchy; it is not repeated decoration.
- Negative space is controlled and purposeful. Dense operational surfaces may
  be compact, but primary task areas still receive breathing room.

### Seed palette pending measured calibration

| Role           | Seed      | Constraint                  |
| -------------- | --------- | --------------------------- |
| field          | `#000000` | page and shell background   |
| surface 1      | `#050505` | primary panels              |
| surface 2      | `#080808` | nested panels               |
| surface 3      | `#0D0D0D` | raised/interactive surfaces |
| active         | `#171717` | selected or pressed state   |
| border         | `#1D1D1D` | default 1px separator       |
| border strong  | `#2A2A2A` | focus/strong boundary       |
| text           | `#F5F5F5` | primary text                |
| text secondary | `#A3A3A3` | supporting text             |
| text tertiary  | `#686868` | metadata/de-emphasis        |
| purple         | `#8B3DFF` | primary branded action      |
| teal           | `#0A777A` | information/activity        |
| amber          | `#C88700` | warning/pending             |
| green          | `#5C8F6A` | success/available           |
| red            | `#C95757` | destructive/error           |

These values are seeds, not fabricated measurements. Task MC8 may calibrate
them only from the supplied recording and must document every change.

### Explicit anti-goals

- No generic dark mode, neon cyberpunk skin, glassmorphism, paper texture,
  full-screen gradient, bloom, glow, giant shadow, or ornamental illustration.
- No copied third-party product name, icon, layout identity, wording, data, or
  account content.
- No new remote font, remote stylesheet, tracking, runtime CSS evaluation,
  untrusted SVG, provider-page injection, or heavy background asset.
- No Fraunces inside MonoChrome and no global font override affecting Default,
  VibeSpace, Jarvis Core, Origami chat, or remote provider pages.
- No broad `!important`, unscoped utility rewrite, behavior rewrite, product
  copy rewrite, route remount, data reload, or persistence reset.
- Pixel Pet remains fully transparent, including its first paint.

### Self-critique gate

At each visual review, reject the implementation if it merely makes the app
black. A passing MonoChrome surface must show deliberate hierarchy through
panel levels, one-pixel geometry, type roles, compact rhythm, indexed labels,
and restrained semantic accent. Also reject an implementation that becomes so
dense or small that focus, readability, touch targets, zoom, or narrow desktop
use regresses.

## 2. Authority, Scheduling, and Hard Gates

- Goal 8 is appended after Goals 1-7 and the reference-locked Origami chat
  phase. It does not restart, replace, or interrupt their implementation.
- Read-only discovery and local reference analysis may happen early. Product
  edits wait until the shared foundation, dependent routes, and Origami work
  are stable enough to freeze reliable regression baselines.
- MC0A is read-only only. After Goals 1-7 are integrated and functionally
  stable and Origami has a frozen acceptance oracle, MC0B repairs tooling only,
  records the full green/known-failure ledger, freezes final source-derived
  route/primitive/overlay/detached/native-window manifests, and captures
  immutable Default/VibeSpace/Jarvis/Origami baselines. MC1 is forbidden until
  that gate passes at one exact commit. Relevant upstream drift before MC1
  invalidates the bundle and forces recapture before the first product edit.
  Once MC1 begins, the frozen bundle is the immutable `B0` oracle: later tasks
  verify its integrity and compare current preserved themes to it; they never
  demand that deliberately changed current source hash to the pre-change source.
  If a later upstream rebase invalidates `B0`, reconstruct a clean
  pre-MonoChrome worktree at the new base, capture a replacement `B0` there,
  independently accept it, then replay the MonoChrome commits.
- All changes stay on the same isolated successor branch and eventual draft
  PR. Do not create a separate product PR.
- Keep `integrate/grok-workbench-pr25-v2`, its worktree, every pre-existing
  localhost process, and the unrelated `install/install.ps1` deletion
  untouched.
- Use a newly selected unused localhost port and a separate disposable
  app-data/profile directory. Record and stop only processes started here.
- The only current Goal 8 blocker is the absent exact reference recording,
  `Screen Recording 2026-07-16 220632(1).mp4`. That blocks MC8 measured
  calibration and final video-fidelity evidence only. It does not block
  architecture, migration, styling, tests, accessibility, native smoke, or
  preserved-theme work.
- Do not copy or commit the source recording, extracted frames, private account
  screenshots, browser history, or temporary visual diffs. Store local
  analysis artifacts only in an ignored evidence directory. The synthetic,
  account-free `B0` screenshots enumerated in MC0B are the sole exception: they
  are tracked regression-oracle fixtures, not user or reference-media evidence.
- A production deployment, merge to `main`, production release, reviewed
  history force-push, live Stripe financial change, destructive real-data
  operation, user-only external approval, irreplaceable credential, or
  irreconcilable specification conflict remains a genuine hard gate.

## 3. Verified Baseline at Planning Time

The following facts were verified in the isolated worktree before writing this
plan. Re-run discovery after Goals 1-7 and Origami stabilize; later phases may
add or move routes.

- `Theme` currently combines selectable IDs with legacy `dark` and `system`.
- `SELECTABLE_THEMES` is currently ordered `jarvis`, `vibespace`, `default`,
  `light`.
- `migrateThemePreference()` currently maps `dark` and `system` to `default`,
  but preserves `light`.
- The Zustand UI store is version 4. Its migration normalizes themes only when
  `version < 4`, so malformed current-version persisted values can escape.
- `safeLocalStorage.ts` can recover quota by writing `theme || 'dark'` with a
  stale version, so it is an explicit contract consumer, not optional scope.
- `resolveTheme()` can still produce `light` from a `system` preference.
- `ThemeHost` still contains `system` media-query authority and must stop doing
  so after canonical migration.
- `index.html` starts with `data-theme="dark"`; React applies the persisted
  theme later in `ThemeHost`, creating a first-paint seam.
- `themeSync.ts` accepts four public IDs but its listener lifecycle is not
  integration-tested with a detached window.
- Active Light references exist in Appearance, Composer help, slash command
  typeahead, command-palette actions, both action registries, and xterm theme
  selection.
- Light CSS remains in `globals.css` and `vibespace-theme.css`.
- Bundled local families already include Inter, Plus Jakarta Sans, JetBrains
  Mono, and Fraunces; MonoChrome needs no new font dependency.
- The shared UI directory currently has 17 files, including Button, Input,
  Textarea, Checkbox, Switch, Dialog, Popover, Tooltip, Tabs, Card, Separator,
  Badge, Toast, and supporting primitives. Several required controls are
  feature-local or native and must be discovered, not invented.
- Existing style debt includes large fixed radii, shadows, blur, gradients,
  and accent utilities across feature components; only MonoChrome-scoped
  corrections are authorized here.
- Existing visual helpers use stale seeds and there is no committed
  Playwright configuration, route baseline suite, style-metrics runner, or
  accessibility runner yet.
- `scripts/boot-validation.mjs` and `scripts/capture-screenshots.mjs` seed
  invalid `jarvis-core`/version-12 storage and fixed sleeps; MC0B must repair
  them without changing runtime presentation before they can produce evidence.
- FFmpeg and ffprobe 8.1.1 are available. The exact reference video was not
  found in the searched Desktop, Documents, Downloads, or OneDrive locations.
- The current route union contains chat, workbench, preview, browser, terminal,
  kanban, schedule, agents, agent-detail, project-detail, context, skills,
  benchmarks, history, tools, files, and account. Later goals add surfaces;
  MC6 freezes the final manifest from source after those goals land.

## 4. Theme Contract

### Canonical types

Task MC1 should separate canonical selectable state from untrusted/legacy
input. The exact names may follow the final repository convention, but the
domain must remain equivalent to:

```ts
export const SELECTABLE_THEME_IDS = ['jarvis', 'vibespace', 'default', 'monochrome'] as const;

export type SelectableTheme = (typeof SELECTABLE_THEME_IDS)[number];
export type ResolvedDocumentTheme = 'jarvis' | 'vibespace' | 'dark' | 'monochrome';
export type LegacyPersistedThemeId = 'light' | 'dark' | 'system';
```

Remove the ambiguous active `Theme` union or retain it only as a temporary
deprecated alias of `SelectableTheme` while consumers migrate. Do not keep
legacy IDs in active state merely for parser convenience. Default deliberately
resolves to the existing dark document selector:

| Stored preference | Document theme |
| ----------------- | -------------- |
| `jarvis`          | `jarvis`       |
| `vibespace`       | `vibespace`    |
| `default`         | `dark`         |
| `monochrome`      | `monochrome`   |

`applyThemeToDocument('default')` sets `data-theme="dark"` and
`data-theme-preference="default"`. No runtime document resolver accepts an
unknown or legacy input.

### Generated contract and boundary-specific parsing

Create one generated dataset and these exact functions:

```ts
parseSelectableTheme(value: unknown): SelectableTheme | null;
normalizePersistedTheme(value: unknown): SelectableTheme;
resolveDocumentTheme(theme: SelectableTheme): ResolvedDocumentTheme;
parseThemeCommandArgument(value: string): SelectableTheme | null;
parseThemeSyncMessage(value: unknown): SelectableTheme | null;
```

Policies are intentionally different:

- storage/startup is total: canonical IDs remain; `light -> monochrome`,
  `dark | system | malformed | unknown -> default`;
- runtime setters and document resolution accept only `SelectableTheme`;
- sync accepts canonical IDs plus exact legacy `light`, but rejects `dark`,
  `system`, command aliases, malformed envelopes, and unknown strings;
- command parsing is trimmed/case-insensitive and uses the complete table
  below; unknown, empty, and `system` reject rather than selecting Default.

Command compatibility is exact:

| Argument                                  | Result       |
| ----------------------------------------- | ------------ |
| `jarvis`, `jarvis core`, `core`           | `jarvis`     |
| `vibespace`, `vibe`                       | `vibespace`  |
| `default`, `dark`                         | `default`    |
| `monochrome`, `mono`, `terminal`, `light` | `monochrome` |
| `system`, unknown, empty                  | reject       |

All tables come from `app/src/features/appearance/themeContract.source.json`;
`scripts/visual-monochrome/generate-theme-contract.mjs` deterministically emits
`themeContract.generated.ts` and `app/public/theme-prepaint.js`. Generated
files are never hand-edited, and `--check` blocks stale development/build
output. No media query may turn `system` into Light after normalization.

### Public registry and aliases

The final registry order and labels are exact:

1. `jarvis` - Jarvis Core
2. `vibespace` - VibeSpace
3. `default` - Default
4. `monochrome` - MonoChrome

Use the concise MonoChrome description
`Terminal-inspired developer console.` Other theme names and descriptions stay
unchanged unless an earlier approved goal has already changed them.

The command aliases above remain compatible. `light` and `dark` are parser-only
legacy spellings; neither appears in the picker, autocomplete, current help,
command palette, or active action labels. Existing `jarvis core`, `core`, and
`vibe` aliases are preserved. Sync never accepts these command aliases, and
storage never persists an alias as canonical state.

### Version 5 persistence

- Bump only the UI store persistence version from 4 to 5.
- `migratePersistedUiState(value, version)` clones record-like v4 state and
  changes only its `theme`; older migrations remain intact.
- `mergePersistedUiState(value, currentState)` always normalizes the theme,
  including version-5/current-version hydration, while preserving current
  methods/defaults and unrelated persisted keys.
- Preserve every unrelated property byte-for-byte at the JavaScript value
  level. Do not reconstruct the store from a theme-only allowlist for v4->v5.
- If the persisted state is null, an array, or another malformed root, fall
  back safely to an object containing the default theme and let Zustand merge
  defaults.
- Run the same normalization for malformed version-5/current-version hydration
  because version gates alone do not validate untrusted storage.
- Repeat migration produces the same state.
- Change `safeLocalStorage.ts` to use the same generated storage normalizer and
  `UI_STORE_VERSION = 5`; quota recovery cannot write `dark` or a stale version.
- Never touch chat, context, canvas, file, agent, skill, prompt, schedule,
  project, billing, or account data.

### Document and cross-window contract

- Applying MonoChrome sets both `data-theme="monochrome"` and
  `data-theme-preference="monochrome"`.
- Applying Default sets `data-theme="dark"` and
  `data-theme-preference="default"`.
- No normalized path emits active `data-theme="light"`.
- Detached messages with canonical IDs or exact legacy `light` are accepted;
  `dark`, `system`, command aliases, unknown, malformed, or unrelated messages
  are rejected.
- The listener cleanup removes exactly the installed handler.
- A received theme updates document state and in-memory state without
  republishing the same message and creating a feedback loop.
- Pixel Pet's transparent first-paint branch wins over all theme background
  application.

## 5. Requirement Ledger

Every implementation commit and final evidence index references these IDs.

| ID     | Requirement                                                                                                           | Primary proof                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| MC-001 | Four selectable themes remain in exact order                                                                          | registry unit test            |
| MC-002 | Light is absent from all active selection surfaces                                                                    | source audit + UI tests       |
| MC-003 | MonoChrome public label and internal ID are exact                                                                     | registry/UI tests             |
| MC-004 | Legacy Light maps to MonoChrome                                                                                       | normalization/migration tests |
| MC-005 | storage maps dark/system/unknown/malformed to Default; stricter boundaries reject                                     | table-driven boundary tests   |
| MC-006 | v4->v5 preserves unrelated UI settings                                                                                | deep-equality migration test  |
| MC-007 | current-version malformed theme is normalized                                                                         | hydration integration test    |
| MC-008 | migration is idempotent                                                                                               | repeat-migration test         |
| MC-009 | prepaint applies canonical theme before React                                                                         | boot script DOM test          |
| MC-010 | Pixel Pet remains transparent from first paint                                                                        | boot + visual/native test     |
| MC-011 | detached windows normalize and apply legacy/current messages                                                          | listener integration test     |
| MC-012 | all preserved and new command aliases follow the exact parser-only table                                              | parser/action tests           |
| MC-013 | no active Light CSS or app-owned Light xterm palette remains                                                          | source/style audit            |
| MC-014 | CSS is rooted under the MonoChrome selector                                                                           | selector audit                |
| MC-015 | seed tokens provide true-black/near-black hierarchy                                                                   | computed-style test           |
| MC-016 | 1px neutral borders and small-radius vocabulary dominate                                                              | metrics report                |
| MC-017 | gradients, blur, glow, and large shadows are absent in scope                                                          | CSS + computed-style audit    |
| MC-018 | bundled sans and JetBrains Mono roles are used; no new font                                                           | dependency/font test          |
| MC-019 | shared primitives cover required interactive states                                                                   | workbench + a11y tests        |
| MC-020 | shell, rail, navigation, overlays, and chrome are themed                                                              | route visual suite            |
| MC-021 | all final integrated routes are audited                                                                               | frozen route manifest         |
| MC-022 | functional behavior and product copy remain unchanged                                                                 | focused + full regressions    |
| MC-023 | Default, VibeSpace, and Jarvis Core do not regress                                                                    | before/after visual diffs     |
| MC-024 | Origami chat remains isolated                                                                                         | Origami visual/function diff  |
| MC-025 | remote provider content is never styled or injected                                                                   | boundary/security test        |
| MC-026 | Canvas/graph performance avoids expensive effects                                                                     | performance trace             |
| MC-027 | reduced motion, zoom, narrow desktop, focus, contrast pass                                                            | a11y matrix                   |
| MC-028 | Windows native/high-DPI appearance passes                                                                             | Tauri smoke evidence          |
| MC-029 | reference video measurements are documented honestly                                                                  | local analysis report         |
| MC-030 | third-party identity/content is not copied                                                                            | independent design review     |
| MC-031 | theme switch does not remount routes or reload data                                                                   | integration/perf test         |
| MC-032 | no user content is changed by migration or theme switch                                                               | repository/storage test       |
| MC-033 | visual workbench is dev-only and absent from prod navigation                                                          | build/route test              |
| MC-034 | deterministic visual fixtures lock time, data, fonts, motion, and viewport                                            | harness tests                 |
| MC-035 | final handoff reports verified, mocked, blocked, and untested facts                                                   | evidence audit                |
| MC-036 | generated TypeScript/prepaint assets stay in sync and satisfy CSP/order                                               | generator/build contract test |
| MC-037 | explicit user/per-terminal palette and ANSI colors outrank app theme                                                  | terminal resolver tests       |
| MC-038 | isolated native profile/identifier/PID/port proof protects existing app                                               | native-session evidence       |
| MC-039 | six exact reference artifacts validate against committed JSON/frontmatter/body contracts                              | schema/privacy tests          |
| MC-040 | Zoom 100/125/150/200, forced colors, target size, and status contrast pass                                            | a11y matrix                   |
| MC-041 | optimized Windows/WebView2 smoke and package build pass; installer/macOS/Linux gaps stay exact SKIPPED_NOT_APPLICABLE | platform matrix               |

## 6. Dependency and Parallelization Map

```text
MC0A read-only spec/reference inventory
             |
Goals 1-7 integrated and functionally stable
             |
Origami stable with frozen acceptance oracle
             |
MC0B final discovery + tooling-only harness repair
             |
full green/known-failure stabilization ledger
             |
freeze route/primitive/overlay/detached/native manifests
             |
capture immutable Default/VibeSpace/Jarvis/Origami baselines
             |
MC1 generated theme contract + v5 migrate/merge
             |
MC2 CSP-safe prepaint + strict sync + every selection surface
             |
       +--------------------+
       v                    v
MC3 tokens/xterm       MC4 primitive audit + dev workbench
       +--------------------+
             |
             v
          MC5 shell (consumes frozen baselines)
             |
             v
       MC6 validate/freeze lane ownership manifest
             |
       +-----+-----+-----+
       v           v     v
     MC7A        MC7B   MC7C... (non-overlapping route lanes)
       +-----------+-----+
                   |
       +-----------+-----------+
       v                       v
MC8 reference calibration   MC9 deterministic regression
       +-----------+-----------+
                   |
                   v
             MC10 review/handoff
```

- Before MC0B, only MC0A read-only reference/spec work may run.
- MC0B admits MC1 only when earlier-goal and Origami presentation/route files
  are frozen at the recorded source commit, full functional stabilization is
  green or has an accepted known-failure ledger, and preserved-theme baselines
  include source/harness/route/fixture/font/viewport/screenshot hashes.
- MC1 and MC2 are serial because they own shared theme authority.
- MC3 and MC4 may overlap only after MC2 commits and only with disjoint files.
- MC5 consumes immutable `B0`. It verifies the stored bundle's own hashes and
  provenance, not equality with current post-MC1 source. No post-change
  screenshot becomes a replacement “before” oracle. A true upstream rebase
  follows the clean-worktree recapture/replay procedure above.
- MC7 lanes may run concurrently only after MC6 freezes exact, non-overlapping
  manifests and no earlier-goal owner holds a logical or file lock.
- MC8 and MC9 may overlap after route styling freezes. MC8 stays blocked until
  the exact recording is available; MC9 continues independently.
- With four concurrency slots, use at most three subagents plus the primary
  coordinator. A worker may not choose a model; all spawned agents use the
  collaboration runtime supplied by the current Codex session.

## 7. Tasks MC0A/MC0B: Read-Only Inventory, Stabilization, and Baselines

**Output files:**

- Modify: `docs/unified-goals/EXECUTION_PLAN.md`
- Create: this plan
- Create later: `docs/appearance/monochrome/REFERENCE_ANALYSIS.md`
- Create later: `docs/appearance/monochrome/FRAME_MANIFEST.json`
- Create later: `docs/appearance/monochrome/DESIGN.md`
- Create later: `docs/appearance/monochrome/design-tokens.json`
- Create later: `docs/appearance/monochrome/reference-spec.json`
- Create later: `docs/appearance/monochrome/component-mapping.md`
- Create later: `docs/appearance/monochrome/schemas/frame-manifest.schema.json`
- Create later: `docs/appearance/monochrome/schemas/design-tokens.schema.json`
- Create later: `docs/appearance/monochrome/schemas/reference-spec.schema.json`
- Create later: `docs/appearance/monochrome/route-coverage.md`
- Create later: `docs/appearance/monochrome/evidence-index.md`
- Modify in MC0B only for current-source readiness: `scripts/boot-validation.mjs`
- Modify in MC0B only for current-source readiness:
  `scripts/capture-screenshots.mjs`
- Modify first in MC0B: `.gitignore` to ignore `.artifacts/monochrome/`
- Create in MC0B: `scripts/visual-monochrome/legacy-visual-scripts.test.mjs`
- Create in MC0B: `tests/visual/monochrome/fixtures.ts`
- Create in MC0B: `tests/visual/monochrome/fixture-manifest.ts`
- Create in MC0B: `tests/visual/monochrome/fixture-manifest.test.ts`
- Create in MC0B: `tests/visual/monochrome/route-manifest.ts`
- Create in MC0B: `tests/visual/monochrome/route-manifest.test.ts`
- Create in MC0B: `app/src/features/appearance/monochromePrimitiveManifest.ts`
- Create in MC0B: `app/src/features/appearance/monochromePrimitiveManifest.test.ts`
- Create in MC0B: `tests/visual/monochrome/shell-overlay-manifest.ts`
- Create in MC0B: `tests/visual/monochrome/shell-overlay-manifest.test.ts`
- Create in MC0B: `tests/visual/monochrome/native-window-manifest.ts`
- Create in MC0B: `tests/visual/monochrome/native-window-manifest.test.ts`
- Create in MC0B Step 8: `tests/visual/monochrome/baseline-manifest.ts`
- Create in MC0B Step 8: `tests/visual/monochrome/baseline-manifest.test.ts`
- Create in MC0B: `scripts/visual-monochrome/manifest-contract.test.mjs`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/default/chat.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/default/settings-appearance.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/default/terminal-workbench.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/vibespace/chat.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/vibespace/settings-appearance.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/vibespace/terminal-workbench.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/jarvis/chat.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/jarvis/settings-appearance.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/jarvis/terminal-workbench.png`
- Create in MC0B and retain as immutable synthetic fixtures:
  `tests/visual/monochrome/baselines/b0/origami/chat.png`

MC0A contains Steps 1, 3, and 4 below and is read-only except for this approved
plan/unified-plan documentation. MC0B contains final discovery, tooling-only
harness correction, stabilization, manifest freeze, and preserved-theme
baseline capture. MC0B may begin only after Goals 1-7 and Origami are stable at
one recorded commit; neither MC0A nor MC0B changes runtime presentation.

- [ ] **Step 1: Verify protected state and source identity**

```powershell
git status --short --branch
git worktree list --porcelain
Get-FileHash -Algorithm SHA256 'C:\Users\viper\Downloads\VibeSpace_MonoChrome_Appearance_Master_Goal.md'
Get-Process | Where-Object { $_.ProcessName -match 'node|vite|tauri|cargo' }
```

Record, but do not alter, the unrelated installer deletion and pre-existing
processes.

- [ ] **Step 2 (MC0B): Re-discover final architecture after prior goals stabilize**

```powershell
rg --files app/src/components/ui app/src/components/layout app/src/features
rg -n "Theme|data-theme|light|dark|system|gradient|backdrop-blur|shadow-|rounded-" app/src app/index.html
rg -n "export type Route|routeMap|setRoute" app/src
rg -n "BrowserChannel|BroadcastChannel|vibespace:appearance" app/src
```

Write exact final manifests; do not assume that planned Prompt Forge, Canvas,
Browser Chat, messaging, or Browser Operator paths match the master goal's
illustrative names.

- [ ] **Step 3: Locate the exact recording without broad or destructive work**

Search user-provided and conventional media locations by exact filename. If it
is absent, write the exact paths searched and continue every non-MC8 task.

- [ ] **Step 4: If available, inspect metadata without extracting media**

```powershell
ffprobe -v error -show_format -show_streams '<REFERENCE_VIDEO>'
```

Record duration, codec, pixel dimensions, frame rate, color metadata, content
viewport, and the intended extraction command. MC0A does not extract frames:
MC0B must first add the exact `.artifacts/monochrome/` ignore and prove it with
`git check-ignore`. Never place the video or frames under a tracked path.

- [ ] **Step 5: Freeze coordination state**

Record IMPLEMENTING status and exact logical/file ownership in the authorized
coordination ledger. If the repository lock helper is absent, document that
fact; do not fabricate a lock acquisition.

- [ ] **Step 6 (MC0B): Establish the stabilization ledger**

Run the complete existing functional/typecheck/build/Rust-affected matrix at
the frozen upstream commit. Record every command, commit, environment, result,
and pre-existing failure. Any failure caused by Goals 1-7/Origami is repaired
under its owning phase before MonoChrome proceeds; an accepted unrelated known
failure must have reproducible evidence and owner. MC1 cannot begin while a
relevant route or shared primitive is still changing.

- [ ] **Step 7 (MC0B): Repair visual tooling without presentation changes**

Make the `.gitignore` addition the first MC0B filesystem change and verify
`.artifacts/monochrome/probe` is ignored. Only then, if the exact recording is
available, may FFmpeg write frames below
`.artifacts/monochrome/<session>/reference/`; the recording and extracted
frames remain untracked.

Repair `scripts/boot-validation.mjs` and `scripts/capture-screenshots.mjs` so
they derive valid current theme IDs/store version from source, read the current
app version from `app/package.json`, and wait for visible shell, font readiness,
and stable layout instead of fixed sleeps. Add deterministic synthetic fixture
data and exact source-derived route/overlay/detached/native/primitive manifests.
After MC1 generates the target contract, both scripts must switch to the
generated constants and version-5 envelopes; the final contract test rejects
`jarvis-core`, version `12`, fixed sleep readiness, or duplicated theme tables.

`manifest-contract.test.mjs` inventories Tauri plugin registration,
capabilities, startup hooks, registry/keychain/home writers, launcher/install,
relaunch, tray, global-shortcut, single-instance, deep-link, updater, and
autostart call sites. At MC0B it is inventory-only: it freezes every discovered
side-effect call site and the current guard/seam state, and fails only for an
incomplete inventory, schema error, unstable ordering, or source-path drift.
It must not require runtime guards that MC9 has not implemented. MC9 first
writes RED assertions against this frozen inventory, then implements and proves
the explicit `monochrome-visual-test` guards and injected effect seams.

The source-derived `native-window-manifest.ts` also freezes every production
capability file path, its declared identifier, governed window patterns, and
SHA-256 at the MC0B source commit. At the present reviewed source this exact
identifier set is `default`, `workbench-window`, `pet-overlay`, and
`pet-mini-panel`; drift before MC9 requires a reviewed manifest amendment, not
silent omission. Its validator rejects duplicate identifiers, unrepresented
capability files, a capability whose file identifier changed, and any
`monochrome-test` entry in the production set.

The exact MC0B manifest paths are the fixture, route, primitive,
shell/overlay, detached/native-window, and baseline files listed above. The
Step 7 harness commit contains the first five source-derived manifests and
their validators; the content-bearing baseline manifest and its validator are
created only in Step 8 beside the captured PNGs. Each contains schema version,
source commit, literal owned paths, fixture IDs/hashes, consumer task, and
validator command. Their tests prove path existence, non-overlap,
route/primitive/window closure, and stable ordering. MC4 and MC6 consume or
review-amend these committed files; they never create a different late manifest
with the same authority.

After Step 7 and its green inventory/manifests, commit exactly
`test(monochrome): freeze baseline harness and manifests`. This harness commit
must exist before any `B0` manifest is generated; it is the literal
`harnessCommit` recorded by Step 8.

- [ ] **Step 8 (MC0B): Capture immutable preserved-theme baselines**

Capture Default, VibeSpace, Jarvis Core, and Origami from synthetic isolated
data before MC1 at the ten literal `baselines/b0/` paths listed above. Record
the frozen Goals-1-7/Origami source commit, the already-created Step 7 harness
commit, route-manifest SHA-256, fixture SHA-256, viewport/device scale,
locale/time/motion, successful font readiness, and every screenshot SHA-256 in
`baseline-manifest.ts`. The manifest never attempts to contain the SHA of its
own future commit. Verify the complete bundle, then commit exactly
`test(monochrome): capture immutable preserved-theme baseline B0`; record that
resulting commit in the coordination/evidence ledger after commit creation.

Before MC1, any manifest, fixture, font, harness, or relevant upstream source
drift forces recapture. After MC1, verify `B0`'s stored files/hashes and compare
preserved-theme output to those screenshots; expected MonoChrome implementation
changes do not invalidate the oracle. The ten tracked PNGs are immutable and
remain retained through the successor draft PR and its review. A legitimate
upstream replacement is captured in a new `b0-r<ordinal>/` directory; the old
directory remains until the replacement is independently accepted and a later,
separate supersession commit documents its retirement. MC5 consumes `B0` and
does not create, overwrite, or silently prune it.

## 8. Task MC1: Canonical Theme Contract and Store v5 Migration

**Files:**

- Modify: `app/src/types/common.ts`
- Create: `app/src/features/appearance/themeContract.source.json`
- Create: `app/src/features/appearance/themeContract.generated.ts`
- Create: `app/src/features/appearance/themeContract.ts`
- Create: `app/src/features/appearance/themeContract.test.ts`
- Modify: `app/src/features/appearance/themes.ts`
- Modify: `app/src/features/appearance/themes.test.ts`
- Modify: `app/src/stores/ui.ts`
- Modify: `app/src/stores/ui.test.ts`
- Create: `app/src/stores/ui.themePersistence.test.ts`
- Modify: `app/src/lib/persistence/safeLocalStorage.ts`
- Create: `app/src/lib/persistence/safeLocalStorage.test.ts`
- Create: `scripts/visual-monochrome/generate-theme-contract.mjs`
- Create: `scripts/visual-monochrome/theme-contract.test.mjs`
- Modify: `scripts/visual-monochrome/legacy-visual-scripts.test.mjs`
- Generate: `app/public/theme-prepaint.js` (not loaded until MC2)

**Commit:** `feat(appearance): replace Light with MonoChrome theme registry`

- [ ] **Step 1: Write RED registry and normalization tests**

Assert exact selectable/document types, registry IDs/order/labels, all five
boundary functions and their different policies, complete preserved/new alias
table, Default-to-dark resolution, idempotence, and absence of legacy IDs from
runtime setters. Observe failure because the generated contract and
MonoChrome registry do not exist and current code conflates legacy/runtime
state.

```powershell
npm --prefix app test -- src/features/appearance/themeContract.test.ts src/features/appearance/themes.test.ts
node --test scripts/visual-monochrome/theme-contract.test.mjs scripts/visual-monochrome/legacy-visual-scripts.test.mjs
```

- [ ] **Step 2: Write RED persistence tests before store code**

Build v4 and v5 fixtures containing every persisted UI key plus nested
sentinels. Assert `migratePersistedUiState()` changes only v4 theme,
`mergePersistedUiState()` validates current-version/malformed roots while
retaining Zustand methods/defaults, unrelated keys remain deeply equal,
repetition is idempotent, and quota recovery uses version 5 plus the shared
storage normalizer. Observe failure in the exact store/safe-storage tests.

- [ ] **Step 3: Implement the smallest pure contract**

Create the source JSON with storage key `jarvis-ui`, store version `5`, exact
selectable IDs, persisted legacy mappings, document mappings, sync-only legacy
mapping, complete command aliases, and fallback `default`. Generate the
TypeScript constants and classic prepaint asset deterministically. Implement
the five exact boundary functions; no hand-copied table is allowed.

- [ ] **Step 4: Implement v5 migration and always-on hydration validation**

Implement pure migrate and merge functions, wire both into Zustand persistence,
and update safe-local-storage quota recovery. Normalize only `theme`, preserve
all other keys/methods, retain older migrations, remove system media authority,
and never retain Light as a resolved document theme.

- [ ] **Step 5: Verify focused and widened contracts**

```powershell
npm --prefix app test -- src/features/appearance/themeContract.test.ts src/features/appearance/themes.test.ts src/stores/ui.test.ts src/stores/ui.themePersistence.test.ts src/lib/persistence/safeLocalStorage.test.ts
node --test scripts/visual-monochrome/theme-contract.test.mjs scripts/visual-monochrome/legacy-visual-scripts.test.mjs
node scripts/visual-monochrome/generate-theme-contract.mjs --check
npm --prefix app run typecheck
npx --prefix app prettier --check src/types/common.ts src/features/appearance/themeContract.source.json src/features/appearance/themeContract.generated.ts src/features/appearance/themeContract.ts src/features/appearance/themeContract.test.ts src/features/appearance/themes.ts src/features/appearance/themes.test.ts src/stores/ui.ts src/stores/ui.test.ts src/stores/ui.themePersistence.test.ts src/lib/persistence/safeLocalStorage.ts src/lib/persistence/safeLocalStorage.test.ts
git diff --check
```

Review the diff specifically for unrelated persisted-key mutation.

- [ ] **Step 6: Stage the exact sixteen files and commit**

Stage only the files listed above (counting generated prepaint and the two
scripts/tests), inspect cached-name parity and full diff, then run installer,
secret, and whitespace gates before the named commit.

## 9. Task MC2: First Paint, Detached Sync, and Selection Surfaces

**Exact files at the MC0B freeze (manifest drift requires amendment before RED):**

- Modify: `app/index.html`
- Modify: `app/src/main.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/package.json`
- Modify: `app/src/features/appearance/themeSync.ts`
- Modify: `app/src/features/appearance/themeSync.test.ts`
- Create: `app/src/features/appearance/themePrepaint.integration.test.ts`
- Modify: `app/src/features/settings/sections/Appearance.tsx`
- Modify: `app/src/features/settings/sections/Appearance.test.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/chat/Composer.paths.test.ts`
- Modify: `app/src/features/chat/SlashCommandTypeahead.tsx`
- Modify: `app/src/features/chat/SlashCommandTypeahead.test.ts`
- Modify: `app/src/features/command-palette/actions.ts`
- Create: `app/src/features/command-palette/actions.theme.test.ts`
- Modify: `app/src/lib/actions/registry.ts`
- Create: `app/src/lib/actions/registryTheme.test.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.test.ts`
- Modify: `scripts/boot-validation.mjs`
- Modify: `scripts/capture-screenshots.mjs`
- Modify: `scripts/visual-monochrome/theme-contract.test.mjs`
- Modify: `scripts/visual-monochrome/legacy-visual-scripts.test.mjs`

**Commit:** `feat(appearance): migrate startup sync and commands to MonoChrome`

- [ ] **Step 1: Write RED startup tests**

Cover persisted MonoChrome, legacy Light, dark/system/unknown, unavailable or
throwing storage, malformed JSON, and pet-overlay query state. Assert the
canonical attributes exist before React mounts and the pet overlay remains
transparent.

- [ ] **Step 2: Implement a CSP-safe prepaint path**

Start `index.html` as
`<html lang="en" data-theme="dark" data-theme-preference="default">` and load
`<script src="/theme-prepaint.js"></script>` before the module bundle. The
generated classic script detects/marks `view=pet-overlay`, preserves transparent
inline/background state, reads only `jarvis-ui`, safely parses Zustand
`{ state, version }`, applies storage normalization, and sets preference plus
resolved document attributes. It contains no inline executable code, eval,
`new Function`, remote URL, or React import. Fold the existing inline pet
bootstrap into it and retain only tightly scoped transparency CSS.

Remove the post-render seam. `ThemeHost` may remain as a reactive follower but
must no longer resolve `system` or produce `light`.

Add `prejarvis` and `prebuild` in `app/package.json` to run the generator
`--check`. Node tests build the app, parse `dist/index.html`, and prove the
self-hosted prepaint asset precedes `main.tsx` and satisfies Tauri
`script-src 'self'` CSP.

- [ ] **Step 3: Write RED sync lifecycle tests**

Factory-wrap/inject BroadcastChannel and prove canonical ID plus legacy-Light
acceptance; dark/system/command-alias/unknown/malformed/unrelated rejection;
one update per message; no echo; exact handler/channel close; and detached
document application. Module-singleton state is not accepted as a test seam.

- [ ] **Step 4: Implement canonical message handling**

Publish only canonical IDs. Use `parseThemeSyncMessage()`, never storage or
command parsing, and apply without republishing.

- [ ] **Step 5: Replace every user-facing Light surface**

Update the Appearance card/icon/description, `/theme` help and typeahead,
command palette, normal action registry, JARVIS action registry, toggles, and
focused tests. Rename `theme.light` to `theme.monochrome`; the visible toggle
becomes Default<->MonoChrome. Preserve `jarvis core`, `core`, `vibe`, and `dark`
command compatibility while hiding every parser-only alias from current help.
Preserve product copy unrelated to the theme choice. The
terminal/console icon should represent MonoChrome. Keyboard and radio-group
semantics must remain intact.

- [ ] **Step 6: Prove the active surface is gone**

```powershell
@'
theme-light|Switch to Light|Light theme|setTheme\('light'\)|data-theme=['"]light|id: 'light'
'@ | rg -n -f - app/src app/index.html
```

Every remaining `light` occurrence must be either an explicit legacy
normalization fixture, historical comment that is still accurate, or an
unrelated use of the English word. Document each exception.

- [ ] **Step 7: Verify**

Run the exact focused tests for prepaint, sync, Appearance, Composer,
typeahead, command palette, both registries, UI-store hydration, then run:

```powershell
npm --prefix app test -- src/features/appearance/themePrepaint.integration.test.ts src/features/appearance/themeSync.test.ts src/features/settings/sections/Appearance.test.tsx src/features/chat/Composer.paths.test.ts src/features/chat/SlashCommandTypeahead.test.ts src/features/command-palette/actions.theme.test.ts src/lib/actions/registryTheme.test.ts src/lib/actions/registryJarvisCore.test.ts
node --test scripts/visual-monochrome/theme-contract.test.mjs scripts/visual-monochrome/legacy-visual-scripts.test.mjs
node scripts/visual-monochrome/generate-theme-contract.mjs --check
npm --prefix app run typecheck
npm run build
git diff --check
```

- [ ] **Step 8: Stage only the exact MC2 manifest and commit**

Inspect cached-name parity/full diff and rerun focused, build, secret,
installer, and whitespace gates before the named commit.

## 10. Task MC3: Scoped Tokens, CSS Layer, and xterm Palette

**Files:**

- Create: `app/src/styles/monochrome-theme.css`
- Modify: `app/src/main.tsx`
- Modify only for removal of active Light blocks or shared variable plumbing:
  `app/src/styles/globals.css`
- Modify only for removal of active Light blocks or correct import isolation:
  `app/src/styles/vibespace-theme.css`
- Modify if semantic token mapping requires it: `app/tailwind.config.ts`
- Create: `scripts/visual-monochrome/monochrome-css.test.mjs`
- Create: `app/src/features/terminals/terminalTheme.ts`
- Create: `app/src/features/terminals/terminalTheme.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/terminals/TerminalView.execution.test.tsx`

**Commit:** `style(monochrome): add scoped semantic tokens and terminal palette`

- [ ] **Step 1: Write RED token-scope tests**

Parse the stylesheet or mount a minimal DOM and assert the root scope, seed
palette, semantic aliases, radius, selection, caret, scrollbar, motion, and
reduced-motion contracts. Assert no unscoped body/card/font/radius/gradient
override is introduced and no remote URL is present. The exact RED owner is
`scripts/visual-monochrome/monochrome-css.test.mjs`; observe it fail before the
stylesheet exists.

- [ ] **Step 2: Add the MonoChrome layer after existing themes**

Use `html[data-theme='monochrome']` as the only authority. Define core surface,
text, border, accent, focus, radius, elevation, typography, selection, caret,
scrollbar, duration, and easing variables. Reuse existing semantic variables
so component-level overrides stay small.

The initial contract uses `--radius-sm: 1px`, `--radius: 2px`,
`--radius-lg: 3px`, `--bloom-image: none`, no soft/cozy shadow beyond a solid
one-pixel separation, a 4px spacing rhythm, 28-36px dense control heights, and
6-8px square/1px-radius scrollbars. Map existing semantic accents instead of
renaming components: cyan to teal; violet/accent/lavender to purple;
copper/amber/terracotta/honey to amber; rose to muted red; sage/sage-deep to
green levels; cream to white. Preserve circular avatars, status/radio dots,
audio orb, charts, and user-created Canvas geometry as documented exceptions.
Use Inter or Plus Jakarta Sans at a 12-13px compact body default and JetBrains
Mono at 10-12px for technical labels/metadata with tabular numerals. Override
MonoChrome `h1`/`h2`/`h3` and `.font-display` away from Fraunces without
changing another theme's font stack.

- [ ] **Step 3: Remove active Light CSS**

Delete Light-only selector blocks once no runtime can select them. Do not
change Default, VibeSpace, Jarvis Core, or Origami values. If a shared base
rule must change, demonstrate identical computed values for all preserved
themes.

- [ ] **Step 4: Extract and test terminal palette selection**

Move pure xterm theme selection out of the large view. Add an exact
MonoChrome palette derived from semantic tokens or synchronized constants;
remove the active Light palette. Preserve xterm instance lifecycle, scrollback,
input, PTY, snapshots, and MutationObserver behavior.

The resolver signature and precedence are exact:

```ts
resolveTerminalTheme(input: {
  documentTheme: ResolvedDocumentTheme;
  explicitUserTheme: Readonly<ITheme> | null;
}): Readonly<ITheme>;
```

1. a valid explicit user/per-terminal override;
2. the app-owned MonoChrome palette for `monochrome`;
3. the existing Jarvis palette for `jarvis`;
4. the established dark/current VibeSpace behavior for `dark`/`vibespace`;
5. safe dark fallback.

The MutationObserver never overwrites an explicit override. If the integrated
branch has no override contract, record that fact, retain the resolver seam,
and test the absent-override behavior without inventing a setting. Preserve
PTY-provided ANSI/true-color escape values, selection, scrollback, splits,
detached windows, snapshots, input, and lifecycle; app theme controls only
VibeSpace-owned xterm presentation. “No Light palette” means no active
app-owned Light palette and never erases a user-defined scheme name.

- [ ] **Step 5: Verify CSS cost and isolation**

Record stylesheet byte size and selector count. Reject remote assets, filters,
large shadows, backdrop blur, animation loops, unscoped rules, and broad
`!important`. Run terminal-focused tests covering ANSI/true-color, explicit
override before/after MutationObserver updates, Default dark behavior, theme
switches, split/detached terminals, PTY content, lifecycle and snapshots; then
typecheck, build, and a source audit. At minimum run:

```powershell
node --test scripts/visual-monochrome/monochrome-css.test.mjs
npm --prefix app test -- src/features/terminals/terminalTheme.test.ts src/features/terminals/TerminalView.execution.test.tsx
npm --prefix app run typecheck
npm run build
```

Stage the exact listed files only.

## 11. Task MC4: Primitive Audit and Development-Only Workbench

**Initial shared files to inspect:**

- `app/src/components/ui/button.tsx`
- `app/src/components/ui/input.tsx`
- `app/src/components/ui/textarea.tsx`
- `app/src/components/ui/checkbox.tsx`
- `app/src/components/ui/switch.tsx`
- `app/src/components/ui/dialog.tsx`
- `app/src/components/ui/popover.tsx`
- `app/src/components/ui/tooltip.tsx`
- `app/src/components/ui/tabs.tsx`
- `app/src/components/ui/card.tsx`
- `app/src/components/ui/separator.tsx`
- `app/src/components/ui/badge.tsx`
- `app/src/components/ui/toast.tsx`
- feature-local Select, Radio, AlertDialog, Dropdown, Table, ScrollArea,
  Progress, Slider, Command, ContextMenu, and Resizable controls discovered by
  MC0

**Create in MC4:**

- `app/src/features/appearance/MonochromeWorkbench.tsx`
- `app/src/features/appearance/MonochromeWorkbench.test.tsx`
- `app/src/features/appearance/monochromeWorkbenchFixtures.ts`
- `app/src/features/appearance/monochromeWorkbenchFixtures.test.ts`

**Use/review-amend from MC0B:**

- `app/src/features/appearance/monochromePrimitiveManifest.ts`
- `app/src/features/appearance/monochromePrimitiveManifest.test.ts`

**Commit:** `style(monochrome): theme shared primitives and add visual workbench`

- [ ] **Step 1: Freeze the primitive ownership matrix**

For every required primitive, record source path, owner, states, whether it
uses semantic tokens, hard-coded utility debt, and intended MonoChrome fix.
Prefer token-driven corrections. Add component-level scoped selectors only
when a semantic token cannot express the state safely.

MC0B commits the validated exact primitive manifest before MC4 RED. Its
validator rejects missing source/tests, duplicate owners, overlapping lanes,
unrepresented native controls, or paths absent from the frozen commit. Any
discovery amendment lists literal paths and receives independent review before
execution; a placeholder such as “tests discovered at task start” is invalid.

- [ ] **Step 2: Write RED state and accessibility tests**

Cover default, hover where testable, active, focus-visible, disabled,
validation/error, checked/selected, open, loading, destructive, keyboard, and
screen-reader semantics. Never approve a visual fix that removes a focus ring
or shrinks an interactive target below the repository's accessibility
contract.

- [ ] **Step 3: Implement primitives without other-theme drift**

Map flat surfaces, 1px separators, small radii, rectangular menus/tooltips,
minimal elevation, compact labels, and restrained accents under MonoChrome.
Do not fork behavior or duplicate entire components for the theme.

Add one reusable aria-hidden 4-6px registration cross/square for selected
major dashboards, analytics cards, and grouped regions. Render the visible
`//` prefix for technical section labels through an aria-hidden pseudo-element
so accessible names and product strings remain unchanged. Neither motif may
appear on every control or add pointer events.

- [ ] **Step 4: Build the dev-only workbench from real components**

Include the master goal's top bar, icon rail, sidebar, section label, metric
cards, segmented chart, table, pricing card, numbered setup, form, all control
states, tabs, badges, tooltip, dropdown, dialog, toast, empty state, JARVIS,
Prompt Forge, Context inspector, terminal tab, Canvas toolbar, and access panel
using deterministic fixture data.

Expose it only through an explicit development query or development-only lazy
import. It must not appear in production navigation, production route unions,
release manifests, or normal bundle entry paths. Add a production-build test
for that property.

- [ ] **Step 5: Verify**

The initial RED asserts every manifest primitive/state is rendered, keyboard
operable, accessibly named, and sourced from deterministic non-user fixtures;
it fails because the workbench/manifest do not exist. Run:

```powershell
npm --prefix app test -- src/features/appearance/MonochromeWorkbench.test.tsx src/features/appearance/monochromeWorkbenchFixtures.test.ts src/features/appearance/monochromePrimitiveManifest.test.ts
npm --prefix app run typecheck
npm run build
```

Widen with every exact primitive command frozen by MC0B, keyboard/a11y smoke,
and preserved-theme computed-style sentinels. Stage only manifest-owned paths
and the listed appearance files for the named commit.

## 12. Task MC5: App Shell, Navigation, and Overlays

**Initial files:**

- `app/src/components/layout/AppShell.tsx`
- `app/src/components/layout/TopBar.tsx`
- `app/src/components/layout/ActivityStrip.tsx`
- `app/src/components/layout/NavPane.tsx`
- `app/src/components/layout/TabStrip.tsx`
- `app/src/components/layout/Inspector.tsx`
- `app/src/components/layout/PageRouter.tsx`
- `app/src/components/layout/JarvisContextMenu.tsx`
- Exact additional overlay/dialog/menu/toast and test paths from the reviewed
  MC0B shell manifest; MC5 is non-executable until that literal amendment is
  committed and its validator passes.

**Commit:** `style(monochrome): theme app shell navigation and overlays`

- [ ] **Step 1: Validate the immutable MC0B baseline oracle**

Re-hash the immutable `B0` manifest, fixture, font, viewport, and
Default/VibeSpace/Jarvis/Origami screenshot artifacts and prove their bytes
match the accepted baseline manifest. Compare current preserved-theme output
to `B0`; do not require current post-MC1 source to match `B0`'s source commit.
Do not capture a “before” image after MC1-MC4 or use user-profile data. If an
upstream rebase, rather than expected MonoChrome edits, invalidated the base,
use the clean pre-MonoChrome worktree recapture/replay procedure.

- [ ] **Step 2: Write RED MonoChrome shell assertions**

Assert body field, window chrome, top bar, icon-first primary rail, preserved
navigation access, secondary sidebar, active state, page container, focus,
tooltips, dialogs, menus, context menu, toasts, and cached-route visibility.

- [ ] **Step 3: Implement shell geometry**

Use semantic tokens first. Add registration labels only where they clarify
sections. Preserve every click target, tooltip, route, cached surface,
window-control behavior, drag region, keyboard shortcut, loading fallback, and
responsive breakpoint.

- [ ] **Step 4: Run leakage and function gates**

Compare preserved-theme screenshots and computed-style sentinels; exercise
navigation, cached terminal/preview/browser surfaces, modal focus trapping,
context menus, toasts, narrow desktop, zoom, and reduced motion.

## 13. Task MC6: Freeze the Final Route and Component Manifest

This task begins only after Goals 1-7 and Origami are integrated and stable.
It creates no visual implementation until ownership is unambiguous.

**Files:**

- Create/update: `docs/appearance/monochrome/route-coverage.md`
- Use/review-amend: `tests/visual/monochrome/route-manifest.ts`
- Use/review-amend: `tests/visual/monochrome/route-manifest.test.ts`

- [ ] **Step 1: Derive routes from code, not the master goal's guessed paths**

Enumerate the final route union, router dispatch, settings subsections,
detached windows, overlays, feature-flagged surfaces, native-only windows, and
development-only workbench. Map Goal 8 coverage for Chat, Command Center,
Prompt Forge, Browser Chat, Context, Terminal, Workbench, Agents, Skills,
Tools/plugins, Files, History/recall, Kanban, Schedule, Canvas, Account, Usage,
Billing/Plans, Providers, Settings, locked access, messaging/channels, Browser
Operator, and overlays.

- [ ] **Step 2: Freeze non-overlapping route lanes**

For each route/overlay/detached/native surface record exact route ID, source
files, tests, synthetic fixture ID/hash, functional commands, viewports, zoom/
motion states, preserved-theme baseline IDs, owner, and logical/file lock.
Do not let two agents edit a shared primitive, layout, stylesheet, registry, or
test harness concurrently.

- [ ] **Step 3: Add a coverage completeness test**

Fail when a production route or required settings/access surface has no visual
fixture and audit status. Explicitly classify unavailable future surfaces
rather than inventing a pass. Reject nonexistent production paths, duplicate or
overlapping source ownership, missing behavior commands, and route IDs not in
the frozen source-derived union. MC7 is non-executable until this manifest and
its literal lane amendments receive independent review.

## 14. Task MC7: Route Styling Lanes

All lanes consume stable MC3-MC5 contracts. Each lane is its own atomic commit,
starts with focused RED computed-style/visual assertions, changes appearance
only, runs its existing behavioral suite, and updates the coverage matrix.

### MC7A - Chat, JARVIS, voice, and Command Center

- Theme chat chrome, composer, transcript, source/artifact/action cards,
  expanded JARVIS, voice surfaces, current-run state, system panels, and
  Command Center dashboards.
- Preserve sending, streaming, model/agent pickers, Ask/Plan/Agent/Hive,
  approvals, cancellation, STT, TTS, transcript, keyboard, and Origami
  isolation.
- Commit: `style(monochrome): theme chat Jarvis and command surfaces`.

### MC7B - Context, Terminal, Workbench, and Files

- Theme Context tree/map/inspector/search, terminal tabs/tiles/xterm-owned
  chrome, Workbench panels/resizers, Files tree/dialog/editor affordances, and
  empty/error/loading states.
- Preserve context attachment, graph interaction/performance, terminal input,
  PTY/session snapshots, file operations, drag/drop, and project selection.
- Commit: `style(monochrome): theme context terminal workspace and files`.

### MC7C - Agents, Skills, Tools/plugins, and workflows

- Theme lists, detail panels, manifests, permission/trust states, RPC/workflow
  status, tool forms, plugin states, tables, badges, and empty/error states.
- Preserve agent creation/selection, skill enablement, plugins, MCP, workflow
  invocation, approval, cancellation, and provenance.
- Commit: `style(monochrome): theme agents skills tools and workflows`.

### MC7D - Prompt Forge and Infinite Canvas

- Theme Prompt Forge compose/progress/review/diff/source states and Canvas
  chrome, toolbar, inspector, frames, selection, comments, and AI job states.
- User canvas content is not recolored or rewritten unless it is app-owned
  chrome. Avoid shadow/filter work that harms large-canvas performance.
- Preserve prompt intent, diff/restore, Canvas tools, persistence, history,
  export, gestures, keyboard, and accessibility.
- Commit: `style(monochrome): theme prompt forge and canvas chrome`.

### MC7E - Browser Chat, messaging, and Browser Operator

- Theme only VibeSpace-owned shell, grant/approval chrome, pending requests,
  diagnostics, channel queues, action review, and unavailable/degraded states.
- Never inject CSS into provider pages or style remote content. Preserve
  origin, credential, cookie, upload/download, confirmation, and kill-switch
  boundaries.
- Commit: `style(monochrome): theme browser and messaging chrome`.

### MC7F - Account, Usage, Billing, Plans, Providers, access, and Settings

- Theme technical profile blocks, usage segmented bars, pricing cards,
  numbered setup, provider status, locked state, forms, settings sections, and
  Appearance picker.
- Keep charts flat and technical: thin neutral axes/grid, discrete segmented
  bars, tabular mono metrics, no gradient fill, no decorative curve, and
  semantic accent colors used only for distinct series/status. Empty charts
  retain the existing empty-state copy and accessible explanation.
- Preserve authentication, account isolation, provider config, entitlement
  truth, checkout strictly in test mode, portal, access gate, form validation,
  and persisted settings.
- Commit: `style(monochrome): theme account access billing and settings`.

### MC7G - History, recall, Kanban, Schedule, Tasks, and remaining routes

- Theme timelines, tables, filters, board columns/cards, schedule/calendar,
  job state, task forms, benchmark/preview surfaces, and every manifest item
  not covered above.
- Preserve recall, replay, drag/drop, schedule execution, task state,
  cancellation, exports, and route behavior.
- Commit: `style(monochrome): complete operational route coverage`.

### Required lane verification

For each lane:

1. Observe the intended focused visual/style failure.
2. Make the smallest scoped change.
3. Run the lane's existing unit/integration tests.
4. Run the deterministic MonoChrome screenshots and computed-style assertions.
5. Run its preserved-theme snapshots.
6. Test keyboard, focus, 200% zoom, 1024x768, narrow desktop, and reduced
   motion where the surface is interactive.
7. Review for business-logic or copy changes; the expected count is zero.
8. Update exact route/status/evidence rows before committing.

## 15. Tasks MC8A/MC8B: Reference Artifacts and Measured Calibration

MC8A is locally actionable without the recording and creates validated truthful
skeleton artifacts. MC8B's measured fields/calibration have the one hard
dependency: the exact reference video becomes available.

**Files:**

- Create/update: `docs/appearance/monochrome/REFERENCE_ANALYSIS.md`
- Create/update: `docs/appearance/monochrome/FRAME_MANIFEST.json`
- Create/update: `docs/appearance/monochrome/DESIGN.md`
- Create/update: `docs/appearance/monochrome/design-tokens.json`
- Create/update: `docs/appearance/monochrome/reference-spec.json`
- Create/update: `docs/appearance/monochrome/component-mapping.md`
- Create: `docs/appearance/monochrome/schemas/frame-manifest.schema.json`
- Create: `docs/appearance/monochrome/schemas/design-tokens.schema.json`
- Create: `docs/appearance/monochrome/schemas/reference-spec.schema.json`
- Create: `docs/appearance/monochrome/schemas/reference-analysis.schema.json`
- Create: `docs/appearance/monochrome/schemas/design.schema.json`
- Create: `docs/appearance/monochrome/schemas/component-mapping.schema.json`
- Create: `scripts/visual-monochrome/analyze-reference.mjs`
- Create: `scripts/visual-monochrome/reference-artifacts.test.mjs`
- Modify as measurements require: `app/src/styles/monochrome-theme.css`
- Modify narrowly as measurements require: MonoChrome-only component styles
- Local ignored output: extracted frames, crops, sampled palettes, diff images

**Commits:** `docs(monochrome): add validated reference evidence contracts`,
then, only when measurable, `style(monochrome): calibrate reference-locked visual system`.

The three JSON artifact schemas require:

- frame manifest: schema version, measured/blocked status, sanitized source
  metadata and SHA-256, codec/color/content crop, timestamp/frame number,
  scene/state tags, crop/excluded regions, purpose, and private-data disposition;
- design tokens: seed/measured/final value, provenance, frame/ROI samples,
  sampling method/count/dispersion, and tested contrast pairs; and
- reference spec: viewport/crop, typography candidates/decision, geometry
  samples/range/confidence, motion samples, accent ratio, and motif-comparison
  tolerances.

Each of the three Markdown artifacts begins with a delimited JSON-frontmatter
object validated by its committed schema. Common fields are schema version,
artifact ID, measured/blocked status, evidence cutoff, expected source name,
sanitized source hash or null, linked artifact IDs, and privacy disposition.
`reference-artifacts.test.mjs` also parses the Markdown body and requires:

- `REFERENCE_ANALYSIS.md`: Source Status, Reproducible Method, Frame Evidence,
  Palette, Typography, Geometry, Motion, Limitations, and Privacy headings;
- `DESIGN.md`: Authority, Direction, Hierarchy, Tokens, Components,
  Accessibility, Motion, Preserved Themes, and Anti-Goals headings; and
- `component-mapping.md`: a machine-parseable table containing mapping ID,
  reference motif/frame IDs, VibeSpace route/component path, semantic token,
  allowed scoped exception, state coverage, test owner, and status.

The validator resolves every cross-artifact/frame/token/mapping ID, rejects
orphan or duplicate IDs, proves all six filenames exist, and accepts
`blocked_missing_source` only where the schema requires null measured fields.

When the video is absent, commit truthful skeletons with
`schemaVersion: 1`, `status: "blocked_missing_source"`, and
`expectedFileName: "Screen Recording 2026-07-16 220632(1).mp4"`. Seed colors
remain `master_goal_seed`; no measured value, frame, or confidence is invented.
Committed JSON/Markdown contains no absolute Downloads path, private frame
path, copied identity, URL, or user content.

- [ ] **Step 1: Establish a reproducible frame manifest**

Hash and `ffprobe` the exact source, then extract all frames or high-frequency
transition frames plus scene-change candidates to ignored storage. Annotate
top bar, rail, hover, active sidebar, usage cards, segmented charts, table
header/row/hover/selected/loading/empty states, provider/pricing, form
default/focus/error, tooltip placement, empty/provider, general loading, and
page-transition/motion states; define the actual content crop; and record
timestamps/frame numbers, sanitized codec/color metadata, crop/exclusion,
purpose, and private-data disposition. Do not commit frames.

```powershell
node scripts/visual-monochrome/analyze-reference.mjs `
  --video "$env:MONOCHROME_REFERENCE_VIDEO" `
  --artifacts ".artifacts/monochrome/<session>/reference" `
  --docs "docs/appearance/monochrome"
node --test scripts/visual-monochrome/reference-artifacts.test.mjs
```

- [ ] **Step 2: Measure rather than eyeball**

Sample rectangular ROIs across multiple frames using median/cluster statistics
with coordinates/count/dispersion. Compare bundled font families and weights
against this exact glyph fixture:
`AaBbGgQqRr 0O1Il []{}() <> /\\ :;,.!? +-=_ #@% & | -> <- 0123456789`.
Render JetBrains Mono, Inter, and Plus Jakarta Sans at weights 400/500/600,
12px/16px and 13px/18px, normal and uppercase-label tracking, at 1x and 2x
device scale after `document.fonts.ready`. Record bundled file/hash/license,
family, weight, condition, pixel bounds, average glyph and numeral width, zero/
one/uppercase/punctuation observations, line-height/letter-spacing distance,
aggregate score, selected decision, and confidence.

Record black/surface/border/text/accent samples in a stable color space;
content viewport; primary rail/sidebar width; top-bar height; panel padding;
grid gutter; card border/radius; table-row, button, and control height; tooltip
offset; label spacing; chart segment gap; major-content max-width; spacing
rhythm; type size/weight/line-height/letter-spacing; chart segments; and accent
pixel ratio. Geometry uses multiple scenes and records raw samples,
median/range/confidence for every field. Motion records separate verified
samples for hover timing, active-state timing, tooltip timing, chart behavior,
loading state, and page transitions, including start/end frame, derived
duration, easing classification, reduced-motion decision, and confidence.
Separate observation, seed, interpretation, and final design decisions.

- [ ] **Step 3: Compare the dedicated workbench by motif**

Compare palette, geometry, border density, typography, panel silhouettes,
sidebar treatment, segmented chart, pricing/form structure, and tooltip.
Do not impose naive whole-page pixel equality on unrelated VibeSpace content.

- [ ] **Step 4: Calibrate in narrow commits/diffs**

Adjust tokens first, then primitive geometry, then shell, then route-specific
exceptions. After each focused change rerun preserved-theme, accessibility,
and deterministic screenshot gates. Reject copied branding or reference text.

- [ ] **Step 5: Write truthful evidence**

List which exact frames informed palette, rail, cards, chart, pricing, forms,
tooltip, and motion. State that the recording is a style authority, not a
pixel-perfect product/content target.

If the recording remains unavailable at final local handoff, mark MC-029 and
video-fidelity bullets blocked with the exact missing filename and completed
search evidence. The six validated skeleton artifacts and all non-video work
still complete; do not infer measurements or hold back other completed work.

## 16. Task MC9: Deterministic Visual, Functional, and Quality System

**Exact harness files (MC6 may amend only route-owned entries):**

- Create: `playwright.monochrome.config.ts`
- Use: `tests/visual/monochrome/fixtures.ts`
- Use: `tests/visual/monochrome/route-manifest.ts`
- Create: `tests/visual/monochrome/monochrome.visual.spec.ts`
- Create: `tests/visual/monochrome/monochrome.other-themes.spec.ts`
- Create: `tests/visual/monochrome/monochrome.a11y.spec.ts`
- Create: `tests/visual/monochrome/monochrome.behavior.spec.ts`
- Create: `tests/visual/monochrome/styleMetrics.ts`
- Create: `scripts/visual-monochrome/native-session.ps1`
- Create: `scripts/visual-monochrome/native-session.test.mjs`
- Create: `app/src/lib/runtimeProfile.ts`
- Create: `app/src/lib/runtimeProfile.test.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/App.runtimeProfile.test.tsx`
- Create: `app/src-tauri/src/runtime_profile.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/src/launcher.rs`
- Modify: `app/src-tauri/src/credentials.rs`
- Modify: `app/src-tauri/src/pets.rs`
- Modify: `app/src-tauri/src/branding.rs`
- Modify: `app/src-tauri/tauri.conf.json`
- Create: `app/src-tauri/capabilities/monochrome-test.json`
- Use: `.gitignore` (the `.artifacts/monochrome/` rule was committed in MC0B)
- Modify: `scripts/visual-monochrome/manifest-contract.test.mjs`
- Create/update: `docs/appearance/monochrome/evidence-index.md`
- Modify: root `package.json` and `package-lock.json` to add
  `@playwright/test@1.61.1` and `@axe-core/playwright@4.12.1` if still absent at
  the frozen MC0B gate; install/update both atomically, never hand-edit the lock.

**Commit:** `test(monochrome): add visual accessibility and regression coverage`

- [ ] **Step 1: Build a fixed environment**

Start MC9 by extending `manifest-contract.test.mjs` with RED assertions that
every call site frozen by MC0B has an explicit named-profile guard and an
injectable effect-proof seam. Confirm those assertions fail against the frozen
ordinary implementation, then add the runtime/native guards and effect seams
below until the same inventory is GREEN. No side-effect call site may be
removed from the manifest merely to satisfy the test.

Lock theme, route, deterministic fixture data, account/access state, time,
timezone, random seed, animations, font readiness, scroll, viewport, device
scale, app-data profile, and localhost port. Wait for explicit app and font
readiness markers, never arbitrary sleeps.

Use the recording's measured content viewport when available, plus 1672x941,
1440x900, 1280x720, 1024x768, and a documented narrow desktop viewport.

`native-session.ps1` never calls `scripts/dev-desktop.ps1` because that helper
can stop arbitrary owners of port 5173. It selects an unused strict localhost
port without killing its owner, launches Vite separately, and generates a
Tauri override with a unique identifier such as
`ai.vibespace.monochrome.test<hex>`, isolated dev URL,
`beforeDevCommand: null`,
`app.security.capabilities: ["monochrome-test"]`, and no
updater/bundle/install side effect. In the ordinary base
`app/src-tauri/tauri.conf.json`, add an explicit production allowlist at
`app.security.capabilities` equal after stable sorting to the complete
MC0B-frozen production capability identifier set—currently
`["default", "pet-mini-panel", "pet-overlay", "workbench-window"]`. Tauri otherwise
auto-discovers every file under `app/src-tauri/capabilities/`; the explicit
allowlist is therefore required so the committed `monochrome-test` capability
is never included in ordinary dev, build, release, or package output. The test
override replaces that array with exactly `["monochrome-test"]`, never appends
to it.

The committed capability applies only to the test windows and includes the
minimum core, event/window/webview/app/path, OS-read, and dialog-open
permissions required by the matrix. It explicitly omits notification,
process/relaunch, updater, shell-open, external HTTP, global-shortcut, and any
future deep-link/autostart permission. `native-session.test.mjs` asserts its
exact identifier, window patterns, permission IDs/scopes; the base config's
exact equality to the full MC0B production set, including both Pixel Pet
capabilities; the override's exact test-only identifier; and mutual exclusion
between production and test capabilities. Removing or hard-coding a proper
subset of the production set, or appending `monochrome-test`, fails.

The coordinator and its parent environment are never mutated. Tauri CLI,
Cargo, and rustup build processes retain the real toolchain roots exactly as
`CARGO_HOME=C:\Users\viper\.cargo` and
`RUSTUP_HOME=C:\Users\viper\.rustup`; the runner treats those roots as
read-only inputs and never cleans or relocates them. It sets only
`CARGO_TARGET_DIR=.artifacts/monochrome/<session>/native/cargo-target` for
compiler output. The build process retains the real `USERPROFILE` and `HOME`
until compilation is complete. Only the separately launched VibeSpace
executable receives child-only `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`,
`HOME`, `HOMEDRIVE`/`HOMEPATH`, `WEBVIEW2_USER_DATA_FOLDER`, `TEMP`, and `TMP`
below `.artifacts/monochrome/<session>/native/profile/`; Playwright receives its
own contained user-data directory. Vite receives only its compile-time profile
signal and isolated port/cache values, not a fake Rust toolchain home.

Build the native executable with the generated `--config` and isolated target
directory, then launch that exact owned executable as a separate process with
the child-only profile map. Do not rely on a long-running `tauri dev` process
that makes Cargo/rustup inherit the disposable `USERPROFILE`/`HOME`; if a
diagnostic `tauri dev` lane is retained, it must preserve the real toolchain
roots explicitly and satisfy the same containment assertions.

`-BuildReleaseExecutable` runs the equivalent of
`npm --prefix app run tauri -- build --no-bundle --no-sign --config <isolated-config>`
with the isolated `CARGO_TARGET_DIR`, then starts that exact
optimized embedded-frontend executable with the child-only app profile.
`-BuildUnsignedNsisArtifact` runs the equivalent release build with
`--bundles nsis --no-sign --config <isolated-nsis-config>`. That NSIS override
sets `bundle.createUpdaterArtifacts: false`, `bundle.targets: ["nsis"]`, the
unique test identifier, and output under the session's isolated cargo target
and artifact roots. The runner supplies no signing key, performs no signing or
publish step, and never launches the installer on the host.

The runner sets the exact paired signals
`VIBESPACE_RUNTIME_PROFILE=monochrome-visual-test` only for the launched native
app child and
`VITE_VIBESPACE_RUNTIME_PROFILE=monochrome-visual-test` for the dedicated Vite
dev/build child. `runtimeProfile.ts` parses only the compile-time frontend signal; the
Rust `runtime_profile.rs` parses only the native child signal. Unknown or
malformed non-empty values fail startup before React boot or native builder
setup; only an absent value selects ordinary production behavior, and only the
exact named value enables suppression. A native profile-query command lets the
frontend and harness prove that both boundaries agree before any fixture
interaction; disagreement fails the session.

The profile is a side-effect deny mode, not an alternate product identity.
Before the first awaited boot boundary, `App.tsx` consults the frontend profile
and skips vault/keychain hydration, automatic terminal-launcher installation,
cloud/sync startup, update checks, native notifications, and automatic
background service starts. Production behavior is byte-for-byte unchanged
outside the named profile. Rust independently fails closed: it does not
install the updater or global-shortcut plugins, register the Ctrl+Space
shortcut, create a tray icon/watchdog, reuse the production single-instance
identity, or initialize the production AppUserModelID when the profile is
active. Launcher, fixed-service keychain, and Windows-autostart commands reject
before filesystem, credential-manager, or HKCU access even if a renderer calls
them directly. `launcher.rs`, `credentials.rs`, and `pets.rs` retain those
defense-in-depth gates; UI tests alone are insufficient.

The native builder also omits the notification, process, updater, shell, HTTP,
and global-shortcut plugins in visual-test mode; dialog and non-mutating OS
inspection remain only where the test capability permits them. Any renderer
attempt to import or invoke an omitted plugin fails closed and is asserted.

Focused frontend and Rust tests prove ordinary mode retains every existing
boot/plugin/command path, visual-test mode suppresses each enumerated path,
unknown non-empty profile values fail before effects, and direct sensitive
command invocation is rejected before its effect adapter. The native session
test snapshots the real user launcher path, relevant HKCU PATH/autostart
values, and production keychain namespace metadata without reading secret
values. Shortcut/tray/updater/single-instance/plugin non-registration is proven
through injected Rust effect-adapter counters and emitted runtime-profile
evidence, not an unreliable claim to enumerate Windows shortcut ownership.
Every counter must remain zero in test mode while ordinary-mode unit tests
prove the same adapter is called. Any protected-state drift fails and cleanup
never attempts to repair or rewrite it.

The session manifest records session/commit/worktree/port/identifier, every
isolated path, protected pre-existing PID plus creation time/executable/command
hash, paired runtime-profile values and handshake result, owned root/descendant
identity, and start/stop times. Before/after tests
prove protected PIDs and the existing listener retain the same identity, no
protected PID reaches `Stop-Process`, stopped PIDs are exact recorded
descendants created after session start, WebView2 uses the isolated folder,
all home/app-data/cache/log/profile artifacts stay under the session root, the
real launcher/HKCU/keychain state does not drift, all denied-effect counters
remain zero, and cleanup touches only the contained disposable profile. The
unique identifier and disabled
test-profile single-instance reuse together prevent the protected VibeSpace
process from being focused or reused.

- [ ] **Step 2: Capture required states**

At minimum: Chat, expanded JARVIS, Prompt Forge review, Context Map,
Terminal/Workbench, Agents, Skills, Tools, Files, Canvas chrome, Browser Chat
shell, Settings Appearance, Account, Usage, Billing/Plans, locked access,
modal, dropdown, tooltip, toast, and empty state. Add every final route from
MC6.

- [ ] **Step 3: Add style metrics**

Record computed background/panel/border colors, border widths, radius
distribution, shadow/gradient/blur use, sidebar width, label family/casing,
accent pixel ratio, text contrast, density, font readiness, and CSS selector
scope. Thresholds should catch regression without claiming reference content
pixel equality.

- [ ] **Step 4: Protect other themes and Origami**

Diff the representative route matrix in Default, VibeSpace, and Jarvis Core
against post-Goals-1-7/pre-MonoChrome baselines. Run the Origami acceptance
oracle separately. Reject structure/token/radius/shadow changes and selector
leakage beyond earlier approved commits.

- [ ] **Step 5: Run functional regressions**

Cover route/project/chat selection, pinned chats, send/stream, model/agent
pickers, Ask/Plan/Agent/Hive, STT/TTS/voice/transcript, Prompt Forge, context
attachments, terminal/PTY, Canvas, files, plugins/MCP, Browser Chat, messaging,
schedules/tasks, billing/Stripe test mode, access gate, exports, and settings
persistence. Screenshots never substitute for these assertions.

- [ ] **Step 6: Run the explicit accessibility/native/platform matrix**

| Matrix                 | Required proof                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Every production route | Axe, accessible-name tree, keyboard smoke, visible focus, 1440x900 screenshot, reduced-motion run                                         |
| Primitive workbench    | Default/hover/focus/disabled/error/open/selected/loading states; Arrow/Enter/Space/Escape/Tab; target sizing                              |
| Zoom/reflow            | 100/125/150/200% effective CSS viewport plus 1024x768/narrow desktop; no clipped app-chrome controls or two-axis document scroll          |
| Contrast               | Primary/secondary/tertiary/accent/status/focus/selection/chart/tooltip numeric AA thresholds; status not color-only                       |
| Forced colors          | Chromium `forced-colors: active`; visible controls and focus                                                                              |
| Reduced motion         | No pulse/sweep/spring/shimmer/layout animation; state appears immediately                                                                 |
| Windows WebView2       | Main, detached Workbench, dictation, Pixel Pet, mini panel, preview/provider boundary, custom/native chrome, fonts, GPU fallback          |
| Windows native         | Actual DPI/devicePixelRatio, title bar/menu, file-dialog open/cancel, detached sync, Pixel Pet transparency                               |
| Release executable     | Optimized `tauri build --no-bundle --config <isolated-config>` plus compiled embedded-frontend runtime smoke under test profile           |
| Windows package        | Unique-ID unsigned NSIS artifact build; installed-package smoke in isolated Windows Sandbox/VM or exact `SKIPPED_NOT_APPLICABLE` evidence |
| Chromium web preview   | Complete deterministic Playwright suite                                                                                                   |
| WebKit preview         | Layout/token/font fallback only; never called macOS/Linux native proof                                                                    |
| macOS/Linux            | Configured CI/native runners if available; otherwise exact `SKIPPED_NOT_APPLICABLE` gate, never PASS                                      |

Automated zoom uses labeled CSS equivalence pairs: 1440x900 at 100%, 1152x720
at 125%, 960x600 at 150%, and 720x450 at 200%. Native evidence separately
records the actual Windows monitor scale; unavailable scales remain unverified.

Accessibility oracles are numerical: normal text is at least 4.5:1; large text
is at least 3:1; meaningful component boundaries, focus indicators, selected/
error/status indicators, and other non-text UI are at least 3:1 against
adjacent colors. Record valid disabled/nonessential exceptions rather than
silently passing them. Every pointer target is at least 24x24 CSS px or meets
the WCAG 2.2 spacing exception; icon glyphs may be smaller than their hit
targets, and controls covered by an existing 44x44 product contract retain
44x44. The two-axis-scroll prohibition applies to document/app chrome;
intentional inner Canvas and Context/graph spatial viewports may pan/scroll on
both axes while their controls, focus, escape path, and surrounding page remain
reachable without clipping.

The release smoke uses optimized code and embedded frontend assets (no
`--debug`) while the isolated runtime profile/capability still prevents real
user side effects. Build a unique-identifier unsigned NSIS artifact locally
without publishing or installing it on the host. Run an installed-package
scenario only inside an available disposable Windows Sandbox/VM; if none
exists, mark exactly that scenario `SKIPPED_NOT_APPLICABLE` with evidence and
an explicit environment/reason field. Release-executable and artifact-build evidence never masquerade as an
installed-package PASS.

- [ ] **Step 7: Measure performance and security**

Record theme-switch attribute latency, style recalculation, layout, paint,
memory, screenshot stability, CSS bytes/selectors, Canvas/graph traces, and
absence of remount/data reload. Audit persisted input, CSS injection, URLs,
SVGs, fonts, webview boundaries, provider pages, dependencies, and secrets.

- [ ] **Step 8: Execute and stage the deterministic harness**

```powershell
node --test scripts/visual-monochrome/theme-contract.test.mjs scripts/visual-monochrome/manifest-contract.test.mjs scripts/visual-monochrome/monochrome-css.test.mjs scripts/visual-monochrome/reference-artifacts.test.mjs scripts/visual-monochrome/native-session.test.mjs
npx playwright test --config playwright.monochrome.config.ts
npm --prefix app run typecheck
npm --prefix app test
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
cargo test --manifest-path app/src-tauri/Cargo.toml runtime_profile
cargo test --manifest-path app/src-tauri/Cargo.toml launcher::tests
cargo test --manifest-path app/src-tauri/Cargo.toml credentials::tests
cargo test --manifest-path app/src-tauri/Cargo.toml pets::tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/visual-monochrome/native-session.ps1 -ValidateOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/visual-monochrome/native-session.ps1 -BuildReleaseExecutable
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/visual-monochrome/native-session.ps1 -BuildUnsignedNsisArtifact
```

Then run the real isolated native/browser matrices, record exact evidence and
cleanup, stage only the harness/manifests/docs/dependency files owned by MC9,
and rerun cached-name, lockfile, secret, installer, and whitespace gates.

## 17. Task MC10: Independent Review, Documentation, and Draft-PR Handoff

**Files:**

- Create/update all six required reference artifacts:
  `REFERENCE_ANALYSIS.md`, `FRAME_MANIFEST.json`, `DESIGN.md`,
  `design-tokens.json`, `reference-spec.json`, and `component-mapping.md`
- Create/update: `docs/appearance/monochrome/route-coverage.md`
- Create/update: `docs/appearance/monochrome/migration-and-rollback.md`
- Create/update: `docs/appearance/monochrome/evidence-index.md`
- Update: exact architecture/theme/user docs frozen in the MC0B documentation
  manifest; any new path requires a reviewed literal amendment
- Update: successor draft PR body only after local verification

**Commit:** `docs(monochrome): add design migration rollback and handoff evidence`

- [ ] **Step 1: Run independent reviews**

Use separate read-only reviewers for visual design/reference fidelity,
theme/migration architecture, accessibility/UX, security/privacy/native
boundaries, performance, preserved-theme isolation, and full specification
coverage. A PASS means zero Critical, Important, or Minor findings. Convert
every actionable finding into a separately locked TDD fix and rerun its gates.

- [ ] **Step 2: Document migration and rollback**

Explain the v4->v5 Light-to-MonoChrome migration, current-version validation,
sync compatibility, user-data non-impact, CSS import rollback, baseline IDs,
and commit range. A rollback safely maps persisted `monochrome` to Default; it
must not resurrect Light in a way that corrupts state and must never delete
user data.

- [ ] **Step 3: Run the fresh final matrix**

At minimum, from a clean index with the protected installer deletion excluded:

```powershell
npm --prefix app run typecheck
npm --prefix app test
npm --prefix app run build
cargo check --manifest-path app/src-tauri/Cargo.toml
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```

Also run focused theme/migration/sync/Appearance/command/font/pet tests,
Playwright route captures, style metrics, workbench comparison, other-theme and
Origami diffs, accessibility, Windows native/high-DPI, reduced motion,
performance, security, and dependency/secret scan if dependencies changed.
Record command, commit, UTC timestamp, exit code, and evidence path. Truthfully
record unavailable platforms/providers.

### Skill/capability routing

Use only callable skills actually exposed in the session:

| Work                                 | Skill/capability                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Design direction and visual critique | `frontend-design:frontend-design`                                                                                       |
| Plan execution/delegation            | `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents`                                    |
| Every feature/fix and failure        | `superpowers:test-driven-development`, then `superpowers:systematic-debugging` when needed                              |
| Completion/review                    | `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, `superpowers:receiving-code-review` |
| Visible native Windows smoke         | `computer-use:computer-use` only inside the isolated session                                                            |
| Verified successor draft PR          | `github:yeet` only after all local gates                                                                                |

Playwright owns deterministic browser evidence; `chrome:control-chrome` is not
used because it depends on existing Chrome state. Requested `$vibespace-*`
bundles, `.agents/skills/`, and `.agents/tools/agent-lock.mjs` are unavailable
at planning time; recheck at execution and never claim they ran. Collaboration
workers inherit the runtime, but its API exposes no model selector/backend
label, so no worker is claimed as GPT-5.6 Sol Max without provisioning evidence.

- [ ] **Step 4: Inspect exact Git scope**

Never stage a directory. Build an exact literal path list, then run:

```powershell
git diff --cached --name-only
git diff --cached --check
git diff --cached -- docs/appearance/monochrome/DESIGN.md docs/appearance/monochrome/evidence-index.md
```

The final command is a literal two-file example; replace its arguments with the
current slice's already-enumerated literal manifest and never type angle-bracket
placeholders into PowerShell. The installer anomaly, source recording, frames,
private screenshots, user data, browser history, temporary diffs, and unrelated
formatting must be absent.

- [ ] **Step 5: Update the successor draft PR without merging**

Include design summary, reference methodology, final theme matrix, migration,
video-derived palette if actually measured, key route screenshots, a short
real interaction clip, Appearance, shell, Usage, Account/Provider, Chat/JARVIS,
Context, Terminal, Canvas, Browser Chat, accessibility, performance,
preserved-theme/Origami results, rollback, and exact external gates. State
that the reference informed visual style while VibeSpace branding and behavior
were preserved. Do not claim pixel-perfect identity.

## 18. Atomic Commit Sequence

Use these as intent boundaries; split a commit further when its exact file
manifest or review surface becomes too broad:

1. `docs(plan): append MonoChrome appearance implementation phase`
2. `test(monochrome): freeze baseline harness and manifests` after MC0B Step 7.
3. `test(monochrome): capture immutable preserved-theme baseline B0` after the
   separate harness commit and MC0B Step 8 verification.
4. `feat(appearance): replace Light with MonoChrome theme registry`
5. `feat(appearance): migrate startup sync and commands to MonoChrome`
6. `style(monochrome): add scoped semantic tokens and terminal palette`
7. `style(monochrome): theme shared primitives and add visual workbench`
8. `style(monochrome): theme app shell navigation and overlays`
9. One commit per frozen MC7 route lane.
10. `docs(monochrome): add validated reference evidence contracts`
11. `style(monochrome): calibrate reference-locked visual system` only with
    real recording evidence.
12. `test(monochrome): add visual accessibility and regression coverage`
13. `docs(monochrome): add design migration rollback and handoff evidence`

Each commit requires focused tests, widened tests appropriate to risk,
typecheck, formatting, `git diff --check`, exact staged-name inspection, and an
independent review before downstream consumers rely on it.

## 19. Final Acceptance Matrix

MonoChrome is locally complete only when all applicable rows are evidenced:

- Registry is exactly Jarvis Core, VibeSpace, Default, MonoChrome in order.
- Light is absent from the active registry, picker, autocomplete, current help,
  command-palette/actions, active CSS, and app-owned xterm palettes. The
  parser-only legacy `/theme light` alias remains and resolves to MonoChrome.
- Storage maps `light -> monochrome` and dark/system/unknown/malformed to
  Default; commands preserve `jarvis core`/`core`/`vibe`/`dark` plus the exact
  MonoChrome aliases; sync accepts canonical IDs plus `light` only; Default
  preference continues resolving to document selector `dark`.
- UI store version 5 migration is idempotent, current-state validating, and
  preserves every unrelated UI preference and all user content.
- Startup applies the canonical persisted theme before React with no Light
  flash; Pixel Pet stays transparent.
- Detached windows synchronize MonoChrome and normalize legacy Light without
  an echo loop while rejecting command aliases/dark/system/unknown messages.
- Appearance, slash help/typeahead, command palette, action registries, and
  command aliases expose MonoChrome consistently.
- MonoChrome provides true black, near-black flat levels, 1px gray separators,
  small radii, minimal shadows, no global gradients/glass/glow, compact sans
  body, mono metadata, restrained accents, indexed labels, technical data
  layouts, and controlled negative space.
- Shared primitives and every final route/overlay/native window have audited
  default, interactive, loading, empty, error, disabled, and focus states.
- Default, VibeSpace, Jarvis Core, Origami, remote provider content, Canvas
  user content, and all functionality/product copy are preserved.
- Functional, accessibility, migration, performance, security, unit,
  integration, build, Playwright, Rust/Tauri-safe, Windows native/high-DPI,
  and visual gates pass where locally actionable.
- Terminal ANSI/true-color content and explicit user/per-terminal overrides
  retain precedence across theme switches, splits, detached windows, and
  MutationObserver updates.
- The isolated native session proves a unique Tauri identifier, unused port,
  child-only home/app-data/WebView2/temp/browser profiles, exact test-only
  capability and denied-effect counters, exact owned PID cleanup, and unchanged
  protected processes/listener/profile/launcher/HKCU/keychain state. The
  optimized embedded Windows executable and unsigned package artifact pass;
  installer-installed behavior without a Sandbox/VM and unavailable
  macOS/Linux runners are exact `SKIPPED_NOT_APPLICABLE`, never inferred PASS.
- Reference palette, typography, rail, cards, chart, pricing, forms, tooltip,
  geometry, and motion are measured and documented if and only if the exact
  video is available. All six required reference artifacts validate against
  their schemas in either measured or truthful `blocked_missing_source` form.
  Otherwise only MC8B calibration/video-fidelity remains blocked with exact
  search evidence; locally actionable completion and successor draft-PR work
  continue.
- The isolated test port/profile are documented and cleaned up, nothing is
  merged/deployed, and the protected branch/worktree/processes/installer/user
  data remain untouched.

## 20. Final Handoff Shape

The final handoff must report:

1. Light removal, MonoChrome registration, migration, sync, and aliases.
2. Video metadata, frames, palette, typography, geometry, and motion actually
   analyzed, or the exact missing-video blocker.
3. Every audited route and its unit, functional, visual, accessibility,
   performance, native, and preserved-theme status.
4. Default, VibeSpace, Jarvis Core, and Origami regression results.
5. Exact verified commands, commits, evidence paths, mocked providers,
   unavailable platforms, and unresolved external gates.
6. Branch, commit, isolated port/profile, start command, cleanup state, and
   rollback procedure.
7. An honesty statement distinguishing what was automated, manually inspected,
   native-tested, visually compared, mocked, blocked, and not run.
