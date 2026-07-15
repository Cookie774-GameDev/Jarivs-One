import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from './models';
import { buildModelPickerGroups, useAccessibleChatModels } from './useAccessibleChatModels';

describe('useAccessibleChatModels', () => {
  beforeEach(() => {
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({ defaultLocalModel: '', apiKeys: {} });
    window.localStorage.removeItem('vibespace.model-foundry.real-adapters.v1');
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

    act(() => syncDiscoveredOllamaModels(['llama3.2']));
    rerender();

    expect(result.current.hasAny).toBe(true);
    expect(result.current.flatOptions[0]?.modelId).toBe('llama3.2');
  });

  it('lists only a passing promoted Foundry adapter using its specialist name', () => {
    window.localStorage.setItem('vibespace.model-foundry.real-adapters.v1', JSON.stringify([{
      projectId: 'project_1', projectName: 'Invoice Extractor', jobId: 'job_1', status: 'promoted', artifactManifestSha256: 'a'.repeat(64),
      evaluation: { artifactManifestSha256: 'a'.repeat(64), report: { gate: 'pass' } },
    }]));

    const groups = buildModelPickerGroups({ apiKeys: {}, offlineMode: true, plan: 'free', defaultLocalModel: '' });

    expect(groups.find((group) => group.provider === 'foundry')?.options).toEqual([
      expect.objectContaining({ modelId: 'project_1--job_1', label: expect.stringMatching(/Invoice Extractor/) }),
    ]);
  });
});
