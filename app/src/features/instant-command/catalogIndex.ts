import type {
  CatalogMatch,
  CatalogParseResult,
  CommandCatalogIndex,
  CommandDefinition,
} from './catalogTypes';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const SAFE_CATALOG_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const MAX_ALIAS_LENGTH = 200;
const MAX_FIXTURE_LENGTH = 500;
const MAX_SOURCE_LENGTH = 4_096;
const INVALID_SLOTS_REASON = 'That Instant Command is incomplete or invalid.';
const COMMAND_FAMILIES = new Set([
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
]);
const COMMAND_SAFETY = new Set(['read', 'reversible', 'confirm', 'approval']);
const COMMAND_AVAILABILITY = new Set(['available', 'capability-gated', 'blocked']);
const SLOT_GRAMMARS = new Set(['none', 'remainder']);

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

function safeParseSlots(
  parser: CommandDefinition['parseSlots'],
  match: CatalogMatch,
  source: string,
): CatalogParseResult {
  try {
    const result = parser(match, source);
    if (!result || typeof result !== 'object') throw new Error('invalid parser result');
    if (result.status === 'parsed') {
      if (!result.slots || typeof result.slots !== 'object' || Array.isArray(result.slots)) {
        throw new Error('invalid parsed slots');
      }
      return Object.freeze({ status: 'parsed', slots: Object.freeze({ ...result.slots }) });
    }
    if (
      result.status === 'rejected' &&
      typeof result.reason === 'string' &&
      result.reason.trim() &&
      result.reason.length <= 200 &&
      !CONTROL_CHARACTER.test(result.reason)
    ) {
      return Object.freeze({ status: 'rejected', reason: result.reason });
    }
  } catch {
    // Parser failures are catalog defects, not user-visible backend diagnostics.
  }
  return Object.freeze({ status: 'rejected', reason: INVALID_SLOTS_REASON });
}

function snapshotDefinition(definition: CommandDefinition): CommandDefinition {
  const parser = definition.parseSlots;
  return Object.freeze({
    ...definition,
    aliases: Object.freeze([...definition.aliases]),
    examples: Object.freeze([...definition.examples]),
    fixtures: Object.freeze({
      negative: Object.freeze([...definition.fixtures.negative]),
      ambiguity: Object.freeze([...definition.fixtures.ambiguity]),
      authorization: Object.freeze([...definition.fixtures.authorization]),
      latencyBudgetMs: definition.fixtures.latencyBudgetMs,
    }),
    parseSlots: (match: CatalogMatch, source: string) => safeParseSlots(parser, match, source),
  });
}

export function buildCatalogIndex(definitions: readonly CommandDefinition[]): CommandCatalogIndex {
  const ids = new Set<string>();
  const aliases = new Map<string, CommandDefinition>();
  const byFirstToken = new Map<string, Array<{ alias: string; definition: CommandDefinition }>>();
  const entries: CommandDefinition[] = [];

  for (const definition of definitions) {
    const id = definition.id.trim();
    if (!id) throw new Error('Command id is required');
    if (id !== definition.id || !SAFE_CATALOG_IDENTIFIER.test(id)) {
      throw new Error(`Invalid command id: ${definition.id}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate command id: ${id}`);
    ids.add(id);
    if (!COMMAND_FAMILIES.has(definition.family)) throw new Error(`${id} has an invalid family`);
    if (!COMMAND_SAFETY.has(definition.safety)) throw new Error(`${id} has an invalid safety`);
    if (!COMMAND_AVAILABILITY.has(definition.availability)) {
      throw new Error(`${id} has an invalid availability`);
    }
    if (!SLOT_GRAMMARS.has(definition.slotGrammar)) {
      throw new Error(`${id} has an invalid slot grammar`);
    }
    if (typeof definition.parseSlots !== 'function') {
      throw new Error(`${id} has an invalid slot parser`);
    }
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

    const entry = snapshotDefinition(definition);
    entries.push(entry);

    for (const rawAlias of entry.aliases) {
      const alias = normalizeCatalogPhrase(rawAlias);
      if (!alias || rawAlias.length > MAX_ALIAS_LENGTH || CONTROL_CHARACTER.test(rawAlias)) {
        throw new Error(`${id} has an invalid alias`);
      }
      const owner = aliases.get(alias);
      if (owner) {
        if (owner.id === id) throw new Error(`Duplicate alias is unreachable: ${rawAlias}`);
        throw new Error(`Alias collision: ${rawAlias} belongs to ${owner.id} and ${id}`);
      }
      aliases.set(alias, entry);
      const firstToken = alias.split(' ', 1)[0];
      const bucket = byFirstToken.get(firstToken) ?? [];
      bucket.push({ alias, definition: entry });
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
    entries: Object.freeze(entries),
    matchWithOffsets,
    match(source: string): readonly CommandDefinition[] {
      return matchWithOffsets(source).map((match) => match.definition);
    },
  });
}
