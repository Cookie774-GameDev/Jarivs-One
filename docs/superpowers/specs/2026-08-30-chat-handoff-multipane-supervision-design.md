# Chat Handoff, Multi-Pane Workspace, and Supervision Design

**Status:** Approved interaction design; written specification awaiting review

**Date:** 2026-08-30

**Owner:** VS-CODEX-CHAT-HANDOFF-MULTIPANE-20260830-32

**Product:** VibeSpace native desktop app

## Outcome

VibeSpace users can drag a chat onto another chat to transfer useful working context, place chats side by side in one workspace, and configure one chat to supervise another on a recurring schedule. The feature extends the existing chat runtime and Schedule system. It does not create a parallel chat transport, scheduler, agent runtime, or persistence authority.

## User experience

### Drag source

Each chat row in the VibeSpace sidebar is draggable. The drag preview identifies the chat by title and uses a typed internal payload containing only stable identifiers and display metadata. Transcript content is never serialized into the browser drag payload; it is resolved from the local repository when the drop is accepted.

Keyboard users receive equivalent actions from a chat-row menu: **Send context to current chat** and **Open beside current chat**.

### Drop on a composer

Dropping a source chat on another chat's composer inserts one editable handoff card into the target draft. It does not send automatically. The card shows:

- source chat title and current goal;
- current run/status and last meaningful activity;
- the complete user-visible transcript from the most recent three calendar days;
- concise file, tool, action, decision, blocker, and result summaries;
- an optimized digest of visible history older than three days;
- a stable source-chat reference used for later supervision.

The package excludes hidden chain-of-thought or private reasoning, secrets and credentials, raw internal tool payloads, binary bytes, and duplicate streaming fragments. Oversized recent text remains semantically complete through bounded sections or locally referenced overflow rather than silently disappearing. The user may edit the accompanying instruction before sending.

Dropping a chat onto itself is rejected with a small explanatory status. Repeated drops of the same unchanged source replace the pending handoff rather than duplicating it.

### Drop on the conversation area

Dropping a source chat on the output/thread area adds it to the current chat workspace:

- one chat uses the existing full-size view;
- two chats use equal 50/50 columns;
- three chats use a responsive 2x2 grid with the final cell empty;
- four chats use a full 2x2 grid;
- a fifth unique chat is rejected with a clear four-chat limit message.

Each pane is the existing chat surface bound to its own chat ID: independent transcript, streaming output, composer, model, agent, status, and actions. Pane chrome adds only a compact title, focus indicator, and close control. Closing the focused pane moves focus predictably to the next remaining pane. Adding an already-open chat focuses it without duplication.

The layout scales spacing and secondary labels at smaller pane widths, while preserving readable typography, minimum composer height, accessible controls, and existing VibeSpace theme tokens. It does not change provider, model, chat, or runtime semantics. Layout state is stored per workspace/project and pruned when referenced chats no longer exist.

### Supervision schedule

After a handoff is sent, the receiving chat can create a recurring supervision schedule in natural language, including intervals such as every 30 minutes and an optional duration or end condition. The existing VibeSpace Schedule authority validates and persists the recurrence. The minimum interval and all current permission, cancellation, retry, and receipt rules remain authoritative.

Each scheduled occurrence:

1. resolves the current source and supervising chat IDs;
2. rebuilds a fresh safe handoff snapshot using the same three-day boundary;
3. wakes the supervising chat through the canonical chat/kernel dispatch path;
4. supplies the scheduled instruction, new source progress, and the previous supervision receipt;
5. allows the supervising chat to send a normal user-visible message back to the source chat only when the scheduled instruction authorizes that behavior;
6. records the real outcome, timing, next run, and failure receipt through the existing Schedule system.

A missing, deleted, inaccessible, or currently unavailable chat fails closed. The run reports the reason and never guesses progress or silently targets a replacement chat.

## Schedule card and deep link

Creating a supervision schedule posts a durable, user-visible Schedule card in the chat where it was created. The card includes:

- Schedule icon and **Schedule made** label;
- exact command/instruction preview;
- source and supervising chat titles;
- recurrence interval, next run, and active/paused/failed status;
- last truthful receipt when one exists;
- an **Open schedule** action.

Selecting the card navigates to the Schedule page and opens the exact persisted schedule record, scrolled/focused on its exact command and timing controls. The route carries the schedule ID, not a title search, so renamed or similarly named schedules cannot open the wrong record. Browser history/back navigation returns to the originating chat and pane. Pausing, editing, deleting, or completing the schedule updates the same card through the existing schedule store; no optimistic success is shown before persistence succeeds.

