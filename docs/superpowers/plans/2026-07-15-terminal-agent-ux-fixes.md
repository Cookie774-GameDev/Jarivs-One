# Terminal and Agent UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve live terminals across navigation, make scrollback and clipboard interaction reliable, and restore agent saving with an explicit automatic output-token mode.

**Architecture:** Keep the existing `PageRouter` instance mounted and let it render the existing Chat/Council node, so xterm and PTY components survive route changes. Isolate scroll-intent and clipboard behavior in small tested helpers, then relax only the agent validation case where the unavailable model assignment is unchanged.

**Tech Stack:** React 18, TypeScript, xterm.js 5.3, Zustand, Vitest, Testing Library, Tauri 2.

## Global Constraints

- Work in `C:\Users\viper\VibeSpace\.worktrees\integrate-grok-pr25-v2`, the exact branch running the open VibeSpace dev app.
- Preserve the pre-existing line-ending-only `app/src-tauri/Cargo.toml` modification and never stage it.
- Preserve all terminal PTY, command, pane, snapshot, scheduler, drag/drop, voice, context, clear, close, and resize behavior.
- Preserve `Ctrl+C` as terminal interrupt; add `Ctrl+Shift+C/V` on Windows/Linux and `Cmd+C/V` on macOS.
- Stage only the files listed in each task and push the verified commits to `origin/integrate/grok-workbench-pr25-v2`.

---

### Task 1: Preserve terminal canvases across Chat navigation

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/layout/PageRouter.tsx`
- Create: `app/src/App.activeCanvas.test.tsx`

**Interfaces:**
- Consumes: `useUIStore.route`, existing Chat/Council React nodes, and `PageRouter`'s cached terminal surface.
- Produces: `PageRouter({ chatPage?: React.ReactNode })` and an exported `ActiveCanvas` whose component identity stays stable across route changes.

- [ ] **Step 1: Write the failing navigation regression test**

Create `App.activeCanvas.test.tsx` that mocks `TerminalsPage` and `ChatView`, renders `ActiveCanvas` on the terminal route, switches Terminal -> Chat -> Terminal through `useUIStore`, and asserts the same terminal DOM node remains connected and is revealed again.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix app run test -- src/App.activeCanvas.test.tsx`

Expected: FAIL because `ActiveCanvas` is not exported and/or because the terminal node is unmounted on the Chat route.

- [ ] **Step 3: Implement the persistent parent routing**

Export `ActiveCanvas`, construct its existing Chat/Council node, and always return:

```tsx
return <PageRouter chatPage={chatPage} />;
```

Add the optional `chatPage` prop to `PageRouter` and render it when `visibleRoute === 'chat'`, falling back to the current lazy `ChatRoute` only when the prop is absent. Do not alter the existing terminal visibility event or cached-surface wrappers.

- [ ] **Step 4: Run the navigation tests**

Run: `npm --prefix app run test -- src/App.activeCanvas.test.tsx src/components/layout/PageRouter.terminals.test.tsx`

Expected: both files PASS and the terminal node identity remains stable.

- [ ] **Step 5: Commit**

```powershell
git add -- app/src/App.tsx app/src/components/layout/PageRouter.tsx app/src/App.activeCanvas.test.tsx
git commit -m "fix: preserve terminals across navigation"
```

### Task 2: Make terminal scroll and clipboard interaction reliable

**Files:**
- Modify: `app/src/features/terminals/terminalViewport.ts`
- Modify: `app/src/features/terminals/terminalViewport.test.ts`
- Create: `app/src/features/terminals/terminalClipboard.ts`
- Create: `app/src/features/terminals/terminalClipboard.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`

**Interfaces:**
- Consumes: xterm `getSelection()`, `paste()`, `attachCustomKeyEventHandler()`, browser `navigator.clipboard`, and the existing `userHasScrolledRef`.
- Produces: `handleTerminalClipboardKey(event, terminal, clipboard): boolean` and `applyTerminalFollowScroll(term, { getUserHasScrolled }): void`.

- [ ] **Step 1: Write failing live-scroll tests**

Update `terminalViewport.test.ts` so `applyTerminalFollowScroll` receives a getter. Include a test that changes the getter result from `false` to `true` before invocation and verifies neither `scrollToTop` nor `scrollToBottom` is called.

- [ ] **Step 2: Run the scroll tests to verify failure**

Run: `npm --prefix app run test -- src/features/terminals/terminalViewport.test.ts`

Expected: FAIL because the helper still accepts a captured boolean.

- [ ] **Step 3: Implement live scroll-intent reads**

Change the helper options to:

```ts
opts: { getUserHasScrolled: () => boolean }
```

Read the getter inside `applyTerminalFollowScroll`, and pass `() => userHasScrolledRef.current` from the xterm write completion callback. Remove the stale pre-write `followUserScrolled` capture and do not reset the ref after the callback.

- [ ] **Step 4: Write failing clipboard tests**

Create `terminalClipboard.test.ts` covering Windows/Linux copy and paste, macOS copy and paste, empty selections, clipboard rejection, unrelated keys, and `Ctrl+C` without Shift returning `true` so xterm still receives SIGINT.

