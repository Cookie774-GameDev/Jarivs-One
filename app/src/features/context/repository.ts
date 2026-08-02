import type { JarvisDexie } from '@/lib/db';
import type { ContextQuarantineRow } from '@/lib/db/schema';
import {
  parseContextGraphSnapshotV2,
  type ContextGraphSnapshotV2,
  type ContextMapRecordV2,
  type DeepReadonly,
} from './contracts';

export type ContextGraphRepositoryErrorCode =
  | 'invalid_account'
  | 'account_mismatch'
  | 'invalid_snapshot'
  | 'record_id_conflict'
  | 'revision_conflict'
  | 'snapshot_corrupt';

export class ContextGraphRepositoryError extends Error {
  constructor(
    readonly code: ContextGraphRepositoryErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextGraphRepositoryError';
  }
}

export type ContextSnapshotWriteResult = Readonly<{
  mapId: string;
  knowledgeRevision: number;
  sourceCount: number;
  entityCount: number;
  edgeCount: number;
  provenanceCount: number;
}>;

export type ContextSnapshotRecoveryResult =
  | Readonly<{ state: 'missing' }>
  | Readonly<{
      state: 'ready';
      snapshot: DeepReadonly<ContextGraphSnapshotV2>;
    }>
  | Readonly<{
      state: 'quarantined';
      quarantineId: string;
      reason: string;
      recoveryOptions: ContextQuarantineRow['recoveryOptions'];
    }>;

const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const RECOVERY_OPTIONS = Object.freeze(['retry', 'restore_backup', 'export_then_discard'] as const);

function assertAccountId(accountId: string): void {
  if (!ACCOUNT_ID.test(accountId)) {
    throw new ContextGraphRepositoryError('invalid_account');
  }
}

function isPortableRelativePath(path: string): boolean {
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)
  ) {
    return false;
  }
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function hasPortableSnapshotPaths(snapshot: DeepReadonly<ContextGraphSnapshotV2>): boolean {
  const paths = [
    ...snapshot.map.recommendedEntryPoints.map(({ path }) => path),
    ...snapshot.entities.map(({ path }) => path),
    ...snapshot.provenance.map(({ path }) => path),
  ];
  return paths.every((path) => path === undefined || isPortableRelativePath(path));
}

function parsePortableSnapshot(
  input: unknown,
):
  | Readonly<{ ok: true; value: DeepReadonly<ContextGraphSnapshotV2> }>
  | Readonly<{ ok: false; reason: string }> {
  const parsed = parseContextGraphSnapshotV2(input);
  if (!parsed.ok) return parsed;
  if (!hasPortableSnapshotPaths(parsed.value)) {
    return Object.freeze({ ok: false as const, reason: 'snapshot_path_not_relative' });
  }
  return parsed;
}

function mutableSnapshot(value: DeepReadonly<ContextGraphSnapshotV2>): ContextGraphSnapshotV2 {
  return structuredClone(value) as ContextGraphSnapshotV2;
}

function snapshotJson(snapshot: ContextGraphSnapshotV2): string {
  const byId = <T extends { id: string }>(left: T, right: T) =>
    left.id.localeCompare(right.id, 'en-US');
  return JSON.stringify({
    ...snapshot,
    sources: [...snapshot.sources].sort(byId),
    entities: [...snapshot.entities].sort(byId),
    edges: [...snapshot.edges].sort(byId),
    provenance: [...snapshot.provenance].sort(byId),
  });
}

function hashToken(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function quarantineId(accountId: string, mapId: string, reason: string): string {
  return `ctxq_${hashToken(`${accountId}\0${mapId}\0${reason}`)}`;
}

function idsToDelete<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): string[] {
  const retained = new Set(incoming.map((record) => record.id));
  return existing.filter((record) => !retained.has(record.id)).map((record) => record.id);
}

async function assertChildIdOwnership<T extends { id: string; accountId: string; mapId: string }>(
  records: readonly T[],
  existing: readonly (T | undefined)[],
  accountId: string,
  mapId: string,
): Promise<void> {
  for (let index = 0; index < records.length; index += 1) {
    const stored = existing[index];
    if (stored && (stored.accountId !== accountId || stored.mapId !== mapId)) {
      throw new ContextGraphRepositoryError('record_id_conflict', records[index]!.id);
    }
  }
}

