# Durable Terminal Persistence Design

## Objective

Preserve each VibeSpace terminal pane's layout, working directory, safe shell,
sanitized scrollback presentation, and inert command draft across route changes,
window hiding, tray exit, app relaunch, updater relaunch, and operating-system
restart. Eliminate visible ANSI/mouse-protocol garbage without changing the
terminal page's visual design, live PTY behavior, project isolation, or cloud
integrations.

An operating-system restart terminates arbitrary child processes. VibeSpace can
restore their durable presentation and launch a safe shell, but it cannot resume
the process's in-memory execution state. Agent CLIs, startup commands, and other
non-shell commands are never restarted without an explicit user confirmation.

## Required Invariants

- Restored drafts are sanitized printable text and are never submitted
  automatically. No restored draft may contain CR, LF, NUL, ESC, C0/C1 control
  characters, terminal mouse reports, or terminal mode sequences.
- Dead sessions automatically launch only a recognized interactive shell.
- Agent CLIs, startup commands, scripts, and unknown executables require
  confirmation before VibeSpace writes the command followed by Enter.
- Live backend sessions continue to reattach without a confirmation because no
  process restart occurs.
- Persisted terminal content is local-only and is never sent to Supabase,
  Stripe, logs, telemetry, crash reporting, or coordination documents.
- ANSI/OSC/DCS/control sequences and likely secrets are removed before content
  reaches localStorage or native snapshot IPC.
- Snapshot writes are bounded, versioned, checksummed, path-safe, and recover
  from the previous valid generation when the newest generation is invalid.
- Snapshot flushes are time-bounded. An exit must not wait indefinitely for
  persistence.
- Explicit pane close, terminal reset, and project terminal reset delete the
  corresponding durable snapshots.
- Existing layout, colors, typography, controls, pane interactions, agent roles,
  terminal commands, Supabase contracts, and Stripe behavior remain unchanged.

## Current Behavior and Root Cause

`TerminalView` forwards every xterm `onData` payload to the PTY. The same
payload is also scanned character-by-character to maintain `currentInput`.
Control bytes are ignored, but their printable payload is retained. For example,
`ESC [<35;24;22M` becomes `[<35;24;22M`. That fragment is persisted and later
written into a replacement PowerShell process as a restored draft, producing the
mouse-report stream shown in the reported screenshot.

The existing transcript persistence already has useful safeguards: debounced
localStorage writes, a backup key, pane-tree flushing, output bounds, and
lifecycle hooks. It does not understand terminal input protocol, does not redact
secrets, and intentionally suppresses dead interactive-TUI transcript restore.
As a result, some agent panes return blank even when useful rendered text was
visible before shutdown.

## Architecture

### 1. Protocol-Aware Draft Tracking

`terminalInputPersistence.ts` will expose a stateful parser that consumes xterm
input chunks and returns:

- the updated printable draft;
- any submitted printable line for existing agent-coordination behavior;
- whether persistence must flush immediately;
- an incomplete terminal protocol suffix carried to the next chunk.

The parser removes CSI, SS3, OSC, DCS, SGR mouse reports, focus reports, bracketed
paste delimiters, function-key sequences, and C0/C1 controls. Bracketed paste
content remains printable draft text, but its delimiters do not. Backspace
continues to remove one Unicode code point. Enter and Ctrl+C clear the draft.
Drafts are capped at 4 KiB.

Persisted legacy drafts pass through the same strict sanitizer during
deserialization and immediately before restore. This repairs previously stored
mouse-report corruption without requiring a user data reset.

Before any draft is persisted, the tracker also inspects the recent sanitized
terminal prompt tail. If it indicates hidden or sensitive input such as a
password, passphrase, PIN, token, secret, credential, private key, or API key,
the persisted draft is cleared. This is required because xterm receives
keystrokes even when the child process has disabled terminal echo. Prompt
detection is conservative: losing a draft at a likely secret prompt is safer
than writing hidden input to disk.

### 2. Terminal Content Sanitization

`terminalContentSanitizer.ts` will provide one pure sanitization boundary for
transcripts and rendered snapshots:

1. reassemble or discard incomplete control sequences;
2. remove ANSI, OSC, DCS, mouse, focus, palette, and orphan escape fragments;
3. normalize line endings;
4. redact likely credentials using conservative, testable patterns;
5. enforce the caller's UTF-8 byte and line limits.

Redaction covers common authorization headers, credential-bearing URLs,
environment assignments whose names contain `KEY`, `TOKEN`, `SECRET`,
`PASSWORD`, or `CREDENTIAL`, JWT-shaped values, AWS access IDs, and common
GitHub, OpenAI, Stripe, Slack, and Supabase token prefixes. Redaction markers
retain the variable/provider label but never the value. Tests use synthetic
values only.