- [ ] **Step 5: Run clipboard tests to verify failure**

Run: `npm --prefix app run test -- src/features/terminals/terminalClipboard.test.ts`

Expected: FAIL because `terminalClipboard.ts` does not exist.

- [ ] **Step 6: Implement and install the clipboard handler**

Implement `handleTerminalClipboardKey` so recognized clipboard shortcuts return `false`, copy non-empty xterm selections with `writeText`, paste non-empty `readText` results through `term.paste`, swallow clipboard promise rejection, and return `true` for all other terminal keys. Install it immediately after `term.open(containerEl)`:

```ts
term.attachCustomKeyEventHandler((event) =>
  handleTerminalClipboardKey(event, term!, navigator.clipboard),
);
```

- [ ] **Step 7: Run focused terminal tests**

Run: `npm --prefix app run test -- src/features/terminals/terminalViewport.test.ts src/features/terminals/terminalClipboard.test.ts src/features/terminals/terminalInputPersistence.test.ts`

Expected: all files PASS, including bracketed-paste persistence coverage.

- [ ] **Step 8: Commit**

```powershell
git add -- app/src/features/terminals/TerminalView.tsx app/src/features/terminals/terminalViewport.ts app/src/features/terminals/terminalViewport.test.ts app/src/features/terminals/terminalClipboard.ts app/src/features/terminals/terminalClipboard.test.ts
git commit -m "fix: restore terminal scroll and clipboard control"
```

### Task 3: Restore agent saving and expose automatic output tokens

**Files:**
- Modify: `app/src/features/agents/AgentManager.tsx`
- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify: `app/src/types/agent.ts`

**Interfaces:**
- Consumes: the current draft/baseline model assignment and existing `agentRepo.update` persistence.
- Produces: `Agent.max_output_tokens?: number | null`, save validation that accepts unchanged unavailable models, and explicit `Use provider default` / `Custom limit` UI modes.

- [ ] **Step 1: Write failing agent regressions**

Add tests that disconnect the base agent's Google provider, edit only its name, and expect Save to enable and persist. Add tests that select `Use provider default` and expect `max_output_tokens: null`, then select `Custom limit`, enter `4096`, and expect `4096` to persist.

- [ ] **Step 2: Run the agent tests to verify failure**

Run: `npm --prefix app run test -- src/features/agents/AgentManager.test.tsx`

Expected: FAIL because the disconnected stored model disables Save and the explicit token mode does not exist.

- [ ] **Step 3: Implement minimal validation and token-mode changes**

Keep `agentModelAvailable` for catalog display. Add `modelAssignmentUnchanged` by comparing draft and baseline provider choice/provider/model, and validate with:

```ts
if (!agentModelAvailable && !modelAssignmentUnchanged) {
  return 'Select an available model before saving.';
}
```

Persist `max_output_tokens: currentDraft.max_output_tokens`, allow `null` in the Agent type, and replace the implicit blank number field with a mode select. Choosing default sets `null`; choosing custom from null sets `4096`; show the positive integer input only in custom mode.

- [ ] **Step 4: Run focused agent tests**

Run: `npm --prefix app run test -- src/features/agents/AgentManager.test.tsx src/features/agents/AgentManager.jarvisCreator.test.tsx src/lib/ai/router.test.ts`

Expected: all files PASS and existing provider routing coverage stays green.

- [ ] **Step 5: Commit**

```powershell
git add -- app/src/features/agents/AgentManager.tsx app/src/features/agents/AgentManager.test.tsx app/src/types/agent.ts
git commit -m "fix: restore agent saving defaults"
```

### Task 4: Verify and publish the running branch

**Files:**
- Verify all committed files from Tasks 1-3.
- Preserve: `app/src-tauri/Cargo.toml` remains unstaged.

**Interfaces:**
- Consumes: the completed commits and current running branch.
- Produces: fresh verification evidence and a fast-forward push to `origin/integrate/grok-workbench-pr25-v2`.

- [ ] **Step 1: Run focused regression tests**

Run all test files named in Tasks 1-3 together and require zero failures.

- [ ] **Step 2: Run repository checks**

Run:

```powershell
npm run typecheck
npm run test:release-manifest
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Expected: every command exits `0`.

- [ ] **Step 3: Retry the complete Vitest suite quietly**

Run: `npm --prefix app run test -- --reporter=basic`

Expected: zero failed tests. If the Windows runner again exceeds the tool timeout without reporting an assertion failure, report that limitation separately and do not misstate it as a pass.

- [ ] **Step 4: Audit scope**

Run `git status --short`, `git diff origin/integrate/grok-workbench-pr25-v2...HEAD --stat`, and `git log --oneline origin/integrate/grok-workbench-pr25-v2..HEAD`. Confirm only planned files are committed and `app/src-tauri/Cargo.toml` is still unstaged.

- [ ] **Step 5: Push the existing branch**

Run: `git push origin HEAD:integrate/grok-workbench-pr25-v2`

Expected: the remote branch advances to the verified final commit without creating a new PR.
