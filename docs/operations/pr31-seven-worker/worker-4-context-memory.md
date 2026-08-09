# PR31 Worker 4: Context, memory, history, files, skills, and agents

Task: `VS-PR31-W4-CONTEXT-MEMORY-FILES-20260808`

Starting revision: `b81d93489b39b307204fbb7b6747799d50c32384`

## Evidence review

The existing Context Galaxy, repository intelligence, learning threshold, Files workspace, Skills catalog, and Agents lifecycle implementations were retained. The owned baseline test run exercised 115 files and 870 tests successfully. One additional suite could not load in the sparse worker checkout because its Worker 1-owned GitHub proxy source was not materialized.

The review found four locally actionable gaps:

1. Nightly Second Brain configuration, run history, scheduler state, and source collection were global rather than account/workspace/project scoped.
2. User-created Skills catalog state was stored globally rather than per account.
3. History supported search and replay but not bounded, confirmed deletion.
4. Files exposed create/edit/save but not safe file-only rename and delete operations.

## Corrections

- Nightly Second Brain now persists independently per account/workspace/project. Legacy unowned private state and malformed scoped entries are quarantined. Runtime source queries and every write boundary use the captured scope, concurrent duplicate schedules share one in-flight run, completed non-retry schedules are canonical, and manual runs use deterministic minute-bucket schedule timestamps.
- Pending Nightly changes are bound to the exact reviewed Context Map and canonical target path. Approval fails closed if map selection, account/project scope, persisted revision, or target path drifts. Related markdown is limited to the canonical `.vibespace/second-brain.md` target. Multi-change application rechecks scope before every write and compensates completed writes in reverse against the captured original scope.
- Nightly persisted dictionaries use null-prototype objects, reject prototype-pollution keys, and enforce bounded scope/run/change/string/provenance limits. Context persistence supports update-only optimistic writes and restores exact prior external bytes when its IndexedDB update is rejected.
- The Nightly panel exposes an explicit Run now action and all host/panel projections use the active scoped state.
- Custom Skills, overrides, and preset deletion choices now persist under an account-derived key. Anonymous state is memory-only, legacy globally owned-unknown state is not imported, and read/write normalization uses null-prototype dictionaries, forbidden-key rejection, bounded catalog counts, and bounded strings/tool arrays.
- History provides per-chat delete and bounded clear-visible operations. Both require confirmation, capture and revalidate the expected workspace immediately before every deletion, reread each chat before mutation, reconcile successful partial deletion safely, and report failures without claiming success.
- Files provides file-only rename/delete. Native commands require an explicit strict project root, use capability-relative no-follow traversal, reject links/directories/outside paths, never overwrite a duplicate destination, and return stable errors. The UI preserves unsaved edits by blocking rename until save, rejects case-insensitive duplicate open destinations before native mutation, and names discarded unsaved changes in the delete confirmation. Workspace tabs are reconciled only after native success.
- Existing every-20-message learning behavior remains unchanged: focused baseline evidence already proves no file is created through message 19, one evaluation occurs at message 20, account changes quarantine pending learning, and learning storage is account-derived.
- Existing Context Galaxy evidence remains unchanged: deterministic persisted placement, bounded LOD/clustering, 2D fallback, keyboard selection, and retrieval animation only for real scoped retrieval activity.

## Focused verification

- Owned baseline: 115 test files and 870 tests passed; one sparse-checkout import blocker described above.
- Final changed-slice frontend run: 14 test files and 51 tests passed with one worker.
- Files-only run: 3 test files and 12 tests passed.
- Post-review Nightly run: 3 test files and 8 tests passed; scheduler recovery: 1 file and 3 tests passed.
- Skills account/UI run: 5 test files and 22 tests passed.
- Preserved Context Galaxy, bounded graph/retrieval, repository retrieval, and every-20-message learning evidence: 7 test files and 62 tests passed.
- Controller re-verification of the final Context/History/Skills/Files hardening: 6 test files and 38 tests passed.
- Worker follow-up verification after the final target-binding, workspace-race, and persistence-bound corrections: 8 test files and 44 tests passed; History/Skills UI regression coverage: 7 files and 20 tests passed.
- `rustfmt --edition 2021 app/src-tauri/src/fsread.rs` completed.
- Native test compilation reached Rust compilation of the library and reported no `fsread.rs` diagnostic, but the full test binary could not finish because the sparse checkout omits bundle capabilities, icons, workers, scripts, and fixtures included by other native modules. An earlier clean target attempt also encountered Windows disk-space error 112 while compiling dependencies. No native test mutated user data; all new tests use unique temporary directories.
- Full TypeScript checking is blocked by sparse-checkout omissions owned by other workers (chat fixtures, GitHub proxy, capability JSON, prompt fixtures, and runtime manifests). Focused Vitest transforms report no changed-file TypeScript errors.
- Prettier, Rust formatting check, `git diff --check`, and a 27-file high-risk secret scan passed.

## Integration note

Worker 7 must register exactly:

- `fsread::fs_rename_file(path: String, new_path: String, root: Option<String>) -> Result<(), String>`
- `fsread::fs_delete_file(path: String, root: Option<String>) -> Result<(), String>`

No production user files, remote services, messages, or repositories were mutated by this worker.
