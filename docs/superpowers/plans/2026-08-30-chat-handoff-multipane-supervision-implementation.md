# Chat Handoff, Multi-Pane Workspace, and Supervision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe editable chat handoffs, a persistent accessible one-to-four-pane chat workspace, and recurring chat supervision with a durable truthful Schedule card and exact schedule-ID navigation.

**Architecture:** Extend the existing chat repositories, `jarvis:send` kernel boundary, Chat surface, and Schedule event authority. New pure modules own typed drag validation, safe transcript projection, workspace layout persistence, canonical chat-to-chat dispatch, supervision bindings, and schedule navigation; existing React surfaces only compose those modules. No new database, message bus, runtime, or scheduler is introduced.

**Tech Stack:** React 18, TypeScript, Zustand, Dexie repositories/live queries, Vitest, Testing Library, Tailwind, existing VibeSpace Schedule runner.

**Spec:** `docs/superpowers/specs/2026-08-30-chat-handoff-multipane-supervision-design.md`

## Global Constraints

- The drag MIME type is exactly `application/x-vibespace-chat`; its versioned payload contains identifiers and display metadata only, never transcript content.
- Dropping on a composer creates one editable, unsent handoff; dropping on the conversation area opens beside the current chat.
- The most recent three calendar days of user-visible history remain complete; only older visible history is condensed.
- Hidden reasoning, secrets or credentials, raw tool payloads, and binary bytes never enter a handoff.
- One chat uses the existing full view, two use equal `50/50` columns, and three or four use a `2x2` grid; a fifth unique chat is rejected.
- Each pane keeps the existing chat/thread/composer/runtime semantics and explicit chat ID.
- Supervision uses the existing Schedule event store and runner, rebuilds a fresh projection for each occurrence, and dispatches through the canonical persisted `jarvis:send` path.
- Scheduled occurrences are idempotent by schedule occurrence ID and fail closed for missing, deleted, inaccessible, or unavailable chats.
- The durable card label is exactly **Schedule made** and displays the persisted command, interval, next run, status, and truthful receipt.
- Exact schedule navigation is by schedule ID, preserves a back target to the originating chat/pane, and never searches by title.
- Ordinary single-chat behavior and ordinary non-supervision schedules remain unchanged.
- Do not edit `app/src/App.tsx`, `app/src/lib/db/schema.ts`, `app/src/lib/db/jarvisMappers*`, credentials, providers, production services, or native processes.
- Do not edit `jarvisSchedules.ts` or `jarvisScheduleRunner.ts` until `VS-SOL-NATIVE-CAO-SCHEDULED-INTEGRATION-20260830` explicitly releases those exact files after its coherent commit.
- Manual acceptance may attach only to an already-running compatible official native VibeSpace WebView; if unavailable, record native acceptance as pending and never use a web preview.

---

### Task 1: Typed chat drag contract and sidebar actions

**Files:**

- Create: `app/src/features/chat/chatDragPayload.ts`
- Create: `app/src/features/chat/chatDragPayload.test.ts`
- Modify: `app/src/components/layout/NavPane.tsx`
- Create: `app/src/components/layout/NavPane.chatHandoff.test.tsx`

**Interfaces:**

- Produces: `VIBESPACE_CHAT_MIME`, `ChatDragPayloadV1`, `writeChatDragPayload(dataTransfer, chat)`, `readChatDragPayload(dataTransfer)`, and `resolveAcceptedChatDrop(input, deps)`.
- Produces: chat-row drag behavior plus keyboard/menu events `vibespace:chat-send-context` and `vibespace:chat-open-beside`, each carrying the same typed identifier-only payload.
- Consumes: `Chat`, `ChatId`, `WorkspaceId`, and `ProjectId` from existing types and `chatRepo.getById` for accepted-drop revalidation.

- [ ] **Step 1: Write the failing drag contract tests**

