import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getActiveAccountIdentity } from '@/lib/accountIdentity';
import {
  createActiveStatusClock,
  loadStatusSummary,
  startStatusAnalyticsRuntime,
  STATUS_ANALYTICS_CHANGED_EVENT,
} from '@/features/account/statusAnalytics';
import { useMilestonesStore } from './milestonesStore';
import { useToolRunsStore } from './toolRunsStore';

export type ModelUsageRow = {
  providerName: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type WorkspaceUsageAnalytics = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedTotalCostUsd: number;
  byModel: ModelUsageRow[];
  foregroundActiveMs: number;
  backgroundRunningMs: number;
  completedMilestones: number;
  toolRunCount: number;
  lastForegroundAt: number | null;
  sessionStartedAt: number;
};

interface AnalyticsState extends WorkspaceUsageAnalytics {
  tickForeground: () => void;
  tickBackground: () => void;
  refreshTokenRollup: () => Promise<void>;
  snapshot: () => WorkspaceUsageAnalytics;
}

const defaults: WorkspaceUsageAnalytics = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  estimatedTotalCostUsd: 0,
  byModel: [],
  foregroundActiveMs: 0,
  backgroundRunningMs: 0,
  completedMilestones: 0,
  toolRunCount: 0,
  lastForegroundAt: null,
  sessionStartedAt: Date.now(),
};

let lastTickAt = Date.now();
let ticking = false;
let rollupInFlight: Promise<void> | null = null;

async function loadLocalStatusRollup() {
  const identity = getActiveAccountIdentity();
  return identity ? loadStatusSummary(identity.accountId, '30d') : null;
}

export const useWorkspaceAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      ...defaults,
      tickForeground: () => {
        const now = Date.now();
        const delta = now - lastTickAt;
        lastTickAt = now;
        if (delta <= 0 || delta > 60_000) return;
        set((s) => ({
          foregroundActiveMs: s.foregroundActiveMs + delta,
          lastForegroundAt: now,
        }));
      },
      tickBackground: () => {
        const now = Date.now();
        const delta = now - lastTickAt;
        lastTickAt = now;
        if (delta <= 0 || delta > 60_000) return;
        set((s) => ({ backgroundRunningMs: s.backgroundRunningMs + delta }));
      },
      refreshTokenRollup: () => {
        if (rollupInFlight) return rollupInFlight;
        const run = (async () => {
          const summary = await loadLocalStatusRollup();
          const byModel: ModelUsageRow[] = (summary?.models ?? []).map((model) => {
            const separator = model.id.indexOf('::');
            return {
              providerName: separator >= 0 ? model.id.slice(0, separator) : 'unknown',
              modelName: model.label,
              inputTokens: model.inputTokens,
              outputTokens: model.outputTokens,
              totalTokens: model.totalTokens,
              estimatedCostUsd: model.costUsd,
            };
          });
          const totalInputTokens = byModel.reduce((n, r) => n + r.inputTokens, 0);
          const totalOutputTokens = byModel.reduce((n, r) => n + r.outputTokens, 0);
          const estimatedTotalCostUsd = byModel.reduce((n, r) => n + r.estimatedCostUsd, 0);
          set({
            byModel,
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            estimatedTotalCostUsd,
            foregroundActiveMs: summary?.activeTimeMs ?? 0,
            completedMilestones: useMilestonesStore
              .getState()
              .items.filter((i) => i.status === 'done').length,
            toolRunCount: useToolRunsStore.getState().runs.length,
          });
        })();
        const tracked = run.finally(() => {
          if (rollupInFlight === tracked) rollupInFlight = null;
        });
        rollupInFlight = tracked;
        return tracked;
      },
      snapshot: () => {
        const s = get();
        return {
          totalInputTokens: s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
          totalTokens: s.totalTokens,
          estimatedTotalCostUsd: s.estimatedTotalCostUsd,
          byModel: s.byModel,
          foregroundActiveMs: s.foregroundActiveMs,
          backgroundRunningMs: s.backgroundRunningMs,
          completedMilestones: s.completedMilestones,
          toolRunCount: s.toolRunCount,
          lastForegroundAt: s.lastForegroundAt,
          sessionStartedAt: s.sessionStartedAt,
        };
      },
    }),
    {
      name: 'jarvis-workspace-analytics-v1',
      partialize: (s) => ({
        foregroundActiveMs: s.foregroundActiveMs,
        backgroundRunningMs: s.backgroundRunningMs,
        sessionStartedAt: s.sessionStartedAt,
        lastForegroundAt: s.lastForegroundAt,
      }),
    },
  ),
);

/** Mount once at app root — tracks foreground vs background time. */
export function startWorkspaceAnalyticsClock(): () => void {
  if (ticking || typeof window === 'undefined') return () => {};
  ticking = true;
  lastTickAt = Date.now();
  let stopStatusRuntime: () => void = () => undefined;
  const stopActiveClock = createActiveStatusClock();
  void startStatusAnalyticsRuntime().then((stop) => {
    stopStatusRuntime = stop;
  });

  const onVisible = () => {
    lastTickAt = Date.now();
    if (document.visibilityState === 'visible') {
      useWorkspaceAnalyticsStore.getState().tickForeground();
    }
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      useWorkspaceAnalyticsStore.getState().tickForeground();
    } else {
      useWorkspaceAnalyticsStore.getState().tickBackground();
    }
    void useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
  }, 60_000);

  const onStatusChanged = () => {
    void useWorkspaceAnalyticsStore.getState().refreshTokenRollup();
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const onBlur = () => {
    useWorkspaceAnalyticsStore.getState().tickBackground();
    lastTickAt = Date.now();
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener(STATUS_ANALYTICS_CHANGED_EVENT, onStatusChanged);

  void useWorkspaceAnalyticsStore.getState().refreshTokenRollup();

  return () => {
    ticking = false;
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener(STATUS_ANALYTICS_CHANGED_EVENT, onStatusChanged);
    stopActiveClock();
    stopStatusRuntime();
  };
}

export function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}
