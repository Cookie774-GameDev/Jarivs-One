# Assemble or verify the VibeSpace Axolotl rig in Photopea

1. Open Photopea in a desktop browser.
2. Choose **File → Open** and select `vibespace_axolotl_animation_rig.ora` from this package. Photopea should load the layer groups, visibility states, and transparent canvas automatically.
3. Confirm the document is **1254 × 1254 px**, the checkerboard is Photopea's transparency display rather than baked image content, and `00_GUIDES` plus `11_REFERENCE` are hidden.
4. Expand `07_FACE → expressions`. Leave only one expression subgroup visible at a time; `happy` is the default source expression.
5. Choose **File → Save as PSD** and save as `vibespace_axolotl_animation_rig.psd`. Keep **Layers** enabled.
6. Reopen the saved PSD once, expand several groups, and verify the layers are raster layers rather than one flattened image.
7. Export a test PNG with **File → Export As → PNG**. The exported PNG should have a transparent background and match `vibespace_axolotl_preview_transparent.png`.
8. Keep the ORA and `vibespace_axolotl_layers.zip` as independent backups.

The PNG layer files are full-canvas images and already align at `(0, 0)`, so manual placement is not required.
