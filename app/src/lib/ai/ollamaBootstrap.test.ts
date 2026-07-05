import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import {
  bootstrapOllamaConnection,
  invalidateOllamaBootstrap,
  sanitizeOllamaEndpointFromStore,
} from './ollamaBootstrap';

vi.mock('./providers/ollama', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providers/ollama')>();
  return {
    ...actual,
    isOllamaReachable: vi.fn(),
    ensureOllamaReadySilent: vi.fn(),
    listOllamaModelInfo: vi.fn(),
  };
});

import {
  ensureOllamaReadySilent,
  isOllamaReachable,
  listOllamaModelInfo,
  normalizeStoredOllamaEndpoint,
} from './providers/ollama';

describe('normalizeStoredOllamaEndpoint', () => {
  it('rejects API keys masquerading as URLs', () => {
    expect(normalizeStoredOllamaEndpoint('sk-test-key')).toBe('http://127.0.0.1:11434');
    expect(normalizeStoredOllamaEndpoint('AIzaSyExample')).toBe('http://127.0.0.1:11434');
  });

  it('keeps valid loopback URLs', () => {
    expect(normalizeStoredOllamaEndpoint('http://localhost:11434/')).toBe('http://localhost:11434');
  });
});

describe('bootstrapOllamaConnection', () => {
  beforeEach(() => {
    invalidateOllamaBootstrap();
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({
      apiKeys: { ollama: 'http://127.0.0.1:11434' },
      defaultLocalModel: '',
    });
    vi.mocked(isOllamaReachable).mockReset();
    vi.mocked(ensureOllamaReadySilent).mockReset();
    vi.mocked(listOllamaModelInfo).mockReset();
  });

  it('syncs discovered models when already reachable', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(true);
    vi.mocked(listOllamaModelInfo).mockResolvedValue([
      { name: 'llama3.2:1b', size: 1, modifiedAt: 'now' },
    ]);

    const result = await bootstrapOllamaConnection({ force: true });

    expect(result.ready).toBe(true);
    expect(result.modelCount).toBe(1);
    expect(useAuthStore.getState().defaultLocalModel).toBe('llama3.2:1b');
  });

  it('auto-starts via ensure when daemon is down', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(false);
    vi.mocked(ensureOllamaReadySilent).mockResolvedValue({
      ready: true,
      apiReachable: true,
      installed: true,
      phase: 'ready',
      detail: 'started',
      statusMsg: 'Ollama ready',
    });
    vi.mocked(listOllamaModelInfo).mockResolvedValue([
      { name: 'qwen3:0.6b', size: 1, modifiedAt: 'now' },
    ]);

    const result = await bootstrapOllamaConnection({ force: true });

    expect(ensureOllamaReadySilent).toHaveBeenCalled();
    expect(result.modelCount).toBe(1);
  });

  it('does not cache failed bootstrap attempts', async () => {
    vi.mocked(isOllamaReachable)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.mocked(ensureOllamaReadySilent).mockResolvedValue({
      ready: false,
      apiReachable: false,
      installed: true,
      phase: 'error',
      detail: 'not yet',
      statusMsg: 'error',
    });
    vi.mocked(listOllamaModelInfo).mockResolvedValue([]);

    const first = await bootstrapOllamaConnection({ force: true });
    expect(first.ready).toBe(false);

    vi.mocked(ensureOllamaReadySilent).mockResolvedValue({
      ready: true,
      apiReachable: true,
      installed: true,
      phase: 'ready',
      detail: 'ready',
      statusMsg: 'Ollama ready',
    });
    vi.mocked(listOllamaModelInfo).mockResolvedValue([
      { name: 'llama3.2:1b', size: 1, modifiedAt: 'now' },
    ]);

    const second = await bootstrapOllamaConnection({ force: true });
    expect(second.ready).toBe(true);
    expect(second.modelCount).toBe(1);
  });

  it('sanitizes a bad stored endpoint before connecting', () => {
    useAuthStore.setState({ apiKeys: { ollama: 'sk-not-a-url' } });
    sanitizeOllamaEndpointFromStore();
    expect(useAuthStore.getState().apiKeys.ollama).toBe('http://127.0.0.1:11434');
  });
});
