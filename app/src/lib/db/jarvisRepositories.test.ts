import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type {
  JarvisApproval,
  JarvisArtifact,
  JarvisEvent,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisIdentityRevision } from '@/lib/jarvis/identity';
import type { JarvisProfile } from '@/lib/jarvis/profiles/types';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import {
  toJarvisEventRow,
  toJarvisProfileRow,
  toJarvisRunRow,
  type JarvisProfileMigrationMetadata,
} from './jarvisMappers';
import {
  JarvisRepositoryError,
  createJarvisRepositories,
  jarvisApprovalRepo,
  jarvisArtifactRepo,
  jarvisEventRepo,
  jarvisIdentityRepo,
  jarvisProfileRepo,
  jarvisRunRepo,
  newJarvisProfileRevisionId,
} from './jarvisRepositories';

const NOW = 1_786_100_000_000;
const openedDatabases: JarvisDexie[] = [];

const CLEAN_MIGRATION: JarvisProfileMigrationMetadata = {
  migrationVersion: 3,
  migrationSource: 'clean_default',
  migrationCompletedAt: NOW - 100,
};

type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;
type JarvisNonTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type'> & {
  type: Exclude<JarvisEvent['type'], 'run_state'>;
};

type ExpectedJarvisRepositories = {
  identity: {
    getVersion(identityId: 'jarvis', version: number): Promise<JarvisIdentityRevision | undefined>;
    putIfAbsent(revision: JarvisIdentityRevision): Promise<JarvisIdentityRevision>;
  };
  profile: {
    getById(accountId: string, profileId: string): Promise<JarvisProfile | undefined>;
    getActive(accountId: string): Promise<JarvisProfile | undefined>;
    putForAccount(
      accountId: string,
      input: { profile: JarvisProfile; migration: JarvisProfileMigrationMetadata },
    ): Promise<JarvisProfile>;
    updateCustomInstructions(
      accountId: string,
      profileId: string,
      customInstructions: string,
    ): Promise<JarvisProfile>;
  };
  run: {
    createIdempotent(run: JarvisRun): Promise<JarvisRun>;
    getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
    listByAccount(
      accountId: string,
      options?: { statuses?: JarvisRun['status'][]; limit?: number },
    ): Promise<JarvisRun[]>;
    compareAndAppendTransitionEvent(input: {
      accountId: string;
      runId: string;
      expectedStatus: JarvisRun['status'];
      nextStatus: JarvisRun['status'];
      updatedAt: number;
      completedAt?: number;
      event: JarvisRunTransitionEventInput;
    }): Promise<
      { applied: true; run: JarvisRun; event: JarvisEvent } | { applied: false; current: JarvisRun }
    >;
  };
  event: {
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
  };
  approval: {
    getById(accountId: string, approvalId: string): Promise<JarvisApproval | undefined>;
    putForRun(accountId: string, approval: JarvisApproval): Promise<JarvisApproval>;
  };
  artifact: {
    getById(accountId: string, artifactId: string): Promise<JarvisArtifact | undefined>;
    listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifact[]>;
    putForRun(accountId: string, artifact: JarvisArtifact): Promise<JarvisArtifact>;
  };
};

function runFixture(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-alpha',
    accountId: 'account-alpha',
    workspaceId: 'workspace-alpha',
    projectId: 'project-alpha',
    chatId: 'chat-alpha',
    source: 'typed_chat',
    status: 'queued',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-revision-alpha',
    model: {
      connectionId: 'connection-alpha',
      providerId: 'provider-alpha',
      modelId: 'model-alpha',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      effectiveTemperature: 0.4,
      capturedAt: NOW - 20,
    },
    createdAt: NOW - 10,
    updatedAt: NOW - 10,
    ...overrides,
  };
}

function profileFixture(overrides: Partial<JarvisProfile> = {}): JarvisProfile {
  return {
    id: 'profile-alpha',
    revisionId: 'profile-revision-alpha',
    accountId: 'account-alpha',
    name: 'Jarvis',
    customInstructions: 'Keep responses concise.',
    instructionSource: 'user',
    memoryScope: 'profile',
    voiceEnabled: true,
    active: true,
    identityVersion: 1,
    soulRevisionId: 'soul-alpha',
    sourcePromptHash: 'source-hash-alpha',
    createdAt: NOW - 100,
    updatedAt: NOW - 50,
    ...overrides,
  };
}

function nonTransitionEventFixture(
  overrides: Partial<JarvisNonTransitionEventInput> = {},
): JarvisNonTransitionEventInput {
  return {
    idempotencyKey: 'event-key-alpha',
    type: 'message',
    status: 'visible',
    title: 'Assistant message committed',
    safeSummary: 'A safe summary.',
    sourceRefs: [
      {
        id: 'source-alpha',
        kind: 'user_message',
        label: 'Prompt',
        accountId: 'account-alpha',
        projectId: 'project-alpha',
        trust: 'user_direct',
        sensitivity: 'private',
        observedAt: NOW - 5,
        contentHash: 'content-hash-alpha',
      },
    ],
    artifactIds: ['artifact-alpha'],
    createdAt: NOW,
    ...overrides,
  };
}

