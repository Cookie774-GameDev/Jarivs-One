# VibeSpace 0.1.48 — Scheduled Jarvis Actions run for real

## Highlights

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
