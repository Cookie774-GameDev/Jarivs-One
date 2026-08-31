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
    getState: () => ({ runs: [], activeRunId: null }),
  },
}));

import {
  projectStatusUsage,
  shouldCountBackgroundTime,
  useWorkspaceAnalyticsStore,
} from './workspaceAnalytics';

describe('workspace analytics background rollup', () => {
  beforeEach(() => {
    analyticsHarness.loadStatusSummary.mockReset();
    useWorkspaceAnalyticsStore.setState({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      actualTotalCostUsd: 0,
      estimatedTotalCostUsd: 0,
      recordedTotalCostUsd: 0,
      foregroundActiveMs: 12_345,
      backgroundRunningMs: 0,
    });
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

  it('projects complete token and cost receipts without relabeling mixed cost as estimated', () => {
    expect(
      projectStatusUsage({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 25,
        cachedTokens: 10,
        totalTokens: 185,
        actualCostUsd: 0.2,
        estimatedCostUsd: 0.03,
        costUsd: 0.23,
        models: [],
      }),
    ).toMatchObject({
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalReasoningTokens: 25,
      totalCachedTokens: 10,
      totalTokens: 185,
      actualTotalCostUsd: 0.2,
      estimatedTotalCostUsd: 0.03,
      recordedTotalCostUsd: 0.23,
    });
  });

  it('preserves foreground clock evidence when usage rollups refresh', async () => {
    analyticsHarness.loadStatusSummary.mockResolvedValueOnce({
      activeTimeMs: 999_999,
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 3,
      cachedTokens: 4,
      totalTokens: 10,
      actualCostUsd: 0,
      estimatedCostUsd: 0,
      costUsd: 0,
      models: [],
    });

    await useWorkspaceAnalyticsStore.getState().refreshTokenRollup();

    expect(useWorkspaceAnalyticsStore.getState().foregroundActiveMs).toBe(12_345);
  });

  it('counts hidden time only with real background execution evidence', () => {
    expect(shouldCountBackgroundTime({}, null)).toBe(false);
    expect(shouldCountBackgroundTime({ agent: 'done' }, null)).toBe(false);
    expect(shouldCountBackgroundTime({ agent: 'streaming' }, null)).toBe(true);
    expect(shouldCountBackgroundTime({}, 'tool-run-1')).toBe(true);
  });
});
