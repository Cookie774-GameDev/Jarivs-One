import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type {
  JarvisCanonicalLiveProducerEvidence,
  JarvisCapabilityLiveEvidencePort,
  JarvisCapabilityLiveProducerKind,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisExecutionEvidenceV1,
  JarvisLiveEvidenceKernelOwner,
  JarvisLiveEvidenceReadPort,
  JarvisLiveEvidenceVerifierSlot,
  JarvisLiveProducerKind,
  JarvisLiveProducerIdentity,
  JarvisProducerSourceEvidenceV1,
  JarvisProviderLiveEvidencePort,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import { toJarvisEventRow, toJarvisRunRow } from '@/lib/db/jarvisMappers';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import * as liveEvidenceAuthorityModule from './liveEvidenceAuthority';
import { createJarvisLiveEvidenceKernelComposition } from './liveEvidenceAuthority';

type LiveEvidenceVerifierSlots = Parameters<
  typeof createJarvisLiveEvidenceKernelComposition
>[0]['verifiers'];

const scope = {
  accountId: 'account-1',
  runId: 'run-1',
  requestId: 'request-1',
  attemptNumber: 1,
} as const;

const providerIdentity = {
  producerKind: 'provider' as const,
  providerId: 'provider-1',
  modelId: 'model-1',
  modelSnapshotRef: 'snapshot-1',
};

const openedDatabases: JarvisDexie[] = [];

type TestHarnessFactory = (input: {
  db: JarvisDexie;
  verifiers: Readonly<{
    [K in JarvisLiveProducerKind]: JarvisLiveEvidenceVerifierSlot<K>;
  }>;
  sha256Canonical(value: unknown): Promise<string>;
  now: () => number;
}) => Readonly<{
  provider: JarvisProviderLiveEvidencePort;
  capabilities: Readonly<Record<Exclude<JarvisLiveProducerKind, 'provider'>, unknown>>;
  read: JarvisLiveEvidenceReadPort;
}>;

function testHarnessFactory(): TestHarnessFactory {
  const factory = (
    liveEvidenceAuthorityModule as unknown as {
      createJarvisLiveEvidenceTestHarness?: TestHarnessFactory;
    }
  ).createJarvisLiveEvidenceTestHarness;
  expect(factory).toBeTypeOf('function');
  if (!factory) throw new Error('createJarvisLiveEvidenceTestHarness_missing');
  return factory;
}

async function openLiveEvidenceTestDb(prefix: string): Promise<JarvisDexie> {
  const database = createJarvisDb(uniqueTestDbName(prefix), TEST_INDEXED_DB);
  openedDatabases.push(database);
  await database.open();
  await database.jarvis_runs.put(toJarvisRunRow(run()));
  return database;
}

function sourceEvent(seq: number, additions: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId: scope.runId,
    seq,
    idempotencyKey: `source-${seq}`,
    type: 'model',
    status: 'started',
    title: 'Canonical provider source',
    safeSummary: 'Canonical provider source.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: 10,
    ...additions,
  };
}

function providerSourceEvidence(): JarvisProducerSourceEvidenceV1 {
  return {
    schemaVersion: 1,
    ...scope,
    producerKind: 'provider',
    producerIdentity: providerIdentity,
    resultRef: 'provider-start-1',
    observedAt: 10,
    phase: 'start',
    state: 'started',
  };
}

function harnessVerifiers() {
  return {
    provider: readyVerifier<'provider'>(),
    action: unavailable('action'),
    file_action: unavailable('file_action'),
    terminal: unavailable('terminal'),
    plugin: unavailable('plugin'),
    mcp: unavailable('mcp'),
    schedule: unavailable('schedule'),
    voice: unavailable('voice'),
    hive: unavailable('hive'),
  } as const;
}

function listProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listProductionSources(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (openedDatabases.length > 0) {
    const database = openedDatabases.pop();
    if (!database) continue;
    database.close();
    await database.delete();
  }
});

function providerEvidence(
  overrides: Partial<JarvisCanonicalLiveProducerEvidence<'provider'>> = {},
): JarvisCanonicalLiveProducerEvidence<'provider'> {
  return {
    schemaVersion: 1,
    producerKind: 'provider',
    producerIdentity: providerIdentity,
    ...scope,
    resultRef: 'provider-start-1',
    resultEventSeq: 1,
    state: 'started',
    verifiedAt: 10,
    ...overrides,
  };
}

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-1',
    accountId: 'account-1',
    source: 'typed_chat',
    status: 'running',
    agentId: 'agent-jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-revision-1',
    model: {
      connectionId: 'connection-1',
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      effectiveTemperature: 0.4,
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as JarvisRun;
}

function readyVerifier<K extends JarvisLiveProducerKind>() {
  return {
    state: 'ready' as const,
    verifier: {
      verify: vi.fn(async (value: JarvisCanonicalLiveProducerEvidence<K>) => value),
    },
  } satisfies JarvisLiveEvidenceVerifierSlot<K>;
}

function unavailable<K extends JarvisLiveProducerKind>(producerKind: K) {
  return {
    state: 'unavailable' as const,
    producerKind,
    reason: 'producer_task_not_landed' as const,
  } satisfies JarvisLiveEvidenceVerifierSlot<K>;
}

