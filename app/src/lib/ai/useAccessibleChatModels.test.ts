import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import {
  buildConnectionPickerGroups,
  buildModelPickerGroups,
  useAccessibleChatModels,
} from './useAccessibleChatModels';
import { CODEX_CLI_CONNECTION, CONNECTION_MODEL_OPTIONS } from './adapters/catalog';
import { OPENAI_API_CONNECTION, QWEN_API_CONNECTION } from './adapters/nativeCatalog';
import {
  resetConnectionSessionChecksForTests,
  writeConnectionMetadata,
  writeConnectionPickerStates,
} from './connectionState';

const { ensureExternalConnectionAutoDetection, isConnectionSessionChecked } = vi.hoisted(() => ({
  ensureExternalConnectionAutoDetection: vi.fn(async () => ({})),
  isConnectionSessionChecked: vi.fn(() => false),
}));

vi.mock('./adapters/autoDetectConnections', () => ({
  ensureExternalConnectionAutoDetection,
}));

vi.mock('./connectionState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./connectionState')>()),
  isConnectionSessionChecked,
}));

describe('useAccessibleChatModels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConnectionSessionChecksForTests();
    ensureExternalConnectionAutoDetection.mockClear();
    isConnectionSessionChecked.mockReset();
    isConnectionSessionChecked.mockReturnValue(false);
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

  it('never marks a native API connection ready without a saved credential', () => {
    const groups = buildConnectionPickerGroups({
      connections: [QWEN_API_CONNECTION],
      modelsByProvider: { qwen: [{ id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus' }] },
      stateByConnection: {
        'qwen-api': { available: true, auth: 'authenticated' },
      },
      credentialSavedByProvider: { qwen: false },
    });

    expect(groups[0]?.options[0]).toMatchObject({
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
    ).toEqual([
      'gpt-5.3-codex-spark',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.5-codex',
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
    ]);
    expect(
      options
        .filter((option) => option.connectionId === 'openai-api')
        .map((option) => option.modelId),
    ).toEqual(['gpt-4o', 'gpt-5.6-sol']);
  });

  it('surfaces discovered OpenCode OpenAI models including Spark on the subscription connection', () => {
    const groups = buildConnectionPickerGroups({
      connections: [CODEX_CLI_CONNECTION],
      modelsByProvider: { openai: [{ id: 'gpt-4o', label: 'GPT-4o' }] },
      modelsByConnection: {
        'openai-codex': [{ id: 'gpt-5.3-codex-spark', label: 'GPT 5.3 Codex Spark' }],
      },
      stateByConnection: {
        'openai-codex': { available: true, auth: 'authenticated' },
      },
    });
    expect(groups[0]?.options.map((option) => option.modelId)).toEqual(['gpt-5.3-codex-spark']);
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

  it('includes an authenticated Codex subscription bridge in normal VibeSpace Chat', async () => {
    writeConnectionPickerStates({
      'openai-codex': { available: true, auth: 'authenticated' },
    });

    const { result } = renderHook(() => useAccessibleChatModels());

    expect(ensureExternalConnectionAutoDetection).toHaveBeenCalledOnce();
    expect(
      result.current.flatOptions.some((option) => option.connection?.mode === 'external-cli'),
    ).toBe(true);
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
      result.current.flatOptions.some((option) => option.connectionId === 'openai-codex'),
    ).toBe(true);
    expect(
      result.current.flatOptions
        .filter((option) => option.connectionId === 'openai-codex')
        .every((option) => option.available && option.authLabel === 'Ready'),
    ).toBe(true);
  });
});
