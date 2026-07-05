# VibeSpace 0.1.43 — Composer STT, workspace flush, and Hive polish

## Highlights

- **Composer dictation** — local faster-whisper speech-to-text for hands-free prompting.
- **StackPicker** — Hive preset picker for Fast / Balanced / Quality / High pipelines.
- **Workspace flush** — persistence saved on hide, shutdown, and before in-app updates.
- **Terminal + voice** — routing improvements and streaming voice fixes.
- **Windows installer** — UTF-8-safe `install.ps1` rewrite (hotfix on main).
- **Local models** — expanded support from parallel Space Worker sessions.

## Update behavior

This release updates the production channel to **0.1.43**. Clients on **0.1.42** discover the new build on the normal Tauri updater check at app open.

## Install / update

```powershell
irm https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.ps1 | iex
```

## Assets

- **Windows x64 NSIS**: `VibeSpace-0.1.43-Windows-x64.exe`
- **Updater channel**: `releases/channel.json`
