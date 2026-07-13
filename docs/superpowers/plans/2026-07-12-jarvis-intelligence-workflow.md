# Jarvis Intelligence and Workflow Implementation Plan

## Phase 1: Agent Editor Reliability

- Add normalized draft snapshots for all supported editable Agent fields.
- Add explicit validation and save lifecycle state.
- Add duplicate-submit protection, Ctrl+S, retry, revert, and unsaved-switch
  handling.
- Characterize persistence success and failure with component tests.

## Phase 2: Typed Request, Context, and File Policy

- Add a typed intent classifier with deterministic safeguards.
- Add bounded resolved context and destination precedence.
- Add controlled file-type inference and create/edit operation types.
- Add allowed-root validation, existence checks, and no-overwrite behavior.
- Connect policies to existing runtime, Context Map, project store, and native
  filesystem actions.

## Phase 3: Clarification, Plan, and Approval Orchestration

- Enforce one to three questions and three presets plus custom input.
- Persist answers and continue the original task exactly once.
- Classify requests before showing Plan Mode cards.
- Bind approved plans and permissions to immutable IDs and idempotent execution.
- Preserve existing card appearance and interaction patterns.

## Phase 4: Command Lifecycle and Concise Responses

- Validate PowerShell command payloads and working directories.
- Link action approval, terminal queue, PTY lifecycle, cancellation, timeout,
  streaming output, and final status.
- Prevent duplicate execution and distinguish queued from completed.
- Inject concise capability and response policies without repetitive prompts.

## Phase 5: Verification and Delivery

- Run targeted Agent, question, context, file, plan, approval, command, and
  response tests.
- Run the complete frontend test suite, typecheck, lint when configured,
  production build, affected Rust tests, Tauri build, and Windows app smoke
  tests.
- Record failures and skipped checks exactly; do not push while required checks
  fail.
- Inspect the complete staged diff before each focused detached-HEAD commit.
- Fetch and rebase on the latest `origin/main`, rerun verification, and push
  normally with `git push origin HEAD:main` only after all release gates pass.

## File Ownership

Each phase updates the Grok coordination ledger before editing additional
files. Pixel Pets, installer, billing, Supabase, Stripe, authentication,
release, and unrelated UI files remain excluded.

## Rollback

Revert each focused commit from newest to oldest, rerun the affected tests, and
push normally. Never reset or clean the protected local checkout.
