# VibeSpace Stability, Terminal Fleet, Pet, Voice, and Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Use
> `superpowers:test-driven-development` for every behavior change,
> `superpowers:systematic-debugging` for every unexpected failure, and
> `superpowers:verification-before-completion` before any completion or push
> claim. Do not delegate work because all tasks share terminal, Pet, and
> presentation state.

**Status:** Approval-gated. This document records read-only discovery and the
proposed implementation. No application source may be edited until the user
explicitly approves this plan.

**Goal:** Repair terminal rendering after navigation, add a safe target-total
Terminal Fleet tool, harden Agent save and Jarvis activity reporting, refine the
Pet mini-panel and its shared chat/terminal/voice behavior, complete safe
files/context interactions, set the requested Pet defaults, and integrate only
verified work into the latest legitimate main without changing unrelated
systems.

**Architecture:** Keep the existing PTY, chat, voice, action, Pet presentation,
and Tauri window systems as the single sources of truth. Add small pure policy
modules around them: a bounded terminal-refit coordinator, a typed CLI preset
registry and Fleet planner, a bounded/sanitized activity summary, a reusable
voice-turn controller, and a typed resource-interaction router. React surfaces
remain presentation adapters; no duplicate chat, PTY, voice, billing, or cloud
backend is created.

**Tech stack:** React 18, TypeScript 5.6, Zustand 5, Dexie 4, xterm 5.3,
Vitest 4, Vite 5, Tauri 2, Rust 2021, `portable-pty`.

## Discovery Baseline

- Local `main` is clean at `54ff021420c7380662d2093f75c26f4ae66f541e`.
- A fresh `git fetch origin` left `origin/main` at
  `f9d2a849ade8ef14f9657ca30dfd309bfce4b60f`; local main is 60 commits ahead
  and has no remote divergence. Those local commits contain the legitimate Pet
  and terminal-persistence work this task must preserve.
- The focused unchanged suite passed 41/41 tests across nine files. This is not
  a claim that the full repository suite passes.
- Agent editing already performs a real Dexie update, retains failed drafts,
  queues cloud sync, supports Ctrl+S, and has focused save tests. The plan adds
  missing persistence/reopen characterization before changing it.
- The main chat already supports double-click rename. Pet chat displays the
  same chat IDs and messages but lacks the rename affordance.
- Pet terminal views already reuse the real PTY session IDs. Returning a Pet
  terminal to main changes presentation ownership but does not yet focus the
  main app/terminal.
- Pet voice uses the real `VoiceService` and voice store, but the AI-turn/TTS
  controller is still owned by `VoiceModal`; the mini surface can listen and
  show transcripts without independently completing the shared chat turn.
- The terminal route remains mounted while hidden, preserving PTYs. The route
  return currently depends on one fixed 50 ms refit attempt. It does not wait
  for stable non-zero geometry or force a bounded xterm refresh.
- Jarvis activity completion overwrites the start timestamp and omits a
  structured end timestamp/usage value, which makes finished durations zero or
  ambiguous. The activity store is not persisted.
- Pet defaults already use `positionLocked: false`, `reducedMotion: false`, and
  `animationLevel: 'calm'`; `edgeSnapping` is incorrectly `true`.
- Collapsed Pet mode still renders header chrome, and the four-terminal limit
  is shown as persistent alert copy rather than an attempted-action toast.
- File/context rows have partial native/right-drag and menu behavior. Terminal
  insertion is unquoted, generic text fields and secret-field rejection are
  missing, and cleanup behavior is fragmented.
- No screenshot or video was present in the supplied attachments. Code evidence
  identifies the standalone `Skills` navigation `RouteItem` as the only
  standalone sparkle entry; `Tools` uses a wrench and must remain. Approval of
  this plan confirms removing only the `Skills` sidebar entry while retaining
  its route, page, actions, and all Skills functionality.

## Approaches Considered

### A. Shared-policy modules with thin adapters — recommended

Add pure, tested policies and reuse existing stores/services from each UI. This
keeps PTY/chat identity intact, allows deterministic unit tests, and limits
native changes to read-only executable discovery. It is the safest approach
for future maintenance.

### B. Patch each component in place

This is faster initially but would duplicate voice-turn logic, drop routing,
terminal occupancy rules, and cancellation state across multiple components.
It raises regression risk and is rejected.

### C. Broad terminal/Pet/voice refactor

This could consolidate more code but would touch too many stable surfaces at
once and make rollback difficult. It is rejected for this focused repair.

