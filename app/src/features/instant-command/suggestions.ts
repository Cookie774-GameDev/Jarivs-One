import type { InstantCommandHelpItem } from './help';
import { searchInstantCommandHelp } from './help';

export type InstantCommandSuggestion = Readonly<{
  id: string;
  label: string;
  detail: string;
  disabled: boolean;
  confirmationRequired: boolean;
  approvalRequired: boolean;
  preview: string;
}>;

const MAX_SUGGESTION_LIMIT = 50;
const MAX_HELP_ITEMS = 2_048;
const MAX_HELP_TEXT_LENGTH = 4_096;
const SAFE_IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
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
const EMPTY_SUGGESTIONS = Object.freeze([]) as readonly InstantCommandSuggestion[];

function safeText(value: unknown, maximum = MAX_HELP_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maximum && !CONTROL_CHARACTER.test(value);
}

function safeStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 64 &&
    value.every((entry) => safeText(entry, 512) && entry.trim().length > 0)
  );
}

function validHelpItem(value: unknown): value is InstantCommandHelpItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Readonly<Record<string, unknown>>;
  return (
    safeText(item.id, 128) &&
    SAFE_IDENTIFIER.test(item.id) &&
    COMMAND_FAMILIES.has(item.family as string) &&
    safeStringArray(item.aliases) &&
    safeStringArray(item.examples) &&
    COMMAND_SAFETIES.has(item.safety as string) &&
    COMMAND_AVAILABILITIES.has(item.availability as string) &&
    safeText(item.argumentHint, 256) &&
    safeText(item.searchText) &&
    item.searchText.length > 0 &&
    item.searchText === item.searchText.toLocaleLowerCase()
  );
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

function suggestionRank(item: InstantCommandHelpItem, query: string): number {
  const phrases = [...item.aliases, ...item.examples].map(normalized);
  if (phrases.includes(query)) return 0;
  if (normalized(item.id) === query) return 1;
  if (phrases.some((phrase) => phrase.startsWith(query))) return 2;
  if (normalized(item.id).startsWith(query)) return 3;
  if (normalized(item.family) === query) return 4;
  return 5;
}

export function suggestInstantCommands(
  items: readonly InstantCommandHelpItem[],
  query: string,
  limit = 12,
): readonly InstantCommandSuggestion[] {
  if (
    !Array.isArray(items) ||
    items.length > MAX_HELP_ITEMS ||
    !items.every(validHelpItem) ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    limit > MAX_SUGGESTION_LIMIT
  ) {
    return EMPTY_SUGGESTIONS;
  }
  const queryKey = typeof query === 'string' ? normalized(query) : '';
  return Object.freeze(
    searchInstantCommandHelp(items, query)
      .map((item, index) => ({ item, index }))
      .sort(
        (left, right) =>
          suggestionRank(left.item, queryKey) - suggestionRank(right.item, queryKey) ||
          left.index - right.index,
      )
      .slice(0, limit)
      .map(({ item }) => {
        const confirmationRequired = item.safety === 'confirm';
        const approvalRequired = item.safety === 'approval';
        const gate = confirmationRequired
          ? ' · confirmation required'
          : approvalRequired
            ? ' · approval required'
            : '';
        return Object.freeze({
          id: item.id,
          label: item.examples[0]!,
          detail: `${item.family} · ${item.safety} · ${item.availability}${item.argumentHint ? ` · ${item.argumentHint}` : ''}`,
          disabled: item.availability === 'blocked',
          confirmationRequired,
          approvalRequired,
          preview: `Action ${item.id} · ${item.argumentHint ? 'target required' : 'current workspace'}${gate}`,
        });
      }),
  );
}
