/**
 * Pure planning and merge contracts for optional Canvas cloud sync.
 *
 * This module performs no network or persistence work. Local documents remain
 * independently usable; callers may use these immutable results to decide
 * which explicitly authorized operation to enqueue elsewhere.
 */

import { CANVAS_ID_PATTERN, parseCanvasDocument, type CanvasDocument } from './contracts';

export const CANVAS_CLOUD_SYNC_CAPABILITIES = Object.freeze({
  localFirst: true as const,
  realTimeCollaboration: false as const,
});

const MERGE_CAPABILITIES = Object.freeze({ realTimeCollaboration: false as const });
const CONFLICT_CHOICES = Object.freeze(['keep_local', 'use_remote', 'keep_both'] as const);
const CONFLICT_REASONS = Object.freeze([
  'divergent_edits',
  'tombstone_update_conflict',
  'invalid_revision_chain',
  'revision_id_collision',
] as const);
const SAFE_ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const MAX_RETRY_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_ERROR_LENGTH = 500;

export type CanvasCloudSyncErrorCode =
  | 'invalid_authority'
  | 'entitlement_required'
  | 'project_scope_mismatch'
  | 'owner_scope_mismatch'
  | 'invalid_revision'
  | 'invalid_retry'
  | 'retry_exhausted';

export class CanvasCloudSyncError extends Error {
  constructor(
    readonly code: CanvasCloudSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CanvasCloudSyncError';
  }
}

export interface CanvasCloudSyncAuthority {
  readonly accountId: string;
  readonly projectId: string;
  readonly ownerId: string;
  /** Must come from verified entitlement evidence, never an untrusted plan label. */
  readonly cloudSyncEntitled: boolean;
}

export interface CanvasCloudRevision {
  readonly schemaVersion: 1;
  readonly scope: Readonly<{
    accountId: string;
    projectId: string;
    ownerId: string;
  }>;
  readonly documentId: string;
  readonly revisionId: string;
  readonly parentRevisionId: string | null;
  readonly sequence: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  /** Null only for a tombstone. Live revisions retain the canonical local document. */
  readonly document: CanvasDocument | null;
}

export interface CreateCanvasCloudRevisionInput {
  readonly documentId: string;
  readonly revisionId: string;
  readonly parentRevisionId: string | null;
  readonly sequence: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  readonly document: CanvasDocument | null;
}

export type CanvasCloudConflictReason =
  | 'divergent_edits'
  | 'tombstone_update_conflict'
  | 'invalid_revision_chain'
  | 'revision_id_collision';

export type CanvasCloudMergeResult =
  | Readonly<{
      kind: 'merged';
      action: 'up_to_date' | 'keep_local' | 'accept_remote';
      revision: CanvasCloudRevision;
      /** Always retained so planning never destroys the caller's local source. */
      localSource: CanvasCloudRevision;
      capabilities: typeof MERGE_CAPABILITIES;
    }>
  | CanvasCloudConflict;

export interface CanvasCloudConflict {
  readonly kind: 'conflict';
  readonly reason: CanvasCloudConflictReason;
  readonly local: CanvasCloudRevision;
  readonly remote: CanvasCloudRevision;
  readonly choices: typeof CONFLICT_CHOICES;
  readonly capabilities: typeof MERGE_CAPABILITIES;
}

export type CanvasCloudConflictChoice = (typeof CONFLICT_CHOICES)[number];

export interface CanvasCloudConflictResolution {
  readonly choice: CanvasCloudConflictChoice;
  readonly primary: CanvasCloudRevision;
  /** Both inputs remain available even when one is selected as primary. */
  readonly preserved: readonly [CanvasCloudRevision, CanvasCloudRevision];
}

function fail(code: CanvasCloudSyncErrorCode, message: string): never {
  throw new CanvasCloudSyncError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid_revision', `${path} must be a stable Canvas id`);
  }
  return value;
}

function safeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail('invalid_revision', `${path} must be a non-negative safe integer`);
  }
  return value as number;
}

function assertAuthority(authority: CanvasCloudSyncAuthority): void {
  if (
    !authority ||
    typeof authority !== 'object' ||
    typeof authority.accountId !== 'string' ||
    !SAFE_ACCOUNT_ID.test(authority.accountId) ||
    typeof authority.projectId !== 'string' ||
    !CANVAS_ID_PATTERN.test(authority.projectId) ||
    typeof authority.ownerId !== 'string' ||
    !CANVAS_ID_PATTERN.test(authority.ownerId) ||
    typeof authority.cloudSyncEntitled !== 'boolean'
  ) {
    fail('invalid_authority', 'A verified account, project, owner, and entitlement are required');
  }
  if (!authority.cloudSyncEntitled) {
    fail('entitlement_required', 'Canvas cloud sync requires verified cloud-sync entitlement');
  }
}

function assertRevisionScope(
  authority: CanvasCloudSyncAuthority,
  revision: CanvasCloudRevision,
): void {
  assertAuthority(authority);
  if (
    revision.scope.accountId !== authority.accountId ||
    revision.scope.projectId !== authority.projectId ||
    revision.scope.ownerId !== authority.ownerId
  ) {
    fail('invalid_authority', 'Revision account authority does not match the active authority');
  }
  if (revision.scope.projectId !== revision.document?.projectId && revision.document !== null) {
    fail('project_scope_mismatch', 'Revision document project does not match its scope');
  }
  if (revision.scope.ownerId !== revision.document?.ownerId && revision.document !== null) {
    fail('owner_scope_mismatch', 'Revision document owner does not match its scope');
  }
}

/**
 * Validate a live snapshot or deletion tombstone at the cloud boundary.
 * The returned envelope is frozen and retains an already immutable document.
 */
export function createCanvasCloudRevision(
  authority: CanvasCloudSyncAuthority,
  input: CreateCanvasCloudRevisionInput,
): CanvasCloudRevision {
  assertAuthority(authority);
  if (!input || typeof input !== 'object') {
    fail('invalid_revision', 'Revision input must be an object');
  }
  const revisionId = safeId(input.revisionId, 'revision.revisionId');
  const documentId = safeId(input.documentId, 'revision.documentId');
  const parentRevisionId =
    input.parentRevisionId === null
      ? null
      : safeId(input.parentRevisionId, 'revision.parentRevisionId');
  if (parentRevisionId === revisionId) {
    fail('invalid_revision', 'A revision cannot be its own parent');
  }
  const sequence = safeInteger(input.sequence, 'revision.sequence');
  if (sequence === 0) {
    fail('invalid_revision', 'Cloud revision sequence starts at one');
  }
  const updatedAt = safeInteger(input.updatedAt, 'revision.updatedAt');
  const deletedAt =
    input.deletedAt === null ? null : safeInteger(input.deletedAt, 'revision.deletedAt');

  let documentValue: CanvasDocument | null;
  if (deletedAt === null) {
    if (input.document === null) {
      fail('invalid_revision', 'A live revision requires a document');
    }
    let parsedDocument: CanvasDocument;
    try {
      parsedDocument = parseCanvasDocument(input.document);
    } catch {
      fail('invalid_revision', 'Revision document must be a valid canonical Canvas document');
    }
    documentValue = parsedDocument;
    if (parsedDocument.id !== documentId) {
      fail('invalid_revision', 'Document id does not match revision metadata');
    }
    if (parsedDocument.projectId !== authority.projectId) {
      fail('project_scope_mismatch', 'Document project does not match cloud-sync authority');
    }
    if (parsedDocument.ownerId !== authority.ownerId) {
      fail('owner_scope_mismatch', 'Document owner does not match cloud-sync authority');
    }
  } else {
    if (input.document !== null) {
      fail('invalid_revision', 'A tombstone cannot contain a live document snapshot');
    }
    if (deletedAt > updatedAt) {
      fail('invalid_revision', 'deletedAt cannot follow the revision updatedAt');
    }
    documentValue = null;
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    scope: Object.freeze({
      accountId: authority.accountId,
      projectId: authority.projectId,
      ownerId: authority.ownerId,
    }),
    documentId,
    revisionId,
    parentRevisionId,
    sequence,
    updatedAt,
    deletedAt,
    document: documentValue,
  });
}

