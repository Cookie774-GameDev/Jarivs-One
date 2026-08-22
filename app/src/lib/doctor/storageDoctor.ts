import { db, openDb, resetDbOpenState } from '@/lib/db';
import { isTauri } from '@/lib/utils';
import {
  consumePendingStorageRepair,
  nativeStorageRepairDependencies,
  type PendingStorageRepair,
} from './nativeStorageRepair';

const RETRY_DELAYS_MS = [0, 250, 750] as const;
const BACKING_STORE_DIAGNOSTIC = 'indexeddb_backing_store_open_failed' as const;
const UNRECOGNIZED_DIAGNOSTIC = 'storage_unrecognized_failure' as const;

export type StorageDoctorSnapshot =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'recovering'; readonly attempt: number }
  | { readonly kind: 'healthy' }
  | {
      readonly kind: 'needs_user_repair';
      readonly diagnosticCode: typeof BACKING_STORE_DIAGNOSTIC;
    }
  | {
      readonly kind: 'unexpected_failure';
      readonly diagnosticCode: typeof UNRECOGNIZED_DIAGNOSTIC;
    };

export type StorageDoctorResult =
  | { readonly code: 'healthy'; readonly attempts: 1 }
  | { readonly code: 'recovered_after_repair'; readonly attempts: 1 }
  | { readonly code: 'recovered_after_retry'; readonly attempts: number }
  | {
      readonly code: 'needs_user_repair';
      readonly attempts: number;
      readonly diagnosticCode: typeof BACKING_STORE_DIAGNOSTIC;
    }
  | {
      readonly code: 'unexpected_failure';
      readonly attempts: number;
      readonly diagnosticCode: typeof UNRECOGNIZED_DIAGNOSTIC;
    };

export interface StorageDoctorDependencies {
  readonly prepareRepair?: () => Promise<Pick<PendingStorageRepair, 'apply' | 'complete'> | null>;
  readonly open: () => Promise<void>;
  readonly reset: () => void;
  readonly verify: () => Promise<void>;
  readonly sleep: (delayMs: number) => Promise<void>;
}

export interface StorageDoctor {
  readonly getSnapshot: () => StorageDoctorSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly run: (options?: { readonly force?: boolean }) => Promise<StorageDoctorResult>;
  readonly requireHealthy: () => Promise<void>;
  readonly runStorageOperation: <T>(operation: () => Promise<T>) => Promise<T>;
}

export class StorageDoctorUnavailableError extends Error {
  readonly code = 'vibespace_local_storage_unavailable';

  constructor() {
    super('Local chat storage needs repair. Nothing has been erased.');
    this.name = 'StorageDoctorUnavailableError';
  }
}

export async function prepareStorageRepairForRuntime(
  nativeRuntime: boolean,
  consume: () => Promise<PendingStorageRepair | null> = () =>
    consumePendingStorageRepair(nativeStorageRepairDependencies),
): Promise<PendingStorageRepair | null> {
  if (!nativeRuntime) return null;
  return consume();
}

function isBackingStoreOpenFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const message =
    'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    name === 'UnknownError' &&
    (message.includes('indexeddb.open') || message.includes('backing store'))
  );
}

