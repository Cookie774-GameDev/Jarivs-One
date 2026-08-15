import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import {
  buildConnectionPickerGroups,
  buildModelPickerGroups,
  requestOpenCodeModelCatalogRefresh,
  useAccessibleChatModels,
} from './useAccessibleChatModels';
import {
  CODEX_CLI_CONNECTION,
  CONNECTION_MODEL_OPTIONS,
  OPENCODE_CLI_CONNECTION,
} from './adapters/catalog';
import { OPENAI_API_CONNECTION } from './adapters/nativeCatalog';
import {
  AI_CONNECTION_STATE_EVENT,
  markConnectionSessionChecked,
  resetConnectionSessionChecksForTests,
  writeConnectionMetadata,
  writeConnectionPickerStates,
} from './connectionState';

const { ensureExternalConnectionAutoDetection, isConnectionSessionChecked } = vi.hoisted(() => ({
  ensureExternalConnectionAutoDetection: vi.fn(async () => ({})),
  isConnectionSessionChecked: vi.fn((_connectionId?: string) => false),
}));
const { listOpenCodeModels } = vi.hoisted(() => ({
  listOpenCodeModels: vi.fn(async () => [] as readonly { id: string; label: string }[]),
}));

vi.mock('./adapters/autoDetectConnections', () => ({
  ensureExternalConnectionAutoDetection,
}));

vi.mock('./connectionState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./connectionState')>()),
  isConnectionSessionChecked,
}));

vi.mock('./adapters/opencodePersistent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/opencodePersistent')>();
  return {
    ...actual,
    openCodePersistentAdapter: Object.freeze({
      ...actual.openCodePersistentAdapter,
      listModels: listOpenCodeModels,
    }),
  };
});

