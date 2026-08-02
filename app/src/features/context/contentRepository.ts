import type { JarvisDexie } from '@/lib/db';
import {
  parseContextAssetV2,
  parseContextNoteRevisionV2,
  parseContextNoteV2,
  type ContextAssetV2,
  type ContextNoteRevisionV2,
  type ContextNoteStatus,
  type ContextNoteV2,
} from './contentContracts';
import type { DeepReadonly } from './contracts';

export interface ContextNoteBundleV2 {
  note: ContextNoteV2;
  revision: ContextNoteRevisionV2;
  assets: ContextAssetV2[];
}

export type ContextContentRepositoryErrorCode =
  | 'invalid_account'
  | 'invalid_bundle'
  | 'account_mismatch'
  | 'parent_not_found'
  | 'record_id_conflict'
  | 'revision_conflict'
  | 'dangling_asset_reference'
  | 'stored_record_invalid';

export class ContextContentRepositoryError extends Error {
  constructor(
    readonly code: ContextContentRepositoryErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextContentRepositoryError';
  }
}

const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

function assertAccountId(accountId: string): void {
  if (!ACCOUNT_ID.test(accountId)) {
    throw new ContextContentRepositoryError('invalid_account');
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function parseInputBundle(input: unknown): ContextNoteBundleV2 {
  const record = plainRecord(input);
  if (
    !record ||
    Object.keys(record).some((key) => !['note', 'revision', 'assets'].includes(key)) ||
    !Object.hasOwn(record, 'note') ||
    !Object.hasOwn(record, 'revision') ||
    !Array.isArray(record.assets)
  ) {
    throw new ContextContentRepositoryError('invalid_bundle', 'bundle_shape_invalid');
  }
  const note = parseContextNoteV2(record.note);
  const revision = parseContextNoteRevisionV2(record.revision);
  if (!note.ok) throw new ContextContentRepositoryError('invalid_bundle', note.reason);
  if (!revision.ok) {
    throw new ContextContentRepositoryError('invalid_bundle', revision.reason);
  }
  const assets: ContextAssetV2[] = [];
  for (const value of record.assets) {
    const parsed = parseContextAssetV2(value);
    if (!parsed.ok) throw new ContextContentRepositoryError('invalid_bundle', parsed.reason);
    assets.push(structuredClone(parsed.value) as ContextAssetV2);
  }
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) {
    throw new ContextContentRepositoryError('invalid_bundle', 'asset_id_duplicate');
  }
  return {
    note: structuredClone(note.value) as ContextNoteV2,
    revision: structuredClone(revision.value) as ContextNoteRevisionV2,
    assets,
  };
}

function parseStoredNote(value: unknown): DeepReadonly<ContextNoteV2> {
  const parsed = parseContextNoteV2(value);
  if (!parsed.ok) {
    throw new ContextContentRepositoryError('stored_record_invalid', parsed.reason);
  }
  return parsed.value;
}

function parseStoredRevision(value: unknown): DeepReadonly<ContextNoteRevisionV2> {
  const parsed = parseContextNoteRevisionV2(value);
  if (!parsed.ok) {
    throw new ContextContentRepositoryError('stored_record_invalid', parsed.reason);
  }
  return parsed.value;
}

function parseStoredAsset(value: unknown): DeepReadonly<ContextAssetV2> {
  const parsed = parseContextAssetV2(value);
  if (!parsed.ok) {
    throw new ContextContentRepositoryError('stored_record_invalid', parsed.reason);
  }
  return parsed.value;
}

function immutableBundle(
  note: DeepReadonly<ContextNoteV2>,
  revision: DeepReadonly<ContextNoteRevisionV2>,
  assets: readonly DeepReadonly<ContextAssetV2>[],
): DeepReadonly<ContextNoteBundleV2> {
  return Object.freeze({
    note,
    revision,
    assets: Object.freeze([...assets]),
  }) as DeepReadonly<ContextNoteBundleV2>;
}

function normalizedRecord(value: unknown): string {
  return JSON.stringify(value);
}

function assertSameScope(
  accountId: string,
  note: ContextNoteV2,
  revision: ContextNoteRevisionV2,
  assets: readonly ContextAssetV2[],
): void {
  if (
    note.accountId !== accountId ||
    revision.accountId !== accountId ||
    assets.some((asset) => asset.accountId !== accountId)
  ) {
    throw new ContextContentRepositoryError('account_mismatch');
  }
  if (
    revision.mapId !== note.mapId ||
    assets.some(
      (asset) =>
        asset.mapId !== note.mapId ||
        asset.entityId !== note.entityId ||
        asset.sourceId !== note.sourceId,
    )
  ) {
    throw new ContextContentRepositoryError('account_mismatch');
  }
}

function assertBundleRelationships(note: ContextNoteV2, revision: ContextNoteRevisionV2): void {
  if (
    revision.noteId !== note.id ||
    revision.id !== note.currentRevisionId ||
    revision.afterHash !== note.contentHash ||
    revision.createdAt !== note.updatedAt
  ) {
    throw new ContextContentRepositoryError('revision_conflict');
  }
  if (
    (note.status === 'deleted' && revision.changeKind !== 'deleted') ||
    (note.status === 'deleted' && note.deletedAt !== revision.createdAt) ||
    (revision.changeKind === 'deleted' && note.status !== 'deleted') ||
    (revision.changeKind === 'restored' && note.status !== 'active')
  ) {
    throw new ContextContentRepositoryError('revision_conflict');
  }
}

async function assertGraphParents(
  database: JarvisDexie,
  accountId: string,
  note: ContextNoteV2,
  storedRead = false,
): Promise<void> {
  const [map, source, entity] = await Promise.all([
    database.context_maps.get(note.mapId),
    database.context_sources.get(note.sourceId),
    database.context_entities.get(note.entityId),
  ]);
  if (
    !map ||
    map.accountId !== accountId ||
    !map.sourceIds.includes(note.sourceId) ||
    !source ||
    source.accountId !== accountId ||
    source.mapId !== note.mapId ||
    !entity ||
    entity.accountId !== accountId ||
    entity.mapId !== note.mapId ||
    entity.sourceId !== note.sourceId ||
    entity.kind !== 'markdown_note'
  ) {
    throw new ContextContentRepositoryError(
      storedRead ? 'stored_record_invalid' : 'parent_not_found',
      storedRead ? 'parent_not_found' : undefined,
    );
  }
}

async function resolveAsset(
  database: JarvisDexie,
  incoming: ReadonlyMap<string, ContextAssetV2>,
  accountId: string,
  note: ContextNoteV2,
  assetId: string,
  storedRead: boolean,
): Promise<DeepReadonly<ContextAssetV2>> {
  const candidate = incoming.get(assetId);
  const stored = candidate ?? (await database.context_assets.get(assetId));
  if (!stored) {
    throw new ContextContentRepositoryError(
      storedRead ? 'stored_record_invalid' : 'dangling_asset_reference',
      assetId,
    );
  }
  const parsed = candidate ? parseContextAssetV2(candidate) : parseContextAssetV2(stored);
  if (!parsed.ok) {
    throw new ContextContentRepositoryError(
      candidate ? 'invalid_bundle' : 'stored_record_invalid',
      parsed.reason,
    );
  }
  if (
    parsed.value.accountId !== accountId ||
    parsed.value.mapId !== note.mapId ||
    parsed.value.entityId !== note.entityId ||
    parsed.value.sourceId !== note.sourceId
  ) {
    throw new ContextContentRepositoryError('record_id_conflict', assetId);
  }
  return parsed.value;
}

async function assertAssetClosure(
  database: JarvisDexie,
  accountId: string,
  note: ContextNoteV2,
  revisions: readonly ContextNoteRevisionV2[],
  assets: readonly ContextAssetV2[],
  storedRead = false,
): Promise<void> {
  const incoming = new Map(assets.map((asset) => [asset.id, asset]));
  const pending = [
    note.contentAssetId,
    ...assets.map(({ id }) => id),
    ...revisions.flatMap(({ diffAssetId, recoveryAssetId }) => [diffAssetId, recoveryAssetId]),
  ];
  const resolved = new Map<string, DeepReadonly<ContextAssetV2>>();
  while (pending.length > 0) {
    const id = pending.shift()!;
    if (resolved.has(id)) continue;
    const asset = await resolveAsset(database, incoming, accountId, note, id, storedRead);
    resolved.set(id, asset);
    if (asset.thumbnailAssetId) pending.push(asset.thumbnailAssetId);
    if (asset.extractedTextAssetId) pending.push(asset.extractedTextAssetId);
  }
  const content = resolved.get(note.contentAssetId)!;
  if (
    content.checksumSha256 !== note.contentHash ||
    content.kind !== 'markdown' ||
    content.status !== 'ready' ||
    content.storageMode !== note.storageMode ||
    content.storageRootId !== note.storageRootId ||
    content.writeConsentId !== note.writeConsentId ||
    revisions.some(
      ({ diffAssetId, recoveryAssetId }) =>
        resolved.get(diffAssetId)?.status !== 'ready' ||
        resolved.get(recoveryAssetId)?.status !== 'ready',
    )
  ) {
    throw new ContextContentRepositoryError(
      storedRead ? 'stored_record_invalid' : 'revision_conflict',
      storedRead ? 'asset_history_invalid' : undefined,
    );
  }
}

async function assertImmutableIds(
  database: JarvisDexie,
  note: ContextNoteV2,
  revision: ContextNoteRevisionV2,
  assets: readonly ContextAssetV2[],
): Promise<void> {
  const [storedRevision, storedSequence, storedAssets] = await Promise.all([
    database.context_note_revisions.get(revision.id),
    database.context_note_revisions
      .where('[noteId+sequence]')
      .equals([revision.noteId, revision.sequence])
      .first(),
    database.context_assets.bulkGet(assets.map(({ id }) => id)),
  ]);
  if (
    storedRevision &&
    normalizedRecord(parseStoredRevision(storedRevision)) !== normalizedRecord(revision)
  ) {
    throw new ContextContentRepositoryError('record_id_conflict', revision.id);
  }
  if (storedSequence && storedSequence.id !== revision.id) {
    throw new ContextContentRepositoryError('record_id_conflict', revision.id);
  }
  for (let index = 0; index < assets.length; index += 1) {
    const stored = storedAssets[index];
    if (stored && normalizedRecord(parseStoredAsset(stored)) !== normalizedRecord(assets[index])) {
      throw new ContextContentRepositoryError('record_id_conflict', assets[index]!.id);
    }
  }
  const collidingNote = await database.context_notes.get(note.id);
  if (
    collidingNote &&
    (collidingNote.accountId !== note.accountId ||
      collidingNote.mapId !== note.mapId ||
      collidingNote.entityId !== note.entityId ||
      collidingNote.sourceId !== note.sourceId)
  ) {
    throw new ContextContentRepositoryError('record_id_conflict', note.id);
  }
}

async function validatedHistory(
  database: JarvisDexie,
  accountId: string,
  note: DeepReadonly<ContextNoteV2>,
): Promise<readonly DeepReadonly<ContextNoteRevisionV2>[]> {
  const rows = await database.context_note_revisions
    .where('[accountId+noteId]')
    .equals([accountId, note.id])
    .toArray();
  const revisions = rows
    .map(parseStoredRevision)
    .sort((left, right) => left.sequence - right.sequence);
  let lifecycle: 'active' | 'deleted' = 'active';
  const priorRevisionIds = new Set<string>();
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index]!;
    const previous = revisions[index - 1];
    if (
      revision.accountId !== accountId ||
      revision.mapId !== note.mapId ||
      revision.noteId !== note.id ||
      revision.sequence !== index + 1 ||
      (previous && revision.beforeHash !== previous.afterHash) ||
      (!previous && revision.beforeHash !== null) ||
      (previous && revision.createdAt <= previous.createdAt)
    ) {
      throw new ContextContentRepositoryError('stored_record_invalid', 'revision_history_invalid');
    }
    if (
      revision.changeKind === 'restored' &&
      !priorRevisionIds.has(revision.restoredFromRevisionId!)
    ) {
      throw new ContextContentRepositoryError(
        'stored_record_invalid',
        'revision_restore_target_invalid',
      );
    }
    if (
      (index === 0 && revision.changeKind !== 'created') ||
      (revision.changeKind === 'deleted' && lifecycle !== 'active') ||
      (revision.changeKind === 'restored' && lifecycle !== 'deleted') ||
      ((revision.changeKind === 'edited' || revision.changeKind === 'renamed') &&
        lifecycle !== 'active')
    ) {
      throw new ContextContentRepositoryError(
        'stored_record_invalid',
        'revision_lifecycle_invalid',
      );
    }
    if (revision.changeKind === 'deleted') lifecycle = 'deleted';
    if (revision.changeKind === 'restored') lifecycle = 'active';
    priorRevisionIds.add(revision.id);
  }
  const current = revisions.at(-1);
  if (
    !current ||
    current.id !== note.currentRevisionId ||
    current.afterHash !== note.contentHash ||
    current.createdAt !== note.updatedAt
  ) {
    throw new ContextContentRepositoryError('stored_record_invalid', 'current_revision_invalid');
  }
  if (
    lifecycle !== note.status ||
    (note.status === 'deleted' &&
      (current.changeKind !== 'deleted' || note.deletedAt !== current.createdAt)) ||
    (note.status === 'active' && current.changeKind === 'deleted')
  ) {
    throw new ContextContentRepositoryError('stored_record_invalid', 'revision_lifecycle_invalid');
  }
  return Object.freeze(revisions);
}

