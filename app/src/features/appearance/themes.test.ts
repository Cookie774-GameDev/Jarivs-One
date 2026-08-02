import { describe, expect, it } from 'vitest';
import { SELECTABLE_THEMES, migrateThemePreference, parseThemeCommandArgument } from './themes';

describe('appearance theme registry', () => {
  it('exposes the five supported themes in product order', () => {
    expect(SELECTABLE_THEMES.map((theme) => theme.id)).toEqual([
      'jarvis',
      'vibespace',
      'default',
      'monochrome',
      'sakura',
    ]);
  });

  it('uses the accepted public labels and descriptions', () => {
    expect(SELECTABLE_THEMES).toEqual([
      {
        id: 'jarvis',
        label: 'Jarvis Core',
        description: 'High-contrast command center.',
      },
      {
        id: 'vibespace',
        label: 'VibeSpace',
        description: 'Pastel origami workspace.',
      },
      {
        id: 'default',
        label: 'Default',
        description: 'Warm, focused dark workspace.',
      },
      {
        id: 'monochrome',
        label: 'MonoChrome',
        description: 'Terminal-inspired developer console.',
      },
      {
        id: 'sakura',
        label: 'Sakura',
        description: 'Cel-painted dusk workspace.',
      },
    ]);
  });

  it('migrates all legacy preferences through the canonical contract', () => {
    expect(migrateThemePreference('light')).toBe('monochrome');
    expect(migrateThemePreference('dark')).toBe('default');
    expect(migrateThemePreference('system')).toBe('default');
    expect(migrateThemePreference('jarvis')).toBe('default');
    expect(migrateThemePreference('light')).toBe('default');
    expect(migrateThemePreference('default')).toBe('default');
    expect(migrateThemePreference('vibespace')).toBe('vibespace');
    expect(migrateThemePreference('sakura')).toBe('sakura');
    expect(migrateThemePreference('dusk')).toBe('default');
    expect(migrateThemePreference('unknown')).toBe('default');
  });

  it('parses commands for the two supported appearances only', () => {
    expect(parseThemeCommandArgument('VibeSpace')).toBe('vibespace');
    expect(parseThemeCommandArgument('default')).toBe('default');
    expect(parseThemeCommandArgument('dark')).toBe('default');
    expect(parseThemeCommandArgument('light')).toBe('monochrome');
    expect(parseThemeCommandArgument('terminal')).toBe('monochrome');
    expect(parseThemeCommandArgument('sakura')).toBe('sakura');
    expect(parseThemeCommandArgument('  SAKURA DUSK  ')).toBe('sakura');
    expect(parseThemeCommandArgument('dusk')).toBeNull();
    expect(parseThemeCommandArgument('nope')).toBeNull();
  });
});
