import type {
  CommandAvailability,
  CommandDefinition,
  CommandFamily,
  CommandSafety,
} from './catalogTypes';

export type InstantCommandHelpItem = Readonly<{
  id: string;
  family: CommandFamily;
  aliases: readonly string[];
  examples: readonly string[];
  safety: CommandSafety;
  availability: CommandAvailability;
  argumentHint: string;
  searchText: string;
}>;

export function buildInstantCommandHelp(
  catalog: readonly CommandDefinition[],
): readonly InstantCommandHelpItem[] {
  return Object.freeze(
    catalog.map((definition) => {
      const argumentHint = definition.slotGrammar === 'none' ? '' : '<target or arguments>';
      return Object.freeze({
        id: definition.id,
        family: definition.family,
        aliases: definition.aliases,
        examples: definition.examples,
        safety: definition.safety,
        availability: definition.availability,
        argumentHint,
        searchText: [definition.id, definition.family, ...definition.aliases]
          .join(' ')
          .toLocaleLowerCase(),
      });
    }),
  );
}

export function searchInstantCommandHelp(
  items: readonly InstantCommandHelpItem[],
  query: string,
): readonly InstantCommandHelpItem[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => terms.every((term) => item.searchText.includes(term)));
}