function verifiers(
  provider: JarvisLiveEvidenceVerifierSlot<'provider'> = readyVerifier<'provider'>(),
) {
  return {
    provider,
    action: unavailable('action'),
    fileAction: unavailable('file_action'),
    terminal: unavailable('terminal'),
    plugin: unavailable('plugin'),
    mcp: unavailable('mcp'),
    voice: unavailable('voice'),
    schedule: unavailable('schedule'),
    hive: unavailable('hive'),
  } as const;
}

function allReadyVerifiers(): LiveEvidenceVerifierSlots {
  return {
    provider: readyVerifier<'provider'>(),
    action: readyVerifier<'action'>(),
    fileAction: readyVerifier<'file_action'>(),
    terminal: readyVerifier<'terminal'>(),
    plugin: readyVerifier<'plugin'>(),
    mcp: readyVerifier<'mcp'>(),
    voice: readyVerifier<'voice'>(),
    schedule: readyVerifier<'schedule'>(),
    hive: readyVerifier<'hive'>(),
  };
}

function capabilityIdentity(kind: JarvisCapabilityLiveProducerKind): JarvisLiveProducerIdentity {
  switch (kind) {
    case 'action':
      return { producerKind: kind, actionId: 'action-1', actionVersion: 1, executionId: 'exec-1' };
    case 'file_action':
      return { producerKind: kind, actionId: 'file-1', actionVersion: 1, resultId: 'result-1' };
    case 'terminal':
      return { producerKind: kind, sessionId: 'session-1', executionId: 'exec-1' };
    case 'plugin':
      return { producerKind: kind, pluginId: 'plugin-1', invocationId: 'invoke-1' };
    case 'mcp':
      return {
        producerKind: kind,
        serverId: 'server-1',
        toolName: 'tool-1',
        invocationId: 'invoke-1',
      };
    case 'schedule':
      return { producerKind: kind, eventId: 'event-1', occurrenceId: 'occurrence-1' };
    case 'voice':
      return {
        producerKind: kind,
        sessionId: 'voice-1',
        engineKind: 'tts',
        executionId: 'exec-1',
      };
    case 'hive':
      return { producerKind: kind, stackId: 'stack-1', stepId: 'step-1', workerId: 'worker-1' };
  }
}

function capabilityEvidence<K extends JarvisCapabilityLiveProducerKind>(
  kind: K,
  overrides: Partial<JarvisCanonicalLiveProducerEvidence<K>> = {},
): JarvisCanonicalLiveProducerEvidence<K> {
  return {
    schemaVersion: 1,
    producerKind: kind,
    producerIdentity: capabilityIdentity(kind) as Extract<
      JarvisLiveProducerIdentity,
      { producerKind: K }
    >,
    ...scope,
    resultRef: `${kind}-start-1`,
    resultEventSeq: 1,
    state: 'busy',
    verifiedAt: 10,
    ...overrides,
  } as JarvisCanonicalLiveProducerEvidence<K>;
}

function capabilityPort<K extends JarvisCapabilityLiveProducerKind>(
  owner: JarvisLiveEvidenceKernelOwner,
  kind: K,
): JarvisCapabilityLiveEvidencePort<K> {
  const ports: {
    [CapabilityKind in JarvisCapabilityLiveProducerKind]: JarvisCapabilityLiveEvidencePort<CapabilityKind>;
  } = {
    action: owner.action,
    file_action: owner.fileAction,
    terminal: owner.terminal,
    plugin: owner.plugin,
    mcp: owner.mcp,
    schedule: owner.schedule,
    voice: owner.voice,
    hive: owner.hive,
  };

  return ports[kind];
}

