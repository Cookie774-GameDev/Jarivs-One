# Terminal Persistence Remediation Report

Date: 2026-07-11
Branch: `agent/terminal-persistence-recovery`
Base: `origin/main` at `ec56ef3b48e7f4758dd98335d2f3e1bb8895b693`
Status: implementation and automated verification complete; not merged or deployed

## Scope and Guardrails

This change adds durable, local terminal presentation and inert draft recovery
without changing terminal layout, styling, pane controls, application branding,
Supabase, Stripe, packages, release configuration, or existing live-session
reattachment. It follows these enforced safeguards:

- Restored drafts are never submitted automatically.
- Dead agent CLIs, startup commands, scripts, commands with arguments, and
  unknown executables are never restarted automatically.
- Known shells without arguments may restart automatically after process death.
- Deferred commands require one user confirmation on terminal focus. Declining
  does not prompt again for that live replacement session.
- A recovered draft is injected only when recovery restarted a known safe shell.
  It is never injected into the fallback shell used for a deferred agent or
  side-effecting command.
- Live PTYs continue to reattach unchanged.
- Persisted terminal text is local-only and sanitized before localStorage or
  native IPC.
- No GitHub merge, deployment, Supabase mutation, Stripe mutation, or production
  data operation was performed.

## Root Cause

The visible mouse/control-sequence corruption in the reported screenshot had
multiple contributing causes:

1. Draft tracking accepted printable fragments from terminal protocols after
   losing the leading escape byte, so mouse reports such as `[<35;24;22M`
   could enter `currentInput`.
2. Transcript persistence stored a stripped rolling stream rather than a
   rendered xterm presentation. Interactive full-screen applications therefore
   restored incomplete or malformed screen content.
3. Terminal state existed primarily in memory and localStorage. There was no
   native, generation-based pane snapshot that survived process death, app
   replacement, or localStorage eviction.
4. Tray exit used a fixed delay rather than a frontend acknowledgement, direct
   exit requests did not wait, and updater flush calls were not awaited.
5. Existing restoration could restart pane commands without distinguishing a
   safe shell from an agent, script, startup command, or unknown executable.

## Implemented Behavior

### Sanitization and Draft Tracking

`terminalContentSanitizer.ts` removes complete and unterminated ANSI CSI, OSC,
DCS, SS3, mouse, focus, palette, C0, C1, and orphan protocol fragments. It
normalizes newlines, applies UTF-8-safe bounds, and redacts likely authorization
headers, credential URLs, secret environment assignments, JWTs, common provider
token prefixes, and AWS access-key shapes. Drafts are suppressed entirely at
likely password, passphrase, PIN, API-key, token, secret, private-key, or
credential prompts.

`terminalInputPersistence.ts` maintains parser state across input chunks,
supports Unicode backspace and bracketed paste, discards protocol delimiters,
and produces an inert draft plus submitted-text metadata. The exact reported
mouse sequence is covered by regression tests.

### Durable Presentation Snapshots

`terminalSnapshot.ts` reads the public xterm active buffer and persists plain,
sanitized rendered lines rather than replaying raw PTY control bytes. Snapshot
command metadata is sanitized before IPC. Saves are dirty-scheduled at most
once per second, deduplicated by content fingerprint, serialized per pane, and
forced flushes wait for the final xterm write callback before reading the
buffer.

Native snapshots are stored below the Tauri application-data directory at
`terminal-snapshots/v1`. Project and pane identifiers are represented only by
SHA-256 digests in filenames. Each JSON generation includes a SHA-256 checksum;
load selects the newest valid generation and falls back to the previous valid
generation if the newest is corrupt.

Hard limits:

- 512 KiB UTF-8 and 5,000 lines per pane snapshot.
- 4 KiB per inert draft.
- Two generations per pane.
- Ten panes per project and fifty panes globally.
- Twenty MiB total snapshot storage.
- Thirty-day maximum snapshot age.
- 32 KiB rolling transcript per session, ten persisted sessions, and 512 KiB
  aggregate transcript storage under the existing transcript contract.

### Recovery and Restart Policy

Recovery first asks the backend for live PTYs. A matching live session attaches
without replay or process restart. A dead pane loads its validated native
snapshot, restores the rendered presentation, and spawns only a known shell
automatically. Agent CLIs and other commands spawn a safe default shell and
wait for confirmation before their command is sent. Missing snapshots fall
back to the existing sanitized transcript behavior; a corrupt newest snapshot
falls back to its last-known-good generation.

Explicit pane close deletes that pane's snapshot. Explicit project terminal
reset deletes the project's snapshots. Layout-only reset remains unchanged.

### Shutdown and Update Durability

The workspace flush writes synchronous pane-tree, transcript, and localStorage
state before awaiting the terminal snapshot registry. Registry completion is
bounded at 1,200 ms and reports completed, failed, and timed-out counts.

Tray exit and direct `ExitRequested` events begin one coalesced flush, emit the
desktop persistence event, and wait for frontend acknowledgement. Both paths
have a 1,500 ms native hard deadline. The state is completed before forced exit
to avoid duplicate waits or exit loops. Update installation awaits a flush
before download/install and again before relaunch.

## Changed Areas

- Native persistence and exit lifecycle: `app/src-tauri/src/terminal_snapshot.rs`,
  `app/src-tauri/src/lib.rs`.