function transitionEventFixture(
  overrides: Partial<JarvisRunTransitionEventInput> = {},
): JarvisRunTransitionEventInput {
  return {
    idempotencyKey: 'transition-key-alpha',
    title: 'Run state changed',
    safeSummary: 'The canonical run state changed.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: NOW,
    ...overrides,
  };
}

function approvalFixture(overrides: Partial<JarvisApproval> = {}): JarvisApproval {
  return {
    id: 'approval-alpha',
    runId: 'run-alpha',
    actionId: 'action-alpha',
    actionVersion: 1,
    params: { path: 'C:/safe/file.txt', nested: { overwrite: false } },
    secretHandleRefs: [{ field: 'token', handleId: 'secret-handle-alpha' }],
    paramsHash: 'params-hash-alpha',
    targetSnapshot: { kind: 'file', path: 'C:/safe/file.txt' },
    risk: 'confirm',
    status: 'pending',
    createdAt: NOW,
    ...overrides,
  };
}

function artifactFixture(overrides: Partial<JarvisArtifact> = {}): JarvisArtifact {
  return {
    id: 'artifact-alpha',
    runId: 'run-alpha',
    kind: 'file',
    title: 'Generated file',
    uri: 'file:///C:/safe/file.txt',
    mimeType: 'text/plain',
    safeSummary: 'Generated text file.',
    sourceRefs: [],
    createdAt: NOW,
    ...overrides,
  };
}

async function openTestDb(prefix: string): Promise<JarvisDexie> {
  const db = createJarvisDb(uniqueTestDbName(prefix), TEST_INDEXED_DB);
  openedDatabases.push(db);
  await db.open();
  return db;
}

