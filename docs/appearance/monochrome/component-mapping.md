<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "component-mapping",
  "status": "measured",
  "evidenceCutoff": "2026-07-30T04:58:59.5349264Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632.mp4",
  "sourceSha256": "B7C1EF966BC3BB118472F8EFD7334A5AF792DEB3DFF240105886F05F4043F6C1",
  "linkedArtifactIds": [
    "design",
    "design-tokens",
    "frame-manifest",
    "reference-analysis",
    "reference-spec"
  ],
  "privacyDisposition": "sanitized_no_private_source_data",
  "mappings": [
    {
      "id": "mapping.plans-page",
      "referenceMotifFrameIds": [
        "motif.pricing-form-structure",
        "frame.reference-000001"
      ],
      "vibeSpaceRouteComponentPath": "app/src/features/settings/sections/Plans.tsx",
      "semanticTokenId": "color.black",
      "allowedScopedException": "none",
      "stateCoverage": "default, loading, error",
      "testOwner": "MC9",
      "status": "measured"
    },
    {
      "id": "mapping.hive-page",
      "referenceMotifFrameIds": [
        "motif.segmented-chart",
        "frame.reference-000395"
      ],
      "vibeSpaceRouteComponentPath": "app/src/features/settings/sections/Hive.tsx",
      "semanticTokenId": "color.surface-1",
      "allowedScopedException": "raised panels may use color.surface-2",
      "stateCoverage": "default, loading, empty",
      "testOwner": "MC9",
      "status": "measured"
    },
    {
      "id": "mapping.plugins-page",
      "referenceMotifFrameIds": [
        "motif.panel-silhouette",
        "frame.reference-000216"
      ],
      "vibeSpaceRouteComponentPath": "app/src/features/plugins/Plugins.tsx",
      "semanticTokenId": "color.purple",
      "allowedScopedException": "none",
      "stateCoverage": "default, focus, disabled",
      "testOwner": "MC9",
      "status": "measured"
    }
  ],
  "measurements": {
    "sourceFrameCount": 22,
    "interpretation": "motif-level mapping, not product-content copying"
  }
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Component Mapping

Mappings use measured motif/frame evidence as style guidance. They do not copy source product content.

| Mapping ID           | Reference motif/frame IDs                            | VibeSpace route/component path               | Semantic token  | Allowed scoped exception              | State coverage           | Test owner | Status   |
| -------------------- | ---------------------------------------------------- | -------------------------------------------- | --------------- | ------------------------------------- | ------------------------ | ---------- | -------- |
| mapping.plans-page   | motif.pricing-form-structure, frame.reference-000001 | app/src/features/settings/sections/Plans.tsx | color.black     | none                                  | default, loading, error  | MC9        | measured |
| mapping.hive-page    | motif.segmented-chart, frame.reference-000395        | app/src/features/settings/sections/Hive.tsx  | color.surface-1 | raised panels may use color.surface-2 | default, loading, empty  | MC9        | measured |
| mapping.plugins-page | motif.panel-silhouette, frame.reference-000216       | app/src/features/plugins/Plugins.tsx         | color.purple    | none                                  | default, focus, disabled | MC9        | measured |
