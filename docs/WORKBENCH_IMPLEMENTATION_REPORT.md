# VibeSpace Workbench implementation report

## Scope

This change adds Workbench as an additive VibeSpace route. Classic Chat remains
the default startup route, and the existing terminal, Jarvis, agents, files,
actions, GitHub, Supabase, plugins, kanban, Pets, authentication, billing, and
cloud systems are not replaced. A detached Workbench window opts into the route
with `?workbench=1`.

Implementation was isolated on `feature/workbench-master-claude` in a dedicated
git worktree. The canonical coordination ledger and files locked by other active
agents were not edited.

## User-facing behavior

- Adds Workbench to navigation, the command palette, and the global assistant.
- Adds a spatial canvas with pointer panning, Ctrl/Cmd-wheel zoom, keyboard zoom,
  fit-to-content, auto-arrange, a minimap, drag, resize, selection,
  Shift multi-select, keyboard movement, deletion, undo, and redo.
- Keeps minimized panels mounted so live terminal resources are not destroyed.
- Adds 14 panel types: terminal, browser, Jarvis, agent, files, editor, kanban,
  actions, notes, diagram, plugins, GitHub, Supabase, and activity.
- Reuses the existing `TerminalView` for real PTY-backed terminal panels. Terminal
  panels attach to persisted session resource IDs, while transcripts and terminal
  output are never serialized into Workbench state.
- Adds an embedded browser panel with an address bar, reload, external open, and
  best-effort named Chrome and Edge launchers. Embedded pages are sandboxed and
  deliberately do not inherit VibeSpace origin or native bridge access.
- Adds seven built-in layouts: Coding, Multi-agent, Research, Web development,
  Supabase, Content, and Blank. The Web development layout includes four terminal
  panels and two browser panels.
- Supports user-saved templates. Runtime terminal resource IDs are removed before
  a template is saved.
- Adds a detached Workbench window in Tauri and a browser-popup fallback on the
  web. The native window uses a scoped `workbench-*` capability.
- Adds deterministic assistant commands for opening/spawning Workbench, adding
  typed panels, selecting wallpapers, and pausing/resuming wallpaper motion.

## Wallpapers

Wallpapers are separate from Pets and do not import or modify the Pets system.
The gallery contains, in stable order:

1. None
2. Warm Gradient
3. Interactive Space Clouds
4. Starfield
5. Orbital Lights
6. Particles
7. Fluid Gradient
8. Aurora
9. Cozy Night Window
10. Grid Pulse
11. Custom Image
12. Custom Video
13. User Pack

Wallpaper definitions are declarative data. They cannot contain executable
callbacks, scripts, or Tauri APIs. Animated canvas effects consume pointer input
inside the wallpaper host instead of updating React state on every pointer move.
Reduced-motion preferences pause or simplify motion. Users can also pause motion
explicitly.

Custom image uploads are limited to 2 MB and PNG, JPEG, WebP, GIF, or AVIF. They
are persisted as data URLs. Custom video uploads are limited to 18 MB and MP4,
WebM, or OGG; they use session-only object URLs and the UI states that limitation.
Unsafe persisted wallpaper URLs are discarded during hydration.

## Persistence and recovery

Workbench state is stored in a versioned localStorage envelope with bounded
panel/template counts and sanitized geometry. A last-known-good backup is written
before replacing the primary copy and is used if the primary payload is corrupt.

The persisted model includes panel layout, view position/zoom, selection,
wallpaper settings, and saved templates. It excludes terminal transcripts,
browser cookies, API keys, and other provider credentials. Secret-like command
and URL values are replaced with `[redacted]` before serialization. Runtime-only
terminal status updates and ordinary note/editor typing do not inflate undo
history.

## Browser and desktop security

- Browser navigation accepts only HTTP and HTTPS URLs.
- Embedded HTTP credentials and privileged schemes such as `javascript:`,
  `data:`, `file:`, `tauri:`, `asset:`, `chrome:`, and `about:` are rejected.
