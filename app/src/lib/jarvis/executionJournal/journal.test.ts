import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createJarvisRepositories, JarvisRepositoryError } from '@/lib/db/jarvisRepositories';
import type { JarvisEvent } from '@/lib/jarvis/contracts/execution';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJarvisExecutionJournal,
  JarvisRunAllocationConflictError,
  JarvisTransitionConflictError,
  type AllocateJarvisRunInput,
} from './journal';
import { JarvisRunTransitionError } from './stateMachine';

const NOW = 1_786_200_000_000;
const openedDatabases: JarvisDexie[] = [];

function allocationFixture(
  overrides: Partial<AllocateJarvisRunInput> = {},
): AllocateJarvisRunInput {
  return {
    accountId: 'account-alpha',
    workspaceId: 'workspace-alpha',
    projectId: 'project-alpha',
    chatId: 'chat-alpha',
    source: 'typed_chat',
    agentId: 'jarvis',
    identityVersion: 3,
    profileRevisionId: 'profile-revision-alpha',
    model: {
      connectionId: 'connection-alpha',
      providerId: 'provider-alpha',
      modelId: 'model-alpha',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      effectiveTemperature: 0.4,
      capturedAt: NOW - 100,
    },
    ...overrides,
  };
}

function eventFixture(
  overrides: Partial<Omit<JarvisEvent, 'runId' | 'seq'>> = {},
): Omit<JarvisEvent, 'runId' | 'seq'> {
  return {
    idempotencyKey: 'event-alpha',
    type: 'message',
    status: 'visible',
    title: 'Canonical event',
    safeSummary: 'A safe event summary.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: NOW + 1,
    ...overrides,
  };
}

