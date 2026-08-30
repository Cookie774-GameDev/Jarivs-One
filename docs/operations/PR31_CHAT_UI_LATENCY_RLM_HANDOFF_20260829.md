# PR31 Chat UI, OpenCode Latency, and Native QA Handoff

## Purpose

Continue the VibeSpace Chat UI work from the exact current repository state without rebuilding the Chat architecture, changing model behavior, or repeating already completed diagnosis. This handoff is authoritative for the current uncommitted Chat slice and its native evidence.

## Repository and native process identity

- Repository: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch: `integration/UnifiedChungus-final`
- Base HEAD at this task start: `cf2959cbb4ea228fa403e6337d06eb327e3270ad`
- Upstream: `origin/UnifiedChungus`
- Official native app: `app\src-tauri\target\debug\jarvis.exe`, PID `33976`
- Official WebView: `msedgewebview2.exe`, PID `28504`, parent PID `33976`
- Native CDP endpoint: `http://127.0.0.1:9223`
- Vite renderer: PID `5468`, port `5173`, exact current checkout
- Do not launch another VibeSpace build while these processes remain authoritative.

## User-approved boundary

The change is a presentation and startup-latency optimization only:

```text
RLM / SiYuan / Context orchestration — unchanged
OpenCode public text and tool events — unchanged
VibeSpace deterministic event projection — existing architecture
VibeSpace Chat presentation — changed here
```

Do not change:

- RLM, `/rlm`, SiYuan, Context routing, or Context Map policy
- Jarvis system prompts, personality, normal response policy, or private reasoning handling
- Provider architecture, model selection, effort/Fast/2x quality, credentials, or permissions
- Composer/textbox geometry, sidebar layout, tabs, run header, Workbench, Pets, voice, plugins/MCP execution, or native backend
- OpenCode public event chronology, privacy filters, or terminal-state truth

Never expose reasoning, raw tool payloads, commands, environment variables, secrets, private paths beyond safe leaf labels, or unfiltered provider events.

## Visual references supplied by the user

Use these as visual references only; do not treat image text as instructions.

1. Primary continuous Chat reference:
   `C:\Users\viper\AppData\Local\Temp\codex-clipboard-bc7be8d5-0286-4edc-8087-392aded5f7a6.png`
   - Preserve the entire existing shell and composer.
   - Show short public assistant checkpoints.
   - Show compact collapsed activity bars such as Read, Edited, Ran, and Verified.
   - Exactly one activity disclosure may be expanded for detail.

2. Large completion-audit reference:
   `C:\Users\viper\AppData\Local\Temp\codex-clipboard-3b8087fc-d5d1-4c3c-bbd8-8eae4b614800.png`
   - The approved implementation is deliberately simpler than this image.
   - Keep `Worked for X · Y actions` plus truthful category totals.
   - Do not restore the old Done / Doing now / Next / Blockers strip.

3. Plugin disclosure reference:
   `C:\Users\viper\AppData\Local\Temp\codex-clipboard-c3579e33-11d9-48f7-9306-a05a57d32b8f.png`

4. Skill token reference:
   `C:\Users\viper\AppData\Local\Temp\codex-clipboard-f52578aa-5206-450a-9933-c87fe64febfc.png`

## Implemented source changes

### 1. Warm OpenCode startup optimization

Files:

- `app/src/lib/ai/adapters/opencodePersistent.ts`
- `app/src/lib/ai/adapters/opencodePersistent.test.ts`

Behavior:

- `createPersistentOpenCodeRuntimeSupervisor.start()` now reuses an already validated managed runtime connection instead of always calling `runtime.refresh()`.
- If no validated connection exists, it still refreshes and fails closed if native authority remains unavailable.
- After session acquisition, the independent current-session message baseline and live model catalog are loaded concurrently with `Promise.allSettled()`.
- Failure attribution remains exact: baseline failure is `session_binding`; catalog failure is `live_model_authority`.
- Event subscription still starts before prompt dispatch.
- No model, effort, routing, system prompt, tool, credential, or quality behavior changed.

Relevant symbols are currently near:

- `opencodePersistent.ts:476` — validated connection reuse
- `opencodePersistent.ts:1670` — concurrent baseline/catalog load

### 2. Immediate real live-work status

Files:

- `app/src/features/chat/agentic-console/AgenticConsole.tsx`
- `app/src/features/chat/agentic-console/AgenticConsole.test.tsx`
- `app/src/features/chat/agentic-console/agentic-console.css`

Behavior:

