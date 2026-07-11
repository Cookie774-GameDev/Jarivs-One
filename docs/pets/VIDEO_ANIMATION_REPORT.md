# Pixel Pets — Video Animation Report

Agent: `AGENT-20260711-111338-PX7L`  
Branch: `agent/pixel-pets-axolotl`  
Date: 2026-07-11

## Source videos (motion authority)

| Runtime | Source file | Res | FPS | Frames | Duration |
|---------|-------------|-----|-----|--------|----------|
| walkRight | Axolotl_walking_in_place_animation_202607111701.mp4 | 1280×720 | 24 | 96 | 4s |
| walkLeft | Axolotl_walking_cycle_left_202607111648.mp4 | 1280×720 | 24 | 96 | 4s |
| idlePrimary | Axolotl_character_breathing_and_…_202607111640.mp4 | 1920×1080 | 24 | 96 | 4s |
| idleFun | Axolotl_character_2nd idle_animation_1080p_202607111636.mp4 | 1920×1080 | 24 | 96 | 4s |
| welcome | Axolotl_character_pixel_art_Welcome Animtion.mp4 | 1920×1080 | 24 | 96 | 4s |
| sleepTransition + sleepingLoop | Axolotl_transitions_to_sleep_202607111658.mp4 | 1280×720 | 24 | 240 | 10s |
| wakeFromSleep | derived (reverse end of sleepTransition) | — | — | 8 | ~0.3s |

## Background removal

- Green-screen key: G high vs R/B thresholds
- Black letterbox + near-white canvas cleared
- Green spill desaturation on residual edges
- Hard alpha (0/255) for solid geometry
- Palette nearest-snap to `source/palette.json`
- Corners of sample frames: alpha 0 (see `ALPHA_FRAME_QA.json`)

## Runtime frame counts

| Animation | Frames | FPS | Loop | One-shot |
|-----------|--------|-----|------|----------|
| walkRight | 20 | 13 | yes | no |
| walkLeft | 20 | 13 | yes | no |
| idlePrimary | 48 | 13 | yes | no |
| idleFun | 60 | 15 | no | yes |
| welcome | 60 | 15 | no | yes |
| sleepTransition | 120 | 14 | no | yes |
| sleepingLoop | 40 | 10 | yes | no |
| wakeFromSleep | 8 | 24 | no | yes |

Native cell: **128×128** RGBA. Atlases: `@1x` + nearest-neighbor `@2x`.

## Behavior mapping

- **welcome**: once after boot → idlePrimary (idempotent via `welcomePlayed`)
- **idlePrimary**: default
- **idleFun**: every 60s when eligible; no backlog after suspension
- **walkLeft/Right**: only while actively dragging; direction from pointer velocity (px/s) with dead-zone 12 px/s, hysteresis 80 ms, stop-delay 80 ms; stop when drag ends or velocity returns to neutral
- **sleepTransition** → **sleepingLoop** after inactivity (default 5 min)
- **click** while sleeping: open mini-panel immediately + wakeFromSleep (no second click, no delayed panel)
- **drag** while sleeping: wakes then walks by velocity direction

## Pipeline commands

```powershell
python tools/pets/pets_pipeline/process_videos.py
python tools/pets/pets_pipeline/pack_atlases.py
```

Temp caches: `tools/pets/tmp_video_cache/` (gitignored).

## Runtime

- `app/src/features/pets/*` — state machine, drag velocity, scheduler, atlas player, PetHost + PetOverlay + PetMiniPanel
- Mounted from `App.tsx` as lazy `PetHost`
- Canvas 2D nearest-neighbor atlas playback (Pixi-compatible JSON atlas format)

## Known limitations

- Full PixiJS `Application` wrapper not required for atlas JSON playback; player uses Canvas 2D with same atlas schema (crisp pixels, low overhead).
- Separate Tauri `pet-overlay` window not yet split; pet floats in main shell at z-70 (behavior complete; window isolation is a follow-up).
- Identity repair is palette+alpha based; heavy generative face drift may need additional layer compositing passes.
- Face expression layer swap from layered package not fully automated per-frame yet.

## Rollback

```powershell
git checkout agent/pixel-pets-axolotl
git revert <commit>
# or remove app/src/features/pets + animations/atlases assets
```
