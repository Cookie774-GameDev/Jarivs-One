# Durable Terminal Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist sanitized, bounded terminal presentation and inert drafts across shutdown/restart while preventing automatic side-effecting command restarts.

**Architecture:** A protocol-aware frontend parser and sanitizer feed the existing transcript store plus a rendered xterm snapshot. Dirty snapshots are flushed through a bounded registry to a versioned Rust generation store under Tauri app data. Dead sessions restore a safe shell and presentation; agents and non-shell commands wait for focus-triggered confirmation.

**Tech Stack:** React 18, TypeScript 5.6, xterm 5.3 public buffer API, Zustand, Vitest 4, Tauri 2, Rust 2021, serde, sha2.

## Global Constraints

- Do not change UI layout, styles, typography, colors, branding, pane controls, or external integrations.
- Never automatically submit a restored draft.
- Never automatically restart an agent CLI, startup command, script, command with arguments, or unknown executable after process death.
- Reattach live sessions unchanged.
- Sanitize controls and likely secrets before localStorage or native IPC.
- Suppress draft persistence at likely sensitive/hidden prompts.
- Snapshot cap: 512 KiB UTF-8 and 5,000 lines per pane.
- Draft cap: 4 KiB.
- Retention: two generations per pane, ten panes per project, fifty panes globally, twenty MiB total, thirty days.
- Periodic dirty flush: at most once per second.
- Frontend lifecycle flush timeout: 1,200 ms.
- Tray-exit hard timeout: 1,500 ms.
- Keep previous valid snapshot generation for recovery.
- No dependency, package lock, Supabase, Stripe, migration, release, or deployment changes.
- Stage only explicit task paths; never stage the unrelated `install/install.ps1` deletion.

---

### Task 1: Terminal Content Sanitizer

**Files:**
- Create: `app/src/features/terminals/terminalContentSanitizer.ts`
- Create: `app/src/features/terminals/terminalContentSanitizer.test.ts`

**Interfaces:**
- Produces: `sanitizePersistedTerminalText(input, limits): SanitizedTerminalText`
- Produces: `isSensitiveTerminalPrompt(recentOutput): boolean`
- Produces: `sanitizePersistedDraft(input, recentOutput?): string`

- [ ] **Step 1: Write failing sanitizer tests**

Cover complete and split ANSI/OSC/DCS sequences, orphan mouse reports with and
without `[`, focus/palette fragments, CR/LF normalization, UTF-8 byte-tail
truncation, complete-line truncation, authorization headers, credential URLs,
secret environment assignments, JWT shape, provider token prefixes, and
sensitive prompt detection. Assert synthetic secret values never appear in the
result.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm --prefix app run test -- src/features/terminals/terminalContentSanitizer.test.ts
```

Expected: FAIL because `terminalContentSanitizer.ts` does not exist.

- [ ] **Step 3: Implement the pure sanitization boundary**

Use these exact exported types:

```ts
export interface TerminalTextLimits {
  maxBytes: number;
  maxLines: number;
  truncationMarker?: string;
}

export interface SanitizedTerminalText {
  text: string;
  truncated: boolean;
}

export function sanitizePersistedTerminalText(
  input: string,
  limits: TerminalTextLimits,
): SanitizedTerminalText;

export function isSensitiveTerminalPrompt(recentOutput: string): boolean;

