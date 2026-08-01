# Context Map Search Language

## Overview

The Context Map search language is a structured query syntax parsed by
`app/src/features/context/searchQuery.ts` into an AST, then executed against the native Tantivy
full-text index (`app/src-tauri/src/context_search.rs`).

## Grammar

### Terms

- Bare words: `hello world` (implicit AND between terms).
- Quoted phrases: `"exact phrase match"` (preserves word order and positions).
- Prefix negation: `-excluded` (NOT operator shorthand).

### Boolean Operators

| Operator | Syntax             | Example                     |
| -------- | ------------------ | --------------------------- |
| AND      | `AND` or space     | `auth AND login`            |
| OR       | `OR`               | `login OR signup`           |
| NOT      | `NOT` or `-prefix` | `NOT deprecated`            |
| Grouping | parentheses        | `(auth OR login) AND -test` |

### Field Filters

Syntax: `field:value` or `field:"exact value"`

| Field          | Description              | Example                     |
| -------------- | ------------------------ | --------------------------- |
| tag            | Entity tag               | `tag:authentication`        |
| path           | File path (substring)    | `path:src/lib`              |
| type / kind    | Entity kind              | `kind:function`             |
| task           | Task reference           | `task:CTX-1250`             |
| linked_to      | Forward link target      | `linked_to:entity-id`       |
| backlinks_to   | Backlink source          | `backlinks_to:entity-id`    |
| source         | Source ID or label       | `source:github`             |
| github.repo    | GitHub owner/name        | `github.repo:owner/repo`    |
| github.branch  | GitHub branch            | `github.branch:main`        |
| repo           | Alias for github.repo    | `repo:owner/repo`           |
| branch         | Alias for github.branch  | `branch:main`               |
| language       | Programming language     | `language:typescript`       |
| symbol         | Symbol name              | `symbol:parseQuery`         |
| name           | Entity label             | `name:ContextPage`          |
| imports        | Import reference         | `imports:react`             |
| freshness      | Staleness in days        | `freshness>30`              |
| changed_after  | Modified after date      | `changed_after:2026-01-01`  |
| changed_before | Modified before date     | `changed_before:2026-06-01` |
| updated_after  | Alias for changed_after  | `updated_after:2026-01-01`  |
| updated_before | Alias for changed_before | `updated_before:2026-06-01` |

### Comparison Operators

| Operator   | Meaning          | Example              |
| ---------- | ---------------- | -------------------- |
| `=`        | Equals           | `kind=function`      |
| `!=`       | Not equals       | `kind!=test`         |
| `>`        | Greater than     | `freshness>30`       |
| `>=`       | Greater or equal | `freshness>=7`       |
| `<`        | Less than        | `freshness<90`       |
| `<=`       | Less or equal    | `freshness<=365`     |
| `[a TO b]` | Inclusive range  | `freshness[7 TO 30]` |

### Date Fields

`changed_after`, `changed_before`, `updated_after`, `updated_before` accept ISO 8601 dates
(YYYY-MM-DD) or Unix millisecond timestamps.

## Limits

| Constraint                   | Value           |
| ---------------------------- | --------------- |
| Max query length             | 4096 characters |
| Max tokens                   | 256             |
| Max AST nodes                | 256             |
| Max nesting depth            | 32              |
| Max field value length       | 1000 characters |
| Max native clauses (Tantivy) | 32              |
| Max native tokens (Tantivy)  | 64              |
| Max results per query        | 100             |

## Prohibited Input

- Control characters (U+0000-U+001F, U+007F-U+009F, various Unicode spaces).
- Metacharacters: backtick, pipe, ampersand, braces, semicolon.
- Prototype-polluting field names (`__proto__`, `constructor`, etc.).

## Parse Errors

Errors include: message, offset, length, line (always 1), column (1-based).

Failure reasons:

- `query_input_invalid`: non-string or empty input.
- `query_input_too_large`: exceeds 4096 characters.
- `query_syntax_invalid`: malformed structure.
- `query_field_invalid`: unknown or unsafe field name.
- `query_value_invalid`: value exceeds limits or contains prohibited characters.

## Search Modes

| Mode     | Behavior                                                                  |
| -------- | ------------------------------------------------------------------------- |
| Quick    | Title and path match only; fast for navigation                            |
| FullText | Full inverted-index search with body, tags, properties; scored and ranked |

## Native Engine Details

- Engine: Tantivy 0.22.1 (embedded Rust, in-process).
- Tokenizer: `vibespace_unicode_v1` (SimpleTokenizer + LowerCaser + RemoveLongFilter).
- Index scope: per accountId + mapId (filesystem-isolated directories).
- Writer memory: 50 MB budget.
- Concurrency: 4-worker semaphore (`MAX_CONCURRENT_WORKERS`).
- File locking: fs4 advisory locks per index scope.
- Corruption recovery: automatic rebuild marker; `recovered_corruption` flag in status.
- Max document body: 1 MB.
- Max total mutation: 64 MB per batch.
- Max documents per mutation: 1000.
- Max properties per document: 256 entries, 64 KB total.
- Max tags per document: 128.
