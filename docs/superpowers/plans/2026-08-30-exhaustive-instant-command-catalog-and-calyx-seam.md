# Exhaustive Instant Command Catalog + Calyx Seam Implementation Plan

> **For implementers:** Execute task-by-task with TDD and the repository coordination protocol. Do not edit a file while another live lock owns it. The current Instant Command files are owned by the active root continuation and require an explicit release or handoff before implementation starts.

**Goal:** Make a broad set of exact VibeSpace controls acknowledge in under 500 ms without a routing LLM, while allowing the resulting terminal, tool, schedule, or agent job to continue asynchronously for as long as it needs. Add a narrow command seam for the separately planned Calyx-derived Terminal Peer Fabric without coupling ordinary commands to that larger feature.

**Architecture:** Replace the growing regex/switch surface with a typed, catalog-driven command bus. Each catalog entry declares aliases, slot grammar, authority adapter, safety class, preview, help text, and performance fixture. Parsing remains deterministic and local. Execution calls existing canonical VibeSpace stores/gateways rather than duplicating product logic. Terminal Peer Fabric and its required native capability ship as a first-party preloaded Tool with every VibeSpace installation; Calyx is only the MIT design-and-test source, never a separate download, daemon, terminal app, or user-installed plugin. Calyx team commands are enabled only when the bundled native Fabric capability reports a compatible ready version.

**Tech stack:** React/TypeScript, Tauri 2/Rust, Zustand, existing Assistant and Instant Command modules, existing command palette/action registry, terminal fleet/queue, Schedule, Tool Gateway, Context Gateway, Vitest, Rust tests, and official native Playwright/CDP acceptance.

**Approved design:** `docs/superpowers/specs/2026-08-29-instant-command-bus-fast-local-voice-design.md`

**Supersedes for no-download scope:** Tasks 7–10 of `docs/superpowers/plans/2026-08-29-instant-command-bus-fast-local-voice.md` are not required for this milestone because the user explicitly rejected model/runtime downloads. Phrase commit, existing Web Speech/Deepgram/Faster Whisper paths, and current voice UI remain intact. This plan expands deterministic commands and reuses the current finalized-transcript boundary.

**Calyx authority:** `C:\Users\viper\VibeSpaceOs\VibeSpace-IDEAS!\Future Updates\NOW FOLDER\VibeSpace Terminal Peer Fabric - Calyx Adoption\04-IMPLEMENTATION-AND-VERIFICATION-PLAN.md` and adjacent package files. Do not replace or silently shorten that plan.

**Distribution contract:** The installed VibeSpace app always shows **Terminal Peer Fabric** in **Tools → Preloaded**. The user presses **Run** and selects eligible already-open terminals; they never download Calyx, install a second tool, run an external service, or manually edit global CLI configuration. Dormant harness adapters are bundled/configured by VibeSpace and activated only for a connected team, so idle installations remain low-overhead.

---

## Baseline and honest completion estimate

Baseline audited on 2026-08-30 at `c3fd52d4d9017e8ddc35822a44ea1c83ff5e4edc`:

- Commit `ee882603` added the current atomic Instant Command foundation.
- `features/instant-command` has six command variants: legacy, open CLI, open model picker, one terminal message, one agent message, and terminal broadcast.
- It already has deterministic parsing, provider aliases, terminal snapshot/target resolution, queue dispatch, and focused performance tests.
- The older Assistant system already covers projects, chats, terminals, custom commands, timers, alarms, schedules, phone actions, ambient/fullscreen, settings/palette/launcher, Workbench, navigation, tasks, and context actions.
- `APP_ROUTES` currently defines 20 canonical routes.
- The current executor still funnels most non-terminal commands through one legacy variant. It does not yet expose a typed exhaustive catalog, per-command safety metadata, shared help/autocomplete generation, or full settings/tool/media/schedule lifecycle controls.

Estimated completion of this revised command milestone:

