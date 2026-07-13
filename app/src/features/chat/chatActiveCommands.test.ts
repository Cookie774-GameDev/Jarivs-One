import { describe, expect, it } from 'vitest';
import {
  activeChatCommandLabel,
  formatActiveChatCommandMessage,
  isActiveChatCommand,
  parseActiveChatCommandMessage,
} from './chatActiveCommands';

describe('chatActiveCommands', () => {
  it('formats active command messages without attachment language', () => {
    expect(formatActiveChatCommandMessage('multitask', 'Review runtime modes')).toBe(
      '/multitask Review runtime modes',
    );
    expect(formatActiveChatCommandMessage('subagents', '  Audit panels  ')).toBe(
      '/subagents Audit panels',
    );
    expect(formatActiveChatCommandMessage('multitask', '')).toBe('/multitask');
  });

  it('parses canonical and legacy active command messages', () => {
    expect(parseActiveChatCommandMessage('/multitask Fix the chip')).toEqual({
      cmd: 'multitask',
      task: 'Fix the chip',
    });
    expect(parseActiveChatCommandMessage('/subagents split work and ship')).toEqual({
      cmd: 'subagents',
      task: 'split work and ship',
    });
    expect(
      parseActiveChatCommandMessage('Slash command /multitask attached: Review runtime modes'),
    ).toEqual({
      cmd: 'multitask',
      task: 'Review runtime modes',
    });
  });

  it('does not treat plain prose or attach commands as active commands', () => {
    expect(parseActiveChatCommandMessage('please /multitask later')).toBeNull();
    expect(parseActiveChatCommandMessage('/file readme.md')).toBeNull();
    expect(parseActiveChatCommandMessage('/permissions agent')).toBeNull();
    expect(parseActiveChatCommandMessage('hello')).toBeNull();
  });

  it('identifies active command names and labels', () => {
    expect(isActiveChatCommand('multitask')).toBe(true);
    expect(isActiveChatCommand('subagents')).toBe(true);
    expect(isActiveChatCommand('file')).toBe(false);
    expect(activeChatCommandLabel('multitask')).toBe('Multitask');
    expect(activeChatCommandLabel('subagents')).toBe('Subagents');
  });
});
