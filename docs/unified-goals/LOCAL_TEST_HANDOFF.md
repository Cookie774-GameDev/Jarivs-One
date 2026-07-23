# VibeSpace local test handoff

This handoff is for the isolated successor checkout only. It does not authorize
or perform a merge, deployment, release, live billing change, production
migration, or destructive operation against real user data.

## Repository

| Item                         | Value                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| Successor branch             | `codex/shared-intelligence-kernel-design-20260716`            |
| Tested handoff parent        | `127c11fe078b98791e6ec1d456c3dd64c175fa8f`                    |
| Handoff document revision    | This document's containing one-file commit                    |
| Base branch                  | `main`                                                        |
| Observed `origin/main`       | `65931c1cbb2982e6991238af45a3cf39702c7802`                    |
| Draft PR                     | [#30](https://github.com/Cookie774-GameDev/VibeSpace/pull/30) |
| PR state at handoff creation | `OPEN`, draft, base `main`, exact successor head              |
| Merge/deploy/release state   | Not merged, not deployed, not released                        |

The protected `integrate/grok-workbench-pr25-v2` checkout, the unrelated
`install/install.ps1` working-tree deletion, ten protected Rust edits, existing
VibeSpace instances, and production systems remain outside this branch's
handoff operations.

## Verified application state

The authoritative Task 22 record is
[`docs/testing/shared-intelligence-kernel-verification.md`](../testing/shared-intelligence-kernel-verification.md).
At the tested handoff parent:

- the complete application scope passed `412` files and `3,950` tests;
- the JARVIS library scope passed `60` files and `1,395` tests;
- TypeScript, production build, release manifest, Cargo checks/tests, launcher
  validation, focused security/runtime/migration suites, performance bounds,
  selector bounds, and all locally actionable native scenarios passed; and
- native STT and credential-free native CLI remain the exact external-only
  limitations described below rather than inferred passes.

Low-memory process controls used by the final evidence change only worker
allocation and heap size; they do not skip tests or relax assertions.

## Isolated test profile and real-data backup

The ignored handoff root is:

```text
.superpowers/sdd/local-handoff/
```

The empty isolated profile is:

```text
.superpowers/sdd/local-handoff/profile/
  AppData/
  LocalAppData/
```

The real `%APPDATA%\ai.jarvis.desktop` and
`%LOCALAPPDATA%\ai.jarvis.desktop` directories were copied read-only while no
VibeSpace/JARVIS process was running. The verified ignored backup is:

```text
.superpowers/sdd/local-handoff/backup-20260723T045947Z/
```

Verification matched source and destination exactly:

| Profile area |    Files |         Bytes | Copy result                       |
| ------------ | -------: | ------------: | --------------------------------- |
| Roaming      |     `69` | `911,194,825` | Robocopy code `1`; verified equal |
| Local        | `11,369` | `495,766,955` | Robocopy code `1`; verified equal |

The backup and test profile are excluded by `.gitignore`. They must never be
staged, uploaded, used as fixtures, or copied into PR evidence. The test
commands below never mount the backup or daily profile.

## Connected test services

| Service                       | Handoff state                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama                        | Loopback API reachable; Ollama `0.21.0`; free local `gemma4:e4b` and alias `gemma4:latest` installed; no model loaded until used                          |
| Supabase                      | No worktree `.env`; local CLI was not installed or started for this handoff; no production or staging mutation                                            |
| Stripe                        | No worktree `.env`; test fixtures remain test-mode only; no live object, charge, refund, or subscription mutation                                         |
| Deterministic kernel provider | Development-only native evidence provider verified and production-inaccessible                                                                            |
| GitHub                        | Successor branch pushed and draft PR #30 read back                                                                                                        |
| Browser/ChatGPT session       | No cookies, browser profile, or subscription session copied into the isolated profile; session-backed testing requires an explicit logged-in test session |

For ordinary chat testing, select the Ollama provider and `gemma4:e4b`.
Automated tests may continue to use deterministic mocks where their contract
requires fixed output. Do not substitute paid or live providers merely to make
a test pass.

## Feature flags for the isolated run

Use these process-local values for a safe manual handoff run:

```powershell
$env:VITE_ENABLE_VOICE = 'true'
$env:VITE_ENABLE_COUNCIL = 'true'
$env:VITE_ENABLE_CLOUD_SYNC = 'false'
$env:VITE_JARVIS_ADMIN = 'false'
$env:VITE_JARVIS_LOCAL_ADMIN = 'false'
```

Do not set `VITE_SIK_SMOKE`, `VIBESPACE_SIK_SMOKE`, production entitlement
overrides, live Stripe keys, or production Supabase credentials for ordinary
manual testing.

## Start command

Run this from the successor worktree in a new foreground PowerShell window.
It selects an unused loopback port, uses a distinct application identity,
keeps `APPDATA`, `LOCALAPPDATA`, and WebView2 below the ignored handoff
profile, and leaves the process attached to that shell.

```powershell
$Worktree = (Resolve-Path '.').Path
$Profile = Join-Path $Worktree '.superpowers\sdd\local-handoff\profile'
$AppData = Join-Path $Profile 'AppData'
$LocalAppData = Join-Path $Profile 'LocalAppData'
$WebViewData = Join-Path $Profile 'WebView2'
New-Item -ItemType Directory -Force -Path $AppData, $LocalAppData, $WebViewData | Out-Null

$Probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Probe.Start()
$Port = ([Net.IPEndPoint]$Probe.LocalEndpoint).Port
$Probe.Stop()

$env:APPDATA = $AppData
$env:LOCALAPPDATA = $LocalAppData
$env:WEBVIEW2_USER_DATA_FOLDER = $WebViewData
$env:VITE_ENABLE_VOICE = 'true'
$env:VITE_ENABLE_COUNCIL = 'true'
$env:VITE_ENABLE_CLOUD_SYNC = 'false'
$env:VITE_JARVIS_ADMIN = 'false'
$env:VITE_JARVIS_LOCAL_ADMIN = 'false'
$env:NODE_OPTIONS = '--max-old-space-size=1536'

$Overlay = @{
  identifier = 'ai.jarvis.desktop.handoff'
  app = @{ macOSPrivateApi = $true }
  build = @{
    devUrl = "http://127.0.0.1:$Port"
    beforeDevCommand = "npm run jarvis -- --host 127.0.0.1 --port $Port --strictPort"
  }
} | ConvertTo-Json -Depth 5 -Compress
$ConfigPath = Join-Path $Profile 'tauri-handoff-config.json'
[IO.File]::WriteAllText(
  $ConfigPath,
  $Overlay,
  (New-Object Text.UTF8Encoding($false))
)
$env:TAURI_CONFIG = $Overlay

npm --prefix app run tauri:dev -- --no-watch --config $ConfigPath
```

Use the Ollama provider and `gemma4:e4b` after startup. If the port loses its
race before Tauri starts, close the foreground command and rerun the complete
snippet to select a new port.

## Migration commands

Dexie/JARVIS v3 migration is additive and runs automatically on first launch
inside the empty isolated profile. It must not be run against or backfilled
from the daily profile.

No Supabase migration is required for local Ollama/UI testing. If the Supabase
CLI is installed later and a repository-local stack is explicitly needed, use
only:

```powershell
supabase start
supabase db reset --local
supabase test db
```

Confirm that the CLI reports a local project before running the reset. Never
drop, reset, link, push, or migrate a production database from this handoff.

## Stop owned services

The handoff leaves no hidden VibeSpace server, native app, browser driver, or
agent process running. The supported start command is foreground-only:

1. press `Ctrl+C` in its PowerShell window;
2. wait for the Tauri child and Vite child to exit; and
3. verify the exact worktree executable is absent before closing the shell.

Do not stop the pre-existing Ollama daemon or any unrelated VibeSpace process.
If the local model remains loaded after manual testing, release only that
model with:

```powershell
ollama stop gemma4:e4b
```

## Reset the isolated profile

Stop the foreground handoff app first. Then resolve and verify the target is a
strict descendant of `.superpowers/sdd/local-handoff/` before deleting only
the `profile` directory. Preserve the timestamped backup.

```powershell
$Worktree = (Resolve-Path '.').Path
$HandoffRoot = [IO.Path]::GetFullPath(
  (Join-Path $Worktree '.superpowers\sdd\local-handoff')
)
$Profile = [IO.Path]::GetFullPath((Join-Path $HandoffRoot 'profile'))
$Prefix = $HandoffRoot.TrimEnd('\') + '\'
if (-not $Profile.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to reset a profile outside the ignored handoff root.'
}
if (Test-Path -LiteralPath $Profile) {
  Remove-Item -LiteralPath $Profile -Recurse -Force
}
```

This reset removes only disposable test state. It does not restore, modify, or
delete the daily profile.

## Rollback

No production rollout occurred, so the immediate rollback is to stop the
foreground handoff process and continue using the existing untouched VibeSpace
instance. Do not reset Git history, merge the branch, or copy test-profile
state into the daily profile.

Component-level rollback requirements are frozen in:

- [`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md);
- [`shared-intelligence-kernel.md`](../architecture/shared-intelligence-kernel.md#run-transition-matrix);
- the MonoChrome and Sakura rollback documents recorded by their accepted
  phase plans.

Restoring the timestamped real-data backup would overwrite current user data
and is therefore a separate destructive action. This handoff intentionally
provides no automatic copy-back command; inspect and restore only after an
explicit user decision.

## Known external gates

1. `native_stt_voice_turn` is
   `BLOCKED_EXTERNAL: model_unavailable` until the real configured
   faster-whisper `small` model is installed and rerun.
2. Credential-free native CLI transport is `BLOCKED_EXTERNAL` under Windows
   App Control/code-signing until an accepted signed example can execute.
3. Supabase local migration/RLS commands require the Supabase CLI; no remote
   environment is needed for the Ollama/manual UI handoff.
4. A real ChatGPT subscription/browser-session test requires a logged-in test
   browser session; no credentials, cookies, or browser storage may be copied
   or faked.
5. Production deployment, merge to `main`, release publication, code signing,
   live Stripe mutation, production migration, and destructive real-data
   restore remain separate hard gates.

All other locally actionable Task 22 work is recorded in the verification
document and draft PR. External gates do not authorize weakening a product
check or representing an unavailable integration as PASS.
