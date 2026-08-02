import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { getAllActions } from './actions';

describe('command palette theme actions', () => {
  afterEach(() => {
    useUIStore.setState({ theme: 'default' });
  });

  it('exposes Sakura and MonoChrome without retired or unauthorized theme surfaces', () => {
    const themeActions = getAllActions().filter(
      (action) => action.page === 'theme' || action.id === 'theme',
    );
    expect(themeActions.map(({ id }) => id)).toContain('theme-sakura');
    expect(themeActions.map(({ id }) => id)).toContain('theme-monochrome');
    expect(themeActions.map(({ id }) => id)).not.toContain('theme-light');
    expect(
      JSON.stringify(
        themeActions.map(({ id, label, description, keywords }) => ({
          id,
          label,
          description,
          keywords,
        })),
      ),
    ).not.toMatch(/\b(?:light|dusk|blossom)\b/i);
  });

  it('selects MonoChrome and preserves palette-close behavior', () => {
    const closePalette = vi.fn();
    const action = getAllActions().find(({ id }) => id === 'theme-monochrome')!;

    action.perform({ closePalette, pushPage: vi.fn() });

    expect(useUIStore.getState().theme).toBe('monochrome');
    expect(closePalette).toHaveBeenCalledTimes(1);
  });

  it('applies Sakura before closing the palette', () => {
    const stateObservedAtClose: string[] = [];
    const closePalette = vi.fn(() => {
      stateObservedAtClose.push(useUIStore.getState().theme);
    });
    const action = getAllActions().find(({ id }) => id === 'theme-sakura')!;

    action.perform({ closePalette, pushPage: vi.fn() });

    expect(useUIStore.getState().theme).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    expect(document.documentElement.dataset.themePreference).toBe('sakura');
    expect(stateObservedAtClose).toEqual(['sakura']);
  });
});
