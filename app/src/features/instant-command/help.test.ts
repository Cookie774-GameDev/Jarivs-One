import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG, INSTANT_COMMAND_INDEX } from './catalog';
import type { CommandCatalogIndex, CommandDefinition } from './catalogTypes';
import { buildInstantCommandHelp, previewInstantCommand, searchInstantCommandHelp } from './help';

describe('Instant Command catalog help', () => {
  it('generates one accessible help item per catalog definition', () => {
    const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);
    expect(help).toHaveLength(INSTANT_COMMAND_CATALOG.length);
    expect(help.find((item) => item.id === 'terminal.close')).toMatchObject({
      safety: 'confirm',
      availability: 'blocked',
    });
    expect(help.every((item) => item.examples.length > 0 && item.aliases.length > 0)).toBe(true);
  });

  it('returns a deep immutable metadata snapshot rather than catalog-owned arrays', () => {
    const aliases = ['/snapshot'];
    const examples = ['/snapshot'];
    const definition = {
      ...INSTANT_COMMAND_CATALOG[0]!,
      aliases,
      examples,
    } as CommandDefinition;
    const help = buildInstantCommandHelp([definition]);

    aliases.push('/mutated');
    examples.push('/mutated');

    expect(help[0]?.aliases).toEqual(['/snapshot']);
    expect(help[0]?.examples).toEqual(['/snapshot']);
    expect(Object.isFrozen(help)).toBe(true);
    expect(Object.isFrozen(help[0])).toBe(true);
    expect(Object.isFrozen(help[0]?.aliases)).toBe(true);
    expect(Object.isFrozen(help[0]?.examples)).toBe(true);
  });

  it('searches locally by id, alias, and family', () => {
    const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);
    expect(searchInstantCommandHelp(help, 'fullscreen').map((item) => item.id)).toContain(
      'fullscreen.set',
    );
    expect(
      searchInstantCommandHelp(help, 'team').every((item) => item.searchText.includes('team')),
    ).toBe(true);
    expect(searchInstantCommandHelp(help, '/connect')).toEqual([
      expect.objectContaining({ id: 'connections.open', availability: 'available' }),
    ]);
    expect(Object.isFrozen(searchInstantCommandHelp(help, ''))).toBe(true);
  });

  it('fails closed for malformed, control-bearing, or overlength search queries', () => {
    const help = buildInstantCommandHelp(INSTANT_COMMAND_CATALOG);
    expect(searchInstantCommandHelp(help, 42 as unknown as string)).toEqual([]);
    expect(searchInstantCommandHelp(help, 'terminal\nprivate')).toEqual([]);
    expect(searchInstantCommandHelp(help, 'x'.repeat(257))).toEqual([]);
  });

  it('previews the exact parsed action, target, safety gate, and availability locally', () => {
    expect(previewInstantCommand(INSTANT_COMMAND_INDEX, 'close terminal two')).toEqual({
      status: 'ready',
      id: 'terminal.close',
      action: 'terminal.close',
      target: 'terminal 2',
      confirmationRequired: true,
      approvalRequired: false,
      availability: 'blocked',
    });
    expect(previewInstantCommand(INSTANT_COMMAND_INDEX, '/connect')).toEqual({
      status: 'ready',
      id: 'connections.open',
      action: 'connections.open',
      target: 'settings providers',
      confirmationRequired: false,
      approvalRequired: false,
      availability: 'available',
    });
  });

  it('fails closed on rejected input and never reflects message payloads into preview', () => {
    expect(previewInstantCommand(INSTANT_COMMAND_INDEX, 'message agent codex')).toEqual({
      status: 'rejected',
      reason: 'Name a terminal, then a message.',
    });
    const preview = previewInstantCommand(
      INSTANT_COMMAND_INDEX,
      'message agent codex: private payload',
    );
    expect(preview).toMatchObject({
      status: 'ready',
      action: 'agent.message',
      target: 'provider codex',
      approvalRequired: true,
    });
    expect(JSON.stringify(preview)).not.toContain('private payload');
    expect(previewInstantCommand(INSTANT_COMMAND_INDEX, 'write me a poem')).toEqual({
      status: 'unmatched',
    });
  });

  it('contains matcher and slot-parser faults without reflecting their content', () => {
    const parserFault = {
      entries: [],
      match: () => [],
      matchWithOffsets: () => [
        {
          definition: {
            ...INSTANT_COMMAND_CATALOG[0]!,
            parseSlots: () => {
              throw new Error('private parser payload');
            },
          },
          alias: '/fault',
          sourceStart: 0,
          sourceEnd: 6,
          remainder: '',
        },
      ],
    } satisfies CommandCatalogIndex;
    const matcherFault = {
      ...parserFault,
      matchWithOffsets: () => {
        throw new Error('private matcher payload');
      },
    } satisfies CommandCatalogIndex;

    for (const index of [parserFault, matcherFault]) {
      const preview = previewInstantCommand(index, '/fault private command payload');
      expect(preview).toEqual({
        status: 'rejected',
        reason: 'Command preview is unavailable.',
      });
      expect(JSON.stringify(preview)).not.toMatch(/private|payload/iu);
    }
  });
});
