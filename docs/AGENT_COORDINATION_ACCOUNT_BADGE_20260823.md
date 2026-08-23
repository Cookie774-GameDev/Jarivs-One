# Account “Local & private” badge repair — August 23

- Agent/task: `VS-CODEX-ACCOUNT-BADGE-20260823` / `PR31-ACCOUNT-LOCAL-PRIVATE-BADGE`.
- Base: `6c67256c` on `integration/UnifiedChungus-final`.
- Exact scope: Account presentation component, its existing portable-backup test, this record, and the lock.
- Boundary: layout-only correction. Backup, restore, account ownership, authentication, and cloud behavior remain unchanged.

## Verification checkpoint

- TDD reproduced the wrap: 1 focused failure because the badge lacked `whitespace-nowrap`; implementation adds only `shrink-0 whitespace-nowrap` to that status badge.
- Focused portable-backup suite passes 5/5 after the correction.
- Playwright Local on the live Account page measured the badge as `white-space: nowrap`, `flex-shrink: 0`, 109 × 27 px with the exact `Local & private` text.