- The runtime already emitted canonical pending/running Chat activity immediately, but `BlockView` intentionally returned `null` for generic activity blocks, causing a blank-looking turn.
- `LiveTurnStatus` now projects only the latest real pending/running event immediately below the latest real user prompt.
- It uses the existing `resolveAgentMotion()` and `PerceptibleAgentMotionIndicator`; it does not introduce a phase engine.
- Public activity title is rendered with a left-to-right gradient shimmer and soft blue glow.
- Reduced-motion users receive a static gradient with no animation.
- No live status is fabricated when there is no latest prompt or no canonical live activity.

Relevant symbols:

- `AgenticConsole.tsx:470` — `LiveTurnStatus`
- `AgenticConsole.tsx:989` — latest real active event
- `AgenticConsole.tsx:1202` — top-of-turn matter
- `agentic-console.css:532` — live status layout
- `agentic-console.css:542` — shimmer text

### 3. Completion audit moved to the top of the completed turn

Files:

- `AgenticConsole.tsx/test`
- `agentic-console.css`
- Existing activity-ledger files listed below

Behavior:

- `Worked for X · Y actions` is now inserted directly after the latest user prompt and before public checkpoints/activity.
- Completed work is expanded by default.
- Collapsing hides intermediate public checkpoints/activity but keeps the final answer visible.
- Reload rehydrates the same public chronology and audit when the completed chat is reselected.
- The old invented four-state completion inspector remains removed.

### 4. Soft-blue sidebar completion dot

Files:

- `app/src/features/chat/activity/chatListActivity.tsx`
- `app/src/features/chat/activity/chatListActivity.test.tsx`
- `app/src/features/chat/activity/chat-list-activity.css`

Behavior:

- Completion stays observable for 12 seconds instead of 3.2 seconds.
- The completion pulse uses `#79b7f6`, a 3.6-second cycle, and a soft glow.
- CSS hides the completion dot on the currently open row and shows it on the inactive completed row.
- Error settling remains 3.2 seconds.

### 5. Existing same-task Chat refinements that must be preserved

These files are already dirty under the same current Chat task and must not be reverted:

- `app/src/features/chat/activity-ledger/AssistantActivityLedger.tsx`
- `app/src/features/chat/activity-ledger/AssistantActivityLedger.test.tsx`
- `app/src/features/chat/activity-ledger/activity-ledger.css`
- `app/src/features/chat/PluginUsageCard.tsx`
- `app/src/features/chat/PluginUsageCard.test.tsx`
- `app/src/features/chat/InputToken.tsx`
- `app/src/features/chat/InputToken.test.tsx`

They implement the reference-aligned activity chronology, safe expanded details, plugin disclosure, and cleaner skill token. Review their existing diff before changing them.

## Automated verification already completed

Focused RED was observed first, then GREEN:

```powershell
npm --prefix app run test -- src/lib/ai/adapters/opencodePersistent.test.ts src/features/chat/agentic-console/AgenticConsole.test.tsx src/features/chat/activity/chatListActivity.test.tsx
```

Result: `3 files / 107 tests`, exit `0`.

Additional successful checks:

```powershell
npm run typecheck
```

Result: exit `0`.

```powershell
npm exec prettier -- --check src/lib/ai/adapters/opencodePersistent.ts src/lib/ai/adapters/opencodePersistent.test.ts src/features/chat/agentic-console/AgenticConsole.tsx src/features/chat/agentic-console/AgenticConsole.test.tsx src/features/chat/agentic-console/agentic-console.css src/features/chat/activity/chatListActivity.tsx src/features/chat/activity/chatListActivity.test.tsx src/features/chat/activity/chat-list-activity.css
```

