import type { EffortLabel } from '@/lib/ai/catalog/modelVariants';

const DATABASE_NAME = 'vibespace-siyuan-summary-batches';
const DATABASE_VERSION = 1;
const BATCH_STORE = 'batches';
const CLAIM_STORE = 'claims';
const MAX_BATCH_FILES = 8;
const MAX_BATCH_CONTENT_BYTES = 96 * 1024;
const MAX_SUMMARY_LENGTH = 4_000;

export type SiyuanSummaryBatchState = 'claimed' | 'staged' | 'applying' | 'completed' | 'failed';

export type SiyuanSummaryBatchEffort = EffortLabel | 'xhigh';

export interface SiyuanSummaryBatchIdentity {
  providerId: string;
  connectionId: string;
  modelId: string;
  effort: SiyuanSummaryBatchEffort;
}

export interface SiyuanSummaryBatchFileRevision {
  nodeId: string;
  sourceModifiedAt: number | null;
  sourceSizeBytes: number | null;
  contentBytes: number;
  contentFingerprint: string;
}

export interface SiyuanSummaryBatchUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
  tokenProvenance: 'reported' | 'estimated';
  cacheProvenance: 'reported' | 'unavailable';
  costProvenance: 'reported' | 'unavailable';
}

export interface SiyuanSummaryBatchReceipt {
  identity: SiyuanSummaryBatchIdentity;
  requestId: string;
  sessionId: string;
  /** Complete summaries keyed by `siyuanSummaryNodeRevisionKey`. */
  summaries: Readonly<Record<string, string>>;
  usage: SiyuanSummaryBatchUsage;
  dispatchedAt?: number;
  durationMs?: number;
  finishReason?: string | null;
  receivedAt: number;
}

export interface SiyuanSummaryBatchRecord {
  schemaVersion: 1;
  jobScope: string;
  batchId: string;
  policyFingerprint: string;
  identity: SiyuanSummaryBatchIdentity;
  files: SiyuanSummaryBatchFileRevision[];
  nodeRevisionKeys: string[];
  state: SiyuanSummaryBatchState;
  ownerId: string | null;
  leaseDurationMs: number;
  leaseExpiresAt: number | null;
  dispatchStartedAt: number | null;
  receipt: SiyuanSummaryBatchReceipt | null;
  appliedNodeRevisionKeys: string[];
  failureReason: 'lease_expired' | 'pause_released' | 'cancel_released' | 'provider_failed' | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface StoredBatch extends SiyuanSummaryBatchRecord {
  key: string;
}

interface StoredClaim {
  key: string;
  jobScope: string;
  nodeRevisionKey: string;
  batchKey: string;
  batchId: string;
}

export interface SiyuanSummaryBatchClaimInput {
  jobScope: string;
  batchId: string;
  policyFingerprint: string;
  identity: SiyuanSummaryBatchIdentity;
  files: readonly SiyuanSummaryBatchFileRevision[];
  ownerId: string;
  now?: number;
  leaseMs: number;
}

export type SiyuanSummaryBatchClaimResult =
  | { kind: 'claimed'; batch: SiyuanSummaryBatchRecord }
  | { kind: 'existing'; batch: SiyuanSummaryBatchRecord }
  | { kind: 'conflict'; conflictingNodeRevisionKeys: string[] };

function requiredString(value: string, field: string, maximum = 32_768): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`siyuan_summary_batch_${field}_invalid`);
  }
  return normalized;
}

function requiredJobScope(value: string): string {
  const parts = value.split('\u0000');
  if (parts.length !== 2) throw new Error('siyuan_summary_batch_job_scope_invalid');
  return `${requiredString(parts[0] ?? '', 'job_scope')}\u0000${requiredString(
    parts[1] ?? '',
    'job_scope',
  )}`;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`siyuan_summary_batch_${field}_invalid`);
  }
  return value;
}

function finiteTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`siyuan_summary_batch_${field}_invalid`);
  }
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < left) {
    throw new Error(`siyuan_summary_batch_${field}_invalid`);
  }
  return value;
}

function optionalRevisionNumber(value: number | null, field: string): number | null {
  if (value === null) return null;
  return nonNegativeInteger(value, field);
}

