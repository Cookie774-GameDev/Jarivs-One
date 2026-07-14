import { describe, expect, it } from 'vitest';
import { SELECTABLE_THEMES, migrateThemePreference, parseThemeCommandArgument } from './themes';

describe('appearance theme registry', () => {
  it('exposes the four supported themes in product order', () => {
    expect(SELECTABLE_THEMES.map((theme) => theme.id)).toEqual([
      'jarvis',
      'vibespace',
      'default',
      'light',
    ]);
  });

  it('migrates legacy dark and system preferences without losing a valid choice', () => {
    expect(migrateThemePreference('dark')).toBe('default');
    expect(migrateThemePreference('system')).toBe('default');
    expect(migrateThemePreference('vibespace')).toBe('vibespace');
    expect(migrateThemePreference('unknown')).toBe('default');
  });

  it('parses friendly /theme arguments', () => {
    expect(parseThemeCommandArgument('VibeSpace')).toBe('vibespace');
    expect(parseThemeCommandArgument('jarvis core')).toBe('jarvis');
    expect(parseThemeCommandArgument('dark')).toBe('default');
    expect(parseThemeCommandArgument('nope')).toBeNull();
  });
});
