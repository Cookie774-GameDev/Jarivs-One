---
artifactId: 'ROLLBACK_PLAN'
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
maintenanceTriggers: ['GIT_BASELINE', 'GOAL_SAKURA', 'ROLLBACK_PLAN', 'SAK', 'TASK0R-20260718-B']
---

# Rollback Plan

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "ROLLBACK_PLAN",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "ROLLBACK_PLAN",
    "SAK",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "boundary": "Account-scope integration can be disabled only by a reviewed compatibility change; never restore local-unassigned or permit an old account lifecycle to resume.",
      "command": "npm --prefix app test -- src/lib/accountIdentity.test.ts src/App.accountIdentity.test.tsx src/lib/cloudSyncQueueOwner.test.ts src/features/all-about-me/persistence.test.ts",
      "evidenceRefs": [
        "commit:98c7304145a656205e96493b0d85018a53e27a9b",
        "commit:e2fdfa0a208186b2a6afe3709c25c4600e68100b",
        "focused persistence migration PASS 11/11"
      ],
      "forwardRepair": "Quiesce the stale lifecycle, preserve the newest row, and replay the exact current-account operation after ownership readback.",
      "migrationIds": ["MIG-001"],
      "nonDestructive": true,
      "requirementIds": ["SIK-001", "SIK-007", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-001",
      "state": "PASS",
      "testIds": ["TST-1A-001", "TST-1B-001", "TST-1B-003"],
      "userDataPreservation": "Retain localUserId, account-keyed profiles, newest-write ordering, sync queue ownership and unrelated settings."
    },
    {
      "boundary": "Disable canonical v3 readers/writers behind the kernel activation gate while leaving the additive schema and all rows intact.",
      "command": "npm --prefix app test -- src/lib/db/index.migration.test.ts src/lib/db/jarvisRepositories.test.ts",
      "evidenceRefs": [],
      "forwardRepair": "Repair malformed v3 rows or repository code in a later version, rerun migration/readback tests, then re-enable the cutover.",
      "migrationIds": ["MIG-002"],
      "nonDestructive": true,
      "requirementIds": ["SIK-007", "SIK-008", "SIK-009", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-002",
      "state": "PLANNED",
      "testIds": ["TST-MIG-002"],
      "userDataPreservation": "Never downgrade/delete IndexedDB stores or enqueue private v3 rows for generic sync; legacy v1/v2 tables remain readable."
    },
    {
      "boundary": "A committed immutable v3 profile migration marker is not reversed. Kernel cutover may return to a legacy projection, but protected policy is never copied back into a mutable prompt.",
      "command": "npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts",
      "evidenceRefs": [],
      "forwardRepair": "Resolve a migration_conflict through a new reviewed migration version that retains both the prior marker and current profile revision evidence.",
      "migrationIds": ["MIG-003"],
      "nonDestructive": true,
      "requirementIds": ["SIK-001", "SIK-007", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-003",
      "state": "PLANNED",
      "testIds": ["TST-MIG-003"],
      "userDataPreservation": "Preserve custom instructions, provenance, later revisions and source hashes; never rehydrate secret or immutable identity text into editable state."
    },
    {
      "boundary": "Disable affected account-scoped v2 connections; every legacy unscoped entry remains unclaimed and disconnected until explicit human reconnection. Do not migrate, print, delete, or synthesize credential material.",
      "command": "npm --prefix app test -- src/features/plugins/store.test.ts src/features/plugins/credentialAuthorization.test.ts src/features/plugins/runtime.test.ts src/lib/jarvis/actions/catalog.test.ts",
      "evidenceRefs": [],
      "forwardRepair": "Publish a new metadata version and repeat exact locator validation; re-enable only after registration/readback tests pass.",
      "migrationIds": ["MIG-004"],
      "nonDestructive": true,
      "requirementIds": ["SIK-008", "SIK-010", "SIK-011", "SIK-013", "SIK-014"],
      "rollbackId": "RBK-004",
      "state": "PLANNED",
      "testIds": ["TST-MIG-004", "TST-SEC-001"],
      "userDataPreservation": "Keep non-secret connection metadata and external keyring entries; delete neither automatically."
    },
    {
      "boundary": "Remove the MonoChrome CSS import/selection surface and map a persisted monochrome value to Default; keep store v5 and all unrelated UI state.",
      "command": "npm --prefix app test -- src/features/appearance/themeContract.test.ts src/features/appearance/themes.test.ts src/stores/ui.themePersistence.test.ts src/features/appearance/themeSync.test.ts",
      "evidenceRefs": [],
      "forwardRepair": "Fix the canonical theme data/CSS in a new commit, then re-enable MonoChrome after all theme, route, visual, accessibility and native gates pass.",
      "migrationIds": ["MIG-005"],
      "nonDestructive": true,
      "requirementIds": ["MC-004", "MC-006", "MC-007", "MC-008", "MC-022", "MC-023", "MC-032"],
      "rollbackId": "RBK-005",
      "state": "PLANNED",
      "testIds": ["TST-MIG-005", "TST-MC-REG-001"],
      "userDataPreservation": "Only the theme preference changes; user content, terminal palettes, route state, Origami and other theme assets remain intact."
    },
    {
      "boundary": "Only local/staging Supabase and Stripe test objects are in scope. Applied migrations are never edited or destructively reversed; production changes remain a hard gate.",
      "command": "supabase db reset --local && supabase test db",
      "evidenceRefs": [],
      "forwardRepair": "Add a new migration/function/policy that restores the intended behavior, verify RLS with owner/other/anonymous roles, and reconcile only Stripe test objects.",
      "migrationIds": ["MIG-006"],
      "nonDestructive": true,
      "requirementIds": ["SIK-012", "SIK-013", "SIK-016"],
      "rollbackId": "RBK-006",
      "state": "PLANNED",
      "testIds": ["TST-MIG-006", "TST-SEC-009", "TST-SEC-010"],
      "userDataPreservation": "Preserve tenant/subscription rows and production state; local reset operates only on the disposable local project."
    },
    {
      "boundary": "Switch presentation/consumers back to compatibility projections while retaining canonical immutable runs/events and preventing new dispatch through legacy paths.",
      "command": "npm --prefix app test -- src/lib/jarvis/executionJournal src/features/schedule src/lib/ai/stacks",
      "evidenceRefs": [],
      "forwardRepair": "Regenerate projections from canonical events or correct the projection adapter; never mutate immutable event history or replay an uncertain external effect.",
      "migrationIds": ["MIG-007"],
      "nonDestructive": true,
      "requirementIds": ["SIK-007", "SIK-009", "SIK-014", "SIK-015"],
      "rollbackId": "RBK-007",
      "state": "PLANNED",
      "testIds": ["TST-MIG-007", "TST-KRN-002", "TST-STRESS-002"],
      "userDataPreservation": "Retain messages, chats, run IDs, event sequence, artifacts and truthful terminal state; no duplicate dispatch."
    },
    {
      "boundary": "The kernel smoke helper may stop only its exact PID/nonce-bound descendants and remove only the canonical profile proven inside its dedicated smoke-profile base.",
      "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shared-intelligence-kernel-smoke.ps1 -Scenarios @('voice_turn_stop')",
      "evidenceRefs": ["GIT-005", "GIT-006"],
      "forwardRepair": "If ownership is ambiguous, leave the process/profile untouched and record the exact external blocker rather than broad cleanup.",
      "migrationIds": [],
      "nonDestructive": true,
      "requirementIds": ["AUTH-001", "DIR-001", "SIK-014", "SIK-015"],
      "rollbackId": "RBK-008",
      "state": "PLANNED",
      "testIds": ["TST-GIT-001", "TST-NATIVE-001"],
      "userDataPreservation": "Never stop protected listeners, never use the real VibeSpace app-data directory, and never clear the user's browser profile."
    },
    {
      "boundary": "Revert coherent successor-branch commits or disable feature flags; do not reset, force-push reviewed history, merge main, or stage the protected installer deletion.",
      "command": "git diff --cached --name-only && git status --short && git log --oneline --decorate -n 30",
      "evidenceRefs": ["GIT-003", "GIT-004", "GIT-007"],
      "forwardRepair": "Prefer a new corrective commit on the successor branch with exact tests and review; retain local safety refs and draft-PR history.",
      "migrationIds": [],
      "nonDestructive": true,
      "requirementIds": ["AUTH-001", "DIR-001"],
      "rollbackId": "RBK-009",
      "state": "IMPLEMENTING",
      "testIds": ["TST-0R-003", "TST-GIT-001"],
      "userDataPreservation": "Preserve the unrelated grok-workbench-pr25-v2 branch/worktree, every other worktree, user dirty state, local commits and app data."
    },
    {
      "boundary": "The MonoChrome native helper may stop only its session-owned PID descendants and remove only .artifacts/monochrome/<session>/native/profile after exact PID/port/path ownership readback.",
      "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/visual-monochrome/native-session.ps1 -ValidateOnly",
      "evidenceRefs": ["GIT-005", "GIT-006"],
      "forwardRepair": "If MonoChrome ownership is ambiguous, preserve the process/profile and rerun on a newly selected helper session rather than broad cleanup.",
      "migrationIds": [],
      "nonDestructive": true,
      "requirementIds": ["AUTH-001", "DIR-001", "MC-038", "MC-041"],
      "rollbackId": "RBK-010",
      "state": "PLANNED",
      "testIds": ["TST-GIT-001", "TST-NATIVE-002"],
      "userDataPreservation": "Never stop protected listeners, never touch the real VibeSpace app-data/profile, and never remove anything outside the helper's exact session directory."
    },
    {
      "boundary": "Remove only Sakura registry/host/CSS/assets and map a persisted sakura value to default.",
      "command": "Use a reviewed successor-branch revert limited to the exact Sakura implementation manifest; do not delete user storage.",
      "evidenceRefs": ["docs/superpowers/plans/2026-07-17-vibespace-sakura-appearance.md:rollback"],
      "forwardRepair": "Restore Sakura only through a reviewed additive appearance change after the defect is fixed.",
      "migrationIds": [],
      "nonDestructive": true,
      "requirementIds": ["SAK-004", "SAK-005", "SAK-038", "SAK-045"],
      "rollbackId": "RBK-011",
      "state": "PLANNED",
      "testIds": ["TST-PLAN-SAK"],
      "userDataPreservation": "Preserve all user data, unrelated appearance state, routes, native state, provider profiles, and product behavior."
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