function normalizedIdentity(identity: SiyuanSummaryBatchIdentity): SiyuanSummaryBatchIdentity {
  const effort = identity.effort;
  if (!['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(effort)) {
    throw new Error('siyuan_summary_batch_effort_invalid');
  }
  return {
    providerId: requiredString(identity.providerId, 'provider_id', 512),
    connectionId: requiredString(identity.connectionId, 'connection_id', 512),
    modelId: requiredString(identity.modelId, 'model_id', 2_048),
    effort,
  };
}

function normalizedFile(file: SiyuanSummaryBatchFileRevision): SiyuanSummaryBatchFileRevision {
  const contentFingerprint = requiredString(file.contentFingerprint, 'content_fingerprint', 4_096);
  if (!/^sha256:[a-f0-9]{64}$/u.test(contentFingerprint)) {
    throw new Error('siyuan_summary_batch_content_fingerprint_invalid');
  }
  return {
    nodeId: requiredString(file.nodeId, 'node_id', 2_048),
    sourceModifiedAt: optionalRevisionNumber(file.sourceModifiedAt, 'source_modified_at'),
    sourceSizeBytes: optionalRevisionNumber(file.sourceSizeBytes, 'source_size_bytes'),
    contentBytes: nonNegativeInteger(file.contentBytes, 'content_bytes'),
    contentFingerprint,
  };
}

export function siyuanSummaryNodeRevisionKey(file: SiyuanSummaryBatchFileRevision): string {
  const normalized = normalizedFile(file);
  return JSON.stringify([
    normalized.nodeId,
    normalized.sourceModifiedAt,
    normalized.sourceSizeBytes,
    normalized.contentBytes,
    normalized.contentFingerprint,
  ]);
}

function batchKey(jobScope: string, batchId: string): string {
  return JSON.stringify([jobScope, batchId]);
}

function claimKey(jobScope: string, nodeRevisionKey: string): string {
  return JSON.stringify([jobScope, nodeRevisionKey]);
}

function publicBatch(batch: StoredBatch): SiyuanSummaryBatchRecord {
  const { key: _key, ...record } = batch;
  return { ...record, dispatchStartedAt: batch.dispatchStartedAt ?? null };
}

function hasProvenNoDispatch(batch: StoredBatch): boolean {
  return (
    Object.prototype.hasOwnProperty.call(batch, 'dispatchStartedAt') &&
    batch.dispatchStartedAt === null
  );
}

function mayHaveDispatched(batch: StoredBatch): boolean {
  return !hasProvenNoDispatch(batch);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('siyuan_summary_batch_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('siyuan_summary_batch_tx_failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('siyuan_summary_batch_tx_aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('siyuan_summary_batch_indexeddb_unavailable');
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BATCH_STORE)) {
        const batches = database.createObjectStore(BATCH_STORE, { keyPath: 'key' });
        batches.createIndex('jobScope', 'jobScope', { unique: false });
      }
      if (!database.objectStoreNames.contains(CLAIM_STORE)) {
        const claims = database.createObjectStore(CLAIM_STORE, { keyPath: 'key' });
        claims.createIndex('batchKey', 'batchKey', { unique: false });
        claims.createIndex('jobScope', 'jobScope', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('siyuan_summary_batch_open_failed'));
    request.onblocked = () => reject(new Error('siyuan_summary_batch_open_blocked'));
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertBatchAuthority(
  existing: StoredBatch,
  input: Readonly<{
    policyFingerprint: string;
    identity: SiyuanSummaryBatchIdentity;
    files: readonly SiyuanSummaryBatchFileRevision[];
  }>,
): void {
  if (
    existing.policyFingerprint !== input.policyFingerprint ||
    !sameValue(existing.identity, input.identity) ||
    !sameValue(existing.files, input.files)
  ) {
    throw new Error('siyuan_summary_batch_authority_mismatch');
  }
}

async function deleteClaimsForBatch(
  claimStore: IDBObjectStore,
  key: string,
  except: ReadonlySet<string> = new Set(),
): Promise<void> {
  const claims = (await requestResult(
    claimStore.index('batchKey').getAll(IDBKeyRange.only(key)),
  )) as StoredClaim[];
  for (const claim of claims) {
    if (!except.has(claim.nodeRevisionKey)) claimStore.delete(claim.key);
  }
}

function normalizedClaim(input: SiyuanSummaryBatchClaimInput) {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const policyFingerprint = requiredString(input.policyFingerprint, 'policy_fingerprint');
  const identity = normalizedIdentity(input.identity);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const leaseMs = nonNegativeInteger(input.leaseMs, 'lease_ms');
  if (leaseMs < 1) throw new Error('siyuan_summary_batch_lease_ms_invalid');
  const files = input.files.map(normalizedFile);
  const nodeRevisionKeys = files.map(siyuanSummaryNodeRevisionKey);
  const totalContentBytes = files.reduce(
    (total, file) => safeAdd(total, file.contentBytes, 'content_bytes'),
    0,
  );
  if (
    files.length < 1 ||
    files.length > MAX_BATCH_FILES ||
    totalContentBytes > MAX_BATCH_CONTENT_BYTES ||
    new Set(nodeRevisionKeys).size !== nodeRevisionKeys.length
  ) {
    throw new Error('siyuan_summary_batch_files_invalid');
  }
  const leaseExpiresAt = safeAdd(now, leaseMs, 'lease_expiry');
  return {
    jobScope,
    batchId,
    policyFingerprint,
    identity,
    ownerId,
    now,
    leaseMs,
    files,
    nodeRevisionKeys,
    leaseExpiresAt,
  };
}

export async function claimSiyuanSummaryBatch(
  rawInput: SiyuanSummaryBatchClaimInput,
): Promise<SiyuanSummaryBatchClaimResult> {
  const input = normalizedClaim(rawInput);
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BATCH_STORE, CLAIM_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const batchStore = transaction.objectStore(BATCH_STORE);
    const claimStore = transaction.objectStore(CLAIM_STORE);
    const key = batchKey(input.jobScope, input.batchId);
    const existing = (await requestResult(batchStore.get(key))) as StoredBatch | undefined;
    if (existing) {
      assertBatchAuthority(existing, input);
      if (input.now < existing.updatedAt) {
        throw new Error('siyuan_summary_batch_clock_regression');
      }
      if (
        existing.state === 'completed' ||
        existing.state === 'failed' ||
        (existing.ownerId !== null &&
          existing.ownerId !== input.ownerId &&
          (existing.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > input.now)
      ) {
        transaction.abort();
        await done.catch(() => undefined);
        return {
          kind:
            existing.state === 'completed' || existing.state === 'failed' ? 'existing' : 'conflict',
          ...(existing.state === 'completed' || existing.state === 'failed'
            ? { batch: publicBatch(existing) }
            : { conflictingNodeRevisionKeys: [...existing.nodeRevisionKeys] }),
        } as SiyuanSummaryBatchClaimResult;
      }
      if (
        existing.state === 'claimed' &&
        existing.receipt === null &&
        (existing.leaseExpiresAt ?? Number.POSITIVE_INFINITY) <= input.now &&
        mayHaveDispatched(existing)
      ) {
        const retained: StoredBatch = {
          ...existing,
          state: 'failed',
          ownerId: null,
          leaseExpiresAt: null,
          failureReason: 'provider_failed',
          updatedAt: input.now,
        };
        batchStore.put(retained);
        await done;
        return { kind: 'existing', batch: publicBatch(retained) };
      }
      const resumed: StoredBatch = {
        ...existing,
        ownerId: input.ownerId,
        leaseDurationMs: input.leaseMs,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
        state: existing.receipt
          ? existing.state === 'applying'
            ? 'applying'
            : 'staged'
          : 'claimed',
      };
      batchStore.put(resumed);
      await done;
      return { kind: 'existing', batch: publicBatch(resumed) };
    }

    const conflicts: string[] = [];
    const expiredBatchKeys = new Set<string>();
    const uncertainExpiredBatchKeys = new Set<string>();
    for (const nodeRevisionKey of input.nodeRevisionKeys) {
      const occupied = (await requestResult(
        claimStore.get(claimKey(input.jobScope, nodeRevisionKey)),
      )) as StoredClaim | undefined;
      if (!occupied) continue;
      const ownerBatch = (await requestResult(batchStore.get(occupied.batchKey))) as
        | StoredBatch
        | undefined;
      if (!ownerBatch) {
        claimStore.delete(occupied.key);
        continue;
      }
      if (
        ownerBatch.state === 'claimed' &&
        ownerBatch.receipt === null &&
        ownerBatch.leaseExpiresAt !== null &&
        ownerBatch.leaseExpiresAt <= input.now
      ) {
        if (hasProvenNoDispatch(ownerBatch)) {
          expiredBatchKeys.add(ownerBatch.key);
          continue;
        }
        uncertainExpiredBatchKeys.add(ownerBatch.key);
      }
      conflicts.push(nodeRevisionKey);
    }
    if (conflicts.length > 0) {
      for (const uncertainKey of uncertainExpiredBatchKeys) {
        const uncertain = (await requestResult(batchStore.get(uncertainKey))) as
          | StoredBatch
          | undefined;
        if (!uncertain) continue;
        batchStore.put({
          ...uncertain,
          state: 'failed',
          ownerId: null,
          leaseExpiresAt: null,
          failureReason: 'provider_failed',
          updatedAt: input.now,
        } satisfies StoredBatch);
      }
      await done;
      return { kind: 'conflict', conflictingNodeRevisionKeys: conflicts };
    }
    for (const expiredKey of expiredBatchKeys) {
      const expired = (await requestResult(batchStore.get(expiredKey))) as StoredBatch | undefined;
      if (!expired) continue;
      batchStore.put({
        ...expired,
        state: 'failed',
        ownerId: null,
        leaseExpiresAt: null,
        failureReason: 'lease_expired',
        updatedAt: input.now,
      } satisfies StoredBatch);
      await deleteClaimsForBatch(claimStore, expiredKey);
    }

    const record: StoredBatch = {
      key,
      schemaVersion: 1,
      jobScope: input.jobScope,
      batchId: input.batchId,
      policyFingerprint: input.policyFingerprint,
      identity: input.identity,
      files: input.files,
      nodeRevisionKeys: input.nodeRevisionKeys,
      state: 'claimed',
      ownerId: input.ownerId,
      leaseDurationMs: input.leaseMs,
      leaseExpiresAt: input.leaseExpiresAt,
      dispatchStartedAt: null,
      receipt: null,
      appliedNodeRevisionKeys: [],
      failureReason: null,
      createdAt: input.now,
      updatedAt: input.now,
      completedAt: null,
    };
    batchStore.add(record);
    for (const nodeRevisionKey of input.nodeRevisionKeys) {
      claimStore.add({
        key: claimKey(input.jobScope, nodeRevisionKey),
        jobScope: input.jobScope,
        nodeRevisionKey,
        batchKey: key,
        batchId: input.batchId,
      } satisfies StoredClaim);
    }
    await done;
    return { kind: 'claimed', batch: publicBatch(record) };
  } finally {
    database.close();
  }
}

export async function markSiyuanSummaryBatchDispatched(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    assertMonotonicTime(existing, now);
    assertOwned(existing, ownerId, now);
    if (existing.state !== 'claimed' || existing.receipt) {
      throw new Error('siyuan_summary_batch_state_invalid');
    }
    if (existing.dispatchStartedAt !== undefined && existing.dispatchStartedAt !== null) {
      await done;
      return publicBatch(existing);
    }
    const dispatched: StoredBatch = {
      ...existing,
      dispatchStartedAt: now,
      updatedAt: now,
    };
    store.put(dispatched);
    await done;
    return publicBatch(dispatched);
  } finally {
    database.close();
  }
}

function normalizedUsage(usage: SiyuanSummaryBatchUsage): SiyuanSummaryBatchUsage {
  const inputTokens = nonNegativeInteger(usage.inputTokens, 'input_tokens');
  const outputTokens = nonNegativeInteger(usage.outputTokens, 'output_tokens');
  const totalTokens = nonNegativeInteger(usage.totalTokens, 'total_tokens');
  const cacheReadTokens = nonNegativeInteger(usage.cacheReadTokens, 'cache_read_tokens');
  const cacheWriteTokens = nonNegativeInteger(usage.cacheWriteTokens, 'cache_write_tokens');
  if (totalTokens !== safeAdd(inputTokens, outputTokens, 'total_tokens')) {
    throw new Error('siyuan_summary_batch_total_tokens_invalid');
  }
  const costUsd = usage.costUsd;
  if (costUsd !== null && (!Number.isFinite(costUsd) || costUsd < 0)) {
    throw new Error('siyuan_summary_batch_cost_usd_invalid');
  }
  if (
    !['reported', 'estimated'].includes(usage.tokenProvenance) ||
    !['reported', 'unavailable'].includes(usage.cacheProvenance) ||
    !['reported', 'unavailable'].includes(usage.costProvenance) ||
    (usage.costProvenance === 'reported') !== (costUsd !== null) ||
    (usage.cacheProvenance === 'unavailable' && (cacheReadTokens !== 0 || cacheWriteTokens !== 0))
  ) {
    throw new Error('siyuan_summary_batch_usage_provenance_invalid');
  }
  return {
    ...usage,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
  };
}

function normalizedReceipt(
  receipt: SiyuanSummaryBatchReceipt,
  batch: StoredBatch,
): SiyuanSummaryBatchReceipt {
  const identity = normalizedIdentity(receipt.identity);
  if (!sameValue(identity, batch.identity)) {
    throw new Error('siyuan_summary_batch_authority_mismatch');
  }
  const allowed = new Set(batch.nodeRevisionKeys);
  const summaries = Object.entries(receipt.summaries)
    .map(([key, value]) => {
      if (!allowed.has(key) || typeof value !== 'string') {
        throw new Error('siyuan_summary_batch_receipt_membership_invalid');
      }
      const summary = value.trim();
      if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
        throw new Error('siyuan_summary_batch_receipt_summary_invalid');
      }
      return [key, summary] as const;
    })
    .sort(
      (left, right) =>
        batch.nodeRevisionKeys.indexOf(left[0]) - batch.nodeRevisionKeys.indexOf(right[0]),
    );
  if (
    summaries.length !== batch.nodeRevisionKeys.length ||
    summaries.some(([key], index) => key !== batch.nodeRevisionKeys[index])
  ) {
    throw new Error('siyuan_summary_batch_receipt_membership_invalid');
  }
  const receivedAt = finiteTimestamp(receipt.receivedAt, 'received_at');
  if (receivedAt < batch.createdAt) throw new Error('siyuan_summary_batch_clock_regression');
  const dispatchedAt = finiteTimestamp(receipt.dispatchedAt ?? batch.createdAt, 'dispatched_at');
  const durationMs = nonNegativeInteger(
    receipt.durationMs ?? Math.max(0, receivedAt - dispatchedAt),
    'duration_ms',
  );
  if (dispatchedAt < batch.createdAt || dispatchedAt > receivedAt) {
    throw new Error('siyuan_summary_batch_clock_regression');
  }
  if (durationMs !== receivedAt - dispatchedAt) {
    throw new Error('siyuan_summary_batch_duration_mismatch');
  }
  const finishReason =
    receipt.finishReason === undefined || receipt.finishReason === null
      ? null
      : requiredString(receipt.finishReason, 'finish_reason', 256);
  return {
    identity,
    requestId: requiredString(receipt.requestId, 'request_id', 256),
    sessionId: requiredString(receipt.sessionId, 'session_id', 256),
    summaries: Object.fromEntries(summaries),
    usage: normalizedUsage(receipt.usage),
    dispatchedAt,
    durationMs,
    finishReason,
    receivedAt,
  };
}

function assertOwned(batch: StoredBatch, ownerId: string, now: number): void {
  if (batch.ownerId !== ownerId || batch.leaseExpiresAt === null || batch.leaseExpiresAt <= now) {
    throw new Error('siyuan_summary_batch_lease_not_owned');
  }
}

function assertMonotonicTime(batch: StoredBatch, now: number): void {
  if (now < batch.updatedAt) throw new Error('siyuan_summary_batch_clock_regression');
}

export async function stageSiyuanSummaryBatchReceipt(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  receipt: SiyuanSummaryBatchReceipt;
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    assertMonotonicTime(existing, now);
    // A provider may complete just after the lease deadline. It is still safe
    // to stage the paid first-write-wins receipt when this owner remains the
    // recorded owner; an atomic takeover would already have changed owner/state.
    if (existing.ownerId !== ownerId) throw new Error('siyuan_summary_batch_lease_not_owned');
    const receipt = normalizedReceipt(input.receipt, existing);
    if (existing.receipt) {
      if (!sameValue(existing.receipt, receipt)) {
        throw new Error('siyuan_summary_batch_receipt_already_staged');
      }
      await done;
      return publicBatch(existing);
    }
    if (existing.state !== 'claimed') throw new Error('siyuan_summary_batch_state_invalid');
    const staged: StoredBatch = {
      ...existing,
      state: 'staged',
      receipt,
      updatedAt: now,
      leaseExpiresAt: safeAdd(now, existing.leaseDurationMs, 'lease_expiry'),
    };
    store.put(staged);
    await done;
    return publicBatch(staged);
  } finally {
    database.close();
  }
}