async function expectRepositoryError(
  action: Promise<unknown>,
  code: JarvisRepositoryError['code'],
): Promise<void> {
  await expect(action).rejects.toMatchObject({
    name: 'JarvisRepositoryError',
    code,
    message: code,
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (openedDatabases.length > 0) {
    const db = openedDatabases.pop();
    if (!db) continue;
    db.close();
    await db.delete();
  }
});

describe('Jarvis repository surface', () => {
  it('exports the exact context-bound factory, safe error union, revision ID, and global projections', () => {
    expectTypeOf(createJarvisRepositories).toEqualTypeOf<
      (
        db: JarvisDexie,
        dependencies?: {
          now?: () => number;
          newProfileRevisionId?: () => string;
        },
      ) => ExpectedJarvisRepositories
    >();
    expectTypeOf<JarvisRepositoryError['code']>().toEqualTypeOf<
      | 'account_scope_mismatch'
      | 'parent_run_not_found'
      | 'run_id_conflict'
      | 'event_idempotency_conflict'
      | 'transition_event_requires_atomic_run_update'
      | 'profile_integrity_error'
      | 'invalid_limit'
    >();
    expect(newJarvisProfileRevisionId()).toMatch(
      /^jprof_rev_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Object.keys(jarvisIdentityRepo).sort()).toEqual(['getVersion', 'putIfAbsent']);
    expect(Object.keys(jarvisProfileRepo).sort()).toEqual([
      'getActive',
      'getById',
      'putForAccount',
      'updateCustomInstructions',
    ]);
    expect(Object.keys(jarvisRunRepo).sort()).toEqual([
      'compareAndAppendTransitionEvent',
      'createIdempotent',
      'getById',
      'listByAccount',
    ]);
    expect(Object.keys(jarvisEventRepo).sort()).toEqual(['appendIdempotent', 'listByRun']);
    expect(Object.keys(jarvisApprovalRepo).sort()).toEqual(['getById', 'putForRun']);
    expect(Object.keys(jarvisArtifactRepo).sort()).toEqual(['getById', 'listByRun', 'putForRun']);
  });
});

describe('Jarvis identity and account-scoped run repositories', () => {
  it('puts an identity revision once and reads it by the protected identity/version pair', async () => {
    const db = await openTestDb('jarvis-repositories-identity');
    const repositories = createJarvisRepositories(db);
    const revision: JarvisIdentityRevision = {
      id: 'jident_jarvis_v1',
      identityId: 'jarvis',
      version: 1,
      coreHash: 'core-hash',
      responseContractHash: 'response-hash',
      createdAt: NOW,
    };

    expect(await repositories.identity.putIfAbsent(revision)).toEqual(revision);
    expect(await repositories.identity.putIfAbsent(structuredClone(revision))).toEqual(revision);
    expect(await repositories.identity.getVersion('jarvis', 1)).toEqual(revision);
    expect(await db.jarvis_identity_revisions.count()).toBe(1);
  });

  it('rejects a changed identity row under either the same ID or protected version', async () => {
    const db = await openTestDb('jarvis-repositories-identity-conflict');
    const repositories = createJarvisRepositories(db);
    const revision: JarvisIdentityRevision = {
      id: 'jident_jarvis_v1',
      identityId: 'jarvis',
      version: 1,
      coreHash: 'core-hash',
      responseContractHash: 'response-hash',
      createdAt: NOW,
    };
    await repositories.identity.putIfAbsent(revision);

    await expectRepositoryError(
      repositories.identity.putIfAbsent({ ...revision, coreHash: 'changed-core-hash' }),
      'profile_integrity_error',
    );
    await expectRepositoryError(
      repositories.identity.putIfAbsent({ ...revision, id: 'different-id' }),
      'profile_integrity_error',
    );
    expect(await db.jarvis_identity_revisions.count()).toBe(1);
  });

  it('fails closed for malformed account IDs and caller-supplied account disagreements', async () => {
    const db = await openTestDb('jarvis-repositories-account-validation');
    const repositories = createJarvisRepositories(db);

    for (const accountId of ['', ' ', ' account-alpha', 'account-alpha ']) {
      await expectRepositoryError(
        repositories.run.createIdempotent(runFixture({ id: `run-${accountId}`, accountId })),
        'account_scope_mismatch',
      );
      await expectRepositoryError(
        repositories.run.listByAccount(accountId),
        'account_scope_mismatch',
      );
      await expectRepositoryError(
        repositories.profile.getActive(accountId),
        'account_scope_mismatch',
      );
    }

    await expectRepositoryError(
      repositories.profile.putForAccount('account-beta', {
        profile: profileFixture({ accountId: 'account-alpha' }),
        migration: CLEAN_MIGRATION,
      }),
      'account_scope_mismatch',
    );
  });

  it('keeps direct account-scoped reads and lists isolated without becoming an existence oracle', async () => {
    const db = await openTestDb('jarvis-repositories-account-oracle');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    const profile = profileFixture();
    await repositories.run.createIdempotent(run);
    await repositories.profile.putForAccount(profile.accountId, {
      profile,
      migration: CLEAN_MIGRATION,
    });

    expect(await repositories.run.getById('account-beta', run.id)).toBeUndefined();
    expect(await repositories.run.getById('account-beta', 'missing-run')).toBeUndefined();
    expect(await repositories.profile.getById('account-beta', profile.id)).toBeUndefined();
    expect(await repositories.profile.getById('account-beta', 'missing-profile')).toBeUndefined();
    expect(await repositories.run.listByAccount('account-beta')).toEqual([]);
    expect(await repositories.profile.getActive('account-beta')).toBeUndefined();
  });

  it('uses the caller run ID, returns an exact retry, and rejects any complete-row conflict', async () => {
    const db = await openTestDb('jarvis-repositories-run-idempotency');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();

    const created = await repositories.run.createIdempotent(run);
    const repeated = await repositories.run.createIdempotent(structuredClone(run));
    expect(created).toEqual(run);
    expect(repeated).toEqual(run);
    expect(repeated.id).toBe(run.id);
    expect(await db.jarvis_runs.count()).toBe(1);

    await expectRepositoryError(
      repositories.run.createIdempotent({
        ...structuredClone(run),
        model: { ...structuredClone(run.model), capabilities: { tools: false, vision: false } },
      }),
      'run_id_conflict',
    );
    expect(await db.jarvis_runs.get(run.id)).toEqual(toJarvisRunRow(run));
  });

  it('treats missing and foreign parent runs alike while accepting a same-account parent', async () => {
    const db = await openTestDb('jarvis-repositories-run-parent');
    const repositories = createJarvisRepositories(db);
    const alphaParent = runFixture({ id: 'parent-alpha' });
    const betaParent = runFixture({ id: 'parent-beta', accountId: 'account-beta' });
    await repositories.run.createIdempotent(alphaParent);
    await repositories.run.createIdempotent(betaParent);

    const child = runFixture({ id: 'child-alpha', parentRunId: alphaParent.id });
    expect(await repositories.run.createIdempotent(child)).toEqual(child);

    await expectRepositoryError(
      repositories.run.createIdempotent(
        runFixture({ id: 'child-foreign', parentRunId: betaParent.id }),
      ),
      'parent_run_not_found',
    );
    await expectRepositoryError(
      repositories.run.createIdempotent(
        runFixture({ id: 'child-missing', parentRunId: 'missing-parent' }),
      ),
      'parent_run_not_found',
    );
  });
});

describe('Jarvis event repository', () => {
  it('allocates ascending sequences and makes exact non-transition retries idempotent per run', async () => {
    const db = await openTestDb('jarvis-repositories-events');
    const repositories = createJarvisRepositories(db);
    const firstRun = runFixture();
    const secondRun = runFixture({ id: 'run-beta-key', accountId: 'account-beta' });
    await repositories.run.createIdempotent(firstRun);
    await repositories.run.createIdempotent(secondRun);

    const firstInput = nonTransitionEventFixture();
    const first = await repositories.event.appendIdempotent(
      firstRun.accountId,
      firstRun.id,
      firstInput,
    );
    const repeated = await repositories.event.appendIdempotent(
      firstRun.accountId,
      firstRun.id,
      structuredClone(firstInput),
    );
    const second = await repositories.event.appendIdempotent(
      firstRun.accountId,
      firstRun.id,
      nonTransitionEventFixture({ idempotencyKey: 'event-key-beta', createdAt: NOW + 1 }),
    );
    const third = await repositories.event.appendIdempotent(
      firstRun.accountId,
      firstRun.id,
      nonTransitionEventFixture({ idempotencyKey: 'event-key-gamma', createdAt: NOW + 2 }),
    );
    const otherRun = await repositories.event.appendIdempotent(
      secondRun.accountId,
      secondRun.id,
      nonTransitionEventFixture({ idempotencyKey: firstInput.idempotencyKey }),
    );

    expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
    expect(repeated).toEqual(first);
    expect(repeated.createdAt).toBe(firstInput.createdAt);
    expect(otherRun.seq).toBe(1);
    expect(await db.jarvis_events.count()).toBe(4);

    await expectRepositoryError(
      repositories.event.appendIdempotent(
        firstRun.accountId,
        firstRun.id,
        nonTransitionEventFixture({ title: 'Changed under the same key' }),
      ),
      'event_idempotency_conflict',
    );
    expect(await db.jarvis_events.count()).toBe(4);
  });

  it('rejects standalone run_state events even when a caller defeats the TypeScript type', async () => {
    const db = await openTestDb('jarvis-repositories-run-state-rejection');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);

    await expectRepositoryError(
      repositories.event.appendIdempotent(
        run.accountId,
        run.id,
        nonTransitionEventFixture({
          type: 'run_state',
        } as unknown as Partial<JarvisNonTransitionEventInput>),
      ),
      'transition_event_requires_atomic_run_update',
    );
    expect(await db.jarvis_events.count()).toBe(0);
  });

  it('uses the same parent-not-found result for missing and foreign parents', async () => {
    const db = await openTestDb('jarvis-repositories-event-parent-oracle');
    const repositories = createJarvisRepositories(db);
    const foreignRun = runFixture({ id: 'foreign-run', accountId: 'account-beta' });
    await repositories.run.createIdempotent(foreignRun);

    for (const runId of ['missing-run', foreignRun.id]) {
      await expectRepositoryError(
        repositories.event.appendIdempotent(
          'account-alpha',
          runId,
          nonTransitionEventFixture({ idempotencyKey: `key-${runId}` }),
        ),
        'parent_run_not_found',
      );
      await expectRepositoryError(
        repositories.event.listByRun('account-alpha', runId),
        'parent_run_not_found',
      );
    }
  });

  it('returns bounded ascending pages after a sequence and a bounded newest tail when omitted', async () => {
    const db = await openTestDb('jarvis-repositories-event-pagination');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);
    await db.jarvis_events.bulkAdd(
      Array.from({ length: 20 }, (_, index) =>
        toJarvisEventRow({
          runId: run.id,
          seq: index + 1,
          ...nonTransitionEventFixture({
            idempotencyKey: `event-page-${index + 1}`,
            title: `Event ${index + 1}`,
            createdAt: NOW + index,
          }),
        }),
      ),
    );

    let rowsRead = 0;
    const readingHook = <T>(row: T): T => {
      rowsRead += 1;
      return row;
    };
    db.jarvis_events.hook('reading', readingHook);
    try {
      const after = await repositories.event.listByRun(run.accountId, run.id, {
        afterSeq: 17,
        limit: 2,
      });
      expect(after.map((event) => event.seq)).toEqual([18, 19]);
      expect(rowsRead).toBe(2);

      rowsRead = 0;
      const tail = await repositories.event.listByRun(run.accountId, run.id, { limit: 3 });
      expect(tail.map((event) => event.seq)).toEqual([18, 19, 20]);
      expect(rowsRead).toBe(3);
    } finally {
      db.jarvis_events.hook('reading').unsubscribe(readingHook);
    }
  });

  it('rejects blank idempotency keys and invalid sequence boundaries without touching storage', async () => {
    const db = await openTestDb('jarvis-repositories-event-validation');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);

    for (const idempotencyKey of ['', '   ']) {
      await expectRepositoryError(
        repositories.event.appendIdempotent(
          run.accountId,
          run.id,
          nonTransitionEventFixture({ idempotencyKey }),
        ),
        'event_idempotency_conflict',
      );
    }
    for (const afterSeq of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expectRepositoryError(
        repositories.event.listByRun(run.accountId, run.id, { afterSeq }),
        'invalid_limit',
      );
    }
    expect(await db.jarvis_events.count()).toBe(0);
  });
});

