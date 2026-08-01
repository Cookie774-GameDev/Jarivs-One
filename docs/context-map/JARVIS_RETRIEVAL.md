# JARVIS Context Retrieval

## Overview

The shared Context retrieval service ranks relevant knowledge for eligible JARVIS chat and
Prompt Forge requests. Candidate loading and ranking are local; a bounded evidence pack may then
be included in a request to the user-selected model provider. Terminal delivery uses a separate
bounded context-pack builder and managed instruction-file path.

Source: `app/src/features/context/contextRetrievalService.ts`

## Ranking Signals

The service scores candidates across 13 weighted signals:

| Signal                 | Weight | Description                                            |
| ---------------------- | ------ | ------------------------------------------------------ |
| explicit_attachment    | 0.20   | User explicitly attached this entity                   |
| active_file            | 0.10   | Entity matches the currently open file                 |
| task_intent            | 0.09   | Matches inferred task kind (answer, code, debug, etc.) |
| lexical_match          | 0.09   | Tantivy full-text score                                |
| semantic_match         | 0.10   | Embedding vector similarity                            |
| graph_distance         | 0.07   | Proximity in the entity graph                          |
| source_trust           | 0.08   | user_direct > app_verified > external_untrusted        |
| recency                | 0.05   | How recently the entity was created/updated            |
| freshness              | 0.06   | Whether the source is current vs stale                 |
| active_terminal        | 0.04   | Matches the active terminal session                    |
| selected_agent         | 0.03   | Matches the selected agent slug                        |
| selected_skill         | 0.03   | Matches selected skill IDs                             |
| user_pinned_importance | 0.06   | User-pinned importance level                           |

Total weight sums to 1.0.

## Task Kinds and Token Caps

| Task kind | Token cap |
| --------- | --------- |
| answer    | 1,200     |
| code      | 2,400     |
| debug     | 2,400     |
| plan      | 1,800     |
| research  | 3,200     |
| terminal  | 1,600     |
| agent     | 1,600     |

The retrieval pack is truncated to the task-specific cap before injection.

## Request Parameters

| Parameter            | Type                 | Notes                         |
| -------------------- | -------------------- | ----------------------------- |
| projectId            | string or null       | Project scope                 |
| chatId               | string?              | Active chat session           |
| terminalSessionId    | string?              | Active terminal               |
| agentSlug            | string?              | Selected agent                |
| userText             | string               | User query text               |
| explicitMapIds       | string[]?            | User-specified maps (max 200) |
| explicitEntityIds    | string[]?            | User-specified entities       |
| selectedSkillIds     | string[]?            | Active skills                 |
| preferredSourceKinds | ContextSourceKind[]? | Source type filter            |
| maxTokens            | number               | Hard token limit              |
| requireFresh         | boolean?             | Exclude stale sources         |

## Response Structure

Each retrieved item includes:

- Entity reference (kind, label, path, line range).
- Exact excerpt from the source.
- Summary text.
- Freshness indicator (current / stale / unknown).
- Ranking score with contributing signal names.
- Citation with action (open_source or highlight_entity).
- Provenance (source revision, indexed timestamp, GitHub ref/SHA if applicable).

## Activity Signals

After successful retrieval, a privacy-safe activity signal is published:

- Content-free: reports map IDs, highlighted entity IDs, unique source count.
- Scoped to project and map.
- Cannot invalidate a successful retrieval (additive-only publication).
- Account-isolated: signals carry the account identity.

## Proactive Insights

The JARVIS context policy (`jarvisContextPolicy.ts`) detects proactive insights:

| Kind                             | Description                                 |
| -------------------------------- | ------------------------------------------- |
| notes_code_conflict              | Notes contradict current code               |
| stale_release_plan               | Release plan references outdated state      |
| unresolved_high_severity_finding | High-severity finding without resolution    |
| duplicated_implementation        | Multiple implementations of same concern    |
| missing_test_coverage            | Entity lacks test coverage                  |
| broken_link                      | Wiki-link target missing                    |
| stale_github_map                 | GitHub map behind branch HEAD               |
| terminal_context_contradiction   | Terminal output contradicts indexed context |

Insights require evidence attestation through a trusted authority before surfacing.
Notification cooldown: 6 hours per dedupe key.

## Limits

| Constraint                          | Value                               |
| ----------------------------------- | ----------------------------------- |
| Max candidates evaluated            | 200                                 |
| Max request IDs (explicit entities) | 200                                 |
| Max text characters (user query)    | 32,768                              |
| Max tokens (global cap)             | 32,768                              |
| Max timestamp                       | 8,640,000,000,000,000 (JS Date max) |
