import type { CatalogMatch, CommandCatalogIndex, CommandDefinition } from './catalogTypes';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const SAFE_CATALOG_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const MAX_ALIAS_LENGTH = 200;
const MAX_FIXTURE_LENGTH = 500;
const MAX_SOURCE_LENGTH = 4_096;

export function normalizeCatalogPhrase(source: string): string {
  return source.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function requireFixture(
  command: CommandDefinition,
  name: 'negative' | 'ambiguity' | 'authorization',
): void {
  if (command.fixtures[name].length === 0) {
    throw new Error(`${command.id} is missing a ${name} fixture`);
  }
  if (
    command.fixtures[name].some(
      (fixture) =>
        !fixture.trim() || fixture.length > MAX_FIXTURE_LENGTH || CONTROL_CHARACTER.test(fixture),
    )
  ) {
    throw new Error(`${command.id} has an invalid ${name} fixture`);
  }
}

export function buildCatalogIndex(definitions: readonly CommandDefinition[]): CommandCatalogIndex {
  const ids = new Set<string>();
  const aliases = new Map<string, CommandDefinition>();
  const byFirstToken = new Map<string, Array<{ alias: string; definition: CommandDefinition }>>();

  for (const definition of definitions) {
    const id = definition.id.trim();
    if (!id) throw new Error('Command id is required');
    if (id !== definition.id || !SAFE_CATALOG_IDENTIFIER.test(id)) {
      throw new Error(`Invalid command id: ${definition.id}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate command id: ${id}`);
    ids.add(id);
    if (
      definition.authority !== definition.authority.trim() ||
      !SAFE_CATALOG_IDENTIFIER.test(definition.authority)
    ) {
      throw new Error(`${id} has an invalid authority`);
    }
    if (definition.aliases.length === 0 || definition.examples.length === 0) {
      throw new Error(`${id} is missing aliases or positive fixtures`);
    }
    if (
      definition.examples.some(
        (example) =>
          !example.trim() || example.length > MAX_FIXTURE_LENGTH || CONTROL_CHARACTER.test(example),
      )
    ) {
      throw new Error(`${id} has an invalid example`);
    }
    requireFixture(definition, 'negative');
    requireFixture(definition, 'ambiguity');
    requireFixture(definition, 'authorization');
    if (
      !Number.isFinite(definition.fixtures.latencyBudgetMs) ||
      definition.fixtures.latencyBudgetMs <= 0 ||
      definition.fixtures.latencyBudgetMs > 500
    ) {
      throw new Error(`${id} has an invalid latency fixture`);
    }

    for (const rawAlias of definition.aliases) {
      const alias = normalizeCatalogPhrase(rawAlias);
      if (!alias || rawAlias.length > MAX_ALIAS_LENGTH || CONTROL_CHARACTER.test(rawAlias)) {
        throw new Error(`${id} has an invalid alias`);
      }
      const owner = aliases.get(alias);
      if (owner) {
        if (owner.id === id) throw new Error(`Duplicate alias is unreachable: ${rawAlias}`);
        throw new Error(`Alias collision: ${rawAlias} belongs to ${owner.id} and ${id}`);
      }
      aliases.set(alias, definition);
      const firstToken = alias.split(' ', 1)[0];
      const bucket = byFirstToken.get(firstToken) ?? [];
      bucket.push({ alias, definition });
      byFirstToken.set(firstToken, bucket);
    }
  }

  for (const bucket of byFirstToken.values()) {
    bucket.sort((left, right) => right.alias.length - left.alias.length);
  }

  function matchWithOffsets(source: string): readonly CatalogMatch[] {
    if (
      typeof source !== 'string' ||
      source.length > MAX_SOURCE_LENGTH ||
      CONTROL_CHARACTER.test(source)
    )
      return [];
    const normalized = normalizeCatalogPhrase(source);
    const firstToken = normalized.split(' ', 1)[0];
    const bucket = byFirstToken.get(firstToken) ?? [];
    const matches = new Map<string, CatalogMatch>();
    for (const candidate of bucket) {
      if (
        normalized !== candidate.alias &&
        !normalized.startsWith(`${candidate.alias} `) &&
        !normalized.startsWith(`${candidate.alias}:`)
      ) {
        continue;
      }
      const aliasPattern = candidate.alias
        .split(' ')
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('\\s+');
      const originalMatch = new RegExp(`^\\s*${aliasPattern}(?=\\s|:|$)`, 'iu').exec(source);
      if (!originalMatch) continue;
      const sourceStart = source.search(/\S/u);
      const sourceEnd = originalMatch[0].length;
      const remainder = source
        .slice(sourceEnd)
        .replace(/^\s*:\s*/u, '')
        .trim();
      matches.set(candidate.definition.id, {
        definition: candidate.definition,
        alias: candidate.alias,
        sourceStart: Math.max(0, sourceStart),
        sourceEnd,
        remainder,
      });
    }
    return [...matches.values()];
  }

  return Object.freeze({
    entries: Object.freeze([...definitions]),
    matchWithOffsets,
    match(source: string): readonly CommandDefinition[] {
      return matchWithOffsets(source).map((match) => match.definition);
    },
  });
}
