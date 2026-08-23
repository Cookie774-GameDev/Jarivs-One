# PR31 data durability and cloud recovery

## 2026-08-22 — explicit cloud-recovery lane claimed

- Agent: `VS-CODEX-DATA-DURABILITY-20260822`
- Branch/base: `integration/UnifiedChungus-final` at `4ca56889`
- Exact scope: `app/src/lib/cloudRecovery.ts` and test; Account cloud-recovery surface and focused test; `qeue.md`; this ledger; agent-scoped lock.
- Existing truth: the stable Tauri identifier and additive Dexie V1–V12 chain preserve local data across normal updates. The existing account-owned `app_sync_records` path uploads core mutations, but automatic pull intentionally applies only custom tools, plugin metadata, and reviewed Context documents. It is not a complete core-data restore.
- Safety boundary: recovery is explicit and preview-first. It may merge only validated core records owned by the currently authenticated account. It never deletes local records, never overwrites a newer/equal/ambiguous local record, and excludes credentials, API keys, settings blobs, terminal transcripts/sessions, project files, provider state, and local-only Context/SiYuan data.
- External state: no production Supabase data, schema, credentials, billing, or deployment is mutated during implementation or automated verification.

## 2026-08-22 — implementation verification checkpoint

- Implemented a paginated, exact-account recovery reader over the existing `app_sync_records` table. Only `workspaces`, `projects`, custom `agents`, `chats`, `messages`, `tasks`, `memory_items`, `events`, `quick_link_groups`, and `quick_links` are eligible.
- Account now provides a calm preview, exact counts, explicit confirmation, progress/error truth, and a safe local merge. A second authority check occurs after the cloud read and immediately before local writes. Recovery never applies delete tombstones and never replaces a newer, equal, or freshness-ambiguous local row.
- Fresh focused verification: `npm run test -- src/lib/cloudRecovery.test.ts src/features/settings/sections/Account.cloudRecovery.test.tsx src/features/settings/sections/Account.profile.test.tsx src/lib/db/index.migration.test.ts --reporter=dot` — PASS, 4 files / 32 tests.
- Full `npm run typecheck` reports only the four known, separately owned SiYuan test diagnostics at `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`; no diagnostic remains in this scope.
- No live account recovery was executed and no production Supabase state was changed. Native visual acceptance remains deferred under the user's current no-live-app instruction.

## 2026-08-22 — committed and released

- Product commit: `b09f6d89775d2ce31df2eedd60dc898c683e807c` (`feat(account): add safe cloud recovery preview`).
- Final proof: focused Account/cloud/migration matrix PASS, 4 files / 32 tests; direct Vite production bundle PASS in 1m 8s; scoped formatting/diff checks PASS; staged Gitleaks scanned 28.71 KB with zero leaks. Full TypeScript remains blocked only by the four separately owned SiYuan test diagnostics already listed above.
- Remaining durability work is intentionally separate: complete all-store inventory, portable local export, end-to-end encrypted opt-in backup for eligible non-secret data, and official native Account visual acceptance. This commit does not claim those items.

## 2026-08-22 — executable durability inventory lane claimed

- Agent: `VS-CODEX-DURABILITY-INVENTORY-20260822`
- Branch/base: `integration/UnifiedChungus-final` at `0ed84615`.
- Exact scope: new content-free durability inventory and focused test under `app/src/lib/persistence/`; this ledger; `qeue.md`; agent-scoped lock.
- Intent: require every current and future Dexie store to declare update safety, hard-reset exposure, backup coverage, cloud behavior, and sensitivity. Also classify the major localStorage, native-file, keychain, repair-backup, and cache families without reading user content.
- Safety boundary: `schema.ts`, sync behavior, credentials, production Supabase, user records, and all other agents' dirty files remain untouched. This lane documents and tests current truth; it does not upload, restore, erase, or migrate data.

## 2026-08-22 — executable durability inventory implementation checkpoint

