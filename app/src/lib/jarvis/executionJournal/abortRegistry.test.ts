import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  JarvisAbortRegistration,
  JarvisCancellationOwnerOutcome,
  JarvisEvent,
  JarvisPreparedCancellation,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import {
  JarvisCancellationPlanError,
  createJarvisAbortRegistry,
  createJarvisQueuedCancellationRegistration,
  createTestJarvisCancellationFacade,
  createTestJarvisCancellationRequestAuthority,
  type JarvisQueuedCancellationQueueAuthority,
  type JarvisQueuedCancellationTombstoneV1,
} from './abortRegistry';

const NOW = 1_786_300_000_000;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function run(status: JarvisRun['status'] = 'running'): JarvisRun {
  return {
    id: 'jrun_alpha',
    accountId: 'account-alpha',
    source: 'typed_chat',
    status,
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-alpha',
    model: {
      providerId: 'provider-alpha',
      modelId: 'model-alpha',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: NOW - 100,
    },
    createdAt: NOW - 100,
    updatedAt: NOW - 100,
  };
}

function registration(
  registrationId: string,
  outcome: JarvisCancellationOwnerOutcome | (() => JarvisCancellationOwnerOutcome),
  overrides: Partial<JarvisAbortRegistration> = {},
): JarvisAbortRegistration {
  return {
    accountId: 'account-alpha',
    runId: 'jrun_alpha',
    registrationId,
    kind: 'provider_stream',
    abort: vi.fn(() => (typeof outcome === 'function' ? outcome() : outcome)),
    ...overrides,
  };
}

function createHarness(status: JarvisRun['status'] = 'running') {
  let currentRun: JarvisRun | undefined = run(status);
  let requestNumber = 0;
  const core = createJarvisAbortRegistry({
    getRun: async (accountId: string, runId: string) =>
      currentRun?.accountId === accountId && currentRun.id === runId
        ? structuredClone(currentRun)
        : undefined,
    newCancellationRequestId: () => `jcancel_${++requestNumber}`,
  });
  const appended: Array<Omit<JarvisEvent, 'runId' | 'seq'>> = [];
  const appendEvent = vi.fn(
    async (
      _accountId: string,
      runId: string,
      event: Omit<JarvisEvent, 'runId' | 'seq'>,
    ): Promise<JarvisEvent> => {
      appended.push(structuredClone(event));
      return { ...structuredClone(event), runId, seq: appended.length };
    },
  );
  const facade = createTestJarvisCancellationFacade(core, {
    journal: { appendEvent },
    now: () => NOW,
  });
  return {
    core,
    facade,
    appendEvent,
    appended,
    setStatus(next: JarvisRun['status']) {
      currentRun = run(next);
    },
  };
}

