# VibeSpace Workbench implementation report

## Scope

Workbench is an additive VibeSpace surface that opens as a **detached full window**
while Classic Chat remains the default main-window experience.

This report covers PR #20 plus the 2026-07-13 functional pass that makes Workbench
persistent, named, multi-window-safe, and connected for the five primary panels.

## Architecture decisions

### Detached window (not in-page content only)

- Entry points call `openOrFocusWorkbenchWindow()` (`window.ts`).
- Fixed native/web window label: `vibespace-workbench` — **focus existing** instead of spawning unlimited windows.
- URL: `/?workbench=1` sets `resolveInitialRoute` → `workbench`.
- `AppShell` detects detached search and renders **full-bleed** Workbench without TopBar/Nav/Inspector.
- Main app **stays open** on its current route. Popup-blocked web fallback may open in-page Workbench with a toast.

### Persistence

- Versioned envelope `vibespace-workbench:v1` + last-known-good key.
- Document fields: `name`, `revision`, panels, view, wallpaper, customTemplates, `updatedAt`.
- Debounced save (~350ms) + 5s safety flush + immediate flush on `pagehide` / `beforeunload` / `visibilitychange=hidden` / template apply.
- No-op skip when content fingerprint unchanged.
- **Revision-aware stale-write rejection** so multi-window peers cannot overwrite newer storage.
- Cross-window sync via `BroadcastChannel` + `storage` events.
- Secrets redacted in command/url; terminal transcripts never stored in layout JSON.
- Templates strip `resourceId` (live session IDs). Live sessions may keep terminal `resourceId` for PTY reconnect.

### Primary embedded panels (fully functional in-panel)

| Panel | Implementation | Connected systems |
| --- | --- | --- |
| **Terminal** | `TerminalPanel` → existing `TerminalView` | PTY sessions via `resourceId` reconnect |
| **Browser** | `BrowserPanel` | HTTP(S) only, sandboxed iframe, external open, blocked-embed UX |
| **Project files** | `FilesPanel` | `listDirectory` + `projectFiles` store; open → editor |
| **Jarvis** | `JarvisPanel` | `ChatThread` + `Composer` + `ensureActiveChat` (shared chat/runtime) |
| **Editor** | `EditorPanel` | FS read/write; optional MD/HTML preview (escaped / sandboxed) |

### Secondary panels (still limited)

Agent, kanban, actions, notes (textarea), diagram, plugins, GitHub, Supabase, activity remain lightweight references with “open full view” where applicable. Honest limitation — not claimed as full embeds.

## UX behavior

- Editable **Workbench name** (default `My Workbench`), auto-persisted, window title updated in detached native mode.
- **Save layout** opens template library with focused name field (named reusable templates).
- Live layout auto-saves without manual save.
- No **Classic VibeSpace** toolbar button.
- No **Spawn Workbench** nav button — nav **Workbench** opens/focuses the window.

## Browser security model

- `normalizeBrowserUrl` allows only `http:` / `https:`.
- Rejects `javascript:`, `data:`, `file:`, `tauri:`, `asset:`, `chrome:`, `about:`, `vbscript:`, and embedded credentials.
- Iframe sandbox omits `allow-same-origin` and popup-escape; referrer `no-referrer`; permissions disabled.
- Sites that block embedding: status + **Open externally** (URL revalidated). Never claim universal embed success.
- Named Chrome/Edge launch is best-effort OS protocol only.

## Changed files (functional pass)

### Workbench feature

- `app/src/features/workbench/**` — store, persistence, window, name, panels, CSS, tests
- New: `FilesPanel.tsx`, `JarvisPanel.tsx`, `EditorPanel.tsx`, `editorPreview.ts`, `workbenchName.ts`

### Narrow integration (why)

| File | Why |
| --- | --- |
| `NavPane.tsx` | Workbench entry opens detached window instead of in-route-only |
| `AppShell.tsx` | Full-bleed chrome when `?workbench=1` |
| `command-palette/actions.ts` | Open/spawn use detached window helper |
| `assistant/execute.ts` | Workbench intents open detached window |
| `docs/WORKBENCH_IMPLEMENTATION_REPORT.md` | This document |
| `docs/AGENT_COORDINATION.md` | Locks / work log |

### Not changed

Billing, auth, pets, voice, installer content, release channel, Supabase/GitHub internals, terminal Rust PTY core, main Chat page behavior (only reused components).

## Tests and verification

### Focused automated (passed)

`npm run test -- --run src/features/workbench src/features/assistant/workbench.test.ts src/components/layout/PageRouter.workbench.test.tsx`

- **12 files, 34 tests passed**
- Coverage includes: persistence/LKG/redaction/stale revision, name sanitization, window open/focus/popup-block, browser schemes, editor preview safety, embedded files/jarvis/editor (no placeholder), page route, assistant intents

Evidence: implementer scratch `workbench-focused-tests.log`

### Gates

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed (~1m 17s; existing chunk warnings) |
| `npm run test:release-manifest` | Passed 1/1 |
| `cargo check --manifest-path app/src-tauri/Cargo.toml` | Finished; 2 pre-existing dead-code warnings |

### Manual / native

- Web entry path unit-tested; interactive Tauri multi-window QA **not claimed** in this harness (`tauri-unavailable.log`).
- Popup behavior depends on browser allow-list.

## Security review

- Diff secret scan: no live key patterns in Workbench change set.
- Credentials, cookies, transcripts excluded from layout persistence.
- Remote browser content isolated from native bridge / same-origin app data.

## Remaining risks and limitations

1. Many websites refuse iframe embedding — external open is the supported path.
2. Full native multi-window interactive QA should be done on a Tauri build before release.
3. Non-primary panels remain reference cards.
4. Custom video wallpapers remain session-oriented (quota).
5. `install/install.ps1` local delete is unrelated and must not be committed with this work.
6. PowerShell may surface cargo `warning:` on stderr as a non-zero shell status even when cargo Finished successfully — check the log for `Finished`.

## Completion status

Primary goal items delivered in code + automated gates:

- Detached open/focus Workbench window; main stays open
- Auto-save + revision multi-window protection
- Editable name
- Real Files / Jarvis / Editor / Browser / Terminal panels
- Classic button removed
- Tests + report + locks process

No merge/deploy performed.

## Follow-up fixes (skeptic pass)

- Stabilized WorkbenchCanvas panel handlers via per-id map + refs (no new lambdas each render).
- WorkbenchPanel holds stable `update` / `updateRuntime` via refs.
- FilesPanel: loadRoot no longer depends on `panel.settings` / unstable `onUpdate`; status/cwd written only when values change.
- JarvisPanel: status updates only when changed; `onUpdate` via ref (no effect loop).
- `install/install.ps1` restored from HEAD (unrelated local delete).
- Regression: `panelStability.test.tsx`.
- Web launch evidence: `web-launch.log` with HTTP 200 on main and `?workbench=1`.

- Web popup features no longer include noopener/noreferrer so window.open returns a handle, NavPane can trust ok:true, and named Workbench reuse works.

