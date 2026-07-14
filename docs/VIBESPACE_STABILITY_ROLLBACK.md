# VibeSpace Stability Rollback

Use normal `git revert` in a new recovery branch. Never reset or clean the protected primary checkout. Revert newest to oldest and rerun the affected focused tests after every revert.

## Logical revert order

1. `db88ef1` — redundant Skills navigation row
2. `ccab985` — workspace resource menus and Agent insertion
3. `d059c64` — resource router, right-drag, Composer, and terminal insertion
4. `f6b9b93` — shared real voice controller/lease and Pet bridge
5. `a04482d` — Pet presentation of existing terminal sessions
6. `eb4b0bb` — shared chat title editing
7. `9cf0205` — compact Pet mini-panel
8. `e668f85` — safe Pet defaults and controls
9. `34e16db` — truthful bounded Jarvis metrics
10. `f4dc318` — Agent editor persistence guard
11. `f419e25` — built-in Terminal Fleet tool integration
12. `36c0c56` — native executable availability discovery
13. `41063cb` — Terminal Fleet planning/store/queue
14. `2dc721e` — terminal refit/navigation stability
15. `eb4b26a` — implementation-plan documentation only

Example:

```powershell
git switch -c recovery/revert-vibespace-stability
git revert db88ef1
npm --prefix app run test -- --run --pool=threads --maxWorkers=1 src/components/layout/NavPane.test.tsx
```

Continue one commit at a time only when the preceding revert and its checks are understood.

## Local-state cleanup

- Do not delete user terminal snapshots, chats, Agent data, or Pet settings as part of source rollback.
- If a Fleet/activity schema fallback is required, ignore unsupported bounded local fields and let existing stores apply their documented defaults. Do not bulk-clear local storage.
- If native executable discovery is unavailable after rollback, the feature-safe fallback is “availability unknown/unavailable”; never guess, install, or execute a CLI.
- If voice bridge capability is unavailable, keep Pet auto-send off and use the main Voice UI. Never create a second backend.

## Post-rollback checks

Verify exact chat IDs and PTY session IDs remain unchanged, terminals do not respawn merely from navigation, Pet terminal slots remain presentations only, no resource drop submits a command, and no cloud/billing/auth path changed. Record any user-visible local-state migration before shipping a rollback.
