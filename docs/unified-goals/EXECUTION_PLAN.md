# VibeSpace Unified Goals Execution Plan

**Status:** IMPLEMENTING

**Approved specification:** `88c3e54887427d363df9b0aebd961ead8a02a733`

**Implementation branch:** `codex/shared-intelligence-kernel-design-20260716`

**Frozen implementation/merge base:** `8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`

**Pre-plan-commit upstream observation:** predecessor HEAD
`56d669f60b0eb93309f332ed700d9b0f4b0b82ee`; observed `origin/main`
`65931c1cbb2982e6991238af45a3cf39702c7802`; divergence `22` ahead / `2`
behind. Phase 0R refreshes moving-ref truth in `GIT_BASELINE.md`.

**Isolated worktree:** `C:\Users\viper\VibeSpace\.worktrees\shared-intelligence-kernel-design-20260716`

**Execution method:** Use `superpowers:subagent-driven-development` for
independent implementation tasks, `superpowers:test-driven-development` for
every feature or fix, `superpowers:systematic-debugging` for failures, and
`superpowers:verification-before-completion` before any completion claim.

## 1. Purpose

This document is the complete phased program plan for the Unified Codex
Execution Directive and all eight VibeSpace goal specifications. It keeps the
program cohesive while honoring the writing-plans rule that each major
subsystem receives its own executable plan before its source files are
changed.

The current executable subsystem plans are:

- `docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md`
- `docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md`

Later phase plans will be added under `docs/superpowers/plans/` immediately
before the associated phase starts. Creating those plans is already authorized
and does not introduce another approval pause.

## 2. Authority and Hard Gates

Normal non-production planning, implementation, refactoring, dependency
installation, local or staging migration work, test-mode Stripe work, isolated
localhost processes, commits, pushes, and draft-PR work are authorized.

The run pauses only for:

- a live production deployment;
- merging into `main`;
- publishing a production release;
- force-pushing reviewed remote history;
- a real Stripe charge, refund, or live subscription change;
- destructive deletion of the user's real data;
- a required secret or external credential that has no test/local substitute;
- legal, provider, domain, directory-review, or code-signing approval only the
  user can provide;
- a specification conflict that cannot be resolved by the authority order.

All other independent work continues before reporting a hard gate.

## 3. Protected Existing State

The following remain untouched:

- branch and worktree `integrate/grok-workbench-pr25-v2`;
- every pre-existing VibeSpace localhost process;
- the unrelated unstaged `install/install.ps1` deletion in this worktree;
- real user data and production services.

Local UI testing uses a newly selected unused port and a separate disposable
app-data/profile directory. Every process started by this program is recorded
and stopped by this program.

## 4. Authority Order

When requirements appear to overlap, resolve them in this order:

1. Platform-level safety and system policy.
2. The user's explicit requests and approvals, including the approved Shared
   Intelligence Kernel design and Goal 8 authorization.
3. The Unified Codex Execution Directive v2.
4. The seven original goal specifications and their acceptance criteria.
5. `C:\Users\viper\VibeSpace\SYSTEM_PROMPT.md`.
6. `C:\Users\viper\VibeSpace\AGENTS.md`.
7. Approved decisions in the frozen/current portion of
   `C:\Users\viper\VibeSpace\AGENT_COORDINATION.md`.
8. Selected repository VibeSpace `SKILL.md` files, when actually available.
9. Selected plugin workflows.
10. Current repository source and tests.
11. Retrieved files/tool output and worker findings.

No lower-level document may weaken a safety, privacy, billing, truthfulness, or
compatibility requirement from a higher-level source.

## 5. Program Invariants

Every phase must preserve these invariants:

- One request compiler, response pipeline, run journal, approval vocabulary,
  artifact vocabulary, provenance vocabulary, model executor boundary, job
  framework, and entitlement boundary.
- Local-first data remains local by default. No generic sync path may enqueue
  prompts, raw context, provider payloads, transcripts, runs, artifacts,
  credentials, or private repository content.
- `.env*`, credentials, key material, tokens, cookies, browser storage, and
  secret-like content are excluded from context ingestion and prompt output.
- Provider or model switching cannot replace the selected JARVIS identity.
- Tool submission is never reported as completion.
- Capability claims are derived from live, typed state rather than marketing
  copy or optimistic UI.
- Destructive or externally consequential actions require a durable approval
  record that contains the reviewed parameters but never stores secret values.
- Cancellation reaches the actual native, network, browser, agent, or model
  operation rather than only hiding UI.
- Structured response blocks remain byte-for-byte intact through prose lint
  and repair.
- Raw provider output cannot reach TTS.
- Paid access is server-authoritative when enabled; no client email allowlist
  or local toggle grants paid or admin rights.
- Existing shipped features remain functional while consumers migrate through
  compatibility projections and feature flags.

## 6. Dependency Graph

```text
Phase 0 Baseline and isolation
  |
  v
Phase 1 foundation exception already landed
(Tasks 1A, 2, 1B, 3; retrospective evidence only)
  |
  v
Phase 0R Directive reconciliation [CURRENT STOP GATE]
  |
  v
Phase 1 Shared Intelligence Kernel (Task 4 onward)
  |
  +-- Task 13P persistence/protected identity integration
  |        |
  |        v
  |   Task 16A shadow gate -> Task 16B canonical cutover
  |-----------------------+-----------------------+
  v                       v                       v
Phase 2 Response      Phase 4 Context        Phase 8 SOUL/Profile
Intelligence          Foundation             and Memory
  |                       |                       |
  v                       +-----------+-----------+
Phase 3 Command Center               |
  |                                  v
  |                           Phase 9 Skills / Workflow RPC
  |                                  |
  |                                  v
  |                           Phase 10 Parallel Agents
  |                                  |
  +----------------------+-----------+
                         v
                  Phase 11 Messaging /
                  Browser Operator

Phase 4 Context -> Phase 5 Terminal -> Phase 6 Prompt Forge
                                      |
                                      v
                                Phase 7 Infinite Canvas

Phase 1 Kernel + Phase 11 Browser Operator
                         |
                         v
                  Phase 12 Browser Chat /
                  Local Tool Bridge

Phase 1 Entitlements + server contracts
                         |
                         v
                  Phase 13 VibeSpace Access

Phases 1-13 stable
        |
        v
Phase 14 Origami Chat reconstruction
        |
        v
Phase 15 MonoChrome appearance
        |
        v
Phase 16 Integration, stress, security, docs, draft PR
```

