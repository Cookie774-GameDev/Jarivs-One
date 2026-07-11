# Identity QA — VibeSpace Axolotl Pixel Pet

**Authority:** validated layered package (PSD/ORA, transparent PNG layers, expression sheet, palette, original reference).  
**Motion authority:** six supplied MP4s (not runtime assets).  
**Evidence location:** `docs/pets/contact-sheets/` (repository durable — not Temp).

## Checklist (all animations)

| Criterion | walkL | walkR | idleP | idleF | welcome | sleepT | sleepL | wake |
|-----------|-------|-------|-------|-------|---------|--------|--------|------|
| Helmet shape stable | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Face-screen size/position fixed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Closed-eye / mouth alignment | n/a | n/a | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hoodie silhouette | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| V logo upright unmirrored (helmet + chest) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Six gills placement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tail shape | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Limb proportions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Body silhouette | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cream/peach palette snap | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ground / bottom-center anchor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Frame-to-frame drift controlled | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

✓ = passed contact-sheet visual review against layered package reference after pipeline repair (chroma key, hard alpha, palette nearest-snap, robust bbox + 88% fill crop, reject green/borders).

## Contact sheets

| Animation | Path |
|-----------|------|
| walkLeft | `docs/pets/contact-sheets/walkLeft-contact-sheet.png` |
| walkRight | `docs/pets/contact-sheets/walkRight-contact-sheet.png` |
| idlePrimary | `docs/pets/contact-sheets/idlePrimary-contact-sheet.png` |
| idleFun | `docs/pets/contact-sheets/idleFun-contact-sheet.png` |
| welcome | `docs/pets/contact-sheets/welcome-contact-sheet.png` |
| sleepTransition | `docs/pets/contact-sheets/sleepTransition-contact-sheet.png` |
| sleepingLoop | `docs/pets/contact-sheets/sleepingLoop-contact-sheet.png` |
| wakeFromSleep | `docs/pets/contact-sheets/wakeFromSleep-contact-sheet.png` |

## Machine reports

- `docs/pets/qa/alpha-report.json` / `alpha-validation.json` — border alpha 0, no green-dominant samples
- `docs/pets/qa/branding-report.json` — V logo orientation samples
- `docs/pets/qa/anchor-report.json` — ground anchor stability
- `docs/pets/qa/loop-seam-report.json` — seamless loop boundaries
- `docs/pets/qa/source-package-validation.json` — layered package validation

## Repair notes (deterministic, not palette-only)

1. **Background removal** — green key + spill desat + letterbox clear; hard alpha 0/255.
2. **Geometry** — robust global bbox + bottom-center crop to 128 native cell (fill ~0.88).
3. **Palette** — nearest snap to `source/palette.json` cream/peach/brown/face-screen.
4. **Branding** — separate walk L/R atlases (no mirror) so V logos stay upright.
5. **Face** — reject frame-to-frame generative face morph; prefer stable screen + approved expression cadence from source timing.
6. **Walk cycles** — isolated clean gait; logos not mirrored from opposite direction.
7. **Sleep** — transition one-shot; loop from stable end segment; wake is short deterministic open (not reverse of full 10s).

## Residual risk

Full automated PSD layer recompose per video frame is not implemented. Identity is locked by pipeline gates + visual contact-sheet review against the layered package. Any future generative drift should re-run contact sheets and branding/alpha reports before ship.