- Added a content-free inventory for every current Dexie store and the major non-Dexie user-data authorities. It records normal-update retention, hard-reset exposure, Doctor/workspace-export coverage, actual cloud disposition, sensitivity, and the current lack of portable restore.
- Truth retained: only ten core tables have explicit safe cloud recovery; five legacy tables are outbound-only; Context remains locally authoritative with separately reviewed derived-document sync; credentials, auth sessions, terminal scrollback, Doctor snapshots, and private project files are never cloud-backup eligible.
- The inventory imports schema metadata only and never opens IndexedDB or reads user records. An exact-key test makes every future Dexie store addition fail until the new store is classified.
- Initial focused verification: `npm run test -- src/lib/persistence/dataDurabilityInventory.test.ts --reporter=dot` — PASS, 1 file / 6 tests.

## 2026-08-22 — executable durability inventory committed and released

- Product/test/docs commit: `4a69fa141bc895396ed680b5df7dc0c555af5d87` (`test(storage): inventory durable user data`).
- Fresh verification: inventory + V1→V12 migration + cloud-recovery matrix PASS, 3 files / 26 tests; exact Prettier and diff checks PASS; staged Gitleaks scanned 15.56 KB with zero leaks.
- Full TypeScript reports only the same four separately owned SiYuan diagnostics at `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`; this slice introduced no diagnostics.
- Exact source/test/queue scope is released. The inventory now exposes portable restore as the next unclosed durability gap.

## 2026-08-22 — portable workspace restore lane claimed

- Agent: `VS-CODEX-PORTABLE-RESTORE-20260822`
- Branch/base: `integration/UnifiedChungus-final` at `35c8a14a`.
- Exact scope: new workspace-restore domain/test; Account portable backup/restore surface and focused test; durability inventory/test; this ledger; `qeue.md`; agent-scoped lock.
- Intent: close the existing one-way workspace/canvas export gap with strict version/account validation, preview-first additive restore, explicit confirmation, and local last-success/error history.
- Safety boundary: restore never deletes or overwrites local rows, never imports provider connection state or credentials, and never touches terminal transcripts or project-file bytes. Existing backup export, schema, sync, production services, and other agents' files remain unchanged.

## 2026-08-22 — portable workspace restore implementation checkpoint

- Added strict parsing for the existing versioned workspace artifact: 32 MiB/100,000-row limits, exact format/version/account ownership, unique keys, complete parent-child relationships, and Canvas account checks run before any write.
- Restore is transactionally additive. Preview reports missing versus preserved local rows; Apply rechecks the active identity and every key inside one transaction, inserts missing rows in dependency order, preserves every existing row, and rolls back on account changes or malformed writes.
- Account now exposes Export backup and Preview restore without requiring a cloud plan, requires explicit confirmation before Apply, and shows account-scoped last export/restore/error history. No production service or user data was exercised.
- Initial focused verification: workspace restore + Account portable/cloud/profile matrix PASS, 4 files / 20 tests.
- Expanded verification: backup/export + restore + Account + inventory + migration + cloud-recovery matrix PASS, 8 files / 54 tests; direct Vite production bundle PASS in 58.15 seconds with existing bundler warnings only. Full TypeScript reports only the four separately owned SiYuan diagnostics and no diagnostic in this scope.

## 2026-08-22 — portable workspace restore committed and released

- Product/test/docs commit: `3dfcbfdad417def9f16d53c66a762870ee0f4577` (`feat(account): add safe portable restore`).
- Commit gate: exact formatting and diff checks PASS; staged Gitleaks scanned 39.51 KB with zero leaks. The 8-file / 54-test matrix and direct production bundle remained the fresh behavioral/build evidence for the committed source.
- No live restore, production cloud mutation, secret access, terminal transcript access, or project-file write occurred. Official native Account visual acceptance remains deferred under the user's no-live-app instruction.
- Exact source/test/UI/queue scope is released.