| Area                                    | Current completion | Reason                                                                                                 |
| --------------------------------------- | -----------------: | ------------------------------------------------------------------------------------------------------ |
| Parser/executor foundation              |             55–65% | Typed bus, target resolution, queueing, and provider aliases exist                                     |
| Navigation/page coverage                |             55–70% | Generic route navigation exists; aliases, detail selectors, and catalog generation remain              |
| Terminal/agent control                  |             35–45% | Open/message/broadcast exist; focus, rename, restart, close, split, team and lifecycle commands remain |
| Schedules/timers                        |             25–35% | Create/timer/alarm exist; list, inspect, pause, resume, edit, disable, run-now, and delete remain      |
| Settings/media/tools/projects/files     |             10–25% | Some entry actions exist; safe mutations and full lifecycle coverage remain                            |
| Voice interception and one receipt path |             15–25% | deterministic Assistant entry works; one authoritative cross-surface finalization path remains         |
| Performance/release proof               |             20–30% | focused performance tests exist; exhaustive native corpus and hard 500 ms receipt deadline remain      |

**Weighted revised command milestone: about 30–40% complete.** This is a planning estimate, not a release score.

For Calyx, distinguish upstream from VibeSpace:

- **Upstream Calyx behavior: about 85–95% available as a reference implementation** for peer identity, registration, list/message/broadcast/inbox/status, monitoring, approvals, and harness integration.
- **VibeSpace prerequisites: about 30–40% present** through native coordination, terminal fleet, Tool Gateway, Context Gateway, prompt delivery, file locks, and Tools selection primitives.
- **Exact VibeSpace Terminal Peer Fabric product: about 15–25% complete.** The durable native inbox, receipts, replay, real harness adapters, task/lease model, atomic team builder, and CAO convergence are not yet one implemented product.

---

## Non-negotiable contracts

1. No routing LLM, network model call, new speech model, or model download before deterministic acknowledgement.
2. A command may dispatch a long AI task, but it must return one local `accepted`, `rejected`, `needs_confirmation`, `needs_clarification`, or `queued` receipt within 500 ms.
3. Parsing uses finalized text only. Existing `send it`/custom commit and cancel phrases remain exactly-once.
4. Unknown or ambiguous input never guesses. Ordinary chat remains ordinary chat.
5. Mutations call one canonical authority. The bus must not reimplement Schedule, terminal, plugin, Tool Gateway, Context Gateway, project, file, or settings persistence.
6. Destructive, external, credential, billing, production, and broad shell actions require the existing confirmation/approval authority.
7. Terminal task submission keeps existing provider/input readiness checks and exactly-once queue semantics.
8. Catalog entries and handlers are lazy; opening Jarvis must not eagerly import every page bundle.
9. Base package growth target is under 1 MiB and no new runtime dependency is required for the command catalog.
10. The 500 ms deadline covers receipt, not completion of a long-running action.

### Performance budget

| Stage                                                              | Hard gate |
| ------------------------------------------------------------------ | --------: |
| normalize + catalog candidate lookup P95                           |   <= 2 ms |
| slot parse + validation P95                                        |   <= 3 ms |
| target/authority resolution P95                                    |  <= 10 ms |
| local dispatch/queue receipt P95                                   | <= 100 ms |
| finalized text -> truthful receipt, every clean acceptance fixture |  < 500 ms |
| duplicate side effects for one command ID                          |         0 |
| routing LLM/network calls before receipt                           |         0 |

The executor starts a 500 ms deadline. If a canonical authority cannot acknowledge in time, return `queued` only when durable ownership was actually recorded; otherwise return `timed_out` with no invented success.

---

## Catalog scope

Aliases are examples, not separate handlers. Each row maps many phrases to one canonical command ID.

