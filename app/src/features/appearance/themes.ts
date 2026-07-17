import type { Theme } from '@/types/common';

export type SelectableTheme = 'vibespace' | 'default';

export type ThemeDefinition = {
  id: SelectableTheme;
  label: string;
  description: string;
};

export const SELECTABLE_THEMES: readonly ThemeDefinition[] = [
  { id: 'vibespace', label: 'VibeSpace', description: 'Pastel origami workspace.' },
  { id: 'default', label: 'Default', description: 'Warm, focused dark workspace.' },
] as const;

const SELECTABLE_THEME_IDS = new Set<SelectableTheme>(
  SELECTABLE_THEMES.map((theme) => theme.id),
);

export function migrateThemePreference(value: unknown): SelectableTheme {
  if (value === 'dark' || value === 'system') return 'default';
  if (typeof value === 'string' && SELECTABLE_THEME_IDS.has(value as SelectableTheme)) {
    return value as SelectableTheme;
  }
  return 'default';
}

export function isSelectableTheme(theme: Theme): theme is SelectableTheme {
  return SELECTABLE_THEME_IDS.has(theme as SelectableTheme);
}

const THEME_COMMAND_ALIASES: Record<string, SelectableTheme> = {
  vibespace: 'vibespace',
  vibe: 'vibespace',
  default: 'default',
  dark: 'default',
};

export function parseThemeCommandArgument(value: string): SelectableTheme | null {
  return THEME_COMMAND_ALIASES[value.trim().toLowerCase()] ?? null;
}