export function createStorageDoctor(dependencies: StorageDoctorDependencies): StorageDoctor {
  let snapshot: StorageDoctorSnapshot = { kind: 'idle' };
  let flight: Promise<StorageDoctorResult> | undefined;
  let lastResult: StorageDoctorResult | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: StorageDoctorSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const execute = async (): Promise<StorageDoctorResult> => {
    publish({ kind: 'checking' });
    let pendingRepair: Pick<PendingStorageRepair, 'apply' | 'complete'> | null = null;
    if (dependencies.prepareRepair) {
      pendingRepair = await dependencies.prepareRepair();
      if (pendingRepair) {
        dependencies.reset();
        await pendingRepair.apply(deleteIndexedDatabase);
      }
    }
    for (let attemptIndex = 0; attemptIndex <= RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const attempts = attemptIndex + 1;
      if (attemptIndex > 0) {
        dependencies.reset();
        publish({ kind: 'recovering', attempt: attempts });
        await dependencies.sleep(RETRY_DELAYS_MS[attemptIndex - 1]!);
      }
      try {
        await dependencies.open();
        await dependencies.verify();
        if (pendingRepair) await pendingRepair.complete();
        publish({ kind: 'healthy' });
        return pendingRepair
          ? { code: 'recovered_after_repair', attempts: 1 }
          : attemptIndex === 0
            ? { code: 'healthy', attempts: 1 }
            : { code: 'recovered_after_retry', attempts };
      } catch (error) {
        if (!isBackingStoreOpenFailure(error)) {
          publish({
            kind: 'unexpected_failure',
            diagnosticCode: UNRECOGNIZED_DIAGNOSTIC,
          });
          return {
            code: 'unexpected_failure',
            attempts,
            diagnosticCode: UNRECOGNIZED_DIAGNOSTIC,
          };
        }
      }
    }
    publish({ kind: 'needs_user_repair', diagnosticCode: BACKING_STORE_DIAGNOSTIC });
    return {
      code: 'needs_user_repair',
      attempts: RETRY_DELAYS_MS.length + 1,
      diagnosticCode: BACKING_STORE_DIAGNOSTIC,
    };
  };

  const run = (options: { readonly force?: boolean } = {}): Promise<StorageDoctorResult> => {
    if (flight) return flight;
    if (!options.force && lastResult) return Promise.resolve(lastResult);
    const operation = execute();
    const clearFlight = (result: StorageDoctorResult) => {
      lastResult = result;
      if (flight === tracked) flight = undefined;
      return result;
    };
    const tracked = operation.then(clearFlight, (error) => {
      if (flight === tracked) flight = undefined;
      throw error;
    });
    flight = tracked;
    return tracked;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run,
    async requireHealthy() {
      const result = await run();
      if (
        result.code !== 'healthy' &&
        result.code !== 'recovered_after_retry' &&
        result.code !== 'recovered_after_repair'
      ) {
        throw new StorageDoctorUnavailableError();
      }
    },
    async runStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
      const result = await run();
      if (
        result.code !== 'healthy' &&
        result.code !== 'recovered_after_retry' &&
        result.code !== 'recovered_after_repair'
      ) {
        throw new StorageDoctorUnavailableError();
      }
      try {
        return await operation();
      } catch (error) {
        if (!isBackingStoreOpenFailure(error)) throw error;
      }

      const recovery = await run({ force: true });
      if (
        recovery.code !== 'healthy' &&
        recovery.code !== 'recovered_after_retry' &&
        recovery.code !== 'recovered_after_repair'
      ) {
        throw new StorageDoctorUnavailableError();
      }
      try {
        return await operation();
      } catch (error) {
        if (isBackingStoreOpenFailure(error)) throw new StorageDoctorUnavailableError();
        throw error;
      }
    },
  };
}

export const storageDoctor = createStorageDoctor({
  prepareRepair: () => prepareStorageRepairForRuntime(isTauri),
  async open() {
    await openDb();
  },
  reset: resetDbOpenState,
  async verify() {
    await db.settings.limit(1).toArray();
  },
  sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  },
});

function deleteIndexedDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('storage_repair_delete_failed'));
    request.onblocked = () => reject(new Error('storage_repair_delete_blocked'));
  });
}

export function runStorageDoctor(options?: {
  readonly force?: boolean;
}): Promise<StorageDoctorResult> {
  return storageDoctor.run(options);
}

export function requireHealthyLocalChatStorage(): Promise<void> {
  return storageDoctor.requireHealthy();
}

export function runLocalChatStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  return storageDoctor.runStorageOperation(operation);
}

export function isStorageDoctorUnavailableError(
  error: unknown,
): error is StorageDoctorUnavailableError {
  return error instanceof StorageDoctorUnavailableError;
}
