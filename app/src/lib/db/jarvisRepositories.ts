import Dexie from 'dexie';
import type {
  JarvisApproval,
  JarvisArtifact,
  JarvisEvent,
  JarvisRun,
  JarvisRunStatus,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisIdentityRevision } from '@/lib/jarvis/identity';
import type { JarvisProfile } from '@/lib/jarvis/profiles/types';
import { db, type JarvisDexie } from './index';
import {
  fromJarvisApprovalRow,
  fromJarvisArtifactRow,
  fromJarvisEventRow,
  fromJarvisIdentityRevisionRow,
  fromJarvisProfileRow,
  fromJarvisRunRow,
  toJarvisApprovalRow,
  toJarvisArtifactRow,
  toJarvisEventRow,
  toJarvisIdentityRevisionRow,
  toJarvisProfileRow,
  toJarvisRunRow,
  type JarvisProfileMigrationMetadata,
} from './jarvisMappers';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

export interface JarvisIdentityRepository {
  getVersion(identityId: 'jarvis', version: number): Promise<JarvisIdentityRevision | undefined>;
  putIfAbsent(revision: JarvisIdentityRevision): Promise<JarvisIdentityRevision>;
}

export interface JarvisProfileRepository {
  getById(accountId: string, profileId: string): Promise<JarvisProfile | undefined>;
  getActive(accountId: string): Promise<JarvisProfile | undefined>;
  putForAccount(
    accountId: string,
    input: {
      profile: JarvisProfile;
      migration: JarvisProfileMigrationMetadata;
    },
  ): Promise<JarvisProfile>;
  updateCustomInstructions(
    accountId: string,
    profileId: string,
    customInstructions: string,
  ): Promise<JarvisProfile>;
}

export type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

export interface JarvisRunRepository {
  createIdempotent(run: JarvisRun): Promise<JarvisRun>;
  getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  listByAccount(
    accountId: string,
    options?: { statuses?: JarvisRunStatus[]; limit?: number },
  ): Promise<JarvisRun[]>;
  compareAndAppendTransitionEvent(input: {
    accountId: string;
    runId: string;
    expectedStatus: JarvisRunStatus;
    nextStatus: JarvisRunStatus;
    updatedAt: number;
    completedAt?: number;
    event: JarvisRunTransitionEventInput;
  }): Promise<
    { applied: true; run: JarvisRun; event: JarvisEvent } | { applied: false; current: JarvisRun }
  >;
}

export type JarvisNonTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type'> & {
  type: Exclude<JarvisEvent['type'], 'run_state'>;
};

export interface JarvisEventRepository {
  appendIdempotent(
    accountId: string,
    runId: string,
    event: JarvisNonTransitionEventInput,
  ): Promise<JarvisEvent>;
  listByRun(
    accountId: string,
    runId: string,
    options?: { afterSeq?: number; limit?: number },
  ): Promise<JarvisEvent[]>;
}

export interface JarvisApprovalRepository {
  getById(accountId: string, approvalId: string): Promise<JarvisApproval | undefined>;
  putForRun(accountId: string, approval: JarvisApproval): Promise<JarvisApproval>;
}

export interface JarvisArtifactRepository {
  getById(accountId: string, artifactId: string): Promise<JarvisArtifact | undefined>;
  listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifact[]>;
  putForRun(accountId: string, artifact: JarvisArtifact): Promise<JarvisArtifact>;
}

export type JarvisRepositoryErrorCode =
  | 'account_scope_mismatch'
  | 'parent_run_not_found'
  | 'run_id_conflict'
  | 'event_idempotency_conflict'
  | 'transition_event_requires_atomic_run_update'
  | 'profile_integrity_error'
  | 'invalid_limit';

export class JarvisRepositoryError extends Error {
  readonly code: JarvisRepositoryErrorCode;

  constructor(code: JarvisRepositoryErrorCode) {
    super(code);
    this.name = 'JarvisRepositoryError';
    this.code = code;
  }
}

export type JarvisRepositories = {
  identity: JarvisIdentityRepository;
  profile: JarvisProfileRepository;
  run: JarvisRunRepository;
  event: JarvisEventRepository;
  approval: JarvisApprovalRepository;
  artifact: JarvisArtifactRepository;
};

export function newJarvisProfileRevisionId(): string {
  return `jprof_rev_${crypto.randomUUID()}`;
}

