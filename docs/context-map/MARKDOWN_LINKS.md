# Markdown Links and Notes

## Overview

Context Map notes are ordinary Markdown stored in the `context_notes` Dexie table with full
revision history in `context_note_revisions`. Notes are attached to entities within a map and
support internal wiki-style links.

Source: `app/src/features/context/contentContracts.ts`, `app/src/features/context/contentRepository.ts`

## Note Structure

| Field             | Type   | Notes                     |
| ----------------- | ------ | ------------------------- |
| id                | string | Stable note ID            |
| accountId         | string | Owner                     |
| mapId             | string | Parent map                |
| entityId          | string | Attached entity           |
| sourceId          | string | Originating source        |
| currentRevisionId | string | Points to latest revision |
| status            | string | Lifecycle status          |
| createdAt         | number | Unix ms                   |
| updatedAt         | number | Unix ms                   |

## Revisions

Every edit creates a new `ContextNoteRevisionV2` record:

| Field     | Type   | Notes                                      |
| --------- | ------ | ------------------------------------------ |
| id        | string | Revision ID                                |
| accountId | string | Owner                                      |
| mapId     | string | Parent map                                 |
| noteId    | string | Parent note                                |
| sequence  | number | Monotonic per note (unique compound index) |
| createdAt | number | Unix ms                                    |

Revisions are immutable once written. The note's `currentRevisionId` points to the latest.

## Wiki Links

Notes support `[[Note Title]]` and alias-based wiki syntax within the supplied note index. When
relations are built:

- The link resolves to a note title or alias (case-insensitive).
- If no match exists, the link renders as a broken-link indicator.
- The relation report derives outgoing links and backlinks without claiming that graph-edge rows
  are persisted automatically.

## Backlinks

The relation report exposes notes that reference the current note via:

- Explicit `[[wiki links]]`.
- Derived outgoing relation records.
- Derived backlink records.

## Standard Markdown

The non-executable render plan preserves ordinary text and fenced code, validates standard
links/images, and extracts safe wiki embeds. Raw HTML, SVG, MDX/ESM, and imported extensions are
kept text-only.

## Conventions

- Notes are account- and map-scoped; contract and repository boundaries reject identity or map
  conflicts.
- Note keys incorporate the account identity for isolation.
- Note records reference validated Markdown content assets and immutable recovery artifacts.
  The native search document body has a separate 1 MB indexing cap; that is not a note-body
  storage limit.
- Templates (see `app/src/features/context/contextTemplates.ts`) provide reusable Markdown
  skeletons with `{{placeholder}}` tokens.
