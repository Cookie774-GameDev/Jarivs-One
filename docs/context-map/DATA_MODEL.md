# Context Map Data Model

## Schema Version

Current contract version: **2** (CONTEXT_SCHEMA_VERSION = 2).
Dexie database schema: **V8** (eight incremental versions). Context graph tables were added in
V4, notes/assets in V5, and embeddings in V6; V7 and V8 contain broader application stores.

## V2 Graph Contracts

All V2 records are defined in app/src/features/context/contracts.ts and validated at parse
time by parseContextGraphSnapshotV2.

### ContextMapRecordV2

| Field                  | Type                        | Notes                                     |
| ---------------------- | --------------------------- | ----------------------------------------- |
| version                | 2                           | Literal                                   |
| id                     | string                      | Stable ID, max 200 chars, SAFE_ID pattern |
| accountId              | string                      | Owner account                             |
| projectId              | string or null              | Project scope                             |
| name                   | string                      | Display name, max 500 chars               |
| status                 | active / archived / deleted | Lifecycle                                 |
| sourceIds              | string[]                    | Ordered source references                 |
| selectedWorkspaceId    | string?                     | Active workspace                          |
| summary                | string                      | Map summary, max 8192 chars               |
| recommendedEntryPoints | ContextReferenceV2[]        | Max 100                                   |
| statistics             | ContextMapStatisticsV2      | Aggregate counts                          |
| createdAt              | number                      | Unix ms                                   |
| updatedAt              | number                      | Unix ms                                   |
| lastIndexedAt          | number?                     | Last successful index                     |
| knowledgeRevision      | number                      | Monotonic revision counter                |

### ContextSourceV2

| Field          | Type                   | Notes                            |
| -------------- | ---------------------- | -------------------------------- |
| version        | 2                      | Literal                          |
| id             | string                 | Stable ID                        |
| accountId      | string                 | Owner                            |
| mapId          | string                 | Parent map                       |
| kind           | ContextSourceKind      | See below                        |
| label          | string                 | Display label                    |
| status         | ContextSourceStatus    | See below                        |
| localRoot      | string?                | Folder path (local sources)      |
| localFile      | string?                | File path (single-file sources)  |
| github         | GitHubContextSourceV2? | GitHub metadata                  |
| createdAt      | number                 | Unix ms                          |
| updatedAt      | number                 | Unix ms                          |
| lastIndexedAt  | number?                | Last index time                  |
| lastVerifiedAt | number?                | Last verification                |
| sourceRevision | string?                | Opaque revision token            |
| parserVersion  | number                 | Parser that produced this source |

### ContextSourceKind

local_folder, local_file, github_repository, linked_vibespace_content, portable_markdown_folder

### ContextSourceStatus

pending, indexing, ready, stale, offline, permission_required, error, removed

### ContextEntityV2

| Field          | Type              | Notes                        |
| -------------- | ----------------- | ---------------------------- |
| version        | 2                 | Literal                      |
| id             | string            | Stable ID                    |
| accountId      | string            | Owner                        |
| mapId          | string            | Parent map                   |
| sourceId       | string            | Originating source           |
| kind           | ContextEntityKind | 40+ kinds                    |
| label          | string            | Display label, max 500 chars |
| path           | string?           | File path, max 4096 chars    |
| summary        | string?           | Max 8192 chars               |
| sourceRevision | string            | Provenance revision          |
| provenanceIds  | string[]          | Links to provenance records  |
| createdAt      | number            | Unix ms                      |
| updatedAt      | number            | Unix ms                      |

### ContextEntityKind (42 kinds)

map, source, folder, file, markdown_note, heading, block, symbol, module, class, function,
method, component, route, endpoint, database_table, migration, test, dependency, task,
property, tag, attachment, image, audio, video, pdf, url, chat, message, terminal, agent,
skill, canvas, canvas_object, github_repository, github_branch, github_commit, github_issue,
github_pull_request, github_release, github_workflow

### ContextEdgeV2

| Field          | Type            | Notes            |
| -------------- | --------------- | ---------------- |
| version        | 2               | Literal          |
| id             | string          | Stable ID        |
| accountId      | string          | Owner            |
| mapId          | string          | Parent map       |
| sourceEntityId | string          | Edge origin      |
| targetEntityId | string          | Edge target      |
| kind           | ContextEdgeKind | 26 kinds         |
| provenanceIds  | string[]        | Provenance links |
| confidence     | number          | 0.0 to 1.0       |
| sourceRevision | string          | Revision token   |
| createdAt      | number          | Unix ms          |
| updatedAt      | number          | Unix ms          |

### ContextEdgeKind (26 kinds)

contains, links_to, embeds, backlinks_to, mentions, unlinked_mention, imports, exports,
calls, implements, extends, depends_on, tested_by, documents, generated_from, related_to,
owned_by, assigned_to, used_by, changed_by, introduced_in, fixed_by, references_file,
references_symbol, attached_to, derived_from