describe('atomic run transition/event compare-and-set', () => {
  it('updates the expected run and forces one matching run_state event in the same transaction', async () => {
    const db = await openTestDb('jarvis-repositories-transition');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);

    const result = await repositories.run.compareAndAppendTransitionEvent({
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      nextStatus: 'running',
      updatedAt: NOW + 10,
      event: {
        ...transitionEventFixture(),
        runId: 'forged-run',
        seq: 999,
        type: 'error',
        status: 'failed',
      } as unknown as JarvisRunTransitionEventInput,
    });

    expect(result).toEqual({
      applied: true,
      run: { ...run, status: 'running', updatedAt: NOW + 10 },
      event: {
        runId: run.id,
        seq: 1,
        ...transitionEventFixture(),
        type: 'run_state',
        status: 'running',
      },
    });
    expect(await db.jarvis_runs.get(run.id)).toEqual(
      toJarvisRunRow({ ...run, status: 'running', updatedAt: NOW + 10 }),
    );
    expect(await db.jarvis_events.count()).toBe(1);
  });

  it('returns the current run on a CAS miss and writes neither table', async () => {
    const db = await openTestDb('jarvis-repositories-transition-miss');
    const repositories = createJarvisRepositories(db);
    const run = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(run);

    const result = await repositories.run.compareAndAppendTransitionEvent({
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      nextStatus: 'completed',
      updatedAt: NOW + 50,
      completedAt: NOW + 50,
      event: transitionEventFixture({ idempotencyKey: '   ' }),
    });

    expect(result).toEqual({ applied: false, current: run });
    expect(await db.jarvis_runs.get(run.id)).toEqual(toJarvisRunRow(run));
    expect(await db.jarvis_events.count()).toBe(0);
  });

  it('serializes two concurrent expected-status attempts so exactly one applies', async () => {
    const db = await openTestDb('jarvis-repositories-transition-concurrent');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);

    const [first, second] = await Promise.all([
      repositories.run.compareAndAppendTransitionEvent({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'queued',
        nextStatus: 'running',
        updatedAt: NOW + 1,
        event: transitionEventFixture({ idempotencyKey: 'concurrent-first' }),
      }),
      repositories.run.compareAndAppendTransitionEvent({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'queued',
        nextStatus: 'running',
        updatedAt: NOW + 2,
        event: transitionEventFixture({ idempotencyKey: 'concurrent-second' }),
      }),
    ]);

    expect([first.applied, second.applied].sort()).toEqual([false, true]);
    expect(await db.jarvis_events.count()).toBe(1);
    expect((await repositories.run.getById(run.accountId, run.id))?.status).toBe('running');
  });

  it('rolls back every run field when a duplicate event key aborts insertion', async () => {
    const db = await openTestDb('jarvis-repositories-transition-duplicate-rollback');
    const repositories = createJarvisRepositories(db);
    const run = runFixture({ status: 'partial', completedAt: NOW - 100 });
    await repositories.run.createIdempotent(run);
    await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture({ idempotencyKey: 'duplicate-transition-key' }),
    );

    await expect(
      repositories.run.compareAndAppendTransitionEvent({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'partial',
        nextStatus: 'completed',
        updatedAt: NOW + 100,
        completedAt: NOW + 100,
        event: transitionEventFixture({ idempotencyKey: 'duplicate-transition-key' }),
      }),
    ).rejects.toBeTruthy();

    expect(await db.jarvis_runs.get(run.id)).toEqual(toJarvisRunRow(run));
    expect(await db.jarvis_events.count()).toBe(1);
  });

  it('rolls back every run field when event insertion fails after the update', async () => {
    const db = await openTestDb('jarvis-repositories-transition-injected-rollback');
    const repositories = createJarvisRepositories(db);
    const run = runFixture({ status: 'running', completedAt: NOW - 200 });
    await repositories.run.createIdempotent(run);
    vi.spyOn(db.jarvis_events, 'add').mockRejectedValueOnce(new Error('injected event failure'));

    await expect(
      repositories.run.compareAndAppendTransitionEvent({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'running',
        nextStatus: 'completed',
        updatedAt: NOW + 200,
        completedAt: NOW + 200,
        event: transitionEventFixture({ idempotencyKey: 'injected-transition-key' }),
      }),
    ).rejects.toThrow('injected event failure');

    expect(await db.jarvis_runs.get(run.id)).toEqual(toJarvisRunRow(run));
    expect(await db.jarvis_events.count()).toBe(0);
  });

  it('contains no hidden legal-transition matrix', async () => {
    const db = await openTestDb('jarvis-repositories-no-transition-matrix');
    const repositories = createJarvisRepositories(db);
    const run = runFixture({ status: 'completed', completedAt: NOW - 1 });
    await repositories.run.createIdempotent(run);

    const result = await repositories.run.compareAndAppendTransitionEvent({
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'completed',
      nextStatus: 'compiling',
      updatedAt: NOW + 1,
      event: transitionEventFixture({ idempotencyKey: 'matrix-agnostic-transition' }),
    });

    expect(result.applied).toBe(true);
    expect(result.applied && result.run.status).toBe('compiling');
    expect(result.applied && result.run.completedAt).toBeUndefined();
    expect(await db.jarvis_runs.get(run.id)).not.toHaveProperty('completed_at');
  });
});

