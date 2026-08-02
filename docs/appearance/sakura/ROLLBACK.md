# Sakura rollback plan

## Production rollback

Use atomic slice reverts in reverse dependency order:

1. route-specific and SK7A Chat/JARVIS/voice styling;
2. shell/shared primitive styling;
3. semantic Sakura CSS and scenic host/assets;
4. Appearance/commands/action/sync support;
5. registry/generated-contract source change.

Before removing the registry value, migrate any persisted `sakura` preference safely to the
existing fallback (`default`) through the validated store path without changing unrelated
state. Do not simply delete support while persisted clients/windows can still emit Sakura.

Rollback must restore all preserved-theme baselines, remove Sakura-only assets/selectors and
processes, and prove no remote webview, user Canvas, terminal, pet overlay, auth, billing,
voice, or persistence behavior changed. Never reset the shared worktree or discard unrelated
dirty work.

Rollback requires the exact integrated change set and controller-owned Git authority; do not
delete this documentation as a substitute for reverting production. Re-run focused theme,
scene, primitive, route/overlay, motion, reference, and harness contracts after each boundary.
Deployment/merge/release remain separate authorities.