async function openJournal(prefix: string, newRunId = vi.fn(() => 'jrun_generated')) {
  const database = createJarvisDb(uniqueTestDbName(prefix), TEST_INDEXED_DB);
  openedDatabases.push(database);
  await database.open();
  const repositories = createJarvisRepositories(database);
  const journal = createJarvisExecutionJournal(repositories, {
    now: () => NOW,
    newRunId,
  });
  return { database, repositories, journal, newRunId };
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

describe('Jarvis execution journal allocation', () => {
  it('allocates a caller-stable jrun_ ID and persists queued truth before returning', async () => {
    const { database, journal, newRunId } = await openJournal('journal-allocate');

    const allocated = await journal.allocateRun(allocationFixture());

    expect(newRunId).toHaveBeenCalledOnce();
    expect(allocated).toEqual({
      ...allocationFixture(),
      id: 'jrun_generated',
      status: 'queued',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(await journal.getRun('account-alpha', allocated.id)).toEqual(allocated);
    expect((await database.jarvis_runs.get(allocated.id))?.status).toBe('queued');
  });

  it('uses a trusted supplied ID without allocating another and rejects malformed run IDs', async () => {
    const { journal, newRunId } = await openJournal('journal-supplied-id');
    const allocated = await journal.allocateRun(allocationFixture({ id: 'jrun_stable-alpha' }));

    expect(allocated.id).toBe('jrun_stable-alpha');
    expect(newRunId).not.toHaveBeenCalled();
    await expect(
      journal.allocateRun(allocationFixture({ id: 'run-not-canonical' })),
    ).rejects.toMatchObject({ code: 'invalid_jarvis_run_id' });
  });

  it('returns an existing run for an identical allocation retry even after its status advances', async () => {
    const { journal } = await openJournal('journal-allocation-retry');
    const input = allocationFixture({ id: 'jrun_retry' });
    const first = await journal.allocateRun(input);
    const compiling = await journal.transitionRun({
      accountId: first.accountId,
      runId: first.id,
      expectedStatus: 'queued',
      nextStatus: 'compiling',
      event: eventFixture({ idempotencyKey: 'transition-compiling' }),
    });

    await expect(journal.allocateRun(input)).resolves.toEqual(compiling);
  });

  it('converges concurrent identical allocations even when their clocks differ', async () => {
    const database = createJarvisDb(
      uniqueTestDbName('journal-concurrent-identical-allocation'),
      TEST_INDEXED_DB,
    );
    openedDatabases.push(database);
    await database.open();
    const repositories = createJarvisRepositories(database);
    let releaseInitialReads!: () => void;
    const initialReadsReleased = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    let initialReadCount = 0;
    const getById = vi.fn(async (accountId: string, runId: string) => {
      const current = await repositories.run.getById(accountId, runId);
      if (initialReadCount < 2) {
        initialReadCount += 1;
        if (initialReadCount === 2) releaseInitialReads();
        await initialReadsReleased;
      }
      return current;
    });
    const now = vi
      .fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW + 1);
    const journal = createJarvisExecutionJournal(
      { ...repositories, run: { ...repositories.run, getById } },
      { now },
    );
    const input = allocationFixture({ id: 'jrun_concurrent-identical' });

    const [first, second] = await Promise.all([
      journal.allocateRun(input),
      journal.allocateRun({ ...input }),
    ]);

    expect(second).toEqual(first);
    expect(first.createdAt).toBe(NOW);
    expect(now).toHaveBeenCalledTimes(2);
    expect(await database.jarvis_runs.count()).toBe(1);
  });

  it.each([
    ['account', { accountId: 'account-beta' }],
    ['workspace', { workspaceId: 'workspace-beta' }],
    ['project', { projectId: 'project-beta' }],
    ['chat', { chatId: 'chat-beta' }],
    ['lineage', { parentRunId: 'jrun_parent' }],
    ['source', { source: 'voice' as const }],
    ['agent', { agentId: 'coder' }],
    ['identity', { identityVersion: 4 }],
    ['profile', { profileRevisionId: 'profile-revision-beta' }],
    [
      'model',
      {
        model: {
          ...allocationFixture().model,
          modelId: 'model-beta',
          capabilities: { tools: false, vision: true },
        },
      },
    ],
  ] as const)(
    'rejects a reused ID with changed immutable %s data as a typed conflict',
    async (_field, changed) => {
      const { journal } = await openJournal(`journal-allocation-conflict-${_field}`);
      await journal.allocateRun(allocationFixture({ id: 'jrun_conflict' }));

      if (_field === 'lineage') {
        await journal.allocateRun(allocationFixture({ id: 'jrun_parent' }));
      }

      await expect(
        journal.allocateRun(allocationFixture({ id: 'jrun_conflict', ...changed })),
      ).rejects.toBeInstanceOf(JarvisRunAllocationConflictError);
    },
  );

  it('keeps direct reads account-scoped', async () => {
    const { journal } = await openJournal('journal-account-read');
    const run = await journal.allocateRun(allocationFixture({ id: 'jrun_account-scoped' }));

    await expect(journal.getRun('account-alpha', run.id)).resolves.toEqual(run);
    await expect(journal.getRun('account-beta', run.id)).resolves.toBeUndefined();
  });
});

describe('Jarvis execution journal events and transitions', () => {
  it('deduplicates exact event retries by run/key and rejects changed payloads', async () => {
    const { journal } = await openJournal('journal-event-idempotency');
    const run = await journal.allocateRun(allocationFixture({ id: 'jrun_events' }));
    const input = eventFixture();

    const first = await journal.appendEvent(run.accountId, run.id, input);
    const retry = await journal.appendEvent(run.accountId, run.id, { ...input });

    expect(retry).toEqual(first);
    expect(first.seq).toBe(1);
    await expect(
      journal.appendEvent(run.accountId, run.id, {
        ...input,
        safeSummary: 'Changed under the same key.',
      }),
    ).rejects.toBeInstanceOf(JarvisRepositoryError);
  });

  it('commits the legal status and forced matching event atomically', async () => {
    const { database, journal } = await openJournal('journal-transition');
    const run = await journal.allocateRun(allocationFixture({ id: 'jrun_transition' }));

    const transitioned = await journal.transitionRun({
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      nextStatus: 'compiling',
      event: eventFixture({ idempotencyKey: 'transition-alpha' }),
    });

    expect(transitioned.status).toBe('compiling');
    expect(await journal.getRun(run.accountId, run.id)).toEqual(transitioned);
    expect(await database.jarvis_events.toArray()).toMatchObject([
      {
        run_id: run.id,
        seq: 1,
        idempotency_key: 'transition-alpha',
        type: 'run_state',
        status: 'compiling',
      },
    ]);
  });

  it('turns a concurrent expected-status miss into a typed conflict with only one write', async () => {
    const { database, journal } = await openJournal('journal-cas-conflict');
    const run = await journal.allocateRun(allocationFixture({ id: 'jrun_cas' }));
    const transition = (key: string) =>
      journal.transitionRun({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'queued',
        nextStatus: 'compiling',
        event: eventFixture({ idempotencyKey: key }),
      });

    const outcomes = await Promise.allSettled([transition('cas-one'), transition('cas-two')]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejection).toMatchObject({
      status: 'rejected',
      reason: expect.any(JarvisTransitionConflictError),
    });
    expect(await database.jarvis_events.count()).toBe(1);
    expect((await journal.getRun(run.accountId, run.id))?.status).toBe('compiling');
  });

  it('rejects a late completion after verified cancellation without another write', async () => {
    const { database, journal } = await openJournal('journal-terminal-race');
    const run = await journal.allocateRun(allocationFixture({ id: 'jrun_cancelled' }));
    await journal.transitionRun({
      accountId: run.accountId,
      runId: run.id,
      expectedStatus: 'queued',
      nextStatus: 'cancelled',
      completedAt: NOW + 1,
      event: eventFixture({ idempotencyKey: 'cancelled' }),
    });

    await expect(
      journal.transitionRun({
        accountId: run.accountId,
        runId: run.id,
        expectedStatus: 'queued',
        nextStatus: 'completed',
        completedAt: NOW + 2,
        event: eventFixture({ idempotencyKey: 'late-completion' }),
      }),
    ).rejects.toBeInstanceOf(JarvisRunTransitionError);
    expect(await database.jarvis_events.count()).toBe(1);
    expect((await journal.getRun(run.accountId, run.id))?.status).toBe('cancelled');
  });
});
