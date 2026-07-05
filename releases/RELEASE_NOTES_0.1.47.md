# VibeSpace 0.1.47 — Official production release

## Highlights

This is the **official `main` release** shipping everything accumulated since v0.1.45:

- **Ollama auto-connect** — bootstrap before auth gates; focus retries; Tauri native ping only.
- **Jarvis creator** — agents, skills, and schedules from natural language in chat.
- **Queued messages** — visible send queue while a turn streams.
- **All About Me** — personal context in Settings for richer prompts.
- **Chat activity timeline** — in-thread agent/tool activity.
- **Vision chat** — image attachments with provider routing.
- **Global composer STT** — toolbar mic, interim editor, volume meter.
- **Schedule Jarvis actions** — event-backed recurring tasks.
- **Mock demo removed** from user-facing model pickers.
- **Single stack mode** — iconless toggle; Hive icon unchanged.

## Update behavior

Production channel promotes to **0.1.47**. Clients on **0.1.45** or **0.1.46** discover the build on the normal Tauri updater check at app open.

## Install / update

```powershell
irm https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.ps1 | iex
```

## Assets

- **Windows x64 NSIS**: `VibeSpace-0.1.47-Windows-x64.exe`
- **Updater channel**: `releases/channel.json`
