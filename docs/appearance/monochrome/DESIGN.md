<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "design",
  "status": "blocked_missing_source",
  "evidenceCutoff": "2026-07-29T21:13:02.0844029Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632(1).mp4",
  "sourceSha256": null,
  "linkedArtifactIds": [
    "component-mapping",
    "design-tokens",
    "frame-manifest",
    "reference-analysis",
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
  "mappingIds": [
    "mapping.hive-page",
    "mapping.plans-page",
    "mapping.plugins-page"
  ],
  "measurements": null
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Design Contract

## Authority

This document records a provisional direction, not measured reference evidence. The source recording is unavailable, so `master_goal_seed` is the only authority for current token values.

## Direction

Use a restrained monochrome foundation: black canvas, gently separated dark surfaces, high-contrast text, and tightly scoped purple, teal, amber, green, and red semantic accents. Treat these values as replaceable seeds pending reference analysis.

## Hierarchy

Express hierarchy through semantic surface and text roles. Do not claim reference-derived sizing, spacing, typography, or geometry.

## Tokens

All allowed provisional values are declared in `design-tokens.json`. Consumers use semantic token IDs rather than copying literal values.

## Components

The provisional component relationships are declared in `component-mapping.md`. They are planned mappings, not evidence of the unavailable recording.

## Accessibility

Keep primary text visibly distinct from its surface and preserve focus visibility. Formal contrast results require implementation-time testing and are not claimed here.

## Motion

No motion behavior is specified because the source duration, frame rate, transitions, and easing are unknown.

## Preserved Themes

Existing theme behavior remains authoritative until a later implementation phase explicitly changes it. This contract does not mutate product styles.

## Anti-Goals

Do not fabricate frame evidence, infer measurements from the filename, encode private paths, or present seed values as observations from the recording.