## Global Constraints

- Work after approval in a new isolated linked worktree and branch created from
  the verified legitimate local main, after creating a non-destructive backup
  ref and fetching `origin` again.
- Recheck the coordination ledger before each phase. Lock every exact file
  before editing and release locks only after the session truly stops or the
  task completes.
- Do not touch Supabase, Stripe, billing, authentication, production data,
  migrations, deployments, releases, installers, updater behavior, or Phone
  Jarvis.
- Preserve the full VibeSpace UI/theme/branding except the explicitly approved
  compact Pet/header and standalone Skills-navigation-entry changes.
- Preserve every live PTY process, PTY ID, terminal transcript/history, chat ID,
  streaming message, and user preference not explicitly changed.
- Never auto-install a CLI, execute a CLI to test whether it exists, close an
  occupied terminal to reach a target, auto-submit a dropped terminal path, or
  insert data into a password/credential/secret field.
- Never persist transcripts, diffs, prompts, terminal output, file contents, or
  secrets in activity metrics. Persist only bounded numeric/timestamp/status
  aggregates.
- No new package dependency or lockfile change is expected.
- Stage only the exact paths listed in each task. Never use `git add -A`.
- Keep Start with Windows, diagnostics, and Pet voice auto-send opt-in/off by
  default despite “everything else on”; these are privileged, diagnostic, or
  side-effecting controls rather than ordinary Pet presentation toggles.

---

### Task 1: Create the isolated implementation worktree and establish RED baselines

**Files:** No source changes.

- [ ] **Step 1: Recheck coordination and Git state**

  Acquire the coordination lock, confirm no active lock overlaps the complete
  file list below, update the heartbeat, fetch `origin`, and verify:

  ```powershell
  git status --short
  git rev-parse main
  git rev-parse origin/main
  git merge-base --is-ancestor origin/main main
  git worktree list --porcelain
  ```

- [ ] **Step 2: Protect the legitimate local baseline**

  Create a backup branch/ref at the current local-main SHA. Do not reset or
  rewrite the primary checkout.

- [ ] **Step 3: Create an isolated branch/worktree**

  Use branch `agent/vibespace-stability-terminal-fleet-pet-context` and a new
  linked worktree under the approved Codex workspace. Base it on verified local
  `main`, because `origin/main` is an ancestor missing 60 legitimate commits.

- [ ] **Step 4: Run unchanged baselines in the worktree**

  Run the focused 41-test command recorded in coordination, `npm run
  typecheck`, and affected Rust library tests. Record every warning. If a
  baseline fails, diagnose before source edits and distinguish pre-existing
  failures from task regressions.

---

### Task 2: Make terminal route-return rendering stable and bounded

**Files:**

- Create: `app/src/features/terminals/terminalRefitCoordinator.ts`
- Create: `app/src/features/terminals/terminalRefitCoordinator.test.ts`
- Create: `app/src/features/terminals/TerminalView.refit.test.tsx`
- Modify: `app/src/features/terminals/terminalGeometry.ts`
- Modify: `app/src/features/terminals/terminalGeometry.test.ts`
- Modify: `app/src/features/terminals/terminalViewport.ts`
- Modify: `app/src/features/terminals/terminalViewport.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/components/layout/PageRouter.tsx`
- Modify: `app/src/components/layout/PageRouter.terminals.test.tsx`
- Modify: `app/src/features/terminals/TileGrid.tsx`
- Modify: `app/src/features/terminals/TileGrid.refit.test.tsx`

- [ ] **Step 1: Write failing geometry/coordinator tests**

  Cover zero-size rejection, independent width/height measurement per terminal,
  two consecutive stable frames, geometry changes during recovery, a strict
  frame/time cap, cancellation/generation replacement, one outstanding
  coordinator, and disposal with no retained listener/timer.

- [ ] **Step 2: Verify RED**

  ```powershell
  npm --prefix app run test -- --run src/features/terminals/terminalRefitCoordinator.test.ts src/features/terminals/terminalGeometry.test.ts
  ```

- [ ] **Step 3: Implement the pure bounded coordinator**

  Use `requestAnimationFrame`, not an unbounded interval. A refit is eligible
  only when the terminal's own container has meaningful non-zero geometry. It
  completes after two stable frames or stops at the documented maximum. A new
  request supersedes the prior generation. Cleanup cancels every pending frame.

