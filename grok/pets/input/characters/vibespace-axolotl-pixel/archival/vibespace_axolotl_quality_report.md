# VibeSpace Axolotl animation-rig quality report

## Source inspection

- Source dimensions: **1254 × 1254 px**.
- Source mode: **RGBA**, but the alpha channel was numerically fully opaque: minimum **255**, maximum **255**, **1** unique alpha value, and **0** transparent pixels.
- The visible checkerboard was therefore **baked into the RGB pixels**, not real transparency. Its repeating cell size is approximately **31 px**.
- Character bounds after background removal: **x=188…1064, y=86…1112**.
- Preserved source features: six external axolotl gills, right-side tail, warm cream suit/helmet, peach-orange trim, dark glossy face display, happy closed eyes, small mouth, hoodie strings, feet, hands, side helmet modules, head V badge, and chest V badge.

## Background removal

The background was removed by isolating the largest connected non-neutral/non-checker component, retaining a narrow soft edge, and replacing partial-edge RGB with the nearest opaque character color. This avoids carrying white/gray checker pixels into semi-transparent edges. The transparent preview contains **1024981** fully transparent pixels and **4065** partially transparent edge pixels.

## Layer package

- Total raster layers: **136**.
- Full-canvas layer PNG size: **1254 × 1254 px**, global position `(0, 0)`.
- Default visible expression: **happy**, extracted from the source.
- Additional procedural expression sets: neutral, excited, thinking, working/focused, concerned, error, surprised, sleepy, and relieved.
- Guide and reference groups are hidden by default.
- All logo layers are marked non-mirrorable in the manifest.

## PSD validation

- True layered PSD created: **YES**.
- PSD binary signature / validation: `{"signature": "8BPS", "width": 1254, "height": 1254, "leafLayerCount": 136, "groupCount": 23, "topGroups": ["00_GUIDES", "01_BACK_EFFECTS", "02_BACK_ANATOMY", "03_LEGS", "04_BODY", "05_ARMS", "06_HEAD", "07_FACE", "08_LOGOS", "09_FRONT_DETAILS", "10_EFFECTS", "11_REFERENCE"], "containsTransparencyLayers": true}`.
- The PSD contains real raster layers and layer groups, not a renamed or flattened PNG.
- Limitation: the writer preserves the hidden `original_reference_locked` layer name and visibility, but does not set Photoshop's UI lock flag. Lock it manually if desired.

## ORA / ZIP validation

- ORA structure valid: **YES**.
- ORA contains `mimetype`, `stack.xml`, `mergedimage.png`, thumbnail, and **136** layer PNG entries.
- Standalone layer ZIP contains the manifest plus every full-canvas PNG layer.
- Photoshop JSX syntax check with Node: **PASS** ``.

## Pixel-difference validation

- Recomposition versus cleaned transparent source: maximum foreground RGB difference **0**, mean foreground RGB difference **0.000000**, alpha-mismatch pixels **0**.
- Recomposition versus the original source on fully opaque retained character pixels: mean RGB difference **1.221556**.
- Meaningful differences are limited to the removed checkerboard and edge-color decontamination. Hidden reconstructions, alternate expressions, guides, and optional effects do not change the default visible pose.

## Reconstructed hidden artwork

The following layers contain conservative invented/extended pixels for joint rotation or covered anatomy:

- `helmet_back`
- `tail_root_underlap`
- `left_gill_upper_attachment`
- `left_gill_middle_attachment`
- `left_gill_lower_attachment`
- `right_gill_upper_attachment`
- `right_gill_middle_attachment`
- `right_gill_lower_attachment`
- `left_leg_underlap`
- `right_leg_underlap`
- `left_upper_arm_underlap`
- `right_upper_arm_underlap`
- `left_hand_underlap`
- `right_hand_underlap`
- `helmet_under_face_trim`
- `torso_behind_arms`
- `lower_body_behind_hoodie`

These are intentionally hidden by default because the flattened reference does not contain the covered source pixels. They are suitable as starting underlaps, but should be reviewed during extreme rotations.

## Limitations and uncertainty

- The source was one flattened pixel-art image, so exact original hidden anatomy cannot be recovered. Under-arm torso, sleeve/hand overlap, leg roots, helmet-under-face areas, tail root, and gill attachments are conservative reconstructions.
- Joint boundaries were manually inferred from the visible pose. The default pose recomposes exactly, but large deformations may need artist cleanup in Spine, Rive, Live2D, or Photoshop.
- Alternate expressions are procedural additions in the same palette and pixel density; only the happy expression is original source artwork.
- The head and chest V shapes use exact extracted source pixels. They were not mirrored, stretched, rotated, or redrawn.

## Non-zero required outputs

- `vibespace_axolotl_animation_rig.psd`: 9042932 bytes
- `vibespace_axolotl_animation_rig.ora`: 4740456 bytes
- `vibespace_axolotl_layer_manifest.json`: 126745 bytes
- `vibespace_axolotl_preview_transparent.png`: 826219 bytes
- `vibespace_axolotl_preview_dark_background.png`: 695374 bytes
- `vibespace_axolotl_layers_contact_sheet.png`: 660668 bytes
- `vibespace_axolotl_expression_sheet.png`: 55352 bytes
- `vibespace_axolotl_reconstruction_overlay.png`: 17240 bytes
- `vibespace_v_logo.png`: 4146 bytes
- `assemble_vibespace_axolotl_in_photoshop.jsx`: 24562 bytes
- `assemble_vibespace_axolotl_in_photopea.md`: 1196 bytes
- `vibespace_axolotl_layers.zip`: 3980077 bytes
