# VibeSpace Pixel Pets Discovery

- Date: 2026-07-11
- Agent: `AGENT-20260711-111338-PX7L`
- Branch: `agent/pixel-pets-axolotl`
- Base: `origin/main` at `ec56ef3b48e7f4758dd98335d2f3e1bb8895b693`

## Scope and authorization boundary

The authoritative specification is:

`C:\Users\viper\Downloads\VibeSpace_Pixel_Axolotl_Codex_Prompt_UPDATED_FOR_LAYERED_PACKAGE.md`

The supplied source package is:

`C:\Users\viper\Downloads\VibeSpaceOs`

This discovery covers the complete Pixel Pets feature requested by that specification. It does not authorize implementation before the user approves `PETS_IMPLEMENTATION_PLAN.md`. No Supabase, Stripe, billing, authentication, production data, deployment, release, or migration changes are in scope.

The layered PSD, ORA, manifest, source PNGs, and extracted layers are archival inputs. They must remain byte-for-byte unchanged. Derived assets will be created in repository-owned working/output directories.

## Repository state

- Product: VibeSpace desktop app.
- Frontend: React 18, TypeScript 5.6, Vite 5, Zustand, Vitest.
- Desktop shell: Tauri 2 / Rust 2021.
- Current app version: `0.1.48`.
- Current windows: `main` and `dictation`.
- Current capability file grants the same broad default capability to `main` and `dictation`; Pixel Pets should use separate least-privilege capabilities.
- Current frontend has no `pets` feature and no PixiJS dependency.
- Current query-view routing handles `?view=dictation`; Pet overlay/panel views can use the same root-routing pattern without changing normal workspace layout.
- Existing Tauri window creation, event, position, and visibility APIs are available through `@tauri-apps/api`.
- Existing UI preferences persist through the `useUIStore` Zustand store with an explicit migration and `partialize` allowlist.
- Existing chat run-state emits `jarvis:run-state` with `chatId` and `running|done|error|cancelled`.
- Existing done notifications emit `jarvis:done-notification` after the current dedupe/settings checks.
- Existing terminal lifecycle uses `terminal://output` and `terminal://exit` per stable session ID. A Pet adapter must observe privacy-safe lifecycle state without copying transcripts or PTYs.
- Existing agent state is held in `useAgentStore.runStates`.
- Existing settings use lazy-loaded sections and current Radix/Tailwind patterns.

### Open pull requests and overlap

- Draft PR #18, `agent/terminal-persistence-recovery`: terminal persistence and lifecycle safety. Pixel Pets must remain independently reviewable and avoid assuming PR #18 is merged. Terminal event integration should be isolated behind an adapter so a later rebase is mechanical.
- Draft PR #17, `audit/backend-security-hardening-20260710`: backend/security/billing hardening. Pixel Pets must not touch its Supabase, billing, or backend scope.
- Other older open PRs do not overlap the planned Pet feature.

### Existing-work warning

The isolated Pixel Pets worktree shows an unrelated deletion of `install/install.ps1`, matching the previously recorded coordination incident. This task did not cause, restore, stage, or modify that path. Every commit must use exact path lists; `git add -A` is prohibited.

## Supplied package inventory

- Total source-folder files: 291.
- Total source-folder bytes: 30,315,377.
- Canonical nested package:
  `VibeSpaceOs/vibespace_axolotl_layered_package/vibespace_axolotl_layered_package`
- Canonical extracted layer count: 136 PNG files.
- Duplicate extracted layer count: 136 PNG files under `VibeSpaceOs/vibespace_axolotl_layers/layers`.
- Top-level original flat source candidate:
  `ChatGPT Image Jul 11, 2026, 08_53_55 AM.png`.

### Duplicate results

The following top-level files are byte-identical to their nested canonical copies:

