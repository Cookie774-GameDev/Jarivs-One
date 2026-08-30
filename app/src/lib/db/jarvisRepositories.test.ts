import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type {
  JarvisApprovalV1,
  JarvisArtifactV1,
  JarvisAttemptEffectClaimInput,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisPreEffectTransportFailureEvidence,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
  JarvisScheduledRetrySnapshotV1,
  JarvisTransportAttemptV1,
  JarvisZeroConsequentialEffectEvidenceV1,
} from '@/lib/jarvis/contracts/execution';
import { createJarvisArtifactRuntimeInternals } from '@/lib/jarvis/artifactRuntimeInternals';
import type { JarvisIdentityRevision } from '@/lib/jarvis/identity';
import type { JarvisProfile } from '@/lib/jarvis/profiles/types';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import {
  toJarvisApprovalRow,
  toJarvisArtifactRow,
  toJarvisEventRow,
  toJarvisProfileRow,
  toJarvisRunRow,
  type JarvisProfileMigrationMetadata,
} from './jarvisMappers';
import {
  JarvisRepositoryError,
  createJarvisArtifactCommitAuthority,
  createJarvisLiveEvidenceEventCommitAuthority,
  createJarvisRepositories,
  jarvisApprovalRepo,
  jarvisArtifactRepo,
  jarvisEventRepo,
  jarvisIdentityRepo,
  jarvisProfileRepo,
  jarvisRunRepo,
  newJarvisProfileRevisionId,
  type JarvisTransportAttemptMutationInput,
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
    compareAndMutateTransportAttempt(
      input: JarvisTransportAttemptMutationInput,
    ): Promise<
      | { applied: true; run: JarvisRun; event: JarvisEvent }
      | { applied: false; current: JarvisRun; reason: 'status_conflict' | 'attempt_conflict' }
    >;
    claimAttemptEffect(input: JarvisAttemptEffectClaimInput): Promise<
      | { applied: true; kind: 'barrier_claimed'; run: JarvisRun; event: JarvisEvent }
      | { applied: true; kind: 'not_applicable'; run: JarvisRun }
      | {
          applied: false;
          reason: 'status_conflict' | 'attempt_conflict' | 'attempt_sealed';
          current: JarvisRun;
        }
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
    getBySeq(accountId: string, runId: string, seq: number): Promise<JarvisEvent | undefined>;
  };
  approval: {
    getById(accountId: string, approvalId: string): Promise<JarvisApprovalV1 | undefined>;
    listByRun(
      accountId: string,
      runId: string,
      options?: {
        requestId?: string;
        attemptNumber?: number;
        createdAtOrAfter?: number;
        limit?: number;
      },
    ): Promise<JarvisApprovalV1[]>;
  };
  artifact: {
    getById(accountId: string, artifactId: string): Promise<JarvisArtifactV1 | undefined>;
    listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifactV1[]>;
    listByAccount(accountId: string, limit?: number): Promise<JarvisArtifactV1[]>;
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

function scheduledRetrySnapshotFixture(
  overrides: Partial<JarvisScheduledRetrySnapshotV1> = {},
): JarvisScheduledRetrySnapshotV1 {
  return {
    schemaVersion: 1,
    accountId: 'account-alpha',
    eventId: 'schedule-event-alpha',
    occurrenceId: 'jocc_schedule_alpha',
    dueAt: NOW - 5,
    logicalAttempt: 1,
    request: {
      schemaVersion: 1,
      runId: 'run-alpha',
      accountId: 'account-alpha',
      workspaceId: 'workspace-alpha',
      projectId: 'project-alpha',
      chatId: 'chat-alpha',
      agent: { id: 'jarvis', slug: 'jarvis', builtin: true },
      surface: 'schedule',
      interactionMode: 'agent',
      userText: 'Run the scheduled request.',
      messageHistory: [{ role: 'user', content: 'Run the scheduled request.' }],
      identity: {
        identityVersion: 1,
        coreHash: 'identity-core-alpha',
        responseContractHash: 'response-contract-alpha',
      },
      profile: {
        profileId: 'profile-alpha',
        revisionId: 'profile-revision-alpha',
        customInstructions: '',
        memoryScope: 'none',
      },
      capabilities: {
        capturedAt: NOW - 20,
        tools: [],
        plugins: [],
        mcps: [],
        terminals: [],
        agents: [],
        entitlements: { source: 'unavailable', capabilities: [] },
      },
      model: {
        connectionId: 'connection-alpha',
        providerId: 'provider-alpha',
        modelId: 'model-alpha',
        connectionMode: 'native-api',
        capabilities: { tools: true, vision: false },
        effectiveTemperature: 0.4,
        capturedAt: NOW - 20,
      },
      context: { items: [], budget: { maxChars: 0, usedChars: 0 }, exclusions: [] },
      outputContract: {
        preserveStructuredBlocks: true,
        allowActionBlocks: true,
        allowPlanBlocks: true,
        allowQuestionBlocks: true,
        allowPermissionBlocks: true,
        voiceDelivery: 'none',
      },
    },
    ...overrides,
  };
}

function transportAttemptFixture(
  overrides: Partial<Omit<JarvisTransportAttemptV1, 'startedEventSeq'>> = {},
): Omit<JarvisTransportAttemptV1, 'startedEventSeq'> {
  return {
    schemaVersion: 1,
    attemptNumber: 1,
    kind: 'initial',
    requestId: 'request-alpha',
    state: 'provider_in_flight',
    effectBarrier: {
      state: 'open',
      version: 0,
      updatedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function providerFailureFixture(
  overrides: Partial<JarvisPreEffectTransportFailureEvidence> = {},
): JarvisPreEffectTransportFailureEvidence {
  return {
    schemaVersion: 1,
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    providerId: 'provider-alpha',
    modelId: 'model-alpha',
    boundary: 'before_first_response_byte',
    responseStarted: false,
    chunkCount: 0,
    actionDispatchCount: 0,
    failureCategory: 'network_unavailable',
    evidenceRef: 'provider-failure-alpha',
    verifiedAt: NOW + 1,
    ...overrides,
  };
}

function zeroEffectEvidenceFixture(
  overrides: Partial<JarvisZeroConsequentialEffectEvidenceV1> = {},
): JarvisZeroConsequentialEffectEvidenceV1 {
  const providerBoundary = providerFailureFixture();
  return {
    schemaVersion: 1,
    accountId: providerBoundary.accountId,
    runId: providerBoundary.runId,
    attemptNumber: providerBoundary.attemptNumber,
    requestId: providerBoundary.requestId,
    assessedAt: NOW + 2,
    providerBoundary,
    effectBarrier: { state: 'open', version: 0 },
    approvals: { count: 0, evidenceRef: 'approvals-zero-alpha' },
    artifacts: { count: 0, evidenceRef: 'artifacts-zero-alpha' },
    executorClaims: { count: 0, throughSeq: 1, evidenceRef: 'claims-zero-alpha' },
    ...overrides,
  };
}

function effectClaimFixture(
  overrides: Partial<JarvisAttemptEffectClaimInput> = {},
): JarvisAttemptEffectClaimInput {
  return {
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    ownerKind: 'action',
    ownerId: 'action-alpha',
    evidenceRef: 'effect-claim-alpha',
    claimedAt: NOW + 1,
    ...overrides,
  };
}

function executionEvidenceForClaim(
  claim: JarvisAttemptEffectClaimInput,
): NonNullable<JarvisEvent['executionEvidence']> {
  return {
    schemaVersion: 1,
    requestId: claim.requestId,
    attemptNumber: claim.attemptNumber,
    kind: 'consequential_effect_claimed',
    ownerKind: claim.ownerKind,
    ownerId: claim.ownerId,
    evidenceRef: claim.evidenceRef,
    observedAt: claim.claimedAt,
  };
}

function liveEvidenceFixture(
  overrides: Partial<JarvisDurableLiveEvidenceV1> = {},
): JarvisDurableLiveEvidenceV1 {
  return {
    schemaVersion: 1,
    kind: 'model',
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    registrationId: 'registration-alpha',
    producerKind: 'provider',
    producerIdentity: {
      producerKind: 'provider',
      providerId: 'provider-alpha',
      modelId: 'model-alpha',
      modelSnapshotRef: 'model-snapshot-alpha',
    },
    transition: 'started',
    operations: ['generate', 'stream'],
    resultRef: 'provider-start-alpha',
    resultEventSeq: 1,
    observedAt: NOW + 2,
    providerId: 'provider-alpha',
    modelId: 'model-alpha',
    modelSnapshotRef: 'model-snapshot-alpha',
    ...overrides,
  } as JarvisDurableLiveEvidenceV1;
}

function producerSourceEvidenceFixture(
  evidence: JarvisDurableLiveEvidenceV1,
): JarvisProducerSourceEvidenceV1 {
  const common = {
    schemaVersion: 1 as const,
    accountId: evidence.accountId,
    runId: evidence.runId,
    requestId: evidence.requestId,
    attemptNumber: evidence.attemptNumber,
    producerKind: evidence.producerKind,
    producerIdentity: structuredClone(evidence.producerIdentity),
    resultRef: evidence.resultRef,
    observedAt: evidence.observedAt,
  };
  return (
    evidence.transition === 'completed' || evidence.transition === 'degraded'
      ? { ...common, phase: 'result', state: evidence.transition }
      : { ...common, phase: 'start', state: evidence.transition }
  ) as JarvisProducerSourceEvidenceV1;
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

function approvalFixture(overrides: Partial<JarvisApprovalV1> = {}): JarvisApprovalV1 {
  return {
    schemaVersion: 1,
    id: 'approval-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    actionId: 'action-alpha',
    actionVersion: 1,
    capabilityId: 'files.write',
    capabilitySnapshotHash: 'capability-snapshot-hash-alpha',
    expectedEffect: 'Writes the reviewed file.',
    expiresAt: NOW + 60_000,
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

function artifactFixture(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'artifact-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    state: 'ready',
    kind: 'file',
    title: 'Generated file',
    uri: 'file:///C:/safe/file.txt',
    mimeType: 'text/plain',
    safeSummary: 'Generated text file.',
    contentHash: 'a'.repeat(64),
    sizeBytes: 20,
    preview: {
      kind: 'text',
      text: 'Generated text file.',
      truncated: false,
      sizeBytes: 20,
    },
    localReference: { kind: 'path', value: 'C:/safe/file.txt' },
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
      | 'live_evidence_integrity_error'
      | 'transport_attempt_integrity_error'
      | 'attempt_effect_integrity_error'
      | 'profile_integrity_error'
      | 'artifact_integrity_error'
      | 'approval_integrity_error'
      | 'approval_scope_mismatch'
      | 'approval_status_conflict'
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
      'claimAttemptEffect',
      'compareAndAppendTransitionEvent',
      'compareAndMutateTransportAttempt',
      'createIdempotent',
      'getById',
      'listByAccount',
    ]);
    expect(Object.keys(jarvisEventRepo).sort()).toEqual([
      'appendIdempotent',
      'getBySeq',
      'listByRun',
    ]);
    expect(Object.keys(jarvisApprovalRepo).sort()).toEqual(['getById', 'listByRun']);
    expect(Object.keys(jarvisArtifactRepo).sort()).toEqual([
      'getById',
      'listByAccount',
      'listByRun',
    ]);
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
  it('reads an exact detached sequence only through its account-owned parent', async () => {
    const database = await openTestDb('jarvis-event-get-by-seq');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(runFixture());
    const written = await repositories.event.appendIdempotent(
      'account-alpha',
      'run-alpha',
      nonTransitionEventFixture(),
    );

    const read = await repositories.event.getBySeq('account-alpha', 'run-alpha', written.seq);
    expect(read).toEqual(written);
    expect(await repositories.event.getBySeq('account-alpha', 'run-alpha', written.seq + 1)).toBe(
      undefined,
    );
    await expectRepositoryError(
      repositories.event.getBySeq('account-beta', 'run-alpha', written.seq),
      'parent_run_not_found',
    );

    if (!read) throw new Error('Expected the committed event');
    read.sourceRefs[0]!.label = 'mutated by caller';
    expect(
      (await repositories.event.getBySeq('account-alpha', 'run-alpha', written.seq))?.sourceRefs[0]
        ?.label,
    ).toBe('Prompt');
  });

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

describe('transport-attempt and effect-barrier repository CAS', () => {
  it('atomically begins the first scheduled attempt and records its forced transition sequence', async () => {
    const database = await openTestDb('jarvis-transport-begin-initial');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });

    expect(result).toMatchObject({
      applied: true,
      run: {
        id: run.id,
        status: 'running',
        transportAttempts: [
          {
            attemptNumber: 1,
            requestId: 'request-alpha',
            state: 'provider_in_flight',
            startedEventSeq: 1,
          },
        ],
      },
      event: {
        runId: run.id,
        seq: 1,
        type: 'run_state',
        status: 'running',
      },
    });
    expect((await database.jarvis_runs.get(run.id))?.transport_attempts?.[0]?.startedEventSeq).toBe(
      1,
    );
    expect(await database.jarvis_events.count()).toBe(1);
  });

  it('rejects non-schedule, stale-status, malformed, and duplicate initial attempts without writes', async () => {
    for (const [name, run, input] of [
      [
        'non-schedule',
        runFixture(),
        { expectedStatus: 'queued' as const, attempt: transportAttemptFixture() },
      ],
      [
        'stale-status',
        runFixture({ source: 'schedule', status: 'running' }),
        { expectedStatus: 'queued' as const, attempt: transportAttemptFixture() },
      ],
      [
        'wrong-number',
        runFixture({ source: 'schedule' }),
        {
          expectedStatus: 'queued' as const,
          attempt: transportAttemptFixture({ attemptNumber: 2 }),
        },
      ],
    ] as const) {
      const database = await openTestDb(`jarvis-transport-initial-${name}`);
      const repositories = createJarvisRepositories(database);
      await repositories.run.createIdempotent(run);
      const result = await repositories.run.compareAndMutateTransportAttempt({
        kind: 'begin_initial',
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: input.expectedStatus,
        snapshot: scheduledRetrySnapshotFixture(),
        attempt: input.attempt,
        updatedAt: NOW,
      });

      expect(result).toMatchObject({
        applied: false,
        reason: name === 'stale-status' ? 'status_conflict' : 'attempt_conflict',
      });
      expect(await database.jarvis_events.count()).toBe(0);
      expect(await repositories.run.getById(run.accountId, run.id)).toEqual(run);
    }
  });

  it('settles exact pre-effect failure as retryable while leaving the logical run running', async () => {
    const database = await openTestDb('jarvis-transport-settle-retryable');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const providerFailure = providerFailureFixture();
    const zeroEffectEvidence = zeroEffectEvidenceFixture({ providerBoundary: providerFailure });

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure,
      zeroEffectEvidence,
      updatedAt: NOW + 3,
    });

    expect(result).toMatchObject({
      applied: true,
      run: {
        status: 'running',
        transportAttempts: [
          {
            state: 'retryable_failed',
            failureCategory: providerFailure.failureCategory,
            zeroEffectEvidence,
            effectBarrier: { state: 'open', version: 0 },
          },
        ],
      },
      event: {
        seq: 2,
        type: 'warning',
        status: 'transport_retry_available',
      },
    });
  });

  it('bridges only its exact retry-available warning before atomically sealing and beginning retry', async () => {
    const database = await openTestDb('jarvis-transport-begin-retry');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const providerFailure = providerFailureFixture();
    const proof = zeroEffectEvidenceFixture({ providerBoundary: providerFailure });
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure,
      zeroEffectEvidence: proof,
      updatedAt: NOW + 3,
    });
    const revalidatedProof = {
      ...proof,
      assessedAt: NOW + 4,
      executorClaims: { count: 0 as const, throughSeq: 2, evidenceRef: 'claims-refreshed' },
    };

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_retry',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedLatestAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 2,
      revalidatedEvidence: revalidatedProof,
      attempt: transportAttemptFixture({
        attemptNumber: 2,
        kind: 'transport_retry',
        requestId: 'request-beta',
        createdAt: NOW + 4,
        updatedAt: NOW + 4,
        effectBarrier: { state: 'open', version: 0, updatedAt: NOW + 4 },
      }),
      updatedAt: NOW + 4,
    });

    expect(result).toMatchObject({
      applied: true,
      run: {
        status: 'running',
        transportAttempts: [
          { attemptNumber: 1, effectBarrier: { state: 'sealed_for_retry', version: 0 } },
          {
            attemptNumber: 2,
            requestId: 'request-beta',
            state: 'provider_in_flight',
            startedEventSeq: 3,
          },
        ],
      },
      event: { seq: 3, type: 'warning', status: 'transport_retry_started' },
    });
  });

  it('rejects any row beyond or instead of the exact retry-available bridge warning', async () => {
    const database = await openTestDb('jarvis-transport-retry-tail-conflict');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const providerFailure = providerFailureFixture();
    const proof = zeroEffectEvidenceFixture({ providerBoundary: providerFailure });
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure,
      zeroEffectEvidence: proof,
      updatedAt: NOW + 3,
    });
    await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture({ idempotencyKey: 'intervening-effect', createdAt: NOW + 4 }),
    );

    const before = await repositories.run.getById(run.accountId, run.id);
    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_retry',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedLatestAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 3,
      revalidatedEvidence: proof,
      attempt: transportAttemptFixture({
        attemptNumber: 2,
        kind: 'transport_retry',
        requestId: 'request-beta',
        createdAt: NOW + 5,
        updatedAt: NOW + 5,
        effectBarrier: { state: 'open', version: 0, updatedAt: NOW + 5 },
      }),
      updatedAt: NOW + 5,
    });

    expect(result).toMatchObject({ applied: false, reason: 'attempt_conflict' });
    expect(await repositories.run.getById(run.accountId, run.id)).toEqual(before);
    expect(await database.jarvis_events.count()).toBe(3);
  });

  it('atomically marks an uncertain attempt and the logical run failed', async () => {
    const database = await openTestDb('jarvis-transport-settle-uncertain');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_uncertain_failed',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      providerFailure: providerFailureFixture(),
      updatedAt: NOW + 2,
      completedAt: NOW + 2,
    });

    expect(result).toMatchObject({
      applied: true,
      run: {
        status: 'failed',
        completedAt: NOW + 2,
        transportAttempts: [{ state: 'effect_uncertain' }],
      },
      event: { seq: 2, type: 'run_state', status: 'failed' },
    });
  });

  it('claims scheduled effects atomically and advances a monotonic dirty barrier', async () => {
    const database = await openTestDb('jarvis-attempt-effect-claim');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });

    const first = await repositories.run.claimAttemptEffect(effectClaimFixture());
    const second = await repositories.run.claimAttemptEffect(
      effectClaimFixture({
        ownerKind: 'artifact',
        ownerId: 'artifact-alpha',
        evidenceRef: 'effect-claim-beta',
        claimedAt: NOW + 2,
      }),
    );

    expect(first).toMatchObject({
      applied: true,
      kind: 'barrier_claimed',
      run: { transportAttempts: [{ effectBarrier: { state: 'dirty', version: 1 } }] },
      event: {
        seq: 2,
        type: 'tool',
        status: 'consequential_effect_claimed',
        executionEvidence: {
          kind: 'consequential_effect_claimed',
          ownerKind: 'action',
          ownerId: 'action-alpha',
        },
      },
    });
    expect(second).toMatchObject({
      applied: true,
      kind: 'barrier_claimed',
      run: { transportAttempts: [{ effectBarrier: { state: 'dirty', version: 2 } }] },
      event: { seq: 3, executionEvidence: { ownerKind: 'artifact' } },
    });
  });

  it('returns not_applicable only for a running nonscheduled run with no ledger', async () => {
    const database = await openTestDb('jarvis-attempt-effect-not-applicable');
    const repositories = createJarvisRepositories(database);
    const ordinary = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(ordinary);

    await expect(repositories.run.claimAttemptEffect(effectClaimFixture())).resolves.toMatchObject({
      applied: true,
      kind: 'not_applicable',
      run: ordinary,
    });
    expect(await database.jarvis_events.count()).toBe(0);

    const scheduled = runFixture({ id: 'run-scheduled', source: 'schedule', status: 'running' });
    await repositories.run.createIdempotent(scheduled);
    await expect(
      repositories.run.claimAttemptEffect(effectClaimFixture({ runId: scheduled.id })),
    ).resolves.toMatchObject({ applied: false, reason: 'attempt_conflict' });
  });

  it('rolls back the dirty barrier when the effect-claim event insert fails', async () => {
    const database = await openTestDb('jarvis-attempt-effect-rollback');
    const repositories = createJarvisRepositories(database);
    const run = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(run);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const before = await repositories.run.getById(run.accountId, run.id);
    vi.spyOn(database.jarvis_events, 'add').mockRejectedValueOnce(new Error('claim insert failed'));

    await expect(repositories.run.claimAttemptEffect(effectClaimFixture())).rejects.toThrow(
      'claim insert failed',
    );
    expect(await repositories.run.getById(run.accountId, run.id)).toEqual(before);
    expect(await database.jarvis_events.count()).toBe(1);
  });
});

