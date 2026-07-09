# VibeSpace media capture workflow

How to produce the real screenshots and videos used on the GitHub page and website.
Never commit mock or staged media presented as real; label web-preview captures as such.

## Web-preview screenshots (works anywhere, including CI/cloud)

Real renders of the actual app bundle. Desktop-only surfaces (live PTYs, native
dictation paste, tray, updater) will show their honest web-fallback states.

```bash
npm run build
(cd app/dist && python3 -m http.server 8940 &)
npx playwright install chromium        # once
node scripts/capture-screenshots.mjs   # writes docs/screenshots/*.png
```

The script seeds `onboardingComplete` and marks the current What's New version as
seen so shots show the workspace. Set `CAPTURE_APP_VERSION` when the version bumps.

## Desktop screenshots (real machines)

Capture at 1440×900 or larger, default zoom, `jarvis-core` theme, demo data only.

| Target | How |
|---|---|
| Terminal grid (live PTYs) | Open Terminals → `+` to 4–10 panes → run demo commands (`ls`, `htop`) |
| Global dictation overlay over another app | Focus Notepad/TextEdit/a browser → press `Ctrl+Space` → capture overlay while listening |
| In-app dictation (no overlay) | Focus the VibeSpace composer → press `Ctrl+Space` → capture the composer mic/interim state |
| Voice settings / engines | Settings → Voice |
| Agent/subagent panel | `/multitask fix the header layout` in chat |
| Orchestration approval card | Ask Jarvis: "close all terminals, open 4 with claude, two as code agents and two as reviewers…" |

- **Windows**: Win+Shift+S (Snipping Tool). Build/run from your local clone: `npm install && npm run tauri:dev`.
- **macOS**: Cmd+Shift+4, space for window capture.
- **Linux (X11)**: `gnome-screenshot -w` or `scrot -s`; Wayland: `grim -g "$(slurp)"`.

## Videos / GIFs (real machines)

Target demos, ~10–20 s each, no audio unless narrating, under ~8 MB per GIF
(prefer `.mp4` in Releases or the website; the repo does not use Git LFS):

1. `Ctrl+Space` → speak → transcript → Enter → text lands in Notepad/VS Code.
2. Jarvis voice orb: ask a question, click the orb mid-reply to stop it.
3. Schedule Jarvis Action firing and its output opening inside Schedule.
4. 10-terminal orchestration approval card → Accept → panes open with roles.
5. Context Map: create map → click a node → summary panel.
6. Website phone demo: Call Jarvis → spoken "Hey, what's up?" caption.

Record with OBS (all platforms) or `wf-recorder` (Wayland) / `ffmpeg -f x11grab` (X11).
Convert to GIF: `ffmpeg -i in.mp4 -vf "fps=12,scale=960:-1" out.gif`.

## Safety checklist before committing media

- No API keys, tokens, or key fragments visible (Settings → Providers must be redacted/empty).
- No real personal chats, contacts, emails, file trees with private names.
- No terminal output containing secrets or internal hostnames.
- Local usernames hidden unless intended (use a demo OS account).
- Verify every image/video is actually referenced by README/website before commit.
