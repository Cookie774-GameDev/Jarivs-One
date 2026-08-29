# VibeSpace Instant Command Bus + Fast Local Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatch deterministic VibeSpace voice/control commands without a routing LLM, with Smart EOU local voice targeting P50 <=175 ms / P90 <=275 ms / P95 <=350 ms while preserving `send it`, fixed-pause hands-free, long dictation, permissions, and the user-selected LLM.

**Architecture:** Introduce an Instant Command Bus that wraps the existing deterministic Assistant parser/executor and adds targeted terminal/agent commands. Live terminal messages use a direct session transport instead of waiting for the Terminal UI route; Smart EOU uses an optional local fast-voice runtime, while normal model-backed work begins only after dispatch.

**Tech Stack:** Tauri 2 + Rust, React/TypeScript/Vite, Zustand, portable-pty/ConPTY, existing Jarvis voice services, Moonshine Voice local streaming, optional NVIDIA Parakeet Realtime EOU via pinned `parakeet.cpp`, Vitest, Rust tests, Playwright/native acceptance scripts.

**Spec:** `docs/superpowers/specs/2026-08-29-instant-command-bus-fast-local-voice-design.md`

## Global Constraints

- Worktree/branch: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`, `integration/UnifiedChungus-final` unless the owner explicitly changes it.
- Before editing any claimed file, read `.agent-coordination.lock`; never overwrite another active agent’s work.
- `app/src/features/voice/JarvisVoiceInputService.ts` and related Voice files are currently claimed by `VS-CODEX-JARVIS-COMMS-VOICE-20260822`; obtain a handoff/release before touching them.
- Do not change normal chat model selection, effort, Fast mode, RLM behavior, billing, auth, Context semantics, terminal rendering, or agent briefing semantics.
- Do not bypass existing permission/approval gates.
- No routing LLM or network dependency is allowed **before deterministic dispatch acknowledgement**. After dispatch, the user-selected target provider/model may use its normal network path to perform the actual task.
- Do not bundle Moonshine/Parakeet model weights in the base installer; use pinned on-demand packs with SHA-256 verification.
- Preserve existing `send it`/custom commit phrase, cancel phrase, and fixed-pause behavior.
- Terminal Dictation Mode must never auto-submit; explicit Command Mode submits exactly once.
- Every task follows TDD: failing focused test -> minimal implementation -> focused pass -> broader gate -> commit only owned files.

---

## Planned file ownership map

**Create — Instant Command core**
- `app/src/features/instant-command/types.ts` — closed command/result contracts.
- `app/src/features/instant-command/parse.ts` — deterministic parsing + compatibility adapter to existing Assistant intents.
- `app/src/features/instant-command/execute.ts` — bus executor; no model calls.
- `app/src/features/instant-command/targetContext.ts` — bounded `this terminal` / last-explicit-target context.
- `app/src/features/instant-command/terminalTargetResolver.ts` — exact terminal/agent/provider selector resolution.
- `app/src/features/instant-command/terminalDispatch.ts` — direct live-session dispatch and exactly-once submit.
- Adjacent `.test.ts` files for every module above.

**Create — live terminal identity**
- `app/src/features/terminals/terminalSessionRegistry.ts` + test — persistent metadata reconciled with native `terminal_list`.

**Create — fast local voice**
- `app/src/features/voice-fast/contracts.ts` + test — engine/session/EOU protocol.
- `app/src/features/voice-fast/modelManifest.ts` + test — pinned optional runtime/model packs + hashes.
- `app/src/features/voice-fast/FastLocalVoiceService.ts` + test — frontend session lifecycle.
- `app/src-tauri/src/fast_voice.rs` + Rust tests — sidecar lifecycle/event bridge; no raw-audio persistence.

**Modify — existing integrations**
- `app/src/features/assistant/AssistantBar.tsx`, `commands.ts`.
- `app/src/features/voice/voiceConversation.ts`, `voiceTurnCommit.ts`, `VoiceModal.tsx`, `JarvisVoiceInputService.ts` after lock handoff.
- `app/src/features/settings/sections/Voice.tsx`, `app/src/stores/auth.ts`.
- `app/src/features/terminals/TerminalView.tsx`, `terminalRefs.ts`; keep `terminalCommandQueue.ts` for spawn/durable work.
- `app/src-tauri/src/lib.rs` to register fast-voice commands/events.
- `scripts/pr31-instant-command-latency.mjs` + test and focused native/Playwright acceptance coverage.

---

### Task 1: Define the Instant Command contracts and legacy compatibility adapter

**Files:**
- Create: `app/src/features/instant-command/types.ts`
- Create: `app/src/features/instant-command/parse.ts`
- Create: `app/src/features/instant-command/parse.test.ts`
- Read/reuse: `app/src/features/assistant/intents.ts`, `app/src/features/assistant/parse.ts`

**Interfaces:**
- Produces: `parseInstantCommand(input: string): InstantCommand | null`.
- Produces: `InstantCommand` with `legacy`, `terminal-message`, `terminal-broadcast`, `agent-message`, and `open-agent-cli` variants.
- Consumes later: terminal target resolver and executor.

- [ ] **Step 1: Write failing contract/parser tests**

```ts
expect(parseInstantCommand('open 3 terminals with opencode')).toMatchObject({ kind: 'legacy' });
expect(parseInstantCommand('Codex, audit auth and run the tests')).toMatchObject({
  kind: 'agent-message', target: { provider: 'codex' }, payload: 'audit auth and run the tests'
});
expect(parseInstantCommand('message terminal 3: run npm test')).toMatchObject({
  kind: 'terminal-message', target: { ordinal: 3 }, payload: 'run npm test'
});
expect(parseInstantCommand('explain quantum tunneling')).toBeNull();
```

- [ ] **Step 2: Run `npx vitest run src/features/instant-command/parse.test.ts` and verify FAIL because the module does not exist.**
- [ ] **Step 3: Implement the closed command types and parser.** New explicit target grammars run before the legacy adapter; only non-`unknown` Assistant intents become `legacy` commands.

```ts
export type TerminalSelector = Readonly<{
  ordinal?: number;
  sessionId?: string;
  label?: string;
  agentSlug?: string;
  provider?: string;
  scope?: 'one' | 'all';
}>;

