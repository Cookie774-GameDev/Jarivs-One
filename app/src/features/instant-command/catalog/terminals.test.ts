import { describe, expect, it } from 'vitest';
import { TERMINAL_AGENT_COMMAND_INPUTS, parseTerminalSelectorText } from './terminals';

describe('terminal and agent command catalog', () => {
  it.each([
    ['terminal two', { ordinal: 2 }],
    ['pane pane_7', { paneId: 'pane_7' }],
    ['session sess_9', { sessionId: 'sess_9' }],
    ['Codex', { provider: 'codex' }],
    ['all terminals', { scope: 'all' }],
  ])('uses one deterministic selector grammar for %s', (source, expected) => {
    expect(parseTerminalSelectorText(source)).toEqual(expected);
  });

  it('declares the exhaustive terminal and agent lifecycle IDs without granting blocked authority', () => {
    expect(TERMINAL_AGENT_COMMAND_INPUTS.map((entry) => entry.id)).toEqual([
      'terminal.focus',
      'terminal.list',
      'terminal.status',
      'terminal.split',
      'terminal.rename',
      'terminal.move_project',
      'terminal.restart',
      'terminal.clear',
      'terminal.stop',
      'terminal.close',
      'terminal.run_saved_command',
      'terminal.cancel_queued',
      'agent.message',
      'agent.broadcast',
      'agent.status',
      'agent.continue',
      'agent.stop',
      'agent.assign_role',
      'agent.give_context',
    ]);
    expect(
      TERMINAL_AGENT_COMMAND_INPUTS.filter((entry) => entry.availability === 'available').map(
        (entry) => entry.id,
      ),
    ).toEqual(['terminal.list', 'terminal.status', 'agent.status']);
  });

  it('preserves message payload casing and punctuation after the exact selector', () => {
    const input = TERMINAL_AGENT_COMMAND_INPUTS.find((entry) => entry.id === 'agent.message')!;
    const source = 'message agent terminal two: Review API.ts, please!';
    expect(
      input.parseSlots?.(
        {
          definition: undefined as never,
          alias: 'message agent',
          sourceStart: 0,
          sourceEnd: 'message agent'.length,
          remainder: 'terminal two: Review API.ts, please!',
        },
        source,
      ),
    ).toEqual({
      status: 'parsed',
      slots: { selector: { ordinal: 2 }, payload: 'Review API.ts, please!' },
    });
  });
});
