import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, db, openDb } from './index';

describe('database open recovery', () => {
  beforeEach(async () => {
    await closeDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDb();
  });

  it('does not retain a rejected opening promise for the next same-session attempt', async () => {
    const backingStoreFailure = new DOMException(
      'Internal error opening backing store for indexedDB.open',
      'UnknownError',
    );
    const open = vi
      .spyOn(db, 'open')
      .mockRejectedValueOnce(backingStoreFailure)
      .mockResolvedValueOnce(db);

    await expect(openDb()).rejects.toBe(backingStoreFailure);
    await expect(openDb()).resolves.toBe(db);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