export type InstantCommand =
  | { kind: 'legacy'; intent: AssistantIntent }
  | { kind: 'terminal-message'; target: TerminalSelector; payload: string }
  | { kind: 'terminal-broadcast'; target: TerminalSelector; payload: string }
  | { kind: 'agent-message'; target: TerminalSelector; payload: string }
  | { kind: 'open-agent-cli'; provider: string; count: number };
```

`parseInstantCommand` must normalize filler prefixes but must not lowercase/alter the forwarded payload. Bound one-line payload length to 32,768 characters and reject NUL/control characters other than normal spaces/tabs.

- [ ] **Step 4: Add negative tests** for bare prose, ambiguous “message him” without target context, empty payloads, ordinal 0, >10 open terminals, control characters, and phrases containing provider names that are not commands.
- [ ] **Step 5: Run focused tests; expected PASS.**
- [ ] **Step 6: Run existing `src/features/assistant/parse.test.ts`; expected PASS unchanged.**
- [ ] **Step 7: Commit only Task 1 files:** `feat: add instant command contracts and parser`.

---
### Task 2: Expand deterministic command vocabulary without touching normal chat routing

**Files:**
- Modify: `app/src/features/instant-command/parse.ts`, `parse.test.ts`
- Create: `app/src/features/instant-command/targetContext.ts`, `targetContext.test.ts`
- Modify: `app/src/features/assistant/commands.ts`
- Modify only if needed for legacy aliases: `app/src/features/assistant/parse.ts`, `parse.test.ts`

**Interfaces:**
- Produces: `InstantTargetContext` with only `focusedTerminal` and `lastExplicitTarget` for the current interaction/session.
- `parseInstantCommand(input, context?)` resolves pronoun forms only when context is unambiguous.

- [ ] **Step 1: Add failing table-driven parser tests** covering at least these exact forms:

```text
open codex
open claude
open opencode
open llm
message terminal 3: run npm test
tell terminal 3 to run npm test
Codex, review the updater
tell OpenCode to fix the RLM tests
tell all terminals to run git status
tell all Codex terminals to inspect regressions
create schedule release review friday at 1pm
message him: continue the audit
message this terminal: continue
```

`open llm` must open the existing model/provider selection surface; it must not guess a provider. `message him` succeeds only after a single explicit target has been established in the same active interaction context.

- [ ] **Step 2: Run focused tests and verify the new forms FAIL before implementation.**
- [ ] **Step 3: Add a small provider/CLI alias table** inside the Instant Command parser (`opencode`, `codex`, `claude`, `claude code`, `gemini`, `cursor`, plus aliases already supported by VibeSpace). Do not hardcode a model ID; these aliases identify the harness/terminal target only.

- [ ] **Step 4: Implement bounded target context.** It must be session-memory only and must clear when the voice modal/Assistant command interaction ends.

```ts
export interface InstantTargetContext {
  focusedTerminal?: TerminalSelector;
  lastExplicitTarget?: TerminalSelector;
}

