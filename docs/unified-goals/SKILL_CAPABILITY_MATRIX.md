---
artifactId: 'SKILL_CAPABILITY_MATRIX'
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
  ['GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'SKILL_CAPABILITY_MATRIX', 'TASK0R-20260718-B']
---

# Skill Capability Matrix

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "SKILL_CAPABILITY_MATRIX",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "SKILL_CAPABILITY_MATRIX",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-accessibility/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-accessibility/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-accessibility",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-001",
      "substituteSkillIds": ["SKL-024", "SKL-026"],
      "taskIds": ["PHASE14-PLAN", "PHASE15-IMPLEMENTATION", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-agent-orchestration/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-agent-orchestration/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-agent-orchestration",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-002",
      "substituteSkillIds": ["SKL-025", "SKL-030"],
      "taskIds": ["PHASE0R", "PHASE10-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-code-review/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-code-review/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-code-review",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-003",
      "substituteSkillIds": ["SKL-028", "SKL-029", "SKL-037"],
      "taskIds": ["PHASE0R", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-cross-platform/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-cross-platform/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-cross-platform",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-004",
      "substituteSkillIds": ["SKL-024", "SKL-037"],
      "taskIds": ["PHASE15-IMPLEMENTATION", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-debugging/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-debugging/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-debugging",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-005",
      "substituteSkillIds": ["SKL-033"],
      "taskIds": ["PROGRAM-FAILURE-REPAIR"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-discovery-planning/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-discovery-planning/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-discovery-planning",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-006",
      "substituteSkillIds": ["SKL-023", "SKL-038"],
      "taskIds": ["PHASE0R", "PROGRAM-PLANNING"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-docs-handoff/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-docs-handoff/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-docs-handoff",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-007",
      "substituteSkillIds": ["SKL-037", "SKL-038"],
      "taskIds": ["PHASE0R", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-github-release/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-github-release/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-github-release",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-008",
      "substituteSkillIds": ["SKL-027"],
      "taskIds": ["PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-indexeddb-dexie/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-indexeddb-dexie/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-indexeddb-dexie",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-009",
      "substituteSkillIds": ["SKL-033", "SKL-034"],
      "taskIds": ["KERNEL-PERSISTENCE", "PHASE4-PLAN", "PHASE8-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-integration-wiring/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-integration-wiring/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-integration-wiring",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-010",
      "substituteSkillIds": ["SKL-034", "SKL-037"],
      "taskIds": ["KERNEL-CUTOVER", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-performance/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-performance/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-performance",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-011",
      "substituteSkillIds": ["SKL-033", "SKL-037"],
      "taskIds": ["PHASE17-PLAN", "PROGRAM-PERFORMANCE"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-provider-integrations/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-provider-integrations/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-provider-integrations",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-012",
      "substituteSkillIds": ["SKL-033", "SKL-034"],
      "taskIds": ["KERNEL-PROVIDERS", "PHASE12-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-react-typescript/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-react-typescript/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-react-typescript",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-013",
      "substituteSkillIds": ["SKL-026", "SKL-034"],
      "taskIds": ["PROGRAM-FRONTEND"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-security-review/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-security-review/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-security-review",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-014",
      "substituteSkillIds": ["SKL-028", "SKL-029", "SKL-033", "SKL-037"],
      "taskIds": ["PHASE17-PLAN", "PROGRAM-SECURITY"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-stripe-billing/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-stripe-billing/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-stripe-billing",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-015",
      "substituteSkillIds": ["SKL-031", "SKL-032", "SKL-034"],
      "taskIds": ["PHASE13-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-supabase-rls/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-supabase-rls/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-supabase-rls",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-016",
      "substituteSkillIds": ["SKL-031", "SKL-032"],
      "taskIds": ["PHASE13-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-superpowers/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-superpowers/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-superpowers",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-017",
      "substituteSkillIds": ["SKL-036"],
      "taskIds": ["PROGRAM-PROCESS"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-tauri-rust/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-tauri-rust/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-tauri-rust",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-018",
      "substituteSkillIds": ["SKL-024", "SKL-033", "SKL-034"],
      "taskIds": ["PHASE15-IMPLEMENTATION", "PHASE17-PLAN", "PHASE5-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-terminal-pty/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-terminal-pty/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-terminal-pty",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-019",
      "substituteSkillIds": ["SKL-024", "SKL-033", "SKL-034"],
      "taskIds": ["PHASE5-PLAN"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-testing-ci/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-testing-ci/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-testing-ci",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-020",
      "substituteSkillIds": ["SKL-034", "SKL-037"],
      "taskIds": ["PHASE17-PLAN", "PROGRAM-TESTING"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-ui-polish/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-ui-polish/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-ui-polish",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-021",
      "substituteSkillIds": ["SKL-026"],
      "taskIds": ["PHASE14-PLAN", "PHASE15-IMPLEMENTATION"],
      "version": null
    },
    {
      "availability": "UNAVAILABLE",
      "evidenceRefs": [
        "path:.agents/skills/vibespace-voice-dictation/SKILL.md:MISSING_UNVERIFIED",
        "plan:Task0R-Step4"
      ],
      "expectedPath": ".agents/skills/vibespace-voice-dictation/SKILL.md",
      "installedPath": null,
      "name": "$vibespace-voice-dictation",
      "provenanceClass": "REQUESTED_REPOSITORY",
      "sha256": null,
      "skillId": "SKL-022",
      "substituteSkillIds": ["SKL-024", "SKL-033", "SKL-034"],
      "taskIds": ["KERNEL-VOICE", "PHASE17-PLAN"],
      "version": null
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:E14914605F640E0841758E45D0AB2A53243B59B921F929E47921C99668F2E61D",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\brainstorming\\SKILL.md",
      "name": "superpowers:brainstorming",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "E14914605F640E0841758E45D0AB2A53243B59B921F929E47921C99668F2E61D",
      "skillId": "SKL-023",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PROGRAM-PLANNING"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:0885A6D35C6BBFF4A8B5F2FCB6CD6E1D4B5489C7ADE022EB185E36AEB3273DD0",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\openai-bundled\\computer-use\\26.707.72221\\skills\\computer-use\\SKILL.md",
      "name": "computer-use:computer-use",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "0885A6D35C6BBFF4A8B5F2FCB6CD6E1D4B5489C7ADE022EB185E36AEB3273DD0",
      "skillId": "SKL-024",
      "substituteSkillIds": [],
      "taskIds": ["PHASE14-PLAN", "PHASE15-IMPLEMENTATION", "PHASE16-SAKURA", "PHASE17-PLAN"],
      "version": "26.707.72221"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:F0DF13F584049059CC5619F90061405B89DCC6E28AB3F2A8517D27D99C7A46A6",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\dispatching-parallel-agents\\SKILL.md",
      "name": "superpowers:dispatching-parallel-agents",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "F0DF13F584049059CC5619F90061405B89DCC6E28AB3F2A8517D27D99C7A46A6",
      "skillId": "SKL-025",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE10-PLAN", "PHASE16-SAKURA", "PROGRAM-PARALLELISM"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:35C43B9D10C2388DBB228047AD028C989A14033750812125F351C85AA42C7A4A",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\frontend-design\\local\\skills\\frontend-design\\SKILL.md",
      "name": "frontend-design:frontend-design",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "35C43B9D10C2388DBB228047AD028C989A14033750812125F351C85AA42C7A4A",
      "skillId": "SKL-026",
      "substituteSkillIds": [],
      "taskIds": ["PHASE14-PLAN", "PHASE15-IMPLEMENTATION", "PHASE16-SAKURA"],
      "version": "local"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:E93C6EA769BA673D30749A981CD8AD75B687F454E3C8E2E45E7CFCBD412DF12C",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\openai-curated-remote\\github\\0.1.8-2841cf9749ae\\skills\\yeet\\SKILL.md",
      "name": "github:yeet",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "E93C6EA769BA673D30749A981CD8AD75B687F454E3C8E2E45E7CFCBD412DF12C",
      "skillId": "SKL-027",
      "substituteSkillIds": [],
      "taskIds": ["PHASE16-SAKURA", "PHASE17-PLAN"],
      "version": "0.1.8-2841cf9749ae"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:647036BBDAB7BF2317E14E079595E984C9030F64295E2B4C0FB57DBEB48F25DD",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\receiving-code-review\\SKILL.md",
      "name": "superpowers:receiving-code-review",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "647036BBDAB7BF2317E14E079595E984C9030F64295E2B4C0FB57DBEB48F25DD",
      "skillId": "SKL-028",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PROGRAM-REVIEW"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:1017CCDD5BC61FAB67C654CF118CBDB520464B313073A0A6B9A6B9AA647A3AD6",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\requesting-code-review\\SKILL.md",
      "name": "superpowers:requesting-code-review",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "1017CCDD5BC61FAB67C654CF118CBDB520464B313073A0A6B9A6B9AA647A3AD6",
      "skillId": "SKL-029",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PHASE17-PLAN", "PROGRAM-REVIEW"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:41AB239A6AD1C487CD839FDAC972A8C9CF0F5E90EFA59A63F963767864F0DF4C",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\subagent-driven-development\\SKILL.md",
      "name": "superpowers:subagent-driven-development",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "41AB239A6AD1C487CD839FDAC972A8C9CF0F5E90EFA59A63F963767864F0DF4C",
      "skillId": "SKL-030",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE10-PLAN", "PHASE16-SAKURA", "PROGRAM-IMPLEMENTATION"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:1171386737B231610FA42485707272765C3516A9BBC0BD2C6C161A8CEE3D7D33",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\openai-curated-remote\\supabase\\1.0.0\\skills\\supabase\\SKILL.md",
      "name": "supabase:supabase",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "1171386737B231610FA42485707272765C3516A9BBC0BD2C6C161A8CEE3D7D33",
      "skillId": "SKL-031",
      "substituteSkillIds": [],
      "taskIds": ["PHASE13-PLAN", "PHASE17-PLAN"],
      "version": "1.0.0"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:CCD6E4596BD51CF344FE76C464867C541CCC16B6D90AE7A9DB449FB17588613B",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\openai-curated-remote\\supabase\\1.0.0\\skills\\supabase-postgres-best-practices\\SKILL.md",
      "name": "supabase:supabase-postgres-best-practices",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "CCD6E4596BD51CF344FE76C464867C541CCC16B6D90AE7A9DB449FB17588613B",
      "skillId": "SKL-032",
      "substituteSkillIds": [],
      "taskIds": ["PHASE13-PLAN", "PHASE17-PLAN"],
      "version": "1.0.0"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:3B20719ECA4F0461CB51A195221320D775DCF03B6859271066A03A5132A6CE7A",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\systematic-debugging\\SKILL.md",
      "name": "superpowers:systematic-debugging",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "3B20719ECA4F0461CB51A195221320D775DCF03B6859271066A03A5132A6CE7A",
      "skillId": "SKL-033",
      "substituteSkillIds": [],
      "taskIds": ["PHASE16-SAKURA", "PROGRAM-FAILURE-REPAIR"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:B5B4717B8B761CCE15A6CFE9022E33FD959E0894C0C39D72C9CB49C23486C10E",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\test-driven-development\\SKILL.md",
      "name": "superpowers:test-driven-development",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "B5B4717B8B761CCE15A6CFE9022E33FD959E0894C0C39D72C9CB49C23486C10E",
      "skillId": "SKL-034",
      "substituteSkillIds": [],
      "taskIds": ["PHASE16-SAKURA", "PROGRAM-IMPLEMENTATION", "PROGRAM-TESTING"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:E2C3EC142E52868A51AF246C620CD76AB648DCF27D6900D47E6FFD07159A9794",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\using-git-worktrees\\SKILL.md",
      "name": "superpowers:using-git-worktrees",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "E2C3EC142E52868A51AF246C620CD76AB648DCF27D6900D47E6FFD07159A9794",
      "skillId": "SKL-035",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PROGRAM-ISOLATION"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:55379FE7C1C473A02C61961C822996BFF30E1320D6921D9062509BC508482C05",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\using-superpowers\\SKILL.md",
      "name": "superpowers:using-superpowers",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "55379FE7C1C473A02C61961C822996BFF30E1320D6921D9062509BC508482C05",
      "skillId": "SKL-036",
      "substituteSkillIds": [],
      "taskIds": ["PROGRAM-PROCESS"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:EA52D15AABAF72BC6B558EFE2C126F161B53961090DDCD712000273BFE8C7B6C",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\verification-before-completion\\SKILL.md",
      "name": "superpowers:verification-before-completion",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "EA52D15AABAF72BC6B558EFE2C126F161B53961090DDCD712000273BFE8C7B6C",
      "skillId": "SKL-037",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PHASE17-PLAN", "PROGRAM-VERIFICATION"],
      "version": "6.1.1"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:272E1AF349F5062C28DC282B3E21B220D58D683A7314A10C455B7432EC91D845",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\6.1.1\\skills\\writing-plans\\SKILL.md",
      "name": "superpowers:writing-plans",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "272E1AF349F5062C28DC282B3E21B220D58D683A7314A10C455B7432EC91D845",
      "skillId": "SKL-038",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE16-SAKURA", "PROGRAM-PLANNING"],
      "version": "6.1.1"
    },
    {
      "availability": "IN_APP_ONLY",
      "evidenceRefs": [
        "commit:918de28b21a2f9e6fe773c8d50d9e9d86fd1308c",
        "path:app/src/lib/agents/skills.ts",
        "sha256:315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8"
      ],
      "expectedPath": "app/src/lib/agents/skills.ts",
      "installedPath": null,
      "name": "VibeSpace in-app skill: analyze",
      "provenanceClass": "IN_APP",
      "sha256": "315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8",
      "skillId": "SKL-039",
      "substituteSkillIds": [],
      "taskIds": ["PHASE9-PLAN", "REPOSITORY-BASELINE"],
      "version": "repository@918de28b21a2f9e6fe773c8d50d9e9d86fd1308c"
    },
    {
      "availability": "IN_APP_ONLY",
      "evidenceRefs": [
        "commit:918de28b21a2f9e6fe773c8d50d9e9d86fd1308c",
        "path:app/src/lib/agents/skills.ts",
        "sha256:315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8"
      ],
      "expectedPath": "app/src/lib/agents/skills.ts",
      "installedPath": null,
      "name": "VibeSpace in-app skill: build",
      "provenanceClass": "IN_APP",
      "sha256": "315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8",
      "skillId": "SKL-040",
      "substituteSkillIds": [],
      "taskIds": ["PHASE9-PLAN", "REPOSITORY-BASELINE"],
      "version": "repository@918de28b21a2f9e6fe773c8d50d9e9d86fd1308c"
    },
    {
      "availability": "IN_APP_ONLY",
      "evidenceRefs": [
        "commit:918de28b21a2f9e6fe773c8d50d9e9d86fd1308c",
        "path:app/src/lib/agents/skills.ts",
        "sha256:315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8"
      ],
      "expectedPath": "app/src/lib/agents/skills.ts",
      "installedPath": null,
      "name": "VibeSpace in-app skill: create",
      "provenanceClass": "IN_APP",
      "sha256": "315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8",
      "skillId": "SKL-041",
      "substituteSkillIds": [],
      "taskIds": ["PHASE9-PLAN", "REPOSITORY-BASELINE"],
      "version": "repository@918de28b21a2f9e6fe773c8d50d9e9d86fd1308c"
    },
    {
      "availability": "IN_APP_ONLY",
      "evidenceRefs": [
        "commit:918de28b21a2f9e6fe773c8d50d9e9d86fd1308c",
        "path:app/src/lib/agents/skills.ts",
        "sha256:315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8"
      ],
      "expectedPath": "app/src/lib/agents/skills.ts",
      "installedPath": null,
      "name": "VibeSpace in-app skill: operate",
      "provenanceClass": "IN_APP",
      "sha256": "315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8",
      "skillId": "SKL-042",
      "substituteSkillIds": [],
      "taskIds": ["PHASE9-PLAN", "REPOSITORY-BASELINE"],
      "version": "repository@918de28b21a2f9e6fe773c8d50d9e9d86fd1308c"
    },
    {
      "availability": "IN_APP_ONLY",
      "evidenceRefs": [
        "commit:918de28b21a2f9e6fe773c8d50d9e9d86fd1308c",
        "path:app/src/lib/agents/skills.ts",
        "sha256:315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8"
      ],
      "expectedPath": "app/src/lib/agents/skills.ts",
      "installedPath": null,
      "name": "VibeSpace in-app skill: research",
      "provenanceClass": "IN_APP",
      "sha256": "315A345A2D8FE82430D6D1ABB5DC6AB1BAF7065C44A67E0B2BA34D888B0E24A8",
      "skillId": "SKL-043",
      "substituteSkillIds": [],
      "taskIds": ["PHASE9-PLAN", "REPOSITORY-BASELINE"],
      "version": "repository@918de28b21a2f9e6fe773c8d50d9e9d86fd1308c"
    },
    {
      "availability": "AVAILABLE",
      "evidenceRefs": [
        "sha256:81DBDD90934FE86A79DDC4790FD211E5FCA866302A74090AD153395F56F2BD42",
        "source:installed-skill"
      ],
      "expectedPath": null,
      "installedPath": "C:\\Users\\viper\\.codex\\plugins\\cache\\openai-curated-remote\\github\\0.1.8-2841cf9749ae\\skills\\github\\SKILL.md",
      "name": "github:github",
      "provenanceClass": "AVAILABLE_PLUGIN",
      "sha256": "81DBDD90934FE86A79DDC4790FD211E5FCA866302A74090AD153395F56F2BD42",
      "skillId": "SKL-044",
      "substituteSkillIds": [],
      "taskIds": ["PHASE0R", "PHASE17-PLAN", "PROGRAM-GIT-BASELINE"],
      "version": "0.1.8-2841cf9749ae"
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