| Family               | Canonical commands required in this milestone                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation           | `page.open`, `page.back`, `page.forward`, `page.home`, `settings.open`, `settings.close`, `settings.section.open`, `palette.open`, `launcher.open`, `fullscreen.set`                                                                                                                                           |
| Page targets         | chat, canvas, workbench, preview, browser, terminal, kanban, schedule, ADE, agents, model foundry, agent detail, project detail, context, skills, benchmarks, history, tools, files, account                                                                                                                   |
| Terminals            | `terminal.open`, `terminal.focus`, `terminal.message`, `terminal.broadcast`, `terminal.split`, `terminal.rename`, `terminal.move_project`, `terminal.restart`, `terminal.clear`, `terminal.stop`, `terminal.close`, `terminal.list`, `terminal.status`, `terminal.run_saved_command`, `terminal.cancel_queued` |
| Agents               | `agent.message`, `agent.broadcast`, `agent.open`, `agent.status`, `agent.continue`, `agent.stop`, `agent.assign_role`, `agent.give_context`                                                                                                                                                                    |
| Projects/chats       | `project.create`, `project.open`, `project.rename`, `project.archive`, `project.list`, `chat.create`, `chat.open`, `chat.rename`, `chat.list`; permanent deletion stays behind exact confirmation authority                                                                                                    |
| Schedule/time        | `schedule.create`, `schedule.list`, `schedule.open`, `schedule.pause`, `schedule.resume`, `schedule.enable`, `schedule.disable`, `schedule.run_now`, `schedule.edit`, `schedule.delete`, `timer.start`, `timer.cancel`, `alarm.set`, `alarm.cancel`                                                            |
| Settings             | `setting.read`, `setting.set`, `setting.toggle`, limited to a typed allowlist: appearance/theme, ambient, notifications, voice mode, voice commit/cancel phrase, voice pause, reduced motion, fullscreen, terminal preferences, and other existing non-secret preferences                                      |
| Media                | `music.play`, `music.pause`, `music.resume`, `music.stop`, `music.next`, `music.previous`, `music.track`, `music.volume`, `music.mute`, `music.unmute`, `ambient.set`                                                                                                                                          |
| Tools/skills/plugins | `tool.open`, `tool.run`, `tool.stop`, `skill.open`, `skill.enable`, `skill.disable`, `plugin.open`, `plugin.connect`, `plugin.disconnect`, `plugin.status`; exact tool invocation only after schema validation and normal approvals                                                                            |
| Files/context        | `files.open`, `files.search`, `file.reveal`, `file.open`, `context.open`, `context.map.create`, `context.map.recenter`, `context.give_terminals`; writes/deletes are deferred until canonical confirmation and file authority are proven                                                                       |
| Tasks/workbench      | `task.create`, `task.open`, `task.complete`, `task.reopen`, `task.assign`, `workbench.open`, `workbench.template`, `workbench.panel.add`, `workbench.wallpaper.set`, `workbench.wallpaper.pause`, `workbench.wallpaper.resume`                                                                                 |
| Calyx seam           | `team.connect`, `team.disconnect`, `team.list`, `team.open`, `team.message`, `team.broadcast`, `team.role.assign`, `team.task.assign`, `team.handoff`, `team.pause`, `team.resume`, `team.status`; registered only when Fabric capability is available                                                         |

Example phrases that must be in the test corpus:

```text
open terminal page
open project VibeSpace
open Jarvis settings
open voice settings
open three Codex terminals
focus terminal two
message terminal two: run the focused tests
tell all OpenCode terminals to inspect the failing suite
rename terminal two to reviewer
move terminal reviewer to project VibeSpace
restart terminal reviewer
cancel the queued command for terminal two
list my schedules
make a weekday schedule called morning audit at 9 AM
pause schedule morning audit
turn off schedule morning audit
run schedule morning audit now
change schedule morning audit to 10 AM
delete schedule morning audit
play focus music
change song to warm warehouse
set music volume to 35 percent
turn reduced motion on
change voice send phrase to ship it
open the Supabase tool
run tool terminal peer fabric
show plugin GitHub status
search files for terminalCommandQueue
create task verify native build tomorrow
connect terminals one, two, and reviewer as a team
assign reviewer role to terminal two
tell team alpha to run the release audit
handoff auth review from Codex to Claude
```

