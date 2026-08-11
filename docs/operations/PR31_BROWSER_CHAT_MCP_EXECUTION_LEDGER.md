# PR31 Browser Chat Workspace and MCP Execution Ledger

## Authority

- Goal: `VS-PR31-BROWSER-CHAT-WORKSPACE-MCP-20260810`
- Branch: `agent/pr30-fixes-and-updates`
- Starting HEAD: `9fb5323f910a451aba16527a436e9f83e510b8c7`
- Worktree:
  `C:\Users\viper\VibeSpace\.worktrees\pr30-fixes-updates-20260802`
- Controller: `VS-ROOT-20260811T023519Z-BROWSER-CHAT-MCP`

## Preserved concurrent work

The initial dirty tree contains unrelated News, Benchmarks, Recycle Bin,
Agent, Skill, temporary chat-art, and web-dashboard-plan work. None is owned,
staged, restored, reformatted, or committed by this task.

## Refreshed external constraints

- OpenAI currently documents full custom MCP write/modify actions for ChatGPT
  Business and Enterprise/Edu workspace flows. Pro custom MCP remains
  read/fetch-only in Developer mode.
- ChatGPT freezes an approved app's tool snapshot; new or changed actions
  require an owner/admin refresh before they become available.
- Tauri's current multi-WebView API supports adding a `Webview` to a parent
  `Window`, plus show/hide/focus/position/size lifecycle operations.

## Baseline findings

- Browser Chat session membership is inferred from a persisted Zustand
  `chatPreferences` object rather than a durable binding repository.
- No `BrowserChatBinding`, provider-project link, or provider export snapshot
  table exists in Dexie V9.
- The native Browser Chat surface still uses a separate borderless
  `WebviewWindow`; it is not yet a true child WebView.
- The app-lifetime relay host and heartbeat acknowledgement are committed.
- The production MCP catalog remains truthfully read-only pending a real
  approval-session protocol; mutation capabilities are not advertised as
  available.

## Milestone evidence

### M0 — baseline refresh

- Status: `VERIFIED`
- Local branch/HEAD verified.
- Dirty provenance inspected and excluded.
- Master goal, repository authority, Browser Chat docs, Worker docs, and
  current OpenAI/Tauri documentation read.

### M1 — durable data/session foundation

- Status: `VERIFIED`
- Owned paths are recorded in the repository lock.
- RED evidence: the migration suite failed on `DB_VERSION` 9 and absent
  `browser_chat_bindings` / `provider_project_links`; the repository suite
  then failed 8/8 against an explicit unimplemented boundary. Two later
  selector/unlink tests failed on their missing methods.
- GREEN evidence: 25/25 tests pass across the focused repository and additive
  migration suites. V9 rows survive the V10 upgrade byte-for-byte while the
  two new stores start empty.
- Behavior: durable bindings and provider-project links now enforce exact
  account/workspace scope, unique VibeSpace-chat mapping, unique provider
  conversation mapping per profile, HTTPS provider URL allowlists,
  pin/rename/project/open-state updates, scoped selectors, and scoped removal.
- TypeScript: `npm run typecheck` in `app` passed after the final GREEN run.
- Formatting and diff hygiene: exact owned paths pass Prettier and
  `git diff --check`.
- Commit: `1be90cbf`.

### M2a — provider top-level navigation adapters

- Status: `VERIFIED`
- RED evidence: the new adapter suite first failed to resolve the missing
  module, then failed 9 behavior cases against an explicit null/deny stub.
- GREEN evidence: 15/15 provider-navigation cases pass; the combined
  navigation, repository, and migration gate passes 40/40; app TypeScript
  passes.
- Behavior: adapters accept only exact provider HTTPS origins and supported
  home/conversation/project paths, strip query/fragment metadata, extract only
  opaque conversation/project keys, and reject spoofed origins, credentials,
  non-default ports, and unsupported paths.
- Repository integration: binding and provider-project URL validation now
  consumes the shared adapter instead of duplicating provider URL assumptions.
- Commit: `ad235c7f`.

### M2b — durable session rail and legacy migration

- Status: `VERIFIED`
- RED evidence: the focused Hub test first failed because no durable pinned
  section or binding-backed actions rendered. The migration suite then failed
  because `migrateLegacyBrowserChatPreferences` did not exist.