function canonicalRevision(
  authority: CanvasCloudSyncAuthority,
  value: unknown,
): CanvasCloudRevision {
  assertAuthority(authority);
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.scope)) {
    fail('invalid_revision', 'Revision must be a supported cloud revision envelope');
  }
  if (
    value.scope.accountId !== authority.accountId ||
    value.scope.projectId !== authority.projectId ||
    value.scope.ownerId !== authority.ownerId
  ) {
    fail('invalid_authority', 'Revision scope does not match the active authority');
  }

  try {
    return createCanvasCloudRevision(authority, {
      documentId: value.documentId as string,
      revisionId: value.revisionId as string,
      parentRevisionId: value.parentRevisionId as string | null,
      sequence: value.sequence as number,
      updatedAt: value.updatedAt as number,
      deletedAt: value.deletedAt as number | null,
      document: value.document as CanvasDocument | null,
    });
  } catch (error) {
    if (error instanceof CanvasCloudSyncError) throw error;
    fail('invalid_revision', 'Revision envelope could not be validated');
  }
}

function revisionsEqual(left: CanvasCloudRevision, right: CanvasCloudRevision): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conflict(
  reason: CanvasCloudConflictReason,
  local: CanvasCloudRevision,
  remote: CanvasCloudRevision,
): CanvasCloudConflict {
  return Object.freeze({
    kind: 'conflict' as const,
    reason,
    local,
    remote,
    choices: CONFLICT_CHOICES,
    capabilities: MERGE_CAPABILITIES,
  });
}

function merged(
  action: 'up_to_date' | 'keep_local' | 'accept_remote',
  revision: CanvasCloudRevision,
  localSource: CanvasCloudRevision,
): CanvasCloudMergeResult {
  return Object.freeze({
    kind: 'merged' as const,
    action,
    revision,
    localSource,
    capabilities: MERGE_CAPABILITIES,
  });
}

/**
 * Deterministically compare two immutable revision tips. Only a direct,
 * strictly monotonic successor can fast-forward automatically.
 */
export function mergeCanvasCloudRevisions(
  authority: CanvasCloudSyncAuthority,
  local: CanvasCloudRevision,
  remote: CanvasCloudRevision,
): CanvasCloudMergeResult {
  const canonicalLocal = canonicalRevision(authority, local);
  const canonicalRemote = canonicalRevision(authority, remote);
  assertRevisionScope(authority, canonicalLocal);
  assertRevisionScope(authority, canonicalRemote);
  if (canonicalLocal.documentId !== canonicalRemote.documentId) {
    fail('invalid_revision', 'Cannot merge revisions for different Canvas documents');
  }

  if (canonicalLocal.revisionId === canonicalRemote.revisionId) {
    return revisionsEqual(canonicalLocal, canonicalRemote)
      ? merged('up_to_date', canonicalLocal, canonicalLocal)
      : conflict('revision_id_collision', canonicalLocal, canonicalRemote);
  }

  if (canonicalRemote.parentRevisionId === canonicalLocal.revisionId) {
    if (
      canonicalRemote.sequence !== canonicalLocal.sequence + 1 ||
      canonicalRemote.updatedAt < canonicalLocal.updatedAt
    ) {
      return conflict('invalid_revision_chain', canonicalLocal, canonicalRemote);
    }
    if (canonicalLocal.deletedAt !== null && canonicalRemote.deletedAt === null) {
      return conflict('tombstone_update_conflict', canonicalLocal, canonicalRemote);
    }
    return merged('accept_remote', canonicalRemote, canonicalLocal);
  }

  if (canonicalLocal.parentRevisionId === canonicalRemote.revisionId) {
    if (
      canonicalLocal.sequence !== canonicalRemote.sequence + 1 ||
      canonicalLocal.updatedAt < canonicalRemote.updatedAt
    ) {
      return conflict('invalid_revision_chain', canonicalLocal, canonicalRemote);
    }
    if (canonicalRemote.deletedAt !== null && canonicalLocal.deletedAt === null) {
      return conflict('tombstone_update_conflict', canonicalLocal, canonicalRemote);
    }
    return merged('keep_local', canonicalLocal, canonicalLocal);
  }

  if (canonicalLocal.deletedAt !== null || canonicalRemote.deletedAt !== null) {
    return conflict('tombstone_update_conflict', canonicalLocal, canonicalRemote);
  }
  return conflict('divergent_edits', canonicalLocal, canonicalRemote);
}

