# Pet security and privacy

## Data boundaries

- Pet runtime reactions are local-only. They never include chat text, terminal output, commands, environment dumps, request bodies, credentials, tokens, or updater payloads.
- Activity summaries continue through the existing sanitizer and 160-character bound. Expanded error details reveal only the sanitized target type and opaque reference already stored by the presentation layer.
- Shared chat IDs and PTY session IDs are references to existing sessions. The Pet does not clone, restart, or auto-submit either system.
- No Supabase, Stripe, billing, authentication, migration, production-data, deployment, or release path changed.

## Native privileges

- Pet windows expose only explicit lifecycle, geometry, visibility, panel-mode, action-validation, and startup commands.
- The overlay is frameless, transparent, skip-taskbar, fixed-size, and topmost. The panel is frameless and normal-by-default; topmost requires the explicit setting.
- Start with Windows is opt-in and uses one `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` value named `VibeSpace`. Its value is only the quoted installed executable path, with no command-line arguments.
- Debug builds refuse startup registry mutation, preventing `npm run tauri:dev` from registering a development executable.
- Startup disable removes only the `VibeSpace` value. It does not enumerate or change unrelated startup entries.

## Persistence and recovery

- Window geometry is schema-validated, bounded to 64 KiB, written through a temporary file, and keeps one previous known-good generation.
- Coordinates are clamped to current operating-system work areas, including negative monitor coordinates.
- Settings use local application storage and cross-window storage events. No Pet preference is sent to cloud services.

## Dependency evidence

`npm audit --omit=dev` reported zero production vulnerabilities. Full `npm audit` still reports the known development-toolchain findings: one high Vite finding and one moderate esbuild finding. The suggested automatic remediation requires a breaking Vite upgrade and was not applied as part of this focused work.
