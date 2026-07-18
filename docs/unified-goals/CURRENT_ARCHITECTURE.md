---
artifactId: 'CURRENT_ARCHITECTURE'
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
  ['CURRENT_ARCHITECTURE', 'GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'TASK0R-20260718-B']
---

# Current Architecture

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "CURRENT_ARCHITECTURE",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "CURRENT_ARCHITECTURE",
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "architectureId": "CUR-001",
      "canonicalOwner": "app/src/App.tsx",
      "concern": "Application bootstrap and runtime composition",
      "consumers": [
        "typed chat",
        "voice",
        "scheduled JARVIS",
        "task-run notifications",
        "memory learning",
        "operator listener"
      ],
      "cutover": "Task 13P later mounts persistence/protected-agent resolution; Tasks 16W, 16A, and 16B replace ad hoc composition with one trusted kernel host and canonical runtime gate.",
      "evidenceLimit": "The source proves current wiring only; it does not prove the target kernel host exists.",
      "evidenceRefs": [
        "app/src/App.tsx:283-752"
      ],
      "id": "CUR-001",
      "implementationState": "IMPLEMENTING",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16W: One Trusted Kernel Host Across Webviews",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch"
      ],
      "interfaces": [
        "openDb",
        "startRuntimeListener",
        "startJarvisScheduleRunner",
        "startJarvisResponsePolicyListener",
        "startJarvisOperatorListener"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/App.tsx:283-752"
      ],
      "sourceRefs": [
        "REPO_HEAD"
      ],
      "status": "IMPLEMENTING",
      "storage": [
        "Dexie singleton",
        "Zustand stores",
        "Supabase-backed optional sync"
      ],
      "trustBoundary": "The root host sequences database boot, account readiness, account-scoped listeners, cloud-sync authority, and UI runtime listeners."
    },
    {
      "architectureId": "CUR-002",
      "canonicalOwner": "app/src/lib/accountIdentity.ts",
      "concern": "Canonical account identity resolver",
      "consumers": [
        "App account lifecycle",
        "accepted Task 1B account-scoped stores and sync authority"
      ],
      "cutover": "Tasks 7-9 and 13P must consume this identity explicitly and may not add local-unassigned.",
      "evidenceLimit": "PASS is restricted to the accepted Task 1A resolver atoms and Task 1B's separately accepted integration scope.",
      "evidenceRefs": [
        "app/src/lib/accountIdentity.ts:3-52",
        "app/src/App.tsx:314-702"
      ],
      "id": "CUR-002",
      "implementationState": "PASS",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 1: Canonical Account Identity",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock"
      ],
      "interfaces": [
        "resolveAccountIdentity",
        "requireAccountIdentity",
        "getActiveAccountIdentity",
        "AccountIdentityNotReadyError"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/accountIdentity.ts:3-52",
        "app/src/App.tsx:62-75",
        "app/src/App.tsx:314-702"
      ],
      "sourceRefs": [
        "REPO_HEAD"
      ],
      "status": "PASS",
      "storage": [
        "auth store cloudSession",
        "auth store localUserId"
      ],
      "trustBoundary": "An authenticated Supabase user ID wins; otherwise a non-empty durable local user ID is used; unavailable identity returns null or throws."
    },
    {
      "architectureId": "CUR-003",
      "canonicalOwner": "app/src/lib/jarvis/identity.ts and app/src/lib/jarvis/profiles/types.ts",
      "concern": "Protected JARVIS identity and profile contracts",
      "consumers": [
        "current tests",
        "future envelope builder",
        "future typed/voice/schedule/Hive consumers"
      ],
      "cutover": "Task 2's exact four protected identity/profile atoms are accepted. Tasks 10 and 13P still connect built-in resolution and persistence; Task 16B activates production consumption.",
      "evidenceLimit": "PASS is restricted to the exact four Task 2 atoms at implementation commit fd0cf3cb71f552884a3eeff0de45207ef13f3f4d, freshly reviewed at revision 56d669f60b0eb93309f332ed700d9b0f4b0b82ee: focused tests PASS 28/28, app typecheck PASS, reviewer /root/monochrome_plan_final_gate PASS, report SHA-256 4533FFEF08FABC763DA2B87F16398E4A9B80C004A1B150E0D7B09E169DE61263. No downstream persistence, compiler, or consumer cutover is implied.",
      "evidenceRefs": [
        "app/src/lib/jarvis/identity.ts:3-154",
        "app/src/lib/jarvis/profiles/types.ts:1-36",
        "docs/unified-goals/EXECUTION_PLAN.md:249-257",
        "docs/unified-goals/TEST_MATRIX.md:147-164"
      ],
      "id": "CUR-003",
      "implementationState": "PASS",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 2: Protected JARVIS Identity and Profile Contracts - implementation landed, review pending",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 13P: Mount Account Persistence and Protected-Agent Resolution"
      ],
      "interfaces": [
        "JarvisIdentityRevision",
        "JarvisIdentitySnapshot",
        "JarvisDeliveryPolicy",
        "isProtectedJarvisAgent",
        "JarvisProfile",
        "JarvisProfileSnapshot"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/jarvis/identity.ts:3-154",
        "app/src/lib/jarvis/profiles/types.ts:1-36"
      ],
      "sourceRefs": [
        "REPO_HEAD"
      ],
      "status": "PASS",
      "storage": [
        "contracts only at this baseline; Task 7-9 persistence is not yet present"
      ],
      "trustBoundary": "The policy text declares JARVIS-only identity, immutable revision authority, lower-authority profile/memory/context layers, exact approval truth, structured-content preservation, and validated speech."
    },
    {
      "architectureId": "CUR-004",
      "canonicalOwner": "app/src/lib/jarvis/contracts/",
      "concern": "Version-1 kernel domain contracts and validators",
      "consumers": [
        "contract tests",
        "future compiler",
        "future journal",
        "future approvals/artifacts",
        "future Command Center"
      ],
      "cutover": "Tasks 7-9, 11-20C, 16B, 21A, 17, and 21B turn these types into persisted canonical behavior.",
      "evidenceLimit": "PASS is restricted to Task 3's accepted contract-purity and validator scope; production producers/consumers are not thereby accepted.",
      "evidenceRefs": [
        "app/src/lib/jarvis/contracts/",
        "d9bb11de3ff54472748999b07c678197383c52b4"
      ],
      "id": "CUR-004",
      "implementationState": "PASS",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 3: Core Kernel Domain Contracts and Validators"
      ],
      "interfaces": [
        "JarvisRequestEnvelope",
        "JarvisResponseEnvelope",
        "JarvisRun",
        "JarvisEvent",
        "JarvisApproval",
        "JarvisArtifact",
        "JarvisSourceRef",
        "JarvisContextPack",
        "JarvisCapabilitySnapshot",
        "JarvisModelSnapshot",
        "validateJarvis*"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/jarvis/contracts/request.ts:1-30",
        "app/src/lib/jarvis/contracts/response.ts:1-55",
        "app/src/lib/jarvis/contracts/execution.ts:1-91",
        "app/src/lib/jarvis/contracts/source.ts:1-48",
        "app/src/lib/jarvis/contracts/capability.ts:1-34",
        "app/src/lib/jarvis/contracts/validators.ts:1310-1370"
      ],
      "sourceRefs": [
        "REPO_HEAD"
      ],
      "status": "PASS",
      "storage": [
        "TypeScript contracts only; no canonical v3 repositories at this baseline"
      ],
      "trustBoundary": "Requests carry account, identity/profile, capability/model, context, output, and time snapshots; sources carry trust and sensitivity; response state distinguishes display, speech, sources, and artifact IDs."
    },
    {
      "architectureId": "CUR-005",
      "canonicalOwner": "No single production owner at this baseline",
      "concern": "Prompt assembly and provider routing remain split",
      "consumers": [
        "typed chat",
        "external adapters",
        "native providers",
        "voice and schedule through current runtime paths"
      ],
      "cutover": "Tasks 11-13 create one envelope/compiler/transport; Tasks 16A and 16B shadow and then switch the default.",
      "evidenceLimit": "Forwarding a systemPrompt at one router boundary does not prove every adapter preserves the compiled contract.",
      "evidenceRefs": [
        "app/src/lib/ai/runtime.ts:704-1170",
        "app/src/lib/ai/router.ts:118-330",
        "app/src/lib/jarvis/promptLayers.ts:1-178"
      ],
      "id": "CUR-005",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/specs/2026-07-16-vibespace-shared-intelligence-kernel-design.md:38-78",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 11: Context, Capability, Immutable Envelope, and Retry Identity"
      ],
      "interfaces": [
        "startRuntimeListener",
        "runAgent",
        "runExternalConnection",
        "assembleJarvisPromptLayers"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/ai/runtime.ts:704-1170",
        "app/src/lib/ai/runtime.ts:1117-1120",
        "app/src/lib/ai/router.ts:118-170",
        "app/src/lib/ai/router.ts:252-330",
        "app/src/lib/jarvis/promptLayers.ts:1-178"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "chat/messages through existing repositories",
        "no immutable compiled-request repository"
      ],
      "trustBoundary": "runtime.ts builds context strings and mutates a runnable agent system_prompt; router.ts forwards an optional systemPrompt; promptLayers.ts offers a structured assembly API but is not the active canonical production compiler."
    },
    {
      "architectureId": "CUR-006",
      "canonicalOwner": "Fragmented across feature stores",
      "concern": "Parallel lifecycle and activity stores",
      "consumers": [
        "ChatActivityTimeline",
        "JarvisTaskProgressCard",
        "SchedulePage",
        "terminal UI",
        "queued-message behavior"
      ],
      "cutover": "Task 18 becomes the sole run/event authority; later tasks write canonical events and Task 20C exposes read-only compatibility projections.",
      "evidenceLimit": "Existing recovery or redaction tests do not make any one legacy store the canonical cross-surface journal.",
      "evidenceRefs": [
        "app/src/features/chat/activity/types.ts",
        "app/src/features/jarvis-runs/taskRunStore.ts",
        "app/src/features/schedule/jarvisSchedules.ts",
        "app/src/features/terminals/terminalExecutionStore.ts"
      ],
      "id": "CUR-006",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 18 — Canonical execution journal, cancellation, and recovery",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:### Task 20C — Stop legacy lifecycle writers and expose read-only projections"
      ],
      "interfaces": [
        "ChatActivityEvent",
        "JarvisTaskRun",
        "JarvisScheduleMetadata.runHistory",
        "TerminalExecution",
        "jarvis:run-state"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/chat/activity/types.ts:1-30",
        "app/src/features/jarvis-runs/taskRunStore.ts:3-45",
        "app/src/features/schedule/jarvisSchedules.ts:6-40",
        "app/src/features/terminals/terminalExecutionStore.ts:4-108",
        "app/src/lib/ai/runtime.ts:287-291"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "Zustand chat activity",
        "account-scoped task-run persistence",
        "event source_ref schedule metadata",
        "terminal execution store"
      ],
      "trustBoundary": "Each surface owns a different status vocabulary and persistence/cancellation path; no current source establishes one legal transition authority for all producers."
    },
    {
      "architectureId": "CUR-007",
      "canonicalOwner": "app/src/lib/db/ and app/src/lib/sync.ts",
      "concern": "Dexie v2 repositories and generic sync",
      "consumers": [
        "workspace/project/chat/message/agent/task repositories",
        "App cloud-sync lifecycle"
      ],
      "cutover": "Tasks 7-9 add v3 kernel tables, explicit mappers, account-scoped repositories, idempotent migration, and a no-generic-sync interlock.",
      "evidenceLimit": "Task 1B acceptance covers claim/account safety, not the still-unimplemented local-only kernel repository boundary.",
      "evidenceRefs": [
        "app/src/lib/db/schema.ts:96-185",
        "app/src/lib/db/index.ts:47-111",
        "app/src/lib/sync.ts:1-18"
      ],
      "id": "CUR-007",
      "implementationState": "IMPLEMENTING",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 7: Additive Dexie v3 Schema and Injected Database Factory",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock"
      ],
      "interfaces": [
        "JarvisDexie",
        "openDb",
        "typed repositories",
        "enqueueMutation",
        "processSyncQueue",
        "processCloudPull"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/db/schema.ts:96-185",
        "app/src/lib/db/index.ts:47-111",
        "app/src/lib/db/repositories.ts:15-16",
        "app/src/lib/db/repositories.ts:236-321",
        "app/src/lib/sync.ts:1-18",
        "app/src/lib/sync.ts:573-615"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "IMPLEMENTING",
      "storage": [
        "DB_NAME jarvis-v1",
        "DB_VERSION 2",
        "STORES_V2",
        "sync_queue",
        "settings owner records",
        "Supabase app_sync_records"
      ],
      "trustBoundary": "Accepted Task 1B code binds generic queue work to durable account claims, but repository writes still use the existing v2 tables and generic app_sync_records path."
    },
    {
      "architectureId": "CUR-008",
      "canonicalOwner": "Fragmented between action runner, approval cards, task-run bridge, and browser store",
      "concern": "Action and Browser Operator approval semantics",
      "consumers": [
        "chat action proposals",
        "plugins",
        "terminal actions",
        "browser page"
      ],
      "cutover": "Tasks 5-6 land immediate interlocks; Tasks 19A-19D add one single-use engine and canonical adapters.",
      "evidenceLimit": "A visible approval card or queued action is not verified execution completion.",
      "evidenceRefs": [
        "app/src/lib/actions/runner.ts:218-336",
        "app/src/features/browser/browserActions.ts:6-120"
      ],
      "id": "CUR-008",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 19 — Versioned approvals and canonical consequential execution"
      ],
      "interfaces": [
        "runAction",
        "ActionApprovalCard",
        "approvalBridge",
        "requestBrowserTool",
        "executeBrowserTool"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/actions/runner.ts:218-336",
        "app/src/features/chat/ActionApprovalCard.tsx:1-90",
        "app/src/features/jarvis-runs/approvalBridge.ts:1-89",
        "app/src/features/browser/browserActions.ts:6-120"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "UI/card state",
        "JarvisTaskRun store",
        "browser pending-action store"
      ],
      "trustBoundary": "The action runner deduplicates only in-flight keys; browser behavior derives approval from tab control mode and risk, and safe paths can execute directly. Neither is the planned durable account/run/action/version/params-hash engine."
    },
    {
      "architectureId": "CUR-009",
      "canonicalOwner": "app/src/features/voice/streamingVoice.ts",
      "concern": "Streaming speech consumes incremental response text",
      "consumers": [
        "AI runtime voice replies",
        "Kokoro or configured speech engine"
      ],
      "cutover": "Task 15 prepares preview/speech gates; Task 21A binds voice to the canonical kernel and verified response settlement.",
      "evidenceLimit": "Current cleanup is not evidence that raw provider deltas can never reach TTS.",
      "evidenceRefs": [
        "app/src/features/voice/streamingVoice.ts:1-137",
        "app/src/lib/ai/runtime.ts:1131-1169"
      ],
      "id": "CUR-009",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 15: Preview and Speech Gate Preparation Only",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21A: Voice-Session Binding Through the Canonical Kernel"
      ],
      "interfaces": [
        "StreamingVoiceSession.onDelta",
        "StreamingVoiceSession.onComplete",
        "createStreamingVoiceSession"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/voice/streamingVoice.ts:1-137",
        "app/src/lib/ai/runtime.ts:1131-1169"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "ephemeral speech queue and voice session"
      ],
      "trustBoundary": "Incremental text cleanup and voice-session liveness gate speech, but the current stream API receives accumulated provider text before the target JarvisResponseEnvelope speech gate exists."
    },
    {
      "architectureId": "CUR-010",
      "canonicalOwner": "app/src/features/context/tree.ts",
      "concern": "Context scanning admits dot-env candidates",
      "consumers": [
        "Context page",
        "AI context attachments",
        "terminal context"
      ],
      "cutover": "Task 4 is the immediate pre-kernel interlock; Phase 4 later adds a complete deny-by-default local-source policy.",
      "evidenceLimit": "This is a source-observed unsafe admission rule, not a claim that any secret was read in this run.",
      "evidenceRefs": [
        "app/src/features/context/tree.ts:639-732"
      ],
      "id": "CUR-010",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 4: Immediate Context Secret Interlock",
        "docs/unified-goals/EXECUTION_PLAN.md:## 11. Phase 4 — Context Map 2.0 and Local Second Brain"
      ],
      "interfaces": [
        "scanProjectFiles",
        "isPopularTextFile candidate selection",
        "context tree generation"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/context/tree.ts:639-732"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "local context map data and derived summaries"
      ],
      "trustBoundary": "The current scanner explicitly admits basenames beginning with .env, conflicting with the kernel's fail-closed secret-source rule."
    },
    {
      "architectureId": "CUR-011",
      "canonicalOwner": "app/src/lib/entitlements.ts with auth/profile synchronization in app/src/App.tsx",
      "concern": "Entitlement display mirror and client admin configuration",
      "consumers": [
        "plans/settings UI",
        "hosted-model and voice gates",
        "wallpaper and feature policies"
      ],
      "cutover": "Task 5 removes production client authority; Phase 13 implements and tests the complete server-authoritative access model in staging/test mode.",
      "evidenceLimit": "Existing server-side comments do not prove every client bypass is removed or Phase 13 acceptance.",
      "evidenceRefs": [
        "app/src/lib/entitlements.ts:1-18",
        "app/src/lib/entitlements.ts:307-351",
        "app/src/App.tsx:183-212"
      ],
      "id": "CUR-011",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 5: Client Entitlement Interlock",
        "docs/unified-goals/EXECUTION_PLAN.md:## 20. Phase 13 — VibeSpace Access, Supabase, and Stripe Test Mode"
      ],
      "interfaces": [
        "PlanDef",
        "isAdminIdentity",
        "effectivePlan",
        "planAllowsJarvisCall",
        "syncPlanFromProfile"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/lib/entitlements.ts:1-18",
        "app/src/lib/entitlements.ts:307-351",
        "app/src/App.tsx:183-212"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "auth store plan mirror",
        "Supabase profiles.tier",
        "server metering outside this client"
      ],
      "trustBoundary": "The module documents the client plan as a UI mirror and server metering as authoritative, but still computes admin-related behavior from build/runtime configuration and identity fields."
    },
    {
      "architectureId": "CUR-012",
      "canonicalOwner": "app/src/features/chat/ChatThread.tsx",
      "concern": "Chat surface composes multiple legacy projections",
      "consumers": [
        "ChatView",
        "compact/pet thread",
        "future Origami Chat"
      ],
      "cutover": "Task 20C supplies compatibility projections; Task 21B receives only an account-bound read/retry/cancel host port; Unified Phases 2-3 expand response behavior and the full Command Center.",
      "evidenceLimit": "The current chat dashboard is not the target Command Center and must not be described as one.",
      "evidenceRefs": [
        "app/src/features/chat/ChatThread.tsx:1-141",
        "app/src/features/chat/ChatView.tsx:1-103"
      ],
      "id": "CUR-012",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 21B — Command Center lower shell",
        "docs/unified-goals/EXECUTION_PLAN.md:## 10. Phase 3 — JARVIS Command Center"
      ],
      "interfaces": [
        "ChatActivityTimeline",
        "ChatAgentActivityPanel",
        "JarvisTaskProgressCard",
        "JarvisMemoryStatus",
        "MessageBubble"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/chat/ChatThread.tsx:1-141",
        "app/src/features/chat/ChatView.tsx:1-103"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "SIK"
      ],
      "status": "PLANNED",
      "storage": [
        "message repository",
        "activity store",
        "task-run store",
        "memory store"
      ],
      "trustBoundary": "The UI renders useful state from several stores, but there is no baseline source proving a live normalized Command Center read port or canonical Outputs/Live Systems selectors."
    },
    {
      "architectureId": "CUR-013",
      "canonicalOwner": "app/src/features/appearance/themes.ts and app/src/stores/ui.ts",
      "concern": "Selectable Light theme and version-4 UI persistence",
      "consumers": [
        "Appearance",
        "commands/actions",
        "app shell",
        "detached windows",
        "terminal palette"
      ],
      "cutover": "MonoChrome MC1-MC3 replace Light through one generated contract, store v5 migrate/merge, prepaint, strict sync, scoped CSS, and terminal precedence.",
      "evidenceLimit": "Goal 8 is authorized but no MonoChrome product edit has landed at this baseline.",
      "evidenceRefs": [
        "app/src/features/appearance/themes.ts:1-47",
        "app/src/stores/ui.ts:465-541",
        "app/src/features/appearance/themeSync.ts:1-37",
        "app/index.html:1-10"
      ],
      "id": "CUR-013",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 8. Task MC1: Canonical Theme Contract and Store v5 Migration",
        "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 9. Task MC2: First Paint, Detached Sync, and Selection Surfaces"
      ],
      "interfaces": [
        "SELECTABLE_THEMES",
        "migrateThemePreference",
        "parseThemeCommandArgument",
        "resolveTheme",
        "applyThemeToDocument",
        "startThemeSync"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/appearance/themes.ts:1-47",
        "app/src/stores/ui.ts:14-30",
        "app/src/stores/ui.ts:465-541",
        "app/src/features/appearance/themeSync.ts:1-37",
        "app/index.html:1-10"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "MC"
      ],
      "status": "PLANNED",
      "storage": [
        "Zustand jarvis-ui store version 4",
        "document data-theme attributes",
        "BroadcastChannel theme messages"
      ],
      "trustBoundary": "The active registry contains light; storage migration preserves it, system can resolve to light, detached sync accepts four public IDs, and index.html begins at data-theme=dark before React."
    },
    {
      "architectureId": "CUR-014",
      "canonicalOwner": "app/src-tauri/tauri.conf.json and app/src-tauri/capabilities/*.json",
      "concern": "Production Tauri identity, windows, and capabilities",
      "consumers": [
        "main webview",
        "dictation",
        "workbench windows",
        "pet windows",
        "preview surface"
      ],
      "cutover": "MC0B freezes all production capability identifiers/hashes; MC9 adds a mutually exclusive monochrome-test override, unique identifier, disposable profile, guarded native effects, and owned-PID cleanup.",
      "evidenceLimit": "The current production configuration is an isolation baseline, not authorization to mutate production state.",
      "evidenceRefs": [
        "app/src-tauri/tauri.conf.json",
        "app/src-tauri/capabilities/default.json",
        "app/src-tauri/capabilities/workbench.json",
        "app/src-tauri/capabilities/pet-overlay.json",
        "app/src-tauri/capabilities/pet-mini-panel.json"
      ],
      "id": "CUR-014",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md:## 16. Task MC9: Deterministic Visual, Functional, and Quality System"
      ],
      "interfaces": [
        "Tauri identifier ai.jarvis.desktop",
        "main and dictation windows",
        "default",
        "workbench-window",
        "pet-overlay",
        "pet-mini-panel"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src-tauri/tauri.conf.json:1-87",
        "app/src-tauri/capabilities/default.json:1-40",
        "app/src-tauri/capabilities/workbench.json:1-30",
        "app/src-tauri/capabilities/pet-overlay.json",
        "app/src-tauri/capabilities/pet-mini-panel.json"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "MC"
      ],
      "status": "PLANNED",
      "storage": [
        "production APPDATA/keychain/launcher/updater namespaces determined by native configuration"
      ],
      "trustBoundary": "The baseline configuration is the production/native surface and must not be reused as the isolated Goal 8 test identity or profile."
    },
    {
      "architectureId": "CUR-015",
      "canonicalOwner": "No dedicated product implementation at this baseline; current chat owners are ChatView and ChatThread",
      "concern": "Origami Chat visual implementation",
      "consumers": [
        "current Chat route",
        "future reference-locked Origami surface"
      ],
      "cutover": "Unified Phase 14 first writes an exact executable plan, freezes deterministic state, then changes only the authorized Chat visual surface while preserving behavior.",
      "evidenceLimit": "No target-fidelity or Origami acceptance claim is made.",
      "evidenceRefs": [
        "app/src/features/chat/ChatView.tsx",
        "app/src/features/chat/ChatThread.tsx",
        "docs/unified-goals/EXECUTION_PLAN.md:## 21. Phase 14 — Reference-Locked Origami Chat"
      ],
      "id": "CUR-015",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/unified-goals/EXECUTION_PLAN.md:## 21. Phase 14 — Reference-Locked Origami Chat"
      ],
      "interfaces": [
        "existing MessageBubble/message-part rendering",
        "chat activity/task/memory projections"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "app/src/features/chat/ChatView.tsx:1-103",
        "app/src/features/chat/ChatThread.tsx:1-141",
        "app/src/styles/vibespace-theme.css:1"
      ],
      "sourceRefs": [
        "REPO_HEAD",
        "ORIGAMI"
      ],
      "status": "PLANNED",
      "storage": [
        "existing chat/message data only"
      ],
      "trustBoundary": "The external Origami pack is a future visual authority and its private reference media is not copied into Git. The word origami in the existing VibeSpace theme is not proof of the required Chat reconstruction."
    },
    {
      "architectureId": "CUR-016",
      "canonicalOwner": "Root AGENT_COORDINATION.md append-only ledger",
      "concern": "Coordination lock surface",
      "consumers": [
        "primary coordinator",
        "every product implementer and reviewer"
      ],
      "cutover": "Continue truthful ledger-based coordination; rediscover and record the helper only if the exact file later appears.",
      "evidenceLimit": "No lock-helper invocation or receipt is claimed.",
      "evidenceRefs": [
        "filesystem Test-Path returned false for both expected agent-lock helper paths",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:40-60"
      ],
      "id": "CUR-016",
      "implementationState": "PLANNED",
      "inferredTargetSources": [
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:## Task 0R: Directive Artifacts and Retrospective Traceability"
      ],
      "interfaces": [
        "exact literal file claims",
        "ownership transitions",
        "staged-path verification"
      ],
      "observationClass": "OBSERVED",
      "observedSources": [
        "filesystem Test-Path at evidence cutoff returned false for both expected helper paths",
        "docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md:40-60"
      ],
      "sourceRefs": [
        "POLICY",
        "COORD",
        "REPO_HEAD"
      ],
      "status": "PLANNED",
      "storage": [
        "root coordination ledger",
        "Git index for exact scope checks"
      ],
      "trustBoundary": "The committed plans require exact coordination and file non-overlap, but .agents/tools/agent-lock.mjs is absent in both the isolated worktree and root repository at the evidence cutoff."
    },
    {
      "architectureId": "CUR-017",
      "canonicalOwner": "No product implementation owner yet; Task 0R owns only source reconciliation",
      "concern": "Sakura appearance source and implementation state",
      "consumers": [
        "PLN-021",
        "DEP-050",
        "future SK0A-SK10 owners"
      ],
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-17-vibespace-sakura-appearance.md",
        "source-manifest:sakuraReferenceClosure"
      ],
      "interfaces": [
        "existing appearance registry/store",
        "app shell theme boundary",
        "Workbench visual surfaces"
      ],
      "observationClass": "OBSERVED",
      "sourceRefs": [
        "GOAL_SAKURA",
        "SAKURA_STYLE_SPEC",
        "SAKURA_PREVIEW_PNG",
        "SAKURA_STYLE_BOARD_PNG"
      ],
      "status": "PLANNED",
      "storage": [
        "existing appearance persistence; no Sakura migration or backend schema exists yet"
      ],
      "trustBoundary": "Six private reference-package files remain local and are not copied to Git; prototype behavior is contextual only."
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