async function loadRawSnapshot(
  database: JarvisDexie,
  accountId: string,
  mapId: string,
): Promise<ContextGraphSnapshotV2 | null> {
  const map = await database.context_maps.get(mapId);
  if (!map || map.accountId !== accountId) return null;
  const [sources, entities, edges, provenance] = await Promise.all([
    database.context_sources.where('[accountId+mapId]').equals([accountId, mapId]).toArray(),
    database.context_entities.where('[accountId+mapId]').equals([accountId, mapId]).toArray(),
    database.context_edges.where('[accountId+mapId]').equals([accountId, mapId]).toArray(),
    database.context_provenance.where('[accountId+mapId]').equals([accountId, mapId]).toArray(),
  ]);
  return {
    version: 2,
    map,
    sources,
    entities,
    edges,
    provenance,
  };
}

async function quarantineSnapshot(
  database: JarvisDexie,
  accountId: string,
  mapId: string,
  reason: string,
  raw: unknown,
): Promise<Extract<ContextSnapshotRecoveryResult, { state: 'quarantined' }>> {
  const id = quarantineId(accountId, mapId, reason);
  const recoveryOptions = [...RECOVERY_OPTIONS];
  await database.context_quarantine.put({
    version: 1,
    id,
    accountId,
    mapId,
    recordKind: 'map',
    reason,
    raw,
    recoveryOptions,
    quarantinedAt: Date.now(),
  });
  return Object.freeze({
    state: 'quarantined' as const,
    quarantineId: id,
    reason,
    recoveryOptions,
  });
}

