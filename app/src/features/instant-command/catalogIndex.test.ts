import { describe, expect, it } from 'vitest';
import { buildCatalogIndex } from './catalogIndex';
import type { CommandDefinition } from './catalogTypes';

function definition(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: 'navigation.chat.open',
    family: 'navigation',
    aliases: ['open chat'],
    safety: 'read',
    authority: 'ui.route',
    availability: 'available',
    examples: ['open chat'],
    fixtures: {
      negative: ['tell me about opening chat'],
      ambiguity: ['open the selected item'],
      authorization: ['open chat as another account'],
      latencyBudgetMs: 500,
    },
    ...overrides,
  };
}

describe('buildCatalogIndex', () => {
  it('rejects duplicate command ids', () => {
    expect(() => buildCatalogIndex([definition(), definition()])).toThrow(/duplicate command id/i);
  });

  it('rejects normalized alias collisions across commands', () => {
    expect(() =>
      buildCatalogIndex([
        definition(),
        definition({ id: 'navigation.history.open', aliases: ['  OPEN   CHAT  '] }),
      ]),
    ).toThrow(/alias collision/i);
  });

  it('rejects entries without a canonical authority or complete fixtures', () => {
    expect(() => buildCatalogIndex([definition({ authority: '' })])).toThrow(/authority/i);
    expect(() =>
      buildCatalogIndex([definition({ fixtures: { ...definition().fixtures, negative: [] } })]),
    ).toThrow(/negative fixture/i);
  });

  it('matches a normalized token prefix without scanning unrelated commands', () => {
    const index = buildCatalogIndex([
      definition(),
      definition({
        id: 'terminal.message',
        family: 'terminal',
        aliases: ['message terminal', 'tell terminal'],
        authority: 'terminal.prompt-delivery',
        examples: ['message terminal two: run tests'],
      }),
    ]);

    expect(index.match('  MESSAGE   terminal two: run tests  ').map((entry) => entry.id)).toEqual([
      'terminal.message',
    ]);
    expect(index.match('explain message queues')).toEqual([]);
  });
});