- [ ] **Step 4: Write failing `TerminalView` integration tests**

  Fake xterm, FitAddon, ResizeObserver, document visibility, and RAF. Assert a
  hidden-to-visible sequence eventually calls `fit()`, sends at most one native
  resize per distinct rows/cols value, calls `refresh(0, rows - 1)`, retains the
  PTY/session, and preserves a user-scrolled viewport. Assert output-following
  terminals remain at the correct live position.

- [ ] **Step 5: Replace the fixed 50 ms path**

  Route visibility, element ResizeObserver, font readiness, document
  visibility, and window restore all request the same coordinator. Refresh the
  rendered rows only after a successful fit. Do not respawn, reattach, clear,
  or rewrite the terminal.

- [ ] **Step 6: Add repeated-cycle characterization**

  Add a deterministic 50-cycle hidden/visible/scaling test. Assert stable
  listener counts, bounded attempts, no zero-dimension fit, unchanged PTY ID,
  and unchanged transcript.

- [ ] **Step 7: Verify and commit**

  Run all terminal lifecycle/geometry/viewport/PageRouter/TileGrid tests and
  commit only these paths as `fix: stabilize terminal refits after navigation`.

---

### Task 3: Add the typed Terminal Fleet registry and target-total planner

**Files:**

- Create: `app/src/features/terminals/terminalCliPresets.ts`
- Create: `app/src/features/terminals/terminalCliPresets.test.ts`
- Create: `app/src/features/terminals/terminalFleet.ts`
- Create: `app/src/features/terminals/terminalFleet.test.ts`
- Create: `app/src/features/terminals/terminalFleetStore.ts`
- Create: `app/src/features/terminals/terminalFleetStore.test.ts`
- Modify: `app/src/features/terminals/paneTree.ts`
- Modify: `app/src/features/terminals/paneTree.test.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.stress.test.ts`

- [ ] **Step 1: Write failing preset-registry tests**

  Define stable IDs, display names, executable names, safe startup argv/text,
  official install/help URLs, and capability flags for Claude (`claude`), Codex
  (`codex`), OpenCode (`opencode`), Grok (`grok`), Gemini (`gemini`), GitHub
  Copilot (`copilot`), Aider (`aider`), Qwen Code (`qwen`), and Kiro CLI
  (`kiro-cli`). The registry is the only production source for these names.

  Sources are the current official vendor documentation:

  - <https://docs.anthropic.com/en/docs/claude-code/setup>
  - <https://developers.openai.com/codex/cli/>
  - <https://opencode.ai/docs/cli/>
  - <https://docs.x.ai/build/overview>
  - <https://github.com/google-gemini/gemini-cli>
  - <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli>
  - <https://aider.chat/docs/install.html>
  - <https://github.com/QwenLM/qwen-code>
  - <https://kiro.dev/docs/cli/>

- [ ] **Step 2: Write failing planner tests**

  Given `targetTotal`, current leaves, detected executables, and the pane cap,
  return a plan that:

  - treats a leaf as reusable only when it has no PTY/session ID, startup or
    pending command, execution ID, agent mode/slug, meaningful transcript, or
    uncertain backend state;
  - reuses safe empty leaves before appending;
  - adds only `max(0, targetTotal - currentTotal)` effective slots;
  - never closes panes when target is below current total;
  - never exceeds `MAX_PANES`;
  - blocks a missing preset executable with a typed unavailable result;
  - validates custom commands without newline, NUL, control, or shell-control
    injection;
  - preserves unrelated occupied leaves byte-for-byte.

- [ ] **Step 3: Implement a Fleet queue transaction**

  Add a `kind: 'fleet'` discriminant containing request ID, target total,
  preset/custom command, cwd, batch size, and stagger delay. Keep old queue
  kinds compatible. Add cancellation before and during processing.

- [ ] **Step 4: Add a bounded progress store**

  Track `queued | planning | launching | complete | partial | cancelled |
  failed`, created/reused/launched/skipped counts, current batch, and concise
  errors. Retain at most 100 sanitized records and no terminal output or
  secrets.

- [ ] **Step 5: Verify and commit**

  Run the new registry/planner/store and queue stress tests. Commit as
  `feat: add safe terminal fleet planning`.

---

### Task 4: Add read-only native executable discovery

**Files:**