## 2026-08-22 — normal-update durability contract lane claimed

- Agent: `VS-CODEX-UPDATE-DURABILITY-20260822`
- Branch/base: `integration/UnifiedChungus-final` at `6ea1d34c`.
- Exact scope: one new read-only durability contract test; this ledger; `qeue.md`; agent-scoped lock.
- Intent: freeze the installed-app identifier, IndexedDB name, current additive version chain, and absence of destructive update cleanup so ordinary release/version changes cannot silently move or erase the user's WebView storage authority.
- Safety boundary: no schema, database, updater, installer, app identifier, localStorage producer, or user data is changed.

## 2026-08-22 — normal-update durability implementation checkpoint

- Added a read-only regression contract that freezes the production Tauri identifier `ai.jarvis.desktop`, product name, IndexedDB name `jarvis-v1`, V12/51-store authority, and the complete additive `version(1)` through `version(12)` registration chain.
- The contract uses an isolated fake IndexedDB to prove a same-authority reopen preserves a nested settings row exactly while local preferences remain untouched. It also fails if a destructive Dexie upgrade hook or database delete enters the production database constructor.
- No updater, schema, storage producer, app configuration, or user data was changed.
- Fresh update/migration/portable/cloud matrix: PASS, 4 files / 28 tests. Full TypeScript reports only the same four separately owned SiYuan test diagnostics; the new contract has no diagnostic.

## 2026-08-22 — normal-update durability contract committed and released

- Contract/test/docs commit: `6f958a91e78445d885a3301dbf32f4c74f6a2886` (`test(storage): freeze update durability contract`).
- Commit gate: exact formatting/diff checks PASS; staged Gitleaks scanned 4.63 KB with zero leaks. No product storage or updater behavior changed.
- Exact contract/queue/ledger scope is released.

## 2026-08-22 — explicit encrypted cloud-backup lane claimed

- Agent: `VS-CODEX-ENCRYPTED-CLOUD-BACKUP-20260822`
- Branch/base: `integration/UnifiedChungus-final` at `718fbed3`.
- Exact scope: new encrypted-cloud domain/test; Account opt-in surface and focused test; this ledger; `qeue.md`; agent-scoped lock.
- Intent: create the existing portable workspace artifact locally, encrypt it with a user-held passphrase before any upload, store only the ciphertext envelope in the existing account-RLS `app_sync_records` authority, and require download/decrypt/restore preview before any local write.
- Safety boundary: passphrases are never persisted or transmitted; credentials, sessions, terminals, provider state, file bytes, and private paths remain excluded by the underlying portable artifact. No Supabase migration, function, deployment, credential, or live user record is touched during implementation or tests.

## 2026-08-22 — explicit encrypted cloud-backup implementation checkpoint

- Account now requires a 12–256-character passphrase plus an explicit acknowledgement before upload. The existing typed portable artifact is created and flushed locally, encrypted with a random 16-byte salt, PBKDF2-SHA-256 at 310,000 iterations, AES-256-GCM, and a random 12-byte IV, then only the ciphertext envelope is written to the existing account-RLS generic record.
- Download verifies the authenticated account and strict envelope metadata, decrypts locally, clears the passphrase, and feeds plaintext only into the existing additive restore preview. It never applies a restore automatically. Wrong passphrases or damaged/cross-account envelopes fail closed.
- Authority is rechecked after artifact creation, before upload, after download, and after decryption. No passphrase is stored in React state after an operation, localStorage, the OS keychain, logs, or the cloud payload.
- Fresh domain/UI/portable/cloud matrix PASS, 6 files / 26 tests with no React warnings. Direct Vite production bundle PASS in 59.75 seconds with existing bundler warnings only. Full TypeScript reports only the same four separately owned SiYuan test diagnostics; the initial WebCrypto buffer/literal diagnostics were corrected and are absent on rerun.
