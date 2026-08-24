import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsHarness = vi.hoisted(() => ({
  getMonthlyAllProviderUsage: vi.fn(),
}));

vi.mock('@/lib/usage/usageSummary', () => ({
  getMonthlyAllProviderUsage: analyticsHarness.getMonthlyAllProviderUsage,
}));

vi.mock('./milestonesStore', () => ({
  useMilestonesStore: {
    getState: () => ({ items: [] }),
  },
}));

vi.mock('./toolRunsStore', () => ({
  useToolRunsStore: {
    getState: () => ({ runs: [] }),
  },
}));

import { useWorkspaceAnalyticsStore } from './workspaceAnalytics';

describe('workspace analytics background rollup', () => {
  beforeEach(() => {
    analyticsHarness.getMonthlyAllProviderUsage.mockReset();
  });

  it('coalesces overlapping refreshes and permits a fresh run after settlement', async () => {
    let release: ((value: Record<string, unknown>) => void) | undefined;
    const gate = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve;
    });
    analyticsHarness.getMonthlyAllProviderUsage.mockReturnValue(gate);

    const first = useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    const overlapping = useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    expect(analyticsHarness.getMonthlyAllProviderUsage).toHaveBeenCalledTimes(1);

    release?.({});
    await Promise.all([first, overlapping]);

    analyticsHarness.getMonthlyAllProviderUsage.mockResolvedValueOnce({});
    await useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    expect(analyticsHarness.getMonthlyAllProviderUsage).toHaveBeenCalledTimes(2);
  });

  it('releases the single-flight gate after a failed rollup', async () => {
    analyticsHarness.getMonthlyAllProviderUsage.mockRejectedValueOnce(
      new Error('temporary IndexedDB failure'),
    );
    await expect(useWorkspaceAnalyticsStore.getState().refreshTokenRollup()).rejects.toThrow(
      'temporary IndexedDB failure',
    );

    analyticsHarness.getMonthlyAllProviderUsage.mockResolvedValueOnce({});
    await expect(
      useWorkspaceAnalyticsStore.getState().refreshTokenRollup(),
    ).resolves.toBeUndefined();
    expect(analyticsHarness.getMonthlyAllProviderUsage).toHaveBeenCalledTimes(2);
  });
});