No sanitizer can identify every secret embedded in arbitrary output. The
security boundary therefore combines redaction with local-only storage, strict
retention, no persistence logging, and no cloud sync.

### 3. Rendered Snapshot Extraction

`terminalSnapshot.ts` will read xterm's public active-buffer lines with
`translateToString(true)`. It preserves the rendered plain-text result rather
than raw PTY bytes, so cursor movement and mouse tracking cannot be replayed as
terminal protocol.

The snapshot includes:

- schema version;
- project and pane identity;
- sanitized plain-text buffer tail;
- row and column metadata;
- timestamp;
- whether the previous process was an interactive agent/TUI;
- the prior configured command for restart-policy evaluation.

The frontend applies these limits before IPC:

- at most 5,000 buffer lines;
- at most 512 KiB of UTF-8 snapshot text per pane;
- at most 4 KiB of inert draft text;
- unchanged snapshot hashes are not rewritten;
- one dirty-pane save is scheduled at most once per second.

If a snapshot exceeds the byte cap, the oldest complete lines are removed and a
plain truncation marker is inserted.

### 4. Native Durable Snapshot Store

`terminal_snapshot.rs` will store redacted snapshots below Tauri's per-user app
data directory under `terminal-snapshots/v1`. User-controlled project and pane
identifiers never become path components. A SHA-256 identity digest determines
the filename prefix.

Each save:

1. validates schema, identifier lengths, text bounds, and timestamp;
2. recomputes a SHA-256 content checksum;
3. writes and `sync_all()`s a unique temporary generation;
4. renames it to a unique final generation filename;
5. retains the newest two valid generations for that pane;
6. applies global retention pruning.

Because generations are append-and-rename rather than in-place replacement, a
failed write cannot corrupt the previous generation. Load validates newest first
and falls back to the prior valid generation. Invalid or oversized files are
ignored and pruned.

Retention limits are:

- two generations per pane;
- ten panes per project;
- fifty panes globally;
- twenty MiB total snapshot-directory size;
- thirty days maximum age.

Rust commands provide save, load, delete-pane, and delete-project operations.
No new Rust or npm dependency is required; existing `serde` and `sha2`
dependencies are reused.

### 5. Time-Bounded Flush Registry

`terminalSnapshotRegistry.ts` will let each mounted `TerminalView` register a
snapshot callback. `flushWorkspacePersistence` will synchronously flush the
existing pane tree/transcript backup, then await registered native snapshot
writes for at most 1,200 ms.

Normal output also schedules a dirty snapshot within one second, so the final
lifecycle flush is not the only durable copy. Browser `beforeunload`, where
promises cannot be relied upon, retains the existing synchronous localStorage
fallback.

The updater will await the bounded flush before installation and again before
relaunch. Tray Exit will emit the existing persistence event and wait for a
frontend completion acknowledgement, with a hard 1,500 ms Rust timeout. Window
close still hides to tray and keeps PTYs alive.

### 6. Restore and Restart Policy

Restore order for a dead session is:

1. load the newest valid native snapshot, falling back to its prior generation;
2. fall back to the existing sanitized localStorage transcript if no native
   snapshot is available;
3. render the restored plain-text presentation;
4. spawn a recognized safe shell;
5. write the sanitized draft without CR/LF so it remains unsubmitted.

`terminalRestartPolicy.ts` classifies commands by executable basename.
PowerShell, pwsh, cmd, bash, sh, zsh, fish, and nushell are safe shells. Any
`startupCommand`, detected agent CLI, script, command with arguments, or unknown
executable is deferred.

Deferred commands are never prompted at application startup. The first time the
user focuses that restored pane, VibeSpace uses the existing native confirmation
pattern to ask whether to restart the prior command. Accepting writes the saved
command plus Enter to the safe shell. Declining leaves the shell running and
does not prompt again for that live session. The command is sanitized for
control characters before display or execution.

### 7. Explicit Deletion

Closing a pane deletes its durable pane snapshot after the PTY kill request.
Resetting all project terminals deletes that project's durable snapshots before
creating the replacement shell pane. Clearing terminal content causes the next
snapshot to contain the cleared presentation, preserving existing clear
semantics.

## Error Handling

- Native save/load/delete failures are warnings without snapshot content,
  credentials, project paths, or terminal text.
- A failed periodic save leaves the last-known-good generation untouched and is
  retried on the next dirty or lifecycle flush.
- A flush timeout records a generic warning and allows exit/update flow to
  continue.
- Corrupt current snapshots fall back to the prior valid generation.
- If both native generations fail, restore uses the existing localStorage
  transcript backup.
- If all restore sources are unavailable, VibeSpace launches a clean shell.

## Security and Privacy

