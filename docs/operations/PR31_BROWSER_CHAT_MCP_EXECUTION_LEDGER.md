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
- Commit: `af4ec351`.

### M5c — durable scoped permission profiles

- Status: `VERIFIED`
- RED evidence: no durable authority record existed for a selected Browser
  Chat permission plan; session grants always reconstructed the Read preset.
  The first additive-schema test also caught and rejected a duplicate compound
  index before the migration was committed.
- GREEN evidence: 36/36 focused schema migration, permission repository,
  permission registry, and existing Browser Chat repository tests pass; app
  TypeScript passes.
- Storage: Dexie V12 adds one unique local profile row per exact
  account/workspace/project scope. Existing V1–V11 declarations remain frozen
  and migration tests preserve prior rows byte-for-byte.
- Validation: repository writes round-trip through the permission profile
  parser, reject wrong account/project scope and unsafe critical overrides,
  update the existing scoped row atomically, and revoke only the exact scope.
- Boundary: the durable record stores permission intent only. Absolute roots
  and executable grants remain session-only and must still be approved after
  restart.
- Commit: `34895b31`.

### M5d — visible plan selector and custom approvals

- Status: `VERIFIED`
- RED evidence: the Connection inspector had fixed read-only copy and static
  “approval required” claims, no selectable plans, no granular Custom modes,
  and no path from a saved profile into an already-active local grant.
- GREEN evidence: 54/54 focused hub, permission panel, workspace grant,
  permission repository/registry, and bridge tests pass; app TypeScript passes.
- UX: the inspector exposes Off, Read, Project Developer, Full Local
  Developer, and Custom. Custom provides a per-capability approval selector;
  critical delete, terminal, browser-mutation, and downstream-MCP actions
  expose only Always block or Ask every time.
- Truthfulness: the capability circuit reports executable, locally/provider
  unavailable, and plan-blocked totals from the real catalog. Only bounded
  `files.list` and `files.read` are currently marked executable; the UI no
  longer claims unavailable mutation families merely need approval.
- Runtime: changing a plan persists the exact account/workspace/project
  profile, updates a matching session grant without changing its root or ID,
  and forces bridge re-registration through the prior M5b path. A newly
  approved root inherits the saved profile.
- Safety: durable permission intent remains separate from session-only
  filesystem authority. Profile save failures roll back the live plan, and
  scope mismatch is rejected before a grant changes.
- Design: the existing VibeSpace inspector palette and typography are
  preserved; one copper “capability circuit” rule carries the live authority
  summary, with dense controls limited to Custom mode.
- Commit: `080ff3c9`.

### M5e — provider capability truth boundary

- Status: `VERIFIED`
- Current-source check (2026-08-10): OpenAI’s official
  [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt)
  says full modify/write MCP is a beta for Business, Enterprise, and Edu on
  ChatGPT web, while Pro custom MCP remains read/fetch-only. ChatGPT can still
  require confirmation or block risky actions, and published app action
  changes are not automatically enabled.
- RED evidence: the catalog had one coarse provider-connected boolean, so a
  VibeSpace developer plan could not distinguish provider-plan rejection from
  a missing local adapter.
- GREEN evidence: 32/32 focused provider-tier, permission registry, permission
  panel, and Browser Chat hub tests pass; app TypeScript passes.
- Fail-closed model: an unknown or read/fetch-only ChatGPT workspace permits
  only non-mutating capabilities. The full catalog is provider-eligible only
  for an explicitly verified full-MCP-beta tier; no provider-page scraping or
  subscription inference is used.
- Denial clarity: catalog entries now distinguish
  `provider_capability_unsupported` from relay disconnection, missing root
  grant, permission-plan denial, and local runtime unavailability. The UI
  reports provider-limited, locally unavailable, grant-required, and
  plan-blocked totals separately.
- Commit: `92c6dde3`.

### M5f — scoped approval broker

- Status: `VERIFIED`
- RED evidence: the permission registry could calculate `ask` and
  `always_ask`, but no local authority boundary converted those modes into
  bounded approval requests and single-use execution leases.
- GREEN evidence: 12/12 focused approval-broker and permission-registry tests
  pass; app TypeScript passes; both new files pass Prettier.
- Approval semantics: `auto` issues a scoped lease immediately, `ask` remembers
  approval only for the current broker session, and `always_ask` creates a new
  request for every operation. Unanswered requests expire after a bounded
  timeout.
