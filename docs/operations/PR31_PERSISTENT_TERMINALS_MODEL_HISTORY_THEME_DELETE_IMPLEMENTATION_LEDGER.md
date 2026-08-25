# PR31 Persistent Terminals, Model Pickers, History/Theme, and Delete Safety Ledger

## Authority and starting state

- Task: `PR31-PERSISTENT-TERMINALS-MODEL-HISTORY-THEME-DELETE`
- Agent: `VS-CODEX-PR31-PERSISTENCE-SAFETY-20260824`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch: `integration/UnifiedChungus-final`
- Base HEAD: `dbf6890efb6f1f0b2ac646a923db61ca10377416`
- Upstream: `origin/UnifiedChungus` (local branch started 352 commits ahead)
- Merge/rebase state: none detected
- Starting free space: 25,161,994,240 bytes on `C:`
- Verification constraint: automated focused/component/Rust tests only; no live/manual VibeSpace application testing, per the user's explicit override.

## Approved outcomes

1. Preserve live PTY reattachment and add verified provider-native session identity for exact post-restart resume; never guess latest, replay output, or silently start a replacement conversation.
2. Audit a truthful 20-CLI adapter registry and add safe direct argument-vector native spawning.
3. Expose only sanitized terminal resume identity to Jarvis.
4. Reuse the canonical conversational model picker and shared effort glyph presentation without changing route authority or inference behavior.
5. Harden stored-chat navigation and theme command lifecycle without changing Chat runtime, Composer behavior, RLM, or SiYuan.
6. Require two explicit project-deletion confirmations and exact case-sensitive `Delete` entry, with refreshed impact/last-project checks and a single in-flight mutation.

## Ownership and blocker queue

| Slice                                  | Files                                                     | State                                                            |
| -------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Project deletion safety                | `ProjectDetail.tsx`, new focused test                     | **COMMITTED** (`871dc66e`)                                       |
| Native terminal argv and restoration   | Existing terminal/native files                            | **BLOCKED** by active Context Gateway lock; no overlap permitted |
| Standalone audited 20-CLI registry     | New `terminalCliSessionRegistry.ts` and test              | **COMMITTED** (`2a91c8ad`)                                       |
| Versioned CLI session binding contract | New `terminalCliSessionBinding.ts` and test               | **COMMITTED** (`2190b4f6`)                                       |
| Effort trigger and canonical picker    | `Composer.tsx`, `ModelPickerTypeahead.tsx`, related files | **BLOCKED** by active model-picker and Chat locks                |
| Jarvis terminal projection             | `registryJarvisCore.ts` and terminal identity files       | **BLOCKED/DIRTY** under other active work                        |
| History routing reliability            | `Replay.tsx`, new `openStoredChat.ts` and focused test    | **COMMITTED** (`4e1e6cb1`)                                       |
| Theme reliability                      | `themeSlashPicker.tsx` and focused test                   | **COMMITTED** (`f6aeb082`)                                       |

## Verification matrix

| Area                      | Required evidence                                                            | Result                          |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| Delete stages             | First confirm, refreshed impact confirm, exact typed confirmation            | **PASS**                        |
| Delete cancellation       | Escape, Cancel, close/reopen reset, Enter cannot bypass                      | **PASS**                        |
| Delete safety             | No repository mutation before final; last-project rejection; refreshed count | **PASS**                        |
| Delete concurrency        | Double-click/single-flight and repository failure                            | **PASS**                        |
| Adjacent project behavior | Browser links and Monochrome contracts remain green                          | **PASS**                        |
| Terminal resume           | Contract, Rust argv, restart, cancellation, ten panes, no fallback           | Blocked by active ownership     |
| Picker/effort             | Every surface and effort glyph, no route/store mutation                      | Blocked by active ownership     |
| History/theme             | Exact route/connection/engine and preview/commit/cancel/sync                 | Pending root-cause reproduction |

## Checkpoints

### 2026-08-24T21:26:41-05:00 — Preflight and first claim

- Confirmed branch, HEAD, upstream, no merge/rebase state, writable capacity, dirty-worktree preservation, and relevant active locks.
- Claimed only the clean project-deletion source, a new focused test, this ledger, and append-only coordination entries.
- No source file changed at this checkpoint.

### 2026-08-24T21:33:00-05:00 — Project deletion safeguard committed

