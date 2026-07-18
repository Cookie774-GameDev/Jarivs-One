---
artifactId: 'TARGET_ARCHITECTURE'
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
  ['GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'TARGET_ARCHITECTURE', 'TASK0R-20260718-B']
---

# Target Architecture

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "TARGET_ARCHITECTURE",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "TARGET_ARCHITECTURE",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "architectureId": "TGT-001",
      "canonicalOwner": "AccountIdentity resolver plus the primary App account-session lifecycle",
      "concern": "Explicit account authority",
      "consumers": [
        "kernel repositories",
        "AI runtime",
        "cloud-sync authority",
        "memory",
        "task runs",
        "Command Center read port"
      ],
      "cutover": "Tasks 1A and 1B provide the accepted narrow foundation; Tasks 7-9 and 13P move all kernel persistence and host composition onto it.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 1: Canonical Account Identity",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 1: Canonical Account Identity",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
        ]
      },
      "id": "TGT-001",
      "implementationState": "IMPLEMENTING",
      "interfaces": [
        "AccountIdentity",
        "resolveAccountIdentity",
        "requireAccountIdentity",
        "account-bound repository/session factories"
      ],
      "migrationIds": [
        "MIG-001"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-001"
      ],
      "sourceRefs": [
        "SIK",
        "DIR"
      ],
      "status": "IMPLEMENTING",
      "storage": [
        "durable local user identity",
        "authenticated cloud session",
        "account IDs on every account-bearing kernel row"
      ],
      "trustBoundary": "Authenticated Supabase identity wins over durable local identity; missing or stale identity fails closed; no local-unassigned value exists."
    },
    {
      "architectureId": "TGT-002",
      "canonicalOwner": "jarvis identity/profile modules and protected-agent resolver",
      "concern": "Protected JARVIS identity and profile authority",
      "consumers": [
        "request envelope",
        "typed chat",
        "voice",
        "scheduled JARVIS",
        "Hive final",
        "Response Intelligence"
      ],
      "cutover": "Task 2's exact four protected identity/profile atoms are accepted at fd0cf3cb71f552884a3eeff0de45207ef13f3f4d after fresh review at 56d669f60b0eb93309f332ed700d9b0f4b0b82ee (28/28 and app typecheck PASS; report SHA-256 4533FFEF08FABC763DA2B87F16398E4A9B80C004A1B150E0D7B09E169DE61263). Tasks 10 and 13P still persist and resolve them; Task 16B makes them active on canonical JARVIS requests.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 2: Protected JARVIS Identity and Profile Contracts - implementation landed, review pending",
        "docs/unified-goals/EXECUTION_PLAN.md:249-257",
        "docs/unified-goals/TEST_MATRIX.md:147-164",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 10: Canonical Built-Ins and Profile-Aware Agent Editor",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 2: Protected JARVIS Identity and Profile Contracts - implementation landed, review pending",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 10: Canonical Built-Ins and Profile-Aware Agent Editor",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
        ]
      },
      "id": "TGT-002",
      "implementationState": "PASS",
      "interfaces": [
        "JarvisIdentityRevision",
        "JarvisIdentitySnapshot",
        "JarvisProfile",
        "JarvisProfileSnapshot",
        "isProtectedJarvisAgent",
        "resolveProtectedJarvisAgent"
      ],
      "migrationIds": [
        "MIG-001",
        "MIG-003"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-001",
        "RBK-003"
      ],
      "sourceRefs": [
        "SIK",
        "JRI",
        "SOUL"
      ],
      "status": "COMPLETE",
      "storage": [
        "versioned account-scoped identity revisions",
        "account-scoped profile revisions",
        "separate preserved user extension"
      ],
      "trustBoundary": "Immutable JARVIS identity outranks SOUL, memory, context, skills, websites, workers, models, and custom instructions, but applies only to the protected built-in JARVIS."
    },
    {
      "architectureId": "TGT-003",
      "canonicalOwner": "Dexie v3 schema, explicit row/domain mappers, account-scoped repositories, and persistence coordinator",
      "concern": "Additive local-only kernel persistence",
      "consumers": [
        "compiler",
        "journal",
        "approval engine",
        "artifact normalizer",
        "typed/voice/schedule/Hive",
        "Command Center"
      ],
      "cutover": "Task 7 adds schema/factory, Task 8 migrates and activates accounts, Task 9 lands mappers/repos/sync denial, and Task 13P mounts the host coordinator.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 7: Additive Dexie v3 Schema and Injected Database Factory",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 8: Transactional Account Activation and Legacy JARVIS Migration",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 7: Additive Dexie v3 Schema and Injected Database Factory",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 8: Transactional Account Activation and Legacy JARVIS Migration",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
        ]
      },
      "id": "TGT-003",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisKernelDatabase",
        "JarvisKernelRepositories",
        "openAccount",
        "account session/read port",
        "idempotent v2-to-v3 migration"
      ],
      "migrationIds": [
        "MIG-001",
        "MIG-002",
        "MIG-003"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-001",
        "RBK-002",
        "RBK-003"
      ],
      "sourceRefs": [
        "SIK",
        "DIR"
      ],
      "status": "PLANNED",
      "storage": [
        "jarvis_identity_revisions",
        "jarvis_profiles",
        "jarvis_runs",
        "jarvis_events",
        "jarvis_approvals",
        "jarvis_artifacts",
        "jarvis_source_refs",
        "kernel metadata"
      ],
      "trustBoundary": "Every read/write is account explicit; kernel records never enter generic sync; user data is preserved through additive and forward-only migration/rollback."
    },
    {
      "architectureId": "TGT-004",
      "canonicalOwner": "JarvisRequestEnvelope builder, source policy, capability snapshot, and pure prompt compiler",
      "concern": "Immutable request, context, and prompt compilation",
      "consumers": [
        "provider transport",
        "Response Intelligence",
        "Context Map",
        "Prompt Forge",
        "Browser Chat",
        "schedule/Hive"
      ],
      "cutover": "Task 4 closes immediate context leakage; Tasks 11-12 land the envelope and compiler before transport or shadow routing.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 4: Immediate Context Secret Interlock",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 11: Context, Capability, Immutable Envelope, and Retry Identity",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 12: Pure Protected Prompt Compiler with Defense in Depth"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 4: Immediate Context Secret Interlock",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 11: Context, Capability, Immutable Envelope, and Retry Identity",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 12: Pure Protected Prompt Compiler with Defense in Depth"
        ]
      },
      "id": "TGT-004",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisRequestEnvelope",
        "JarvisContextPack",
        "JarvisSourceRef",
        "JarvisCapabilitySnapshot",
        "JarvisModelSnapshot",
        "CompiledJarvisPrompt",
        "compileJarvisPrompt"
      ],
      "migrationIds": [
        "MIG-003"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-003"
      ],
      "sourceRefs": [
        "SIK",
        "CTX",
        "PF",
        "BCHAT"
      ],
      "status": "PLANNED",
      "storage": [
        "immutable per-request snapshots and hashes",
        "source references/exclusions in local kernel repositories"
      ],
      "trustBoundary": "Immutable security/identity/capability rules outrank provenance-labelled context; secret-like sources fail closed; caller-provided snapshots cannot bypass runtime authority."
    },
    {
      "architectureId": "TGT-005",
      "canonicalOwner": "One providerPromptTransport boundary plus per-adapter declared strategy",
      "concern": "Exact provider prompt transport",
      "consumers": [
        "native API providers",
        "external CLI adapters",
        "local models",
        "future Browser Chat feasibility adapters"
      ],
      "cutover": "Task 13 changes every registered adapter under one exact manifest before Task 16A can shadow and Task 16B can switch.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13: Exact Provider Prompt Transport for Every Adapter"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13: Exact Provider Prompt Transport for Every Adapter"
        ]
      },
      "id": "TGT-005",
      "implementationState": "PLANNED",
      "interfaces": [
        "native-system transport",
        "safe-prefixed-preamble transport",
        "fail-closed unsupported transport",
        "abort-aware provider dispatch"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "SIK",
        "JRI",
        "BCHAT"
      ],
      "status": "PLANNED",
      "storage": [
        "safe transport diagnostics and prompt hash only; no credentials or raw secret values"
      ],
      "trustBoundary": "A provider is compatible only when it transmits the exact compiled contract and selected model/connection without credential leakage or silent fallback."
    },
    {
      "architectureId": "TGT-006",
      "canonicalOwner": "Primary App kernel composition, native owner broker, and legacy-shadow-kernel runtime gate",
      "concern": "One trusted kernel host and staged runtime gate",
      "consumers": [
        "typed chat",
        "detached workbench",
        "voice",
        "schedule",
        "Hive",
        "Command Center"
      ],
      "cutover": "Task 16A lands shadow compilation, Task 16W lands trusted cross-webview ownership, and Task 16B switches the tested production default to kernel.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16A: Shadow Compilation and the Three-State Runtime Gate",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16W: One Trusted Kernel Host Across Webviews",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16A: Shadow Compilation and the Three-State Runtime Gate",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16W: One Trusted Kernel Host Across Webviews",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch"
        ]
      },
      "id": "TGT-006",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisRuntimeMode",
        "JarvisRuntimeGate",
        "JarvisRuntimeInterlockPort",
        "primary host account session",
        "secondary-window kernel client"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-003"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-003"
      ],
      "sourceRefs": [
        "SIK",
        "DIR"
      ],
      "status": "PLANNED",
      "storage": [
        "runtime mode preference",
        "host lifecycle state",
        "canonical repositories behind account session"
      ],
      "trustBoundary": "Only the primary host holds write authority and secret/effect-bearing services; secondary webviews receive typed broker clients and cannot steal ownership."
    },
    {
      "architectureId": "TGT-007",
      "canonicalOwner": "Response mode classifier, prose-only linter/repair, deterministic templates, response envelope, preview gate, and speech gate",
      "concern": "Verified response and speech enforcement",
      "consumers": [
        "typed chat",
        "voice",
        "scheduled/Hive final",
        "Response Intelligence",
        "Command Center"
      ],
      "cutover": "Task 14 lands truth and repair, Task 15 prepares preview/speech boundaries, and Task 21A connects voice only after canonical response settlement.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 14: Conditional Prose Repair and Verified Response Truth",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 15: Preview and Speech Gate Preparation Only",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21A: Voice-Session Binding Through the Canonical Kernel"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 14: Conditional Prose Repair and Verified Response Truth",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 15: Preview and Speech Gate Preparation Only",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21A: Voice-Session Binding Through the Canonical Kernel"
        ]
      },
      "id": "TGT-007",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisResponseEnvelope",
        "classifyResponseMode",
        "enforceJarvisResponse",
        "displayText",
        "spokenText",
        "speech gate"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "SIK",
        "JRI",
        "JCC"
      ],
      "status": "PLANNED",
      "storage": [
        "verified response envelope",
        "safe enforcement diagnostics",
        "message compatibility projection"
      ],
      "trustBoundary": "Structured blocks/artifacts are immutable; prose may receive at most one bounded repair; raw provider text, secret/prompt leakage, and unverified success never reach display or TTS."
    },
    {
      "architectureId": "TGT-008",
      "canonicalOwner": "Task 18 run/event repositories and runtime authority",
      "concern": "Canonical execution journal, cancellation, and recovery",
      "consumers": [
        "approvals",
        "artifacts",
        "typed chat",
        "voice",
        "schedule",
        "Hive",
        "Command Center",
        "later jobs/agents"
      ],
      "cutover": "Task 18 lands before all canonical producer tasks and remains the only lifecycle write authority; legacy stores become projections in Task 20C.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 18 — Canonical execution journal, cancellation, and recovery"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 18 — Canonical execution journal, cancellation, and recovery"
        ]
      },
      "id": "TGT-008",
      "implementationState": "PLANNED",
      "interfaces": [
        "allocateRun",
        "appendEvent",
        "transitionRun",
        "requestCancellation",
        "recoverRuns",
        "JarvisLiveEvidenceHost"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-007"
      ],
      "sourceRefs": [
        "SIK",
        "JCC"
      ],
      "status": "PLANNED",
      "storage": [
        "account-scoped runs",
        "compound runId/seq events",
        "cancellation/recovery evidence",
        "canonical result authority links"
      ],
      "trustBoundary": "The runtime allocates caller-stable IDs and time, owns legal transitions, verifies producer sources, and drives real abort/effect cancellation; callers cannot self-certify terminal truth."
    },
    {
      "architectureId": "TGT-009",
      "canonicalOwner": "JarvisSecurityRuntime, ApprovalEngine, immutable action catalog, and canonical producer adapters",
      "concern": "Durable exact approvals and consequential execution",
      "consumers": [
        "chat action cards",
        "plugins",
        "terminal",
        "Browser Operator",
        "future messaging/billing actions"
      ],
      "cutover": "Tasks 5-6 deny known bypasses; 19A lands authority, 19B action adapters, 19C terminal cancellation, and 19D Browser Operator.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 5: Client Entitlement Interlock",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 6: Browser Operator Approval Integrity Interlock",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 19 — Versioned approvals and canonical consequential execution"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 5: Client Entitlement Interlock",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 6: Browser Operator Approval Integrity Interlock",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 19 — Versioned approvals and canonical consequential execution"
        ]
      },
      "id": "TGT-009",
      "implementationState": "PLANNED",
      "interfaces": [
        "createApproval",
        "decideApproval",
        "consumeApproval",
        "executeCanonicalAction",
        "cancelTerminal",
        "executeBrowserAction"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-004"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-004"
      ],
      "sourceRefs": [
        "SIK",
        "BROWSER",
        "ACCESS"
      ],
      "status": "PLANNED",
      "storage": [
        "versioned approval rows",
        "single-use consumption state",
        "executor receipts/events",
        "secret handles without values"
      ],
      "trustBoundary": "Account, run, action/version, exact parameters/hash, target, risk, expiry, capability, entitlement, grant, and effect state are revalidated under stable locks; approval is never completion."
    },
    {
      "architectureId": "TGT-010",
      "canonicalOwner": "Artifact v1 repository/issuer, real producer adapters, and read-only legacy projections",
      "concern": "Verified artifacts and compatibility projections",
      "consumers": [
        "Outputs",
        "Prompt Forge",
        "Canvas",
        "Browser Chat",
        "message parts",
        "Command Center"
      ],
      "cutover": "20A lands the private issuer/repository, 20B binds real producers, and 20C disables legacy writers while retaining read-only projections.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 20 — Versioned artifacts and legacy compatibility shutdown"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 20 — Versioned artifacts and legacy compatibility shutdown"
        ]
      },
      "id": "TGT-010",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisArtifactV1",
        "issueVerifiedArtifact",
        "bindProducerReceipt",
        "artifact/source selectors",
        "legacy read-only projections"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-007"
      ],
      "sourceRefs": [
        "SIK",
        "JCC",
        "PF",
        "CANVAS",
        "BCHAT"
      ],
      "status": "PLANNED",
      "storage": [
        "account/run-bound artifacts",
        "backing hashes/URIs",
        "source-reference links",
        "producer receipts"
      ],
      "trustBoundary": "Only a real verified producer can issue an artifact; source evidence remains a source; compatibility code cannot write lifecycle or artifact truth."
    },
    {
      "architectureId": "TGT-011",
      "canonicalOwner": "Kernel runtime surface plus surface-specific thin adapters",
      "concern": "Canonical typed, voice, scheduled, and Hive dispatch",
      "consumers": [
        "Chat",
        "Voice module",
        "Schedule runner",
        "Hive stack",
        "Command Center retries"
      ],
      "cutover": "Task 16B binds typed chat, Task 21A binds voice, and Task 17 binds schedule and Hive final only after journal/artifact/approval authority exists.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21A: Voice-Session Binding Through the Canonical Kernel",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 17: Scheduled JARVIS and Hive Final Kernel Dispatch"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21A: Voice-Session Binding Through the Canonical Kernel",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 17: Scheduled JARVIS and Hive Final Kernel Dispatch"
        ]
      },
      "id": "TGT-011",
      "implementationState": "PLANNED",
      "interfaces": [
        "typed-chat dispatch",
        "voice-session dispatch",
        "scheduled occurrence allocation/preparation/dispatch",
        "Hive worker execution/final dispatch",
        "logical versus transport retry"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-007"
      ],
      "sourceRefs": [
        "SIK",
        "JRI",
        "JCC"
      ],
      "status": "PLANNED",
      "storage": [
        "canonical runs/events/results",
        "request/response envelopes",
        "schedule/Hive parent-child lineage"
      ],
      "trustBoundary": "Runtime-issued opaque handles/seeds carry authority; callers cannot supply request IDs, attempts, snapshots, clocks, failures, proof, or terminal/result truth."
    },
    {
      "architectureId": "TGT-012",
      "canonicalOwner": "Task 21B Command Center lower shell and primary-host port factory",
      "concern": "Thin truthful Command Center read surface",
      "consumers": [
        "Chat lower shell",
        "current-run view",
        "Outputs",
        "Live Systems",
        "retry/cancel controls"
      ],
      "cutover": "Task 21B runs only after typed, voice, schedule, Hive, action, artifact, and read-port contracts exist; Unified Phase 3 later expands the full route.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21B — Command Center lower shell"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21B — Command Center lower shell"
        ]
      },
      "id": "TGT-012",
      "implementationState": "PLANNED",
      "interfaces": [
        "JarvisCommandCenterHostPort",
        "JarvisAccountLiveEvidenceReadPort",
        "requestCancellation(runId)",
        "retryScheduledTransport(runId)",
        "retryLogicalRun(runId)"
      ],
      "migrationIds": [
        "MIG-002",
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-002",
        "RBK-007"
      ],
      "sourceRefs": [
        "SIK",
        "JCC"
      ],
      "status": "PLANNED",
      "storage": [
        "read-only canonical journal/artifact/source snapshots"
      ],
      "trustBoundary": "The UI receives an account-bound read port and run-ID-only commands, never raw repositories, runtime, sessions, lifecycle mutation ports, or proof/time authority."
    },
    {
      "architectureId": "TGT-013",
      "canonicalOwner": "Development-only smoke fixtures followed by docs-only native/final review",
      "concern": "Deterministic smoke and final kernel evidence",
      "consumers": [
        "Task 22 reviewers",
        "Phase 17 integration matrix",
        "draft PR evidence"
      ],
      "cutover": "Task 21C lands fixtures only after the Command Center; Task 22 consumes committed fixtures and closes kernel evidence before later goal implementation.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21C — Development-only deterministic kernel smoke fixtures",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 22 — Docs-only native evidence and final review"
      ],
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21C — Development-only deterministic kernel smoke fixtures",
          "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 22 — Docs-only native evidence and final review"
        ]
      },
      "id": "TGT-013",
      "implementationState": "PLANNED",
      "interfaces": [
        "isolated deterministic smoke route/fixtures",
        "native/manual evidence protocol",
        "secret/scope audit",
        "independent review"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-008"
      ],
      "sourceRefs": [
        "SIK",
        "DIR"
      ],
      "status": "PLANNED",
      "storage": [
        "development fixture state",
        "tracked docs/evidence",
        "ignored local native artifacts"
      ],
      "trustBoundary": "Fixtures are development-only, cannot enter production navigation, and cannot substitute mocked evidence for native behavior; no deployment or merge is implied."
    },
    {
      "architectureId": "TGT-014",
      "canonicalOwner": "Future Phase 2 executable plan extending the kernel response contracts",
      "concern": "JARVIS Response Intelligence",
      "consumers": [
        "typed JARVIS",
        "voice",
        "schedule",
        "Hive final",
        "Command Center narration"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-jarvis-response-intelligence.md with exact manifests before edits; consume Phase 1 interfaces instead of replacing them.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 9. Phase 2 — JARVIS Response Intelligence"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 9. Phase 2 — JARVIS Response Intelligence",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-jarvis-response-intelligence.md"
      },
      "id": "TGT-014",
      "implementationState": "PLANNED",
      "interfaces": [
        "canonical JARVIS system contract",
        "response-mode policies",
        "cross-provider behavior fixtures",
        "scheduled/Hive presentation policy"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "JRI",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "versioned policy/config and fixtures; canonical runs/responses remain kernel-owned"
      ],
      "trustBoundary": "Personality may shape verified prose but cannot weaken safety, execution truth, source provenance, structured content, or speech gates."
    },
    {
      "architectureId": "TGT-015",
      "canonicalOwner": "Future Phase 3 executable plan extending Task 21B read ports",
      "concern": "Full JARVIS Command Center",
      "consumers": [
        "Command Center route",
        "assistive technology",
        "operator recovery workflows"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-jarvis-command-center.md with exact manifests after Phase 2 and before edits.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 10. Phase 3 — JARVIS Command Center"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 10. Phase 3 — JARVIS Command Center",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-jarvis-command-center.md"
      },
      "id": "TGT-015",
      "implementationState": "PLANNED",
      "interfaces": [
        "current-run model",
        "transcript/progress/approval/source selectors",
        "Outputs",
        "Live Systems",
        "voice/session boundary"
      ],
      "migrationIds": [
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-007"
      ],
      "sourceRefs": [
        "JCC",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "read models and UI preference only; lifecycle truth remains kernel-owned"
      ],
      "trustBoundary": "Every displayed node resolves to live normalized state; disconnected/degraded/unavailable is explicit; UI cannot manufacture telemetry."
    },
    {
      "architectureId": "TGT-016",
      "canonicalOwner": "Future Phase 4 executable plan extending JarvisSourceRef and JarvisContextPack",
      "concern": "Context Map 2.0 and local Second Brain",
      "consumers": [
        "JARVIS",
        "Terminal",
        "Prompt Forge",
        "Canvas",
        "Command Center"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-context-map-second-brain.md with exact manifests before edits; reuse kernel sources/artifacts/jobs/journal.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 11. Phase 4 — Context Map 2.0 and Local Second Brain"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 11. Phase 4 — Context Map 2.0 and Local Second Brain",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-context-map-second-brain.md"
      },
      "id": "TGT-016",
      "implementationState": "PLANNED",
      "interfaces": [
        "versioned source/document/chunk/relation/view/note/index/retrieval contracts",
        "hybrid search",
        "context inspector",
        "/context"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "CTX",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "local-first indexed sources, chunks, relations, notes, views, freshness and provenance"
      ],
      "trustBoundary": "Deny-by-default paths, traversal/symlink defense, prompt-injection isolation, bounded extraction, provenance, and explicit sync opt-in."
    },
    {
      "architectureId": "TGT-017",
      "canonicalOwner": "Future Phase 5 executable plan",
      "concern": "Terminal context and command layer",
      "consumers": [
        "terminal panes",
        "JARVIS",
        "agents",
        "Command Center"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-terminal-context-command-layer.md with exact manifests after Phase 4 contracts.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 12. Phase 5 — Terminal Context and Command Layer"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 12. Phase 5 — Terminal Context and Command Layer",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-terminal-context-command-layer.md"
      },
      "id": "TGT-017",
      "implementationState": "PLANNED",
      "interfaces": [
        "terminal command palette",
        "managed briefing",
        "PTY IPC",
        "approval-bound command execution",
        "real cancellation"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "TERM",
        "CTX",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "terminal session/context references and canonical run/events; existing PTY persistence preserved"
      ],
      "trustBoundary": "Reviewed command/cwd/env metadata is immutable and secret-redacted; submission, running, cancellation, and verified completion are distinct."
    },
    {
      "architectureId": "TGT-018",
      "canonicalOwner": "Future Phase 6 executable plan extending the kernel compiler, retrieval, jobs, and artifacts",
      "concern": "Prompt Forge",
      "consumers": [
        "chat",
        "agents",
        "tasks",
        "workflows",
        "Canvas"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-prompt-forge.md with exact manifests after Context and kernel foundations.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 13. Phase 6 — Prompt Forge"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 13. Phase 6 — Prompt Forge",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-prompt-forge.md"
      },
      "id": "TGT-018",
      "implementationState": "PLANNED",
      "interfaces": [
        "composer state",
        "intent-preserving upgrade",
        "review/diff/accept/reject/restore",
        "source inspection",
        "versioned prompt artifact"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "PF",
        "CTX",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "local prompt versions/artifacts, source refs, job/run records"
      ],
      "trustBoundary": "No silent outcome change, unsupported capability claim, prompt injection, secret inclusion, or unbounded public research."
    },
    {
      "architectureId": "TGT-019",
      "canonicalOwner": "Future Phase 7 executable plan with its own domain model",
      "concern": "Infinite Idea Canvas",
      "consumers": [
        "Canvas UI",
        "Prompt Forge",
        "AI transformations",
        "exports"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-infinite-idea-canvas.md with exact manifests after Prompt Forge.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 14. Phase 7 — Infinite Idea Canvas"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 14. Phase 7 — Infinite Idea Canvas",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-infinite-idea-canvas.md"
      },
      "id": "TGT-019",
      "implementationState": "PLANNED",
      "interfaces": [
        "Canvas route",
        "blocks/edges/frames/comments",
        "pan/zoom/history/import/export",
        "cancellable AI jobs"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "CANVAS",
        "PF",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "separate local Canvas model",
        "kernel run/artifact/source references"
      ],
      "trustBoundary": "Canvas state is not the kernel run/artifact model; AI effects are journaled jobs, sources retain provenance, and large media/work is bounded."
    },
    {
      "architectureId": "TGT-020",
      "canonicalOwner": "Future Phase 8 executable plan extending protected profile/provenance/local-store contracts",
      "concern": "SOUL, profiles, memory, recall, and learning",
      "consumers": [
        "JARVIS compiler",
        "recall UI",
        "Skills",
        "agents",
        "Command Center"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-soul-profiles-memory.md with exact manifests before edits and preserve legacy user extensions.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 15. Phase 8 — SOUL, Profiles, Memory, Recall, and Learning"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 15. Phase 8 — SOUL, Profiles, Memory, Recall, and Learning",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-soul-profiles-memory.md"
      },
      "id": "TGT-020",
      "implementationState": "PLANNED",
      "interfaces": [
        "versioned SOUL/profile revisions",
        "memory evidence/confidence/decay",
        "learning proposals",
        "profile/account switch",
        "import/export/rollback"
      ],
      "migrationIds": [
        "MIG-003"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-003"
      ],
      "sourceRefs": [
        "SOUL",
        "MEM",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "account/profile-scoped local records",
        "optional explicitly approved encrypted sync categories"
      ],
      "trustBoundary": "SOUL/memory is lower authority than immutable identity/security; learning is reviewable and anti-poisoned; credentials remain keychain handles."
    },
    {
      "architectureId": "TGT-021",
      "canonicalOwner": "Future Phase 9 executable plan",
      "concern": "Skills 2.0 and Workflow RPC",
      "consumers": [
        "agents",
        "JARVIS",
        "workflow composer",
        "parallel runtime"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-skills-workflow-rpc.md with exact manifests after Phase 8.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 16. Phase 9 — Skills 2.0 and Workflow RPC"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 16. Phase 9 — Skills 2.0 and Workflow RPC",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-skills-workflow-rpc.md"
      },
      "id": "TGT-021",
      "implementationState": "PLANNED",
      "interfaces": [
        "versioned skill manifest",
        "trust/permission registry",
        "typed RPC",
        "workflow graph/checkpoints",
        "artifact/progress/cancellation"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "SKILL",
        "SOUL",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "skill packages/manifests",
        "workflow checkpoints",
        "kernel runs/events/artifacts"
      ],
      "trustBoundary": "Instructional and executable skills are distinct; no arbitrary plugin execution; permissions, provenance, supply-chain state, approvals, and capability claims are explicit."
    },
    {
      "architectureId": "TGT-022",
      "canonicalOwner": "Future Phase 10 executable plan consuming Workflow RPC and the kernel journal",
      "concern": "Parallel agent runtime",
      "consumers": [
        "JARVIS",
        "workflow engine",
        "Command Center",
        "messaging/browser workflows"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-parallel-agent-runtime.md with exact manifests after Skills/RPC.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 17. Phase 10 — Parallel Agent Runtime"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 17. Phase 10 — Parallel Agent Runtime",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-parallel-agent-runtime.md"
      },
      "id": "TGT-022",
      "implementationState": "PLANNED",
      "interfaces": [
        "parent/child run graph",
        "bounded worker pools",
        "capability matching",
        "handoffs/messages",
        "cancellation tree",
        "final synthesis"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "AGENT",
        "SKILL",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "canonical parent/child runs/events/artifacts/checkpoints"
      ],
      "trustBoundary": "Worker identity/attribution is distinct from JARVIS voice; budgets, locks, privacy inheritance, effect idempotency, and orphan recovery are enforced."
    },
    {
      "architectureId": "TGT-023",
      "canonicalOwner": "Future Phase 11 executable plan extending canonical approvals, journal, artifacts, source policy, and worker runtime",
      "concern": "Messaging gateway and Browser Operator",
      "consumers": [
        "messaging UI",
        "Browser Operator",
        "agents",
        "Command Center"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-messaging-browser-operator.md with exact manifests after Phase 10.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 18. Phase 11 — Messaging Gateway and Browser Operator"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 18. Phase 11 — Messaging Gateway and Browser Operator",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-messaging-browser-operator.md"
      },
      "id": "TGT-023",
      "implementationState": "PLANNED",
      "interfaces": [
        "message queues/adapters/drafts",
        "exact browser action schema",
        "origin/tab/frame/target policy",
        "kill switches"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "MSG",
        "BROWSER",
        "AGENT",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "message state/audit events",
        "browser approval/run/artifact references"
      ],
      "trustBoundary": "Consequential send/browser effects require explicit exact approval; credentials/cookies, prompt injection, origin, uploads/downloads, and replay are bounded."
    },
    {
      "architectureId": "TGT-024",
      "canonicalOwner": "Future Phase 12 executable plan gated by per-provider feasibility",
      "concern": "Browser Chat and local tool bridge",
      "consumers": [
        "Browser Chat",
        "local tools",
        "providers",
        "Command Center"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-browser-chat-local-tool-bridge.md with exact manifests only after Phase 11 and provider feasibility spikes.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 19. Phase 12 — Browser Chat and Local Tool Bridge"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 19. Phase 12 — Browser Chat and Local Tool Bridge",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-browser-chat-local-tool-bridge.md"
      },
      "id": "TGT-024",
      "implementationState": "PLANNED",
      "interfaces": [
        "provider feasibility matrix",
        "Browser Chat shell",
        "device/grant bridge",
        "pending request/approval/revocation",
        "diagnostics"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "BCHAT",
        "BRIDGE",
        "BROWSER",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "local chat/provider profiles",
        "scoped device grants/audit",
        "kernel runs/artifacts/sources"
      ],
      "trustBoundary": "Only documented permitted surfaces are enabled; no password, cookie, session token, or hidden browser storage is captured; unsupported providers stay unavailable."
    },
    {
      "architectureId": "TGT-025",
      "canonicalOwner": "Future Phase 13 executable plan and server-authoritative staging contracts",
      "concern": "VibeSpace Access, Supabase, and Stripe test mode",
      "consumers": [
        "paywall",
        "account/plans",
        "kernel entitlement snapshots",
        "server metering"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-vibespace-access.md with exact manifests and use the required Supabase skills before edits/migrations.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 20. Phase 13 — VibeSpace Access, Supabase, and Stripe Test Mode"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 20. Phase 13 — VibeSpace Access, Supabase, and Stripe Test Mode",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-vibespace-access.md"
      },
      "id": "TGT-025",
      "implementationState": "PLANNED",
      "interfaces": [
        "access-status function",
        "RLS",
        "webhook idempotency",
        "Stripe test checkout/portal/test clock",
        "offline lease"
      ],
      "migrationIds": [
        "MIG-006"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-006"
      ],
      "sourceRefs": [
        "ACCESS",
        "SUB",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "Supabase staging schema/audit",
        "Stripe test objects",
        "signed/local offline lease state"
      ],
      "trustBoundary": "No client allowlist, toggle, or unsigned response grants access; live financial and production operations remain hard-gated."
    },
    {
      "architectureId": "TGT-026",
      "canonicalOwner": "Future Phase 14 executable plan plus the canonical Origami goal and implementation pack",
      "concern": "Reference-locked Origami Chat",
      "consumers": [
        "Chat route",
        "MonoChrome B0 preserved-theme oracle"
      ],
      "cutover": "Create docs/superpowers/plans/2026-07-16-origami-chat-reconstruction.md with exact manifests after Phases 1-13 stabilize; freeze acceptance before MC0B.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 21. Phase 14 — Reference-Locked Origami Chat",
        "docs/unified-goals/ATTACHMENT_INVENTORY.md:466-644"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:## 21. Phase 14 — Reference-Locked Origami Chat",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-origami-chat-reconstruction.md"
      },
      "id": "TGT-026",
      "implementationState": "PLANNED",
      "interfaces": [
        "isolated Chat asset workbench",
        "existing semantic DOM/component mapping",
        "deterministic target state",
        "full/region visual comparison"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [],
      "sourceRefs": [
        "ORIGAMI",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "tracked implementation assets allowed by the exact plan",
        "ignored reference/diff evidence",
        "existing chat data unchanged"
      ],
      "trustBoundary": "Private reference media remains local; decorative assets do not replace semantics; all existing chat behavior/accessibility and unrelated routes are preserved."
    },
    {
      "architectureId": "TGT-027",
      "canonicalOwner": "Committed MonoChrome plan MC0A-MC10",
      "concern": "MonoChrome appearance and isolated native verification",
      "consumers": [
        "appearance picker/commands",
        "app shell/primitives/routes",
        "detached/native windows",
        "visual/accessibility/native tests"
      ],
      "cutover": "MC0B freezes stable upstream/B0 and exact manifests; MC1-MC7 implement; MC8 measures only from the exact video; MC9 verifies; MC10 reviews/handoffs. Missing video blocks only measured calibration/fidelity.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:444-1645"
      ],
      "externalGate": "Screen Recording 2026-07-16 220632(1).mp4 is absent; only MC8 measured calibration and final video-fidelity evidence are BLOCKED_EXTERNAL.",
      "fileOwnership": {
        "kind": "EXACT_COMMITTED_MANIFEST",
        "refs": [
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 7. Tasks MC0A/MC0B: Read-Only Inventory, Stabilization, and Baselines",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 8. Task MC1: Canonical Theme Contract and Store v5 Migration",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 9. Task MC2: First Paint, Detached Sync, and Selection Surfaces",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 10. Task MC3: Scoped Tokens, CSS Layer, and xterm Palette",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 11. Task MC4: Primitive Audit and Development-Only Workbench",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 12. Task MC5: App Shell, Navigation, and Overlays",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 13. Task MC6: Freeze the Final Route and Component Manifest",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 14. Task MC7: Route Styling Lanes",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 15. Tasks MC8A/MC8B: Reference Artifacts and Measured Calibration",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 16. Task MC9: Deterministic Visual, Functional, and Quality System",
          "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 17. Task MC10: Independent Review, Documentation, and Draft-PR Handoff"
        ]
      },
      "id": "TGT-027",
      "implementationState": "PLANNED",
      "interfaces": [
        "generated theme contract",
        "store v5 migrate/merge",
        "CSP-safe prepaint",
        "strict detached sync",
        "html[data-theme='monochrome']",
        "terminal theme resolver",
        "isolated monochrome-test runtime profile"
      ],
      "migrationIds": [
        "MIG-005"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-005",
        "RBK-010"
      ],
      "sourceRefs": [
        "MC",
        "AUTH"
      ],
      "status": "PLANNED",
      "storage": [
        "UI preference v5 only",
        "tracked synthetic B0 oracle",
        "ignored visual/native evidence",
        "disposable native test profile"
      ],
      "trustBoundary": "Only selectable Light is replaced; other themes, Origami, routes, behavior, data, remote pages, terminal ANSI/user palettes, Pixel Pet transparency, production native identity/profile, and production services are preserved."
    },
    {
      "architectureId": "TGT-028",
      "canonicalOwner": "Future Phase 17 exact integration plan and primary coordinator",
      "concern": "Program integration, evidence, and successor draft PR",
      "consumers": [
        "independent reviewers",
        "user handoff",
        "GitHub checks",
        "future production decision"
      ],
      "cutover": "Create the final-integration plan after Sakura Phase 16 and every other locally actionable predecessor complete or reach an exact hard gate.",
      "evidenceRefs": [
        "docs/unified-goals/EXECUTION_PLAN.md:Phase 17 final integration"
      ],
      "fileOwnership": {
        "authorityRef": "docs/unified-goals/EXECUTION_PLAN.md:PLN-020 Phase 17 final integration",
        "kind": "DEFERRED_EXACT_PLAN_REQUIRED",
        "planToCreate": "docs/superpowers/plans/2026-07-16-vibespace-final-integration.md"
      },
      "id": "TGT-028",
      "implementationState": "PLANNED",
      "interfaces": [
        "full test/security/performance/accessibility matrix",
        "LOCAL_TEST_HANDOFF one-file boundary",
        "three-ledger evidence closeout",
        "successor draft PR"
      ],
      "migrationIds": [
        "MIG-001",
        "MIG-002",
        "MIG-003",
        "MIG-004",
        "MIG-005",
        "MIG-006",
        "MIG-007"
      ],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-001",
        "RBK-002",
        "RBK-003",
        "RBK-004",
        "RBK-005",
        "RBK-006",
        "RBK-007",
        "RBK-008",
        "RBK-009",
        "RBK-010",
        "RBK-011"
      ],
      "sourceRefs": [
        "DIR",
        "AUTH"
      ],
      "status": "PLANNED",
      "storage": [
        "tracked handoff/evidence docs",
        "local ignored evidence",
        "remote successor branch and draft PR"
      ],
      "trustBoundary": "No production deploy, main merge, release, force push, live charge, destructive real-data operation, or unsupported success claim; protected branch/process/profile/installer state stays untouched."
    },
    {
      "architectureId": "TGT-029",
      "canonicalOwner": "Phase 16 Sakura implementation coordinator",
      "concern": "Reference-locked Sakura fifth-theme appearance",
      "consumers": [
        "all VibeSpace routes and detached windows",
        "theme registry, persistence, startup, sync, and commands",
        "isolated browser and Windows native verification"
      ],
      "cutover": "After accepted MonoChrome, add opt-in Sakura through the canonical theme contract and scoped scene host; preserve all prior themes and behavior.",
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-17-vibespace-sakura-appearance.md@c4a48e1f09850af0c1db1b2f097234c243f38daa",
        "SAK-001..SAK-050"
      ],
      "fileOwnership": {
        "authorityRef": "docs/superpowers/plans/2026-07-17-vibespace-sakura-appearance.md",
        "kind": "COMMITTED_EXACT_PLAN",
        "planCommit": "c4a48e1f09850af0c1db1b2f097234c243f38daa"
      },
      "id": "TGT-029",
      "implementationState": "PLANNED",
      "interfaces": [
        "canonical theme ID sakura",
        "html[data-theme='sakura'] scoped tokens and scene host",
        "route and native appearance manifests",
        "deterministic visual and functional evidence"
      ],
      "migrationIds": [],
      "observationClass": "TARGET",
      "rollbackIds": [
        "RBK-011"
      ],
      "sourceRefs": [
        "GOAL_SAKURA",
        "SAKURA_STYLE_SPEC"
      ],
      "status": "PLANNED",
      "storage": [
        "existing UI preference store only",
        "no database or backend schema",
        "isolated local visual/native evidence"
      ],
      "trustBoundary": "Sakura is migration-free and opt-in; its CSS, SVG, scene, and motion stay app-owned and scoped away from user content, terminal ANSI, remote providers, prior themes, production profiles, and production services."
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