- Execution safety: approved leases remain account/workspace scoped,
  short-lived, capability-specific, single-use, and immediately revocable.
  Profile changes and sign-out clear pending/session approvals and abort active
  operations.
- Validation: malformed replacement profiles are rejected before valid active
  authority is revoked. Provider, grant, plan, and local-runtime denials remain
  structured and distinct.
- Privacy: approval records contain only request ID, capability, approval mode,
  local scope IDs, and timestamps; tool arguments, absolute roots, file
  contents, and credentials are not retained.
- Boundary: this broker does not advertise or route a new remote mutation tool.
  `workers/vibespace-mcp/**` remains excluded while its recorded owner is
  unresolved.
- Commit: `9fecc188`.

### M5g — bounded file discovery adapter

- Status: `VERIFIED`
- RED evidence: Browser Chat had no capability-scoped local adapter for
  project search, and its existing read dispatcher did not expose a reusable
  approval-lease boundary for list/read/search execution.
- GREEN evidence: 17/17 focused file-adapter, approval-broker, and
  permission-registry tests pass; app TypeScript passes; both new files pass
  Prettier.
- Root safety: every request accepts only a bounded project-relative path,
  resolves it beneath one normalized approved root, rejects traversal,
  absolute paths, URI schemes, control characters, and sensitive path
  segments by default, and invokes native reads with strict project-boundary
  enforcement.
- Result safety: native entry paths must match their reported immediate child,
  absolute roots never appear in returned list/read/search records, reads are
  capped at 48 KiB, lists at 500 entries, and searches have explicit depth,
  entry, file, match, query, and snippet limits.
- Authority: list, read, and search each require a matching account/workspace
  scoped one-shot lease. Lease expiry or revocation cancels the caller-visible
  operation; replay and cross-capability lease use are rejected.
- Privacy: sensitive file paths are excluded by default. Content passes the
  shared secret detector with configurable exclude/redact/ask behavior, and
  thrown native errors are normalized without reflecting private paths.
- Boundary: this adapter is production-backed by the existing Tauri filesystem
  wrappers but is not added to relay registration yet. The unresolved Worker
  ownership means the end-to-end catalog remains truthfully limited to its
  existing executable read routes.
- Commit: `e1cec586`.

### M5h — native exact-base text mutation authority

- Status: `VERIFIED`
- RED evidence: existing native file writes could overwrite without an
  expected-base digest, so a Browser Chat preview could become stale before
  apply and still mutate a newer file.
- GREEN evidence: two real native temporary-directory tests pass for exclusive
  create, exact-hash modify, stale-base rejection with content preservation,
  and exact-hash delete. Six frontend filesystem normalization tests, app
  TypeScript, and the frozen ordinary-handler authority test pass.
- Native boundary: the new command requires an explicit strict project root,
  opens parents/files through capability-relative no-follow handles, rejects
  symlink/reparse traversal, accepts only UTF-8 text up to 256 KiB, serializes
  app mutations, and synchronizes successful writes to disk.
- Compare-and-swap: create uses create-new semantics; modify and delete require
  the SHA-256 of the currently opened file. Mismatches return `stale_base`
  without mutation.
- Evidence: successful native receipts contain only before/after SHA-256 and
  byte counts. The TypeScript wrapper validates the complete receipt and
  normalizes malformed/native errors before Browser Chat can consume them.
- Integration: the command is registered in the ordinary Tauri handler and
  both frozen handler hashes were intentionally refreshed by their guarding
  test.
- Boundary: this native primitive is not itself a remotely advertised tool.
  Browser Chat approval, preview, apply, rollback, and relay routing remain
  separate layers.
- Commit: `f9221dde`.

### M5i — previewed file mutation and rollback adapter

- Status: `VERIFIED`
- RED evidence: the exact-base native primitive had no Browser Chat adapter
  enforcing capability-specific approval, content-opaque previews, one-use
  apply, or separately authorized rollback.
- GREEN evidence: 28/28 focused mutation-adapter, discovery-adapter,
  approval-broker, permission-registry, and filesystem-wrapper tests pass; app
  TypeScript passes; all touched frontend files pass Prettier.
- Preview authority: create/modify/delete previews require a separate
  `files.read` lease before inspecting existence or content. Custom profiles
  therefore cannot enable mutation while silently bypassing denied read
  authority.