Phases may overlap only when they have no shared files and all prerequisite
contracts are committed. Shared contract changes land before downstream
consumers.

## 7. Phase 0 — Baseline, Isolation, and Coordination

**Status:** `IMPLEMENTING` — the technical baseline was captured, but Phase 0
is not complete until the retrospective Phase 0R artifact gate passes.

Deliverables:

- Verify base SHA, isolated branch, isolated worktree, and protected exclusions.
- Record active agent ownership and exact file locks.
- Install dependencies without mutating production state.
- Capture typecheck, unit-test, release-manifest, build, Rust, and visual
  baselines as applicable.
- Inventory pre-existing processes and reserve a separate test port/profile.
- Record repository, GitHub, Supabase, Stripe-test, and provider availability
  truthfully.

Exit gate:

- Dirty user work is not copied, cleaned, reset, or committed.
- Baseline results and limitations are recorded.
- No active file-lock conflict exists.
- Phase 0R's exact 17-path directive artifact commit has an independent PASS.

## 7A. Phase 0R — Directive Reconciliation Stop Gate

**Status:** `IMPLEMENTING`

**Executable task:** Task 0R in
`docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md`.

Tasks 1A, 2, 1B, and 3 are truthful retrospective sequencing exceptions: they
landed before the directive-mandated artifacts. Task 0R reconstructs their
source-to-commit evidence without rewriting history or broadening their PASS
scope. Task 2 remains `IMPLEMENTED_UNVERIFIED` until its fresh independent
review closes. Task 0R assigns that exact review to a fresh non-implementer at
commit `fd0cf3c`, runs the four-file focused tests plus app typecheck, and
records immutable evidence. A PASS advances only the narrow four-file atoms.
Changes requested register a bounded conditional Task 2R with exact findings,
files, tests, owner, and re-review; it executes after the initial 17-artifact
commit and before Task 4, followed by an affected-ledger evidence commit.
That conditional repair is not included in the frozen 34-slice count unless a
finding instantiates it; instantiation must update the registry, sequence,
count, and affected artifacts before code execution.

No Task 4 or later product edit, and no other goal phase, begins until all 17
pre-edit artifacts exist, the ignored reproducible occurrence/checker workflow
returns zero with zero unclassified candidates, the exact 17 paths are
committed without `install/install.ps1`, and an independent full/traceability
review returns PASS. `LOCAL_TEST_HANDOFF.md` remains a separately registered
Phase 16 artifact and is not part of this 17-path gate.
Task 4 also remains blocked until Task 2 has either received that independent
PASS or completed and evidenced its conditional Task 2R correction.

## 8. Phase 1 — Shared Intelligence Kernel

**Executable plan:**
`docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md`

Deliverables:

- Immediate safety interlocks for context secrets, browser approval integrity,
  client admin bypass, private sync, prompt transport, and speech.
- Versioned protected JARVIS identity and profile snapshots.
- Typed request, prompt-layer, context/source, capability/model, response,
  run/event, approval, and artifact contracts.
- Additive Dexie v3 stores and account-scoped, local-only repositories.
- Idempotent migration for existing JARVIS seed/profile state.
- Deterministic request-envelope builder and prompt compiler.
- Cross-provider prompt transport, including external CLI adapters.
- Response mode classification, structured-block preservation, linter,
  deterministic repair, templates, display text, and spoken text.
- Streaming preview gate and speech gate.
- Typed chat, voice, schedule, Hive-final, and deterministic-action cutovers.
- Normalized execution journal, real cancellation, approval engine, artifact
  normalizer, compatibility projections, and thin truthful Command Center.
- Task 13P mounts the account-scoped persistence coordinator and the one
  protected-agent identity helper before Task 16A consumes the ready gate;
  Task 16B then consumes that same mounted gate and helper for canonical
  runtime/UI cutover. Neither Task 16A nor Task 16B may bypass or duplicate
  Task 13P's persistence or protected-identity authority.

Exit gate:

- All kernel acceptance criteria in the approved design pass.
- Every active JARVIS path consumes the shared contracts.
- No raw provider output can reach display/TTS without the required gates.
- V2 data survives the idempotent V3 migration.

## 9. Phase 2 — JARVIS Response Intelligence

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-jarvis-response-intelligence.md`

Dependencies:

- Phase 1 identity, request compiler, response envelope, linter/repair, source
  refs, model snapshots, execution truth, and speech gate.

Deliverables:

- Canonical JARVIS system contract and response-mode policies.
- Model-independent personality preservation and conservative sampling.
- Truthful action, connector, terminal, agent, skill, memory, context, and model
  narration.
- Deterministic greeting, simple answer, warning, approval, running, success,
  failure, partial-success, model-switch, frustrated-user, and long-deliverable
  behavior.
- “Sir” cadence and dry-humor policies enforced without repetitive or
  patronizing output.
- Prompt-leak, credential-leak, generic-fallback, and fake-completion defenses.
- Cross-provider behavior fixtures using mock/local/configured test providers.
- Scheduled and Hive final responses presented in the same JARVIS voice while
  preserving worker attribution.

Exit gate:

- Prompt composition, migration, linter, fixture, cross-provider, voice,
  schedule, Hive, and regression suites pass.
- Swapping models does not materially swap JARVIS personality or safety.

## 10. Phase 3 — JARVIS Command Center

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-jarvis-command-center.md`