```ts
expect(writeChatDragPayload(transfer, source)).toEqual({
  version: 1,
  chatId: 'chat-source',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  title: 'Source chat',
});
expect(transfer.getData(VIBESPACE_CHAT_MIME)).not.toContain('transcript');
await expect(
  resolveAcceptedChatDrop({ payload, targetChatId: 'chat-target' }, deps),
).resolves.toMatchObject({ ok: true, chat: source });
await expect(
  resolveAcceptedChatDrop({ payload: forged, targetChatId: 'chat-target' }, deps),
).resolves.toEqual({ ok: false, reason: 'chat_unavailable' });
await expect(
  resolveAcceptedChatDrop({ payload, targetChatId: 'chat-source' }, deps),
).resolves.toEqual({ ok: false, reason: 'same_chat' });
```

Also assert malformed JSON, wrong MIME version, stale ID, inaccessible workspace/project, and forged title are rejected or replaced by canonical repository metadata.

- [ ] **Step 2: Run the test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/chatDragPayload.test.ts`

Expected: FAIL because `./chatDragPayload` does not exist.

- [ ] **Step 3: Implement the minimal typed contract**

```ts
export const VIBESPACE_CHAT_MIME = 'application/x-vibespace-chat';
export type ChatDragPayloadV1 = Readonly<{
  version: 1;
  chatId: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
}>;

export async function resolveAcceptedChatDrop(
  input: { payload: ChatDragPayloadV1; targetChatId: string },
  deps: {
    getChat: (id: ChatId) => Promise<Chat | undefined>;
    canAccess: (source: Chat, target: Chat) => boolean;
  },
): Promise<
  | { ok: true; chat: Chat }
  | { ok: false; reason: 'invalid_payload' | 'same_chat' | 'chat_unavailable' | 'access_denied' }
>;
```

Parse with exact-key/version checks. Re-read source and target chats, compare canonical scope, return canonical title, and never deserialize transcript-shaped fields.

- [ ] **Step 4: Add sidebar drag and keyboard/menu equivalence**

Make each `ChatNavRow` draggable, write only the typed payload in `onDragStart`, and expose buttons/menu items named **Send context to current chat** and **Open beside current chat**. Dispatch the two typed custom events without changing the active chat during drag.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/chat/chatDragPayload.test.ts src/components/layout/NavPane.chatHandoff.test.tsx`

Commit only the four task files with: `feat(chat): add typed chat drag actions`.

---

### Task 2: Safe three-day handoff projection and editable composer draft

**Files:**

- Create: `app/src/features/chat/chatHandoffProjection.ts`
- Create: `app/src/features/chat/chatHandoffProjection.test.ts`
- Create: `app/src/features/chat/ChatHandoffDraftCard.tsx`
- Create: `app/src/features/chat/ChatHandoffDraftCard.test.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Create: `app/src/features/chat/Composer.chatHandoff.test.tsx`
- Modify: `app/src/types/chat.ts`

**Interfaces:**

- Produces: `ChatHandoffProjectionV1`, `projectChatHandoff(input)`, `renderChatHandoffPrompt(projection, instruction)`, and a persisted `Part` variant `{ kind: 'chat_handoff'; handoff: ChatHandoffMessagePartV1 }`.
- Produces: `ChatHandoffDraftCard` with editable instruction, replace-on-unchanged-source behavior, remove control, and accessible status.
- Consumes: canonical `chatRepo`/`messageRepo`, accepted `ChatDragPayloadV1`, and existing Composer send persistence.

- [ ] **Step 1: Write failing projection tests**

Use a fixed local clock of `2026-08-30T12:00:00-05:00`; the recent boundary is local midnight on `2026-08-28`. Assert messages at and after the boundary are emitted in full visible order, while `2026-08-27` and older visible text is represented by a deterministic digest. Assert `reasoning`, raw `tool_call.args`, raw `tool_result.result`, data URLs, binary parts, duplicate streaming fragments, and values matching secret-key/token patterns are absent. Assert safe tool/action summaries contain tool name, status, file paths, decisions, blockers, and results without raw payloads.

```ts
const projection = projectChatHandoff({ sourceChat, messages, now: fixedNow });
expect(projection.recentSections.map((section) => section.messageId)).toEqual([
  'm-boundary',
  'm-today',
]);
expect(projection.recentSections[0].visibleText).toBe(fullBoundaryText);
expect(projection.olderDigest).toContain('Older visible history');
expect(JSON.stringify(projection)).not.toMatch(/chain-of-thought|api_key|data:image|raw-secret/);
```

- [ ] **Step 2: Run the projection test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/chatHandoffProjection.test.ts`