- Apply authority: create, modify, and delete require matching
  `files.create`, `files.modify`, and `files.delete` one-shot leases. Forged,
  replayed, expired, wrong-capability, and revoked previews fail before native
  mutation.
- Change safety: public previews include only relative path, operation,
  before/after hashes and byte counts, bounded changed-line counts, and expiry.
  Previous/next content remains in a private in-memory record and is never
  serialized in the preview or receipt.
- Concurrency and evidence: apply calls the native compare-and-swap authority
  with the preview’s exact base hash and rejects stale bases without fake
  success. The adapter independently verifies every returned path, hash, and
  byte count.
- Rollback: each successful apply creates a private, single-use, fifteen-minute
  undo record. Undo itself requires the capability implied by the reverse
  operation: delete for undo-create, modify for undo-modify, and create for
  undo-delete. Concurrent changes make rollback fail closed.
- Retention: previews expire after five minutes; undo records expire after
  fifteen minutes; explicit adapter revocation clears all retained rollback
  content immediately. Sensitive paths/content are conservative by default and
  require explicit adapter configuration.
- Boundary: create/modify/delete are locally executable but remain absent from
  remote registration until the excluded Worker protocol can route and attest
  them end to end.
- Commit: `01c49e2e`.

### M5j — account-scoped live tool activity truth

- Status: `VERIFIED`
- RED evidence: the Connection inspector showed only coarse relay state and
  could not distinguish the registered catalog, current tool calls, or last
  verified local result.
- GREEN evidence: 38/38 focused tool-activity, bridge, and Browser Chat hub
  tests pass; app TypeScript passes; all six touched frontend files pass
  Prettier.
- Catalog truth: the bridge publishes the sorted, de-duplicated tool names
  only after the relay acknowledges registration. Socket close, reconnect,
  and explicit stop clear the matching account snapshot.
- Activity truth: validated calls are marked running immediately before local
  invocation and settled after the real adapter returns or denies. The store
  supports bounded concurrency and records only tool name, opaque call ID,
  success/error code, elapsed milliseconds, and timestamps.
- Account isolation: catalog, begin, finish, and clear transitions require the
  exact active account. Wrong-account, unadvertised, replayed, malformed, and
  over-capacity events fail closed.
- Privacy: tool arguments, roots, file paths, results, content, tokens, and raw
  errors never enter the activity store. Telemetry failures are observational
  and cannot change tool execution or its reply.
- UX: the Connection inspector now independently reports advertised count,
  running count/tool names, and the last bounded result. A missing scoped
  catalog is shown explicitly rather than inferred from page or relay state.
- Boundary: current catalog truth remains read-only because mutation routing
  is still excluded at the Worker protocol boundary.
- Commit: `7bcea1ca`.

### M5k — strict metadata, directory, copy, and move adapters

- Status: `VERIFIED`
- RED evidence: Browser Chat had bounded list/read/search and exact-base text
  mutation, but no capability-scoped stat/hash, directory creation, copy, or
  move adapter with native result evidence.
- GREEN evidence: 13/13 focused Browser Chat structure, filesystem wrapper,
  and existing Files-page compatibility tests pass; all 20 native filesystem
  tests pass against real temporary directories; the frozen native handler
  authority test and app TypeScript pass; Rustfmt and Prettier are clean.
- Native boundary: metadata and optional SHA-256 come from the same strict,
  no-follow capability-relative file handle. Directory creation walks and
  opens every component without following links and reports whether anything
  was actually created.
- Transfer truth: copy is create-new, capped at 16 MiB, fsynced, removes a
  partial destination on failure, and returns the hash of the bytes written.
  The Browser Chat move command preserves create-new/no-overwrite behavior,
  verifies source and destination hashes before deleting the source, and
  returns bounded native byte/hash evidence. The existing general Files-page
  rename command remains compatible and does not inherit the evidence cap.
- Authorization: stat/hash requires a one-shot `files.read` lease; directory
  creation requires `files.create`; copy independently consumes read and
  create leases; move consumes `files.move`. Revoked operations are rejected
  before native invocation.
- Scope and privacy: all paths are relative to the normalized approved root,
  traversal and sensitive paths remain blocked by default, forged absolute
  paths/receipts fail closed, and public receipts contain only relative paths,
  byte counts, hashes, timestamps, and file kind.
- Boundary: these adapters are locally executable but are not remotely
  advertised until the separately owned Worker protocol can route and attest
  them end to end.