### ContextProvenanceV2

| Field             | Type              | Notes                   |
| ----------------- | ----------------- | ----------------------- |
| version           | 2                 | Literal                 |
| id                | string            | Stable ID               |
| accountId         | string            | Owner                   |
| mapId             | string            | Parent map              |
| targetKind        | entity or edge    | What this proves        |
| targetId          | string            | Target record ID        |
| sourceId          | string            | Source that produced it |
| sourceKind        | ContextSourceKind | Source type             |
| path              | string?           | File path               |
| githubRef         | string?           | Branch/tag              |
| githubSha         | string?           | 40- or 64-char hex SHA  |
| lineStart         | number?           | Start line              |
| lineEnd           | number?           | End line                |
| heading           | string?           | Markdown heading        |
| blockId           | string?           | Block reference         |
| messageId         | string?           | Chat message            |
| terminalSessionId | string?           | Terminal session        |
| extractedAt       | number            | Unix ms                 |
| parser            | string            | Parser identifier       |
| confidence        | number            | 0.0 to 1.0              |
| sourceRevision    | string            | Revision token          |

### GitHubContextSourceV2

| Field             | Type                        | Notes                   |
| ----------------- | --------------------------- | ----------------------- |
| installationId    | string                      | GitHub App installation |
| owner             | string                      | Repository owner        |
| repository        | string                      | Repository name         |
| selectedRef       | string                      | Branch or tag           |
| resolvedCommitSha | string                      | 40- or 64-char hex      |
| visibility        | public / private / internal | Repository visibility   |

## Dexie Table Layout

Introduced in Dexie schema V4, extended in V5 and V6:

| Table                     | Version | Primary key | Key indexes                                                                                                                                                                                 |
| ------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| context_maps              | V4      | id          | accountId, projectId, status, [accountId+updatedAt], [accountId+projectId], [accountId+status]                                                                                              |
| context_sources           | V4      | id          | accountId, mapId, kind, status, [accountId+mapId], [mapId+status], updatedAt                                                                                                                |
| context_entities          | V4      | id          | accountId, mapId, sourceId, kind, [accountId+mapId], [mapId+kind], [sourceId+kind], updatedAt                                                                                               |
| context_edges             | V4      | id          | accountId, mapId, sourceEntityId, targetEntityId, kind, [accountId+mapId], [sourceEntityId+kind], [targetEntityId+kind], updatedAt                                                          |
| context_provenance        | V4      | id          | accountId, mapId, targetKind, targetId, sourceId, [accountId+mapId], [targetKind+targetId], [sourceId+targetKind], extractedAt                                                              |
| context_migration_backups | V4      | id          | accountId, projectId, status, [accountId+projectId], createdAt                                                                                                                              |
| context_quarantine        | V4      | id          | accountId, mapId, recordKind, [accountId+mapId], quarantinedAt                                                                                                                              |
| context_notes             | V5      | id          | accountId, mapId, entityId, sourceId, currentRevisionId, [accountId+mapId], [mapId+status], [accountId+updatedAt]                                                                           |
| context_note_revisions    | V5      | id          | accountId, mapId, noteId, &[noteId+sequence], [accountId+mapId], [accountId+noteId], createdAt                                                                                              |
| context_assets            | V5      | id          | accountId, mapId, entityId, sourceId, kind, status, [accountId+mapId], [entityId+kind], [sourceId+kind], [mapId+status], [accountId+updatedAt]                                              |
| context_embeddings        | V6      | id          | accountId, mapId, documentId, sourceId, providerKind, providerId, modelId, embeddingVersion, [accountId+mapId], [accountId+mapId+documentId], [accountId+mapId+embeddingVersion], updatedAt |

## Validation Rules

- IDs: alphanumeric start, then alphanumeric plus dot/underscore/colon/slash/hyphen, max 200 chars.
- Labels: max 500 characters, control characters rejected.
- Summaries: max 8192 characters.
- Paths: max 4096 characters.
- GitHub owner/repository: alphanumeric plus underscore/dot/hyphen, 1-100 chars.
- GitHub SHA: exactly 40 or 64 lowercase hex characters.
- Control characters (U+0000-U+001F, U+007F) are stripped or rejected at parse time.
- Prototype pollution guards: only plain Object or null prototypes accepted.

## V1 Schema (Legacy)

The V1 schema is defined in app/src/features/context/tree.ts:

- Storage: localStorage keys prefixed jarvis-context-tree-v1, jarvis-context-maps-v1,
  jarvis-context-selected-file-v1.
- Structure: ProjectContextMapCollection containing ContextMapRecord entries, each with a
  ProjectContextTree of ContextTreeNode (kinds: root, area, file, symbol, note).
- Max active maps: 5 (MAX_ACTIVE_CONTEXT_MAPS).
- Generation providers: local, google (gemini-2.5-flash-lite), groq (llama-3.3-70b-versatile),
  openai (gpt-4o-mini), anthropic (claude-3-5-sonnet-20241022).
