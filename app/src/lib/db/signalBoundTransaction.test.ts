import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSignalBoundWrite } from './signalBoundTransaction';

type TestRow = {
  id: string;
  value: string;
};

class SignalBoundTestDb extends Dexie {
  items!: EntityTable<TestRow, 'id'>;
  markers!: EntityTable<TestRow, 'id'>;

  constructor(name: string) {
    super(name, { indexedDB, IDBKeyRange });
    this.version(1).stores({
      items: 'id',
      markers: 'id',
    });
  }
}

describe('runSignalBoundWrite', () => {
  let db: SignalBoundTestDb;

  beforeEach(async () => {
    db = new SignalBoundTestDb(`signal-bound-transaction-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('does not enter the scope when the signal is already aborted', async () => {
    const controller = new AbortController();
    const scope = vi.fn();
    controller.abort('already-aborted');

    await expect(runSignalBoundWrite(db, controller.signal, [db.items], scope)).resolves.toEqual({
      kind: 'cancelled',
      reason: 'already-aborted',
    });
    expect(scope).not.toHaveBeenCalled();
  });

  it('does not enter the scope when aborted before Dexie invokes the callback', async () => {
    const controller = new AbortController();
    const scope = vi.fn();

    const pending = runSignalBoundWrite(db, controller.signal, [db.items], scope);
    controller.abort('before-callback');

    await expect(pending).resolves.toEqual({
      kind: 'cancelled',
      reason: 'before-callback',
    });
    expect(scope).not.toHaveBeenCalled();
  });

  it('rolls back when aborted after the callback resolves but before native commit', async () => {
    const controller = new AbortController();

    const result = await runSignalBoundWrite(
      db,
      controller.signal,
      [db.items, db.markers],
      async (transaction) => {
        await transaction.table<TestRow, string>('items').put({ id: 'item-1', value: 'written' });
        await transaction
          .table<TestRow, string>('markers')
          .put({ id: 'marker-1', value: 'written' });

        // The first microtask runs before the wrapper callback resumes. It
        // schedules the abort behind that continuation but ahead of Dexie's
        // native transaction settlement continuation.
        queueMicrotask(() => {
          queueMicrotask(() => controller.abort('commit-gap'));
        });
        return 'scope-result';
      },
    );

    expect(result).toEqual({ kind: 'cancelled', reason: 'commit-gap' });
    await expect(db.items.get('item-1')).resolves.toBeUndefined();
    await expect(db.markers.get('marker-1')).resolves.toBeUndefined();
  });

  it('rolls back and propagates the exact real error', async () => {
    const controller = new AbortController();
    const realError = new Error('real transaction failure');

    let caught: unknown;
    try {
      await runSignalBoundWrite(db, controller.signal, [db.items], async (transaction) => {
        await transaction.table<TestRow, string>('items').put({ id: 'item-1', value: 'written' });
        throw realError;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(realError);
    await expect(db.items.get('item-1')).resolves.toBeUndefined();
  });

  it('does not label a manual Dexie AbortError as signal cancellation', async () => {
    const controller = new AbortController();
    const manualAbort = new Dexie.AbortError('manual transaction abort');

    let caught: unknown;
    try {
      await runSignalBoundWrite(db, controller.signal, [db.items], () => {
        throw manualAbort;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(manualAbort);
    expect(caught).toMatchObject({ name: 'AbortError' });
  });

  it('rejects use inside an active transaction on the same database', async () => {
    const controller = new AbortController();
    const nestedScope = vi.fn();

    await expect(
      db.transaction('rw', [db.items], async () => {
        await runSignalBoundWrite(db, controller.signal, [db.items], nestedScope);
      }),
    ).rejects.toThrow('runSignalBoundWrite must own the top-level transaction for this database');
    expect(nestedScope).not.toHaveBeenCalled();
  });

  it('keeps the commit when the signal aborts after transaction settlement', async () => {
    const controller = new AbortController();

    const result = await runSignalBoundWrite(
      db,
      controller.signal,
      [db.items],
      async (transaction: Transaction) => {
        await transaction.table<TestRow, string>('items').put({ id: 'item-1', value: 'committed' });
        return 'committed-value';
      },
    );

    controller.abort('after-settlement');

    expect(result).toEqual({ kind: 'committed', value: 'committed-value' });
    await expect(db.items.get('item-1')).resolves.toEqual({
      id: 'item-1',
      value: 'committed',
    });
  });
});