export async function renewSiyuanSummaryBatchLease(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    if (
      existing.ownerId !== ownerId ||
      !['claimed', 'staged', 'applying'].includes(existing.state)
    ) {
      throw new Error('siyuan_summary_batch_lease_not_owned');
    }
    if (now < existing.updatedAt) throw new Error('siyuan_summary_batch_clock_regression');
    const renewed: StoredBatch = {
      ...existing,
      updatedAt: now,
      leaseExpiresAt: safeAdd(now, existing.leaseDurationMs, 'lease_expiry'),
    };
    store.put(renewed);
    await done;
    return publicBatch(renewed);
  } finally {
    database.close();
  }
}

export async function markSiyuanSummaryBatchNodeApplied(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  nodeRevisionKey: string;
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const nodeRevisionKey = requiredString(input.nodeRevisionKey, 'node_revision_key', 8_192);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    assertMonotonicTime(existing, now);
    assertOwned(existing, ownerId, now);
    if (!existing.receipt || !(nodeRevisionKey in existing.receipt.summaries)) {
      throw new Error('siyuan_summary_batch_apply_member_invalid');
    }
    if (!['staged', 'applying'].includes(existing.state)) {
      throw new Error('siyuan_summary_batch_state_invalid');
    }
    if (existing.appliedNodeRevisionKeys.includes(nodeRevisionKey)) {
      await done;
      return publicBatch(existing);
    }
    const applied = new Set([...existing.appliedNodeRevisionKeys, nodeRevisionKey]);
    const applying: StoredBatch = {
      ...existing,
      state: 'applying',
      appliedNodeRevisionKeys: existing.nodeRevisionKeys.filter((key) => applied.has(key)),
      updatedAt: now,
      leaseExpiresAt: safeAdd(now, existing.leaseDurationMs, 'lease_expiry'),
    };
    store.put(applying);
    await done;
    return publicBatch(applying);
  } finally {
    database.close();
  }
}

