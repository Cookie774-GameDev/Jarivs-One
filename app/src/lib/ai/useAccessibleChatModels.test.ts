import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import { buildConnectionPickerGroups, buildModelPickerGroups, useAccessibleChatModels } from './useAccessibleChatModels';
import { CODEX_CLI_CONNECTION } from './adapters/catalog';
import { OPENAI_API_CONNECTION } from './adapters/nativeCatalog';

describe('useAccessibleChatModels', () => {
  beforeEach(() => {
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({ defaultLocalModel: '', apiKeys: {} });
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

    syncDiscoveredOllamaModels(['llama3.2']);
    rerender();

    expect(result.current.hasAny).toBe(true);
    expect(result.current.flatOptions[0]?.modelId).toBe('llama3.2');
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
    expect(groups[0]?.options[1]).toMatchObject({ available: false, authLabel: 'Sign in required' });
  });
});
