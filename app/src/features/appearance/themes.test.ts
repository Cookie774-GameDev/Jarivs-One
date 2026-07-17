import { describe, expect, it } from 'vitest';
import { SELECTABLE_THEMES, migrateThemePreference, parseThemeCommandArgument } from './themes';

describe('appearance theme registry', () => {
  it('exposes only VibeSpace and Default in product order', () => {
    expect(SELECTABLE_THEMES.map((theme) => theme.id)).toEqual(['vibespace', 'default']);
  });

  it('migrates legacy and removed preferences to Default without losing VibeSpace', () => {
    expect(migrateThemePreference('dark')).toBe('default');
    expect(migrateThemePreference('system')).toBe('default');
    expect(migrateThemePreference('jarvis')).toBe('default');
    expect(migrateThemePreference('light')).toBe('default');
    expect(migrateThemePreference('default')).toBe('default');
    expect(migrateThemePreference('vibespace')).toBe('vibespace');
    expect(migrateThemePreference('unknown')).toBe('default');
  });

  it('parses commands for the two supported appearances only', () => {
    expect(parseThemeCommandArgument('VibeSpace')).toBe('vibespace');
    expect(parseThemeCommandArgument('default')).toBe('default');
    expect(parseThemeCommandArgument('dark')).toBe('default');
    expect(parseThemeCommandArgument('jarvis core')).toBeNull();
    expect(parseThemeCommandArgument('light')).toBeNull();
    expect(parseThemeCommandArgument('nope')).toBeNull();
  });
});
