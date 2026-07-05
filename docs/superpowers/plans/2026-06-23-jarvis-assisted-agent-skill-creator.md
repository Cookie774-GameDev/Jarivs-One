# Jarvis-Assisted Agent And Skill Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-panel Jarvis-assisted flow that drafts agents and skills from five quick written answers, fills the existing editors, and leaves final persistence to the user's existing Save action.

**Architecture:** A focused `jarvis-creator` feature owns prompt text, draft parsing, validation, and browser events. `AgentManager`, `SkillsPage`, and `SkillEditor` only add small entry/apply hooks. `Inspector` reuses the current Jarvis tab and chat storage to preload a helper message; no new Supabase tables, Stripe webhooks, or backend gates are added.

**Tech Stack:** React, Zustand, Dexie chat/message repositories, existing Agent and Skills stores, Vitest + Testing Library.

---

### Task 1: Shared Creator Contract

**Files:**
- Create: `app/src/features/jarvis-creator/contracts.ts`
- Test: `app/src/features/jarvis-creator/contracts.test.ts`

- [ ] Write RED tests for agent and skill draft parsing from Jarvis JSON blocks.
- [ ] Implement typed draft schemas, five-question prompt builders, and safe parser helpers.
- [ ] Verify malformed Jarvis output returns a typed error without throwing into UI render.

### Task 2: Inspector Jarvis Handoff

**Files:**
- Modify: `app/src/components/layout/Inspector.tsx`
- Test: `app/src/components/layout/Inspector.jarvisCreator.test.tsx`

- [ ] Write RED tests for `jarvis:creator:start` opening Inspector → Jarvis.
- [ ] Create/select a scoped helper chat titled `Create agent with Jarvis` or `Create skill with Jarvis`.
- [ ] Insert one assistant preload message containing the five written questions and JSON return contract.

### Task 3: Agent Editor Integration

**Files:**
- Modify: `app/src/features/agents/AgentManager.tsx`
- Test: `app/src/features/agents/AgentManager.jarvisCreator.test.tsx`

- [ ] Write RED tests for `Create with Jarvis` button visibility.
- [ ] Dispatch the creator start event for `agent`.
- [ ] Listen for validated agent draft apply events and fill name, description, system prompt, capabilities/tools where supported.
- [ ] Keep `Save` explicit and preserve existing provider/model behavior.

### Task 4: Skills Editor Integration

**Files:**
- Modify: `app/src/features/skills/SkillsPage.tsx`
- Modify: `app/src/features/skills/SkillEditor.tsx`
- Modify: `app/src/features/skills/skillsStore.ts`
- Test: `app/src/features/skills/SkillsPage.jarvisCreator.test.tsx`
- Test: `app/src/features/skills/SkillEditor.jarvisCreator.test.tsx`

- [ ] Write RED tests for `Create with Jarvis` entry from the skills library.
- [ ] Create/select a custom skill draft, then dispatch the creator start event for `skill`.
- [ ] Listen for validated skill draft apply events and fill title, description, tools, runtime instructions, and markdown body.
- [ ] Keep existing custom skill persistence and `Save` semantics unchanged.

### Task 5: Verification

**Commands:**
- `npm run test -- --run src/features/jarvis-creator src/features/agents src/features/skills src/components/layout/Inspector.jarvisCreator.test.tsx`
- `npm run typecheck`
- `npm run build`

- [ ] Record focused test results in `docs/AGENT_COORDINATION.md`.
- [ ] If full `npm run test` is run, record any unrelated pre-existing failures separately.
