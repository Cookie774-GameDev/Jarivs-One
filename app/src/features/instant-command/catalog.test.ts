import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG, INSTANT_COMMAND_INDEX } from './catalog';

describe('INSTANT_COMMAND_CATALOG', () => {
  it('covers every canonical route with a locally indexed navigation command', () => {
    const terminal = INSTANT_COMMAND_INDEX.matchWithOffsets('open terminal page')[0];
    expect(terminal?.definition.id).toBe('page.open');
    expect(terminal?.definition.parseSlots(terminal, 'open terminal page')).toEqual({
      status: 'parsed',
      slots: { route: 'terminal' },
    });
    expect(INSTANT_COMMAND_INDEX.match('open Jarvis settings')[0]?.id).toBe('settings.open');
  });

  it('contains the approved deterministic families and Calyx commands', () => {
    const families = new Set(INSTANT_COMMAND_CATALOG.map((entry) => entry.family));
    expect(families).toEqual(
      new Set([
        'navigation',
        'terminal',
        'agent',
        'project',
        'chat',
        'schedule',
        'settings',
        'media',
        'tools',
        'files',
        'tasks',
        'workbench',
        'team',
      ]),
    );

    const teamIds = INSTANT_COMMAND_CATALOG.filter((entry) => entry.family === 'team').map(
      (entry) => entry.id,
    );
    expect(teamIds).toEqual([
      'team.connect',
      'team.disconnect',
      'team.list',
      'team.open',
      'team.message',
      'team.broadcast',
      'team.role.assign',
      'team.task.assign',
      'team.handoff',
      'team.pause',
      'team.resume',
      'team.status',
    ]);
    expect(INSTANT_COMMAND_INDEX.match('connect terminals one and two as a team')[0]?.id).toBe(
      'team.connect',
    );
    expect(INSTANT_COMMAND_INDEX.match('tell team alpha to run the release audit')[0]?.id).toBe(
      'team.message',
    );
  });

  it('marks unproven or destructive commands unavailable or confirmation-gated', () => {
    const byId = new Map(INSTANT_COMMAND_CATALOG.map((entry) => [entry.id, entry]));
    expect(byId.get('team.connect')).toMatchObject({
      availability: 'capability-gated',
      authority: 'terminal-peer-fabric',
    });
    expect(byId.get('schedule.delete')?.safety).toBe('confirm');
    expect(byId.get('chat.delete')?.safety).toBe('confirm');
    expect(byId.get('tool.run')?.safety).toBe('approval');
    expect(byId.get('file.delete')).toBeUndefined();
  });

  it('declares a slot grammar and parses original-text remainder for every command', () => {
    for (const command of INSTANT_COMMAND_CATALOG) {
      expect(command.slotGrammar).toBeTruthy();
      expect(command.parseSlots).toBeTypeOf('function');
    }

    const source = 'message terminal two: Run NPM --Flag!';
    const match = INSTANT_COMMAND_INDEX.matchWithOffsets(source).find(
      (candidate) => candidate.definition.id === 'terminal.message',
    );
    expect(match).toBeDefined();
    expect(match!.definition.parseSlots(match!, source)).toEqual({
      status: 'parsed',
      slots: { remainder: 'two: Run NPM --Flag!' },
    });
  });
});