- Commit: `871dc66ee8689b6123da250880202b6c88b57ba5` (`feat(projects): require staged deletion confirmation`).
- Files: `ProjectDetail.tsx`, `ProjectDetail.deleteSafety.test.tsx`.
- TDD RED: 4/4 new tests failed against the single `window.confirm` implementation.
- GREEN: deletion and adjacent project matrix passed 3 files / 11 tests.
- Verified exact case-sensitive entry, two prior stages, refreshed impact, last-project fail-closed behavior, Escape/Cancel/reset, Enter no-bypass, single-flight deletion, repository failure, and zero mutation before the final action.
- Prettier, diff check, and staged Gitleaks passed. Broad typecheck remains blocked only by four pre-existing protected SiYuan/RLM test diagnostics; no owned diagnostic was emitted.
- No live/manual application testing was performed.

### 2026-08-24T21:35:00-05:00 — History routing claim

- Confirmed `Replay.tsx` clean and no live lock claims any History path.
- Claimed `Replay.tsx`, a new isolated stored-chat navigation service, and its focused tests.
- Intended contract: validate current account/workspace and chat existence; restore exact stored native connection/model and persisted browser/native engine identity before one atomic activate/route action; suppress stale rapid/account-switch requests; never replace an unavailable model or block message restoration.

### 2026-08-24T21:44:00-05:00 — Theme root cause and claim

- History commit: `4e1e6cb1e05d6c75760ae9ac16e33906b489d66e` (`fix(history): restore exact stored chat identity`). History matrix passed 5 files / 28 tests; exact formatting, diff, staged Gitleaks passed; typecheck emitted only the four protected SiYuan/RLM diagnostics.
- Root cause: `/appearance` preview tracks only the theme captured at picker mount. If a cross-window committed theme arrives while previewing, cancel or unmount reapplies that stale capture over the current document, leaving document/store state inconsistent and making the legitimate theme appear not to apply.
- Claimed only the clean theme slash picker and its focused test. Composer, global store, sync bridge, console implementation, and all protected files remain untouched.

### 2026-08-24T21:51:00-05:00 — Theme commit and independent CLI registry claim

- Theme commit: `f6aeb082a7cd440cf405fba61fc3712f19165ca1` (`fix(theme): preserve newer synced appearance`). Theme boundary matrix passed 6 files / 37 tests; Prettier, diff, staged Gitleaks passed; typecheck emitted only the four protected SiYuan/RLM diagnostics.
- Active Context Gateway ownership still blocks native argv, terminal runtime/view restoration, and Jarvis bridge integration. Active owner metadata still blocks Composer/model-picker effort work.
- Claimed only a new standalone 20-CLI registry and focused contract test. Official primary documentation is authoritative. Exact argv is emitted only where deterministic ID resume is documented; all other entries remain conservative and cannot silently use latest or start a replacement session.

### 2026-08-24T22:01:00-05:00 — CLI registry commit and binding-contract claim

- CLI registry commit: `2a91c8ad27ed227d3625e763c1dcede55c9e1af1` (`feat(terminals): add verified CLI resume registry`). Focused registry passed 19/19 tests; Prettier, diff, staged Gitleaks passed; no owned type diagnostic.
- Claimed only a new standalone versioned binding persistence/validation module and test. It must keep provider-native IDs distinct from VibeSpace terminal session IDs, migrate old rows to unverified without deriving IDs, and persist no transcript, commands, secrets, or arbitrary payloads.

### 2026-08-25T18:43:00-05:00 — Binding commit and available-scope handoff

- Binding commit: `2190b4f61fb0036cee5de631909592d5bf0f5f31` (`feat(terminals): persist verified CLI session identity`). Focused registry/binding matrix passed 2 files / 29 tests; Prettier, diff check, staged Gitleaks passed. Broad typecheck emitted only unrelated protected Context/SiYuan diagnostics at this checkpoint.
- Completed reversible product commits from this task: `871dc66e` project deletion, `4e1e6cb1` stored-chat routing, `f6aeb082` theme synchronization, `2a91c8ad` audited CLI registry, and `2190b4f6` versioned verified session binding.
- Remaining native argv/restoration integration is blocked by the active Context Gateway ownership of `app/src-tauri/src/terminal.rs`, `app/src-tauri/src/terminal_cli.rs`, `app/src/features/terminals/TerminalView.tsx`, and adjacent terminal runtime files.
- Remaining canonical picker/effort-trigger integration is blocked by active controller ownership of `app/src/features/chat/Composer.tsx` and `app/src/features/chat/ModelPickerTypeahead.tsx`.
- Remaining Jarvis terminal projection is blocked by active/dirty ownership around `app/src/lib/actions/registryJarvisCore.ts` and the terminal identity bridge.
- No protected file was edited, staged, reset, or overwritten. No live/manual VibeSpace testing was performed. The exact completed source scopes are released so they do not obstruct later integration.
- Shared branch HEAD at handoff is `3cda617a`; intervening commit `98385ffb` belongs to concurrent SiYuan work and was preserved untouched.