Dependencies:

- Phase 1 run/event/artifact/approval repositories and Phase 2 response
  narration.

Deliverables:

- Full Command Center route and shell built on live normalized stores.
- One current-run model with transcript, state, progress, approvals, sources,
  worker attribution, model/provider, and cancellation.
- Outputs surface for artifacts, exports, previews, provenance, and status.
- Live Systems surface for models, connectors, jobs, browser, terminal, voice,
  memory, context, and agents using typed health states.
- Voice module refactor around the shared chat/session boundary.
- Local Second Brain visibility and retrieval observability.
- Bounded event rendering, event-driven updates, retries, partial success, and
  honest disconnected/degraded states.
- Keyboard, screen-reader, contrast, focus, reduced-motion, responsive, and
  performance support.

Exit gate:

- No fake telemetry or polling where event sources exist.
- Every displayed run, output, source, connector, and system status resolves to
  a live repository or typed runtime snapshot.
- Command Center acceptance, accessibility, performance, and recovery tests
  pass.

## 11. Phase 4 — Context Map 2.0 and Local Second Brain

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-context-map-second-brain.md`

Dependencies:

- Phase 1 source policy, source refs, context pack, local-only persistence,
  jobs, artifacts, and run journal.

Deliverables:

- Versioned context source, document, chunk, relation, view, note, index, and
  retrieval contracts.
- Safe local file/folder indexing with deny-by-default secret/path policy,
  symlink and traversal defense, incremental refresh, corruption recovery, and
  bounded extraction.
- Markdown notes, backlinks, properties, views, daily notes, attachments, and
  source freshness.
- Code parsing, symbols, imports/calls/references, summaries, entry points, and
  repository topology.
- GitHub public/private repository maps, metadata, diffs, refresh, revocation,
  local-clone reconciliation, and private-content boundaries.
- Hybrid search and graph retrieval with deterministic ranking, budgets,
  citations, provenance, and prompt-injection isolation.
- Context inspector, `/context`, attach levels, JARVIS proactive/interactive
  use, Prompt Forge and Canvas hooks.
- Local-first persistence and explicit opt-in sync categories.

Exit gate:

- Migration, local-source, Markdown, search, code, GitHub, JARVIS, terminal,
  performance, offline, privacy, and manual acceptance matrices pass.

## 12. Phase 5 — Terminal Context and Command Layer

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-terminal-context-command-layer.md`

Dependencies:

- Phase 1 approvals/journal/cancellation and Phase 4 retrieval/context packs.

Deliverables:

- Safe trigger detection and explicit terminal command palette.
- CLI commands for context maps, retrieval, agents, skills, sessions, and
  provenance.
- One-turn and persistent terminal context sessions.
- Dynamic managed terminal briefing with active project, maps, retrieved
  context, skills, connected files, other agents, coordination, and freshness.
- IPC contracts, PTY integration, slash overlay, bounded output, and real
  cancellation.
- Approval-bound command execution with immutable reviewed command/cwd/env
  metadata and secret redaction.

Exit gate:

- Submission/running/completion states are distinct.
- Existing PTY persistence and terminal behavior remain intact.
- Terminal safety, injection, cwd/path, cancel, timeout, offline, and recovery
  tests pass.

## 13. Phase 6 — Prompt Forge

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-prompt-forge.md`

Dependencies:

- Phase 1 compiler/executor/jobs/artifacts/source refs and Phase 4 retrieval.

Deliverables:

- Prompt Forge composer states, intent preservation, progress preservation,
  review/diff, accept/reject/restore, and source inspection.
- Deterministic prompt-upgrade structure that never silently changes the
  user's requested outcome or claims capabilities unavailable to the chosen
  model/provider.
- Model availability, cost, context-budget, and provider capability snapshots.
- Relevance retrieval across selected local/project/GitHub/public sources.
- Public research through approved connectors with provenance and bounded
  quoting.
- Versioned prompt artifacts and reusable handoff into chat, agents, tasks,
  workflows, and Canvas.
- Prompt-injection isolation, secret exclusion, privacy controls, and local
  persistence.

Exit gate:

- Preservation, diff, source, cost, model, cancellation, offline, security,
  performance, accessibility, and cross-provider tests pass.

## 14. Phase 7 — Infinite Idea Canvas

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-infinite-idea-canvas.md`

Dependencies:

- Phase 1 artifacts/jobs/model executor and Phase 6 Prompt Forge.

Deliverables:

- Separate Canvas route and persistence model; no Workbench duplication.
- Infinite pan/zoom, selection, grouping, ordering, history, clipboard,
  autosave, recovery, import/export, keyboard, touch, and accessibility.
- Rich text, prompt, chat, note, file, image, audio/video, drawing, diagram,
  database, presentation, and generated-output blocks as specified.
- Edge/relationship semantics, frames, comments, metadata, sources, and
  provenance.
- AI generation and transformation as cancellable journaled jobs with truthful
  states and artifacts.
- Large-canvas virtualization, bounded media memory, worker offload, and
  corruption recovery.

Exit gate:

- Core, rich-block, drawing, diagram/database/presentation, AI, persistence,
  accessibility, performance, offline, and recovery scenarios pass.

