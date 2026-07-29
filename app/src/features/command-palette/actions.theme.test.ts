import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { getAllActions } from './actions';

describe('command palette theme actions', () => {
  afterEach(() => {
    useUIStore.setState({ theme: 'default' });
  });

  it('exposes MonoChrome and no retired Light theme surface', () => {
    const themeActions = getAllActions().filter(
      (action) => action.page === 'theme' || action.id === 'theme',
    );
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
    ).not.toMatch(/\blight\b/i);
  });

  it('selects MonoChrome and preserves palette-close behavior', () => {
    const closePalette = vi.fn();
    const action = getAllActions().find(({ id }) => id === 'theme-monochrome')!;

    action.perform({ closePalette, pushPage: vi.fn() });

    expect(useUIStore.getState().theme).toBe('monochrome');
    expect(closePalette).toHaveBeenCalledTimes(1);
  });
});