Expected: FAIL because `./chatHandoffProjection` does not exist.

- [ ] **Step 3: Implement the pure projector and renderer**

```ts
export type ChatHandoffProjectionV1 = Readonly<{
  version: 1;
  source: { chatId: string; title: string; workspaceId: string; projectId: string | null };
  snapshotAt: number;
  boundaryMessageId: string | null;
  goal: string | null;
  status: string;
  lastMeaningfulActivity: string | null;
  recentSections: readonly SafeVisibleMessageSection[];
  olderDigest: string;
  summaries: {
    files: readonly string[];
    tools: readonly string[];
    actions: readonly string[];
    decisions: readonly string[];
    blockers: readonly string[];
    results: readonly string[];
  };
}>;
```

Compute the three-day boundary from local calendar midnights. Keep all sanitized recent visible text; for oversized text, split into numbered bounded sections without omitting content. Deduplicate by stable message/part identity. Render a canonical prompt with source reference, snapshot boundary, recent sections, summaries, and older digest.

- [ ] **Step 4: Write failing editable-card and Composer-drop tests**

Assert a valid composer drop resolves the source from repositories, displays source title/status, never sends automatically, lets the user edit the instruction, replaces the pending card when the unchanged source is dropped again, and persists exactly one `chat_handoff` part plus canonical prompt text only after Send. Assert self/stale drops announce the rejection and leave the draft unchanged.

- [ ] **Step 5: Implement the draft card and Composer integration**

Add `pendingHandoff` state beside existing Composer attachments. Handle `VIBESPACE_CHAT_MIME` before existing file/context drops, call `resolveAcceptedChatDrop`, build the projection from canonical repositories, and render `ChatHandoffDraftCard` above the textarea. On Send, append `renderChatHandoffPrompt(...)` to the user-visible text and persist the structured safe `chat_handoff` part. Preserve the card and text when persistence/dispatch fails; clear both only after success.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/chat/chatHandoffProjection.test.ts src/features/chat/ChatHandoffDraftCard.test.tsx src/features/chat/Composer.chatHandoff.test.tsx`

Commit only the seven task files with: `feat(chat): add safe editable handoff drafts`.

---

### Task 3: Persistent accessible one-to-four-pane workspace

**Files:**

- Create: `app/src/features/chat/chatWorkspaceLayout.ts`
- Create: `app/src/features/chat/chatWorkspaceLayout.test.ts`
- Create: `app/src/features/chat/ChatWorkspace.tsx`
- Create: `app/src/features/chat/ChatWorkspace.test.tsx`
- Modify: `app/src/features/chat/ChatView.tsx`
- Create: `app/src/features/chat/ChatView.handoffWorkspace.test.tsx`

**Interfaces:**

- Produces: `ChatWorkspaceLayoutV1`, `loadChatWorkspaceLayout(scope)`, `addChatPane`, `closeChatPane`, `focusChatPane`, `pruneChatWorkspaceLayout`, and `subscribeChatWorkspaceLayout`.
- Produces: `ChatWorkspace`, which renders one existing full-size surface, equal two-column panes, or a two-column/two-row grid.
- Consumes: `ChatThread`, `Composer`, `BrowserGoalStatus`, per-chat engine/status stores, and the sidebar event `vibespace:chat-open-beside`.

- [ ] **Step 1: Write failing pure layout tests**

```ts
expect(addChatPane(onePane, 'chat-2')).toMatchObject({
  chatIds: ['chat-1', 'chat-2'],
  focusedChatId: 'chat-2',
});
expect(layoutClassForPaneCount(2)).toContain('grid-cols-2');
expect(layoutClassForPaneCount(3)).toContain('grid-rows-2');
expect(addChatPane(fourPanes, 'chat-5')).toEqual({ ok: false, reason: 'pane_limit' });
expect(addChatPane(twoPanes, 'chat-1')).toMatchObject({ focusedChatId: 'chat-1' });
expect(closeChatPane({ chatIds: ['a', 'b', 'c'], focusedChatId: 'b' }, 'b').focusedChatId).toBe(
  'c',
);
```

Also cover versioned per-workspace/project persistence, corrupt-state recovery, pruning deleted/inaccessible chats, and preserving one valid primary pane.

- [ ] **Step 2: Run the layout test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/chatWorkspaceLayout.test.ts`

