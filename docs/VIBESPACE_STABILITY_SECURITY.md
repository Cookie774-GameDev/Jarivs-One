# VibeSpace Stability Security Boundaries

## Terminal Fleet and native discovery

- Executable discovery accepts bounded executable names and returns path/version availability; it does not install or run a discovered CLI.
- Fleet custom commands reject empty, oversized, control-character, and shell-control input.
- Fleet execution requires the existing approval path, respects the ten-pane cap, reuses only eligible panes, and does not replace occupied or uncertain sessions.
- Terminal resource drops use the pane's recognized shell family. PowerShell, cmd, and POSIX quoting are explicit; unknown shells use a conservative single-quote fallback.
- Dropped text is inserted only. No CR, LF, Enter, or submit action is appended.

## Resource interactions

- File and Context references are typed, local, bounded to 8,192 characters, and rejected when they contain control characters.
- Arbitrary `text/plain` drags are not accepted as local file paths.
- Chat routing requires a bounded exact chat ID and uses the existing Composer attachment flow. Pet chat therefore targets the same chat ID.
- Terminal routing requires a bounded exact pane ID and writes only to the existing PTY session presentation.
- Ordinary editable fields insert at the current selection. Disconnected, disabled, read-only, password, PIN, payment, auth, token, API-key, secret, and credential-like fields are rejected using type/name/id/label/autocomplete/placeholder metadata.
- Context menus expose reveal/open only when a path and caller-approved desktop handler exist. Copy operations use the OS clipboard and never persist copied values.
- Escape, mouseup, dragend, navigation, window blur, and unload clean up drag chrome and listeners.

## Voice and shared identifiers

- Main and Pet voice use one lease/controller, the existing VoiceService, exact shared chat IDs, message repository, AI runtime, and TTS router.
- Pet speech inserts into the shared Composer by default. Auto-send is persisted but opt-in and defaults off.
- The Pet bridge validates request/chat/agent IDs, rejects unknown fields and oversized text, permits one active request, and cancels by exact request ID.
- Background TTS is granted only for a validated Pet request. Lease transfer closes the previous microphone owner and cancels only its exact request.
- No second STT/TTS/AI backend or transcript store was introduced.

## Persistence and cloud boundary

Activity, Pet settings, presentation state, and resource interaction state remain bounded and local. This work does not change Supabase, Stripe, billing, entitlements, authentication, production data, migrations, deployments, releases, or installers. Real secrets must never be placed in tests, documentation, screenshots, terminal snapshots, or coordination logs.