describe('profile mutation and integrity', () => {
  it('preserves supplied migration markers and rejects a second active profile', async () => {
    const db = await openTestDb('jarvis-repositories-profile-put');
    const repositories = createJarvisRepositories(db);
    const profile = profileFixture();
    const migration: JarvisProfileMigrationMetadata = {
      migrationVersion: 3,
      migrationSource: 'legacy_agent',
      migrationSourcePromptHash: 'migration-source-hash',
      migrationCompletedAt: NOW - 999,
    };

    expect(
      await repositories.profile.putForAccount(profile.accountId, { profile, migration }),
    ).toEqual(profile);
    expect(await db.jarvis_profiles.get(profile.id)).toEqual(
      toJarvisProfileRow({ profile, migration }),
    );

    await expectRepositoryError(
      repositories.profile.putForAccount(profile.accountId, {
        profile: profileFixture({ id: 'profile-second', revisionId: 'revision-second' }),
        migration: CLEAN_MIGRATION,
      }),
      'profile_integrity_error',
    );
    expect(await db.jarvis_profiles.count()).toBe(1);
  });

  it('throws rather than choosing arbitrarily when persisted data has multiple active profiles', async () => {
    const db = await openTestDb('jarvis-repositories-profile-active-integrity');
    const repositories = createJarvisRepositories(db);
    await db.jarvis_profiles.bulkAdd([
      toJarvisProfileRow({ profile: profileFixture(), migration: CLEAN_MIGRATION }),
      toJarvisProfileRow({
        profile: profileFixture({ id: 'profile-second', revisionId: 'revision-second' }),
        migration: CLEAN_MIGRATION,
      }),
    ]);

    await expectRepositoryError(
      repositories.profile.getActive('account-alpha'),
      'profile_integrity_error',
    );
  });

  it('normalizes instructions, no-ops unchanged text, and injects revision/time while preserving migration', async () => {
    const db = await openTestDb('jarvis-repositories-profile-update');
    const newRevisionId = vi
      .fn<() => string>()
      .mockReturnValueOnce('jprof_rev_changed')
      .mockReturnValueOnce('jprof_rev_cleared');
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(NOW + 10)
      .mockReturnValueOnce(NOW + 20);
    const repositories = createJarvisRepositories(db, { now, newProfileRevisionId: newRevisionId });
    const migration: JarvisProfileMigrationMetadata = {
      migrationVersion: 3,
      migrationSource: 'legacy_agent',
      migrationSourcePromptHash: 'migration-source-hash',
      migrationCompletedAt: NOW - 999,
    };
    const profile = profileFixture({ customInstructions: 'first\nsecond' });
    await repositories.profile.putForAccount(profile.accountId, { profile, migration });

    const unchanged = await repositories.profile.updateCustomInstructions(
      profile.accountId,
      profile.id,
      'first\r\nsecond',
    );
    expect(unchanged).toEqual(profile);
    expect(newRevisionId).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();

    const changed = await repositories.profile.updateCustomInstructions(
      profile.accountId,
      profile.id,
      ' first\r\n\rsecond\rlast  ',
    );
    expect(changed).toEqual({
      ...profile,
      revisionId: 'jprof_rev_changed',
      customInstructions: ' first\n\nsecond\nlast  ',
      instructionSource: 'user',
      sourcePromptHash: undefined,
      updatedAt: NOW + 10,
    });
    expect(changed.id).toBe(profile.id);

    const cleared = await repositories.profile.updateCustomInstructions(
      profile.accountId,
      profile.id,
      '',
    );
    expect(cleared).toMatchObject({
      id: profile.id,
      revisionId: 'jprof_rev_cleared',
      customInstructions: '',
      instructionSource: 'none',
      updatedAt: NOW + 20,
    });
    const row = await db.jarvis_profiles.get(profile.id);
    expect(row).toMatchObject({
      migration_version: 3,
      migration_source: 'legacy_agent',
      migration_source_prompt_hash: 'migration-source-hash',
      migration_completed_at: NOW - 999,
    });
    expect(row).not.toHaveProperty('source_prompt_hash');
  });

  it('does not mint a revision when persisted CRLF text and incoming LF text normalize equally', async () => {
    const db = await openTestDb('jarvis-repositories-profile-stored-crlf-noop');
    const newRevisionId = vi.fn<() => string>(() => 'must-not-be-used');
    const now = vi.fn<() => number>(() => NOW + 1);
    const repositories = createJarvisRepositories(db, {
      now,
      newProfileRevisionId: newRevisionId,
    });
    const profile = profileFixture({ customInstructions: 'first\r\nsecond\rlast' });
    await repositories.profile.putForAccount(profile.accountId, {
      profile,
      migration: CLEAN_MIGRATION,
    });

    const unchanged = await repositories.profile.updateCustomInstructions(
      profile.accountId,
      profile.id,
      'first\nsecond\nlast',
    );

    expect(unchanged).toEqual(profile);
    expect(newRevisionId).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect((await db.jarvis_profiles.get(profile.id))?.custom_instructions).toBe(
      'first\r\nsecond\rlast',
    );
  });
});