- Terminal sanitization and parsing: `terminalContentSanitizer.*`,
  `terminalInputPersistence.*`, and `transcriptStore.*`.
- Snapshot, registry, restart, and restore decisions: `terminalSnapshot.*`,
  `terminalSnapshotRegistry.*`, `terminalRestartPolicy.*`, and
  `restoreSession.*`.
- Runtime integration and intentional deletion: `TerminalView.tsx`,
  `TerminalsPage.tsx`, and `TerminalsPage.reset.test.ts`.
- App/update lifecycle: `workspaceFlush.*`, `updates.*`, and `App.tsx`.
- Design and implementation records under `docs/superpowers` plus this report.

No package manifest, lockfile, CSS, UI design, Supabase, Stripe, migration,
release, updater configuration, or installer file is part of the branch diff.

## Verification Results

Fresh focused verification after review fixes:

```text
npm run typecheck
PASS

npm run test -- <10 persistence-focused test files>
PASS: 10 files, 121 tests
```

Full frontend verification:

```text
npm --prefix app run test
PASS: 172 files, 947 tests

npm run typecheck
PASS

npm run build
PASS: 2,820 modules transformed

npm run test:release-manifest
PASS: 1 test, 0 failures
```

Native verification after direct-exit hardening:

```text
cargo test --lib
PASS: 18 tests, 0 failures

cargo test terminal_snapshot --lib
PASS: 7 tests, 0 failures, 11 filtered

cargo check --release
PASS
```

Security and scope checks:

```text
git diff --check origin/main...HEAD
PASS

changed-path prohibited-scope scan
PASS: no Supabase, Stripe, package, CSS, release, or installer path in branch diff

credential-pattern scan of branch diff
PASS after inspection: only two explicitly synthetic sanitizer-test fixtures

npm audit --json
2 pre-existing findings: 1 high (vite), 1 moderate (esbuild), 0 critical
```

Warnings recorded without suppression:

- Vite reports deprecated `esbuild`/`optimizeDeps.esbuildOptions` configuration.
- Vite reports existing static/dynamic import overlap and chunks above 700 kB.
- Vitest/jsdom reports unimplemented canvas and `window.open` methods in tests;
  all tests still pass.
- Rust reports pre-existing dead-code warnings for `opens_overlay` and
  `resolve_manifest`.
- `cargo fmt --check` is not clean because unrelated existing Rust files require
  broad formatting. The new `terminal_snapshot.rs` module was formatted directly;
  unrelated files were not modified.
- `npm ci` reported deprecated unscoped xterm packages and the same two audit
  findings. No automatic dependency upgrade was attempted because package and
  lockfile changes were outside this focused task.

## Security Effects

Positive effects:

- Raw control sequences are not replayed from persisted snapshots.
- Likely secrets are redacted before persistence, including legacy data during
  deserialization.
- Snapshot filenames do not expose project or pane identifiers.
- IPC accepts structured data only, validates schema, size, geometry, controls,
  and identifier lengths, and never accepts a filesystem path.
- Atomic unique-generation writes, file sync, checksums, and fallback preserve a
  last-known-good recovery point.
- Fixed error categories avoid returning persisted terminal content in native
  error messages.
- Bounded retention and shutdown deadlines prevent unbounded disk or exit work.

Residual security limitations:

- Secret detection is heuristic. Arbitrary secrets without recognizable context
  or format can still appear in terminal output. Users should not treat terminal
  snapshots as a credential vault.
- Snapshots are local application data protected by operating-system account and
  filesystem controls; they are not additionally application-encrypted.
- A user can still press Enter on an inert restored safe-shell draft. The app
  never submits it automatically.

## Remaining Risks and Manual Gates

- A terminal process cannot survive a full device reboot. This implementation
  restores the shell, presentation, and eligible inert shell draft; it does not
  resume process memory or a dead TUI process.
- Sudden power loss, forced process termination, or an operating system that
  grants less than the bounded shutdown window cannot be guaranteed. The design
  minimizes the loss window with one-second periodic snapshots and last-known-
  good generations.
- Physical reboot/shutdown, signed updater installation/relaunch, corrupting a
  real app-data generation, and interactive accept/decline confirmation remain
  manual release gates. They were not executed because they alter the machine or
  installed app and require explicit release-environment permission.
- Supabase and Stripe were intentionally untouched. Existing integrations compile
  and the complete frontend suite passes, but no production connectivity test,
  database mutation, webhook delivery, charge, deployment, or secret inspection
  was performed as part of this terminal-only remediation.

## Rollback

1. Close the draft PR without merging, or revert the terminal-persistence commits
   if already integrated.
2. Rebuild the prior application version. Older versions ignore the native
   snapshot directory.
3. If local cleanup is desired, remove the app-data
   `terminal-snapshots/v1` directory or use the explicit pane/project reset paths.
4. No database, Supabase, Stripe, package, or schema rollback is required.

## Coordination and Worktree Incident

All implementation files were locked before editing under agent
`AGENT-20260710-212905-PA1Q`. The isolated worktree contains an unexpected,
unrelated deletion of `install/install.ps1` that was present during the task.
It was never edited, restored, staged, committed, or included in the branch
diff. Every commit used explicit path staging. The deletion remains an unstaged
worktree condition for the workspace owner to resolve independently.
