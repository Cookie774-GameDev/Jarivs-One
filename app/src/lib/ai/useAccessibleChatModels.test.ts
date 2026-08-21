import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import {
  buildConnectionPickerGroups,
  buildLiveOpenCodePickerModels,
  buildModelPickerGroups,
  requestOpenCodeModelCatalogRefresh,
  useAccessibleChatModels,
} from './useAccessibleChatModels';
import {
  CODEX_CLI_CONNECTION,
  CONNECTION_MODEL_OPTIONS,
  OPENCODE_CLI_CONNECTION,
} from './adapters/catalog';
import { OPENAI_API_CONNECTION, QWEN_API_CONNECTION } from './adapters/nativeCatalog';
import { LocalAdapterRegistry } from '@/features/model-foundry/adapterRegistry';
import type { ProviderDiscoveredModel } from './adapters/types';
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
const { listPersistentOpenCodeModels } = vi.hoisted(() => ({
  listPersistentOpenCodeModels: vi.fn(async (): Promise<readonly ProviderDiscoveredModel[]> => []),
}));

vi.mock('./adapters/autoDetectConnections', () => ({
  ensureExternalConnectionAutoDetection,
}));

vi.mock('./connectionState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./connectionState')>()),
  isConnectionSessionChecked,
}));

vi.mock('./adapters/opencodePersistent', () => ({
  invalidateOpenCodePersistentModelCache: vi.fn(),
  openCodePersistentAdapter: {
    listModels: listPersistentOpenCodeModels,
  },
}));

describe('useAccessibleChatModels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConnectionSessionChecksForTests();
    ensureExternalConnectionAutoDetection.mockClear();
    isConnectionSessionChecked.mockReset();
    isConnectionSessionChecked.mockReturnValue(false);
    listPersistentOpenCodeModels.mockReset();
    listPersistentOpenCodeModels.mockResolvedValue([]);
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
    listPersistentOpenCodeModels.mockResolvedValue([
      {
        id: 'openai/gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark',
        variants: ['medium'],
      },
      {
        id: 'openrouter/Model v2 (beta)+preview',
        label: 'Model v2 (beta)+preview',
        pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
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
      const openCode = result.current.flatOptions.filter(
        (option) => option.connectionId === 'opencode-cli',
      );
      expect(openCode.map((option) => option.modelId)).toEqual(
        expect.arrayContaining([
          'deepseek/deepseek-v4-flash',
          'qwen/qwen3.8-max',
          'openai/gpt-5.3-codex-spark',
          'openrouter/Model v2 (beta)+preview',
        ]),
      );
      expect(openCode).toHaveLength(4);
      expect(
        openCode.find((option) => option.modelId === 'openai/gpt-5.3-codex-spark'),
      ).toMatchObject({
        id: 'opencode-cli:openai/gpt-5.3-codex-spark',
        available: true,
        variants: ['medium'],
      });
      expect(
        openCode.find((option) => option.modelId === 'openrouter/Model v2 (beta)+preview'),
      ).toMatchObject({ available: true, pricingStatus: 'free', isFree: true });
      expect(openCode.filter((option) => option.catalogSource === 'connection-static')).toEqual([
        expect.objectContaining({ modelId: 'deepseek/deepseek-v4-flash', available: false }),
        expect.objectContaining({ modelId: 'qwen/qwen3.8-max', available: false }),
      ]);
    });
  });

  it('builds exact live OpenCode targets and exposes only complete all-zero pricing as free', () => {
    const models = buildLiveOpenCodePickerModels(
      [
        { id: 'openai/gpt-5.3-codex-spark', label: 'Spark' },
        {
          id: 'openai/gpt-5.6-luna',
          label: 'Luna',
          pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
        {
          id: 'openai/gpt-5.6-sol',
          label: 'Sol',
          pricing: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        },
        { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      ],
      123,
    );

    expect(models.map(({ id }) => id)).toEqual([
      'openai/gpt-5.3-codex-spark',
      'openai/gpt-5.6-luna',
      'openai/gpt-5.6-sol',
      'deepseek/deepseek-v4-flash',
    ]);
    expect(models.find(({ id }) => id.endsWith('luna'))).toMatchObject({
      pricingStatus: 'free',
      isFree: true,
      available: true,
      source: 'opencode-live',
    });
    expect(models.find(({ id }) => id.endsWith('sol'))).toMatchObject({
      pricingStatus: 'paid',
      isFree: false,
    });
    expect(models.find(({ id }) => id.endsWith('spark'))).toMatchObject({
      pricingStatus: 'unknown',
      isFree: false,
    });
  });

  it('does not probe OpenCode models until current-session authentication is verified', async () => {
    isConnectionSessionChecked.mockReturnValue(false);

    renderHook(() => useAccessibleChatModels());

    await act(async () => Promise.resolve());
    expect(listPersistentOpenCodeModels).not.toHaveBeenCalled();
  });

  it('does not repeat OpenCode discovery for unrelated connection events', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    listPersistentOpenCodeModels.mockResolvedValue([{ id: 'openai/gpt-5', label: 'GPT-5' }]);
    writeConnectionMetadata({
      'opencode-cli': {
        installation: 'installed',
        auth: 'authenticated',
        lastCheckedAt: 1,
      },
    });
    markConnectionSessionChecked(['opencode-cli']);
    renderHook(() => useAccessibleChatModels());
    await waitFor(() => expect(listPersistentOpenCodeModels).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event(AI_CONNECTION_STATE_EVENT)));
    await act(async () => Promise.resolve());
    expect(listPersistentOpenCodeModels).toHaveBeenCalledTimes(1);
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
    ).toEqual((CONNECTION_MODEL_OPTIONS['openai-codex'] ?? []).map((option) => option.id));
    expect(
      options
        .filter((option) => option.connectionId === 'openai-api')
        .map((option) => option.modelId),
    ).toEqual(['gpt-4o', 'gpt-5.6-sol']);
  });

  it('keeps static OpenCode fallback hints visible but non-executable', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: CONNECTION_MODEL_OPTIONS,
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'authenticated' },
      },
    });
    const ids = groups.flatMap((group) => group.options).map((option) => option.modelId);
    expect(ids).toEqual(['deepseek/deepseek-v4-flash', 'qwen/qwen3.8-max']);
    expect(groups[0]?.label).toBe('OpenCode Models');
    expect(groups[0]?.options.every((option) => option.available === false)).toBe(true);
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
    const codexOptions = result.current.flatOptions.filter(
      (option) => option.connectionId === 'openai-codex',
    );
    expect(codexOptions.every((option) => option.available === true)).toBe(true);
    expect(codexOptions.map((option) => option.modelId).sort()).toEqual(
      (CONNECTION_MODEL_OPTIONS['openai-codex'] ?? []).map((option) => option.id).sort(),
    );
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

  it('surfaces an exact discovered OpenCode OpenAI model on the subscription connection', () => {
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
});

