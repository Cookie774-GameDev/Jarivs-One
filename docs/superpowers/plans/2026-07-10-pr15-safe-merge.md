# PR #15 Safe Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge current `main` into PR #15, preserve all compatible current and PR functionality, pass the complete release-quality verification matrix, merge PR #15 normally, and verify final `main`.

**Architecture:** Work in an isolated worktree tracking `cursor/vibespace-launch-polish-6d99`. Protect the pre-merge state with a remote backup branch, use read-only ancestry and merge-tree analysis to enumerate conflicts before locking files, resolve each conflict from behavior/history rather than blanket ours/theirs selection, and block push or merge on any unresolved required check.

**Tech Stack:** Git/GitHub, npm/Vite/Vitest/TypeScript, Tauri/Rust/Cargo, static GitHub Pages HTML/CSS/JavaScript, Supabase Edge Functions/Postgres migrations, Stripe integration source.

## Global Constraints

- Never force-push, overwrite `main`, or blindly accept conflicts.
- Preserve current `main` website/domain, VibeSpaceOs.com, phone/call, Stripe/Supabase, and app changes.
- Preserve compatible PR #15 features and merged PR #16 scheduled-action recovery.
- Do not deploy Supabase, mutate Stripe, change billing behavior without approval, hide failures, or merge before required checks pass.
- Lock every file before editing and release all locks when finished.
- Record exact conflict decisions, commands, results, final SHA, and remaining risks.

---

### Task 1: Protect and inventory repository state

**Files:**
- Modify: `docs/AGENT_COORDINATION.md`
- Create: `docs/superpowers/plans/2026-07-10-pr15-safe-merge.md`

- [ ] Confirm backup branch `backup/main-before-pr15-merge-20260710-agent1` equals `origin/main`.
- [ ] Record Agent ID, branch, base SHA, scope, active tasks, and initial locks.
- [ ] Inspect branch graph, PR #16 merge ancestry, recent domain/website/phone/Stripe/Supabase/app commits, and changed-file sets.
- [ ] Run `git merge-tree` to enumerate conflicts without mutating the branch.
- [ ] Add exact lock rows for every conflict file before merging.

### Task 2: Merge current main into PR #15

**Files:**
- Modify: only files listed by the conflict inventory plus coordination records.

- [ ] Run `git merge --no-ff origin/main` from the isolated PR #15 worktree.
- [ ] For each conflict, inspect stage 1/2/3 blobs, relevant commits, callers, tests, and user-visible behavior.
- [ ] Preserve newer main website/domain/phone/billing behavior and compatible PR #15 behavior in the resolved result.
- [ ] Confirm PR #16 commits and schedule retry test remain ancestors/present.
- [ ] Review the complete merge diff and commit the merge without rewriting history.

### Task 3: Restore approved website follow-up

**Files:**
- Modify only after adding locks: `site/index.html`, `site/download.html`, `site/download/index.html`.

- [ ] Compare the original checkout's uncommitted website follow-up against the merged branch.
- [ ] Apply only compatible clean-route/homepage download improvements.
- [ ] Validate local references and preserve all current `main` site behavior.

### Task 4: Run required verification

**Files:**
- Modify only if a merge-caused failure is diagnosed and its file is locked first.

- [ ] Install exact dependencies with `npm ci`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm --prefix app run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:release-manifest`.
- [ ] Run `cargo check --manifest-path app/src-tauri/Cargo.toml --release`.
- [ ] Run `cargo test --manifest-path app/src-tauri/Cargo.toml --lib`.
- [ ] Discover and run repository installer parser/validation tests.
- [ ] Discover and run site build/link checks; serve the site and verify desktop/mobile layouts plus browser console errors.
- [ ] Run repository secret scans and inspect changed Stripe/Supabase code against signature, JWT, RLS, authorization, idempotency, and secret-handling requirements.
- [ ] Record PASS, FAIL, or SKIPPED with exact evidence; fix only merge-caused failures after locking affected files.

### Task 5: Publish and verify final main

**Files:**
- Modify: `docs/AGENT_COORDINATION.md`.

- [ ] Finalize conflict decisions and verification evidence in the coordination record.
- [ ] Push the PR #15 branch normally with no force.
- [ ] Confirm GitHub checks and mergeability, then merge PR #15 normally into `main` only if every required gate passes.
- [ ] Fetch final `main` and verify website/domain, phone/call, PR #15, and PR #16 commit/file evidence.
- [ ] Record final merge SHA and remaining risks.
- [ ] Release every Agent 1 lock and mark the task complete.