export function resolveContextualTarget(
  token: 'this-terminal' | 'last-target',
  context: InstantTargetContext,
): TerminalSelector | null;
```

- [ ] **Step 5: Preserve original payload casing/content.** Parse routing words from a normalized copy, then slice the payload from the original string so a task containing paths, flags, or capitalization is not corrupted.
- [ ] **Step 6: Add false-positive tests:** `codex is useful`, `tell me about codex`, `schedule algorithms explained`, and ordinary questions must return `null` unless they match an existing explicit Assistant command.
- [ ] **Step 7: Update `JARVIS_COMMAND_CATALOG` with user-visible examples** for targeted message/broadcast/open-LLM/schedule forms; do not remove existing commands.
- [ ] **Step 8: Run Instant Command + existing Assistant parser tests; expected PASS.**
- [ ] **Step 9: Commit:** `feat: expand deterministic Jarvis command vocabulary`.

---
### Task 3: Build a live terminal session registry that survives WebView reloads

**Files:**
- Create: `app/src/features/terminals/terminalSessionRegistry.ts`
- Create: `app/src/features/terminals/terminalSessionRegistry.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx` at the existing spawn/attach/registerSession lifecycle only
- Read/reuse: `app/src/features/terminals/terminalLiveCache.ts`, `transcriptStore.ts`, `terminalRefs.ts`

**Interfaces:**
- Produces: `registerTerminalSessionMetadata`, `removeTerminalSessionMetadata`, `reconcileTerminalSessionRegistry`, `listTerminalSessionMetadata`.
- Native reconciliation consumes existing `invoke('terminal_list')` output; no Rust `TerminalInfo` schema change is required for the first implementation.

- [ ] **Step 1: Write failing registry tests.**

```ts
registerTerminalSessionMetadata({
  sessionId: 'tty_1', paneId: 'pane_1', projectId: 'project-a',
  label: 'Codex', agentSlug: 'reviewer', startupCommand: 'codex', updatedAt: 100
});
expect(listTerminalSessionMetadata()).toHaveLength(1);
reconcileTerminalSessionRegistry([{ sessionId: 'tty_2' }]);
expect(listTerminalSessionMetadata()).toEqual([]);
```

Also test duplicate replacement, corrupted localStorage, stale session pruning, 100-entry hard cap, and no transcript/output persistence in this registry.

- [ ] **Step 2: Run focused test and verify FAIL before implementation.**
- [ ] **Step 3: Implement a versioned localStorage record** under `vibespace.terminal-session-registry.v1`; store metadata only, never terminal output or task payloads.
- [ ] **Step 4: Wire `TerminalView` registration at the existing lifecycle boundaries.** After successful `terminal_spawn` or reattach, record current `sessionId`, `paneId`, `projectId`, display name/label, `agentSlug`, and `startupCommand`; remove on confirmed terminal exit/close, not on route unmount.
- [ ] **Step 5: Add reconciliation helper** that calls native `terminal_list`, keeps metadata only for session IDs native Rust still owns, and returns an ordered target snapshot for the current project.

```ts
export type LiveTerminalTarget = Readonly<{
  sessionId: string;
  paneId?: string;
  projectId?: string | null;
  ordinal: number;
  label?: string;
  agentSlug?: string | null;
  startupCommand?: string;
}>;
```

Ordinal is pane-order within the current project when pane metadata is available; otherwise use stable `startedAt/sessionId` ordering and mark the result non-visual so ambiguous ordinal references fail closed.

- [ ] **Step 6: Test the WebView-reload contract:** seed registry with `tty_1`, mock `terminal_list` containing `tty_1`, reconcile, and verify identity survives without spawning a new PTY.
- [ ] **Step 7: Run `terminalSessionRegistry.test.ts` plus existing `TerminalView.execution.test.tsx`; expected PASS.**
- [ ] **Step 8: Commit:** `feat: reconcile live terminal session identity`.

---
### Task 4: Resolve terminal targets deterministically and add the direct live-session fast path

**Files:**
- Create: `app/src/features/instant-command/terminalTargetResolver.ts`, `.test.ts`
- Create: `app/src/features/instant-command/terminalDispatch.ts`, `.test.ts`
- Create: `app/src/features/instant-command/terminalInputAdapters.ts`, `.test.ts`
- Modify: `app/src/features/terminals/terminalSessionRegistry.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx` only to publish bounded readiness/interaction metadata
- Reuse: `app/src/features/terminals/agentPromptDelivery.ts::detectInteractiveAgentCli`
- Reuse: `app/src/features/terminals/terminalCommandFoundation.ts::TerminalPromptEvidence`
- Reuse: existing Rust `terminal_write`; do not change it in this task.

**Interfaces:**
- Produces: `resolveTerminalTarget(selector, targets): TargetResolution`.
- Produces: `dispatchTerminalMessage(target, payload, invokeFn?): Promise<InstantDispatchReceipt>`.

- [ ] **Step 1: Write failing resolution tests** for exact session/pane, ordinal, provider/startup command, label, agent slug, all-provider broadcast, missing target, and two equally named Codex panes.

```ts
expect(resolveTerminalTarget({ ordinal: 2 }, targets)).toMatchObject({ kind: 'one', target: targets[1] });
expect(resolveTerminalTarget({ provider: 'codex' }, twoCodexTargets)).toMatchObject({ kind: 'ambiguous' });
expect(resolveTerminalTarget({ provider: 'codex', scope: 'all' }, twoCodexTargets)).toMatchObject({ kind: 'many' });
```

- [ ] **Step 2: Add explicit input state to registry metadata:** `shell-ready | agent-ready | agent-busy-steerable | approval | question | password | ssh | unsafe | unknown`. Build a closed `TerminalInputAdapter` registry for the supported local shell plus OpenCode, Codex, and Claude Code. The shell adapter may report `shell-ready` only from existing verified prompt evidence. Agent adapters may report `agent-ready` / `agent-busy-steerable` only from bounded provider-specific runtime/screen evidence covered by fixtures for the exact supported CLI versions; never infer readiness from free-form model prose. Generic/unknown full-screen programs remain `unsafe`/`unknown`.
- [ ] **Step 3: Write failing input-adapter/direct-dispatch tests** that assert: a verified shell prompt and an explicitly ready supported agent receive exactly `{ sessionId, data: payload + '\r' }`; an existing trailing `\r/\n` is not duplicated; approval/question/password/SSH/unsafe/unknown states never receive a task payload; and a provider version without a proven adapter fails locally as `target_not_ready` instead of guessing.
- [ ] **Step 4: Verify tests fail before implementation.**
- [ ] **Step 5: Implement resolver precedence:** exact `sessionId` -> exact `paneId` -> current-project ordinal -> exact label/agent/provider -> unique case-insensitive partial label. Never choose the first result when >1 candidate remains.
- [ ] **Step 6: Implement direct dispatch.** For an already-live target whose `TerminalInputAdapter` returns a submit-safe state (`shell-ready`, `agent-ready`, or a provider-version-tested `agent-busy-steerable`), invoke Rust immediately. For every other input state, perform **no write** and return the typed local result (`target_not_ready`, `approval_pending`, `question_pending`, or `unsafe_target`). Do not enqueue a `target:'refs'` item and do not navigate to the Terminal route merely to make an effect fire.

```ts
await invokeFn('terminal_write', {
  sessionId: target.sessionId,
  data: payload.endsWith('\r') || payload.endsWith('\n') ? payload : `${payload}\r`,
});
```

Return a receipt containing only `dispatchId`, target IDs, command kind, timestamps, and result code; never copy the payload into telemetry.

- [ ] **Step 7: Preserve queue semantics for non-live work.** Opening a new terminal, fleet/swarm, durable scheduled commands, and canonical cancellable startup continue through `terminalCommandQueue.ts`; the fast path is only for already-owned live sessions.
- [ ] **Step 8: Add a regression test proving direct dispatch works while the Terminal route is unmounted** by mocking `terminal_write` and never mounting `TerminalsPage`.
- [ ] **Step 9: Run resolver/dispatch/registry/TerminalView focused tests; expected PASS.**
- [ ] **Step 10: Commit:** `feat: add direct live terminal command dispatch`.

---
### Task 5: Implement the bus executor and move Jarvis Assistant Bar onto it

**Files:**
- Create: `app/src/features/instant-command/execute.ts`, `execute.test.ts`
- Modify: `app/src/features/assistant/AssistantBar.tsx`
- Reuse unchanged: `app/src/features/assistant/execute.ts` for `legacy` commands
- Reuse: `terminalCommandQueue.ts` for new terminal spawn/open commands

**Interfaces:**
- Produces: `executeInstantCommand(command, context): Promise<InstantCommandResult>`.
- `legacy` delegates to `executeIntent`; targeted live messages delegate to `terminalDispatch`; spawn/open CLI delegates to the current queue.

- [ ] **Step 1: Write failing executor tests.**

```ts
await executeInstantCommand({
  kind: 'agent-message', target: { provider: 'codex' }, payload: 'audit auth'
}, context);
expect(terminalWrite).toHaveBeenCalledTimes(1);
expect(modelFetch).not.toHaveBeenCalled();
```

Also assert a missing target returns `{ ok:false, code:'target_not_found' }`, two Codex targets return `target_ambiguous`, and `open-agent-cli` enqueues a new terminal without invoking an AI API.

- [ ] **Step 2: Run focused test and verify FAIL.**
- [ ] **Step 3: Implement executor with no imports from AI provider/generation modules.** Add a test-time dependency seam for `executeIntent`, terminal resolver/dispatch, queue enqueue, and UI navigation so network-free behavior is provable.
- [ ] **Step 4: For `open llm`, open the existing model/provider chooser surface** rather than choosing a model. If the app exposes only provider settings globally, route there; do not introduce a second model picker.
- [ ] **Step 5: Switch `AssistantBar` preview/execute to `parseInstantCommand` + `executeInstantCommand`.** Preserve recents/toasts and keep existing legacy previews where possible.
- [ ] **Step 6: Add an explicit regression test proving ordinary Chat Composer send is untouched.** Do not import or call Instant Command parsing from the normal chat send path in this project.
- [ ] **Step 7: Add deterministic scheduling aliases through the existing Assistant schedule parser** rather than duplicating date/time parsing.
- [ ] **Step 8: Run Instant Command executor, AssistantBar, Assistant parser/executor tests; expected PASS.**
- [ ] **Step 9: Commit:** `feat: route Jarvis assistant through instant command bus`.

**Acceptance for Tasks 1–5:** typed commands work with the Terminal page closed, no LLM is invoked, existing commands still work, new targeted commands either resolve exactly or fail locally.

---
### Task 6: Fix the terminal voice inconsistency by making Dictation vs Command semantics explicit

**Files:**
- Create: `app/src/features/terminals/terminalVoiceInput.ts`, `.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx` around the current `createSelectedSttSession({ onFinal })` block
- Modify: `app/src/features/instant-command/terminalDispatch.ts` to use the same command-submit helper

**Root cause being fixed:** current terminal STT intentionally calls `terminal_write` with `` `${spoken} ` ``. That is correct for dictation, but it cannot be reused for the explicit Jarvis command path because it never submits.

- [ ] **Step 1: Write failing tests for both modes.**

```ts
expect(formatTerminalVoiceWrite('fix auth', 'dictation')).toBe('fix auth ');
expect(formatTerminalVoiceWrite('fix auth', 'command')).toBe('fix auth\r');
expect(formatTerminalVoiceWrite('fix auth\r', 'command')).toBe('fix auth\r');
```

- [ ] **Step 2: Add an exactly-once Command Mode test** proving repeated command-finalization callbacks with the same `utteranceId` cause one command submission, not two. Ordinary Dictation Mode keeps its existing streaming/final insertion behavior and does not require an utterance ID.
- [ ] **Step 3: Implement `formatTerminalVoiceWrite` and a tiny `TerminalVoiceWriteMode = 'dictation' | 'command'` contract.** Do not infer mode from text contents.
- [ ] **Step 4: Keep the existing terminal mic wired to `dictation`.** This must preserve current behavior byte-for-byte for normal terminal voice typing.
- [ ] **Step 5: Wire Instant Command terminal execution to `command`.** It must never go through the terminal mic’s dictation handler.
- [ ] **Step 6: Run `terminalVoiceInput.test.ts`, existing `TerminalView.execution.test.tsx`, and Instant Command dispatch tests; expected PASS.**
- [ ] **Step 7: Commit:** `fix: separate terminal voice dictation from command submit`.

---
### Task 7: Upgrade hands-free turn settings to Phrase / Smart EOU / Fixed Pause

**Files:**
- Modify: `app/src/features/voice/voiceConversation.ts`, `.test.ts`
- Modify: `app/src/stores/auth.ts`, `auth.test.ts`
- Modify: `app/src/features/settings/sections/Voice.tsx`, `Voice.test.tsx`
- Read/reuse: `app/src/features/voice/voiceTurnCommit.ts` — do not remove commit/cancel phrase behavior

**Interfaces:**
- Replace `VoiceEndTrigger = 'phrase' | 'silence'` with `VoiceEndTrigger = 'phrase' | 'smart-eou' | 'fixed-pause'`.
- Persisted legacy `'silence'` migrates to `'fixed-pause'` during auth-store rehydration.

- [ ] **Step 1: Write failing pure/store migration tests.**

```ts
expect(migrateVoiceEndTrigger('phrase')).toBe('phrase');
expect(migrateVoiceEndTrigger('silence')).toBe('fixed-pause');
expect(migrateVoiceEndTrigger('smart-eou')).toBe('smart-eou');
```

Assert `send it` default/custom phrase is unchanged after rehydrate and `voiceSilenceDelayMs` is retained even when Smart EOU is selected.

- [ ] **Step 2: Run voiceConversation/auth tests and verify FAIL.**
- [ ] **Step 3: Implement migration and pure timing policy.** Smart EOU must not schedule a fixed auto-send timer; `voiceListenTimeoutMs` remains only the no-speech safety timeout. Fixed Pause uses `voiceSilenceDelayMs`. Phrase waits for commit phrase.
- [ ] **Step 4: Update Settings UI to three choices:** “Say a phrase”, “Smart auto-send (local)”, “Fixed pause”. Mark Smart EOU recommended, but do not silently change an existing user’s selection.
- [ ] **Step 5: Show the pause slider only for Fixed Pause.** Keep commit-phrase input only for Phrase; keep cancel phrase available.
- [ ] **Step 6: Update settings tests** to prove all three choices render, selecting each calls `setVoiceEndTrigger` with the exact enum value, and legacy `'silence'` never appears as a selectable value.
- [ ] **Step 7: Run `voiceConversation.test.ts`, `auth.test.ts`, and `Voice.test.tsx`; expected PASS.**
- [ ] **Step 8: Commit:** `feat: add smart eou hands free mode`.

**Migration contract:** existing phrase users remain phrase users; existing silence users become Fixed Pause with their exact saved delay. Smart EOU is opt-in until the local fast-voice pack is installed and qualified on that machine.

---
### Task 8: Add the free/local Moonshine Smart EOU runtime as an optional pack

**Files:**
- Create: `app/src/features/voice-fast/contracts.ts`, `contracts.test.ts`
- Create: `app/src/features/voice-fast/modelManifest.ts`, `modelManifest.test.ts`
- Create: `app/src/features/voice-fast/FastLocalVoiceService.ts`, `FastLocalVoiceService.test.ts`
- Create: `app/src-tauri/src/fast_voice.rs`
- Modify: `app/src-tauri/src/lib.rs` to manage/register `FastVoiceState` and Tauri commands
- Create: `tools/fast-voice/moonshine_bridge.cpp`
- Create: `tools/fast-voice/CMakeLists.txt`
- Create: `scripts/build-fast-voice-pack.ps1`, `scripts/build-fast-voice-pack.test.mjs`
- Generate at release time: `releases/manifests/fast-voice-windows-x64.json`

**Pinned upstream baseline:** `moonshine-ai/moonshine` GitHub release `v0.1.5` (`234f60f`, released 2026-08-24). Use only streaming English Moonshine runtime/models for this product slice. Do not install Python on the customer machine. Consume the release’s self-contained Windows/C++ assets and verify their published SHA-256 values before VibeSpace repackaging.

**Interfaces:**
- Tauri commands: `fast_voice_status`, `fast_voice_install`, `fast_voice_start`, `fast_voice_stop`.
- Event: `fast-voice://event` with closed `ready | partial | eou | level | error | stopped` variants.
- `eou` carries `utteranceId`, final `text`, `speechEndMonotonicMs`, and `emittedMonotonicMs`.