Expected: FAIL because `./chatWorkspaceLayout` does not exist.

- [ ] **Step 3: Implement the pure persisted layout controller**

Use a versioned local setting key scoped by account/workspace/project. Store only ordered chat IDs and focused chat ID. Reject a fifth unique ID, focus duplicates, choose the next pane then previous pane on focused close, and prune against canonical accessible chat IDs. Dispatch one same-document storage event so all mounted Chat surfaces remain synchronized.

- [ ] **Step 4: Write failing React workspace tests**

Assert pane counts/classes for 1, 2, 3, and 4; equal `50/50` columns for two; an empty fourth cell for three; per-pane title/focus/close controls; focus announcements; reduced-motion classes; and independent explicit chat IDs passed to each `ChatThread` and `Composer`. Assert closing a pane does not emit cancellation and a fifth drop announces the limit.

- [ ] **Step 5: Implement `ChatWorkspace` and integrate `ChatView`**

Extract the current single-chat JSX into a small pane renderer bound to an explicit `chatId`. Keep browser-chat behavior per pane. Make the conversation/thread region accept `VIBESPACE_CHAT_MIME` as **Open beside current chat**, while Composer stops propagation and owns handoff insertion. Global active-chat changes replace/focus the primary pane; pane-local focus updates `activeChatId` without changing other pane bindings.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/chat/chatWorkspaceLayout.test.ts src/features/chat/ChatWorkspace.test.tsx src/features/chat/ChatView.handoffWorkspace.test.tsx`

Commit only the six task files with: `feat(chat): add persistent multipane workspace`.

---

### Task 4: Canonical persisted chat-to-chat dispatch

**Files:**

- Create: `app/src/features/chat/chatToChatDispatch.ts`
- Create: `app/src/features/chat/chatToChatDispatch.test.ts`

**Interfaces:**

- Produces: `dispatchChatToChat(input, deps): Promise<ChatToChatDispatchReceipt>` using explicit target chat ID, persisted user message, and existing `jarvis:send` event detail.
- Produces: idempotency by `dispatchKey`, including supervision occurrence IDs.
- Consumes: `chatRepo`, `messageRepo`, safe `ChatHandoffProjectionV1`, existing model/runtime selection readers, and the canonical window dispatch boundary.

- [ ] **Step 1: Write failing canonical dispatch tests**

Assert target/source access is revalidated, the visible user message is persisted before `jarvis:send`, the event uses the exact target chat ID and persisted message ID as cancellation key, persistence failure emits no event, a repeated `dispatchKey` returns the prior receipt without a second message/event, and inaccessible/missing chats fail closed.

```ts
const receipt = await dispatchChatToChat(input, deps);
expect(calls).toEqual(['get-target', 'persist-message', 'dispatch-kernel']);
expect(receipt).toMatchObject({
  status: 'dispatched',
  targetChatId: 'supervisor',
  messageId: 'message-1',
});
```

- [ ] **Step 2: Run the test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/chatToChatDispatch.test.ts`

Expected: FAIL because `./chatToChatDispatch` does not exist.

- [ ] **Step 3: Implement minimal canonical dispatch**

