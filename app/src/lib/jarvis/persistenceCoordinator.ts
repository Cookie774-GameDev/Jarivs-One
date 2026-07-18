import type { AccountIdentity } from '@/lib/accountIdentity';
import type { JarvisDexie } from '@/lib/db';
import { activateJarvisV3ForAccount } from '@/lib/db/migrations/jarvisV3';

export type JarvisPersistenceState =
  | { status: 'activating'; accountId: string }
  | { status: 'ready'; accountId: string; profileId: string }
  | {
      status: 'degraded';
      accountId?: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<void>;
    };

type JarvisPersistenceFailureCategory = Extract<
  JarvisPersistenceState,
  { status: 'degraded' }
>['category'];

function boundedFailureCategory(category: unknown): JarvisPersistenceFailureCategory {
  return category === 'database_open_failed' ||
    category === 'migration_failed' ||
    category === 'identity_not_ready'
    ? category
    : 'migration_failed';
}

export function createJarvisPersistenceCoordinator(input: {
  db: JarvisDexie;
  readIdentity: () => AccountIdentity | null;
  subscribeIdentity: (listener: () => void) => () => void;
}): {
  start(): () => void;
  retry(): Promise<void>;
  getState(): JarvisPersistenceState;
  subscribe(listener: () => void): () => void;
} {
  const listeners = new Set<() => void>();
  let state: JarvisPersistenceState = {
    status: 'degraded',
    category: 'identity_not_ready',
    retry,
  };
  let started = false;
  let stopped = false;
  let generation = 0;
  let currentIdentityKey: string | null = null;
  let unsubscribeIdentity: (() => void) | null = null;
  let activeStop: (() => void) | null = null;

  function publish(next: JarvisPersistenceState): void {
    state = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Subscribers are observation-only and cannot block coordinator progress.
      }
    }
  }

  function readCurrentIdentity(): AccountIdentity | null {
    try {
      const identity = input.readIdentity();
      if (
        !identity ||
        typeof identity.accountId !== 'string' ||
        identity.accountId.length === 0 ||
        identity.accountId !== identity.accountId.trim() ||
        (identity.source !== 'local' && identity.source !== 'supabase')
      ) {
        return null;
      }
      return identity;
    } catch {
      return null;
    }
  }

  function identityKey(identity: AccountIdentity): string {
    return `${identity.source}\u0000${identity.accountId}`;
  }

  function stillOwnsAttempt(attemptGeneration: number, key: string): boolean {
    if (!started || stopped || generation !== attemptGeneration || currentIdentityKey !== key) {
      return false;
    }
    const current = readCurrentIdentity();
    return current !== null && identityKey(current) === key;
  }

  function ensureIdentitySubscription(): boolean {
    if (unsubscribeIdentity) return true;
    try {
      const unsubscribe = input.subscribeIdentity(() => {
        void beginAttempt(false);
      });
      if (typeof unsubscribe !== 'function') throw new Error('Invalid identity subscription.');
      unsubscribeIdentity = unsubscribe;
      return true;
    } catch {
      unsubscribeIdentity = null;
      currentIdentityKey = null;
      generation += 1;
      publish({ status: 'degraded', category: 'identity_not_ready', retry });
      return false;
    }
  }

  async function beginAttempt(force: boolean): Promise<void> {
    if (!started || stopped) return;
    const identity = readCurrentIdentity();
    if (!identity) {
      currentIdentityKey = null;
      generation += 1;
      publish({ status: 'degraded', category: 'identity_not_ready', retry });
      return;
    }

    const key = identityKey(identity);
    if (!force && currentIdentityKey === key) return;

    currentIdentityKey = key;
    const attemptGeneration = ++generation;
    publish({ status: 'activating', accountId: identity.accountId });

    try {
      const result = await activateJarvisV3ForAccount(input.db, identity);
      if (!stillOwnsAttempt(attemptGeneration, key)) return;

      if (result.state === 'ready') {
        if (result.migration.accountId !== identity.accountId) {
          publish({
            status: 'degraded',
            accountId: identity.accountId,
            category: 'migration_failed',
            retry,
          });
          return;
        }
        publish({
          status: 'ready',
          accountId: identity.accountId,
          profileId: result.migration.profileId,
        });
        return;
      }

      if (result.accountId !== identity.accountId) {
        publish({
          status: 'degraded',
          accountId: identity.accountId,
          category: 'migration_failed',
          retry,
        });
        return;
      }
      publish({
        status: 'degraded',
        accountId: identity.accountId,
        category: boundedFailureCategory(result.category),
        retry,
      });
    } catch {
      if (!stillOwnsAttempt(attemptGeneration, key)) return;
      publish({
        status: 'degraded',
        accountId: identity.accountId,
        category: 'migration_failed',
        retry,
      });
    }
  }

  async function retry(): Promise<void> {
    if (!started || stopped || !ensureIdentitySubscription()) return;
    await beginAttempt(true);
  }

  function stop(): void {
    if (!started) return;
    started = false;
    stopped = true;
    const stoppedGeneration = ++generation;
    currentIdentityKey = null;
    const unsubscribe = unsubscribeIdentity;
    unsubscribeIdentity = null;
    activeStop = null;
    try {
      unsubscribe?.();
    } catch {
      // Provider cleanup cannot bypass coordinator invalidation.
    } finally {
      if (!started && generation === stoppedGeneration) {
        unsubscribeIdentity = null;
        activeStop = null;
      }
    }
  }

  function start(): () => void {
    if (started && activeStop) return activeStop;
    started = true;
    stopped = false;
    activeStop = stop;
    if (!ensureIdentitySubscription()) return activeStop;
    void beginAttempt(true);
    return activeStop;
  }

  return {
    start,
    retry,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