- Modify: `app/src-tauri/src/terminal.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests**

  Extract a pure `resolve_terminal_executable(name, path, pathext)` helper.
  Cover Windows PATH/PATHEXT, Unix executable filenames, quoted/empty PATH
  entries, relative/path-containing names, control characters, false positives,
  and no execution.

- [ ] **Step 2: Implement `terminal_command_exists`**

  Accept only a bare executable basename from the typed registry. Resolve
  through the process PATH and, on Windows, PATHEXT. Return boolean plus a safe
  reason code. Do not run `--version`, spawn a shell, expose the resolved path to
  UI logs, install anything, or read credentials.

- [ ] **Step 3: Register the command and verify**

  Run focused Rust tests and `cargo check --manifest-path
  app/src-tauri/Cargo.toml`. Commit only the two Rust files as
  `feat: detect terminal cli availability safely`.

---

### Task 5: Expose and execute Terminal Fleet through existing Tools/actions

**Files:**

- Modify: `app/src/lib/actions/registry.ts`
- Modify: `app/src/lib/actions/runner.test.ts`
- Modify: `app/src/lib/actions/hardening.test.ts`
- Modify: `app/src/lib/actions/promptAddendum.ts`
- Modify: `app/src/lib/actions/promptAddendum.test.ts`
- Modify: `app/src/lib/actions/registryPresets.ts`
- Modify: `app/src/features/tools/ToolsPage.tsx`
- Modify: `app/src/features/tools/toolStore.ts`
- Modify: `app/src/features/tools/toolStore.test.ts`
- Modify: `app/src/features/terminals/TerminalsPage.tsx`
- Modify: `app/src/features/terminals/TerminalsPage.command.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/terminals/terminalExecutionStore.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.test.ts`

- [ ] **Step 1: Write failing action/tool tests**

  Assert one code-owned `terminal.fleet` built-in appears on every install,
  cannot be overwritten by imported/user tools, does not sync as a user record,
  requires approval, reports missing CLIs, and interprets the number as target
  total. User-saved presets wrap `terminal.fleet` and remain
  create/edit/delete/export/import/sync compatible.

- [ ] **Step 2: Add the compact Fleet tool UI**

  Reuse current Tools page components/theme. Inputs: target total, known preset
  or validated custom command, cwd, batch size, stagger. Show installed status,
  current/target counts, conservative reuse summary, progress, Cancel, and a
  concise completion report. Never auto-install.

- [ ] **Step 3: Consume Fleet transactions in `TerminalsPage`**

  Plan against the latest tree and transcript/backend metadata at drain time,
  not the stale action-click snapshot. Reuse only planner-approved empty roots,
  append only required leaves, launch in bounded batches, mark each execution,
  and stop scheduling after cancellation. Never modify occupied leaves.

- [ ] **Step 4: Preserve action compatibility**

  Keep `terminal.bulkOpen` behavior for existing callers but update AI guidance
  to prefer `terminal.fleet` for “make/reach N total terminals.” Do not silently
  change older saved tools.

- [ ] **Step 5: Verify and commit**

  Run action/tool/Fleet/TerminalsPage/TerminalView execution tests and commit as
  `feat: add built-in terminal fleet tool`.

---

### Task 6: Characterize and harden Agent editor save without unnecessary churn

**Files:**

- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify only if a new test fails for a real defect:
  `app/src/features/agents/AgentManager.tsx`
- Modify only if repository behavior is proven defective:
  `app/src/lib/db/repositories.ts`

- [ ] **Step 1: Add failing persistence/reopen cases**

  Test every editable field, save then remount/reopen, rapid double-save,
  offline sync-queue failure with local success, repository rejection, retry,
  Ctrl+S, invalid draft, unsaved agent switch, and no accidental built-in edit.

- [ ] **Step 2: Prefer no production change when tests pass**

  If current code satisfies the requested behavior, commit characterization
  tests only. If a test proves a defect, make the smallest fix at the true
  boundary and rerun the complete Agent suite.

- [ ] **Step 3: Commit**

  Commit as `test: lock agent editor save reliability` or, only if needed,
  `fix: persist agent editor updates reliably`.

---

### Task 7: Fix truthful, durable Jarvis session activity metrics

**Files:**

- Modify: `app/src/features/chat/activity/types.ts`
- Modify: `app/src/features/chat/activity/activityStore.ts`
- Modify: `app/src/features/chat/activity/activityStore.test.ts`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.tsx`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.test.tsx`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

  Assert a run records immutable `startedAt`, completion records `endedAt`,
  elapsed time is non-zero when time advanced, structured provider usage is
  retained once, unknown usage renders unavailable rather than zero, files and
  added/deleted lines do not double count, and error/cancel paths close the
  duration.

- [ ] **Step 2: Write failing hydration tests**

  Persist only a bounded sanitized aggregate. Test corrupt/old schema,
  deduplication, 100-record retention, restart hydration, and rejection of
  transcript/diff/path/prompt/secret-shaped fields.

- [ ] **Step 3: Implement truthful events**

  Preserve the start event timestamp. Add explicit start/end and nullable usage
  fields. Use provider usage only when actually reported. Show `—`/“Unavailable”
  rather than fabricated zeros. Numeric file/line counts may come only from
  real tool/diff events.

- [ ] **Step 4: Verify and commit**

  Run activity and runtime tests, then commit as
  `fix: preserve truthful jarvis session metrics`.

---

### Task 8: Apply requested Pet defaults and audit control behavior

**Files:**

- Modify: `app/src/features/pets/petSettingsStore.ts`
- Modify: `app/src/features/pets/petSettingsStore.test.ts`
- Modify: `app/src/features/pets/PetOverlay.tsx`
- Modify: `app/src/features/pets/PetOverlayWindow.tsx`
- Modify: `app/src/features/pets/PetOverlayWindow.test.tsx`
- Modify only for settings UI wiring discovered in the current tree:
  `app/src/features/settings/sections/Accessibility.tsx`

- [ ] **Step 1: Write failing default/migration tests**

  Fresh defaults must be: enabled/on, overlay visible/on, notification
  reactions/on, pointer tracking/on, sound/on, snap-to-edge/off, position
  lock/off, reduced motion/off, animation level/calm. Existing persisted values
  must win over defaults. Diagnostics, Start with Windows, and new voice
  auto-send remain off/opt-in.

- [ ] **Step 2: Audit every Pet control**

  Test click, keyboard, pressed/checked/disabled state, persistence, Tauri error
  recovery, hover tooltip, reduced motion, and overlay/panel close/minimize.
  Remove dead controls only if they are proven unreachable and explicitly in
  scope; otherwise repair wiring.

- [ ] **Step 3: Implement only proven gaps**

  Change `edgeSnapping` fresh default to false and keep the existing false/calm
  defaults. Do not overwrite current users' saved settings.

- [ ] **Step 4: Verify and commit**

  Run Pet settings/overlay/lifecycle tests and commit as
  `fix: apply safe pet defaults and controls`.

---

### Task 9: Make the Pet mini-panel truly compact and responsive

**Files:**

- Modify: `app/src/features/pets/PetMiniPanel.tsx`
- Modify: `app/src/features/pets/petMiniPanel.css`
- Modify: `app/src/features/pets/PetMiniPanel.responsive.test.tsx`
- Modify: `app/src/features/pets/petPanelPreferences.ts`
- Modify: `app/src/features/pets/petPanelPreferences.test.ts`

- [ ] **Step 1: Replace current collapsed assertions with RED requirements**

  Collapsed mode must contain only a tiny accessible expand control plus the
  active surface; the identity/header/minimize/close/tab chrome is not rendered
  or focusable. Expanding restores it. Test container widths, not viewport-only
  scaling.

- [ ] **Step 2: Add attempted-limit tests**

  Four slots render normally. Attempting a fifth produces one toast and leaves
  state unchanged. Merely having four slots does not render a persistent alert.

- [ ] **Step 3: Refine copy and responsive layout**

  Keep current VibeSpace tokens and component language. Shorten tips/status
  copy, move secondary explanations to tooltips, keep icon-only controls
  labelled, avoid scale transforms/subpixel blur, and preserve minimum touch
  targets and keyboard focus.

- [ ] **Step 4: Verify and commit**

  Run responsive/preferences/terminal-grid tests and commit as
  `refactor: streamline the pet mini panel`.

---

### Task 10: Reuse shared chat IDs and add Pet chat rename

**Files:**

- Create: `app/src/features/chat/useChatTitleEditor.ts`
- Create: `app/src/features/chat/useChatTitleEditor.test.tsx`
- Modify: `app/src/components/layout/TabStrip.tsx`
- Modify: `app/src/features/pets/PetChatSurface.tsx`
- Create: `app/src/features/pets/PetChatSurface.test.tsx`

- [ ] **Step 1: Extract the existing rename behavior with tests**

  Test double-click, same chat ID, initial selection, Enter save, Escape cancel,
  blur save, empty-title rejection, repository failure/retry, and no duplicate
  chat creation.

- [ ] **Step 2: Use the same hook in both surfaces**

  Pet chat buttons edit the same record rendered in main. Messages, streaming,
  composer events, and active chat IDs stay shared. Do not clone a chat or
  create a Pet-only repository.

- [ ] **Step 3: Verify and commit**

  Run TabStrip/Pet chat/database mock tests and commit as
  `feat: share chat title editing with the pet panel`.

---

### Task 11: Share terminal presentation and return/focus behavior correctly

**Files:**

- Modify: `app/src/features/pets/PetTerminalSurface.tsx`
- Create: `app/src/features/pets/PetTerminalSurface.test.tsx`
- Modify: `app/src/features/pets/petPresentationStore.ts`
- Modify: `app/src/features/pets/petPresentation.test.ts`
- Modify: `app/src/features/terminals/terminalRefs.ts`

- [ ] **Step 1: Write failing identity/focus tests**

  Assert Pet rendering receives the exact PTY ID, never calls spawn for a live
  session, and “return to main” changes only presentation ownership, shows and
  focuses the main Tauri window, navigates to Terminals, and targets the exact
  pane/session.

- [ ] **Step 2: Clarify close semantics safely**

  The ordinary Pet-slot X removes the presentation slot/returns it to main; it
  must be labelled accordingly. A separate real “End terminal” action, if
  retained by the current design, warns for any live or uncertain PTY before
  calling the existing kill/forget/snapshot cleanup path. Never kill on panel
  close.

- [ ] **Step 3: Preserve the four-slot presentation limit**

  Keep the cap independent from the main app's ten-pane cap. A fifth attach is
  rejected with the Task 9 toast and does not mutate/kill/restart anything.

- [ ] **Step 4: Verify and commit**

  Run Pet terminal/presentation and terminal-reference tests and commit as
  `fix: focus shared terminals from the pet panel`.

---

### Task 12: Extract a reusable real voice-turn controller for main and Pet

**Files:**

- Create: `app/src/features/voice/useVoiceTurnController.ts`
- Create: `app/src/features/voice/useVoiceTurnController.test.tsx`
- Create: `app/src/features/voice/voiceSessionLease.ts`
- Create: `app/src/features/voice/voiceSessionLease.test.ts`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`
- Modify: `app/src/features/pets/PetVoiceSurface.tsx`
- Modify: `app/src/features/pets/PetVoiceSurface.test.tsx`
- Modify: `app/src/features/pets/petSettingsStore.ts`
- Modify: `app/src/features/pets/petSettingsStore.test.ts`

