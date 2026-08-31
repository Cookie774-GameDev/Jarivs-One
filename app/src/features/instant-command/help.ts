import type {
  CommandAvailability,
  CommandCatalogIndex,
  CommandDefinition,
  CommandFamily,
  CommandSafety,
} from './catalogTypes';

export type InstantCommandPreview =
  | Readonly<{ status: 'unmatched' }>
  | Readonly<{ status: 'ambiguous' }>
  | Readonly<{ status: 'rejected'; reason: string }>
  | Readonly<{
      status: 'ready';
      id: string;
      action: string;
      target: string;
      confirmationRequired: boolean;
      approvalRequired: boolean;
      availability: CommandAvailability;
    }>;

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

const MAX_HELP_QUERY_LENGTH = 256;
const MAX_HELP_DEFINITIONS = 2_048;
const MAX_HELP_ARRAY_ITEMS = 64;
const MAX_HELP_METADATA_LENGTH = 512;
const MAX_HELP_SEARCH_TEXT_LENGTH = 4_096;
const SAFE_COMMAND_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
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
const COMMAND_SAFETIES = new Set(['read', 'reversible', 'confirm', 'approval']);
const COMMAND_AVAILABILITIES = new Set(['available', 'capability-gated', 'blocked']);
const SLOT_GRAMMARS = new Set(['none', 'remainder']);
const SAFE_PREVIEW_REJECTION = 'That Instant Command is incomplete or invalid.';
const SENSITIVE_REJECTION_DETAIL = /(?:api.?key|secret|token|credential|password|bearer)/iu;
const EMPTY_HELP_RESULTS = Object.freeze([]) as readonly InstantCommandHelpItem[];

function safeMetadata(value: unknown, maximum = MAX_HELP_METADATA_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !CONTROL_CHARACTER.test(value)
  );
}

function safeMetadataArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_HELP_ARRAY_ITEMS &&
    value.every((entry) => safeMetadata(entry))
  );
}

function validHelpDefinition(value: unknown): value is CommandDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const definition = value as Readonly<Record<string, unknown>>;
  return (
    safeMetadata(definition.id, 128) &&
    SAFE_COMMAND_ID.test(definition.id) &&
    COMMAND_FAMILIES.has(definition.family as string) &&
    safeMetadataArray(definition.aliases) &&
    safeMetadataArray(definition.examples) &&
    COMMAND_SAFETIES.has(definition.safety as string) &&
    COMMAND_AVAILABILITIES.has(definition.availability as string) &&
    SLOT_GRAMMARS.has(definition.slotGrammar as string) &&
    [definition.id, definition.family, ...definition.aliases].join(' ').length <=
      MAX_HELP_SEARCH_TEXT_LENGTH
  );
}

export function buildInstantCommandHelp(
  catalog: readonly CommandDefinition[],
): readonly InstantCommandHelpItem[] {
  try {
    if (
      !Array.isArray(catalog) ||
      catalog.length > MAX_HELP_DEFINITIONS ||
      !catalog.every(validHelpDefinition) ||
      new Set(catalog.map((definition) => definition.id)).size !== catalog.length
    ) {
      return EMPTY_HELP_RESULTS;
    }
    return Object.freeze(
      catalog.map((definition) => {
        const argumentHint = definition.slotGrammar === 'none' ? '' : '<target or arguments>';
        const aliases = Object.freeze([...definition.aliases]);
        const examples = Object.freeze([...definition.examples]);
        return Object.freeze({
          id: definition.id,
          family: definition.family,
          aliases,
          examples,
          safety: definition.safety,
          availability: definition.availability,
          argumentHint,
          searchText: [definition.id, definition.family, ...definition.aliases]
            .join(' ')
            .toLocaleLowerCase(),
        });
      }),
    );
  } catch {
    return EMPTY_HELP_RESULTS;
  }
}

export function searchInstantCommandHelp(
  items: readonly InstantCommandHelpItem[],
  query: string,
): readonly InstantCommandHelpItem[] {
  if (
    typeof query !== 'string' ||
    query.length > MAX_HELP_QUERY_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(query)
  ) {
    return EMPTY_HELP_RESULTS;
  }
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return Object.freeze([...items]);
  return Object.freeze(
    items.filter((item) => terms.every((term) => item.searchText.includes(term))),
  );
}

function previewSelector(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const selector = value as Readonly<Record<string, unknown>>;
  if (selector.scope === 'all') return 'all terminals';
  if (typeof selector.ordinal === 'number') return `terminal ${selector.ordinal}`;
  if (typeof selector.sessionId === 'string') return 'exact terminal session';
  if (typeof selector.paneId === 'string') return 'exact terminal pane';
  if (typeof selector.agentSlug === 'string') return `agent ${selector.agentSlug}`;
  if (typeof selector.provider === 'string') return `provider ${selector.provider}`;
  if (typeof selector.label === 'string') return 'named terminal';
  return null;
}

function previewTarget(
  definition: CommandDefinition,
  slots: Readonly<Record<string, unknown>>,
): string {
  if (definition.target) return definition.target;
  if (typeof slots.route === 'string') return `page ${slots.route}`;
  if (typeof slots.section === 'string') return `settings ${slots.section}`;
  if (typeof slots.enabled === 'boolean') return `fullscreen ${slots.enabled ? 'on' : 'off'}`;
  const selector = previewSelector(slots.selector);
  if (selector) return selector;
  return Object.keys(slots).length === 0 ? 'current workspace' : 'provided arguments';
}

function safePreviewRejection(reason: unknown, source: string): string {
  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 200 ||
    CONTROL_CHARACTER.test(reason) ||
    SENSITIVE_REJECTION_DETAIL.test(reason) ||
    source.toLocaleLowerCase().includes(reason.trim().toLocaleLowerCase())
  ) {
    return SAFE_PREVIEW_REJECTION;
  }
  return reason;
}

export function previewInstantCommand(
  index: CommandCatalogIndex,
  source: string,
): InstantCommandPreview {
  try {
    const matches = index.matchWithOffsets(source);
    if (matches.length === 0) return Object.freeze({ status: 'unmatched' });
    if (matches.length !== 1) return Object.freeze({ status: 'ambiguous' });
    const match = matches[0]!;
    const parsed = match.definition.parseSlots(match, source);
    if (parsed.status === 'rejected') {
      return Object.freeze({
        status: 'rejected',
        reason: safePreviewRejection(parsed.reason, source),
      });
    }
    return Object.freeze({
      status: 'ready',
      id: match.definition.id,
      action: match.definition.id,
      target: previewTarget(match.definition, parsed.slots),
      confirmationRequired: match.definition.safety === 'confirm',
      approvalRequired: match.definition.safety === 'approval',
      availability: match.definition.availability,
    });
  } catch {
    return Object.freeze({ status: 'rejected', reason: 'Command preview is unavailable.' });
  }
}
