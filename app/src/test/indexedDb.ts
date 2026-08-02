import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

export const TEST_INDEXED_DB = { indexedDB, IDBKeyRange } as const;

export function uniqueTestDbName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
