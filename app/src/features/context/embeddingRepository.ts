import type { ContextMapRow, JarvisDexie } from '@/lib/db';
import type { DeepReadonly } from './contracts';
import {
  MAX_CONTEXT_EMBEDDING_ITEMS,
  compareContextEmbeddingIds,
  isContextEmbeddingId,
  parseContextEmbeddingRecordV1,
  type ContextEmbeddingRecordV1,
} from './semanticSearch';

const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;

export type ContextEmbeddingRepositoryErrorCode =
  | 'invalid_account'
  | 'invalid_update'
  | 'account_mismatch'
  | 'parent_not_found'
  | 'record_id_conflict'
  | 'delete_scope_mismatch'
  | 'scope_too_large'
  | 'stored_record_invalid';

export class ContextEmbeddingRepositoryError extends Error {
  constructor(
    readonly code: ContextEmbeddingRepositoryErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextEmbeddingRepositoryError';
  }
}

function assertScopeId(value: string, code: ContextEmbeddingRepositoryErrorCode): void {
  if (typeof value !== 'string' || !SCOPE_ID.test(value)) {
    throw new ContextEmbeddingRepositoryError(code);
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseStored(value: unknown): DeepReadonly<ContextEmbeddingRecordV1> {
  const parsed = parseContextEmbeddingRecordV1(value);
  if (!parsed.ok) {
    throw new ContextEmbeddingRepositoryError('stored_record_invalid', parsed.reason);
  }
  return parsed.value;
}

function parseUpdate(
  accountId: string,
  mapId: string,
  input: unknown,
): { upserts: ContextEmbeddingRecordV1[]; deleteIds: string[] } {
  const record = objectRecord(input);
  if (
    !record ||
    Object.keys(record).length !== 2 ||
    !Object.hasOwn(record, 'upserts') ||
    !Object.hasOwn(record, 'deleteIds') ||
    !Array.isArray(record.upserts) ||
    !Array.isArray(record.deleteIds) ||
    record.upserts.length > MAX_CONTEXT_EMBEDDING_ITEMS ||
    record.deleteIds.length > MAX_CONTEXT_EMBEDDING_ITEMS
  ) {
    throw new ContextEmbeddingRepositoryError('invalid_update', 'update_shape_invalid');
  }
  const upserts = record.upserts.map((value) => {
    const parsed = parseContextEmbeddingRecordV1(value);
    if (!parsed.ok) {
      throw new ContextEmbeddingRepositoryError('invalid_update', parsed.reason);
    }
    if (parsed.value.accountId !== accountId || parsed.value.mapId !== mapId) {
      throw new ContextEmbeddingRepositoryError('account_mismatch');
    }
    return structuredClone(parsed.value) as ContextEmbeddingRecordV1;
  });
  const deleteIds = record.deleteIds.map((value) => {
    if (!isContextEmbeddingId(value)) {
      throw new ContextEmbeddingRepositoryError('invalid_update', 'delete_id_invalid');
    }
    return value;
  });
  if (
    new Set(upserts.map(({ id }) => id)).size !== upserts.length ||
    new Set(deleteIds).size !== deleteIds.length
  ) {
    throw new ContextEmbeddingRepositoryError('invalid_update', 'duplicate_id');
  }
  return { upserts, deleteIds };
}

async function assertOwnedMap(
  database: JarvisDexie,
  accountId: string,
  mapId: string,
): Promise<ContextMapRow> {
  const map = await database.context_maps.get(mapId);
  if (!map || map.accountId !== accountId) {
    throw new ContextEmbeddingRepositoryError('parent_not_found');
  }
  return map;
}

async function assertActiveMap(
  database: JarvisDexie,
  accountId: string,
  mapId: string,
): Promise<void> {
  const map = await assertOwnedMap(database, accountId, mapId);
  if (map.status !== 'active') {
    throw new ContextEmbeddingRepositoryError('parent_not_found');
  }
}

async function listValidated(
  database: JarvisDexie,
  accountId: string,
  mapId: string,
): Promise<readonly DeepReadonly<ContextEmbeddingRecordV1>[]> {
  const scoped = database.context_embeddings.where('[accountId+mapId]').equals([accountId, mapId]);
  if ((await scoped.count()) > MAX_CONTEXT_EMBEDDING_ITEMS) {
    throw new ContextEmbeddingRepositoryError('scope_too_large');
  }
  const stored = await scoped.toArray();
  const rows = stored.map(parseStored);
  if (rows.some((row) => row.accountId !== accountId || row.mapId !== mapId)) {
    throw new ContextEmbeddingRepositoryError('stored_record_invalid', 'scope_invalid');
  }
  rows.sort((left, right) => compareContextEmbeddingIds(left.id, right.id));
  return Object.freeze([...rows]);
}

export function createContextEmbeddingRepository(database: JarvisDexie) {
  return Object.freeze({
    async applyUpdate(
      accountId: string,
      mapId: string,
      input: unknown,
    ): Promise<readonly DeepReadonly<ContextEmbeddingRecordV1>[]> {
      assertScopeId(accountId, 'invalid_account');
      assertScopeId(mapId, 'invalid_update');
      const update = parseUpdate(accountId, mapId, input);
      return database.transaction(
        'rw',
        [database.context_maps, database.context_embeddings],
        async () => {
          await assertActiveMap(database, accountId, mapId);
          const [collisions, deletions] = await Promise.all([
            database.context_embeddings.bulkGet(update.upserts.map(({ id }) => id)),
            database.context_embeddings.bulkGet(update.deleteIds),
          ]);
          for (let index = 0; index < collisions.length; index += 1) {
            const stored = collisions[index];
            if (stored && (stored.accountId !== accountId || stored.mapId !== mapId)) {
              throw new ContextEmbeddingRepositoryError(
                'record_id_conflict',
                update.upserts[index]!.id,
              );
            }
            if (stored) parseStored(stored);
          }
          for (let index = 0; index < deletions.length; index += 1) {
            const stored = deletions[index];
            if (stored && (stored.accountId !== accountId || stored.mapId !== mapId)) {
              throw new ContextEmbeddingRepositoryError(
                'delete_scope_mismatch',
                update.deleteIds[index],
              );
            }
            if (stored) parseStored(stored);
          }
          if (update.deleteIds.length > 0) {
            await database.context_embeddings.bulkDelete(update.deleteIds);
          }
          if (update.upserts.length > 0) {
            await database.context_embeddings.bulkPut(update.upserts);
          }
          return listValidated(database, accountId, mapId);
        },
      );
    },

    async list(
      accountId: string,
      mapId: string,
    ): Promise<readonly DeepReadonly<ContextEmbeddingRecordV1>[]> {
      assertScopeId(accountId, 'invalid_account');
      assertScopeId(mapId, 'invalid_update');
      return database.transaction(
        'r',
        [database.context_maps, database.context_embeddings],
        async () => {
          await assertActiveMap(database, accountId, mapId);
          return listValidated(database, accountId, mapId);
        },
      );
    },

    async purge(accountId: string, mapId: string): Promise<number> {
      assertScopeId(accountId, 'invalid_account');
      assertScopeId(mapId, 'invalid_update');
      return database.transaction(
        'rw',
        [database.context_maps, database.context_embeddings],
        async () => {
          await assertOwnedMap(database, accountId, mapId);
          return database.context_embeddings
            .where('[accountId+mapId]')
            .equals([accountId, mapId])
            .delete();
        },
      );
    },
  });
}
