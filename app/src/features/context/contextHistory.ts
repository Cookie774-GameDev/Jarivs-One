export const CONTEXT_RECOVERY_ACTIONS = Object.freeze([
  'restore_context_note_revision',
  'restore_deleted_context_note',
  'restore_property_change',
  'restore_generated_link_change',
  'recover_interrupted_edit',
  'restore_source',
] as const);

export type ContextRecoveryAction = (typeof CONTEXT_RECOVERY_ACTIONS)[number];
export type ContextRevisionTargetKind =
  | 'context_note'
  | 'deleted_context_note'
  | 'property'
  | 'generated_link'
  | 'interrupted_edit'
  | 'source_file';

export type ContextRecoveryEvidence =
  | { kind: 'context_revision' }
  | { kind: 'git_commit'; repositoryId: string; commitSha: string }
  | {
      kind: 'bounded_snapshot';
      snapshotId: string;
      checksum: string;
      byteSize: number;
    }
  | { kind: 'indexed_revision' };

export interface ContextRevisionInput {
  id: string;
  accountId: string;
  target: { kind: ContextRevisionTargetKind; id: string };
  timestamp: number;
  author: { kind: 'user' | 'jarvis' | 'system'; id: string };
  source: { kind: 'local_edit' | 'sync' | 'generated' | 'recovery'; id: string };
  beforeHash: string | null;
  afterHash: string | null;
  diff: string;
  recoveryAction: ContextRecoveryAction;
  recoveryEvidence: ContextRecoveryEvidence;
}

export type ContextRevision = Readonly<ContextRevisionInput>;

export interface ContextHistoryLedger {
  version: 1;
  accountId: string;
  updatedAt: number;
  revisions: ReadonlyArray<ContextRevision>;
}

export interface ContextHistoryStoragePolicy {
  maxRevisions: number;
  maxSnapshots: number;
  maxSnapshotBytes: number;
  maxTotalSnapshotBytes: number;
}

export interface ContextRecoveryAuthority {
  kind: 'direct_user_action';
  accountId: string;
  requestId: string;
}

export interface ContextRecoveryAvailability {
  git: {
    hasCommit(accountId: string, repositoryId: string, commitSha: string): boolean;
  };
  snapshot: {
    hasSnapshot(accountId: string, snapshotId: string, checksum: string, byteSize: number): boolean;
  };
}