describe('useAccessibleChatModels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConnectionSessionChecksForTests();
    ensureExternalConnectionAutoDetection.mockClear();
    isConnectionSessionChecked.mockReset();
    isConnectionSessionChecked.mockReturnValue(false);
    listOpenCodeModels.mockReset();
    listOpenCodeModels.mockResolvedValue([]);
    requestOpenCodeModelCatalogRefresh();
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({ defaultLocalModel: '', apiKeys: {}, offlineMode: false, plan: 'free' });
  });

  it('includes discovered Ollama models in picker groups', () => {
    syncDiscoveredOllamaModels(['qwen3:4b']);

    const groups = buildModelPickerGroups({
      apiKeys: {},
      offlineMode: false,
      plan: 'free',
      defaultLocalModel: 'qwen3:4b',
    });

    expect(groups.some((group) => group.provider === 'ollama')).toBe(true);
    expect(groups.find((group) => group.provider === 'ollama')?.options).toEqual([
      expect.objectContaining({ modelId: 'qwen3:4b', label: 'qwen3:4b' }),
    ]);
  });

  it('reacts when Ollama discovery updates', () => {
    const { result, rerender } = renderHook(() => useAccessibleChatModels());
    expect(result.current.hasAny).toBe(false);

    act(() => {
      syncDiscoveredOllamaModels(['llama3.2']);
      rerender();
    });

    expect(result.current.hasAny).toBe(true);
    expect(result.current.flatOptions[0]?.modelId).toBe('llama3.2');
  });

  it('adds safely discovered OpenCode models to the exact subscription connection', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    listOpenCodeModels.mockResolvedValue([
      { id: 'openrouter/Model v2 (beta)+preview', label: 'openrouter/Model v2 (beta)+preview' },
    ]);
    writeConnectionMetadata({
      'opencode-cli': {
        installation: 'installed',
        auth: 'authenticated',
        lastCheckedAt: 1,
      },
    });
    markConnectionSessionChecked(['opencode-cli']);

    const { result } = renderHook(() => useAccessibleChatModels());

    await waitFor(() => {
      expect(
        result.current.flatOptions.find((option) => option.connectionId === 'opencode-cli'),
      ).toMatchObject({
        modelId: 'openrouter/Model v2 (beta)+preview',
        available: true,
      });
    });
  });

  it('does not probe OpenCode models until current-session authentication is verified', async () => {
    isConnectionSessionChecked.mockReturnValue(false);

    renderHook(() => useAccessibleChatModels());

    await act(async () => Promise.resolve());
    expect(listOpenCodeModels).not.toHaveBeenCalled();
  });

  it('does not repeat OpenCode discovery for unrelated connection events', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    listOpenCodeModels.mockResolvedValue([{ id: 'openai/gpt-5', label: 'openai/gpt-5' }]);
    writeConnectionMetadata({
      'opencode-cli': {
        installation: 'installed',
        auth: 'authenticated',
        lastCheckedAt: 1,
      },
    });
    markConnectionSessionChecked(['opencode-cli']);
    renderHook(() => useAccessibleChatModels());
    await waitFor(() => expect(listOpenCodeModels).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event(AI_CONNECTION_STATE_EVENT)));
    await act(async () => Promise.resolve());
    expect(listOpenCodeModels).toHaveBeenCalledTimes(1);
  });

  it('removes every cloud and external connection from Fully Local Chat', () => {
    syncDiscoveredOllamaModels(['qwen3.5:4b']);
    writeConnectionPickerStates({
      'openai-api': { available: true, auth: 'authenticated' },
    });
    useAuthStore.setState({
      offlineMode: true,
      defaultLocalModel: 'qwen3.5:4b',
      apiKeys: { openai: 'test-key' },
    });

    const { result } = renderHook(() => useAccessibleChatModels());

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]?.options).toEqual([
      expect.objectContaining({
        provider: 'ollama',
        modelId: 'qwen3.5:4b',
        connectionId: 'ollama-local',
      }),
    ]);
  });

  it('groups exact connections by provider family with mode and availability labels', () => {
    const groups = buildConnectionPickerGroups({
      connections: [CODEX_CLI_CONNECTION, OPENAI_API_CONNECTION],
      modelsByProvider: { openai: [{ id: 'gpt-5', label: 'GPT-5' }] },
      stateByConnection: {
        'openai-codex': { available: true, auth: 'authenticated' },
        'openai-api': { available: false, auth: 'unauthenticated' },
      },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('OpenAI');
    expect(groups[0]?.options.map((option) => option.modeLabel)).toEqual([
      'Subscription bridge · External agent',
      'Native Jarvis Chat · API billed',
    ]);
    expect(groups[0]?.options[1]).toMatchObject({
      available: false,
      authLabel: 'Sign in required',
    });
  });

  it('uses the connection-specific Codex subscription catalog instead of OpenAI API models', () => {
    const groups = buildConnectionPickerGroups({
      connections: [CODEX_CLI_CONNECTION, OPENAI_API_CONNECTION],
      modelsByProvider: {
        openai: [
          { id: 'gpt-4o', label: 'GPT-4o' },
          { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol API' },
        ],
      },
      modelsByConnection: CONNECTION_MODEL_OPTIONS,
      stateByConnection: {
        'openai-codex': { available: true, auth: 'authenticated' },
        'openai-api': { available: true, auth: 'authenticated' },
      },
    });
    const options = groups[0]?.options ?? [];

    expect(
      options
        .filter((option) => option.connectionId === 'openai-codex')
        .map((option) => option.modelId),
    ).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
    expect(
      options
        .filter((option) => option.connectionId === 'openai-api')
        .map((option) => option.modelId),
    ).toEqual(['gpt-4o', 'gpt-5.6-sol']);
  });

  it('never enables unknown Codex subscription authentication', () => {
    const groups = buildConnectionPickerGroups({
      connections: [CODEX_CLI_CONNECTION],
      modelsByProvider: { openai: [{ id: 'gpt-4o', label: 'GPT-4o' }] },
      modelsByConnection: CONNECTION_MODEL_OPTIONS,
      stateByConnection: {
        'openai-codex': { available: true, auth: 'unknown' },
      },
    });

    expect(groups[0]?.options.every((option) => option.available === false)).toBe(true);
    expect(
      groups[0]?.options.every((option) => option.authLabel === 'Authentication unknown'),
    ).toBe(true);
  });

  it('never enables unknown OpenCode subscription authentication', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: {
        'opencode-cli': [{ id: 'openai/gpt-5', label: 'openai/gpt-5' }],
      },
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'unknown' },
      },
    });

    expect(groups[0]?.options).toEqual([
      expect.objectContaining({ available: false, authLabel: 'Authentication unknown' }),
    ]);
  });

  it('does not trust persisted ChatGPT auth until this app session completes detection', async () => {
    writeConnectionPickerStates({
      'openai-codex': { available: true, auth: 'authenticated' },
    });

    const { result } = renderHook(() => useAccessibleChatModels());

    await waitFor(() => {
      expect(ensureExternalConnectionAutoDetection).toHaveBeenCalledOnce();
    });
    expect(
      result.current.flatOptions
        .filter((option) => option.connectionId === 'openai-codex')
        .every((option) => option.available === false),
    ).toBe(true);

    isConnectionSessionChecked.mockReturnValue(true);
    act(() => {
      writeConnectionMetadata({
        'openai-codex': {
          installation: 'installed',
          auth: 'authenticated',
        },
      });
    });
    expect(
      result.current.flatOptions
        .filter((option) => option.connectionId === 'openai-codex')
        .map((option) => ({ modelId: option.modelId, available: option.available })),
    ).toEqual([
      { modelId: 'gpt-5.6-sol', available: true },
      { modelId: 'gpt-5.6-terra', available: true },
      { modelId: 'gpt-5.6-luna', available: true },
    ]);
  });
});