- [ ] **Step 1: Write failing TypeScript protocol tests** that reject missing/duplicate utterance IDs, control characters, transcript >32,768 chars, negative timestamps, unknown event kinds, and an `eou` earlier than its speech-end timestamp.
- [ ] **Step 2: Write failing Rust state tests** for start-before-install, duplicate start, stop idempotence, child crash -> one error/stopped sequence, and no raw audio path/file in any serialized event.
- [ ] **Step 3: Implement the Moonshine bridge against its C++ `MicTranscriber` API.** The helper owns native microphone capture; JavaScript does not duplicate the audio stream. Treat Moonshine’s in-progress text callback/event (`onText` / `LineTextChanged` equivalent) only as partial UI text, and treat the completed-line callback/event (`onLine` / `LineCompleted` equivalent) as an endpoint candidate. Never execute from partial text.

The bridge keeps one utterance buffer and a **100 ms continuation guard**: when a line completes, start a 100 ms monotonic timer; if Moonshine reports a new line/speech start inside that guard, cancel the pending EOU and continue accumulating. If the guard expires, emit exactly one JSONL `eou` event and clear the utterance buffer.

```json
{"kind":"eou","utteranceId":"u_...","text":"open three terminals","speechEndMonotonicMs":1234.2,"emittedMonotonicMs":1334.2}
```

