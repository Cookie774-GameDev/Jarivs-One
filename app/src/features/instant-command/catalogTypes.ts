export type CommandFamily =
  | 'navigation'
  | 'terminal'
  | 'agent'
  | 'project'
  | 'chat'
  | 'schedule'
  | 'settings'
  | 'media'
  | 'tools'
  | 'files'
  | 'tasks'
  | 'workbench'
  | 'team';

export type CommandSafety = 'read' | 'reversible' | 'confirm' | 'approval';
export type CommandAvailability = 'available' | 'capability-gated' | 'blocked';
export type CommandSlotGrammar = 'none' | 'remainder';

export type CatalogParseResult<TSlots extends object = Readonly<Record<string, unknown>>> =
  Readonly<{ status: 'parsed'; slots: TSlots }> | Readonly<{ status: 'rejected'; reason: string }>;

export type CommandFixtures = Readonly<{
  negative: readonly string[];
  ambiguity: readonly string[];
  authorization: readonly string[];
  latencyBudgetMs: number;
}>;

/**
 * Catalog metadata only. Execution remains with the canonical authority named
 * by `authority`; adding an entry here never grants a side effect.
 */
export type CommandDefinition = Readonly<{
  id: string;
  family: CommandFamily;
  aliases: readonly string[];
  safety: CommandSafety;
  authority: string;
  availability: CommandAvailability;
  examples: readonly string[];
  fixtures: CommandFixtures;
  slotGrammar: CommandSlotGrammar;
  parseSlots: (
    match: CatalogMatch,
    source: string,
  ) => CatalogParseResult<Readonly<Record<string, unknown>>>;
  target?: string;
}>;

export type CatalogMatch = Readonly<{
  definition: CommandDefinition;
  alias: string;
  sourceStart: number;
  sourceEnd: number;
  remainder: string;
}>;

export type CommandCatalogIndex = Readonly<{
  entries: readonly CommandDefinition[];
  match: (source: string) => readonly CommandDefinition[];
  matchWithOffsets: (source: string) => readonly CatalogMatch[];
}>;