Persist a normal user message with canonical prompt text and safe `chat_handoff` part. Include a stable dispatch marker in the structured part, query existing target messages for that marker before writing, and dispatch the same event contract Composer uses only after persistence succeeds. Do not create a second runtime or call providers directly.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/chat/chatToChatDispatch.test.ts`

Commit only the two task files with: `feat(chat): add canonical chat dispatch service`.

---

### Task 5: Typed supervision binding and existing Schedule runner extension

**Ownership gate:** Begin only after `VS-SOL-NATIVE-CAO-SCHEDULED-INTEGRATION-20260830` records a coherent commit and explicitly transfers `jarvisSchedules.ts`, `jarvisSchedules.test.ts`, `jarvisScheduleRunner.ts`, and `jarvisScheduleRunner.test.ts`. Append those exact files to this agent lock and coordination ledger before editing.

**Files:**

- Create: `app/src/features/schedule/chatSupervision.ts`
- Create: `app/src/features/schedule/chatSupervision.test.ts`
- Modify after handoff: `app/src/features/schedule/jarvisSchedules.ts`
- Modify after handoff: `app/src/features/schedule/jarvisSchedules.test.ts`
- Modify after handoff: `app/src/features/schedule/jarvisScheduleRunner.ts`
- Modify after handoff: `app/src/features/schedule/jarvisScheduleRunner.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleDispatch.ts`
- Create: `app/src/features/schedule/jarvisScheduleDispatch.supervision.test.ts`

**Interfaces:**

- Produces: `ChatSupervisionBindingV1` with `version`, `sourceChatId`, `supervisingChatId`, `originatingMessageId`, `originatingCardMessageId`, `handoffPolicyVersion`, `instruction`, `allowReplyToSource`, and optional end condition.
- Extends: `JarvisScheduleMetadata.chatSupervision?: ChatSupervisionBindingV1` without changing ordinary schedules or CAO behavior.
- Produces: `runChatSupervisionOccurrence(input, deps)` that rebuilds a fresh handoff and calls `dispatchChatToChat` with `dispatchKey = scheduleId + ':' + occurrenceId`.

- [ ] **Step 1: Write failing binding/parser tests**

Assert exact version/key validation, stable IDs, minimum interval enforcement by existing `normalizeJarvisIntervalMs`, explicit reply authorization, and fail-closed malformed metadata. Assert ordinary and CAO metadata round-trip byte-for-byte apart from existing normalization.

- [ ] **Step 2: Run binding tests and capture RED**

Run: `npm --prefix app run test -- --run src/features/schedule/chatSupervision.test.ts src/features/schedule/jarvisSchedules.test.ts`

Expected: FAIL because the binding and metadata field do not exist.

- [ ] **Step 3: Implement the binding and metadata extension**

```ts
export interface ChatSupervisionBindingV1 {
  version: 1;
  sourceChatId: string;
  supervisingChatId: string;
  originatingMessageId: string;
  originatingCardMessageId: string;
  handoffPolicyVersion: 1;
  instruction: string;
  allowReplyToSource: boolean;
  endsAt?: number;
}
```

Parse exact keys and fail closed. Preserve existing `caoSupervision`. `buildJarvisScheduleEventInput` and updates accept the optional binding and serialize it through the existing metadata prefix.

- [ ] **Step 4: Write failing runner tests**

Assert each due occurrence re-reads both chats and messages, creates a fresh projection, includes the previous supervision receipt, dispatches once to the supervising chat, optionally permits a normal visible reply only when `allowReplyToSource` is true, records real outcome/timing/next run, fails closed for missing/inaccessible chats, cancels at the end condition, and is idempotent across retry/reload by occurrence ID. Assert ordinary and CAO schedules retain their existing paths.

- [ ] **Step 5: Implement the runner branch through canonical dispatch**

Branch only when valid `metadata.chatSupervision` exists. Resolve the binding at occurrence time; call `runChatSupervisionOccurrence`; map its receipt into the existing run-history/status/next-run update. Keep the existing claim/release and catch-up authority. Never choose another chat when a bound chat is missing.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/schedule/chatSupervision.test.ts src/features/schedule/jarvisSchedules.test.ts src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleDispatch.supervision.test.ts`

Commit only the eight task files with: `feat(schedule): run recurring chat supervision`.

---

### Task 6: Durable Schedule card and exact-ID navigation

**Files:**