describe('useAccessibleChatModels foundry adapter injection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConnectionSessionChecksForTests();
    isConnectionSessionChecked.mockReset();
    isConnectionSessionChecked.mockReturnValue(false);
    listPersistentOpenCodeModels.mockReset();
    listPersistentOpenCodeModels.mockResolvedValue([]);
  });

  function seedAdapter(args: { promote: boolean; gate?: 'pass' | 'blocked' }): void {
    // LocalAdapterRegistry writes through the same storage authority used by
    // the Foundry Studio, so the picker sees exactly what the studio records.
    const registry = new LocalAdapterRegistry(
      window.localStorage,
      () => '2026-08-16T00:00:00.000Z',
    );
    const artifact = {
      projectId: 'project-alpha',
      jobId: 'job_beta',
      manifestSha256: 'a'.repeat(64),
      adapterFiles: { 'adapter.safetensors': 'private' },
      metrics: {},
      trainingConfig: {},
    };
    registry.upsert('project-alpha', 'job_beta', artifact, 'Support classifier');
    registry.recordEvaluation('project-alpha', 'job_beta', 'a'.repeat(64), {
      suite: 'private-dataset-studio',
      caseCount: 2,
      baseScore: 0,
      candidateScore: 1,
      championScore: null,
      delta: 1,
      safetyFailures: [],
      gate: args.gate ?? 'pass',
      caseEvidence: [],
    });
    if (args.promote && (args.gate ?? 'pass') === 'pass') {
      registry.promote('project-alpha', 'job_beta');
    }
  }

  it('surfaces promoted foundry adapters as a bounded local picker group', async () => {
    seedAdapter({ promote: true });
    const { result } = renderHook(() => useAccessibleChatModels());
    await waitFor(() => {
      const foundry = result.current.groups.find((group) => group.provider === 'foundry');
      expect(foundry).toBeTruthy();
      expect(foundry?.options.map((option) => option.modelId)).toEqual(['project-alpha--job_beta']);
      expect(foundry?.options[0]?.id).toBe('foundry:project-alpha--job_beta');
      expect(foundry?.options[0]?.available).toBe(true);
    });
  });

  it('fails closed when the adapter has not passed a current evaluation', async () => {
    seedAdapter({ promote: false, gate: 'blocked' });
    const { result } = renderHook(() => useAccessibleChatModels());
    // Give the memo a beat to settle with the blocked registry state.
    await act(async () => undefined);
    const foundry = result.current.groups.find((group) => group.provider === 'foundry');
    expect(foundry).toBeUndefined();
  });
});
