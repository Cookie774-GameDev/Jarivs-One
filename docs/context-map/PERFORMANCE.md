# Performance

## Overview

Context Map performance is governed by bounded resource usage at every layer. This document
describes the enforced limits, concurrency model, and recovery behavior.

## Native Search Index (Tantivy)

Source: `app/src-tauri/src/context_search.rs`

| Parameter                   | Value               | Purpose                                     |
| --------------------------- | ------------------- | ------------------------------------------- |
| Engine                      | Tantivy 0.22.1      | Embedded Rust inverted index                |
| Writer memory               | 50 MB               | Per-index writer buffer                     |
| Concurrent workers          | 4                   | Global semaphore (`MAX_CONCURRENT_WORKERS`) |
| Max documents per mutation  | 1,000               | Batch size limit                            |
| Max document body           | 1 MB                | Per-document size cap                       |
| Max total mutation bytes    | 64 MB               | Per-batch size cap                          |
| Max properties per document | 256 entries / 64 KB | Metadata bound                              |
| Max tags per document       | 128                 | Tag array bound                             |
| Max query length            | 1,024 bytes         | Query input cap                             |
| Max results                 | 100                 | Per-query result cap                        |
| Max native clauses          | 32                  | Boolean query complexity                    |
| Max native tokens           | 64                  | Token expansion limit                       |
| Max index scopes            | 512                 | Total open indexes                          |
| Max quarantines per scope   | 2                   | Corruption quarantine limit                 |
| Max permission entries      | 10,000              | ACL bound                                   |

## Concurrency Model

- **Writer lock**: A process-global mutex (`PROCESS_WRITER_BUDGET`) serializes write
  operations across all scopes. Only one writer is active at any time.
- **Worker semaphore**: An async semaphore with 4 permits gates concurrent index operations.
- **File locks**: Each index scope uses fs4 advisory file locks to prevent multi-process
  conflicts (relevant when multiple VibeSpace instances run).
- **Read path**: Queries operate against committed Tantivy segments and remain bounded by the
  worker semaphore and per-scope coordination in `context_search.rs`.

## Index Lifecycle

| Event               | Behavior                                                            |
| ------------------- | ------------------------------------------------------------------- |
| First use           | Index directory created; schema registered                          |
| Document upsert     | Content-hash dedup; skip if unchanged                               |
| Deletion            | By document ID; atomic segment commit                               |
| Corruption detected | Rebuild marker written; `recovered_corruption` flag set             |
| Rebuild required    | New empty index plus marker; the caller must repopulate from source |
| Scope deleted       | Directory removed; file locks released                              |

## Dexie (IndexedDB) Performance

- Compound indexes on `[accountId+mapId]` ensure O(log n) scoped queries.
- The graph repository uses bulk operations for snapshot writes.
- Each graph snapshot write uses its repository transaction; the overall multi-map migration is
  not one global transaction.
- Embedding vectors (V6) are stored as structured clones; no binary blob overhead.

## Frontend Rendering

- The sidebar bounds its visible map and child rows; it does not currently use list
  virtualization.
- Native search results are capped at 100; client pagination is not established.
- Graph construction yields cooperatively and rendering culls to the viewport.
- Activity recording is idempotent and bounded; batching/debouncing is not established.

## Generation Pipeline

- Provider timeout: governed by the AI provider's response time.
- Large folders: file sampling via `readTextFileSample` (not full reads).
- Classification: `isPopularTextFile` filter skips binary/large files.
- Max active maps: 5 (limits concurrent generation load).

## Known Performance Characteristics

- Each writer is configured with 50 MB, while a process-global mutex permits only one active
  writer at a time.
- No checked-in benchmark establishes latency or throughput targets for a 10k-file or
  100k-document corpus. Treat timing estimates as unverified until measured on release hardware.

## Deferred / Not Implemented

- Incremental re-index on file watch (currently manual or refresh-triggered).
- Distributed/remote indexing.
- Explicit index compression policy beyond Tantivy defaults.
- Query result caching beyond the revision cache.
