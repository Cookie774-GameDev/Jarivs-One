import Dexie from 'dexie';
import type { Table, Transaction } from 'dexie';

export type SignalBoundTransactionResult<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'cancelled'; reason: unknown }>;

const STOP_CANCELLED_SCOPE = new Error('signal-bound transaction cancelled');

export async function runSignalBoundWrite<T>(
  database: Dexie,
  signal: AbortSignal,
  tables: readonly (string | Table<any, any, any>)[],
  scope: (transaction: Transaction) => T | PromiseLike<T>,
): Promise<SignalBoundTransactionResult<T>> {
  const ambient = Dexie.currentTransaction as Transaction | null;
  if (ambient?.active && ambient.db === database) {
    throw new Error('runSignalBoundWrite must own the top-level transaction for this database');
  }

  if (signal.aborted) {
    return { kind: 'cancelled', reason: signal.reason };
  }

  let transaction: Transaction | undefined;
  let abortPending = false;
  let abortedBySignal = false;

  const abortIfActive = (candidate: Transaction | undefined): boolean => {
    if (!candidate?.active) return false;
    abortedBySignal = true;
    candidate.abort();
    return true;
  };

  const onAbort = (): void => {
    abortPending = true;
    abortIfActive(transaction);
  };

  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();

  const stopIfCancelled = (current: Transaction): void => {
    if (abortedBySignal) throw STOP_CANCELLED_SCOPE;
    if ((abortPending || signal.aborted) && abortIfActive(current)) {
      throw STOP_CANCELLED_SCOPE;
    }
  };

  try {
    const value = await database.transaction('rw!', tables, async (current) => {
      transaction = current;
      stopIfCancelled(current);

      const result = await scope(current);

      stopIfCancelled(current);
      return result;
    });
    return { kind: 'committed', value };
  } catch (error) {
    if (abortedBySignal) {
      return { kind: 'cancelled', reason: signal.reason };
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