- [ ] **Step 1: Write failing lease/controller tests**

  Cover Web Speech feature detection, permission denial, interim/final text,
  one active owner, main-to-Pet ownership handoff, stop/unmount cleanup,
  duplicate-final suppression, target chat reuse, model-access failure,
  request cancellation, AI reply, TTS, mute, and no open mic after close.

- [ ] **Step 2: Define safe Pet commit behavior**

  Default Pet final speech dispatches the existing
  `jarvis:composer:insert-text` path into the active shared chat composer and
  does not submit. Add a persisted `petVoiceAutoSend` opt-in, default false.
  When enabled, or when the existing explicit voice commit phrase is spoken,
  send exactly once through the same chat/message/runtime/TTS path used by the
  main Voice modal.

- [ ] **Step 3: Extract, do not duplicate**

  Move VoiceModal's turn lifecycle into the hook/controller while leaving its
  visual animation/chrome intact. Both surfaces use `VoiceService`,
  `useVoiceStore`, `resolveVoiceChatTarget`, `messageRepo`, `jarvis:send`, and
  the existing speech synthesis router. No Win+H or second voice backend.

- [ ] **Step 4: Verify and commit**

  Run the complete voice, Pet voice, chat routing, and store suites. Commit as
  `refactor: share real voice turns with the pet panel`.

