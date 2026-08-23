# Top-bar appearance picker removal — August 23

- Agent/task: `VS-CODEX-TOPBAR-THEME-PICKER-20260823` / `PR31-TOPBAR-THEME-PICKER-REMOVAL`.
- Base: `6f03dd04` on `integration/UnifiedChungus-final`.
- Exact scope: `TopBar.tsx`, its existing voice/shell test, this record, and the agent lock.
- Boundary: remove only the visible quick picker from the top bar. Preserve the appearance component contract, Settings appearance controls, saved theme state, document theme application, and chat `/appearance` behavior.

## Verification checkpoint

- Focused `TopBar.voiceSmoke.test.tsx`: 8/8 passed, including the new absence contract.
- Playwright Local at `http://localhost:5173/?route=account`: application header has zero `App appearance` groups and no quick-theme labels.
- Playwright then opened Settings → Appearance and confirmed the `App theme` radio group still contains Jarvis One, Default, MonoChrome, and Warm, with the previously selected Default state preserved.
- No appearance store, sync, Settings implementation, component contract, or slash-command file was edited.
