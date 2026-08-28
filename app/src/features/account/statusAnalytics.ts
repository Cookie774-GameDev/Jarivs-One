import type { JarvisDexie } from '@/lib/db';
import { db, openDb } from '@/lib/db';
import { getActiveAccountIdentity } from '@/lib/accountIdentity';
import { useAuthStore } from '@/stores/auth';
import type { Message } from '@/types/chat';
import type { JarvisRunRow } from '@/lib/db/schema';
import {
  clearStatusAnalytics,
  readStatusRollups,
  recordStatusActivity,
  type StatusActivityInput,
} from '@/lib/db/statusAnalyticsRepository';
import type { StatusActivityRollupRow } from '@/lib/db/schema';

export type StatusPeriod = '24h' | '7d' | '30d';

export type StatusBreakdownRow = {
  id: string;
  label: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  requests: number;
  completed: number;
  failed: number;
  count: number;
  percent: number;
};

export type StatusTimelinePoint = {
  timestamp: number;
  activeMs: number;
  tokens: number;
};

export type StatusSummary = {
  period: StatusPeriod;
  activeTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  tokensSaved: number;
  costUsd: number;
  actualCostUsd: number;
  estimatedCostUsd: number;
  requests: number;
  completed: number;
  failed: number;
  cancelled: number;
  linesAdded: number;
  linesRemoved: number;
  aiGeneratedLines: number;
  charactersTyped: number;
  messagesWritten: number;
  averageLatencyMs: number | null;
  surfaces: StatusBreakdownRow[];
  providers: StatusBreakdownRow[];
  models: StatusBreakdownRow[];
  projects: StatusBreakdownRow[];
  agents: StatusBreakdownRow[];
  timeline: StatusTimelinePoint[];
  insights: string[];
};

export const STATUS_ANALYTICS_CHANGED_EVENT = 'vibespace:status-analytics:changed';
const AI_USAGE_EVENT = 'jarvis:ai-connection-usage:changed';
const PERIOD_MS: Record<StatusPeriod, number> = {
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
};

function totalTokens(row: StatusActivityRollupRow): number {
  return row.inputTokens + row.outputTokens + row.reasoningTokens + row.cachedTokens;
}

function sum(rows: readonly StatusActivityRollupRow[]): StatusActivityRollupRow {
  return rows.reduce<StatusActivityRollupRow>(
    (total, row) => ({
      ...total,
      durationMs: total.durationMs + row.durationMs,
      inputTokens: total.inputTokens + row.inputTokens,
      outputTokens: total.outputTokens + row.outputTokens,
      reasoningTokens: total.reasoningTokens + row.reasoningTokens,
      cachedTokens: total.cachedTokens + row.cachedTokens,
      tokensSaved: total.tokensSaved + row.tokensSaved,
      costUsd: total.costUsd + row.costUsd,
      actualCostUsd: total.actualCostUsd + row.actualCostUsd,
      estimatedCostUsd: total.estimatedCostUsd + row.estimatedCostUsd,
      requests: total.requests + row.requests,
      completed: total.completed + row.completed,
      failed: total.failed + row.failed,
      cancelled: total.cancelled + row.cancelled,
      linesAdded: total.linesAdded + row.linesAdded,
      linesRemoved: total.linesRemoved + row.linesRemoved,
      generatedLines: total.generatedLines + row.generatedLines,
      characters: total.characters + row.characters,
      count: total.count + row.count,
      latencyTotalMs: total.latencyTotalMs + row.latencyTotalMs,
      latencySamples: total.latencySamples + row.latencySamples,
      updatedAt: Math.max(total.updatedAt, row.updatedAt),
    }),
    {
      id: 'summary',
      accountId: '',
      bucketKind: 'hour',
      bucketStart: 0,
      dimension: 'all',
      dimensionId: 'all',
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      tokensSaved: 0,
      costUsd: 0,
      actualCostUsd: 0,
      estimatedCostUsd: 0,
      requests: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      linesAdded: 0,
      linesRemoved: 0,
      generatedLines: 0,
      characters: 0,
      count: 0,
      latencyTotalMs: 0,
      latencySamples: 0,
      updatedAt: 0,
    },
  );
}

