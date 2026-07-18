---
artifactId: 'PERFORMANCE_PLAN'
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
maintenanceTriggers: ['GIT_BASELINE', 'GOAL_SAKURA', 'PERFORMANCE_PLAN', 'SAK', 'TASK0R-20260718-B']
---

# Performance Plan

Deterministic Task 0R Batch B artifact. Canonical rows below are authoritative for this batch; prose is explanatory only.

## Canonical data

```json canonical-data
{
  "artifactId": "PERFORMANCE_PLAN",
  "batchId": "TASK0R-20260718-B",
  "maintenanceTriggers": [
    "GIT_BASELINE",
    "GOAL_SAKURA",
    "PERFORMANCE_PLAN",
    "SAK",
    "TASK0R-20260718-B"
  ],
  "rows": [
    {
      "blocker": "Measurement is planned and not run.",
      "budget": "p95 < 25 ms for envelope validation/build plus deterministic compilation, excluding context retrieval and provider I/O",
      "dataset": "representative detached immutable request with bounded identity, profile, context, tool, capability, model and surface layers; sanitized character counts only",
      "environment": "isolated successor worktree; app Vitest Node environment; fixed production-like fixture; no network",
      "evidenceRefs": [],
      "measurementCommand": "npm --prefix app test -- src/lib/jarvis/promptCompiler.performance.test.ts",
      "oracle": "warm up first; measure the plan-defined sample set with performance.now(); sort samples; print count, sanitized sizes, p50, p95 and max; p95 must be below 25 ms",
      "performanceId": "PRF-001",
      "requirementIds": [
        "SIK-002",
        "SIK-003",
        "SIK-014"
      ],
      "resultState": null,
      "sampleCount": 1000,
      "taskIds": [
        "Task 12",
        "Task 22"
      ]
    },
    {
      "blocker": "Measurement is planned and not run.",
      "budget": "p95 < 15 ms for deterministic response tokenization, classification, lint, repair and validated envelope construction, excluding provider latency",
      "dataset": "representative ordinary response plus structured blocks and bounded policy violations; sanitized lengths and violation counts only",
      "environment": "isolated successor worktree; app Vitest Node environment; fixed fixture; no provider or network",
      "evidenceRefs": [],
      "measurementCommand": "npm --prefix app test -- src/lib/jarvis/response/pipeline.performance.test.ts",
      "oracle": "warm up first; sort measured samples; print count, sanitized length, violation count, p50, p95 and max; p95 must be below 15 ms",
      "performanceId": "PRF-002",
      "requirementIds": [
        "SIK-004",
        "SIK-005",
        "SIK-006",
        "SIK-014"
      ],
      "resultState": null,
      "sampleCount": 1000,
      "taskIds": [
        "Task 14",
        "Task 22"
      ]
    },
    {
      "blocker": "Canonical journal repositories and recovery/selectors fixture are planned for Tasks 7, 9, 18, and 22",
      "budget": "no sequence gaps, duplicate compound keys, cross-account reads, or super-linear growth over the frozen 100/1,000/10,000-event datasets; p95 and heap deltas must be reported before a numeric regression threshold is frozen",
      "dataset": "fresh isolated IndexedDB databases with 100, 1,000 and 10,000 ordered events across one and multiple runs/accounts",
      "environment": "fake-indexeddb integration suite plus one Chromium/WebView2 native evidence run on the isolated profile",
      "evidenceRefs": [],
      "measurementCommand": "npm --prefix app test -- src/lib/db/jarvisRepositories.test.ts src/lib/jarvis/executionJournal/recovery.test.ts src/features/jarvis-command-center/selectors.test.ts",
      "oracle": "report dataset size, operation count, p50/p95/max and sanitized heap delta; assert ordering, account scope, bounded pagination and complete cleanup",
      "performanceId": "PRF-003",
      "requirementIds": [
        "SIK-007",
        "SIK-013",
        "SIK-014"
      ],
      "resultState": null,
      "sampleCount": 30,
      "taskIds": [
        "Task 7",
        "Task 9",
        "Task 18",
        "Task 22"
      ]
    },
    {
      "blocker": "Measurement is planned and not run.",
      "budget": "canonical theme attribute is applied before the first React paint; theme switch performs no route remount, data reload, or network request and introduces no >50 ms long task in the fixed route fixture",
      "dataset": "Default, VibeSpace, Jarvis Core and MonoChrome across cold hydration, current storage, legacy Light, malformed storage and detached-window messages",
      "environment": "Playwright Chromium at fixed 1440x900 viewport, motion disabled, fonts ready, isolated port/profile and deterministic fixture clock",
      "evidenceRefs": [],
      "measurementCommand": "npm --prefix app test -- src/features/appearance/themePrepaint.integration.test.ts src/features/appearance/themeSync.test.ts src/stores/ui.themePersistence.test.ts && npx playwright test tests/visual/monochrome/monochrome.behavior.spec.ts --config playwright.monochrome.config.ts",
      "oracle": "observe prepaint ordering, PerformanceObserver long tasks, route instance identity, request log and style/layout/paint timing; fail on any remount/reload/network or long task above 50 ms",
      "performanceId": "PRF-004",
      "requirementIds": [
        "MC-009",
        "MC-011",
        "MC-031",
        "MC-034",
        "MC-036"
      ],
      "resultState": null,
      "sampleCount": 30,
      "taskIds": [
        "MC1",
        "MC2",
        "MC9"
      ]
    },
    {
      "blocker": "Measurement is planned and not run.",
      "budget": "no MonoChrome gradient, backdrop blur, glow or large-shadow effect in scope; interaction trace must meet the route's pre-change p95 frame-time baseline with no regression greater than 10% and no frame above 50 ms attributable to theme CSS",
      "dataset": "large Canvas and graph fixtures at frozen node/edge counts, pan/zoom/selection, 100/125/150/200 percent zoom and reduced-motion variants",
      "environment": "Playwright Chromium trace plus optimized Windows WebView2 smoke on isolated profile; fixed hardware/runtime recorded with evidence",
      "evidenceRefs": [],
      "measurementCommand": "npx playwright test tests/visual/monochrome/monochrome.visual.spec.ts tests/visual/monochrome/monochrome.a11y.spec.ts --config playwright.monochrome.config.ts",
      "oracle": "compare three-run pre-change and MonoChrome traces on identical fixture; report frame p50/p95/max, style/layout/paint, heap and selector counts; audit forbidden effects",
      "performanceId": "PRF-005",
      "requirementIds": [
        "MC-017",
        "MC-021",
        "MC-026",
        "MC-027",
        "MC-040"
      ],
      "resultState": null,
      "sampleCount": 30,
      "taskIds": [
        "MC4",
        "MC5",
        "MC9"
      ]
    },
    {
      "blocker": "Measurement is planned and not run.",
      "budget": "CSS and JavaScript byte deltas, selector count, startup timing and peak memory are reported against the frozen parent revision; any >10% regression requires an explained, reviewed exception and cannot silently pass",
      "dataset": "full optimized web build and optimized Windows/WebView2 route-smoke matrix with deterministic content",
      "environment": "isolated successor worktree and disposable native identifier/profile; existing 5173/5188 sessions untouched",
      "evidenceRefs": [],
      "measurementCommand": "npm run build && npx playwright test tests/visual/monochrome/monochrome.behavior.spec.ts tests/visual/monochrome/monochrome.visual.spec.ts --config playwright.monochrome.config.ts",
      "oracle": "record parent/current asset bytes, CSS selector count, startup/navigation p50/p95/max and peak memory; fail unreviewed regressions above 10%",
      "performanceId": "PRF-006",
      "requirementIds": [
        "MC-021",
        "MC-022",
        "MC-023",
        "MC-041",
        "SIK-014"
      ],
      "resultState": null,
      "sampleCount": 10,
      "taskIds": [
        "Task 22",
        "MC9",
        "MC10",
        "Phase 16"
      ]
    },
    {
      "blocker": "Sakura implementation and measurements are planned and not run.",
      "budget": "No random/per-frame React work; deterministic 6-12 petals; locally frozen frame/render/interaction budgets from SK0B",
      "dataset": "all frozen Sakura routes/states at 1440x900 plus constrained/reduced-motion/static-rendering cases",
      "environment": "isolated Sakura localhost runtime on a freshly proven unused port and disposable app-data profile",
      "evidenceRefs": [
        "PLN-021"
      ],
      "measurementCommand": "Run the frozen Sakura Playwright, browser performance, reduced-motion, native, and stress manifests.",
      "oracle": "Every frozen Sakura budget passes while representative non-Sakura routes remain equivalent.",
      "performanceId": "PRF-007",
      "requirementIds": [
        "SAK-020",
        "SAK-021",
        "SAK-022",
        "SAK-032",
        "SAK-035",
        "SAK-039",
        "SAK-048",
        "SAK-050"
      ],
      "resultState": null,
      "sampleCount": 30,
      "taskIds": [
        "SK2",
        "SK3",
        "SK7G",
        "SK9"
      ]
    }
  ],
  "schemaVersion": "task-0r.artifact/v1"
}
```

## Maintenance

Regenerate when any declared maintenance trigger changes. Do not hand-edit canonical rows.
