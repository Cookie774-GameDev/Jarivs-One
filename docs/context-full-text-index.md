# Context full-text index

Status: accepted V1 native implementation for CTX-487, CTX-488, and CTX-516 through CTX-530.

## Engine decision

VibeSpace uses Tantivy 0.22.1 for Context lexical search.

- License: MIT.
- Runtime: embedded Rust library inside the Tauri process; no external daemon.
- Direct compatibility: Tantivy 0.22.1 declares Rust 1.63, below VibeSpace's declared Rust 1.78 floor.
- Pins: exact `tantivy = 0.22.1`, `fs4 = 0.8.4`, and `async-lock = 3.3.0`; Tantivy's otherwise-new Rayon closure is constrained to `rayon =1.10.0` and `rayon-core =1.12.1`. Every new direct/exclusive crate declares an MSRV at or below Rust 1.78.
- Features: memory-mapped directory and LZ4 store compression only. There is no JavaScript scan fallback.

The current Tantivy 0.26.x line was rejected for V1 because it requires Rust 1.86. SQLite FTS5 would reduce dependency size, but this crate has no existing SQLite ownership or migration layer; introducing one only for search would duplicate lifecycle, corruption, and locking responsibilities. Tantivy provides an inverted index, phrase positions, scoring, atomic segment commits, checksums, and incremental deletion.

These declarations prove the compatibility of this slice's new direct/exclusive dependencies. Tantivy also shares broad `uuid` and `time` ranges with the pre-existing Tauri graph, and this repository intentionally ignores the generated native `Cargo.lock`; the current repository-wide resolution already contains packages whose declared MSRV exceeds the manifest's Rust 1.78 value. This slice does not disguise that pre-existing repository-level mismatch by globally downgrading unrelated Tauri dependencies. A clean Rust 1.78 full-graph build remains a repository release gate.

Primary references:

- Tantivy 0.22.1 package metadata and Rust floor: <https://docs.rs/crate/tantivy/0.22.1/source/Cargo.toml.orig>
- Tantivy indexing API: <https://docs.rs/tantivy/0.22.1/tantivy/indexer/struct.IndexWriter.html>
- Tantivy tokenizers: <https://docs.rs/tantivy/0.22.1/tantivy/tokenizer/>
- Tantivy license: <https://github.com/quickwit-oss/tantivy/blob/main/LICENSE>

## Ownership, confidentiality, and index path

Indexes contain derivative, rebuildable local data below:

```text
<Tauri app-local-data>/context/search/tantivy-v1/
```

Each account/map pair receives one opaque directory identifier made from independent truncated SHA-256 hashes:

```text
a<account-hash>-m<map-hash>
```

Raw account IDs and map IDs never enter a filesystem path. The native boundary rejects empty, controlled, oversized, or traversal-like scope IDs. Stored source paths must be portable relative paths; they cannot be absolute, URL-shaped, backslash-based, contain percent escapes, or contain empty/current/parent segments. Rejecting percent escapes prevents nested-encoded separators or traversal from becoming meaningful after downstream decoding. Status returns only the opaque hashed identifier, never an app-data or user-profile path.

The index stores full plaintext bodies to support local snippets and is not an encryption boundary. It has the same local-current-user confidentiality expectation as the authoritative Context content from which it is rebuilt. On Unix, VibeSpace enforces `0700` on index directories and `0600` on index, lock, and recovery-marker files. On Windows, the index inherits the current user's protected LocalAppData ACL; final Windows packaging verification must confirm that inherited ACL. VibeSpace never copies this corpus to logs, telemetry, providers, or another account/map index.

Native commands begin at Tauri's OS-resolved local-data directory and create the app identifier plus `context/search/tantivy-v1` one component at a time. Concurrent creators tolerate `AlreadyExists` only as a signal to repeat the full link/type/canonical-parent validation. Every descendant component is checked before and after creation, symbolic links/junctions/reparse points are rejected, and each canonical child must have the prior canonical component as its direct parent. Scoped operations repeat link/reparse and containment checks before opening the current generation. Per-scope `fs4` locks serialize first-open, recovery, mutation, query, and status across threads and processes.

These checks defend against accidental or pre-existing path redirection inside app-local-data. The current-OS-user trust model does not claim protection against a separate malicious same-user process winning a sub-operation path-swap race; native directory-handle-relative no-follow operations are required before broadening that threat model.

Tauri commands run Tantivy/filesystem work on the async blocking pool rather than the renderer/UI thread. An async semaphore admits at most four Context search workers at once, a process-wide writer budget admits one 50 MB Tantivy writer at once, and the derivative root admits at most 512 live account/map index directories.

The current native authority model treats the Tauri `main` WebView as the trusted current-OS-user principal. Context search commands reject every other window label. The renderer supplies account/map scope, but native code uses those values only to select isolated derivative indexes and never reads or mutates source files. A future multi-principal renderer model must replace this boundary with a native authenticated account capability before exposing these commands to additional windows.

## V1 schema

| Field          | Indexed | Stored | Options                                |
| -------------- | ------- | ------ | -------------------------------------- |
| `document_id`  | yes     | yes    | exact string; replacement/deletion key |
| `source_id`    | yes     | yes    | exact string                           |
| `title`        | yes     | yes    | Unicode tokenizer, positions           |
| `path`         | yes     | yes    | Unicode tokenizer, positions           |
| `source_type`  | yes     | yes    | exact string                           |
| `body`         | yes     | yes    | Unicode tokenizer, positions           |
| `tags`         | yes     | yes    | joined validated tag values            |
| `properties`   | yes     | yes    | canonical validated JSON text          |
| `updated_at`   | yes     | yes    | JavaScript-safe nonnegative timestamp  |
| `content_hash` | yes     | yes    | lowercase SHA-256 string               |