---

## Implementation tasks

### Task 1: Freeze current behavior and inventory canonical authorities

**Read first:**

- `app/src/features/instant-command/*`
- `app/src/features/assistant/{intents,parse,execute,commands}.ts`
- `app/src/features/navigation/routeSchema.ts`
- `app/src/features/command-palette/{actions,pages}.tsx`
- `app/src/features/schedule/*`
- `app/src/features/terminals/*`
- `app/src/features/tools/*`, `skills/*`, `plugins/*`
- `app/src/features/ambient/*`, `app/src/stores/*`

**Create:**

- `app/src/features/instant-command/authorityInventory.ts`
- `app/src/features/instant-command/authorityInventory.test.ts`

- [ ] Obtain release/handoff for every implementation file from active locks.
- [ ] Add one table mapping each planned command to an existing canonical API, its safety class, required context, and current test seam.
- [ ] Mark commands `blocked` when no safe canonical API exists; do not implement them by clicking UI or mutating internal state ad hoc.
- [ ] Capture the current parser/executor corpus as regression fixtures before refactoring.
- [ ] Verify focused Instant Command and Assistant tests pass at the immutable implementation baseline.

### Task 2: Introduce typed catalog contracts and indexed alias lookup

**Create:**

- `app/src/features/instant-command/catalogTypes.ts`
- `app/src/features/instant-command/catalog.ts`
- `app/src/features/instant-command/catalogIndex.ts`
- adjacent tests

**Modify after ownership release:**

- `app/src/features/instant-command/types.ts`
- `app/src/features/instant-command/parse.ts`

```ts
export type CommandDefinition<TSlots extends object> = Readonly<{
  id: CommandId;
  family: CommandFamily;
  aliases: readonly string[];
  parseSlots: (match: CatalogMatch, source: string) => ParseResult<TSlots>;
  safety: 'read' | 'reversible' | 'confirm' | 'approval';
  authority: AuthorityId;
  availability: (snapshot: CapabilitySnapshot) => Availability;
  examples: readonly string[];
}>;
```

- [ ] Write failing tests for duplicate IDs, normalized alias collisions, unreachable aliases, missing negative fixtures, and a catalog entry without an authority.
- [ ] Build a token-prefix index once; do not scan hundreds of regexes for every keystroke.
- [ ] Preserve original payload casing and punctuation by matching against normalized offsets and slicing the original input.
- [ ] Adapt all six existing Instant Command variants without behavior changes.
- [ ] Require every catalog command to provide positive, negative, ambiguity, authorization, and latency fixtures.

### Task 3: Add one receipt, deadline, idempotency, and confirmation contract

**Create:**

- `app/src/features/instant-command/receipt.ts`
- `app/src/features/instant-command/deadline.ts`
- `app/src/features/instant-command/commandLedger.ts`
- adjacent tests

**Modify:** `types.ts`, `execute.ts`

```ts
type InstantCommandReceipt = Readonly<{
  commandId: string;
  correlationId: string;
  status:
    | 'completed'
    | 'queued'
    | 'needs_confirmation'
    | 'needs_clarification'
    | 'rejected'
    | 'timed_out';
  acceptedAtMs: number;
  targetIds: readonly string[];
  followUp?: Readonly<{ kind: 'confirmation' | 'clarification'; prompt: string }>;
}>;
```

- [ ] Prove duplicate `correlationId` never repeats a side effect.
- [ ] Bind confirmation to account, workspace/project, command, exact target, normalized arguments, expiry, and one use.
- [ ] Add abort/deadline behavior; a timeout cannot later publish an uncorrelated success.
- [ ] Keep receipts content-minimal; do not persist raw voice or sensitive command payloads.