async function loadBundle(
  database: JarvisDexie,
  accountId: string,
  noteId: string,
): Promise<DeepReadonly<ContextNoteBundleV2> | null> {
  const rawNote = await database.context_notes.get(noteId);
  if (!rawNote || rawNote.accountId !== accountId) return null;
  const note = parseStoredNote(rawNote);
  await assertGraphParents(database, accountId, structuredClone(note) as ContextNoteV2, true);
  const revisions = await validatedHistory(database, accountId, note);
  const revision = revisions.at(-1)!;
  const rawAssets = await database.context_assets
    .where('[accountId+mapId]')
    .equals([accountId, note.mapId])
    .toArray();
  const assets = rawAssets
    .filter((asset) => asset.entityId === note.entityId && asset.sourceId === note.sourceId)
    .map(parseStoredAsset)
    .sort((left, right) => left.id.localeCompare(right.id, 'en-US'));
  await assertAssetClosure(
    database,
    accountId,
    structuredClone(note) as ContextNoteV2,
    structuredClone(revisions) as ContextNoteRevisionV2[],
    structuredClone(assets) as ContextAssetV2[],
    true,
  );
  return immutableBundle(note, revision, assets);
}

export function createContextContentRepository(database: JarvisDexie) {
  return Object.freeze({
    async putNoteBundle(
      accountId: string,
      input: unknown,
    ): Promise<DeepReadonly<ContextNoteBundleV2>> {
      assertAccountId(accountId);
      const bundle = parseInputBundle(input);
      assertSameScope(accountId, bundle.note, bundle.revision, bundle.assets);
      assertBundleRelationships(bundle.note, bundle.revision);

      return database.transaction(
        'rw',
        [
          database.context_maps,
          database.context_sources,
          database.context_entities,
          database.context_notes,
          database.context_note_revisions,
          database.context_assets,
        ],
        async () => {
          await assertGraphParents(database, accountId, bundle.note);
          await assertImmutableIds(database, bundle.note, bundle.revision, bundle.assets);

          const rawCurrent = await database.context_notes.get(bundle.note.id);
          let history: readonly DeepReadonly<ContextNoteRevisionV2>[] = [];
          if (rawCurrent) {
            const current = parseStoredNote(rawCurrent);
            const [retryRevision, retryAssets] = await Promise.all([
              database.context_note_revisions.get(bundle.revision.id),
              database.context_assets.bulkGet(bundle.assets.map(({ id }) => id)),
            ]);
            if (
              normalizedRecord(current) === normalizedRecord(bundle.note) &&
              retryRevision !== undefined &&
              normalizedRecord(parseStoredRevision(retryRevision)) ===
                normalizedRecord(bundle.revision) &&
              retryAssets.every(
                (asset, index) =>
                  asset !== undefined &&
                  normalizedRecord(parseStoredAsset(asset)) ===
                    normalizedRecord(bundle.assets[index]),
              )
            ) {
              return (await loadBundle(database, accountId, bundle.note.id))!;
            }
            history = await validatedHistory(database, accountId, current);
            const currentRevision = history.at(-1)!;
            const restoredTarget =
              bundle.revision.changeKind === 'restored'
                ? history.find(({ id }) => id === bundle.revision.restoredFromRevisionId)
                : undefined;
            if (
              bundle.note.createdAt !== current.createdAt ||
              bundle.note.entityId !== current.entityId ||
              bundle.note.sourceId !== current.sourceId ||
              bundle.note.mapId !== current.mapId ||
              bundle.note.kind !== current.kind ||
              bundle.note.updatedAt <= current.updatedAt ||
              bundle.revision.sequence !== currentRevision.sequence + 1 ||
              bundle.revision.beforeHash !== current.contentHash ||
              (current.status === 'active' &&
                bundle.note.status === 'active' &&
                (bundle.revision.changeKind === 'deleted' ||
                  bundle.revision.changeKind === 'restored')) ||
              (current.status === 'active' &&
                bundle.note.status === 'deleted' &&
                bundle.revision.changeKind !== 'deleted') ||
              (current.status === 'deleted' &&
                (bundle.note.status !== 'active' ||
                  bundle.revision.changeKind !== 'restored' ||
                  !restoredTarget))
            ) {
              throw new ContextContentRepositoryError('revision_conflict');
            }
          } else if (
            bundle.revision.sequence !== 1 ||
            bundle.revision.changeKind !== 'created' ||
            bundle.note.status !== 'active' ||
            bundle.note.createdAt !== bundle.note.updatedAt
          ) {
            throw new ContextContentRepositoryError('revision_conflict');
          }

          await assertAssetClosure(
            database,
            accountId,
            bundle.note,
            [...(structuredClone(history) as ContextNoteRevisionV2[]), bundle.revision],
            bundle.assets,
          );
          if (bundle.assets.length > 0) {
            await database.context_assets.bulkPut(bundle.assets);
          }
          await database.context_note_revisions.put(bundle.revision);
          await database.context_notes.put(bundle.note);
          return (await loadBundle(database, accountId, bundle.note.id))!;
        },
      );
    },

    async getNoteBundle(
      accountId: string,
      noteId: string,
    ): Promise<DeepReadonly<ContextNoteBundleV2> | null> {
      assertAccountId(accountId);
      return database.transaction(
        'r',
        [
          database.context_maps,
          database.context_sources,
          database.context_entities,
          database.context_notes,
          database.context_note_revisions,
          database.context_assets,
        ],
        () => loadBundle(database, accountId, noteId),
      );
    },

    async listNotes(
      accountId: string,
      mapId: string,
      status?: ContextNoteStatus,
    ): Promise<readonly DeepReadonly<ContextNoteV2>[]> {
      assertAccountId(accountId);
      return database.transaction(
        'r',
        [
          database.context_maps,
          database.context_sources,
          database.context_entities,
          database.context_notes,
          database.context_note_revisions,
          database.context_assets,
        ],
        async () => {
          const rows = await database.context_notes
            .where('[accountId+mapId]')
            .equals([accountId, mapId])
            .toArray();
          const notes: DeepReadonly<ContextNoteV2>[] = [];
          for (const row of rows) {
            if (row.accountId !== accountId || row.mapId !== mapId) {
              throw new ContextContentRepositoryError(
                'stored_record_invalid',
                'note_scope_invalid',
              );
            }
            const bundle = await loadBundle(database, accountId, row.id);
            if (!bundle) {
              throw new ContextContentRepositoryError(
                'stored_record_invalid',
                'note_scope_invalid',
              );
            }
            if (status === undefined || bundle.note.status === status) {
              notes.push(bundle.note);
            }
          }
          return Object.freeze(
            notes.sort(
              (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
            ),
          );
        },
      );
    },

    async listNoteRevisions(
      accountId: string,
      noteId: string,
    ): Promise<readonly DeepReadonly<ContextNoteRevisionV2>[]> {
      assertAccountId(accountId);
      return database.transaction(
        'r',
        [
          database.context_maps,
          database.context_sources,
          database.context_entities,
          database.context_notes,
          database.context_note_revisions,
          database.context_assets,
        ],
        async () => {
          const bundle = await loadBundle(database, accountId, noteId);
          if (!bundle) return Object.freeze([]);
          return validatedHistory(database, accountId, bundle.note);
        },
      );
    },
  });
}