- GREEN evidence: 18/18 Hub tests pass; 6/6 store and migration tests pass;
  the combined Browser Chat registry, navigation, repository, store, and Hub
  gate passes 54/54; app TypeScript passes.
- Behavior: the session rail now reads exact account/workspace-scoped durable
  bindings, separates pinned and provider sessions, and provides
  keyboard-accessible open, pin, rename, project move, and local removal
  controls. Successful mutations update both durable bindings and existing
  VibeSpace chat metadata where appropriate.
- Compatibility: legacy per-chat Browser preferences migrate once into
  durable bindings only when the referenced chat exists in the exact active
  workspace. Native, missing, and foreign-workspace chats are skipped, and a
  repeat migration creates zero rows.
- Safety: removing a binding never deletes the provider conversation and
  returns the local VibeSpace chat to native mode.
- Commit: `b2ea3b92`.

### M3 — child WebView and bounded navigation bridge

- Status: `IMPLEMENTED — NATIVE VERIFICATION REQUIRED`
- RED evidence: the capability contract failed on the existing
  `WebviewWindowBuilder` implementation, and the frontend navigation test
  received no event. The Claude registry-home test also failed because
  `/new` was not recognized as a safe home path.
- GREEN evidence: 72/72 focused Browser Chat and capability tests pass; app
  TypeScript passes; `cargo check --lib --no-default-features` passes; and
  three focused Rust surface tests pass.
- Behavior: provider pages are reusable child `Webview`s of the main Tauri
  window. Native show/hide/provider-switch operations are serialized, repeated
  geometry updates do not steal focus, and frontend geometry bursts remain
  coalesced.
- Navigation safety: Tauri injects no provider script and emits only exact
  allowlisted HTTPS provider paths, stripped of query and fragment, to the
  local `main` target. Frontend validation independently rejects wrong
  provider/surface pairs, spoofed origins, invalid timestamps, and kind
  mismatches before updating only the active durable binding.
- Capability safety: `browser-chat-host` still grants permissions only to the
  local `main` webview and grants no remote authority.
- Native limitation: the default-feature Cargo build reached the unrelated
  optional eSpeak CMake dependency and failed on Windows path length. The
  Browser Chat surface itself compiles and tests with voice disabled. Installed
  drag/resize/maximize/provider-switch smoke remains required.
- Commit: `bd23c65c`.

### M4a — Browser Chat history summaries

- Status: `VERIFIED`
- RED evidence: a bound Browser Chat history row rendered as an ordinary
  native transcript and had no route back to its provider surface.
- GREEN evidence: 10/10 focused HistoryList tests pass and app TypeScript
  passes.
- Behavior: exact account/workspace-scoped durable bindings label matching
  local history rows as Browser Chat sessions. Selecting a bound row switches
  that local chat back to Browser mode and opens the chat route; native rows
  retain the existing replay behavior.
- Authority safety: History renders only local chat metadata and the durable
  binding summary. It does not display or imply access to provider-owned
  messages.
- Commit: `f9a43756`.

### M4b — local provider project pointers

- Status: `VERIFIED`
- RED evidence: Project Detail had no provider-project lifecycle controls and
  no truthful local-vs-remote authority copy.
- GREEN evidence: 3/3 focused Project Detail link tests, the existing
  Project Detail appearance test, and 10/10 repository lifecycle/scope tests
  pass; app TypeScript passes.
- Behavior: Project Detail can save an exact allowlisted ChatGPT project URL,
  open the normalized URL, and remove the local pointer.
- Authority safety: the UI repeatedly identifies links as local bookmarks,
  does not claim remote membership or verification, and states that unlinking
  does not modify the provider project. Invalid or hostile URLs fail closed in
  the existing scoped repository validator.
- Commit: `49fe02f2`.

### M4c — defensive official ChatGPT export snapshots

- Status: `VERIFIED`
- RED evidence: schema V10 had no provider-snapshot authority and no official
  export ZIP parser, dedupe, cancellation, or local snapshot lifecycle.
- GREEN evidence: 5/5 focused import lifecycle/security tests, 16/16 additive
  migration tests, and 10/10 existing Browser Chat repository tests pass; app
  TypeScript passes.
- Storage: additive Dexie V11 keeps imports and normalized conversation
  snapshots in dedicated account/workspace-scoped stores. Provider messages
  never enter the native `messages` table.