describe('approval and artifact child ownership', () => {
  it('writes and reads children only through an account-owned parent run', async () => {
    const db = await openTestDb('jarvis-repositories-children');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);
    const approval = approvalFixture();
    const artifact = artifactFixture();

    expect(await repositories.approval.putForRun(run.accountId, approval)).toEqual(approval);
    expect(await repositories.artifact.putForRun(run.accountId, artifact)).toEqual(artifact);
    expect(await repositories.approval.getById(run.accountId, approval.id)).toEqual(approval);
    expect(await repositories.artifact.getById(run.accountId, artifact.id)).toEqual(artifact);
    expect(await repositories.artifact.listByRun(run.accountId, run.id)).toEqual([artifact]);

    expect(await repositories.approval.getById('account-beta', approval.id)).toBeUndefined();
    expect(await repositories.approval.getById('account-beta', 'missing-approval')).toBeUndefined();
    expect(await repositories.artifact.getById('account-beta', artifact.id)).toBeUndefined();
    expect(await repositories.artifact.getById('account-beta', 'missing-artifact')).toBeUndefined();
  });

  it('uses the same parent-not-found error for missing and foreign child parents', async () => {
    const db = await openTestDb('jarvis-repositories-child-parent-oracle');
    const repositories = createJarvisRepositories(db);
    const foreignRun = runFixture({ id: 'run-foreign', accountId: 'account-beta' });
    await repositories.run.createIdempotent(foreignRun);

    for (const runId of ['missing-run', foreignRun.id]) {
      await expectRepositoryError(
        repositories.approval.putForRun(
          'account-alpha',
          approvalFixture({ id: `approval-${runId}`, runId }),
        ),
        'parent_run_not_found',
      );
      await expectRepositoryError(
        repositories.artifact.putForRun(
          'account-alpha',
          artifactFixture({ id: `artifact-${runId}`, runId }),
        ),
        'parent_run_not_found',
      );
      await expectRepositoryError(
        repositories.artifact.listByRun('account-alpha', runId),
        'parent_run_not_found',
      );
    }
  });

  it('never overwrites an approval or artifact ID already bound to another run', async () => {
    const db = await openTestDb('jarvis-repositories-child-id-collision');
    const repositories = createJarvisRepositories(db);
    const firstRun = runFixture();
    const secondRun = runFixture({ id: 'run-second' });
    const foreignRun = runFixture({ id: 'run-foreign-collision', accountId: 'account-beta' });
    await repositories.run.createIdempotent(firstRun);
    await repositories.run.createIdempotent(secondRun);
    await repositories.run.createIdempotent(foreignRun);
    const approval = approvalFixture();
    const artifact = artifactFixture();
    await repositories.approval.putForRun(firstRun.accountId, approval);
    await repositories.artifact.putForRun(firstRun.accountId, artifact);

    await expectRepositoryError(
      repositories.approval.putForRun(
        secondRun.accountId,
        approvalFixture({ runId: secondRun.id, status: 'approved' }),
      ),
      'parent_run_not_found',
    );
    await expectRepositoryError(
      repositories.artifact.putForRun(
        secondRun.accountId,
        artifactFixture({ runId: secondRun.id, title: 'Collision overwrite' }),
      ),
      'parent_run_not_found',
    );
    await expectRepositoryError(
      repositories.approval.putForRun(
        foreignRun.accountId,
        approvalFixture({ runId: foreignRun.id, status: 'approved' }),
      ),
      'parent_run_not_found',
    );
    await expectRepositoryError(
      repositories.artifact.putForRun(
        foreignRun.accountId,
        artifactFixture({ runId: foreignRun.id, title: 'Foreign collision overwrite' }),
      ),
      'parent_run_not_found',
    );
    expect(await repositories.approval.getById(firstRun.accountId, approval.id)).toEqual(approval);
    expect(await repositories.artifact.getById(firstRun.accountId, artifact.id)).toEqual(artifact);
  });
});

