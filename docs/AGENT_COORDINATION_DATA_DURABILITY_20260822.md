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
