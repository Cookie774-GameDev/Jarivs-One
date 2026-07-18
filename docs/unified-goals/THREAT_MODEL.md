---
artifactId: 'THREAT_MODEL'
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
maintenanceTriggers: ['GIT_BASELINE', 'GOAL_SAKURA', 'SAK', 'TASK0R-20260718-B', 'THREAT_MODEL']
---

# Threat Model

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "THREAT_MODEL",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "SAK",
    "TASK0R-20260718-B",
    "THREAT_MODEL"
  ],
  "rows": [
    {
      "actor": "malicious or accidentally over-broad local/retrieved content",
      "asset": "API keys, tokens, cookies, auth headers, browser storage, private repository content",
      "controlIds": [
        "CTL-SECRET-DENYLIST",
        "CTL-TYPED-REDACTION",
        "CTL-CREDENTIAL-LOCATOR",
        "CTL-FAIL-CLOSED-SCAN"
      ],
      "evidenceRefs": [],
      "impact": "credential disclosure or unauthorized external access",
      "owner": "Kernel Tasks 4, 11, 12, 19A, 20 and Phase 16 security review",
      "requirementIds": [
        "SIK-002",
        "SIK-010",
        "SIK-011",
        "SIK-013"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-001",
      "vector": "file/context ingestion, provider payloads, approvals, artifacts, logs, diagnostics"
    },
    {
      "actor": "untrusted retrieved content, model, tool, provider, or worker",
      "asset": "JARVIS identity, user intent, tool authority, provider configuration",
      "controlIds": [
        "CTL-AUTHORITY-LAYERS",
        "CTL-TYPED-PROVENANCE",
        "CTL-CLOSED-TOOLS",
        "CTL-TRANSPORT-FAIL-CLOSED"
      ],
      "evidenceRefs": [],
      "impact": "prompt injection or authority inversion",
      "owner": "Kernel Tasks 11-13 and 19A-20C",
      "requirementIds": [
        "SIK-001",
        "SIK-002",
        "SIK-003",
        "SIK-010",
        "SIK-016"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-002",
      "vector": "web pages, memory, files, provider output, subagent results, tool results"
    },
    {
      "actor": "stale lifecycle or incorrectly scoped repository/sync code",
      "asset": "account profiles, runs, events, artifacts, messages, sync queue, settings",
      "controlIds": [
        "CTL-EXPLICIT-ACCOUNT",
        "CTL-DURABLE-CLAIM",
        "CTL-SESSION-EPOCH",
        "CTL-QUIESCE-OLD-LIFECYCLE",
        "CTL-NO-UNASSIGNED"
      ],
      "evidenceRefs": [
        "commit:a33eeb6",
        "commit:7b51641",
        "commit:e2fdfa0"
      ],
      "impact": "cross-account disclosure, overwrite, or upload",
      "owner": "Tasks 1A, 1B, 7-9, 13P and 16B",
      "requirementIds": [
        "SIK-001",
        "SIK-007",
        "SIK-013",
        "SIK-014"
      ],
      "state": "IMPLEMENTING",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-003",
      "vector": "boot, account switch, delayed write, migration, sync pull/push, stale callback"
    },
    {
      "actor": "stale UI lifecycle or incomplete cancellation adapter",
      "asset": "external side effects, provider quota, user trust, run journal",
      "controlIds": [
        "CTL-REAL-ABORT",
        "CTL-LIFECYCLE-HANDLE",
        "CTL-TERMINAL-CAS",
        "CTL-ZERO-EFFECT-REVOCATION"
      ],
      "evidenceRefs": [],
      "impact": "work continues after cancellation and state becomes misleading",
      "owner": "Kernel Tasks 14, 16B, 17-20C and terminal/browser/agent phases",
      "requirementIds": [
        "SIK-007",
        "SIK-008",
        "SIK-014",
        "SIK-015"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-004",
      "vector": "provider stream, PTY, browser CDP, voice playback, schedule, parallel worker"
    },
    {
      "actor": "caller replaying or substituting an approval",
      "asset": "filesystem, terminal, browser target, messages, external services",
      "controlIds": [
        "CTL-IDEMPOTENT-APPROVAL",
        "CTL-CANONICAL-PARAM-HASH",
        "CTL-CONTEXT-BINDING",
        "CTL-PRE-DISPATCH-READBACK"
      ],
      "evidenceRefs": [],
      "impact": "unreviewed or stale externally consequential action",
      "owner": "Kernel Tasks 15, 19B, 20 and Browser Operator phase",
      "requirementIds": [
        "SIK-007",
        "SIK-008",
        "SIK-010"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-005",
      "vector": "approval creation, decision, retry, restored run, time-of-check/time-of-use gap"
    },
    {
      "actor": "optimistic UI, tool adapter, job runner, schedule, or Hive finalizer",
      "asset": "run outcome, artifact provenance, user decisions",
      "controlIds": [
        "CTL-VERIFIED-READBACK",
        "CTL-DISPATCHED-NE-COMPLETE",
        "CTL-SOURCE-OUTPUT-SEPARATION",
        "CTL-JOURNAL-DERIVED-UI"
      ],
      "evidenceRefs": [],
      "impact": "submission or unverified output is misreported as completion",
      "owner": "Kernel Tasks 14-18, 20 and 21B",
      "requirementIds": [
        "SIK-007",
        "SIK-009",
        "SIK-015"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-006",
      "vector": "tool dispatch, job execution, schedule, output projection"
    },
    {
      "actor": "client forging email, identity, flag, cache, or local entitlement state",
      "asset": "paid features, admin functions, subscriptions, tenant data",
      "controlIds": [
        "CTL-SERVER-ENTITLEMENT",
        "CTL-RLS",
        "CTL-SIGNED-WEBHOOK",
        "CTL-TEST-MODE-BILLING",
        "CTL-NO-EMAIL-ALLOWLIST"
      ],
      "evidenceRefs": [],
      "impact": "paid/admin authorization bypass",
      "owner": "Access/Subscription phases and staging security review",
      "requirementIds": [
        "SIK-012",
        "SIK-013",
        "SIK-016"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-007",
      "vector": "local storage, Zustand, JWT interpretation, Supabase RPC, Stripe test fixture"
    },
    {
      "actor": "malicious page, compromised tool, or over-broad bridge caller",
      "asset": "browser session, local filesystem, terminal, network, external accounts",
      "controlIds": [
        "CTL-ISOLATED-BROWSER",
        "CTL-TARGET-BINDING",
        "CTL-CLOSED-RPC",
        "CTL-LEAST-CAPABILITY",
        "CTL-LOOPBACK-ONLY"
      ],
      "evidenceRefs": [],
      "impact": "browser or local-tool bridge escapes reviewed scope",
      "owner": "Browser Operator and Local Tool Bridge phases",
      "requirementIds": [
        "SIK-008",
        "SIK-010",
        "SIK-011",
        "SIK-016"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-008",
      "vector": "CDP target/frame/navigation, bridge RPC, tool manifest, approval retry"
    },
    {
      "actor": "generic sync, telemetry, repository mapper, or provider payload builder",
      "asset": "prompts, raw context, transcripts, runs, artifacts, credentials, private repository content",
      "controlIds": [
        "CTL-LOCAL-ONLY-V1",
        "CTL-SYNC-ALLOWLIST",
        "CTL-SCHEMA-EXCLUSION",
        "CTL-PAYLOAD-INSPECTION"
      ],
      "evidenceRefs": [
        "commit:e2fdfa0"
      ],
      "impact": "private kernel data is uploaded without explicit authorization",
      "owner": "Tasks 1B, 7, 13P, 16B and Phase 16 privacy review",
      "requirementIds": [
        "SIK-010",
        "SIK-011",
        "SIK-013"
      ],
      "state": "IMPLEMENTING",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-009",
      "vector": "sync queue, repository mapper, telemetry, provider payload, export"
    },
    {
      "actor": "provider or attacker controlling response text",
      "asset": "spoken output, privacy, user safety",
      "controlIds": [
        "CTL-RESPONSE-ENVELOPE",
        "CTL-STRUCTURED-PRESERVATION",
        "CTL-VALIDATED-SPOKEN-TEXT",
        "CTL-NO-ARG-PLAYBACK",
        "CTL-AUDIO-ABORT"
      ],
      "evidenceRefs": [],
      "impact": "unvalidated or structured content is spoken",
      "owner": "Kernel Tasks 3, 14, 15, 16B, 21A and voice phase",
      "requirementIds": [
        "SIK-004",
        "SIK-005",
        "SIK-006"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-010",
      "vector": "stream chunk, structured response, tool result, error text"
    },
    {
      "actor": "appearance implementation crossing an app-owned styling boundary",
      "asset": "remote content integrity, third-party identity, user content, Origami isolation",
      "controlIds": [
        "CTL-APP-SELECTOR",
        "CTL-NO-REMOTE-INJECTION",
        "CTL-MOTIF-ABSTRACTION",
        "CTL-ORIGAMI-EXCLUSION",
        "CTL-THEME-ONLY-MIGRATION"
      ],
      "evidenceRefs": [],
      "impact": "remote content mutation, copied identity, or unrelated user-data change",
      "owner": "MonoChrome Tasks MC1-MC10",
      "requirementIds": [
        "MC-024",
        "MC-025",
        "MC-030",
        "MC-032"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-MC"
      ],
      "threatId": "THR-011",
      "vector": "Browser Chat content, CSS selectors, theme messages, reference media, migration"
    },
    {
      "actor": "concurrent worker, broad Git command, or test-process cleanup",
      "asset": "unrelated branches, protected installer deletion, existing localhost sessions, real app profile",
      "controlIds": [
        "CTL-ISOLATED-WORKTREE",
        "CTL-EXACT-MANIFEST",
        "CTL-EXACT-STAGING",
        "CTL-PROTECTED-DIRTY",
        "CTL-ISOLATED-LOCALHOST"
      ],
      "evidenceRefs": [
        "GIT-001",
        "GIT-004",
        "GIT-005"
      ],
      "impact": "unrelated user work or running state is overwritten",
      "owner": "Main coordinator and every file-changing worker",
      "requirementIds": [
        "AUTH-001",
        "DIR-001"
      ],
      "state": "IMPLEMENTING",
      "testIds": [
        "TST-PLAN-AUTH",
        "TST-PLAN-DIR"
      ],
      "threatId": "THR-012",
      "vector": "shared worktree, broad staging, process cleanup, default profile, force push"
    },
    {
      "actor": "external adapter or retry path assuming database atomicity covers an external effect",
      "asset": "external systems, journal truth, retry safety",
      "controlIds": [
        "CTL-PRE-DISPATCH-INTENT",
        "CTL-EFFECT-TRACKER",
        "CTL-DB-ROLLBACK-SCOPE",
        "CTL-NO-UNCERTAIN-REPLAY",
        "CTL-FORWARD-REPAIR"
      ],
      "evidenceRefs": [],
      "impact": "duplicate or untracked external effect after database rollback",
      "owner": "Kernel Tasks 16B-20C and external adapters",
      "requirementIds": [
        "SIK-007",
        "SIK-008",
        "SIK-009"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-013",
      "vector": "provider, browser, native, message, or test-billing dispatch followed by persistence failure"
    },
    {
      "actor": "stale, poisoned, or cross-scope memory/context producer",
      "asset": "protected profile, memory, request contract, account privacy",
      "controlIds": [
        "CTL-ACCOUNT-PROVENANCE-SCOPE",
        "CTL-IMMUTABLE-REQUEST",
        "CTL-MEMORY-NOT-IDENTITY",
        "CTL-SENSITIVITY-FILTER",
        "CTL-SOURCE-REVISION"
      ],
      "evidenceRefs": [],
      "impact": "memory poisoning changes protected behavior or leaks another scope",
      "owner": "SOUL/Memory and Context phases",
      "requirementIds": [
        "SIK-001",
        "SIK-002",
        "SIK-010",
        "SIK-013"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SIK"
      ],
      "threatId": "THR-014",
      "vector": "memory write/retrieval, profile import, context graph"
    },
    {
      "actor": "malformed persisted state, untrusted reference prototype behavior, accidental cross-theme styling, or unsafe motion",
      "asset": "Sakura appearance isolation and user interface integrity",
      "controlIds": [
        "CTRL-SAKURA-REGISTRY",
        "CTRL-SAKURA-SCOPE",
        "CTRL-SAKURA-MOTION",
        "CTRL-SAKURA-ROLLBACK"
      ],
      "evidenceRefs": [
        "docs/superpowers/plans/2026-07-17-vibespace-sakura-appearance.md"
      ],
      "impact": "behavior regression, inaccessible UI, data loss, performance degradation, or provider boundary violation",
      "owner": "future Sakura security/review owner",
      "requirementIds": [
        "SAK-001",
        "SAK-002",
        "SAK-003",
        "SAK-004",
        "SAK-005",
        "SAK-006",
        "SAK-007",
        "SAK-008",
        "SAK-009",
        "SAK-010",
        "SAK-011",
        "SAK-012",
        "SAK-013",
        "SAK-014",
        "SAK-015",
        "SAK-016",
        "SAK-017",
        "SAK-018",
        "SAK-019",
        "SAK-020",
        "SAK-021",
        "SAK-022",
        "SAK-023",
        "SAK-024",
        "SAK-025",
        "SAK-026",
        "SAK-027",
        "SAK-028",
        "SAK-029",
        "SAK-030",
        "SAK-031",
        "SAK-032",
        "SAK-033",
        "SAK-034",
        "SAK-035",
        "SAK-036",
        "SAK-037",
        "SAK-038",
        "SAK-039",
        "SAK-040",
        "SAK-041",
        "SAK-042",
        "SAK-043",
        "SAK-044",
        "SAK-045",
        "SAK-046",
        "SAK-047",
        "SAK-048",
        "SAK-049",
        "SAK-050"
      ],
      "state": "PLANNED",
      "testIds": [
        "TST-PLAN-SAK"
      ],
      "threatId": "THR-015",
      "vector": "unscoped CSS/scene layers, prototype code reuse, random/per-frame work, webview bleed, or migration selecting Sakura"
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