export async function completeSiyuanSummaryBatch(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BATCH_STORE, CLAIM_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const claimStore = transaction.objectStore(CLAIM_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    if (existing.state === 'completed') {
      await done;
      return publicBatch(existing);
    }
    assertMonotonicTime(existing, now);
    assertOwned(existing, ownerId, now);
    if (!existing.receipt) throw new Error('siyuan_summary_batch_receipt_missing');
    const summaryKeys = Object.keys(existing.receipt.summaries);
    if (summaryKeys.some((key) => !existing.appliedNodeRevisionKeys.includes(key))) {
      throw new Error('siyuan_summary_batch_application_incomplete');
    }
    const completed: StoredBatch = {
      ...existing,
      state: 'completed',
      ownerId: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
    };
    store.put(completed);
    // Completed receipts remain immutable/deduplicated by batch ID. Their
    // active revision locks must be released so an explicitly authorized new
    // route/policy can create its own separately proven receipt.
    await deleteClaimsForBatch(claimStore, existing.key);
    await done;
    return publicBatch(completed);
  } finally {
    database.close();
  }
}

export async function releaseSiyuanSummaryBatch(input: {
  jobScope: string;
  batchId: string;
  ownerId: string;
  reason: 'pause' | 'cancel' | 'failure';
  now?: number;
}): Promise<SiyuanSummaryBatchRecord> {
  const jobScope = requiredJobScope(input.jobScope);
  const batchId = requiredString(input.batchId, 'batch_id', 2_048);
  const ownerId = requiredString(input.ownerId, 'owner_id', 2_048);
  const now = finiteTimestamp(input.now ?? Date.now(), 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BATCH_STORE, CLAIM_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const claimStore = transaction.objectStore(CLAIM_STORE);
    const existing = (await requestResult(store.get(batchKey(jobScope, batchId)))) as
      | StoredBatch
      | undefined;
    if (!existing) throw new Error('siyuan_summary_batch_not_found');
    if (existing.state === 'completed' || existing.state === 'failed') {
      await done;
      return publicBatch(existing);
    }
    assertMonotonicTime(existing, now);
    if (existing.ownerId !== ownerId) throw new Error('siyuan_summary_batch_lease_not_owned');
    if (existing.receipt) {
      const retained: StoredBatch = {
        ...existing,
        state: 'staged',
        ownerId: null,
        leaseExpiresAt: null,
        failureReason: null,
        updatedAt: now,
      };
      store.put(retained);
      await done;
      return publicBatch(retained);
    }
    const dispatchMayHaveStarted = mayHaveDispatched(existing);
    const released: StoredBatch = {
      ...existing,
      state: 'failed',
      ownerId: null,
      leaseExpiresAt: null,
      failureReason: dispatchMayHaveStarted
        ? 'provider_failed'
        : input.reason === 'pause'
          ? 'pause_released'
          : input.reason === 'cancel'
            ? 'cancel_released'
            : 'provider_failed',
      updatedAt: now,
    };
    store.put(released);
    // A provider/protocol failure may already have incurred cost. Keep its
    // revision claims as a terminal repair boundary so automatic restart
    // cannot silently repay the full batch.
    if (input.reason !== 'failure' && !dispatchMayHaveStarted) {
      await deleteClaimsForBatch(claimStore, existing.key);
    }
    await done;
    return publicBatch(released);
  } finally {
    database.close();
  }
}

