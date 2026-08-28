import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { syncDiscoveredOllamaModels } from '@/lib/ai/models';
import { resetProviderModelCache } from '@/lib/ai/providerModelCatalog';
import { nativeFetch } from '@/lib/nativeFetch';
import { ProviderModelSelect } from './ProviderModelSelect';

vi.mock('@/lib/ai/providers/ollama', () => ({
  isOllamaReachable: vi.fn(async () => false),
  listOllamaModels: vi.fn(async () => []),
}));

vi.mock('@/lib/nativeFetch', () => ({
  nativeFetch: vi.fn(),
}));

describe('ProviderModelSelect', () => {
  beforeEach(() => {
    resetProviderModelCache();
    syncDiscoveredOllamaModels([]);
    useAuthStore.setState({
      apiKeys: { deepseek: 'test-key' },
      offlineMode: false,
      plan: 'free',
      defaultLocalModel: '',
    });
    vi.mocked(nativeFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  it('shows only connected provider models without manual custom entry', async () => {
    render(
      <ProviderModelSelect
        providerId="deepseek"
        modelId="deepseek-v4-flash"
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        providers={['deepseek']}
      />,
    );

    const modelSelect = await screen.findByLabelText('Model');
    expect(modelSelect.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'deepseek-v4-flash' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'deepseek-v4-pro' })).toBeTruthy();
    expect(screen.queryByLabelText(/Advanced: custom model ID/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/custom-model-id/i)).toBeNull();
  });

  it('does not preserve stale custom model ids as selectable options', async () => {
    render(
      <ProviderModelSelect
        providerId="deepseek"
        modelId="legacy-manual-model"
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        providers={['deepseek']}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /legacy-manual-model/i })).toBeNull();
      expect(screen.getByRole('alert').textContent).toMatch(/not available/i);
    });
  });
});
