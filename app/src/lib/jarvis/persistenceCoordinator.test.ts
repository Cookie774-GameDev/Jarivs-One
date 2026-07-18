import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type { AccountIdentity } from '@/lib/accountIdentity';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Agent } from '@/types/agent';

const { activateMock } = vi.hoisted(() => ({
  activateMock: vi.fn(),
}));

vi.mock('@/lib/db/migrations/jarvisV3', () => ({
  activateJarvisV3ForAccount: activateMock,
}));

import {
  createJarvisPersistenceCoordinator,
  type JarvisPersistenceState,
} from './persistenceCoordinator';

const openedDatabases: JarvisDexie[] = [];

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function ready(accountId: string, profileId = `profile-${accountId}`) {
  return {
    state: 'ready' as const,
    migration: {
      accountId,
      profileId,
      identityRevisionId: 'jident_jarvis_v1',
      migrationVersion: 3 as const,
      source: 'clean_default' as const,
      migrated: true,
    },
  };
}

function degraded(accountId: string, category: 'database_open_failed' | 'migration_failed') {
  return {
    state: 'degraded' as const,
    accountId,
    category,
    retry: vi.fn(),
  };
}

function identityHarness(initial: AccountIdentity | null) {
  let identity = initial;
  const listeners = new Set<() => void>();
  let unsubscribeCalls = 0;

  return {
    readIdentity: () => identity,
    subscribeIdentity: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        unsubscribeCalls += 1;
        listeners.delete(listener);
      };
    },
    setIdentity(next: AccountIdentity | null) {
      identity = next;
      for (const listener of [...listeners]) listener();
    },
    setIdentitySilently(next: AccountIdentity | null) {
      identity = next;
    },
    get unsubscribeCalls() {
      return unsubscribeCalls;
    },
  };
}

function fakeDb(): JarvisDexie {
  return {} as JarvisDexie;
}