export async function recoverExpiredSiyuanSummaryBatchClaims(
  rawJobScope: string,
  rawNow = Date.now(),
): Promise<{ released: number; resumable: number }> {
  const jobScope = requiredJobScope(rawJobScope);
  const now = finiteTimestamp(rawNow, 'now');
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BATCH_STORE, CLAIM_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BATCH_STORE);
    const claimStore = transaction.objectStore(CLAIM_STORE);
    const batches = (await requestResult(
      store.index('jobScope').getAll(IDBKeyRange.only(jobScope)),
    )) as StoredBatch[];
    let released = 0;
    let resumable = 0;
    for (const batch of batches) {
      if (
        batch.ownerId === null ||
        batch.leaseExpiresAt === null ||
        batch.leaseExpiresAt > now ||
        !['claimed', 'staged', 'applying'].includes(batch.state)
      ) {
        continue;
      }
      if (batch.receipt) {
        store.put({
          ...batch,
          state: 'staged',
          ownerId: null,
          leaseExpiresAt: null,
          updatedAt: now,
        } satisfies StoredBatch);
        resumable += 1;
      } else {
        const uncertainDispatch = mayHaveDispatched(batch);
        store.put({
          ...batch,
          state: 'failed',
          ownerId: null,
          leaseExpiresAt: null,
          failureReason: uncertainDispatch ? 'provider_failed' : 'lease_expired',
          updatedAt: now,
        } satisfies StoredBatch);
        if (!uncertainDispatch) {
          await deleteClaimsForBatch(claimStore, batch.key);
          released += 1;
        }
      }
    }
    await done;
    return { released, resumable };
  } finally {
    database.close();
  }
}