describe('Jarvis abort registry', () => {
  it('keeps raw cancellation authorities out of the public journal and production features', () => {
    const barrel = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    for (const forbidden of [
      'createJarvisAbortRegistry',
      'createJarvisQueuedCancellationRegistration',
      'createTestJarvisCancellationFacade',
      'createTestJarvisCancellationRequestAuthority',
      'JarvisAbortRegistrationAuthority',
      'JarvisCancellationDeliveryAuthority',
    ]) {
      expect(barrel, forbidden).not.toContain(forbidden);
    }

    const contracts = readFileSync(join(__dirname, '..', 'contracts', 'execution.ts'), 'utf8');
    const journalBody = contracts.match(
      /export interface JarvisExecutionJournal\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    expect(journalBody).toBeDefined();
    expect(journalBody).not.toMatch(/abort|cancel/i);

    const sourceRoot = join(__dirname, '..', '..', '..');
    const forbiddenImports =
      /createTestJarvisCancellation(?:Facade|RequestAuthority)|createJarvisAbortRegistry|JarvisCancellationDeliveryAuthority/;
    for (const path of productionSources(sourceRoot)) {
      if (path === join(__dirname, 'abortRegistry.ts') || path.endsWith('kernelRuntime.ts'))
        continue;
      const imports =
        readFileSync(path, 'utf8').match(/import[\s\S]*?from\s+['"][^'"]+['"];?/g) ?? [];
      expect(imports.join('\n'), path).not.toMatch(forbiddenImports);
    }
  });

  it('registers a queued owner synchronously before its item is exposed', async () => {
    const harness = createHarness('queued');
    const order: string[] = [];
    const queued = createJarvisQueuedCancellationRegistration({
      identity: {
        accountId: 'account-alpha',
        runId: 'jrun_alpha',
        queueItemId: 'queue-item-1',
        executionId: 'execution-1',
        ownerId: 'queue-owner',
      },
      queue: {
        withExclusiveItemLock: async (_identity, operation) => operation(),
        replaceExactRunnableWithTombstone: async ({ tombstone }) => {
          order.push('queue-owner-invoked');
          return { applied: true, tombstone };
        },
        restoreExactRunnable: async () => false,
      },
      transition: {
        transitionQueuedRunToCancelled: async () => {
          harness.setStatus('cancelled');
          return { applied: true };
        },
      },
      isAuthorityCurrent: () => true,
    });
    order.push('owner-created');
    harness.core.registrationAuthority.registerIssuedOwner(queued);
    order.push('owner-registered');
    order.push('item-exposed');

    await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');

    expect(order).toEqual([
      'owner-created',
      'owner-registered',
      'item-exposed',
      'queue-owner-invoked',
    ]);
  });

  it('rejects queued_tombstoned truth from an ordinary unbranded owner without clearing the run', async () => {
    const harness = createHarness('queued');
    const forged = registration('ordinary-owner', {
      kind: 'queued_tombstoned',
      ownerId: 'ordinary-owner',
      queueItemId: 'forged-item',
    });
    harness.core.registrationAuthority.registerIssuedOwner(forged);

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'delivery_error',
      cancellationRequestId: 'jcancel_1',
      ownerIds: ['ordinary-owner'],
      safeErrorCategory: 'abort_owner_error',
    });

    const late = registration('late-owner', {
      kind: 'signal_delivered',
      ownerId: 'late-owner',
    });
    harness.core.registrationAuthority.registerIssuedOwner(late);
    await expect(
      harness.core.cancellationDeliveryAuthority.current(
        'account-alpha',
        'jrun_alpha',
        'jcancel_1',
      ),
    ).resolves.toMatchObject({ kind: 'signal_delivered', ownerIds: ['late-owner'] });
    expect(late.abort).toHaveBeenCalledOnce();
  });

  it('fails closed when claimed or drained work lacks explicit handoff proof', async () => {
    const harness = createHarness('queued');
    const provider = registration('provider', {
      kind: 'signal_delivered',
      ownerId: 'provider',
    });
    const transitionQueuedRunToCancelled = vi.fn();
    harness.core.registrationAuthority.registerIssuedOwner(provider);
    harness.core.registrationAuthority.registerIssuedOwner(
      createJarvisQueuedCancellationRegistration({
        identity: {
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          queueItemId: 'queue-item-1',
          executionId: 'execution-1',
          ownerId: 'queue-owner',
        },
        queue: {
          withExclusiveItemLock: async (_identity, operation) => operation(),
          replaceExactRunnableWithTombstone: async () => ({
            applied: false,
            reason: 'claimed_or_drained',
            handoffProven: false,
          }),
          restoreExactRunnable: vi.fn(),
        },
        transition: { transitionQueuedRunToCancelled },
        isAuthorityCurrent: () => true,
      }),
    );

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'delivery_error',
      cancellationRequestId: 'jcancel_1',
      ownerIds: ['queue-owner'],
      safeErrorCategory: 'abort_owner_error',
    });
    expect(provider.abort).not.toHaveBeenCalled();
    expect(transitionQueuedRunToCancelled).not.toHaveBeenCalled();
  });

  it.each([
    { restored: false, expected: 'delivery_error' },
    { restored: true, expected: 'signal_delivered' },
  ] as const)(
    'holds a late owner behind an unresolved queue phase when exact rollback is $restored',
    async ({ restored, expected }) => {
      const harness = createHarness('queued');
      const transition = deferred<{
        applied: false;
        reason: 'status_conflict' | 'authority_revoked';
      }>();
      const transitionQueuedRunToCancelled = vi.fn(() => transition.promise);
      harness.core.registrationAuthority.registerIssuedOwner(
        createJarvisQueuedCancellationRegistration({
          identity: {
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            queueItemId: 'queue-item-1',
            executionId: 'execution-1',
            ownerId: 'queue-owner',
          },
          queue: {
            withExclusiveItemLock: async (_identity, operation) => operation(),
            replaceExactRunnableWithTombstone: async ({ tombstone }) => ({
              applied: true,
              tombstone,
            }),
            restoreExactRunnable: async () => restored,
          },
          transition: {
            transitionQueuedRunToCancelled,
          },
          isAuthorityCurrent: () => true,
        }),
      );
      const cancelling = harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
      await vi.waitFor(() => expect(transitionQueuedRunToCancelled).toHaveBeenCalledOnce());
      const late = registration('late-owner', {
        kind: 'signal_delivered',
        ownerId: 'late-owner',
      });
      harness.core.registrationAuthority.registerIssuedOwner(late);
      await Promise.resolve();
      expect(late.abort).not.toHaveBeenCalled();

      transition.resolve({ applied: false, reason: 'status_conflict' });
      await expect(cancelling).resolves.toMatchObject({ kind: expected });
      expect(late.abort).toHaveBeenCalledTimes(restored ? 1 : 0);
    },
  );

  it('replaces only the same registration ID and uses identity-safe idempotent disposers', async () => {
    const harness = createHarness();
    const first = registration('owner-alpha', { kind: 'signal_delivered', ownerId: 'old' });
    const second = registration('owner-alpha', { kind: 'signal_delivered', ownerId: 'new' });
    const disposeFirst = harness.core.registrationAuthority.registerIssuedOwner(first);
    const disposeSecond = harness.core.registrationAuthority.registerIssuedOwner(second);
    disposeFirst();
    disposeFirst();
    const prepared = await harness.core.cancellationDeliveryAuthority.prepare(
      'account-alpha',
      'jrun_alpha',
    );
    const delivered = await harness.core.cancellationDeliveryAuthority.deliver(
      (prepared as { kind: 'prepared'; plan: JarvisPreparedCancellation }).plan,
    );
    expect(delivered).toMatchObject({ kind: 'signal_delivered', ownerIds: ['new'] });
    expect(first.abort).not.toHaveBeenCalled();
    expect(second.abort).toHaveBeenCalledOnce();
    disposeSecond();
    disposeSecond();
  });

  it('persists the fixed intent event before owner delivery', async () => {
    const harness = createHarness();
    const order: string[] = [];
    harness.appendEvent.mockImplementationOnce(async (_accountId, runId, event) => {
      order.push('intent');
      harness.appended.push(structuredClone(event));
      return { ...structuredClone(event), runId, seq: 1 };
    });
    const owner = registration('owner-alpha', () => {
      order.push('owner');
      return { kind: 'signal_delivered', ownerId: 'provider-alpha' };
    });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'signal_delivered',
      cancellationRequestId: 'jcancel_1',
      ownerIds: ['provider-alpha'],
    });
    expect(order).toEqual(['intent', 'owner']);
    expect(harness.appended).toEqual([
      {
        idempotencyKey: 'jcancel_1',
        type: 'warning',
        status: 'cancellation_requested',
        title: 'Cancellation requested',
        safeSummary: 'Cancellation delivery is pending.',
        sourceRefs: [],
        artifactIds: [],
        createdAt: NOW,
      },
    ]);
  });

  it('reuses a pending request/event and never redelivers the same registration', async () => {
    const harness = createHarness();
    const owner = registration('owner-alpha', {
      kind: 'signal_delivered',
      ownerId: 'provider-alpha',
    });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const first = await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual(first);
    expect(harness.appendEvent).toHaveBeenCalledOnce();
    expect(owner.abort).toHaveBeenCalledOnce();
  });

  it('queues a late owner until the prepared intent is delivered', async () => {
    const harness = createHarness();
    const prepared = await harness.core.cancellationDeliveryAuthority.prepare(
      'account-alpha',
      'jrun_alpha',
    );
    const owner = registration('owner-late', { kind: 'signal_delivered', ownerId: 'late' });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    expect(owner.abort).not.toHaveBeenCalled();
    await harness.core.cancellationDeliveryAuthority.deliver(
      (prepared as { kind: 'prepared'; plan: JarvisPreparedCancellation }).plan,
    );
    expect(owner.abort).toHaveBeenCalledOnce();
  });

  it('immediately delivers to replaced and nested-descendant owners while pending', async () => {
    const harness = createHarness();
    harness.core.registrationAuthority.registerIssuedOwner(
      registration(
        'child-anchor',
        { kind: 'unsupported', ownerId: 'anchor' },
        {
          runId: 'jrun_child',
          parentRunId: 'jrun_alpha',
        },
      ),
    );
    await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    const grandchild = registration(
      'grandchild',
      { kind: 'signal_delivered', ownerId: 'grandchild' },
      {
        runId: 'jrun_grandchild',
        parentRunId: 'jrun_child',
      },
    );
    harness.core.registrationAuthority.registerIssuedOwner(grandchild);
    await vi.waitFor(() => expect(grandchild.abort).toHaveBeenCalledOnce());
    await expect(
      harness.core.cancellationDeliveryAuthority.current(
        'account-alpha',
        'jrun_alpha',
        'jcancel_1',
      ),
    ).resolves.toMatchObject({ kind: 'signal_delivered', ownerIds: ['grandchild'] });
  });

  it('invokes distinct registration IDs even when they share an abort function', async () => {
    const harness = createHarness();
    const sharedAbort = vi.fn(
      (): JarvisCancellationOwnerOutcome => ({
        kind: 'signal_delivered',
        ownerId: 'shared',
      }),
    );
    harness.core.registrationAuthority.registerIssuedOwner({
      ...registration('owner-a', { kind: 'unsupported', ownerId: 'ignored' }),
      abort: sharedAbort,
    });
    harness.core.registrationAuthority.registerIssuedOwner({
      ...registration('owner-b', { kind: 'unsupported', ownerId: 'ignored' }),
      abort: sharedAbort,
    });
    await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    expect(sharedAbort).toHaveBeenCalledTimes(2);
  });

  it('snapshots an owner registration so later caller mutation cannot redirect delivery', async () => {
    const harness = createHarness();
    const owner = registration('owner-a', {
      kind: 'signal_delivered',
      ownerId: 'original-owner',
    });
    const originalAbort = owner.abort as ReturnType<typeof vi.fn>;
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const replacementAbort = vi.fn(
      (): JarvisCancellationOwnerOutcome => ({
        kind: 'signal_delivered',
        ownerId: 'mutated-owner',
      }),
    );
    owner.runId = 'jrun-foreign';
    owner.abort = replacementAbort;

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({
      kind: 'signal_delivered',
      ownerIds: ['original-owner'],
    });
    expect(originalAbort).toHaveBeenCalledOnce();
    expect(replacementAbort).not.toHaveBeenCalled();
  });

  it('rejects cloned, foreign, abandoned, and twice-activated plans', async () => {
    const harness = createHarness();
    const prepared = await harness.core.cancellationDeliveryAuthority.prepare(
      'account-alpha',
      'jrun_alpha',
    );
    const plan = (prepared as { kind: 'prepared'; plan: JarvisPreparedCancellation }).plan;
    expect(Object.isFrozen(plan)).toBe(true);
    await expect(
      harness.core.cancellationDeliveryAuthority.deliver(structuredClone(plan)),
    ).rejects.toBeInstanceOf(JarvisCancellationPlanError);
    await harness.core.cancellationDeliveryAuthority.deliver(plan);
    await expect(harness.core.cancellationDeliveryAuthority.deliver(plan)).rejects.toBeInstanceOf(
      JarvisCancellationPlanError,
    );
    harness.core.clearRun('account-alpha', 'jrun_alpha');
    const next = await harness.core.cancellationDeliveryAuthority.prepare(
      'account-alpha',
      'jrun_alpha',
    );
    const abandoned = (next as { kind: 'prepared'; plan: JarvisPreparedCancellation }).plan;
    harness.core.cancellationDeliveryAuthority.abandonBeforeDelivery(abandoned);
    await expect(
      harness.core.cancellationDeliveryAuthority.deliver(abandoned),
    ).rejects.toBeInstanceOf(JarvisCancellationPlanError);
    await expect(
      createHarness().core.cancellationDeliveryAuthority.deliver(plan),
    ).rejects.toBeInstanceOf(JarvisCancellationPlanError);
  });

  it('abandons before delivery after event failure and uses a fresh request next time', async () => {
    const harness = createHarness();
    const owner = registration('owner-alpha', {
      kind: 'signal_delivered',
      ownerId: 'provider-alpha',
    });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    harness.appendEvent.mockRejectedValueOnce(new Error('write_failed'));
    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).rejects.toThrow('write_failed');
    expect(owner.abort).not.toHaveBeenCalled();
    await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    expect(harness.appended[0]?.idempotencyKey).toBe('jcancel_2');
    expect(owner.abort).toHaveBeenCalledOnce();
  });

  it.each([
    [{ kind: 'handoff_pending', ownerId: 'queue' }, 'handoff_pending'],
    [{ kind: 'unsupported', ownerId: 'provider' }, 'unsupported'],
    [{ kind: 'delivery_rejected', ownerId: 'provider' }, 'delivery_rejected'],
    [{ kind: 'already_exited', ownerId: 'provider' }, 'delivery_rejected'],
  ] as const)('maps %s to truthful %s delivery', async (outcome, expectedKind) => {
    const harness = createHarness();
    harness.core.registrationAuthority.registerIssuedOwner(registration('owner', outcome));
    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({
      kind: expectedKind,
      cancellationRequestId: 'jcancel_1',
    });
  });

  it('reports safe error or missing executor without exposing thrown detail', async () => {
    const throwing = createHarness();
    throwing.core.registrationAuthority.registerIssuedOwner(
      registration('owner-throws', () => {
        throw new Error('private provider detail');
      }),
    );
    await expect(
      throwing.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'delivery_error',
      cancellationRequestId: 'jcancel_1',
      ownerIds: ['owner-throws'],
      safeErrorCategory: 'abort_owner_error',
    });
    const missing = createHarness();
    await expect(
      missing.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'executor_missing',
      cancellationRequestId: 'jcancel_1',
    });
  });

  it('fans cancellation down to a child but never upward to its parent', async () => {
    const harness = createHarness();
    const parent = registration('parent', { kind: 'signal_delivered', ownerId: 'parent' });
    const child = registration(
      'child',
      { kind: 'signal_delivered', ownerId: 'child' },
      {
        runId: 'jrun_child',
        parentRunId: 'jrun_alpha',
      },
    );
    harness.core.registrationAuthority.registerIssuedOwner(parent);
    harness.core.registrationAuthority.registerIssuedOwner(child);
    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({
      kind: 'signal_delivered',
      ownerIds: ['parent', 'child'],
    });
    harness.core.clearRun('account-alpha', 'jrun_alpha');
    await harness.facade.requestRunCancellation('account-alpha', 'jrun_child');
    expect(parent.abort).toHaveBeenCalledOnce();
    expect(child.abort).toHaveBeenCalledTimes(2);
  });

  it.each(['partial', 'completed', 'failed', 'cancelled', 'timed_out'] as const)(
    'treats %s as terminal without intent or delivery',
    async (terminalStatus) => {
      const harness = createHarness(terminalStatus);
      const owner = registration('owner', { kind: 'signal_delivered', ownerId: 'provider' });
      harness.core.registrationAuthority.registerIssuedOwner(owner);
      await expect(
        harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
      ).resolves.toEqual({
        kind: 'already_terminal',
        terminalStatus,
      });
      expect(harness.appendEvent).not.toHaveBeenCalled();
      expect(owner.abort).not.toHaveBeenCalled();
    },
  );

  it('returns terminal truth when completion wins during an already-exited delivery', async () => {
    const harness = createHarness();
    harness.core.registrationAuthority.registerIssuedOwner(
      registration('owner', () => {
        harness.setStatus('completed');
        return { kind: 'already_exited', ownerId: 'provider' };
      }),
    );

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'already_terminal',
      terminalStatus: 'completed',
    });
    expect(harness.appendEvent).toHaveBeenCalledOnce();
  });

  it('rechecks terminal truth between prepare and deliver before invoking any owner', async () => {
    const harness = createHarness();
    const owner = registration('owner', { kind: 'signal_delivered', ownerId: 'provider' });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const prepared = await harness.core.cancellationDeliveryAuthority.prepare(
      'account-alpha',
      'jrun_alpha',
    );
    harness.setStatus('completed');

    await expect(
      harness.core.cancellationDeliveryAuthority.deliver(
        (prepared as { kind: 'prepared'; plan: JarvisPreparedCancellation }).plan,
      ),
    ).resolves.toEqual({ kind: 'already_terminal', terminalStatus: 'completed' });
    expect(owner.abort).not.toHaveBeenCalled();
  });

  it('returns authority_revoked_before_intent with zero commit or delivery', async () => {
    const harness = createHarness();
    const owner = registration('owner', { kind: 'signal_delivered', ownerId: 'provider' });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const commitIntent = vi.fn();
    const authority = createTestJarvisCancellationRequestAuthority(harness.core, {
      isAuthorityCurrent: () => false,
      commitIntent,
    });

    await expect(authority.requestCancellation('account-alpha', 'jrun_alpha')).resolves.toEqual({
      kind: 'authority_revoked_before_intent',
    });
    expect(commitIntent).not.toHaveBeenCalled();
    expect(owner.abort).not.toHaveBeenCalled();
  });

  it('abandons a prepared request when the signal-bound intent commit observes revocation', async () => {
    const harness = createHarness();
    const owner = registration('owner', { kind: 'signal_delivered', ownerId: 'provider' });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const commitIntent = vi.fn(async () => ({
      committed: false as const,
      reason: 'authority_revoked_before_intent' as const,
    }));
    const authority = createTestJarvisCancellationRequestAuthority(harness.core, {
      isAuthorityCurrent: () => true,
      commitIntent,
    });

    await expect(authority.requestCancellation('account-alpha', 'jrun_alpha')).resolves.toEqual({
      kind: 'authority_revoked_before_intent',
    });
    expect(commitIntent).toHaveBeenCalledOnce();
    expect(owner.abort).not.toHaveBeenCalled();
    await expect(
      harness.core.cancellationDeliveryAuthority.current(
        'account-alpha',
        'jrun_alpha',
        'jcancel_1',
      ),
    ).rejects.toThrow('cancellation_request_mismatch');
  });

  it('continues exact owner fanout after committed intent and reports revocation after intent', async () => {
    const harness = createHarness();
    let current = true;
    const first = registration('owner-a', () => {
      current = false;
      return { kind: 'signal_delivered', ownerId: 'provider-a' };
    });
    const second = registration('owner-b', {
      kind: 'signal_delivered',
      ownerId: 'provider-b',
    });
    harness.core.registrationAuthority.registerIssuedOwner(first);
    harness.core.registrationAuthority.registerIssuedOwner(second);
    const authority = createTestJarvisCancellationRequestAuthority(harness.core, {
      isAuthorityCurrent: () => current,
      commitIntent: async () => ({ committed: true }),
    });

    await expect(authority.requestCancellation('account-alpha', 'jrun_alpha')).resolves.toEqual({
      kind: 'intent_committed',
      requestState: 'new',
      authorityState: 'revoked_after_intent',
      cancellationRequestId: 'jcancel_1',
      aggregate: { kind: 'signal_delivered', ownerIds: ['provider-a', 'provider-b'] },
    });
    expect(first.abort).toHaveBeenCalledOnce();
    expect(second.abort).toHaveBeenCalledOnce();
  });

  it('continues delivery when authority revokes immediately after intent commit', async () => {
    const harness = createHarness();
    let current = true;
    const owner = registration('owner', {
      kind: 'signal_delivered',
      ownerId: 'provider',
    });
    harness.core.registrationAuthority.registerIssuedOwner(owner);
    const authority = createTestJarvisCancellationRequestAuthority(harness.core, {
      isAuthorityCurrent: () => current,
      commitIntent: async () => {
        current = false;
        return { committed: true };
      },
    });

    await expect(authority.requestCancellation('account-alpha', 'jrun_alpha')).resolves.toEqual({
      kind: 'intent_committed',
      requestState: 'new',
      authorityState: 'revoked_after_intent',
      cancellationRequestId: 'jcancel_1',
      aggregate: { kind: 'signal_delivered', ownerIds: ['provider'] },
    });
    expect(owner.abort).toHaveBeenCalledOnce();
  });

  it('persists an exact non-runnable queue tombstone before the terminal CAS', async () => {
    const harness = createHarness('queued');
    const order: string[] = [];
    const queue: JarvisQueuedCancellationQueueAuthority = {
      withExclusiveItemLock: async (_identity, operation) => {
        order.push('lock');
        return operation();
      },
      replaceExactRunnableWithTombstone: vi.fn(async ({ tombstone }) => {
        order.push('tombstone');
        expect(tombstone).toEqual({
          schemaVersion: 1,
          kind: 'cancellation_tombstone',
          runnable: false,
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          queueItemId: 'queue-item-1',
          executionId: 'execution-1',
        });
        return { applied: true as const, tombstone: structuredClone(tombstone) };
      }),
      restoreExactRunnable: vi.fn(),
    };
    const transitionQueuedRunToCancelled = vi.fn(async () => {
      order.push('terminal-cas');
      harness.setStatus('cancelled');
      return { applied: true as const };
    });
    const owner = createJarvisQueuedCancellationRegistration({
      identity: {
        accountId: 'account-alpha',
        runId: 'jrun_alpha',
        queueItemId: 'queue-item-1',
        executionId: 'execution-1',
        ownerId: 'queue-owner',
      },
      queue,
      transition: { transitionQueuedRunToCancelled },
      isAuthorityCurrent: () => true,
    });
    harness.core.registrationAuthority.registerIssuedOwner(owner);

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'queued_tombstoned',
      cancellationRequestId: 'jcancel_1',
      ownerId: 'queue-owner',
      queueItemId: 'queue-item-1',
    });
    expect(order).toEqual(['lock', 'tombstone', 'terminal-cas']);
    expect(queue.restoreExactRunnable).not.toHaveBeenCalled();
  });

  it.each(['status_conflict', 'authority_revoked'] as const)(
    'rolls back the exact tombstone after %s before terminal commit',
    async (reason) => {
      const harness = createHarness('queued');
      const tombstone: JarvisQueuedCancellationTombstoneV1 = {
        schemaVersion: 1,
        kind: 'cancellation_tombstone',
        runnable: false,
        accountId: 'account-alpha',
        runId: 'jrun_alpha',
        queueItemId: 'queue-item-1',
        executionId: 'execution-1',
      };
      const queue: JarvisQueuedCancellationQueueAuthority = {
        withExclusiveItemLock: async (_identity, operation) => operation(),
        replaceExactRunnableWithTombstone: async () => ({
          applied: true,
          tombstone,
        }),
        restoreExactRunnable: vi.fn(async () => true),
      };
      const transitionQueuedRunToCancelled = vi.fn(async () => ({
        applied: false as const,
        reason,
      }));
      const currentChecks = reason === 'authority_revoked' ? [true, false] : [true, true];
      const provider = registration('provider', {
        kind: 'signal_delivered',
        ownerId: 'provider',
      });
      harness.core.registrationAuthority.registerIssuedOwner(provider);
      harness.core.registrationAuthority.registerIssuedOwner(
        createJarvisQueuedCancellationRegistration({
          identity: {
            accountId: 'account-alpha',
            runId: 'jrun_alpha',
            queueItemId: 'queue-item-1',
            executionId: 'execution-1',
            ownerId: 'queue-owner',
          },
          queue,
          transition: { transitionQueuedRunToCancelled },
          isAuthorityCurrent: () => currentChecks.shift() ?? false,
        }),
      );

      await expect(
        harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
      ).resolves.toMatchObject({ kind: 'signal_delivered', ownerIds: ['provider'] });
      expect(queue.restoreExactRunnable).toHaveBeenCalledWith(tombstone);
      if (reason === 'authority_revoked') {
        expect(transitionQueuedRunToCancelled).not.toHaveBeenCalled();
      }
    },
  );

  it('treats an authority-check error after tombstoning as revocation and rolls back exactly', async () => {
    const harness = createHarness('queued');
    let authorityChecks = 0;
    const tombstone: JarvisQueuedCancellationTombstoneV1 = {
      schemaVersion: 1,
      kind: 'cancellation_tombstone',
      runnable: false,
      accountId: 'account-alpha',
      runId: 'jrun_alpha',
      queueItemId: 'queue-item-1',
      executionId: 'execution-1',
    };
    const queue: JarvisQueuedCancellationQueueAuthority = {
      withExclusiveItemLock: async (_identity, operation) => operation(),
      replaceExactRunnableWithTombstone: async () => ({ applied: true, tombstone }),
      restoreExactRunnable: vi.fn(async () => true),
    };
    const provider = registration('provider', {
      kind: 'signal_delivered',
      ownerId: 'provider',
    });
    harness.core.registrationAuthority.registerIssuedOwner(provider);
    harness.core.registrationAuthority.registerIssuedOwner(
      createJarvisQueuedCancellationRegistration({
        identity: {
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          queueItemId: 'queue-item-1',
          executionId: 'execution-1',
          ownerId: 'queue-owner',
        },
        queue,
        transition: { transitionQueuedRunToCancelled: vi.fn() },
        isAuthorityCurrent: () => {
          authorityChecks += 1;
          if (authorityChecks === 1) return true;
          throw new Error('revoked');
        },
      }),
    );

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({ kind: 'signal_delivered', ownerIds: ['provider'] });
    expect(queue.restoreExactRunnable).toHaveBeenCalledWith(tombstone);
  });

  it('fails closed on a false tombstone without terminal CAS or later-owner routing', async () => {
    const harness = createHarness('queued');
    const queue: JarvisQueuedCancellationQueueAuthority = {
      withExclusiveItemLock: async (_identity, operation) => operation(),
      replaceExactRunnableWithTombstone: async ({ tombstone }) => ({
        applied: true,
        tombstone: { ...tombstone, executionId: 'foreign-execution' },
      }),
      restoreExactRunnable: vi.fn(async () => false),
    };
    const transitionQueuedRunToCancelled = vi.fn();
    const provider = registration('provider', {
      kind: 'signal_delivered',
      ownerId: 'provider',
    });
    harness.core.registrationAuthority.registerIssuedOwner(provider);
    harness.core.registrationAuthority.registerIssuedOwner(
      createJarvisQueuedCancellationRegistration({
        identity: {
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          queueItemId: 'queue-item-1',
          executionId: 'execution-1',
          ownerId: 'queue-owner',
        },
        queue,
        transition: { transitionQueuedRunToCancelled },
        isAuthorityCurrent: () => true,
      }),
    );

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({ kind: 'delivery_error', ownerIds: ['queue-owner'] });
    expect(transitionQueuedRunToCancelled).not.toHaveBeenCalled();
    expect(provider.abort).not.toHaveBeenCalled();
  });

  it('keeps an unrepairable tombstone fail-closed and blocks later-owner routing', async () => {
    const harness = createHarness('queued');
    const queue: JarvisQueuedCancellationQueueAuthority = {
      withExclusiveItemLock: async (_identity, operation) => operation(),
      replaceExactRunnableWithTombstone: async ({ tombstone }) => ({
        applied: true,
        tombstone,
      }),
      restoreExactRunnable: vi.fn(async () => false),
    };
    const provider = registration('provider', {
      kind: 'signal_delivered',
      ownerId: 'provider',
    });
    harness.core.registrationAuthority.registerIssuedOwner(provider);
    harness.core.registrationAuthority.registerIssuedOwner(
      createJarvisQueuedCancellationRegistration({
        identity: {
          accountId: 'account-alpha',
          runId: 'jrun_alpha',
          queueItemId: 'queue-item-1',
          executionId: 'execution-1',
          ownerId: 'queue-owner',
        },
        queue,
        transition: {
          transitionQueuedRunToCancelled: async () => ({
            applied: false,
            reason: 'status_conflict',
          }),
        },
        isAuthorityCurrent: () => true,
      }),
    );

    await expect(
      harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toMatchObject({ kind: 'delivery_error', ownerIds: ['queue-owner'] });
    expect(provider.abort).not.toHaveBeenCalled();
  });

  it('clearRun prevents late delivery after terminal truth', async () => {
    const harness = createHarness();
    await harness.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    harness.setStatus('cancelled');
    harness.core.clearRun('account-alpha', 'jrun_alpha');
    const late = registration('late', { kind: 'signal_delivered', ownerId: 'late' });
    harness.core.registrationAuthority.registerIssuedOwner(late);
    await Promise.resolve();
    expect(late.abort).not.toHaveBeenCalled();
  });

  it('does not reconstruct or replay process-local delivery after restart', async () => {
    const first = createHarness();
    await first.facade.requestRunCancellation('account-alpha', 'jrun_alpha');
    const restarted = createHarness();
    await expect(
      restarted.facade.requestRunCancellation('account-alpha', 'jrun_alpha'),
    ).resolves.toEqual({
      kind: 'executor_missing',
      cancellationRequestId: 'jcancel_1',
    });
  });
});
