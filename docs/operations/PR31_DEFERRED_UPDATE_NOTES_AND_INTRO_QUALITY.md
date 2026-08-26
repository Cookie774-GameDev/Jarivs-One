# PR31 Deferred Update, Release Notes, and Intro Quality

## Identity and ownership

- Agent/task: `VS-CODEX-DEFERRED-UPDATES-INTRO-20260825` / `PR31-DEFERRED-UPDATES-RELEASE-NOTES-INTRO-QUALITY`
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`
- Branch/upstream: `integration/UnifiedChungus-final` / `origin/UnifiedChungus`
- Base HEAD: `e9c9309246bff379aec9078cae9b379295e4521d`
- Owned files: the exact update/intro source and tests listed in the matching agent lock; no app-core, native lifecycle, live process, deployment, or release-asset mutation.

## Root-cause evidence

1. `UpdateWarningHost` discards updater notes and starts a one-hour countdown that eventually installs and relaunches without a natural-close decision.
2. The automatic-update preference currently suppresses the update check itself, so users who disable automatic installation receive no availability notice.
3. `checkForAppUpdate({ install: true })` couples download, install, persistence, and immediate relaunch; it has no downloaded/staged state for a close-triggered install.
4. The official Tauri v2 updater supports separate `download()` and `install()` operations. Its documentation states that immediate restart is optional; on Windows, executing `install()` exits the app because of installer limitations.
5. The bundled intro is a verified 3840x2160, 6.000-second H.264/AAC asset (~12.23 Mbps video, ~193 kbps audio). The native intro window is already fullscreen with the no-user-gesture autoplay policy, but the view uses `contain` and starts from competing declarative and imperative autoplay paths.

Official updater reference: https://v2.tauri.app/plugin/updater/

## Acceptance criteria

- Every production desktop user is checked for and notified of a newer signed release, independent of the automatic-install preference.
- A newly detected version is announced once with the standard notification SFX and displays the exact version plus bounded, renderer-safe release notes (or a truthful release-page fallback).
- Automatic updates download in the background, never run a forced countdown, and install only when the user next closes the main window; manual “Update now” remains available.
- Failed download/install states are explicit, sanitized, retryable, and never claim staging/install success.
- Intro uses the bundled 4K source, fills the fullscreen intro surface at native quality, has one deterministic immediate playback path, preserves authored audio, and retains the hard fail-open handoff.
- No VibeSpace desktop app launch, UI control, hosted mutation, or unrelated source edit is performed.

## Test matrix

| Area           | Required evidence                                                     | Result                 |
| -------------- | --------------------------------------------------------------------- | ---------------------- |
| Update check   | Auto-install off still receives availability result/UI                | PASS — focused Vitest  |
| Notification   | New version plays one notification SFX and dispatches version + notes | PASS — focused Vitest  |
| Repeat check   | Same version does not repeat SFX/download/session                     | PASS — focused Vitest  |
| Staging        | Separate updater `download()` completes before “ready on close”       | PASS — focused Vitest  |
| Natural close  | Main close and tray exit install only a fully prepared update         | PASS — focused Vitest  |
| Manual update  | Update-now path remains explicit and safe                             | PASS — type contract   |
| Failures       | Raw updater errors are not logged/rendered; retry is offered          | PASS — security test   |
| Release notes  | Exact bounded notes and release link/fallback are visible             | PASS — focused Vitest  |
| Intro asset    | ffprobe confirms 4K/6s H.264 + AAC                                    | PASS (static metadata) |
| Intro viewport | Fullscreen fill and preload/playback contract                         | PASS — focused Vitest  |
| Intro recovery | timeout, playback failure, and triple-Escape handoff                  | PASS — focused Vitest  |
| Broad checks   | Focused tests, typecheck, build, diff and secret scan                 | PARTIAL — see evidence |

## Risks and rollback

- Tauri updater resources are process-local; an interrupted download is safely retried after restart.
- Windows exits when `install()` launches the signed installer. macOS/Linux need an explicit process exit after close-triggered installation so the next launch uses the new build.
- `cover` maximizes the 16:9 intro on non-16:9 monitors by cropping edges; it avoids letterboxing and never down-selects the 4K source.
- Rollback is the single owned commit produced by this task; no updater keys, manifests, deployed artifacts, or native lifecycle files are changed.

## Evidence and commits

- Starting HEAD: `e9c9309246bff379aec9078cae9b379295e4521d`
- Result commit(s): pending
- Automated evidence: 6 focused files / 23 tests PASS; Vite production build PASS with 4,981 modules; full TypeScript has no owned diagnostic and remains non-green only on four pre-existing active SiYuan test nullability diagnostics. Exact diff and staged secret scan are pending.
- Native/manual evidence: not run by explicit user instruction
