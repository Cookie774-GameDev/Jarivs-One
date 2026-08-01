# Context Map Architecture

## Overview

Context Map is a local-first knowledge indexing system embedded in the VibeSpace Tauri desktop
application. It combines a TypeScript/React frontend with a native Rust full-text search engine
and an optional Supabase edge function for scoped GitHub access.

## Module Map

```
app/src/features/context/
├── contracts.ts                  V2 type contracts and validation
├── tree.ts                       V1 tree types, storage keys, generation providers
├── migration.ts                  V1→V2 migration with backup and quarantine
├── repository.ts                 Dexie-backed graph repository (CRUD)
├── contextPersistence.ts         Persistence service (initialize, load, save, select, delete)
├── contextRetrievalService.ts    Multi-signal retrieval ranking for JARVIS
├── contextSearchPipeline.ts      Frontend search orchestration
├── searchQuery.ts                Query language parser (AST)
├── searchResults.ts              Result formatting and excerpt handling
├── semanticSearch.ts             Local embedding vectors (table added in Dexie V6)
├── embeddingRepository.ts        Embedding storage and versioning
├── contentContracts.ts           Note, revision, and asset contracts
├── contentRepository.ts          Note/asset CRUD
├── contextActivity.ts            Privacy-safe activity signal publication
├── contextHistory.ts             Entity change history
├── contextCloudSync.ts           Cloud document queue (V1 legacy sync)
├── contextChatIntegration.ts     Chat/attachment integration
├── contextCanvasIntegration.ts   Canvas object linking
├── contextTemplates.ts           Note templates
├── contextWorkspaces.ts          Workspace management
├── contextWorkspaceUi.ts         UI state for the three-column workspace
├── contextPackageImport.ts       JSON snapshot import
├── contextProcessorSafety.ts     Input sanitization and bounds
├── contextRevisionCache.ts       Revision-level caching
├── contextResponseIntegration.ts JARVIS response context injection
├── contextAttachments.ts         File attachment handling
├── dailyNotes.ts                 Daily note creation and templates
├── githubContextAuth.ts          GitHub App installation auth flow
├── githubRepositoryCatalog.ts    Repository listing and selection
├── githubRepositoryRetrieval.ts  GitHub content retrieval through proxy
├── githubRefreshPrivacy.ts       Privacy-safe GitHub refresh signals
├── jarvisContextPolicy.ts        Proactive insight detection
├── codeIntelligenceArtifacts.ts  Code artifact classification
├── codeIntelligenceGraph.ts      Symbol-level graph construction
├── codeIntelligenceLanguages.ts  Language detection and parsers
├── ContextPage.tsx               Main workspace React component
└── SidebarContextTree.tsx        Sidebar tree navigation

app/src-tauri/src/
├── context_search.rs             Tantivy native full-text index
├── terminal.rs                   PTY terminal management
└── terminal_cli.rs               Managed CLI shims and authenticated local endpoint

app/src/features/terminals/
├── agentPromptPayload.ts         Agent briefing construction
├── agentPromptDelivery.ts        Managed files, context pack, and spawn environment
├── terminalCliRuntime.ts         Frontend local-IPC command execution
└── terminalContextPack.ts        Bounded session context-pack construction

supabase/functions/
├── github-context/index.ts       GitHub proxy edge function
└── _shared/githubContextProxy.ts Shared proxy logic
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Sources                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │Local     │ │Local     │ │GitHub        │ │Portable       │  │
│  │Folder    │ │File      │ │Repository    │ │Markdown       │  │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └──────┬────────┘  │
└───────┼─────────────┼──────────────┼────────────────┼───────────┘
        │             │              │                │
        ▼             ▼              ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Generation Pipeline                                             │
│  Provider: local | google | groq | openai | anthropic            │
│  Output: ContextGraphSnapshotV2                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Storage Layer                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │ Dexie (IndexedDB)   │  │ Tantivy (native Rust)            │  │
│  │ V4: maps, sources,  │  │ Full-text index per account+map  │  │
│  │ entities, edges,    │  │ Modes: Quick, FullText           │  │
│  │ provenance          │  │ Max 100 results, 1MB body        │  │
│  │ V5: notes, revisions│  └──────────────────────────────────┘  │
│  │ V6: embeddings      │                                        │
│  └─────────────────────┘                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌────────────┐ ┌────────────────────┐
│ JARVIS Retrieval │ │ Search UI  │ │ Terminal Briefing  │
│ 13-signal rank   │ │ Query lang │ │ Managed block      │
│ Token-capped     │ │ Faceted    │ │ Agent coordination │
└──────────────────┘ └────────────┘ └────────────────────┘
```

## Key Design Decisions

- **Local-first core**: Indexed graph and search data resides in IndexedDB and the native
  Tantivy index. GitHub retrieval uses the scoped proxy, generation may use a selected cloud
  provider, and explicitly enabled document sync uses the separate cloud-sync boundary.
- **Account isolation**: Every record carries an `accountId`. Queries are always scoped by
  `accountId + mapId`. Public repository operations validate the requested scope and reject
  identity or map conflicts.
- **Bounded native index**: Tantivy runs in-process with a 50 MB writer memory budget, 4-worker
  concurrency semaphore, and per-scope file locking. Corruption quarantines the damaged index
  and creates a rebuild-required marker so callers can repopulate it from source.
- **V1 compatibility**: V1 localStorage data is retained after migration. The migration is
  additive and reversible via backup restoration.
- **Privacy-safe activity**: Activity signals publish map-scoped metadata (IDs, counts) without
  file content, paths, or user text.

## Technology Stack

| Layer                | Technology                                             |
| -------------------- | ------------------------------------------------------ |
| UI                   | React, TypeScript, Zustand, Tailwind, Radix primitives |
| Persistence          | Dexie 4 (IndexedDB), current database schema V8        |
| Full-text search     | Tantivy 0.22.1 (Rust, in-process)                      |
| Native shell         | Tauri 2                                                |
| GitHub proxy         | Supabase Edge Function (Deno)                          |
| Generation providers | Local fallback, Gemini, Groq, OpenAI, Anthropic        |
