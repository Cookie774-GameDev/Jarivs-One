# Jarvis Instant No-Model Commands + Warm Voice Instrument

**Status:** Approved implementation addendum for the 2026-08-29 Jarvis refinement pass
**Parent design:** `2026-08-29-instant-command-bus-fast-local-voice-design.md`
**Parent plan:** `../plans/2026-08-29-instant-command-bus-fast-local-voice.md`

## Decision

Implement the useful no-download portion of the parent design now:

- keep every existing deterministic Assistant command;
- add explicit, local parsing for opening supported CLI panes, addressing a terminal by ordinal, addressing a CLI/provider, and broadcasting to an explicit group;
- preserve the user-selected model, Fast/RLM settings, normal chat send path, voice engine, commit phrase, fixed-pause mode, and all current permission boundaries;
- refine the existing Jarvis voice presentation into a warm VibeSpace voice instrument;
- add no model weights, sidecars, packages, fonts, or network dependency;
- keep the total code/assets delta comfortably below the requested 1–2 MB ceiling.

Moonshine, Parakeet, and every other downloadable local model are excluded by the user's explicit no-download direction.

## Root cause

The current Assistant parser/executor is already deterministic and its baseline is green. The missing behavior is narrower:

1. Targeted phrases such as `message terminal 3: run npm test`, `Codex, review this`, `tell all Codex terminals ...`, `open codex`, and `open llm` do not have a closed local grammar.
2. The current `ask_provider` intent launches a new provider terminal. It does not resolve or message an existing live pane.
3. Existing exact terminal-reference queue delivery is proven, but it is route/UI driven. Queue acceptance is immediate; actual native input is not a truthful sub-500 ms delivery receipt.
4. Safe direct native writes require verified terminal identity and input readiness. That evidence currently lives only inside the locked `TerminalView.tsx`, while native `terminal_list` lacks pane/agent/readiness fields.
5. The current voice UI is functionally covered but visually reads as a tiny cyan sci-fi HUD: very small text, duplicate talk controls, persistent decorative motion, fragile transcript columns, and hard-coded colors that do not follow VibeSpace themes.

## Scope and ownership boundary

This pass may write only the active `VS-CODEX-JARVIS-INSTANT-POLISH-20260829` paths.

It must not edit:

- `VoiceModal.tsx` or `JarvisVoiceInputService.ts`, owned by `VS-CODEX-JARVIS-COMMS-VOICE-20260822`;
- `TerminalView.tsx`, native terminal commands, or the terminal prompt authority, owned by `VS-CODEX-CONTEXT-GATEWAY-IMPLEMENTATION-20260822`;
- normal chat composer/runtime/provider files;
- installer, dependency, model-download, credential, production, or deployment files.

If a requirement crosses one of those boundaries, leave a typed integration seam and report the exact handoff requirement. Do not work around the lock with DOM scraping, transcript guessing, synthetic readiness, or an unsafe native write.

## Instant Command architecture

### Closed command contract

Create a small `features/instant-command` module with discriminated command and result types. Supported command families:

- `legacy`: wraps an existing non-unknown Assistant intent;
- `open-agent-cli`: opens one bounded supported CLI through the existing terminal queue;
- `open-model-picker`: opens the existing model/provider choice surface without selecting a model;
- `terminal-message`: one explicit terminal selector plus unchanged payload;
- `agent-message`: one explicit CLI/provider selector plus unchanged payload;
- `terminal-broadcast`: an explicit all-terminal or all-provider selector plus unchanged payload.

The module must not import AI generation/provider runtime code.

### Deterministic parsing

