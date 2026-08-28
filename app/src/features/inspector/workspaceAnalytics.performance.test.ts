import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsHarness = vi.hoisted(() => ({
  loadStatusSummary: vi.fn(),
}));

vi.mock('@/lib/accountIdentity', () => ({
  getActiveAccountIdentity: () => ({ accountId: 'account-a', source: 'local' }),
}));

vi.mock('@/features/account/statusAnalytics', () => ({
  loadStatusSummary: analyticsHarness.loadStatusSummary,
  createActiveStatusClock: () => () => undefined,
  startStatusAnalyticsRuntime: async () => () => undefined,
  STATUS_ANALYTICS_CHANGED_EVENT: 'vibespace:status-analytics:changed',
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
    analyticsHarness.loadStatusSummary.mockReset();
  });

  it('coalesces overlapping refreshes and permits a fresh run after settlement', async () => {
    let release: ((value: Record<string, unknown>) => void) | undefined;
    const gate = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve;
    });
    analyticsHarness.loadStatusSummary.mockReturnValue(gate);

    const first = useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    const overlapping = useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    expect(analyticsHarness.loadStatusSummary).toHaveBeenCalledTimes(1);

    release?.({});
    await Promise.all([first, overlapping]);

    analyticsHarness.loadStatusSummary.mockResolvedValueOnce({ models: [] });
    await useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
    expect(analyticsHarness.loadStatusSummary).toHaveBeenCalledTimes(2);
  });

  it('releases the single-flight gate after a failed rollup', async () => {
    analyticsHarness.loadStatusSummary.mockRejectedValueOnce(
      new Error('temporary IndexedDB failure'),
    );
    await expect(useWorkspaceAnalyticsStore.getState().refreshTokenRollup()).rejects.toThrow(
      'temporary IndexedDB failure',
    );

    analyticsHarness.loadStatusSummary.mockResolvedValueOnce({ models: [] });
    await expect(
      useWorkspaceAnalyticsStore.getState().refreshTokenRollup(),
    ).resolves.toBeUndefined();
    expect(analyticsHarness.loadStatusSummary).toHaveBeenCalledTimes(2);
  });
});
