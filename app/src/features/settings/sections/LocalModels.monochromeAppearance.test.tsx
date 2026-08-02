import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/auth', () => {
  const state = {
    offlineMode: false,
    setOfflineMode: vi.fn(),
    defaultLocalModel: undefined,
    setDefaultLocalModel: vi.fn(),
    apiKeys: {},
    setApiKey: vi.fn(),
  };
  return {
    useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

vi.mock('@/lib/tauri', () => ({
  getNativeOllamaStatus: vi.fn(async () => ({ installed: false, running: false })),
  openOllamaTroubleshooting: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ai/ollamaBootstrap', () => ({
  bootstrapOllamaConnection: vi.fn(async () => ({ ready: false })),
  invalidateOllamaBootstrap: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  assertAllowedOllamaEndpoint: vi.fn(),
  connectLocalModelToChat: vi.fn(),
  listOllamaModelInfo: vi.fn(async () => []),
  LOCAL_MODEL_CATALOG: [],
  catalogDisplayName: (model: string) => model,
  catalogFamilyName: (model: string) => model,
  ollamaBaseUrl: () => 'http://127.0.0.1:11434',
  OLLAMA_DEFAULT_BASE: 'http://127.0.0.1:11434',
  pullOllamaModel: vi.fn(async () => undefined),
  syncDiscoveredOllamaModels: vi.fn(),
  validateModelName: vi.fn(() => true),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { LocalModels } from './LocalModels';

describe('LocalModels MonoChrome appearance', () => {
  afterEach(cleanup);

  it('gates radius, background-image, and shadow under exact monochrome only', async () => {
    await act(async () => {
      render(<LocalModels />);
    });

    const root = document.querySelector<HTMLElement>('.mc7f-settings-local-models');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');
    expect(className).not.toMatch(/gradient|blur/);
  });
});