export type ContextRecoveryPlan =
  | {
      action:
        | Exclude<ContextRecoveryAction, 'restore_source'>
        | 'restore_source_from_git'
        | 'restore_source_from_snapshot';
      revisionId: string;
      accountId: string;
      targetId: string;
      restorable: true;
      authorization: 'direct_user_action';
      requestId: string;
      executable: false;
    }
  | {
      action: 'cannot_restore_source';
      revisionId: string;
      accountId: string;
      targetId: string;
      restorable: false;
      reason: 'no_git_commit_or_backup' | 'evidence_unavailable';
      authorization: 'direct_user_action';
      requestId: string;
      executable: false;
    };

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const FORBIDDEN_LINE =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const FORBIDDEN_DIFF =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_REVISIONS = 100;
const MAX_DIFF_CHARS = 100_000;
const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_SNAPSHOT_BYTES = 1024 * 1024 * 1024;
const MAX_BOUNDARY_DEPTH = 6;
const MAX_BOUNDARY_NODES = 2_000;
const MAX_BOUNDARY_KEYS = 16;
const MAX_BOUNDARY_STRING_CHARS = 11_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid Context history ${reason}.`);
}

function safeLine(value: unknown, reason: string, maximum = 300): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN_LINE.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeLine(value, reason);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function timestamp(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function assertClosedBoundary(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, stringChars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_BOUNDARY_NODES) fail(reason);
  if (typeof value === 'string') {
    if (value.length > MAX_DIFF_CHARS) fail(reason);
    budget.stringChars += value.length;
    if (budget.stringChars > MAX_BOUNDARY_STRING_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (depth > MAX_BOUNDARY_DEPTH) fail(reason);
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.length > MAX_BOUNDARY_KEYS && !Array.isArray(value)) fail(reason);
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_REVISIONS) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosedBoundary(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosedBoundary(descriptor.value, reason, depth + 1, budget);
  }
}

function cloneBoundary<T>(value: T, reason: string): T {
  try {
    assertClosedBoundary(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], reason: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(reason);
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function safeHash(value: unknown, reason: string): string | null {
  if (value === null) return null;
  const hash = safeLine(value, reason, 64).toLocaleLowerCase('en-US');
  if (!HASH.test(hash)) fail(reason);
  return hash;
}

function parseEvidence(value: unknown): Readonly<ContextRecoveryEvidence> {
  const evidence = record(value, 'recovery evidence');
  if (evidence.kind === 'context_revision' || evidence.kind === 'indexed_revision') {
    exact(evidence, ['kind'], 'recovery evidence');
    return Object.freeze({ kind: evidence.kind });
  }
  if (evidence.kind === 'git_commit') {
    exact(evidence, ['kind', 'repositoryId', 'commitSha'], 'recovery evidence');
    const commitSha = safeLine(evidence.commitSha, 'Git commit', 64).toLocaleLowerCase('en-US');
    if (!GIT_SHA.test(commitSha)) fail('Git commit');
    return Object.freeze({
      kind: 'git_commit',
      repositoryId: stableId(evidence.repositoryId, 'repository ID'),
      commitSha,
    });
  }
  if (evidence.kind === 'bounded_snapshot') {
    exact(evidence, ['kind', 'snapshotId', 'checksum', 'byteSize'], 'recovery evidence');
    const checksum = safeHash(evidence.checksum, 'snapshot checksum');
    if (checksum === null) fail('snapshot checksum');
    if (
      !Number.isSafeInteger(evidence.byteSize) ||
      (evidence.byteSize as number) < 0 ||
      (evidence.byteSize as number) > MAX_SNAPSHOT_BYTES
    ) {
      fail('snapshot byte size');
    }
    return Object.freeze({
      kind: 'bounded_snapshot',
      snapshotId: stableId(evidence.snapshotId, 'snapshot ID'),
      checksum,
      byteSize: evidence.byteSize as number,
    });
  }
  return fail('recovery evidence');
}

const ACTION_BY_TARGET: Record<
  Exclude<ContextRevisionTargetKind, 'source_file'>,
  ContextRecoveryAction
> = {
  context_note: 'restore_context_note_revision',
  deleted_context_note: 'restore_deleted_context_note',
  property: 'restore_property_change',
  generated_link: 'restore_generated_link_change',
  interrupted_edit: 'recover_interrupted_edit',
};

export function buildContextRevision(raw: ContextRevisionInput): ContextRevision {
  const revision = record(cloneBoundary(raw, 'revision'), 'revision');
  exact(
    revision,
    [
      'id',
      'accountId',
      'target',
      'timestamp',
      'author',
      'source',
      'beforeHash',
      'afterHash',
      'diff',
      'recoveryAction',
      'recoveryEvidence',
    ],
    'revision',
  );
  const target = record(revision.target, 'target');
  exact(target, ['kind', 'id'], 'target');
  const targetKinds: readonly ContextRevisionTargetKind[] = [
    'context_note',
    'deleted_context_note',
    'property',
    'generated_link',
    'interrupted_edit',
    'source_file',
  ];
  if (!targetKinds.includes(target.kind as ContextRevisionTargetKind)) fail('target');
  const targetKind = target.kind as ContextRevisionTargetKind;
  if (!(CONTEXT_RECOVERY_ACTIONS as readonly unknown[]).includes(revision.recoveryAction)) {
    fail('recovery action');
  }
  const action = revision.recoveryAction as ContextRecoveryAction;
  if (
    (targetKind === 'source_file' && action !== 'restore_source') ||
    (targetKind !== 'source_file' && ACTION_BY_TARGET[targetKind] !== action)
  ) {
    fail('recovery action');
  }
  const evidence = parseEvidence(revision.recoveryEvidence);
  if (
    (targetKind === 'source_file' && evidence.kind === 'context_revision') ||
    (targetKind !== 'source_file' && evidence.kind !== 'context_revision')
  ) {
    fail('recovery evidence');
  }
  const author = record(revision.author, 'author');
  exact(author, ['kind', 'id'], 'author');
  if (author.kind !== 'user' && author.kind !== 'jarvis' && author.kind !== 'system') {
    fail('author');
  }
  const source = record(revision.source, 'source');
  exact(source, ['kind', 'id'], 'source');
  if (
    source.kind !== 'local_edit' &&
    source.kind !== 'sync' &&
    source.kind !== 'generated' &&
    source.kind !== 'recovery'
  ) {
    fail('source');
  }
  const beforeHash = safeHash(revision.beforeHash, 'before hash');
  const afterHash = safeHash(revision.afterHash, 'after hash');
  if (beforeHash === null && afterHash === null) fail('hash');
  if (beforeHash !== null && beforeHash === afterHash) fail('hash');
  const diff = revision.diff;
  if (
    typeof diff !== 'string' ||
    diff.length === 0 ||
    diff.length > MAX_DIFF_CHARS ||
    diff.includes('\r') ||
    FORBIDDEN_DIFF.test(diff)
  ) {
    fail('diff');
  }
  return Object.freeze({
    id: stableId(revision.id, 'revision ID'),
    accountId: stableId(revision.accountId, 'account ID'),
    target: Object.freeze({
      kind: targetKind,
      id: stableId(target.id, 'target ID'),
    }),
    timestamp: timestamp(revision.timestamp, 'timestamp'),
    author: Object.freeze({
      kind: author.kind,
      id: stableId(author.id, 'author ID'),
    }),
    source: Object.freeze({
      kind: source.kind,
      id: stableId(source.id, 'source ID'),
    }),
    beforeHash,
    afterHash,
    diff,
    recoveryAction: action,
    recoveryEvidence: evidence,
  });
}

function parseLedger(raw: ContextHistoryLedger): ContextHistoryLedger {
  const ledger = record(cloneBoundary(raw, 'ledger'), 'ledger');
  exact(ledger, ['version', 'accountId', 'updatedAt', 'revisions'], 'ledger');
  if (ledger.version !== 1 || !Array.isArray(ledger.revisions)) fail('ledger');
  if (ledger.revisions.length > MAX_REVISIONS) fail('ledger');
  const accountId = stableId(ledger.accountId, 'account ID');
  const updatedAt = timestamp(ledger.updatedAt, 'ledger timestamp');
  const revisions = ledger.revisions.map((rawRevision) =>
    buildContextRevision(rawRevision as ContextRevisionInput),
  );
  const ids = new Set<string>();
  let previous = 0;
  for (const revision of revisions) {
    if (revision.accountId !== accountId) fail('account scope');
    if (ids.has(revision.id)) fail('duplicate revision');
    if (revision.timestamp < previous || revision.timestamp > updatedAt) fail('timestamp');
    ids.add(revision.id);
    previous = revision.timestamp;
  }
  return Object.freeze({
    version: 1,
    accountId,
    updatedAt,
    revisions: Object.freeze(revisions),
  });
}

export function createContextHistoryLedger(accountId: string): ContextHistoryLedger {
  return parseLedger({
    version: 1,
    accountId: stableId(accountId, 'account ID'),
    updatedAt: 0,
    revisions: [],
  });
}

function parsePolicy(raw: ContextHistoryStoragePolicy): ContextHistoryStoragePolicy {
  const policy = record(cloneBoundary(raw, 'storage policy'), 'storage policy');
  exact(
    policy,
    ['maxRevisions', 'maxSnapshots', 'maxSnapshotBytes', 'maxTotalSnapshotBytes'],
    'storage policy',
  );
  const integer = (value: unknown, maximum: number, reason: string) => {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
      fail(reason);
    }
    return value as number;
  };
  const maxSnapshotBytes = integer(policy.maxSnapshotBytes, MAX_SNAPSHOT_BYTES, 'snapshot policy');
  const maxTotalSnapshotBytes = integer(
    policy.maxTotalSnapshotBytes,
    MAX_TOTAL_SNAPSHOT_BYTES,
    'snapshot policy',
  );
  if (maxSnapshotBytes > maxTotalSnapshotBytes) fail('snapshot policy');
  return {
    maxRevisions: integer(policy.maxRevisions, MAX_REVISIONS, 'revision policy'),
    maxSnapshots: integer(policy.maxSnapshots, MAX_REVISIONS, 'snapshot policy'),
    maxSnapshotBytes,
    maxTotalSnapshotBytes,
  };
}

export function appendContextRevision(
  rawLedger: ContextHistoryLedger,
  rawRevision: ContextRevisionInput,
  rawPolicy: ContextHistoryStoragePolicy,
): ContextHistoryLedger {
  const ledger = parseLedger(rawLedger);
  const revision = buildContextRevision(rawRevision);
  const policy = parsePolicy(rawPolicy);
  if (revision.accountId !== ledger.accountId) fail('account scope');
  if (revision.timestamp < ledger.updatedAt) fail('timestamp');
  if (ledger.revisions.some(({ id }) => id === revision.id)) fail('duplicate revision');
  if (ledger.revisions.length >= policy.maxRevisions) fail('revision policy');
  const revisions = [...ledger.revisions, revision];
  const snapshots = revisions
    .map(({ recoveryEvidence }) => recoveryEvidence)
    .filter(
      (evidence): evidence is Extract<ContextRecoveryEvidence, { kind: 'bounded_snapshot' }> =>
        evidence.kind === 'bounded_snapshot',
    );
  if (
    snapshots.length > policy.maxSnapshots ||
    snapshots.some(({ byteSize }) => byteSize > policy.maxSnapshotBytes) ||
    snapshots.reduce((total, { byteSize }) => total + byteSize, 0) > policy.maxTotalSnapshotBytes
  ) {
    fail('snapshot policy');
  }
  return parseLedger({
    version: 1,
    accountId: ledger.accountId,
    updatedAt: revision.timestamp,
    revisions,
  });
}

export function planContextRecovery(
  rawRevision: ContextRevision,
  rawAuthority: ContextRecoveryAuthority,
  availability: ContextRecoveryAvailability,
): Readonly<ContextRecoveryPlan> {
  const revision = buildContextRevision(rawRevision);
  const authority = record(cloneBoundary(rawAuthority, 'authority'), 'authority');
  exact(authority, ['kind', 'accountId', 'requestId'], 'authority');
  if (authority.kind !== 'direct_user_action') fail('authority');
  const accountId = stableId(authority.accountId, 'authority account ID');
  if (accountId !== revision.accountId) fail('authority account scope');
  const requestId = stableId(authority.requestId, 'request ID');
  if (
    !availability ||
    typeof availability !== 'object' ||
    typeof availability.git?.hasCommit !== 'function' ||
    typeof availability.snapshot?.hasSnapshot !== 'function'
  ) {
    fail('recovery availability');
  }
  const common = {
    revisionId: revision.id,
    accountId,
    targetId: revision.target.id,
    authorization: 'direct_user_action' as const,
    requestId,
    executable: false as const,
  };
  if (revision.target.kind !== 'source_file') {
    return Object.freeze({
      action: revision.recoveryAction as Exclude<ContextRecoveryAction, 'restore_source'>,
      ...common,
      restorable: true,
    });
  }
  if (revision.recoveryEvidence.kind === 'git_commit') {
    if (
      availability.git.hasCommit(
        accountId,
        revision.recoveryEvidence.repositoryId,
        revision.recoveryEvidence.commitSha,
      )
    ) {
      return Object.freeze({
        action: 'restore_source_from_git',
        ...common,
        restorable: true,
      });
    }
    return Object.freeze({
      action: 'cannot_restore_source',
      ...common,
      restorable: false,
      reason: 'evidence_unavailable',
    });
  }
  if (revision.recoveryEvidence.kind === 'bounded_snapshot') {
    if (
      availability.snapshot.hasSnapshot(
        accountId,
        revision.recoveryEvidence.snapshotId,
        revision.recoveryEvidence.checksum,
        revision.recoveryEvidence.byteSize,
      )
    ) {
      return Object.freeze({
        action: 'restore_source_from_snapshot',
        ...common,
        restorable: true,
      });
    }
    return Object.freeze({
      action: 'cannot_restore_source',
      ...common,
      restorable: false,
      reason: 'evidence_unavailable',
    });
  }
  return Object.freeze({
    action: 'cannot_restore_source',
    ...common,
    restorable: false,
    reason: 'no_git_commit_or_backup',
  });
}