function terminalReconstructionHistory(): JarvisEvent[] {
  const started: JarvisDurableLiveEvidenceV1 = {
    schemaVersion: 1,
    kind: 'model',
    ...scope,
    registrationId: 'reconstructed-boundary',
    producerKind: 'provider',
    producerIdentity: providerIdentity,
    transition: 'started',
    operations: ['generate'],
    resultRef: 'provider-start-1',
    resultEventSeq: 1,
    observedAt: 10,
    providerId: providerIdentity.providerId,
    modelId: providerIdentity.modelId,
    modelSnapshotRef: providerIdentity.modelSnapshotRef,
  };
  const completed: JarvisDurableLiveEvidenceV1 = {
    ...started,
    transition: 'completed',
    resultRef: 'provider-result-1',
    resultEventSeq: 3,
    observedAt: 30,
    previousProofRef: 'jlive_digest-2',
  };
  return [
    sourceEvent(1),
    sourceEvent(2, { status: 'started', liveEvidence: started }),
    sourceEvent(3, { status: 'completed', createdAt: 30 }),
    sourceEvent(4, { status: 'completed', createdAt: 30, liveEvidence: completed }),
  ];
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function authorityFixture(
  options: {
    provider?: JarvisLiveEvidenceVerifierSlot<'provider'>;
    verifierSlots?: LiveEvidenceVerifierSlots;
    sha256Canonical?: (value: unknown) => Promise<string>;
  } = {},
) {
  const rows = new Map<number, JarvisEvent>();
  let nextSequence = 2;
  const append = vi.fn(async ({ evidence }: { evidence: JarvisDurableLiveEvidenceV1 }) => {
    const row: JarvisEvent = {
      runId: evidence.runId,
      seq: nextSequence,
      idempotencyKey: `live-${nextSequence}`,
      type: evidence.kind === 'model' ? 'model' : 'tool',
      status: evidence.transition,
      title: 'Canonical live evidence',
      safeSummary: 'Canonical live evidence.',
      sourceRefs: [],
      artifactIds: [],
      createdAt: evidence.observedAt,
      liveEvidence: structuredClone(evidence),
    };
    rows.set(nextSequence, row);
    nextSequence += 2;
    return structuredClone(row);
  });
  const events = {
    getBySeq: vi.fn(async (_accountId: string, _runId: string, seq: number) => {
      const row = rows.get(seq);
      return row ? structuredClone(row) : undefined;
    }),
    listByRun: vi.fn(async () => [] as JarvisEvent[]),
  };
  const runs = {
    getById: vi.fn(async () => run()),
    listByAccount: vi.fn(async () => [run()]),
  };
  const composition = createJarvisLiveEvidenceKernelComposition({
    runs,
    events,
    verifiers: options.verifierSlots ?? verifiers(options.provider),
    sha256Canonical:
      options.sha256Canonical ??
      (async (value) => `digest-${(value as { eventSeq: number }).eventSeq}`),
    now: () => 100,
    maxCompletedPerRun: 2,
  });
  const owner = composition.bindLifecycle({ scope, append: { append } });
  return { append, composition, events, owner, rows, runs };
}

describe('Jarvis durable live-evidence authority', () => {
  it('keeps the test harness non-barreled and absent from production imports', () => {
    expect(testHarnessFactory()).toBeTypeOf('function');
    const barrel = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    for (const forbidden of [
      'createJarvisLiveEvidenceTestHarness',
      'createJarvisLiveEvidenceKernelComposition',
      'createJarvisLiveEvidenceRegistry',
      'JarvisLiveEvidenceKernelOwner',
      'JarvisLiveEvidenceOwnerMaintenance',
      'JarvisLiveEvidenceProof',
    ]) {
      expect(barrel).not.toContain(forbidden);
    }
    const appSourceRoot = join(__dirname, '..', '..', '..');
    for (const path of listProductionSources(appSourceRoot)) {
      if (path === join(__dirname, 'liveEvidenceAuthority.ts')) continue;
      expect(readFileSync(path, 'utf8'), path).not.toContain('createJarvisLiveEvidenceTestHarness');
    }
  });

  it('keeps provider and capability operations absent from the opposite fixed port', () => {
    const { owner } = authorityFixture({ verifierSlots: allReadyVerifiers() });
    expect(
      (owner.provider as unknown as { startCapability?: unknown }).startCapability,
    ).toBeUndefined();
    expect((owner.action as unknown as { startProvider?: unknown }).startProvider).toBeUndefined();
    if (false) {
      // @ts-expect-error Provider ports never expose capability registration.
      owner.provider.startCapability;
      // @ts-expect-error Capability ports never expose provider registration.
      owner.action.startProvider;
    }
  });

  it('uses the closed test commit authority for exact source-linked provenance', async () => {
    const database = await openLiveEvidenceTestDb('live-evidence-harness-valid');
    await database.jarvis_events.put(
      toJarvisEventRow(sourceEvent(1, { producerSourceEvidence: providerSourceEvidence() })),
    );
    const harness = testHarnessFactory()({
      db: database,
      verifiers: harnessVerifiers(),
      sha256Canonical: async (value) => `digest-${(value as { eventSeq: number }).eventSeq}`,
      now: () => 100,
    });

    await harness.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });

    expect(await harness.read.snapshot(scope.accountId, scope.runId)).toEqual(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: 'model:provider-registration', state: 'active' })],
      }),
    );
    expect(await database.jarvis_events.get([scope.runId, 2])).toEqual(
      expect.objectContaining({ live_evidence: expect.objectContaining({ resultEventSeq: 1 }) }),
    );
  });

  it.each([
    {
      name: 'ordinary status',
      rows: () => [sourceEvent(1)],
      evidence: () => providerEvidence(),
    },
    {
      name: 'execution evidence only',
      rows: () => [
        sourceEvent(1, {
          executionEvidence: {
            schemaVersion: 1,
            requestId: scope.requestId,
            attemptNumber: scope.attemptNumber,
            kind: 'consequential_effect_claimed',
            ownerKind: 'action',
            ownerId: 'owner-1',
            evidenceRef: 'execution-1',
            observedAt: 10,
          } satisfies JarvisExecutionEvidenceV1,
        }),
      ],
      evidence: () => providerEvidence(),
    },
    {
      name: 'a live-evidence row as its source',
      rows: () => {
        const priorLive: JarvisDurableLiveEvidenceV1 = {
          schemaVersion: 1,
          kind: 'model',
          ...scope,
          registrationId: 'prior-live',
          producerKind: 'provider',
          producerIdentity: providerIdentity,
          transition: 'started',
          operations: ['generate'],
          resultRef: 'provider-start-1',
          resultEventSeq: 1,
          observedAt: 10,
          providerId: providerIdentity.providerId,
          modelId: providerIdentity.modelId,
          modelSnapshotRef: providerIdentity.modelSnapshotRef,
        };
        return [sourceEvent(1), sourceEvent(2, { liveEvidence: priorLive })];
      },
      evidence: () => providerEvidence({ resultEventSeq: 2 }),
    },
  ])('denies $name as producer provenance with zero new live row', async ({ rows, evidence }) => {
    const database = await openLiveEvidenceTestDb('live-evidence-harness-denial');
    for (const row of rows()) await database.jarvis_events.put(toJarvisEventRow(row));
    const before = await database.jarvis_events.count();
    const harness = testHarnessFactory()({
      db: database,
      verifiers: harnessVerifiers(),
      sha256Canonical: async () => 'digest',
      now: () => 100,
    });

    await expect(
      harness.provider.startProvider({
        evidence: evidence(),
        registrationId: 'provider-registration',
        operations: ['generate'],
      }),
    ).rejects.toMatchObject({ code: 'live_evidence_integrity_error' });
    expect(await database.jarvis_events.count()).toBe(before);
    expect(await harness.read.snapshot(scope.accountId, scope.runId)).toBeUndefined();
  });

  it('commits and reads back exact provider evidence twice before publishing it', async () => {
    const provider = readyVerifier<'provider'>();
    const { append, composition, events, owner } = authorityFixture({ provider });
    const registration = await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate', 'stream'],
    });

    expect(provider.verifier.verify).toHaveBeenCalledWith(providerEvidence());
    expect(append).toHaveBeenCalledWith({
      evidence: expect.objectContaining({
        accountId: 'account-1',
        runId: 'run-1',
        requestId: 'request-1',
        attemptNumber: 1,
        registrationId: 'provider-registration',
        transition: 'started',
        resultEventSeq: 1,
      }),
    });
    expect(events.getBySeq).toHaveBeenCalledTimes(2);
    expect(registration.initialProof).toEqual(
      expect.objectContaining({
        proofRef: 'jlive_digest-2',
        eventSeq: 2,
        resultEventSeq: 1,
      }),
    );
    expect(await composition.read.snapshot('account-1', 'run-1')).toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            id: 'model:provider-registration',
            state: 'active',
            evidenceRef: 'jlive_digest-2',
          }),
        ],
      }),
    );
  });

  it('fails a notification-time snapshot closed without deleting the in-progress publication', async () => {
    const { composition, owner } = authorityFixture();
    let notificationSnapshot: ReturnType<typeof composition.read.snapshot> | undefined;
    const unsubscribe = composition.read.subscribe(scope.accountId, scope.runId, () => {
      notificationSnapshot ??= composition.read.snapshot(scope.accountId, scope.runId);
    });

    await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });

    expect(notificationSnapshot).toBeDefined();
    await expect(notificationSnapshot!).resolves.toBeUndefined();
    await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toEqual(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: 'model:provider-registration', state: 'active' })],
      }),
    );
    unsubscribe();
  });

  it('links updates to the current proof, preserves terminal nodes on dispose, and rejects stale handles', async () => {
    const { composition, owner } = authorityFixture();
    const registration = await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });
    const completed = await registration.complete({
      evidence: providerEvidence({
        resultRef: 'provider-result-1',
        resultEventSeq: 3,
        state: 'completed',
        verifiedAt: 30,
      }),
      state: 'completed',
    });
    expect(completed).toEqual(
      expect.objectContaining({ proofRef: 'jlive_digest-4', transition: 'completed' }),
    );
    expect(await composition.read.snapshot('account-1', 'run-1')).toEqual(
      expect.objectContaining({
        nodes: [expect.objectContaining({ state: 'completed', evidenceRef: 'jlive_digest-4' })],
      }),
    );

    registration.dispose();
    expect(await composition.read.snapshot('account-1', 'run-1')).toEqual(
      expect.objectContaining({ nodes: [expect.objectContaining({ state: 'completed' })] }),
    );
    await expect(
      registration.update({ evidence: providerEvidence(), state: 'started' }),
    ).rejects.toThrow('live_evidence_registration_stale');
  });

  it('removes disposed active evidence without deleting durable rows', async () => {
    const { composition, owner, rows } = authorityFixture();
    const registration = await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });
    registration.dispose();

    expect(await composition.read.snapshot('account-1', 'run-1')).toBeUndefined();
    expect(rows.has(2)).toBe(true);
  });

  it('fails closed for an unavailable verifier or a verifier that changes the evidence', async () => {
    const unavailableFixture = authorityFixture({ provider: unavailable('provider') });
    await expect(
      unavailableFixture.owner.provider.startProvider({
        evidence: providerEvidence(),
        registrationId: 'provider-registration',
        operations: ['generate'],
      }),
    ).rejects.toThrow('live_evidence_verifier_unavailable');
    expect(unavailableFixture.append).not.toHaveBeenCalled();

    const changed = readyVerifier<'provider'>();
    vi.mocked(changed.verifier.verify).mockResolvedValueOnce(
      providerEvidence({ resultRef: 'changed-by-verifier' }),
    );
    const changedFixture = authorityFixture({ provider: changed });
    await expect(
      changedFixture.owner.provider.startProvider({
        evidence: providerEvidence(),
        registrationId: 'provider-registration',
        operations: ['generate'],
      }),
    ).rejects.toThrow('live_evidence_verification_mismatch');
    expect(changedFixture.append).not.toHaveBeenCalled();
  });

  it('rejects terminal provider evidence at the start boundary', async () => {
    const { append, owner } = authorityFixture();
    await expect(
      owner.provider.startProvider({
        evidence: providerEvidence({ state: 'completed' }),
        registrationId: 'terminal-start',
        operations: ['generate'],
      }),
    ).rejects.toThrow('live_evidence_scope_mismatch');
    expect(append).not.toHaveBeenCalled();
  });

  it('keeps capability ports kind-fixed and requires the declared initial state', async () => {
    const action = readyVerifier<'action'>();
    const verifierSlots = { ...verifiers(), action };
    const { append, composition, owner } = authorityFixture({ verifierSlots });
    const actionEvidence: JarvisCanonicalLiveProducerEvidence<'action'> = {
      schemaVersion: 1,
      producerKind: 'action',
      producerIdentity: {
        producerKind: 'action',
        actionId: 'action-1',
        actionVersion: 1,
        executionId: 'execution-1',
      },
      ...scope,
      resultRef: 'action-claim-1',
      resultEventSeq: 1,
      state: 'busy',
      verifiedAt: 10,
    };

    await owner.action.startCapability({
      evidence: actionEvidence,
      registrationId: 'action-registration',
      category: 'tool',
      capabilityId: 'action-1',
      operations: ['execute', 'cancel'],
      state: 'busy',
    });
    expect(await composition.read.snapshot('account-1', 'run-1')).toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            kind: 'capability',
            id: 'capability:action-registration',
            state: 'busy',
            category: 'tool',
            capabilityId: 'action-1',
          }),
        ],
      }),
    );

    await expect(
      owner.action.startCapability({
        evidence: actionEvidence,
        registrationId: 'mismatched-state',
        category: 'tool',
        capabilityId: 'action-1',
        operations: ['execute'],
        state: 'ready',
      }),
    ).rejects.toThrow('live_evidence_scope_mismatch');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it.each([
    'action',
    'file_action',
    'terminal',
    'plugin',
    'mcp',
    'schedule',
    'voice',
    'hive',
  ] as const)(
    'publishes the closed %s producer only through its fixed capability port',
    async (kind) => {
      const { composition, owner } = authorityFixture({ verifierSlots: allReadyVerifiers() });
      const registrationId = `${kind}-registration`;

      await capabilityPort(owner, kind).startCapability({
        evidence: capabilityEvidence(kind),
        registrationId,
        category: 'tool',
        capabilityId: `${kind}-capability`,
        operations: ['execute', 'inspect'],
        state: 'busy',
      });

      await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toEqual(
        expect.objectContaining({
          nodes: [
            expect.objectContaining({
              id: `capability:${registrationId}`,
              kind: 'capability',
              state: 'busy',
            }),
          ],
        }),
      );
    },
  );

  it('publishes degraded terminal truth and rejects update and completion state mismatches', async () => {
    const providerFixture = authorityFixture();
    const providerRegistration = await providerFixture.owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'degraded-provider',
      operations: ['generate'],
    });
    await providerRegistration.complete({
      evidence: providerEvidence({
        resultRef: 'provider-degraded-1',
        resultEventSeq: 3,
        state: 'degraded',
        verifiedAt: 30,
      }),
      state: 'degraded',
    });
    await expect(
      providerFixture.composition.read.snapshot(scope.accountId, scope.runId),
    ).resolves.toEqual(
      expect.objectContaining({ nodes: [expect.objectContaining({ state: 'degraded' })] }),
    );

    const capabilityFixture = authorityFixture({ verifierSlots: allReadyVerifiers() });
    const action = await capabilityFixture.owner.action.startCapability({
      evidence: capabilityEvidence('action'),
      registrationId: 'mismatch-action',
      category: 'tool',
      capabilityId: 'action-1',
      operations: ['execute'],
      state: 'busy',
    });
    await expect(
      action.update({
        evidence: capabilityEvidence('action', {
          state: 'ready',
          resultRef: 'action-ready-1',
          resultEventSeq: 3,
          verifiedAt: 20,
        }),
        state: 'busy',
      }),
    ).rejects.toThrow('live_evidence_verification_mismatch');
    await expect(
      action.complete({
        evidence: capabilityEvidence('action', {
          state: 'degraded',
          resultRef: 'action-degraded-1',
          resultEventSeq: 3,
          verifiedAt: 20,
        }),
        state: 'completed',
      }),
    ).rejects.toThrow('live_evidence_verification_mismatch');
    expect(capabilityFixture.append).toHaveBeenCalledTimes(1);
  });

  it('returns detached snapshots through the asynchronous read authority', async () => {
    const { composition, owner } = authorityFixture();
    await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'detached-provider',
      operations: ['generate'],
    });
    const first = await composition.read.snapshot(scope.accountId, scope.runId);
    expect(first).toBeDefined();
    (first!.nodes[0] as { state: string }).state = 'degraded';

    await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toEqual(
      expect.objectContaining({ nodes: [expect.objectContaining({ state: 'active' })] }),
    );
  });

  it('revokes publication when account invalidation races the producer verifier', async () => {
    const provider = readyVerifier<'provider'>();
    const verification = deferred<JarvisCanonicalLiveProducerEvidence<'provider'>>();
    vi.mocked(provider.verifier.verify).mockImplementationOnce(() => verification.promise);
    const { append, composition, owner } = authorityFixture({ provider });
    const pending = owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'account-race',
      operations: ['generate'],
    });
    await vi.waitFor(() => expect(provider.verifier.verify).toHaveBeenCalledOnce());

    composition.ownerMaintenance.invalidateAccount(scope.accountId);
    verification.resolve(providerEvidence());

    await expect(pending).rejects.toThrow('live_evidence_authority_revoked');
    expect(append).not.toHaveBeenCalled();
    await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toBeUndefined();
  });

  it('revokes publication when process invalidation races the first readback', async () => {
    const firstRead = deferred<JarvisEvent | undefined>();
    const { composition, events, owner, rows } = authorityFixture();
    vi.mocked(events.getBySeq).mockImplementationOnce(() => firstRead.promise);
    const pending = owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'process-race',
      operations: ['generate'],
    });
    await vi.waitFor(() => expect(events.getBySeq).toHaveBeenCalledOnce());

    composition.ownerMaintenance.invalidateAll();
    firstRead.resolve(structuredClone(rows.get(2)));

    await expect(pending).rejects.toThrow('live_evidence_authority_revoked');
    await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toBeUndefined();
  });

  it('revokes publication when run invalidation races the second readback', async () => {
    const secondRead = deferred<JarvisEvent | undefined>();
    const { composition, events, owner, rows } = authorityFixture();
    vi.mocked(events.getBySeq)
      .mockImplementationOnce(async (_accountId, _runId, seq) => structuredClone(rows.get(seq)))
      .mockImplementationOnce(() => secondRead.promise);
    const pending = owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'run-race',
      operations: ['generate'],
    });
    await vi.waitFor(() => expect(events.getBySeq).toHaveBeenCalledTimes(2));

    composition.ownerMaintenance.invalidateRun(scope.accountId, scope.runId);
    secondRead.resolve(structuredClone(rows.get(2)));

    await expect(pending).rejects.toThrow('live_evidence_authority_revoked');
    await expect(composition.read.snapshot(scope.accountId, scope.runId)).resolves.toBeUndefined();
  });

  it('cannot publish after run invalidation races the digest boundary', async () => {
    const digest = deferred<string>();
    const { append, composition, owner } = authorityFixture({
      sha256Canonical: vi.fn(() => digest.promise),
    });
    const pending = owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });
    await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1));
    composition.ownerMaintenance.invalidateRun('account-1', 'run-1');
    digest.resolve('late-digest');

    await expect(pending).rejects.toThrow('live_evidence_authority_revoked');
    expect(await composition.read.snapshot('account-1', 'run-1')).toBeUndefined();
  });

  it('does not let a stale snapshot cleanup delete a newer generation of the same registration', async () => {
    const provider = readyVerifier<'provider'>();
    const snapshotVerification = deferred<JarvisCanonicalLiveProducerEvidence<'provider'>>();
    vi.mocked(provider.verifier.verify)
      .mockImplementationOnce(async (value) => value)
      .mockImplementationOnce(() => snapshotVerification.promise)
      .mockImplementation(async (value) => value);
    const { append, composition, owner } = authorityFixture({ provider });
    await owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });
    const staleSnapshot = composition.read.snapshot(scope.accountId, scope.runId);
    await vi.waitFor(() => expect(provider.verifier.verify).toHaveBeenCalledTimes(2));

    composition.ownerMaintenance.invalidateRun(scope.accountId, scope.runId);
    const replacementOwner = composition.bindLifecycle({ scope, append: { append } });
    await replacementOwner.provider.startProvider({
      evidence: providerEvidence({ resultRef: 'replacement-start' }),
      registrationId: 'provider-registration',
      operations: ['generate'],
    });
    snapshotVerification.resolve(providerEvidence());
    await staleSnapshot;

    expect(await composition.read.snapshot(scope.accountId, scope.runId)).toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            id: 'model:provider-registration',
            evidenceRef: 'jlive_digest-4',
          }),
        ],
      }),
    );
  });

  it('invalidates the prior account on switch and revokes every binding on process teardown', async () => {
    const accountFixture = authorityFixture();
    vi.mocked(accountFixture.runs.listByAccount).mockResolvedValueOnce([]);
    await accountFixture.composition.ownerMaintenance.reconstructAccount(scope.accountId);
    const currentAccountOwner = accountFixture.composition.bindLifecycle({
      scope,
      append: { append: accountFixture.append },
    });
    await currentAccountOwner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'account-one-provider',
      operations: ['generate'],
    });
    vi.mocked(accountFixture.runs.listByAccount).mockResolvedValueOnce([]);

    await accountFixture.composition.ownerMaintenance.reconstructAccount('account-2');

    await expect(
      accountFixture.composition.read.snapshot(scope.accountId, scope.runId),
    ).resolves.toBeUndefined();
    await expect(
      currentAccountOwner.provider.startProvider({
        evidence: providerEvidence(),
        registrationId: 'stale-account-binding',
        operations: ['generate'],
      }),
    ).rejects.toThrow('live_evidence_authority_revoked');

    const processFixture = authorityFixture();
    await processFixture.owner.provider.startProvider({
      evidence: providerEvidence(),
      registrationId: 'process-provider',
      operations: ['generate'],
    });
    processFixture.composition.ownerMaintenance.invalidateAll();

    await expect(
      processFixture.composition.read.snapshot(scope.accountId, scope.runId),
    ).resolves.toBeUndefined();
    await expect(
      processFixture.owner.provider.startProvider({
        evidence: providerEvidence(),
        registrationId: 'stale-process-binding',
        operations: ['generate'],
      }),
    ).rejects.toThrow('live_evidence_authority_revoked');
  });

  it('stops reconstruction when invalidation occurs during apply notification', async () => {
    const listRuns = deferred<JarvisRun[]>();
    const terminal = (registrationId: string, resultEventSeq: number, observedAt: number) =>
      ({
        schemaVersion: 1,
        kind: 'model',
        ...scope,
        registrationId,
        producerKind: 'provider',
        producerIdentity: providerIdentity,
        transition: 'completed',
        operations: ['generate'],
        resultRef: `result-${registrationId}`,
        resultEventSeq,
        observedAt,
        providerId: providerIdentity.providerId,
        modelId: providerIdentity.modelId,
        modelSnapshotRef: providerIdentity.modelSnapshotRef,
      }) as JarvisDurableLiveEvidenceV1;
    const first = terminal('first-terminal', 1, 20);
    const second = terminal('second-terminal', 3, 40);
    const history = [
      sourceEvent(1),
      sourceEvent(2, { status: 'completed', createdAt: 20, liveEvidence: first }),
      sourceEvent(3, { createdAt: 30 }),
      sourceEvent(4, { status: 'completed', createdAt: 40, liveEvidence: second }),
    ];
    const events = {
      getBySeq: vi.fn(async (_accountId: string, _runId: string, seq: number) =>
        structuredClone(history.find((row) => row.seq === seq)),
      ),
      listByRun: vi.fn(
        async (
          _accountId: string,
          _runId: string,
          options?: { afterSeq?: number; limit?: number },
        ) =>
          structuredClone(
            history
              .filter((row) => row.seq > (options?.afterSeq ?? 0))
              .slice(0, options?.limit ?? 500),
          ),
      ),
    };
    const composition = createJarvisLiveEvidenceKernelComposition({
      runs: {
        getById: vi.fn(async () => run()),
        listByAccount: vi.fn(() => listRuns.promise),
      },
      events,
      verifiers: verifiers(),
      sha256Canonical: async (value) => `digest-${(value as { eventSeq: number }).eventSeq}`,
      now: () => 100,
    });
    const reconstructing = composition.ownerMaintenance.reconstructAccount(scope.accountId, {
      pageSize: 4,
      maxEventRowsPerRun: 10,
    });
    await vi.waitFor(() => expect(composition.ownerMaintenance).toBeDefined());
    let firstNotification = true;
    let staleNotificationCount = 0;
    composition.read.subscribe(scope.accountId, scope.runId, () => {
      if (!firstNotification) return;
      firstNotification = false;
      composition.ownerMaintenance.invalidateRun(scope.accountId, scope.runId);
      composition.read.subscribe(scope.accountId, scope.runId, () => {
        staleNotificationCount += 1;
      });
    });
    listRuns.resolve([run()]);

    await reconstructing;

    expect(staleNotificationCount).toBe(0);
    expect(await composition.read.snapshot(scope.accountId, scope.runId)).toBeUndefined();
  });

  it.each([
    {
      name: 'sequence gap',
      history: terminalReconstructionHistory().filter((row) => row.seq !== 3),
      pageSize: 3,
      rowBudget: 10,
    },
    {
      name: 'row budget exhaustion',
      history: terminalReconstructionHistory(),
      pageSize: 2,
      rowBudget: 3,
    },
  ])(
    'fails the entire run closed on reconstruction $name',
    async ({ history, pageSize, rowBudget }) => {
      const provider = readyVerifier<'provider'>();
      const events = {
        getBySeq: vi.fn(async (_accountId: string, _runId: string, seq: number) =>
          structuredClone(history.find((row) => row.seq === seq)),
        ),
        listByRun: vi.fn(
          async (
            _accountId: string,
            _runId: string,
            options?: { afterSeq?: number; limit?: number },
          ) =>
            structuredClone(
              history
                .filter((row) => row.seq > (options?.afterSeq ?? 0))
                .slice(0, options?.limit ?? 500),
            ),
        ),
      };
      const composition = createJarvisLiveEvidenceKernelComposition({
        runs: {
          getById: vi.fn(async () => run()),
          listByAccount: vi.fn(async () => [run()]),
        },
        events,
        verifiers: verifiers(provider),
        sha256Canonical: async (value) => `digest-${(value as { eventSeq: number }).eventSeq}`,
        now: () => 100,
      });

      await composition.ownerMaintenance.reconstructAccount(scope.accountId, {
        pageSize,
        maxEventRowsPerRun: rowBudget,
      });

      await expect(
        composition.read.snapshot(scope.accountId, scope.runId),
      ).resolves.toBeUndefined();
      expect(provider.verifier.verify).not.toHaveBeenCalled();
      expect(events.getBySeq).not.toHaveBeenCalled();
    },
  );

  it('reconstructs only complete terminal chains and omits orphaned active evidence', async () => {
    const provider = readyVerifier<'provider'>();
    const started = providerEvidence();
    const startedDurable: JarvisDurableLiveEvidenceV1 = {
      schemaVersion: 1,
      kind: 'model',
      ...scope,
      registrationId: 'reconstructed',
      producerKind: 'provider',
      producerIdentity: providerIdentity,
      transition: 'started',
      operations: ['generate'],
      resultRef: started.resultRef,
      resultEventSeq: started.resultEventSeq,
      observedAt: started.verifiedAt,
      providerId: 'provider-1',
      modelId: 'model-1',
      modelSnapshotRef: 'snapshot-1',
    };
    const completed = providerEvidence({
      resultRef: 'provider-result-1',
      resultEventSeq: 3,
      state: 'completed',
      verifiedAt: 30,
    });
    const completedDurable: JarvisDurableLiveEvidenceV1 = {
      ...startedDurable,
      transition: 'completed',
      resultRef: completed.resultRef,
      resultEventSeq: completed.resultEventSeq,
      observedAt: completed.verifiedAt,
      previousProofRef: 'jlive_digest-2',
    };
    const orphan = { ...startedDurable, registrationId: 'orphan', resultEventSeq: 5 };
    const rows = new Map<number, JarvisEvent>([
      [
        2,
        {
          runId: 'run-1',
          seq: 2,
          idempotencyKey: 'live-2',
          type: 'model',
          status: 'started',
          title: 'Canonical live evidence',
          sourceRefs: [],
          artifactIds: [],
          createdAt: 10,
          liveEvidence: startedDurable,
        },
      ],
      [
        4,
        {
          runId: 'run-1',
          seq: 4,
          idempotencyKey: 'live-4',
          type: 'model',
          status: 'completed',
          title: 'Canonical live evidence',
          sourceRefs: [],
          artifactIds: [],
          createdAt: 30,
          liveEvidence: completedDurable,
        },
      ],
      [
        6,
        {
          runId: 'run-1',
          seq: 6,
          idempotencyKey: 'live-6',
          type: 'model',
          status: 'started',
          title: 'Canonical live evidence',
          sourceRefs: [],
          artifactIds: [],
          createdAt: 40,
          liveEvidence: orphan,
        },
      ],
    ]);
    const history = [
      {
        runId: 'run-1',
        seq: 1,
        idempotencyKey: 'source-1',
        type: 'model',
        title: 'Source',
        sourceRefs: [],
        artifactIds: [],
        createdAt: 9,
      },
      rows.get(2)!,
      {
        runId: 'run-1',
        seq: 3,
        idempotencyKey: 'source-3',
        type: 'model',
        title: 'Result',
        sourceRefs: [],
        artifactIds: [],
        createdAt: 29,
      },
      rows.get(4)!,
      {
        runId: 'run-1',
        seq: 5,
        idempotencyKey: 'source-5',
        type: 'model',
        title: 'Source',
        sourceRefs: [],
        artifactIds: [],
        createdAt: 39,
      },
      rows.get(6)!,
    ] as JarvisEvent[];
    const events = {
      getBySeq: vi.fn(async (_accountId: string, _runId: string, seq: number) =>
        structuredClone(history.find((row) => row.seq === seq)),
      ),
      listByRun: vi.fn(
        async (
          _accountId: string,
          _runId: string,
          options?: { afterSeq?: number; limit?: number },
        ) =>
          structuredClone(
            history
              .filter((row) => row.seq > (options?.afterSeq ?? 0))
              .slice(0, options?.limit ?? 500),
          ),
      ),
    };
    const composition = createJarvisLiveEvidenceKernelComposition({
      runs: {
        getById: vi.fn(async () => run()),
        listByAccount: vi.fn(async () => [run()]),
      },
      events,
      verifiers: verifiers(provider),
      sha256Canonical: async (value) => `digest-${(value as { eventSeq: number }).eventSeq}`,
      now: () => 100,
    });

    await composition.ownerMaintenance.reconstructAccount('account-1', {
      runLimit: 500,
      pageSize: 2,
      maxEventRowsPerRun: 10,
    });

    expect(await composition.read.snapshot('account-1', 'run-1')).toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            id: 'model:reconstructed',
            state: 'completed',
            evidenceRef: 'jlive_digest-4',
          }),
        ],
      }),
    );
    expect(events.listByRun).toHaveBeenCalledTimes(4);
  });
});
