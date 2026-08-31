import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_CATALOG } from './catalog';
import { buildInstantCommandAcceptanceCorpus } from './acceptanceCorpus';
import { classifyInstantCommandInput } from './parse';

describe('Instant Command exhaustive acceptance corpus', () => {
  it('builds the required deterministic fixture counts with every command represented', () => {
    const first = buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);
    const second = buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);

    expect(first.positive.length).toBeGreaterThanOrEqual(300);
    expect(first.closeNegative.length).toBeGreaterThanOrEqual(300);
    expect(first.negative).toBe(first.closeNegative);
    expect(first.ambiguity.length).toBeGreaterThanOrEqual(100);
    expect(first.authorization.length).toBeGreaterThanOrEqual(100);
    expect(second).toEqual(first);

    const positiveCommandIds = new Set(first.positive.map((fixture) => fixture.commandId));
    expect(positiveCommandIds).toEqual(
      new Set(INSTANT_COMMAND_CATALOG.map((definition) => definition.id)),
    );
    expect(new Set(first.families)).toEqual(
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
  });

  it('uses unique stable IDs, bounded safe phrases, and immutable fixture records', () => {
    const corpus = buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);
    const fixtures = [
      ...corpus.positive,
      ...corpus.closeNegative,
      ...corpus.ambiguity,
      ...corpus.authorization,
    ];

    expect(new Set(fixtures.map((fixture) => fixture.fixtureId)).size).toBe(fixtures.length);
    expect(
      new Set(
        fixtures.map(
          (fixture) => `${fixture.kind}\u0000${fixture.commandId}\u0000${fixture.phrase}`,
        ),
      ).size,
    ).toBe(fixtures.length);
    for (const fixture of fixtures) {
      expect(fixture.phrase.length).toBeGreaterThan(0);
      expect(fixture.phrase.length).toBeLessThanOrEqual(512);
      expect(fixture.phrase).not.toMatch(/[\u0000-\u001f\u007f]/u);
      expect(Object.isFrozen(fixture)).toBe(true);
    }
    expect(Object.isFrozen(corpus)).toBe(true);
    expect(Object.isFrozen(corpus.positive)).toBe(true);
    expect(JSON.stringify(corpus)).not.toMatch(/api[_ -]?key|bearer\s|password\s*[:=]/iu);
  });

  it('stays on the local catalog dependency graph', () => {
    const source = readFileSync('src/features/instant-command/acceptanceCorpus.ts', 'utf8');
    expect(source).not.toMatch(/lib\/ai|provider|openai|anthropic|ollama|11434/iu);
  });

  it('covers every canonical slash alias as an exact positive fixture bound to its command', () => {
    const corpus = buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);
    const positiveBindings = new Set(
      corpus.positive.map((fixture) => `${fixture.commandId}\u0000${fixture.phrase}`),
    );

    for (const command of INSTANT_COMMAND_CATALOG) {
      for (const alias of command.aliases.filter((candidate) => candidate.startsWith('/'))) {
        expect(positiveBindings.has(`${command.id}\u0000${alias}`), `${command.id} ${alias}`).toBe(
          true,
        );
      }
    }
    expect(positiveBindings.size).toBe(corpus.positive.length);
  });

  it('keeps secure connection and provider launch identities distinct in acceptance coverage', () => {
    const corpus = buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);
    const commandFor = (phrase: string) =>
      corpus.positive.find((fixture) => fixture.phrase === phrase)?.commandId;

    expect(commandFor('/connect')).toBe('connections.open');
    expect(commandFor('/plugin-connect')).toBe('plugin.connect');
    expect(commandFor('/team-connect')).toBe('team.connect');
    expect(classifyInstantCommandInput('open Codex')).toMatchObject({
      status: 'matched',
      command: { kind: 'open-agent-cli', provider: 'codex' },
    });
    expect(classifyInstantCommandInput('open OpenCode')).toMatchObject({
      status: 'matched',
      command: { kind: 'open-agent-cli', provider: 'opencode' },
    });
  });
});
