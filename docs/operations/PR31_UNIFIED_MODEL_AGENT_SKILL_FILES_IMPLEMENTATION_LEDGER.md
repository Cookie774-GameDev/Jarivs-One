# PR31 Unified Model, Agent, Skill, Files — Implementation Ledger

## 2026-08-22 — Slice 0 ownership map and Slice 5 claim

- Agent/task: `VS-CODEX-ROOT-UNIFIED-MODEL-AGENT-SKILL-FILES-20260822` / `PR31-UNIFIED-MODEL-AGENT-SKILL-FILES-SLICE5`.
- Branch/base: `integration/UnifiedChungus-final` at `9eb64ab8`; upstream `origin/UnifiedChungus`; no merge, rebase, or cherry-pick in progress. The shared worktree contains concurrent dirty work, which is preserved and excluded.
- Ownership map: live model catalog/refresh is locked by `VS-CODEX-OPENCODE-RELIABILITY-20260822`; Composer/model-picker UI remains concurrent shared work; runtime/Context/Gateway and Schedule picker paths have active owners; native filesystem/Doctor paths are separately locked. No competing selector, provider route, effort, attachment, native filesystem, or Context implementation is authorized in this slice.
- Independent owner chosen: Jarvis creator contracts/handoff, a new VibeSpace-owned skill-package builder, and the existing creator-only proposal action in `MessagePart`, with their focused tests. The slice will ask the required discovery questions, parse an explicit proposal, keep creation behind an explicit apply plus editor Save confirmation, and preview a project-specific package containing `SKILL.md`, a VibeSpace guide, and `provenance.json`.
- Provenance boundary: local `.superpowers`/Codex skill material was audited read-only. No `obra/superpowers` repository content, installer, telemetry, or dependency is imported or run. Any future upstream integration requires a separately pinned, attributed, licensed review.

## 2026-08-22 — Slice 5 implementation and verification checkpoint

- Agent/task: `VS-CODEX-ROOT-UNIFIED-MODEL-AGENT-SKILL-FILES-20260822` / `PR31-UNIFIED-MODEL-AGENT-SKILL-FILES-SLICE5`.
- Commit parent: `f9f2151f441bf4758df1a13905efac06e1664c33` on `integration/UnifiedChungus-final`; concurrent uncommitted paths remain excluded.
- Owned implementation: `contracts.ts` now asks five required discovery questions and parses a reviewable proposal with safe fallback data; `MessagePart.tsx` renders that proposal and dispatches the existing apply event only after an explicit button click; the new `skillPackage.ts` creates a deterministic in-memory preview (`SKILL.md`, VibeSpace authoring guide, `provenance.json`) without writing, installing, importing, or attributing upstream material. Existing editor callers may still create pre-proposal drafts; package/render fallbacks remain conservative.
- Fresh focused verification: `npx vitest run src/features/jarvis-creator/contracts.test.ts src/features/jarvis-creator/handoff.test.ts src/features/jarvis-creator/skillPackage.test.ts src/features/chat/MessagePart.jarvisCreator.test.tsx` from `app/` — **22/22 tests passed**, exit 0 (2026-08-22 14:11 local).
- Full typecheck: initiated twice; both runs were interrupted by incoming task/environment events before producing an exit result. The last completed earlier run showed first-slice compatibility omissions (now repaired) plus existing Context test strict-null errors in another active owner’s paths. A later clean full typecheck remains required before branch-level acceptance.
- Native acceptance: not run for this slice. The required official VibeSpace native QA remains queued; no browser substitute is claimed.

## 2026-08-22 — Slice 5 release

- Commit: `2b80d5c769d83d0c3ddf0d7448b6c53ef22a3bc2` (`feat(jarvis): add reviewed creator proposals`), containing only the claimed creator contracts, creator tests, proposal UI, package preview builder/test, and this ledger.
- Result: proposal review is additive and editor-only; it neither changes provider routing nor creates/installs a skill package. The existing custom-event handoff remains intact for the editor’s separate Save confirmation.
- Verification carried with the commit: focused suite 22/22 passed, exit 0. Repository-wide typecheck is not recorded as passing because its two attempted runs were interrupted before a final exit; branch-level/native acceptance remains external to this completed slice.
- Lock state: released only `VS-CODEX-ROOT-UNIFIED-MODEL-AGENT-SKILL-FILES-20260822`; all other active locks and worktree changes remain untouched.

## 2026-08-22 — Slice 4 custom-agent editor claim

