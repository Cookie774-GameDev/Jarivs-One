import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  SELECTABLE_THEME_IDS,
  THEME_COMMAND_ALIASES,
  THEME_DEFINITIONS,
  normalizePersistedTheme,
  parseSelectableTheme,
  parseThemeCommandArgument,
  parseThemeSyncMessage,
  resolveDocumentTheme,
} from './themeContract';
import type { ResolvedDocumentTheme, SelectableTheme } from './themeContract';

describe('canonical theme contract', () => {
  it('exposes the exact selectable theme order', () => {
    expect(SELECTABLE_THEME_IDS).toEqual([
      'jarvis',
      'vibespace',
      'default',
      'monochrome',
      'sakura',
    ]);
    expectTypeOf<Parameters<typeof resolveDocumentTheme>[0]>().toEqualTypeOf<SelectableTheme>();
    expectTypeOf<ReturnType<typeof resolveDocumentTheme>>().toEqualTypeOf<ResolvedDocumentTheme>();
  });

  it('publishes Sakura with its exact product copy as the fifth opt-in theme', () => {
    expect(THEME_DEFINITIONS.at(-1)).toEqual({
      id: 'sakura',
      label: 'Sakura',
      description: 'Cel-painted dusk workspace.',
    });
    expect(normalizePersistedTheme('sakura')).toBe('sakura');
    expect(normalizePersistedTheme('dusk')).toBe('default');
  });

  it('parses only canonical selectable theme identifiers', () => {
    for (const theme of SELECTABLE_THEME_IDS) {
      expect(parseSelectableTheme(theme)).toBe(theme);
    }

    for (const value of ['light', 'dark', 'system', 'mono', 'MONOCHROME', '', null, {}]) {
      expect(parseSelectableTheme(value)).toBeNull();
    }
  });

  it('normalizes every persisted value to a canonical theme', () => {
    expect(normalizePersistedTheme('light')).toBe('monochrome');
    expect(normalizePersistedTheme('dark')).toBe('default');
    expect(normalizePersistedTheme('system')).toBe('default');
    expect(normalizePersistedTheme('monochrome')).toBe('monochrome');
    expect(normalizePersistedTheme('jarvis')).toBe('jarvis');

    for (const value of ['mono', 'unknown', '', null, undefined, {}, 42]) {
      expect(normalizePersistedTheme(value)).toBe('default');
    }
  });

  it('resolves canonical preferences to document themes', () => {
    expect(resolveDocumentTheme('jarvis')).toBe('jarvis');
    expect(resolveDocumentTheme('vibespace')).toBe('vibespace');
    expect(resolveDocumentTheme('default')).toBe('dark');
    expect(resolveDocumentTheme('monochrome')).toBe('monochrome');
    expect(resolveDocumentTheme('sakura')).toBe('sakura');
  });

  it('parses command aliases case-insensitively after trimming', () => {
    const aliases = {
      jarvis: 'jarvis',
      'jarvis core': 'jarvis',
      core: 'jarvis',
      vibespace: 'vibespace',
      vibe: 'vibespace',
      default: 'default',
      dark: 'default',
      monochrome: 'monochrome',
      mono: 'monochrome',
      terminal: 'monochrome',
      light: 'monochrome',
      sakura: 'sakura',
      'sakura dusk': 'sakura',
    } as const;

    expect(THEME_COMMAND_ALIASES).toEqual(aliases);

    for (const [alias, theme] of Object.entries(aliases)) {
      expect(parseThemeCommandArgument(`  ${alias.toUpperCase()}  `)).toBe(theme);
    }

    for (const value of ['dusk', 'blossom', 'system', 'unknown', '']) {
      expect(parseThemeCommandArgument(value)).toBeNull();
    }
  });

  it('accepts canonical sync messages plus the exact legacy light value', () => {
    for (const theme of SELECTABLE_THEME_IDS) {
      expect(parseThemeSyncMessage(theme)).toBe(theme);
    }

    expect(parseThemeSyncMessage('light')).toBe('monochrome');

    for (const value of ['dark', 'system', 'mono', 'terminal', 'MONOCHROME', '', null, {}]) {
      expect(parseThemeSyncMessage(value)).toBeNull();
    }
  });
});