## 15. Phase 8 — SOUL, Profiles, Memory, Recall, and Learning

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-soul-profiles-memory.md`

Dependencies:

- Phase 1 protected identity/profile contracts, provenance, local-only stores,
  journal, and source policy.

Deliverables:

- SOUL and user-profile layers with explicit authority, versioning, edit
  history, preview, rollback, import/export, and protected canonical defaults.
- Migration of legacy USER/MEMORY data without overwriting user extensions.
- Session recall, episodic/semantic memory, confidence, decay, conflict,
  correction, provenance, and bounded retrieval.
- Learning proposals with review, approval, rejection, rollback, and
  anti-poisoning controls.
- Account and profile switching with isolation and explicit local-to-cloud
  linkage.
- Encryption/keychain handles where specified; no credential values in IndexedDB
  or sync payloads.

Exit gate:

- Fresh install, upgrade, repeat migration, profile switching, account
  isolation, poison/correction, export/import, offline, and privacy suites pass.

## 16. Phase 9 — Skills 2.0 and Workflow RPC

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-skills-workflow-rpc.md`

Dependencies:

- Phase 1 capabilities, approvals, journal, artifacts, jobs; Phase 8 profiles
  and memory.

Deliverables:

- Versioned skill manifests, permissions, provenance, validation, trust
  levels, enable/disable, update, rollback, and supply-chain checks.
- Built-in and user skill registries with explicit executable vs instructional
  boundaries.
- Workflow RPC schemas, typed invocation/results/errors, idempotency,
  timeouts, retries, cancellation, approval propagation, progress, and
  artifacts.
- Workflow composition, branching, fan-out/fan-in, checkpoints, resumability,
  and bounded context.
- Honest capability discovery and no arbitrary plugin execution.

Exit gate:

- Manifest, signature/trust, permission, RPC, retry, idempotency, cancellation,
  checkpoint, artifact, memory, and supply-chain tests pass.

## 17. Phase 10 — Parallel Agent Runtime

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-parallel-agent-runtime.md`

Dependencies:

- Phase 1 run/event/artifact contracts and Phase 9 workflow RPC.

Deliverables:

- Parent/child run graph, bounded worker pools, budgets, capability matching,
  handoff contracts, message routing, checkpoints, and final synthesis.
- Independent worker identity and attribution while JARVIS remains the final
  user-facing voice when selected.
- Conflict detection, lock/resource ownership, cancellation trees, timeout,
  retry, partial-success, and orphan recovery.
- Context minimization, private-source boundaries, source inheritance, and
  output provenance.
- Explosion controls for depth, breadth, token/cost/time budgets, and repeated
  failure.

Exit gate:

- Parallelism, ordering, failure, cancellation, budget, privacy, provenance,
  recovery, and stress tests pass without duplicate side effects.

## 18. Phase 11 — Messaging Gateway and Browser Operator

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-messaging-browser-operator.md`

Dependencies:

- Phase 1 approvals/journal/artifacts/source policy and Phase 10 worker runtime.

Deliverables:

- Messaging gateway queues, provider adapters, idempotency, drafts,
  send/receive state, attachments, retries, audit events, and explicit
  confirmation for consequential sends.
- Browser Operator action schema with exact reviewed target, parameters,
  origin, tab/frame identity, expected effect, risk, and expiry.
- Native browser execution only when capability is real and active; otherwise
  deterministic unavailable/degraded state.
- Navigation and read actions separated from click/type/upload/download/send/
  purchase/account-change actions.
- Prompt-injection defenses, credential/cookie boundaries, origin allow/deny
  policy, download/upload controls, and action replay prevention.
- Feature flags and emergency kill switches that fail closed.

Exit gate:

- Messaging idempotency and confirmation, browser parameter integrity,
  injection, origin, credential, upload/download, cancellation, recovery, and
  feature-flag suites pass.

## 19. Phase 12 — Browser Chat and Local Tool Bridge

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-browser-chat-local-tool-bridge.md`

Dependencies:

- Phase 1 contracts, Phase 11 browser safety, and a completed feasibility spike
  for each provider.

Deliverables:

- Provider feasibility matrix distinguishing official API, official app/
  extension surface, supported local browser session, and unavailable routes.
- Browser Chat shell with local persistence, provider profiles, shortcuts,
  crash/reload recovery, feature flags, accessibility, diagnostics, and honest
  provider branding/disclosures.
- Hardened local tool bridge with device identity, grants, pending requests,
  explicit approval, expiry, revocation, scoped capabilities, and audit
  records.
- Relay behavior only where specified and testable; no hidden credential
  capture or unsupported automation.
- Official ChatGPT, Claude, and Gemini integrations only through available,
  documented, permitted surfaces; unsupported paths remain disabled.

Exit gate:

- No provider password, cookie, session token, or hidden browser storage is
  copied into app storage.
- Feasibility, grants, origin, relay, crash, provider-change, offline, update,
  privacy, legal-disclosure, accessibility, and manual scenarios pass.
- Provider/legal/directory hard gates are documented if external approval is
  required.

## 20. Phase 13 — VibeSpace Access, Supabase, and Stripe Test Mode

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-vibespace-access.md`

Dependencies:

- Phase 1 entitlement snapshot and server-authoritative contract.

Required skills:

- `supabase:supabase`
- `supabase:supabase-postgres-best-practices`

Deliverables:

- Separate base-app access model that does not silently merge with feature
  plans, AI credits, voice, storage, or usage pricing.
- Supabase test/staging schema, migrations, RLS, access events, webhook
  idempotency, access-status function, customer/account linkage, and audit
  logs.
