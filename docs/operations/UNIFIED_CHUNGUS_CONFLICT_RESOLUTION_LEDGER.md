# UnifiedChungus Conflict Resolution Ledger

Date: 2026-08-16
Integration worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`

This ledger records semantic decisions made while reconciling current PR31 with the preserved local-unify lineage. Decisions follow this priority: canonical architecture, semantic behavior, tested runtime behavior, ancestry, then timestamp.

## OpenCode production routing

- **Canonical source:** current PR31 persistent OpenCode/session/permission architecture.
- **Retained:** `opencodePersistent.ts`, persistent session pool/turn coordinator/request controls, canonical model catalog, PR31 permission profile and run-scoped approval policy, chat runtime controls, and RLM route decisions.
- **Imported capability:** local-unify native runtime/server/tool-gateway and Browser Chat/connector support around the canonical boundary.
- **Decision:** ordinary production AI turns route through the persistent OpenCode adapter. Direct ordinary native-provider and subscription-CLI execution paths are not active router authorities. The Shared Intelligence Kernel smoke provider remains an explicitly gated debug-only exception.
- **Security:** exact account/workspace/project/worktree scope, provider/model/connection identity, cancellation, protected-attempt evidence, tool bounds, and approval callbacks are carried through the persistent boundary. Authentication state must be verifiably authenticated; unknown/unauthenticated state fails closed.

## Browser Chat account/profile/navigation

- **Canonical source:** newer PR31 account/workspace authority plus local-unify Browser Chat capability.
- **Decision:** managed provider surfaces require a validated account-profile key. Resume/navigation URLs are provider allowlisted and profile-scoped. External navigation remains a dedicated controller operation rather than exposing general Tauri/shell authority to provider pages.
- **Relay scope:** a cloud account alone is insufficient; a valid workspace is required before Browser Chat relay activation.

## Account teardown

- **Canonical source:** current PR31 account/session authority.
- **Decision:** when live cloud identity becomes malformed, all account-scoped in-memory state is quarantined synchronously before awaiting native terminal revocation or listener flushes. This prevents the previous private scope from remaining readable for a React/store turn while asynchronous teardown is running.

## Terminal process authority

- **Canonical source:** current PR31 canonical execution store and account/workspace authority, with local-unify terminal process restoration behavior retained.
- **Decision:** canonical spawn authority is revalidated synchronously before the native spawn call. Both fresh and restored PTYs are attached to the terminal execution authority before readiness is reported. Legacy process attachment remains supported through the execution store without bypassing canonical records.

## Context federation

- **Canonical source:** current PR31 RLM/context authority plus local-unify indexed/lossless context.
- **Decision:** context map sources remain content-hash verified. Test fixtures were corrected to use the actual SHA-256 of their content rather than weakening fail-closed source verification.

## Model Foundry cancellation/result validation

- **Canonical source:** current PR31 OpenCode production boundary.
- **Decision:** Foundry model selections are carried through OpenCode rather than creating an ordinary router bypass. Native Foundry result preparation still validates null/undefined/malformed results before dereferencing artifact fields so cancellation or malformed native responses fail cleanly without unhandled promise errors.

## News and benchmark UI

- **Decision:** retained live-image fallback, video treatment, explicit last-good refresh warning, accessible section-count labels, Artificial Analysis presentation, and exact-row benchmark sorting. Tests were kept behavior-focused; no production assertions were weakened.

## Windows installer `install/install.ps1`

- **Observed ancestry:**
  - integration `HEAD`: absent
  - active `MERGE_HEAD`: absent
  - remote `UnifiedChungus`: absent
  - remote `agent/pr30-fixes-and-updates`: absent
  - preserved local-unify source: absent
  - `origin/main`: present as an older 812-line installer
- **Documentation history:** many prior PR31 task ledgers explicitly treated the installer deletion/state as unrelated protected work and excluded it from feature commits.
- **Decision:** do **not** resurrect the older main-only installer into the PR31 reconciliation. The staged accidental add was removed. `main` is not modified by this task. Any future installer restoration or destructive deployment remains a separate owner/release decision with its own signing and AV qualification.

## Recovery/workspace scaffolding

The final product tree must not include `.agent-coordination.lock/`, `agents/AGENT_4_LOG.md`, `artifacts/pr31-live/tauri-dev.pid`, UnifiedChungus encoded recovery payloads, the temporary recovery/apply workflow, generated `app/package-lock.json`, or equivalent test/runtime scratch output. Their history remains recoverable from Git/backups; they are not product runtime content.
