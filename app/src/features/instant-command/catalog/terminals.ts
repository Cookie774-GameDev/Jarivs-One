import type { TerminalSelector } from '../types';
import type {
  CatalogMatch,
  CatalogParseResult,
  CommandAvailability,
  CommandSafety,
} from '../catalogTypes';

export type TerminalAgentCommandInput = Readonly<{
  id: string;
  family: 'terminal' | 'agent';
  aliases: readonly string[];
  authority: string;
  safety: CommandSafety;
  availability: CommandAvailability;
  slotGrammar?: 'none' | 'remainder';
  parseSlots?: (match: CatalogMatch, source: string) => CatalogParseResult;
}>;

const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
});

export function parseTerminalSelectorText(raw: string): TerminalSelector | null {
  const source = raw.trim();
  if (!source) return null;
  if (/^(?:all terminals|every terminal|all agents)$/iu.test(source)) return { scope: 'all' };
  const ordinal = /^(?:terminal\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/iu.exec(
    source,
  );
  if (ordinal) {
    const token = ordinal[1]!.toLowerCase();
    return { ordinal: NUMBER_WORDS[token] ?? Number(token) };
  }
  const pane = /^pane\s+([^\s:]+)$/iu.exec(source);
  if (pane) return { paneId: pane[1]! };
  const session = /^session\s+([^\s:]+)$/iu.exec(source);
  if (session) return { sessionId: session[1]! };
  if (/^(?:codex|opencode|claude|gemini|copilot)$/iu.test(source)) {
    return { provider: source.toLowerCase() };
  }
  return { label: source };
}

function selectorSlots(match: CatalogMatch): CatalogParseResult {
  const selector = parseTerminalSelectorText(match.remainder);
  return selector
    ? { status: 'parsed', slots: { selector } }
    : { status: 'rejected', reason: 'Name one exact terminal.' };
}

function messageSlots(match: CatalogMatch, source: string): CatalogParseResult {
  const originalRemainder = source
    .slice(match.sourceEnd)
    .replace(/^\s*:\s*/u, '')
    .trim();
  const boundary = originalRemainder.indexOf(':');
  if (boundary < 1) return { status: 'rejected', reason: 'Name a terminal, then a message.' };
  const selector = parseTerminalSelectorText(originalRemainder.slice(0, boundary));
  const payload = originalRemainder.slice(boundary + 1).trim();
  if (!selector || !payload)
    return { status: 'rejected', reason: 'Name a terminal, then a message.' };
  return { status: 'parsed', slots: { selector, payload } };
}

const entries: readonly TerminalAgentCommandInput[] = [
  ['terminal.focus', 'terminal', ['focus terminal'], 'terminal.pane', 'reversible', 'blocked'],
  ['terminal.list', 'terminal', ['list terminals'], 'terminal.snapshot', 'read', 'available'],
  ['terminal.status', 'terminal', ['terminal status'], 'terminal.snapshot', 'read', 'available'],
  ['terminal.split', 'terminal', ['split terminal'], 'terminal.pane', 'reversible', 'blocked'],
  ['terminal.rename', 'terminal', ['rename terminal'], 'terminal.pane', 'reversible', 'blocked'],
  [
    'terminal.move_project',
    'terminal',
    ['move terminal to project'],
    'terminal.project-move',
    'confirm',
    'blocked',
  ],
  [
    'terminal.restart',
    'terminal',
    ['restart terminal'],
    'terminal.lifecycle',
    'confirm',
    'blocked',
  ],
  ['terminal.clear', 'terminal', ['clear terminal'], 'terminal.lifecycle', 'reversible', 'blocked'],
  ['terminal.stop', 'terminal', ['stop terminal'], 'terminal.lifecycle', 'confirm', 'blocked'],
  ['terminal.close', 'terminal', ['close terminal'], 'terminal.lifecycle', 'confirm', 'blocked'],
  [
    'terminal.run_saved_command',
    'terminal',
    ['run saved terminal command'],
    'terminal.queue',
    'approval',
    'blocked',
  ],
  [
    'terminal.cancel_queued',
    'terminal',
    ['cancel queued command'],
    'terminal.queue',
    'reversible',
    'blocked',
  ],
  ['agent.message', 'agent', ['message agent'], 'terminal.prompt-delivery', 'approval', 'blocked'],
  [
    'agent.broadcast',
    'agent',
    ['broadcast agents'],
    'terminal.prompt-delivery',
    'approval',
    'blocked',
  ],
  ['agent.status', 'agent', ['agent status'], 'terminal.snapshot', 'read', 'available'],
  [
    'agent.continue',
    'agent',
    ['continue agent'],
    'terminal.prompt-delivery',
    'approval',
    'blocked',
  ],
  ['agent.stop', 'agent', ['stop agent'], 'terminal.lifecycle', 'confirm', 'blocked'],
  ['agent.assign_role', 'agent', ['assign agent role'], 'agent.registry', 'reversible', 'blocked'],
  [
    'agent.give_context',
    'agent',
    ['give context to agent'],
    'context.gateway',
    'approval',
    'blocked',
  ],
].map(([id, family, aliases, authority, safety, availability]) => ({
  id,
  family,
  aliases,
  authority,
  safety,
  availability,
  slotGrammar: id === 'terminal.list' ? 'none' : 'remainder',
  parseSlots:
    id === 'terminal.list'
      ? () => ({ status: 'parsed', slots: {} })
      : id === 'agent.message' || id === 'agent.broadcast'
        ? messageSlots
        : selectorSlots,
})) as readonly TerminalAgentCommandInput[];

export const TERMINAL_AGENT_COMMAND_INPUTS = Object.freeze(entries);
