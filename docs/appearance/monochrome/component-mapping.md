<!-- MONOCHROME_JSON_FRONTMATTER
{
  "schemaVersion": 1,
  "artifactId": "component-mapping",
  "status": "blocked_missing_source",
  "evidenceCutoff": "2026-07-29T21:13:02.0844029Z",
  "expectedFileName": "Screen Recording 2026-07-16 220632(1).mp4",
  "sourceSha256": null,
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
      "referenceMotifFrameIds": ["motif.pricing-form-structure"],
      "vibeSpaceRouteComponentPath": "app/src/features/settings/sections/Plans.tsx",
      "semanticTokenId": "color.black",
      "allowedScopedException": "none",
      "stateCoverage": "default, loading, error",
      "testOwner": "MC9",
      "status": "planned_unverified"
    },
    {
      "id": "mapping.hive-page",
      "referenceMotifFrameIds": ["motif.segmented-chart"],
      "vibeSpaceRouteComponentPath": "app/src/features/settings/sections/Hive.tsx",
      "semanticTokenId": "color.surface-1",
      "allowedScopedException": "raised panels may use color.surface-2",
      "stateCoverage": "default, loading, empty",
      "testOwner": "MC9",
      "status": "planned_unverified"
    },
    {
      "id": "mapping.plugins-page",
      "referenceMotifFrameIds": ["motif.panel-silhouette"],
      "vibeSpaceRouteComponentPath": "app/src/features/plugins/Plugins.tsx",
      "semanticTokenId": "color.purple",
      "allowedScopedException": "none",
      "stateCoverage": "default, focus, disabled",
      "testOwner": "MC9",
      "status": "planned_unverified"
    }
  ],
  "measurements": null
}
MONOCHROME_JSON_FRONTMATTER -->

# MonoChrome Component Mapping

The motif IDs come from the plan's comparison vocabulary. No reference frame ID is present because the source recording is unavailable.

| Mapping ID           | Reference motif/frame IDs    | VibeSpace route/component path               | Semantic token  | Allowed scoped exception              | State coverage           | Test owner | Status             |
| -------------------- | ---------------------------- | -------------------------------------------- | --------------- | ------------------------------------- | ------------------------ | ---------- | ------------------ |
| mapping.plans-page   | motif.pricing-form-structure | app/src/features/settings/sections/Plans.tsx | color.black     | none                                  | default, loading, error  | MC9        | planned_unverified |
| mapping.hive-page    | motif.segmented-chart        | app/src/features/settings/sections/Hive.tsx  | color.surface-1 | raised panels may use color.surface-2 | default, loading, empty  | MC9        | planned_unverified |
| mapping.plugins-page | motif.panel-silhouette       | app/src/features/plugins/Plugins.tsx         | color.purple    | none                                  | default, focus, disabled | MC9        | planned_unverified |
