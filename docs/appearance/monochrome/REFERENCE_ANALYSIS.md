<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "reference-analysis",
  "status": "blocked_missing_source",
  "evidenceCutoff": "2026-07-29T21:13:02.0844029Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632(1).mp4",
  "sourceSha256": null,
  "linkedArtifactIds": [
    "component-mapping",
    "design",
    "design-tokens",
    "frame-manifest",
    "reference-spec"
  ],
  "privacyDisposition": "sanitized_no_private_source_data",
  "frameIds": [],
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
  "sampling": null,
  "confidence": null,
  "measurements": null
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Reference Analysis

## Source Status

Analysis is blocked because the expected source recording, `Screen Recording 2026-07-16 220632(1).mp4`, is unavailable. No source hash or media metadata is known.

## Reproducible Method

From the repository root, run:

```powershell
node scripts/visual-monochrome/analyze-reference.mjs `
  --video "$env:MONOCHROME_REFERENCE_VIDEO" `
  --artifacts ".artifacts/monochrome/<session>/reference" `
  --docs "docs/appearance/monochrome"
```

The exact command checks source availability without changing committed evidence. Frame extraction and measured analysis remain gated on the source.

## Frame Evidence

No frames were extracted, selected, or assigned IDs.

## Palette

No palette was measured from the recording. Values in `design-tokens.json` are direction-setting seeds whose provenance is `master_goal_seed`.

## Typography

No font family, size, weight, line height, or letter spacing was measured.

## Geometry

No dimensions, spacing, radius, alignment, or region of interest was measured.

## Motion

No duration, frame rate, transition, easing, choreography, or interaction timing was measured.

## Limitations

The missing recording prevents visual comparison, sampling, confidence scoring, and evidence-backed conclusions. This document must be regenerated under the later recording-analysis phase before measured claims are introduced.

## Privacy

The contract stores only the expected filename. It contains no absolute path, user identity, URL, copied source content, or extracted frame.
