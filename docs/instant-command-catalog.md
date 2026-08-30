# Instant Command Catalog

This catalog is generated conceptually from `app/src/features/instant-command/catalog.ts` and its family modules. The TypeScript catalog remains the sole executable source of truth; this document describes the shipped contract without granting authority.

## Receipt contract

- Classification is deterministic and local. No routing LLM or provider-generation import is allowed on the pre-receipt graph.
- Every catalog fixture has a 500 ms maximum acknowledgement budget.
- Receipts distinguish completed, queued, confirmation-required, clarification-required, rejected, and timed-out outcomes.
- A queued or stored operation is never described as delivered or seen.
- Correlation IDs and confirmation bindings are exact-scope and exactly once; receipts do not retain raw command or voice payloads.

## Families

| Family                                                             | Examples                                                                   | Authority status                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Navigation                                                         | pages, Settings sections, back/forward/home, palette, launcher, fullscreen | Available through typed UI/navigation authorities                                           |
| Terminal and agent                                                 | open provider CLI, message, list/status, lifecycle, role/context           | Existing open/message paths and verified list/status available; unproven mutations disabled |
| Schedule, timer, alarm, tasks                                      | create/list/open/edit/run/pause/resume/delete                              | Cataloged; mutation requires canonical repository, revision, and confirmation ports         |
| Settings and media                                                 | non-secret allowlist, playback, volume, ambient                            | Typed ports exist; catalog mutations stay disabled until canonical stores are bound         |
| Tools, skills, plugins, files, context, projects, chats, Workbench | stable-ID/unique-name operations                                           | Cataloged; unavailable commands are shown disabled and never simulated by UI clicks         |
| Team                                                               | Terminal Peer Fabric lifecycle                                             | Capability-gated on bundled native Fabric version 2+                                        |

`/connect` is an available navigation command that opens the existing VibeSpace Providers surface. Credential entry, cancellation, retry, provider enumeration, reload recovery, secure keyring persistence, and post-connect model refresh remain exclusively inside that established UI and transport authority. The command accepts no credential argument and its receipt contains no secret.

## Terminal Peer Fabric boundary

Terminal Peer Fabric is a first-party preloaded VibeSpace tool, never a Calyx download, second terminal engine, daemon, or separate plugin runtime. Instant Command owns only the versioned command port and capability gate. Stable pane/session/project/runtime generations cross the port; peer inboxes, leases, replay, adapters, and native supervision remain owned by the separate Calyx adoption implementation.

## Safety and availability

Catalog entries declare `read`, `reversible`, `confirm`, or `approval`. Stable IDs win over unique normalized display names; duplicate names return ambiguity without mutation. Destructive terminal and schedule operations require a single-use binding to account, workspace/project, command, exact target, normalized arguments, and expiry. Generic settings reject secrets, credentials, billing, production mutations, and arbitrary storage paths.

The generated acceptance corpus contains at least 300 positive commands, 300 close negatives, 100 ambiguity cases, and 100 authorization/confirmation cases across all catalog families. Run `node --test scripts/pr31-instant-command-catalog-acceptance.test.mjs` for the fresh-process structural gate.
