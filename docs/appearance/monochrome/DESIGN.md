<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "design",
  "status": "measured",
  "evidenceCutoff": "2026-07-30T04:58:59.5349264Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632.mp4",
  "sourceSha256": "B7C1EF966BC3BB118472F8EFD7334A5AF792DEB3DFF240105886F05F4043F6C1",
  "linkedArtifactIds": [
    "component-mapping",
    "design-tokens",
    "frame-manifest",
    "reference-analysis",
    "reference-spec"
  ],
  "privacyDisposition": "sanitized_no_private_source_data",
  "frameIds": [
    "frame.reference-000001",
    "frame.reference-000037",
    "frame.reference-000073",
    "frame.reference-000108",
    "frame.reference-000109",
    "frame.reference-000110",
    "frame.reference-000144",
    "frame.reference-000180",
    "frame.reference-000207",
    "frame.reference-000208",
    "frame.reference-000209",
    "frame.reference-000216",
    "frame.reference-000252",
    "frame.reference-000288",
    "frame.reference-000323",
    "frame.reference-000324",
    "frame.reference-000325",
    "frame.reference-000328",
    "frame.reference-000329",
    "frame.reference-000359",
    "frame.reference-000360",
    "frame.reference-000395"
  ],
  "motifIds": [
    "motif.panel-silhouette",
    "motif.pricing-form-structure",
    "motif.segmented-chart"
  ],
  "tokenIds": [
    "color.black",
    "color.surface-1",
    "color.surface-2",
    "color.surface-3",
    "color.active",
    "color.border",
    "color.border-strong",
    "color.text",
    "color.text-secondary",
    "color.text-tertiary",
    "color.purple",
    "color.teal",
    "color.amber",
    "color.green",
    "color.red"
  ],
  "mappingIds": [
    "mapping.hive-page",
    "mapping.plans-page",
    "mapping.plugins-page"
  ],
  "measurements": {
    "authority": "measured_recording_with_sanitized_metadata",
    "tokenDecision": "reference_measurement",
    "typographyDecision": "jetbrains-mono.400.12-16.normal.1x"
  }
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Design Contract

## Authority

The recording SHA and linked measured frames are the style authority. Measurements are separated from interpretation and final decisions.

## Direction

Use the measured dark-surface hierarchy and sparse accents without copying reference branding, text, accounts, or product content.

## Hierarchy

Measured viewport edges support a compact rail, top-bar separation, and restrained major-content width. Gradient-derived interpretations retain their recorded confidence.

## Tokens

All final color decisions are the measured rectangular-ROI medians in `design-tokens.json`; seeds remain visible for comparison.

## Components

`component-mapping.md` maps measured motifs and frames to VibeSpace routes at motif level only.

## Accessibility

Recorded contrast pairs are evidence, not permission to weaken focus visibility, forced colors, zoom/reflow, reduced motion, or semantic control requirements.

## Motion

Use frame-interval evidence conservatively. Disable non-essential interpolation under reduced motion.

## Preserved Themes

Default, VibeSpace, Jarvis Core, and Origami remain isolated from MonoChrome calibration.

## Anti-Goals

Do not copy branding or source text, infer identities, commit frames, expose private paths, or impose whole-page pixel equality on unrelated VibeSpace content.
