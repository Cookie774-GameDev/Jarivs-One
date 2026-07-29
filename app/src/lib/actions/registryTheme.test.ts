import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { getBuiltinActions } from './registry';

describe('built-in theme actions', () => {
  afterEach(() => {
    useUIStore.setState({ theme: 'default' });
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