## Architecture

### Typed drag contract

A versioned `application/x-vibespace-chat` payload carries `chatId`, source workspace/project IDs, title, and schema version. Drop acceptance revalidates the chat from the local repository, confirms scope access, and ignores forged or stale display metadata.

### Handoff projection

A pure handoff projector reads canonical chat/message repositories, sanitizes visible parts, groups tool outcomes without raw payloads, applies the three-day boundary, and emits a structured handoff model. A renderer converts that model to the editable composer attachment and canonical prompt text. Stable source-message IDs provide deterministic deduplication.

### Multi-pane layout

The normal Chat view owns a small layout controller containing an ordered set of at most four unique chat IDs and the focused pane ID. It composes existing chat/thread/composer primitives rather than duplicating runtime behavior. Global navigation changes the focused primary pane; pane-local interactions retain their bound chat IDs.

### Chat-to-chat dispatch

Handoff and supervision messages use one shared service that persists the visible user message using the existing message repository and dispatches through the canonical `jarvis:send`/kernel boundary with the explicit target chat ID. It must never dispatch an unpersisted ghost message or bypass approvals.

### Schedule extension

The existing schedule record gains a typed, versioned supervision binding containing source chat ID, supervising chat ID, originating message/card ID, and handoff policy version. The existing runner resolves the binding at occurrence time and calls the shared handoff/dispatch service. Ordinary schedules remain unchanged.

## Failure and concurrency behavior

- Dragging while a chat streams does not interrupt that chat.
- A snapshot records a consistent message boundary; later activity appears on the next scheduled run.
- Simultaneous panes may stream independently because every event and persistence write remains chat-ID scoped.
- Closing a pane does not cancel its run.
- A schedule occurrence is idempotent by schedule occurrence ID and cannot post duplicate supervision messages after retry or reload.
- Composer drops never auto-send; scheduled sends occur only after explicit schedule creation and persisted authorization.
- Cross-workspace handoff is allowed only when both chats are locally accessible to the same account and the target project policy permits it.

## Accessibility and visual behavior

- Drop zones gain visible focus and drag-over states using existing VibeSpace tokens.
- Announcements identify the source chat, destination, action, pane count, and rejection reason.
- All drag operations have menu/keyboard equivalents.
- Schedule cards expose status and next-run text without relying on icon or color alone.
- Reduced-motion mode removes layout flourish but preserves structural feedback.

## Verification contract

Automated coverage must prove:

- typed payload validation, stale-reference rejection, and self-drop behavior;
- composer versus thread hit testing;
- three-day full-history boundary and older optimized digest;
- sanitization of reasoning, secrets, raw tool payloads, and binary content;
- deterministic handoff deduplication and editable composer behavior;
- one/two/three/four-pane layouts, fifth-pane rejection, persistence, pruning, focus, and independent streaming;
- schedule creation from chat, exact recurrence and target binding, fresh snapshot per run, authorized reply, fail-closed missing chat, idempotent retry, and cancellation;
- durable Schedule card status and exact schedule-ID navigation/focus;
- keyboard and screen-reader equivalents;
- no regression to ordinary single-chat and ordinary non-supervision schedules.

Focused tests and the repository-required typecheck, app tests, release-manifest test, build, and Rust check run before completion. Product/manual acceptance must use Playwright attached to the existing official native VibeSpace WebView without starting, restarting, rebuilding, stopping, or replacing the app unless the user later authorizes that lifecycle action. If the compatible official app is unavailable, automated source verification completes and native acceptance remains explicitly pending rather than using a web preview.

## Non-goals

- No new agent type or implicit subagent creation.
- No autonomous schedule creation without the user's chat instruction and visible confirmation.
- No raw private reasoning or secret transfer.
- No fifth pane, arbitrary tiling, detached windows, or provider/runtime rewrite.
- No second scheduler, message bus, chat database, or success state detached from persisted truth.

## Decision record

The chosen approach extends VibeSpace's existing drag/drop, chat dispatch, and Schedule authorities. A static-only transcript paste would not support ongoing supervision, while a new peer daemon would duplicate core runtime and persistence behavior. Recent visible history remains complete for three days; only older multi-day overflow is optimized into a digest. The user approved this architecture and additionally required a visible in-chat Schedule card that deep-links to the exact schedule command and time.
