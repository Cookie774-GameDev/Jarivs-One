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
const { invalidatePersistentModelCache, listPersistentOpenCodeModels } = vi.hoisted(() => ({
  invalidatePersistentModelCache: vi.fn(),
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
  invalidateOpenCodePersistentModelCache: invalidatePersistentModelCache,
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
    invalidatePersistentModelCache.mockClear();
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
          'openai/gpt-5.3-codex-spark',
          'openrouter/Model v2 (beta)+preview',
        ]),
      );
      expect(openCode).toHaveLength(2);
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
      expect(openCode.some((option) => option.catalogSource === 'connection-static')).toBe(false);
      expect(
        result.current.flatOptions.some((option) => option.connectionId === 'openai-codex'),
      ).toBe(false);
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

  it('keeps exact fast and provider routes under one live logical model row', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: {
        'opencode-cli': [
          { id: 'qwen/qwen3.7-plus', label: 'Qwen 3.7 Plus', source: 'opencode-live' },
          { id: 'qwen/qwen3.7-plus-fast', label: 'Qwen 3.7 Plus Fast', source: 'opencode-live' },
          {
            id: 'qwen-coding-plan/qwen3.7-plus',
            label: 'Qwen 3.7 Plus',
            source: 'opencode-live',
          },
        ],
      },
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'authenticated' },
      },
    });

    expect(groups[0]?.options).toHaveLength(1);
    expect(groups[0]?.options[0]).toMatchObject({
      modelId: 'qwen/qwen3.7-plus',
      label: 'Qwen 3.7 Plus',
      available: true,
    });
    expect(groups[0]?.options[0]?.alternativeRoutes?.map((route) => route.modelId)).toEqual([
      'qwen/qwen3.7-plus',
      'qwen-coding-plan/qwen3.7-plus',
      'qwen/qwen3.7-plus-fast',
    ]);
    expect(groups[0]?.options[0]?.alternativeRoutes?.map((route) => route.label)).toEqual([
      'Qwen 3.7 Plus · OpenCode Bridge · Qwen / Alibaba Cloud',
      'Qwen 3.7 Plus · OpenCode Bridge · qwen-coding-plan',
      'Qwen 3.7 Plus Fast',
    ]);
  });

  it('keeps lone fast aliases and unrelated same-label model ids separate', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: {
        'opencode-cli': [
          { id: 'openai/example-fast', label: 'Example Fast', source: 'opencode-live' },
          { id: 'provider-a/alpha', label: 'Shared Label', source: 'opencode-live' },
          { id: 'provider-b/beta', label: 'Shared Label', source: 'opencode-live' },
        ],
      },
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'authenticated' },
      },
    });

    expect(groups.flatMap((group) => group.options).map((option) => option.modelId)).toEqual([
      'openai/example-fast',
      'provider-a/alpha',
      'provider-b/beta',
    ]);
    expect(
      groups
        .flatMap((group) => group.options)
        .every((option) => option.alternativeRoutes === undefined),
    ).toBe(true);
  });

  it('nests only explicit OpenRouter alternatives under a direct OpenAI product seed', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: {
        'opencode-cli': [
          { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol', source: 'opencode-live' },
          { id: 'openai/gpt-5.6-sol-fast', label: 'GPT-5.6 Sol Fast', source: 'opencode-live' },
          {
            id: 'openrouter/openai/gpt-5.6-sol',
            label: 'OpenRouter Sol Alias',
            source: 'opencode-live',
          },
          {
            id: 'unknown/openai/gpt-5.6-sol',
            label: 'GPT-5.6 Sol',
            source: 'opencode-live',
          },
        ],
      },
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'authenticated' },
      },
    });

    const subscription = groups.find((group) => group.id === 'opencode:openai-subscription');
    expect(subscription?.options).toHaveLength(1);
    expect(subscription?.options[0]?.alternativeRoutes?.map((route) => route.modelId)).toEqual([
      'openai/gpt-5.6-sol',
      'openrouter/openai/gpt-5.6-sol',
      'openai/gpt-5.6-sol-fast',
    ]);
    const unknownRoutes = groups.find((group) => group.id === 'opencode:unknown')?.options;
    expect(unknownRoutes).toEqual([
      expect.objectContaining({ modelId: 'unknown/openai/gpt-5.6-sol' }),
    ]);
    expect(unknownRoutes?.[0]?.alternativeRoutes).toBeUndefined();
  });

  it('keeps distinct OpenRouter upstream products separate while collapsing fast aliases', () => {
    const groups = buildConnectionPickerGroups({
      connections: [OPENCODE_CLI_CONNECTION],
      modelsByProvider: {},
      modelsByConnection: {
        'opencode-cli': [
          { id: 'openrouter/openai/foo', label: 'Foo', source: 'opencode-live' },
          { id: 'openrouter/openai/foo-fast', label: 'Foo Fast', source: 'opencode-live' },
          { id: 'openrouter/anthropic/foo', label: 'Foo', source: 'opencode-live' },
        ],
      },
      stateByConnection: {
        'opencode-cli': { available: true, auth: 'authenticated' },
      },
    });

    const openRouter = groups.find((group) => group.id === 'opencode:openrouter');
    expect(openRouter?.options).toHaveLength(2);
    expect(
      openRouter?.options
        .map((option) => (option.alternativeRoutes ?? [option]).map((route) => route.modelId))
        .sort((left, right) => left[0]!.localeCompare(right[0]!)),
    ).toEqual([
      ['openrouter/anthropic/foo'],
      ['openrouter/openai/foo', 'openrouter/openai/foo-fast'],
    ]);
  });

  it('shows each live OpenAI subscription model once without API or fast-alias leakage', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    listPersistentOpenCodeModels.mockResolvedValue([
      {
        id: 'openai/gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark',
        variants: ['medium'],
      },
      { id: 'openai/gpt-5.4', label: 'GPT-5.4' },
      { id: 'openai/gpt-5.4-fast', label: 'GPT-5.4 Fast' },
      { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { id: 'openai/gpt-5.4-mini-fast', label: 'GPT-5.4 Mini Fast' },
      { id: 'openai/gpt-5.5', label: 'GPT-5.5' },
      { id: 'openai/gpt-5.5-fast', label: 'GPT-5.5 Fast' },
      { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' },
      { id: 'openai/gpt-5.6-luna-fast', label: 'GPT-5.6 Luna Fast' },
      { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'openai/gpt-5.6-sol-fast', label: 'GPT-5.6 Sol Fast' },
      { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { id: 'openai/gpt-5.6-terra-fast', label: 'GPT-5.6 Terra Fast' },
      { id: 'openrouter/openai/gpt-5.6-sol', label: 'OpenRouter Sol Alias' },
      { id: 'openrouter/openai/gpt-5.1', label: 'GPT-5.1' },
      { id: 'qwen/qwen3.7-plus', label: 'Qwen 3.7 Plus' },
      { id: 'qwen-coding-plan/qwen3.7-plus', label: 'Qwen 3.7 Plus' },
    ]);
    writeConnectionMetadata({
      'opencode-cli': {
        installation: 'installed',
        auth: 'authenticated',
        lastCheckedAt: 1,
      },
    });
    markConnectionSessionChecked(['opencode-cli']);
    useAuthStore.setState({ apiKeys: { openai: 'test-key' } });

    const { result } = renderHook(() => useAccessibleChatModels());

    await waitFor(() => {
      const subscription =
        result.current.groups.find((group) => group.id === 'opencode:openai-subscription')
          ?.options ?? [];
      expect(
        result.current.groups.find((group) => group.id === 'opencode:openai-subscription')?.label,
      ).toBe('OpenAI Subscription');
      expect(subscription.map((option) => option.modelId)).toEqual([
        'openai/gpt-5.3-codex-spark',
        'openai/gpt-5.4',
        'openai/gpt-5.4-mini',
        'openai/gpt-5.5',
        'openai/gpt-5.6-luna',
        'openai/gpt-5.6-sol',
        'openai/gpt-5.6-terra',
      ]);
      expect(new Set(subscription.map((option) => option.modelId)).size).toBe(subscription.length);
      expect(subscription.some((option) => option.modelId.endsWith('-fast'))).toBe(false);
      expect(
        subscription
          .flatMap((option) => option.alternativeRoutes ?? [option])
          .map((option) => option.modelId),
      ).toEqual([
        'openai/gpt-5.3-codex-spark',
        'openai/gpt-5.4',
        'openai/gpt-5.4-fast',
        'openai/gpt-5.4-mini',
        'openai/gpt-5.4-mini-fast',
        'openai/gpt-5.5',
        'openai/gpt-5.5-fast',
        'openai/gpt-5.6-luna',
        'openai/gpt-5.6-luna-fast',
        'openai/gpt-5.6-sol',
        'openrouter/openai/gpt-5.6-sol',
        'openai/gpt-5.6-sol-fast',
        'openai/gpt-5.6-terra',
        'openai/gpt-5.6-terra-fast',
      ]);
      const exactSubscriptionRoutes = result.current.flatOptions.filter(
        (option) => option.connectionId === 'opencode-cli' && option.modelId.startsWith('openai/'),
      );
      expect(exactSubscriptionRoutes).toHaveLength(13);
      expect(
        exactSubscriptionRoutes.filter((option) => option.modelId.endsWith('-fast')),
      ).toHaveLength(6);
      expect(
        result.current.flatOptions.some((option) => option.connectionId === 'openai-codex'),
      ).toBe(false);
      expect(
        result.current.flatOptions.some(
          (option) => option.connectionId === 'openai-api' && option.modelId === 'gpt-4o',
        ),
      ).toBe(true);
      expect(
        result.current.groups.find((group) => group.id === 'opencode:openrouter')?.options,
      ).toEqual([expect.objectContaining({ modelId: 'openrouter/openai/gpt-5.1' })]);
      expect(result.current.groups.find((group) => group.id === 'opencode:qwen')?.options).toEqual([
        expect.objectContaining({
          modelId: 'qwen/qwen3.7-plus',
          alternativeRoutes: expect.arrayContaining([
            expect.objectContaining({ modelId: 'qwen/qwen3.7-plus' }),
            expect.objectContaining({ modelId: 'qwen-coding-plan/qwen3.7-plus' }),
          ]),
        }),
      ]);
      const openCodeRoutes = result.current.groups
        .filter((group) => group.id?.startsWith('opencode:'))
        .flatMap((group) => group.options)
        .flatMap((option) => option.alternativeRoutes ?? [option])
        .map((option) => option.modelId);
      expect([...openCodeRoutes].sort()).toEqual(
        [
          'openai/gpt-5.3-codex-spark',
          'openai/gpt-5.4',
          'openai/gpt-5.4-fast',
          'openai/gpt-5.4-mini',
          'openai/gpt-5.4-mini-fast',
          'openai/gpt-5.5',
          'openai/gpt-5.5-fast',
          'openai/gpt-5.6-luna',
          'openai/gpt-5.6-luna-fast',
          'openai/gpt-5.6-sol',
          'openai/gpt-5.6-sol-fast',
          'openai/gpt-5.6-terra',
          'openai/gpt-5.6-terra-fast',
          'openrouter/openai/gpt-5.6-sol',
          'openrouter/openai/gpt-5.1',
          'qwen/qwen3.7-plus',
          'qwen-coding-plan/qwen3.7-plus',
        ].sort(),
      );
      expect(new Set(openCodeRoutes).size).toBe(openCodeRoutes.length);
      expect(new Set(result.current.groups.map((group) => group.id)).size).toBe(
        result.current.groups.length,
      );
      expect(
        subscription
          .flatMap((option) => option.alternativeRoutes ?? [option])
          .some((option) => option.connectionId === 'openai-api'),
      ).toBe(false);
      expect(subscription.find((option) => option.modelId.endsWith('codex-spark'))).toMatchObject({
        id: 'opencode-cli:openai/gpt-5.3-codex-spark',
        provider: 'opencode',
        variants: ['medium'],
        available: true,
      });
    });
  });

  it('does not treat a nested OpenRouter route as direct OpenAI subscription authority', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    listPersistentOpenCodeModels.mockResolvedValue([
      {
        id: 'openrouter/openai/gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
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
      expect(
        result.current.flatOptions.find(
          (option) => option.modelId === 'openrouter/openai/gpt-5.6-sol',
        ),
      ).toMatchObject({ connectionId: 'opencode-cli', available: true });
      expect(
        result.current.flatOptions.some((option) => option.connectionId === 'openai-codex'),
      ).toBe(true);
      expect(
        result.current.groups.some((group) => group.id === 'opencode:openai-subscription'),
      ).toBe(false);
      expect(
        result.current.groups.find((group) => group.id === 'opencode:openrouter')?.options,
      ).toEqual([
        expect.objectContaining({
          modelId: 'openrouter/openai/gpt-5.6-sol',
          available: true,
        }),
      ]);
    });
  });

  it('clears prior live rows when a newer catalog generation rejects', async () => {
    isConnectionSessionChecked.mockImplementation((id) => id === 'opencode-cli');
    let rejectRefresh!: (reason: Error) => void;
    const rejectedRefresh = new Promise<readonly ProviderDiscoveredModel[]>((_, reject) => {
      rejectRefresh = reject;
    });
    listPersistentOpenCodeModels
      .mockResolvedValueOnce([{ id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' }])
      .mockImplementationOnce(() => rejectedRefresh);
    writeConnectionMetadata({
      'opencode-cli': {
        installation: 'installed',
        auth: 'authenticated',
        lastCheckedAt: 1,
      },
    });
    markConnectionSessionChecked(['opencode-cli']);

    const { result } = renderHook(() => useAccessibleChatModels());
    await waitFor(() =>
      expect(
        result.current.flatOptions.find((option) => option.modelId === 'openai/gpt-5.6-sol'),
      ).toMatchObject({ connectionId: 'opencode-cli', available: true }),
    );

    act(() => requestOpenCodeModelCatalogRefresh());
    await waitFor(() => expect(listPersistentOpenCodeModels).toHaveBeenCalledTimes(2));
    expect(
      result.current.flatOptions.some(
        (option) =>
          option.connectionId === 'opencode-cli' && option.modelId === 'openai/gpt-5.6-sol',
      ),
    ).toBe(false);

    await act(async () => {
      rejectRefresh(new Error('catalog refresh failed'));
      await rejectedRefresh.catch(() => undefined);
    });
    await waitFor(() => {
      const staleFallback = result.current.flatOptions.filter(
        (option) => option.connectionId === 'openai-codex',
      );
      expect(staleFallback.length).toBeGreaterThan(0);
      expect(staleFallback.every((option) => option.available === false)).toBe(true);
      expect(
        result.current.flatOptions.some(
          (option) =>
            option.connectionId === 'opencode-cli' && option.modelId === 'openai/gpt-5.6-sol',
        ),
      ).toBe(false);
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

  it('invalidates both picker and persistent catalogs when OpenCode auth truth changes', () => {
    renderHook(() => useAccessibleChatModels());
    invalidatePersistentModelCache.mockClear();

    isConnectionSessionChecked.mockReturnValue(true);
    act(() => {
      writeConnectionPickerStates({
        'opencode-cli': { available: true, auth: 'authenticated' },
      });
      window.dispatchEvent(new Event(AI_CONNECTION_STATE_EVENT));
    });

    expect(invalidatePersistentModelCache).toHaveBeenCalledOnce();
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

  it('keeps exact connection auth and billing surfaces in separate groups', () => {
    const groups = buildConnectionPickerGroups({
      connections: [CODEX_CLI_CONNECTION, OPENAI_API_CONNECTION],
      modelsByProvider: { openai: [{ id: 'gpt-5', label: 'GPT-5' }] },
      stateByConnection: {
        'openai-codex': { available: true, auth: 'authenticated' },
        'openai-api': { available: false, auth: 'unauthenticated' },
      },
    });
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => [group.id, group.label])).toEqual([
      ['connection:openai-codex', 'Codex CLI'],
      ['connection:openai-api', 'OpenAI API'],
    ]);
    expect(groups[0]?.options[0]?.modeLabel).toBe('Subscription bridge · External agent');
    expect(groups[1]?.options[0]).toMatchObject({
      modeLabel: 'Native Jarvis Chat · API billed',
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
    const options = groups.flatMap((group) => group.options);

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
    expect(groups.map((group) => group.label)).toEqual(['DeepSeek Models', 'Qwen Models']);
    expect(
      groups.flatMap((group) => group.options).every((option) => option.available === false),
    ).toBe(true);
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

  it('keeps stale static subscription fallback visible but disabled without live authority', async () => {
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
    expect(codexOptions.every((option) => option.available === false)).toBe(true);
    expect(codexOptions.every((option) => option.catalogSource === 'connection-static')).toBe(true);
    expect(codexOptions.every((option) => option.authLabel === 'Unavailable')).toBe(true);
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
