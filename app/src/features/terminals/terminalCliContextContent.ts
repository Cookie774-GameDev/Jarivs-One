import type { JarvisDexie } from '@/lib/db';
import {
  createContextContentRepository,
  type ContextNoteBundleV2,
} from '@/features/context/contentRepository';
import type {
  ContextAssetV2,
  ContextNoteRevisionV2,
  ContextNoteV2,
} from '@/features/context/contentContracts';
import type {
  ContextEdgeV2,
  ContextEntityV2,
  ContextGraphSnapshotV2,
  ContextProvenanceV2,
  ContextSourceV2,
  DeepReadonly,
} from '@/features/context/contracts';
import { createContextGraphRepository } from '@/features/context/repository';

const STORAGE_ROOT_ID = 'context-app-data';
const MAX_TITLE_CHARS = 500;
const MAX_NOTE_TEXT_CHARS = 4_096;

export type TerminalCliContextContentErrorCode =
  | 'invalid_request'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'internal_error';

export class TerminalCliContextContentError extends Error {
  constructor(
    readonly code: TerminalCliContextContentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TerminalCliContextContentError';
  }
}

export interface TerminalCliContextContentStorage {
  create(relativePath: string, content: string): Promise<void>;
  read(relativePath: string): Promise<string>;
}

export type TerminalCliContextContentNote = Readonly<{
  id: string;
  name: string;
  entityId: string;
  mapId: string;
}>;

export type TerminalCliContextContentServiceDependencies = Readonly<{
  database: JarvisDexie;
  storage: TerminalCliContextContentStorage;
  now(): number;
  randomId(): string;
  digestSha256(value: string): Promise<string>;
}>;

type NoteScope = Readonly<{
  accountId: string;
  projectId: string | null;
  mapId: string;
}>;

type CreateNoteInput = NoteScope &
  Readonly<{
    title: string;
    kind?: 'standard' | 'daily';
    dailyDate?: string;
    initialContent?: string;
  }>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function invalid(message: string): never {
  throw new TerminalCliContextContentError('invalid_request', message);
}

function stableId(value: string, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    invalid(`The ${label} is invalid.`);
  }
  return value;
}

function safeTitle(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TITLE_CHARS ||
    value.trim() !== value ||
    CONTROL_CHARACTERS.test(value)
  ) {
    invalid('The Context Note title is invalid.');
  }
  return value;
}

function safeText(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_NOTE_TEXT_CHARS ||
    value.trim() !== value ||
    CONTROL_CHARACTERS.test(value)
  ) {
    invalid('The Context Note text is invalid.');
  }
  return value;
}

function safeDate(value: string): string {
  if (!SAFE_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    invalid('The Daily Context date is invalid.');
  }
  return value;
}

function safeRandomToken(value: string): string {
  const token = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  if (!token) {
    throw new TerminalCliContextContentError(
      'internal_error',
      'A Context Note identifier could not be created.',
    );
  }
  return token;
}

function noteResult(note: DeepReadonly<ContextNoteV2>): TerminalCliContextContentNote {
  return Object.freeze({
    id: note.id,
    name: note.title,
    entityId: note.entityId,
    mapId: note.mapId,
  });
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 80) || 'note'
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function asMutable(snapshot: DeepReadonly<ContextGraphSnapshotV2>): ContextGraphSnapshotV2 {
  return structuredClone(snapshot) as ContextGraphSnapshotV2;
}

function recalculateSnapshot(
  snapshot: ContextGraphSnapshotV2,
  timestamp: number,
): ContextGraphSnapshotV2 {
  snapshot.map.sourceIds = snapshot.sources.map(({ id }) => id);
  snapshot.map.statistics = {
    sourceCount: snapshot.sources.length,
    entityCount: snapshot.entities.length,
    edgeCount: snapshot.edges.length,
    noteCount: snapshot.entities.filter(({ kind }) => kind === 'markdown_note').length,
    attachmentCount: snapshot.entities.filter(({ kind }) => kind === 'attachment').length,
    staleSourceCount: snapshot.sources.filter(({ status }) => status === 'stale').length,
  };
  snapshot.map.knowledgeRevision += 1;
  snapshot.map.updatedAt = Math.max(timestamp, snapshot.map.updatedAt + 1);
  return snapshot;
}