### Task 4: Generate all navigation and settings-opening commands from canonical schemas

**Create:** `catalog/navigation.ts`, `catalog/navigation.test.ts`

**Reuse:** `APP_ROUTES`, UI store, settings tab schema/memory, navigation history boundary.

- [ ] Generate page aliases for all 20 current routes and fail a test when a new `APP_ROUTES` entry lacks user-facing aliases.
- [ ] Support selected agent/project detail only when selector resolution is unique.
- [ ] Open the exact Settings section through the existing Settings authority; do not use arbitrary timeouts/events when a typed seam can replace them.
- [ ] Add back/forward/home, palette, launcher, and fullscreen commands.
- [ ] Test lazy-route behavior and ensure the acknowledgement does not wait for the page chunk to render.

### Task 5: Expand terminal and agent lifecycle commands

**Create:**

- `catalog/terminals.ts`, `catalog/terminals.test.ts`
- `authorities/terminalCommands.ts`, adjacent tests

**Reuse:** terminal target snapshot/resolver, CLI presets, command queue, terminal fleet/runtime, pane tree, clear/restart/project-move authorities, prompt delivery, input readiness.

- [ ] Add focus/list/status/split/rename/move/restart/clear/stop/close/cancel-queued commands.
- [ ] Reuse one deterministic selector grammar across every command.
- [ ] Require exact confirmation for close/stop/restart when work may be active.
- [ ] Keep direct message/broadcast exactly once and fail closed at approval/question/password/SSH/unknown prompts.
- [ ] Add bounded `this terminal` and last-explicit-target context scoped to the active Jarvis interaction.
- [ ] Return a receipt before a newly opened provider CLI becomes ready; readiness and later task delivery are separate events.

### Task 6: Add complete schedule, timer, alarm, and task lifecycle commands

**Create:**

- `catalog/schedules.ts`, `catalog/schedules.test.ts`
- `authorities/scheduleCommands.ts`, adjacent tests

**Reuse:** `parseEventInput`, `jarvisSchedules`, Schedule repositories/runner, task repository, current confirmation dialogs.

- [ ] Add create/list/open/pause/resume/enable/disable/run-now/edit/delete.
- [ ] Resolve schedule/task by exact ID, then unique normalized name; ambiguity returns candidates and no mutation.
- [ ] Parse edits into a patch and validate with the same Schedule schema used by the UI.
- [ ] `run now` must not modify recurrence anchors or scheduled occurrence counts.
- [ ] Delete requires an exact single-use confirmation receipt.
- [ ] Add recurrence, time-zone, DST, stale-revision, duplicate-name, and restart fixtures.

### Task 7: Add allowlisted setting and media commands

**Create:**

- `catalog/settings.ts`, `catalog/media.ts`
- `authorities/settingsCommands.ts`, `authorities/mediaCommands.ts`
- adjacent tests

- [ ] Define typed setting descriptors with value parser, getter, canonical setter, sensitivity, and rollback behavior.
- [ ] Initially allow only non-secret preferences already exposed in the app.
- [ ] Never accept API keys, credentials, billing changes, production mutations, or arbitrary storage paths through generic `setting.set`.
- [ ] Add play/pause/resume/stop/next/previous/track/volume/mute and ambient commands through the existing audio authority.
- [ ] Clamp numeric ranges and return the resulting canonical value in the receipt.

### Task 8: Add tools, skills, plugins, files, context, projects, and chats

**Create:** family catalog and authority files under `features/instant-command/catalog` and `authorities`, with adjacent tests.

- [ ] Resolve tools/skills/plugins/projects/chats by stable ID first and unique display name second.
- [ ] `tool.run` validates the exact registered input schema and routes through Tool Gateway approvals. Free-form semantic tool work is dispatched to an agent/tool target; it is not interpreted by a routing LLM.
- [ ] Plugin connect/disconnect uses existing credential/authorization capability and never accepts secrets in command text.
- [ ] File commands in this milestone are open/reveal/search only unless an existing exact confirmation authority is proven.
- [ ] Project archive and permanent chat deletion require their existing confirmation authorities.
- [ ] Context commands reuse Context Gateway and do not copy full transcripts to terminals.

