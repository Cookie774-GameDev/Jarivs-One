import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncDiscoveredOllamaModels } from './models';
import {
  getModelsForProvider,
  loadProviderModels,
  modelBelongsToProvider,
  resetProviderModelCache,
  resolveModelOnProviderChange,
  sanitizeModelIdForInput,
  validateProviderModelSelection,
} from './providerModelCatalog';

const ctx = {
  apiKeys: { google: 'test-key', groq: 'gsk_test' },
  offlineMode: false,
  plan: 'free' as const,
  defaultLocalModel: '',
};

describe('providerModelCatalog', () => {
  beforeEach(() => {
    resetProviderModelCache();
    syncDiscoveredOllamaModels([]);
  });

  it('sanitizes manual model ids', () => {
    expect(sanitizeModelIdForInput('  gemini-3.5-flash \n')).toBe('gemini-3.5-flash');
  });

  it('returns Gemini models for google provider', () => {
    const models = getModelsForProvider('google', ctx);
    expect(models.some((model) => model.id === 'gemini-3.5-flash')).toBe(true);
    expect(models.every((model) => model.provider === 'google')).toBe(true);
  });

  it('discovers the Qwen models available to the connected Model Studio account', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'qwen3.7-plus' }, { id: 'qwen3-coder-next' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const qwenCtx = { ...ctx, apiKeys: { qwen: 'qwen-test-key' } };

    const models = await loadProviderModels('qwen', qwenCtx, { force: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope-us.aliyuncs.com/compatible-mode/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer qwen-test-key' },
      }),
    );
    expect(models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['qwen3.7-plus', 'qwen3-coder-next']),
    );
    fetchMock.mockRestore();
  });

  it('clears mismatched model when provider changes', () => {
    const next = resolveModelOnProviderChange('groq', 'gemini-3.5-flash', ctx);
    expect(modelBelongsToProvider('groq', next)).toBe(true);
    expect(next).not.toBe('gemini-3.5-flash');
  });

  it('does not expose unknown saved models as dropdown options', () => {
    const models = getModelsForProvider('google', ctx, 'my-old-custom-model');
    expect(models.some((model) => model.id === 'my-old-custom-model')).toBe(false);
  });

  it('blocks provider/model mismatch validation', () => {
    const result = validateProviderModelSelection('groq', 'gemini-3.5-flash', ctx);
    expect(result.ok).toBe(false);
  });

  it('rejects custom model ids even when a legacy caller asks for custom allowance', () => {
    const result = validateProviderModelSelection('google', 'totally-custom-id', ctx, {
      allowCustom: true,
    });
    expect(result.ok).toBe(false);
  });
});