export function createContextGraphRepository(database: JarvisDexie) {
  return Object.freeze({
    async putSnapshot(
      accountId: string,
      input: unknown,
      options: Readonly<{ expectedKnowledgeRevision?: number }> = {},
    ): Promise<ContextSnapshotWriteResult> {
      assertAccountId(accountId);
      const parsed = parsePortableSnapshot(input);
      if (!parsed.ok) {
        throw new ContextGraphRepositoryError('invalid_snapshot', parsed.reason);
      }
      const snapshot = mutableSnapshot(parsed.value);
      if (snapshot.map.accountId !== accountId) {
        throw new ContextGraphRepositoryError('account_mismatch');
      }

      return database.transaction(
        'rw',
        [
          database.context_maps,
          database.context_sources,
          database.context_entities,
          database.context_edges,
          database.context_provenance,
        ],
        async () => {
          const current = await loadRawSnapshot(database, accountId, snapshot.map.id);
          const collidingMap = await database.context_maps.get(snapshot.map.id);
          if (
            collidingMap &&
            (collidingMap.accountId !== accountId ||
              collidingMap.projectId !== snapshot.map.projectId)
          ) {
            throw new ContextGraphRepositoryError('record_id_conflict', snapshot.map.id);
          }
          const actualRevision = current?.map.knowledgeRevision ?? 0;
          if (
            options.expectedKnowledgeRevision !== undefined &&
            options.expectedKnowledgeRevision !== actualRevision
          ) {
            throw new ContextGraphRepositoryError('revision_conflict');
          }
          if (current && snapshot.map.knowledgeRevision < actualRevision) {
            throw new ContextGraphRepositoryError('revision_conflict');
          }
          if (
            current &&
            snapshot.map.knowledgeRevision === actualRevision &&
            snapshotJson(current) !== snapshotJson(snapshot)
          ) {
            throw new ContextGraphRepositoryError('revision_conflict');
          }

          await Promise.all([
            assertChildIdOwnership(
              snapshot.sources,
              await database.context_sources.bulkGet(snapshot.sources.map(({ id }) => id)),
              accountId,
              snapshot.map.id,
            ),
            assertChildIdOwnership(
              snapshot.entities,
              await database.context_entities.bulkGet(snapshot.entities.map(({ id }) => id)),
              accountId,
              snapshot.map.id,
            ),
            assertChildIdOwnership(
              snapshot.edges,
              await database.context_edges.bulkGet(snapshot.edges.map(({ id }) => id)),
              accountId,
              snapshot.map.id,
            ),
            assertChildIdOwnership(
              snapshot.provenance,
              await database.context_provenance.bulkGet(snapshot.provenance.map(({ id }) => id)),
              accountId,
              snapshot.map.id,
            ),
          ]);

          const existing = current ?? {
            version: 2 as const,
            map: snapshot.map,
            sources: [],
            entities: [],
            edges: [],
            provenance: [],
          };
          const staleSourceIds = idsToDelete(existing.sources, snapshot.sources);
          const staleEntityIds = idsToDelete(existing.entities, snapshot.entities);
          const staleEdgeIds = idsToDelete(existing.edges, snapshot.edges);
          const staleProvenanceIds = idsToDelete(existing.provenance, snapshot.provenance);

          await database.context_maps.put(snapshot.map);
          await Promise.all([
            staleSourceIds.length
              ? database.context_sources.bulkDelete(staleSourceIds)
              : Promise.resolve(),
            staleEntityIds.length
              ? database.context_entities.bulkDelete(staleEntityIds)
              : Promise.resolve(),
            staleEdgeIds.length
              ? database.context_edges.bulkDelete(staleEdgeIds)
              : Promise.resolve(),
            staleProvenanceIds.length
              ? database.context_provenance.bulkDelete(staleProvenanceIds)
              : Promise.resolve(),
          ]);
          await Promise.all([
            snapshot.sources.length
              ? database.context_sources.bulkPut(snapshot.sources)
              : Promise.resolve(),
            snapshot.entities.length
              ? database.context_entities.bulkPut(snapshot.entities)
              : Promise.resolve(),
            snapshot.edges.length
              ? database.context_edges.bulkPut(snapshot.edges)
              : Promise.resolve(),
            snapshot.provenance.length
              ? database.context_provenance.bulkPut(snapshot.provenance)
              : Promise.resolve(),
          ]);

          return Object.freeze({
            mapId: snapshot.map.id,
            knowledgeRevision: snapshot.map.knowledgeRevision,
            sourceCount: snapshot.sources.length,
            entityCount: snapshot.entities.length,
            edgeCount: snapshot.edges.length,
            provenanceCount: snapshot.provenance.length,
          });
        },
      );
    },

    async getSnapshot(
      accountId: string,
      mapId: string,
    ): Promise<DeepReadonly<ContextGraphSnapshotV2> | null> {
      assertAccountId(accountId);
      const raw = await loadRawSnapshot(database, accountId, mapId);
      if (!raw) return null;
      const parsed = parsePortableSnapshot(raw);
      if (!parsed.ok) {
        throw new ContextGraphRepositoryError('snapshot_corrupt', parsed.reason);
      }
      return parsed.value;
    },

    async readWithRecovery(
      accountId: string,
      mapId: string,
    ): Promise<ContextSnapshotRecoveryResult> {
      assertAccountId(accountId);
      const raw = await loadRawSnapshot(database, accountId, mapId);
      if (!raw) return Object.freeze({ state: 'missing' as const });
      const parsed = parsePortableSnapshot(raw);
      if (parsed.ok) {
        return Object.freeze({ state: 'ready' as const, snapshot: parsed.value });
      }
      return quarantineSnapshot(database, accountId, mapId, parsed.reason, raw);
    },

    async listMaps(
      accountId: string,
      projectId?: string | null,
    ): Promise<readonly DeepReadonly<ContextMapRecordV2>[]> {
      assertAccountId(accountId);
      const rows = await database.context_maps.where('accountId').equals(accountId).toArray();
      const valid: DeepReadonly<ContextMapRecordV2>[] = [];
      for (const row of rows) {
        const raw = await loadRawSnapshot(database, accountId, row.id);
        if (!raw) continue;
        const parsed = parsePortableSnapshot(raw);
        if (!parsed.ok) {
          await quarantineSnapshot(database, accountId, row.id, parsed.reason, raw);
          continue;
        }
        if (projectId === undefined || parsed.value.map.projectId === projectId) {
          valid.push(parsed.value.map);
        }
      }
      valid.sort(
        (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
      );
      return Object.freeze(valid);
    },
  });
}
