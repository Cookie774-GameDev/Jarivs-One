# Sakura rollback plan

## Phase A

Rollback is deletion of `docs/appearance/sakura/**`; no production behavior, dependency,
asset, persistence, or external state was changed.

## Future production rollback

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

Each future slice needs its own pre-change evidence, exact revert boundary, and post-rollback
focused tests. Deployment/merge/release remain separate authorities.