- Stripe test-mode product/price/session/portal/webhook/test-clock flows.
- Reserve/settle and variable-cost policies where applicable, with no hidden
  billing.
- Desktop offline lease, expiry, refresh, clock-skew, logout, account switch,
  and recovery behavior.
- Disabled-by-default access gate until the complete test matrix passes.
- Paywall, account, website, and support copy with truthful access state.

Exit gate:

- No client allowlist, local storage toggle, or unsigned response grants
  access.
- RLS, webhook replay/order, test clock, checkout/portal, offline lease,
  account isolation, downgrade/revocation, accessibility, and failure tests
  pass in non-production environments.
- Live products, prices, charges, subscriptions, and production deployment
  remain hard-gated.

## 21. Phase 14 — Reference-Locked Origami Chat

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-origami-chat-reconstruction.md`

Dependencies:

- Functional chat, JARVIS, Prompt Forge, context, artifacts, access, and
  Command Center integrations are stable.

Required skills:

- `frontend-design:frontend-design`
- browser or Chrome control for deterministic visual verification when
  available.

Deliverables:

- Read and preserve the supplied implementation pack, target image, crop
  policy, scripts, and deterministic visual state.
- Build an isolated Chat-only asset workbench.
- Reconstruct in order: global geometry, paper/material primitives, existing
  component mapping, decorative assets, typography/color calibration, and
  region-specific correction.
- Preserve all existing chat functionality, semantics, keyboard behavior,
  responsive behavior, loading/error states, JARVIS module behavior, and
  accessibility.
- Use DOM for interactive/semantic content and assets for decorative paper,
  folds, ribbons, stationery, and reference-specific ornament.
- Run full-page and region-weighted measured comparison after each focused
  visual change, including the anti-flatness rejection test.

Exit gate:

- Deterministic target-state screenshots meet the reference-locked acceptance
  process across required viewports.
- Functional safety, scope validation, accessibility, and regression suites
  pass.
- Unrelated pages and existing visual work remain untouched.

## 22. Phase 15 — Reference-Locked MonoChrome Appearance

**Executable plan:**
`docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md`

Dependencies:

- Goals 1-7 have stable functional surfaces and route contracts.
- Phase 14 Origami chat is stable and has a frozen acceptance oracle.
- MC0B has a full green/accepted-known-failure stabilization ledger, frozen
  source-derived route/primitive/overlay/detached/native manifests, and
  immutable synthetic Default/VibeSpace/Jarvis/Origami baselines captured at
  one exact source/harness commit before any MonoChrome product edit. Upstream
  drift before MC1 forces recapture; after MC1 the accepted `B0` bundle is an
  immutable comparison oracle. A later rebase is handled by recapturing in a
  clean pre-MonoChrome worktree at the new base and replaying the commits, never
  by taking a post-change “before” image.

Required skills:

- `frontend-design:frontend-design`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`,
  `superpowers:verification-before-completion`, and independent review skills.
- Playwright for deterministic browser verification and
  `computer-use:computer-use` only for isolated visible native Windows smoke.
  Do not use existing Chrome state as the baseline harness.
- Requested repository `$vibespace-*` skills and the agent-lock helper remain
  `UNAVAILABLE` unless re-discovery proves their exact callable paths; never
  fabricate skill/lock/model evidence.

Deliverables:

- Replace the selectable Light theme with the exact public MonoChrome name and
  internal `monochrome` ID while preserving the four-theme order.
- Generate one versioned theme dataset with distinct storage, runtime,
  document-resolution, command, sync, hydration-merge, and prepaint policies.
  Storage maps Light to MonoChrome and dark/system/unknown to Default; strict
  sync rejects command aliases/dark/system; complete command compatibility
  remains parser-only; Default preference still resolves to document `dark`.
- Add pure v4-to-v5 migrate plus always-on current-version Zustand merge and
  safe-local-storage quota recovery while preserving every unrelated setting,
  method, and user record.
- Apply the preference through a generated self-hosted CSP-safe prepaint asset
  before React, synchronize it
  across detached windows without feedback loops, and update Appearance,
  slash commands, command palette, action registries, and xterm consistently.
- Remove active Light CSS and implement MonoChrome under the isolated
  `html[data-theme='monochrome']` root with true-black/near-black surfaces,
  one-pixel neutral borders, small radii, compact sans text, JetBrains Mono
  metadata, restrained semantic accents, minimal elevation, and no global
  gradients, glass, glow, or remote assets.
- Theme shared primitives, shell/navigation/overlays, and every final
  integrated route using exact non-overlapping manifests and a development-
  only real-component workbench.
- Preserve Default, VibeSpace, Jarvis Core, Origami, Pixel Pet transparency,
  remote provider pages, Canvas user content, all behavior, and all product
  copy except the authorized theme replacement.
- Add deterministic route screenshots, computed-style metrics, migration and
  sync integration tests, functional regression, accessibility, performance,
  security, Windows native/high-DPI, other-theme, and Origami checks.
- Preserve PTY ANSI/true-color and explicit user/per-terminal palette
  precedence across app-theme MutationObserver updates.
- Use an isolated native session with a unique Tauri identifier, unused port,
  child-only APPDATA/LOCALAPPDATA/USERPROFILE/HOME/WebView2/temp/browser
  profile, an override selecting only the minimal committed
  `monochrome-test` Tauri capability, and paired frontend/native
  `monochrome-visual-test` runtime guards.
  The guarded native build must suppress boot-time launcher, production
  keychain, HKCU autostart/PATH, updater, tray/watchdog, single-instance reuse,
  production AppUserModelID, and global-shortcut effects while direct
  sensitive commands fail before touching an effect adapter. Require exact
  owned-PID cleanup plus before/after proof that the existing VibeSpace
  process/listener/profile/launcher/HKCU/keychain namespace/shortcut state is
  unchanged. Prove shortcut/plugin suppression with injected effect counters,
  not OS shortcut enumeration. Verify an optimized embedded Windows/WebView2
  executable and unsigned unique-ID NSIS artifact without host installation;
  installed-package behavior without a Sandbox/VM and unavailable macOS/Linux
  runners remain exact `SKIPPED_NOT_APPLICABLE` rather than PASS.