The bridge must write protocol JSON only to stdout. Diagnostic messages go to stderr and must not include transcript text or raw samples.

- [ ] **Step 4: Build the optional Windows x64 pack from Moonshine `v0.1.5`.** `scripts/build-fast-voice-pack.ps1` must fetch the self-contained Windows C++ release assets for the pinned release, verify the upstream-published SHA-256 before extraction, compile `moonshine_bridge.cpp`, copy only runtime-required Moonshine/ONNX/model files, write `THIRD_PARTY_NOTICES.txt`, archive the VibeSpace pack, calculate its SHA-256, and emit `releases/manifests/fast-voice-windows-x64.json`.
- [ ] **Step 5: Test the pack builder without downloading in unit tests.** Feed a fixture file tree; assert the generated manifest contains non-empty 64-hex SHA-256 values for every required file and rejects path traversal, duplicate paths, zero-byte required artifacts, or an unapproved upstream tag.
- [ ] **Step 6: Implement `fast_voice_install` using the existing resumable-download/checksum pattern, but stricter than current Faster Whisper:** every required fast-voice artifact MUST have a non-empty SHA-256 and final readback verification before rename/ready state.
- [ ] **Step 7: Implement native process supervision.** `fast_voice_start` checks verified pack readiness, spawns one hidden helper, parses stdout line-by-line with a 64 KiB maximum line size, validates every event before emitting it to Tauri, and kills/quarantines the helper after malformed protocol or unexpected exit. `fast_voice_stop` terminates and reaps the child once.
- [ ] **Step 8: Implement `FastLocalVoiceService`.** It subscribes to `fast-voice://event`, exposes `start/stop/onPartial/onEou/onError`, keeps only one active session token, and drops stale events whose generation or utterance ID does not belong to the current session.
- [ ] **Step 9: Add a settings install/status seam.** When Smart EOU is selected but the Moonshine pack is missing, show one “Install local Smart Voice” action with download progress. Do not fall through to a cloud engine and do not silently switch `voiceEndTrigger`.
- [ ] **Step 10: Run TypeScript fast-voice tests, `cargo test --lib fast_voice`, pack-builder tests, typecheck, and verify the base installer inputs do not include the generated pack archive.**
- [ ] **Step 11: Commit:** `feat: add optional Moonshine smart voice runtime`.

**Release gate:** Smart EOU is available only after the helper reports `ready`. Model load/warm-up time is not counted inside EOU latency; the engine must be warm before listening begins.

---
### Task 9: Add NVIDIA Parakeet Realtime EOU as an optional qualified accelerator

**Files:**
- Create: `tools/fast-voice/parakeet_bridge.cpp`
- Create: `tools/fast-voice/wasapi_capture.h`, `tools/fast-voice/wasapi_capture.cpp`
- Create: `scripts/qualify-parakeet-eou.ps1`, `scripts/qualify-parakeet-eou.test.mjs`
- Modify: `app/src/features/voice-fast/contracts.ts`, `modelManifest.ts`, associated tests
- Modify: `app/src-tauri/src/fast_voice.rs` to select one verified engine pack

**Pinned upstream baseline:** `mudler/parakeet.cpp` `v0.5.0` (`1bfbebf`) plus NVIDIA `parakeet_realtime_eou_120m-v1`. The product must preserve NVIDIA model-license notices. Do not make this the required/default Windows engine.

**Qualification rule:** Parakeet is visible as a production engine only when the exact installed pack has a locally stored qualification record for its engine version + model hash + hardware fingerprint. Otherwise it remains hidden behind an experimental/dev flag and Moonshine remains available.