| File | SHA-256 |
|---|---|
| `assemble_vibespace_axolotl_in_photoshop.jsx` | `60F462A6527EF7F6AC7865DE12A2B1E6975DD862285E9BEE1036D07EE3E69853` |
| `vibespace_axolotl_layer_manifest.json` | `1491196974460C5652EF030306411DAF9535282ED17B6E622A636C9892052B3F` |
| `vibespace_axolotl_quality_report.md` | `F934739D17DE1900E0928DB303A757CA26BFE8E61770C56E94DBD9316B4D3B3B` |

All 136 PNGs in the duplicate extracted layer folder are byte-identical to the 136 PNGs in the nested canonical package. No non-identical duplicate was found in this comparison.

## Independent layered-package evidence

These checks were performed directly against the supplied files. The existing quality report was not used as proof.

### PSD

| Check | Result |
|---|---|
| Signature | `8BPS` |
| PSD version | 1 |
| Canvas | 1254 × 1254 |
| Channels / depth / color mode | 3 / 8-bit / RGB |
| Raw layer records | 182 |
| Section-divider records | 46 |
| Estimated leaf raster layers | 136 |
| Group pairs | 23 |

The PSD parser reached all 182 records. The `136 + 46` structure independently supports 136 leaf layers and 23 groups.

### ORA

| Check | Result |
|---|---|
| `mimetype` | Present |
| `stack.xml` | Present and parseable |
| `mergedimage.png` | Present |
| `Thumbnails/thumbnail.png` | Present |
| Leaf layers in `stack.xml` | 136 |
| Nested stacks including root | 24 |
| Character groups excluding root | 23 |
| Total PNG entries | 138 (136 layers + merged + thumbnail) |

### Manifest and layer PNGs

| Check | Result |
|---|---|
| Schema version | 1 |
| Manifest layers | 136 |
| Layer-order entries | 136 |
| Unique layer IDs | PASS |
| Unique layer paths | PASS |
| Missing referenced files | 0 |
| Full-canvas dimensions | All 1254 × 1254 |
| Image mode after decode | All RGBA |
| Empty layers | 0 |
| Pivots | 24 |
| Out-of-bounds pivots | 0 |
| Invalid pivot references | 0 |
| Branding layers | 4 |
| All branding non-mirrorable | PASS |

The manifest character ID is currently `vibespace-axolotl-light`; derived runtime metadata will normalize this to the specification's stable ID `vibespace-axolotl-pixel` without altering the archival manifest.

### Neutral-pose recomposition

The manifest's visible default layers were alpha-composited in memory and compared with `vibespace_axolotl_preview_transparent.png`.

- Exact pixel equality: PASS.
- Different pixels: 0.
- Maximum channel difference: 0.
- Mean absolute channel difference: 0.0.

This confirms the default visible pose is reproducible from the extracted layer PNGs.

### Alpha evidence

For `vibespace_axolotl_preview_transparent.png`:

- Alpha minimum: 0.
- Alpha maximum: 255.
- Fully transparent pixels: 1,024,981.
- Fully opaque pixels: 543,470.
- Partially transparent pixels: 4,065.

The 136 layers contain expected high partial-alpha totals in guide/reference/effect groups. Solid geometry also contains smaller partial-alpha populations that require per-role classification; global thresholding would damage intended glow/shadow layers.

### Visual inspection

The supplied previews visibly preserve:

- front-facing chibi silhouette;
- six external gills;
- large cream helmet and peach trim;
- dark face display and source happy expression;
- cream/peach suit;
- right-facing tail;
- separate upright head and chest V marks;
- ten supplied expression sets;
- conservative underlap assets and reference overlays.

The supplied alternate expressions are visibly coarser and more geometric than the source happy face. They need the requested native-grid/style refinement before runtime use.

## Preliminary risks and unknowns

### Logical pixel scale

The 1254-pixel canvas is an enlarged pixel-art source, but a preliminary edge-period heuristic is not strong enough to prove the canonical scale. The dedicated `analyze_pixel_grid.py` must compare run lengths, edge autocorrelation, transition spacing, and nearest-neighbor consistency and produce visual candidate comparisons. No canonical resolution is claimed yet.

