import { describe, expect, it } from 'vitest';
import { createCanvasDocument, withTitle, type CanvasDocument } from './contracts';
import {
  CANVAS_CLOUD_SYNC_CAPABILITIES,
  CanvasCloudSyncError,
  advanceCanvasCloudRetry,
  createCanvasCloudRetry,
  createCanvasCloudRevision,
  mergeCanvasCloudRevisions,
  resolveCanvasCloudConflict,
  type CanvasCloudRevision,
  type CanvasCloudSyncAuthority,
} from './cloudSync';

const NOW = 1_700_000_000_000;

function authority(overrides: Partial<CanvasCloudSyncAuthority> = {}): CanvasCloudSyncAuthority {
  return {
    accountId: 'acct_one',
    projectId: 'project_one',
    ownerId: 'owner_one',
    cloudSyncEntitled: true,
    ...overrides,
  };
}

function document(title = 'Local source'): CanvasDocument {
  const created = createCanvasDocument({
    id: 'canvas_one',
    projectId: 'project_one',
    ownerId: 'owner_one',
    title,
    now: NOW,
  });
  return withTitle(created, title, NOW + 1);
}

function revision(
  overrides: Partial<{
    revisionId: string;
    parentRevisionId: string | null;
    sequence: number;
    updatedAt: number;
    deletedAt: number | null;
    document: CanvasDocument | null;
  }> = {},
): CanvasCloudRevision {
  return createCanvasCloudRevision(authority(), {
    documentId: 'canvas_one',
    revisionId: 'revision_one',
    parentRevisionId: null,
    sequence: 1,
    updatedAt: NOW + 1,
    deletedAt: null,
    document: document(),
    ...overrides,
  });
}

