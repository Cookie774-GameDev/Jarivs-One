# Shell Integration

## Overview

VibeSpace integrates Context Map knowledge into terminal agent sessions through automatic
briefing injection and managed instruction files. This document describes the shell-level
integration contracts.

Sources:

- `app/src/features/terminals/agentPromptPayload.ts`
- `app/src/features/terminals/agentPromptDelivery.ts`
- `app/src/features/terminals/terminalContextPack.ts`
- `app/src-tauri/src/terminal_cli.rs`
- `app/src-tauri/src/terminal.rs`

## Briefing Delivery

The briefing delivery system (`agentPromptDelivery.ts`) updates managed blocks in `AGENTS.md`,
`CLAUDE.md`, and `GEMINI.md`, writes `.jarvis-coordination.md` when coordination applies, and
writes a bounded session context pack under the app-data `session-context` directory. Delivery
is:

- Automatic on terminal session start.
- Re-run at supported lifecycle points such as agent/mode changes, reattach, and verified
  interactive-agent submissions.
- Idempotent: rewriting the managed block does not duplicate content.

## Managed Block Contract

```
<!-- VIBESPACE:AGENT-BRIEFING:START — managed by VibeSpace, do not edit between markers -->

[content]

<!-- VIBESPACE:AGENT-BRIEFING:END -->
```

Rules:

- Content between markers is owned exclusively by VibeSpace.
- Agents may read but must not modify the managed block.
- Content outside the markers is owned by the agent or user.
- If markers are missing (user deleted them), VibeSpace appends a fresh block.

## Terminal Session Lifecycle

| Phase                                 | Context behavior                                     |
| ------------------------------------- | ---------------------------------------------------- |
| Session created                       | Briefing constructed and injected                    |
| Agent detected                        | Coordination mode rules added                        |
| Agent or mode changed                 | Managed briefing is re-delivered                     |
| Verified interactive-agent submission | Briefing is refreshed before input is forwarded      |
| Session closed                        | No cleanup required (file persists for next session) |

## PTY Integration

The native terminal (`app/src-tauri/src/terminal.rs`) manages PTY processes. Managed briefing
content is file-based, while the guarded `/vibespace` palette observes bounded prompt evidence
and the native CLI uses authenticated local IPC. The native PTY layer handles:

- Process spawning and lifecycle.
- Terminal snapshots (`terminal_snapshot.rs`).

Frontend terminal persistence stores scrollback and snapshots in Dexie; that storage is not a
responsibility of native `terminal.rs`.

## Agent Coordination

When multiple agent terminals are active:

- Each agent receives its own briefing with the shared map summary.
- The "other agents" section lists peer agents with idle time and last output.
- In coordinated mode, agents follow the lock/ledger protocol.
- Lock tooling is conditional. This worktree currently has no
  `.agents/tools/agent-lock.mjs`, so coordination must not claim that helper is installed.

## Environment

- Spawned agent terminals receive bounded metadata variables such as `JARVIS_AGENT_SLUG`,
  optional agent/project names, and paths to the managed agent and coordination files.
- Native CLI installation creates managed `vibespace` / `vs` shims and may install managed
  shell prompt integration.
- Briefing content is delivered through managed files; command operations use authenticated
  local IPC.

## Limitations

- Briefing injection requires the terminal session to have a known working directory.
- Agents that ignore both the managed instruction files and referenced session context pack may
  not consume the delivered context.
- Terminal output is not parsed for context signals; detection is metadata-based.
