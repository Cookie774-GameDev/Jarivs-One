# VibeSpace 0.1.48 — Scheduled Jarvis Actions run for real

## Highlights (batch 2 — launch blockers)

- **One-approval terminal orchestration** — `terminal.orchestrate` handles "close all terminals, open 10 with Claude Code, five as code agents and five as reviewers with these prompts" as a single approval card. Role prompts are delivered through the AGENTS.md briefing files, never typed into shells. Decline does nothing; malformed plans fail closed.
- **Voice stop control** — clicking the orb while Jarvis speaks stops the reply mid-response and hands the mic back. Listen timeouts show a visible **Paused** state instead of shutting off silently, and Settings voice previews no longer leave push-to-talk disarmed.
- **Kokoro honesty** — if Kokoro is your selected engine and the ~89 MB model can't be prepared at launch, a toast explains the system-voice fallback and points to Settings → Voice (download happens on first use; it is not bundled).
- **Global dictation reachability** — Ctrl+Space still prefers native Win+H on Windows; on macOS/Linux (or when the native trigger fails) it now opens the VibeSpace dictation overlay instead of failing silently.
- **Update honesty** — the pre-update warning and Settings → About now state plainly: all terminal information may not be saved; live terminal processes cannot survive the restart.
- **Context map errors** — invalid path, file-not-folder, permission-denied, and browser-preview roots each produce a precise error instead of "no readable text files found", and a failed AI provider pass says the local fallback map is being built.
- **Website demo voice** — the Call Jarvis demo speaks its captions with the browser's built-in speech synthesis ("Hey, what's up? It's Jarvis…"), clearly preloaded demo content.

## Highlights (batch 1)

- **Jarvis Action executor** — actions saved on the Schedule page now actually run at their due time while the app is open, on the model saved with the action. Outputs collect in a dedicated per-action chat.
- **Jarvis Actions view** — the Schedule timeline gains a toggle listing every action with run counts and next-run times; clicking one opens its saved outputs inside Schedule.
- **Recurring actions** — once / daily / weekdays / weekly / monthly, with safe advancement, duplicate-run prevention, and an honest missed-run log (runs missed by more than 6 hours are recorded, not replayed).
- **Creator question wizard** — Jarvis creator questions appear one at a time with Next/Back, real progress, Cancel, and draft answers that survive navigation.
- **Scoped push buttons** — "Push to agent" / "Push to skill" only appear on real Jarvis draft replies in creator chats.
- **Multitask panel** — Agents and Subagents in separate sections; dismissal persists per chat until new agent work starts.
- **Linux install fixes** — auto-launch and the desktop entry use the absolute installed binary path (verified end-to-end on Linux).
- **Branding** — the last "JARVIS ONE" banners are gone from the terminal launcher and Windows boot screen. Jarvis remains the assistant; the product is VibeSpace.

## Update behavior

This version is a source release on `main`. The production updater channel (`releases/channel.json`) still points at the last published binary build and must only be promoted after Windows binaries for 0.1.48 are built and signed.

## Install / update

```powershell
irm https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/Cookie774-GameDev/VibeSpace/main/install/install.sh | bash
```

## Verification

- `npm run typecheck` — clean.
- `npm --prefix app run test` — full Vitest suite green (see PR for counts).
- `npm run build` — production build green.
- Linux install script — dry-run, real AppImage install, and headless extracted-AppRun launch verified in a Linux cloud environment.
- Windows/macOS install paths — `install.ps1` and `site/install.ps1` parse clean under PowerShell 7.6; the macOS branch of `install.sh` resolved, downloaded, and SHA-256-verified the published `VibeSpace_0.1.45_aarch64.dmg` against `SHA256SUMS.txt`; every v0.1.45 Windows/macOS release asset URL returns 200.
- Ollama — live daemon verified on Linux: `/api/version` (the exact endpoint VibeSpace's API-first connect probes), `/api/tags`, and `ollama pull` all work; app connect/bootstrap/provider suites green. Inference itself segfaulted in the sandboxed CPU container (environment limit, not app code).

## Still requires a real Windows/macOS machine

- Windows: run the NSIS installer end-to-end, Authenticode signing (`WINDOWS_CERT_*`), Tauri updater signing (`TAURI_SIGNING_*`), and the `Jarvis` terminal-command smoke test per `docs/09-jarvis-calling-account-release.md` §6.
- macOS: DMG mount/copy Gatekeeper flow; Developer ID signing + notarization for public distribution (see `DOWNLOAD.md` troubleshooting).
- GUI voice/mic flows (real microphone), Win+H dictation, and Kokoro inference need desktop hardware.