- Create: `app/src/features/chat/SupervisionScheduleCard.tsx`
- Create: `app/src/features/chat/SupervisionScheduleCard.test.tsx`
- Modify: `app/src/features/chat/MessagePart.tsx`
- Create: `app/src/features/chat/MessagePart.supervisionSchedule.test.tsx`
- Modify: `app/src/types/chat.ts`
- Create: `app/src/features/schedule/chatSupervisionNavigation.ts`
- Create: `app/src/features/schedule/chatSupervisionNavigation.test.ts`
- Modify: `app/src/features/schedule/SchedulePage.tsx`
- Create: `app/src/features/schedule/SchedulePage.supervisionNavigation.test.tsx`

**Interfaces:**

- Produces: persisted `Part` variant `{ kind: 'supervision_schedule'; schedule: SupervisionScheduleMessagePartV1 }` whose durable identity is `scheduleId`.
- Produces: `openSupervisionSchedule({ scheduleId, originChatId, originPaneId }, deps)` and `consumePendingScheduleFocus()`.
- Consumes: existing Schedule event live query/repository, `useUIStore.setRoute/setActiveChat`, workspace focus event, and SchedulePage's existing Jarvis inspector/edit controls.

- [ ] **Step 1: Write failing card tests**

Assert the card shows Schedule icon, exact **Schedule made** label, exact persisted instruction preview, source/supervisor titles, recurrence label, next run, and active/paused/failed status in text. Mock live event updates and assert pause/edit/failure/receipt changes update the same card. Assert persistence failure creates no card and no optimistic success.

- [ ] **Step 2: Run the card test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/SupervisionScheduleCard.test.tsx src/features/chat/MessagePart.supervisionSchedule.test.tsx`

Expected: FAIL because the schedule part/card do not exist.

- [ ] **Step 3: Implement the durable part renderer**

Store only schedule ID plus safe creation snapshot in the message part. `SupervisionScheduleCard` uses the exact ID to read the current event and parsed supervision metadata; the live event overrides snapshot status, next run, instruction, and receipt. Missing/deleted records render truthful unavailable/deleted state rather than active.

- [ ] **Step 4: Write failing exact navigation tests**

Assert opening pushes `{ scheduleId, originChatId, originPaneId }`, routes to `schedule`, opens the exact event even when two titles match, scrolls/focuses `[data-schedule-id="..."]` and its command/timing controls, and a `popstate` restoration returns to the origin chat and pane. Assert unknown IDs announce not found without focusing another schedule.

- [ ] **Step 5: Implement navigation and SchedulePage focus**

Use an exact versioned history/session payload, not a title or query search. Add `data-schedule-id={String(event.id)}` to the canonical schedule row/inspector. On SchedulePage mount/event hydration, consume the exact focus request, call the existing open/edit handler for that row, then `scrollIntoView({ block: 'center' })` and focus the heading/command control. Register one back-state handler that restores `activeChatId`, routes to chat, and emits workspace focus for `originPaneId`.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm --prefix app run test -- --run src/features/chat/SupervisionScheduleCard.test.tsx src/features/chat/MessagePart.supervisionSchedule.test.tsx src/features/schedule/chatSupervisionNavigation.test.ts src/features/schedule/SchedulePage.supervisionNavigation.test.tsx`

Commit only the nine task files with: `feat(schedule): add chat schedule card deep link`.

---

### Task 7: Schedule creation flow, accessibility, and regression verification

**Files:**

- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/chat/ChatHandoffDraftCard.tsx`
- Modify: `app/src/features/chat/ChatWorkspace.tsx`
- Modify: `app/src/components/layout/NavPane.tsx`
- Modify: focused tests from Tasks 1–6 only when a new failing acceptance assertion requires it.

**Interfaces:**

- Consumes: the existing Schedule creation repository/API, `ChatSupervisionBindingV1`, `dispatchChatToChat`, durable schedule part, workspace controller, and sidebar keyboard actions.
- Produces: natural-language supervision schedule creation from a sent handoff with explicit confirmation and persisted-card posting only after the Schedule event exists.

- [ ] **Step 1: Write the failing integration test**

Drive a sent handoff through **Create supervision schedule**, enter `Every 30 minutes for 4 hours; review progress and send guidance back`, and assert the created Schedule record has the exact source/supervisor IDs, 30-minute interval, end condition, reply authorization, and originating message/card IDs. Assert the card is persisted after event creation and opens that exact ID. Cover cancellation and event persistence failure.

- [ ] **Step 2: Run the integration test and capture RED**

Run: `npm --prefix app run test -- --run src/features/chat/Composer.chatHandoff.test.tsx src/features/chat/ChatWorkspace.test.tsx src/features/schedule/SchedulePage.supervisionNavigation.test.tsx`

Expected: FAIL because the end-to-end creation action is not wired.

- [ ] **Step 3: Implement the minimal creation flow**

Expose the creation control only for a persisted handoff reference. Parse natural-language recurrence through existing Schedule helpers, require the existing minimum interval, show the exact instruction/binding for confirmation, persist the Schedule event, then append/update the originating chat message with one `supervision_schedule` part. Do not show **Schedule made** before both persisted IDs exist.

- [ ] **Step 4: Add accessibility assertions**

Assert drag-over/focus states, source/destination/action/pane-count/rejection announcements, keyboard/menu equivalence, labeled pane close/focus controls, schedule status and next-run text independent of color/icon, readable compact panes, and reduced-motion behavior.

- [ ] **Step 5: Run focused and full verification**

Run:

```text
npm --prefix app run test -- --run src/features/chat/chatDragPayload.test.ts src/features/chat/chatHandoffProjection.test.ts src/features/chat/chatWorkspaceLayout.test.ts src/features/chat/chatToChatDispatch.test.ts src/features/chat/ChatHandoffDraftCard.test.tsx src/features/chat/ChatWorkspace.test.tsx src/features/chat/SupervisionScheduleCard.test.tsx src/features/chat/Composer.chatHandoff.test.tsx src/features/chat/ChatView.handoffWorkspace.test.tsx src/features/chat/MessagePart.supervisionSchedule.test.tsx src/components/layout/NavPane.chatHandoff.test.tsx src/features/schedule/chatSupervision.test.ts src/features/schedule/chatSupervisionNavigation.test.ts src/features/schedule/jarvisScheduleDispatch.supervision.test.ts src/features/schedule/SchedulePage.supervisionNavigation.test.tsx
npm run typecheck
npm --prefix app run test
npm run test:release-manifest
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Also run `npx prettier --check` on every owned TypeScript/TSX/Markdown file, `git diff --check`, and scoped secret scanning if available. Record unrelated concurrent failures by exact file without editing them.

- [ ] **Step 6: Official native acceptance when an existing compatible lane is free**

Attach Playwright only to the already-running official native VibeSpace WebView after recording process/profile/source identity. Verify drag, keyboard handoff, editable non-auto-send, 2/3/4 panes, fifth-pane rejection, independent chat streaming, schedule creation/card update, exact-ID focus, and back restoration. Do not start, stop, rebuild, restart, replace, or control the app while another native tester owns it. If no compatible app/lane exists, record native acceptance as pending.

- [ ] **Step 7: Commit final integration**

Commit only owned integration/test files with: `feat(chat): complete handoff supervision workspace`.

---

## Plan self-review record

- Spec coverage maps drag/keyboard actions to Task 1; safe complete recent history and editable handoff to Task 2; all pane/persistence/focus behavior to Task 3; canonical dispatch/idempotency to Task 4; Schedule binding/fresh-run/fail-closed behavior to Task 5; durable card/exact-ID/back navigation to Task 6; and end-to-end creation/accessibility/full/native verification to Task 7.
- The only blocked product files are explicitly gated in Task 5; every earlier task is independently testable and commit-safe without them.
- Interface names and versions are consistent across tasks: `ChatHandoffProjectionV1`, `ChatSupervisionBindingV1`, `dispatchChatToChat`, `scheduleId`, `occurrenceId`, and policy version `1`.
- Placeholder scan found no incomplete implementation markers or unspecified code steps.
