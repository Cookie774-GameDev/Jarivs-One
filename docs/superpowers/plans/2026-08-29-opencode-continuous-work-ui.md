# OpenCode Thin Chat Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan inline. The user explicitly prohibited subagents for this task.

**Goal:** Display OpenCode's existing public checkpoint text and tool lifecycle in exact provider order inside the existing VibeSpace Chat transcript, persist that same order across reload, and leave RLM, SiYuan, Jarvis behavior, providers, Composer, and the surrounding Chat shell unchanged.

**Architecture:** Keep OpenCode as the sole work engine. Normalize only its public text and privacy-safe tool lifecycle into request-local identities, preserve that ordered sequence in one assistant message's existing `Message.parts`, and render contiguous tool work through the existing compact activity disclosure. Do not create phases, synthesize agent narration, or change prompts.

**Tech Stack:** TypeScript, React 18, Vitest, Dexie-backed Chat messages, Tauri 2, Rust native OpenCode Serve transport, Playwright attached to the official Tauri WebView.

**Spec:** User-approved reference `C:\Users\viper\AppData\Local\Temp\codex-clipboard-bc7be8d5-0286-4edc-8087-392aded5f7a6.png` plus the current-turn instruction that only the UI projection changes.

## Global Constraints

- Do not change RLM, SiYuan, Context routing, Jarvis personality/system prompts, normal response behavior, runtime-profile policy, or provider architecture.
- Do not change `Composer.tsx`, `ChatThread.tsx`, sidebar, tabs, header, model picker, textbox, warm theme, or unrelated UI.
- Never persist or render reasoning, private source pills, provider-native IDs, absolute paths, raw commands, tool input/output, credentials, or secrets.
- Do not add an `activity_phase` subsystem, a second workflow engine, hard-coded five-stage narration, canned checkpoints, or prompt instructions intended to manufacture progress prose.
- Render every real public OpenCode text part in native order. If OpenCode emits five checkpoints, show five; do not invent or merge checkpoints.
- Group only adjacent tool parts into the existing compact disclosure; use leaf filenames and status-aware labels.
- Keep the existing official Tauri app running; attach to its WebView and do not launch, stop, or replace it unless the source rebuild makes one controlled restart unavoidable.
- Commit only the exact owned files after every required test exits 0 and native acceptance passes.

---

### Task 1: Final persisted-history reconciliation

**Files:**

- Modify: `app/src/lib/ai/adapters/opencodePersistent.test.ts`
- Modify: `app/src/lib/ai/adapters/opencodePersistent.ts`

**Interfaces:**

- Consumes: current-turn OpenCode messages containing ordered public `text`/`agent_message` and `tool` parts.
- Produces: ordered request-local `ProviderEvent` text/tool events before terminal `done`, including when `session.idle` wins the event race before the first poll.

- [x] Add persisted-history regressions for exact `text -> tool -> text` order, opaque request-local identities, leaf filenames, duplicate native call reconciliation, and private-data exclusion.
- [x] Confirm the regressions fail against the prior accumulator/flattening boundary.
- [x] Project one authoritative whole snapshot from the final current-turn persisted OpenCode messages before canonical completion.
- [x] Run the projector and persistent-adapter suites and require PASS.

### Task 2: Durable ordered message contract

**Files:**

- Verify and modify only if the Task 1 regression proves necessary: `app/src/lib/ai/router.ts`, `app/src/lib/ai/router.test.ts`, `app/src/lib/ai/runtime.ts`, `app/src/lib/ai/runtime.test.ts`, `app/src/lib/ai/types.ts`, `app/src/lib/ai/adapters/types.ts`.

**Interfaces:**

- Consumes: opaque text append/replace events and privacy-safe tool lifecycle events.
- Produces: one assistant `Message.parts` array ordered `text -> tool_call -> tool_result -> text`, updated in place during streaming and reused unchanged after reload.

- [x] Run the existing router/runtime chronology regressions after Task 1.
- [x] Add the smallest failing consumer regressions for authoritative final-text selection and suppression of inferred envelope reasoning/tool/action parts.
- [x] Keep all persisted identities request-local and render only the provider's public checkpoint/tool lifecycle; do not add phases or synthetic summaries.
- [x] Require exact focused router/runtime tests PASS.

### Task 3: Existing reference-aligned renderer

**Files:**

- Verify and modify only if real DOM evidence proves necessary: `app/src/features/chat/agentic-console/AgenticConsole.tsx`, `app/src/features/chat/agentic-console/AgenticConsole.test.tsx`, `app/src/features/chat/activity-ledger/AssistantActivityLedger.tsx`, `app/src/features/chat/activity-ledger/AssistantActivityLedger.test.tsx`, `app/src/features/chat/activity-ledger/activity-ledger.css`.

**Interfaces:**

- Consumes: ordered durable `Message.parts`.
- Produces: ordinary one-sentence checkpoint rows and one compact disclosure after each contiguous tool group.

- [x] Run existing exact-order, collapsed/expanded, reload, status-language, leaf-filename, reasoning, and private-source tests.
- [x] Keep the existing renderer unchanged because real DOM evidence proved the defect was upstream projection duplication, not presentation.
- [x] Preserve all shell/composer dimensions and styling outside the transcript activity rows.

### Task 4: Verification and official native acceptance

**Files:**

- Append only: `docs/AGENT_COORDINATION.md`
- Update only this task's lock: `.agent-coordination.lock/VS-CODEX-CHAT-THIN-PROJECTION-20260829.txt`

**Interfaces:**

- Consumes: verified thin projection.
- Produces: focused/full exit-zero evidence, official-native screenshots, reload proof, real game proof, exact commit, and released ownership.

- [x] Run the six-file focused Vitest matrix (276 tests), TypeScript, release-manifest tests, Rust `cargo check`, and production build with exit 0.
- [x] Check Prettier, `git diff --check`, exact owned paths, and privacy-safe projection regressions.
- [x] Attach Playwright to the official `jarvis.exe` WebView from this exact repository and verify its process/CDP ownership.
- [x] Create one fresh persisted chat, keep exact model `opencode-go/deepseek-v4-flash-vision-exp`, send `Make me a full html game no questions no approval needed maek it a full 3d game and test it okay` once, and wait semantically.
- [x] Capture terminal collapsed state, one expanded edited-file disclosure, identical 17-part reload chronology, and real generated-game evidence (HTTP 200, launch, movement, score, and collision/game-over checks).
- [x] Assert no stale active receipt, duplicate tool lifecycle, reasoning, private source pill, provider-native identity, absolute path, raw command/input/output, or unrelated UI change.
- [ ] Stage and commit only exact owned files, append final evidence/commit SHA, and release only this task's lock.

## Implemented result

The final boundary is intentionally small: persisted current-turn OpenCode messages are projected once into `{ timeline, finalText }`; the router passes that snapshot unchanged; Jarvis response policy still processes only `finalText`; and the runtime prepends the authoritative public timeline while suppressing any inferred reasoning/tool/action envelope parts. The existing transcript renderer groups adjacent tools, so no new workflow engine, phase model, prompt behavior, composer, shell, RLM, or SiYuan code was required.
