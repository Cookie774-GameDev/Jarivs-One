<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "reference-analysis",
  "status": "measured",
  "evidenceCutoff": "2026-07-30T04:58:59.5349264Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632.mp4",
  "sourceSha256": "B7C1EF966BC3BB118472F8EFD7334A5AF792DEB3DFF240105886F05F4043F6C1",
  "linkedArtifactIds": [
    "component-mapping",
    "design",
    "design-tokens",
    "frame-manifest",
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
  "sampling": {
    "method": "all_frames_extracted_plus_uniform_and_rgb-difference_motion_candidates",
    "extractedFrameCount": 395,
    "selectedFrameCount": 22,
    "rectangularRoiCount": 45
  },
  "confidence": 0.68,
  "measurements": {
    "paletteTokenCount": 15,
    "typographyCandidateCount": 72,
    "geometryMetricCount": 5,
    "motionSampleCount": 6,
    "browserTypographyRasterStatus": "not_run"
  }
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Reference Analysis

## Source Status

The authorized recording was hashed and measured. The committed record contains only its basename, SHA-256, sanitized codec/color metadata, timestamps, frame IDs, and aggregate measurements.

## Reproducible Method

Run the repository analyzer with the exact authorized basename, an ignored `.artifacts/monochrome/<session>/reference` root, and `docs/appearance/monochrome`. The analyzer extracts every frame privately, selects uniform and frame-difference candidates, measures rectangular RGB regions, and validates staged artifacts before publishing the six evidence files.

## Frame Evidence

22 sanitized frame records cross-link the private extraction. Their purposes cover top bar/rail, hover/active sidebar, cards/charts, table states, pricing/forms, tooltip/loading, and page-transition analysis. Semantic presence is not claimed from machine classification.

## Palette

15 token values use median RGB from three rectangular ROIs per token across multiple frames. Seed, measured, and final values remain separately recorded.

## Typography

The analyzer parsed and hashed the bundled Latin WOFF2 files for JetBrains Mono, Inter, and Plus Jakarta Sans at weights 400/500/600 across all 72 mandated conditions. Width and line metrics are real font-table measurements. Browser rasterization and `document.fonts.ready` were not run, so every candidate records `fontsReady: false` and the decision confidence is limited.

## Geometry

Viewport dimensions are exact media metadata. Rail, top-bar, and major-content measurements are multi-frame image-gradient interpretations with raw samples, range, median, and confidence.

## Motion

Six state categories reference the strongest adjacent-frame RGB differences. Durations are frame intervals; a single interval cannot establish a full easing curve.

## Limitations

The analyzer does not perform OCR, identity extraction, semantic object recognition, or browser font rasterization. The recording is a style authority, not a pixel-perfect content target. Low-confidence interpretations must not override accessibility or preserved-theme requirements.

## Privacy

Source bytes and extracted frames remain only in the ignored task artifact root. No absolute source path, private frame path, copied identity, URL, or user content is committed.
