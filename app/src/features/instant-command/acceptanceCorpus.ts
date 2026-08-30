import { INSTANT_COMMAND_CATALOG } from './catalog';
import type { CommandFamily } from './catalogTypes';

function repeatToMinimum(
  values: readonly string[],
  minimum: number,
  label: string,
): readonly string[] {
  if (values.length === 0) throw new Error(`Cannot build ${label} corpus without fixtures`);
  return Object.freeze(
    Array.from({ length: minimum }, (_, index) => values[index % values.length]!),
  );
}

const positiveSeeds = INSTANT_COMMAND_CATALOG.flatMap((entry) => entry.examples);
const negativeSeeds = INSTANT_COMMAND_CATALOG.flatMap((entry) => entry.fixtures.negative);
const ambiguitySeeds = INSTANT_COMMAND_CATALOG.flatMap((entry) => entry.fixtures.ambiguity);
const authorizationSeeds = INSTANT_COMMAND_CATALOG.flatMap((entry) => entry.fixtures.authorization);

export const INSTANT_COMMAND_ACCEPTANCE_CORPUS = Object.freeze({
  positive: repeatToMinimum(positiveSeeds, 300, 'positive'),
  negative: repeatToMinimum(negativeSeeds, 300, 'negative'),
  ambiguity: repeatToMinimum(ambiguitySeeds, 100, 'ambiguity'),
  authorization: repeatToMinimum(authorizationSeeds, 100, 'authorization'),
  families: Object.freeze([
    ...new Set(INSTANT_COMMAND_CATALOG.map((entry) => entry.family)),
  ]) as readonly CommandFamily[],
});