function labelForDimension(dimension: string, id: string): string {
  if (dimension === 'model') return id.includes('::') ? id.slice(id.indexOf('::') + 2) : id;
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function breakdown(
  rows: readonly StatusActivityRollupRow[],
  dimension: StatusActivityRollupRow['dimension'],
  denominator: number,
): StatusBreakdownRow[] {
  const grouped = new Map<string, StatusActivityRollupRow[]>();
  for (const row of rows) {
    if (row.dimension !== dimension) continue;
    const group = grouped.get(row.dimensionId) ?? [];
    group.push(row);
    grouped.set(row.dimensionId, group);
  }
  return [...grouped.entries()]
    .map(([id, values]) => {
      const aggregate = sum(values);
      const weight = dimension === 'surface' ? aggregate.durationMs : totalTokens(aggregate);
      return {
        id,
        label: labelForDimension(dimension, id),
        durationMs: aggregate.durationMs,
        inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens,
        totalTokens: totalTokens(aggregate),
        costUsd: aggregate.costUsd,
        requests: aggregate.requests,
        completed: aggregate.completed,
        failed: aggregate.failed,
        count: aggregate.count,
        percent: denominator > 0 ? Math.round((weight / denominator) * 1_000) / 10 : 0,
      };
    })
    .sort((left, right) =>
      dimension === 'surface'
        ? right.durationMs - left.durationMs
        : right.totalTokens - left.totalTokens || right.count - left.count,
    );
}

function buildInsights(summary: Omit<StatusSummary, 'insights'>): string[] {
  const insights: string[] = [];
  if (summary.surfaces[0]) {
    insights.push(`Most active surface: ${summary.surfaces[0].label}.`);
  }
  if (summary.models[0]) {
    insights.push(`Most-used model: ${summary.models[0].label}.`);
  } else if (summary.providers[0]) {
    insights.push(`Most-used provider: ${summary.providers[0].label}.`);
  }
  if (summary.tokensSaved > 0) {
    insights.push(`${summary.tokensSaved.toLocaleString()} tokens saved by optimization.`);
  }
  if (summary.completed > 0) {
    insights.push(`${summary.completed.toLocaleString()} completed runs in this period.`);
  }
  return insights.slice(0, 4);
}

export async function loadStatusSummary(
  accountId: string,
  period: StatusPeriod,
  now = Date.now(),
  database: JarvisDexie = db,
): Promise<StatusSummary> {
  const kind = period === '24h' ? 'hour' : 'day';
  const rows = await readStatusRollups(accountId, kind, now - PERIOD_MS[period], database);
  const allRows = rows.filter((row) => row.dimension === 'all');
  const total = sum(allRows);
  const tokenTotal = totalTokens(total);
  const messages = rows
    .filter((row) => row.dimension === 'action' && row.dimensionId === 'message_sent')
    .reduce((count, row) => count + row.count, 0);
  const base: Omit<StatusSummary, 'insights'> = {
    period,
    activeTimeMs: total.durationMs,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    reasoningTokens: total.reasoningTokens,
    cachedTokens: total.cachedTokens,
    totalTokens: tokenTotal,
    tokensSaved: total.tokensSaved,
    costUsd: total.costUsd,
    actualCostUsd: total.actualCostUsd,
    estimatedCostUsd: total.estimatedCostUsd,
    requests: total.requests,
    completed: total.completed,
    failed: total.failed,
    cancelled: total.cancelled,
    linesAdded: total.linesAdded,
    linesRemoved: total.linesRemoved,
    aiGeneratedLines: total.generatedLines,
    charactersTyped: total.characters,
    messagesWritten: messages,
    averageLatencyMs:
      total.latencySamples > 0 ? Math.round(total.latencyTotalMs / total.latencySamples) : null,
    surfaces: breakdown(rows, 'surface', total.durationMs),
    providers: breakdown(rows, 'provider', tokenTotal),
    models: breakdown(rows, 'model', tokenTotal),
    projects: breakdown(rows, 'project', tokenTotal),
    agents: breakdown(rows, 'agent', tokenTotal),
    timeline: allRows
      .map((row) => ({
        timestamp: row.bucketStart,
        activeMs: row.durationMs,
        tokens: totalTokens(row),
      }))
      .sort((left, right) => left.timestamp - right.timestamp),
  };
  return { ...base, insights: buildInsights(base) };
}

export async function recordForActiveAccount(
  input: Omit<StatusActivityInput, 'accountId' | 'projectId'> & { projectId?: string },
): Promise<void> {
  const identity = getActiveAccountIdentity();
  if (!identity) return;
  const projectId = input.projectId ?? useAuthStore.getState().projectId ?? undefined;
  const recorded = await recordStatusActivity({
    ...input,
    accountId: identity.accountId,
    projectId,
  });
  if (recorded && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STATUS_ANALYTICS_CHANGED_EVENT));
  }
}