- Validate zoom 100/125/150/200, reflow, contrast/state semantics, forced
  colors, target sizes, reduced motion, keyboard/focus, native dialogs/menus,
  detached windows, Pixel Pet transparency, fonts, and GPU fallback. Require
  4.5:1 normal-text contrast, 3:1 large-text and meaningful UI/focus/state
  contrast, and 24x24 CSS-pixel targets or the WCAG 2.2 spacing exception while
  preserving any existing 44x44 product contract. Two-axis document/app-chrome
  scroll fails; deliberate inner Canvas/graph spatial viewports remain allowed.
- Analyze and calibrate against the exact supplied reference recording when it
  is available, without committing the recording, extracted frames, private
  screenshots, or copied third-party identity/content.
- Always create the six exact schema-validated reference artifacts
  (`REFERENCE_ANALYSIS.md`, `FRAME_MANIFEST.json`, `DESIGN.md`,
  `design-tokens.json`, `reference-spec.json`, `component-mapping.md`); when the
  video is absent they truthfully use `blocked_missing_source` skeletons with
  no fabricated measurements. Validate JSON artifacts directly and the three
  Markdown artifacts through committed JSON-frontmatter schemas, required-body
  structures, and cross-artifact IDs. Measured evidence covers every required
  table/loading/transition frame, 400/500/600 font candidate, exact geometry
  field, and motion category.

Exit gate:

- Every locally actionable MonoChrome requirement and MC requirement ID is
  implemented and evidenced.
- The registry contains exactly Jarvis Core, VibeSpace, Default, and
  MonoChrome. Light is absent from the active registry, picker, autocomplete,
  current help, command-palette/actions, active CSS, and app-owned xterm
  palettes; the parser-only legacy `/theme light` alias remains and resolves to
  MonoChrome.
- Migration, startup, sync, route coverage, function, accessibility,
  performance, security, native, and preserved-theme gates pass.
- If `Screen Recording 2026-07-16 220632(1).mp4` remains unavailable, only the
  measured reference-calibration and final video-fidelity evidence remain an
  exact documented external hard gate; all other work is complete and Phase 16
  continues through the successor draft PR.

## 23. Phase 16 — Integration, Review, Documentation, and Draft PR

**Plan file to create before edits:**
`docs/superpowers/plans/2026-07-16-vibespace-final-integration.md`

Dependencies:

- Every locally actionable preceding phase is complete or has a documented
  genuine external hard gate.

Required skills:

- `superpowers:verification-before-completion`
- `superpowers:requesting-code-review`
- `github:yeet` for the successor draft PR.

Deliverables:

- Reconcile branch with the intended integration base without touching the
  protected unrelated branch/worktree.
- Run focused tests after every integration and the complete automated matrix:
  TypeScript, Vitest, release manifest, production build, Rust checks/tests,
  Tauri checks/build where safe, Playwright, Windows Relay, migrations, RLS,
  Stripe test mode, security, stress, performance, accessibility, offline,
  recovery, and visual tests.
- Run configured local/test providers and record unavailable non-applicable
  providers with the exact `SKIPPED_NOT_APPLICABLE` result state and reason.
- Conduct independent code, security, privacy, billing, migration, UX,
  accessibility, performance, reference-fidelity, and preserved-theme reviews;
  fix actionable findings and rerun affected gates.
- Update architecture, schema, privacy, security, operations, test, migration,
  rollback, provider-feasibility, appearance/reference, and user documentation.
- Inspect staged scope, commit intentionally, push normally, and create/update
  the successor draft PR with evidence from all eight goals and remaining
  external gates.
- Prepare local handoff with test profile/port/process cleanup and exact
  reproduction commands in `docs/unified-goals/LOCAL_TEST_HANDOFF.md`, including
  branch/commit/draft PR, isolated profile, backups, start/migration commands,
  flags/services, gates, reset, rollback, and process shutdown.

### Phase 16 final handoff artifact boundary

`docs/unified-goals/LOCAL_TEST_HANDOFF.md` is a separately registered,
one-file final Phase 16 slice. It is not one of Task 0R's 17 pre-edit artifacts,
is not a Task 22 deliverable, and must not be created, modified, staged, or
claimed complete by Task 0R, Task 22, or any earlier slice. Create it only after
all locally actionable implementation and documentation work is committed, the
full final verification/review matrix has been observed, and every actionable
finding has been fixed and reverified. Its statements must describe observed
state; projected commands, unobserved PASS claims, secrets, and production
credentials are forbidden.

The handoff document must contain these exact sections and evidence fields:

1. **Tested revision and draft PR:** successor branch name; intended base
   branch; the full 40-character tested implementation commit SHA captured
   immediately before the handoff-only commit; draft PR number, canonical URL,
   base/head branches, current draft state, and check summary; and the date/time
   at which those values were read back. The tested implementation SHA is not
   the self-referential handoff commit SHA.
2. **Isolated local state:** absolute disposable app-data/profile path; its
   backup path and creation command; the separately reserved numeric localhost
   port; the command used to prove the port was unused before startup; and an
   explicit statement that the pre-existing VibeSpace profile, localhost
   instance, `grok-workbench-pr25-v2`, and `install/install.ps1` were untouched.
