# V1 to V2 Migration

## Overview

The Context Map V1-to-V2 migration converts legacy localStorage-based context trees into the
Dexie V4 graph schema. The migration is additive: V1 data is retained after migration and a
full backup is taken before any conversion begins.

Source: app/src/features/context/migration.ts

## Migration States

| State                    | Meaning                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| no_legacy_data           | No V1 localStorage entries found for this account/project                             |
| foreign_legacy_ignored   | Reserved result type; the current migration rejects a mismatched legacy account claim |
| migrated                 | All V1 maps converted successfully                                                    |
| migrated_with_quarantine | Some records were corrupt and quarantined                                             |
| already_migrated         | Migration previously completed for this account/project                               |

## Process

1. **Identity check**: Validate accountId and projectId against SAFE_ID pattern.
2. **Legacy detection**: Read the project-scoped map collection, legacy tree, and selected-file
   localStorage keys.
3. **Identity claim**: Validate the legacy payload's account fingerprint; a mismatch fails
   closed rather than returning `foreign_legacy_ignored`.
4. **Backup**: Store the three exact legacy values in `context_migration_backups` (Dexie V4).
5. **Conversion**: For each V1 ContextMapRecord:
   - Generate a stable V2 map ID (boundedId with FNV-style hash for unsafe IDs).
   - Convert tree nodes to ContextEntityV2 records with contains edges.
   - Create a ContextSourceV2 from the map root.
   - Build ContextProvenanceV2 for each entity.
   - Write the ContextGraphSnapshotV2 via the graph repository.
6. **Selection migration**: Convert V1 selectedMapId/selectedFile to ContextSelectionV2.
7. **Quarantine**: Records that fail validation are written to context_quarantine with
   recovery options rather than being discarded.
8. **ID remapping**: A record of legacy-to-new ID mappings is returned for reference.

## Backup

- Stored in: context_migration_backups table.
- Keyed by: accountId + projectId.
- Status field tracks backup lifecycle.
- Retained until explicitly deleted by the user.
- Contains the full serialized V1 collection.

## Quarantine and Recovery

Corrupt records are isolated in context_quarantine with:

| Field           | Purpose                         |
| --------------- | ------------------------------- |
| id              | Unique quarantine entry ID      |
| accountId       | Owner                           |
| mapId           | Affected map (or legacy map ID) |
| recordKind      | Type of record that failed      |
| quarantinedAt   | Timestamp                       |
| recoveryOptions | Available recovery actions      |

Recovery option identifiers per record:

- **retry**: Intended action is to validate the preserved source and retry migration.
- **restore_backup**: Intended action is to restore the preserved pre-migration backup.
- **export_then_discard**: Intended action is to export quarantined records before discarding
  their local copies.

`ContextRecoveryNotice` currently displays these choices as informational rows. It does not
execute any of the three actions, so recovery requires a future guarded action surface.

## V1 Retention

The migration sets legacyRetained: true in the result. V1 localStorage keys are never deleted
by the migration process. This preserves evidence for:

- Re-migration if the V2 schema evolves.
- Manual inspection of legacy data.

No user-facing destructive rollback procedure is implemented by the current recovery notice.

## Constraints

- The legacy UI limits active V1 maps to 5; migration processes the validated collection it is
  given and does not impose that UI creation limit.
- Node kinds mapped: root->root, area->folder, file->file, symbol->symbol, note->markdown_note.
- IDs exceeding 200 chars or containing unsafe characters are hashed to stable bounded IDs.
- Control characters in text fields are replaced with spaces and trimmed.
- Timestamps that are not safe integers fall back to the migration timestamp.
