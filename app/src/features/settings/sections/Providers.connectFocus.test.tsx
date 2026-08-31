import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));
vi.mock('../components/DeepgramCredentialCard', () => ({
  DeepgramCredentialCard: () => null,
}));
vi.mock('@/lib/ai/providerModelCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providerModelCatalog')>();
  return {
    ...actual,
    loadProviderModels: vi.fn(() => new Promise(() => undefined)),
  };
});
vi.mock('@/stores/auth', () => {
  const state = {
    apiKeys: {},
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    defaultProvider: 'openai',
    setDefaultProvider: vi.fn(),
    plan: null,
    offlineMode: false,
    defaultLocalModel: 'qwen3.5:4b',
  };
  return {
    useAuthStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});
vi.mock('@/lib/deepgram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deepgram')>();
  return {
    ...actual,
    loadDeepgramCredential: vi.fn(async () => ({ configured: false, health: 'unconfigured' })),
    testDeepgramCredential: vi.fn(),
    getDeepgramApiKey: vi.fn(async () => undefined),
  };
});

import { PROVIDER_FOCUS_STORAGE_KEY } from '@/features/instant-command/providerConnectionEntrypoint';
import { Providers } from './Providers';

describe('Providers command focus recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('consumes a reload-safe exact provider focus once and moves keyboard focus to its key field', () => {
    sessionStorage.setItem(PROVIDER_FOCUS_STORAGE_KEY, 'openrouter');
    render(<Providers />);

    expect(document.activeElement).toBe(document.getElementById('key-openrouter'));
    expect(sessionStorage.getItem(PROVIDER_FOCUS_STORAGE_KEY)).toBeNull();
  });

  it('accepts the existing safe focus event but ignores secret-like and unknown element targets', () => {
    render(<Providers />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('jarvis:settings:provider', { detail: { providerId: 'openai' } }),
      );
    });
    expect(document.activeElement).toBe(document.getElementById('key-openai'));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('jarvis:settings:provider', { detail: { providerId: 'sk-private' } }),
      );
    });
    expect(document.activeElement).toBe(document.getElementById('key-openai'));
  });
});
