# VibeSpace Features Guide

**Product:** VibeSpace (desktop app)  
**Built-in assistant:** Jarvis (voice, command bar, calling — not the product name)  
**Current version:** 0.1.47 (per `app/src/features/whats-new/releases.ts`)  
**Last documented:** July 2026

---

## Introduction

**VibeSpace** is a desktop-first AI workspace (Tauri + React) that unifies chat, multi-agent orchestration, live terminal grids, voice, phone calling, tasks, scheduling, and persistent local memory in one app. **Jarvis** is the built-in assistant layer inside VibeSpace: voice presets, wake word, push-to-talk, the Mod+J command bar, and PSTN calling.

The app is **offline-first**: chats, tasks, terminal sessions, and most settings persist in **IndexedDB (Dexie)** on your machine. Cloud features (auth, billing, hosted AI, cloud TTS, phone calls) require Supabase sign-in and optional server configuration.

**Platforms:** Windows 10 1809+, macOS 12+, Linux desktop (64-bit). Real PTY terminals, Kokoro local TTS, global dictation, system tray, and auto-updater require the **Tauri desktop build** — the web dev server (`npm run jarvis`) is UI-only for many features.

---

## Table of Contents

1. [App Shell & Navigation](#1-app-shell--navigation)
2. [Chat & Composer](#2-chat--composer)
3. [Hive Multi-Model Pipeline](#3-hive-multi-model-pipeline)
4. [Council Mode](#4-council-mode)
5. [AI Providers & Models](#5-ai-providers--models)
6. [Local Models (Ollama)](#6-local-models-ollama)
7. [Agents](#7-agents)
8. [Skills](#8-skills)
9. [Jarvis Interaction Modes](#9-jarvis-interaction-modes)
10. [Voice & Wake Word](#10-voice--wake-word)
11. [Composer STT & Global Dictation](#11-composer-stt--global-dictation)
12. [Jarvis Assistant & Actions](#12-jarvis-assistant--actions)
13. [Calling / Jarvis Call (PSTN)](#13-calling--jarvis-call-pstn)
14. [Terminals & Multi-Agent Workspace](#14-terminals--multi-agent-workspace)
15. [Tasks, Kanban & Schedule](#15-tasks-kanban--schedule)
16. [Projects, Context Maps & Files](#16-projects-context-maps--files)
17. [Inspector & Activity Timeline](#17-inspector--activity-timeline)
18. [Command Palette & Launcher](#18-command-palette--launcher)
19. [Plugins & Integrations](#19-plugins--integrations)
20. [Custom Tools & MCP](#20-custom-tools--mcp)
21. [Settings](#21-settings)
22. [Account, Billing & Subscriptions](#22-account-billing--subscriptions)
23. [History & Benchmarks](#23-history--benchmarks)
24. [Ambient Mode & Wellness](#24-ambient-mode--wellness)
25. [Media / Clock](#25-media--clock)
26. [Onboarding & What's New](#26-onboarding--whats-new)
27. [Updates & Installer](#27-updates--installer)
28. [Security & Privacy](#28-security--privacy)
29. [Developer Console](#29-developer-console)
30. [Planned / Incomplete Features](#30-planned--incomplete-features)

---

## 1. App Shell & Navigation

### What it is
The three-pane workspace shell: **TopBar**, **NavPane** (left), main **PageRouter** canvas, and optional **Inspector** (right).

### How to use it
- **TopBar** — route switcher, voice/call buttons, settings, command palette entry
- **NavPane** (`Mod+B`) — projects, chats, agents, context, files
- **Inspector** (`Mod+\`) — today's tasks, schedule, terminals, context, mini-chat
- **Tab strip** — multiple chat tabs; `Mod+T` new, `Mod+W` close

### How it works (intended behavior)
- `PageRouter` lazy-loads each feature page inside a single Suspense boundary; missing modules show a placeholder card instead of crashing the app.
- The **terminal route is cached**: switching away from Terminals keeps PTY sessions alive in a hidden container.
- `route` in the UI store is **transient** — reload always returns to **Chat**.

### Key files
- `app/src/components/layout/AppShell.tsx`, `PageRouter.tsx`, `NavPane.tsx`, `TopBar.tsx`, `Inspector.tsx`
- `app/src/stores/ui.ts`

### Routes

| Route | Label | Purpose |
|-------|-------|---------|
| `chat` | Chat | Default; main AI conversation |
| `terminal` | Terminals | Live PTY grid |
| `kanban` | Kanban | Task board |
| `schedule` | Schedule | Calendar / events |
| `agents` | Agents | Agent manager |
| `agent-detail` | Agent detail | Single agent editor |
| `project-detail` | Project | Project settings |
| `context` | Context maps | Structured project context trees |
| `skills` | Skills | Skill library & editor |
| `benchmarks` | Benchmarks | Model leaderboard |
| `history` | History | Chat replay |
| `tools` | Custom tools | User-defined action workflows |
| `files` | Files | Project file browser |
| `account` | Account | Identity, plan, usage |

---

## 2. Chat & Composer

### What it is
The primary AI conversation surface with streaming replies, model selection, attachments, slash commands, and optional spoken replies.

### How to use it
- Type in the composer; **Mod+Enter** to send
- Open model picker to choose provider + model
- Type `/` for slash commands
- Attach images, files, context maps, plugins, skills
- **Shift+Tab** toggles auto-approve for inline Jarvis actions

### How it works (intended behavior)
- Messages stream through `lib/ai/runtime.ts` → `router.ts` → provider adapters.
- Chats and messages persist in IndexedDB; tab strip reflects open chats.
- **Chat modes** (`chatMode`): `chat` | `council` | `doc` | `code` — switch via **Mod+K → Switch mode**.
- Normal replies can trigger TTS when voice settings allow.
- **Plan mode** (`/plan`) produces a read-only plan with Build / Redo / Cancel cards.
- **Ask mode** (`/ask`) answers without edits or tool use.
- **Multitask / subagents** (`/multitask`, `/subagents`) spawn chat-native Jarvis agents for delegated work.

### Slash commands (composer)

| Command | Purpose |
|---------|---------|
| `/ask` | Answer-only, no edits |
| `/plan` | Read-only plan with review card |
| `/multitask`, `/agent` | Launch chat-native Jarvis agent |
| `/subagents` | Spawn subagents using current chat model |
| `/terminals` | Reference terminal surface in chat |
| `/context`, `/contextmap` | Attach a context map |
| `/plug` | Attach connected plugin |
| `/skills` | Add a skill to the turn |
| `/allaboutme` | Attach/edit AllAboutMe.md profile |
| `/hive` | Reference Hive in chat |
| `/file`, `/attach` | Attach project files |
| `/model` | Switch model |
| `/clearfiles` | Clear attachments |
| `/kanban`, `/history`, `/tools`, `/agents`, `/schedule`, `/chat` | Navigation references |
| `/usage` | Usage summary |
| `/commands`, `/help` | Help catalogs |

### Key files
- `app/src/features/chat/Composer.tsx`, `ChatThread.tsx`, `ChatView`
- `app/src/features/chat/SlashCommandTypeahead.tsx`
- `app/src/lib/ai/runtime.ts`, `router.ts`

---

## 3. Hive Multi-Model Pipeline

### What it is
**Hive** is VibeSpace's sequential multi-model chat pipeline. Instead of one model answering, each preset runs 1–4+ steps across different providers/models, chaining outputs until a final answer.

### How to use it
- Composer → **Hive** dropdown (StackPicker): Off, Fast, Balanced, Quality, High
- Or type `/hive` in chat
- View intermediate steps in the **Stack Timeline** (collapsible in thread)

### How it works (intended behavior)
- **Default: Off** → normal single-model `runAgent()` path.
- When On: `runtime.ts` calls `runStack()` with step-specific system prompts and models from `lib/ai/stacks/`.
- **Hosted path:** each step can reserve/settle AI credits on paid plans.
- **BYOK path:** uses your API keys per step.

### Hard exclusions (never use Hive)
- Terminals / PTY
- Voice / PSTN / SMS

### Presets

| Preset | Steps | Use case |
|--------|-------|----------|
| Off | 0 | Default single model |
| Hive Fast | 1 | Quick answers |
| Hive Balanced | 2 | Draft + check |
| Hive Quality | 3 | Hard questions |
| Hive High | 4 | Frontier reasoning |
| Hive Custom | User-defined | **Planned** — custom step editor not fully exposed |

### Key files
- `docs/HIVE.md` (authoritative spec)
- `app/src/lib/ai/stacks/`, `app/src/features/chat/StackTimeline.tsx`
- `app/src/stores/auth.ts` (`stackPreset`)

---

## 4. Council Mode

### What it is
Multi-agent parallel chat: multiple agents answer the same prompt in side-by-side panels with animated beams to a synthesis hub.

### How to use it
- **Mod+K → Switch mode → Council**
- **Mod+Shift+Enter** to broadcast to all council agents
- Click **Synthesize** to merge panel outputs

### How it works (intended behavior)
- `CouncilView` renders a grid of `AgentPanel`s filtered by `active_agent_ids` on the chat.
- Each panel shows that agent's messages plus the user prompt.
- Requires `VITE_ENABLE_COUNCIL` and 2+ registered agents.
- Hive can apply per agent when stacks are enabled.

### Key files
- `app/src/features/council/CouncilView.tsx`, `CouncilGrid.tsx`, `BeamLayer.tsx`
- `docs/03-multi-agent-orchestration.md`

---

## 5. AI Providers & Models

### What it is
Bring-your-own-key (BYOK) and hosted inference across 21+ provider integrations.

### How to use it
- **Settings → Providers** — enter API keys
- Composer model picker — choose provider + model
- **Settings → Plans** — use hosted DeepSeek on paid tiers without keys

### How it works (intended behavior)
- **Wired for chat today:** `google`, `groq`, `openai`, `anthropic`, `ollama`, `local`, `mock`, plus DeepSeek in model options.
- **Type union includes** (verify UI wiring per release): `xai`, `openrouter`, `deepseek`, `mistral`, `together`, `cohere`, `perplexity`, `fireworks`, `replicate`, `hyperbolic`, `novita`, `lambda`, `azure`, `cerebras`, `huggingface`, `bedrock`.
- **Mock provider** works without keys for UI testing.
- **Offline mode** restricts routing to local/Ollama.
- `/usage` shows local token totals; OpenAI and OpenRouter live usage when keys permit.

### Key files
- `app/src/lib/ai/models.ts`, `providers/*.ts`, `router.ts`
- `app/src/features/settings/sections/Providers.tsx`

---

## 6. Local Models (Ollama)

### What it is
Run chat fully local via Ollama, with in-app daemon detection, model pull progress, and CORS-free Rust HTTP bridge in packaged builds.

### How to use it
- **Settings → Local Models**
- Ensure `ollama serve` is running (app can attempt to start it)
- Pull models from the UI; completed pulls auto-select in the model picker

### How it works (intended behavior)
- `OllamaConnectionHost` bootstraps connection on launch, retries, and re-probes on window focus.
- Packaged builds use `app/src-tauri/src/ollama_http.rs` to bypass WebView CORS to `localhost:11434`.
- May require `OLLAMA_ORIGINS=*` until Rust-side fetch is fully deployed everywhere.

### Key files
- `app/src/lib/ai/providers/ollama.ts`, `ollamaBootstrap.ts`
- `app/src/features/settings/sections/LocalModels.tsx`
- `app/src-tauri/src/ollama_http.rs`, `local_ai.rs`

---

## 7. Agents

### What it is
Custom AI personas with system prompts, model bindings, tools, and memory scope.

### How to use it
- **Route: Agents** or NavPane → Agents
- Create, edit, delete agent cards
- **Mod+K → Switch agent** to target composer to an agent
- Click agent in nav → `agent-detail` editor

### How it works (intended behavior)
- Agents stored in Dexie + agent store; optional cloud mirror lags.
- Terminal panes can bind agents; briefings deliver to `AGENTS.md` via `agentPromptDelivery.ts` (not the input line).
- Built-in presets plus user-created agents; Jarvis Creator flow can scaffold new agents.

### Key files
- `app/src/features/agents/AgentManager.tsx`, `AgentDetail.tsx`
- `app/src/stores/agents.ts`

---

## 8. Skills

### What it is
Reusable instruction bundles (markdown manifests) that augment chat turns — built-in presets plus user-authored skills.

### How to use it
- **Route: Skills** — browse, create, edit
- In chat: `/skills` to attach a skill to the current turn
- Skills auto-notify on completion when configured

### How it works (intended behavior)
- `skillRegistry` merges catalog presets, custom skills from `skillsStore`, and legacy bundled `.md` agents from disk.
- Skills inject context into the prompt for that turn; they do not run autonomously unless combined with agent/multitask flows.

### Key files
- `app/src/features/skills/SkillsPage.tsx`, `SkillEditor.tsx`, `registry.ts`

---

## 9. Jarvis Interaction Modes

### What it is
Structured chat-native workflows beyond plain Q&A: plans, permission gates, question blocks, and subagent status tracking.

### How to use it
- `/plan <goal>` — plan review card with Build / Redo / Cancel
- `/multitask` or `/subagents` — delegated agent work in-thread
- Approve/deny permission cards for file writes, commands, etc.

### How it works (intended behavior)
- `jarvis-interaction` types define `JarvisPlanReview`, `JarvisPermissionRequest`, `JarvisQuestionBlock`, and `JarvisChatAgent` status machine.
- Plan mode is read-only until user clicks Build.
- Permission requests show risk level and require explicit approval unless auto-approve is on.

### Key files
- `app/src/features/jarvis-interaction/` (types, `PlanReviewCard`, `QuestionBlockCard`)
- `app/src/features/chat/MessagePart.tsx`

---

## 10. Voice & Wake Word

### What it is
Hands-free and push-to-talk conversation with Jarvis inside the app — **not** a phone call.

### How to use it
- **TopBar mic** — open voice modal
- **Mod+Space** — push-to-talk
- **Settings → Voice** — presets (Jarvis, Friday, Aurora, Atlas, Nova, Sentinel), engine (Kokoro local, Deepgram cloud, system)
- Enable wake word in Settings; say wake phrase for hands-free

### How it works (intended behavior)
- **Kokoro** — local neural TTS; unlimited on all plans; downloads once, runs on device (Tauri `kokoro` feature).
- **Deepgram cloud TTS** — uses subscription/promo voice bucket; requires sign-in.
- Wake word opens persistent corner panel (v0.1.24+) with waveform and scrollable transcript.
- Jarvis pauses STT while speaking, then resumes listening.
- **Foreground gate:** voice/wake disabled when app is hidden (`useAppForeground.ts`).
- Chat replies can speak aloud using selected voice profile.

### Key files
- `app/src/features/voice/` (`voiceRouter.ts`, `TtsService.ts`, `wakeWord.ts`, `streamingVoice.ts`)
- `app/src-tauri/src/kokoro.rs`
- `docs/04-voice-jarvis-layer.md`, `docs/10-voice-subscription-system.md`

---

## 11. Composer STT & Global Dictation

### What it is
Speech-to-text for the chat composer and system-wide dictation into any focused app.

### How to use it
- **Settings → Accessibility** — enable Composer STT
- **Ctrl+CapsLock** — composer voice-to-text (in-app); **Ctrl+Space** — VibeSpace global dictation overlay (system-wide, shared chat STT pipeline, never Win+H)
- Composer mic button when STT enabled

### How it works (intended behavior)
- Composer STT uses Deepgram or Web Speech API depending on configuration.
- **Global dictation** (Tauri only) opens overlay, transcribes, pastes to focused app via `dictation_paste_text` native command.
- Separate from voice conversation — this is transcription only.

### Key files
- `app/src/features/composer-stt/`, `global-dictation/GlobalDictationOverlay.tsx`
- `app/src-tauri/src/dictation.rs`, `faster_whisper.rs`

---

## 12. Jarvis Assistant & Actions

### What it is
**Mod+J** regex-driven command bar for app control without remote AI — plus **Mod+Shift+A** actions palette for searchable built-in actions.

### How to use it
- **Mod+J** — "open terminals", "open schedule", "create task …", "ambient mode on", etc.
- **Mod+Shift+A** — search and run any registered action
- Chat can propose inline actions with Approve/Cancel cards

### How it works (intended behavior)
- Assistant parses natural phrases against `JARVIS_COMMAND_CATALOG` and `assistant/parse.ts` — navigates routes, creates tasks, schedules events, sends terminal commands, toggles UI.
- Actions registry (`lib/actions/registry.ts`) defines dotted IDs (`nav.chat`, `terminal.run`, `wellness.eyeBreak`, etc.) with real side effects.
- Custom tools wrap action sequences for reuse.

### Key files
- `app/src/features/assistant/`
- `app/src/lib/actions/registry.ts`, `runner.ts`

---

## 13. Calling / Jarvis Call (PSTN)

### What it is
Real **phone network** calls to/from Jarvis via Twilio + phone-jarvis cloud (Pipecat). Distinct from in-app voice.

### How to use it
- **TopBar phone icon** — start in-app call UI (LiveKit scaffold when configured)
- Outbound calls triggered by scheduler or error alerts
- **Settings → Phone & Voice** — phone number, Groq key for cloud voice loop, usage meters

### How it works (intended behavior)
- Requires **Orbit+** plan (or admin override) + `VITE_PHONE_JARVIS_CLOUD_URL`.
- Entitlement gates enforced on all entry points; hangup always allowed mid-call.
- Topology: Phone ↔ Twilio ↔ Cloud (Pipecat) ↔ optional laptop bridge for tool execution.
- Usage tracked via Supabase edge functions (`call-start`, `get-call-usage`, `call-status`).

### Key files
- `app/src/features/call/`
- `phone-jarvis/cloud/`, `docs/twilio-calling-setup.md`
- `docs/09-jarvis-calling-account-release.md`

---

## 14. Terminals & Multi-Agent Workspace

### What it is
Up to **10 live PTY panes** per project in a drag-resizable tile grid — the VibeSpace multi-agent terminal workspace.

### How to use it
- **Route: Terminals** or "open terminal swarm" via Assistant
- Spawn shells or agent CLIs (OpenCode, Claude Code, Codex)
- Per-pane: split, close, font scale, hold-to-clear, fullscreen (Esc to exit grid)
- Agent role picker assigns per-pane agent briefings

### How it works (intended behavior)
- Real PTY via `app/src-tauri/src/terminal.rs` (desktop only).
- Sessions persist across route changes; scrollback restored from Dexie with ANSI/OSC sanitization.
- Agent prompts delivered to `AGENTS.md` in project root, not typed into the shell.
- `enqueueTerminalCommand` queue runs commands across one or all panes.
- Shutdown/tray hide flushes sessions via `workspaceFlush.ts`.

### Key files
- `app/src/features/terminals/TerminalsPage.tsx`, `TileGrid.tsx`
- `docs/TERMINAL_PERSISTENCE_SHUTDOWN_UPDATE_TRAY.md`

---

## 15. Tasks, Kanban & Schedule

### What it is
Native task system with kanban board, calendar schedule, OS notifications, and voice-driven create/modify.

### How to use it
- **Kanban** route — drag cards Todo / In Progress / Done
- **Schedule** route or `Mod+Shift+S` — calendar events, recurrence
- **Mod+K → Tasks** — quick task list
- Voice/Assistant: "make a todo: …", "schedule standup friday at 1pm"

### How it works (intended behavior)
- Tasks in Dexie (`taskRepo`); events in `eventRepo`.
- `NotificationEngine` + `Scheduler` fire OS notifications when enabled in Settings.
- Jarvis schedule parser builds recurrence-aware events (`jarvisSchedules.ts`).
- Inspector shows today's tasks and upcoming events.

### Key files
- `app/src/features/kanban/`, `schedule/`, `tasks/`
- `docs/06-todo-scheduler-notifications.md`

---

## 16. Projects, Context Maps & Files

### What it is
Project-scoped workspaces with system-prompt context, structured context trees, and file browsing.

### How to use it
- NavPane → Projects → create or gear icon for **project-detail**
- **Context** route — build context map trees; `/context` in chat to attach
- **Files** route — browse project file tree
- Set project root for terminal + file operations

### How it works (intended behavior)
- Active `projectId` in auth store scopes chats, terminals, and context.
- Project detail: rename, color, icon, system prompt blob, no-context toggle, agent allowlist.
- Context nodes serialize to attachments for chat and terminal injection.
- **AllAboutMe** (`/allaboutme`) — user personality profile in `AllAboutMe.md`, AI-generated via dedicated agent.

### Key files
- `app/src/features/projects/ProjectDetail.tsx`
- `app/src/features/context/tree.ts`, `files/`
- `app/src/features/all-about-me/`

---

## 17. Inspector & Activity Timeline

### What it is
Right sidebar (`Mod+\`) combining quick chat, active work, milestones, pinned items, terminals, and context.

### How to use it
- Toggle with **Mod+\** or Assistant "show/toggle inspector"
- Tabs: Context, Files, Terminals, Tasks, etc.
- **Chat activity timeline** in main chat shows tool/action breadcrumbs

### How it works (intended behavior)
- `InspectorActiveWorkPanel` tracks open tasks and tool runs.
- `InspectorMilestonesPanel` manages milestone kanban linked to inspector store.
- Mini composer in inspector for quick side conversations.
- Pinned store persists quick references across sessions.

### Key files
- `app/src/components/layout/Inspector.tsx`
- `app/src/features/inspector/`
- `app/src/features/chat/activity/ChatActivityTimeline.tsx`

---

## 18. Command Palette & Launcher

### Command Palette (Mod+K)

| Page | Contents |
|------|----------|
| root | Create, Switch (agent/mode/theme), Browse |
| theme | Light / dark / system / Jarvis Core |
| switch-agent | Registered agents |
| switch-mode | chat / council / doc / code |
| recent-chats | Last 20 chats |
| tasks | Open tasks |

### Launcher (Mod+Shift+L)
- User-configured quick links (URLs, apps)
- **Mod+Shift+1…9** hotkeys for pinned links

### Key files
- `app/src/features/command-palette/`
- `app/src/features/launcher/`

---

## 19. Plugins & Integrations

### What it is
OAuth/API-key connectors that inject metadata into chat and agent context.

### How to use it
- **Settings → Plugins** — browse catalog, connect, test
- Chat: `/plug` or @mention connected plugin

### How it works (intended behavior)
- **Implemented connectors (tested):** GitHub, Figma, Supabase, Shopify, Slack, mock-connector.
- Broader catalog (~350+ entries) includes **Planned** items — discoverable but not connectable until implemented.
- Credentials stored in OS keychain when available (`credentials.rs`).
- `testPluginConnection` validates via HTTP test endpoints.

### Key files
- `app/src/features/plugins/Plugins.tsx`, `catalog.ts`, `runtime.ts`

---

## 20. Custom Tools & MCP

### What it is
User-authored multi-step workflows wrapping built-in actions; MCP builtins for agent tool use.

### How to use it
- **Route: Tools** — create tool with action steps
- Appears in actions palette and agent tool lists
- Some MCP builtins require Tauri for filesystem/shell

### Key files
- `app/src/features/tools/toolStore.ts`
- `app/src/lib/mcp/builtins.ts`

---

## 21. Settings

**Mod+,** opens Settings modal:

| Tab | Purpose |
|-----|---------|
| Account | Sign-in, identity |
| Plans | Subscription tiers |
| Providers | BYOK API keys |
| Plugins | Integration catalog |
| Local Models | Ollama management |
| Appearance | Theme, density, Jarvis Core theme |
| Voice | Presets, engines, wake word |
| Phone & Voice | PSTN, usage meters |
| Ambient | Idle takeover, tracks |
| Notifications | Done notifications per surface |
| Accessibility | Composer STT toggle |
| Hotkeys | Full shortcut reference |
| Jarvis Actions | Action preferences |
| About | Version, updater, release notes |
| Admin | Maintainer builds only |

### Key files
- `app/src/features/settings/SettingsModal.tsx`, `sections/*`

---

## 22. Account, Billing & Subscriptions

### What it is
Supabase auth, Stripe subscriptions, hosted AI credits, and voice/call buckets.

### How to use it
- Top-left **J** avatar → Account page
- **Settings → Plans** → upgrade via Stripe Checkout
- Manage billing via Stripe Customer Portal

### Plan ladder

| ID | Display | Price | Jarvis Call | Hosted AI |
|----|---------|-------|-------------|-----------|
| free | Spark | $0 | No | BYOK only |
| starter | Orbit | $10/mo | Yes | Credits |
| pro | Nova | $50/mo | Yes | More credits |
| ultra | Singularity | $100/mo | Yes | Highest |
| apex | Supernova | $200/mo | **Planned** | 2× Singularity |

- **Unlimited local Kokoro** on every plan.
- **Launch promo:** eligible accounts get one-time Deepgram credit.
- **Quota sliders** (reallocate credits/call/SMS): **planned**.

### Key files
- `app/src/features/account/AccountPage.tsx`
- `app/src/lib/entitlements.ts`, `lib/billing/`
- `docs/SUBSCRIPTION_PLANS_REFERENCE.md`

---

## 23. History & Benchmarks

### History
- **Route: History** — search past chats, replay with scrubber
- Read-only bubble stack replay; does not mutate live chats

### Benchmarks
- **Route: Benchmarks** — sortable LMArena-style leaderboard
- Falls back to frozen snapshot when live endpoint fails
- Can switch default provider from detail drawer

### Key files
- `app/src/features/history/`, `benchmarks/`

---

## 24. Ambient Mode & Wellness

### Ambient
- Auto takeover after idle threshold (Settings → Ambient)
- **Mod+Shift+.** manual toggle
- Plays ambient music tracks; clock display

### Wellness
- **Mod+Shift+A → eye break** — 20-20-20 rule overlay (~20s)
- Confetti celebrate on certain completions

### Key files
- `app/src/features/ambient/`
- `app/src/lib/actions/registry.ts` (`wellness.eyeBreak`)
- `app/src/features/celebrate/`

---

## 25. Media / Clock

### What it is
In-app clock, alarms, and timer sounds accessible from actions and ambient mode.

### How to use it
- Assistant: "call me at 3pm" (schedule integration)
- Clock tool panel via actions

### Key files
- `app/src/features/clock/clockStore.ts`, `clockEngine.ts`

---

## 26. Onboarding & What's New

### Onboarding
- First-launch wizard (feature overview, setup hints)
- `onboardingComplete` flag in UI store

### What's New
- Auto-opens once per version bump
- Static `RELEASES` array in `releases.ts` (offline-first)
- Megaphone in About for manual open

### Key files
- `app/src/features/onboarding/`
- `app/src/features/whats-new/WhatsNewModal.tsx`, `releases.ts`

---

## 27. Updates & Installer

### What it is
Signed silent updates via Tauri updater + one-line install scripts.

### How to use it
- **Settings → About** — check for updates, enable auto-install
- Windows: `irm …/install/install.ps1 | iex`
- macOS/Linux: `curl …/install/install.sh | bash`

### How it works (intended behavior)
- Updater checks GitHub Releases channel (`releases/channel.json`).
- Warns at 1h / 30m / 5m before auto-install; user can snooze.
- NSIS current-user install under `%LOCALAPPDATA%` on Windows.
- Production requires Authenticode signing + Tauri updater signing key.

### Key files
- `install/install.ps1`, `install/install.sh`
- `app/src/lib/updates.ts`
- `docs/09-jarvis-calling-account-release.md` §6–7

---

## 28. Security & Privacy

### Principles
- **Local-first:** chats, tasks, terminals in IndexedDB on device.
- **API keys:** OS keychain when available; never sent to terminals.
- **Wake word audio:** intended to stay on-device (design doc); verify per engine.
- **Admin env flags:** client-side convenience only — not server authorization.
- **RLS:** Supabase row-level security for cloud data.

### Key files
- `app/src-tauri/src/credentials.rs`
- `docs/security-production-checklist.md`
- `docs/TRUST_AND_WINDOWS.md`

---

## 29. Developer Console

### What it is
**Mod+Shift+D** or **F12** — internal debug panel logging routes, fetch, Tauri invoke, AI, and actions.

### How it works
- Non-rendering host at app root; captures events during onboarding too.
- Not intended for end users.

### Key files
- `app/src/features/dev-console/`

---

## 30. Planned / Incomplete Features

Honest inventory of gaps found in code/docs:

| Area | Status |
|------|--------|
| **Supernova (apex) tier** | Planned in docs; verify Stripe price IDs |
| **Quota sliders** | Planned — reallocate monthly pool |
| **Hive Custom preset UI** | Wired in store; custom step editor not fully exposed |
| **VibeBench** | Planned per `docs/HIVE.md` |
| **Mobile companion, browser extension, menu-bar app** | Vision docs only — not in desktop app |
| **S2S voice path (gpt-realtime)** | Design doc; cascade is what ships |
| **Many plugin catalog entries** | Marked Planned — only ~6 implemented |
| **Many ProviderId union members** | Types exist; verify UI wiring |
| **Council route re-wire** | PageRouter comment: council dispatch follow-up |
| **Cloud sync** | Partial; Dexie is source of truth locally |
| **Team/shared canvases** | Vision — not shipped |

---

## Keyboard Shortcuts (Quick Reference)

| Shortcut | Action |
|----------|--------|
| Mod+K | Command palette |
| Mod+J | Jarvis Assistant |
| Mod+Shift+A | Actions palette |
| Mod+B | Toggle nav |
| Mod+\ | Toggle inspector |
| Mod+T / Mod+W | New / close chat tab |
| Mod+Enter | Send message |
| Mod+Shift+Enter | Council broadcast |
| Mod+Space | Push-to-talk |
| Mod+, | Settings |
| Mod+Shift+L | Launcher |
| Mod+Shift+S | Schedule |
| Mod+Shift+. | Ambient toggle |
| Ctrl+CapsLock | Composer STT (in-app) |
| Ctrl+Space | VibeSpace global dictation overlay (never Win+H) |
| Mod+Shift+D / F12 | Dev console |

Full list: **Settings → Hotkeys**.

---

## Document Maintenance

When adding a user-facing feature:
1. Implement the feature
2. Add a `releases.ts` entry if shipping in a version bump
3. Update this guide under the appropriate section
4. Update `docs/AGENT_TESTING_GUIDE.md` feature matrix if QA-relevant

**Primary code entry points for discovery:**
- Routes: `app/src/components/layout/PageRouter.tsx`
- Features: `app/src/features/`
- AI: `app/src/lib/ai/`
- Native: `app/src-tauri/src/`
- Actions: `app/src/lib/actions/registry.ts`
