import { db, openDb } from '@/lib/db';
import { getSupabaseClient } from '@/lib/supabase';

const CLOUD_SYNC_RECORDS_TABLE = 'app_sync_records';
const CLOUD_PAGE_SIZE = 500;
const MAX_CLOUD_RECORDS = 50_000;

export const CLOUD_RECOVERY_TABLES = [
  'workspaces',
  'projects',
  'agents',
  'chats',
  'messages',
  'tasks',
  'memory_items',
  'events',
  'quick_link_groups',
  'quick_links',
] as const;

export type CloudRecoveryTable = (typeof CLOUD_RECOVERY_TABLES)[number];

export type CloudRecoveryRecord = Readonly<{
  user_id: string;
  table_name: string;
  row_id: string;
  op: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown> | null;
  updated_at: string;
}>;

type CloudRecoveryCandidate = Readonly<{
  tableName: CloudRecoveryTable;
  rowId: string;
  payload: Record<string, unknown>;
  remoteUpdatedAt: string;
  disposition: 'new' | 'cloud_newer' | 'preserve_local';
}>;

export type CloudRecoveryPreview = Readonly<{
  userId: string;
  createdAt: number;
  totalCloudRecords: number;
  recoverable: number;
  cloudNewer: number;
  preservedLocal: number;
  skippedDeleted: number;
  rejected: number;
  byTable: Readonly<Partial<Record<CloudRecoveryTable, number>>>;
  candidates: readonly CloudRecoveryCandidate[];
}>;

export type CloudRecoveryResult = Readonly<{
  restored: number;
  preservedLocal: number;
  skippedDeleted: number;
}>;

export type CloudRecoveryDependencies = Readonly<{
  currentUserId(): Promise<string | null>;
  listRecords(userId: string): Promise<readonly CloudRecoveryRecord[]>;
  readLocal(tableName: CloudRecoveryTable, rowId: string): Promise<unknown>;
  putMany(
    rows: readonly Readonly<{ tableName: CloudRecoveryTable; payload: Record<string, unknown> }>[],
  ): Promise<void>;
}>;

export class CloudRecoveryAuthorityChangedError extends Error {
  constructor() {
    super('The signed-in account changed. Scan the cloud recovery again.');
    this.name = 'CloudRecoveryAuthorityChangedError';
  }
}

function exactUserId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) return null;
  return value;
}

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecoveryTable(value: string): value is CloudRecoveryTable {
  return (CLOUD_RECOVERY_TABLES as readonly string[]).includes(value);
}

function primaryKey(tableName: CloudRecoveryTable): 'id' {
  void tableName;
  return 'id';
}

