# Context Map Documentation

User-facing help and technical reference for the VibeSpace Context Map system.

## What is Context Map?

Context Map is VibeSpace's local-first knowledge indexing system. Its V2 contracts model local
folders, individual files, GitHub repositories, linked VibeSpace content, and portable Markdown
folders as a durable, queryable graph. The current Context page directly creates local-folder
maps; the other source kinds have validated contracts and supporting services but do not all
have an end-to-end creation flow in that page.

The core graph and full-text index are stored locally in IndexedDB (via Dexie) and the native
Tantivy index inside the Tauri process. GitHub retrieval uses the scoped proxy; selected cloud
generation and explicitly enabled document sync are separate, opt-in network boundaries.

## User Help

### Create from folder

Open the Context workspace, choose **New Map → Local Folder**, and select a directory. VibeSpace
scans the folder tree, classifies files, and builds a graph of areas, files, and symbols. The
map appears in the Maps sidebar once indexing completes.

### Open an individual file

The **Local File** source card routes to the Files workspace for file selection and inspection.
Although `local_file` is a supported V2 source kind and the terminal CLI exposes a bounded
`context create --file <path>` request, the current Context page does not directly create and
index a single-file map.

### GitHub foundation

The **GitHub Repository** source card routes to Tools to connect or manage the read-only
VibeSpace GitHub App. The codebase contains bounded auth, repository-catalog, retrieval,
metadata-graph, reconciliation, and proxy contracts. A complete GitHub map-creation wizard is
not wired into the current Context page, and this documentation does not claim that the proxy
is deployed or that a real installation has been verified.

Required GitHub App permissions: `contents: read`, `metadata: read`.
Optional permissions: `issues`, `pull_requests`, `actions`, `checks`, `discussions`, `releases`.

The catalog contract can represent installation-accessible repositories and visibility
(`public`, `private`, or `internal`) with bounded filtering and selection. See
[GITHUB_CONTEXT.md](GITHUB_CONTEXT.md) for the implemented service boundary and deferred UI.

### Notes and links

The durable content contracts and repository support entity-attached Markdown notes with:

- Wiki-style `[[links]]` between entities within the same map.
- Standard Markdown links to external URLs.
- Backlinks: the inspector shows all notes that reference the current entity.

Notes are stored in `context_notes` with full revision history in `context_note_revisions`.
The current Context-page note editor is a separate project/map-scoped localStorage draft and
does not yet expose the full durable-note service.

### Properties

Entities carry typed properties (key–value metadata). Properties are indexed in the native
search engine and queryable via field filters such as `kind:function` or `tag:auth`.

### Views

The Context workspace exposes these current center modes and source surfaces:

- **Graph**: visual node-and-edge exploration.
- **Sources**: card list of connected sources with status badges.
- **Notes**: a local workspace note editor for a persisted map.
- **Structured**: a tree-derived structured view used by Sources, Views, and Templates sections.
- **Search**: a tree search view.

The native query parser/search pipeline and durable note repository are implemented services;
not every service is surfaced by the current workspace controls.

### Search

Use the search center for lexical queries. The query language supports:

- Free-text terms and `"exact phrases"`.
- Boolean operators: `AND`, `OR`, `NOT` (or `-prefix`).
- Field filters: `tag:auth`, `path:src/lib`, `kind:function`, `github.repo:owner/name`.
- Comparisons: `updated_after:2026-01-01`, `freshness>30`.

See [SEARCH_LANGUAGE.md](SEARCH_LANGUAGE.md) for the full grammar.

### Daily note

The daily-note contract creates a date-stamped Markdown note attached to the active map. The
terminal palette includes a **Daily Note** destination, while `dailyNotes.ts` defines bounded
`vibespace daily` and `vibespace daily add "<text>"` operations for the CLI layer.

### Templates

`contextTemplates.ts` defines bounded reusable Markdown-template contracts and placeholder
rendering. The Templates workspace section currently uses the structured view; a complete
template create/apply editor is not established by the current Context page.

### JARVIS Context sources

The chat runtime calls the shared Context retrieval service for eligible conversations. The
service ranks candidates across 13 signals (explicit attachment, active file, task intent,
lexical match, semantic match, graph distance, source trust, recency, freshness, active
terminal, selected agent, selected skill, user-pinned importance) and builds a bounded evidence
pack. Prompt Forge uses the same consumer boundary. Terminal sessions receive their own bounded
context pack through terminal delivery.

### `/vibespace` terminal palette

At a verified local shell prompt inside a VibeSpace terminal pane, entering exactly
`/vibespace` opens the in-pane command palette. The palette links to Context Map, Skills,
Agents, Project, Notes, Daily Note, Search, Terminals, Status, and Help. It deliberately does
not intercept input in SSH sessions, password prompts, alternate-screen applications, or
interactive programs.

