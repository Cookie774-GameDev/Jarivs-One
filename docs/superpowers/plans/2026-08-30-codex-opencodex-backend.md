# Codex CLI + OpenCodex Backend Implementation Plan

> Execute in ordered vertical milestones. Each product edit begins with a focused failing test, ends with exact-file verification and a commit, and preserves all concurrent locks/state.

## Milestone 1 — Durable backend affinity

1. Add `chatBackend.test.ts` with legacy resolution, explicit parsing, unlocked switching, idempotence, first-message lock, and locked-switch rejection.
2. Run the focused test and record the expected module/test failure.
3. Implement `chatBackend.ts` as a pure versioned transition authority.
4. Run focused tests, typecheck, Prettier/diff/secret checks; commit the exact contract files.
5. After Chat ownership releases, add the affinity field to canonical Chat persistence and repository atomic transition tests. Wire new-chat creation, first user-message commit, branch/duplicate, workspace backup/import, session export/recovery.
6. Add `/cli` selector/status and selected-backend native slash catalog tests; integrate only into released Chat UI files.

## Milestone 2 — Managed Codex and OpenCodex readiness

1. Add failing Rust manifest/detection/install tests for pinned Codex and OpenCodex identities, checksum/integrity, review facts, staging, promotion, retained known-good, rollback, and cancellation.
2. Add separate resource manifests and native modules; reuse verified download/extraction primitives without changing OpenCode identity.
3. Add failing process tests for loopback binding, serialized generation ownership, liveness/readiness, stale-owner recovery, bounded logs, stop/config restore, and explicit no-Ollama rejection.
4. Implement peer owned-process states and narrow Tauri commands. Add renderer manager/gate after file-ownership review.
5. Run Rust unit/boundary tests, frontend lifecycle tests, typecheck/build/format/diff/security; exact commit.

## Milestone 3 — Provider/auth bridge and exact identity

1. Add failing tests for account/workspace lease scope, expiry/revalidation, environment reference injection, redaction, incompatible provider failure, and no key persistence.
2. Add a narrow account/workspace-scoped lease at the existing OS-keyring boundary, or require explicit compatible OpenCodex login. Do not treat the plugin-only secret handle as core-provider authority and never add a second vault.
3. Add observed catalog/identity checks for provider/model/effort/Fast/CWD and reject fallback/combo/Ollama.
4. Verify credential scans and identity mismatch boundaries; exact commit.

## Milestone 4 — Structured Codex adapter

1. Add protocol fixtures from generated Codex 0.151.0 structured types and failing parser tests for text, public progress, exact turn-start binding, question, informed ephemeral approval controls, tools, safe args/results/diffs, streamed-summary reconciliation, nonterminal error followed by authoritative completion, unsafe control stripping, bounds, and privacy.
2. Implement Codex app-server/structured JSON transport with generation-safe bounded queues and cancellation.
3. Implement persistent chat-to-thread binding, process-generation ownership, exact turn binding before scoped projection, item-lifecycle idempotence, bounded replay/reconnect reconciliation, crash recovery, bounded in-memory native approval request handles, and exact terminal truth from `turn/completed`. Do not assume notification sequence IDs; Codex 0.151.0 does not provide them.
4. Map only sanitized events into the existing `ProviderEvent` contract. Do not create UI/runtime stores.
5. Route by immutable Chat backend; preserve the OpenCode path byte-for-byte where possible.
6. Run parser/adapter/router/runtime regression boundaries and exact commit.

## Milestone 5 — Modes, approvals, slash catalogs, context

1. Add failing end-to-end tests proving Ask/Plan are transport-level read-only, Plan requires Implement, Agent uses existing approvals, and denial/cancel are truthful.
2. Add live backend-specific slash discovery/rejection and `/cli` locked behavior.
3. Route Codex through the existing Context Gateway/RLM/SiYuan lease and prove citations, receipts, explicit-required failure, and project isolation.
4. Verify OpenCode parity and exact commit.

## Milestone 6 — Official native acceptance

1. Coordinate sole ownership of the existing native Playwright/CDP app; do not use Computer Use or a second launch.
2. Build one immutable SHA and capture version/process/readiness/identity facts without secrets.
3. Execute the fourteen official scenarios from the user milestone, including real temporary Markdown mutation only in Agent mode, incremental activity expansion, cross-backend slash rejection, reload/recovery/dedupe, RLM/SiYuan, and explicit failure paths.
4. Prove no Ollama process and no port-11434 listener before and after.
5. Preserve screenshots, logs, timings, immutable SHA, backend/provider/model/effort/Fast/CWD, and leave the accepted official app running.
6. Append final coordination evidence, release only this task's locks, and report completion only if the real Codex-backed conversation passes.

## First conflict-safe execution packet

- Owned now: new design/plan and `app/src/lib/ai/backend/chatBackend{,.test}.ts`.
- Blocked until handoff: `types/chat.ts`, `Composer.tsx`, Chat lifecycle/view, activity ledger, `runtime.ts`, OpenCode server/transport, and official native controller.
- First RED command: `npm --prefix app test -- --run src/lib/ai/backend/chatBackend.test.ts`.
- First GREEN boundary: focused test, `npm --prefix app run typecheck`, exact Prettier, `git diff --check` on owned files, scoped secret scan.
