---
artifactId: 'MIGRATION_PLAN'
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
maintenanceTriggers: ['GIT_BASELINE', 'GOAL_SAKURA', 'MIGRATION_PLAN', 'SAK', 'TASK0R-20260718-B']
---

# Migration Plan

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "MIGRATION_PLAN",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "MIGRATION_PLAN",
    "SAK",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "additive": true,
      "evidenceRefs": [
        "commit:98c7304145a656205e96493b0d85018a53e27a9b",
        "commit:e2fdfa0a208186b2a6afe3709c25c4600e68100b",
        "focused persistence migration PASS 11/11"
      ],
      "forwardRepair": "On stale or conflicting ownership, preserve the newest valid profile, reject the stale claim, quiesce the old lifecycle and retry only under the current durable account claim.",
      "fromVersion": "legacy unscoped/local profile payload",
      "idempotent": true,
      "migrationId": "MIG-001",
      "preservationContract": "Profile content, newest-write ordering, local identity and unrelated settings survive; no payload is copied across accounts and no local-unassigned owner is created.",
      "requirementIds": ["SIK-001", "SIK-007", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-001",
      "state": "PASS",
      "taskIds": ["Task 1B"],
      "testIds": ["TST-1B-001", "TST-1B-003"],
      "toVersion": "durable explicit AccountIdentity ownership and serialized account lifecycle"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "Leave v3 stores intact, disable canonical writers with the cutover flag, repair only malformed new rows, then re-enable after migration and repository tests pass.",
      "fromVersion": "JarvisDexie v2",
      "idempotent": true,
      "migrationId": "MIG-002",
      "preservationContract": "Replay version 1 and 2 schemas exactly, retain every prior table/index and row, then add the six typed local-only kernel stores and required indexes without enqueueing them for sync.",
      "requirementIds": ["SIK-007", "SIK-008", "SIK-009", "SIK-010", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-002",
      "state": "PLANNED",
      "taskIds": ["Task 7"],
      "testIds": ["TST-MIG-002"],
      "toVersion": "JarvisDexie v3 additive kernel stores"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "A matching marker is a no-op; a conflicting account, identity version, source, or source hash fails closed as migration_conflict and requires an explicit reviewed repair rather than overwrite.",
      "fromVersion": "legacy built-in JARVIS agent prompt and no v3 account profile marker",
      "idempotent": true,
      "migrationId": "MIG-003",
      "preservationContract": "Within one account-scoped transaction, preserve allowed custom instructions and provenance, record only a source prompt hash for a known legacy prompt, never expose immutable identity text, and never replace a later valid profile revision.",
      "requirementIds": ["SIK-001", "SIK-007", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-003",
      "state": "PLANNED",
      "taskIds": ["Task 8", "Task 9", "Task 10"],
      "testIds": ["TST-MIG-003"],
      "toVersion": "account-scoped protected JARVIS profile/revision with immutable migration v3 marker"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "Accept only already-accounted v2 rows. Leave every legacy unscoped entry unclaimed and disconnected until the active human explicitly reconnects it under the current account; never infer ownership from boot order.",
      "fromVersion": "legacy unscoped plugin connection entries plus already-accounted v2 rows",
      "idempotent": true,
      "migrationId": "MIG-004",
      "preservationContract": "Preserve legacy unscoped entries without adopting or activating them; preserve already-accounted v2 rows under their exact account; never migrate secret values or infer a credential grant from legacy metadata.",
      "requirementIds": ["SIK-008", "SIK-010", "SIK-011", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-004",
      "state": "PLANNED",
      "taskIds": ["Task 19A"],
      "testIds": ["TST-MIG-004", "TST-SEC-001"],
      "toVersion": "jarvis-plugin-connections-v2 typed account-scoped metadata"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "Always-on hydration validation canonicalizes a malformed current-version value; a rollback build maps persisted monochrome to Default without deleting unrelated UI state.",
      "fromVersion": "UI persisted store v4 with Default/VibeSpace/Jarvis Core/Light plus historical dark/system values",
      "idempotent": true,
      "migrationId": "MIG-005",
      "preservationContract": "Clone record-like v4 state and change only theme: Light becomes MonoChrome; dark, system, unknown and malformed storage become Default; every unrelated UI field and all user content remain byte/structurally equal.",
      "requirementIds": ["MC-001", "MC-004", "MC-005", "MC-006", "MC-007", "MC-008", "MC-032"],
      "rollbackId": "RBK-005",
      "state": "PLANNED",
      "taskIds": ["MC1", "MC2"],
      "testIds": ["TST-MIG-005"],
      "toVersion": "UI persisted store v5 with MonoChrome and no selectable Light"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "Apply a new versioned migration/RPC/policy that repairs forward; never rewrite an already-applied migration or delete tenant rows to simulate rollback.",
      "fromVersion": "current staging access/subscription schema at phase-start inventory",
      "idempotent": true,
      "migrationId": "MIG-006",
      "preservationContract": "Use additive columns/tables/functions and explicit defaults; preserve existing tenants, subscriptions and RLS; execute only against the authorized local/staging Supabase project and Stripe test mode.",
      "requirementIds": ["SIK-012", "SIK-013", "SIK-016"],
      "rollbackId": "RBK-006",
      "state": "PLANNED",
      "taskIds": ["Access phase", "Subscription phase"],
      "testIds": ["TST-MIG-006", "TST-SEC-009", "TST-SEC-010"],
      "toVersion": "versioned server-authoritative entitlement and billing-test schema"
    },
    {
      "additive": true,
      "evidenceRefs": [],
      "forwardRepair": "Keep legacy projections readable while the canonical journal is authoritative; repair projection code and regenerate derived views without mutating immutable events.",
      "fromVersion": "legacy run, task, schedule and message execution projections",
      "idempotent": true,
      "migrationId": "MIG-007",
      "preservationContract": "Allocate caller-stable run IDs before dispatch, append immutable events in sequence, retain legacy-compatible projections, and never infer completion from a dispatch record.",
      "requirementIds": ["SIK-007", "SIK-009", "SIK-014", "SIK-015"],
      "rollbackId": "RBK-007",
      "state": "PLANNED",
      "taskIds": ["Task 14", "Task 16A", "Task 16B", "Task 17", "Task 18", "Task 21B"],
      "testIds": ["TST-MIG-007", "TST-KRN-002"],
      "toVersion": "canonical run/event journal with compatibility projections"
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