- [ ] **Step 1: Write failing engine-selection tests** proving an unqualified Parakeet pack cannot become the active Smart EOU engine and a qualified record is invalidated when pack hash or hardware fingerprint changes.
- [ ] **Step 2: Implement `parakeet_bridge.cpp` using the `parakeet.cpp` streaming C API.** Capture microphone audio locally with Windows Core Audio/WASAPI (`IAudioClient` + `IAudioCaptureClient`) in shared mode inside `wasapi_capture.cpp`; convert the captured device format to mono float PCM and resample to 16 kHz with the Windows Media Foundation audio resampler before feeding Parakeet. Do not stream raw PCM across React/Tauri IPC. Emit partial transcript events and emit `eou` only when the model produces its explicit EOU boundary.
- [ ] **Step 3: Keep the same JSONL protocol as Moonshine** so `FastLocalVoiceService` has no engine-specific routing logic beyond engine ID/status.
- [ ] **Step 4: Implement the qualification harness with hard pass/fail thresholds.** Use annotated prerecorded speech fixtures plus continuous streaming so endpoint truth is known. After a 5-minute warm-up baseline, run 25 additional minutes and require: RSS growth <=64 MiB, RSS growth slope <=1 MiB/minute, zero helper crashes, zero malformed events, zero duplicate EOU IDs, and 1,000/1,000 fixture utterances completing without stream reset.
- [ ] **Step 5: Add the VibeSpace latency gate to qualification:** EOU-to-protocol-emission P95 <=350 ms on the tested hardware for the short-command fixture set. Store the measured P50/P90/P95 with the qualification record; never substitute NVIDIA’s published benchmark for local evidence.
- [ ] **Step 6: Explicitly reproduce the current upstream streaming-memory concern.** If `parakeet.cpp` v0.5.0 exceeds the memory thresholds, mark qualification `failed_memory_growth`, do not expose the engine in production settings, and retain Moonshine as the Smart EOU path. A future pinned upstream/fork fix must rerun the whole qualification before enablement.
- [ ] **Step 7: If qualification passes, allow the user to select “NVIDIA Parakeet EOU (qualified)” in the Smart Voice engine sub-setting.** Selection never changes their coding LLM/provider.
- [ ] **Step 8: Run engine-selection tests, qualification-script unit tests, `cargo test --lib fast_voice`, and one real Windows qualification run before committing.**
- [ ] **Step 9: Commit:** `feat: add qualified Parakeet EOU accelerator`.

---
### Task 10: Wire Smart EOU into Jarvis Voice and route deterministic utterances before model chat

**Files:**
- Create: `app/src/features/voice/voiceUtteranceFinalizer.ts`, `.test.ts`
- Create: `app/src/features/voice/jarvisVoiceRecognitionSession.ts`, `.test.ts`
- Modify after lock handoff: `app/src/features/voice/JarvisVoiceInputService.ts`, `.test.ts`
- Modify after lock handoff: `app/src/features/voice/VoiceModal.tsx`, `VoiceModal.turn.test.tsx`, `VoiceModal.sttSmoke.test.tsx`
- Modify: `app/src/features/voice/VoiceService.ts` only to add the typed `voice:eou` event contract; existing Web Speech behavior stays unchanged.
- Reuse: `processVoiceFinalEvent`, `parseInstantCommand`, `executeInstantCommand`, `FastLocalVoiceService`.

**Lock gate:** before Step 1 edits, obtain release/handoff for every claimed Voice file from `VS-CODEX-JARVIS-COMMS-VOICE-20260822`. If the lock remains active, do not edit around it.

**Interfaces:**
- `createJarvisVoiceRecognitionSession({ endTrigger, ...events })` selects Fast Local Voice only for `smart-eou`; phrase/fixed-pause keep the existing selected STT session.
- `finalizeVoiceUtterance({ utteranceId, text, reason, ... })` returns `accepted | duplicate | empty` and remembers at most 64 IDs for the active voice session.

- [ ] **Step 1: Write failing exactly-once tests.** The same utterance delivered as EOU twice, EOU then stale final, or stale generation after restart must result in one accepted finalization. Clearing the voice session clears the bounded ID ledger.
- [ ] **Step 2: Write failing recognition-selection tests:** Smart EOU invokes `FastLocalVoiceService`; Phrase and Fixed Pause invoke the existing `createSelectedSttSession`; missing Smart Voice pack returns an explicit local-not-installed error and never falls back to cloud.
- [ ] **Step 3: Refactor VoiceModal’s existing `flushUtterance` boundary, not the whole modal.** Before creating a chat message or dispatching `jarvis:send`, call `parseInstantCommand(messageText, targetContext)`. If it returns a command, run `executeInstantCommand`, show the existing local result/toast state, and restart listening; do not create a model-backed chat turn.

```ts
const instant = parseInstantCommand(messageText, targetContext);
if (instant) {
  const result = await executeInstantCommand(instant, instantContext);
  return finishLocalVoiceAction(result);
}
return sendExistingJarvisVoiceTurn(messageText); // existing persistence/model path
```

- [ ] **Step 4: Preserve Phrase mode exactly.** `processVoiceFinalEvent` remains responsible for detecting the customizable commit phrase and cancel phrase. The phrase text itself (`send it` by default) must never be included in `messageText` passed to either the command bus or model route.
- [ ] **Step 5: Preserve Fixed Pause behavior.** It still accumulates recognized text and schedules `voiceSilenceDelayMs`; when that timer fires it calls the same command-first `flushUtterance` boundary.
- [ ] **Step 6: Add Smart EOU behavior.** It uses `voice:eou` with the engine-provided `utteranceId`; it does not create the 1–2 second fixed-pause timer. After exactly-once finalization, call the same command-first `flushUtterance` boundary.
- [ ] **Step 7: Add regression tests proving routing:** “open terminals” and “Codex, audit auth” execute locally with zero `messageRepo.create` and zero `jarvis:send`; “explain quantum tunneling” follows the existing model chat path unchanged.
- [ ] **Step 8: Add cross-trigger tests:** phrase commit -> one send; Smart EOU -> one send; fixed timer -> one send; EOU + stale final -> one send; cancel phrase -> zero sends; closing/reopening modal invalidates old generation events.
- [ ] **Step 9: Run all VoiceModal/JarvisVoiceInputService/voiceTurnCommit/voiceConversation tests plus Instant Command tests; expected PASS.**
- [ ] **Step 10: Commit:** `feat: route Jarvis voice commands before model chat`.

---
### Task 11: Fix provider-task dispatch so `ask OpenCode/Codex/Claude ...` never becomes a brittle one-shot shell invocation

**Files:**
- Create: `app/src/features/instant-command/providerTaskDispatch.ts`, `.test.ts`
- Modify: `app/src/features/instant-command/execute.ts`, `execute.test.ts`
- Modify: `app/src/features/instant-command/parse.ts`, `parse.test.ts` if needed so existing `ask_provider` legacy intents normalize to `agent-message`
- Leave normal native Chat OpenCode transport unchanged: `app/src/lib/harness/openCodeNativeTransport.ts` and `OpenCodeSdkSessionClient.sendAsync()` already use persistent `/session/{id}/prompt_async`.

**Root cause being fixed:** legacy `executeIntent('ask_provider')` builds a command shaped like `` `${provider} ${JSON.stringify(prompt)}` ``. That is not a universal or reliable way to address interactive OpenCode/Codex/Claude sessions.

