import type { SiyuanSafeIndexEntry } from './siyuanSafeIndex';
import { canonicalSiyuanAuthorityRoot } from './siyuanPathAuthority';

const DATABASE_NAME = 'vibespace-siyuan-index-jobs';
const DATABASE_VERSION = 3;
const JOB_STORE = 'jobs';
const ENTRY_STORE = 'entries';
const FRONTIER_STORE = 'frontier';
const SUMMARY_USAGE_STORE = 'summary_usage';
const ARCHIVE_STORE = 'archives';
const SCOPE_INDEX = 'scope';

export type SiyuanIndexJobStatus = 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';

export type SiyuanIndexJobPhase =
  | 'discovering'
  | 'creating_nodes'
  | 'summarizing'
  | 'reconciling'
  | 'completed';

export interface SiyuanIndexDirectory {
  path: string;
  relativePath: string;
  parentNodeId: string | null;
}

export interface SiyuanIndexJobRecord {
  schemaVersion: 1;
  scope: string;
  accountId: string | null;
  projectId: string;
  mapId: string;
  canonicalRoot: string;
  policyFingerprint: string;
  phase: SiyuanIndexJobPhase;
  status: SiyuanIndexJobStatus;
  pauseReason: 'user' | 'local_model_unavailable' | 'cloud_approval_required' | null;
  cursor: number;
  frontierLength: number;
  indexed: number;
  excluded: number;
  unreadable: number;
  summarized: number;
  summaryEligible: number;
  createdNodes: number;
  failed: number;
  skipped: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenProvenance: 'reported' | 'estimated' | 'none';
  summaryProviderId: string | null;
  summaryConnectionId: string | null;
  summaryModelId: string | null;
  phaseStartedAt: number;
  rateSamples: Array<{ at: number; processed: number }>;
  discoverySamples: Array<{
    at: number;
    processed: number;
    frontierRemaining: number;
    discovered: number;
  }>;
  estimatedPercent: number | null;
  estimatedEtaSeconds: number | null;
  reconciledAt: number | null;
  startupDisposition: 'auto_resumed' | 'needs_repair' | null;
  startupDispositionAt: number | null;
  pausedMs: number;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface StoredEntry extends SiyuanSafeIndexEntry {
  key: string;
  scope: string;
}

interface StoredDirectory extends SiyuanIndexDirectory {
  key: string;
  scope: string;
  position: number;
}

export interface SiyuanIndexCheckpoint {
  job: SiyuanIndexJobRecord;
  appendedEntries?: readonly SiyuanSafeIndexEntry[];
  appendedDirectories?: readonly SiyuanIndexDirectory[];
  summaryUsage?: SiyuanSummaryUsageBatch;
}

export interface SiyuanSummaryUsageBatch {
  nodeId: string;
  sourceModifiedAt: number | null;
  sourceSizeBytes: number | null;
  providerId: string;
  connectionId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provenance: 'reported' | 'estimated';
  completedAt: number;
}

export interface SiyuanIndexJobArchive {
  scope: string;
  archivedAt: number;
  job: SiyuanIndexJobRecord;
  entries: SiyuanSafeIndexEntry[];
  frontier: SiyuanIndexDirectory[];
  summaryUsage: SiyuanSummaryUsageBatch[];
}

interface StoredSummaryUsage extends SiyuanSummaryUsageBatch {
  key: string;
  scope: string;
}

function normalizeSiyuanPauseReason(value: unknown): SiyuanIndexJobRecord['pauseReason'] {
  return value === 'user' ||
    value === 'local_model_unavailable' ||
    value === 'cloud_approval_required'
    ? value
    : null;
}

export function siyuanIndexJobScope(projectId: string, mapId: string): string {
  return `${projectId}\u0000${mapId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('siyuan_index_job_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('siyuan_index_job_transaction_aborted'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('siyuan_index_job_transaction_failed'));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(JOB_STORE)) {
      database.createObjectStore(JOB_STORE, { keyPath: 'scope' });
    }
    if (!database.objectStoreNames.contains(ARCHIVE_STORE)) {
      database.createObjectStore(ARCHIVE_STORE, { keyPath: 'scope' });
    }
    for (const name of [ENTRY_STORE, FRONTIER_STORE, SUMMARY_USAGE_STORE]) {
      const store = database.objectStoreNames.contains(name)
        ? request.transaction!.objectStore(name)
        : database.createObjectStore(name, { keyPath: 'key' });
      if (!store.indexNames.contains(SCOPE_INDEX)) {
        store.createIndex(SCOPE_INDEX, 'scope', { unique: false });
      }
    }
  };
  return requestResult(request);
}

function entryKey(scope: string, nodeId: string): string {
  return `${scope}\u0000${nodeId}`;
}

function frontierKey(scope: string, position: number): string {
  return `${scope}\u0000${position.toString().padStart(12, '0')}`;
}

async function clearScopeInTransaction(
  transaction: IDBTransaction,
  storeName: string,
  scope: string,
): Promise<void> {
  const store = transaction.objectStore(storeName);
  const request = store.index(SCOPE_INDEX).openKeyCursor(IDBKeyRange.only(scope));
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('siyuan_index_scope_clear_failed'));
  });
}

export function createSiyuanIndexJob(input: {
  accountId?: string | null;
  projectId: string;
  mapId: string;
  canonicalRoot: string;
  policyFingerprint: string;
  now?: number;
}): SiyuanIndexJobRecord {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: 1,
    scope: siyuanIndexJobScope(input.projectId, input.mapId),
    accountId: input.accountId ?? null,
    projectId: input.projectId,
    mapId: input.mapId,
    canonicalRoot: input.canonicalRoot,
    policyFingerprint: input.policyFingerprint,
    phase: 'discovering',
    status: 'running',
    pauseReason: null,
    cursor: 0,
    frontierLength: 1,
    indexed: 0,
    excluded: 0,
    unreadable: 0,
    summarized: 0,
    summaryEligible: 0,
    createdNodes: 0,
    failed: 0,
    skipped: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenProvenance: 'none',
    summaryProviderId: null,
    summaryConnectionId: null,
    summaryModelId: null,
    phaseStartedAt: now,
    rateSamples: [{ at: now, processed: 0 }],
    discoverySamples: [],
    estimatedPercent: null,
    estimatedEtaSeconds: null,
    reconciledAt: null,
    startupDisposition: null,
    startupDispositionAt: null,
    pausedMs: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function accountForSiyuanRendererOfflineTime(
  job: SiyuanIndexJobRecord,
  rendererStartedAt: number,
  now = Date.now(),
): SiyuanIndexJobRecord {
  const offlineBoundary = Math.min(now, rendererStartedAt);
  const offlineMs = Math.max(0, offlineBoundary - job.updatedAt);
  return {
    ...job,
    pausedMs: job.pausedMs + offlineMs,
    updatedAt: now,
    rateSamples: offlineMs > 0 ? [] : job.rateSamples,
  };
}

export async function replaceSiyuanIndexJob(
  job: SiyuanIndexJobRecord,
  initialDirectory: SiyuanIndexDirectory,
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      [JOB_STORE, ENTRY_STORE, FRONTIER_STORE, SUMMARY_USAGE_STORE],
      'readwrite',
    );
    await Promise.all([
      clearScopeInTransaction(transaction, ENTRY_STORE, job.scope),
      clearScopeInTransaction(transaction, FRONTIER_STORE, job.scope),
      clearScopeInTransaction(transaction, SUMMARY_USAGE_STORE, job.scope),
    ]);
    transaction.objectStore(JOB_STORE).put(job);
    transaction.objectStore(FRONTIER_STORE).put({
      ...initialDirectory,
      key: frontierKey(job.scope, 0),
      scope: job.scope,
      position: 0,
    } satisfies StoredDirectory);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function archiveAndReplaceSiyuanIndexJob(
  job: SiyuanIndexJobRecord,
  initialDirectory: SiyuanIndexDirectory,
  now = Date.now(),
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      [JOB_STORE, ENTRY_STORE, FRONTIER_STORE, SUMMARY_USAGE_STORE, ARCHIVE_STORE],
      'readwrite',
    );
    const [currentJob, storedEntries, storedFrontier, storedUsage] = await Promise.all([
      requestResult(transaction.objectStore(JOB_STORE).get(job.scope)),
      requestResult(transaction.objectStore(ENTRY_STORE).index(SCOPE_INDEX).getAll(job.scope)),
      requestResult(transaction.objectStore(FRONTIER_STORE).index(SCOPE_INDEX).getAll(job.scope)),
      requestResult(
        transaction.objectStore(SUMMARY_USAGE_STORE).index(SCOPE_INDEX).getAll(job.scope),
      ),
    ]);
    if (currentJob) {
      transaction.objectStore(ARCHIVE_STORE).put({
        scope: job.scope,
        archivedAt: now,
        job: currentJob as SiyuanIndexJobRecord,
        entries: (storedEntries as StoredEntry[]).map(
          ({ key: _key, scope: _scope, ...entry }) => entry,
        ),
        frontier: (storedFrontier as StoredDirectory[])
          .sort((left, right) => left.position - right.position)
          .map(({ key: _key, scope: _scope, position: _position, ...directory }) => directory),
        summaryUsage: (storedUsage as StoredSummaryUsage[]).map(
          ({ key: _key, scope: _scope, ...usage }) => usage,
        ),
      } satisfies SiyuanIndexJobArchive);
    }
    await Promise.all([
      clearScopeInTransaction(transaction, ENTRY_STORE, job.scope),
      clearScopeInTransaction(transaction, FRONTIER_STORE, job.scope),
      clearScopeInTransaction(transaction, SUMMARY_USAGE_STORE, job.scope),
    ]);
    transaction.objectStore(JOB_STORE).put(job);
    transaction.objectStore(FRONTIER_STORE).put({
      ...initialDirectory,
      key: frontierKey(job.scope, 0),
      scope: job.scope,
      position: 0,
    } satisfies StoredDirectory);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function archiveAndRestartSiyuanSummaryJobForCloud(
  projectId: string,
  mapId: string,
  identity: Readonly<{ providerId: string; connectionId: string; modelId: string }>,
  now = Date.now(),
): Promise<SiyuanIndexJobRecord> {
  const database = await openDatabase();
  if (!database) throw new Error('siyuan_index_job_storage_unavailable');
  try {
    const scope = siyuanIndexJobScope(projectId, mapId);
    const transaction = database.transaction(
      [JOB_STORE, ENTRY_STORE, FRONTIER_STORE, SUMMARY_USAGE_STORE, ARCHIVE_STORE],
      'readwrite',
    );
    const [storedJob, storedEntries, storedFrontier, storedUsage] = await Promise.all([
      requestResult(transaction.objectStore(JOB_STORE).get(scope)),
      requestResult(transaction.objectStore(ENTRY_STORE).index(SCOPE_INDEX).getAll(scope)),
      requestResult(transaction.objectStore(FRONTIER_STORE).index(SCOPE_INDEX).getAll(scope)),
      requestResult(transaction.objectStore(SUMMARY_USAGE_STORE).index(SCOPE_INDEX).getAll(scope)),
    ]);
    const job = storedJob as SiyuanIndexJobRecord | undefined;
    if (!job) throw new Error('siyuan_index_job_missing');
    if (
      job.status !== 'paused' ||
      job.pauseReason !== 'local_model_unavailable' ||
      job.summarized !== 0 ||
      job.totalTokens !== 0 ||
      job.failed !== 0
    ) {
      throw new Error('siyuan_cloud_summary_restart_not_safe');
    }
    transaction.objectStore(ARCHIVE_STORE).put({
      scope,
      archivedAt: now,
      job,
      entries: (storedEntries as StoredEntry[]).map(
        ({ key: _key, scope: _scope, ...entry }) => entry,
      ),
      frontier: (storedFrontier as StoredDirectory[])
        .sort((left, right) => left.position - right.position)
        .map(({ key: _key, scope: _scope, position: _position, ...directory }) => directory),
      summaryUsage: (storedUsage as StoredSummaryUsage[]).map(
        ({ key: _key, scope: _scope, ...usage }) => usage,
      ),
    } satisfies SiyuanIndexJobArchive);
    await clearScopeInTransaction(transaction, SUMMARY_USAGE_STORE, scope);
    const restarted: SiyuanIndexJobRecord = {
      ...job,
      status: 'running',
      pauseReason: null,
      phase: 'summarizing',
      summaryProviderId: identity.providerId,
      summaryConnectionId: identity.connectionId,
      summaryModelId: identity.modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenProvenance: 'none',
      startupDisposition: null,
      startupDispositionAt: null,
      phaseStartedAt: now,
      rateSamples: [{ at: now, processed: 0 }],
      updatedAt: now,
      completedAt: null,
    };
    transaction.objectStore(JOB_STORE).put(restarted);
    await transactionDone(transaction);
    return restarted;
  } finally {
    database.close();
  }
}

export async function readSiyuanIndexJobArchive(
  projectId: string,
  mapId: string,
): Promise<SiyuanIndexJobArchive | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(ARCHIVE_STORE, 'readonly');
    const archive = await requestResult(
      transaction.objectStore(ARCHIVE_STORE).get(siyuanIndexJobScope(projectId, mapId)),
    );
    await transactionDone(transaction);
    return (archive as SiyuanIndexJobArchive | undefined) ?? null;
  } finally {
    database.close();
  }
}

export async function readSiyuanIndexJob(
  projectId: string,
  mapId: string,
): Promise<SiyuanIndexJobRecord | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(JOB_STORE, 'readonly');
    const result = await requestResult(
      transaction.objectStore(JOB_STORE).get(siyuanIndexJobScope(projectId, mapId)),
    );
    await transactionDone(transaction);
    const stored = result as (SiyuanIndexJobRecord & Partial<SiyuanIndexJobRecord>) | undefined;
    if (!stored) return null;
    const legacyDiscoveryCompletion = stored.createdNodes === undefined && stored.indexed > 0;
    return {
      ...stored,
      accountId: stored.accountId ?? null,
      phase: legacyDiscoveryCompletion ? 'creating_nodes' : stored.phase,
      status: legacyDiscoveryCompletion ? 'running' : stored.status,
      pauseReason: normalizeSiyuanPauseReason(stored.pauseReason),
      createdNodes: stored.createdNodes ?? 0,
      summaryEligible: stored.summaryEligible ?? 0,
      failed: stored.failed ?? 0,
      skipped: stored.skipped ?? 0,
      inputTokens: stored.inputTokens ?? 0,
      outputTokens: stored.outputTokens ?? 0,
      totalTokens: stored.totalTokens ?? 0,
      tokenProvenance: stored.tokenProvenance ?? 'none',
      summaryProviderId: stored.summaryProviderId ?? null,
      summaryConnectionId: stored.summaryConnectionId ?? null,
      summaryModelId: stored.summaryModelId ?? null,
      phaseStartedAt: stored.phaseStartedAt ?? stored.updatedAt,
      rateSamples: stored.rateSamples ?? [],
      discoverySamples: stored.discoverySamples ?? [],
      estimatedPercent: stored.estimatedPercent ?? null,
      estimatedEtaSeconds: stored.estimatedEtaSeconds ?? null,
      reconciledAt: stored.reconciledAt ?? null,
      startupDisposition: stored.startupDisposition ?? null,
      startupDispositionAt: stored.startupDispositionAt ?? null,
      pausedMs: stored.pausedMs ?? 0,
      completedAt: legacyDiscoveryCompletion ? null : stored.completedAt,
    };
  } finally {
    database.close();
  }
}

export async function listSiyuanIndexJobs(projectId?: string): Promise<SiyuanIndexJobRecord[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(JOB_STORE, 'readonly');
    const records = (await requestResult(transaction.objectStore(JOB_STORE).getAll())) as Array<
      SiyuanIndexJobRecord & Partial<SiyuanIndexJobRecord>
    >;
    await transactionDone(transaction);
    return records
      .filter((stored) => !projectId || stored.projectId === projectId)
      .map((stored) => ({
        ...stored,
        accountId: stored.accountId ?? null,
        pauseReason: normalizeSiyuanPauseReason(stored.pauseReason),
        createdNodes: stored.createdNodes ?? 0,
        summaryEligible: stored.summaryEligible ?? 0,
        failed: stored.failed ?? 0,
        skipped: stored.skipped ?? 0,
        inputTokens: stored.inputTokens ?? 0,
        outputTokens: stored.outputTokens ?? 0,
        totalTokens: stored.totalTokens ?? 0,
        tokenProvenance: stored.tokenProvenance ?? 'none',
        summaryProviderId: stored.summaryProviderId ?? null,
        summaryConnectionId: stored.summaryConnectionId ?? null,
        summaryModelId: stored.summaryModelId ?? null,
        phaseStartedAt: stored.phaseStartedAt ?? stored.updatedAt,
        rateSamples: stored.rateSamples ?? [],
        discoverySamples: stored.discoverySamples ?? [],
        estimatedPercent: stored.estimatedPercent ?? null,
        estimatedEtaSeconds: stored.estimatedEtaSeconds ?? null,
        reconciledAt: stored.reconciledAt ?? null,
        startupDisposition: stored.startupDisposition ?? null,
        startupDispositionAt: stored.startupDispositionAt ?? null,
        pausedMs: stored.pausedMs ?? 0,
        completedAt: stored.completedAt ?? null,
      }));
  } finally {
    database.close();
  }
}

export async function readSiyuanIndexFrontier(
  projectId: string,
  mapId: string,
): Promise<SiyuanIndexDirectory[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(FRONTIER_STORE, 'readonly');
    const records = (await requestResult(
      transaction
        .objectStore(FRONTIER_STORE)
        .index(SCOPE_INDEX)
        .getAll(siyuanIndexJobScope(projectId, mapId)),
    )) as StoredDirectory[];
    await transactionDone(transaction);
    return records
      .sort((left, right) => left.position - right.position)
      .map(({ path, relativePath, parentNodeId }) => ({ path, relativePath, parentNodeId }));
  } finally {
    database.close();
  }
}

export async function readSiyuanIndexEntries(
  projectId: string,
  mapId: string,
): Promise<SiyuanSafeIndexEntry[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(ENTRY_STORE, 'readonly');
    const records = (await requestResult(
      transaction
        .objectStore(ENTRY_STORE)
        .index(SCOPE_INDEX)
        .getAll(siyuanIndexJobScope(projectId, mapId)),
    )) as StoredEntry[];
    await transactionDone(transaction);
    return records.map(({ key: _key, scope: _scope, ...entry }) => entry);
  } finally {
    database.close();
  }
}

export async function readSiyuanSummaryUsage(
  projectId: string,
  mapId: string,
): Promise<SiyuanSummaryUsageBatch[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(SUMMARY_USAGE_STORE, 'readonly');
    const records = (await requestResult(
      transaction
        .objectStore(SUMMARY_USAGE_STORE)
        .index(SCOPE_INDEX)
        .getAll(siyuanIndexJobScope(projectId, mapId)),
    )) as StoredSummaryUsage[];
    await transactionDone(transaction);
    return records
      .sort((left, right) => left.completedAt - right.completedAt)
      .map(({ key: _key, scope: _scope, ...batch }) => batch);
  } finally {
    database.close();
  }
}

export async function replaceSiyuanIndexEntries(
  projectId: string,
  mapId: string,
  entries: readonly SiyuanSafeIndexEntry[],
  job?: SiyuanIndexJobRecord,
): Promise<SiyuanIndexJobRecord | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(
      job ? [ENTRY_STORE, JOB_STORE] : ENTRY_STORE,
      'readwrite',
    );
    const persistedJob = job
      ? protectSiyuanJobLifecycle(
          (await requestResult(
            transaction.objectStore(JOB_STORE).get(siyuanIndexJobScope(projectId, mapId)),
          )) as SiyuanIndexJobRecord | undefined,
          job,
        )
      : null;
    await clearScopeInTransaction(transaction, ENTRY_STORE, siyuanIndexJobScope(projectId, mapId));
    const store = transaction.objectStore(ENTRY_STORE);
    const scope = siyuanIndexJobScope(projectId, mapId);
    for (const entry of entries) {
      store.put({ ...entry, key: entryKey(scope, entry.nodeId), scope } satisfies StoredEntry);
    }
    if (persistedJob) transaction.objectStore(JOB_STORE).put(persistedJob);
    await transactionDone(transaction);
    return persistedJob;
  } finally {
    database.close();
  }
}

function protectSiyuanJobLifecycle(
  current: SiyuanIndexJobRecord | null | undefined,
  incoming: SiyuanIndexJobRecord,
): SiyuanIndexJobRecord {
  if (
    !current ||
    !['paused', 'cancelled'].includes(current.status) ||
    current.status === incoming.status
  ) {
    return incoming;
  }
  return {
    ...incoming,
    status: current.status,
    pauseReason: current.pauseReason,
    phase: current.phase,
    pausedMs: current.pausedMs,
    phaseStartedAt: current.phaseStartedAt,
    rateSamples: current.rateSamples,
    discoverySamples: current.discoverySamples,
    estimatedPercent: current.estimatedPercent,
    estimatedEtaSeconds: current.estimatedEtaSeconds,
    reconciledAt: current.reconciledAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
  };
}

export async function checkpointSiyuanIndexJob(
  checkpoint: SiyuanIndexCheckpoint,
  options: Readonly<{ forceStatus?: boolean }> = {},
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(
      [JOB_STORE, ENTRY_STORE, FRONTIER_STORE, SUMMARY_USAGE_STORE],
      'readwrite',
    );
    const jobStore = transaction.objectStore(JOB_STORE);
    const current = options.forceStatus
      ? null
      : ((await requestResult(jobStore.get(checkpoint.job.scope))) as
          | SiyuanIndexJobRecord
          | undefined);
    const job = options.forceStatus
      ? checkpoint.job
      : protectSiyuanJobLifecycle(current, checkpoint.job);
    jobStore.put(job);
    const entryStore = transaction.objectStore(ENTRY_STORE);
    for (const entry of checkpoint.appendedEntries ?? []) {
      entryStore.put({
        ...entry,
        key: entryKey(job.scope, entry.nodeId),
        scope: job.scope,
      } satisfies StoredEntry);
    }
    const frontierStore = transaction.objectStore(FRONTIER_STORE);
    const firstPosition = job.frontierLength - (checkpoint.appendedDirectories?.length ?? 0);
    for (const [offset, directory] of (checkpoint.appendedDirectories ?? []).entries()) {
      const position = firstPosition + offset;
      frontierStore.put({
        ...directory,
        key: frontierKey(job.scope, position),
        scope: job.scope,
        position,
      } satisfies StoredDirectory);
    }
    if (checkpoint.summaryUsage) {
      const usage = checkpoint.summaryUsage;
      transaction.objectStore(SUMMARY_USAGE_STORE).put({
        ...usage,
        key: `${job.scope}\u0000${usage.nodeId}\u0000${usage.sourceModifiedAt ?? 'none'}\u0000${usage.sourceSizeBytes ?? 'none'}`,
        scope: job.scope,
      } satisfies StoredSummaryUsage);
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function updateSiyuanIndexJobStatus(
  projectId: string,
  mapId: string,
  status: SiyuanIndexJobStatus,
  now = Date.now(),
): Promise<SiyuanIndexJobRecord | null> {
  const job = await readSiyuanIndexJob(projectId, mapId);
  if (!job) return null;
  const updated: SiyuanIndexJobRecord = {
    ...job,
    status,
    pauseReason: status === 'paused' ? 'user' : null,
    phase: status === 'completed' ? 'completed' : job.phase,
    pausedMs:
      status === 'running' && job.status === 'paused'
        ? job.pausedMs + Math.max(0, now - job.updatedAt)
        : job.pausedMs,
    updatedAt: now,
    completedAt: status === 'completed' ? now : null,
    startupDisposition: null,
    startupDispositionAt: null,
  };
  await checkpointSiyuanIndexJob({ job: updated }, { forceStatus: true });
  return updated;
}

export async function setSiyuanIndexJobStartupDisposition(
  projectId: string,
  mapId: string,
  disposition: NonNullable<SiyuanIndexJobRecord['startupDisposition']>,
  now = Date.now(),
): Promise<SiyuanIndexJobRecord | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(JOB_STORE, 'readwrite');
    const store = transaction.objectStore(JOB_STORE);
    const job = (await requestResult(store.get(siyuanIndexJobScope(projectId, mapId)))) as
      | SiyuanIndexJobRecord
      | undefined;
    if (!job) {
      await transactionDone(transaction);
      return null;
    }
    const updated: SiyuanIndexJobRecord = {
      ...job,
      status: disposition === 'needs_repair' && job.status === 'running' ? 'failed' : job.status,
      startupDisposition: disposition,
      startupDispositionAt: now,
      updatedAt: disposition === 'needs_repair' ? Math.max(job.updatedAt, now) : job.updatedAt,
    };
    store.put(updated);
    await transactionDone(transaction);
    return updated;
  } finally {
    database.close();
  }
}

export function canResumeSiyuanIndexJob(
  job: SiyuanIndexJobRecord,
  authority: {
    accountId: string | null;
    canonicalRoot: string;
    policyFingerprint: string;
  },
): boolean {
  return (
    job.schemaVersion === 1 &&
    job.status === 'running' &&
    job.accountId === authority.accountId &&
    canonicalSiyuanAuthorityRoot(job.canonicalRoot) ===
      canonicalSiyuanAuthorityRoot(authority.canonicalRoot) &&
    job.policyFingerprint === authority.policyFingerprint
  );
}