function repositoryError(code: JarvisRepositoryErrorCode): never {
  throw new JarvisRepositoryError(code);
}

function assertAccountId(accountId: string): void {
  if (typeof accountId !== 'string' || accountId.length === 0 || accountId !== accountId.trim()) {
    repositoryError('account_scope_mismatch');
  }
}

function normalizedLimit(limit: number | undefined): number {
  const resolved = limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_LIMIT) {
    repositoryError('invalid_limit');
  }
  return resolved;
}

function assertAfterSeq(afterSeq: number | undefined): void {
  if (
    afterSeq !== undefined &&
    (!Number.isSafeInteger(afterSeq) || !Number.isFinite(afterSeq) || afterSeq < 0)
  ) {
    repositoryError('invalid_limit');
  }
}

function assertIdempotencyKey(idempotencyKey: string): void {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    repositoryError('event_idempotency_conflict');
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function normalizeCustomInstructions(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

async function requireOwnedRun(database: JarvisDexie, accountId: string, runId: string) {
  const row = await database.jarvis_runs.get(runId);
  if (!row || row.account_id !== accountId) repositoryError('parent_run_not_found');
  return row;
}

function nextSequence(lastSequence: number | undefined): number {
  const next = (lastSequence ?? 0) + 1;
  if (!Number.isSafeInteger(next)) repositoryError('event_idempotency_conflict');
  return next;
}

export function createJarvisRepositories(
  database: JarvisDexie,
  dependencies: {
    now?: () => number;
    newProfileRevisionId?: () => string;
  } = {},
): JarvisRepositories {
  const now = dependencies.now ?? Date.now;
  const newProfileRevision = dependencies.newProfileRevisionId ?? newJarvisProfileRevisionId;

  const identity: JarvisIdentityRepository = {
    async getVersion(identityId, version) {
      const row = await database.jarvis_identity_revisions
        .where('[identity_id+version]')
        .equals([identityId, version])
        .first();
      return row ? fromJarvisIdentityRevisionRow(row) : undefined;
    },

    async putIfAbsent(revision) {
      const desired = toJarvisIdentityRevisionRow(revision);
      return database.transaction('rw', database.jarvis_identity_revisions, async () => {
        const [byId, byVersion] = await Promise.all([
          database.jarvis_identity_revisions.get(desired.id),
          database.jarvis_identity_revisions
            .where('[identity_id+version]')
            .equals([desired.identity_id, desired.version])
            .first(),
        ]);
        const existing = byId ?? byVersion;
        if (existing) {
          if (
            !valuesEqual(existing, desired) ||
            (byId !== undefined && !valuesEqual(byId, desired)) ||
            (byVersion !== undefined && !valuesEqual(byVersion, desired))
          ) {
            repositoryError('profile_integrity_error');
          }
          return fromJarvisIdentityRevisionRow(existing);
        }
        await database.jarvis_identity_revisions.add(desired);
        return fromJarvisIdentityRevisionRow(desired);
      });
    },
  };

  const profile: JarvisProfileRepository = {
    async getById(accountId, profileId) {
      assertAccountId(accountId);
      const row = await database.jarvis_profiles.get(profileId);
      if (!row || row.account_id !== accountId) return undefined;
      return fromJarvisProfileRow(row).profile;
    },

    async getActive(accountId) {
      assertAccountId(accountId);
      const rows = await database.jarvis_profiles
        .where('[account_id+active]')
        .equals([accountId, 1])
        .toArray();
      if (rows.length > 1) repositoryError('profile_integrity_error');
      return rows[0] ? fromJarvisProfileRow(rows[0]).profile : undefined;
    },

    async putForAccount(accountId, input) {
      assertAccountId(accountId);
      if (input.profile.accountId !== accountId) repositoryError('account_scope_mismatch');
      const desired = toJarvisProfileRow(input);
      return database.transaction('rw', database.jarvis_profiles, async () => {
        const existing = await database.jarvis_profiles.get(desired.id);
        if (existing && existing.account_id !== accountId) {
          repositoryError('account_scope_mismatch');
        }
        if (desired.active === 1) {
          const activeRows = await database.jarvis_profiles
            .where('[account_id+active]')
            .equals([accountId, 1])
            .toArray();
          if (activeRows.some((row) => row.id !== desired.id)) {
            repositoryError('profile_integrity_error');
          }
        }
        await database.jarvis_profiles.put(desired);
        return fromJarvisProfileRow(desired).profile;
      });
    },

    async updateCustomInstructions(accountId, profileId, customInstructions) {
      assertAccountId(accountId);
      const normalized = normalizeCustomInstructions(customInstructions);
      return database.transaction('rw', database.jarvis_profiles, async () => {
        const row = await database.jarvis_profiles.get(profileId);
        if (!row || row.account_id !== accountId) repositoryError('profile_integrity_error');
        const current = fromJarvisProfileRow(row);
        if (normalizeCustomInstructions(current.profile.customInstructions) === normalized) {
          return current.profile;
        }

        const { sourcePromptHash: _sourcePromptHash, ...profileWithoutSourceHash } =
          current.profile;
        const updated: JarvisProfile = {
          ...profileWithoutSourceHash,
          revisionId: newProfileRevision(),
          customInstructions: normalized,
          instructionSource: normalized.length === 0 ? 'none' : 'user',
          updatedAt: now(),
        };
        const updatedRow = toJarvisProfileRow({ profile: updated, migration: current.migration });
        await database.jarvis_profiles.put(updatedRow);
        return fromJarvisProfileRow(updatedRow).profile;
      });
    },
  };

  const run: JarvisRunRepository = {
    async createIdempotent(value) {
      assertAccountId(value.accountId);
      const desired = toJarvisRunRow(value);
      return database.transaction('rw', database.jarvis_runs, async () => {
        if (value.parentRunId !== undefined) {
          await requireOwnedRun(database, value.accountId, value.parentRunId);
        }
        const existing = await database.jarvis_runs.get(value.id);
        if (existing) {
          if (!valuesEqual(existing, desired)) repositoryError('run_id_conflict');
          return fromJarvisRunRow(existing);
        }
        await database.jarvis_runs.add(desired);
        return fromJarvisRunRow(desired);
      });
    },

    async getById(accountId, runId) {
      assertAccountId(accountId);
      const row = await database.jarvis_runs.get(runId);
      if (!row || row.account_id !== accountId) return undefined;
      return fromJarvisRunRow(row);
    },

    async listByAccount(accountId, options = {}) {
      assertAccountId(accountId);
      const limit = normalizedLimit(options.limit);
      const statuses = options.statuses ? new Set(options.statuses) : undefined;
      if (statuses?.size === 0) return [];
      let collection = database.jarvis_runs
        .where('[account_id+updated_at]')
        .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey], true, true)
        .reverse();
      if (statuses) collection = collection.filter((row) => statuses.has(row.status));
      const rows = await collection.limit(limit).toArray();
      return rows.map(fromJarvisRunRow);
    },

    async compareAndAppendTransitionEvent(input) {
      assertAccountId(input.accountId);
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        const row = await requireOwnedRun(database, input.accountId, input.runId);
        const current = fromJarvisRunRow(row);
        if (current.status !== input.expectedStatus) {
          return { applied: false as const, current };
        }
        assertIdempotencyKey(input.event.idempotencyKey);

        const { completedAt: _completedAt, ...withoutCompletedAt } = current;
        const updated: JarvisRun = {
          ...withoutCompletedAt,
          status: input.nextStatus,
          updatedAt: input.updatedAt,
          ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
        };
        const updatedRow = toJarvisRunRow(updated);
        const lastEvent = await database.jarvis_events
          .where('[run_id+seq]')
          .between([input.runId, Dexie.minKey], [input.runId, Dexie.maxKey], true, true)
          .last();
        const event: JarvisEvent = {
          ...input.event,
          runId: input.runId,
          seq: nextSequence(lastEvent?.seq),
          type: 'run_state',
          status: input.nextStatus,
        };
        const eventRow = toJarvisEventRow(event);
        await database.jarvis_runs.put(updatedRow);
        await database.jarvis_events.add(eventRow);
        return {
          applied: true as const,
          run: fromJarvisRunRow(updatedRow),
          event: fromJarvisEventRow(eventRow),
        };
      });
    },
  };

  const event: JarvisEventRepository = {
    async appendIdempotent(accountId, runId, input) {
      assertAccountId(accountId);
      if ((input as { type: JarvisEvent['type'] }).type === 'run_state') {
        repositoryError('transition_event_requires_atomic_run_update');
      }
      assertIdempotencyKey(input.idempotencyKey);
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        await requireOwnedRun(database, accountId, runId);
        const existing = await database.jarvis_events
          .where('[run_id+idempotency_key]')
          .equals([runId, input.idempotencyKey])
          .first();
        if (existing) {
          const desiredRetry = toJarvisEventRow({ ...input, runId, seq: existing.seq });
          if (!valuesEqual(existing, desiredRetry)) {
            repositoryError('event_idempotency_conflict');
          }
          return fromJarvisEventRow(existing);
        }

        const lastEvent = await database.jarvis_events
          .where('[run_id+seq]')
          .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
          .last();
        const value: JarvisEvent = {
          ...input,
          runId,
          seq: nextSequence(lastEvent?.seq),
        };
        const row = toJarvisEventRow(value);
        await database.jarvis_events.add(row);
        return fromJarvisEventRow(row);
      });
    },

    async listByRun(accountId, runId, options = {}) {
      assertAccountId(accountId);
      const limit = normalizedLimit(options.limit);
      assertAfterSeq(options.afterSeq);
      await requireOwnedRun(database, accountId, runId);
      if (options.afterSeq !== undefined) {
        const rows = await database.jarvis_events
          .where('[run_id+seq]')
          .between([runId, options.afterSeq], [runId, Dexie.maxKey], false, true)
          .limit(limit)
          .toArray();
        return rows.map(fromJarvisEventRow);
      }

      const rows = await database.jarvis_events
        .where('[run_id+seq]')
        .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
        .reverse()
        .limit(limit)
        .toArray();
      rows.reverse();
      return rows.map(fromJarvisEventRow);
    },
  };

  const approval: JarvisApprovalRepository = {
    async getById(accountId, approvalId) {
      assertAccountId(accountId);
      const row = await database.jarvis_approvals.get(approvalId);
      if (!row) return undefined;
      const parent = await database.jarvis_runs.get(row.run_id);
      if (!parent || parent.account_id !== accountId) return undefined;
      return fromJarvisApprovalRow(row);
    },

    async putForRun(accountId, value) {
      assertAccountId(accountId);
      return database.transaction(
        'rw',
        database.jarvis_runs,
        database.jarvis_approvals,
        async () => {
          await requireOwnedRun(database, accountId, value.runId);
          const existing = await database.jarvis_approvals.get(value.id);
          if (existing && existing.run_id !== value.runId) {
            repositoryError('parent_run_not_found');
          }
          const row = toJarvisApprovalRow(value);
          await database.jarvis_approvals.put(row);
          return fromJarvisApprovalRow(row);
        },
      );
    },
  };

  const artifact: JarvisArtifactRepository = {
    async getById(accountId, artifactId) {
      assertAccountId(accountId);
      const row = await database.jarvis_artifacts.get(artifactId);
      if (!row) return undefined;
      const parent = await database.jarvis_runs.get(row.run_id);
      if (!parent || parent.account_id !== accountId) return undefined;
      return fromJarvisArtifactRow(row);
    },

    async listByRun(accountId, runId, inputLimit) {
      assertAccountId(accountId);
      const limit = normalizedLimit(inputLimit);
      await requireOwnedRun(database, accountId, runId);
      const rows = await database.jarvis_artifacts
        .where('run_id')
        .equals(runId)
        .limit(limit)
        .toArray();
      return rows.map(fromJarvisArtifactRow);
    },

    async putForRun(accountId, value) {
      assertAccountId(accountId);
      return database.transaction(
        'rw',
        database.jarvis_runs,
        database.jarvis_artifacts,
        async () => {
          await requireOwnedRun(database, accountId, value.runId);
          const existing = await database.jarvis_artifacts.get(value.id);
          if (existing && existing.run_id !== value.runId) {
            repositoryError('parent_run_not_found');
          }
          const row = toJarvisArtifactRow(value);
          await database.jarvis_artifacts.put(row);
          return fromJarvisArtifactRow(row);
        },
      );
    },
  };

  return { identity, profile, run, event, approval, artifact };
}

const globalRepositories = createJarvisRepositories(db);

export const jarvisIdentityRepo: JarvisIdentityRepository = globalRepositories.identity;
export const jarvisProfileRepo: JarvisProfileRepository = globalRepositories.profile;
export const jarvisRunRepo: JarvisRunRepository = globalRepositories.run;
export const jarvisEventRepo: JarvisEventRepository = globalRepositories.event;
export const jarvisApprovalRepo: JarvisApprovalRepository = globalRepositories.approval;
export const jarvisArtifactRepo: JarvisArtifactRepository = globalRepositories.artifact;