- The iframe omits `allow-same-origin` and
  `allow-popups-to-escape-sandbox`. Clipboard, camera, microphone, and geolocation
  permissions are explicitly disabled, and referrer policy is `no-referrer`.
- Workbench drag/drop accepts only the private typed panel MIME payload. Dropped
  text is never evaluated or executed.
- The native capability applies only to local windows named `workbench-*`.
  Embedded remote pages remain sandboxed iframe content and are not associated
  with that capability.

## Integration boundaries

Real terminal and browser panels live inside the canvas. The other system panels
are lightweight, live Workbench references with actions that open their existing
full VibeSpace routes; this avoids duplicating stateful systems or modifying files
currently owned by other agents. No Pets, billing, authentication, cloud,
Supabase internals, terminal internals, Rust command handlers, or root `App.tsx`
files were changed.

## Verification performed

| Check | Result |
| --- | --- |
| `npm ci` | Passed. npm reported the pre-existing audit baseline of 1 moderate and 1 high vulnerability. |
| Baseline `npm run typecheck` | Passed before implementation. |
| Latest `npm run typecheck` | Passed. |
| `npm run build` | Passed; 2,841 modules transformed. Existing chunk-size and mixed dynamic/static import warnings remain. |
| `cargo check --manifest-path app/src-tauri/Cargo.toml` | Passed. Two existing Rust dead-code warnings remain. |
| `npm run test:release-manifest` | Passed, 1/1. |
| Final focused Workbench/routing/assistant tests | Passed, 10 files and 27 tests. |
| Full `npm run test -- --run` | 178 files and 942 tests passed; 4 unrelated UI tests timed out at the repository's 5-second limit under parallel load. No Workbench test failed. |
| Serial rerun of the 4 timed-out files | Passed, 4 files and 15 tests. |
| `git diff --check` | Passed for tracked changes. |
| Secret-pattern scan of the intended change paths | No private-key, OpenAI-key, or GitHub-token patterns found. |
| Local preview HTTP response | Passed with HTTP 200 at `http://127.0.0.1:5175/?workbench=1`. |

The four full-suite timeouts were:

- `AgentManager.test.tsx` — save lifecycle
- `AgentManager.jarvisCreator.test.tsx` — blank-agent creation
- `ChatThread.agentPanel.test.tsx` — connected agent activity panel
- `AgentRolePicker.test.tsx` — persisted swarm label

All four files passed together with `--maxWorkers=1`, confirming the full-suite
failures were load-sensitive timeouts rather than deterministic regressions.

## Known limitations and remaining risks

- Browser extension control could not attach to the local preview after the
  prescribed retries, so interactive visual QA was not claimed. The preview
  returned HTTP 200, and build, type, feature, and route verification passed.
- Some sites deny embedding via `X-Frame-Options` or Content Security Policy.
  Those pages must be opened externally; Workbench does not weaken their policy.
- Embedded browser sessions do not import cookies or login state from the user's
  installed Chrome/Edge profile.
- Named Chrome/Edge launch uses the operating system's registered custom protocol
  as a best-effort request. It was not verifiable in the headless native check and
  can fall back to the default external-browser behavior on machines without the
  named browser/protocol registration.
- Custom videos are session-only because storing large binary media in
  localStorage would create reliability and quota risks.
- Animated wallpaper quality depends on WebView canvas support. Reduced-motion
  and static fallbacks remain available.
- The repository-wide full test command can exceed four concurrent jsdom tests'
  5-second limits on this machine. The affected files pass serially.
- `install/install.ps1` disappeared from this worktree independently of the task,
  matching an active installer worktree issue and apparent endpoint-security
  quarantine behavior. It is intentionally excluded from this change and will
  not be staged or committed.

## Changed areas

- `app/src/features/workbench/**`
- Workbench route/navigation/top-bar integration
- Workbench command-palette and assistant integration
- Scoped Tauri webview-window capability
- Focused Workbench, assistant, persistence, security, and routing tests

No release, deployment, or merge is performed by this task. The handoff stops at
a draft pull request.
