---
artifactId: 'SKILL_USAGE_EVIDENCE'
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
  ['GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'SKILL_USAGE_EVIDENCE', 'TASK0R-20260718-B']
---

# Skill Usage Evidence

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "SKILL_USAGE_EVIDENCE",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "SKILL_USAGE_EVIDENCE",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "evidenceRefs": [
        "sha256:55379FE7C1C473A02C61961C822996BFF30E1320D6921D9062509BC508482C05",
        "skill:superpowers:using-superpowers"
      ],
      "influencedActions": [
        "Established skill discovery and process-skill precedence for the main session",
        "Required relevant skill instructions to be read before governed actions"
      ],
      "invocationReason": "Route the approved program through the applicable planning, isolation, delegation, testing, debugging, verification, and design workflows.",
      "skillId": "SKL-036",
      "taskIds": [
        "PROGRAM-PROCESS"
      ],
      "usageId": "USE-001",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "path:docs/superpowers/specs/2026-07-16-vibespace-shared-intelligence-kernel-design.md",
        "sha256:E14914605F640E0841758E45D0AB2A53243B59B921F929E47921C99668F2E61D"
      ],
      "influencedActions": [
        "Reconciled the approved kernel design with the eight goal specifications",
        "Resolved planning questions through the existing user approval instead of reopening an approval gate"
      ],
      "invocationReason": "Establish intent, architecture boundaries, isolation constraints, and acceptance direction before creating implementation plans.",
      "skillId": "SKL-023",
      "taskIds": [
        "PROGRAM-PLANNING"
      ],
      "usageId": "USE-002",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "path:docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md",
        "path:docs/superpowers/plans/2026-07-16-vibespace-shared-intelligence-kernel.md",
        "path:docs/unified-goals/EXECUTION_PLAN.md",
        "sha256:272E1AF349F5062C28DC282B3E21B220D58D683A7314A10C455B7432EC91D845"
      ],
      "influencedActions": [
        "Defined exact file manifests, dependencies, TDD steps, commands, and commit gates",
        "Produced phased kernel, unified-program, and MonoChrome execution plans"
      ],
      "invocationReason": "Convert the approved multi-goal specification into executable, reviewable phases before product edits.",
      "skillId": "SKL-038",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-PLANNING"
      ],
      "usageId": "USE-003",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "branch:codex/shared-intelligence-kernel-design-20260716",
        "sha256:E2C3EC142E52868A51AF246C620CD76AB648DCF27D6900D47E6FFD07159A9794",
        "worktree:C:\\Users\\viper\\VibeSpace\\.worktrees\\shared-intelligence-kernel-design-20260716"
      ],
      "influencedActions": [
        "Kept all authorized work on the isolated successor worktree",
        "Preserved the unrelated Grok worktree, existing localhost instance, and protected installer deletion"
      ],
      "invocationReason": "Isolate the large implementation program from unrelated branches, dirty state, processes, and profiles.",
      "skillId": "SKL-035",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-ISOLATION"
      ],
      "usageId": "USE-004",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "collaboration:/root/task0r_architecture_docs",
        "collaboration:/root/task0r_skill_model_docs",
        "collaboration:/root/task0r_tool_architect",
        "sha256:F0DF13F584049059CC5619F90061405B89DCC6E28AB3F2A8517D27D99C7A46A6"
      ],
      "influencedActions": [
        "Dispatched architecture, tool, and skill-model Task 0R slices concurrently",
        "Separated independent plan and traceability reviewers from implementers"
      ],
      "invocationReason": "Run independent, non-overlapping tasks in parallel while retaining one integration owner.",
      "skillId": "SKL-025",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-PARALLELISM"
      ],
      "usageId": "USE-005",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "path:docs/unified-goals/SUBAGENT_PLAN.md",
        "sha256:41AB239A6AD1C487CD839FDAC972A8C9CF0F5E90EFA59A63F963767864F0DF4C"
      ],
      "influencedActions": [
        "Assigned exact disjoint files and explicit no-stage/no-commit boundaries",
        "Reserved main-agent integration and independent review responsibility"
      ],
      "invocationReason": "Execute approved plan slices through scoped workers in the current session.",
      "skillId": "SKL-030",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-IMPLEMENTATION"
      ],
      "usageId": "USE-006",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "commit:d9bb11de3ff54472748999b07c678197383c52b4",
        "commit:e2fdfa0a208186b2a6afe3709c25c4600e68100b",
        "implementation:fd0cf3cb71f552884a3eeff0de45207ef13f3f4d",
        "sha256:B5B4717B8B761CCE15A6CFE9022E33FD959E0894C0C39D72C9CB49C23486C10E"
      ],
      "influencedActions": [
        "Required meaningful failing tests before production fixes and features",
        "Structured Tasks 1A, 2, 1B, and 3 evidence as RED, GREEN, refactor, and widened verification"
      ],
      "invocationReason": "Implement every feature or bug fix from an observed regression or missing-contract test.",
      "skillId": "SKL-034",
      "taskIds": [
        "PROGRAM-IMPLEMENTATION",
        "PROGRAM-TESTING",
        "TASK1A",
        "TASK1B",
        "TASK2",
        "TASK3"
      ],
      "usageId": "USE-007",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "commit:e2fdfa0a208186b2a6afe3709c25c4600e68100b",
        "coordination:Task1B-R8-independent-review-fix-waves",
        "sha256:3B20719ECA4F0461CB51A195221320D775DCF03B6859271066A03A5132A6CE7A"
      ],
      "influencedActions": [
        "Traced Task 1B ownership and cancellation defects to enqueue-time and transaction-settlement boundaries",
        "Treated unrelated broad-suite timing failures as diagnostics until isolated evidence identified their scope"
      ],
      "invocationReason": "Investigate failed tests, rejected reviews, and unexpected behavior from evidence before proposing fixes.",
      "skillId": "SKL-033",
      "taskIds": [
        "PROGRAM-FAILURE-REPAIR",
        "TASK1B-R8",
        "TASK3-DIAGNOSTIC"
      ],
      "usageId": "USE-008",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "report:sha256:4533ffef08fabc763da2b87f16398e4a9b80c004a1b150e0d7b09e169de61263",
        "sha256:EA52D15AABAF72BC6B558EFE2C126F161B53961090DDCD712000273BFE8C7B6C",
        "test:npm --prefix app run typecheck:PASS",
        "test:npm --prefix app test -- src/lib/jarvis/identity.test.ts src/lib/jarvis/profiles/types.test.ts:2-files-28-tests-PASS"
      ],
      "influencedActions": [
        "Blocked broad completion claims until exact commands and scope checks had observed outcomes",
        "Required a fresh non-implementer Task 2 review at an immutable revision"
      ],
      "invocationReason": "Require fresh, directly observed evidence before any completion, acceptance, commit, or handoff claim.",
      "skillId": "SKL-037",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-VERIFICATION",
        "TASK2-ACCEPTANCE-REVIEW"
      ],
      "usageId": "USE-009",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "path:docs/superpowers/plans/2026-07-16-vibespace-monochrome-appearance.md",
        "sha256:35C43B9D10C2388DBB228047AD028C989A14033750812125F351C85AA42C7A4A"
      ],
      "influencedActions": [
        "Defined a reference-led compact black visual language with explicit typography, material, geometry, and motion criteria",
        "Required theme isolation, accessibility, deterministic screenshots, and native Windows verification"
      ],
      "invocationReason": "Translate Goal 8's visual references into a distinctive implementation and measurable acceptance plan.",
      "skillId": "SKL-026",
      "taskIds": [
        "PHASE15-IMPLEMENTATION"
      ],
      "usageId": "USE-010",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "remote:successor-branch-and-draft-pr-baseline:read-only",
        "sha256:81DBDD90934FE86A79DDC4790FD211E5FCA866302A74090AD153395F56F2BD42",
        "skill:github:github"
      ],
      "influencedActions": [
        "Inspected the remote successor branch and draft-PR baseline without mutation",
        "Separated observed GitHub state from later planned publication and integration actions"
      ],
      "invocationReason": "Inspect the connected GitHub repository, remote successor branch, and draft-PR baseline before later publication work.",
      "skillId": "SKL-044",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-GIT-BASELINE"
      ],
      "usageId": "USE-011",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "collaboration:/root/task0r_crossdocs_final_review",
        "collaboration:/root/task0r_phase_route_recheck",
        "collaboration:/root/task0r_root_docs_rereview",
        "sha256:1017CCDD5BC61FAB67C654CF118CBDB520464B313073A0A6B9A6B9AA647A3AD6"
      ],
      "influencedActions": [
        "Dispatched independent reviewers after repairs instead of treating author checks as acceptance",
        "Required exact findings or an evidence-backed PASS before Task 0R integration"
      ],
      "invocationReason": "Request independent review of major Task 0R artifacts, traceability routing, and repaired cross-document contracts before committing.",
      "skillId": "SKL-029",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-REVIEW"
      ],
      "usageId": "USE-012",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        "collaboration:/root/task0r_classification_audit",
        "collaboration:/root/task0r_crossdocs_final_review",
        "sha256:647036BBDAB7BF2317E14E079595E984C9030F64295E2B4C0FB57DBEB48F25DD"
      ],
      "influencedActions": [
        "Checked reviewer findings against source ranges and canonical dependency routes before editing",
        "Repaired phase routing and held requirement rendering on substantive classification failures"
      ],
      "invocationReason": "Evaluate independent review findings technically and implement only evidence-supported corrections.",
      "skillId": "SKL-028",
      "taskIds": [
        "PHASE0R",
        "PROGRAM-REVIEW-REPAIR"
      ],
      "usageId": "USE-013",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        ".superpowers/sdd/task-0r/task-0r.test.mjs"
      ],
      "influencedActions": [
        "Committed final Sakura plan provenance and Phase 16 sequencing."
      ],
      "invocationReason": "Build the approved complete phased plan before product edits.",
      "skillId": "SKL-003",
      "taskIds": [
        "Task 0R"
      ],
      "usageId": "USE-014",
      "workerId": "WRK-001"
    },
    {
      "evidenceRefs": [
        ".superpowers/sdd/task-0r/task-0r.test.mjs"
      ],
      "influencedActions": [
        "Produced the exact 75-row exclusion set and coverage checklist."
      ],
      "invocationReason": "Use independent parallel read-only audits for classification and artifact coverage.",
      "skillId": "SKL-006",
      "taskIds": [
        "Task 0R"
      ],
      "usageId": "USE-015",
      "workerId": "WRK-031"
    },
    {
      "evidenceRefs": [
        ".superpowers/sdd/task-0r/task-0r.test.mjs"
      ],
      "influencedActions": [
        "Hardened duplicate lifecycle, critical exclusions, closure, and historical PASS allowlist."
      ],
      "invocationReason": "Add failing validator tests before projection and policy fixes.",
      "skillId": "SKL-007",
      "taskIds": [
        "Task 0R"
      ],
      "usageId": "USE-016",
      "workerId": "WRK-033"
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
