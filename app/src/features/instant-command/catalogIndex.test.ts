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
    slotGrammar: 'remainder',
    parseSlots: (match) => ({ status: 'parsed', slots: { remainder: match.remainder } }),
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

  it('rejects duplicate normalized aliases within one command as unreachable', () => {
    expect(() =>
      buildCatalogIndex([definition({ aliases: ['open chat', '  OPEN   CHAT  '] })]),
    ).toThrow(/duplicate alias|unreachable/i);
  });

  it('rejects entries without a canonical authority or complete fixtures', () => {
    expect(() => buildCatalogIndex([definition({ authority: '' })])).toThrow(/authority/i);
    expect(() =>
      buildCatalogIndex([definition({ fixtures: { ...definition().fixtures, negative: [] } })]),
    ).toThrow(/negative fixture/i);
  });

  it('rejects unsafe or unbounded ids, authorities, aliases, and examples', () => {
    expect(() => buildCatalogIndex([definition({ id: 'navigation bad' })])).toThrow(/id/i);
    expect(() => buildCatalogIndex([definition({ authority: 'ui route' })])).toThrow(/authority/i);
    expect(() => buildCatalogIndex([definition({ aliases: ['x'.repeat(201)] })])).toThrow(/alias/i);
    expect(() => buildCatalogIndex([definition({ examples: ['open\nchat'] })])).toThrow(/example/i);
  });

  it('rejects empty, control-bearing, or unbounded fixture values', () => {
    expect(() =>
      buildCatalogIndex([
        definition({ fixtures: { ...definition().fixtures, negative: ['   '] } }),
      ]),
    ).toThrow(/negative fixture/i);
    expect(() =>
      buildCatalogIndex([
        definition({ fixtures: { ...definition().fixtures, ambiguity: ['bad\nfixture'] } }),
      ]),
    ).toThrow(/ambiguity fixture/i);
    expect(() =>
      buildCatalogIndex([
        definition({
          fixtures: { ...definition().fixtures, authorization: ['x'.repeat(501)] },
        }),
      ]),
    ).toThrow(/authorization fixture/i);
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

  it('returns original-text offsets and remainder without changing casing or punctuation', () => {
    const index = buildCatalogIndex([
      definition({
        id: 'terminal.message',
        family: 'terminal',
        aliases: ['message terminal'],
        authority: 'terminal.prompt-delivery',
      }),
    ]);
    const source = '  MESSAGE   terminal two: Run NPM --Flag!  ';
    const match = index.matchWithOffsets(source)[0];

    expect(match).toMatchObject({ alias: 'message terminal', remainder: 'two: Run NPM --Flag!' });
    expect(source.slice(match!.sourceStart, match!.sourceEnd).replace(/\s+/gu, ' ')).toBe(
      'MESSAGE terminal',
    );
  });

  it('rejects oversized or control-bearing source before matching', () => {
    const index = buildCatalogIndex([definition()]);
    expect(index.match(`open chat ${'x'.repeat(4_097)}`)).toEqual([]);
    expect(index.match('open chat\u0000hidden')).toEqual([]);
  });
});