- Import safety: the bounded parser accepts stored or deflated
  `conversations.json`, rejects traversal, encrypted/multi-disk/duplicate,
  unsupported, oversized, extreme-ratio, malformed, and checksum-invalid
  archives, enforces expanded-byte limits while streaming, and performs the
  final write atomically with cancellation checks.
- Data safety: content remains inert text; only the current exported branch is
  normalized. Stable provider conversation keys update one snapshot with a
  revision bump, exact archive hashes deduplicate, search stays in exact scope,
  and delete removes only the selected local snapshot.
- Commit: `fb8c7250`.

### M4d — import and inert History replay UI

- Status: `VERIFIED`
- GREEN evidence: the broad Task 4 regression run passes 151/151 tests across
  Browser Chat, History, Project Detail, and additive Dexie migration; app
  TypeScript passes.
- Behavior: Browser Chat exposes an explicit official-export ZIP picker and
  reports added/updated/unchanged results. History renders imported snapshots
  in a separately labeled section, searches their inert local text, replays
  the normalized branch without provider access, and requires explicit
  confirmation before deleting only the local snapshot.
- Authority safety: imported rows never appear as native chats, replay states
  that it does not fetch live provider content, React renders all imported
  title/message data as text, and snapshot deletion states that the original
  ChatGPT conversation and export file are unchanged.
- Visual verification limitation: the existing local Vite server was ready on
  `127.0.0.1:5173`, but the in-app browser runtime failed before tab creation
  because its kernel-assets path was unavailable. No fallback browser was used;
  this is recorded as a verification-environment limitation, not a product
  capability claim.
- Commit: `3bc477e0`.

### M5a — fail-closed Browser Chat permission registry

- Status: `VERIFIED`
- RED evidence: the relay exposed only a fixed read allowlist and had no
  versioned plan/custom-mode contract, dynamic per-capability decision source,
  or one-shot revocable operation lease.
- GREEN evidence: 6/6 focused permission-registry tests pass and app
  TypeScript passes.
- Policy: `off`, `read`, `project_developer`, `full_local_developer`, and
  `custom` resolve across a stable fourteen-capability catalog. Critical
  delete, terminal, browser-mutation, and downstream-MCP capabilities cannot
  be serialized with automatic approval; preset profiles cannot smuggle
  custom overrides.
- Decision safety: catalog entries separately report permission-plan,
  workspace-grant, provider-bridge, and local-runtime denial sources, with
  stable catalog diffs for dynamic registration.
- Runtime safety: scoped one-shot leases reject wrong account/workspace,
  replay, expiry, revocation, malformed identity, and unavailable
  capabilities. Revocation, sign-out, and timeout abort active operations
  immediately.
- Coordination limitation: the recorded `workers/vibespace-mcp/**` owner is
  still marked implementing in the root coordination ledger, so this slice
  intentionally changes only the newly owned frontend registry files.
- Commit: `cf845024`.

### M5b — permission-derived read registration

- Status: `VERIFIED`
- RED evidence: an `off` or restrictive `custom` profile still advertised
  every fixed read tool, a profile scoped to another account/workspace was not
  rejected, and changing only the profile did not reconnect the relay.
- GREEN evidence: 45/45 focused permission, workspace-grant, bridge, and hub
  tests pass; app TypeScript passes.
- Compatibility: session grants now carry an explicit versioned `read`
  profile. Legacy bridge callers without a profile retain the already-tested
  read-only catalog; no mutation or terminal capability is added.
- Dynamic registration: `fs.list` and `fs.read` are advertised only when the
  active scoped profile enables their matching capabilities. `off`, malformed,
  and wrong-scope profiles fail closed, and a profile-only change reconnects
  immediately so the remote catalog cannot remain stale.
- Privacy: registration still transmits neither the absolute workspace root,
  account token, nor permission profile. Only the bounded tool schemas and
  non-sensitive grant display metadata leave the device.
- Coordination limitation: `workers/vibespace-mcp/**` remains excluded while
  its recorded owner is unresolved.
- Commit: pending exact-path commit.

## Completion labels

Only `VERIFIED`, `IMPLEMENTED — NATIVE VERIFICATION REQUIRED`,
`IMPLEMENTED — PROVIDER VERIFICATION REQUIRED`,
`BLOCKED — PROVIDER CAPABILITY`, `BLOCKED — OWNER ACTION REQUIRED`,
`BLOCKED — TECHNICAL`, and `NOT STARTED` are used.