export function resolveCanvasCloudConflict(
  authority: CanvasCloudSyncAuthority,
  conflictArtifact: CanvasCloudConflict,
  choice: CanvasCloudConflictChoice,
): CanvasCloudConflictResolution {
  if (
    !isRecord(conflictArtifact) ||
    conflictArtifact.kind !== 'conflict' ||
    !CONFLICT_REASONS.includes(conflictArtifact.reason as CanvasCloudConflictReason) ||
    !Array.isArray(conflictArtifact.choices) ||
    conflictArtifact.choices.length !== CONFLICT_CHOICES.length ||
    !CONFLICT_CHOICES.every((value, index) => conflictArtifact.choices[index] === value)
  ) {
    fail('invalid_revision', 'A valid Canvas cloud conflict artifact is required');
  }
  if (!CONFLICT_CHOICES.includes(choice)) {
    fail('invalid_revision', 'An explicit supported conflict choice is required');
  }
  const local = canonicalRevision(authority, conflictArtifact.local);
  const remote = canonicalRevision(authority, conflictArtifact.remote);
  if (local.documentId !== remote.documentId) {
    fail('invalid_revision', 'Conflict revisions must describe the same Canvas document');
  }
  const preserved = Object.freeze([local, remote]) as readonly [
    CanvasCloudRevision,
    CanvasCloudRevision,
  ];
  return Object.freeze({
    choice,
    primary: choice === 'use_remote' ? remote : local,
    preserved,
  });
}

export type CanvasCloudRetryStatus = 'ready' | 'pending' | 'exhausted';

export interface CanvasCloudRetryState {
  readonly operationId: string;
  readonly maxAttempts: number;
  readonly attempt: number;
  readonly status: CanvasCloudRetryStatus;
  readonly idempotencyKey: string;
  readonly nextAttemptAt: number | null;
  readonly lastError: string | null;
}

export interface CreateCanvasCloudRetryInput {
  readonly operationId: string;
  readonly maxAttempts: number;
}

export interface AdvanceCanvasCloudRetryInput {
  readonly now: number;
  readonly error: string;
  readonly baseDelayMs: number;
}

function retryOperationId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ACCOUNT_ID.test(value)) {
    fail('invalid_retry', 'operationId must be a stable non-sensitive id');
  }
  return value;
}

function retryError(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ERROR_LENGTH ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail('invalid_retry', 'retry error must be a bounded printable message');
  }
  return value;
}

