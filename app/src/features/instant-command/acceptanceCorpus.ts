import { INSTANT_COMMAND_CATALOG } from './catalog';
import type { CommandAvailability, CommandDefinition, CommandFamily } from './catalogTypes';

export type AcceptanceFixtureKind = 'positive' | 'close_negative' | 'ambiguity' | 'authorization';

export type AcceptanceFixture = Readonly<{
  fixtureId: string;
  kind: AcceptanceFixtureKind;
  commandId: string;
  family: CommandFamily;
  phrase: string;
  expected:
    'recognized' | 'unavailable' | 'unmatched' | 'needs_clarification' | 'needs_confirmation';
}>;

export type InstantCommandAcceptanceCorpus = Readonly<{
  positive: readonly AcceptanceFixture[];
  closeNegative: readonly AcceptanceFixture[];
  /** Backward-compatible alias retained for existing acceptance consumers. */
  negative: readonly AcceptanceFixture[];
  ambiguity: readonly AcceptanceFixture[];
  authorization: readonly AcceptanceFixture[];
  families: readonly CommandFamily[];
}>;

type FixtureSeed = Readonly<{
  command: CommandDefinition;
  phrase: string;
}>;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function positiveExpectation(availability: CommandAvailability): AcceptanceFixture['expected'] {
  return availability === 'blocked' ? 'unavailable' : 'recognized';
}

function fixtureSeeds(
  definitions: readonly CommandDefinition[],
  select: (definition: CommandDefinition) => readonly string[],
): readonly FixtureSeed[] {
  return definitions.flatMap((command) =>
    select(command).map((phrase) => Object.freeze({ command, phrase })),
  );
}

function expandFixtures(
  seeds: readonly FixtureSeed[],
  minimum: number,
  kind: AcceptanceFixtureKind,
  expected:
    AcceptanceFixture['expected'] | ((command: CommandDefinition) => AcceptanceFixture['expected']),
): readonly AcceptanceFixture[] {
  if (seeds.length === 0) throw new Error(`Cannot build ${kind} corpus without fixtures`);
  const count = Math.max(minimum, seeds.length);
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const seed = seeds[index % seeds.length]!;
      const phrase = seed.phrase.trim();
      if (!phrase || phrase.length > 512 || CONTROL_CHARACTER.test(phrase)) {
        throw new Error(`${seed.command.id} has an unsafe ${kind} fixture`);
      }
      return Object.freeze({
        fixtureId: `${kind}:${String(index + 1).padStart(3, '0')}:${seed.command.id}`,
        kind,
        commandId: seed.command.id,
        family: seed.command.family,
        phrase,
        expected: typeof expected === 'function' ? expected(seed.command) : expected,
      });
    }),
  );
}

export function buildInstantCommandAcceptanceCorpus(
  definitions: readonly CommandDefinition[],
): InstantCommandAcceptanceCorpus {
  const positiveSeeds = fixtureSeeds(definitions, (command) => command.examples);
  const negativeSeeds = fixtureSeeds(definitions, (command) => command.fixtures.negative);
  const ambiguitySeeds = fixtureSeeds(definitions, (command) => command.fixtures.ambiguity);
  const authorizationSeeds = fixtureSeeds(definitions, (command) => command.fixtures.authorization);
  const closeNegative = expandFixtures(negativeSeeds, 300, 'close_negative', 'unmatched');

  return Object.freeze({
    positive: expandFixtures(positiveSeeds, 300, 'positive', (command) =>
      positiveExpectation(command.availability),
    ),
    closeNegative,
    negative: closeNegative,
    ambiguity: expandFixtures(ambiguitySeeds, 100, 'ambiguity', 'needs_clarification'),
    authorization: expandFixtures(authorizationSeeds, 100, 'authorization', 'needs_confirmation'),
    families: Object.freeze([...new Set(definitions.map((entry) => entry.family))]),
  });
}

export const INSTANT_COMMAND_ACCEPTANCE_CORPUS =
  buildInstantCommandAcceptanceCorpus(INSTANT_COMMAND_CATALOG);
