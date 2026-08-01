# Test Plan

## Overview

Context Map tests use Vitest (frontend) and cargo test (native Rust). Tests are co-located
with source files using the `.test.ts` / `.rs` convention.

## Commands

| Command                                                     | Scope                   | Runner       |
| ----------------------------------------------------------- | ----------------------- | ------------ |
| `npm --prefix app run test`                                 | All frontend tests      | Vitest       |
| `npm --prefix app run test -- src/features/context`         | Context feature only    | Vitest       |
| `npm run typecheck`                                         | Strict TypeScript check | tsc --noEmit |
| `cargo test --manifest-path app/src-tauri/Cargo.toml --lib` | Native Rust unit tests  | cargo        |
| `cargo check --manifest-path app/src-tauri/Cargo.toml`      | Rust compilation check  | cargo        |

## Frontend Test Files (Context)

| File                                 | Coverage area                           |
| ------------------------------------ | --------------------------------------- |
| `contracts.test.ts`                  | V2 contract validation, parse failures  |
| `migration.test.ts`                  | V1-to-V2 conversion, quarantine, backup |
| `contextPersistence.test.ts`         | Persistence service CRUD                |
| `repository.test.ts`                 | Graph repository operations             |
| `searchQuery.test.ts`                | Query language parser                   |
| `searchResults.test.ts`              | Result formatting                       |
| `contextSearchPipeline.test.ts`      | Search orchestration                    |
| `semanticSearch.test.ts`             | Embedding storage                       |
| `embeddingRepository.test.ts`        | Embedding CRUD                          |
| `contentRepository.test.ts`          | Note/asset CRUD                         |
| `contentContracts.test.ts`           | Note contract validation                |
| `contextRetrievalService.test.ts`    | Retrieval ranking                       |
| `contextActivity.test.ts`            | Activity signal publication             |
| `contextHistory.test.ts`             | Change history                          |
| `contextCloudSync.test.ts`           | Cloud sync queue                        |
| `contextChatIntegration.test.ts`     | Chat attachment integration             |
| `contextCanvasIntegration.test.ts`   | Canvas linking                          |
| `contextWorkspaceUi.test.ts`         | Workspace UI state                      |
| `contextWorkspaces.test.ts`          | Workspace management                    |
| `contextPackageImport.test.ts`       | JSON snapshot import                    |
| `contextProcessorSafety.test.ts`     | Input sanitization                      |
| `contextRevisionCache.test.ts`       | Revision caching                        |
| `contextResponseIntegration.test.ts` | Response injection                      |
| `contextAttachments.test.ts`         | File attachments                        |
| `dailyNotes.test.ts`                 | Daily note creation                     |
| `githubContextAuth.test.ts`          | GitHub auth flow                        |
| `githubRepositoryCatalog.test.ts`    | Repository catalog                      |
| `githubRepositoryRetrieval.test.ts`  | GitHub content fetch                    |
| `codeIntelligenceArtifacts.test.ts`  | Code artifact classification            |
| `codeIntelligenceGraph.test.ts`      | Symbol graph                            |
| `codeIntelligenceLanguages.test.ts`  | Language detection                      |
| `tree.test.ts`                       | V1 tree operations                      |
| `jarvisContextPolicy.test.ts`        | Proactive insights                      |

This is a representative inventory, not an exhaustive list. Additional co-located suites cover
note syntax/rendering/relations/properties, GitHub reconciliation and metadata, graph
projection/performance, workspace views/templates, JARVIS graph activity, and Context-page
appearance.

## Native Rust Tests

| Module                 | Coverage area                                          |
| ---------------------- | ------------------------------------------------------ |
| `context_search.rs`    | Tantivy index CRUD, query, corruption recovery, bounds |
| `terminal.rs`          | PTY lifecycle (not Context-specific)                   |
| `terminal_snapshot.rs` | Scrollback snapshots                                   |

## Terminal Agent Tests

| File                          | Coverage area                         |
| ----------------------------- | ------------------------------------- |
| `agentPromptPayload.test.ts`  | Briefing construction, managed blocks |
| `agentPromptDelivery.test.ts` | Briefing injection delivery           |
| `terminalCliRuntime.test.ts`  | Authenticated local-IPC dispatch      |
| `terminalCliInstall.test.ts`  | Managed shim installation contracts   |
| `terminalContextPack.test.ts` | Bounded terminal session context pack |

## Test Strategy

1. **Focused first**: Run only Context feature tests during development.
2. **Typecheck**: `npm run typecheck` catches contract drift.
3. **Rust**: `cargo test --lib` validates native search engine.
4. **Broaden**: Full `npm --prefix app run test` before review.
5. **Build**: `npm run build` confirms production compilation.

## What Tests Do NOT Cover

- Real GitHub API calls (mocked in tests).
- Real AI provider calls (generation pipeline uses fixtures).
- End-to-end native/frontend IPC in a packaged Tauri application.
- Visual/UI rendering (requires manual or Playwright verification).
- Cross-platform filesystem behavior (Windows-primary development).
- Real user data migration (tests use synthetic V1 fixtures).

## CI Expectations

The repository does not have a dedicated lint script. Formatting follows Prettier conventions.
CI gates (when configured) should run:

```
npm run typecheck
npm --prefix app run test
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```