export async function clearActiveAccountStatus(): Promise<void> {
  const identity = getActiveAccountIdentity();
  if (!identity) return;
  await clearStatusAnalytics(identity.accountId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STATUS_ANALYTICS_CHANGED_EVENT));
  }
}

type UsageEventDetail = {
  providerId?: unknown;
  modelId?: unknown;
  inputTokens?: unknown;
  cachedInputTokens?: unknown;
  outputTokens?: unknown;
  costUsd?: unknown;
  costType?: unknown;
  timestamp?: unknown;
};

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function onAiUsage(event: Event): void {
  const detail = (event as CustomEvent<UsageEventDetail>).detail;
  if (!detail || typeof detail.providerId !== 'string' || typeof detail.modelId !== 'string')
    return;
  const providerId = detail.providerId.trim();
  const modelId = detail.modelId.trim();
  if (!providerId || !modelId) return;
  void recordForActiveAccount({
    category: 'ai',
    action: 'ai_response_finished',
    providerId,
    modelId,
    inputTokens: finiteNonNegative(detail.inputTokens),
    cachedTokens: finiteNonNegative(detail.cachedInputTokens),
    outputTokens: finiteNonNegative(detail.outputTokens),
    costUsd: finiteNonNegative(detail.costUsd),
    costType:
      detail.costType === 'actual' ||
      detail.costType === 'estimated' ||
      detail.costType === 'subscription' ||
      detail.costType === 'local'
        ? detail.costType
        : 'unknown',
    timestamp: finiteNonNegative(detail.timestamp),
    outcome: 'completed',
  });
}

function codeBlockLines(content: string): number {
  const blocks = content.match(/```[\s\S]*?```/g) ?? [];
  return blocks.reduce((count, block) => count + Math.max(0, block.split('\n').length - 2), 0);
}

function persistedMessageText(message: Message): string {
  return message.parts
    .filter(
      (part): part is Extract<Message['parts'][number], { kind: 'text' }> => part.kind === 'text',
    )
    .map((part) => part.text)
    .join('\n');
}

let runtimeStarted = false;

/**
 * Hooks existing lifecycle writes. Only aggregate lengths/counts are copied;
 * content is inspected transiently and never persisted in analytics.
 */
