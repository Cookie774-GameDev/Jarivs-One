import type { InstantCommandHelpItem } from './help';
import { searchInstantCommandHelp } from './help';

export type InstantCommandSuggestion = Readonly<{
  id: string;
  label: string;
  detail: string;
  disabled: boolean;
}>;

export function suggestInstantCommands(
  items: readonly InstantCommandHelpItem[],
  query: string,
  limit = 12,
): readonly InstantCommandSuggestion[] {
  return searchInstantCommandHelp(items, query)
    .slice(0, Math.max(0, limit))
    .map((item) => ({
      id: item.id,
      label: item.examples[0]!,
      detail: `${item.family} · ${item.safety} · ${item.availability}${item.argumentHint ? ` · ${item.argumentHint}` : ''}`,
      disabled: item.availability === 'blocked',
    }));
}