### Task 9: Generate help, autocomplete, preview, and discoverability from the catalog

**Create:**

- `app/src/features/instant-command/help.ts`
- `app/src/features/instant-command/suggestions.ts`
- adjacent tests

**Modify after handoff:** Assistant/Jarvis command catalog UI only.

- [ ] Generate categories, examples, aliases, argument hints, safety badges, and availability from the same catalog.
- [ ] Search locally by command/alias/family; no model call.
- [ ] Preview exact target/action and show confirmation requirement before execution.
- [ ] Hide or truthfully disable unavailable commands rather than claiming a capability.
- [ ] Preserve current warm/polished Jarvis UI and keyboard/screen-reader behavior.

### Task 10: Route every Jarvis deterministic entry through one command-first boundary

**Modify only after lock release:** Assistant Bar and the smallest existing finalized voice-turn boundary.

- [ ] Phrase commit, fixed-pause, typed Assistant input, and supported voice finalization call the same classify/execute contract.
- [ ] An unmatched utterance follows the current selected model/provider route unchanged.
- [ ] A matched command creates no model-backed chat turn before execution.
- [ ] Cross-trigger tests prove commit phrase + transcript final + retry can produce only one command receipt.
- [ ] Voice setting changes take effect after the current utterance, never midway through it.

### Task 11: Add the Calyx/Fabric capability seam without implementing a second bus

**Create:**

- `catalog/teams.ts`, `catalog/teams.test.ts`
- `authorities/terminalPeerFabric.ts`, adjacent contract tests

```ts
export interface TerminalPeerFabricCommandPort {
  capability(): Promise<{ available: boolean; version?: string }>;
  connect(request: ConnectTeamRequest): Promise<FabricReceipt>;
  command(request: FabricCommandRequest): Promise<FabricReceipt>;
}
```

- [ ] Keep team commands unavailable until the native Fabric reports a compatible version.
- [ ] Register Terminal Peer Fabric as a first-party `Tools → Preloaded` card for every installed-app user; this registration is part of the base VibeSpace package and has no marketplace/install/download action.
- [ ] Bundle/register the VibeSpace-native Fabric capability and dormant harness adapters through existing installer/terminal-spawn authorities; do not bundle the Calyx application, Swift/AppKit, Ghostty, a second terminal engine, an external daemon, or a separate plugin runtime.
- [ ] Pass stable pane/session/project generations, not display labels, across the port.
- [ ] Map command IDs to the Fabric lifecycle: connect/disconnect/list/open/message/broadcast/role/task/handoff/pause/resume/status.
- [ ] Preserve Fabric delivery states; `stored` or `queued` must not be displayed as `agent saw it`.
- [ ] Do not implement peer inboxes, leases, replay, or adapters inside Instant Command. Those belong to the Calyx adoption plan.
- [ ] CAO consumes this same Fabric port; no second team database, inbox, or lock system.

### Task 12: Exhaustive performance, safety, native acceptance, and rollout

**Create:**

- `scripts/pr31-instant-command-catalog-acceptance.mjs`
- `scripts/pr31-instant-command-catalog-acceptance.test.mjs`
- `app/src/features/instant-command/acceptanceCorpus.ts`
- `docs/instant-command-catalog.md` generated from the catalog

