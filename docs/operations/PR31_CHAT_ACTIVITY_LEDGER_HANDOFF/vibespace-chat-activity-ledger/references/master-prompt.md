# Master implementation prompt — VibeSpace Jarvis activity ledger

Use this prompt together with:

- `../assets/01-collapsed-continuous-response.png` — authority for the live, compact, continuous-response presentation.
- `../assets/02-expanded-activity-inspector.png` — authority for the expanded activity inspector and scalable detail layout.
- `design-spec.md` — the complete interaction, data, performance, accessibility, and acceptance contract.

## Role and objective

You are implementing a narrowly scoped presentation upgrade for the VibeSpace native Tauri chat experience on PR #31. Convert Jarvis's existing streamed progress/tool evidence into a compact Codex-style activity ledger inside each assistant turn while retaining VibeSpace's warm visual language and every existing execution system.

This is not a chat redesign, backend rewrite, provider change, or new agent runtime. The task is to present truth already emitted by the existing OpenCode/provider activity stream more clearly and compactly.

The finished experience must let a user understand a short task or an eight-hour `/goal` run without seeing thousands of repetitive rows:

1. Jarvis writes a brief natural progress sentence at meaningful phase boundaries.
2. Directly beneath that sentence, one compact disclosure shows live aggregate counts.
3. The counts increase while the same turn runs.
4. Expanding the disclosure shows bounded, searchable details for reads, searches, edited files, and verified checks.
5. Command contents are never displayed. Show only `Running command` or `Ran command`, status, count, and optionally duration.
6. At the end of a phase or after a reasonable interval, Jarvis provides one concise audit sentence describing what was completed and what is next.
7. At terminal completion, the turn may show total elapsed time, total actions, subagents used, input tokens, output tokens, and final category totals.

## Non-negotiable scope boundaries

Change only the rendering, aggregation, and lightweight frontend projection needed for the assistant-turn activity ledger.

Do not change or replace:

- the composer/text box, its size, placement, attachments, keyboard behavior, or focus;
- the model picker, provider picker, connection disclosure, reasoning-effort picker, or exact route truth;
- Agent mode, `/goal`, slash commands, approval controls, access controls, or send/stop controls;
- OpenCode session creation, provider dispatch, tool execution, permissions, retries, context selection, subagent orchestration, or persistence authority;
- backend protocols, Tauri commands, Cloudflare, Supabase, Stripe, billing, credentials, or production services;
- message provenance or historical assistant content;
- the existing context/thinking/subagent/tool/responding animations and VFX.

Do not add a second event source, fabricated timer, fake action count, speculative audit text, or parallel local authority. Use the existing authenticated live activity/event stream and its existing persisted evidence. If a required field is genuinely unavailable, render it as unavailable or omit it and document the gap; never invent it.

Do not repeatedly print `Jarvis One`, `Jarvis`, an avatar, or a full message header for every progress phase. Treat the work as one continuous assistant response. A single assistant identity at the turn boundary is sufficient.

## Required discovery before editing

Follow the repository `AGENTS.md`, current locks, and coordination ledger. Inventory and document before changing code:

1. The component that renders the assistant turn and the existing context/thinking/subagent/tool/responding activity animations.
2. The source of OpenCode progress messages and tool/activity events.
3. Existing activity event types, timestamps, status, file paths, verification evidence, token usage, and subagent identity.
4. Existing file-preview/open-file command and its canonical-path/authorization boundary.
5. Existing message persistence and restoration behavior for long-running goals.
6. Existing token usage source and whether values are exact provider usage or estimates.
7. Existing tests that protect Composer, model selection, route truth, approvals, animations, and historical provenance.

Reuse those systems. Do not infer that a mockup field is available merely because it appears in a reference image.

## Target interaction

### One continuous assistant turn

A turn should read like this:

> I mapped the workspace and reviewed the critical configuration; next I’m tracing the execution path.

Below that sentence, show one compact live disclosure, conceptually:

`Activity · 18,492 actions  |  Read 12,840  |  Searched 3,216  |  Ran 428 commands  |  Edited 37 files  |  Verified 14 checks  |  Subagents 3  |  In ≈1.2M  |  Out ≈84K`

The row must wrap or horizontally adapt at narrow widths without altering the composer or surrounding shell. Counts update in place rather than appending a new status row for every event.