export async function startStatusAnalyticsRuntime(): Promise<() => void> {
  if (runtimeStarted || typeof window === 'undefined') return () => undefined;
  runtimeStarted = true;
  await openDb();
  window.addEventListener(AI_USAGE_EVENT, onAiUsage);

  const onMessageCreated = (_key: unknown, message: Message) => {
    const text = persistedMessageText(message);
    if (message.role === 'user') {
      void recordForActiveAccount({
        category: 'chat',
        action: 'message_sent',
        chatId: message.chat_id,
        characters: text.length,
        count: 1,
      });
    } else if (message.role === 'assistant') {
      void recordForActiveAccount({
        category: 'chat',
        action: 'assistant_response_saved',
        chatId: message.chat_id,
        generatedLines: codeBlockLines(text),
        count: 1,
        outcome: 'completed',
      });
    }
  };
  const onTerminalCreated = () => {
    void recordForActiveAccount({ category: 'terminal', action: 'session_opened', count: 1 });
  };
  const onRunCreated = (_key: unknown, run: JarvisRunRow) => {
    void recordForActiveAccount({
      category: 'agent',
      action: 'run_started',
      chatId: run.chat_id,
      count: 1,
    });
  };
  db.messages.hook('creating', onMessageCreated);
  db.terminal_sessions.hook('creating', onTerminalCreated);
  db.jarvis_runs.hook('creating', onRunCreated);

  return () => {
    runtimeStarted = false;
    window.removeEventListener(AI_USAGE_EVENT, onAiUsage);
    db.messages.hook('creating').unsubscribe(onMessageCreated);
    db.terminal_sessions.hook('creating').unsubscribe(onTerminalCreated);
    db.jarvis_runs.hook('creating').unsubscribe(onRunCreated);
  };
}

export function currentStatusSurface(): string {
  if (typeof window === 'undefined') return 'other';
  const route = new URLSearchParams(window.location.search).get('route')?.trim().toLowerCase();
  const path = window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  const value = route || path || 'chat';
  if (value.includes('terminal')) return 'terminals';
  if (value.includes('workbench')) return 'workbench';
  if (value.includes('canvas')) return 'canvas';
  if (value.includes('context')) return 'context map';
  if (value.includes('agent')) return 'agents';
  if (value.includes('kanban')) return 'kanban';
  if (value.includes('schedule')) return 'schedule';
  if (value.includes('file')) return 'files';
  if (value.includes('tool')) return 'tools';
  if (value.includes('benchmark')) return 'benchmarks';
  if (value.includes('setting') || value.includes('account')) return 'settings / account';
  if (value.includes('foundry')) return 'model foundry';
  return 'chat';
}

export function createActiveStatusClock(options?: {
  now?: () => number;
  idleAfterMs?: number;
  flushEveryMs?: number;
}): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const now = options?.now ?? Date.now;
  const idleAfterMs = options?.idleAfterMs ?? 60_000;
  const flushEveryMs = options?.flushEveryMs ?? 60_000;
  let lastInteraction = now();
  let lastTick = lastInteraction;
  let accumulatedMs = 0;
  let accumulatedSurface = currentStatusSurface();

  const markActive = () => {
    lastInteraction = now();
  };
  const flush = () => {
    if (accumulatedMs <= 0) return;
    const durationMs = accumulatedMs;
    const surface = accumulatedSurface;
    accumulatedMs = 0;
    void recordForActiveAccount({
      category: 'surface',
      action: 'surface_session_finished',
      surface,
      durationMs,
      count: 1,
    });
  };
  const tick = () => {
    const current = now();
    const delta = Math.max(0, Math.min(15_000, current - lastTick));
    lastTick = current;
    const surface = currentStatusSurface();
    if (surface !== accumulatedSurface) {
      flush();
      accumulatedSurface = surface;
    }
    if (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      current - lastInteraction <= idleAfterMs
    ) {
      accumulatedMs += delta;
    }
  };

  for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(eventName, markActive, { passive: true });
  }
  const tickTimer = window.setInterval(tick, 15_000);
  const flushTimer = window.setInterval(flush, flushEveryMs);
  const onVisibility = () => {
    tick();
    if (document.visibilityState !== 'visible') flush();
    else markActive();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', flush);

  return () => {
    tick();
    flush();
    window.clearInterval(tickTimer);
    window.clearInterval(flushTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', flush);
    for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
      window.removeEventListener(eventName, markActive);
    }
  };
}
