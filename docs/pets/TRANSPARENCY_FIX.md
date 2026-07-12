# Pet black-rectangle transparency fix

**Branch:** `agent/pixel-pets-axolotl`  
**Date:** 2026-07-11  
**Scope:** Compositing only — animation frames, timing, and state machine unchanged.

## Root cause (verified layer-by-layer)

| Layer | Finding |
|-------|---------|
| Runtime atlas PNG | **PASS** — RGBA8888; outer corners alpha `0` (not opaque black) |
| Pixi clear | Must use `backgroundAlpha: 0`; re-assert after init |
| **Main shell body CSS** | **PRIMARY when pet was embedded** — `body { @apply bg-background }` is opaque |
| **PetHost architecture** | **PRIMARY** — pet was drawn *inside* the main window while the real transparent `pet-overlay` Tauri window was **hidden** |
| Tauri pet-overlay conf | `transparent: true`, `decorations: false`, `shadow: false`, `backgroundColor: [0,0,0,0]`, WebView2 `--default-background-color=00000000` |
| Rust show path | `set_background_color(Color(0,0,0,0))` on show |
| pet-overlay route | Skips ThemeHost / main shell; early `data-vibespace-view=pet-overlay` |

**Conclusion:** The black/brown rectangle matching the render surface was the **opaque main-app WebView background** (and/or WebView2 default black) behind a canvas that lived in the wrong window — not bad animation art.

## AXO / GLITCH skin mapping (2026-07-11)

| UI skin | Runtime asset folder | Look |
|---------|----------------------|------|
| **AXO** (default) | `vibespace-axolotl-glitch` | Full-color companion (correct live art from video) |
| **GLITCH?** | `vibespace-axolotl-pixel` | Monochrome pipeline alternate |

Folder names on disk are historical. Character mapping in `petCharacters.ts` / `petManifest.ts` is authoritative.

## Fixes applied

1. **PetHost** — In Tauri, show `pet-overlay` only; do **not** embed the sprite under main CSS.
2. **globals.css** — Scoped `html[data-vibespace-view='pet-overlay']` rules force transparent html/body/#root/canvas.
3. **main.tsx + index.html** — Set `data-vibespace-view=pet-overlay` **before** first paint (inline head script + body styles).
4. **PixiAtlasPlayer** — `backgroundAlpha: 0`, re-assert after init, transparent canvas styles.
5. **tauri.conf.json** — pet-overlay `backgroundColor: [0,0,0,0]` + WebView2 transparent args.
6. **pets.rs** — `set_background_color(Some(Color(0,0,0,0)))` on show; panel open hides overlay; close/minimize restores.
7. **AXO skin** — Default AXO loads full-color glitch pack atlases; GLITCH? loads monochrome pack.

## What was NOT changed

- Animation frame sequences, FPS timing, state machine priorities.
- Visible sprite pixel art inside atlases (only character→folder mapping).

## Automated checks

```powershell
cd app
npm run test -- --run src/features/pets
# includes petAtlasAlpha.test.ts + petTransparency.test.ts + petManifest.test.ts
```

## Manual verification (operator)

1. `npm run tauri:dev` from pet worktree.
2. Pet should float **without** a black/brown plate.
3. Drag over light and dark desktop regions (transparent window).
4. Account → Pet: AXO preview is full-color; GLITCH? is monochrome sheet.
5. Open panel → pet hides; close/minimize → pet returns.
6. Packaged build when practical — same visual contract.

## Remaining risks

- Windows WebView2 transparency can still fail if OS / GPU compositors disable acrylic; conf + CSS + architecture are the supported path.
- Browser-only fallback still embeds in main (cannot be truly “desktop transparent”); Tauri path is authoritative.
