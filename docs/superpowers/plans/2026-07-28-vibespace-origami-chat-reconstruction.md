# VibeSpace Origami Chat Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the real VibeSpace Chat page against the locked
1672×941 Origami reference while preserving live components, behavior,
accessibility, every unrelated route, and every non-VibeSpace theme.

**Architecture:** Import the supplied reference pack as an immutable,
hash-checked test oracle. A Node-based visual harness uses the existing
`playwright-core` dependency to serve a built bundle, seed a deterministic
local-only Chat fixture through browser storage/IndexedDB, capture the real
DOM, and compare it with Sharp/Pixelmatch/PNGJS. Production presentation uses
a Chat-only root marker, a dedicated scoped stylesheet, and inert decorative
assets; generated screenshots, temporary baseline source, and reports remain
under `.artifacts/origami-chat/`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Node test runner,
Playwright Core, Sharp 0.34.5, Pixelmatch 7.2.0, PNGJS 7.0.0, CSS, SVG, WebP.

## Global Constraints

- The full `references/target-chat.png` image is authoritative; crops are
  coordinate-anchored diagnostic views only.
- Capture viewport is exactly 1672×941, device scale factor 1, browser zoom
  100%.
- Use real Chat DOM, stores, handlers, accessibility, and local fixture data;
  never use the full target as a background or hardcode reference text into
  production.
- Scope all presentation beneath the VibeSpace theme, Workspace main, and
  `data-vibespace-page="chat"` root.
- Do not restyle Terminals, Kanban, Schedule, Benchmarks, History, Agents,
  Skills, Tools, Files, Settings, Account, Providers, Plugins, unrelated
  modals, remote content, native windows, or other themes.
- Complex ribbon, crane, foliage, mountain, flower, and fold artwork is
  asset-first; CSS-only approximations are not final acceptance.
- Decorative layers are `aria-hidden`, `pointer-events: none`, and
  `user-select: none`.
- Do not start Docker. Browser capture is headless and explicit; do not launch
  it during unit-only verification.
- Do not commit generated screenshots, diffs, overlays, temporary source
  archives, or browser profiles.
- Preserve unrelated dirty files and the existing `install/install.ps1`
  deletion.

---

### Task 1: Freeze the reference oracle and tool contract

**Files:**

- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/visual/chat/reference/DESIGN.md`
- Create: `tests/visual/chat/reference/reference-spec.json`
- Create: `tests/visual/chat/reference/design-tokens.json`
- Create: `tests/visual/chat/reference/asset-manifest.json`
- Create: `tests/visual/chat/reference/target-chat.png`
- Create: `tests/visual/chat/reference/crops/*.png`
- Create: `tests/visual/chat/reference/reference-integrity.json`
- Create: `tests/visual/chat/reference-contract.test.mjs`

**Interfaces:**

- Consumes: the supplied implementation pack in
  `C:\Users\viper\Downloads\VibeSpace_Origami_Chat_Implementation_Pack\VibeSpace_Origami_Chat_Implementation_Pack`.
- Produces: immutable reference files plus
  `reference-integrity.json` entries shaped as
  `{ path: string, bytes: number, sha256: string }`.

- [ ] **Step 1: Write the failing reference-contract test**

  Assert exact viewport, crop bounds, positive weights, total diagnostic
  weight `1`, target/crop dimensions, locked target hash, unique asset paths,
  prohibited full-page-background policy, and expected missing dependencies.

  ```js
  assert.deepEqual(spec.viewport, {
    width: 1672,
    height: 941,
    device_scale_factor: 1,
    browser_zoom_percent: 100,
  });
  assert.equal(
    Object.entries(spec.regions)
      .filter(([name]) => name !== 'full_page')
      .reduce((sum, [, region]) => sum + region.weight, 0),
    1,
  );
  ```

- [ ] **Step 2: Run the test and verify RED**

  Run:
  `node --test tests/visual/chat/reference-contract.test.mjs`

  Expected: FAIL because the repository oracle and integrity manifest do not
  yet exist.

- [ ] **Step 3: Import the exact pack and record integrity**

  Copy the locked design/JSON/PNG files byte-for-byte. Generate SHA-256 and
  byte counts from the imported files; do not resample reference images.

- [ ] **Step 4: Install only the missing image-analysis dependencies**

  Run:
  `npm install --save-dev --save-exact sharp@0.34.5 pixelmatch@7.2.0 pngjs@7.0.0`

  Keep existing `playwright-core`; do not add `@playwright/test`, install a
  bundled browser, or upgrade unrelated packages.

- [ ] **Step 5: Ignore generated artifacts**

  Add exactly `.artifacts/origami-chat/` while preserving
  `.artifacts/monochrome/`.

- [ ] **Step 6: Run GREEN verification**

  Run:

  ```powershell
  node --test tests/visual/chat/reference-contract.test.mjs
  npm ls playwright-core sharp pixelmatch pngjs --depth=0
  npx prettier --check package.json tests/visual/chat/reference/*.json tests/visual/chat/reference-contract.test.mjs
  git check-ignore .artifacts/origami-chat/probe.png
  ```

- [ ] **Step 7: Commit the oracle**

  Stage only the Task 1 manifest and commit:
  `test(origami): freeze reference oracle and visual dependencies`.

---

### Task 2: Build the deterministic comparison engine

**Files:**

- Create: `scripts/visual-chat/reference-contract.mjs`
- Create: `scripts/visual-chat/image-compare.mjs`
- Create: `scripts/visual-chat/image-compare.test.mjs`
- Create: `scripts/visual-chat/compare-chat.mjs`

**Interfaces:**

- Produces:
  `loadOrigamiReferenceContract(root): OrigamiReferenceContract`;
  `compareImages({ targetPath, currentPath, contract, outputDirectory, passId, revision }): Promise<OrigamiComparisonReport>`.
- `OrigamiComparisonReport` contains dimensions, route, pass ID, revision,
  full diff ratio, weighted regional ratio, per-region ratios/coordinates,
  thresholds, and output paths.

- [ ] **Step 1: Write synthetic RED tests**

  Generate tiny in-memory PNG fixtures and assert:
  - identical images score zero;
  - one changed pixel produces the exact ratio;
  - dimension mismatch throws before writing evidence;
  - weighted score uses only declared diagnostic regions;
  - out-of-bounds regions fail contract loading;
  - report output is stably ordered;
  - diff, 50% overlay, region current/target/diff images, and report JSON are
    created beneath the supplied output directory.

- [ ] **Step 2: Run RED**

  Run:
  `node --test scripts/visual-chat/image-compare.test.mjs`

  Expected: FAIL because the comparison modules do not exist.

- [ ] **Step 3: Implement contract loading and comparison**

  Use Sharp only for canonical PNG decode/extract/composite, PNGJS for
  Pixelmatch buffers, and Pixelmatch threshold `0.12`, `includeAA: false`.
  Reject output paths outside the caller-supplied artifact root.

- [ ] **Step 4: Add the CLI**

  `compare-chat.mjs` accepts:

  ```text
  --current <png>
  --output <directory>
  --pass <stable-id>
  --revision <git-or-working-tree-id>
  --route <resolved-url>
  ```

  It reads the tracked contract; it never rewrites the locked source files.

- [ ] **Step 5: Run GREEN**

  Run:

  ```powershell
  node --test scripts/visual-chat/image-compare.test.mjs tests/visual/chat/reference-contract.test.mjs
  npx prettier --check scripts/visual-chat/*.mjs
  git diff --check -- scripts/visual-chat
  ```

- [ ] **Step 6: Commit the engine**

  Commit:
  `test(origami): add weighted visual comparison engine`.

---

### Task 3: Capture the real deterministic Chat fixture

**Files:**

- Create: `tests/visual/chat/fixture-data.mjs`
- Create: `tests/visual/chat/fixture-data.test.mjs`
- Create: `scripts/visual-chat/static-server.mjs`
- Create: `scripts/visual-chat/browser-launch.mjs`
- Create: `scripts/visual-chat/chat-fixture.mjs`
- Create: `scripts/visual-chat/capture-chat.mjs`
- Create: `scripts/visual-chat/capture-chat.test.mjs`
- Create: `scripts/visual-chat/README.md`

**Interfaces:**

- Produces:
  `ORIGAMI_CHAT_FIXTURE` with fixed IDs/timestamps and live workspace,
  project, chat, user message, assistant message, model selection, and
  sidebar records.
- Produces:
  `captureOrigamiChat({ distDirectory, outputPath, baseUrl?, browserExecutable? }): Promise<CaptureReceipt>`.
- Browser resolution order:
  `VIBESPACE_BROWSER_EXECUTABLE`, installed Edge channel, installed Chrome
  channel, Playwright-managed Chromium.

- [ ] **Step 1: Write fixture contract RED tests**

  Assert fixed IDs/timestamps, JSON safety, referential integrity, no API keys,
  no cloud session, no external URL, exact message text, one user/assistant
  turn, and deterministic model label.

- [ ] **Step 2: Write capture-module RED tests**

  Without launching a browser, test argument validation, artifact
  containment, source-derived theme storage key/version, exact viewport, no
  fixed sleeps, stable-layout readiness, screenshot-only animation/caret
  freezing, and refusal to capture a page missing the Chat root.

- [ ] **Step 3: Implement fixture seeding through real browser state**

  Seed local auth/UI envelopes and the `jarvis-v1` IndexedDB workspace,
  project, chat, messages, and agent rows before the final reload. Do not add a
  production fixture route or replace React components. Open the existing
  Jarvis module only through its real visible control when present.

- [ ] **Step 4: Implement stable readiness**

  Wait for:
  - visible `#root`;
  - `document.fonts.ready`;
  - `data-vibespace-page="chat"`;
  - expected seeded message text;
  - session panel and composer;
  - three identical `requestAnimationFrame` layout snapshots;
  - no error/pageerror other than the documented missing-Tauri web-preview
    bridge.

  Do not use `waitForTimeout`.

- [ ] **Step 5: Run unit GREEN**

  Run:

  ```powershell
  node --test tests/visual/chat/fixture-data.test.mjs scripts/visual-chat/capture-chat.test.mjs
  npx prettier --check tests/visual/chat/*.mjs scripts/visual-chat/*.mjs
  git diff --check -- tests/visual/chat scripts/visual-chat
  ```

- [ ] **Step 6: Run one announced headless smoke capture**

  Build first, then run the capture against `app/dist`. Record the browser
  executable/channel in the receipt. This explicit command launches a
  headless browser but no Docker or persistent server:

  ```powershell
  npm run build
  node scripts/visual-chat/capture-chat.mjs --dist app/dist --output .artifacts/origami-chat/smoke/chat.png
  ```

- [ ] **Step 7: Commit the fixture and capture harness**

  Commit:
  `test(origami): add deterministic real-chat capture harness`.

---

### Task 4: Reconstruct and capture the true pre-Origami baseline

**Files:**

- Create: `scripts/visual-chat/materialize-baseline.mjs`
- Create: `scripts/visual-chat/materialize-baseline.test.mjs`
- Create: `tests/visual/chat/baseline-metadata.json`
- Create: `tests/visual/chat/baseline-metadata.test.mjs`

**Interfaces:**

- Baseline source commit is the immediate pre-Origami commit
  `8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696`.
- Temporary source/output lives only in
  `.artifacts/origami-chat/baseline-source/`.
- Tracked metadata records source commit, reference hash, fixture hash,
  viewport, capture command, report hash, and numeric baseline scores; it
  does not track generated PNGs.

- [ ] **Step 1: Write materialization RED tests**

  Verify the script requires a full commit, proves it is an ancestor of HEAD,
  proves the Origami commit is absent, rejects dirty output directories, and
  keeps all materialized paths inside the artifact root.

- [ ] **Step 2: Implement archive-based reconstruction**

  Use `git archive` rather than another Git worktree. Extract the exact commit
  under the ignored artifact root, run `npm ci --ignore-scripts`, then
  `npm run build` inside the archive. Never alter the live worktree.

- [ ] **Step 3: Capture baseline and compare**

  Use the same fixture, browser, viewport, screenshot CSS, capture module, and
  comparison engine as every later pass.

- [ ] **Step 4: Record and verify metadata**

  The metadata test recomputes JSON/file hashes and proves the baseline
  numeric fields are finite in `[0,1]`.

- [ ] **Step 5: Commit baseline metadata**

  Commit:
  `test(origami): record deterministic pre-style baseline`.

---

### Task 5: Build the asset-first material system and workbench

**Files:**

- Create: `app/public/assets/origami-chat/paper-base.webp`
- Create: `app/public/assets/origami-chat/paper-grain.webp`
- Create: `app/public/assets/origami-chat/top-ribbon.svg`
- Create: `app/public/assets/origami-chat/crane.webp`
- Create: `app/public/assets/origami-chat/left-foliage.webp`
- Create: `app/public/assets/origami-chat/bottom-mountains.svg`
- Create: `app/public/assets/origami-chat/right-flower.webp`
- Create: `app/public/assets/origami-chat/panel-9slice.webp`
- Create: `app/public/assets/origami-chat/sidebar-row-9slice.webp`
- Create: `app/public/assets/origami-chat/sidebar-active-row-9slice.webp`
- Create: `app/public/assets/origami-chat/jarvis-frame-9slice.webp`
- Create: `tests/visual/chat/asset-contract.test.mjs`
- Create: `tests/visual/chat/workbench/index.html`
- Create: `tests/visual/chat/workbench/workbench.css`

**Interfaces:**

- Every raster asset has dimensions, alpha requirements, source region,
  output hash, and role in a tracked asset contract.
- The workbench is test-only and never enters production navigation.

- [ ] **Step 1: Write asset-contract RED tests**

  Reject absent assets, opaque padding around transparent decorations,
  full-page-sized assets, remote URLs, duplicate hashes, text-bearing
  decoration, invalid SVG scripts/external references, and files not declared
  in the locked asset manifest.

- [ ] **Step 2: Create source-faithful assets**

  Use the approved reference/crops for extraction and the image-editing tool
  for alpha cleanup where needed. Preserve detailed folds/botanical facets;
  do not substitute basic CSS triangles. Keep live text/icons out of assets.

- [ ] **Step 3: Build the test-only workbench**

  Render every material primitive and asset at intended scale over the sampled
  paper canvas. Include 100% zoom labels outside comparison regions only.

- [ ] **Step 4: Run asset GREEN**

  Run:

  ```powershell
  node --test tests/visual/chat/asset-contract.test.mjs
  node scripts/visual-chat/capture-workbench.mjs --output .artifacts/origami-chat/workbench.png
  ```

- [ ] **Step 5: Commit assets**

  Commit:
  `feat(origami): add source-faithful paper assets and workbench`.

---

### Task 6: Map materials and geometry onto the real Chat DOM

**Files:**

- Modify: `app/src/styles/vibespace-theme.css`
- Create: `app/src/styles/origami-chat.css`
- Create: `app/src/features/chat/OrigamiChatDecor.tsx`
- Create: `app/src/features/chat/OrigamiChatDecor.test.tsx`
- Modify: `app/src/features/chat/ChatView.tsx`
- Modify: `app/src/main.tsx`
- Modify: `app/src/features/appearance/vibespacePalette.test.ts`

**Interfaces:**

- `OrigamiChatDecor` renders only inert `aria-hidden` image layers.
- `origami-chat.css` owns all reference-locked Chat styling and starts every
  selector with the exact VibeSpace/Workspace/Chat gate.
- `vibespace-theme.css` retains general VibeSpace theme rules only.

- [ ] **Step 1: Write RED structure and selector tests**

  Assert no selector-list escape, no global token replacement, no remote URL,
  no full-target background, no decoration outside Chat, no pointer events,
  no asset intercepting focus, and no production behavior change.

- [ ] **Step 2: Match Stage A geometry**

  At 1672×941, align header height, sidebar width, main origin, session bounds,
  message bounds, composer bounds, Jarvis placement, and whitespace before
  decorative detail.

- [ ] **Step 3: Match Stage B/C materials and real components**

  Apply paper canvas, raised/folded panels, sidebar rows, session cards,
  message surfaces, composer tray, and Jarvis frame to existing elements.
  Preserve dynamic height and every handler.

- [ ] **Step 4: Add Stage D decorations**

  Render ribbon, crane, foliage, mountains, flower, and supporting leaves at
  reference anchors. Confirm they do not cover controls at 1440×900 or
  1672×941.

- [ ] **Step 5: Calibrate Stage E typography/color**

  Use bundled fonts only, dark-brown ink, and locked sampled tokens corrected
  only by measured reference evidence.

- [ ] **Step 6: Run focused functional GREEN**

  Run ChatView, palette, activity timeline, composer, model selector, Agent
  Mode, microphone, sidebar, and Jarvis focused tests plus typecheck/build.

- [ ] **Step 7: Commit the real-page reconstruction**

  Commit:
  `feat(origami): reconstruct the live Chat workspace`.

---

### Task 7: Run measured passes and reject regressions

**Files:**

- Create: `scripts/visual-chat/pass-ledger.mjs`
- Create: `scripts/visual-chat/pass-ledger.test.mjs`
- Create: `tests/visual/chat/final-metadata.json`
- Create: `tests/visual/chat/final-metadata.test.mjs`

**Interfaces:**

- Each ledger row records pass ID, parent pass, working-tree/commit revision,
  focused change, full diff, weighted diff, worst region, kept/rejected, and
  evidence hashes.

- [ ] **Step 1: Write RED ledger tests**

  Reject duplicate IDs, missing parent, non-finite scores, claimed improvement
  with a worse full/weighted score, missing evidence hashes, and more than 12
  passes without reassessment.

- [ ] **Step 2: Run full capture and choose the worst high-weight region**

  One pass changes one mismatch or tightly related group. After every
  crop-focused change, recapture the full page.

- [ ] **Step 3: Keep or reject with evidence**

  Keep a pass only when full composition and weighted score improve without a
  material neighboring-region or functional regression. Revert rejected
  focused edits only; never reset unrelated work.

- [ ] **Step 4: Continue through geometry, silhouettes, color fields, folds,
      decorations, texture, and text antialiasing**

  Thresholds are guardrails, not permission to accept a visibly flat page.

- [ ] **Step 5: Record final metadata**

  Include baseline/final full diff, weighted score, every region score, pass
  count, final screenshot/report hashes, revision, route, and viewport.

- [ ] **Step 6: Commit measured evidence metadata**

  Commit:
  `test(origami): record measured visual reconstruction evidence`.

---

### Task 8: Prove scope, functionality, and final PR readiness

**Files:**

- Create: `scripts/visual-chat/scope-audit.mjs`
- Create: `scripts/visual-chat/scope-audit.test.mjs`
- Create: `docs/origami-chat-verification.md`

**Interfaces:**

- Scope audit receives an exact approved path/selector/asset allowlist and
  rejects production changes outside it.
- Verification doc links tracked metadata; it does not embed generated binary
  artifacts.

- [ ] **Step 1: Write scope-audit RED tests**

  Include synthetic violations for Schedule, Terminals, global theme tokens,
  remote URLs, full-target backgrounds, and selector-list scope escapes.

- [ ] **Step 2: Capture unrelated-route/theme evidence**

  With the same built bundle, capture Schedule, Terminals, Settings Appearance,
  Default Chat, Jarvis Core Chat, and MonoChrome Chat. Prove Origami-only
  selectors/assets are inactive.

- [ ] **Step 3: Run focused interaction smoke checks**

  Prove Chat opens, messages render, input accepts text, send/Ctrl+Enter/model
  selector/Agent Mode/microphone/session Expand/sidebar/project/chat/Jarvis
  controls remain available, and no breaking console errors occur.

- [ ] **Step 4: Run the coherent final suite**

  Run:

  ```powershell
  node --test tests/visual/chat/*.test.mjs scripts/visual-chat/*.test.mjs
  npx vitest run src/features/appearance/vibespacePalette.test.ts src/features/chat/ChatView.origamiScope.test.tsx src/features/chat/activity/ChatActivityTimeline.test.tsx src/features/chat/Composer.smokeContract.test.ts src/features/jarvis-interaction/ModeIndicator.test.tsx --maxWorkers=1 --minWorkers=1
  npm --prefix app run typecheck
  npm run build
  npx prettier --check package.json tests/visual/chat scripts/visual-chat app/src/features/chat/OrigamiChatDecor.tsx app/src/styles/origami-chat.css docs/origami-chat-verification.md
  git diff --check
  ```

- [ ] **Step 5: Review actual diff and remove temporary residue**

  Confirm no generated PNG/diff/overlay/profile/source archive is tracked, no
  unrelated formatting or lock churn exists, and protected dirty paths remain
  untouched.

- [ ] **Step 6: Commit final verification**

  Commit:
  `docs(origami): record final visual and functional evidence`.

## Plan Self-Review

- Spec coverage: locked source, deterministic fixture, baseline, full/region
  comparison, workbench, assets, geometry/material order, measured passes,
  functionality, scope, cleanup, and final report each have an owning task.
- Placeholder scan: every implementation step is concrete and complete.
- Type consistency: capture receipts feed comparison reports; reports feed
  pass ledger/final metadata; tracked reference and fixture hashes bind every
  stage.
- Scope: one subsystem—Origami Chat presentation and its local visual
  verification harness. Supabase, Stripe, native windows, and unrelated PR-30
  goals are excluded.
