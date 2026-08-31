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
const EMPTY_SUGGESTIONS = Object.freeze([]) as readonly InstantCommandSuggestion[];

export function suggestInstantCommands(
  items: readonly InstantCommandHelpItem[],
  query: string,
  limit = 12,
): readonly InstantCommandSuggestion[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_SUGGESTION_LIMIT) {
    return EMPTY_SUGGESTIONS;
  }
  return Object.freeze(
    searchInstantCommandHelp(items, query)
      .slice(0, limit)
      .map((item) => {
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