- Commit: `dad47be0`.

### M5l — account-scoped project context and output retrieval

- Status: `VERIFIED`
- RED evidence: the permission registry and local adapter surface had no
  explicit authority for listing VibeSpace projects, retrieving approved
  project context, or listing verified project outputs.
- GREEN evidence: 40/40 focused project-context, permission-registry,
  approval-broker, permission-panel, and Browser Chat hub tests pass against
  real IndexedDB fixture rows; app TypeScript and Prettier pass.
- Permission boundary: three non-mutating capabilities now distinguish
  `project.list`, `project.context`, and `project.outputs`. Every call consumes
  a capability-specific lease whose account/workspace must match the adapter
  scope.
- Project isolation: the adapter verifies the workspace owner, filters
  projects by the exact workspace, verifies the active project belongs to that
  workspace, and never returns foreign-workspace projects.
- Context provenance: active Context Maps are filtered by exact account and
  project. Repository search reuses the existing verified retrieval runtime,
  accepts only the active scoped map, validates repository/source/entity/
  provenance identities and content/AST hashes, applies the configured secret
  policy, and caps both item count and returned content bytes.
- Output provenance: artifacts are joined only through runs matching the exact
  account, workspace, and project; quarantined artifacts and private backing
  references are omitted. Returned output data is bounded to safe metadata,
  content hash, size, state, timestamps, and app-verified trust.
- Truth boundary: project/context/output capabilities remain unavailable in
  the product status catalog until their local adapters are composed into the
  relay and the separately owned Worker protocol can attest them end to end.
- Commit: `db37f308`.

### M5m — account-scoped downstream MCP execution

- Status: `VERIFIED`
- RED evidence: Browser Chat had no adapter for the existing VibeSpace MCP
  gateway. The initial suite failed on the missing module; an identity
  hardening case then proved a conflicting server identity could otherwise be
  surfaced, and read-profile tests proved that one mutation-classified
  `mcp.invoke` capability would incorrectly block read-only downstream tools.
- GREEN evidence: 53/53 focused downstream-adapter, gateway,
  permission-registry, approval-broker, provider-capability, permission-panel,
  and Browser Chat hub tests pass; app TypeScript and Prettier pass.
- Real fixture execution: the adapter drives a real scoped
  `VibeSpaceMcpGateway` instance backed by an in-process MCP runtime fixture.
  Tests execute one read tool, one observable mutation tool, and one pending
  tool cancelled through permission revocation. Gateway success/cancellation
  receipts are asserted rather than mocked.
- Permission boundary: `mcp.read` is a distinct non-mutating capability
  available to the Read plan and provider read/fetch surfaces. Write and
  mutation classifications require `mcp.invoke`, which remains critical and
  always asks. Classification is derived from the live approved catalog, not
  caller input.
- Scope and catalog truth: gateway account/project identity must match the
  adapter; workspace identity is enforced by the one-shot Browser Chat lease.
  Only approved, exposed, connected `external_mcp` tools with matching
  connection/server identities and live health evidence are listed.
- Invocation safety: task/connection/tool identities and JSON arguments are
  bounded, accessors and non-plain records fail closed, the exact tool is
  passed as the gateway task allowlist, and returned receipts are revalidated
  against exact account/project/task/tool/classification identity. Endpoints
  and credentials never enter the public catalog result.
- Cancellation: profile revocation aborts the Browser Chat operation signal,
  the gateway cancels the in-flight downstream invocation, and the public
  adapter returns `operation_cancelled` while the gateway retains a bounded
  cancelled receipt.
- Boundary: the adapter is locally executable through the existing production
  gateway but remains absent from remote Browser Chat registration until the
  separately owned Worker/relay protocol advertises and routes it end to end.
- Commit: `a5c82c72`.

### M5n — terminal and Git policy/receipt adapter

- Status: `VERIFIED`
- RED evidence: Browser Chat had permission IDs for terminal and Git but no
  adapter that joined one-shot Browser Chat leases to the existing canonical
  terminal/Git broker. The initial suite failed on the missing module; a later
  hardening case proved unsafe Git paths reached local execution authority
  before the broker rejected them.
- GREEN evidence: 21/21 focused terminal/Git adapter, canonical broker,
  approval-broker, and permission-registry tests pass; app TypeScript and
  Browser Chat adapter Prettier checks pass.
