import { nanoid } from 'nanoid';
import Dexie from 'dexie';
import { db, openDb, type JarvisDexie } from '@/lib/db';
import type {
  StatusActivityEventRow,
  StatusActivityRollupRow,
  StatusCostType,
  StatusRollupDimension,
} from './schema';

export const STATUS_DETAIL_RETENTION_MS = 31 * 24 * 60 * 60 * 1_000;
export const STATUS_HOURLY_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
export const STATUS_DAILY_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1_000;

export type StatusActivityInput = Omit<StatusActivityEventRow, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: number;
};

const SAFE_ID = /^[a-z0-9][a-z0-9._:/@+ -]{0,159}$/i;
const MAX_COUNTER = 1_000_000_000_000;

function safeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SAFE_ID.test(trimmed) ? trimmed : undefined;
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(value, MAX_COUNTER);
}

function safeCostType(value: unknown): StatusCostType | undefined {
  return value === 'actual' ||
    value === 'estimated' ||
    value === 'subscription' ||
    value === 'local' ||
    value === 'unknown'
    ? value
    : undefined;
}

export function normalizeStatusActivity(input: StatusActivityInput): StatusActivityEventRow | null {
  const accountId = safeId(input.accountId);
  const action = safeId(input.action);
  const category = input.category;
  if (
    !accountId ||
    !action ||
    !['surface', 'ai', 'chat', 'terminal', 'file', 'agent', 'context', 'optimizer'].includes(
      category,
    )
  ) {
    return null;
  }
  const timestamp = input.timestamp ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) return null;

  const row: StatusActivityEventRow = {
    id: safeId(input.id) ?? `status_${nanoid(16)}`,
    accountId,
    timestamp,
    category,
    action,
  };
  const strings = ['surface', 'projectId', 'chatId', 'providerId', 'modelId', 'agentId'] as const;
  for (const key of strings) {
    const value = safeId(input[key]);
    if (value) row[key] = value;
  }
  const numbers = [
    'durationMs',
    'inputTokens',
    'outputTokens',
    'reasoningTokens',
    'cachedTokens',
    'tokensSaved',
    'costUsd',
    'latencyMs',
    'linesAdded',
    'linesRemoved',
    'generatedLines',
    'characters',
    'count',
  ] as const;
  for (const key of numbers) {
    const value = safeNumber(input[key]);
    if (value !== undefined) row[key] = value;
  }
  const costType = safeCostType(input.costType);
  if (costType) row.costType = costType;
  if (
    input.outcome === 'completed' ||
    input.outcome === 'failed' ||
    input.outcome === 'cancelled' ||
    input.outcome === 'unknown'
  ) {
    row.outcome = input.outcome;
  }
  return row;
}