- [ ] **Step 1: Write a failing regression test** proving `ask opencode to review auth` does not call legacy `executeIntent` and never enqueues the literal shell string `opencode "review auth"`.
- [ ] **Step 2: Implement provider task resolution:** if exactly one live matching provider terminal exists, use direct live-session dispatch; if multiple exist, return local ambiguity unless the command said `all`; if none exists, enqueue a new supported provider CLI pane and attach the payload as an ordered post-start command.

```ts
enqueueTerminalCommand({
  command: providerCli,
  startupCommands: [payload],
  label: providerLabel,
  agentSlug: providerSlug,
});
```

- [ ] **Step 3: Do not add arbitrary sleeps before `startupCommands`.** Reuse existing terminal startup/readiness/prompt evidence. If the provider TUI cannot prove readiness, keep the task queued and show `starting`, not a false `sent` state.
- [ ] **Step 4: Add provider-spawn tests** for OpenCode, Codex, Claude, and an unsupported provider. Unsupported aliases fail locally instead of opening a shell with guessed syntax.
- [ ] **Step 5: Add a contract test proving existing VibeSpace native OpenCode chat still uses `prompt_async`.** This is a regression-only assertion against `openCodeNativeTransport.test.ts` / `OpenCodeSdkSessionClient` behavior; do not rewrite that path.
- [ ] **Step 6: Run provider dispatch, Instant Command, terminal startup tests, and OpenCode native transport tests; expected PASS.**
- [ ] **Step 7: Commit:** `fix: route provider tasks through persistent agent sessions`.

---

### Task 12: Add production latency instrumentation and a hard acceptance harness

**Files:**
- Create: `app/src/features/instant-command/latency.ts`, `latency.test.ts`
- Create: `scripts/pr31-instant-command-latency.mjs`, `scripts/pr31-instant-command-latency.test.mjs`
- Create: `qa/runtime/instant-command-latency-fixtures.json`
- Modify: `app/src/features/voice-fast/FastLocalVoiceService.ts` only to stamp monotonic phase timings
- Modify: `app/src/features/instant-command/execute.ts` only to stamp parse/resolve/dispatch acknowledgement timings

**Telemetry contract:** one bounded record per command, no transcript/payload/file content:

```ts
{
  engineId, commandKind, successCode,
  eouAtMs, parseStartedAtMs, parseEndedAtMs,
  resolveEndedAtMs, dispatchAckAtMs,
  targetCount, utteranceIdHash
}
```

Use `performance.now()`/native monotonic clocks for durations. Wall-clock timestamps are optional metadata and never used to calculate latency.

- [ ] **Step 1: Write failing telemetry tests** rejecting raw text-like keys (`text`, `prompt`, `command`, `transcript`, `payload`, `audio`) and unbounded identifiers.
- [ ] **Step 2: Add pure microbenchmarks** that execute 10,000 parses and 10,000 target resolutions over the representative command corpus, discard the first 500 warm-up samples, and calculate P50/P90/P95 with a stable percentile function. Gates: parse P95 <=3 ms; target resolution P95 <=5 ms.
- [ ] **Step 3: Add direct-dispatch benchmarks** against a native test PTY that echoes input. Run 500 writes after warm-up and require target-resolution-end -> `terminal_write` acknowledgement P95 <=20 ms. Do not include process spawn in this metric.
- [ ] **Step 4: Create a 200-utterance annotated command fixture set** split evenly across navigation/local UI, exact terminal target, provider task, and terminal broadcast. Store transcript + expected parsed command in the QA fixture; recorded audio fixtures live in QA assets, not production telemetry.
- [ ] **Step 5: Add Smart EOU replay mode to the QA helper only** so prerecorded 16 kHz mono fixture audio can be fed through the exact Moonshine/Parakeet engine implementation without using a microphone. The production command surface must not expose a file-path audio injection command.
- [ ] **Step 6: Run the end-to-end native latency suite after engine warm-up.** For every sample record EOU/commit finalization -> dispatch acknowledgement. Required release gates:

| Metric | Required |
|---|---:|
| command parse P95 | <=3 ms |
| target resolution P95 | <=5 ms |
| live PTY dispatch P95 | <=20 ms |
| Smart EOU -> accepted dispatch P50 | <=175 ms |
| Smart EOU -> accepted dispatch P90 | <=275 ms |
| Smart EOU -> accepted dispatch P95 | <=350 ms |
| duplicate accepted dispatches | 0 |
| wrong-action or wrong-target dispatches on the 200-utterance clean command corpus | 0 |
| correct accepted action + target rate on that corpus | >=98% |
| remaining recognition failures | fail closed / local clarification only |
| deterministic route requiring a routing LLM before dispatch | 0 |

- [ ] **Step 7: Keep Fixed Pause outside the EOU SLA.** Add a test proving a configured 2,000 ms pause still waits approximately that configured duration; this is intentional behavior, not a performance failure.
- [ ] **Step 8: Add Phrase-mode routing measurement** from recognition of the final commit phrase to dispatch acknowledgement; require parser+resolver+local dispatch P95 <=50 ms after the STT engine has delivered the committed text. Do not include provider STT network latency in this local-routing metric.
- [ ] **Step 9: Prove the “no routing LLM” boundary.** Unit tests inject a model-call sentinel that throws if touched; source-level tests reject imports from `@/lib/ai/*` inside `features/instant-command` except type-only contracts explicitly reviewed. Downstream Codex/Claude/OpenCode network activity after task dispatch is allowed and is not counted as routing.
- [ ] **Step 10: Emit one sanitized JSON acceptance report** from `scripts/pr31-instant-command-latency.mjs` containing machine/runtime versions, sample counts, percentile metrics, engine qualification ID, pass/fail gates, and SHA-256s of QA fixture definitions. Do not include transcripts, terminal output, prompts, filenames from user projects, API keys, or model responses.
- [ ] **Step 11: Run the latency script twice from a warm app/runtime.** Both consecutive runs must pass all deterministic gates; do not average a failed run away.
- [ ] **Step 12: Commit:** `test: add instant command latency acceptance gates`.

---

### Task 13: Full regression, native QA, documentation, and ship/no-ship decision

**Files:**
- Modify: `docs/04-voice-jarvis-layer.md`
- Modify: `docs/TERMINAL_AGENT_SYSTEM_OPTIONS.md`
- Create: `docs/testing/INSTANT_COMMAND_FAST_VOICE_ACCEPTANCE.md`
- Modify: `CHANGELOG.md` only after all release gates pass
- Do not modify updater configuration or release signing secrets as part of this feature.