- Agent/task: `VS-CODEX-ROOT-UNIFIED-CUSTOM-AGENT-SCOPE-20260822` / `PR31-UNIFIED-CUSTOM-AGENT-SCOPE-EDITOR`.
- Branch/base: `integration/UnifiedChungus-final` at `ac53fdda2470b2027b30c6df28b3e40852e8fdaa`; upstream `origin/UnifiedChungus`; concurrent dirty work remains preserved. No merge, rebase, or cherry-pick is active.
- Exact source/test ownership: `AgentManager.tsx`, its general and Jarvis-creator tests, this ledger, and this lock. The custom-agent editor is the smallest independent plan slice available while shared Composer/catalog/runtime/Schedule paths retain active ownership or uncommitted changes.
- Intent: hide editable provider/model and reasoning effort only for non-built-in agents, preserve historical stored values without a silent migration, offer only `Project` or `Workspace (approved computer folders)` for new scope choices, and state accurately that model/effort resolution happens at run time outside this editor. Built-in agent behavior and all route/provider/runtime code remain untouched.

## 2026-08-22 — Slice 4 implementation and verification checkpoint

- Root cause: `AgentManager` rendered provider/model/effort controls for every agent and rejected a save when any stored model was absent from the current catalog. That made legacy custom-agent route metadata both editable and capable of blocking unrelated custom-agent edits.
- Owned implementation: explicit custom-agent views now show a route-neutral run-model disclosure, remove the editable provider/model/reasoning-effort controls, and constrain new scope choices to `Project` and `Workspace (approved computer folders)`. Custom-agent saves intentionally omit `model`, `effort`, and `effort_custom`, preserving historical values through the repository merge. Built-in editor behavior remains in its existing branch.
- Fresh focused verification: `npx vitest run src/features/agents/AgentManager.jarvisCreator.test.tsx --reporter=verbose` — **4/4 passed**, exit 0; `npx vitest run src/features/agents/AgentManager.test.tsx -t "tracks skills, tools, capabilities, scope, toggles, and advanced fields for a custom agent" --reporter=verbose` — **1/1 selected passed**, exit 0 (2026-08-22 local).
- Broader test evidence: the full `AgentManager.test.tsx` run reached the new custom-agent test successfully but reported protected-JARVIS profile lifecycle failures because that protected built-in's stored route is rejected by existing live-catalog validation before its profile save. This occurs in the pre-existing built-in/provider-validation path, outside this slice's claimed custom-editor boundary; no runtime/catalog change was made here.
- Typecheck: `npm run typecheck` was started twice in `app/`, but this environment ended output at the 30-second command boundary before an exit result. It is therefore not claimed as passing. Native QA was not run; no browser substitute is claimed.

## 2026-08-22 — Slice 4 release

- Commit: `76eaebe1` (`feat(agents): make custom routes runtime-resolved`), limited to the claimed custom-agent editor, its two focused test files, and this ledger.
- Result: custom agents no longer expose editable route/effort controls, retain legacy route/effort fields on save, and offer only the approved Project/Workspace choices. This commit does not alter provider dispatch, the shared catalog, Context Gateway, or protected-JARVIS runtime behavior.
- Verification carried with the commit: custom route-neutral integration suite **4/4 passed**; focused preservation/scope lifecycle test **1/1 selected passed**; staged diff check passed. The broad protected-JARVIS lifecycle failures and non-completing full typecheck are retained as explicit branch-level blockers, not waived.
- Lock state: release only `VS-CODEX-ROOT-UNIFIED-CUSTOM-AGENT-SCOPE-20260822`; concurrent locks and shared dirty paths remain untouched.

## 2026-08-22 — Released model-picker integration claim

- Agent/task: `VS-CODEX-ROOT-PICKER-INTEGRATION-20260822` / `PR31-MODEL-PICKER-RELEASED-SLICE-INTEGRATION`.
- User explicitly requested the visible effort UI be committed and shown in the official app. The source/test path set was previously released by the model-picker search, collapsible-heading, and route-UI owners, but remains uncommitted in the shared worktree.
- Exact claimed integration scope: `ModelPickerTypeahead.tsx`, its smoke test, `useAccessibleChatModels.ts` and test, new `modelCatalogResponsePath.contract.test.ts`, this ledger, and this lock. Composer, `providerModelCatalog`, all active runtime/catalog/benchmark/news/context/native paths, credentials, inference, billing, and deployment remain excluded.
