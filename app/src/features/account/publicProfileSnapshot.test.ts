import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({ from: supabase.from }),
}));

import { normalizePublicStatusInput, publishPublicStatusSnapshot } from './publicProfileSnapshot';

describe('public status snapshot boundary', () => {
  beforeEach(() => {
    supabase.upsert.mockReset().mockResolvedValue({ error: null });
    supabase.from.mockReset().mockReturnValue({ upsert: supabase.upsert });
  });

  it('allows only explicit aggregate metrics and excludes local/raw fields', () => {
    expect(
      normalizePublicStatusInput({
        accountId: 'account-a',
        slug: 'Viper-Status',
        displayName: 'Viper',
        selectedMetrics: {
          totalTokens: 125,
          topModel: 'gpt-5.6-sol',
          ...({ rawPrompt: 'secret', terminalOutput: 'secret' } as Record<string, unknown>),
        },
      }).selectedMetrics,
    ).toEqual({ totalTokens: 125, topModel: 'gpt-5.6-sol' });
  });

  it('publishes only after an explicit call with the signed-in account id', async () => {
    await expect(
      publishPublicStatusSnapshot({
        accountId: 'account-a',
        slug: 'viper-status',
        displayName: 'Viper',
        selectedMetrics: { totalTokens: 125 },
      }),
    ).resolves.toBe('viper-status');
    expect(supabase.from).toHaveBeenCalledWith('public_profile_status');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'account-a',
        visible: true,
        selected_metrics: { totalTokens: 125 },
      }),
      { onConflict: 'user_id' },
    );
  });
});
