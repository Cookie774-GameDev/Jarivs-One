# VibeSpace Instant Command Bus + Fast Local Voice Design

**Status:** Approved in chat on 2026-08-29; this file serializes the approved scope for implementation planning.

## Goal

Make deterministic VibeSpace commands feel effectively instant while preserving normal LLM behavior for actual reasoning. A large task may take minutes to complete, but a direct command such as “Codex, audit auth” or “open three terminals” must be recognized, accepted, and dispatched without a routing LLM.

## Scope

- Add one authoritative Instant Command Bus for deterministic local commands.
- Keep the existing Jarvis `send it` commit-phrase workflow.
- Keep a configurable fixed-pause hands-free mode for users who prefer it.
- Add a Smart EOU hands-free mode using local streaming speech recognition / endpoint detection.
- Target P50 <=175 ms, P90 <=275 ms, P95 <=350 ms from EOU/commit finalization to accepted dispatch for deterministic commands.
- Add deterministic commands for targeted terminal/agent messages, opening LLM CLIs, schedules, projects, UI navigation, broadcasts, and related existing Jarvis actions.
- Preserve the user’s chosen coding model/provider. The command bus routes work; it does not silently replace the selected LLM.
- Preserve current long-form dictation paths, including Web Speech, Deepgram, and batch Faster Whisper.
- Fix terminal voice so Dictation Mode still types without submitting while Command Mode intentionally submits exactly once.

## Non-goals

- Do not claim a coding model can finish a large coding task in 300 ms.
- Do not route ordinary chat messages away from the user-selected LLM.
- Do not bypass existing VibeSpace/OpenCode/Codex/Claude permission or approval systems.
- Do not redesign unrelated UI, billing, auth, Context/RLM, agent prompts, or terminal rendering.

## Voice turn modes

The existing two-way concept becomes three explicit modes instead of overloading one silence timer:

1. **Say a phrase** — preserve the existing customizable commit phrase (`send it` by default) and cancel phrase. Nothing auto-sends before the commit phrase.
2. **Smart EOU (recommended)** — local streaming endpoint detection finalizes the utterance as soon as the engine determines the user is done.
3. **Fixed pause** — preserve the existing configurable pause timer for users who deliberately want a delay.

Legacy persisted `voiceEndTrigger: 'phrase'` stays phrase. Legacy `voiceEndTrigger: 'silence'` migrates to fixed-pause so existing users do not silently change behavior. Smart EOU is a new explicit selection.

## Local speech engines

**Production default for Smart EOU:** Moonshine Voice English streaming model wrapped by VibeSpace endpointing. English code/models are MIT, run on-device, require no account/API key, support Windows, and are designed for live streaming. Moonshine does not provide Parakeet’s explicit semantic `<EOU>` token, so VibeSpace treats its completed streaming segment as an endpoint candidate and applies the bounded continuation guard defined in the implementation plan before finalizing. Qualify Moonshine’s current streaming English model sizes on Windows and choose the smallest model that passes the command-accuracy gate; prefer the higher-accuracy streaming model only when it still satisfies the P95 latency and memory gates. Do not hardcode a legacy/non-streaming model name.

**Optional accelerator:** NVIDIA `parakeet_realtime_eou_120m-v1`, consumed through a pinned native C/C++ runtime such as `mudler/parakeet.cpp` only after VibeSpace-specific reliability gates pass. NVIDIA’s model emits `<EOU>` and reports P50 160 ms, P90 280 ms, P95 320 ms in its published evaluation.

Parakeet must not be the mandatory Windows path. As of 2026-08-29, `parakeet.cpp` has Windows releases and streaming EOU support, but it also has an open streaming memory-leak report. VibeSpace must fail its Parakeet qualification gate if a 30-minute mic/stream soak grows memory beyond the bounded threshold defined in the implementation plan.

**Compatibility paths remain:**
- Web Speech stays available, but must not be labeled guaranteed-local/offline because Chromium may use a server recognition service.
- Deepgram remains the user-selected cloud streaming option.
- Faster Whisper remains for longer local/batch dictation; it is not the low-latency Smart EOU engine.

Model/runtime packs are on-demand downloads with pinned version + SHA-256 verification. They are not bundled into the base installer.

## Instant Command Bus

All deterministic entry points call one pure parse/resolve/execute pipeline before any LLM route:

```text
Voice / Jarvis Assistant Bar
        -> parseInstantCommand(text)
        -> resolveInstantCommandTargets(command, live state)
        -> authorize deterministic action
        -> dispatchInstantCommand(command)
        -> immediate local acknowledgement
```

The parser may reuse the current `features/assistant/parse.ts` as a compatibility adapter, but new commands live behind the new bus contracts instead of continuing to grow unrelated UI code.

Normal chat is not command-first by default. The user’s normal chat/model selection remains unchanged.

## Terminal targeting and direct dispatch

