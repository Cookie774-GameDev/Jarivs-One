# Jarvis Intelligence and Workflow Design

## Scope

Repair the connected Agent editor, clarification, context, file, planning,
approval, command, and response workflows without redesigning VibeSpace or
changing unrelated integrations. Production data, authentication, billing,
Stripe, Supabase deployment, and release infrastructure are out of scope.

## Design Principles

- Keep existing UI components and persistence backends.
- Put deterministic safety policy around model output instead of relying on
  prompt wording alone.
- Resolve context once into a bounded typed object and reuse it throughout a
  request.
- Bind plans, approvals, and executions with stable identifiers so approval is
  idempotent and auditable.
- Never report a file or command as complete until the underlying operation
  reports success.
- Preserve edits and task state when persistence or execution fails.

## Request Pipeline

```text
user message
  -> bounded context resolution
  -> deterministic intent and policy classification
  -> clarification decision (zero to three questions)
  -> optional visible implementation plan
  -> one scoped approval
  -> capability-validated action execution
  -> persisted result and concise response
```

The model may propose structured intent, questions, plans, and actions, but
deterministic validators enforce question counts, destination precedence,
collision safety, approval requirements, and capability availability.

## Agent Editor

The editor owns an immutable normalized baseline and a mutable draft. Dirty
state is a stable field-by-field comparison covering every supported editable
field. Save has explicit idle, saving, saved, and error states. A failed save
keeps the draft and permits retry. Successful persistence replaces the
baseline. Duplicate submission is blocked, Ctrl+S follows the same save path,
and switching or reverting with unsaved changes requires an explicit choice.

## Clarification Workflow

Clarification uses the existing question-card presentation. The parser and
controller enforce one to three questions, exactly three preset options, and a
custom response. Answers remain structured, persist with the original task,
and trigger one continuation event. Read-only preparation may continue while
waiting; mutations and command execution may not.

## Context and Destinations

A `ResolvedJarvisContext` contains the active project, project path, current
working directory, recent task, relevant bounded files, enabled capabilities,
and source reasons. Destination precedence is:

1. Current request.
2. Active selected project.
3. Current conversation or task destination.
4. Relevant Context Map project.
5. Saved conversation preference.
6. Current working project.
7. Configured Jarvis `Projects` directory.
8. Clarification only when still ambiguous.

Old preferences never override current instructions. Greetings use only a
small cached context summary and never scan the full project.

## File Safety

File intent is explicitly create, edit, append, replace, folder-create, or
project-create. Type inference uses explicit type first, then active project
conventions, then a controlled extension list. Paths must be absolute after
resolution and contained by an allowed destination. Creates check existence
before writing and never silently overwrite or redirect content into another
file. Writes use the existing native filesystem path and surface useful errors.

## Plans and Approvals

Greetings, informational answers, summaries, translations, and read-only
inspection do not produce implementation plans. Mutating multi-step work gets
one visible plan and one scoped approval. An approved immutable plan may execute
only once. A new approval is required only for material scope or risk changes.

## Command Execution

Command proposals include the exact command, working directory, purpose, and
risk. PowerShell commands are passed as command bodies without unsafe nested
string interpolation. Queue entries have stable execution IDs and lifecycle
states: queued, starting, running, complete, failed, cancelled, or timed out.
Approval success means accepted for execution, not command completion. Actual
PTY lifecycle events determine the final status. Duplicate approvals are
idempotent and long-running servers remain running until cancelled.

## Security and Performance

- Treat conversation, terminal, and file content as untrusted context.
- Never include secrets, command output, file contents, or sensitive paths in
  production telemetry.
- Validate allowed paths, action capabilities, and approval scope before side
  effects.
- Bound context size, cache project summaries with invalidation, and avoid a
  second model request when structured output is already sufficient.
- Record development timings only for policy-stage durations and sanitized IDs.

## Compatibility and Rollback

No schema migration or external-service contract is required. Existing message
parts remain readable; new optional fields must have safe defaults. Rollback is
performed by reverting the focused commits in reverse order. The protected
dirty checkout is never used for staging or commits.
