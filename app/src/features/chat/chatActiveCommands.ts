/**
 * Active chat slash commands that launch real work (not attach chips).
 * Used by agent launch messages and MessagePart rendering.
 */

export type ActiveChatCommand = 'multitask' | 'subagents';

export interface ParsedActiveChatCommand {
  cmd: ActiveChatCommand;
  task: string;
}

const ACTIVE_CMDS = new Set<string>(['multitask', 'subagents']);

export function isActiveChatCommand(cmd: string): cmd is ActiveChatCommand {
  return ACTIVE_CMDS.has(cmd.trim().toLowerCase());
}

/** Canonical user-visible message for a launched active command. */
export function formatActiveChatCommandMessage(cmd: ActiveChatCommand, task: string): string {
  const body = task.replace(/\s+/g, ' ').trim();
  return body ? `/${cmd} ${body}` : `/${cmd}`;
}

/**
 * Parse a user message that is (only) an active command invocation.
 * Supports the current format and the legacy “Slash command /X attached: …” wording.
 */
export function parseActiveChatCommandMessage(text: string): ParsedActiveChatCommand | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;

  const legacy = t.match(/^Slash command \/(multitask|subagents)\s+attached:\s*(.*)$/i);
  if (legacy) {
    return {
      cmd: legacy[1]!.toLowerCase() as ActiveChatCommand,
      task: (legacy[2] ?? '').trim(),
    };
  }

  const direct = t.match(/^\/(multitask|subagents)\b(?:\s+(.*))?$/i);
  if (direct) {
    return {
      cmd: direct[1]!.toLowerCase() as ActiveChatCommand,
      task: (direct[2] ?? '').trim(),
    };
  }

  return null;
}

export function activeChatCommandLabel(cmd: ActiveChatCommand): string {
  return cmd === 'subagents' ? 'Subagents' : 'Multitask';
}
