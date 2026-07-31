import { afterEach, describe, expect, it } from 'vitest';
import { parseThemeCommandArgument } from '@/features/appearance/themes';
import { useUIStore } from '@/stores/ui';
import { getThemeCommandHelp } from './Composer';

describe('Composer Sakura theme command boundary', () => {
  afterEach(() => {
    useUIStore.getState().setTheme('default');
  });

  it.each(['sakura', '  SAKURA DUSK  '])(
    'resolves %s and applies Sakura through the real setter',
    (argument) => {
      const theme = parseThemeCommandArgument(argument);

      expect(theme).toBe('sakura');
      if (!theme) throw new Error('Expected a canonical Sakura theme.');

      useUIStore.getState().setTheme(theme);

      expect(useUIStore.getState().theme).toBe('sakura');
      expect(document.documentElement.dataset.theme).toBe('sakura');
      expect(document.documentElement.dataset.themePreference).toBe('sakura');
    },
  );

  it('advertises Sakura without accepting unapproved shorthand', () => {
    expect(getThemeCommandHelp()).toBe(
      'Available themes: Jarvis Core, VibeSpace, Default, MonoChrome, Sakura. Use /theme <name>.',
    );
    expect(parseThemeCommandArgument('dusk')).toBeNull();
    expect(parseThemeCommandArgument('blossom')).toBeNull();
  });
});