export async function readSiyuanSummaryBatch(
  rawJobScope: string,
  rawBatchId: string,
): Promise<SiyuanSummaryBatchRecord | null> {
  const jobScope = requiredJobScope(rawJobScope);
  const batchId = requiredString(rawBatchId, 'batch_id', 2_048);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readonly');
    const done = transactionDone(transaction);
    const stored = (await requestResult(
      transaction.objectStore(BATCH_STORE).get(batchKey(jobScope, batchId)),
    )) as StoredBatch | undefined;
    await done;
    return stored ? publicBatch(stored) : null;
  } finally {
    database.close();
  }
}

export async function listSiyuanSummaryBatches(
  rawJobScope: string,
): Promise<SiyuanSummaryBatchRecord[]> {
  const jobScope = requiredJobScope(rawJobScope);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, 'readonly');
    const done = transactionDone(transaction);
    const stored = (await requestResult(
      transaction.objectStore(BATCH_STORE).index('jobScope').getAll(IDBKeyRange.only(jobScope)),
    )) as StoredBatch[];
    await done;
    return stored
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.batchId.localeCompare(right.batchId),
      )
      .map(publicBatch);
  } finally {
    database.close();
  }
}

export async function resetSiyuanSummaryBatchStoreForTests(): Promise<void> {
  if (!globalThis.indexedDB) return;
  await new Promise<void>((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('siyuan_summary_batch_reset_failed'));
    request.onblocked = () => reject(new Error('siyuan_summary_batch_reset_blocked'));
  });
}