A small durable frontend registry maps live native session IDs to project, pane, ordinal, label, agent slug, startup command/provider identity, and last-known readiness. On WebView reload, reconcile this registry against native `terminal_list`; discard stale entries.

For an already-live target, command dispatch does **not** wait for the Terminal route to mount or lazy-load. It invokes the target transport directly and updates UI/execution state asynchronously.

Target resolution is deterministic and fails closed on ambiguity. Supported selectors include `terminal 3`, exact pane/agent labels, `Codex`, `OpenCode`, `Claude`, `all terminals`, `all Codex terminals`, `this terminal`, and a bounded same-voice-session last target for phrases such as `message him` / `tell it`.

Dictation and execution are separate contracts. Existing terminal dictation continues to write transcript text without Enter. Explicit Command Mode writes a validated payload and exactly one submit terminator, or uses a provider-native prompt transport when available. Auto-submit is permitted only when a closed terminal-input adapter proves a safe shell/agent input state for the exact supported runtime; approval, question, password, SSH, unknown, or unsupported full-screen states receive no task write and fail locally.

## Command families

Required deterministic families include:

- `terminal.open`: “open three terminals with OpenCode”, “open Codex”, “open Claude”.
- `terminal.message`: “message terminal 3: run the tests”, “tell this terminal to continue”.
- `agent.message`: “Codex, audit auth”, “tell OpenCode to fix the RLM tests”, “message Marshall: review this”.
- `terminal.broadcast`: “tell all terminals to run git status”, “tell all Codex terminals to review regressions”.
- Existing project, context, files, agents, settings, schedule/event, task, fullscreen, Workbench, and navigation commands remain supported through the same bus.
- Schedule aliases include “create a schedule/event…”, “schedule…”, and “book…”, routed to the existing schedule parser rather than an LLM.

Payload complexity does not change routing. Once a deterministic target/action prefix is resolved, the remainder is forwarded verbatim as the task payload after bounded sanitation.

## Safety and exactly-once behavior

- No deterministic command may invoke a routing LLM or require a network model call **before dispatch acknowledgement**. After dispatch, the user-selected target model/provider may use its normal local or network execution path to do the actual work.
- Every voice utterance receives one `utteranceId`; final transcript, EOU, commit phrase, and fallback timer compete to finalize it exactly once.
- An EOU event must never cause a second send after `send it`, and `send it` must never leak into the forwarded task text.
- Explicit command execution never turns ordinary terminal dictation into implicit Enter presses.
- Unknown/ambiguous terminal targets do not guess. Return a local clarification state.
- Never auto-submit into detected password/SSH/unknown interactive prompts.
- Existing agent/tool permissions remain authoritative; this feature does not auto-approve actions.
- Do not persist raw microphone audio. Latency telemetry stores timings, engine/model IDs, command kind, success/failure code, and hashed/non-content identifiers only.

## Packaging and coordination

The implementation must respect existing agent-coordination locks. `JarvisVoiceInputService.ts` and related Voice files are currently claimed by `VS-CODEX-JARVIS-COMMS-VOICE-20260822`; the implementation agent must obtain a handoff/release before editing claimed files.

Fast-voice engines/models are optional downloadable packs. Base installer size gates remain unchanged; no 460 MB Parakeet model is embedded in the installer.

## Acceptance metrics

For deterministic commands in Smart EOU mode, measure from the engine’s EOU/finalization timestamp to successful local dispatch acknowledgement:

| Stage / result | Gate |
|---|---:|
| Pure command parse P95 | <= 3 ms |
| Target resolution P95 | <= 5 ms |
| Direct local dispatch P95 after target resolution | <= 20 ms |
| EOU -> accepted dispatch P50 | <= 175 ms |
| EOU -> accepted dispatch P90 | <= 275 ms |
| EOU -> accepted dispatch P95 | <= 350 ms |
| Duplicate sends | 0 |
| Wrong action/target dispatches on clean command corpus | 0 |
| Correct accepted action + target rate on clean command corpus | >= 98% |
| Routing LLM/network dependencies before deterministic dispatch ack | 0 |

The aspirational headline is “under 300 ms” for the great majority of qualified machines, but release truth is the measured percentile table above. Fixed-pause mode is intentionally excluded from the EOU latency SLA. Phrase mode is measured from final recognition of the commit phrase to dispatch.

## Required regression behavior

- `send it` and custom commit phrases continue to work exactly once.
- `cancel` / custom cancel phrase continues to discard the draft.
- Long speech remains possible; Smart EOU is optional, not a forced replacement for long-form dictation.
- Terminal Dictation Mode never gains an implicit Enter.
- Command Mode submits exactly once.
- Existing queue durability/cancellation behavior for spawned/new terminals is preserved.
- Existing `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` briefing delivery is preserved.
- Existing user-selected model/effort/fast-mode/RLM settings are untouched.
- Existing UI routes and terminal persistence remain intact.
