# Preview Studio & Vibe Browser

## Architecture

### Preview Studio (`route: preview`)

- React owns chrome: toolbar, device frame, rulers, error recovery, diagnostics.
- **Tauri child WebView** (`preview-surface`) is positioned over a reserved DOM rectangle via `ResizeObserver` + `preview_set_bounds`.
- Local HTML projects use a **loopback-only static server** (`127.0.0.1`, ephemeral port, path-traversal blocked).
- Remote pages never receive VibeSpace IPC.

### Vibe Browser (`route: browser`)

- Launches **isolated Edge (preferred) or Chrome** with a VibeSpace app-data profile:
  - `app_data/browser/profiles/default/`
- CDP is bound to **127.0.0.1** with a random port.
- Frontend connects over CDP WebSocket, starts **Page.startScreencast**, and renders JPEG frames in the viewport.
- User pointer events are mapped back to CDP `Input` events.
- AI tools go through `requestBrowserTool` with approval modes.

## Security boundaries

| Surface | Bound |
|--------|--------|
| Static server | `127.0.0.1` only; root-jailed paths |
| Preview URLs | `http` / `https` only |
| Browser profile | Dedicated folder, never user default profile |
| CDP | Loopback only |
| Agent tools | Schema allow-list; no arbitrary JS |
| Secrets | Password/secret typing refused; no cookies in persistence |

## Device emulation honesty

Preview Studio performs **responsive viewport emulation** inside WebView2. It does **not** claim bit-identical Mobile Safari rendering.

## Agent control modes

- **User only**
- **Ask before every action** (default)
- **Allow safe actions (session)**
- **Agent controlled** (destructive still requires care)

**Stop Agent** aborts pending/running actions immediately.

## Troubleshooting

1. **Preview blank** — ensure desktop app (not browser-only Vite), then reload URL.
2. **connection_refused** — start Vite/dev server or use Detect servers.
3. **Browser missing** — install Edge or Chrome; check Profile sidebar diagnostics.
4. **CDP timeout** — Stop runtime, Start runtime again.
5. **Invisible webview blocking clicks** — leave Preview route (hide) or restart app.

## Adding a device preset

Edit `app/src/features/preview/previewDevices.ts` and append to `DEVICE_PRESETS`.

## Adding a browser tool

1. Add tool name to `ALLOWED_TOOLS` in `browserActions.ts`.
2. Implement case in `executeBrowserTool`.
3. Classify risk via `SENSITIVE_TOOLS` / destructive hints.
4. Document here.

## Packaging notes

- No global Node.js required for CDP control (Rust launches browser; frontend owns CDP WS).
- Windows process creation uses `CREATE_NO_WINDOW` to avoid console flash.
- On app exit, call browser stop / kill orphaned VibeSpace browser processes (session marker `--vibespace-session=`).
