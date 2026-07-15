import { beforeEach, describe, expect, it } from 'vitest';
import { syncDiscoveredOllamaModels } from './models';
import {
  getModelsForProvider,
  getModelLabelForProvider,
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
    window.localStorage.removeItem('vibespace.model-foundry.real-adapters.v1');
  });

  it('sanitizes manual model ids', () => {
    expect(sanitizeModelIdForInput('  gemini-3.5-flash \n')).toBe('gemini-3.5-flash');
  });

  it('returns Gemini models for google provider', () => {
    const models = getModelsForProvider('google', ctx);
    expect(models.some((model) => model.id === 'gemini-3.5-flash')).toBe(true);
    expect(models.every((model) => model.provider === 'google')).toBe(true);
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

  it('uses the promoted specialist name for the Foundry model label', () => {
    window.localStorage.setItem('vibespace.model-foundry.real-adapters.v1', JSON.stringify([{
      schemaVersion: 1, projectId: 'project_1', projectName: 'Invoice Extractor', jobId: 'job_1', status: 'promoted', artifactManifestSha256: 'a'.repeat(64),
      evaluation: { artifactManifestSha256: 'a'.repeat(64), report: { gate: 'pass' } },
    }]));

    expect(getModelLabelForProvider('foundry', 'project_1--job_1', ctx)).toBe('Invoice Extractor');
  });
});