- Real fixture execution: tests drive the real
  `createNativeTerminalGitCapabilityBroker` through a bounded execution port.
  They verify a typed terminal command, read-only Git status, an observable
  Git commit checkpoint, and cancellation of a pending native call.
- Dual authority: a Browser Chat capability lease is necessary but
  insufficient. A sealed local authority must also issue the exact
  `JarvisIssuedActionExecution` and native scope bound to account, project,
  task, approved root, parameter hash, and current operation signal. Remote
  callers cannot construct or pass that execution object.
- Git separation: status/diff require `git.status`; worktree patch, index,
  commit, and ref creation require `git.checkpoint`. Fetch and push remain
  rejected as `operation_unsupported` because no dedicated Browser Chat
  network/remote capability exists.
- Terminal safety: commands remain typed executable/argument arrays, not
  shell strings; shells and Git-as-terminal are rejected by the canonical
  broker. Browser Chat further caps timeout at 120 seconds, captured output at
  64 KiB, memory at 2 GiB, and process count at 32.
- Pre-approval validation: Browser Chat reuses the canonical terminal command
  and Git intent validators before requesting local execution authority, so
  traversal, secret environment, shell, refspec, force, hook, and credential
  helper violations do not reach the authority issuer.
- Cancellation and evidence: permission revocation aborts the signal used by
  the sealed Jarvis execution and reaches the native port. Command/intent
  hashes and bounded native receipts are rechecked after execution; public
  receipts contain no approved absolute root.
- Boundary: this policy/receipt adapter is not advertised as locally
  executable in the product catalog until a production
  `NativeTerminalGitExecutionPort`, sealed execution-authority issuer, and
  relay route are composed and verified. The separately owned Worker remains
  untouched.
- Commit: `7234fd03`.

### M5o — isolated Playwright browser policy/receipt adapter

- Status: `VERIFIED`
- RED evidence: Browser Chat had browser permission IDs and an existing
  isolated Playwright worker, but no adapter joining its one-shot leases to
  worker scopes and local browser authority. The initial suite failed on the
  missing module; a hardening case then proved an unknown raw-script action
  could reach the shared worker boundary before being rejected.
- GREEN evidence: 26/26 focused Playwright adapter, isolated worker,
  browser-action approval, approval-broker, and permission-registry tests
  pass; app TypeScript passes.
- Real fixture execution: tests drive the real
  `createPlaywrightBrowserWorker` through an in-process isolated host port.
  They verify a bounded DOM observation, semantic navigation, canonical
  worker evidence, and cancellation of a pending host operation.
- Dual authority: a Browser Chat capability lease is necessary but
  insufficient. A local authority must also issue the exact isolated worker
  scope and browser-action authorization bound to account, project, task,
  session, request, action hash, timeout, and current operation signal.
- Capability separation: observe, screenshot, and bounded pause require
  `browser.read`; navigation and every interaction/session mutation require
  `browser.mutate`. Permission revocation aborts the operation signal and
  reaches the isolated host.
- Script and target safety: the shared worker validator now rejects unknown
  runtime action names before local authority is requested. The adapter
  accepts only the canonical action union, whose interactions use semantic
  role, label, or test-id targets; no raw script/evaluate action exists.
- Isolation and evidence: the worker retains its ephemeral non-persistent
  profile, allowed-origin/action, page-count, upload/download, timeout, and
  receipt bounds. Public URLs omit credentials, query strings, and fragments;
  screenshots, traces, downloads, hashes, and canonical result references
  remain explicit.
- Untrusted-content boundary: page title/text is evaluated as untrusted DOM
  data. Safe content carries a data-only receipt; authority-like or
  credential-requesting content is quarantined and the raw hostile text is
  omitted from the public result.
- Boundary: this adapter is not a way to connect ChatGPT to VibeSpace MCP and
  does not inspect the provider-owned conversation surface. It is not
  advertised as locally executable until a production isolated host, sealed
  browser-authority issuer, and relay route are composed and verified. The
  separately owned Worker remains untouched.
- Commit: `552bcf7b`.

## Completion labels

Only `VERIFIED`, `IMPLEMENTED — NATIVE VERIFICATION REQUIRED`,
`IMPLEMENTED — PROVIDER VERIFICATION REQUIRED`,
`BLOCKED — PROVIDER CAPABILITY`, `BLOCKED — OWNER ACTION REQUIRED`,
`BLOCKED — TECHNICAL`, and `NOT STARTED` are used.
