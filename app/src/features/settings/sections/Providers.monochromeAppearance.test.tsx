import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => undefined,
}));

vi.mock('@/stores/auth', () => {
  const state = {
    apiKeys: { anthropic: 'sk-ant-test' },
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    defaultProvider: 'anthropic',
    setDefaultProvider: vi.fn(),
    plan: null,
    offlineMode: false,
    defaultLocalModel: undefined,
  };
  return {
    useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

import { Providers } from './Providers';

describe('Providers MonoChrome appearance', () => {
  afterEach(cleanup);

  it('locks the canonical monochrome gates and hides the saved-provider glow', () => {
    render(<Providers />);

    const root = document.querySelector<HTMLElement>('.mc7f-settings-providers');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
    expect(screen.getByRole('radiogroup', { name: 'Default provider' })).toBeTruthy();
    expect(document.querySelector<HTMLElement>('.bg-accent-gradient')).not.toBeNull();

    const glow = document.querySelector<HTMLElement>('.jarvis-provider-key-card .opacity-30');
    expect(glow).not.toBeNull();
    expect(glow?.className).toContain('[html[data-theme=monochrome]_&]:hidden');
  });
});