- Terminal content remains local and per-user.
- Snapshot filenames reveal only SHA-256 identity digests.
- Native commands validate all lengths and never accept a caller-supplied path.
- Logs contain only operation names and generic error categories.
- Secret redaction happens before both localStorage and native IPC.
- Draft persistence is suppressed at likely password, passphrase, PIN, token,
  secret, credential, private-key, and API-key prompts.
- Snapshot text is not added to Git, Supabase, Stripe, telemetry, tests, or task
  documentation.
- This task does not change RLS, authentication, billing, Edge Functions,
  migrations, environment secrets, release credentials, or GitHub settings.

## Performance

- Transcript append remains bounded and debounced.
- Snapshot extraction runs only for dirty panes and at most once per second.
- Hash equality skips unchanged native writes.
- Native writes run off the UI thread.
- Per-pane, per-project, global-count, total-byte, generation, and age limits
  prevent unbounded growth.
- Restore loads one pane identity at a time and reads at most two generations.

## Planned Files

Frontend terminal modules and tests:

- `app/src/features/terminals/terminalInputPersistence.ts`
- `app/src/features/terminals/terminalInputPersistence.test.ts`
- `app/src/features/terminals/terminalContentSanitizer.ts`
- `app/src/features/terminals/terminalContentSanitizer.test.ts`
- `app/src/features/terminals/terminalSnapshot.ts`
- `app/src/features/terminals/terminalSnapshot.test.ts`
- `app/src/features/terminals/terminalSnapshotRegistry.ts`
- `app/src/features/terminals/terminalSnapshotRegistry.test.ts`
- `app/src/features/terminals/terminalRestartPolicy.ts`
- `app/src/features/terminals/terminalRestartPolicy.test.ts`
- `app/src/features/terminals/TerminalView.tsx`
- `app/src/features/terminals/TerminalsPage.tsx`
- `app/src/features/terminals/TerminalsPage.reset.test.ts`
- `app/src/features/terminals/transcriptStore.ts`
- `app/src/features/terminals/transcriptStore.test.ts`
- `app/src/features/terminals/restoreSession.ts`
- `app/src/features/terminals/restoreSession.test.ts`

Lifecycle and native persistence:

- `app/src/lib/persistence/workspaceFlush.ts`
- `app/src/lib/persistence/workspaceFlush.test.ts`
- `app/src/lib/updates.ts`
- `app/src/lib/updates.test.ts`
- `app/src/App.tsx`
- `app/src-tauri/src/terminal_snapshot.rs`
- `app/src-tauri/src/lib.rs`

Documentation:

- `docs/superpowers/specs/2026-07-10-terminal-persistence-design.md`
- `docs/superpowers/plans/2026-07-10-terminal-persistence.md`
- `docs/TERMINAL_PERSISTENCE_REMEDIATION_REPORT.md`

## Verification

Implementation follows red-green-refactor. Required automated checks:

- focused parser, sanitizer, snapshot, registry, restart-policy, restore,
  transcript, reset, workspace-flush, and updater tests;
- full Vitest suite;
- TypeScript typecheck;
- production Vite build;
- Rust unit tests for validation, generation fallback, checksum rejection,
  path safety, retention, and deletion;
- `cargo check --release`;
- release-manifest test;
- git diff and secret-pattern review.

Required manual desktop checks:

- plain shell pane with output and an unsubmitted draft;
- agent/TUI pane with rendered content;
- four-pane project matching the reported layout;
- route switch and window hide/show with live PTY reattachment;
- tray Exit and relaunch;
- simulated updater flush and relaunch path;
- corrupted newest snapshot with valid backup;
- declined and accepted deferred-command confirmation.

A physical Windows reboot and real signed updater installation require explicit
permission before execution. If not authorized, they remain clearly documented
manual release-gate checks rather than claimed passes.

## Rollback

Revert the feature commit(s) and remove the new terminal snapshot module. The
versioned snapshot directory is ignored by older builds and can remain safely;
an optional later cleanup can delete it. No database, cloud, payment, or package
migration is involved. Existing pane-tree and transcript localStorage formats
remain backward compatible, so rollback returns to the prior restore behavior.

## Acceptance Criteria

- The screenshot's mouse-report sequence cannot enter a persisted draft,
  transcript, rendered snapshot, or restored shell.
- Input entered at a likely sensitive/hidden prompt is not persisted.
- Restored drafts remain visible but unsubmitted.
- Dead agent and non-shell commands do not restart before confirmation.
- Safe shells and sanitized terminal presentation restore automatically.
- Valid prior snapshots recover from corrupt or incomplete newest generations.
- Persistence and retention remain bounded and local.
- Tray/update flushing completes or times out within the documented bound.
- Existing UI design and external integrations remain unchanged.
- Every required automated result and unperformed manual gate is documented
  accurately before the draft PR is opened.
