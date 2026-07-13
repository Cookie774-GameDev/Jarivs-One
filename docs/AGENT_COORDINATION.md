# VibeSpace â€” Agent Coordination Ledger

> **Single source of truth for multi-agent Cursor work.**  
> **Repo:** `C:\Users\viper\VibeSpace`  
> **Rule:** `.cursor/rules/agent-coordination.mdc` (always applied)

---

## Purpose

Prevent five concurrent Cursor agents from overwriting, reverting, or force-pushing each other's in-progress work. This document is the **coordination ledger**: read it before every task; update it after planning and after every significant action (commit, release, lock change).

---

## Rules

1. **Read first** â€” Open this file before any code change, commit, push, or release.
2. **Update after** â€” Append a work-log entry after planning and again after commit/release (or when abandoning work).
3. **Claim before edit** â€” Add rows to **File ownership / lock table** before touching shared areas.
4. **Never force-push** over another agent's in-progress branch or version without explicit user approval.
5. **Never revert** another agent's committed features without explicit user approval.
6. **One version target** â€” All agents work toward **Active version target** below unless the user directs otherwise.
7. **Release gate** â€” On "commit and push to next version", run the full verified release pipeline; **block publish on any error** (see [Release checklist](#release-checklist-reference)).
8. **Append-only log** â€” Do not delete or rewrite past work-log entries; add corrections as new entries.

---

## Active version target

| Field | Value |
|-------|-------|
| **Current released** | **v0.1.47** (2026-07-05) |
| **Next target** | **v0.1.48** |
| **Release channel** | `releases/channel.json` â†’ GitHub Releases |
| **Branch convention** | `main` for releases; feature branches optional with ledger note |

---

## Agent registry

| Agent | Role | Primary duties |
|-------|------|----------------|
| **VibeSpace Helper** | Coordinator / release | Commits, pushes, releases, Q&A, ledger upkeep, conflict resolution |
| **VibeSpace Main** | Primary development | Major fixes, architecture, cross-cutting refactors |
| **VibeSpace Worker 1** | Feature worker | Fixes, updates, isolated features |
| **VibeSpace Worker 2** | Feature worker | Fixes, updates, isolated features (parallel to Worker 1) |
| **VibeSpace Tester** | Cloud QA (read-only) | Run actual app, report pass/fail â€” **no commit/push/edits** |

**Division of labor:** Main owns broad design; Workers 1/2 own scoped tasks; Helper owns git/release/coordination; Tester validates only.

**Live dashboard:** Open `agent-command-center.canvas.tsx` in Cursor Glass (Agent Command Center).

## Live status board (2026-06-17 â€” corrected)

| Agent | Status | Current task | Conflict? |
|-------|--------|--------------|-----------|
| **VibeSpace Helper** | **Active** | Live board, coordination ledger, releases when asked | No |
| **VibeSpace Main** | **Active** | URGENT 4-fix terminal pass (distortion, white screen, scrollback, APPLE prompt) | **Yes** â€” vs Worker 1 on agent prompts |
| **VibeSpace Worker 1** | **Active** | URGENT provider/model dropdown registry (Hive screenshot â€” no manual Model ID) | **Yes** â€” vs Worker 2 on `lib/ai/**`, `auth.ts`, `Hive.tsx` |
| **VibeSpace Worker 2** | **Active** | Hands-free voice turn-taking + URGENT model selection persistence | **Yes** â€” vs Worker 1 on `lib/ai/**`, `auth.ts`; overwrites own StackPicker |
| **VibeSpace Tester** | Standby | Cloud read-only QA â€” not running now | No |

**4 of 5 agents active.** Tester is the idle 5th.

### Active conflicts (needs your decision)

1. **CRITICAL â€” Worker 1 â†” Worker 2** â€” Both edit `lib/ai/**` (providerRegistry vs modelSelection), `stores/auth.ts`, `Hive.tsx` with **no ledger locks**.
2. **HIGH â€” Main â†” Worker 1** â€” `agentPromptDelivery.ts` (terminals) vs `AgentManager.tsx` (agents UI) â€” APPLE test alignment.
3. **HIGH â€” install.ps1 deleted** â€” `install/install.ps1` deleted locally; `install_new.ps1` untracked â€” v0.1.43 UTF-8 installer at risk.
4. **HIGH â€” Worker 2 router rewrite** â€” `router.ts` âˆ’138 lines â€” may break v0.1.43 chat routing.
5. **MEDIUM â€” Ledger unused** â€” Only Main claimed locks; Workers never claimed before editing.

---

## Current work log

Append new entries at the **bottom** of the relevant agent section. Use [How to update this doc](#how-to-update-this-doc).

### Agent 1 — AGENT-1-20260710-132900-C9F2

#### 2026-07-10 — Safely finish PR #15 merge

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-10 13:29 CT |
| **Agent ID** | `AGENT-1-20260710-132900-C9F2` |
| **Version** | v0.1.48 |
| **Branch** | `cursor/vibespace-launch-polish-6d99` from `53edf3c`; merge base target `origin/main` at `cccf9b8` |
| **Plan** | Back up current main, audit PR #15/#16 and recent website/phone/billing work, merge main into PR #15, resolve every conflict conservatively, run the full verification matrix, push and merge normally only if all required gates pass, then verify final main. |
| **Affected systems** | Git history, desktop app, website/GitHub Pages, installers, phone/call flows, Stripe/Supabase source, CI/security checks |
| **Files touched** | `docs/AGENT_COORDINATION.md`, `docs/superpowers/plans/2026-07-10-pr15-safe-merge.md`; exact conflict-file locks will be added after read-only merge-tree discovery and before the merge |
| **Status** | blocked — required installer UTF-8 gate cannot be completed while Bitdefender holds the file; PR branch was not pushed and PR #15 was not merged |
| **Commit** | `7355bea` merge resolution; `4a00956` website follow-up; no final merge SHA |
| **Notes** | Root `SYSTEM_PROMPT.md` and root `AGENT_COORDINATION.md` were read from completed draft PR #17 because they are absent from current main/PR #15. PR #17 reports no active tasks and all locks released. No production Supabase/Stripe mutation is authorized. |

#### 2026-07-10 — PR #15 merge verification and blocked handoff

| Field | Value |
|-------|-------|
| **Conflict decisions** | `site/css/style.css`: kept main's newer nav structure and PR #15 focus/skip-link accessibility. `site/index.html`: kept main's expanded phone/call return flow, retained PR #15 dictation/skip-link copy, removed duplicate speech invocation. `site/js/phone-os.js`: kept main's expanded simulator and single `speechSynthesis` lifecycle. |
| **PR #16** | Verified `21cf29b`, `b71df22`, and `c82398d` are ancestors of PR #15; focused schedule runner tests passed 16/16. |
| **Website preserved** | Pages workflow, `site/CNAME` (`vibespaceos.com`), phone simulator/assets, PR #15 billing result pages, and Windows/macOS/Linux download hub preserved. Desktop/mobile browser checks passed with zero console errors; mobile document width 375/375 after root overflow fix. |
| **Frontend verification** | `npm run typecheck` PASS; `npm --prefix app run test` PASS (166 files, 881 tests); `npm run build` PASS (2,815 modules; existing chunk warnings); `npm run test:release-manifest` PASS (1/1). |
| **Rust verification** | `cargo check --manifest-path app/src-tauri/Cargo.toml --release` PASS with two dead-code warnings; `cargo test --manifest-path app/src-tauri/Cargo.toml --lib` PASS (11/11). |
| **Installer verification** | PowerShell AST parser PASS on committed UTF-16LE file; Bash syntax PASS; latest v0.1.45 release contains expected EXE, MSI, Apple/Intel DMG, AppImage, DEB, and RPM assets. Required UTF-8 check FAIL: committed `install/install.ps1` is UTF-16LE with BOM. Correct UTF-16LE-to-UTF-8 conversion was attempted, but Bitdefender Virus Shield locked the file before it could be verified/staged; no security process was stopped or bypassed. |
| **Security verification** | Secret-pattern scan PASS (976 tracked paths); `npm audit --omit=dev --audit-level=high` PASS (0 production vulnerabilities). Full `npm audit --audit-level=high` FAILS on pre-existing Vite/esbuild dev-server advisories requiring a breaking Vite upgrade. Canonical `supabase/` and billing/Supabase client trees match main. No production Supabase/Stripe action performed. |
| **Remaining risks** | PR #17 remains draft with unresolved Dependency Review and separate billing/call hardening. Current main/PR #15 retain known Twilio callback idempotency and Stripe persistence/JWT deployment risks documented in PR #17. Installer path must be unlocked and restored or correctly converted before any push/merge. |
| **Final status** | BLOCKED; no push, no PR update, no merge to main, no final main verification claim. All Agent 1 logical locks released below. |

#### 2026-07-10 — PR #15 final merge completed

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-10 15:18 CT |
| **Agent ID** | `AGENT-1-20260710-132900-C9F2` |
| **Task** | Complete PR #15 merge into `main` while preserving the current landing page/website. |
| **Final status** | complete — PR #15 merged normally into `main` with merge commit `37d240a050e7c12b1b65898ca75752b90b50b7dc`. |
| **Backup branch** | `backup/main-before-pr15-merge-20260710-agent1` preserved pre-merge `main` at `cccf9b8f6be436980a791278445880ec7e188e4e`. |
| **PR branch pushed** | `cursor/vibespace-launch-polish-6d99` fast-forwarded to `8216088950aadffdf7fe598489b31442687731bc`; no force push used. |
| **Conflict decisions** | Final user direction was to keep current `main` website/landing page exactly. The committed `site/` tree in the PR head and final `main` is `31e11795ed09631b3f24ba3fe7a52c5dd4e4b199`, matching pre-merge `main`; `git diff cccf9b8f6be436980a791278445880ec7e188e4e origin/main -- site` returned no changes. |
| **Verification** | Local: `npm run typecheck` pass; `npm --prefix app run test -- --run` pass (166 files, 881 tests); `npm run build` pass; `cargo check --manifest-path app/src-tauri/Cargo.toml --release` pass with warnings only; `cargo test --manifest-path app/src-tauri/Cargo.toml --lib` pass (11 tests); `npm run test:release-manifest` pass; `npm audit --omit=dev --audit-level=high` pass with 0 vulnerabilities; `git diff --check HEAD` pass. GitHub CI on PR #15: Frontend pass; Rust pass. |
| **Confirmed in main** | PR #15 head `8216088950aadffdf7fe598489b31442687731bc` is an ancestor of `origin/main`; PR #16 recovery commit `c82398d` is an ancestor of `origin/main`; final `origin/main` is `37d240a050e7c12b1b65898ca75752b90b50b7dc`. |
| **Security review** | Secret scan found only placeholders, docs examples, and environment-variable names; no live Stripe, Supabase, GitHub, Slack, or AWS secret values were committed. No production Supabase or Stripe settings were changed. |
| **Remaining risks** | `install/install.ps1` remains a known installer-delivery risk for the exact `irm ... | iex` path because the local antivirus lock blocked a verified UTF-8 conversion test. This merge did not change the installer file. Full macOS/Linux installer execution was not performed on native macOS/Linux hosts in this session. |
| **Locks** | Released for `site/**` and `docs/AGENT_COORDINATION.md` after this final record. |

### VibeSpace Helper

#### 2026-06-16 â€” UTF-8 install.ps1 hotfix + testing guide

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-16 (post v0.1.43 release) |
| **Version** | v0.1.43 (docs/install follow-up) |
| **Plan** | Restore UTF-8-safe `install/install.ps1`; add agent QA documentation |
| **Files touched** | `install/install.ps1`, `docs/AGENT_TESTING_GUIDE.md` |
| **Status** | committed |
| **Commit** | `023a69a` â€” `fix: restore UTF-8 install.ps1 and add agent testing guide` |

#### 2026-06-17 â€” Promote updater channel to v0.1.43

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 |
| **Version** | v0.1.43 (channel promote) |
| **Plan** | Push `releases/channel.json` 0.1.42 â†’ 0.1.43; archive manifest |
| **Files touched** | `releases/channel.json`, `releases/manifests/v0.1.43.json` |
| **Status** | committed + pushed |
| **Commit** | `484dfc8` â€” `Promote in-app updater channel to v0.1.43.` |

#### 2026-07-08 — React #185 + Ollama reliability (Helper / terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 6:35 AM CT |
| **Version** | v0.1.48 (next) |
| **Plan** | Fix React maximum update depth (#185) in Inspector/Composer/pickers; Ollama API-first connect without tray dependency; restore `install/install.ps1` before commit |
| **Files touched** | `Inspector.tsx`, `Composer.tsx`, `pickerScroll.ts`, picker typeaheads, `ChatActivityTimeline.tsx`, `InspectorMilestonesPanel.tsx`, `local_ai.rs`, `ollama.ts`, `OllamaConnectionHost.tsx`, `LocalModels.tsx`, `models.ts`, tests, coordination ledger |
| **Status** | committed + pushed |
| **Commit** | `f9676c6` — `fix: React #185 Inspector loops and Ollama API-first connect` |

#### 2026-07-08 — Features guide documentation (terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 |
| **Plan** | Create comprehensive `docs/FEATURES_GUIDE.md` (~70 features, 30 sections) |
| **Files touched** | `docs/FEATURES_GUIDE.md`, coordination ledger |
| **Status** | complete (saved locally; not committed) |

---

### VibeSpace Main

#### 2026-06-16 â€” v0.1.43 release (primary dev)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-16 |
| **Version** | v0.1.43 |
| **Plan** | Composer STT, workspace flush, Hive polish, voice/terminal improvements, version bump |
| **Files touched** | See **Committed this version** (92 files in release commit) |
| **Status** | released |
| **Commit** | `36fdbe5` â€” `Release v0.1.43: Composer STT, workspace flush, and Hive polish.` |

#### 2026-06-17 â€” Terminal production reliability pass

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 10:35 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix terminal route-switch distortion, white fallback risk, scrollback isolation, and terminal-agent prompt delivery |
| **Files touched** | `app/src/features/terminals/**`, `app/src/components/layout/PageRouter.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented locally; focused action/runtime/context tests, broader action/AI tests, typecheck, and edited-file lints passing |
| **Commit** | â€” |

#### 2026-06-17 â€” Terminal reliability follow-up from trace agents

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 11:28 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Add explicit terminal refits after layout transitions, WebGL context-loss recovery, Gemini instruction-file delivery, and CLI defaults for terminal agent panes |
| **Files touched** | `app/src/features/terminals/TileGrid.tsx`, `TileGrid.refit.test.tsx`, `TerminalView.tsx`, `TerminalsPage.tsx`, `TerminalsPage.command.test.ts`, `agentPromptDelivery.ts`, `agentPromptDelivery.test.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | in-progress |
| **Commit** | â€” |

#### 2026-06-18 â€” Terminal swarm coordination system

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 9:41 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Add opt-in coordinated terminal agent mode, no-context isolation, project-local coordination ledger, file-lock snapshots, and mode-aware CLI prompt delivery |
| **Files touched** | `app/src/features/terminals/**`, `app/src-tauri/src/agent_coordination.rs`, `app/src-tauri/src/lib.rs`, `docs/AGENT_COORDINATION.md` |
| **Status** | in-progress |
| **Commit** | â€” |

#### 2026-06-18 â€” Terminal swarm coordination implementation checkpoint

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 10:32 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Implemented typed coordination helpers, native `.vibespace` persistence commands, mode-aware prompt delivery, picker mode UI, and coordinated terminal registration/heartbeat |
| **Files touched** | `app/src/features/terminals/**`, `app/src-tauri/src/agent_coordination.rs`, `app/src-tauri/src/lib.rs`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented locally; frontend verification passing; native verification partially blocked by Windows Application Control policy |
| **Commit** | â€” |

#### 2026-06-18 â€” Terminal scrollback real-terminal behavior fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 11:10 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix terminal scroll-up lock and visual scrollback junk by separating xterm viewport behavior from transcript restore replay; preserve Jarvis transcript context and terminal coordination changes |
| **Files touched** | `app/src/features/terminals/TerminalView.tsx`, `restoreSession.ts`, `restoreSession.test.ts`, `transcriptStore.ts`, `terminalViewport.ts`, `terminalViewport.test.ts`, `TerminalsPage.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | in-progress |
| **Commit** | â€” |

#### 2026-06-18 â€” Terminal scrollback implementation checkpoint

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 11:23 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Implemented real-terminal scroll behavior: active attach skips visual transcript replay, dead OpenCode-in-shell replay is suppressed, output flush respects user scroll position, and reset forgets killed session transcripts |
| **Files touched** | `TerminalView.tsx`, `restoreSession.ts`, `restoreSession.test.ts`, `terminalViewport.ts`, `terminalViewport.test.ts`, `TerminalsPage.tsx`, `TerminalsPage.reset.test.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented locally; `npm run test -- src/features/terminals` and `npm run typecheck` passing |
| **Commit** | â€” |

#### 2026-06-18 â€” Jarvis chat action routing fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 12:58 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Make Jarvis chat produce approval-gated app action cards for commands like open five terminals, add chat-only concise action persona, and surface bounded coordination context |
| **Files touched** | `app/src/lib/actions/fallbackActions.ts`, `fallbackActions.test.ts`, `promptAddendum.ts`, `app/src/lib/ai/runtime.ts`, `runtime.test.ts`, `context.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented locally; focused action/runtime/context tests, broader action/AI tests, typecheck, and edited-file lints passing |
| **Commit** | â€” |

#### 2026-06-18 â€” Billing hardening and Hive Balance rollout

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 6:05 PM CT â†’ 6:55 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix apex tier schema gaps, wire Supabase Edge Function checkout/portal, remove "Available Soon" for wired paths, add Hive Balance 5-model pipeline, hide fast/quality/ultra/custom presets, coerce old stored presets safely, gate Balance behind paid plan |
| **Files touched** | `supabase/migrations/0027_apex_tier.sql` (new), `app/src/lib/supabase/types.ts`, `app/src/App.tsx`, `app/src/lib/billing/checkout.ts` (new), `app/src/lib/billing/checkout.test.ts` (new), `app/src/lib/supabase/apexTier.test.ts` (new), `app/src/features/settings/sections/Plans.tsx`, `app/src/features/settings/sections/Hive.tsx`, `app/src/features/billing/HostedJarvis.tsx`, `app/src/lib/ai/stacks/frontierModels.ts`, `app/src/lib/ai/stacks/presets.ts`, `app/src/lib/ai/stacks/presets.test.ts`, `app/src/lib/ai/stacks/hiveBalance.test.ts` (new), `DOWNLOAD.md` |
| **Status** | implemented locally; frontend stress pass complete; native/Supabase live checks blocked by local environment; no commit/push per user instruction |
| **Commit** | â€” (no commit per user instruction) |
| **Test evidence** | `npm run test` â†’ 107 files / 614 tests passed; `npm run typecheck` passed; `npm run build` passed; edited-file lints clean; `cargo test --lib` blocked by Windows Application Control policy; Supabase CLI not installed and `SUPABASE_DB_URL` missing |

---

### VibeSpace Worker 1

#### 2026-06-18 â€” Kanban page rebuild on milestone store

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Replace empty Dexie-task Kanban with full-page Inspector milestone board; shared zustand persist store |
| **Files touched** | `app/src/features/kanban/**`, `Inspector.tsx` (KanbanContextPanel) |
| **Status** | implemented locally; typecheck + kanban tests passing |
| **Commit** | â€” |

#### 2026-06-17 â€” Provider/model dropdown registry (URGENT)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 |
| **Version** | v0.1.44 |
| **Plan** | Replace manual Model ID typing with provider-aware dropdowns; providerRegistry; API-key gating; Hive screenshot fix |
| **Files touched** | `app/src/lib/ai/providerRegistry.ts`, `providerModelCatalog.ts`, `useProviderModelOptions.ts`, `app/src/components/ai/ProviderModelSelect.tsx`, `Hive.tsx`, `Providers.tsx`, `AgentManager.tsx`, `AgentDetail.tsx` |
| **Status** | in-progress |
| **Commit** | â€” |

---

### VibeSpace Worker 2

#### 2026-06-17 â€” Hands-free voice + model selection persistence (URGENT)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 |
| **Version** | v0.1.44 |
| **Plan** | voiceTurnCommit for hands-free turn-taking; model selection state persistence; no fake defaults |
| **Files touched** | `app/src/features/voice/voiceTurnCommit.ts`, `VoiceModal.tsx`, `Voice.tsx`, `app/src/lib/ai/modelSelection.ts`, `router.ts`, `runtime.ts`, `stores/auth.ts`, `Composer.tsx`, `StackPicker.tsx` |
| **Status** | in-progress |
| **Commit** | â€” |

#### 2026-06-17 â€” Voice module close + hands-free setting respect (URGENT)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 |
| **Version** | v0.1.44 |
| **Plan** | Instant speech stop on voice module close; session invalidation; wake word only in hands-free mode |
| **Files touched** | `voiceRouter.ts`, `streamingVoice.ts`, `WakeWordHost.tsx`, `wakeWord.ts`, `ui.ts`, `App.tsx`, `VoiceModal.tsx`, `runtime.ts`, tests |
| **Status** | committed (tests passing) |
| **Commit** | â€” |

#### 2026-06-18 â€” Top-bar mic â†’ composer STT (not Jarvis module)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Top-right mic button triggers chat composer speech-to-text; no Jarvis voice modal |
| **Files touched** | `TopBar.tsx`, `Composer.tsx`, `composerSttService.ts`, `stores/ui.ts` |
| **Status** | committed (tests passing) |
| **Commit** | â€” |

#### 2026-06-22 â€” Ambient music R2 keys + playback fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 |
| **Version** | v0.1.44 |
| **Plan** | Probe R2 for working MP3 keys; switch tracks to exact `jarvis-music-1.mp3`â€¦`jarvis-music-5.mp3` only (no invented slugs); remove `crossOrigin`; surface load errors in Settings â†’ Ambient |
| **Files touched** | `app/src/features/ambient/tracks.ts`, `ambientAudio.ts`, `tracks.test.ts`, `app/src/features/settings/sections/Ambient.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); R2 probe: **all keys 404** (bucket empty or wrong public domain); `tracks.test.ts` 4/4 GREEN; typecheck GREEN |
| **Commit** | â€” |

---
| **Files touched** | `app/src/lib/persistence/workspaceFlush.ts`, `app/src/features/chat/StackPicker.tsx`, `app/src/lib/ai/stacks/**`, `docs/HIVE_PIPELINE_SIMULATION_TIERS.md`, `docs/TERMINAL_PERSISTENCE_SHUTDOWN_UPDATE_TRAY.md` |
| **Status** | committed (in `36fdbe5`) |
| **Commit** | `36fdbe5` |

---

### VibeSpace Tester

#### 2026-06-17 â€” Cloud QA (read-only)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-17 |
| **Version** | v0.1.43+ |
| **Plan** | Validate app behavior via `npm run jarvis` or installed build â€” report only |
| **Files touched** | None (no edits) |
| **Status** | standby |
| **Commit** | â€” |

---

### Security Agent / Worker (slash UX)

#### 2026-07-11 — /permissions mode-only + active /multitask|/subagents chat styling

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:15 CT |
| **Agent ID** | `AGENT-SEC-20260711-131500-A7C3` |
| **Version** | v0.1.48 |
| **Branch** | `main` @ `ec56ef3` |
| **Plan** | (1) `/permissions` selection must change chat mode only — never attach a confirmed chip. (2) `/multitask` and `/subagents` user messages must render as **active commands in use** (distinct color/badge), not “attached” attachment language. Inspect before edit; tests + typecheck before claiming pass. |
| **Files touched** | `app/src/features/chat/Composer.tsx`, `MessagePart.tsx`, `chatActiveCommands.ts` (+tests), `MessagePart.activeCommand.test.tsx`, `app/src/features/jarvis-interaction/agentRunner.ts`, `agents.test.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | — |
| **Verification** | `vitest` 20/20 on focused suites (chatActiveCommands, MessagePart.activeCommand, agents, modes, ModeIndicator); `npm run typecheck` PASS. |
| **Risks / remaining** | Older chats still store “Slash command /X attached: …” text — parser still maps those to the new **In use** UI. Composer draft text for `/multitask` remains plain textarea until send (only the sent message is styled). |
| **Notes** | No terminals/voice/inspector/Hive changes. ModeIndicator Agent/Plan/Ask panel + `/permissions` slash retained. Locks released below. |

---

## File ownership / lock table

> **Current v0.1.44:** No active locks. Claim rows before editing.

| Path / area | Owner agent | Version | Status | Notes |
|-------------|-------------|---------|--------|-------|
| `app/src/features/settings/sections/AllAboutMe.tsx` | `AGENT-SEC-20260711-AAMUI` | v0.1.48 | released | Test popup UX polish |
| `app/src/features/settings/sections/AllAboutMe.test.tsx` | `AGENT-SEC-20260711-AAMUI` | v0.1.48 | released | Match new grade step + Ctrl+Enter |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-AAMUI` | v0.1.48 | released | This task |
| `app/src/features/chat/ChatThread.tsx` | `AGENT-SEC-20260711-SESSIONSCROLL` | v0.1.48 | released | Session panel scrolls with content |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-SESSIONSCROLL` | v0.1.48 | released | This task |
| `app/src/features/terminals/PaneToolbar.tsx` | `AGENT-SEC-20260711-TERMX` | v0.1.48 | released | Hold-confirm close X + clear fix |
| `app/src/features/terminals/holdToConfirm.ts` (+test) | `AGENT-SEC-20260711-TERMX` | v0.1.48 | released | Shared hold timing helper |
| `app/src/features/terminals/TerminalView.tsx` (standalone close chrome) | `AGENT-SEC-20260711-TERMX` | v0.1.48 | released | Same hold-confirm for non-tile chrome |
| `app/src/features/terminals/PaneToolbar.test.ts` | `AGENT-SEC-20260711-TERMX` | v0.1.48 | released | Existing font tests still pass |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-TERMX` | v0.1.48 | released | This task |
| `app/src/features/chat/chatUndoRedo.ts` (+test) | `AGENT-SEC-20260711-UNDOREDO` | v0.1.48 | released | Safe turn select + stacks |
| `app/src/features/chat/Composer.tsx` (undo/redo handlers) | `AGENT-SEC-20260711-UNDOREDO` | v0.1.48 | released | Wire /undo /redo |
| `app/src/features/chat/SlashCommandTypeahead.tsx` (+test) | `AGENT-SEC-20260711-UNDOREDO` | v0.1.48 | released | Catalog entries |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-UNDOREDO` | v0.1.48 | released | This task |
| `app/src/features/chat/ChatThread.tsx` | `AGENT-SEC-20260711-SESSIONUI2` | v0.1.48 | released | Pin session panel always at top |
| `app/src/features/chat/activity/ChatActivityTimeline.tsx` | `AGENT-SEC-20260711-SESSIONUI2` | v0.1.48 | released | Render empty idle dashboard |
| `app/src/features/chat/activity/ChatActivityTimeline.test.tsx` | `AGENT-SEC-20260711-SESSIONUI2` | v0.1.48 | released | Always-visible panel tests |
| `app/src/features/chat/Composer.tsx` (mode toast only) | `AGENT-SEC-20260711-SESSIONUI2` | v0.1.48 | released | Quiet mode switches |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-SESSIONUI2` | v0.1.48 | released | This task |
| `app/src/features/settings/sections/AllAboutMe.tsx` | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | Always-save test progress |
| `app/src/features/settings/sections/AllAboutMe.test.tsx` | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | Close/unmount save tests |
| `app/src/features/all-about-me/store.ts` | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | No change needed (persist already OK) |
| `app/src/features/jarvis-interaction/coordination.ts` (+test) | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | Chat coordination summary |
| `app/src/lib/ai/context.ts` (+test) | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | Merge chat+terminal coord into prompts |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-AAMCOORD` | v0.1.48 | released | This task |
| `app/src/features/jarvis-interaction/ModeIndicator.tsx` | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | Remove Shield from mode chip |
| `app/src/lib/ai/runtime.ts` (user identity + file/question overlays) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | Identity, defaults, question cards |
| `app/src/lib/ai/userIdentity.ts` (+test) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | displayName context block |
| `app/src/lib/actions/defaultWriteDir.ts` (+test) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | General write folder |
| `app/src/lib/actions/fallbackActions.ts` (+test) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | Default path when missing |
| `app/src/lib/actions/promptAddendum.ts` (file/question lines only) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | Stronger capability copy |
| `app/src/lib/ai/runtime.test.ts` (identity test only) | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | displayName injection |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-JARVISUX` | v0.1.48 | released | This task |
| `app/src/features/chat/Composer.tsx` (permissions chip paths only) | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Mode-only apply; no attach chip |
| `app/src/features/chat/MessagePart.tsx` (active slash render) | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Distinct multitask/subagents UI |
| `app/src/features/chat/chatActiveCommands.ts` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Parse/format active command messages |
| `app/src/features/chat/chatActiveCommands.test.ts` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Unit tests |
| `app/src/features/chat/MessagePart.activeCommand.test.tsx` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Active command render tests |
| `app/src/features/jarvis-interaction/agentRunner.ts` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Stop “attached” user message wording |
| `app/src/features/jarvis-interaction/agents.test.ts` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Expect active command message format |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-131500-A7C3` | v0.1.48 | released | Ledger + locks for this task |
| `docs/AGENT_COORDINATION.md` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Blocked handoff recorded; no final merge SHA |
| `docs/superpowers/plans/2026-07-10-pr15-safe-merge.md` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | High-risk merge execution plan |
| `.github/workflows/pages.yml` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Current GitHub Pages deployment behavior preserved |
| `site/CNAME` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | `vibespaceos.com` custom domain preserved |
| `site/css/phone-os.css` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Main-side phone simulator stylesheet preserved |
| `site/css/style.css` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Conflict resolved; main nav plus PR #15 accessibility retained |
| `site/download.html` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Compatibility redirect to clean route |
| `site/download/index.html` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Full cross-platform download hub |
| `site/images/phone-photo-*.png` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Main-side phone simulator photo assets preserved |
| `site/index.html` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Conflict resolved; landing/phone/accessibility/download behaviors retained |
| `site/js/icons.js` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Main-side simulator icons preserved |
| `site/js/motion.js` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Main-side site motion behavior preserved |
| `site/js/phone-os.js` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Conflict resolved to single speech lifecycle |
| `install/install.ps1` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Blocked by Bitdefender path lock; no verified installer commit produced |
| `site/**` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Final PR #15 app merge completed; current main website preserved byte-for-byte |
| `docs/AGENT_COORDINATION.md` | Agent 1 (`AGENT-1-20260710-132900-C9F2`) | v0.1.48 | released | Final push, checks, merge SHA, and lock release recorded |
| `app/src/features/terminals/**` | VibeSpace Main | v0.1.44 | in-progress | Urgent terminal stability, scrollback isolation, agent prompt delivery |
| `app/src/components/layout/PageRouter.tsx` | VibeSpace Main | v0.1.44 | in-progress | Keep terminal surfaces stable across route switches |
| `docs/AGENT_COORDINATION.md` | VibeSpace Main | v0.1.44 | in-progress | Coordination ledger for terminal reliability fix |
| `docs/FEATURES_GUIDE.md` | terminal 4 | v0.1.48 | complete | Comprehensive features inventory (~70 features, 30 sections) |
| `app/src-tauri/src/agent_coordination.rs` | VibeSpace Main | v0.1.44 | in-progress | Native atomic project-local terminal agent coordination ledger |
| `app/src-tauri/src/lib.rs` | VibeSpace Main | v0.1.44 | in-progress | Register terminal agent coordination commands only |
| `app/src/features/terminals/agentCoordination*` | VibeSpace Main | v0.1.44 | in-progress | Typed terminal swarm state, locks, summaries, and tests |
| `app/src/features/terminals/agentPromptPayload*` | VibeSpace Main | v0.1.44 | in-progress | Mode-aware terminal prompt payload builder |
| `app/src/features/voice/voiceRouter.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | Voice module lifecycle + instant speech stop on close |
| `app/src/features/voice/streamingVoice.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | Session-gated streaming TTS; no zombie playback |
| `app/src/features/voice/WakeWordHost.tsx` | VibeSpace Worker 2 | v0.1.44 | in-progress | Gate wake word on hands-free mode only |
| `app/src/features/voice/wakeWord.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | `isWakeWordAutoOpenAllowed` helper |
| `app/src/stores/ui.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | Sync voice open/close with lifecycle |
| `app/src/App.tsx` | VibeSpace Worker 2 | v0.1.44 | in-progress | VoiceModuleLifecycle backup sync |
| `app/src/features/voice/VoiceModal.tsx` | VibeSpace Worker 2 | v0.1.44 | in-progress | Close button instant stop |
| `app/src/features/voice/{WakeWordHost,VoiceModal,VoiceService}.ts*` | terminal 4 | v0.1.46 | complete (uncommitted) | User-directed narrow voice wake/send/reply bugfix; preserve Worker 2 lifecycle work |
| `app/src/lib/ai/runtime.ts` (voice reply only) | terminal 4 | v0.1.46 | complete (uncommitted) | User-directed voice reply release/error handling only |
| `app/src/components/layout/TopBar.tsx` | VibeSpace Worker 2 | v0.1.44 | in-progress | Top-bar mic â†’ composer STT (not Jarvis module) |
| `app/src/features/composer-stt/composerSttService.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | Toolbar STT toggle helper |
| `app/src/features/inspector/**` | VibeSpace Worker 2 | v0.1.44 | in-progress | Right-hand panel: Today, Quick Launch, Context, Tools Run, Trace milestones, Active Work |
| `app/src/components/layout/Inspector.tsx` | VibeSpace Worker 2 | v0.1.44 | in-progress | Inspector wiring for production-ready right panel |
| `app/src/features/launcher/launch.ts` | VibeSpace Worker 2 | v0.1.44 | in-progress | openExternal for Quick Launch URLs/apps/files |
| `app/src/features/kanban/**` | VibeSpace Worker 1 | v0.1.44 | in-progress | Rebuild Kanban on Inspector milestone store |
| `app/src/components/layout/Inspector.tsx` (KanbanContextPanel only) | VibeSpace Worker 1 | v0.1.44 | in-progress | Align inspector kanban strip with milestones |
| `app/src/features/skills/**` | VibeSpace Worker (skills) | v0.1.44 | in-progress | Unified skills catalog, SkillsPage editor, /skills picker |
| `app/src/lib/agents/skills.ts` | VibeSpace Worker (skills) | v0.1.44 | in-progress | resolveSkills delegates to unified catalog |
| `app/src/features/chat/Composer.tsx` (/skills only) | VibeSpace Worker (skills) | v0.1.44 | in-progress | /skills picker reads unified catalog |
| `app/src/lib/ai/runtime.ts` (skills block) | VibeSpace Worker (skills) | v0.1.44 | in-progress | getSelectedSkillsBlock via resolveCatalogSkills |
| `app/src/lib/actions/promptAddendum.ts` (skills list) | VibeSpace Worker (skills) | v0.1.44 | in-progress | Available skills section from catalog |
| `app/src/features/chat/SlashCommandTypeahead.tsx` | VibeSpace Worker (chat slash) | v0.1.44 | in-progress | Unified chat-context slash commands (no nav duplicates) |
| `app/src/features/chat/Composer.tsx` (slash handlers) | VibeSpace Worker (chat slash) | v0.1.44 | in-progress | /terminals /context attach-to-chat; alias normalization |
| `app/src/features/composer-stt/insertText.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | STT focus memory for toolbar/context mic |
| `app/src/features/ambient/**` | VibeSpace Worker (ambient) | v0.1.44 | in-progress | Fix Tokyo Glow R2 key (u_1 not u_l); restore 5 tracks; 15s preview; volume polish |
| `app/src/features/settings/sections/Ambient.tsx` | VibeSpace Worker (ambient) | v0.1.44 | in-progress | 15s preview button; volume live update; no URLs in UI |
| `app/src/features/schedule/**` | VibeSpace Worker (schedule) | v0.1.44 | complete (uncommitted) | Local OS datetime for start/end; timeline UI polish (icons, day groups) â€” schedule feature only |
| `app/src/features/composer-stt/GlobalSttHost.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Resolve last focused field on toolbar mic |
| `app/src/features/chat/Composer.tsx` (STT only) | terminal 4 | v0.1.44 | complete (uncommitted) | Composer mic focus + remembered textarea |
| `app/src/components/layout/JarvisContextMenu.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Right-click Microphone replaces Settings |
| `app/src/features/chat/Composer.tsx` (chat polish only) | terminal 4 | v0.1.44 | complete (uncommitted) | Agent mention tokens, slash/page reference tokens, /hive behavior; preserved STT and prior slash work |
| `app/src/features/chat/InputToken.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Warm confirmed command tokens and colored agent tokens |
| `app/src/features/chat/SlashCommandTypeahead.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Copy/category polish only; preserved Worker chat slash behavior |
| `app/src/features/chat/StackPicker.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Composer Hive picker exposes Single + Hive Balanced only |
| `app/src/lib/ai/runtime.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Short Jarvis chat overlay, chat project scoping, multi-agent mention context |
| `app/src/lib/ai/modelSelection.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Coerce legacy Hive selections to Balanced |
| `app/src/lib/ai/stacks/classifier.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Coerce legacy /hive preset tokens to Balanced |
| `app/src/lib/ai/stacks/benchmark.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Public Hive benchmark catalogue exposes Balanced only |
| `app/src/lib/ai/stacks/presets.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Verified exposed preset coercion; keep Balance only |
| `app/src/features/settings/sections/Hive.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Verified Hive Balanced-only UI; no legacy preset exposure |
| `app/src/features/whats-new/releases.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Removed old Hive tier copy from app-visible release notes |
| `app/src/lib/entitlements.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Updated plan copy to Hive Balanced routing |
| `app/src/lib/billing/checkout.ts` | terminal 4 | v0.1.44 | verified (unchanged) | Supabase Edge Function checkout and portal wiring unchanged |
| `app/src/lib/ai/runtime.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up focused test fix: chat project context lookup ordering |
| `app/src/lib/ai/modelSelection.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up focused test fix: Hive Balanced BYOK validation |
| `app/src/lib/agents/skills.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Replace 16 presets with five production skills |
| `app/src/features/skills/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Five-skill catalog UI, icons, migration tests |
| `app/src/lib/ai/types.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Multimodal LLM message contract |
| `app/src/lib/ai/providers/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Provider image payload mapping |
| `app/src/lib/ai/modelSelection.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Vision model gating while preserving Hive Balanced fix |
| `app/src/features/chat/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Image attach UX and Jarvis activity timeline |
| `app/src/features/inspector/InspectorMilestonesPanel.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Trace timeline uses chat activity feed |
| `app/src/features/chat/activity/ChatActivityTimeline.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Emergency fix: stable Zustand selector to stop React maximum update depth loop |
| `app/src/features/inspector/InspectorMilestonesPanel.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Emergency fix: stable activity selector derivation |
| `app/src/features/settings/sections/Plans.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Publish wording: explicit billing configuration state, no coming-soon fallback |
| `app/src/features/benchmarks/benchmarkData.ts` | Critic | v0.1.44 | complete (uncommitted) | Top 50 xlsx snapshot (2026-06-23); default curated load; cache v3 |
| `app/src/features/benchmarks/leaderboardSnapshot20260623.ts` | Critic | v0.1.44 | complete (uncommitted) | Generated 50-row LMArena export from user xlsx |
| `scripts/generate-leaderboard-snapshot.py` | Critic | v0.1.44 | complete (uncommitted) | Regenerate snapshot TS from xlsx |
| `app/src/components/layout/Inspector.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Publish wording: fallback panel reports unavailable slice instead of coming soon |
| `app/src/lib/billing/**`, `supabase/functions/**`, `supabase/migrations/0026_hive_ai_credits.sql` | terminal 4 | v0.1.44 | complete (uncommitted) | Publish hardening: Edge checkout only, webhook retry fix, Apex plan-limit constraint, legacy proxy retired |
| `app/src/features/dev-console/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Publish hardening: recursive redaction and capped debug payloads |
| `app/src/lib/fs.ts`, `app/src-tauri/src/fsread.rs`, `app/src/features/files/**`, `app/src/features/context/**`, `app/src/features/inspector/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Publish hardening: canonical FS paths and project-root containment for main file surfaces |
| `app/src/features/files/FileExplorerDialog.tsx` | AGENT-SEC-20260711-FILEPERF | v0.1.48+ | released | Large media preview/thumb throttle only |
| `app/src/features/files/fileExplorerMediaLimits.ts` | AGENT-SEC-20260711-FILEPERF | v0.1.48+ | released | Size/concurrency/auto-grid limits for explorer images |
| `app/src/features/files/fileExplorerMediaLimits.test.ts` | AGENT-SEC-20260711-FILEPERF | v0.1.48+ | released | Unit tests for media limits |
| `app/src/features/files/FileExplorerDialog.tsx` | AGENT-SEC-20260711-FILESEARCH | v0.1.48+ | released | Background mini-Jarvis search + text/image previews |
| `app/src/features/files/fileExplorerSearchRuntime.ts` | AGENT-SEC-20260711-FILESEARCH | v0.1.48+ | released | Persist search job/hits across dialog close |
| `app/src/features/files/fileExplorerSearchRuntime.test.ts` | AGENT-SEC-20260711-FILESEARCH | v0.1.48+ | released | Runtime store tests |
| `app/src/features/files/fileExplorerSearch.ts` | AGENT-SEC-20260711-FILESEARCH | v0.1.48+ | released | Export isTextPath for text preview only |
| `app/src/features/files/fileExplorerMediaLimits.ts` | AGENT-SEC-20260711-FILESEARCH | v0.1.48+ | released | Raise side-preview size so screenshots work |
| `app/src/features/chat/activity/**`, `app/src/features/chat/ChatThread.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Heavy-workflow guardrails: capped activity detail/diff payloads and bounded render size estimates |
| `app/src/features/all-about-me/**` | terminal 4 | v0.1.44 | complete (uncommitted) | AllAboutMe.md quiz, local profile document, and learning store |
| `app/src/features/settings/**`, `app/src/lib/ai/{context,runtime}.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Integrated All About Me settings tab and Jarvis runtime context/update cadence |
| `app/src/features/all-about-me/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: real model required, 25-question test, slash command options |
| `app/src/features/settings/sections/AllAboutMe.tsx`, `app/src/features/chat/{Composer,SlashCommandTypeahead}.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up UI and `/allaboutme` attach/edit/retake/force-update flow |
| `app/src/features/all-about-me/**` | terminal 4 | v0.1.44 | in-progress | Follow-up: 60-question popup test, autosaved draft, retake update prompts, destructive delete |
| `app/src/features/settings/sections/AllAboutMe.tsx`, `app/src/features/chat/Composer.tsx` | terminal 4 | v0.1.44 | in-progress | Popup test UI, model dropdown, saved progress, `/allaboutme retake` update flow |
| `app/src/features/all-about-me/**`, `app/src/features/settings/sections/AllAboutMe.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: glowing start button, one-question wizard, no preselected choices, locked-on learning copy |
| `app/src/lib/ai/runtime.ts`, `app/src/features/chat/activity/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: visible AllAboutMe chat-learning activity and file-written diff counts |
| `app/src/features/jarvis-creator/**` | terminal 4 | v0.1.44 | complete (uncommitted) | Jarvis-assisted draft helpers for agents and skills; no backend schema changes |
| `app/src/features/agents/AgentManager.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Add scoped Create with Jarvis entry/apply hook only; preserve provider/model editor behavior |
| `app/src/features/skills/{SkillsPage,SkillEditor,skillsStore}.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Add scoped Create with Jarvis entry/apply hook only; preserve existing skill catalog behavior |
| `app/src/components/layout/Inspector.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Add scoped Jarvis creator chat event handling only; preserve existing Inspector tabs/panels |
| `app/src/features/jarvis-creator/**`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/{SkillsPage,SkillEditor}.tsx` | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: creator buttons open Jarvis only, ask edit/create first, no auto-created drafts on click |
| `app/src/features/jarvis-creator/**`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/SkillEditor.tsx`, `app/src/features/chat/**` (Inspector hint only) | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: configured right-panel Jarvis creator chat, five-step prompts, temperature draft field, compact Inspector send hint |
| `app/src/features/jarvis-creator/**`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/SkillEditor.tsx`, `app/src/components/layout/Inspector.tsx` (Jarvis tab handoff only) | terminal 4 | v0.1.44 | complete (uncommitted) | Follow-up: reliable creator open when Inspector is closed; clean written-response mini-test instead of JSON-looking seed text |
| `app/src/features/jarvis-interaction/**`, `app/src/features/chat/{Composer,MessagePart,SlashCommandTypeahead}.tsx`, `app/src/lib/ai/runtime.ts`, `app/src/types/chat.ts` | terminal 4 | v0.1.44 | complete (uncommitted) | Jarvis interaction system: question cards, Ask/Plan/Agent modes, plan review, chat-native multitask agents, permissions, coordination locks |
| `app/src/features/jarvis-creator/**`, `app/src/features/jarvis-interaction/**`, `app/src/features/schedule/**`, `app/src/lib/actions/**`, `app/src/features/chat/Composer.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Current follow-up: creator question cards, `/multitask` parent command + slim activity card, event-backed Jarvis schedule actions, natural-language schedule fallback, `/schedule <subcommand>` chat routing |
| `app/src/features/chat/{Composer,SlashCommandTypeahead}.tsx`, `app/src/lib/ai/runtime.ts`, `app/src/features/jarvis-{creator,interaction}/**`, `app/src/features/schedule/**`, `app/src/lib/actions/**` | terminal 4 | v0.1.46 | complete (uncommitted) | Current bug-fix pass: queued chat messages, `/subagents`, safer shorter Jarvis prompting, creator 2-question flow, plan/subagent card polish, schedule Jarvis action UI |
| `app/src/features/jarvis-creator/contracts.ts`, `app/src/features/chat/MessagePart.tsx`, `app/src/features/{skills,agents}/*.jarvisCreator.test.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Follow-up: creator markdown replies now show an explicit Push to skill approval button and apply into the editor fields only after click |
| `app/src/features/jarvis-creator/**`, `app/src/features/chat/MessagePart.tsx`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/{jarvis-creator,chat,agents}/*.test.ts*` | terminal 4 | v0.1.46 | complete (uncommitted) | Extend explicit Push approval to agent markdown replies and strengthen creator prompt guidance |
| `app/src/lib/ai/providerModelCatalog.ts` | terminal 4 | v0.1.46 | complete (uncommitted) | Real-model dropdown catalog only; no stale custom option injection |
| `app/src/components/ai/ProviderModelSelect.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Connected provider/model dropdown only; no manual custom model entry |
| `app/src/features/agents/AgentManager.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Agent model dropdown connectivity only; preserved Jarvis creator approval work |
| `app/src/features/schedule/SchedulePage.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Jarvis Action model dropdown connectivity only; preserved schedule UI/action behavior |
| `app/src/features/settings/sections/AllAboutMe.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Grading model dropdown rejects stale saved model IDs |
| `app/src/lib/ai/{runtime,context}.ts` | terminal 4 | v0.1.46 | complete (uncommitted) | Jarvis punctuation mention routing, response sanitizing, focused runtime tests |
| `app/src/features/jarvis-interaction/**` | terminal 4 | v0.1.46 | complete (uncommitted) | Plan review parsing/build behavior only |
| `app/src/features/chat/{Composer,MessagePart}.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Agent mention context and plan card rendering verified unchanged |
| `app/src/features/jarvis-interaction/AgentActivityCard.*` | terminal 4 | v0.1.46 | complete (uncommitted) | Multitask/subagent active-work panel presentation only |
| `app/src/features/chat/activity/**` | terminal 4 | v0.1.46 | released unused | Inspected only; no code edits needed |
| `app/src/features/chat/ChatThread.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Connected multitask/subagent panel placement above composer |
| `app/src/features/chat/MessageBubble.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | Suppress standalone agent-card-only assistant bubbles |
| `app/src/features/chat/Composer.tsx` | terminal 4 | v0.1.46 | released unused | Inspected only; connector handled in chat panel/thread |
| `app/src/features/chat/{Composer,ChatThread,MessageBubble,QueuedMessagesBar,SlashCommandTypeahead}.*` | terminal 4 | v0.1.46 | complete (uncommitted) | User-directed `/multitask` and `/subagents` execution fix, chat-visible cards, queue polish |
| `app/src/features/jarvis-interaction/{AgentActivityCard,agentRunner,sessionStore,agents,types}.*` | terminal 4 | v0.1.46 | complete (uncommitted) | User-directed connected subagent state, panel close, child-chat click behavior |
| `app/src/lib/actions/**`, `app/src/features/jarvis-creator/**`, `app/src/features/chat/{MessagePart,MessageBubble,ChatThread}.tsx`, `app/src/features/jarvis-interaction/AgentActivityCard.*`, `app/src/features/kanban/**`, `app/src/features/inspector/{types,milestonesStore,InspectorMilestonesPanel}.ts*`, `app/src/features/schedule/**`, `app/src/features/local-models/OllamaConnectionHost.tsx`, `app/src-tauri/src/{lib,dictation}.rs` | terminal 4 | v0.1.46 | complete (uncommitted) | User master prompt follow-up: approval-gated creator actions, scoped push buttons, cleaner subagent panel, milestone details/deadline, Jarvis schedule no-reminder UI, Ctrl+Space native dictation |
| `app/src/features/composer-stt/**`, `app/src/features/voice/VoiceService.ts`, `app/src/features/chat/Composer.tsx`, `app/src/features/terminals/TerminalView.tsx` | terminal 4 | v0.1.46 | complete (uncommitted) | User master prompt follow-up: top-right mic stays STT-only and preempts hands-free Jarvis voice listening |
| `app/src/lib/ai/ollamaBootstrap.ts`, `app/src/lib/ai/providers/ollama.ts`, `app/src/lib/ai/testKey.ts` | VibeSpace Worker (terminal 4) | v0.1.48 | complete (uncommitted) | Ollama API-first connect (no tray); retries + model sync |
| `app/src/features/local-models/OllamaConnectionHost.tsx`, `app/src/features/auth/AuthGate.tsx` | VibeSpace Worker (terminal 4) | v0.1.48 | complete (uncommitted) | Background Ollama bootstrap retries |
| `app/src/features/settings/sections/LocalModels.tsx` | VibeSpace Worker (terminal 4) | v0.1.48 | complete (uncommitted) | Ollama unreachable error + recovery UI |
| `app/src-tauri/src/local_ai.rs`, `app/src-tauri/src/ollama_http.rs` | VibeSpace Worker (terminal 4) | v0.1.48 | complete (uncommitted) | Dead serve-child respawn; API ping hardening |

#### 2026-06-30 â€” Master prompt follow-up action polish

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-30 |
| **Version** | v0.1.46 |
| **Plan** | Fix confirmed gaps from the user master prompt without broad rewrites: approval-gated agent/skill creator launch actions, creator-only push buttons, cleaner connected subagent panel with explicit open-chat buttons, milestone description/deadline fields, Jarvis Action schedule span/no reminders, and Ctrl+Space native dictation. |
| **Files touched** | `app/src/lib/actions/**`, `app/src/features/jarvis-creator/**`, `app/src/features/chat/{MessagePart,MessageBubble,ChatThread}.tsx`, `app/src/features/jarvis-interaction/AgentActivityCard.*`, `app/src/features/kanban/**`, `app/src/features/inspector/{types,milestonesStore,InspectorMilestonesPanel}.ts*`, `app/src/features/schedule/**`, `app/src/features/local-models/OllamaConnectionHost.tsx`, `app/src-tauri/src/{lib,dictation}.rs`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); `npm run typecheck` GREEN; focused frontend tests GREEN 34/34; Rust Ctrl+Space dictation test GREEN 1/1 |
| **Commit** | â€” |

#### 2026-06-30 â€” Top-right mic hands-free STT follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-30 |
| **Version** | v0.1.46 |
| **Plan** | Fix the remaining master-prompt voice gap: top-right mic stays composer/native STT and takes exclusive mic ownership even when Jarvis hands-free voice is armed or already listening. |
| **Files touched** | `app/src/features/composer-stt/**`, `app/src/features/voice/VoiceService.ts`, `app/src/features/chat/Composer.tsx`, `app/src/features/terminals/TerminalView.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); RED tests verified for active Jarvis voice preemption and no-target safety; STT/wake tests GREEN 24/24; voice modal/router tests GREEN 14/14; terminal tests GREEN 178/178; chat tests GREEN 37/37; `npm run typecheck` GREEN |
| **Commit** | â€” |

#### 2026-06-26 â€” Jarvis voice wake/send/reply investigation

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 7:18 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Fix reported end-to-end Jarvis voice flow: wake word opens hands-free voice, "send it" submits once, replies speak back, and Jarvis speech does not re-trigger wake/listening. |
| **Files touched** | `app/src/features/voice/{WakeWordHost,VoiceModal,VoiceService}.ts*`, `app/src/lib/ai/runtime.ts`, focused tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); focused voice lifecycle tests GREEN 19/19; runtime tests GREEN 20/20; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite chunk/dynamic-import warnings; edited-file diagnostics GREEN |
| **Commit** | â€” |

#### 2026-06-26 â€” Make with Jarvis skill push approval

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 8:15 AM CT |
| **Version** | v0.1.46 |
| **Plan** | Fix Make with Jarvis skill handoff when local models return normal markdown instead of JSON: show an explicit Push to skill button, convert the markdown into a draft, and only write editor fields after approval. |
| **Files touched** | `app/src/features/jarvis-creator/contracts.ts`, `app/src/features/chat/MessagePart.tsx`, creator-focused tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused Vitest GREEN 16/16; `npm run typecheck` GREEN; edited-file diagnostics GREEN. |

#### 2026-06-26 â€” Make with Jarvis agent push approval

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 5:48 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Extend creator markdown fallback approval to agent drafts, keep editor mutation gated behind Push, and improve Jarvis creator prompt quality guidance for agents and skills. |
| **Files touched** | `app/src/features/jarvis-creator/**`, `app/src/features/chat/MessagePart.tsx`, `app/src/features/agents/AgentManager.tsx`, focused creator/chat/agent tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Edited-file diagnostics GREEN. `npm run typecheck` still RED on unrelated pre-existing typed-test issues in `ProviderModelSelect.test.tsx` and `SchedulePage.modelPicker.test.tsx`; creator/agent files no longer appear. Focused Vitest commands for creator/chat/agent returned no exit status in this subagent, so pass/fail could not be confirmed. Build skipped because typecheck is already RED. |

#### 2026-06-26 â€” Connected model dropdown pass

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 5:50 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Replace practical app-wide manual model ID entry points with connected real-provider dropdowns, using existing accessible model utilities and provider/Ollama state; add focused tests and run typecheck/build if feasible. |
| **Files touched** | `app/src/lib/ai/providerModelCatalog.ts`, `providerModelCatalog.test.ts`, `app/src/components/ai/ProviderModelSelect.tsx`, `ProviderModelSelect.test.tsx`, `app/src/features/agents/AgentManager.tsx`, `AgentManager.jarvisCreator.test.tsx`, `app/src/features/schedule/SchedulePage.tsx`, `SchedulePage.modelPicker.test.tsx`, `app/src/features/settings/sections/AllAboutMe.tsx`, `AllAboutMe.test.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite chunk/dynamic-import warnings; edited-file diagnostics GREEN; focused Vitest commands repeatedly returned no exit status, so pass/fail could not be confirmed |
| **Commit** | â€” |

#### 2026-06-26 â€” Jarvis chat runtime context fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 5:52 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Fix Jarvis/@agent runtime context, Plan Mode duplication, informational Build Plan handling, and response prompt-leak sanitizing with focused tests. |
| **Files touched** | `app/src/lib/ai/runtime.ts`, `runtime.test.ts`, `runtimeSafety.test.ts`, `app/src/features/jarvis-interaction/{types,planParser,PlanReviewCard}.ts*`, focused tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); edited-file diagnostics GREEN; shell runner returned no exit status for focused tests/typecheck attempts |
| **Commit** | â€” |

#### 2026-06-26 â€” Multitask activity panel polish

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 7:20 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Polish the chat-native multitask/subagent activity UI into a compact collapsible active-work panel with working indicators, file metadata, diff counts, and safe dismiss controls; keep runtime/plan behavior unchanged. |
| **Files touched** | `app/src/features/jarvis-interaction/AgentActivityCard.tsx`, `app/src/features/jarvis-interaction/AgentActivityCard.test.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); focused panel tests GREEN 3/3; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN |
| **Commit** | â€” |

#### 2026-06-26 â€” Connected chat subagent panel follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 11:15 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Move the multitask/subagent panel onto the active chat thread so `/multitask` and `/subagents` share one connected-to-chat panel near the composer; suppress duplicate standalone agent-card bubbles. |
| **Files touched** | `app/src/features/jarvis-interaction/AgentActivityCard.tsx`, `AgentActivityCard.test.tsx`, `app/src/features/chat/ChatThread.tsx`, `ChatThread.agentPanel.test.tsx`, `MessageBubble.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); connected panel focused tests GREEN 5/5; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN |
| **Commit** | â€” |

#### 2026-06-27 â€” Screenshot-accurate connected agent panel

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-27 1:25 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Refine the connected multitask/subagent chat panel to match the new orange mockup: fused composer connector, orange glow, indexed agent rows, nested subagent-style rows, progress/wave animations, header controls, and focused tests. |
| **Files touched** | `app/src/features/jarvis-interaction/AgentActivityCard.tsx`, `AgentActivityCard.test.tsx`, `app/src/features/chat/ChatThread.tsx`, `ChatThread.agentPanel.test.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); focused visual panel tests GREEN 5/5; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN |
| **Commit** | â€” |

#### 2026-06-27 â€” Subagent slash execution fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-27 2:02 PM CT |
| **Version** | v0.1.46 |
| **Plan** | Fix `/multitask` and `/subagents` typo variants so they create real chat-visible parent/subagent rows without navigating to child chats; refine queued messages and connected panel close behavior. |
| **Files touched** | `app/src/features/chat/**`, `app/src/features/jarvis-interaction/**`, focused tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); focused interaction tests GREEN 17/17; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN |
| **Commit** | â€” |
| **Verification** | `npm run test -- src/features/chat/SlashCommandTypeahead.test.ts src/features/jarvis-interaction/agents.test.ts src/features/jarvis-interaction/AgentActivityCard.test.tsx src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/QueuedMessagesBar.test.tsx`; `npm run typecheck`; `npm run build`; ReadLints on edited files |

#### 2026-06-25 â€” Jarvis queue, subagents, safety, and schedule action follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-25 9:18 AM CT |
| **Version** | v0.1.46 |
| **Plan** | Fix chat spam by queueing messages during active Jarvis runs; add `/subagents` and typo normalization; stop credential-request responses; simplify Make with Jarvis to two questions; widen plan review cards; keep subagent cards live; add Jarvis Action creation tab on Schedule. |
| **Files touched** | `app/src/features/chat/{Composer,QueuedMessagesBar,SlashCommandTypeahead}.*`, `app/src/features/jarvis-creator/**`, `app/src/features/jarvis-interaction/**`, `app/src/features/schedule/SchedulePage.tsx`, `app/src/lib/ai/runtime.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused Vitest GREEN 27/27; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN. Full `src/lib/ai/runtime.test.ts` remains a pre-existing brittle suite that currently exits before `runAgent`; safety behavior is covered by `runtimeSafety.test.ts`. |

#### 2026-06-24 â€” Jarvis creator and schedule command follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-24 10:04 AM CT |
| **Version** | v0.1.46 |
| **Plan** | Repair Make with Jarvis creator UX to use Cursor-style question cards; make `/multitask` appear as a normal parent chat command; add slimmer activity cards with file/read/edit/diff metadata; implement first event-backed Jarvis schedule action layer and chat routing. |
| **Files touched** | `app/src/features/jarvis-creator/**`, `app/src/features/jarvis-interaction/**`, `app/src/features/schedule/**`, `app/src/lib/actions/**`, `app/src/features/chat/Composer.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused Vitest GREEN 30/30; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN. |

#### 2026-06-24 â€” Jarvis interaction system

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-24 9:24 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Implement chat-native Jarvis interaction layer from attached plan: structured question cards, per-chat modes, plan review, permissions, `/ask` `/plan` `/multitask`, child chat agents, and project-backed coordination lock helpers. |
| **Files touched** | `app/src/features/jarvis-interaction/**`, `app/src/features/chat/{Composer,MessagePart,SlashCommandTypeahead}.tsx`, `app/src/lib/ai/runtime.ts`, `app/src/types/chat.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused `jarvis-interaction` Vitest GREEN 26/26; `npm run typecheck` GREEN; `npm run build` GREEN with existing Vite dynamic-import/chunk warnings; edited-file diagnostics GREEN. |

#### 2026-06-22 â€” Jarvis skills, vision chat, activity timeline

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 |
| **Version** | v0.1.44 |
| **Plan** | Replace 16 random skills with five strong skills; add model-gated image chat; add Jarvis activity/diff timeline |
| **Files touched** | `lib/agents/skills.ts`, `features/skills/**`, `features/chat/**`, `lib/ai/**`, `features/inspector/InspectorMilestonesPanel.tsx` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused Vitest 39/39 after review fixes; full Vitest 664/664; typecheck passed; production build passed; cargo check passed |

#### 2026-06-22 â€” Emergency publish crash and placeholder sweep

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 12:04 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix reported `Maximum update depth exceeded` in Jarvis activity timeline; remove app-visible coming-soon billing/Inspector fallback copy; run publish-focused verification and parallel audits. |
| **Files touched** | `ChatActivityTimeline.tsx`, `InspectorMilestonesPanel.tsx`, `Plans.tsx`, `HostedJarvis.tsx`, `Inspector.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); parallel publish-readiness audits running |
| **Commit** | â€” |
| **Verification** | Focused activity/runtime/billing tests GREEN; typecheck GREEN; full Vitest 664/664 GREEN; production build GREEN; browser smoke at `localhost:5173` loaded chat without React loop error |

#### 2026-06-22 â€” Publish audit remediation follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 12:48 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Remediate completed publish-readiness audit blockers: static checkout/orphan subscription risk, webhook retry idempotency, Apex plan-limit constraint, legacy proxy error passthrough, debug log redaction, file IPC containment, activity/diff payload caps, and stale release copy. |
| **Files touched** | `app/src/lib/billing/**`, `app/src/features/settings/sections/Plans.tsx`, `app/src/features/account/AccountPage.tsx`, `app/src/features/billing/HostedJarvis.tsx`, `supabase/functions/{stripe-webhook,jarvis-proxy,stack-complete}/index.ts`, `supabase/migrations/0026_hive_ai_credits.sql`, `app/src/features/dev-console/**`, `app/src/lib/fs.ts`, `app/src-tauri/src/fsread.rs`, `app/src/features/{files,context,inspector,chat}/**`, `app/src/features/whats-new/releases.ts`, `.env.example`, `supabase/README.md`, `docs/09-jarvis-calling-account-release.md`, `docs/AGENT_TESTING_GUIDE.md`, `Setup_Guide_0.1.3.html` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused Vitest 44/44 GREEN then 23/23 GREEN after root-arg update; `npm run typecheck` GREEN; full `npm run test` GREEN; `npm run build` GREEN; `cargo check` GREEN with 3 pre-existing warnings; edited-file lints GREEN; production-source scan found only redaction regex/test fixtures plus historical research/progress wording for placeholder terms |

#### 2026-06-22 â€” AllAboutMe.md profile feature

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 4:14 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Add integrated All About Me quiz, AI/fallback markdown generation, private local `AllAboutMe.md` store, Jarvis runtime context injection, and 10-message chat-learning updates. |
| **Files touched** | `app/src/features/all-about-me/**`, `app/src/features/settings/sections/AllAboutMe.tsx`, `AllAboutMe.test.tsx`, `app/src/features/settings/SettingsModal.tsx`, `settingsPrefetch.ts`, `app/src/lib/ai/runtime.ts`, `runtime.test.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | AllAboutMe focused tests 29/29 GREEN; edited-file lints GREEN; `npm run typecheck` GREEN; `npm run build` GREEN with existing chunk warnings; full `npm run test` GREEN 123 files / 680 tests. |

#### 2026-06-22 â€” AllAboutMe.md test + slash follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 6:26 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Convert Settings All About Me into a real-model-gated 25-question test; send full question/answer data to AI; add `/allaboutme` attach/edit/retake/force-update options with 10-message guard. |
| **Files touched** | `app/src/features/all-about-me/**`, `app/src/features/settings/sections/AllAboutMe.tsx`, `app/src/features/chat/Composer.tsx`, `SlashCommandTypeahead.tsx`, `app/src/lib/ai/runtime.ts`, tests |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused AllAboutMe/chat/runtime tests GREEN 44/44; `npm run typecheck` GREEN; `npm run build` GREEN with existing chunk warnings; full `npm run test` GREEN. |

#### 2026-06-23 â€” Deep-ember Hive glow + guaranteed picker motion (terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:24 AM CT |
| **Version** | v0.1.44 |
| **Plan** | User: way darker + warmer; picker entry had no visible effect. Dropped composer/bubble lightness to deep-ember (bg ~hsl(16 56% 8%), warm hues 12â€“28), kept readable flowing gradient words. Replaced the arbitrary-utility picker sheen with a dedicated `.hive-picker-entry` CSS class (dark ember moving base + bright travelling sheen via `hive-warm-flow`) so motion is guaranteed to render. Updated HTML preview palette to match. |
| **Files touched** | `app/src/styles/globals.css` (`[data-hive-active]`, `.hive-response-glow`, new `.hive-picker-entry`), `app/src/features/chat/ModelPickerTypeahead.tsx`, `previews/hive-glow-preview.html` |
| **Status** | complete (uncommitted) â€” verification still blocked: shell returning no exit status all session, could not run typecheck/test/build |
| **Commit** | â€” |

#### 2026-06-23 â€” Darker cozy moving Hive glow + gradient-word bubble + HTML preview (terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:12 AM CT |
| **Version** | v0.1.44 |
| **Plan** | User feedback: composer too light + colours not visibly moving; picker entry showed no motion. Reworked composer to a DARK field with a single warm band that sweeps across (clearly moving, cozy, not a bright flat fill); restrained ring brightness. Made model-picker Hive sheen brighter + continuous (`hive-warm-flow`). Hive response bubble is now darker/cozy with words rendered in a flowing warm gradient (`.hive-words` background-clip:text). Added standalone HTML preview at `previews/hive-glow-preview.html` (network not wired yet). |
| **Files touched** | `app/src/styles/globals.css`, `app/src/features/chat/MessageBubble.tsx`, `app/src/features/chat/MessagePart.tsx` (hiveWords prop), `app/src/features/chat/ModelPickerTypeahead.tsx`, `previews/hive-glow-preview.html` (new) |
| **Status** | complete (uncommitted) â€” verification blocked: shell environment returning no exit status all session, could not run typecheck/test/build |
| **Commit** | â€” |

#### 2026-06-23 â€” Premium Hive flowing-glow + response bubble (terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:06 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Brighten + add drifting warm-colour flow to the Hive composer halo and Hive model-picker entry; render Hive responses as a rounded premium bubble whose interior carries the same flowing warm gradient with readable text on top. |
| **Files touched** | `app/src/styles/globals.css` (composer halo + `hive-warm-flow` + `.hive-response-glow` bubble), `app/src/features/chat/MessageBubble.tsx` (Hive bubble container), `app/src/features/chat/ModelPickerTypeahead.tsx` (brighter Hive sweep) |
| **Status** | complete (uncommitted) â€” verification blocked: shell environment returning no exit status, could not run typecheck/test/build this session |
| **Commit** | â€” |

#### 2026-06-23 â€” Top 50 leaderboard from user xlsx (Critic)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 |
| **Version** | v0.1.44 |
| **Plan** | Import `top_50_ai_models_leaderboard_2026-06-23.xlsx` into Benchmarks page as curated Top 50 snapshot; default load shows xlsx data; Refresh still pulls live Wu Long API. |
| **Files touched** | `app/src/features/benchmarks/leaderboardSnapshot20260623.ts`, `benchmarkData.ts`, `benchmarkData.test.ts`, `scripts/generate-leaderboard-snapshot.py`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |

#### 2026-06-23 â€” Cozy Hive glow, calendar popup, benchmark modalities (terminal 4)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 10:51 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Re-color Hive composer halo to warm/cozy (no rainbow); add Hive-response warm glow; make Inspector Kanban To-do a collapsible dropdown; add interactive mini-calendar popup to Schedule + remove timezone label; Benchmarks chart top 25, table 50+ with expand-all, add open/closed + image/video modality column and rich hover tooltip + pricing enrichment. |
| **Files touched** | `app/src/styles/globals.css`, `app/src/features/chat/MessageBubble.tsx`, `app/src/components/layout/Inspector.tsx` (KanbanContextPanel To-do dropdown), `app/src/features/schedule/SchedulePage.tsx` (MiniCalendar + remove tz), `app/src/features/benchmarks/benchmarkData.ts` (modality/pricing enrich), `app/src/features/benchmarks/BenchmarksPage.tsx` (top 25, 50+ table, modality column/tooltip) |
| **Status** | complete (uncommitted) â€” verification blocked: shell environment returning no exit status, could not run typecheck/test/build this session |
| **Commit** | â€” |

#### 2026-06-23 â€” AllAboutMe quiz wizard + chat-learning transparency

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 10:18 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Polish AllAboutMe test into a glowing one-question popup wizard; remove preselected choice answers; keep chat learning visibly locked on; show Jarvis learning and AllAboutMe.md file-written diff activity after qualified chat learning updates. |
| **Files touched** | `app/src/features/all-about-me/**`, `app/src/features/settings/sections/AllAboutMe.tsx`, `AllAboutMe.test.tsx`, `app/src/features/chat/activity/ChatActivityTimeline.test.tsx`, `app/src/lib/ai/runtime.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused AllAboutMe/activity tests GREEN 28/28; `npm run typecheck` GREEN; `npm run build` GREEN with existing chunk/dynamic-import warnings; full `npm run test` still RED with existing voice/runtime harness failures (`VoiceModal.turn.test.tsx`, `runtime.test.ts`) â€” 684/704 passing. |

#### 2026-06-23 â€” Jarvis-assisted agent and skill creator

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:19 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Add Create with Jarvis flow for agents and skills: right-panel Jarvis helper chat asks five questions, Jarvis returns JSON, chat Apply draft buttons fill existing editors, and Save remains explicit. Reuse existing local/cloud sync paths; no new Supabase tables, Edge Functions, Stripe webhooks, or billing gates. |
| **Files touched** | `app/src/features/jarvis-creator/**`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/{SkillsPage,SkillEditor}.tsx`, `app/src/features/chat/MessagePart.tsx`, `app/src/components/layout/Inspector.tsx`, tests, `docs/superpowers/plans/2026-06-23-jarvis-assisted-agent-skill-creator.md`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | Focused creator/agent/skill/chat tests GREEN 22/22; `npm run typecheck` GREEN; `npm run build` GREEN with existing chunk/dynamic-import warnings; full `npm run test` still RED with existing voice/runtime harness failures (`VoiceModal.turn.test.tsx`, `runtime.test.ts`) â€” 698/718 passing. |

#### 2026-06-23 â€” Jarvis creator no-auto-create follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:35 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix user feedback: Create with Jarvis should be a cooler icon button on the current agent/skill editor, open right-panel Jarvis only, ask edit/create first, and never auto-create a draft on click. |
| **Files touched** | `app/src/features/jarvis-creator/contracts.ts`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/{SkillsPage,SkillEditor}.tsx`, creator tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | RED follow-up tests failed against old behavior; focused creator tests GREEN 15/15; `npm run typecheck` GREEN; edited-file lints GREEN. |

#### 2026-06-23 â€” Jarvis creator configured inspector flow

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 11:52 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix creator flow so the current agent/skill button opens the right Inspector Jarvis chat with current-item context, asks five configured steps, outputs agent temperature, fills drafts only, and uses compact `Ctrl+Enter` hint in the Inspector composer. |
| **Files touched** | `app/src/features/jarvis-creator/**`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/SkillEditor.tsx`, `app/src/components/layout/Inspector.tsx`, `app/src/features/chat/{Composer,composerSendHint}.ts*`, tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | RED tests failed against old behavior; focused creator flow tests GREEN 13/13; full creator focused tests GREEN 16/16; `npm run typecheck` GREEN; edited-file lints GREEN; `npm run build` GREEN with existing chunk/dynamic-import warnings. |

#### 2026-06-23 â€” Jarvis creator reliable Inspector launch

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 1:19 PM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix Create with Jarvis not opening the right Inspector when closed by adding a reliable launcher/pending-start handoff; replace JSON-looking seed text with a clean written-response mini test tailored to agent or skill editing. |
| **Files touched** | `app/src/features/jarvis-creator/{contracts,launcher}.ts`, `app/src/features/agents/AgentManager.tsx`, `app/src/features/skills/SkillEditor.tsx`, `app/src/components/layout/Inspector.tsx`, creator tests, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |
| **Verification** | RED tests failed against old behavior; reliable creator tests GREEN 12/12; full creator focused tests GREEN 18/18; `npm run typecheck` GREEN; `npm run build` GREEN with existing chunk/dynamic-import warnings. |

#### 2026-06-21 â€” STT mic focus + context menu dictation

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-21 |
| **Version** | v0.1.44 |
| **Plan** | Remember last STT-eligible field so toolbar/composer mic clicks work after focus moves; Jarvis context menu Microphone |
| **Files touched** | `insertText.ts`, `GlobalSttHost.tsx`, `Composer.tsx` (STT), `JarvisContextMenu.tsx`, tests |
| **Status** | complete (uncommitted); focused tests/typecheck/build GREEN |
| **Commit** | â€” |

#### 2026-06-21 â€” Unified chat slash commands (no action/nav duplicates)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-21 |
| **Version** | v0.1.44 |
| **Plan** | Merge duplicate slash entries (terminal/terminals, context/contextmap, files, skillspage). Chat attach commands open pickers; `/terminals task` passes remainder to AI without navigating. |
| **Files touched** | `SlashCommandTypeahead.tsx`, `Composer.tsx`, `SlashCommandTypeahead.test.ts`, `promptAddendum.ts` (one bullet) |
| **Status** | complete (uncommitted); 15/15 tests GREEN, typecheck clean |
| **Commit** | â€” |

#### 2026-06-18 â€” Skills system unification

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Unified catalog (16 presets + custom), SkillsPage inline editor, /skills picker + runtime resolve, localStorage persistence |
| **Files touched** | `features/skills/**`, `lib/agents/skills.ts`, `Composer.tsx`, `promptAddendum.ts` |
| **Status** | complete (uncommitted) |
| **Commit** | â€” |

#### 2026-06-18 â€” Right-hand inspector panel production pass

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Schedule/Open Tasks, Quick Launch fix, Context DnD+editor, Tools Run, Trace milestones, Active Work panel |
| **Files touched** | `features/inspector/**`, `Inspector.tsx`, `launch.ts`, `TileGrid.tsx`, `App.tsx` |
| **Status** | in-progress |
| **Commit** | â€” |

--- (CRITICAL â€” Worker 1 + Worker 2 both editing):** `app/src/lib/ai/**`, `app/src/stores/auth.ts`, `app/src/features/settings/sections/Hive.tsx`, `app/src/features/agents/**` (Worker 1 + Main overlap)

**How to claim:** Add a row with `Status: in-progress` before editing. Remove or set `Status: committed` after merge/commit.

---

## Committed this version (v0.1.43)

Do **not** revert or overwrite without user approval.

| Feature / area | Key paths | Commit(s) |
|----------------|-----------|-----------|
| **Composer STT** | `app/src/features/composer-stt/**`, `app/src-tauri/src/faster_whisper.rs`, Settings â†’ Composer STT | `36fdbe5` |
| **Workspace flush** | `app/src/lib/persistence/workspaceFlush.ts`, tray/shutdown hooks in `App.tsx` | `36fdbe5` |
| **Hive StackPicker + polish** | `app/src/features/chat/StackPicker.tsx`, `app/src/lib/ai/stacks/**`, `supabase/functions/stack-complete/` | `36fdbe5` |
| **Voice / terminal improvements** | `app/src/features/voice/**`, `app/src/features/terminals/**` | `36fdbe5` |
| **Local models expansion** | `app/src/features/settings/sections/LocalModels.tsx`, `app/src/lib/ai/localModelCatalog.ts` | `36fdbe5` |
| **UTF-8 install.ps1 fix** | `install/install.ps1` | `36fdbe5`, `023a69a` |
| **Agent testing guide** | `docs/AGENT_TESTING_GUIDE.md` | `023a69a` |
| **Release metadata** | `CHANGELOG.md`, `releases/RELEASE_NOTES_0.1.43.md`, version bumps in `package.json`, `app/package.json`, `tauri.conf.json`, `Cargo.toml` | `36fdbe5` |

**Release commits:** `36fdbe5`, `023a69a`

---

## Blocked / do-not-touch

| Item | Reason | Owner | Until |
|------|--------|-------|-------|
| *(none active)* | â€” | â€” | â€” |

### Known issues (not locks â€” coordinate before fixing)

| Issue | Notes |
|-------|-------|
| **`install/install.ps1` OS path lock on Windows** | UTF-8 rewrite landed in `023a69a`; Windows may still lock the script path during silent install or `irm \| iex`. Test with `docs/09-jarvis-calling-account-release.md` Â§6 smoke test before changing installer behavior. |

---

## Release checklist reference

Run **all** steps before tagging/pushing a new version. **Stop and fix on any failure** â€” do not publish.

| Step | Command / doc |
|------|----------------|
| Typecheck | `npm run typecheck` |
| Unit tests | `npm --prefix app run test` |
| Production build | `npm run build` |
| Release manifest | `npm run test:release-manifest` |
| Rust compile | `cd app/src-tauri && cargo check --release` |
| Windows release | `npm run release:windows` then `npm run release:stage` |
| UTF-8 installer | Verify `install/install.ps1` is UTF-8 (no BOM issues); smoke: `docs/09-jarvis-calling-account-release.md` Â§6 |
| Version bump | `package.json`, `app/package.json`, `app/src-tauri/Cargo.toml`, `tauri.conf.json`, `releases.ts`, `CHANGELOG.md`, release notes |
| Signing | `TAURI_SIGNING_*`, Authenticode per `docs/09-jarvis-calling-account-release.md` Â§6 |
| Pre-publish gate | `docs/09-jarvis-calling-account-release.md` Â§7 Verification checklist |
| QA reference | `docs/AGENT_TESTING_GUIDE.md` Â§7 Test Commands |

**Helper agent** owns running this pipeline on "commit and push to next version" requests.

---

## How to update this doc

### 1. Work-log entry (after planning or commit)

Add a new `####` subsection under the agent's **Current work log** section:

```markdown
#### YYYY-MM-DD â€” Short task title

| Field | Value |
|-------|-------|
| **Timestamp** | ISO or date |
| **Version** | v0.1.44 |
| **Plan** | One-line summary |
| **Files touched** | `path/a`, `path/b` or directory globs |
| **Status** | in-progress \| committed \| released \| abandoned |
| **Commit** | `abc1234` or â€” |
```

### 2. File lock (before editing)

Add a row to **File ownership / lock table**. Update **Status** when done.

### 3. New committed feature (after merge)

Add a row to **Committed this version** for the active target version.

### 4. Block another agent

Add a row to **Blocked / do-not-touch** with owner and expected completion.

### 5. Version bump

Update **Active version target**, roll **Committed this version** into CHANGELOG (already done in git), and start a fresh committed table for the new version.

---

*Maintained by all four agents. Last seeded: 2026-06-16 â€” v0.1.43 (`36fdbe5`, `023a69a`).*

---

### VibeSpace Worker 1 (subagent)

#### 2026-06-21 â€” Jarvis slash-surface targeting + close-terminal action bugfix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-21 08:44 AM CT |
| **Version** | v0.1.44 |
| **Plan** | (1) Add `terminal.bulkClose` registered action + queue plumbing. (2) Fix fallback detection for "close N terminals" + slash-prefix stripping. (3) Fix Composer route slash commands to pass remainder text to AI instead of discarding. (4) Update promptAddendum with surface-targeting and close guidance. |
| **Files touched** | `app/src/features/terminals/terminalCommandQueue.ts`, `app/src/features/terminals/TerminalsPage.tsx`, `app/src/lib/actions/registry.ts`, `app/src/lib/actions/fallbackActions.ts`, `app/src/lib/actions/promptAddendum.ts`, `app/src/features/chat/Composer.tsx`, `app/src/lib/actions/fallbackActions.test.ts`, `app/src/lib/ai/runtime.test.ts` |
| **Status** | implemented; 10/10 fallbackActions tests GREEN, 13/13 runtime tests GREEN, typecheck clean, no lints |
| **Commit** | â€” |

#### 2026-06-22 â€” Jarvis chat production polish pass

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 07:31 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Polish Jarvis chat responses, project/agent context, mention/slash confirmed tokens, /hive Balance-only behavior, and verify Supabase/Stripe billing wiring without overwriting STT or prior slash work. |
| **Files touched** | `Composer.tsx`, `InputToken.tsx`, `SlashCommandTypeahead.tsx`, `StackPicker.tsx`, `runtime.ts`, `modelSelection.ts`, `classifier.ts`, `benchmark.ts`, `presets.ts`, `Hive.tsx`, `releases.ts`, `entitlements.ts`, focused tests |
| **Status** | implemented locally; shell tool returned no exit status even for `echo`, so automated test/typecheck/build verification is blocked in this subagent |
| **Commit** | â€” |

#### 2026-06-22 â€” Runtime focused test follow-up

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 07:50 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix focused runtime regressions for chat project context scoping and legacy `/Hive quality` coercion; run focused tests, typecheck, and build if feasible. |
| **Files touched** | `app/src/lib/ai/runtime.ts`, `app/src/lib/ai/modelSelection.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); two failing runtime cases GREEN, parent focused suite GREEN, typecheck GREEN, build GREEN with existing Vite chunk/import warnings |
| **Commit** | â€” |

#### 2026-06-22 â€” Live Arena leaderboard (Wu Long API + Tauri HTTP allowlist)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 11:00 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix Benchmarks page stuck on 20-day-old snapshot: wire Wu Long Arena API via `nativeFetch`, add Tauri HTTP/CSP allowlist for `api.wulong.dev` + `lmarena.ai`, harden cache (v2 key, reject snapshot rows), Inspector panel uses live fetch + dynamic hint. |
| **Files touched** | `app/src/features/benchmarks/benchmarkData.ts`, `benchmarkData.test.ts`, `app/src/components/layout/Inspector.tsx`, `app/src-tauri/capabilities/default.json`, `app/src-tauri/tauri.conf.json`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented (uncommitted); benchmark tests GREEN |
| **Commit** | â€” |

#### 2026-06-22 â€” Kanban drag-and-drop + inspector to-do panel

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 10:00 AM CT |
| **Version** | v0.1.44 |
| **Plan** | Fix milestone drag between Todo/In progress/Done columns; add check-off on Kanban cards; Inspector Kanban strip shows synced To-do list with checkmarks and collapsible Recent milestones. |
| **Files touched** | `KanbanCard.tsx`, `KanbanColumn.tsx`, `KanbanPage.tsx`, `Inspector.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented (uncommitted); kanban tests GREEN |
| **Commit** | â€” |

#### 2026-06-23 â€” Hive-as-model + Kanban to-do/milestone redesign + schedule polish

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-23 10:40 AM CT |
| **Version** | v0.1.44 |
| **Plan** | (1) Hive settings â†’ single explanatory animated page, removed Off/Single. (2) Hive added as pinned top entry in chat model dropdown; removed StackPicker from composer; `/hive` now selects the Hive model. (3) Cozy animated rainbow halo on the chat box when Hive is the active model. (4) Kanban reworked into a daily To-do list + long-run Milestone list (no columns), in-place check-off, "New day" refresh, completion animations. (5) Schedule entrance animations + livelier header. |
| **Files touched** | `features/settings/sections/Hive.tsx`, `features/chat/Composer.tsx`, `features/chat/ModelPickerTypeahead.tsx`, `features/kanban/KanbanPage.tsx`, `features/inspector/types.ts`, `features/inspector/milestonesStore.ts`, `features/inspector/InspectorMilestonesPanel.tsx`, `components/layout/Inspector.tsx`, `features/schedule/SchedulePage.tsx`, `styles/globals.css`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented (uncommitted); tsc clean, build GREEN, touched-area tests GREEN (45/45). Pre-existing failures in `runtime.test.ts` + `VoiceModal.turn.test.tsx` are owned by other agents' in-progress `runtime.ts`/voice edits (not touched here). |
| **Commit** | â€” |

#### 2026-06-22 â€” Single model mode iconless

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 |
| **Version** | v0.1.44 |
| **Plan** | Remove SingleModelIcon; leave Single/Hive-off pickers text-only (Hive icon unchanged) |
| **Files touched** | `StackPicker.tsx`, `Composer.tsx`, `Hive.tsx`, `components/brand/index.ts`; deleted `SingleModelIcon.tsx` + test |
| **Status** | implemented (uncommitted) |
| **Commit** | â€” |


| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-22 |
| **Version** | v0.1.44 |
| **Plan** | Hide mock/mock-default from every user-facing model/provider selection path; keep router/onboarding skip mechanics unchanged |
| **Files touched** | `app/src/lib/ai/models.ts`, `models.test.ts`, `agentProviderOptions.ts`, `features/settings/sections/Providers.tsx`, `features/benchmarks/benchmarkData.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | implemented (uncommitted); models + agentProviderOptions tests GREEN |
| **Commit** | â€” |

#### 2026-06-18 â€” Schedule page local time + UI polish

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Use explicit local OS clock for datetime-local parse/format; polish Schedule timeline (day groups, per-event icons, timezone badge) without touching other features |
| **Files touched** | `app/src/features/schedule/SchedulePage.tsx`, `localDateTime.ts`, `scheduleIcons.ts`, `localDateTime.test.ts`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); typecheck GREEN; `localDateTime.test.ts` added |
| **Commit** | â€” |

#### 2026-06-18 â€” Ambient music: Tokyo Glow key + 5 tracks + 15s preview

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-18 |
| **Version** | v0.1.44 |
| **Plan** | Fix Tokyo Glow R2 object key (`u_1hjvnzqz68` not `u_lhjvnzqz68`); restore 5 named tracks; 15s settings preview; volume always updates engine; ambient feature only |
| **Files touched** | `app/src/features/ambient/tracks.ts`, `tracks.test.ts`, `ambientAudio.ts`, `app/src/features/settings/sections/Ambient.tsx`, `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted); track 5 â†’ `artmanzh-chill-lofi-hip-hop-background-music-in-d-minor-262654.mp3` |
| **Commit** | â€” |

#### 2026-06-26 â€” Ollama auto-connect on launch

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-26 |
| **Version** | v0.1.44 |
| **Plan** | Auto-bootstrap Ollama on app open (silent start on desktop, poll on web), sync local model catalog, sanitize bad endpoint URLs, re-check on window focus |
| **Files touched** | `ollamaBootstrap.ts`, `OllamaConnectionHost.tsx`, `providers/ollama.ts`, `App.tsx`, `LocalModels.tsx`, `Composer.tsx`, `lib/ai/index.ts`, tests |
| **Status** | implemented (uncommitted); `ollamaBootstrap.test.ts` GREEN (12 tests with ollama provider) |
| **Commit** | â€” |

#### 2026-06-29 â€” Ollama connect reliability fix

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-06-29 |
| **Version** | v0.1.44 |
| **Plan** | Bootstrap Ollama before auth gate; stop caching failed connects; retry until daemon up; Tauri ping-only (no 403 HTTP fallback); Providers test uses Rust bridge |
| **Files touched** | `ollamaBootstrap.ts`, `OllamaConnectionHost.tsx`, `AuthGate.tsx`, `providers/ollama.ts`, `testKey.ts`, `App.tsx`, tests |
| **Status** | implemented (uncommitted); 13 ollama tests GREEN |
| **Commit** | — |

#### 2026-07-07 — Ollama API-first connect (no tray dependency)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-07 5:55 PM CT |
| **Version** | v0.1.48 |
| **Plan** | Detect/connect via loopback `/api/version` only; respawn dead `ollama serve` child; API retry + timeout; LocalModels recovery UI |
| **Files touched** | `ollamaBootstrap.ts`, `providers/ollama.ts`, `OllamaConnectionHost.tsx`, `LocalModels.tsx`, `local_ai.rs`, `ollama_http.rs`, tests |
| **Status** | committed (bundled with React #185 fix, 2026-07-08) |
| **Commit** | see Helper 2026-07-08 entry |

#### 2026-07-05 — Release v0.1.46 (Helper)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-05 |
| **Version** | v0.1.46 |
| **Plan** | Full verified release: Ollama auto-connect, Jarvis creator, mock removal, Single icon removal, queued messages, All About Me, 799 tests GREEN, typecheck + build + cargo check |
| **Files touched** | `app/src/**`, `CHANGELOG.md`, `releases/RELEASE_NOTES_0.1.46.md`, `install/install.ps1`, coordination ledger |
| **Status** | releasing |
| **Commit** | — |

#### 2026-07-08 — v0.1.48 launch-polish pass (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 |
| **Version** | v0.1.48 |
| **Plan** | User master-prompt execution: scoped creator push buttons, one-question wizard, Jarvis schedule executor + output viewer + recurrence, grouped agent panel with durable dismissal, Jarvis One branding removal, Linux installer launch fix (verified on Linux cloud), version bump to 0.1.48 |
| **Files touched** | `app/src/features/chat/{MessageBubble,ChatThread.creatorScope.test}.tsx`, `app/src/features/jarvis-creator/contracts.ts`, `app/src/features/jarvis-interaction/{QuestionBlockCard,AgentActivityCard,types}.ts*` + tests, `app/src/features/schedule/{jarvisScheduleRunner,jarvisSchedules,hooks,SchedulePage}.ts*` + tests, `app/src/lib/ai/runtime.ts` (modelSelectionOverride only), `app/src/lib/actions/registry.ts` (recurrence options), `app/src/App.tsx` (runner wiring), `install/install.sh`, `install/install_new.ps1` (deleted), `tools/terminal_boot/jarvis_boot_forever.py`, version files, `CHANGELOG.md`, `releases/RELEASE_NOTES_0.1.48.md`, this ledger |
| **Status** | committed + pushed on feature branch (PR to main) |
| **Commit** | see branch `cursor/vibespace-launch-polish-6d99` |
| **Note** | `releases/channel.json` intentionally NOT promoted — no 0.1.48 binaries built/signed in cloud env. Latest published GitHub release remains v0.1.45; 0.1.46/0.1.47 were source releases only. |

#### 2026-07-08 — v0.1.48 batch 2: launch blockers (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 (afternoon) |
| **Version** | v0.1.48 |
| **Plan** | Remaining master-prompt blockers: terminal.orchestrate one-approval multi-step plans + role briefings via AGENTS.md, voice stop control + paused state + preview mic recovery, Kokoro launch honesty + download tests, Ctrl+Space overlay fallback (macOS/Linux), terminal update warning + queue stress tests, context-map root errors, website demo voice, Win/macOS installer validation (pwsh parse, macOS dry-run + SHA256 verify, asset URL 200s), live Ollama daemon verification |
| **Files touched** | `app/src/lib/actions/{registry,fallbackActions,promptAddendum,orchestrate.test}.ts`, `app/src/features/terminals/{terminalRoleBriefings*,terminalCommandQueue*,TerminalsPage,agentPromptDelivery}.ts*`, `app/src/features/voice/{VoiceModal*,voiceRouter,store,Orb,modelManager.download.test}.ts*`, `app/src/features/settings/sections/{About,Voice}.tsx`, `app/src/features/updates/UpdateWarningHost.tsx`, `app/src-tauri/src/lib.rs`, `app/src/features/global-dictation/**`, `app/src/features/context/tree*.ts`, `site/{index.html,js/dialogue.js,js/phone-os.js}`, release docs, this ledger |
| **Status** | committed + pushed on feature branch (PR #15) |
| **Commit** | see branch `cursor/vibespace-launch-polish-6d99` |
| **Verification notes** | Ollama daemon live on Linux VM: /api/version + /api/tags + pull OK; inference segfaults in sandbox (env limit). Windows NSIS run/signing and macOS Gatekeeper/notarization still require real machines — documented in `releases/RELEASE_NOTES_0.1.48.md`. |

#### 2026-07-08 — v0.1.48 secondary audit fixes (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 (evening) |
| **Version** | v0.1.48 |
| **Plan** | Final secondary audit: verify prior claims fresh; fix unconnected features (clock engine never started, WellnessBreak never mounted), council flag/agent gating, Hive chat-only enforcement for voice, plugin OAuth fake-success, keychain copy honesty, benchmark estimated-price labeling, About What's New entry, Mod+. inspector alias, site nav dark-glass fix + focus rings + skip link, package-lock 0.1.48 sync, stale doc comment |
| **Files touched** | `app/src/App.tsx`, `app/src/features/command-palette/{actions,useGlobalHotkeys}.ts*`, `app/src/features/plugins/{runtime,runtime.test,Plugins}.ts*`, `app/src/features/benchmarks/{benchmarkData,BenchmarksPage}.ts*`, `app/src/lib/ai/runtime.ts` (voice stack coercion), `app/src/features/settings/sections/About.tsx`, `app/src/features/whats-new/releases.ts`, `site/{index.html,css/style.css}`, `package-lock.json`, `CHANGELOG.md`, this ledger |
| **Status** | committed + pushed (PR #15) |
| **Verification** | Fresh: typecheck, 867 tests, build, cargo check, cargo test --lib 9/9, release-manifest, install parsers, site serve 200s, CSS brace check, secret scans clean |

#### 2026-07-08 — v0.1.48 global dictation correction + real media (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 (night) |
| **Version** | v0.1.48 |
| **Plan** | User correction: Ctrl+Space ALWAYS opens the VibeSpace dictation overlay (never Win+H); overlay now shares the chat STT pipeline (faster-whisper → Web Speech → Deepgram → Groq) with Retry/Clear/fix-path states; composer OS voice-typing demoted to explicitly-labeled last resort; hotkeys/settings/docs/site copy corrected; real app screenshots captured from the built bundle via new scripts/capture-screenshots.mjs; MEDIA_CAPTURE.md workflow; Composer mojibake fixed (visible "Get key ï¿½" banner) |
| **Files touched** | `app/src-tauri/src/{lib,dictation}.rs`, `app/src/features/global-dictation/{dictationSession(+test),GlobalDictationOverlay(+test)}.ts*`, `app/src/features/chat/Composer.tsx`, `app/src/features/settings/sections/{Accessibility,ComposerStt,Hotkeys}.tsx`, `app/src/lib/{hotkeys,callVoiceMarketing}.ts`, `app/src/features/voice/voiceRouter.ts` (web-preview toast gate), `scripts/capture-screenshots.mjs`, `docs/{MEDIA_CAPTURE.md,FEATURES_GUIDE.md,AGENT_TESTING_GUIDE.md,SUBSCRIPTION_PLANS_REFERENCE.md,plans/AI_CREDIT_BUCKET_AND_ULTRA_TIER.md}`, `docs/screenshots/{app-chat,app-schedule,app-context-map,dictation-overlay}.png`, `README.md`, `site/index.html`, `CHANGELOG.md`, `releases/RELEASE_NOTES_0.1.48.md`, whats-new, this ledger |
| **Status** | committed + pushed (PR #15) |
| **Verification** | 875 tests / 164 files GREEN; typecheck, build, cargo check, cargo test --lib 9/9, release-manifest, installer parsers, site+README asset checks, secret scan clean |

#### 2026-07-08 — v0.1.48 focus-aware dictation + security/payments audit (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-08 (late night) |
| **Version** | v0.1.48 |
| **Plan** | User correction: Ctrl+Space is focus-aware (in-app → composer STT for the focused input, outside → small overlay; never Win+H). Security/payments code audit: skill markdown image-scheme hardening, stale legacy webhook removed, portal error honesty, apex in Account ladder, site /billing success+cancel pages, npm audit fix (undici), entitlements doc truth. |
| **Files touched** | `app/src-tauri/src/lib.rs` (dictation_route + tests), `app/src/features/composer-stt/{GlobalSttHost(+test),composerSttService}.ts*`, settings copy (Accessibility/Hotkeys/Plans), `app/src/features/skills/markdownPreview(+test).ts`, `app/src/features/account/AccountPage.tsx`, `app/src/lib/entitlements.ts`, `site/{index.html,billing/**}`, README, CHANGELOG, release notes, whats-new, `docs/MEDIA_CAPTURE.md`, deleted `app/supabase/functions/stripe-webhook`, package-lock (audit fix) |
| **Status** | committed + pushed (PR #15) |
| **Verification** | 880 tests / 165 files GREEN; typecheck, build, cargo check, cargo test --lib 10/10, release-manifest, installer parsers, site serve incl. /billing pages, secret scans clean |
| **Known server-side gaps (deferred, external deploys needed)** | phone-jarvis `/livekit/token` + `/outbound/call` lack plan/budget checks; `stack-complete` has no per-tier model allowlist; hosted single-model chat labels exist while `message-complete` is not yet called by the app |

#### 2026-07-09 — Final cross-platform validation pass (Cloud Worker, branch `cursor/vibespace-launch-polish-6d99`)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-09 |
| **Version** | v0.1.48 |
| **Plan** | Validation-only checklist run: fresh full check battery, real Linux desktop boot of `tauri dev --features kokoro` under xvfb (app rendered onboarding, interactive clicks advanced steps, no panics), scripted browser boot validation (all routes + settings, zero console errors), site/billing asset checks, secret/stale-copy scans. One real blocker fixed: first-launch onboarding showed stale "Voltage v0.1" branding — now "VibeSpace v0.1.48" with Jarvis-is-the-assistant copy. |
| **Files touched** | `app/src/features/onboarding/steps/Welcome.tsx`, `scripts/boot-validation.mjs` (new), this ledger |
| **Status** | committed + pushed (PR #15) |
| **Verification** | 880 tests / 165 files GREEN post-fix; typecheck, build, cargo check/test, release-manifest, installers, site JS/CSS, secret scans all green. Desktop kokoro-feature build links after adding libstdc++ dev symlink (VM env gap, documented). |

#### 2026-07-05 — Release v0.1.47 official to main (Helper)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-05 1:20 PM CT |
| **Version** | v0.1.47 |
| **Plan** | Bump past v0.1.46; merge `test/local-update` → `main`; full release gate; push official production update |
| **Files touched** | version bumps (`package.json`, `Cargo.toml`, `tauri.conf.json`, `releases.ts`), `CHANGELOG.md`, `RELEASE_NOTES_0.1.47.md`, `docs/AGENT_COORDINATION.md` |
| **Status** | released |
| **Commit** | `d6e9bdc` — `Release v0.1.47: official production update on main.` |

#### 2026-07-10 — Equal terminal tiles + top-aligned prompt

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-10 23:15 CT |
| **Agent ID** | `AGENT-SEC-20260710-TERMSIZE` |
| **Version** | v0.1.48+ |
| **Plan** | (1) Equal tile tracks via flex-basis 0% + equal fr defaults. (2) Pin short terminal content to top (stop scrollToBottom pinning PS prompt to bottom). Do not touch clear/close/persistence/color. |
| **Files locked** | `TileGrid.tsx`, `terminalViewport.ts`, `terminalViewport.test.ts`, `TerminalView.tsx` (scroll follow only), `globals.css` (xterm top align only), `docs/AGENT_COORDINATION.md` |
| **Status** | in-progress |
| **Commit** | — |

#### 2026-07-11 — File explorer large media performance (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 11:07 CT |
| **Agent ID** | `AGENT-SEC-20260711-FILEPERF` |
| **Version** | v0.1.48+ |
| **Plan** | Stop file explorer from overloading the app on folders with many/large pictures: size-gate thumbs + side preview, cap concurrent image reads, limit auto-grid + max thumbs. **Only** explorer media loading — no other systems. |
| **Files locked** | `FileExplorerDialog.tsx`, `fileExplorerMediaLimits.ts` (+test), `docs/AGENT_COORDINATION.md` |
| **Status** | complete (uncommitted) |
| **Commit** | — |
| **Do not touch** | terminals, jarvis-creator, chat runtime, rust fsread limits, billing, installers |
| **Implementation** | New `fileExplorerMediaLimits.ts`: thumb ≤1.5 MiB, preview ≤4 MiB, max 2 concurrent image reads, max 24 grid thumbs, auto-grid only for 4–48 media items (larger folders stay list). `FileExplorerDialog` uses size gate + slot queue for tiles and side pane; large images show icon / “too large to preview”. |
| **Verification** | `npm run test -- --run src/features/files/fileExplorerMediaLimits.test.ts src/features/files/fileExplorerStore.test.ts src/features/files/fileExplorerSearch.test.ts` → 17/17 PASS. `npm run typecheck` → PASS. |
| **Risks / remaining** | Still loads full base64 for eligible thumbs (no server-side resize). Manual grid on 200-file folders is safe due to budget+concurrency but first 24 small images still load. Unknown-size entries still attempt load (backend `too_large` handles >8 MiB). |
| **Locks** | Released after this record. |

#### 2026-07-11 — Mini Jarvis search persist + previews (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 11:20 CT |
| **Agent ID** | `AGENT-SEC-20260711-FILESEARCH` |
| **Version** | v0.1.48+ |
| **Plan** | (1) Mini Jarvis search keeps running after explorer close; hits restore on reopen in the explorer list. (2) Fix text file preview + screenshot/image preview in the side pane. Scope: file explorer search/preview only. |
| **Files locked** | `FileExplorerDialog.tsx`, `fileExplorerSearchRuntime.ts`(+test), `fileExplorerSearch.ts` (isTextPath export), `fileExplorerMediaLimits.ts` (preview size), ledger |
| **Status** | in-progress |
| **Do not touch** | terminals, jarvis-creator, chat runtime, billing, rust fs commands (except via existing IPC), installers |

#### 2026-07-11 — Mini Jarvis search persist + previews COMPLETE

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 11:20 CT |
| **Agent ID** | `AGENT-SEC-20260711-FILESEARCH` |
| **Status** | complete (uncommitted) |
| **Implementation** | `fileExplorerSearchRuntime` module store: search job survives dialog close; hits/status/query restore on reopen and list in explorer; `loadDir` no longer wipes hits. Text preview via `readTextFileSample` + `isTextPath`; image/screenshot preview fixed (8 MiB side-pane cap, mime fallback, concurrency slot). |
| **Verification** | Focused tests 23/23 PASS (search runtime, search, media limits, store). `npm run typecheck` PASS. |
| **Risks** | In-flight walk is not hard-aborted (generation invalidates publish only). Images >8 MiB still blocked by native IPC. Search is process-local (not disk-persisted across app restart). |
| **Locks** | Released. |


#### 2026-07-11 — Advanced multi-clue mini Jarvis search + layout (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 11:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-SEARCHADV` |
| **Status** | complete (uncommitted) |
| **Problem** | Natural query for txt + Deepgram + API keys only scanned current folder (.android) and matched weak stopwords → wrong `context_map.json`. |
| **Implementation** | Advanced `parseSearchClues` (txt document NL, stopwords, multi-term AND, content sample 96KB, skip image/video content). Wide multi-root walk (Home/Documents/Desktop/Downloads + current; `here` for local). UI: Open folder status at top; Mini Jarvis search fixed at bottom. |
| **Files** | `fileExplorerSearch.ts`, `fileExplorerSearchRuntime.ts`, `FileExplorerDialog.tsx`, tests, ledger |
| **Verification** | Search tests 19/19 PASS; typecheck PASS. |
| **Risks** | Wide scans take longer; AppData/node_modules skipped; binary/PDF content not indexed; >4MB text name-only. |
| **Locks** | Released. |

#### 2026-07-11 — Advanced multi-clue mini Jarvis search + layout (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 11:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-SEARCHADV` |
| **Status** | complete (uncommitted) |
| **Problem** | Natural multi-clue query (txt + Deepgram + API keys) only scanned current folder (.android) and matched weak stopwords → wrong `context_map.json`. |
| **Implementation** | Advanced `parseSearchClues` (NL type, stopwords, multi-term AND). Content sample 96KB for text only (skip images). Wide multi-root walk (Home/Documents/Desktop/Downloads + current; `here` for local). UI: Open folder at top; Mini Jarvis search fixed at bottom. |
| **Files** | `fileExplorerSearch.ts`, `fileExplorerSearchRuntime.ts`, `FileExplorerDialog.tsx`, tests, ledger |
| **Verification** | Search tests PASS; typecheck PASS. |
| **Risks** | Wide scans slower; skips node_modules/AppData; no OCR on images; no PDF binary text. |
| **Locks** | Released. |

#### 2026-07-11 — File explorer date groups (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 12:30 CT |
| **Agent ID** | `AGENT-SEC-20260711-DATEGROUPS` |
| **Status** | complete (uncommitted) |
| **Problem** | Folder listings (e.g. Downloads) sorted A–Z only; user wanted OS-style sections Today / Yesterday / … |
| **Implementation** | `fileExplorerDateGroups.ts` groups by modified date (fallback created); list+grid show sticky section headers. Search hits stay score-ranked (no date buckets). `normalizeFsEntry` coerces string timestamps from native IPC. |
| **Files** | `fileExplorerDateGroups.ts`(+test), `FileExplorerDialog.tsx`, `lib/fs.ts`(+normalize test), ledger |
| **Verification** | Date-group + normalize + search + media tests 33/33 PASS; typecheck PASS. |
| **Risks** | If native metadata lacks times, falls back to A–Z. Week buckets use Sunday-start (Windows-style). |
| **Locks** | Released. |

#### 2026-07-11 — Search hit selection + preview fix (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 12:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-SEARCHSEL` |
| **Status** | in-progress |
| **Problem** | Clicking mini-Jarvis search hits does not select or preview (folder mode early-return in selectEntry). |
| **Plan** | Always allow file selection for preview in all modes; keep folder-confirm semantics; test selection helper. |
| **Files locked** | `FileExplorerDialog.tsx`, selection helper + test, ledger |
| **Do not touch** | terminals, chat, billing, rust, other features |

#### 2026-07-11 — Search hit selection + preview fix COMPLETE

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 12:45 CT |
| **Agent ID** | `AGENT-SEC-20260711-SEARCHSEL` |
| **Status** | complete (uncommitted) |
| **Problem** | Clicking mini-Jarvis search hits did nothing in folder mode (`selectEntry` early-returned for files). |
| **Implementation** | `fileExplorerSelection.ts`: files always selectable for highlight + preview in all modes; folder confirm still only commits folders/open path. Seed selection keeps user click among hits. |
| **Files** | `fileExplorerSelection.ts`(+test), `FileExplorerDialog.tsx`, ledger |
| **Verification** | Files feature tests 46/46 PASS; typecheck PASS. |
| **Risks** | In folder mode, selecting a file is preview-only (Select folder still uses open folder) — intentional. |
| **Locks** | Released. |

#### 2026-07-11 — Jarvis file/shell capabilities + session panel (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 12:55 CT |
| **Agent ID** | `AGENT-SEC-20260711-JARVISFS` |
| **Status** | complete (uncommitted) |
| **Problem** | Chat Jarvis refused file writes; activity panel only listed finished agents. |
| **Implementation** | (1) System overlays: desktop can `files.read` / `files.write` / `shell.powershell` / `terminal.run` after Approve; no false "can't write". (2) New actions `files.write`, `files.read`, `shell.powershell` + fallback infer for "make a file at path". (3) Activity header → session stats (edited files, +/- lines, tokens, start/duration, now-doing) + Collapse. (4) Edit/Read cards themed like Claude Code with VibeSpace copper styling + colored diffs. |
| **Files** | `runtime.ts`, `promptAddendum.ts`, `fallbackActions.ts`, `registryFiles.ts`, `registry.ts`, `ChatActivityTimeline.tsx`, `ToolCallCard.tsx`, `activity/types.ts`, tests |
| **Verification** | registryFiles + fallback + activity + runtimeSafety tests 24/24 PASS; typecheck PASS. |
| **Risks** | Tiny models may still refuse until fallback injects `files.write`; write capped ~1MB native; PowerShell opens a terminal pane (approval-gated). |
| **Locks** | Released. |

#### 2026-07-11 — Jarvis session stats panel polish (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:00 CT |
| **Agent ID** | `AGENT-SEC-20260711-SESSIONUI` |
| **Status** | complete (uncommitted) |
| **Change** | Top chat panel is a session dashboard: edited files, lines +/-, tokens in, tokens out, started time, running duration, now-doing, Collapse/Expand. Parses legacy token subtitles; expandable feed hides Done spam. Default collapsed. |
| **Files** | `ChatActivityTimeline.tsx`, activity tests/index, ledger |
| **Verification** | activity tests 7/7 PASS; typecheck PASS. |
| **Locks** | Released. |

#### 2026-07-11 — Queued message Start Multitask button (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:10 CT |
| **Agent ID** | `AGENT-SEC-20260711-QUEUEMT` |
| **Status** | complete (uncommitted) |
| **Change** | Each queued message has a copper-themed Multitask button that dequeues and runs `/multitask <text>` via existing slash handler (same as typing the command). |
| **Files** | `QueuedMessagesBar.tsx`(+test), `Composer.tsx` (wire only), ledger |
| **Verification** | QueuedMessagesBar tests 2/2 PASS; typecheck PASS. |
| **Risks** | Multitask still depends on jarvis agent being available; same limits as manual /multitask. |
| **Locks** | Released. |

#### 2026-07-11 — Slash command UX (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:20 CT |
| **Agent ID** | `AGENT-SEC-20260711-SLASHUX` |
| **Status** | complete (uncommitted) |
| **Change** | Confirmed slash chips with stronger glow/shine; mid-message slash detection; `/file` opens project file picker; `/clearfile(s)` clears files+images; inline utility slash extraction on send. |
| **Files** | `slashProjectFiles.ts`(+test), `SlashCommandTypeahead.tsx`(+test), `Composer.tsx`, `InputToken.tsx`(+test), ledger |
| **Verification** | 15/15 focused slash/token tests PASS; typecheck PASS. |
| **Risks** | Project file list capped (~250 files, depth 5); needs project root from Files. |
| **Locks** | Released. |

#### 2026-07-11 — Permissions mini panel + /permissions (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-PERMSUI` |
| **Status** | complete (uncommitted) |
| **Change** | Polished permissions chip next to model picker opens Full Access / Read only / Ask only panel. `/permissions` (and full/read/ask args) sets the same per-chat mode. Labels remapped from Agent/Plan/Ask. |
| **Files** | `ModeIndicator.tsx`(+test), `modes.ts`(+test), `Composer.tsx`, `SlashCommandTypeahead.tsx`, ledger |
| **Verification** | 16/16 mode/slash tests PASS; typecheck PASS. |
| **Risks** | Existing /ask and /plan still switch modes; multitask still forces Full Access. |
| **Locks** | Released. |

#### 2026-07-11 — Benchmarks Top 50 real Arena refresh (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 14:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-BENCH` |
| **Status** | complete (uncommitted) |
| **Change** | Replaced curated Top 50 with Arena AI text leaderboard data from Jul 10, 2026 (scores, votes, public $/M prices, context lengths). Updated pricing heuristics, SpaceXAI→xai mapping, cache key, public link to arena.ai. |
| **Files** | `leaderboardSnapshot20260710.ts`, `benchmarkData.ts`(+test), `BenchmarksPage.tsx`, removed `leaderboardSnapshot20260623.ts`, gen script |
| **Verification** | benchmarkData tests 6/6; typecheck PASS. |
| **Risks** | Live Wu Long API only returns ~20 models; full Top 50 is the curated snapshot until Refresh merges more. Prices marked estimated when filled from catalog. |
| **Locks** | Released. |

#### 2026-07-11 — AllAboutMe test UI polish (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 14:13 CT |
| **Agent ID** | `AGENT-SEC-20260711-AAMUI` |
| **Status** | complete (uncommitted) |
| **Change** | AllAboutMe test popup: top progress bar, faster choice auto-advance, Ctrl+Enter next, grading model only on final grade step, tighter chrome. Question text unchanged. Autosave preserved. |
| **Files** | `AllAboutMe.tsx`(+test), ledger |
| **Verification** | AllAboutMe settings tests 10/10; typecheck PASS. |
| **Risks** | Choice auto-advance is 120ms; rapid double-taps could skip if user fights the timer (cleared on new select). |
| **Locks** | Released. |

#### 2026-07-11 — Session panel scrolls with chat (not sticky) (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:40 CT |
| **Agent ID** | `AGENT-SEC-20260711-SESSIONSCROLL` |
| **Status** | complete (uncommitted) |
| **Change** | Jarvis session panel stays at top of every chat (always mounted) but lives inside the message scroller — no longer pinned/sticky while scrolling. |
| **Files** | `ChatThread.tsx`, ledger |
| **Verification** | ChatActivityTimeline + ChatThread tests 5/5; typecheck PASS. |
| **Locks** | Released. |

#### 2026-07-11 — Terminal X close hold-to-confirm (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:35 CT |
| **Agent ID** | `AGENT-SEC-20260711-TERMX` |
| **Version** | v0.1.48 |
| **Status** | complete (uncommitted) |
| **Change** | Terminal close X uses hold 1.5s → Confirm? (same as Clear). Shared ref-safe `holdToConfirm` controller; chrome buttons stopPropagation so tile drag doesn’t swallow presses. Standalone TerminalView chrome matches. |
| **Files** | `holdToConfirm.ts`(+test), `PaneToolbar.tsx`, `TerminalView.tsx` (standalone chrome), ledger |
| **Verification** | holdToConfirm 5/5; PaneToolbar 3/3; typecheck PASS. |
| **Risks** | Closing the last pane still resolves to a fresh leaf (by design). Must hold full 1.5s before Confirm appears. |
| **Locks** | Released below. |

#### 2026-07-11 — /undo and /redo last chat turn (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:30 CT |
| **Agent ID** | `AGENT-SEC-20260711-UNDOREDO` |
| **Version** | v0.1.48 |
| **Status** | complete (uncommitted) |
| **Change** | `/undo` safely removes last full turn (user + following assistant/tool/agent); posts “Undone.”; `/redo` restores LIFO per chat. Skips status msgs; blocks while Jarvis running; new user send clears redo stack. |
| **Files** | `chatUndoRedo.ts`(+test), `Composer.tsx` (handlers), `SlashCommandTypeahead.tsx`(+test), ledger |
| **Verification** | chatUndoRedo 9/9; SlashCommandTypeahead 9/9; typecheck PASS. |
| **Risks** | Redo stack is in-memory (cleared on full app reload). Does not reverse side effects of already-approved file/shell actions. |
| **Locks** | Released below. |

#### 2026-07-11 — Jarvis session panel always visible + quiet mode toasts (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:28 CT |
| **Agent ID** | `AGENT-SEC-20260711-SESSIONUI2` |
| **Version** | v0.1.48 |
| **Status** | complete (uncommitted) |
| **Change** | (1) Jarvis session panel always mounted at top of chat, pinned above the message scroller (not removed when empty/no events). (2) Removed toast popups for mode changes (ModeIndicator, Shift+Tab, /permissions, /ask, /plan). Mode chip still updates in place. |
| **Files** | `ChatThread.tsx`, `ChatActivityTimeline.tsx`(+test), `Composer.tsx` (mode toasts only), ledger |
| **Verification** | 12/12 focused tests PASS; typecheck PASS. |
| **Risks** | Panel takes a bit of vertical space on empty chats by design. Expand still defaults collapsed for the detail feed. |
| **Locks** | Released below. |

#### 2026-07-11 — AllAboutMe always-save + chat coordination diagnostic (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:24 CT |
| **Agent ID** | `AGENT-SEC-20260711-AAMCOORD` |
| **Version** | v0.1.48 |
| **Branch** | `main` @ `ec56ef3` |
| **Status** | complete (uncommitted) |
| **Change** | (1) AllAboutMe test autosaves every answer; close via X/Escape/overlay, Settings unmount, and pagehide all flush draft to store. (2) Verified AllAboutMe.md generation, 10-msg learning path in runtime (all Jarvis chats), store persist. (3) Chat coordination: `getJarvisCoordinationContextBlock` now merges terminal `.vibespace` summary + chat multitask ledger `.jarvis/agent-coordination.json` for every project chat. |
| **Files** | `AllAboutMe.tsx`(+test), `coordination.ts`(+test), `context.ts`(+test), ledger |
| **Verification** | AllAboutMe suite 25/25; settings AllAboutMe 8/8; coordination 4/4; context 5/5; runtime 21/21; typecheck PASS. |
| **Risks** | Chat coordination file requires a project root + fs write from multitask launch; browser-only preview may lack both ledgers. AllAboutMe profile is virtual vault path in UI (localStorage-backed), not a physical disk file unless exported later. |
| **Locks** | Released below. |

#### 2026-07-11 — Mode chip, user identity, file defaults, question cards (Security)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 13:22 CT |
| **Agent ID** | `AGENT-SEC-20260711-JARVISUX` |
| **Version** | v0.1.48 |
| **Branch** | `main` @ `ec56ef3` |
| **Status** | complete (uncommitted) |
| **Change** | (1) Removed Shield from mode chip (mode icon only). (2) Inject Settings `displayName` as user identity context for Jarvis. (3) Default write folder (Downloads→Documents→fallback) injected + fallback `files.write` when no path. (4) Overlay teaches `jarvis_question` cards for important clarifications; answers already return via `question_answers` structured context. |
| **Files** | `ModeIndicator.tsx`, `runtime.ts`(+test), `userIdentity.ts`(+test), `defaultWriteDir.ts`(+test), `fallbackActions.ts`(+test), `promptAddendum.ts`, ledger |
| **Verification** | 46/46 focused tests PASS (userIdentity, defaultWriteDir, fallbackActions, ModeIndicator, runtime); `npm run typecheck` PASS. |
| **Risks** | Browser fallback write path is Public Documents/VibeSpace or /tmp/vibespace; desktop uses real Downloads when Tauri path APIs work. Question-card usage still depends on model following overlay. |
| **Locks** | Released below. |

---

#### 2026-07-11 — Connectivity audit: Supabase + Stripe + App (read-only)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:10 CT |
| **Agent ID** | `AGENT-GROK-20260711-CONNECTAUDIT` |
| **Status** | complete (read-only; no code changes) |
| **Change** | Audited App↔Supabase↔Stripe wiring. Confirmed cloud project ACTIVE, edge functions deployed, Stripe sandbox products/prices exist. Found local app missing `app/.env.local` (no VITE_SUPABASE_*), and live `stripe-webhook` gated by JWT (401 without auth header — Stripe cannot deliver events). |
| **Files** | none edited |
| **Verification** | billing unit tests 19/19; live HTTP probes on edge functions; Supabase MCP list projects/functions/migrations; Stripe MCP account + products/prices |
| **Risks** | stripe-webhook verify_jwt=true breaks plan sync; hive/apex migrations may not be on remote; local dev cloud-disconnected until env filled |
| **Locks** | none claimed (read-only) |


### Security Agent — AGENT-SEC-20260711-FULLAUDIT

#### 2026-07-11 — Full security / Stripe / DB / payments audit (report-only)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:10 CT |
| **Agent ID** | `AGENT-SEC-20260711-FULLAUDIT` |
| **Version** | v0.1.48 |
| **Plan** | Read-only security + payments + RLS + edge-function audit; no production mutations; no code fixes until user authorizes |
| **Affected systems** | Supabase project `tipeobvisjqvpbzcpckh`, Stripe test acct `acct_1TgcFBPsULCV4aFr`, edge functions, billing code paths (read-only) |
| **Files locked** | none (report-only; no edits to app/supabase functions) |
| **Status** | complete report-only — critical Stripe webhook JWT gate + missing stack-complete + migration gaps documented |
| **Verified** | Live edge probes; Stripe MCP products/prices/subs; Supabase advisors/migrations/tables/functions; unit tests billing/auth 32/32; client has no `.env.local` |
| **Not verified** | End-to-end paid checkout with real card (blocked by webhook JWT + empty profiles); Twilio live call; secrets values (names only) |
| **Code changes** | none |


### Active claim AGENT-GROK-20260711-CONNECTFIX
| `app/.env.local` (create, gitignored) | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | in-progress | Wire VITE_SUPABASE_* publishable only |
| `supabase/functions/stripe-webhook/**` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | in-progress | Redeploy verify_jwt=false |
| `supabase/migrations/0026_hive_ai_credits.sql` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | in-progress | Apply if missing on remote |
| `supabase/migrations/0027_apex_tier.sql` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | in-progress | Apply if missing on remote |
| `docs/AGENT_COORDINATION.md` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | in-progress | This connectivity fix task |


### Security Agent — AGENT-SEC-20260711-BILLFIX

#### 2026-07-11 — Fix billing P0/P1/P2 from full audit

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:20 CT |
| **Agent ID** | `AGENT-SEC-20260711-BILLFIX` |
| **Version** | v0.1.48 |
| **Plan** | Fix stripe-webhook JWT deploy, dunning softness, stack-complete deploy, APP_BASE_URL defaults, is_app_admin revoke, config.toml verify_jwt, missing apex/hive migrations, subscriptionStatus tests. No unrelated systems. |
| **Status** | in-progress |
| **Locks** | claimed below |

| `supabase/functions/stripe-webhook/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Soft dunning + plan retain past_due |
| `supabase/functions/create-checkout-session/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | APP_BASE_URL default |
| `supabase/functions/create-customer-portal/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | APP_BASE_URL default |
| `supabase/functions/stack-complete/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Deploy only (JWT on) |
| `supabase/functions/_shared/voice.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Shared billing status helpers if needed |
| `supabase/config.toml` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | verify_jwt per function |
| `supabase/migrations/0028_revoke_is_app_admin_client.sql` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | New |
| `app/src/lib/billing/subscriptionStatus.ts` (+test) | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Pure rules + tests |
| `docs/stripe-setup.md` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Docs accuracy |
| `docs/security-production-checklist.md` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | Status update |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | in-progress | This task |

#### 2026-07-11 — Fix App ↔ Supabase ↔ Stripe connectivity

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:15 CT |
| **Agent ID** | `AGENT-GROK-20260711-CONNECTFIX` |
| **Status** | complete |
| **Change** | (1) Created gitignored `app/.env.local` with publishable VITE_SUPABASE_URL + ANON_KEY for project tipeobvisjqvpbzcpckh. (2) Redeployed `stripe-webhook` with `--no-verify-jwt` (v7, verify_jwt=false) — GET now 200. (3) Applied remote migrations `hive_ai_credits` + `apex_tier` (hive tables + apex constraints). (4) Added `env.connectivity.test.ts` smoke for env presence. |
| **Files** | `app/.env.local` (gitignored), `app/src/lib/supabase/env.connectivity.test.ts`, ledger; remote edge function + DB only |
| **Verification** | webhook GET 200 + POST no-sig 400; Auth health 200 + profiles REST 200 with anon key; hive_plan_allocations 5 plans; plan_limits free/starter/pro/ultra/apex; billing+connectivity tests 24/24 |
| **Risks / remaining** | Cannot verify STRIPE_SECRET_KEY / WEBHOOK_SECRET / price IDs are set on Supabase secrets from here (no values returned). End-to-end paid checkout still needs signed-in user + Stripe Dashboard webhook URL pointing at this function. Restart Vite/Tauri after .env.local. |
| **Locks** | Released below. |

| Path / area | Owner agent | Version | Status | Notes |
|-------------|-------------|---------|--------|-------|
| `app/.env.local` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | released | gitignored publishable keys |
| `supabase/functions/stripe-webhook/**` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | released | deploy only, verify_jwt=false |
| `supabase/migrations/0026*` / `0027*` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | released | applied on remote |
| `app/src/lib/supabase/env.connectivity.test.ts` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | released | smoke test |
| `docs/AGENT_COORDINATION.md` | `AGENT-GROK-20260711-CONNECTFIX` | v0.1.48 | released | this task |


#### 2026-07-11 — BILLFIX complete (release locks)

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:15 CT |
| **Agent ID** | `AGENT-SEC-20260711-BILLFIX` |
| **Status** | complete; locks released |
| **Deployed** | `stripe-webhook` v8 `verify_jwt=false` (GET 200); `stack-complete` v1 JWT on (GET 401); checkout/portal redeployed |
| **DB** | Applied hive_ai_credits, apex_tier, revoke_app_admin_rpc_and_past_due on `tipeobvisjqvpbzcpckh` |
| **Stripe** | Created Apex product `prod_UrsvhWBeMOx2Np` price `price_1Ts99HPsULCV4aFruBZ3NG97` \/mo; set `STRIPE_APEX_PRICE_ID` + `APP_BASE_URL` secrets |
| **Tests** | billing unit tests 23/23 pass |
| **Not done** | Live card E2E checkout; Auth leaked-password toggle (dashboard); desktop `app/.env.local`; Twilio live call |
| **Locks** | all BILLFIX locks released below |

| `supabase/functions/stripe-webhook/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | Soft dunning |
| `supabase/functions/create-checkout-session/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | APP_BASE_URL |
| `supabase/functions/create-customer-portal/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | APP_BASE_URL |
| `supabase/functions/stack-complete/index.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | Deployed |
| `supabase/functions/_shared/subscriptionStatus.ts` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | New |
| `supabase/config.toml` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | verify_jwt map |
| `supabase/migrations/0026-0028*` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | Applied live |
| `app/src/lib/billing/subscriptionStatus.ts` (+test) | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | |
| `docs/stripe-setup.md` / `security-production-checklist.md` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-BILLFIX` | v0.1.48 | released | This task |


### Security Agent — AGENT-SEC-20260711-AUTHUI

#### 2026-07-11 — Fix sign-in/sign-up + email OTP + polish UI

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-07-11 17:50 CT |
| **Agent ID** | `AGENT-SEC-20260711-AUTHUI` |
| **Plan** | Align Supabase OTP length/templates with app 6-digit flow; raise email rate limit; fix site_url; polish SignInDialog/Account; humanize auth errors; use auth.resend. Do not touch terminals/billing unrelated. |
| **Status** | in-progress |

| `app/src/features/auth/SignInDialog.tsx` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | Main auth UI + flow |
| `app/src/features/auth/OtpCodeInput.tsx` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | UI polish |
| `app/src/features/auth/authValidation.ts` (+test) | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | Error helpers |
| `app/src/features/auth/authErrors.ts` (+test) | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | New error mapper |
| `app/src/features/settings/sections/Account.tsx` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | Account auth surface polish |
| `supabase/templates/*.html` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | OTP templates |
| `docs/supabase-setup.md` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | Auth email notes |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | in-progress | This task |


#### 2026-07-11 — AUTHUI complete

| Field | Value |
|-------|-------|
| **Status** | complete; locks released |
| **Root cause** | Live Auth had `mailer_otp_length=8` + **link** email templates while app expected **6-digit** `{{ .Token }}` OTP; repeated signup reported “code sent” with no email |
| **Server** | Patched project `tipeobvisjqvpbzcpckh`: OTP length 6, Token templates, site_url + allow list, password min 8 |
| **Client** | Polished `SignInDialog` + Account cloud card; `authErrors` mapper; existing-account detection; `auth.resend` |
| **Tests** | `src/features/auth` 7/7 pass |
| **Remaining** | Custom SMTP (Resend) still **not** configured — default Supabase mailer may spam-folder; user must add Resend for reliable delivery |
| **Locks** | released below |

| `app/src/features/auth/**` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | released | Auth UI + errors |
| `app/src/features/settings/sections/Account.tsx` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | released | |
| `supabase/templates/*.html` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | released | |
| `docs/supabase-setup.md` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | released | |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-AUTHUI` | v0.1.48 | released | |


### Security Agent — AGENT-SEC-20260711-ACCTUSAGE

#### 2026-07-11 — Account Usage: real message / phone / SMS meters

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-SEC-20260711-ACCTUSAGE` |
| **Plan** | Wire AccountPage Usage to getCombinedUsage; progress bars; empty/error states. No billing backend changes. |
| **Status** | in-progress |

| `app/src/features/account/AccountPage.tsx` | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | in-progress | Real usage UI |
| `app/src/features/billing/planLimits.ts` (+test) | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | in-progress | usagePercent helpers |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | in-progress | This task |


#### 2026-07-11 — ACCTUSAGE complete

| Field | Value |
|-------|-------|
| **Status** | complete; locks released |
| **Change** | Account Usage loads `getCombinedUsage()` for AI messages, phone minutes, SMS; progress bars + empty/error/retry |
| **Tests** | planLimits tests + typecheck filter |
| **Locks** | released |

| `app/src/features/account/AccountPage.tsx` | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | released | |
| `app/src/features/billing/planLimits.ts` (+test) | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | released | |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-ACCTUSAGE` | v0.1.48 | released | |


#### 2026-07-11 — Plan budgets DeepSeek-heavy (45/42.5/12.5 of 33% COGS)

| Field | Value |
|-------|-------|
| **Status** | complete |
| **Change** | DeepSeek +15pp, call/SMS -7.5pp each; planLimits/entitlements/marketing/budget + migration 0029 applied live |
| **Account** | Usage meters labeled DeepSeek / Phone / SMS with thicker progress bars |


### Security Agent — AGENT-SEC-20260711-ACCTABS

#### 2026-07-11 — Account page horizontal tabs (Profile, Usage, Billing, Support, More)

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-SEC-20260711-ACCTABS` |
| **Status** | in-progress |
| **Scope** | AccountPage only (+ optional small tab helper test). TopBar already routes to account. |

| `app/src/features/account/AccountPage.tsx` | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | in-progress | Tabbed account center |
| `app/src/features/account/accountTabs.ts` (+test) | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | in-progress | Tab ids/labels |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | in-progress | This task |


#### 2026-07-11 — ACCTABS complete

| Field | Value |
|-------|-------|
| **Status** | complete; locks released |
| **Change** | Account Center tab strip: Profile · Usage · Billing · Support · More. Top-right avatar already routes to account. |
| **Tests** | accountTabs 2/2 pass; tsc clean for account files |
| **Locks** | released |

| `app/src/features/account/AccountPage.tsx` | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | released | |
| `app/src/features/account/accountTabs.ts` (+test) | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | released | |
| `docs/AGENT_COORDINATION.md` | `AGENT-SEC-20260711-ACCTABS` | v0.1.48 | released | |

### Security Agent — AGENT-SEC-20260711-UNIFIEDCREDITS

#### 2026-07-11 — Single shared company credit bar (DeepSeek + phone + SMS)

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-SEC-20260711-UNIFIEDCREDITS` |
| **Status** | complete; locks released |
| **Change** | One fungible monthly credit pool. Account Usage shows a single Shared company credits bar + spend chips. DB reserve_* RPCs check pool total (migration 0030 applied). get-message-usage returns pool remaining + credits_* fields. Rates: DeepSeek 1 cr · phone 100/min · SMS 10/text. |
| **Tests** | planLimits 13 + accountTabs 2 = 15 pass |
| **Live** | `unified_plan_budget_usd('starter')` = 3.30; get-message-usage redeployed with JWT verify |

| Path | Agent | Status |
|------|-------|--------|
| `app/src/features/account/AccountPage.tsx` (UnifiedUsageBar) | UNIFIEDCREDITS | released |
| `app/src/features/billing/planLimits.ts` (+test) | UNIFIEDCREDITS | released |
| `app/src/features/account/accountTabs.ts` | UNIFIEDCREDITS | released |
| `supabase/migrations/0030_unified_credit_pool_reserves.sql` | UNIFIEDCREDITS | released (applied live) |
| `supabase/functions/get-message-usage/index.ts` | UNIFIEDCREDITS | released (deployed) |
| `docs/AGENT_COORDINATION.md` | UNIFIEDCREDITS | released |

### Security Agent — AGENT-SEC-20260711-CREDITS-E2E

#### 2026-07-11 — End-to-end unified credits (Supabase + Stripe + website + GitHub)

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-SEC-20260711-CREDITS-E2E` |
| **Status** | complete; locks released |
| **Verified live** | pool RPCs use unified_plan_budget_usd; starter $3.30 · pro $16.50 · ultra $33 · apex $66; get-message-usage GET 200; stripe-webhook GET 200 (JWT off); get-call-usage redeployed |
| **Tests** | planLimits + accountTabs + billing: **38/38 pass** |
| **Website** | site/ + landing/ pricing → shared company credits (~3.3k / 16.5k / 33k / 66k) |
| **Stripe** | still maps price→tier only; usage seeded by profiles.tier triggers; credits not sold as Stripe metered items |
| **Scope** | credits/billing surfaces only — no unrelated chat/terminal/files changes in commit |
| **Risks** | Full card E2E checkout not re-run this session; SQL behavior tests in supabase/tests still have pre-0029 numbers (not run against live) |
| **Locks** | released below |

| Path | Agent | Ver | Status | Note |
|------|-------|-----|--------|------|
| `site/index.html` (pricing) | CREDITS-E2E | v0.1.48 | released | |
| `landing/index.html` (pricing) | CREDITS-E2E | v0.1.48 | released | |
| `docs/SUBSCRIPTION_PLANS_REFERENCE.md` | CREDITS-E2E | v0.1.48 | released | |
| `docs/stripe-setup.md` | CREDITS-E2E | v0.1.48 | released | |
| `app/src/lib/entitlements.ts` | CREDITS-E2E | v0.1.48 | released | |
| `app/src/features/billing/planLimits.ts` (+test) | CREDITS-E2E | v0.1.48 | released | |
| `app/src/features/account/*` (usage bar/tabs) | CREDITS-E2E | v0.1.48 | released | |
| `supabase/functions/get-call-usage` | CREDITS-E2E | v0.1.48 | released | deployed |
| `supabase/functions/get-message-usage` | CREDITS-E2E | v0.1.48 | released | deployed earlier |
| `supabase/migrations/0028-0030` | CREDITS-E2E | v0.1.48 | released | applied live |
| `docs/AGENT_COORDINATION.md` | CREDITS-E2E | v0.1.48 | released | |

### Security Agent — AGENT-SEC-20260712-CREDITS-FIX

#### 2026-07-12 — Close remaining credits risks (SQL tests, Stripe path, Pages verify)

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-SEC-20260712-CREDITS-FIX` |
| **Status** | complete; locks released |
| **SQL** | Rewrote `subscription_v2_behavior.sql` for 0029/0030; fixed `rls_voice_verification` plan limits; added `unified_credit_pool_behavior.sql`. Both unified + subscription suites **ran live with begin/rollback — PASS**. |
| **Stripe path** | Products/prices present ($10/$50/$100/$200); webhook GET **200**; checkout without JWT **401**; secrets map plan→price server-side. Full browser card flow still requires human with test card (cannot mint user JWT here). |
| **Website** | GitHub Pages deploy for `c5921a5` **success**; live `vibespaceos.com` shows shared company credits ~3,300/16,500/33,000; old 3,100 gone. |
| **Unit tests** | billing/account **38/38** pass |
| **Risks remaining** | Manual Stripe Checkout with 4242… still recommended once in sandbox; `landing/` is source copy (Pages serves `site/`). |
| **Locks** | released below |

| Path | Agent | Ver | Status | Note |
|------|-------|-----|--------|------|
| `supabase/tests/subscription_v2_behavior.sql` | CREDITS-FIX | v0.1.48 | released | |
| `supabase/tests/rls_voice_verification.sql` | CREDITS-FIX | v0.1.48 | released | |
| `supabase/tests/unified_credit_pool_behavior.sql` | CREDITS-FIX | v0.1.48 | released | |
| `docs/stripe-setup.md` | CREDITS-FIX | v0.1.48 | released | E2E checklist |
| `docs/AGENT_COORDINATION.md` | CREDITS-FIX | v0.1.48 | released | |

### Codex — AGENT-CODEX-20260712-154700-TERMRESTORE

#### 2026-07-12 — Preserve shell transcript when reattaching a live PTY

| Field | Value |
|-------|-------|
| **Agent ID** | `AGENT-CODEX-20260712-154700-TERMRESTORE` |
| **Branch / commit** | local dirty `main` at `e6c0e0337d749ea48b2a8fa5c8371b3767798ced` (user explicitly authorized focused in-place edits) |
| **Plan** | Reproduce the live-PTY renderer reattach gap, replay the persisted plain-shell transcript into the replacement xterm renderer, retain stale fullscreen-TUI suppression, and run focused plus required checks. |
| **Status** | in-progress |
| **Scope guard** | Preserve all pre-existing dirty work; exact-path patches only; no billing, auth, Stripe, Supabase, installer, or unrelated UI changes. |

| Path / area | Owner agent | Version | Status | Notes |
|-------------|-------------|---------|--------|-------|
| `app/src/features/terminals/restoreSession.ts` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | locked | Live PTY transcript replay decision only |
| `app/src/features/terminals/restoreSession.test.ts` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | locked | Focused regression coverage |
| `docs/AGENT_COORDINATION.md` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | locked | Append-only coordination record |

#### 2026-07-12 — TERMRESTORE complete; locks released

| Field | Value |
|-------|-------|
| **Status** | implemented and committed; ready for direct push to `main` |
| **Commit** | `0539dcd` — `fix: replay terminal history on live PTY reattach` |
| **Root cause** | Live PTY attach returned an empty replay even though the Rust event bridge retains no output backlog for a replacement xterm renderer. |
| **Verification** | Restore regression 7/7; terminal persistence group 68/68; typecheck pass; production frontend build pass; Rust check pass; Rust lib tests 11/11; release-manifest 1/1. Full frontend run: 1033/1036 with three unrelated timeout failures, all three passed 19/19 alone. Packaged Tauri build timed out after 20 minutes without a result and is not claimed. |
| **Scope** | Commit contains only `restoreSession.ts` and `restoreSession.test.ts`; all pre-existing dirty work preserved and unstaged. |

| Path / area | Owner agent | Version | Status | Notes |
|-------------|-------------|---------|--------|-------|
| `app/src/features/terminals/restoreSession.ts` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | released | Committed in `0539dcd` |
| `app/src/features/terminals/restoreSession.test.ts` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | released | Committed in `0539dcd` |
| `docs/AGENT_COORDINATION.md` | `AGENT-CODEX-20260712-154700-TERMRESTORE` | v0.1.48 | released | Append-only local coordination record; intentionally unstaged |