export function sanitizePersistedDraft(
  input: string,
  recentOutput?: string,
): string;
```

Process controls before secrets, normalize newlines, redact secrets, then take a
UTF-8-safe tail by complete lines. `sanitizePersistedDraft` returns an empty
string for sensitive prompts and otherwise strips all controls and CR/LF before
applying the 4 KiB cap.

- [ ] **Step 4: Verify GREEN**

Run the focused test and confirm all cases pass without secret-bearing failure
output.

- [ ] **Step 5: Commit**

```powershell
git add -- app/src/features/terminals/terminalContentSanitizer.ts app/src/features/terminals/terminalContentSanitizer.test.ts
git commit -m "fix: sanitize persisted terminal content"
```

### Task 2: Protocol-Aware Draft Parser

**Files:**
- Create: `app/src/features/terminals/terminalInputPersistence.ts`
- Create: `app/src/features/terminals/terminalInputPersistence.test.ts`

**Interfaces:**
- Consumes: `sanitizePersistedDraft()`
- Produces: `createPersistedInputTracker(initialDraft?): PersistedInputTracker`

- [ ] **Step 1: Write failing parser tests**

Test ordinary typing, Unicode, backspace by code point, Enter, Ctrl+C, split CSI,
arrow/function keys, SS3, SGR mouse reports, focus reports, bracketed paste
content, pasted newline submission, OSC/DCS payloads, 4 KiB bounds, and the exact
reported `ESC [<35;24;22M` sequence.

- [ ] **Step 2: Verify RED**

Run the focused test. Expected: module-not-found failure.

- [ ] **Step 3: Implement the stateful parser**

Use:

```ts
export interface PersistedInputUpdate {
  draft: string;
  submittedText: string | null;
  flushNow: boolean;
}

export interface PersistedInputTracker {
  push(data: string): PersistedInputUpdate;
  replaceDraft(draft: string): void;
  currentDraft(): string;
  reset(): void;
}

export function createPersistedInputTracker(
  initialDraft?: string,
): PersistedInputTracker;
```

Maintain parser state across chunks. Strip protocol sequences rather than
dropping only their ESC byte. Preserve bracketed-paste payload text while
discarding delimiters.

- [ ] **Step 4: Verify GREEN**

Run parser and sanitizer tests together.

- [ ] **Step 5: Commit**

Stage only the two parser files and commit `fix: prevent terminal protocol draft corruption`.

### Task 3: Snapshot Extraction, Registry, and Restart Policy

**Files:**
- Create: `app/src/features/terminals/terminalSnapshot.ts`
- Create: `app/src/features/terminals/terminalSnapshot.test.ts`
- Create: `app/src/features/terminals/terminalSnapshotRegistry.ts`
- Create: `app/src/features/terminals/terminalSnapshotRegistry.test.ts`
- Create: `app/src/features/terminals/terminalRestartPolicy.ts`
- Create: `app/src/features/terminals/terminalRestartPolicy.test.ts`

**Interfaces:**
- Consumes: terminal sanitizer
- Produces: snapshot IPC payload and restored snapshot types
- Produces: bounded flush registration
- Produces: safe-shell/deferred-command decision

- [ ] **Step 1: Write failing tests**

Snapshot tests use a fake public xterm buffer with wrapped/blank/Unicode lines.
Registry tests cover success, rejection, timeout, unregister, and concurrent
flush coalescing. Restart-policy tests cover recognized shell basenames,
absolute Windows/Unix shell paths, agent CLIs, startup commands, scripts,
arguments, control characters, and unknown executables.

- [ ] **Step 2: Verify RED**

Run all three focused test files. Expected: module-not-found failures.

- [ ] **Step 3: Implement snapshot extraction**

Export:

```ts
export const TERMINAL_SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_TERMINAL_SNAPSHOT_BYTES = 512 * 1024;
export const MAX_TERMINAL_SNAPSHOT_LINES = 5_000;

export interface TerminalSnapshotPayload {
  schemaVersion: 1;
  projectId: string | null;
  paneId: string;
  text: string;
  rows: number;
  cols: number;
  updatedAt: number;
  command: string | null;
  interactive: boolean;
}

export function createTerminalSnapshot(
  terminal: TerminalBufferLike,
  metadata: Omit<TerminalSnapshotPayload, 'schemaVersion' | 'text'>,
): TerminalSnapshotPayload;
```

Read only `terminal.buffer.active.getLine(index)?.translateToString(true)`.
Sanitize and cap before returning.

- [ ] **Step 4: Implement bounded registry**

Export:

```ts
export const TERMINAL_FLUSH_TIMEOUT_MS = 1_200;
export type TerminalSnapshotFlush = () => Promise<void>;
export function registerTerminalSnapshotFlush(
  paneKey: string,
  flush: TerminalSnapshotFlush,
): () => void;
export function flushRegisteredTerminalSnapshots(
  timeoutMs?: number,
): Promise<{ completed: number; failed: number; timedOut: boolean }>;
```

Snapshot a copy of callbacks before awaiting. Resolve at the deadline and never
leave an unhandled rejection.

- [ ] **Step 5: Implement restart policy**

Export:

```ts
export type TerminalRestartDecision =
  | { kind: 'safe-shell'; spawnCommand: string | undefined }
  | { kind: 'confirm'; spawnCommand: undefined; deferredCommand: string };

export function terminalRestartDecision(
  command?: string | null,
  startupCommand?: string | null,
): TerminalRestartDecision;
```

Only known shell executables without arguments return `safe-shell`. Any
startup command or non-shell command returns `confirm`. Strip controls from
deferred command text.

- [ ] **Step 6: Verify GREEN and commit**

Run all three tests, stage only six files, and commit
`feat: add bounded terminal snapshot primitives`.

### Task 4: Native Snapshot Generation Store

**Files:**
- Create: `app/src-tauri/src/terminal_snapshot.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: frontend `TerminalSnapshotPayload`
- Produces Tauri commands:
  `terminal_snapshot_save`, `terminal_snapshot_load`,
  `terminal_snapshot_delete`, `terminal_snapshot_delete_project`
- Produces: `persistence_flush_complete` acknowledgement command/state

- [ ] **Step 1: Write Rust unit tests before commands**

Inside `terminal_snapshot.rs`, test validation, SHA-256 identity filenames,
checksum mismatch rejection, newest-valid load, fallback to prior generation,
two-generation pruning, per-project/global/age/byte retention, pane deletion,
project deletion, and path traversal resistance using a unique directory below
`std::env::temp_dir()`. Tests must never use real app data.

- [ ] **Step 2: Verify RED**

Run:

```powershell
cargo test terminal_snapshot --lib
```

Expected: compile failure because the module does not exist or required symbols
are missing.

- [ ] **Step 3: Implement storage core**

Use serde camelCase request/response structs, `sha2::Sha256`, unique
`.tmp` generation files, `File::sync_all()`, rename to a unique final
generation, checksum validation, and newest-first fallback. Never accept a path
from IPC. Errors use fixed categories and never include content.

- [ ] **Step 4: Register state and commands**

Add `mod terminal_snapshot;`, manage a flush acknowledgement state, register
the five commands, and change tray Exit from a fixed 750 ms sleep to polling for
acknowledgement with a 1,500 ms hard deadline.

- [ ] **Step 5: Verify GREEN and commit**

Run `cargo test terminal_snapshot --lib` and `cargo check --release`. Stage
only the Rust module and `lib.rs`; commit
`feat: persist terminal snapshots with recovery generations`.

### Task 5: Transcript and Restore Integration

**Files:**
- Modify: `app/src/features/terminals/transcriptStore.ts`
- Modify: `app/src/features/terminals/transcriptStore.test.ts`
- Modify: `app/src/features/terminals/restoreSession.ts`
- Modify: `app/src/features/terminals/restoreSession.test.ts`

**Interfaces:**
- Consumes: sanitizer and native loaded snapshot
- Produces: sanitized transcript/draft storage and a restore decision that never
  contains control-bearing draft text

- [ ] **Step 1: Add failing tests**

Add tests proving transcript secrets and controls are redacted before
localStorage, hidden-prompt drafts become empty, legacy mouse-report drafts are
repaired, interactive sessions prefer rendered snapshots, corrupt/missing
snapshots fall back to transcript, and restored drafts contain no CR/LF.

- [ ] **Step 2: Verify RED**

Run transcript and restore tests; confirm failures are caused by missing
sanitization/snapshot behavior.

- [ ] **Step 3: Implement minimal integration**

Route `appendOutput`, `setCurrentInput`, deserialization, and
`terminalRestoreText` through the shared sanitizer. Extend restore input with
an optional already-validated native snapshot. Keep localStorage schema
backward-compatible.

- [ ] **Step 4: Verify GREEN and commit**

Run focused tests, stage four explicit paths, and commit
`fix: restore only sanitized terminal state`.

### Task 6: TerminalView and Explicit Reset Integration

**Files:**
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/terminals/TerminalsPage.tsx`
- Modify: `app/src/features/terminals/TerminalsPage.reset.test.ts`

**Interfaces:**
- Consumes: parser, sanitizer, snapshot, registry, restart policy, native commands
- Produces: periodic/forced snapshots, safe-shell restore, inert draft restore,
  focus-triggered confirmation, explicit snapshot deletion

- [ ] **Step 1: Add failing reset and pure integration tests**

Extend the reset helper contract so project snapshot deletion is called once
without changing layout reset behavior. Keep parser/snapshot/restart behavior in
pure modules rather than DOM-heavy mocks.

- [ ] **Step 2: Verify RED**

Run reset and all new terminal module tests.

- [ ] **Step 3: Replace ad-hoc draft tracking**

Instantiate one persisted input tracker per mounted terminal. Use its output for
current draft and submitted-agent text. Before `setCurrentInput`, pass recent
sanitized transcript context so likely hidden input is cleared.

- [ ] **Step 4: Add dirty snapshot lifecycle**

Load the native snapshot by project/pane before dead-session spawn, render it,
mark the pane dirty on parsed output, schedule at most one save per second,
register a forced flush callback, and skip unchanged hashes.

- [ ] **Step 5: Enforce safe restart**

For dead sessions, use `terminalRestartDecision`. Spawn default shell for
deferred commands. Restore the sanitized draft without CR/LF. On first user
focus, use `window.confirm`; only acceptance sends
`commandToInput(deferredCommand)`. Never prompt at startup and never re-prompt
for that live session after decline.

- [ ] **Step 6: Delete intentional state**

Pane kill invokes `terminal_snapshot_delete`. Project reset invokes
`terminal_snapshot_delete_project` before replacing the tree.

- [ ] **Step 7: Verify GREEN and commit**

Run all terminal-focused tests and typecheck. Stage the three explicit paths and
commit `feat: restore terminal presentation with safe restart confirmation`.

### Task 7: Time-Bounded Lifecycle and Updater Flush

**Files:**
- Modify: `app/src/lib/persistence/workspaceFlush.ts`
- Modify: `app/src/lib/persistence/workspaceFlush.test.ts`
- Modify: `app/src/lib/updates.ts`
- Create: `app/src/lib/updates.test.ts`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: snapshot registry and Rust acknowledgement command
- Produces: `flushWorkspacePersistence(reason?): Promise<WorkspaceFlushResult>`

- [ ] **Step 1: Write failing lifecycle tests**

Test synchronous event/tree/transcript order, awaited snapshot completion,
1,200 ms timeout, snapshot rejection accounting, updater awaiting pre-install
and pre-relaunch flushes, and persistence acknowledgement after desktop events.

- [ ] **Step 2: Verify RED**

Run workspace flush and updater tests; confirm expected type/behavior failures.

- [ ] **Step 3: Implement bounded async flush**

Return:

```ts
export interface WorkspaceFlushResult {
  completed: number;
  failed: number;
  timedOut: boolean;
}

export async function flushWorkspacePersistence(
  reason?: string,
): Promise<WorkspaceFlushResult>;
```

Keep synchronous localStorage work before the first await. Await registered
snapshot flushes with the registry deadline. Log only generic counts/reason.

- [ ] **Step 4: Await updater gates and acknowledge desktop flush**

Await both updater flush calls. In `App.tsx`, desktop persist events await the
flush and then invoke `persistence_flush_complete` in `finally`. Other
callers intentionally use `void` where shutdown cannot await.

- [ ] **Step 5: Verify GREEN and commit**

Run focused tests, typecheck, and build. Stage five explicit paths and commit
`fix: bound terminal persistence during exit and updates`.

### Task 8: Documentation, Full Verification, Review, and Draft PR

**Files:**
- Modify: `docs/superpowers/plans/2026-07-10-terminal-persistence.md`
- Create: `docs/TERMINAL_PERSISTENCE_REMEDIATION_REPORT.md`
- Update external Grok coordination ledger under its short coordination lock

- [ ] **Step 1: Write remediation report**

Record root cause, old/new behavior, every changed file/symbol, storage format,
security behavior, retention, performance, rollback, exact commands/results,
pre-existing npm audit/deprecation findings, pre-existing Rust/Vite warnings,
manual checks, skipped physical reboot/update gates, and the unrelated installer
deletion incident.

- [ ] **Step 2: Run fresh focused verification**

```powershell
npm --prefix app run test -- src/features/terminals/terminalContentSanitizer.test.ts src/features/terminals/terminalInputPersistence.test.ts src/features/terminals/terminalSnapshot.test.ts src/features/terminals/terminalSnapshotRegistry.test.ts src/features/terminals/terminalRestartPolicy.test.ts src/features/terminals/restoreSession.test.ts src/features/terminals/transcriptStore.test.ts src/features/terminals/TerminalsPage.reset.test.ts src/lib/persistence/workspaceFlush.test.ts src/lib/updates.test.ts
```

- [ ] **Step 3: Run full verification**

```powershell
npm --prefix app run test
npm run typecheck
npm run build
npm run test:release-manifest
cargo test --lib
cargo check --release
```

Record exact pass/fail counts and warnings.

- [ ] **Step 4: Perform security and diff checks**

Run `npm audit --json` without automatic fixes, `git diff --check`, explicit
changed-file listing, staged secret-pattern scan, and verify no Supabase,
Stripe, package, release, UI-style, or installer path is staged.

- [ ] **Step 5: Request independent code review**

Review the complete diff against the spec. Fix every Critical/Important finding
and rerun affected tests.

- [ ] **Step 6: Commit documentation**

Stage only the plan/report and any verified implementation paths. Never stage
`install/install.ps1`.

- [ ] **Step 7: Publish draft PR**

Verify `gh auth status`, push `agent/terminal-persistence-recovery`, and open
a draft PR against `main`. The PR body must include root cause, safety
constraints, exact verification, unresolved warnings/audit findings, manual
release gates, no-deploy/no-merge status, and rollback.

- [ ] **Step 8: Finalize coordination**

Record commit/PR, tests, risks, skipped gates, and incident outcome. Remove the
active task and all file locks, release the coordination lock, and verify the
lock directory is absent.