Explicit targeted grammars run before the legacy adapter. Required examples include:

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
```

Rules:

- routing is case-insensitive, but forwarded payload bytes/casing are preserved after outer trimming;
- reject empty payloads, NUL/unsafe control characters, ordinal zero, counts above ten, and payloads above 32,768 characters;
- ordinary prose such as `codex is useful` or `tell me about codex` remains unhandled;
- ambiguous pronouns such as `message him` fail unless a bounded same-interaction explicit target exists;
- existing schedule/date parsing remains authoritative;
- unsupported ordinary text never falls into an LLM from this module.

### Target snapshot and resolution

Build a bounded target snapshot from existing, unlocked read authorities:

- current project terminal tree order (`getLiveTree`, otherwise persisted tree);
- flattened leaves for visual ordinal order;
- transcript metadata for pane/session/project/agent/command identity;
- native `terminal_list` only to reject stale sessions.

Resolution precedence:

1. exact session id;
2. exact pane id;
3. current-project visual ordinal;
4. exact agent slug/label/provider executable;
5. unique case-insensitive partial label.

Never use native hash-map order. Never select the first of multiple matches. A singular selector that matches multiple panes returns `target_ambiguous`; an explicit `all` selector may return the whole verified matching set.

### Execution and truthful receipts

For this unlocked pass:

- legacy commands delegate unchanged to `executeIntent`;
- opening a CLI uses the existing new-terminal queue;
- targeted existing-pane commands enqueue exact `{ paneId, sessionId }` refs through the already-tested terminal queue contract;
- AssistantBar closes only after an `ok` result and retains existing recent/toast behavior;
- results say `queued`, never `delivered`, until native input receipt authority exists;
- parsing/resolution/queue acceptance target less than 500 ms and must be benchmarked independently of route rendering.

True route-independent native delivery remains a required locked follow-up. It needs:

1. persistent pane/session/provider metadata reconciled with `terminal_list`;
2. an exported closed readiness state from the terminal prompt/runtime authority;
3. direct `terminal_write` only for a verified submit-safe state;
4. exactly one trailing carriage return and a native delivery receipt;
5. no route navigation and no UI mount dependency.

Until that handoff occurs, unsafe/unknown direct delivery is forbidden.

## Voice integration boundary

The current `VoiceModal` final-utterance path persists a chat turn and emits `jarvis:send`. The deterministic bus must eventually run before that model-backed path so an explicit local command receives a local acknowledgement and is not sent to an LLM.

Because `VoiceModal.tsx` is actively locked, this pass must not alter that lifecycle. The command module will expose a stable `parse + execute` entry point ready for the locked owner to call. Existing commit phrase, fixed-pause, session lease, transcript persistence, STT selection, and TTS behavior remain unchanged.

## Visual direction: warm voice instrument

Jarvis should feel like a compact VibeSpace desk intercom, not a movie HUD.

- Use existing theme tokens: warm elevated cream/charcoal surface, copper/honey signal color, espresso text, sage success, coral error.
- Retain the real 0..1 microphone/speaking energy source.
- Replace the rotating radar assembly with one calm lantern/orb and one restrained energy halo.
- Use the existing Fraunces family for persona identity and Plus Jakarta Sans/system UI typography for controls and transcript.
- Target 13–14 px body copy, 15–16 px identity, 36–40 px primary controls, and visible focus.
- Expose one unambiguous primary talk/stop control. If a secondary mic remains, it must have a different role; duplicate actions are removed.
- Model selection gets a visible `Model` label while preserving exact provider/model/connection identity and persistence.
- Transcript rows become soft paper-like cards with role/time metadata on one line and the message using full width. The scroll region is keyboard focusable.
- Preserve compact/expanded modes, Context Galaxy, Command Center, `You`/`Jarvis` labels, reduced motion, forced colors, and monochrome behavior.
- Idle, paused, error, hidden, and reduced-motion states must not run nonessential continuous presentation animation frames.

The locked `VoiceModal` owns the outer expanded scrolling structure. If 720 px clipping cannot be fixed inside the unlocked presentation scope without brittle selectors, report it as the exact remaining lock-bound defect.

## Tests and acceptance

### Automated

- Existing Assistant baseline remains green.
- Parser table covers every required positive and false-positive phrase.
- Resolver covers ordinal order, provider aliases, ambiguity, stale targets, and explicit broadcasts.
- Executor proves exact refs, truthful `queued` receipts, legacy delegation, and no AI-runtime import.
- AssistantBar proves instant commands run before legacy fallback and errors keep the dialog open.
- Source guard proves normal chat composer does not import the instant-command module.
- A microbenchmark records local parse and parse/resolve/queue acceptance percentiles below 500 ms.
- Header, orb, waveform, transcript, and model selector tests cover semantics, cleanup, reduced motion, keyboard access, and exact model identity.
- Focused tests, full TypeScript, app tests, release manifest, production build, and Cargo check run before completion, subject only to documented external file-lock blockers.

### Native visual QA

Do not launch, stop, restart, or replace VibeSpace. Attach Playwright only to the already-running official Tauri WebView if available.

At 1280×720, capture compact and expanded Jarvis in VibeSpace/warm/monochrome/Sakura themes. Verify:

- current native build identity;
- no clipping or overlap at 720 px and 480 px height;
- 320–360 px width and 200% text zoom;
- keyboard focus order and visible focus;
- real microphone waveform response;
- speaking-only orb energy response;
- idle/background/reduced-motion stillness;
- exact model persistence after close/reopen;
- transcript labels remain `You` and `Jarvis`;
- zero console/page errors.

If the existing native instance is unavailable or not running current source, report the evidence gap. Do not start another app instance.
