# AGENTS.md

## Repository overview

- **VibeSpace** is the desktop product in `app/`, built with Tauri 2, React, TypeScript, and Vite.
- **Jarvis** is the assistant inside VibeSpace. Some package names and older internal identifiers still use `jarvis`; do not treat that as the public product name.
- Optional services live under `phone-jarvis/cloud/` and `supabase/`. They are not required for the core web development flow.

## Development flow

- Install the root workspace: `npm install`
- Start web development mode: `npm run jarvis`
- Start the native Tauri shell: `npm run tauri:dev`
- Build the web application: `npm run build`

Web mode runs on `http://localhost:5173`. Native-only capabilities such as PTY terminals, keyring access, global shortcuts, desktop dictation, and local Kokoro integration require the Tauri shell. A native feature reporting that its backend is unavailable in plain web mode is expected unless the feature has a documented browser fallback.

## Required checks

Mirror `.github/workflows/ci.yml` before requesting review:

- `npm run typecheck`
- `npm --prefix app run test`
- `npm run test:release-manifest`
- `npm run build`
- `cargo check --manifest-path app/src-tauri/Cargo.toml`

There is no dedicated lint script. Keep formatting consistent with the existing Prettier configuration.

## Linux native prerequisites

Tauri checks on Linux require the packages listed in `.github/workflows/ci.yml`, including WebKitGTK, app-indicator, SVG, SSL, and packaging development libraries. Consult the workflow rather than duplicating a version-sensitive install command here.

## Change guardrails

- Preserve the current UI, layout, spacing, theme, and interaction behavior unless the task explicitly requests a visual change.
- Keep production builds independent of the Vite development server.
- Never commit API keys, service-role credentials, signing material, tokens, or user data.
- Keep secrets out of logs, screenshots, fixtures, documentation, and test snapshots.
- Treat billing, authentication, updater, installer, terminal execution, global shortcut, and voice changes as high risk; add focused regression coverage.
- Do not claim a platform or external-service integration is verified unless it was actually exercised in that environment.

## Optional services

- `phone-jarvis/cloud/`: Python/FastAPI service for calling features. Follow its local requirements and health-check documentation.
- `supabase/`: database migrations and Deno edge functions for accounts, billing, and metered cloud features. Use the Supabase CLI and apply migrations before deploying dependent functions.