---

### Task 13: Complete safe files/context menus and drag/drop routing

**Files:**

- Create: `app/src/lib/resourceInteraction.ts`
- Create: `app/src/lib/resourceInteraction.test.ts`
- Create: `app/src/components/ui/ResourceContextMenu.tsx`
- Create: `app/src/components/ui/ResourceContextMenu.test.tsx`
- Modify: `app/src/lib/rightClickDrag.ts`
- Modify: `app/src/lib/rightClickDrag.test.ts`
- Modify: `app/src/features/files/SidebarFilesTree.tsx`
- Modify: `app/src/features/context/SidebarContextTree.tsx`
- Modify: `app/src/components/layout/Inspector.tsx`
- Modify: `app/src/features/chat/dropPayload.ts`
- Modify: `app/src/features/chat/dropPayload.test.ts`
- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/agents/AgentManager.tsx`
- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify: `app/src/styles/globals.css`

- [ ] **Step 1: Write failing pure routing/security tests**

  Model file and context payloads as typed local references. Resolve chat,
  Pet/chat, Agent prompt/tool text, ordinary input/textarea/contenteditable,
  and terminal targets. Reject password inputs, fields whose name/id/label/
  autocomplete indicates token, secret, credential, key, auth, PIN, or payment,
  and disconnected/disabled/read-only targets.

- [ ] **Step 2: Add shell-aware path quoting**

  Quote for the target terminal's recognized shell family (PowerShell/cmd,
  POSIX, unknown conservative fallback), escape embedded quotes safely, insert
  text only, and never append CR/LF/Enter. Cap payload size and reject controls.

- [ ] **Step 3: Implement one interaction router**

  Native drag and right-button drag use the same destination resolver. Chat
  attaches through existing file/context MIME/store paths; Pet chat uses the
  same chat ID; ordinary fields insert at the selection; Agent/tool fields
  insert safely; terminal uses quoted text. Escape, mouseup, dragend, route
  change, and unmount always clear overlays/classes/listeners.

- [ ] **Step 4: Add a shared accessible context menu**

  Required actions where valid: Open/Preview, Attach to active chat, Insert
  reference, Copy path/reference, Copy name, Reveal/open externally through the
  existing safe path. Support keyboard ContextMenu/Shift+F10, arrow navigation,
  Enter, Escape, focus return, and correct disabled states. Do not show actions
  that would cross the safe boundary.

- [ ] **Step 5: Verify and commit**

  Run resource/router/right-drag/menu/Composer/Agent/TerminalView tests. Commit
  as `feat: route file and context interactions safely`.

---

### Task 14: Remove only the redundant standalone sparkle navigation entry

**Files:**

- Modify: `app/src/components/layout/NavPane.tsx`
- Create or modify: `app/src/components/layout/NavPane.test.tsx`

- [ ] **Step 1: Write a failing navigation assertion**

  Assert the standalone Skills sparkle entry is absent, Tools remains present,
  no unrelated route item changes, and the Skills route/page/action remains
  registered and directly navigable.

- [ ] **Step 2: Remove only the `skills` `RouteItem`**

  Do not delete the Skills feature, route, page, shortcuts, actions, context
  header icon, or Tools system. This is a navigation declutter, not feature
  removal.

- [ ] **Step 3: Verify and commit**

  Run NavPane/PageRouter/action tests and commit as
  `refactor: remove redundant skills nav entry`.

---

### Task 15: Security, accessibility, performance, testing, and rollback documentation

**Files:**

- Create: `docs/VIBESPACE_STABILITY_TERMINAL_FLEET_REPORT.md`
- Create: `docs/VIBESPACE_STABILITY_SECURITY.md`
- Create: `docs/VIBESPACE_STABILITY_TESTING.md`
- Create: `docs/VIBESPACE_STABILITY_ROLLBACK.md`
- Create: `docs/pets/previews/README.md`
- Create only after verified capture: bounded screenshots/contact sheets or
  recordings under `docs/pets/previews/`

- [ ] **Step 1: Document security boundaries**

  Cover executable discovery, no-install/no-execute checks, custom-command
  validation, occupied-terminal protection, secret-field rejection, shell
  quoting/no-submit, bounded activity persistence, voice lease/permissions,
  shared identifiers, Tauri command inputs, and no cloud/billing changes.

- [ ] **Step 2: Document testing and risks**

  Record exact commands/output counts, warnings, pre-existing failures,
  performance measurements, manual checks, unavailable media, and any partial
  acceptance. Never transcribe secrets or terminal contents into reports.

- [ ] **Step 3: Add rollback instructions by logical commit**

  Revert newest-to-oldest using normal `git revert`; rerun affected tests after
  each revert. Include cleanup for bounded local metric/Fleet state schema and
  a feature-safe fallback for native command unavailability. Never reset the
  protected primary checkout.

- [ ] **Step 4: Capture previews safely**

  Use synthetic projects/chats/terminals only. Redact usernames/paths and do not
  capture tokens, real prompts, customer data, or connected service content.
  If physical capture is not possible, document the manual gate rather than
  fabricating evidence.

- [ ] **Step 5: Commit**

  Commit exact documentation/evidence paths as
  `docs: record stability verification and rollback`.

---

### Task 16: Full verification and latest-main integration

**Files:** No source edits unless a newly failing test is root-caused and its
exact fix is separately locked, tested RED/GREEN, and committed.

- [ ] **Step 1: Update heartbeat before long tests**

- [ ] **Step 2: Run focused suites**

  Run every new/modified test file grouped by subsystem and verify the exact
  counts.

- [ ] **Step 3: Run broad frontend checks**

  ```powershell
  npm --prefix app run test
  npm run typecheck
  npm run build
  npm run test:release-manifest
  git diff --check
  ```

  There is no configured lint script; do not claim lint passed. Record existing
  Vite/esbuild warnings separately.

- [ ] **Step 4: Run Rust checks**

  ```powershell
  cargo test --manifest-path app/src-tauri/Cargo.toml --lib
  cargo check --manifest-path app/src-tauri/Cargo.toml
  cargo check --release --manifest-path app/src-tauri/Cargo.toml
  ```

  Run `cargo fmt --check` and report repository-wide unrelated formatting
  failures without formatting unrelated files.

- [ ] **Step 5: Run performance/stress checks**

  Verify 50 terminal navigation cycles, Fleet targets/reuse/cancel at the
  ten-pane cap, repeated Pet collapse/expand and four-slot attempts, repeated
  voice start/stop/ownership handoff, and drag cleanup. Record CPU/memory/frame
  observations using synthetic data.

- [ ] **Step 6: Manual Tauri smoke**

  If port 5173 is already owned, identify its process and reuse or ask before
  stopping it; never kill an unrelated process. Launch the real app only after
  automated gates, test navigation/scaling/restore, Terminal Fleet unavailable
  and installed cases, Agent save/reopen, metrics, Pet panel/chat/terminal/
  voice, keyboard accessibility, and file/context interactions. Physical
  monitor scaling, real microphone permission, and supplied-video comparison
  remain explicitly manual if hardware/media are unavailable.

- [ ] **Step 7: Review complete diff and commits**

  Confirm no dependency, lockfile, Supabase, Stripe, billing, auth, migration,
  installer, updater, release, production-data, or unrelated file changed.
  Confirm no secrets and no generated binary/cache files are staged.

- [ ] **Step 8: Reconcile latest main without rewriting history**

  Fetch `origin` again. If `origin/main` remains an ancestor, incorporate any
  new legitimate local-main commits into the feature branch with a normal
  rebase/merge according to branch state, rerun all verification, then
  fast-forward the protected local main. If either main diverged, stop and
  produce the exact graph/conflict evidence; never force push.

- [ ] **Step 9: Push only after all required gates**

  Push normally to the authorized main destination only if permissions and
  repository policy allow it and the approved plan includes this integration.
  Do not deploy, release, or merge a remote PR automatically. If push is
  blocked, preserve the verified branch/commits and report the exact command
  and error.

- [ ] **Step 10: Final coordination and lock release**

  Record exact commits, tests, warnings, risks, rollback, manual gates, next
  command, and repository/remote state. Release every owned file lock only
  after the task is actually complete or the session is stopping.

## Definition of Done

The task is complete only when all approved tasks above are implemented and
verified; no live terminal/chat identity is duplicated or restarted; terminal
return rendering survives the 50-cycle matrix; Fleet reaches a safe target
total with correct unavailable/progress/cancel behavior; Agent edits survive
reopen; metrics are truthful across restart; Pet defaults and compact UI are
correct; Pet voice completes the real shared path without default auto-send;
Pet chat/terminal behavior uses the same IDs; context interactions are quoted,
non-submitting, accessible, and secret-safe; the exact standalone sparkle nav
entry is removed without deleting Skills/Tools; documentation and rollback are
complete; the full verification record is honest; and verified commits are
integrated without force push, deployment, release, or unrelated mutation.

## Remaining Manual Gates

- No supplied screenshot/video was available for pixel-for-pixel comparison.
- Physical multi-monitor/DPI, real microphone permission, signed installer,
  reboot, updater, and real app-data recovery cannot be claimed from automated
  tests.
- Any pre-existing full-suite or repository-wide formatting failure must be
  reported with evidence and must not be hidden by unrelated cleanup.
