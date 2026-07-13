# Pet rollback

The focused implementation is four logical commits on local `main`:

1. `f87f245` — responsive, collapsible shared mini-panel
2. `aa04911` — native window/settings/recovery hardening
3. `012782f` — local-only runtime reactions and motion policy
4. `f62fc62` — opt-in Windows startup and panel transitions

To roll back the complete focused change, create new revert commits in reverse order. Do not reset or rewrite shared history. Review the working tree and coordination locks first, then revert `f62fc62`, `012782f`, `aa04911`, and `f87f245` individually.

Rollback effects:

- removes the Pet-owned `VibeSpace` startup toggle commands/UI, but an already-created registry value should be disabled through the installed settings before rollback or removed manually from the single documented HKCU Run value;
- restores the previous mini-panel layout/window behavior and removes runtime reactions/motion policies;
- does not alter chat records, PTY processes, terminal snapshots, Supabase, Stripe, billing, authentication, migrations, production data, deployments, or releases;
- does not require database or cloud rollback.

After any rollback, rerun the Pet suite, TypeScript typecheck, production build, Rust library tests, `cargo check`, and a physical Windows overlay/panel lifecycle smoke test.