function validateRetryState(value: unknown): CanvasCloudRetryState {
  if (!isRecord(value)) {
    fail('invalid_retry', 'Retry state must be a valid object');
  }
  const operationId = retryOperationId(value.operationId);
  const maxAttempts = value.maxAttempts;
  const attempt = value.attempt;
  const status = value.status;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    (maxAttempts as number) < 1 ||
    (maxAttempts as number) > MAX_RETRY_ATTEMPTS ||
    !Number.isSafeInteger(attempt) ||
    (attempt as number) < 0 ||
    (attempt as number) > (maxAttempts as number) ||
    (status !== 'ready' && status !== 'pending' && status !== 'exhausted') ||
    value.idempotencyKey !== `${operationId}:${attempt}`
  ) {
    fail('invalid_retry', 'Retry state metadata is inconsistent');
  }

  const nextAttemptAt = value.nextAttemptAt;
  const lastError = value.lastError;
  if (status === 'ready') {
    if (attempt !== 0 || nextAttemptAt !== null || lastError !== null) {
      fail('invalid_retry', 'Ready retry state must describe the initial attempt');
    }
  } else {
    retryError(lastError);
    if (status === 'pending') {
      if (
        (attempt as number) === 0 ||
        (attempt as number) >= (maxAttempts as number) ||
        !Number.isSafeInteger(nextAttemptAt) ||
        (nextAttemptAt as number) < 0
      ) {
        fail('invalid_retry', 'Pending retry state is inconsistent');
      }
    } else if (attempt !== maxAttempts || nextAttemptAt !== null) {
      fail('invalid_retry', 'Exhausted retry state is inconsistent');
    }
  }

  return Object.freeze({
    operationId,
    maxAttempts: maxAttempts as number,
    attempt: attempt as number,
    status,
    idempotencyKey: value.idempotencyKey as string,
    nextAttemptAt: nextAttemptAt as number | null,
    lastError: lastError as string | null,
  });
}

export function createCanvasCloudRetry(input: CreateCanvasCloudRetryInput): CanvasCloudRetryState {
  const operationId = retryOperationId(input.operationId);
  if (
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1 ||
    input.maxAttempts > MAX_RETRY_ATTEMPTS
  ) {
    fail('invalid_retry', `maxAttempts must be between 1 and ${MAX_RETRY_ATTEMPTS}`);
  }
  return Object.freeze({
    operationId,
    maxAttempts: input.maxAttempts,
    attempt: 0,
    status: 'ready' as const,
    idempotencyKey: `${operationId}:0`,
    nextAttemptAt: null,
    lastError: null,
  });
}

/**
 * Advance retry metadata without performing the operation. Equal inputs yield
 * equal output, providing a deterministic per-attempt idempotency key.
 */
export function advanceCanvasCloudRetry(
  state: CanvasCloudRetryState,
  input: AdvanceCanvasCloudRetryInput,
): CanvasCloudRetryState {
  const current = validateRetryState(state);
  if (current.status === 'exhausted' || current.attempt >= current.maxAttempts) {
    fail('retry_exhausted', 'Canvas cloud-sync retry budget is exhausted');
  }
  const now = safeInteger(input.now, 'retry.now');
  if (
    !Number.isSafeInteger(input.baseDelayMs) ||
    input.baseDelayMs < 1 ||
    input.baseDelayMs > MAX_RETRY_DELAY_MS
  ) {
    fail('invalid_retry', `baseDelayMs must be between 1 and ${MAX_RETRY_DELAY_MS}`);
  }
  const error = retryError(input.error);
  const attempt = current.attempt + 1;
  const exhausted = attempt >= current.maxAttempts;
  const delay = Math.min(MAX_RETRY_DELAY_MS, input.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const nextAttemptAt = exhausted ? null : now + delay;
  if (nextAttemptAt !== null && !Number.isSafeInteger(nextAttemptAt)) {
    fail('invalid_retry', 'Next retry timestamp exceeds safe integer range');
  }
  return Object.freeze({
    operationId: current.operationId,
    maxAttempts: current.maxAttempts,
    attempt,
    status: exhausted ? ('exhausted' as const) : ('pending' as const),
    idempotencyKey: `${current.operationId}:${attempt}`,
    nextAttemptAt,
    lastError: error,
  });
}