async function flushActivation(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(async () => {
  activateMock.mockReset();
  while (openedDatabases.length > 0) {
    const db = openedDatabases.pop();
    if (!db) continue;
    db.close();
    await db.delete();
  }
});

describe('createJarvisPersistenceCoordinator', () => {
  it('exposes the exact coordinator surface', () => {
    expectTypeOf(createJarvisPersistenceCoordinator).returns.toEqualTypeOf<{
      start(): () => void;
      retry(): Promise<void>;
      getState(): JarvisPersistenceState;
      subscribe(listener: () => void): () => void;
    }>();
  });

  it('publishes activating before ready on startup', async () => {
    const identity = { accountId: 'account-a', source: 'local' } as const;
    const harness = identityHarness(identity);
    activateMock.mockResolvedValueOnce(ready(identity.accountId));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const states: unknown[] = [];
    coordinator.subscribe(() => states.push(coordinator.getState()));

    const stop = coordinator.start();

    expect(coordinator.getState()).toEqual({ status: 'activating', accountId: 'account-a' });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'account-a',
      profileId: 'profile-account-a',
    });
    expect(states).toEqual([
      { status: 'activating', accountId: 'account-a' },
      { status: 'ready', accountId: 'account-a', profileId: 'profile-account-a' },
    ]);
    expect(activateMock).toHaveBeenCalledWith(expect.anything(), identity);
    stop();
  });

  it('returns the generation-local disposer when a subscriber stops during activating publish', async () => {
    const identity = { accountId: 'activating-stop-account', source: 'local' } as const;
    const firstActivation = deferred<ReturnType<typeof ready>>();
    const lifecycle: { stop: (() => void) | null } = { stop: null };
    activateMock
      .mockReturnValueOnce(firstActivation.promise)
      .mockResolvedValueOnce(ready(identity.accountId, 'profile-after-activating-stop'));
    const harness = identityHarness(identity);
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    coordinator.subscribe(() => {
      if (coordinator.getState().status !== 'activating' || lifecycle.stop) return;
      lifecycle.stop = coordinator.start();
      lifecycle.stop();
    });

    const returnedStop = coordinator.start();

    expect(typeof returnedStop).toBe('function');
    expect(returnedStop).toBe(lifecycle.stop);
    expect(() => returnedStop()).not.toThrow();

    const restartedStop = coordinator.start();
    expect(restartedStop).not.toBe(returnedStop);
    returnedStop();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: identity.accountId,
    });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: identity.accountId,
      profileId: 'profile-after-activating-stop',
    });

    firstActivation.resolve(ready(identity.accountId, 'late-first-profile'));
    await flushActivation();
    expect(coordinator.getState()).toMatchObject({
      status: 'ready',
      profileId: 'profile-after-activating-stop',
    });
    restartedStop();
  });

  it('returns the generation-local disposer when a subscriber stops during degraded publish', async () => {
    const identity = { accountId: 'degraded-stop-account', source: 'local' } as const;
    const lifecycle: { stop: (() => void) | null } = { stop: null };
    let subscribeCalls = 0;
    activateMock.mockResolvedValueOnce(ready(identity.accountId));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: () => identity,
      subscribeIdentity: () => {
        subscribeCalls += 1;
        if (subscribeCalls === 1) throw new Error('sensitive subscription detail');
        return vi.fn();
      },
    });
    coordinator.subscribe(() => {
      if (coordinator.getState().status !== 'degraded' || lifecycle.stop) return;
      lifecycle.stop = coordinator.start();
      lifecycle.stop();
    });

    const returnedStop = coordinator.start();

    expect(typeof returnedStop).toBe('function');
    expect(returnedStop).toBe(lifecycle.stop);
    expect(() => returnedStop()).not.toThrow();

    const restartedStop = coordinator.start();
    expect(restartedStop).not.toBe(returnedStop);
    returnedStop();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: identity.accountId,
    });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: identity.accountId,
      profileId: `profile-${identity.accountId}`,
    });
    expect(subscribeCalls).toBe(2);
    restartedStop();
  });

  it('cleans a subscription returned after reentrant stop and resubscribes on the next start', async () => {
    let identity: AccountIdentity = { accountId: 'reentrant-account-a', source: 'local' };
    const provider: { listener: (() => void) | null } = { listener: null };
    const staleUnsubscribe = vi.fn();
    const liveUnsubscribe = vi.fn();
    let subscribeCalls = 0;
    let coordinator!: ReturnType<typeof createJarvisPersistenceCoordinator>;
    activateMock
      .mockResolvedValueOnce(ready(identity.accountId))
      .mockResolvedValueOnce(ready('reentrant-account-b'));
    coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: () => identity,
      subscribeIdentity: (listener) => {
        subscribeCalls += 1;
        if (subscribeCalls === 1) {
          coordinator.start()();
          return staleUnsubscribe;
        }
        provider.listener = listener;
        return () => {
          liveUnsubscribe();
          provider.listener = null;
        };
      },
    });

    const staleStop = coordinator.start();

    expect(typeof staleStop).toBe('function');
    expect(staleUnsubscribe).toHaveBeenCalledTimes(1);
    expect(activateMock).not.toHaveBeenCalled();
    expect(() => staleStop()).not.toThrow();

    const liveStop = coordinator.start();
    expect(liveStop).not.toBe(staleStop);
    expect(subscribeCalls).toBe(2);
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: 'reentrant-account-a',
    });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'reentrant-account-a',
      profileId: 'profile-reentrant-account-a',
    });

    identity = { accountId: 'reentrant-account-b', source: 'supabase' };
    if (!provider.listener) throw new Error('Expected the fresh identity subscription.');
    provider.listener();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: 'reentrant-account-b',
    });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'reentrant-account-b',
      profileId: 'profile-reentrant-account-b',
    });
    expect(subscribeCalls).toBe(2);
    expect(staleUnsubscribe).toHaveBeenCalledTimes(1);

    liveStop();
    expect(liveUnsubscribe).toHaveBeenCalledTimes(1);
    expect(provider.listener).toBeNull();
  });

  it('quarantines a subscription startup failure and remains retryable and stop-safe', async () => {
    let identity: AccountIdentity = {
      accountId: 'subscription-failure-account',
      source: 'local',
    };
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;
    const subscription: { listener: (() => void) | null } = { listener: null };
    activateMock
      .mockResolvedValueOnce(ready(identity.accountId))
      .mockResolvedValueOnce(ready('recovered-account'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: () => identity,
      subscribeIdentity: (listener) => {
        subscribeCalls += 1;
        if (subscribeCalls === 1) throw new Error('sensitive subscription detail');
        subscription.listener = listener;
        return () => {
          unsubscribeCalls += 1;
          subscription.listener = null;
        };
      },
    });

    let stop!: () => void;
    expect(() => {
      stop = coordinator.start();
    }).not.toThrow();
    const unavailable = coordinator.getState();
    expect(unavailable).toMatchObject({
      status: 'degraded',
      category: 'identity_not_ready',
    });
    expect(unavailable).not.toHaveProperty('accountId');
    expect(activateMock).not.toHaveBeenCalled();
    expect(coordinator.start()).toBe(stop);
    expect(subscribeCalls).toBe(1);
    if (unavailable.status !== 'degraded') throw new Error('Expected degraded state.');

    await unavailable.retry();

    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: identity.accountId,
      profileId: `profile-${identity.accountId}`,
    });
    expect(subscribeCalls).toBe(2);

    identity = { accountId: 'recovered-account', source: 'supabase' };
    if (!subscription.listener) throw new Error('Expected the recovered identity subscription.');
    subscription.listener();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: 'recovered-account',
    });
    expect(coordinator.getState()).not.toHaveProperty('profileId');
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'recovered-account',
      profileId: 'profile-recovered-account',
    });
    expect(subscribeCalls).toBe(2);
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(unsubscribeCalls).toBe(1);
    expect(subscription.listener).toBeNull();
  });

  it('never arms a callback captured by a subscription attempt that throws', async () => {
    let identity: AccountIdentity = {
      accountId: 'failed-subscription-account',
      source: 'local',
    };
    const capturedListeners: Array<() => void> = [];
    let unsubscribeCalls = 0;
    activateMock.mockImplementation(async (_db, current: AccountIdentity) =>
      ready(current.accountId),
    );
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: () => identity,
      subscribeIdentity: (listener) => {
        capturedListeners.push(listener);
        if (capturedListeners.length === 1) {
          throw new Error('failed after capturing listener');
        }
        return () => {
          unsubscribeCalls += 1;
        };
      },
    });

    const stop = coordinator.start();
    const unavailable = coordinator.getState();
    if (unavailable.status !== 'degraded') throw new Error('Expected degraded state.');

    capturedListeners[0]!();
    await flushActivation();

    expect(activateMock).not.toHaveBeenCalled();
    expect(coordinator.getState()).toEqual(unavailable);

    await unavailable.retry();
    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'failed-subscription-account',
      profileId: 'profile-failed-subscription-account',
    });

    identity = { accountId: 'current-subscription-account', source: 'supabase' };
    capturedListeners[0]!();
    await flushActivation();
    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(coordinator.getState()).toMatchObject({
      status: 'ready',
      accountId: 'failed-subscription-account',
    });

    capturedListeners[1]!();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: 'current-subscription-account',
    });
    await flushActivation();
    expect(activateMock).toHaveBeenCalledTimes(2);
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'current-subscription-account',
      profileId: 'profile-current-subscription-account',
    });

    stop();
    expect(unsubscribeCalls).toBe(1);
  });

  it('isolates a throwing subscriber while notifying peers and completing activation', async () => {
    const identity = { accountId: 'listener-isolation-account', source: 'local' } as const;
    const harness = identityHarness(identity);
    activateMock.mockResolvedValueOnce(ready(identity.accountId));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const throwingListener = vi.fn(() => {
      throw new Error('sensitive subscriber detail');
    });
    const observedStates: JarvisPersistenceState[] = [];
    coordinator.subscribe(throwingListener);
    coordinator.subscribe(() => observedStates.push(coordinator.getState()));

    const stop = coordinator.start();
    await flushActivation();

    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: identity.accountId,
      profileId: `profile-${identity.accountId}`,
    });
    expect(throwingListener).toHaveBeenCalledTimes(2);
    expect(observedStates).toEqual([
      { status: 'activating', accountId: identity.accountId },
      {
        status: 'ready',
        accountId: identity.accountId,
        profileId: `profile-${identity.accountId}`,
      },
    ]);
    expect(activateMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it('synchronously clears the old ready profile before awaiting a changed account', async () => {
    const accountA = { accountId: 'account-a', source: 'local' } as const;
    const accountB = { accountId: 'account-b', source: 'supabase' } as const;
    const harness = identityHarness(accountA);
    const accountBActivation = deferred<ReturnType<typeof ready>>();
    activateMock
      .mockResolvedValueOnce(ready(accountA.accountId))
      .mockReturnValueOnce(accountBActivation.promise);
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();
    await flushActivation();
    expect(coordinator.getState()).toMatchObject({ status: 'ready', accountId: 'account-a' });

    harness.setIdentity(accountB);

    expect(coordinator.getState()).toEqual({ status: 'activating', accountId: 'account-b' });
    expect(coordinator.getState()).not.toHaveProperty('profileId');
    accountBActivation.resolve(ready(accountB.accountId));
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'account-b',
      profileId: 'profile-account-b',
    });
    stop();
  });

  it('treats an identity source change as a new authority generation', async () => {
    const harness = identityHarness({ accountId: 'same-account', source: 'local' });
    activateMock
      .mockResolvedValueOnce(ready('same-account', 'local-profile'))
      .mockResolvedValueOnce(ready('same-account', 'cloud-profile'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();
    await flushActivation();

    harness.setIdentity({ accountId: 'same-account', source: 'supabase' });
    expect(coordinator.getState()).toEqual({ status: 'activating', accountId: 'same-account' });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'same-account',
      profileId: 'cloud-profile',
    });
    expect(activateMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each(['database_open_failed', 'migration_failed'] as const)(
    'publishes only %s and exposes a working retry for the current identity',
    async (category) => {
      const identity = { accountId: `account-${category}`, source: 'local' } as const;
      const harness = identityHarness(identity);
      activateMock
        .mockResolvedValueOnce(degraded(identity.accountId, category))
        .mockResolvedValueOnce(ready(identity.accountId));
      const coordinator = createJarvisPersistenceCoordinator({
        db: fakeDb(),
        readIdentity: harness.readIdentity,
        subscribeIdentity: harness.subscribeIdentity,
      });
      const stop = coordinator.start();
      await flushActivation();

      const state = coordinator.getState();
      expect(state).toMatchObject({
        status: 'degraded',
        accountId: identity.accountId,
        category,
      });
      if (state.status !== 'degraded') throw new Error('Expected degraded state.');
      await state.retry();
      expect(coordinator.getState()).toEqual({
        status: 'ready',
        accountId: identity.accountId,
        profileId: `profile-${identity.accountId}`,
      });
      expect(activateMock).toHaveBeenCalledTimes(2);
      stop();
    },
  );

  it('quarantines an unknown runtime activation category as migration_failed', async () => {
    const identity = { accountId: 'bounded-account', source: 'local' } as const;
    const harness = identityHarness(identity);
    activateMock.mockResolvedValueOnce({
      state: 'degraded',
      accountId: identity.accountId,
      category: 'sensitive-provider-detail',
      retry: vi.fn(),
    });
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();

    await flushActivation();

    expect(coordinator.getState()).toMatchObject({
      status: 'degraded',
      accountId: identity.accountId,
      category: 'migration_failed',
    });
    stop();
  });

  it('publishes identity_not_ready without touching the database and retries the newly available identity', async () => {
    const harness = identityHarness(null);
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();

    const unavailable = coordinator.getState();
    expect(unavailable).toMatchObject({ status: 'degraded', category: 'identity_not_ready' });
    expect(activateMock).not.toHaveBeenCalled();
    if (unavailable.status !== 'degraded') throw new Error('Expected degraded state.');
    const retryUnavailable = unavailable.retry;

    activateMock.mockResolvedValueOnce(ready('available-account'));
    harness.setIdentitySilently({ accountId: 'available-account', source: 'local' });
    await retryUnavailable();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'available-account',
      profileId: 'profile-available-account',
    });
    stop();
  });

  it('makes a stale degraded retry closure rerun only the current identity', async () => {
    const harness = identityHarness({ accountId: 'old-account', source: 'local' });
    activateMock
      .mockResolvedValueOnce(degraded('old-account', 'migration_failed'))
      .mockResolvedValueOnce(ready('new-account'))
      .mockResolvedValueOnce(ready('new-account', 'new-account-retried'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();
    await flushActivation();
    const stale = coordinator.getState();
    if (stale.status !== 'degraded') throw new Error('Expected the old degraded state.');

    harness.setIdentity({ accountId: 'new-account', source: 'supabase' });
    await flushActivation();
    await stale.retry();

    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'new-account',
      profileId: 'new-account-retried',
    });
    expect(activateMock.mock.calls.map((call) => call[1])).toEqual([
      { accountId: 'old-account', source: 'local' },
      { accountId: 'new-account', source: 'supabase' },
      { accountId: 'new-account', source: 'supabase' },
    ]);
    stop();
  });

  it('keeps legacy V2 data readable while activation is pending and degraded', async () => {
    const db = createJarvisDb(uniqueTestDbName('jarvis-coordinator-v2'), TEST_INDEXED_DB);
    openedDatabases.push(db);
    await db.open();
    const legacyAgent = {
      id: 'legacy-agent',
      slug: 'legacy',
      name: 'Legacy',
      description: 'V2-visible fixture',
      system_prompt: 'Legacy prompt',
      model: { provider: 'mock', model: 'mock' },
      tools_allowed: [],
      memory_scope: 'workspace',
      capabilities: [],
      created_at: 1,
      updated_at: 1,
    } as unknown as Agent;
    await db.agents.add(legacyAgent);
    const harness = identityHarness({ accountId: 'pending-account', source: 'local' });
    const activation = deferred<ReturnType<typeof degraded>>();
    activateMock.mockReturnValueOnce(activation.promise);
    const coordinator = createJarvisPersistenceCoordinator({
      db,
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();

    expect(await db.agents.get(legacyAgent.id)).toEqual(legacyAgent);
    activation.resolve(degraded('pending-account', 'migration_failed'));
    await flushActivation();
    expect(await db.agents.get(legacyAgent.id)).toEqual(legacyAgent);

    stop();
  });

  it('unsubscribes and prevents a late activation from publishing after stop', async () => {
    const harness = identityHarness({ accountId: 'late-account', source: 'local' });
    const activation = deferred<ReturnType<typeof ready>>();
    activateMock.mockReturnValueOnce(activation.promise);
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const listener = vi.fn();
    coordinator.subscribe(listener);
    const stop = coordinator.start();
    expect(coordinator.getState()).toEqual({ status: 'activating', accountId: 'late-account' });

    stop();
    stop();
    activation.resolve(ready('late-account'));
    await flushActivation();

    expect(coordinator.getState()).toEqual({ status: 'activating', accountId: 'late-account' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribeCalls).toBe(1);
  });

  it('contains a throwing provider unsubscribe and completes stop cleanup', async () => {
    const identity = { accountId: 'throwing-unsubscribe-account', source: 'local' } as const;
    const lateActivation = deferred<ReturnType<typeof ready>>();
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;
    activateMock
      .mockReturnValueOnce(lateActivation.promise)
      .mockResolvedValueOnce(ready(identity.accountId, 'profile-after-restart'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: () => identity,
      subscribeIdentity: () => {
        subscribeCalls += 1;
        return () => {
          unsubscribeCalls += 1;
          throw new Error('sensitive unsubscribe detail');
        };
      },
    });
    const listener = vi.fn();
    coordinator.subscribe(listener);
    const stop = coordinator.start();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: identity.accountId,
    });

    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(unsubscribeCalls).toBe(1);
    lateActivation.resolve(ready(identity.accountId, 'late-profile'));
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: identity.accountId,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    const restartedStop = coordinator.start();
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: identity.accountId,
      profileId: 'profile-after-restart',
    });
    expect(subscribeCalls).toBe(2);
    expect(() => restartedStop()).not.toThrow();
    expect(unsubscribeCalls).toBe(2);
  });

  it('keeps a restarted generation live when its prior disposer is invoked', async () => {
    const harness = identityHarness({ accountId: 'restart-account', source: 'local' });
    activateMock
      .mockResolvedValueOnce(ready('restart-account', 'first-profile'))
      .mockResolvedValueOnce(ready('restart-account', 'second-profile'))
      .mockResolvedValueOnce(ready('next-account', 'next-profile'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });

    const firstStop = coordinator.start();
    await flushActivation();
    firstStop();
    expect(harness.unsubscribeCalls).toBe(1);

    const secondStop = coordinator.start();
    expect(secondStop).not.toBe(firstStop);
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'restart-account',
      profileId: 'second-profile',
    });

    firstStop();
    expect(harness.unsubscribeCalls).toBe(1);
    harness.setIdentity({ accountId: 'next-account', source: 'supabase' });
    expect(coordinator.getState()).toEqual({
      status: 'activating',
      accountId: 'next-account',
    });
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'next-account',
      profileId: 'next-profile',
    });

    secondStop();
    expect(harness.unsubscribeCalls).toBe(2);
  });

  it('ignores a stale result from a prior account generation', async () => {
    const harness = identityHarness({ accountId: 'old-account', source: 'local' });
    const oldActivation = deferred<ReturnType<typeof ready>>();
    activateMock
      .mockReturnValueOnce(oldActivation.promise)
      .mockResolvedValueOnce(ready('new-account'));
    const coordinator = createJarvisPersistenceCoordinator({
      db: fakeDb(),
      readIdentity: harness.readIdentity,
      subscribeIdentity: harness.subscribeIdentity,
    });
    const stop = coordinator.start();

    harness.setIdentity({ accountId: 'new-account', source: 'supabase' });
    await flushActivation();
    expect(coordinator.getState()).toMatchObject({ status: 'ready', accountId: 'new-account' });

    oldActivation.resolve(ready('old-account'));
    await flushActivation();
    expect(coordinator.getState()).toEqual({
      status: 'ready',
      accountId: 'new-account',
      profileId: 'profile-new-account',
    });
    stop();
  });
});