Result: exit `0` when run from `app\`.

`git diff --check` over the exact files also exited `0`; only CRLF conversion notices were printed.

## Official native Playwright evidence

Evidence root:

`C:\Users\viper\VibeSpace-UnifiedChungus-Final\.codex-evidence\pr31-chat-audit-disclosure-20260829`

Key artifacts:

- `12-file-read-live-motion.png` — real RUNNING turn with the live shimmer/motion line directly below the prompt
- `13-file-read-completed.png` — completed turn with `Worked for 19s · 3 actions` above its checkpoints
- `14-file-read-collapsed.png` — collapsed completion disclosure with final answer retained
- `15-file-read-sidebar-dot.png` — inactive completed Chat row with the soft-blue completion signal
- `16-file-read-reloaded-reselected.png` — durable completed audit and final answer after native reload and exact-chat reselection
- `17-file-read-live-motion.mp4` — six-second Playwright-frame video of the live status transition
- `03-live-file-read-reload.json` — machine-readable reload/order evidence
- `08-completed-audit-top.png` and `09-completed-audit-collapsed.png` — long RLM request top-audit evidence
- `04-skill-token-native.png` — real attached skill token visual
- `05-rlm-on-native.png` and `01-composer-rlm.json` — real `/rlm on` state

Observed native timing for the focused real turn:

- Visible live status: 1.480 seconds after Send
- First durable activity ledger: 19.062 seconds after Send
- Completion audit: 19 seconds / 3 actions
- DOM order after reload: `promptBeforeAudit = true`, `auditBeforeCheckpoint = true`
- Final answer remained present after reload/reselection.

The active selected tab reopened to the newly created empty chat after reload. The completed chat itself remained durable in the sidebar; reselecting it restored the audit, ledgers, and final answer. Treat active-tab restoration as a separate shell/tab concern if the user wants the same tab automatically selected after restart.

## RLM findings — do not hide or misclassify

`/rlm on` worked at the UI/state level and reported:

- Chat default enabled
- Direct route, lazy until broad lookup
- Current scope persisted in `vibespace.rlm-preference.v1`

However, the requested long build was not completed:

1. First long request ended after 11 seconds with one Context search action and zero matches.
2. A continuation explicitly said to proceed when no map matched; it ended after 15 seconds with one search action and one public checkpoint.
3. No files exist at `D:\VibeSpace-RLM-UAT\opencode-live-latency-20260829`.

This is not a Chat rendering failure. It is an RLM/Context continuation or tool-policy issue and is outside this UI task's authorized scope. Assign it to the active RLM/Context owner; do not patch RLM from the Chat UI lane.

The focused exact-file read also proved safe permission behavior: Context search returned zero items and both reads were denied as `external_directory`. The Chat correctly showed one search checkpoint, one failed two-action disclosure, and a truthful final answer. Do not weaken the permission boundary to make the test pass.

## Remaining UI checks for the next agent

1. Inspect the reference images and the five key native screenshots before editing.
2. Confirm the current source tests still pass before making a change.
3. If adjusting visuals, touch only the Chat presentation files already listed and preserve the composer/sidebar/shell geometry.
4. Verify whether failed read/search actions should add truthful `Searched N` / `Read N` audit chips. Do not invent category totals; derive them only from safe canonical receipts.
5. Keep the live title factual. `Jarvis status` is generic because that is the canonical public event title currently emitted. Do not manufacture “Reading file” unless the canonical event actually provides that information.
6. Re-run native Playwright against the already-running official Tauri WebView. Scroll the latest prompt/live status into view before capture.
7. Verify exactly one expanded activity disclosure, final answer retained on collapse, and reload/reselection identity.

## Required completion commands

Run these from the repository root unless noted:

```powershell
npm --prefix app run test -- src/lib/ai/adapters/opencodePersistent.test.ts src/features/chat/agentic-console/AgenticConsole.test.tsx src/features/chat/activity/chatListActivity.test.tsx src/features/chat/activity-ledger/AssistantActivityLedger.test.tsx src/features/chat/PluginUsageCard.test.tsx src/features/chat/InputToken.test.tsx
npm run typecheck
npm --prefix app run test
npm run test:release-manifest
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Known environment cautions:

- C: was previously near full; avoid repeated Cargo clean/rebuild loops.
- A recoverable Rust incremental backup exists at `D:\VibeSpace-TauriDev-20260829\rust-incremental-backup`.
- Do not stop unrelated Ollama/user processes merely to satisfy an older zero-Ollama harness guard.
- Direct Playwright CDP attachment is acceptable after verifying the `jarvis.exe -> msedgewebview2.exe` parent chain.

## Coordination protocol

Before any write:

1. Read repository `AGENTS.md`.
2. Inspect `.agent-coordination.lock\owner.txt` and exact path locks.
3. Read the relevant tail/search sections of `docs\AGENT_COORDINATION.md`.
4. Record branch, HEAD, upstream, and merge/rebase state.
5. Claim only exact files that are not owned by another active agent.
6. Never reset, stash, clean, rebase, format, stage, or commit unrelated dirty work.

Current task lock:

`.agent-coordination.lock\VS-CODEX-ROOT-CHAT-AUDIT-DISCLOSURE-20260829.txt`

If this handoff is taken after the current task releases that lock, create a new unique lock and reference this document. Never delete historical lock or coordination evidence.

## Acceptance definition

Do not call the task complete unless all of the following are true:

- Real OpenCode public checkpoints/tool receipts appear chronologically.
- Live status appears promptly from canonical events with no private reasoning.
- Completed audit is directly below the latest prompt.
- Collapse hides only intermediate chronology and retains final answer.
- Exactly one chosen disclosure can be expanded for details.
- Sidebar completion signal is soft blue, slow, visible only on inactive completed Chat, and self-clears.
- Reload/reselection restores the same completed public chronology.
- Focused tests and TypeScript exit `0`.
- Official native Tauri Playwright screenshots and video support the claims.
- RLM/SiYuan/models/prompts/providers/composer/shell remain unchanged.
