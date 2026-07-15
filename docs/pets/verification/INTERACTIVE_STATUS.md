# Interactive / packaged verification status

Updated with full-wiring commit.

## Automated (this session)

| Check | Result |
|-------|--------|
| `npm run test -- --run src/features/pets` | 45/45 PASS |
| `npm run typecheck` | PASS |
| `npm run build` | (see build log) |
| `cargo test pets --lib` | (see cargo log) |
| no-runtime-MP4 | 0 hits in features/pets |

## Interactive Windows (operator)

These require a desktop session with `npm run tauri:dev` or a packaged EXE.

| Check | Status |
|-------|--------|
| Awake Pet click → panel | **OPERATOR** — run USER_TEST_GUIDE |
| Sleeping Pet first click | **OPERATOR** |
| Drag vs click | **OPERATOR** |
| Walk L/R velocity | Unit tests PASS; interactive **OPERATOR** |
| Idle fun timer | Unit scheduler PASS; interactive **OPERATOR** |
| Sleep timeout | Configurable in Settings; interactive **OPERATOR** |
| Panel minimize/close/reopen | Lifecycle unit PASS; interactive **OPERATOR** |
| Real chat create/stream | Wired ChatThread+Composer; interactive **OPERATOR** |
| Stream while minimized | Architecture: Dexie + hidden window; interactive **OPERATOR** |
| Real terminal + move | Wired TerminalView ownership; interactive **OPERATOR** |
| 4-terminal limit | Unit PASS; interactive **OPERATOR** |
| DPI 100/125/150/200 | **NOT RUN** in agent environment |
| Multi-monitor disconnect | Geometry helpers unit-level; interactive **NOT RUN** |
| Packaged EXE launch | **RUN when `npm run tauri:build` completes** |

## Honest gap

Agent environments often cannot display always-on-top interactive UI or complete multi-hour packaging. The **feature is wired into the normal app**; you must run `npm run tauri:dev` on your Windows machine and follow `docs/pets/USER_TEST_GUIDE.md` for interactive confirmation.