function payloadFreshness(payload: Record<string, unknown>, fallback?: string): number | null {
  for (const key of ['updated_at', 'last_active_at', 'created_at', 'timestamp']) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  if (!fallback) return null;
  const parsed = Date.parse(fallback);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyCandidate(
  payload: Record<string, unknown>,
  remoteUpdatedAt: string,
  local: unknown,
): CloudRecoveryCandidate['disposition'] {
  const localRecord = recordObject(local);
  if (!localRecord) return 'new';
  const remoteFreshness = payloadFreshness(payload, remoteUpdatedAt);
  const localFreshness = payloadFreshness(localRecord);
  if (remoteFreshness !== null && localFreshness !== null && remoteFreshness > localFreshness) {
    return 'cloud_newer';
  }
  return 'preserve_local';
}

async function assertCurrentAuthority(
  dependencies: CloudRecoveryDependencies,
  expectedUserId: string,
): Promise<void> {
  const current = exactUserId(await dependencies.currentUserId());
  if (!current || current !== expectedUserId) throw new CloudRecoveryAuthorityChangedError();
}

export function createCloudRecoveryService(dependencies: CloudRecoveryDependencies) {
  return {
    async preview(userId: string): Promise<CloudRecoveryPreview> {
      const exact = exactUserId(userId);
      if (!exact) throw new CloudRecoveryAuthorityChangedError();
      await assertCurrentAuthority(dependencies, exact);
      const records = await dependencies.listRecords(exact);
      await assertCurrentAuthority(dependencies, exact);

      const candidates: CloudRecoveryCandidate[] = [];
      const byTable: Partial<Record<CloudRecoveryTable, number>> = {};
      let skippedDeleted = 0;
      let rejected = 0;

      for (const row of records) {
        if (row.user_id !== exact || !isRecoveryTable(row.table_name)) {
          rejected++;
          continue;
        }
        if (row.op === 'delete') {
          skippedDeleted++;
          continue;
        }
        const payload = recordObject(row.payload);
        if (!payload || payload[primaryKey(row.table_name)] !== row.row_id) {
          rejected++;
          continue;
        }
        const local = await dependencies.readLocal(row.table_name, row.row_id);
        const disposition = classifyCandidate(payload, row.updated_at, local);
        candidates.push({
          tableName: row.table_name,
          rowId: row.row_id,
          payload,
          remoteUpdatedAt: row.updated_at,
          disposition,
        });
        byTable[row.table_name] = (byTable[row.table_name] ?? 0) + 1;
      }

      return {
        userId: exact,
        createdAt: Date.now(),
        totalCloudRecords: records.length,
        recoverable: candidates.filter((candidate) => candidate.disposition === 'new').length,
        cloudNewer: candidates.filter((candidate) => candidate.disposition === 'cloud_newer')
          .length,
        preservedLocal: candidates.filter((candidate) => candidate.disposition === 'preserve_local')
          .length,
        skippedDeleted,
        rejected,
        byTable,
        candidates,
      };
    },

    async restore(preview: CloudRecoveryPreview): Promise<CloudRecoveryResult> {
      await assertCurrentAuthority(dependencies, preview.userId);
      const rows: Array<{
        tableName: CloudRecoveryTable;
        payload: Record<string, unknown>;
      }> = [];
      let preservedLocal = 0;

      for (const candidate of preview.candidates) {
        const local = await dependencies.readLocal(candidate.tableName, candidate.rowId);
        const disposition = classifyCandidate(candidate.payload, candidate.remoteUpdatedAt, local);
        if (disposition === 'new' || disposition === 'cloud_newer') {
          rows.push({ tableName: candidate.tableName, payload: candidate.payload });
        } else {
          preservedLocal++;
        }
      }

      await assertCurrentAuthority(dependencies, preview.userId);
      if (rows.length > 0) await dependencies.putMany(rows);
      return { restored: rows.length, preservedLocal, skippedDeleted: preview.skippedDeleted };
    },
  };
}

async function productionUserId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return exactUserId(data.session?.user?.id);
}

async function listProductionRecords(userId: string): Promise<CloudRecoveryRecord[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud recovery is not configured in this build.');
  const records: CloudRecoveryRecord[] = [];
  for (let from = 0; from < MAX_CLOUD_RECORDS; from += CLOUD_PAGE_SIZE) {
    const { data, error } = await client
      .from(CLOUD_SYNC_RECORDS_TABLE)
      .select('user_id,table_name,row_id,op,payload,updated_at')
      .eq('user_id', userId)
      .in('table_name', [...CLOUD_RECOVERY_TABLES])
      .order('table_name', { ascending: true })
      .order('row_id', { ascending: true })
      .range(from, from + CLOUD_PAGE_SIZE - 1);
    if (error) throw new Error(error.message || 'Could not read cloud recovery data.');
    const page = (data ?? []) as CloudRecoveryRecord[];
    records.push(...page);
    if (page.length < CLOUD_PAGE_SIZE) return records;
  }
  throw new Error('Cloud recovery is too large to preview safely in one pass.');
}

const productionCloudRecovery = createCloudRecoveryService({
  currentUserId: productionUserId,
  listRecords: listProductionRecords,
  async readLocal(tableName, rowId) {
    await openDb();
    return db.table(tableName).get(rowId);
  },
  async putMany(rows) {
    await openDb();
    const tables = [...new Set(rows.map((row) => row.tableName))].map((name) => db.table(name));
    await db.transaction('rw', tables, async () => {
      for (const tableName of CLOUD_RECOVERY_TABLES) {
        const payloads = rows
          .filter((row) => row.tableName === tableName)
          .map((row) => row.payload);
        if (payloads.length > 0) await db.table(tableName).bulkPut(payloads);
      }
    });
  },
});

export function previewCloudRecovery(userId: string): Promise<CloudRecoveryPreview> {
  return productionCloudRecovery.preview(userId);
}

export function restoreCloudRecovery(preview: CloudRecoveryPreview): Promise<CloudRecoveryResult> {
  return productionCloudRecovery.restore(preview);
}