### Hidden artwork

The manifest marks more than anatomy underlaps as `reconstructedPixels`, including procedural expressions, effects, guides, and references. The implementation must distinguish anatomy underlaps from other derived/reconstructed assets by stable role, not by that flag alone.

### Runtime event seams

- Chat and notification events already expose safe high-level signals.
- Terminal completion is handled within terminal views; a shared terminal lifecycle adapter must be added without changing PTY identity or persisting command content.
- Agent `blocked` semantics are not a single existing event; the adapter must derive them from safe run state/status sources and test the mapping.
- Cross-window event delivery must contain IDs, enums, counts, velocities, and safe codes only—never messages, commands, transcripts, prompts, tokens, or stack traces.

### Tauri windows and capabilities

Tauri 2 supports labeled `WebviewWindow` instances and per-window capabilities. The Pet overlay and panel should each receive only their required window/event permissions. Window creation authority should remain with the privileged main window or Rust setup path. Official references:

- [Tauri WebviewWindow API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)

### Rendering dependency

PixiJS 8 is not installed. The latest official upstream release observed during discovery is 8.18.1 and the project is MIT-licensed. A final exact version and lockfile change must be reviewed at implementation time. PixiJS 8 uses string scale modes such as `nearest`.

- [PixiJS repository and releases](https://github.com/pixijs/pixijs)
- [PixiJS v8 migration guide](https://pixijs.com/8.x/guides/migrations/v8)

### Local toolchain

- Node: 24.16.0.
- npm: 11.13.0.
- Python: 3.12.10.
- Cargo: 1.96.0.
- rustc: 1.96.0.
- FFmpeg: 8.1.1.
- Pillow and NumPy are available in the bundled Codex runtime.
- OpenCV, `psd-tools`, and `pngquant` are not currently available.

The planned deterministic pipeline does not require OpenCV, SAM, or `psd-tools` for its first phase. A small repository-native PSD validator can validate the required record structure without a heavy dependency. Pillow/NumPy versions will be pinned only after compatibility and license review.

## Architecture approaches considered

### A. Build-time integer-pixel rig and pre-rendered atlases (recommended)

Normalize the archival layers into a derived rig, render all major animations at a proven native pixel scale, validate every frame, pack atlases, and use a small imperative PixiJS controller at runtime. Keep only face tracking and lightweight effects procedural.

Benefits: strongest pixel fidelity, deterministic QA, stable logos, low runtime cost, visual-regression friendly, and directly aligned with the specification. Cost: larger generated asset set and more build-pipeline work.

### B. Fully layered runtime rig

Load many source parts and animate pivots continuously in PixiJS.

Benefits: fewer pre-rendered frames and more runtime flexibility. Costs: subpixel wobble, runtime texture/state complexity, harder deterministic QA, higher GPU/CPU overhead, and greater risk of exposed underlap gaps. This contradicts the requested frame-first production strategy.

### C. DOM/CSS sprite presentation inside the main window

Use CSS background positions and DOM overlays, avoiding PixiJS and separate Pet windows.

Benefits: smaller dependency and simpler initial component integration. Costs: fails the independent desktop Pet/panel window requirement, makes tight transparent bounds and movement behavior weaker, and tends to blur at non-integer scaling.

Approach A is the only approach that satisfies the full requirement set without weakening visual fidelity or desktop behavior.

## Discovery conclusion

The supplied layered package is structurally usable and should be treated as the animation source of truth. No fallback segmentation or cloud image generation is justified. The implementation should proceed with a local deterministic asset pipeline, build-time frame rendering, packed PixiJS atlases, separate least-privilege Tauri windows, and privacy-safe adapters over existing VibeSpace chat, terminal, agent, and notification systems.

Implementation remains blocked on explicit user approval of `PETS_IMPLEMENTATION_PLAN.md`, as required by the authoritative prompt and repository coordination rules.