function assertScope(snapshot: DeepReadonly<ContextGraphSnapshotV2>, scope: NoteScope): void {
  if (
    snapshot.map.accountId !== scope.accountId ||
    snapshot.map.projectId !== scope.projectId ||
    snapshot.map.id !== scope.mapId ||
    snapshot.map.status !== 'active'
  ) {
    throw new TerminalCliContextContentError(
      'permission_denied',
      'The selected Context Map is not available in this project.',
    );
  }
}

function contentTables(database: JarvisDexie) {
  return [
    database.context_maps,
    database.context_sources,
    database.context_entities,
    database.context_edges,
    database.context_provenance,
    database.context_notes,
    database.context_note_revisions,
    database.context_assets,
  ] as const;
}

async function validatedDigest(
  digestSha256: (value: string) => Promise<string>,
  value: string,
): Promise<string> {
  const digest = await digestSha256(value);
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new TerminalCliContextContentError(
      'internal_error',
      'Context Note integrity metadata could not be created.',
    );
  }
  return digest;
}

function asset(
  input: Readonly<{
    id: string;
    accountId: string;
    mapId: string;
    entityId: string;
    sourceId: string;
    relativePath: string;
    content: string;
    checksumSha256: string;
    kind: 'markdown' | 'text';
    timestamp: number;
  }>,
): ContextAssetV2 {
  return {
    version: 2,
    id: input.id,
    accountId: input.accountId,
    mapId: input.mapId,
    entityId: input.entityId,
    sourceId: input.sourceId,
    kind: input.kind,
    status: 'ready',
    storageMode: 'app_managed',
    storageRootId: STORAGE_ROOT_ID,
    relativePath: input.relativePath,
    fileName: input.relativePath.split('/').at(-1)!,
    mimeType: input.kind === 'markdown' ? 'text/markdown' : 'text/plain',
    checksumSha256: input.checksumSha256,
    sizeBytes: byteLength(input.content),
    executable: false,
    extraction: {
      mode: 'direct_text',
      status: 'ready',
    },
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

async function createAssets(
  dependencies: TerminalCliContextContentServiceDependencies,
  input: Readonly<{
    accountId: string;
    mapId: string;
    entityId: string;
    sourceId: string;
    noteId: string;
    revisionId: string;
    sequence: number;
    content: string;
    recovery: string;
    beforeHash: string | null;
    timestamp: number;
  }>,
): Promise<
  Readonly<{
    contentHash: string;
    contentAsset: ContextAssetV2;
    diffAsset: ContextAssetV2;
    recoveryAsset: ContextAssetV2;
  }>
> {
  const contentHash = await validatedDigest(dependencies.digestSha256, input.content);
  const recoveryHash = await validatedDigest(dependencies.digestSha256, input.recovery);
  const diffText = [
    `Context Note revision ${input.sequence}`,
    `Previous SHA-256: ${input.beforeHash ?? 'none'}`,
    `Current SHA-256: ${contentHash}`,
    '',
  ].join('\n');
  const diffHash = await validatedDigest(dependencies.digestSha256, diffText);
  const contentId = `ctxasset-content-${safeRandomToken(dependencies.randomId())}`;
  const diffId = `ctxasset-diff-${safeRandomToken(dependencies.randomId())}`;
  const recoveryId = `ctxasset-recovery-${safeRandomToken(dependencies.randomId())}`;
  const directory = `context-content/${input.noteId}`;
  const values = [
    {
      record: asset({
        id: contentId,
        accountId: input.accountId,
        mapId: input.mapId,
        entityId: input.entityId,
        sourceId: input.sourceId,
        relativePath: `${directory}/${contentId}.md`,
        content: input.content,
        checksumSha256: contentHash,
        kind: 'markdown',
        timestamp: input.timestamp,
      }),
      content: input.content,
    },
    {
      record: asset({
        id: diffId,
        accountId: input.accountId,
        mapId: input.mapId,
        entityId: input.entityId,
        sourceId: input.sourceId,
        relativePath: `${directory}/${diffId}.txt`,
        content: diffText,
        checksumSha256: diffHash,
        kind: 'text',
        timestamp: input.timestamp,
      }),
      content: diffText,
    },
    {
      record: asset({
        id: recoveryId,
        accountId: input.accountId,
        mapId: input.mapId,
        entityId: input.entityId,
        sourceId: input.sourceId,
        relativePath: `${directory}/${recoveryId}.md`,
        content: input.recovery,
        checksumSha256: recoveryHash,
        kind: 'markdown',
        timestamp: input.timestamp,
      }),
      content: input.recovery,
    },
  ] as const;
  try {
    for (const value of values) {
      await dependencies.storage.create(value.record.relativePath, value.content);
    }
  } catch {
    throw new TerminalCliContextContentError(
      'internal_error',
      'Context Note storage could not be written safely.',
    );
  }
  return Object.freeze({
    contentHash,
    contentAsset: values[0].record,
    diffAsset: values[1].record,
    recoveryAsset: values[2].record,
  });
}

async function noteByName(
  database: JarvisDexie,
  scope: NoteScope,
  name: string,
): Promise<DeepReadonly<ContextNoteV2>> {
  const normalized = normalizedName(safeTitle(name));
  const rows = await createContextContentRepository(database).listNotes(
    scope.accountId,
    scope.mapId,
    'active',
  );
  const matches = rows.filter(
    (note) =>
      normalizedName(note.title) === normalized ||
      note.aliases.some((alias) => normalizedName(alias) === normalized),
  );
  if (matches.length === 0) {
    throw new TerminalCliContextContentError('not_found', 'The Context Note was not found.');
  }
  if (matches.length > 1) {
    throw new TerminalCliContextContentError(
      'conflict',
      'More than one Context Note matches that name.',
    );
  }
  return matches[0]!;
}

export function createTerminalCliContextContentService(
  dependencies: TerminalCliContextContentServiceDependencies,
) {
  const graph = createContextGraphRepository(dependencies.database);
  const content = createContextContentRepository(dependencies.database);

  const createNote = async (raw: CreateNoteInput): Promise<TerminalCliContextContentNote> => {
    const scope: NoteScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
      mapId: stableId(raw.mapId, 'Context Map'),
    };
    const title = safeTitle(raw.title);
    const kind = raw.kind ?? 'standard';
    const dailyDate = raw.dailyDate === undefined ? undefined : safeDate(raw.dailyDate);
    if ((kind === 'daily') !== (dailyDate !== undefined)) {
      invalid('The Daily Context Note metadata is invalid.');
    }
    const noteId = `ctxnote-${safeRandomToken(dependencies.randomId())}`;
    const entityId = `ctxnote-entity-${safeRandomToken(dependencies.randomId())}`;
    const provenanceId = `ctxprov-${safeRandomToken(dependencies.randomId())}`;
    const sourceToken = (
      await validatedDigest(dependencies.digestSha256, `${scope.accountId}\0${scope.mapId}`)
    ).slice(0, 24);
    const sourceId = `ctxnotes-source-${sourceToken}`;
    const revisionId = `ctxrevision-${safeRandomToken(dependencies.randomId())}`;
    const timestamp = dependencies.now();
    const noteContent = raw.initialContent ?? `# ${title}\n`;
    const assets = await createAssets(dependencies, {
      ...scope,
      entityId,
      sourceId,
      noteId,
      revisionId,
      sequence: 1,
      content: noteContent,
      recovery: noteContent,
      beforeHash: null,
      timestamp,
    });
    const note: ContextNoteV2 = {
      version: 2,
      id: noteId,
      accountId: scope.accountId,
      mapId: scope.mapId,
      entityId,
      sourceId,
      kind,
      title,
      status: 'active',
      storageMode: 'app_managed',
      storageRootId: STORAGE_ROOT_ID,
      relativePath: `notes/${slug(title)}-${noteId}.md`,
      contentAssetId: assets.contentAsset.id,
      contentHash: assets.contentHash,
      currentRevisionId: revisionId,
      aliases: [],
      tags: kind === 'daily' ? ['daily'] : [],
      blockIds: [],
      ...(dailyDate ? { dailyDate } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const revision: ContextNoteRevisionV2 = {
      version: 2,
      id: revisionId,
      accountId: scope.accountId,
      mapId: scope.mapId,
      noteId,
      sequence: 1,
      changeKind: 'created',
      authorSource: 'user',
      beforeHash: null,
      afterHash: assets.contentHash,
      diffAssetId: assets.diffAsset.id,
      recoveryMode: 'snapshot',
      recoveryAssetId: assets.recoveryAsset.id,
      createdAt: timestamp,
    };
    const bundle: ContextNoteBundleV2 = {
      note,
      revision,
      assets: [assets.contentAsset, assets.diffAsset, assets.recoveryAsset],
    };

    try {
      await dependencies.database.transaction(
        'rw',
        contentTables(dependencies.database),
        async () => {
          const current = await graph.getSnapshot(scope.accountId, scope.mapId);
          if (!current) {
            throw new TerminalCliContextContentError(
              'not_found',
              'The selected Context Map was not found.',
            );
          }
          assertScope(current, scope);
          const snapshot = asMutable(current);
          if (!snapshot.sources.some((source) => source.id === sourceId)) {
            const notesSource: ContextSourceV2 = {
              version: 2,
              id: sourceId,
              accountId: scope.accountId,
              mapId: scope.mapId,
              kind: 'linked_vibespace_content',
              label: 'Context Notes',
              status: 'ready',
              createdAt: timestamp,
              updatedAt: timestamp,
              lastVerifiedAt: timestamp,
              parserVersion: 1,
            };
            snapshot.sources.push(notesSource);
          }
          const noteEntity: ContextEntityV2 = {
            version: 2,
            id: entityId,
            accountId: scope.accountId,
            mapId: scope.mapId,
            sourceId,
            kind: 'markdown_note',
            label: title,
            path: note.relativePath,
            summary: `Context Note: ${title}`,
            sourceRevision: `terminal-note-${noteId}-1`,
            provenanceIds: [provenanceId],
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          snapshot.entities.push(noteEntity);
          const noteProvenance: ContextProvenanceV2 = {
            version: 2,
            id: provenanceId,
            accountId: scope.accountId,
            mapId: scope.mapId,
            targetKind: 'entity',
            targetId: entityId,
            sourceId,
            sourceKind: 'linked_vibespace_content',
            path: note.relativePath,
            extractedAt: timestamp,
            parser: 'vibespace-terminal-cli',
            confidence: 1,
            sourceRevision: noteEntity.sourceRevision,
          };
          snapshot.provenance.push(noteProvenance);
          recalculateSnapshot(snapshot, timestamp);
          await graph.putSnapshot(scope.accountId, snapshot, {
            expectedKnowledgeRevision: current.map.knowledgeRevision,
          });
          await content.putNoteBundle(scope.accountId, bundle);
        },
      );
      return noteResult(note);
    } catch (error) {
      if (error instanceof TerminalCliContextContentError) throw error;
      throw new TerminalCliContextContentError(
        'conflict',
        'The Context Note changed concurrently; retry the command.',
      );
    }
  };

  const openNote = async (
    raw: NoteScope & Readonly<{ name: string }>,
  ): Promise<TerminalCliContextContentNote> => {
    const scope: NoteScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
      mapId: stableId(raw.mapId, 'Context Map'),
    };
    const snapshot = await graph.getSnapshot(scope.accountId, scope.mapId);
    if (!snapshot) {
      throw new TerminalCliContextContentError(
        'not_found',
        'The selected Context Map was not found.',
      );
    }
    assertScope(snapshot, scope);
    return noteResult(await noteByName(dependencies.database, scope, raw.name));
  };

  const appendNote = async (
    raw: NoteScope & Readonly<{ noteId: string; text: string }>,
  ): Promise<TerminalCliContextContentNote> => {
    const scope: NoteScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
      mapId: stableId(raw.mapId, 'Context Map'),
    };
    const noteId = stableId(raw.noteId, 'Context Note');
    const text = safeText(raw.text);
    const previous = await content.getNoteBundle(scope.accountId, noteId);
    if (!previous || previous.note.mapId !== scope.mapId || previous.note.status !== 'active') {
      throw new TerminalCliContextContentError('not_found', 'The Context Note was not found.');
    }
    const snapshot = await graph.getSnapshot(scope.accountId, scope.mapId);
    if (!snapshot) {
      throw new TerminalCliContextContentError(
        'not_found',
        'The selected Context Map was not found.',
      );
    }
    assertScope(snapshot, scope);
    const previousAsset = previous.assets.find(({ id }) => id === previous.note.contentAssetId);
    if (!previousAsset) {
      throw new TerminalCliContextContentError(
        'internal_error',
        'The Context Note content is unavailable.',
      );
    }
    let previousText: string;
    try {
      previousText = await dependencies.storage.read(previousAsset.relativePath);
    } catch {
      throw new TerminalCliContextContentError(
        'internal_error',
        'The Context Note content is unavailable.',
      );
    }
    const nextText = `${previousText}${previousText.endsWith('\n') ? '' : '\n'}\n${text}\n`;
    const sequence = previous.revision.sequence + 1;
    const timestamp = Math.max(dependencies.now(), previous.note.updatedAt + 1);
    const revisionId = `ctxrevision-${safeRandomToken(dependencies.randomId())}`;
    const assets = await createAssets(dependencies, {
      ...scope,
      entityId: previous.note.entityId,
      sourceId: previous.note.sourceId,
      noteId,
      revisionId,
      sequence,
      content: nextText,
      recovery: previousText,
      beforeHash: previous.note.contentHash,
      timestamp,
    });
    const nextNote: ContextNoteV2 = {
      ...(structuredClone(previous.note) as ContextNoteV2),
      contentAssetId: assets.contentAsset.id,
      contentHash: assets.contentHash,
      currentRevisionId: revisionId,
      updatedAt: timestamp,
    };
    const revision: ContextNoteRevisionV2 = {
      version: 2,
      id: revisionId,
      accountId: scope.accountId,
      mapId: scope.mapId,
      noteId,
      sequence,
      changeKind: 'edited',
      authorSource: 'user',
      beforeHash: previous.note.contentHash,
      afterHash: assets.contentHash,
      diffAssetId: assets.diffAsset.id,
      recoveryMode: 'snapshot',
      recoveryAssetId: assets.recoveryAsset.id,
      createdAt: timestamp,
    };

    try {
      await dependencies.database.transaction(
        'rw',
        contentTables(dependencies.database),
        async () => {
          const current = await graph.getSnapshot(scope.accountId, scope.mapId);
          if (!current) {
            throw new TerminalCliContextContentError(
              'not_found',
              'The selected Context Map was not found.',
            );
          }
          assertScope(current, scope);
          const snapshotUpdate = asMutable(current);
          const entity = snapshotUpdate.entities.find(({ id }) => id === previous.note.entityId);
          if (!entity || entity.kind !== 'markdown_note') {
            throw new TerminalCliContextContentError(
              'internal_error',
              'The Context Note graph entity is unavailable.',
            );
          }
          entity.updatedAt = timestamp;
          entity.sourceRevision = `terminal-note-${noteId}-${sequence}`;
          entity.summary = text.replace(/\s+/gu, ' ').slice(0, 500);
          const provenanceId = `ctxprov-${safeRandomToken(dependencies.randomId())}`;
          entity.provenanceIds.push(provenanceId);
          const source = snapshotUpdate.sources.find(({ id }) => id === entity.sourceId);
          if (!source) {
            throw new TerminalCliContextContentError(
              'internal_error',
              'The Context Note source is unavailable.',
            );
          }
          snapshotUpdate.provenance.push({
            version: 2,
            id: provenanceId,
            accountId: scope.accountId,
            mapId: scope.mapId,
            targetKind: 'entity',
            targetId: entity.id,
            sourceId: entity.sourceId,
            sourceKind: source.kind,
            path: nextNote.relativePath,
            extractedAt: timestamp,
            parser: 'vibespace-terminal-cli',
            confidence: 1,
            sourceRevision: entity.sourceRevision,
          });
          recalculateSnapshot(snapshotUpdate, timestamp);
          await graph.putSnapshot(scope.accountId, snapshotUpdate, {
            expectedKnowledgeRevision: current.map.knowledgeRevision,
          });
          await content.putNoteBundle(scope.accountId, {
            note: nextNote,
            revision,
            assets: [assets.contentAsset, assets.diffAsset, assets.recoveryAsset],
          });
        },
      );
      return noteResult(nextNote);
    } catch (error) {
      if (error instanceof TerminalCliContextContentError) throw error;
      throw new TerminalCliContextContentError(
        'conflict',
        'The Context Note changed concurrently; retry the command.',
      );
    }
  };

  const openDailyNote = async (
    raw: NoteScope & Readonly<{ localDate: string }>,
  ): Promise<TerminalCliContextContentNote> => {
    const scope: NoteScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
      mapId: stableId(raw.mapId, 'Context Map'),
    };
    const localDate = safeDate(raw.localDate);
    const notes = await content.listNotes(scope.accountId, scope.mapId, 'active');
    const matches = notes.filter((note) => note.kind === 'daily' && note.dailyDate === localDate);
    if (matches.length > 1) {
      throw new TerminalCliContextContentError(
        'conflict',
        'More than one Daily Context Note exists for this date.',
      );
    }
    if (matches[0]) return noteResult(matches[0]);
    const title = `Daily Context — ${localDate}`;
    return createNote({
      ...scope,
      title,
      kind: 'daily',
      dailyDate: localDate,
      initialContent: `# ${title}\n`,
    });
  };

  const appendDailyNote = async (
    raw: NoteScope & Readonly<{ localDate: string; text: string }>,
  ): Promise<TerminalCliContextContentNote> => {
    const note = await openDailyNote(raw);
    return appendNote({ ...raw, noteId: note.id });
  };

  const linkNotes = async (
    raw: NoteScope & Readonly<{ source: string; target: string }>,
  ): Promise<Readonly<{ created: boolean; edgeCount: number }>> => {
    const scope: NoteScope = {
      accountId: stableId(raw.accountId, 'account'),
      projectId: raw.projectId === null ? null : stableId(raw.projectId, 'project'),
      mapId: stableId(raw.mapId, 'Context Map'),
    };
    const [source, target] = await Promise.all([
      noteByName(dependencies.database, scope, raw.source),
      noteByName(dependencies.database, scope, raw.target),
    ]);
    if (source.id === target.id) {
      throw new TerminalCliContextContentError('conflict', 'A Context Note cannot link to itself.');
    }
    try {
      let created = false;
      let edgeCount = 0;
      await dependencies.database.transaction(
        'rw',
        [
          dependencies.database.context_maps,
          dependencies.database.context_sources,
          dependencies.database.context_entities,
          dependencies.database.context_edges,
          dependencies.database.context_provenance,
        ],
        async () => {
          const current = await graph.getSnapshot(scope.accountId, scope.mapId);
          if (!current) {
            throw new TerminalCliContextContentError(
              'not_found',
              'The selected Context Map was not found.',
            );
          }
          assertScope(current, scope);
          const snapshot = asMutable(current);
          const desired = [
            {
              sourceEntityId: source.entityId,
              targetEntityId: target.entityId,
              kind: 'links_to' as const,
            },
            {
              sourceEntityId: target.entityId,
              targetEntityId: source.entityId,
              kind: 'backlinks_to' as const,
            },
          ];
          const timestamp = Math.max(dependencies.now(), snapshot.map.updatedAt + 1);
          for (const link of desired) {
            if (
              snapshot.edges.some(
                (edge) =>
                  edge.sourceEntityId === link.sourceEntityId &&
                  edge.targetEntityId === link.targetEntityId &&
                  edge.kind === link.kind,
              )
            ) {
              continue;
            }
            const edge: ContextEdgeV2 = {
              version: 2,
              id: `ctxedge-${safeRandomToken(dependencies.randomId())}`,
              accountId: scope.accountId,
              mapId: scope.mapId,
              ...link,
              provenanceIds: [],
              confidence: 1,
              sourceRevision: `terminal-link-${timestamp}`,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            const sourceRecord = snapshot.sources.find(({ id }) => id === source.sourceId);
            if (!sourceRecord) {
              throw new TerminalCliContextContentError(
                'internal_error',
                'The Context Note source is unavailable.',
              );
            }
            const provenanceId = `ctxprov-${safeRandomToken(dependencies.randomId())}`;
            edge.provenanceIds.push(provenanceId);
            snapshot.provenance.push({
              version: 2,
              id: provenanceId,
              accountId: scope.accountId,
              mapId: scope.mapId,
              targetKind: 'edge',
              targetId: edge.id,
              sourceId: source.sourceId,
              sourceKind: sourceRecord.kind,
              extractedAt: timestamp,
              parser: 'vibespace-terminal-cli',
              confidence: 1,
              sourceRevision: edge.sourceRevision,
            });
            snapshot.edges.push(edge);
            created = true;
          }
          if (created) {
            recalculateSnapshot(snapshot, timestamp);
            await graph.putSnapshot(scope.accountId, snapshot, {
              expectedKnowledgeRevision: current.map.knowledgeRevision,
            });
          }
          edgeCount = snapshot.edges.filter(
            (edge) =>
              (edge.sourceEntityId === source.entityId &&
                edge.targetEntityId === target.entityId) ||
              (edge.sourceEntityId === target.entityId && edge.targetEntityId === source.entityId),
          ).length;
        },
      );
      return Object.freeze({ created, edgeCount });
    } catch (error) {
      if (error instanceof TerminalCliContextContentError) throw error;
      throw new TerminalCliContextContentError(
        'conflict',
        'The Context Note links changed concurrently; retry the command.',
      );
    }
  };

  return Object.freeze({
    createNote,
    openNote,
    appendNote,
    openDailyNote,
    appendDailyNote,
    linkNotes,
  });
}