While work is active, preserve the existing VFX adjacent to the current progress sentence or disclosure. Its truthful states remain Context, Thinking, Coordinating subagents, Using tools, and Responding. Do not reproduce or replace the animation; compose around the existing component.

### Audit cadence

Use progress messages already emitted by OpenCode/Jarvis. Render a single concise audit sentence only when one of these occurs:

- the current phase closes and another begins;
- the provider emits a meaningful progress update;
- a bounded quiet interval has elapsed and there is materially new evidence;
- the turn becomes blocked, fails, is cancelled, or completes.

Do not emit audits for every tool call. Do not create a chatty fixed timer. Coalesce near-duplicate updates. A preferred sentence shape is:

> I finished mapping the workspace and reviewing its critical configuration; next I’m tracing the execution path.

The sentence should state evidence, not hidden chain-of-thought. Never expose private reasoning or fabricate a conclusion from counters alone.

### Collapsed activity row

During an active phase, elapsed time is optional. Do not repeat `Worked for …` on every phase.

The collapsed row must provide:

- disclosure chevron and accessible name;
- live aggregate total actions;
- unique files read;
- searches performed;
- commands started/completed, without command text;
- unique files edited;
- verified checks;
- unique subagents used;
- input and output tokens, marked exact or estimated;
- running/completed/failed/cancelled state.

Counts must be monotonic within a turn except when correcting a clearly invalid duplicate event, and restored historical counts must not restart from zero.

### Expanded inspector

Reference 02 controls this state. Expansion occurs inline beneath the same activity row; it must not replace the chat, navigate away, or cover the composer.

Provide category tabs or a compact category list for:

- All;
- Read files;
- Searches;
- Commands;
- Edited files;
- Verified checks;
- Subagents;
- Usage.

Details:

- Read files: sanitized path, optional size, timestamp/status if already available. Clicking a file uses VibeSpace's existing authorized file previewer.
- Searches: sanitized scope and query summary only when already safe and available; never reveal secret-bearing input.
- Commands: show `Running command` or `Ran command`, status, count, and optional duration. Do not display command text, arguments, environment, stdout, stderr, or secret material.
- Edited files: sanitized path and status. Clicking uses the existing authorized file previewer.
- Verified checks: truthful check label, result, and timestamp when available. Do not relabel an unverified command as a check.
- Subagents: count and existing safe identity/status disclosure only; do not expose hidden prompts or internal chain-of-thought.
- Usage: input/output tokens and source quality (`Exact` or `Estimated`).

The expanded panel must have a bounded default height, internal scrolling or virtualization, and an accessible resize handle. It may show the first/recent items with `Show more`; it must never mount thousands of DOM rows at once.

### Completed/overnight summary

At terminal completion, show one durable summary for the entire turn:

`Worked for 8h 03m · 236,114 actions`

Include final aggregates for reads, searches, commands, edited files, verified checks, subagents used, input tokens, and output tokens. Mark token values as estimated unless the provider supplied authoritative usage.

Below it, show a restrained completion audit:

- Done — one concise sentence;
- Next — one concise sentence only when relevant;
- Blockers — only when a real blocker exists.

Do not show `Doing now` after terminal completion. Do not claim success when the underlying turn failed or was cancelled.

## Truthful aggregation contract

Use an explicit frontend projection over the existing event stream. The recommended semantic counters are:

- `actionsTotal`: normalized activity events accepted for this turn;
- `filesReadUnique`: unique canonical/sanitized file identities with a completed read receipt;
- `searchesTotal`: completed search operations;
- `commandsTotal`: command operations, irrespective of hidden command contents;
- `filesEditedUnique`: unique files with confirmed edit/write receipts;
- `verifiedChecksTotal`: explicit successful verification/test/check receipts only;
- `subagentsUsedUnique`: distinct subagent executions attached to this turn;
- `inputTokens` and `outputTokens`: exact usage when provider supplied; otherwise clearly estimated;
- `startedAt`, `completedAt`, and `elapsedMs`: derive from authoritative turn/event timestamps, not a timer persisted as truth.

Define and test event identity/deduplication. Replayed, reconnected, or restored events must not double-count. Do not count a requested action as completed until its status proves completion. Do not treat a file search result as a file read. Do not count an edited file as verified without explicit evidence.

## Lightweight performance contract

The feature must remain smooth for short chats and multi-hour `/goal` runs:

- update aggregate counters in O(1) or amortized O(1) per event;
- batch high-frequency visual updates, targeting at most one visible counter commit per animation frame and preferably a 100–250 ms coalescing window for large streams;
- isolate the activity projection so updates do not rerender the composer, model picker, entire sidebar, or historical messages;
- use stable selectors/memoization and avoid cloning the complete activity collection on every event;
- virtualize or page expanded details;
- use bounded detail retention when the existing persisted log cannot page historical entries, while preserving truthful totals and clearly stating when only recent details are retained;
- unsubscribe listeners and cancel scheduled updates on turn/chat teardown;
- preserve scroll anchoring: do not yank a user to the bottom while they inspect older detail;
- do not store raw command bodies, stdout/stderr, secrets, or redundant message text merely for this UI.

No new backend, database, polling loop, local ingestion authority, or production service is authorized for this feature.

## Visual and accessibility contract

- Preserve the current VibeSpace theme tokens, typography, sidebar, tabs, composer, and surrounding layout.
- Use Codex-like information hierarchy, not Codex colors or branding.
- Prefer prose plus one disclosure over stacked status cards.
- Keep borders quiet and spacing comfortable; compact does not mean tiny.
- Use the existing VFX with reduced-motion support.
- Disclosure must support Enter/Space, Escape behavior where applicable, `aria-expanded`, labelled counts, and visible focus.
- Tabs/listbox/filter/resize controls must be keyboard reachable.
- Announce meaningful status changes without announcing every counter tick.
- Provide non-color status cues and sufficient contrast in light, warm, monochrome, and reduced-motion modes.

## Required implementation sequence

1. Claim exact non-overlapping files. Do not edit Composer/model-picker/OpenCode/backend files unless discovery proves a minimal frontend adapter is necessary and no active owner overlaps it.
2. Record a source-to-view mapping of every displayed counter and detail field.
3. Add failing tests for aggregation identity, deduplication, state transitions, token labelling, privacy redaction, and large-volume bounded rendering.
4. Build a pure activity projection/selector before changing presentation.
5. Implement the collapsed disclosure inside the existing assistant turn.
6. Implement the bounded expanded inspector and existing file-preview integration.
7. Integrate the current VFX component without changing its state machine.
8. Preserve current OpenCode progress sentences; add no prompt modification unless an observed route truly supplies no suitable progress signal. If a prompt change is unavoidable, isolate it, prove it does not request chain-of-thought, and keep the audit to one evidence-based sentence.
9. Run focused and regression tests, then verify in the official native Tauri VibeSpace app only.

## Acceptance tests

Automated coverage must prove at minimum:

1. One continuous assistant turn does not repeat `Jarvis One` for every phase.
2. A stream containing thousands of events updates truthful aggregates without thousands of mounted rows.
3. Replayed event IDs do not double-count.
4. A read, search result, edit, command, check, and subagent event map to only their intended counters.
5. In-progress command detail never reveals command text.
6. File rows open through the existing authorized VibeSpace previewer and no new file authority.
7. Exact usage is labelled exact; fallback usage is labelled estimated; unavailable usage is not shown as zero.
8. Completed elapsed time derives from authoritative timestamps and survives restoration.
9. Failed/cancelled turns never render a successful completion audit.
10. Existing Composer, attachments, model picker, effort picker, agent mode, send/stop, approvals, route truth, scroll behavior, and VFX tests remain green.
11. Expanded details are keyboard accessible, resizable, bounded, and virtualized/paged.
12. High-frequency events do not cause full-chat/composer rerenders.

Native acceptance must use the official VibeSpace Tauri app and include:

- a short ordinary Chat turn;
- a tool-heavy turn with multiple reads/searches/commands/edits/checks;
- a subagent turn showing the existing coordinating animation;
- a restored or long-running `/goal` fixture with large counts;
- collapse/expand/filter/resize and file-preview navigation;
- light/warm, monochrome, reduced-motion, keyboard, and narrow-window checks;
- confirmation that Composer/model/agent/send controls are pixel/behavior unchanged outside the assistant transcript.

## Delivery requirements

Report:

- the exact existing event sources reused;
- the exact counter definitions and deduplication keys;
- exact files changed and why;
- tests and performance measurements;
- native evidence;
- any field that remains unavailable;
- confirmation that no backend, provider dispatch, composer, model picker, agent mode, controls, animation state machine, production service, or credential path changed.

Do not claim completion until the native app demonstrates truthful live increments, scalable expansion, final long-run summary, and unchanged protected controls.