describe('test-only live-evidence event commit authority', () => {
  it('commits fixed safe model and capability events after an owned source sequence', async () => {
    const database = await openTestDb('jarvis-live-evidence-commit');
    const repositories = createJarvisRepositories(database);
    const authority = createJarvisLiveEvidenceEventCommitAuthority(database);
    const run = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(run);
    const initialModelEvidence = liveEvidenceFixture();
    const modelSource = await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture({
        idempotencyKey: 'producer-source',
        type: 'model',
        status: 'started',
        createdAt: initialModelEvidence.observedAt,
        producerSourceEvidence: producerSourceEvidenceFixture(initialModelEvidence),
      }),
    );
    const modelEvidence = { ...initialModelEvidence, resultEventSeq: modelSource.seq };

    const model = await authority.appendLiveEvidence({
      accountId: run.accountId,
      runId: run.id,
      evidence: modelEvidence,
    });
    expect(model).toMatchObject({
      runId: run.id,
      seq: 2,
      idempotencyKey: expect.stringMatching(/^jlive-event:[0-9a-f]{64}$/),
      type: 'model',
      status: 'started',
      sourceRefs: [],
      artifactIds: [],
      liveEvidence: modelEvidence,
    });

    const initialCapabilityEvidence: JarvisDurableLiveEvidenceV1 = {
      schemaVersion: 1,
      kind: 'capability',
      accountId: run.accountId,
      runId: run.id,
      requestId: 'request-alpha',
      attemptNumber: 1,
      registrationId: 'registration-capability',
      producerKind: 'action',
      producerIdentity: {
        producerKind: 'action',
        actionId: 'action-alpha',
        actionVersion: 1,
        executionId: 'execution-alpha',
      },
      transition: 'busy',
      operations: ['execute', 'cancel'],
      resultRef: 'action-start-alpha',
      resultEventSeq: 1,
      observedAt: NOW + 3,
      category: 'tool',
      capabilityId: 'action-alpha',
    };
    const capabilitySource = await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture({
        idempotencyKey: 'capability-producer-source',
        type: 'tool',
        status: 'busy',
        createdAt: initialCapabilityEvidence.observedAt,
        producerSourceEvidence: producerSourceEvidenceFixture(initialCapabilityEvidence),
      }),
    );
    const capabilityEvidence = {
      ...initialCapabilityEvidence,
      resultEventSeq: capabilitySource.seq,
    };
    const capability = await authority.appendLiveEvidence({
      accountId: run.accountId,
      runId: run.id,
      evidence: capabilityEvidence,
    });
    expect(capability).toMatchObject({
      seq: 4,
      type: 'tool',
      status: 'busy',
      sourceRefs: [],
      artifactIds: [],
      liveEvidence: capabilityEvidence,
    });
  });

  it('returns the identical row and rejects a changed payload for the same proof link', async () => {
    const database = await openTestDb('jarvis-live-evidence-idempotency');
    const repositories = createJarvisRepositories(database);
    const authority = createJarvisLiveEvidenceEventCommitAuthority(database);
    const run = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(run);
    const initialEvidence = liveEvidenceFixture();
    const source = await repositories.event.appendIdempotent(
      run.accountId,
      run.id,
      nonTransitionEventFixture({
        idempotencyKey: 'producer-source',
        type: 'model',
        status: 'started',
        createdAt: initialEvidence.observedAt,
        producerSourceEvidence: producerSourceEvidenceFixture(initialEvidence),
      }),
    );
    const evidence = { ...initialEvidence, resultEventSeq: source.seq };

    const first = await authority.appendLiveEvidence({
      accountId: run.accountId,
      runId: run.id,
      evidence,
    });
    const retry = await authority.appendLiveEvidence({
      accountId: run.accountId,
      runId: run.id,
      evidence: structuredClone(evidence),
    });
    expect(retry).toEqual(first);
    await expectRepositoryError(
      authority.appendLiveEvidence({
        accountId: run.accountId,
        runId: run.id,
        evidence: { ...evidence, resultRef: 'changed-under-same-initial-link' },
      }),
      'event_idempotency_conflict',
    );
    expect(await database.jarvis_events.count()).toBe(2);
  });

  it('rejects foreign repetition, missing source rows, and operations outside the closed set', async () => {
    const database = await openTestDb('jarvis-live-evidence-validation');
    const repositories = createJarvisRepositories(database);
    const authority = createJarvisLiveEvidenceEventCommitAuthority(database);
    const run = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(run);

    for (const evidence of [
      liveEvidenceFixture({ accountId: 'account-beta' }),
      liveEvidenceFixture({ runId: 'run-beta' }),
      liveEvidenceFixture({ operations: ['generate', 'delete_everything'] }),
    ]) {
      await expectRepositoryError(
        authority.appendLiveEvidence({
          accountId: run.accountId,
          runId: run.id,
          evidence,
        }),
        'live_evidence_integrity_error',
      );
    }

    await expectRepositoryError(
      authority.appendLiveEvidence({
        accountId: run.accountId,
        runId: run.id,
        evidence: liveEvidenceFixture(),
      }),
      'live_evidence_integrity_error',
    );
    expect(await database.jarvis_events.count()).toBe(0);
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
  it('lists only account-owned artifacts newest-first with a bounded limit', async () => {
    const db = await openTestDb('jarvis-repositories-artifacts-by-account');
    const repositories = createJarvisRepositories(db);
    const firstRun = runFixture({ id: 'run-first', accountId: 'account-alpha' });
    const secondRun = runFixture({ id: 'run-second', accountId: 'account-alpha' });
    const foreignRun = runFixture({ id: 'run-foreign', accountId: 'account-beta' });
    await repositories.run.createIdempotent(firstRun);
    await repositories.run.createIdempotent(secondRun);
    await repositories.run.createIdempotent(foreignRun);
    const older = artifactFixture({
      id: 'artifact-older',
      runId: firstRun.id,
      createdAt: NOW - 10,
    });
    const newest = artifactFixture({ id: 'artifact-newest', runId: secondRun.id, createdAt: NOW });
    const foreign = artifactFixture({
      id: 'artifact-foreign',
      runId: foreignRun.id,
      createdAt: NOW + 10,
    });
    await db.jarvis_artifacts.bulkPut(
      [older, newest, foreign].map((artifact) => toJarvisArtifactRow(artifact)),
    );

    expect(await repositories.artifact.listByAccount('account-alpha')).toEqual([newest, older]);
    expect(await repositories.artifact.listByAccount('account-alpha', 1)).toEqual([newest]);
    expect(await repositories.artifact.listByAccount('account-beta')).toEqual([foreign]);
    await expectRepositoryError(
      repositories.artifact.listByAccount('account-alpha', 0),
      'invalid_limit',
    );
  });

  it('reads approvals only through an account-owned parent run', async () => {
    const db = await openTestDb('jarvis-repositories-children');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);
    const approval = approvalFixture();
    const artifact = artifactFixture();

    await db.jarvis_approvals.put(toJarvisApprovalRow(approval));
    await db.jarvis_artifacts.put(toJarvisArtifactRow(artifact));
    expect(await repositories.approval.getById(run.accountId, approval.id)).toEqual(approval);
    expect(await repositories.approval.listByRun(run.accountId, run.id)).toEqual([approval]);
    expect(await repositories.artifact.getById(run.accountId, artifact.id)).toEqual(artifact);
    expect(await repositories.artifact.listByRun(run.accountId, run.id)).toEqual([artifact]);

    expect(await repositories.approval.getById('account-beta', approval.id)).toBeUndefined();
    await expectRepositoryError(
      repositories.approval.listByRun('account-beta', run.id),
      'parent_run_not_found',
    );
    expect(await repositories.artifact.getById('account-beta', artifact.id)).toBeUndefined();
    expect(await repositories.artifact.getById('account-beta', 'missing-artifact')).toBeUndefined();
    expect(repositories.approval).not.toHaveProperty('putForRun');
    expect(repositories.artifact).not.toHaveProperty('putForRun');
  });

  it('uses the same parent-not-found error for missing and foreign child list parents', async () => {
    const db = await openTestDb('jarvis-repositories-child-parent-oracle');
    const repositories = createJarvisRepositories(db);
    const foreignRun = runFixture({ id: 'run-foreign', accountId: 'account-beta' });
    await repositories.run.createIdempotent(foreignRun);

    for (const runId of ['missing-run', foreignRun.id]) {
      const commit = createJarvisArtifactCommitAuthority(
        db,
        createJarvisArtifactRuntimeInternals({
          randomUUID: () => 'must-not-mint',
          now: () => NOW,
        }),
      );
      await expectRepositoryError(
        repositories.approval.listByRun('account-alpha', runId),
        'parent_run_not_found',
      );
      await expectRepositoryError(
        commit.putForRun('account-alpha', artifactFixture({ id: `artifact-${runId}`, runId })),
        'parent_run_not_found',
      );
      await expectRepositoryError(
        repositories.artifact.listByRun('account-alpha', runId),
        'parent_run_not_found',
      );
    }
  });

  it('never overwrites an artifact ID already bound to another run', async () => {
    const db = await openTestDb('jarvis-repositories-child-id-collision');
    const repositories = createJarvisRepositories(db);
    const firstRun = runFixture();
    const secondRun = runFixture({ id: 'run-second' });
    const foreignRun = runFixture({ id: 'run-foreign-collision', accountId: 'account-beta' });
    await repositories.run.createIdempotent(firstRun);
    await repositories.run.createIdempotent(secondRun);
    await repositories.run.createIdempotent(foreignRun);
    const artifact = artifactFixture();
    await db.jarvis_artifacts.put(toJarvisArtifactRow(artifact));
    const commit = createJarvisArtifactCommitAuthority(
      db,
      createJarvisArtifactRuntimeInternals({
        randomUUID: () => 'must-not-mint',
        now: () => NOW,
      }),
    );
    await expectRepositoryError(
      commit.putForRun(
        secondRun.accountId,
        artifactFixture({ runId: secondRun.id, title: 'Collision overwrite' }),
      ),
      'parent_run_not_found',
    );
    await expectRepositoryError(
      commit.putForRun(
        foreignRun.accountId,
        artifactFixture({ runId: foreignRun.id, title: 'Foreign collision overwrite' }),
      ),
      'parent_run_not_found',
    );
    expect(await repositories.artifact.getById(firstRun.accountId, artifact.id)).toEqual(artifact);
  });

  it('filters and bounds detached approval evidence reads', async () => {
    const db = await openTestDb('jarvis-repositories-approval-list');
    const repositories = createJarvisRepositories(db);
    const run = runFixture();
    await repositories.run.createIdempotent(run);
    const approvals = [
      approvalFixture({
        id: 'approval-1',
        requestId: 'request-1',
        attemptNumber: 1,
        createdAt: NOW,
      }),
      approvalFixture({
        id: 'approval-2',
        requestId: 'request-2',
        attemptNumber: 2,
        createdAt: NOW + 1,
      }),
      approvalFixture({
        id: 'approval-3',
        requestId: 'request-2',
        attemptNumber: 2,
        createdAt: NOW + 2,
      }),
    ];
    await db.jarvis_approvals.bulkPut(approvals.map(toJarvisApprovalRow));

    const listed = await repositories.approval.listByRun(run.accountId, run.id, {
      requestId: 'request-2',
      attemptNumber: 2,
      createdAtOrAfter: NOW + 1,
      limit: 1,
    });
    expect(listed).toEqual([approvals[1]]);
    (listed[0]!.params as { nested: { overwrite: boolean } }).nested.overwrite = true;
    expect(
      (await repositories.approval.getById(run.accountId, 'approval-2'))?.params,
    ).toMatchObject({ nested: { overwrite: false } });
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
        repositories.approval.listByRun(run.accountId, run.id, { limit }),
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
    await db.jarvis_approvals.put(toJarvisApprovalRow(approval));
    const createdApproval = await repositories.approval.getById(run.accountId, approval.id);
    await db.jarvis_artifacts.put(toJarvisArtifactRow(artifact));
    const createdArtifact = await repositories.artifact.getById(run.accountId, artifact.id);
    if (!createdArtifact) throw new Error('Expected persisted artifact');
    await repositories.profile.updateCustomInstructions(profile.accountId, profile.id, 'changed');

    createdRun.model.capabilities.tools = false;
    createdEvent.sourceRefs[0]!.label = 'mutated';
    (createdApproval!.params as { nested: { overwrite: boolean } }).nested.overwrite = true;
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

describe('Task 20A private artifact commit authority', () => {
  async function createArtifactCommitHarness(prefix: string) {
    const database = await openTestDb(prefix);
    const repositories = createJarvisRepositories(database);
    const parent = runFixture();
    await repositories.run.createIdempotent(parent);
    let uuidIndex = 0;
    const uuids = ['artifact-verified', 'receipt-verified'];
    const runtime = createJarvisArtifactRuntimeInternals({
      randomUUID: () => uuids[uuidIndex++] ?? `extra-${uuidIndex}`,
      now: () => NOW,
    });
    const artifact = await runtime.materializeVerified({
      binding: {
        accountId: parent.accountId,
        runId: parent.id,
        requestId: 'request-alpha',
        attemptNumber: 1,
        producerId: 'file_action_result',
        resultRef: 'file-result-alpha',
        verifiedAt: NOW,
      },
      draft: {
        artifact: {
          kind: 'file',
          title: 'Verified generated file',
          mimeType: 'text/plain',
          safeSummary: 'A synthetic generated file.',
          sourceRefs: [],
          createdAt: NOW,
        },
        backing: {
          kind: 'local_reference',
          localReference: { kind: 'path', value: 'C:/sandbox/generated.txt' },
          content: 'verified bytes',
        },
      },
    });
    const authority = createJarvisArtifactCommitAuthority(database, runtime);
    return { database, repositories, parent, runtime, artifact, authority };
  }

  it('keeps the public repository read-only and commits exact pending identity once', async () => {
    const harness = await createArtifactCommitHarness('jarvis-artifact-private-commit');
    expect(harness.repositories.artifact).not.toHaveProperty('putForRun');

    const committed = await harness.authority.putForRun(harness.parent.accountId, harness.artifact);
    expect(committed).toEqual(harness.artifact);
    expect(committed).not.toBe(harness.artifact);
    expect(
      await harness.repositories.artifact.getById(harness.parent.accountId, harness.artifact.id),
    ).toEqual(harness.artifact);

    expect(await harness.authority.putForRun(harness.parent.accountId, harness.artifact)).toEqual(
      harness.artifact,
    );
    expect(await harness.database.jarvis_artifacts.count()).toBe(1);
  });

  it('rejects unverified identity and immutable-ID overwrite attempts', async () => {
    const harness = await createArtifactCommitHarness('jarvis-artifact-immutable-commit');
    const unverified = structuredClone(harness.artifact);
    unverified.id = 'jart_unverified';
    await expect(harness.authority.putForRun(harness.parent.accountId, unverified)).rejects.toThrow(
      'artifact_commit_not_pending',
    );
    expect(await harness.database.jarvis_artifacts.get(unverified.id)).toBeUndefined();

    await harness.authority.putForRun(harness.parent.accountId, harness.artifact);
    const changed = structuredClone(harness.artifact);
    changed.title = 'Attempted overwrite';
    await expectRepositoryError(
      harness.authority.putForRun(harness.parent.accountId, changed),
      'artifact_integrity_error',
    );
    expect(
      (await harness.repositories.artifact.getById(harness.parent.accountId, harness.artifact.id))
        ?.title,
    ).toBe('Verified generated file');
  });

  it.each(['forged no-op literal', 'cloned runtime'] as const)(
    'rejects a %s capability before opening artifact write authority',
    async (attempt) => {
      const database = await openTestDb(
        `jarvis-artifact-capability-${attempt.replaceAll(' ', '-')}`,
      );
      const repositories = createJarvisRepositories(database);
      const parent = runFixture();
      await repositories.run.createIdempotent(parent);
      const runtime = createJarvisArtifactRuntimeInternals({
        randomUUID: () => 'capability-test',
        now: () => NOW,
      });
      const candidate =
        attempt === 'forged no-op literal'
          ? ({ consumePendingForCommit: vi.fn() } as never)
          : ({ ...runtime } as never);

      expect(() => createJarvisArtifactCommitAuthority(database, candidate)).toThrow(
        'artifact_commit_capability_invalid',
      );
      expect(await database.jarvis_artifacts.count()).toBe(0);
    },
  );

  it('rejects an artifact pending under a foreign runtime capability before database write', async () => {
    const harness = await createArtifactCommitHarness('jarvis-artifact-foreign-capability');
    const foreignRuntime = createJarvisArtifactRuntimeInternals({
      randomUUID: () => 'foreign-runtime',
      now: () => NOW,
    });
    const foreignAuthority = createJarvisArtifactCommitAuthority(harness.database, foreignRuntime);

    await expect(
      foreignAuthority.putForRun(harness.parent.accountId, harness.artifact),
    ).rejects.toThrow('artifact_commit_not_pending');
    expect(await harness.database.jarvis_artifacts.count()).toBe(0);
  });
});

describe('Task 18 live-evidence commit authority', () => {
  async function createLiveEvidenceHarness(prefix: string) {
    const database = await openTestDb(prefix);
    const repositories = createJarvisRepositories(database);
    const parent = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(parent);
    const initial = liveEvidenceFixture();
    if (initial.kind !== 'model') throw new Error('Expected model live-evidence fixture');
    const source = await repositories.event.appendIdempotent(
      parent.accountId,
      parent.id,
      nonTransitionEventFixture({
        idempotencyKey: 'provider-source-alpha',
        type: 'model',
        status: 'started',
        title: 'Provider started',
        createdAt: initial.observedAt,
        producerSourceEvidence: producerSourceEvidenceFixture(initial),
      }),
    );
    return {
      database,
      repositories,
      parent,
      evidence: liveEvidenceFixture({ resultEventSeq: source.seq }),
      authority: createJarvisLiveEvidenceEventCommitAuthority(database),
    };
  }

  it('forces a safe account-owned event with a detached exact sequence readback', async () => {
    const harness = await createLiveEvidenceHarness('jarvis-live-evidence-commit');
    const committed = await harness.authority.appendLiveEvidence({
      accountId: harness.parent.accountId,
      runId: harness.parent.id,
      evidence: harness.evidence,
    });

    expect(committed).toMatchObject({
      runId: harness.parent.id,
      seq: 2,
      type: 'model',
      status: 'started',
      title: 'Model live evidence committed',
      safeSummary: 'Canonical live evidence was recorded.',
      sourceRefs: [],
      artifactIds: [],
      createdAt: harness.evidence.observedAt,
      liveEvidence: harness.evidence,
    });
    expect(committed.idempotencyKey).toMatch(/^jlive-event:[a-f0-9]{64}$/);
    (committed.liveEvidence!.operations as string[])[0] = 'mutated';
    expect(
      (
        await harness.repositories.event.getBySeq(
          harness.parent.accountId,
          harness.parent.id,
          committed.seq,
        )
      )?.liveEvidence?.operations,
    ).toEqual(['generate', 'stream']);
  });

  it('deduplicates identical evidence and rejects changed payload for the same occurrence', async () => {
    const harness = await createLiveEvidenceHarness('jarvis-live-evidence-idempotency');
    const input = {
      accountId: harness.parent.accountId,
      runId: harness.parent.id,
      evidence: harness.evidence,
    };
    const first = await harness.authority.appendLiveEvidence(input);
    expect(
      await harness.authority.appendLiveEvidence({
        ...input,
        evidence: structuredClone(input.evidence),
      }),
    ).toEqual(first);
    await expectRepositoryError(
      harness.authority.appendLiveEvidence({
        ...input,
        evidence: { ...harness.evidence, operations: ['changed-operation'] },
      }),
      'live_evidence_integrity_error',
    );
    expect(await harness.database.jarvis_events.count()).toBe(2);
  });

  it('rejects foreign scope, mismatched repeated identity, and noncanonical transition links', async () => {
    const harness = await createLiveEvidenceHarness('jarvis-live-evidence-invalid');
    await expectRepositoryError(
      harness.authority.appendLiveEvidence({
        accountId: 'account-beta',
        runId: harness.parent.id,
        evidence: harness.evidence,
      }),
      'parent_run_not_found',
    );
    for (const evidence of [
      { ...harness.evidence, accountId: 'account-beta' },
      { ...harness.evidence, resultEventSeq: 999 },
    ]) {
      await expectRepositoryError(
        harness.authority.appendLiveEvidence({
          accountId: harness.parent.accountId,
          runId: harness.parent.id,
          evidence,
        }),
        'live_evidence_integrity_error',
      );
    }
    expect(await harness.database.jarvis_events.count()).toBe(1);
  });

  it('rolls back allocation when event insertion fails', async () => {
    const harness = await createLiveEvidenceHarness('jarvis-live-evidence-rollback');
    vi.spyOn(harness.database.jarvis_events, 'add').mockRejectedValueOnce(
      new Error('injected live evidence failure'),
    );
    await expect(
      harness.authority.appendLiveEvidence({
        accountId: harness.parent.accountId,
        runId: harness.parent.id,
        evidence: harness.evidence,
      }),
    ).rejects.toThrow('injected live evidence failure');
    expect(await harness.database.jarvis_events.count()).toBe(1);
  });
});

describe('Task 18 transport-attempt CAS', () => {
  async function beginInitial(prefix: string) {
    const database = await openTestDb(prefix);
    const repositories = createJarvisRepositories(database);
    const queued = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(queued);
    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'queued',
      snapshot: scheduledRetrySnapshotFixture(),
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    if (!result.applied) throw new Error(`Expected begin_initial: ${result.reason}`);
    return { database, repositories, queued, result };
  }

  it('atomically begins attempt one and forces queued -> running with its event sequence', async () => {
    const { database, queued, result } = await beginInitial('jarvis-attempt-begin-initial');
    expect(result.run).toMatchObject({
      ...queued,
      status: 'running',
      updatedAt: NOW,
      transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
    });
    expect(result.event).toMatchObject({
      runId: queued.id,
      seq: 1,
      type: 'run_state',
      status: 'running',
      producerSourceEvidence: {
        producerKind: 'schedule',
        producerIdentity: {
          eventId: 'schedule-event-alpha',
          occurrenceId: 'jocc_schedule_alpha',
        },
        requestId: 'request-alpha',
        attemptNumber: 1,
        phase: 'start',
        state: 'started',
        resultRef: 'jstart_run-alpha_request-alpha_1',
        observedAt: NOW,
      },
    });
    expect(await database.jarvis_events.count()).toBe(1);
  });

  it('stores the immutable schedule snapshot with attempt one and rejects an existing snapshot without writes', async () => {
    const expectedSnapshot = scheduledRetrySnapshotFixture();
    const database = await openTestDb('jarvis-attempt-begin-initial-snapshot');
    const repositories = createJarvisRepositories(database);
    const queued = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(queued);

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'queued',
      snapshot: expectedSnapshot,
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });

    expect(result).toMatchObject({
      applied: true,
      run: { scheduledRetrySnapshot: expectedSnapshot },
    });
    if (!result.applied) return;
    expect(result.run.scheduledRetrySnapshot).not.toBe(expectedSnapshot);

    const occupiedDatabase = await openTestDb('jarvis-attempt-begin-initial-snapshot-occupied');
    const occupiedRepositories = createJarvisRepositories(occupiedDatabase);
    const occupied = runFixture({ source: 'schedule', scheduledRetrySnapshot: expectedSnapshot });
    await occupiedRepositories.run.createIdempotent(occupied);
    const occupiedResult = await occupiedRepositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: occupied.accountId,
      runId: occupied.id,
      expectedStatus: 'queued',
      snapshot: expectedSnapshot,
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    expect(occupiedResult).toEqual({
      applied: false,
      current: occupied,
      reason: 'attempt_conflict',
    });
    expect(await occupiedDatabase.jarvis_events.count()).toBe(0);

    const missingDatabase = await openTestDb('jarvis-attempt-begin-initial-snapshot-missing');
    const missingRepositories = createJarvisRepositories(missingDatabase);
    await missingRepositories.run.createIdempotent(queued);
    const missingInput = {
      kind: 'begin_initial',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'queued',
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    } as unknown as JarvisTransportAttemptMutationInput;
    await expect(
      missingRepositories.run.compareAndMutateTransportAttempt(missingInput),
    ).resolves.toEqual({ applied: false, current: queued, reason: 'attempt_conflict' });
    expect(await missingDatabase.jarvis_events.count()).toBe(0);
  });

  it('rejects a different expected snapshot before terminal settlement writes', async () => {
    const expectedSnapshot = scheduledRetrySnapshotFixture();
    const database = await openTestDb('jarvis-attempt-settlement-snapshot-conflict');
    const repositories = createJarvisRepositories(database);
    const queued = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(queued);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'queued',
      snapshot: expectedSnapshot,
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const before = await repositories.run.getById(queued.accountId, queued.id);

    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_uncertain_failed',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'running',
      expectedAttemptNumber: 1,
      expectedSnapshot: {
        ...expectedSnapshot,
        request: { ...expectedSnapshot.request, userText: 'Different request.' },
      },
      providerFailure: providerFailureFixture(),
      updatedAt: NOW + 2,
      completedAt: NOW + 2,
    });

    expect(result).toEqual({ applied: false, current: before, reason: 'attempt_conflict' });
    expect(await repositories.run.getById(queued.accountId, queued.id)).toEqual(before);
    expect(await database.jarvis_events.count()).toBe(1);
  });

  it('rejects a different expected snapshot before retryable settlement or retry writes', async () => {
    const expectedSnapshot = scheduledRetrySnapshotFixture();
    const differentSnapshot = { ...expectedSnapshot, logicalAttempt: 2 };
    const database = await openTestDb('jarvis-attempt-retry-snapshot-conflicts');
    const repositories = createJarvisRepositories(database);
    const queued = runFixture({ source: 'schedule' });
    await repositories.run.createIdempotent(queued);
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_initial',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'queued',
      snapshot: expectedSnapshot,
      attempt: transportAttemptFixture(),
      updatedAt: NOW,
    });
    const providerFailure = providerFailureFixture();
    const evidence = zeroEffectEvidenceFixture({ providerBoundary: providerFailure });
    const beforeSettlement = await repositories.run.getById(queued.accountId, queued.id);
    const settlement = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'running',
      expectedSnapshot: differentSnapshot,
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure,
      zeroEffectEvidence: evidence,
      updatedAt: NOW + 2,
    });
    expect(settlement).toEqual({
      applied: false,
      current: beforeSettlement,
      reason: 'attempt_conflict',
    });
    expect(await database.jarvis_events.count()).toBe(1);

    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'running',
      expectedSnapshot,
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure,
      zeroEffectEvidence: evidence,
      updatedAt: NOW + 2,
    });
    const beforeRetry = await repositories.run.getById(queued.accountId, queued.id);
    const retry = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_retry',
      accountId: queued.accountId,
      runId: queued.id,
      expectedStatus: 'running',
      expectedSnapshot: differentSnapshot,
      expectedLatestAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 2,
      revalidatedEvidence: evidence,
      attempt: transportAttemptFixture({
        attemptNumber: 2,
        kind: 'transport_retry',
        requestId: 'request-beta',
      }),
      updatedAt: NOW + 3,
    });
    expect(retry).toEqual({ applied: false, current: beforeRetry, reason: 'attempt_conflict' });
    expect(await database.jarvis_events.count()).toBe(2);
  });

  it('rejects status, source, history, request, and attempt-number mismatches without writes', async () => {
    const cases: Array<{
      name: string;
      run: JarvisRun;
      attempt: ReturnType<typeof transportAttemptFixture>;
    }> = [
      {
        name: 'status',
        run: runFixture({ source: 'schedule', status: 'running' }),
        attempt: transportAttemptFixture(),
      },
      { name: 'source', run: runFixture(), attempt: transportAttemptFixture() },
      {
        name: 'history',
        run: runFixture({
          source: 'schedule',
          transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
        }),
        attempt: transportAttemptFixture(),
      },
      {
        name: 'number',
        run: runFixture({ source: 'schedule' }),
        attempt: transportAttemptFixture({ attemptNumber: 2 }),
      },
      {
        name: 'request',
        run: runFixture({ source: 'schedule' }),
        attempt: transportAttemptFixture({ requestId: '' }),
      },
    ];
    for (const value of cases) {
      const database = await openTestDb(`jarvis-attempt-invalid-${value.name}`);
      const repositories = createJarvisRepositories(database);
      await repositories.run.createIdempotent(value.run);
      const result = await repositories.run.compareAndMutateTransportAttempt({
        kind: 'begin_initial',
        accountId: value.run.accountId,
        runId: value.run.id,
        expectedStatus: 'queued',
        snapshot: scheduledRetrySnapshotFixture(),
        attempt: value.attempt,
        updatedAt: NOW,
      });
      expect(result.applied).toBe(false);
      expect(await database.jarvis_events.count()).toBe(0);
    }
  });

  it('settles a proven zero-effect failure without terminalizing the run', async () => {
    const { database, repositories } = await beginInitial('jarvis-attempt-settle-retryable');
    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure: providerFailureFixture(),
      zeroEffectEvidence: zeroEffectEvidenceFixture(),
      updatedAt: NOW + 3,
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.run.status).toBe('running');
    expect(result.run.transportAttempts?.[0]).toMatchObject({
      state: 'retryable_failed',
      failureCategory: 'network_unavailable',
      zeroEffectEvidence: zeroEffectEvidenceFixture(),
    });
    expect(result.event).toMatchObject({
      seq: 2,
      type: 'warning',
      status: 'transport_retry_available',
      canonicalResultEvidence: {
        kind: 'scheduled_transport_settled',
        accountId: 'account-alpha',
        runId: 'run-alpha',
        requestId: 'request-alpha',
        attemptNumber: 1,
        state: 'degraded',
        resultRef: 'jresult_run-alpha_request-alpha_1_transport',
        observedAt: NOW + 3,
      },
    });
    expect(await database.jarvis_events.count()).toBe(2);
  });

  it('begins retry only when the canonical availability event is the uninterrupted tail', async () => {
    const { repositories } = await beginInitial('jarvis-attempt-begin-retry');
    const evidence = zeroEffectEvidenceFixture();
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure: providerFailureFixture(),
      zeroEffectEvidence: evidence,
      updatedAt: NOW + 3,
    });
    const revalidatedEvidence = {
      ...evidence,
      assessedAt: NOW + 4,
      executorClaims: { count: 0 as const, throughSeq: 2, evidenceRef: 'claims-refreshed' },
    };
    const retry = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_retry',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedLatestAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 2,
      revalidatedEvidence,
      attempt: transportAttemptFixture({
        attemptNumber: 2,
        kind: 'transport_retry',
        requestId: 'request-beta',
        createdAt: NOW + 4,
        updatedAt: NOW + 4,
        effectBarrier: { state: 'open', version: 0, updatedAt: NOW + 4 },
      }),
      updatedAt: NOW + 4,
    });
    expect(retry.applied).toBe(true);
    if (!retry.applied) return;
    expect(retry.event).toMatchObject({ seq: 3, status: 'transport_retry_started' });
    expect(retry.run.transportAttempts).toHaveLength(2);
    expect(retry.run.transportAttempts?.[0]?.effectBarrier.state).toBe('sealed_for_retry');
    expect(retry.run.transportAttempts?.[1]).toMatchObject({
      attemptNumber: 2,
      requestId: 'request-beta',
      startedEventSeq: 3,
    });
  });

  it('rejects retry after any intervening or mismatched tail event', async () => {
    const { database, repositories } = await beginInitial('jarvis-attempt-retry-tail-conflict');
    const evidence = zeroEffectEvidenceFixture();
    await repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_retryable',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 1,
      providerFailure: providerFailureFixture(),
      zeroEffectEvidence: evidence,
      updatedAt: NOW + 3,
    });
    await repositories.event.appendIdempotent(
      'account-alpha',
      'run-alpha',
      nonTransitionEventFixture({ idempotencyKey: 'intervening-event', createdAt: NOW + 4 }),
    );
    const before = await repositories.run.getById('account-alpha', 'run-alpha');
    const result = await repositories.run.compareAndMutateTransportAttempt({
      kind: 'begin_retry',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedLatestAttemptNumber: 1,
      expectedBarrierVersion: 0,
      expectedEventTailSeq: 3,
      revalidatedEvidence: evidence,
      attempt: transportAttemptFixture({
        attemptNumber: 2,
        kind: 'transport_retry',
        requestId: 'request-beta',
      }),
      updatedAt: NOW + 5,
    });
    expect(result).toEqual({ applied: false, current: before, reason: 'attempt_conflict' });
    expect(await database.jarvis_events.count()).toBe(3);
  });

  it('terminalizes uncertain failure atomically and rolls back event insertion failure', async () => {
    const first = await beginInitial('jarvis-attempt-uncertain');
    const terminal = await first.repositories.run.compareAndMutateTransportAttempt({
      kind: 'settle_uncertain_failed',
      accountId: 'account-alpha',
      runId: 'run-alpha',
      expectedStatus: 'running',
      expectedSnapshot: scheduledRetrySnapshotFixture(),
      expectedAttemptNumber: 1,
      providerFailure: providerFailureFixture(),
      updatedAt: NOW + 5,
      completedAt: NOW + 5,
    });
    expect(terminal.applied).toBe(true);
    if (terminal.applied) {
      expect(terminal.run).toMatchObject({ status: 'failed', completedAt: NOW + 5 });
      expect(terminal.run.transportAttempts?.[0]?.state).toBe('effect_uncertain');
      expect(terminal.event).toMatchObject({
        type: 'run_state',
        status: 'failed',
        canonicalResultEvidence: {
          kind: 'scheduled_transport_settled',
          accountId: 'account-alpha',
          runId: 'run-alpha',
          requestId: 'request-alpha',
          attemptNumber: 1,
          state: 'degraded',
          resultRef: 'jresult_run-alpha_request-alpha_1_transport',
          observedAt: NOW + 5,
        },
      });
    }

    const rollback = await beginInitial('jarvis-attempt-uncertain-rollback');
    const before = await rollback.repositories.run.getById('account-alpha', 'run-alpha');
    vi.spyOn(rollback.database.jarvis_events, 'add').mockRejectedValueOnce(
      new Error('injected attempt event failure'),
    );
    await expect(
      rollback.repositories.run.compareAndMutateTransportAttempt({
        kind: 'settle_uncertain_failed',
        accountId: 'account-alpha',
        runId: 'run-alpha',
        expectedStatus: 'running',
        expectedSnapshot: scheduledRetrySnapshotFixture(),
        expectedAttemptNumber: 1,
        providerFailure: providerFailureFixture(),
        updatedAt: NOW + 5,
        completedAt: NOW + 5,
      }),
    ).rejects.toThrow('injected attempt event failure');
    expect(await rollback.repositories.run.getById('account-alpha', 'run-alpha')).toEqual(before);
    expect(await rollback.database.jarvis_events.count()).toBe(1);
  });
});