function bucketStart(timestamp: number, kind: 'hour' | 'day'): number {
  const date = new Date(timestamp);
  if (kind === 'hour') date.setMinutes(0, 0, 0);
  else date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dimensions(row: StatusActivityEventRow): Array<[StatusRollupDimension, string]> {
  const values: Array<[StatusRollupDimension, string]> = [
    ['all', 'all'],
    ['category', row.category],
    ['action', row.action],
  ];
  if (row.surface) values.push(['surface', row.surface]);
  if (row.providerId) values.push(['provider', row.providerId]);
  if (row.modelId) values.push(['model', `${row.providerId ?? 'unknown'}::${row.modelId}`]);
  if (row.projectId) values.push(['project', row.projectId]);
  if (row.agentId) values.push(['agent', row.agentId]);
  return values;
}

function emptyRollup(
  row: StatusActivityEventRow,
  kind: 'hour' | 'day',
  dimension: StatusRollupDimension,
  dimensionId: string,
): StatusActivityRollupRow {
  const start = bucketStart(row.timestamp, kind);
  return {
    id: `${row.accountId}:${kind}:${start}:${dimension}:${dimensionId}`,
    accountId: row.accountId,
    bucketKind: kind,
    bucketStart: start,
    dimension,
    dimensionId,
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
    updatedAt: row.timestamp,
  };
}

function mergeEvent(
  current: StatusActivityRollupRow,
  row: StatusActivityEventRow,
): StatusActivityRollupRow {
  const cost = row.costUsd ?? 0;
  const hasRequest = row.category === 'ai' || row.action === 'ai_response_finished';
  return {
    ...current,
    durationMs: current.durationMs + (row.durationMs ?? 0),
    inputTokens: current.inputTokens + (row.inputTokens ?? 0),
    outputTokens: current.outputTokens + (row.outputTokens ?? 0),
    reasoningTokens: current.reasoningTokens + (row.reasoningTokens ?? 0),
    cachedTokens: current.cachedTokens + (row.cachedTokens ?? 0),
    tokensSaved: current.tokensSaved + (row.tokensSaved ?? 0),
    costUsd: current.costUsd + cost,
    actualCostUsd: current.actualCostUsd + (row.costType === 'actual' ? cost : 0),
    estimatedCostUsd: current.estimatedCostUsd + (row.costType === 'estimated' ? cost : 0),
    requests: current.requests + (hasRequest ? 1 : 0),
    completed: current.completed + (row.outcome === 'completed' ? 1 : 0),
    failed: current.failed + (row.outcome === 'failed' ? 1 : 0),
    cancelled: current.cancelled + (row.outcome === 'cancelled' ? 1 : 0),
    linesAdded: current.linesAdded + (row.linesAdded ?? 0),
    linesRemoved: current.linesRemoved + (row.linesRemoved ?? 0),
    generatedLines: current.generatedLines + (row.generatedLines ?? 0),
    characters: current.characters + (row.characters ?? 0),
    count: current.count + (row.count ?? 1),
    latencyTotalMs: current.latencyTotalMs + (row.latencyMs ?? 0),
    latencySamples: current.latencySamples + (row.latencyMs === undefined ? 0 : 1),
    updatedAt: Math.max(current.updatedAt, row.timestamp),
  };
}

let writesSincePrune = 0;

export async function recordStatusActivity(
  input: StatusActivityInput,
  database: JarvisDexie = db,
): Promise<StatusActivityEventRow | null> {
  const row = normalizeStatusActivity(input);
  if (!row) return null;
  if (database === db) await openDb();
  await database.transaction(
    'rw',
    database.status_activity_events,
    database.status_activity_rollups,
    async () => {
      await database.status_activity_events.add(row);
      for (const kind of ['hour', 'day'] as const) {
        for (const [dimension, dimensionId] of dimensions(row)) {
          const seed = emptyRollup(row, kind, dimension, dimensionId);
          const current = (await database.status_activity_rollups.get(seed.id)) ?? seed;
          await database.status_activity_rollups.put(mergeEvent(current, row));
        }
      }
    },
  );

  writesSincePrune += 1;
  if (writesSincePrune >= 128) {
    writesSincePrune = 0;
    void pruneStatusAnalytics(row.accountId, Date.now(), database);
  }
  return row;
}

export async function readStatusRollups(
  accountId: string,
  kind: 'hour' | 'day',
  since: number,
  database: JarvisDexie = db,
): Promise<StatusActivityRollupRow[]> {
  if (database === db) await openDb();
  const firstBucket = bucketStart(since, kind);
  return database.status_activity_rollups
    .where('[accountId+bucketKind+bucketStart]')
    .between([accountId, kind, firstBucket], [accountId, kind, Dexie.maxKey])
    .toArray();
}

export async function clearStatusAnalytics(
  accountId: string,
  database: JarvisDexie = db,
): Promise<void> {
  if (database === db) await openDb();
  await database.transaction(
    'rw',
    database.status_activity_events,
    database.status_activity_rollups,
    async () => {
      await database.status_activity_events.where('accountId').equals(accountId).delete();
      await database.status_activity_rollups.where('accountId').equals(accountId).delete();
    },
  );
}

export async function pruneStatusAnalytics(
  accountId: string,
  now = Date.now(),
  database: JarvisDexie = db,
): Promise<void> {
  if (database === db) await openDb();
  await database.transaction(
    'rw',
    database.status_activity_events,
    database.status_activity_rollups,
    async () => {
      const oldEvents = await database.status_activity_events
        .where('[accountId+timestamp]')
        .between(
          [accountId, Dexie.minKey],
          [accountId, now - STATUS_DETAIL_RETENTION_MS],
          true,
          false,
        )
        .primaryKeys();
      await database.status_activity_events.bulkDelete(oldEvents);

      const hourly = await database.status_activity_rollups
        .where('[accountId+bucketKind+bucketStart]')
        .between(
          [accountId, 'hour', Dexie.minKey],
          [accountId, 'hour', now - STATUS_HOURLY_RETENTION_MS],
          true,
          false,
        )
        .primaryKeys();
      const daily = await database.status_activity_rollups
        .where('[accountId+bucketKind+bucketStart]')
        .between(
          [accountId, 'day', Dexie.minKey],
          [accountId, 'day', now - STATUS_DAILY_RETENTION_MS],
          true,
          false,
        )
        .primaryKeys();
      await database.status_activity_rollups.bulkDelete([...hourly, ...daily]);
    },
  );
}
