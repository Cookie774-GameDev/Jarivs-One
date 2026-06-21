import { describe, expect, it } from 'vitest';
import { HelpCircle, Terminal, Wrench } from 'lucide-react';
import {
  SLASH_COMMANDS,
  normalizeSlashCmd,
  orderSlashCommandsForDisplay,
  slashCmdMatchScore,
  type SlashCommandDef,
} from './SlashCommandTypeahead';

describe('orderSlashCommandsForDisplay', () => {
  it('matches the grouped visual order used by the slash dropdown', () => {
    const commands: SlashCommandDef[] = [
      { cmd: 'help', description: 'Help', icon: HelpCircle, category: 'utility' },
      { cmd: 'tools', description: 'Tools', icon: Wrench, category: 'navigation' },
      { cmd: 'terminals', description: 'Terminal', icon: Terminal, category: 'chat' },
    ];

    expect(orderSlashCommandsForDisplay(commands).map((cmd) => cmd.cmd)).toEqual([
      'terminals',
      'tools',
      'help',
    ]);
  });

  it('includes Hive as a chat command for the composer', () => {
    const hive = SLASH_COMMANDS.find((cmd) => cmd.cmd === 'hive');

    expect(hive).toMatchObject({
      cmd: 'hive',
      category: 'chat',
      hasOptions: true,
    });
    expect(SLASH_COMMANDS.some((cmd) => cmd.cmd === 'vibehive')).toBe(false);
  });

  it('does not duplicate terminal navigation and attach commands', () => {
    const terminalLike = SLASH_COMMANDS.filter((cmd) =>
      ['terminal', 'terminals'].includes(cmd.cmd),
    );
    expect(terminalLike).toHaveLength(1);
    expect(terminalLike[0]?.cmd).toBe('terminals');
    expect(SLASH_COMMANDS.some((cmd) => cmd.cmd === 'files')).toBe(false);
    expect(SLASH_COMMANDS.some((cmd) => cmd.cmd === 'contextmap')).toBe(false);
    expect(SLASH_COMMANDS.some((cmd) => cmd.cmd === 'skillspage')).toBe(false);
  });

  it('normalizes legacy slash spellings', () => {
    expect(normalizeSlashCmd('terminal')).toBe('terminals');
    expect(normalizeSlashCmd('contextmap')).toBe('context');
  });

  it('matches alias queries to the canonical command', () => {
    const terminals = SLASH_COMMANDS.find((cmd) => cmd.cmd === 'terminals')!;
    expect(slashCmdMatchScore('terminal', terminals)).toBeGreaterThan(0);
  });
});
