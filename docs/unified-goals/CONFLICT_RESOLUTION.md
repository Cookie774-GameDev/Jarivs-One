---
artifactId: 'CONFLICT_RESOLUTION'
schemaVersion: 'task-0r.artifact/v1'
batchId: 'TASK0R-20260718-B'
generatedAtUtc: '2026-07-18T05:30:00.000Z'
evidenceCutoffUtc: '2026-07-18T05:29:00.000Z'
branch: 'codex/shared-intelligence-kernel-design-20260716'
baselineHead: '918de28b21a2f9e6fe773c8d50d9e9d86fd1308c'
baseCommit: '8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6'
worktree: 'C:\Users\viper\VibeSpace\.worktrees\shared-intelligence-kernel-design-20260716'
authorityOrderId: 'task-0r.authority/v1'
stateVocabularyIds: ['coordination/v1', 'requirement/v1', 'test/v1']
sourceInventoryDigest: '578D3C12A9BCBD6BAC6A8DCA7FD403C36DEBD3D0B91B289FBD2560ABA00904F0'
maintenanceTriggers:
  ['CONFLICT_RESOLUTION', 'GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'TASK0R-20260718-B']
---

# Conflict Resolution

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "CONFLICT_RESOLUTION",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "CONFLICT_RESOLUTION",
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "authorityAnalysis": "The approved kernel and directive require explicit account scoping and forbid a local-unassigned fallback. Existing surfaces may derive identity from either an authenticated Supabase session or a durable local user, but downstream repositories may not invent a third identity.",
      "chosenRule": "Resolve exactly one AccountIdentity at the host boundary; a cloud session outranks the local identity, missing identity fails closed, and every account-bearing read or write carries accountId explicitly.",
      "class": "AUTHORITY_OVERLAP",
      "conflictId": "CFL-001",
      "evidenceRefs": [
        "SIK",
        "DIR",
        "REPO_HEAD"
      ],
      "id": "CFL-001",
      "implementationConsequence": "Tasks 1A and 1B own the resolver and host integration; Tasks 7-9 and 13P consume that authority without introducing another fallback.",
      "implementationState": "IMPLEMENTING",
      "involvedIds": [
        "SIK-001",
        "SIK-007",
        "SIK-013"
      ],
      "involvedRequirementIds": [
        "SIK-001",
        "SIK-007",
        "SIK-013"
      ],
      "owner": "Kernel Tasks 1A, 1B, 7-9, and 13P",
      "preservedRule": "Offline-only use remains supported through the durable local user identity; sign-in does not authorize copying unrelated local data into a cloud account.",
      "revisitTrigger": "Any new account-bearing store, host lifecycle, sync route, or identity source.",
      "sourceKeys": [
        "SIK",
        "DIR",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Resolver precedence, unavailable boot state, account switching, stale-session rejection, local-to-cloud non-migration, and explicit repository scoping require focused tests.",
      "title": "One explicit account identity versus implicit or unassigned ownership"
    },
    {
      "authorityAnalysis": "Security and truthfulness outrank profile, memory, model, retrieved, and user-authored layers. The protected identity is JARVIS-only; extending it to every agent would violate the same approved design.",
      "chosenRule": "Keep one immutable, versioned JARVIS identity revision outside Agent.system_prompt. Apply it only when the resolved agent is the protected built-in JARVIS, and snapshot the selected revision into each request.",
      "class": "CANONICAL_OWNER_CONFLICT",
      "conflictId": "CFL-002",
      "evidenceRefs": [
        "app/src/lib/jarvis/identity.ts:3-154",
        "app/src/lib/jarvis/profiles/types.ts:1-36",
        "docs/unified-goals/EXECUTION_PLAN.md:249-257",
        "docs/unified-goals/TEST_MATRIX.md:147-164"
      ],
      "id": "CFL-002",
      "implementationConsequence": "Task 2's exact four protected identity/profile atoms are accepted at implementation commit fd0cf3cb71f552884a3eeff0de45207ef13f3f4d after fresh review of revision 56d669f60b0eb93309f332ed700d9b0f4b0b82ee. Task 10 still owns built-in/editor rules, Task 13P owns protected-agent resolution, and Task 16B performs the production cutover.",
      "implementationState": "PASS",
      "involvedIds": [
        "SIK-001",
        "SIK-014",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-001",
        "SIK-014",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 2, 10, 13P, and 16B",
      "preservedRule": "Other agents keep their personas, model selection remains independent, and user custom instructions survive as a separate profile layer.",
      "revisitTrigger": "Any identity revision, built-in registry, agent editor, profile migration, or model-routing change.",
      "sourceKeys": [
        "SIK",
        "JRI",
        "SOUL",
        "REPO_HEAD"
      ],
      "status": "COMPLETE",
      "testConsequence": "The focused identity/profile matrix passed 28/28, app typecheck passed, and /root/monochrome_plan_final_gate returned PASS with report SHA-256 4533FFEF08FABC763DA2B87F16398E4A9B80C004A1B150E0D7B09E169DE61263. The PASS is narrow; downstream protected resolution, persistence, compiler, and consumer cutover tests remain required.",
      "title": "Protected JARVIS identity versus mutable agent prompts and model personas"
    },
    {
      "authorityAnalysis": "The kernel is explicitly the canonical request and prompt boundary. Goal-specific systems may add versioned optional data but may not create parallel canonical prompt compilers.",
      "chosenRule": "Build one immutable JarvisRequestEnvelope and one deterministic, authority-layered compiler; provider transport receives the compiled contract rather than reconstructing it.",
      "class": "SHARED_CONTRACT_OVERLAP",
      "conflictId": "CFL-003",
      "evidenceRefs": [
        "SIK",
        "JRI",
        "CTX",
        "PF",
        "BCHAT",
        "REPO_HEAD"
      ],
      "id": "CFL-003",
      "implementationConsequence": "Tasks 11-13 own envelope, compiler, and transport; Tasks 13P, 16A, and 16B own mounting and cutover; later goals consume those interfaces.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-002",
        "SIK-003",
        "SIK-014",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-002",
        "SIK-003",
        "SIK-014",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 11-13, 13P, 16A, and 16B",
      "preservedRule": "Interaction mode, selected model, surface requirements, and goal-specific context remain inputs rather than new prompt authorities.",
      "revisitTrigger": "Any new provider, request surface, prompt layer, context source, or goal-specific compiler proposal.",
      "sourceKeys": [
        "SIK",
        "JRI",
        "CTX",
        "PF",
        "BCHAT",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Layer order, deep immutability, byte-stable prompt hashes, budgets, provider construction, fail-closed unsupported transport, and non-JARVIS isolation require tests.",
      "title": "One prompt compiler versus surface-specific prompt assembly"
    },
    {
      "authorityAnalysis": "Platform safety, the user, and immutable application policy outrank retrieved files, websites, memories, tools, and worker output. Treating retrieval as an instruction layer would invert that order.",
      "chosenRule": "Represent every context item through JarvisSourceRef and JarvisContextPack with trust, sensitivity, purpose, provenance, exclusion reason, and budget; retrieved content remains data.",
      "class": "TRUST_BOUNDARY_CONFLICT",
      "conflictId": "CFL-004",
      "evidenceRefs": [
        "SIK",
        "CTX",
        "SOUL",
        "PF",
        "BCHAT"
      ],
      "id": "CFL-004",
      "implementationConsequence": "Task 4 lands the immediate secret interlock; Tasks 11-12 own shared context contracts; Phase 4 extends indexing and retrieval without replacing them.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-002",
        "SIK-010",
        "SIK-011",
        "SIK-013",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-002",
        "SIK-010",
        "SIK-011",
        "SIK-013",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 4, 11, and 12; Unified Phase 4",
      "preservedRule": "Relevant local, project, GitHub, terminal, memory, and web evidence remains usable when policy permits and provenance stays visible.",
      "revisitTrigger": "Any ingestion source, retrieval ranker, context attachment, memory source, or public research connector.",
      "sourceKeys": [
        "SIK",
        "CTX",
        "SOUL",
        "PF",
        "BCHAT"
      ],
      "status": "READY",
      "testConsequence": "Secret-path denial, prompt-injection isolation, symlink/traversal defense, sensitivity propagation, budget truncation, citations, and source freshness require tests.",
      "title": "Retrieved context as evidence versus instruction authority"
    },
    {
      "authorityAnalysis": "Existing chat activity, task-run, schedule-history, terminal, browser, and action states describe overlapping lifecycle facts. The approved kernel assigns terminal truth to one account-scoped journal.",
      "chosenRule": "Task 18 alone owns caller-stable run allocation, legal transitions, append-only events, cancellation authority, recovery, and producer-source classification. Legacy models become projections or adapters.",
      "class": "CANONICAL_OWNER_CONFLICT",
      "conflictId": "CFL-005",
      "evidenceRefs": [
        "SIK",
        "JCC",
        "PF",
        "CANVAS",
        "BCHAT",
        "REPO_HEAD"
      ],
      "id": "CFL-005",
      "implementationConsequence": "Task 18 lands before all canonical producers; Tasks 19B, 20C, 16B, 21A, 17, and 21B consume it without writing competing lifecycle truth.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-007",
        "SIK-015",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-007",
        "SIK-015",
        "SIK-016"
      ],
      "owner": "Kernel Task 18 and downstream adapter tasks",
      "preservedRule": "Existing cards and timelines continue to render through compatibility projections until their consumers migrate.",
      "revisitTrigger": "Any new job, action, terminal, browser, voice, schedule, Hive, or agent lifecycle producer.",
      "sourceKeys": [
        "SIK",
        "JCC",
        "PF",
        "CANVAS",
        "BCHAT",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Transition legality, idempotency, sequence allocation, restart recovery, real cancellation, stale-account rejection, and projection read-only behavior require tests.",
      "title": "One execution journal versus parallel activity and run models"
    },
    {
      "authorityAnalysis": "The approved design forbids presenting an input file, retrieved source, or provider claim as a newly created output. Source provenance and artifact production therefore require distinct contracts.",
      "chosenRule": "JarvisSourceRef identifies evidence; a versioned JarvisArtifact is emitted only after the real producer and backing state are verified, and it links rather than duplicates its sources.",
      "class": "SEMANTIC_CONFLICT",
      "conflictId": "CFL-006",
      "evidenceRefs": [
        "SIK",
        "JCC",
        "PF",
        "CANVAS",
        "BCHAT"
      ],
      "id": "CFL-006",
      "implementationConsequence": "Tasks 20A-20C own artifact persistence, real producer adapters, and compatibility shutdown; later goals consume artifact IDs and source refs.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-009",
        "SIK-010",
        "SIK-015",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-009",
        "SIK-010",
        "SIK-015",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 20A-20C",
      "preservedRule": "Source previews and citations remain visible, but Outputs contains only verified produced artifacts.",
      "revisitTrigger": "Any file, link, provider result, terminal output, export, Canvas block, or generated-document producer.",
      "sourceKeys": [
        "SIK",
        "JCC",
        "PF",
        "CANVAS",
        "BCHAT"
      ],
      "status": "READY",
      "testConsequence": "Backing verification, producer identity, source/output separation, retry idempotency, projection read-only behavior, and missing-output rejection require tests.",
      "title": "Verified outputs versus source evidence"
    },
    {
      "authorityAnalysis": "Approval is authority for one exact reviewed request, never evidence of execution. Surface-local booleans, optimistic cards, and caller-supplied approval objects cannot satisfy that rule.",
      "chosenRule": "Persist one account/run/action/version/parameter-hash/target/risk/expiry approval, revalidate capability and entitlement at consumption, consume at most once, and record executor truth separately.",
      "class": "CANONICAL_OWNER_CONFLICT",
      "conflictId": "CFL-007",
      "evidenceRefs": [
        "SIK",
        "JCC",
        "SOUL",
        "BCHAT",
        "ACCESS",
        "REPO_HEAD"
      ],
      "id": "CFL-007",
      "implementationConsequence": "Tasks 19A-19D own the approval engine and canonical action, terminal, and Browser Operator adapters; Tasks 5 and 6 land immediate interlocks first.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-007",
        "SIK-008",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-007",
        "SIK-008",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 5, 6, and 19A-19D",
      "preservedRule": "Existing approval cards may remain UI projections, and low-risk read-only actions may follow an explicitly approved policy without weakening consequential-action gates.",
      "revisitTrigger": "Any consequential action surface, auto-approve policy, plugin grant, terminal command, browser operation, or billing action.",
      "sourceKeys": [
        "SIK",
        "JCC",
        "SOUL",
        "BCHAT",
        "ACCESS",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Parameter mismatch, stale grant, expiry, replay, account switch, secret-handle redaction, pre-effect failure, idempotent consumption, and verified terminal completion require tests.",
      "title": "One durable exact approval versus surface-local confirmation"
    },
    {
      "authorityAnalysis": "A goal request cannot make an undocumented provider surface, credential bridge, or system-prompt channel safe or available. Truthfulness and provider policy outrank nominal coverage.",
      "chosenRule": "Use only native-system or explicitly safe prefixed-preamble transport; fail closed if the compiled contract cannot be preserved. Phase 12 records official API/app/extension/browser feasibility and keeps unsupported providers unavailable.",
      "class": "PROVIDER_LIMITATION",
      "conflictId": "CFL-008",
      "evidenceRefs": [
        "SIK",
        "JRI",
        "BCHAT",
        "BRIDGE",
        "REPO_HEAD"
      ],
      "id": "CFL-008",
      "implementationConsequence": "Task 13 owns provider prompt transport; Phase 12 owns provider feasibility and the local bridge; unsupported routes stay disabled without credential or browser-storage capture.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-003",
        "SIK-014",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-003",
        "SIK-014",
        "SIK-016"
      ],
      "owner": "Kernel Task 13 and Unified Phase 12",
      "preservedRule": "Configured native, local, external-CLI, and test providers remain supported when their exact transport and cancellation behavior is verified.",
      "revisitTrigger": "Provider documentation, adapter registry, authentication surface, or transport strategy changes.",
      "sourceKeys": [
        "SIK",
        "JRI",
        "BCHAT",
        "BRIDGE",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Per-adapter request construction, exact model selection, cancellation, unavailable state, credential boundaries, and provider-change recovery require tests.",
      "title": "Requested provider coverage versus transport and official-surface limitations"
    },
    {
      "authorityAnalysis": "The generic sync queue can carry document payloads, while the approved v1 kernel explicitly keeps identity, profiles, prompts, runs, approvals, artifacts, and private provenance local. Privacy wins over convenience copy.",
      "chosenRule": "Create additive account-scoped Dexie v3 kernel stores and explicit mappers whose repositories never call generic sync. Any future category sync needs opt-in, encryption, server authority, conflict policy, threat review, and a separate migration.",
      "class": "PRIVACY_BOUNDARY_CONFLICT",
      "conflictId": "CFL-009",
      "evidenceRefs": [
        "SIK",
        "SOUL",
        "CTX",
        "ACCESS",
        "REPO_HEAD"
      ],
      "id": "CFL-009",
      "implementationConsequence": "Tasks 7-9 own v3 schema, migration, repositories, and sync exclusion; Phase 8 and Phase 13 may extend only through explicit approved contracts.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-010",
        "SIK-011",
        "SIK-013",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-010",
        "SIK-011",
        "SIK-013",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 7-9; Unified Phases 8 and 13 for later extensions",
      "preservedRule": "Existing explicitly supported generic records may continue syncing under exact account claims; local app use remains available offline.",
      "revisitTrigger": "Any new kernel table, sync category, cloud migration, encryption scheme, or account-link workflow.",
      "sourceKeys": [
        "SIK",
        "SOUL",
        "CTX",
        "ACCESS",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Schema additivity, repeat migration, account isolation, zero generic-queue writes, cloud pull exclusion, sign-in non-migration, and non-destructive rollback require tests.",
      "title": "Local-only private kernel data versus generic cloud sync"
    },
    {
      "authorityAnalysis": "Client state is useful for display but cannot grant production paid/admin access. Test-mode and local-development authority must be explicit and cannot leak into a production bundle.",
      "chosenRule": "Use a typed entitlement snapshot whose production authority is server verified; reject client email allowlists, unsigned responses, local storage toggles, and blanket production admin flags.",
      "class": "SECURITY_AUTHORITY_CONFLICT",
      "conflictId": "CFL-010",
      "evidenceRefs": [
        "SIK",
        "ACCESS",
        "SUB",
        "REPO_HEAD"
      ],
      "id": "CFL-010",
      "implementationConsequence": "Task 5 lands the immediate interlock; Phase 13 owns Supabase staging/RLS and Stripe test-mode access contracts; live financial changes remain hard-gated.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-008",
        "SIK-012",
        "SIK-016",
        "MC-032"
      ],
      "involvedRequirementIds": [
        "MC-032",
        "SIK-008",
        "SIK-012",
        "SIK-016"
      ],
      "owner": "Kernel Task 5 and Unified Phase 13",
      "preservedRule": "A clearly scoped local_development entitlement may support isolated testing, and the client may cache a non-authoritative display mirror.",
      "revisitTrigger": "Entitlement source, plan, access gate, Supabase function, Stripe test contract, or production build-mode change.",
      "sourceKeys": [
        "SIK",
        "ACCESS",
        "SUB",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Production-bundle flag stripping, forged client state, RLS, webhook replay/order, account isolation, lease expiry, clock skew, and downgrade/revocation require tests.",
      "title": "Server-authoritative access versus client identity, email, or local toggles"
    },
    {
      "authorityAnalysis": "Current browser controls and session modes do not by themselves prove the exact origin, tab/frame, target, parameters, expected effect, expiry, and reviewed risk required by the goal. Capability marketing cannot replace live execution authority.",
      "chosenRule": "Quarantine consequential JARVIS browser actions until they consume the canonical approval engine and a real browser executor. Separate navigation/read from click/type/upload/download/send/purchase/account-change actions and fail closed when capability is unavailable.",
      "class": "SAFETY_BOUNDARY_CONFLICT",
      "conflictId": "CFL-011",
      "evidenceRefs": [
        "SIK",
        "BROWSER",
        "BCHAT",
        "REPO_HEAD"
      ],
      "id": "CFL-011",
      "implementationConsequence": "Task 6 closes immediate replay gaps, Task 19D lands the canonical adapter, and Phase 11 extends messaging and Browser Operator controls.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-008",
        "SIK-010",
        "SIK-011",
        "SIK-016"
      ],
      "involvedRequirementIds": [
        "SIK-008",
        "SIK-010",
        "SIK-011",
        "SIK-016"
      ],
      "owner": "Kernel Tasks 6 and 19D; Unified Phase 11",
      "preservedRule": "Existing user-controlled browser behavior and verified read-only operations remain available under their own explicit boundary.",
      "revisitTrigger": "Browser action schema, control mode, CDP/native bridge, messaging send, download/upload, or provider page boundary changes.",
      "sourceKeys": [
        "SIK",
        "BROWSER",
        "BCHAT",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Origin/target/parameter integrity, replay, prompt injection, cookie/credential isolation, upload/download policy, cancellation, kill switch, and executor terminal state require tests.",
      "title": "Browser Operator capability versus safe exact-action authority"
    },
    {
      "authorityAnalysis": "The kernel owns data and compatibility contracts, while the supplied Origami pack owns the final Chat-only visual oracle. Neither authority permits a global application redesign.",
      "chosenRule": "Keep Origami as an isolated Chat reconstruction after functional goals stabilize. Feed it existing message-part, activity, source, and artifact data through compatibility boundaries; do not move product semantics into decorative assets.",
      "class": "VISUAL_ISOLATION_BOUNDARY",
      "conflictId": "CFL-012",
      "evidenceRefs": [
        "SIK",
        "ORIGAMI",
        "MC"
      ],
      "id": "CFL-012",
      "implementationConsequence": "Unified Phase 14 owns the reference-locked reconstruction; MonoChrome must freeze and preserve the accepted Origami oracle before any product styling.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "SIK-014",
        "SIK-016",
        "MC-023",
        "MC-024"
      ],
      "involvedRequirementIds": [
        "MC-023",
        "MC-024",
        "SIK-014",
        "SIK-016"
      ],
      "owner": "Unified Phase 14 and MonoChrome Tasks MC0B, MC9, and MC10",
      "preservedRule": "All chat behavior, semantics, keyboard use, responsive states, accessibility, and JARVIS module behavior remain functional; unrelated routes remain untouched.",
      "revisitTrigger": "Origami pack/hash, Chat DOM contract, kernel compatibility projection, or visual oracle changes.",
      "sourceKeys": [
        "SIK",
        "ORIGAMI",
        "MC"
      ],
      "status": "READY",
      "testConsequence": "Functional chat regression, accessibility, exact scope, deterministic full-page/region comparison, anti-flatness, and preserved-oracle hashes require tests.",
      "title": "Origami reference authority versus shared application and kernel styling"
    },
    {
      "authorityAnalysis": "Goal 8 authorizes replacing selectable Light, not changing Default, VibeSpace, Jarvis Core, Origami, route behavior, user data, Pixel Pet transparency, native production identity, or remote provider pages.",
      "chosenRule": "Replace only the fourth selectable theme with monochrome; root all visual rules under html[data-theme='monochrome']; use generated boundary-specific parsing, v5 migration, CSP-safe prepaint, strict detached sync, frozen route ownership, and an isolated native test profile/capability.",
      "class": "THEME_ISOLATION_BOUNDARY",
      "conflictId": "CFL-013",
      "evidenceRefs": [
        "MC",
        "REPO_HEAD"
      ],
      "id": "CFL-013",
      "implementationConsequence": "MC0B freezes B0 and manifests; MC1-MC7 implement exact disjoint lanes; MC9 verifies preserved behavior/native isolation; MC8 alone may calibrate measured values from the exact video.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "MC-001",
        "MC-014",
        "MC-023",
        "MC-024",
        "MC-025",
        "MC-031",
        "MC-032",
        "MC-038"
      ],
      "involvedRequirementIds": [
        "MC-001",
        "MC-014",
        "MC-023",
        "MC-024",
        "MC-025",
        "MC-031",
        "MC-032",
        "MC-038"
      ],
      "owner": "MonoChrome Tasks MC0B-MC10",
      "preservedRule": "Other theme values, product copy, routes, records, explicit terminal palettes/ANSI colors, Origami, remote content, and transparent Pixel Pet first paint remain unchanged.",
      "revisitTrigger": "Theme registry, route/primitive/native-window manifest, B0 oracle, Tauri capability set, or reference-video availability changes.",
      "sourceKeys": [
        "MC",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Migration/hydration, prepaint, sync, route non-remount, other-theme and Origami diffs, CSP, remote-page boundary, terminal precedence, isolated native process/profile, accessibility, and performance require tests.",
      "title": "MonoChrome replacement versus other themes, routes, native windows, and remote content"
    },
    {
      "authorityAnalysis": "The user requested GPT-5.6 Sol with Max reasoning, and the collaboration spawn API accepts those request overrides, but it does not attest the backend that actually executed a worker. Truthful evidence outranks an unattested requested label.",
      "chosenRule": "Record requested model/reasoning separately from actual model/reasoning, which remain not exposed/unverified. Never label a worker Sol Max without backend evidence.",
      "class": "EVIDENCE_LIMITATION",
      "conflictId": "CFL-014",
      "evidenceRefs": [
        "AUTH",
        "DIR",
        "COLLABORATION_RUNTIME"
      ],
      "id": "CFL-014",
      "implementationConsequence": "MODEL_AND_REASONING_EVIDENCE.md and SUBAGENT_PLAN.md own the evidence; architecture and review findings may cite worker IDs but not an invented backend model.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "CFL-MODEL-REQUESTED",
        "CFL-MODEL-ACTUAL"
      ],
      "involvedRequirementIds": [
        "DIR-001"
      ],
      "owner": "Task 0R model/subagent evidence owner",
      "preservedRule": "Use the maximum useful collaboration concurrency and record actual agent IDs and provisioning surface without blocking locally actionable work.",
      "revisitTrigger": "The collaboration API begins exposing a verified backend model/reasoning attestation for executed workers.",
      "sourceKeys": [
        "AUTH",
        "DIR",
        "COLLABORATION_RUNTIME"
      ],
      "status": "READY",
      "testConsequence": "The Task 0R validator rejects unsupported model claims and requires the exact fallback reason.",
      "title": "Requested GPT-5.6 Sol Max workers versus unattested collaboration backend identity"
    },
    {
      "authorityAnalysis": "Exact ownership and non-overlap remain mandatory, but .agents/tools/agent-lock.mjs is absent at the frozen worktree. An unavailable helper cannot be fabricated or treated as executed.",
      "chosenRule": "Record the helper as MISSING_UNVERIFIED and use the root AGENT_COORDINATION.md mutex/append-only ledger plus exact literal file manifests as the available coordination mechanism.",
      "class": "TOOLING_LIMITATION",
      "conflictId": "CFL-015",
      "evidenceRefs": [
        "DIR",
        "POLICY",
        "COORD",
        "REPO_HEAD"
      ],
      "id": "CFL-015",
      "implementationConsequence": "Task 0R records the limitation; each implementation task cites its exact committed plan manifest and coordination entry rather than a fictitious helper receipt.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "CFL-LOCK-REQUIRED",
        "CFL-LOCK-HELPER-ABSENT"
      ],
      "involvedRequirementIds": [
        "DIR-001"
      ],
      "owner": "Primary coordinator and every task owner",
      "preservedRule": "Every product task still acquires and releases exact file ownership, re-reads the ledger before edits, and stages only literal task files.",
      "revisitTrigger": "The exact helper appears, root coordination policy changes, or a new supported lock surface is provided.",
      "sourceKeys": [
        "DIR",
        "POLICY",
        "COORD",
        "REPO_HEAD"
      ],
      "status": "READY",
      "testConsequence": "Scope checks compare staged files with exact manifests, reject install/install.ps1, and require truthful absence evidence for the helper.",
      "title": "Required coordination locks versus absent agent-lock helper"
    },
    {
      "authorityAnalysis": "The approved Sakura master goal and STYLE_SPEC are normative for the new theme; prototype runtime, mock data, 24 random petals, Japanese hero copy, and alternate variants are contextual only.",
      "chosenRule": "Implement owned/adapted Sakura art and behavior-preserving app chrome only beneath html[data-theme='sakura']; preserve existing themes, Origami, user content, terminal ANSI, and remote provider surfaces.",
      "class": "SOURCE_AUTHORITY_AND_ISOLATION",
      "conflictId": "CFL-016",
      "evidenceRefs": [
        "GOAL_SAKURA",
        "SAKURA_STYLE_SPEC",
        "c4a48e1f09850af0c1db1b2f097234c243f38daa"
      ],
      "id": "CFL-016",
      "implementationConsequence": "Phase 16 uses the committed exact Sakura plan, performs no backend migration, and waits for the accepted MonoChrome baseline before product writes.",
      "implementationState": "PLANNED",
      "involvedIds": [
        "PLN-021",
        "DEP-050",
        "TGT-029",
        "RBK-011"
      ],
      "involvedRequirementIds": [
        "SAK-001",
        "SAK-010",
        "SAK-019",
        "SAK-040",
        "SAK-043",
        "SAK-046"
      ],
      "owner": "Phase 16 Sakura coordinator and independent reviewers",
      "preservedRule": "All pre-Sakura behavior, data, themes, native identity/profile, protected listeners, and production services remain unchanged.",
      "revisitTrigger": "The master goal/reference closure changes, MonoChrome baseline is rejected, or implementation requires a schema/backend change.",
      "sourceKeys": [
        "GOAL_SAKURA",
        "SAKURA_STYLE_SPEC",
        "SAKURA_INDEX_HTML"
      ],
      "status": "READY",
      "testConsequence": "TST-PLAN-002 and TST-SAK-001..005 verify authority, scoping, behavior, isolation, native, rollback, and final-gate closure.",
      "title": "Sakura reference authority versus existing behavior and isolation boundaries"
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