- [ ] **Step 1: Update architecture docs** to remove the stale claim that every voice intent needs a small LLM classifier. Document the deterministic fast lane, the three hands-free modes, the optional fast-local engines, direct live PTY transport, and the async model-work boundary.
- [ ] **Step 2: Write the acceptance document** with exact commands used, hardware/OS, Moonshine/Parakeet pack hashes, P50/P90/P95, memory-soak result, tests run, and any engine that stayed disabled because it failed qualification.
- [ ] **Step 3: Run the manual native scenario matrix in the official VibeSpace desktop app:**
  1. Phrase mode: say “open terminals”, then the configured `send it` phrase -> one local action, no model turn.
  2. Smart EOU: say “open terminals” -> one local action inside the measured SLA.
  3. Fixed Pause at 2.0 s: say “open terminals” -> one action after the configured delay.
  4. One live Codex pane: “Codex, audit auth” -> exactly that pane receives the payload and submits once.
  5. Two live Codex panes: “Codex, audit auth” -> local ambiguity, neither receives text.
  6. “Tell all Codex terminals to run git status” -> every matching pane receives one submission.
  7. “Message terminal 2: continue” -> only terminal 2 receives it.
  8. “Message him: continue” immediately after an explicit single target -> same target; after context reset -> clarification.
  9. `open llm` -> existing model/provider chooser; no provider is auto-selected.
  10. “create schedule release review Friday at 1pm” -> existing schedule parser creates the event.

- [ ] **Step 4: Run the terminal-safety scenarios:** normal terminal mic dictation types text but does not press Enter; explicit Command Mode presses Enter once; password/SSH/unknown unsafe prompt refuses auto-submit; Terminal route can be closed while direct live messaging still works; WebView reload reconciles live PTYs via `terminal_list` instead of orphaning them.
- [ ] **Step 5: Run model-regression scenarios:** ordinary voice/chat question still uses the user-selected model; effort/Fast/RLM settings are unchanged; long-form Web Speech/Deepgram/Faster Whisper dictation remains selectable; existing agent briefing files/context packs still load; existing permission cards still gate model-proposed mutating tools.
- [ ] **Step 6: Run focused automated gates from `app/`:**

```powershell
npx vitest run src/features/instant-command src/features/voice-fast src/features/voice src/features/terminals
npm run typecheck
npm run build
```

Every failure must be resolved or documented as a pre-existing reproduced failure with evidence; do not mark this feature passed around a new assertion failure.

- [ ] **Step 7: Run repository/native gates:**

```powershell
cd C:\Users\viper\VibeSpace-UnifiedChungus-Final\app
npm test -- --maxWorkers=4
cd src-tauri
cargo test --lib
cargo check --release
```

- [ ] **Step 8: Run the latency gate twice from repository root:**

```powershell
node scripts/pr31-instant-command-latency.mjs --mode native --output .artifacts\instant-command-latency-pass1.json
node scripts/pr31-instant-command-latency.mjs --mode native --output .artifacts\instant-command-latency-pass2.json
```

Both reports must independently pass the mandatory Moonshine/Instant Command gates.
- [ ] **Step 9: Build one unsigned local Windows bundle and prove optional voice packs are absent from it:**

```powershell
cd C:\Users\viper\VibeSpace-UnifiedChungus-Final\app
npm run tauri -- build --features jarvis-voice --no-sign
node ..\scripts\verify-release-artifact-size.mjs --assets-dir src-tauri\target\release\bundle\nsis
node ..\scripts\verify-release-artifact-size.mjs --assets-dir src-tauri\target\release\bundle\msi
```

If only one installer format is produced by the local toolchain, run the size gate on that produced directory and record the absent format truthfully. The optional fast-voice archive must live outside both bundle directories.

- [ ] **Step 10: Inspect `git diff --check` and `git status --short`.** Stage/commit only files owned by this implementation; never sweep other agents’ dirty work into the commit.
- [ ] **Step 11: Add CHANGELOG entry only after all mandatory gates pass.** State the measured percentile range, not a blanket “always under 300 ms” claim.
- [ ] **Step 12: Commit documentation/release-note closure:** `docs: document instant command and smart voice acceptance`.

## Ship / No-Ship Rules

**Mandatory blockers:** Moonshine Smart EOU runtime cannot install/start reliably; duplicate dispatch is nonzero; normal chat model routing changes; Phrase/Fixed Pause regress; terminal Dictation begins auto-submitting; parser/target/direct-dispatch gates fail; Smart EOU P95 exceeds 350 ms on the declared qualification machine; base installer exceeds the existing 300,000,000-byte hard cap.

**Optional Parakeet failure is not a product blocker.** If Parakeet fails its memory or latency qualification, ship Smart EOU with Moonshine only and keep Parakeet disabled. Do not hide the failure or claim NVIDIA acceleration passed.
## Recommended execution order

1. Tasks 1–2: command contracts/parser vocabulary.
2. Tasks 3–4: live terminal registry + direct transport.
3. Task 5: authoritative bus + Assistant Bar migration.
4. Task 6: Dictation vs Command submit fix.
5. Task 7: three hands-free modes and persisted migration.
6. Task 8: mandatory Moonshine local Smart EOU runtime.
7. Task 9: optional Parakeet EOU qualification/integration.
8. Task 10: VoiceModal/Jarvis integration after Voice lock handoff.
9. Task 11: provider task routing cleanup.
10. Task 12: latency/performance acceptance harness.
11. Task 13: full regression, native QA, packaging proof, docs.

Do not merge Task 10 before Tasks 1–8 are green: voice integration is the cross-system seam where duplicate-send and fallback mistakes become hardest to isolate.

## Definition of done

A user can say or type a deterministic command such as `open three terminals`, `open llm`, `message terminal 2: continue`, `Codex, audit auth`, or `create schedule release review Friday at 1pm`; VibeSpace resolves and dispatches it locally without a routing LLM. Large agent work continues asynchronously in the user-selected provider/model. Phrase (`send it`), Smart EOU, and Fixed Pause hands-free modes all coexist. Normal terminal dictation never auto-submits. The mandatory Moonshine lane passes two consecutive native latency runs at P95 <=350 ms EOU-to-dispatch and all regression/package gates; Parakeet is exposed only if its independent reliability qualification passes.