3. **Prerequisites and startup:** exact working directory; tool/runtime
   prerequisites and observed versions; exact environment-variable assignments
   that select the isolated profile and port; exact install/build/start
   commands in execution order; expected health/readiness signal; and the
   readback command that proves the process, profile, and port match the
   isolated session. Secret values are represented only by variable names and
   acquisition instructions, never copied into the file.
4. **Migrations and seed/test data:** exact local or staging target (never
   production); backup prerequisite; ordered migration/seed commands; expected
   migration identifiers; schema/RLS/function readback commands; Stripe
   test-mode setup when applicable; and the command/evidence proving that no
   production project or live Stripe mode was selected.
5. **Feature flags and services:** every required flag with its exact tested
   value; every local/test provider, Relay, Supabase, Stripe-test, browser,
   model, and auxiliary service with start command, endpoint/port, readiness
   check, and truthful availability state. A missing optional provider is
   recorded as `SKIPPED_NOT_APPLICABLE` with scope and reason, not silently
   represented as passing.
6. **Verification gates:** a table containing each required gate, its exact
   command, tested commit SHA, execution time, result state, evidence/log path,
   and limitation or not-applicable reason. It covers focused and full TypeScript,
   Vitest, release-manifest, production-build, Rust/Tauri, Playwright, Windows
   Relay, database/migration/RLS, Stripe-test, security, stress, performance,
   accessibility, offline/recovery, visual/reference, privacy, billing, and
   independent review gates that apply to the completed program.
7. **Reset and restore:** exact commands to stop only this task's processes,
   restore the isolated profile from its named backup, clear only disposable
   task-owned test data, restart the isolated stack, and verify restored state;
   each destructive command must include an absolute-path or target-identity
   guard that fails closed outside the recorded disposable profile/test target.
8. **Rollback:** the last known-good full commit SHA; non-force Git commands to
   inspect or switch to it without rewriting reviewed history; application and
   feature-flag rollback order; migration rollback or documented forward-repair
   procedure with backup/verification; and explicit escalation for any rollback
   that would touch production or real user data.
9. **Shutdown and cleanup:** the exact recorded PIDs/process identities and
   scoped stop commands; service shutdown order; commands proving the reserved
   port is released and no task process remains; disposable-profile retention
   or guarded deletion instructions; lock-release and coordination-ledger
   update; and the final readback showing pre-existing processes/state remain
   untouched.

The handoff boundary executes in this order:

1. Finish Task 22 and all other implementation/doc commits; leave the index
   empty while preserving the unrelated unstaged installer deletion.
2. Run the complete Phase 16 matrix against the implementation HEAD, fix every
   actionable finding, rerun affected gates, normally push that tested commit,
   create or refresh the successor draft PR, and read back its state.
3. Record `git rev-parse HEAD` and require the returned value to match
   `^[0-9a-f]{40}$`; use that value as the tested implementation SHA in the
   handoff. Then create only
   `docs/unified-goals/LOCAL_TEST_HANDOFF.md` from the observed evidence above.
4. Stage exactly the handoff path:

   ```powershell
   git add -- docs/unified-goals/LOCAL_TEST_HANDOFF.md
   ```

5. Run these cached-scope checks before the handoff commit:

   ```powershell
   git diff --cached --check
   $actual = @(git diff --cached --name-only)
   $expected = @('docs/unified-goals/LOCAL_TEST_HANDOFF.md')
   if (@(Compare-Object -ReferenceObject $expected -DifferenceObject $actual).Count -ne 0) { throw 'Unexpected staged path in final handoff slice' }
   if (git diff --cached --name-only -- install/install.ps1) { throw 'Protected installer path is staged' }
   git diff --cached --exit-code -- install/install.ps1
   git diff --cached --stat
   ```

   The name-only output must be exactly
   `docs/unified-goals/LOCAL_TEST_HANDOFF.md`; the installer queries produce no
   output. Any extra staged path aborts the slice and is resolved without
   staging, restoring, or otherwise touching the protected installer deletion.

6. Commit the one-file slice as
   `git commit -m "docs: add verified local test handoff"`, push normally, and
   update/read back the existing successor draft PR. Do not amend, force-push,
   merge, publish, deploy, or rewrite reviewed history.

7. Capture the resulting full handoff commit SHA as `H`, require it to match
   `^[0-9a-f]{40}$`, and use `H` as the immutable evidence cutoff for a separate
   post-handoff traceability closeout. This cutoff deliberately excludes the
   closeout commit itself, so no tracked artifact needs to predict or recursively
   record its own commit hash. Re-read the draft PR at `H` before generating the
   closeout.
8. Run the Task 0R validator in its explicit `evidence-closeout` mode with
   cutoff `H`. For the registered handoff event it must compute exactly these
   affected tracked ledgers and no others:
   - `docs/unified-goals/REQUIREMENTS_MATRIX.md`
   - `docs/unified-goals/TEST_MATRIX.md`
   - `docs/unified-goals/GIT_BASELINE.md`

   Update only their computed rows: the handoff requirement disposition, the
   observed one-file/cached-scope/push/PR-readback tests, and Git/PR facts
   explicitly labelled `recordedThroughCommit: H`. Regenerate the ignored
   source manifest and deterministic validation report using the same
   two-pass no-self-hash rule. All other Task 0R artifacts retain their prior
   semantic content and hashes. If the validator computes a different affected
   set, reports an unclassified row, or sees any post-`H` product/test fact,
   abort and repair the maintenance classification before staging.

