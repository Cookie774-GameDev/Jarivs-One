# Pixel Pet — How to test in the normal VibeSpace app

## Launch commands (repository-defined)

From the **worktree root** (or any checkout of `agent/pixel-pets-axolotl`):

| Goal | Command |
|------|---------|
| Frontend only (browser fallback pet in main shell) | `npm run dev` or `npm run jarvis` |
| **Normal desktop app (Tauri)** | `npm run tauri:dev` |
| Packaged Windows build | `npm run tauri:build` |

Equivalent under `app/`:

- `npm run jarvis` → Vite
- `npm run tauri:dev` → `tauri dev --features kokoro`
- `npm run tauri:build` → `tauri build --features kokoro`

## Enable the Pet

1. Launch with `npm run tauri:dev`.
2. Open **Settings** (gear / `Cmd+,` or app menu).
3. Open the **Pets** tab.
4. Toggle **Enable Pet** on.
5. Click **Show Pet**.

**Expected:** A small always-on-top transparent pet-overlay window appears with the axolotl. Welcome animation plays once, then primary idle.

## Open the mini panel

1. **Single-click** the Pet (do not drag more than ~6px).
2. Or Settings → Pets → **Open Mini Panel**.

**Expected:** One `pet-mini-panel` window (~430×560) opens near the Pet. Tabs: Chats, Terminals, Activity. Close confirmation uses the approved copy.

## Test real chats

1. In the mini panel → **Chats** → **New chat**.
2. Type a message and send (same Composer + provider pipeline as main).
3. From main Chat, open a thread → **Move to Pet Panel**.
4. Confirm the same thread ID; main shows “Presented in Pet panel”.
5. Start a stream, **Minimize** the panel; stream continues (Dexie live updates).
6. Reopen panel; messages catch up.

**Never:** cloned thread, second outbound request for the same in-flight turn.

## Test real terminals

1. Mini panel → **Terminals** → **New terminal** (real PTY via `TerminalView`).
2. Type a command; see live output.
3. In main Terminals page, use **To Pet (n/4)** on a live pane.
4. Main shows placeholder “presented in Pet mini-panel”; PTY continues.
5. **Return to main** reattaches xterm without restarting PTY.
6. Fifth terminal → exact message:  
   `The Pet panel supports up to 4 terminals. Return or close one before adding another.`

## Reset off-screen windows

Settings → Pets:

- **Reset Pet Position**
- **Reset Panel Position**

## Disable / re-enable

- Disable: Settings → Pets → Enable Pet off, or **Hide Pet**. Overlay hides; webview not destroyed.
- Re-enable: **Show Pet** — same window instance, no duplicate.

## Developer diagnostics (dev builds)

Settings → Pets → diagnostics: force welcome/idle/walk/sleep/wake, safe test notification. No secrets logged.

## Asset / security notes

- Runtime uses bundled atlas PNG + JSON only (Vite assets). **No MP4** at runtime.
- No dependency on `%TEMP%` or absolute machine paths for runtime assets.
- Least-privilege capabilities: `pet-overlay.json`, `pet-mini-panel.json`.
