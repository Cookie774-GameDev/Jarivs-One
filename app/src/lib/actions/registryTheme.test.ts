import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { getBuiltinActions } from './registry';

const originalSetTheme = useUIStore.getState().setTheme;

describe('built-in theme actions', () => {
  afterEach(() => {
    useUIStore.setState({ setTheme: originalSetTheme });
    originalSetTheme('default');
  });

  it('verifies canonical Sakura application before returning success', async () => {
    const action = getBuiltinActions().find(({ id }) => id === 'theme.sakura')!;

    await expect(action.run({}, { source: 'user' })).resolves.toEqual({
      ok: true,
      summary: 'Theme: Sakura.',
      data: {
        theme: 'sakura',
        documentTheme: 'sakura',
        preference: 'sakura',
        persistedTheme: 'sakura',
      },
    });
    expect(useUIStore.getState().theme).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    expect(document.documentElement.dataset.themePreference).toBe('sakura');
  });

  it('does not claim Sakura success when the canonical setter cannot be verified', async () => {
    useUIStore.setState({ setTheme: () => undefined });
    const action = getBuiltinActions().find(({ id }) => id === 'theme.sakura')!;

    await expect(action.run({}, { source: 'user' })).resolves.toEqual({
      ok: false,
      error: 'Theme Sakura could not be verified.',
    });
  });

  it('routes deterministic JARVIS settings updates through the real Sakura action', async () => {
    const action = getBuiltinActions().find(({ id }) => id === 'settings.update')!;

    const result = await action.run(
      { setting: 'theme', value: 'SAKURA' },
      { source: 'ai', chatId: 'sakura-command-test' },
    );

    expect(result).toMatchObject({
      ok: true,
      summary: 'Theme: Sakura.',
      data: { theme: 'sakura' },
    });
    expect(useUIStore.getState().theme).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    expect(document.documentElement.dataset.themePreference).toBe('sakura');
  });

  it('renames Light to MonoChrome while retaining the dark compatibility id', async () => {
    const actions = getBuiltinActions().filter(({ category }) => category === 'theme');
    expect(actions.map(({ id }) => id)).toContain('theme.monochrome');
    expect(actions.map(({ id }) => id)).toContain('theme.dark');
    expect(actions.map(({ id }) => id)).not.toContain('theme.light');
    expect(
      JSON.stringify(
        actions.map(({ id, label, description }) => ({
          id,
          label,
          description,
        })),
      ),
    ).not.toMatch(/\blight\b/i);

    await actions.find(({ id }) => id === 'theme.monochrome')!.run({}, { source: 'user' });
    expect(useUIStore.getState().theme).toBe('monochrome');
  });

  it('toggles visibly between Default and MonoChrome', async () => {
    const toggle = getBuiltinActions().find(({ id }) => id === 'theme.toggle')!;

    await toggle.run({}, { source: 'user' });
    expect(useUIStore.getState().theme).toBe('monochrome');
    await toggle.run({}, { source: 'user' });
    expect(useUIStore.getState().theme).toBe('default');
  });
});