describe('Canvas optional cloud-sync revision boundary', () => {
  it('keeps local Canvas usable while describing cloud sync as non-real-time', () => {
    expect(document().title).toBe('Local source');
    expect(CANVAS_CLOUD_SYNC_CAPABILITIES).toEqual({
      localFirst: true,
      realTimeCollaboration: false,
    });
    expect(Object.isFrozen(CANVAS_CLOUD_SYNC_CAPABILITIES)).toBe(true);
  });

  it.each([
    [{ cloudSyncEntitled: false }, 'entitlement_required'],
    [{ accountId: ' ' }, 'invalid_authority'],
    [{ projectId: 'project_other' }, 'project_scope_mismatch'],
    [{ ownerId: 'owner_other' }, 'owner_scope_mismatch'],
  ] as const)('fails closed for invalid cloud authority %#', (overrides, code) => {
    expect(() =>
      createCanvasCloudRevision(authority(overrides), {
        documentId: 'canvas_one',
        revisionId: 'revision_one',
        parentRevisionId: null,
        sequence: 1,
        updatedAt: NOW + 1,
        deletedAt: null,
        document: document(),
      }),
    ).toThrow(expect.objectContaining({ name: 'CanvasCloudSyncError', code }));
  });

  it('strictly validates and deeply freezes revision data without mutating the document', () => {
    const source = JSON.parse(JSON.stringify(document())) as CanvasDocument;
    const synced = createCanvasCloudRevision(authority(), {
      documentId: 'canvas_one',
      revisionId: 'revision_one',
      parentRevisionId: null,
      sequence: 1,
      updatedAt: NOW + 1,
      deletedAt: null,
      document: source,
    });

    expect(synced.document).toEqual(source);
    expect(synced.document).not.toBe(source);
    expect(Object.isFrozen(synced.document)).toBe(true);
    expect(Object.isFrozen(synced)).toBe(true);
    expect(Object.isFrozen(synced.scope)).toBe(true);
    (source as unknown as { title: string }).title = 'Mutated after revision';
    expect(synced.document?.title).toBe('Local source');
    expect(() =>
      createCanvasCloudRevision(authority(), {
        documentId: 'canvas_one',
        revisionId: 'bad id',
        parentRevisionId: null,
        sequence: 1,
        updatedAt: NOW + 1,
        deletedAt: null,
        document: source,
      }),
    ).toThrow(CanvasCloudSyncError);
  });

  it('fast-forwards only through a monotonic direct revision chain', () => {
    const local = revision();
    const remoteDocument = withTitle(document(), 'Remote successor', NOW + 2);
    const remote = revision({
      revisionId: 'revision_two',
      parentRevisionId: local.revisionId,
      sequence: 2,
      updatedAt: NOW + 2,
      document: remoteDocument,
    });

    const result = mergeCanvasCloudRevisions(authority(), local, remote);
    expect(result).toMatchObject({
      kind: 'merged',
      action: 'accept_remote',
      revision: { revisionId: 'revision_two' },
      capabilities: { realTimeCollaboration: false },
    });
    if (result.kind !== 'merged') throw new Error('expected merge');
    expect(result.localSource).toEqual(local);
  });

  it('keeps a newer local revision when the remote is its direct ancestor', () => {
    const remote = revision();
    const local = revision({
      revisionId: 'revision_two',
      parentRevisionId: remote.revisionId,
      sequence: 2,
      updatedAt: NOW + 2,
      document: withTitle(document(), 'Newer local', NOW + 2),
    });

    expect(mergeCanvasCloudRevisions(authority(), local, remote)).toMatchObject({
      kind: 'merged',
      action: 'keep_local',
      revision: { revisionId: 'revision_two' },
    });
  });

  it('produces an explicit conflict artifact for divergent edits and preserves both sources', () => {
    const local = revision({
      revisionId: 'local_two',
      parentRevisionId: 'revision_base',
      sequence: 2,
      document: withTitle(document(), 'Local edit', NOW + 2),
    });
    const remote = revision({
      revisionId: 'remote_two',
      parentRevisionId: 'revision_base',
      sequence: 2,
      document: withTitle(document(), 'Remote edit', NOW + 2),
    });

    const result = mergeCanvasCloudRevisions(authority(), local, remote);
    expect(result).toMatchObject({
      kind: 'conflict',
      reason: 'divergent_edits',
      local,
      remote,
      choices: ['keep_local', 'use_remote', 'keep_both'],
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('applies a direct descendant tombstone but never auto-resurrects deleted content', () => {
    const live = revision();
    const tombstone = revision({
      revisionId: 'revision_deleted',
      parentRevisionId: live.revisionId,
      sequence: 2,
      updatedAt: NOW + 2,
      deletedAt: NOW + 2,
      document: null,
    });
    expect(mergeCanvasCloudRevisions(authority(), live, tombstone)).toMatchObject({
      kind: 'merged',
      action: 'accept_remote',
      revision: { deletedAt: NOW + 2, document: null },
    });

    const attemptedResurrection = revision({
      revisionId: 'revision_resurrected',
      parentRevisionId: tombstone.revisionId,
      sequence: 3,
      updatedAt: NOW + 3,
      deletedAt: null,
      document: withTitle(document(), 'Resurrected remotely', NOW + 3),
    });
    expect(mergeCanvasCloudRevisions(authority(), tombstone, attemptedResurrection)).toMatchObject({
      kind: 'conflict',
      reason: 'tombstone_update_conflict',
      local: tombstone,
      remote: attemptedResurrection,
    });
  });

  it('binds tombstones to an explicit document id and rejects mismatched live metadata', () => {
    const tombstone = revision({
      revisionId: 'revision_deleted',
      deletedAt: NOW + 1,
      document: null,
    });
    expect(tombstone.documentId).toBe('canvas_one');
    expect(() =>
      createCanvasCloudRevision(authority(), {
        documentId: 'canvas_other',
        revisionId: 'revision_wrong_document',
        parentRevisionId: null,
        sequence: 1,
        updatedAt: NOW + 1,
        deletedAt: null,
        document: document(),
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_revision' }));
  });

  it('rejects revision rollback and forged same-id payloads', () => {
    const local = revision({
      revisionId: 'revision_two',
      parentRevisionId: 'revision_one',
      sequence: 2,
    });
    const rollback = revision({
      revisionId: 'revision_old',
      parentRevisionId: local.revisionId,
      sequence: 1,
    });
    expect(mergeCanvasCloudRevisions(authority(), local, rollback)).toMatchObject({
      kind: 'conflict',
      reason: 'invalid_revision_chain',
    });

    const forged = revision({ document: withTitle(document(), 'Forged', NOW + 2) });
    expect(mergeCanvasCloudRevisions(authority(), revision(), forged)).toMatchObject({
      kind: 'conflict',
      reason: 'revision_id_collision',
    });
  });

  it('revalidates every revision and conflict artifact at exported boundaries', () => {
    const local = revision();
    const forgedRemote = {
      ...revision({
        revisionId: 'revision_two',
        parentRevisionId: local.revisionId,
        sequence: 2,
        updatedAt: NOW + 2,
      }),
      document: {
        ...document(),
        pageOrder: ['missing-block'],
      },
    } as unknown as CanvasCloudRevision;

    expect(() => mergeCanvasCloudRevisions(authority(), local, forgedRemote)).toThrow(
      CanvasCloudSyncError,
    );
    expect(() =>
      mergeCanvasCloudRevisions(authority(), local, {
        ...forgedRemote,
        scope: null,
      } as never),
    ).toThrow(CanvasCloudSyncError);

    const conflict = mergeCanvasCloudRevisions(
      authority(),
      revision({ revisionId: 'local-two', parentRevisionId: 'revision-base', sequence: 2 }),
      revision({ revisionId: 'remote-two', parentRevisionId: 'revision-base', sequence: 2 }),
    );
    if (conflict.kind !== 'conflict') throw new Error('expected conflict');
    expect(() =>
      resolveCanvasCloudConflict(
        authority(),
        { ...conflict, kind: 'merged' } as never,
        'keep_local',
      ),
    ).toThrow(CanvasCloudSyncError);
  });

  it('resolves conflicts only through an explicit choice without discarding either source', () => {
    const local = revision({ revisionId: 'local_two', parentRevisionId: 'base', sequence: 2 });
    const remote = revision({
      revisionId: 'remote_two',
      parentRevisionId: 'base',
      sequence: 2,
      document: withTitle(document(), 'Remote edit', NOW + 2),
    });
    const conflict = mergeCanvasCloudRevisions(authority(), local, remote);
    expect(conflict.kind).toBe('conflict');
    if (conflict.kind !== 'conflict') throw new Error('expected conflict');

    const resolution = resolveCanvasCloudConflict(authority(), conflict, 'keep_both');
    expect(resolution).toEqual({
      choice: 'keep_both',
      primary: local,
      preserved: [local, remote],
    });
    expect(Object.isFrozen(resolution.preserved)).toBe(true);
  });
});

describe('Canvas cloud-sync retry planning', () => {
  it('creates deterministic idempotency keys and bounded exponential retry states', () => {
    const initial = createCanvasCloudRetry({
      operationId: 'upload_canvas_one',
      maxAttempts: 3,
    });
    const first = advanceCanvasCloudRetry(initial, {
      now: NOW,
      error: 'offline',
      baseDelayMs: 100,
    });
    const duplicate = advanceCanvasCloudRetry(initial, {
      now: NOW,
      error: 'offline',
      baseDelayMs: 100,
    });
    const exhausted = advanceCanvasCloudRetry(
      advanceCanvasCloudRetry(first, {
        now: NOW + 100,
        error: 'timeout',
        baseDelayMs: 100,
      }),
      { now: NOW + 300, error: 'timeout', baseDelayMs: 100 },
    );

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({
      status: 'pending',
      attempt: 1,
      idempotencyKey: 'upload_canvas_one:1',
      nextAttemptAt: NOW + 100,
      lastError: 'offline',
    });
    expect(exhausted).toMatchObject({
      status: 'exhausted',
      attempt: 3,
      nextAttemptAt: null,
    });
    expect(() =>
      advanceCanvasCloudRetry(exhausted, {
        now: NOW + 1_000,
        error: 'still offline',
        baseDelayMs: 100,
      }),
    ).toThrow(expect.objectContaining({ code: 'retry_exhausted' }));
  });

  it('rejects forged retry state and unsafe next-attempt timestamp arithmetic', () => {
    const ready = createCanvasCloudRetry({ operationId: 'sync_canvas_one', maxAttempts: 3 });
    expect(() =>
      advanceCanvasCloudRetry(
        { ...ready, attempt: 2, status: 'ready' },
        { now: NOW, error: 'offline', baseDelayMs: 1_000 },
      ),
    ).toThrow(CanvasCloudSyncError);
    expect(() =>
      advanceCanvasCloudRetry(ready, {
        now: Number.MAX_SAFE_INTEGER,
        error: 'offline',
        baseDelayMs: 1_000,
      }),
    ).toThrow(CanvasCloudSyncError);
  });
});
