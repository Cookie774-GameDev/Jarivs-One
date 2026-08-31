# PR31 Account Center Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete five unlocked PR31 Account Center queue requirements with truthful identity, security, usage, support, and responsive presentation behavior.

**Architecture:** Extend the existing Account route only. Profile and security continue to use `useAuthStore` and the configured Supabase auth client; status continues to use `StatusDashboard` plus `getCombinedUsage`; support continues to use the Tauri `openExternal` boundary. No duplicate store, billing authority, session authority, or telemetry path is introduced.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind/CSS, Supabase auth boundary, Tauri external-link bridge.

**Spec:** `qeue.md` rows 33, 35, 36, 38, and 40, governed by `00-FINAL-PR31-JARVIS-CAO-MD-NATIVE-APPS-GOAL-PROMPT.md`.

## Global Constraints

- Preserve all active locks, staged/unstaged files, processes, credentials, billing data, deployments, and production services.
- Never invent security, usage, billing, support, or account truth.
- No Stripe mutation and no new auth/session/data store.
- Every product behavior starts with a focused failing test and the expected failure is recorded.
- Official acceptance uses Playwright attached to the official Tauri WebView only, after exclusive native-controller ownership is proven.
- Queue rows are updated once after exact automated and required native evidence exists.

---

### Task 1: Profile identity and supported account security

**Files:**
- Modify: `app/src/features/settings/sections/Account.tsx`
- Modify: `app/src/features/settings/sections/Account.profile.test.tsx`
- Modify: `app/src/features/account/AccountSecurityPanel.tsx`
- Modify: `app/src/features/account/AccountSecurityPanel.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` cloud session/local identity and `getSupabaseClient().auth.updateUser`.
- Produces: plain-language local namespace presentation and account-scoped security/session presentation without exposing secrets.

- [ ] **Step 1: Add focused failing identity tests**

Assert that the local ID is described as an offline data-ownership namespace, explicitly says it is not a password or recovery secret, retains copy behavior, and uses readable icon-led section headings.

- [ ] **Step 2: Run the identity tests and record RED**

Run: `npm --prefix app test -- --run src/features/settings/sections/Account.profile.test.tsx`

Expected: assertions fail because the current ID presentation lacks the required explanation/hierarchy.

- [ ] **Step 3: Implement the minimal profile presentation**

Reuse the current local ID and profile markup; add no store or generated identifier. Preserve the stable `Local & private` badge contract.

- [ ] **Step 4: Add focused failing security tests**

Assert that signed-in security shows the active identity/session boundary, password change remains available only with a cloud session, signed-out state offers no mutation, and account switching clears pending secret/status state.

- [ ] **Step 5: Run the security tests and record RED**

Run: `npm --prefix app test -- --run src/features/account/AccountSecurityPanel.test.tsx`

Expected: new identity/session assertions fail while existing password authority remains green.

- [ ] **Step 6: Implement supported security truth**

Read current session identity from `useAuthStore`; keep password mutation on Supabase `auth.updateUser`; show honest unavailable/signed-out copy and no unsupported session-management controls.

- [ ] **Step 7: Run focused and adjacent tests**

Run both Task 1 test files and the portable-backup Account test. Expected: zero failures.

- [ ] **Step 8: Commit exact Task 1 files**

Use `git commit --only` with the four Task 1 paths so the inherited cached index is unchanged.

### Task 2: Usage freshness, support actions, and Account route presentation

**Files:**
- Modify: `app/src/features/account/AccountPage.tsx`
- Modify: `app/src/features/account/AccountPage.identity.test.tsx`
- Create if needed: `app/src/features/account/AccountPage.statusSupport.test.tsx`
- Modify: `app/src/features/account/sakura-account.css`
- Modify: `app/src/features/account/sakura-account.appearance.test.ts`

**Interfaces:**
- Consumes: `getCombinedUsage`, `useAuthStore`, existing `StatusDashboard`, `openExternal`, and Account tabs.
- Produces: account-bound usage freshness/stale/unavailable projection and verified support navigation/copy actions.

- [ ] **Step 1: Add focused failing usage tests**

Assert no cloud usage without a cloud account, account-switch isolation, checked-at evidence after success, last-verified stale evidence after refresh failure, and truthful unavailable state when no verified receipt exists.

- [ ] **Step 2: Run usage tests and record RED**

Run: `npm --prefix app test -- --run src/features/account/AccountPage.identity.test.tsx src/features/account/AccountPage.statusSupport.test.tsx`

Expected: freshness/stale assertions fail against the current binary success/error projection.

- [ ] **Step 3: Implement minimal usage receipt projection**

Keep the current account-generation cancellation guard. Add checked-at state only after current-account success; retain last verified data on refresh failure with explicit stale copy; clear data and timestamps immediately on account change.

- [ ] **Step 4: Add failing Support and presentation tests**

Assert purposeful labels, the canonical documentation/download/license destinations, accessible copy actions, readable icon-led headings, narrow-width containment, keyboard focus, forced-color boundaries, and reduced-motion behavior.

- [ ] **Step 5: Implement Support and style repairs**

Reuse `openExternal`, clipboard fallback, `PanelCard`, and the existing Account CSS. Do not add remote calls, hard-coded billing claims, or another navigation mechanism.

- [ ] **Step 6: Run Task 2 focused and appearance tests**

Expected: zero failures and no unhandled React warnings introduced by the owned changes.

- [ ] **Step 7: Commit exact Task 2 files**

Use `git commit --only` with only the helper-owned paths; preserve the inherited cached index.

### Task 3: Milestone integration and official-native acceptance

**Files:**
- Modify once: `qeue.md` rows 33, 35, 36, 38, and 40
- Append only: `docs/AGENT_COORDINATION.md`

**Interfaces:**
- Consumes: immutable Task 1 and Task 2 commits and the official native Account route.
- Produces: queue evidence with exact commit SHAs, automated results, and native evidence or a narrowly proven native-controller blocker.

- [ ] **Step 1: Run affected Account matrix**

Run all Account feature/settings tests, TypeScript typecheck, production build, exact Prettier check, `git diff --check`, and scoped Gitleaks. Record exact pass/failure counts.

- [ ] **Step 2: Prove native-controller exclusivity**

Inspect live native locks, `jarvis.exe`, CDP listeners, and the coordination ledger. Do not attach or launch if another owner remains active.

- [ ] **Step 3: Exercise the official Account workflow**

On one immutable SHA, verify profile hierarchy, local-ID explanation/copy, signed-out and signed-in security boundaries, password form cancellation without mutation, usage success/stale/unavailable/account-switch states, Support actions, narrow width, keyboard focus, forced colors, and reduced motion.

- [ ] **Step 4: Update Queue and coordination once**

Check only requirements supported by fresh automated and official-native evidence. If native control remains unavailable, record the exact blocker and leave native-dependent rows unchecked.

- [ ] **Step 5: Commit exact evidence metadata and release own locks**

Commit only `qeue.md` and owned documentation if changed. Release only the two Account milestone locks after recording final SHAs and results.