9. Stage and verify exactly those three ledger paths:

   ```powershell
   $closeout = @(
     'docs/unified-goals/REQUIREMENTS_MATRIX.md',
     'docs/unified-goals/TEST_MATRIX.md',
     'docs/unified-goals/GIT_BASELINE.md'
   )
   git add -- $closeout
   git diff --cached --check
   $actual = @(git diff --cached --name-only)
   if (@(Compare-Object -ReferenceObject $closeout -DifferenceObject $actual).Count -ne 0) { throw 'Unexpected staged path in post-handoff closeout' }
   if (git diff --cached --name-only -- install/install.ps1) { throw 'Protected installer path is staged' }
   git diff --cached --exit-code -- install/install.ps1
   ```

   The explicit `evidence-closeout` validator mode is the sole exemption from
   the ordinary all-affected-artifact regeneration rule: it is limited to the
   registered parent cutoff `H`, these three derived ledgers, and evidence-only
   facts. It cannot advance a product requirement, add a test result observed
   after `H`, or rewrite any source/architecture/policy row.

10. Commit as
    `git commit -m "docs(unified): close final handoff evidence"`, push normally,
    and read back the existing draft PR head. Record that readback in the run
    log, not by recursively editing the three ledgers. The closeout commit is an
    administrative evidence carrier whose parent cutoff is `H`; it is not a new
    implementation/test requirement. Any later product, test, handoff, or PR
    correction invalidates this terminal sequence and requires a new observed
    Phase 16 handoff plus closeout—never an amend or force-push.

Exit gate:

- Every locally actionable requirement is implemented and evidenced.
- No required test is described as passing unless its output was observed.
- No production deployment, main merge, production release, force push, live
  Stripe financial change, or destructive real-data action occurs.
- The final handoff exists in its own one-file commit, names the full tested
  implementation SHA and current draft PR, reproduces the isolated local stack,
  and passes the exact cached-scope checks above.
- The subsequent exact three-ledger evidence-only closeout validates at parent
  cutoff `H`, leaves no stale handoff/test/Git row as of that cutoff, and passes
  its exact cached-scope and installer-exclusion checks.

## 24. Plan and Commit Discipline

For each executable phase:

1. Inspect the current committed architecture and active file locks.
2. Write a detailed plan with exact files, interfaces, TDD steps, commands,
   expected failure/pass evidence, compatibility, migration, and rollback.
3. Lock exact files in `AGENT_COORDINATION.md`.
4. Assign only non-overlapping tasks to agents.
5. Write the failing test first and observe the expected failure.
6. Implement the smallest behavior that passes.
7. Run focused tests and review the diff.
8. Commit a cohesive change with no unrelated files.
9. Run integration tests at each contract boundary.
10. Update the coordination work log and release completed file locks.

The unexplained `install/install.ps1` deletion is never staged or included in
any commit.

## 25. Verification Matrix

At minimum, the final matrix includes:

- contract validators and serialization;
- Dexie fresh-install and multi-version migration;
- local-only and opt-in sync policy;
- identity/profile preservation and account isolation;
- prompt authority, trust, ordering, budgets, and provider transport;
- response modes, structured blocks, lint/repair, templates, and speech;
- chat, voice, schedule, Hive, action, terminal, browser, and agent cutovers;
- run/event state machines, idempotency, approvals, artifacts, cancellation,
  crash recovery, and projections;
- context ingestion, secret policy, parsing, search, graph, GitHub, provenance,
  and performance;
- Prompt Forge preservation, Canvas persistence/performance, and export;
- memory poisoning/correction, skills supply chain, RPC, and subagent budgets;
- messaging/browser security and tool-bridge grants;
- access/RLS/webhooks/Stripe-test/offline lease;
- deterministic Origami visual and functional regression;
- exact MonoChrome registry, boundary-specific generated parsing/resolution,
  Light-to-MonoChrome v5 migration plus current-version merge, CSP-safe
  prepaint, strict detached-window sync, parser-only aliases, Default-to-dark
  resolution, and Pixel Pet transparency contracts;
- deterministic MonoChrome workbench and full-route screenshots, computed
  style metrics, functional invariants, reference-derived evidence when the
  exact recording is available, and honest missing-video evidence otherwise;
- Default, VibeSpace, Jarvis Core, and Origami visual isolation plus remote
  provider and Canvas-content boundaries;
- terminal explicit-override/ANSI precedence and isolated Tauri/WebView2/PID/
  profile/process-safety evidence;
- 100/125/150/200 zoom/reflow, contrast, target, forced-color, reduced-motion,
  packaged-Windows and truthful cross-platform status matrices;
- full typecheck, unit, build, Rust, Tauri-safe, Playwright, Windows,
  accessibility, security, stress, and performance gates.

## 26. Program Definition of Done

The program is complete only when:

- all locally actionable requirements from the directive and eight goals are
  implemented on the successor branch;
- shared contracts are used by real consumers rather than existing only as
  types;
- migrations are additive, idempotent, tested, and recoverable;
- capability, execution, billing, provider, and connector states are truthful;
- private data and secrets remain inside their declared boundaries;
- approval and cancellation semantics reach real operations;
- MonoChrome replaces Light without changing preserved themes, Origami,
  Pixel Pet transparency, remote provider pages, user content, product
  behavior, or unrelated copy;
- measured recording-derived claims are made only from the exact available
  source; if it remains unavailable, the exact filename and search evidence
  identify the narrow video-calibration hard gate while all other Goal 8 work
  is complete;
- every required automated and manual test has evidence or an exact
  user/external hard-gate explanation;
- independent reviews have been addressed;
- the successor draft PR and documentation accurately describe scope, evidence,
  risks, rollback, and external gates;
- the protected branch, worktree, localhost instance, installer anomaly, and
  real user data remain untouched.