describe('bounded limits, detached projections, and local-only writes', () => {
  it.each([0, -1, 1.5, 501, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid repository limit %s',
    async (limit) => {
      const db = await openTestDb(`jarvis-repositories-limit-${String(limit)}`);
      const repositories = createJarvisRepositories(db);
      const run = runFixture();
      await repositories.run.createIdempotent(run);

      await expectRepositoryError(
        repositories.run.listByAccount(run.accountId, { limit }),
        'invalid_limit',
      );
      await expectRepositoryError(
        repositories.event.listByRun(run.accountId, run.id, { limit }),
        'invalid_limit',
      );
      await expectRepositoryError(
        repositories.artifact.listByRun(run.accountId, run.id, limit),
        'invalid_limit',
      );
    },
  );

  it('filters runs within the account compound index and caps results', async () => {
    const db = await openTestDb('jarvis-repositories-run-list');
    const repositories = createJarvisRepositories(db);
    await repositories.run.createIdempotent(runFixture({ id: 'run-old', updatedAt: NOW - 30 }));
    await repositories.run.createIdempotent(
      runFixture({ id: 'run-new', status: 'completed', updatedAt: NOW - 10 }),
    );
    await repositories.run.createIdempotent(
      runFixture({ id: 'run-middle', status: 'completed', updatedAt: NOW - 20 }),
    );
    await repositories.run.createIdempotent(
      runFixture({ id: 'run-foreign-list', accountId: 'account-beta', updatedAt: NOW + 100 }),
    );

    const listed = await repositories.run.listByAccount('account-alpha', {
      statuses: ['completed'],
      limit: 1,
    });
    expect(listed.map((run) => run.id)).toEqual(['run-new']);
  });

  it('uses the bounded audit default of 500 rows', async () => {
    const db = await openTestDb('jarvis-repositories-default-limit');
    const repositories = createJarvisRepositories(db);
    await db.jarvis_runs.bulkAdd(
      Array.from({ length: 501 }, (_, index) =>
        toJarvisRunRow(
          runFixture({
            id: `run-default-limit-${String(index).padStart(3, '0')}`,
            updatedAt: NOW + index,
          }),
        ),
      ),
    );

    const listed = await repositories.run.listByAccount('account-alpha');
    expect(listed).toHaveLength(500);
    expect(listed[0]?.updatedAt).toBe(NOW + 500);
  });

  it('returns detached child/run values and never writes the generic sync queue', async () => {
    const db = await openTestDb('jarvis-repositories-detached-local-only');
    const repositories = createJarvisRepositories(db, {
      now: () => NOW + 1,
      newProfileRevisionId: () => 'jprof_rev_local_only',
    });
    const run = runFixture();
    const profile = profileFixture();
    const approval = approvalFixture();
    const artifact = artifactFixture();

    const createdRun = await repositories.run.createIdempotent(run);
    await repositories.profile.putForAccount(profile.accountId, {
      profile,
      migration: CLEAN_MIGRATION,
    });
    const createdEvent = await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture(),
    );
    const createdApproval = await repositories.approval.putForRun(run.accountId, approval);
    const createdArtifact = await repositories.artifact.putForRun(run.accountId, artifact);
    await repositories.profile.updateCustomInstructions(profile.accountId, profile.id, 'changed');

    createdRun.model.capabilities.tools = false;
    createdEvent.sourceRefs[0]!.label = 'mutated';
    (createdApproval.params as { nested: { overwrite: boolean } }).nested.overwrite = true;
    createdArtifact.sourceRefs.push({
      id: 'mutated-source',
      kind: 'web',
      label: 'mutated',
      accountId: run.accountId,
      trust: 'external_untrusted',
      sensitivity: 'public',
    });

    expect((await repositories.run.getById(run.accountId, run.id))?.model.capabilities.tools).toBe(
      true,
    );
    expect(
      (await repositories.event.listByRun(run.accountId, run.id))[0]?.sourceRefs[0]?.label,
    ).toBe('Prompt');
    expect((await repositories.approval.getById(run.accountId, approval.id))?.params).toMatchObject(
      { nested: { overwrite: false } },
    );
    expect((await repositories.artifact.getById(run.accountId, artifact.id))?.sourceRefs).toEqual(
      [],
    );
    expect(await db.sync_queue.count()).toBe(0);
  });
});
