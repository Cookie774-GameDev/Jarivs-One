# VibeSpace 0.1.46 — Ollama auto-connect, Jarvis creator, and local-model reliability

## Highlights

- **Ollama auto-connect** — desktop and web bootstrap Ollama before the model gate; retries on window focus; Tauri uses native `ollama_ping` only.
- **Jarvis creator** — create agents, skills, and schedules from natural language in chat.
- **Queued messages** — see and manage pending sends while a turn streams.
- **All About Me** — personal context in Settings for richer prompts.
- **Mock demo removed** — no mock provider in user-facing model pickers.
- **Single mode** — iconless Single stack toggle; Hive icon unchanged.

## Update behavior

This release promotes the production channel to **0.1.46**. Clients on **0.1.45** discover the new build on the normal Tauri updater check at app open.

## Install / update

```powershell
irm https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.ps1 | iex
```

## Assets

- **Windows x64 NSIS**: `VibeSpace-0.1.46-Windows-x64.exe`
- **Updater channel**: `releases/channel.json`
