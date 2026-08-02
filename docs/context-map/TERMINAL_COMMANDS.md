# Terminal Commands and Slash Commands

## Overview

VibeSpace provides a guarded `/vibespace` terminal palette, a real-CLI contract, and managed
context briefing delivery for terminal agent sessions.

## Slash Commands

At a verified local shell prompt in a VibeSpace terminal pane:

| Command      | Description                                |
| ------------ | ------------------------------------------ |
| `/vibespace` | Open the in-pane VibeSpace command palette |

Capture and safety gating are implemented by
`app/src/features/terminals/terminalCommandFoundation.ts` and
`app/src/features/terminals/terminalSlashIntegration.ts`. The palette is implemented by
`app/src/features/terminals/TerminalCommandPalette.tsx`.

## Terminal Input Mode Detection

VibeSpace detects whether a terminal pane is running an interactive agent (such as Codex,
Claude Code, or similar CLI tools) versus a standard shell. When an agent terminal is
detected:

- The briefing block is injected automatically.
- Context refresh signals are forwarded.
- Coordination mode rules apply.

Slash interception requires OSC 133 prompt evidence plus local-shell and runtime guards.
Briefing delivery can also use configured agent metadata and bounded command/transcript
signatures; screen text is not the sole safety gate.

## Native CLI

The Tauri runtime installs managed `vibespace` and `vs` shims for the authenticated local
endpoint. Supported command families are:

| Family    | Implemented subcommands                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `context` | `list`, `current`, `use`, `clear`, `search`, `open`, `attach`, `refresh`, `sources`, `status`, `create` |
| `skills`  | `list`, `active`, `use`, `add`, `remove`, `clear`, `inspect`                                            |
| `agent`   | `list`, `current`, `use`, `clear`, `status`                                                             |
| `note`    | `new`, `open`, `link`                                                                                   |
| `daily`   | open with no argument; `add <text>`                                                                     |
| `project` | `current`, `switch`                                                                                     |
| root      | `status`, `help`                                                                                        |

`context create` accepts `--folder <path>`, `--file <path>`, or
`--github <owner/repository> --ref <ref>`. Parsing and local-IPC dispatch are implemented, but
successful source creation still depends on the corresponding frontend runtime authority and
source service.

## Agent Briefing Injection

When an agent terminal starts or refreshes, VibeSpace constructs a briefing payload
(`app/src/features/terminals/agentPromptPayload.ts`):

### Briefing Contents

| Section                | Source                           | Max chars |
| ---------------------- | -------------------------------- | --------- |
| Base rules             | Static                           | (fixed)   |
| Coordinated mode rules | Static (if coordinated)          | (fixed)   |
| Agent prompt           | User-configured agent prompt     | 12,000    |
| Project context        | Active project context blob      | 6,000     |
| Context Map summary    | Active map summary               | 4,000     |
| Coordination summary   | Agent coordination state         | 4,000     |
| Other agents           | Active agent list with idle time | (dynamic) |

### Managed Block

The briefing is wrapped in managed markers:

```
<!-- VIBESPACE:AGENT-BRIEFING:START — managed by VibeSpace, do not edit between markers -->

[briefing content]

<!-- VIBESPACE:AGENT-BRIEFING:END -->
```

Agents must not edit content between these markers. VibeSpace overwrites the block on each
refresh.

### Coordination Modes

| Mode        | Behavior                                                         |
| ----------- | ---------------------------------------------------------------- |
| default     | Base agent briefing                                              |
| coordinated | Full coordination rules: read ledger, claim locks, release locks |
| no-context  | Remove the managed agent briefing                                |

In coordinated mode, the briefing includes:

- Instruction to read the coordination summary and hidden `.vibespace` ledger.
- File lock claim/release protocol.
- Stale lock handling guidance.
- Other active agents with their idle time and last output line.

## Context Refresh

Briefing delivery runs at supported terminal lifecycle points: before process start when the
working directory is known, after spawn when it is resolved later, on reattach, on agent or
coordination-mode changes, and before a verified interactive-agent submission. Delivery
replaces the managed block atomically; the current source does not claim that every Context Map
mutation automatically reloads an already-running external agent.

## Skills Catalog

The terminal runtime exposes bounded skill list/select/add/remove/clear/inspect methods. The
retrieval service matches `selectedSkillIds` against entity tags to surface skill-relevant
context. Installation and discovery behavior belongs to the broader Skills system.