describe('Task 18 attempt-effect claim authority', () => {
  it('snapshots a claim before the owned-run read so caller mutation cannot cross run scope', async () => {
    const database = await openTestDb('jarvis-effect-mutable-claim-snapshot');
    const repositories = createJarvisRepositories(database);
    const scheduled = (id: string, accountId: string) =>
      runFixture({
        id,
        accountId,
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      });
    await repositories.run.createIdempotent(scheduled('run-alpha', 'account-alpha'));
    await repositories.run.createIdempotent(scheduled('run-beta', 'account-beta'));
    const claim = effectClaimFixture() as {
      -readonly [K in keyof JarvisAttemptEffectClaimInput]: JarvisAttemptEffectClaimInput[K];
    };
    const originalGet = database.jarvis_runs.get.bind(database.jarvis_runs);
    const get = vi.spyOn(database.jarvis_runs, 'get').mockImplementationOnce((runId) => {
      const ownedRead = originalGet(runId);
      claim.runId = 'run-beta';
      claim.accountId = 'account-beta';
      return ownedRead;
    });

    let result: Awaited<ReturnType<typeof repositories.run.claimAttemptEffect>>;
    try {
      result = await repositories.run.claimAttemptEffect(claim);
    } finally {
      get.mockRestore();
    }

    expect(result).toMatchObject({
      applied: true,
      kind: 'barrier_claimed',
      event: { runId: 'run-alpha' },
    });
    await expect(repositories.run.getById('account-alpha', 'run-alpha')).resolves.toMatchObject({
      transportAttempts: [{ effectBarrier: { state: 'dirty', version: 1 } }],
    });
    await expect(repositories.run.getById('account-beta', 'run-beta')).resolves.toMatchObject({
      transportAttempts: [{ effectBarrier: { state: 'open', version: 0 } }],
    });
    expect(await repositories.event.listByRun('account-alpha', 'run-alpha')).toHaveLength(1);
    expect(await repositories.event.listByRun('account-beta', 'run-beta')).toHaveLength(0);
  });

  it('snapshots generic append accessors once before reserved namespace and evidence checks', async () => {
    const database = await openTestDb('jarvis-effect-accessor-append-snapshot');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(runFixture());
    const claim = effectClaimFixture();
    const reservedKey = `jeffect:${claim.runId}:${claim.requestId}:${claim.attemptNumber}:${claim.ownerKind}:${claim.ownerId}:${claim.evidenceRef}`;
    let keyReads = 0;
    let evidenceReads = 0;
    const input = { ...nonTransitionEventFixture({ idempotencyKey: 'ordinary-event-key' }) };
    Object.defineProperties(input, {
      idempotencyKey: {
        configurable: true,
        enumerable: true,
        get: () => (++keyReads <= 2 ? 'ordinary-event-key' : reservedKey),
      },
      executionEvidence: {
        configurable: true,
        enumerable: true,
        get: () => (++evidenceReads === 1 ? undefined : executionEvidenceForClaim(claim)),
      },
    });

    await expect(
      repositories.event.appendIdempotent(claim.accountId, claim.runId, input),
    ).rejects.toMatchObject({ code: 'event_idempotency_conflict' });
    const rows = await database.jarvis_events.toArray();
    expect(rows).toHaveLength(0);
    expect(keyReads).toBe(1);
    expect(evidenceReads).toBe(1);
  });

  it('fails closed before writes when claim detachment evaluates a throwing accessor', async () => {
    const database = await openTestDb('jarvis-effect-claim-clone-failure');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(
      runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      }),
    );
    const claim = effectClaimFixture();
    Object.defineProperty(claim, 'ownerId', {
      configurable: true,
      enumerable: true,
      get: () => {
        throw new Error('untrusted claim accessor');
      },
    });

    await expect(repositories.run.claimAttemptEffect(claim)).rejects.toMatchObject({
      code: 'attempt_effect_integrity_error',
    });
    await expect(repositories.run.getById('account-alpha', 'run-alpha')).resolves.toMatchObject({
      transportAttempts: [{ effectBarrier: { state: 'open', version: 0 } }],
    });
    expect(await database.jarvis_events.count()).toBe(0);
  });

  it('fails closed before writes when generic append detachment evaluates a throwing accessor', async () => {
    const database = await openTestDb('jarvis-effect-append-clone-failure');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(runFixture());
    const input = { ...nonTransitionEventFixture() };
    Object.defineProperty(input, 'idempotencyKey', {
      configurable: true,
      enumerable: true,
      get: () => {
        throw new Error('untrusted event accessor');
      },
    });

    await expect(
      repositories.event.appendIdempotent('account-alpha', 'run-alpha', input),
    ).rejects.toMatchObject({ code: 'event_idempotency_conflict' });
    expect(await database.jarvis_events.count()).toBe(0);
  });

  it('rejects generic event append using the reserved effect-claim idempotency namespace', async () => {
    const database = await openTestDb('jarvis-effect-reserved-idempotency');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(runFixture());
    const claim = effectClaimFixture();

    await expect(
      repositories.event.appendIdempotent(
        claim.accountId,
        claim.runId,
        nonTransitionEventFixture({
          idempotencyKey: `jeffect:${claim.runId}:${claim.requestId}:${claim.attemptNumber}:${claim.ownerKind}:${claim.ownerId}:${claim.evidenceRef}`,
        }),
      ),
    ).rejects.toMatchObject({ code: 'attempt_effect_integrity_error' });
    expect(await database.jarvis_events.count()).toBe(0);
  });

  it('rejects generic event append carrying reserved consequential-effect claim evidence', async () => {
    const database = await openTestDb('jarvis-effect-reserved-evidence');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(runFixture());
    const claim = effectClaimFixture();

    await expect(
      repositories.event.appendIdempotent(
        claim.accountId,
        claim.runId,
        nonTransitionEventFixture({
          idempotencyKey: 'ordinary-event-key',
          type: 'tool',
          status: 'consequential_effect_claimed',
          executionEvidence: executionEvidenceForClaim(claim),
        }),
      ),
    ).rejects.toMatchObject({ code: 'attempt_effect_integrity_error' });
    expect(await database.jarvis_events.count()).toBe(0);
  });

  it('rejects a pre-existing exact claim row while the attempt barrier remains open', async () => {
    const database = await openTestDb('jarvis-effect-preempted-open-barrier');
    const repositories = createJarvisRepositories(database);
    const claim = effectClaimFixture();
    await repositories.run.createIdempotent(
      runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      }),
    );
    await database.jarvis_events.add(
      toJarvisEventRow({
        runId: claim.runId,
        seq: 1,
        idempotencyKey: `jeffect:${claim.runId}:${claim.requestId}:${claim.attemptNumber}:${claim.ownerKind}:${claim.ownerId}:${claim.evidenceRef}`,
        type: 'tool',
        status: 'consequential_effect_claimed',
        title: 'Consequential effect claimed',
        safeSummary: 'An execution owner claimed the current attempt barrier.',
        sourceRefs: [],
        artifactIds: [],
        createdAt: claim.claimedAt,
        executionEvidence: executionEvidenceForClaim(claim),
      }),
    );

    await expect(repositories.run.claimAttemptEffect(claim)).rejects.toMatchObject({
      code: 'attempt_effect_integrity_error',
    });
    await expect(repositories.run.getById(claim.accountId, claim.runId)).resolves.toMatchObject({
      transportAttempts: [{ effectBarrier: { state: 'open', version: 0 } }],
    });
  });

  it('rejects idempotent claim success when the persisted canonical event row changed', async () => {
    const database = await openTestDb('jarvis-effect-idempotency-canonical-row');
    const repositories = createJarvisRepositories(database);
    const claim = effectClaimFixture();
    await repositories.run.createIdempotent(
      runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      }),
    );
    const first = await repositories.run.claimAttemptEffect(claim);
    expect(first).toMatchObject({ applied: true, kind: 'barrier_claimed' });
    if (!first.applied || first.kind !== 'barrier_claimed') return;
    await database.jarvis_events.update([claim.runId, first.event.seq], {
      title: 'Changed effect claim title',
    });

    await expect(repositories.run.claimAttemptEffect(claim)).rejects.toMatchObject({
      code: 'attempt_effect_integrity_error',
    });
    await expect(repositories.run.getById(claim.accountId, claim.runId)).resolves.toMatchObject({
      transportAttempts: [{ effectBarrier: { state: 'dirty', version: 1 } }],
    });
  });

  it('returns not_applicable only for an account-owned unscheduled run without a ledger', async () => {
    const database = await openTestDb('jarvis-effect-not-applicable');
    const repositories = createJarvisRepositories(database);
    const value = runFixture({ status: 'running' });
    await repositories.run.createIdempotent(value);
    await expect(repositories.run.claimAttemptEffect(effectClaimFixture())).resolves.toEqual({
      applied: true,
      kind: 'not_applicable',
      run: value,
    });
    expect(await database.jarvis_events.count()).toBe(0);
  });

  it('atomically dirties and increments the exact current attempt barrier with a forced event', async () => {
    const database = await openTestDb('jarvis-effect-claim');
    const repositories = createJarvisRepositories(database);
    const value = runFixture({
      source: 'schedule',
      status: 'running',
      transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
    });
    await repositories.run.createIdempotent(value);
    const result = await repositories.run.claimAttemptEffect(effectClaimFixture());
    expect(result.applied).toBe(true);
    if (!result.applied || result.kind !== 'barrier_claimed') return;
    expect(result.run.transportAttempts?.[0]?.effectBarrier).toEqual({
      state: 'dirty',
      version: 1,
      updatedAt: NOW + 1,
    });
    expect(result.event).toMatchObject({
      type: 'tool',
      status: 'consequential_effect_claimed',
      executionEvidence: {
        schemaVersion: 1,
        requestId: 'request-alpha',
        attemptNumber: 1,
        kind: 'consequential_effect_claimed',
        ownerKind: 'action',
        ownerId: 'action-alpha',
        evidenceRef: 'effect-claim-alpha',
        observedAt: NOW + 1,
      },
    });
  });

  it('deduplicates the same claim and increments monotonically for a distinct claim', async () => {
    const database = await openTestDb('jarvis-effect-idempotency');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(
      runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      }),
    );
    const first = await repositories.run.claimAttemptEffect(effectClaimFixture());
    expect(await repositories.run.claimAttemptEffect(effectClaimFixture())).toEqual(first);
    const second = await repositories.run.claimAttemptEffect(
      effectClaimFixture({
        ownerId: 'action-beta',
        evidenceRef: 'effect-claim-beta',
        claimedAt: NOW + 2,
      }),
    );
    expect(second.applied).toBe(true);
    if (second.applied && second.kind === 'barrier_claimed') {
      expect(second.run.transportAttempts?.[0]?.effectBarrier.version).toBe(2);
    }
    expect(await database.jarvis_events.count()).toBe(2);
  });

  it.each([
    ['status_conflict', { status: 'completed' as const }, effectClaimFixture()],
    ['attempt_conflict', {}, effectClaimFixture({ requestId: 'stale-request' })],
    [
      'attempt_sealed',
      {
        transportAttempts: [
          {
            ...transportAttemptFixture({
              effectBarrier: { state: 'sealed_for_retry', version: 0, updatedAt: NOW },
            }),
            startedEventSeq: 1,
          },
        ],
      },
      effectClaimFixture(),
    ],
  ] as const)(
    'returns %s without writes for stale or sealed authority',
    async (reason, runOverrides, claim) => {
      const database = await openTestDb(`jarvis-effect-${reason}`);
      const repositories = createJarvisRepositories(database);
      const value = runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
        ...runOverrides,
      });
      await repositories.run.createIdempotent(value);
      const result = await repositories.run.claimAttemptEffect(claim);
      expect(result).toEqual({ applied: false, reason, current: value });
      expect(await database.jarvis_events.count()).toBe(0);
    },
  );

  it('serializes effect claim versus retryable settlement so only one boundary wins', async () => {
    const database = await openTestDb('jarvis-effect-settlement-race');
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(
      runFixture({
        source: 'schedule',
        status: 'running',
        transportAttempts: [{ ...transportAttemptFixture(), startedEventSeq: 1 }],
      }),
    );
    await repositories.event.appendIdempotent(
      'account-alpha',
      'run-alpha',
      nonTransitionEventFixture({ idempotencyKey: 'attempt-start-placeholder' }),
    );
    const [claim, settle] = await Promise.all([
      repositories.run.claimAttemptEffect(effectClaimFixture()),
      repositories.run.compareAndMutateTransportAttempt({
        kind: 'settle_retryable',
        accountId: 'account-alpha',
        runId: 'run-alpha',
        expectedStatus: 'running',
        expectedSnapshot: scheduledRetrySnapshotFixture(),
        expectedAttemptNumber: 1,
        expectedBarrierVersion: 0,
        expectedEventTailSeq: 1,
        providerFailure: providerFailureFixture(),
        zeroEffectEvidence: zeroEffectEvidenceFixture(),
        updatedAt: NOW + 3,
      }),
    ]);
    expect(Number(claim.applied) + Number(settle.applied)).toBe(1);
    expect(await database.jarvis_events.count()).toBe(2);
  });
});
