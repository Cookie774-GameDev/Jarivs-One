# VibeSpace 1.5.0

Released July 15, 2026.

## Highlights

- Complete spatial Workbench with draggable and resizable panels, templates, persistence, detached windows, terminal, Browser, Preview Studio, editor, files, notes, Jarvis, device previews, and wallpapers.
- Pixel Pets with transparent overlay, AXO/GLITCH animations, shared chat and terminal surfaces, and account controls.
- Durable Jarvis task runs, approvals, recovery, private learning, All About Me persistence, MCP/plugin lifecycle, and gold-standard intent handling.
- Subscription-aware provider registry and native CLI bridge for Codex, Claude, Gemini, Copilot, Qwen, OpenCode, and local models.
- VibeSpace, Jarvis Core, Default, and Light themes synchronized across every app window.
- Terminal presentation recovery, bounded snapshots, safe-shell restart rules, secret redaction, and update-safe persistence.
- Wallpaper library, bundled animated wallpapers, Orbit redemption, Supabase catalog/download functions, and native master caching.

## Integration guarantee

This release is based on PR #26 and contains the validated work from PRs #18 through #23 plus the rescued Grok Workbench. Existing installer, terminal, pet, theme, subscription, provider, Jarvis, and update functions are preserved.

## Required release gates

The official release is published only after typecheck, production build, the full Vitest suite, release-manifest validation, Rust release validation, all cross-platform installer builds, updater signatures, `latest.json`, and `SHA256SUMS.txt` succeed.