### `vibespace` CLI contract

The native terminal runtime installs managed `vibespace` / `vs` shims that call an authenticated
local endpoint. The frontend implements the corresponding bounded local-IPC methods and terminal
context session. The slash palette remains a separate in-pane UI overlay.

### Skills

The terminal API supports listing, selecting, adding, removing, clearing, and inspecting skills.
Context retrieval uses `selectedSkillIds` as one ranking signal; skill discovery or installation
is owned by the broader Skills system, not by Context Map.

### Terminal Context refresh

VibeSpace delivers the managed briefing at supported lifecycle points, including agent
selection changes, terminal spawn, reattach, and verified interactive-agent submissions. The
managed block is delimited by:

```
<!-- VIBESPACE:AGENT-BRIEFING:START — managed by VibeSpace, do not edit between markers -->
<!-- VIBESPACE:AGENT-BRIEFING:END -->
```

Agents should not edit content between these markers.

### Privacy

- Context graph, notes, embeddings, backups, and native search are local-only tables or files.
  Network boundaries are explicit GitHub retrieval, selected cloud generation, and the separate
  approved-document sync path.
- GitHub proxy requests are scoped to your installation and selected repositories.
- Exportable cloud activity telemetry omits paths, source text, and search queries; local
  activity can retain a path only when the local preference enables it.
- The shared secret detector rejects secret-bearing decoded GitHub blobs and protected
  cloud-sync strings at their boundaries.

### Secrets

VibeSpace uses a shared secret detector for protected ingestion and sync boundaries. Decoded
GitHub blobs containing detected secrets are rejected, and protected cloud-sync strings fail
closed. Secret detection is defense in depth, not a guarantee that every secret format is
recognized.

### Export

Portable graph exchange uses the validated `ContextGraphSnapshotV2` contract. The repository
rejects invalid, cross-scope, or unsafe-path snapshots, and `contextPackageImport.ts` validates
bounded JSON/Markdown package imports. A map-settings export/import UI is not established by
the current source.

### Recovery

If a V1-to-V2 migration encounters corrupt records, they are quarantined rather than discarded.
Recovery option identifiers recorded per quarantined record:

- `retry` — attempt conversion again after fixing the source.
- `restore_backup` — restore the V1 backup taken before migration.
- `export_then_discard` — export the raw record as JSON, then remove it.

Migration backups are stored in `context_migration_backups`. The current recovery notice lists
the available choices but does not execute retry, restore, export, or discard actions.

### Troubleshooting

| Symptom                                | Likely cause                             | Resolution                                       |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Map stuck on "indexing"                | Large folder or provider timeout         | Wait, or switch generation provider in settings  |
| Search returns no results              | Index not built or scope mismatch        | Check that the intended map and scope are active |
| GitHub map shows "permission_required" | Installation permissions changed         | Re-authorize in map settings                     |
| Notes not saving                       | Account identity mismatch                | Verify you are signed in to the correct account  |
| Migration quarantine                   | Corrupt V1 localStorage data             | Preserve the data; the notice is informational   |
| Terminal briefing missing              | Agent terminal started before map loaded | Restart the terminal pane or run refresh         |

## Technical Documentation

| Document                                       | Contents                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)             | System architecture, module map, data flow      |
| [DATA_MODEL.md](DATA_MODEL.md)                 | V2 schema, entity/edge/provenance contracts     |
| [MIGRATION_V1_TO_V2.md](MIGRATION_V1_TO_V2.md) | V1→V2 migration, backup, quarantine, recovery   |
| [SEARCH_LANGUAGE.md](SEARCH_LANGUAGE.md)       | Query grammar, fields, operators, limits        |
| [MARKDOWN_LINKS.md](MARKDOWN_LINKS.md)         | Wiki-links, backlinks, note conventions         |
| [GITHUB_CONTEXT.md](GITHUB_CONTEXT.md)         | GitHub App, proxy, permissions, CORS            |
| [JARVIS_RETRIEVAL.md](JARVIS_RETRIEVAL.md)     | Retrieval ranking, token caps, citations        |
| [TERMINAL_COMMANDS.md](TERMINAL_COMMANDS.md)   | Slash commands, CLI briefing, agent prompts     |
| [SHELL_INTEGRATION.md](SHELL_INTEGRATION.md)   | Terminal briefing injection, managed blocks     |
| [SECURITY.md](SECURITY.md)                     | Privacy boundaries, secret detection, isolation |
| [PERFORMANCE.md](PERFORMANCE.md)               | Index limits, concurrency, memory budgets       |
| [TEST_PLAN.md](TEST_PLAN.md)                   | Test commands, coverage areas, CI matrix        |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)   | Release gates, rollback, verification           |
