# VibeSpace Unified Goals Execution Plan

**Status:** IMPLEMENTING

**Approved specification:** `88c3e54887427d363df9b0aebd961ead8a02a733`

**Implementation branch:** `codex/shared-intelligence-kernel-design-20260716`

**Authoritative base:** `origin/main` at `8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`

**Isolated worktree:** `C:\Users\viper\VibeSpace\.worktrees\shared-intelligence-kernel-design-20260716`

**Execution method:** Use `superpowers:subagent-driven-development` for
independent implementation tasks, `superpowers:test-driven-development` for
every feature or fix, `superpowers:systematic-debugging` for failures, and
`superpowers:verification-before-completion` before any completion claim.

## 1. Purpose

This document is the complete phased program plan for the Unified Codex
Execution Directive and all seven VibeSpace goal specifications. It keeps the
program cohesive while honoring the writing-plans rule that each major
subsystem receives its own executable plan before its source files are
changed.

The first executable subsystem plan is:

- `docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md`

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

1. The user's explicit approval and standing authorization.
2. The Unified Codex Execution Directive.
3. The seven goal specifications and their acceptance criteria.
4. `SYSTEM_PROMPT.md`, repository `AGENTS.md`, and `AGENT_COORDINATION.md`.
5. The approved Shared Intelligence Kernel design.
6. Existing product behavior and tests.
7. Implementation plans and local engineering judgment.

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
Phase 1 Shared Intelligence Kernel
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
Phase 15 Integration, stress, security, docs, draft PR
```

Phases may overlap only when they have no shared files and all prerequisite
contracts are committed. Shared contract changes land before downstream
consumers.

## 7. Phase 0 — Baseline, Isolation, and Coordination

**Status:** Complete for the current base; re-run after material rebases.

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

## 22. Phase 15 — Integration, Review, Documentation, and Draft PR

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
- Run configured local/test providers and record skipped providers truthfully.
- Conduct independent code, security, privacy, billing, migration, UX,
  accessibility, and performance reviews; fix actionable findings and rerun
  affected gates.
- Update architecture, schema, privacy, security, operations, test, migration,
  rollback, provider-feasibility, and user documentation.
- Inspect staged scope, commit intentionally, push normally, and create/update
  the successor draft PR with evidence and remaining external gates.
- Prepare local handoff with test profile/port/process cleanup and exact
  reproduction commands.

Exit gate:

- Every locally actionable requirement is implemented and evidenced.
- No required test is described as passing unless its output was observed.
- No production deployment, main merge, production release, force push, live
  Stripe financial change, or destructive real-data action occurs.

## 23. Plan and Commit Discipline

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

## 24. Verification Matrix

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
- full typecheck, unit, build, Rust, Tauri-safe, Playwright, Windows,
  accessibility, security, stress, and performance gates.

## 25. Program Definition of Done

The program is complete only when:

- all locally actionable requirements from the directive and seven goals are
  implemented on the successor branch;
- shared contracts are used by real consumers rather than existing only as
  types;
- migrations are additive, idempotent, tested, and recoverable;
- capability, execution, billing, provider, and connector states are truthful;
- private data and secrets remain inside their declared boundaries;
- approval and cancellation semantics reach real operations;
- every required automated and manual test has evidence or an exact
  user/external hard-gate explanation;
- independent reviews have been addressed;
- the successor draft PR and documentation accurately describe scope, evidence,
  risks, rollback, and external gates;
- the protected branch, worktree, localhost instance, installer anomaly, and
  real user data remain untouched.