- [ ] Build at least 300 positive commands, 300 close negative phrases, 100 ambiguity cases, and 100 authorization/confirmation cases across all families.
- [ ] Run corpus tests in a fresh process and warm process; every clean deterministic fixture receives a truthful local receipt below 500 ms.
- [ ] Assert zero imports/calls to AI generation/provider routing on the pre-receipt dependency graph.
- [ ] Run focused Vitest, full TypeScript, Rust tests for touched native authorities, Prettier, diff check, and scoped secret scan.
- [ ] Attach Playwright/CDP only to the official VibeSpace app, exercising typed and voice-finalized commands without launching a second app instance.
- [ ] Prove navigation, terminal lifecycle, schedule lifecycle, settings/media, tools, confirmation, ambiguity, restart recovery, and reduced-motion/accessibility behavior.
- [ ] Roll out behind `instantCommandCatalogV2`; shadow-classify without execution first, compare results locally, then enable per account. No raw content telemetry.
- [ ] Ship only if the old command corpus, ordinary chat/model selection, current voice commit workflow, terminal approvals, and all new hard gates pass.

---

## Calyx implementation path and schedule

The Calyx plan works as follows:

```text
Tools -> Terminal Peer Fabric -> select 2+ existing VibeSpace terminals
      -> native Rust supervisor creates one private team
      -> dormant per-harness adapters expose peer tools
      -> direct/team/role messages + tasks + handoffs + artifacts
      -> durable receipts, replay, presence, leases, Context/Tool Gateway policy
      -> React projects exact team state and real event-linked animation
      -> CAO uses the same Fabric as an optional coordinator
```

It ports behavior and tests from MIT-licensed Calyx at frozen commit `cf6c62e2250a1806763ad56d8b63f73a1ff019fc`; it does not embed Calyx, Swift/AppKit, Ghostty, or its macOS terminal application.

### Recommended staging

| Stage                          | Scope                                                                                                         |      One senior engineer |        Three focused senior lanes |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | -----------------------: | --------------------------------: |
| Command catalog beta           | Tasks 1–10 and Fabric seam disabled                                                                           |                4–6 weeks |                         2–3 weeks |
| Calyx vertical slice           | two peers, connect, message/broadcast/ack/presence, basic Tools UI                                            |                3–5 weeks |                         2–3 weeks |
| Fabric production beta         | Codex/Claude/OpenCode adapters, durable recovery, tasks/leases/handoffs/artifacts, CAO convergence, native QA |              16–24 weeks |                        8–12 weeks |
| Combined command + Fabric beta | catalog plus enabled team commands                                                                            | 18–28 weeks sequentially | 9–14 weeks with coordinated lanes |

These are engineering estimates assuming stable harness protocols and current authorities. A 24-hour push can produce only a bounded internal slice; it cannot truthfully produce the production beta and its recovery/security evidence.

### Critical path

1. Finish catalog core and terminal/schedule authorities.
2. Land the Fabric two-peer native vertical slice.
3. Enable only `team.connect/list/status/message/broadcast` in the catalog.
4. Add Codex, Claude, and OpenCode delivery adapters with truthful visible/acknowledged receipts.
5. Add tasks, roles, leases, handoffs, artifacts, replay, and CAO convergence.
6. Enable remaining team commands after native acceptance.

---

## Definition of done

- Every catalog command has one canonical ID, typed slots, authority, safety class, examples, negative fixtures, and performance fixture.
- All current routes and approved command families are discoverable from one generated catalog.
- Every accepted deterministic command returns a truthful receipt in under 500 ms with zero pre-receipt routing-LLM calls.
- Long tasks continue asynchronously under their existing agent/tool/schedule authority.
- Ambiguous, destructive, secret-bearing, unsupported, and unavailable actions fail closed or request exact confirmation.
- Ordinary chat, chosen provider/model/effort, existing voice commit phrases, terminal approvals, and UI behavior remain unchanged.
- Calyx team commands use the single native Terminal Peer Fabric authority and accurately expose delivery lifecycle.
- Terminal Peer Fabric appears under Tools → Preloaded immediately after installing VibeSpace, with no separate Calyx/tool/daemon download or global CLI configuration.
- Official native acceptance, full typecheck, affected Rust/TypeScript tests, accessibility, performance, and security gates are green at one immutable commit.