The schema is compared exactly whenever an index opens. A mismatch is incompatible derivative data and follows corruption recovery.

## Tokenization, Unicode, and literal queries

`vibespace_unicode_v1` is a Tantivy `SimpleTokenizer` pipeline with:

1. punctuation/whitespace token boundaries;
2. removal of tokens whose UTF-8 representation is 80 bytes or longer; and
3. Unicode lowercase mapping.

The index retains accents and non-Latin text and applies the same Unicode lowercase mapping to indexed and query tokens. This is not full Unicode case folding or canonical normalization: canonically distinct composed/decomposed text and special folds such as Greek final sigma are not promised equivalent in V1. V1 deliberately does not apply English stemming because a Context map can mix prose, symbols, paths, repository names, and multiple languages. Phrase positions are recorded for title, path, body, tag, and property text.

The native endpoint never accepts Tantivy query-parser syntax. It parses at most 32 literal clauses and 64 analyzed tokens, validates balanced exact phrases, and constructs a typed `TermQuery`/`PhraseQuery`/`BooleanQuery` tree over only the mode's allowed fields. Field prefixes, ranges, wildcards, boosts, fuzzy syntax, and metadata names therefore cannot escape the selected field set or create unbounded parser behavior.

- `quick` searches only title and path, with title boosted 3× and path 2×.
- `full_text` searches title, path, body, tags, and properties with the same title/path boosts.

Queries are capped at 1,024 bytes and results at 100. Results include document identity, title/path/source type, a bounded plain-text excerpt, match reason, update time, and Tantivy score. Full-text excerpts come from Tantivy's Unicode-safe query-aware snippet generator; quick fallback excerpts are Unicode-safe 280-character prefixes. Query responses also carry current index status so recovery cannot be silently mistaken for an authoritative empty corpus.

## Update and deletion strategy

Callers send already-authorized, already-extracted documents in batches of at most 1,000. Before acquiring a writer, validation checks:

- stable document/source IDs and unique document IDs;
- portable paths and bounded text;
- at most 1 MiB body text per document;
- bounded tags and scalar/string-list properties;
- finite property numbers;
- JavaScript-safe nonnegative timestamps and lowercase SHA-256 hashes;
- 64 MiB maximum validated input per mutation.

Replacement is delete-by-`document_id` plus add in one Tantivy writer commit. Deletion is delete-by-term plus one commit. Validation failure occurs before writer acquisition, and indexing or commit failure never reports success. Account/map indexes remain physically isolated. Each method reopens and schema-verifies the current on-disk generation while holding its scope lock, so an object created before recovery cannot write into a quarantined stale generation. Scope locks allow unrelated maps to proceed independently; the single process-wide writer budget bounds aggregate writer memory.

## Corruption and schema recovery

Opening an absent index creates V1. An exact schema mismatch, Tantivy data-corruption/incompatible-index error, deserialization error, or missing required index file is recoverable derivative corruption. Transient I/O, permission, lock, directory, and other open failures return an error without renaming healthy data. For verified recoverable corruption:

1. under the per-scope lifecycle lock, a persistent owner-restricted `needs-rebuild` marker is created, the marker is flushed, and its parent directory entry is flushed before any live directory moves;
2. only after the marker is durable, the verified derivative directory is atomically renamed beside the live index with a `.corrupt-<timestamp>` suffix;
3. an owner-restricted clean V1 index is created at the canonical hashed path;
4. every query/status response reports `needsRebuild: true`; and
5. `recoveredCorruption: true` identifies the operation that performed recovery.

The marker survives process restarts and remains until the caller completes an authoritative full repopulation and explicitly invokes `context_search_acknowledge_rebuild`. Empty search results while the marker is set are not authoritative.

At most two verified, non-link quarantine directories are retained per scope; older derivative quarantines are removed while holding the same lock. If the canonical index is absent but a matching quarantine exists, open conservatively recreates the rebuild marker before creating a new index. Marker-creation failure leaves the live generation in place for a safe retry. Search recovery never modifies source documents, note history, or assets and never follows a link/reparse point during cleanup.

## Performance boundary

Tantivy performs inverted-index lookup and BM25-style relevance scoring rather than corpus scans. Index writes use one process-wide 50 MB writer budget and compressed stored fields. Valid read-only opens do not recursively walk the complete segment tree; tree permission hardening runs when files are created, committed, or quarantined. With two admitted workers and a 20-result cap, at most 40 one-MiB stored bodies can be deserialized/snippet-processed concurrently. Concurrent workers, live scopes, query clauses/tokens, stored output, mutation size, document size, property count, tag count, permission-walk entries, and result count are bounded before expensive work.

Focused native tests cover Unicode quick and phrase search, Unicode-safe excerpts, incremental replacement, deletion, physical map isolation, literal query safety, persistent recovery signaling and acknowledgment, verified-error classification, marker and parent-sync failure safety, orphan-quarantine marker restoration, current-generation reopening, concurrent descendant/first-open creation, scope admission, process-wide writer memory serialization, bounded quarantine retention, descendant/scoped symlink or reparse rejection where the platform permits fixture creation, permission hardening on Unix, raw/nested-encoded traversal rejection, body-control rejection, atomic pre-write validation, and input/query/result ceilings.

The reproducible ignored benchmark indexes 250 representative 16 KiB notes, records source/index size and indexing/query latency, requires a 20-result phrase query under two seconds, indexing under 30 seconds, and a derivative index under 64 MiB. A clean Rust 1.78 repository-wide resolution, Windows ACL verification, platform packaging, and long-running merge/rollback stress remain mandatory final-verification gates after all approved systems are implemented.
