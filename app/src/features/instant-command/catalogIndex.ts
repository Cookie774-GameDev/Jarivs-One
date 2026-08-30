import type { CatalogMatch, CommandCatalogIndex, CommandDefinition } from './catalogTypes';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export function normalizeCatalogPhrase(source: string): string {
  return source.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

function requireFixture(
  command: CommandDefinition,
  name: 'negative' | 'ambiguity' | 'authorization',
): void {
  if (command.fixtures[name].length === 0) {
    throw new Error(`${command.id} is missing a ${name} fixture`);
  }
}

export function buildCatalogIndex(definitions: readonly CommandDefinition[]): CommandCatalogIndex {
  const ids = new Set<string>();
  const aliases = new Map<string, CommandDefinition>();
  const byFirstToken = new Map<string, Array<{ alias: string; definition: CommandDefinition }>>();

  for (const definition of definitions) {
    const id = definition.id.trim();
    if (!id) throw new Error('Command id is required');
    if (ids.has(id)) throw new Error(`Duplicate command id: ${id}`);
    ids.add(id);
    if (!definition.authority.trim()) throw new Error(`${id} is missing an authority`);
    if (definition.aliases.length === 0 || definition.examples.length === 0) {
      throw new Error(`${id} is missing aliases or positive fixtures`);
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
      if (!alias || CONTROL_CHARACTER.test(alias)) throw new Error(`${id} has an invalid alias`);
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
    if (typeof source !== 'string' || CONTROL_CHARACTER.test(source)) return [];
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
