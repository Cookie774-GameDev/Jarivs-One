import { describe, expect, it } from 'vitest';
import {
  parseContextAssetV2 as parseContextAssetV1,
  parseContextNoteRevisionV2 as parseContextNoteRevisionV1,
  parseContextNoteV2 as parseContextNoteV1,
  type ContextAssetV2 as ContextAssetV1,
  type ContextNoteRevisionV2 as ContextNoteRevisionV1,
  type ContextNoteV2 as ContextNoteV1,
} from './contentContracts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function noteFixture(): ContextNoteV1 {
  return {
    version: 2,
    id: 'note-auth-flow',
    accountId: 'account-1',
    mapId: 'map-1',
    entityId: 'entity-note-auth-flow',
    sourceId: 'source-local-notes',
    kind: 'daily',
    title: 'Authentication Flow',
    status: 'active',
    storageMode: 'app_managed',
    storageRootId: 'context-app-data',
    relativePath: 'notes/authentication-flow.md',
    contentAssetId: 'asset-note-auth-flow',
    contentHash: HASH_A,
    currentRevisionId: 'revision-auth-flow-1',
    aliases: ['Access Gate', 'Subscription Gate'],
    tags: ['security', 'architecture'],
    blockIds: ['entitlement-authority', 'refresh-race'],
    dailyDate: '2026-07-24',
    createdAt: 100,
    updatedAt: 200,
  };
}

function revisionFixture(): ContextNoteRevisionV1 {
  return {
    version: 2,
    id: 'revision-auth-flow-1',
    accountId: 'account-1',
    mapId: 'map-1',
    noteId: 'note-auth-flow',
    sequence: 1,
    changeKind: 'created',
    authorSource: 'user',
    beforeHash: null,
    afterHash: HASH_A,
    diffAssetId: 'asset-note-auth-flow-diff-1',
    recoveryMode: 'reverse_diff',
    recoveryAssetId: 'asset-note-auth-flow-diff-1',
    createdAt: 200,
  };
}

function assetFixture(): ContextAssetV1 {
  return {
    version: 2,
    id: 'asset-note-auth-flow',
    accountId: 'account-1',
    mapId: 'map-1',
    entityId: 'entity-note-auth-flow',
    sourceId: 'source-local-notes',
    kind: 'markdown',
    status: 'ready',
    storageMode: 'app_managed',
    storageRootId: 'context-app-data',
    relativePath: 'notes/authentication-flow.md',
    fileName: 'authentication-flow.md',
    mimeType: 'text/markdown',
    checksumSha256: HASH_A,
    sizeBytes: 4_096,
    executable: false,
    extraction: {
      mode: 'direct_text',
      status: 'ready',
    },
    createdAt: 100,
    updatedAt: 200,
  };
}

describe('Context local content contracts', () => {
  it('parses detached deeply immutable note, revision, and asset metadata', () => {
    const note = noteFixture();
    const revision = revisionFixture();
    const asset = assetFixture();

    const parsedNote = parseContextNoteV1(note);
    const parsedRevision = parseContextNoteRevisionV1(revision);
    const parsedAsset = parseContextAssetV1(asset);

    expect(parsedNote).toMatchObject({ ok: true, value: { id: note.id } });
    expect(parsedRevision).toMatchObject({ ok: true, value: { id: revision.id } });
    expect(parsedAsset).toMatchObject({ ok: true, value: { id: asset.id } });
    if (!parsedNote.ok || !parsedRevision.ok || !parsedAsset.ok) {
      throw new Error('Expected valid content records.');
    }
    expect(Object.isFrozen(parsedNote.value)).toBe(true);
    expect(Object.isFrozen(parsedNote.value.aliases)).toBe(true);
    expect(Object.isFrozen(parsedAsset.value.extraction)).toBe(true);

    note.aliases[0] = 'mutated';
    asset.extraction.status = 'failed';
    expect(parsedNote.value.aliases[0]).toBe('Access Gate');
    expect(parsedAsset.value.extraction.status).toBe('ready');
  });

  it.each([
    'C:\\Private\\note.md',
    '\\\\server\\share\\note.md',
    '/private/note.md',
    '../private/note.md',
    'notes/../private/note.md',
    'https://example.com/note.md',
    'notes//note.md',
    'notes/file.md:stream.md',
    'notes/CON.md',
    'notes/COM¹.md',
    'notes/COM².md',
    'notes/COM³.md',
    'notes/LPT¹.md',
    'notes/LPT².md',
    'notes/LPT³.md',
    'notes/foo?/note.md',
    'notes/folder./note.md',
    'notes/folder /note.md',
  ])('rejects non-portable note paths: %s', (relativePath) => {
    expect(parseContextNoteV1({ ...noteFixture(), relativePath })).toEqual({
      ok: false,
      reason: 'note_relative_path_invalid',
    });
  });

  it('requires Markdown paths, coherent deletion times, and explicit project-local consent', () => {
    expect(
      parseContextNoteV1({ ...noteFixture(), relativePath: 'notes/authentication-flow.txt' }),
    ).toEqual({ ok: false, reason: 'note_relative_path_invalid' });
    expect(parseContextNoteV1({ ...noteFixture(), status: 'deleted' })).toEqual({
      ok: false,
      reason: 'note_deleted_at_invalid',
    });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        status: 'deleted',
        deletedAt: 199,
      }),
    ).toEqual({ ok: false, reason: 'note_deleted_at_invalid' });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        storageMode: 'project_local',
      }),
    ).toEqual({ ok: false, reason: 'note_write_consent_invalid' });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        storageMode: 'project_local',
        writeConsentId: 'consent-context-project-1',
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        storageMode: 'app_managed',
        writeConsentId: 'consent-not-needed',
      }),
    ).toEqual({ ok: false, reason: 'note_write_consent_invalid' });
    for (const storageRootId of ['C:', 'https:context-root']) {
      expect(parseContextNoteV1({ ...noteFixture(), storageRootId })).toEqual({
        ok: false,
        reason: 'note_storage_root_invalid',
      });
    }
  });

  it('validates daily dates and unique aliases, tags, and stable block ids', () => {
    expect(parseContextNoteV1({ ...noteFixture(), dailyDate: '2026-02-29' })).toEqual({
      ok: false,
      reason: 'note_daily_date_invalid',
    });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        aliases: ['Access Gate', 'access gate'],
      }),
    ).toEqual({ ok: false, reason: 'note_alias_duplicate' });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        tags: ['Security', 'security'],
      }),
    ).toEqual({ ok: false, reason: 'note_tag_duplicate' });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        blockIds: ['refresh-race', 'refresh-race'],
      }),
    ).toEqual({ ok: false, reason: 'note_block_id_duplicate' });
    expect(
      parseContextNoteV1({
        ...noteFixture(),
        blockIds: ['not valid whitespace'],
      }),
    ).toEqual({ ok: false, reason: 'note_block_id_invalid' });
  });

  it('rejects incoherent revision sequences, hashes, and restore metadata', () => {
    expect(
      parseContextNoteRevisionV1({
        ...revisionFixture(),
        sequence: 2,
      }),
    ).toEqual({ ok: false, reason: 'note_revision_before_hash_invalid' });
    expect(
      parseContextNoteRevisionV1({
        ...revisionFixture(),
        beforeHash: HASH_A,
      }),
    ).toEqual({ ok: false, reason: 'note_revision_before_hash_invalid' });
    expect(
      parseContextNoteRevisionV1({
        ...revisionFixture(),
        sequence: 2,
        changeKind: 'restored',
        beforeHash: HASH_A,
      }),
    ).toEqual({ ok: false, reason: 'note_revision_restore_target_invalid' });
    expect(
      parseContextNoteRevisionV1({
        ...revisionFixture(),
        restoredFromRevisionId: 'revision-old',
      }),
    ).toEqual({ ok: false, reason: 'note_revision_restore_target_invalid' });
    expect(
      parseContextNoteRevisionV1({
        ...revisionFixture(),
        sequence: 2,
        changeKind: 'restored',
        beforeHash: HASH_A,
        afterHash: HASH_B,
        restoredFromRevisionId: 'revision-auth-flow-0',
      }),
    ).toMatchObject({ ok: true });
  });

  it('stores only safe asset references and forbids payload, executable, and path leakage', () => {
    expect(parseContextAssetV1({ ...assetFixture(), executable: true })).toEqual({
      ok: false,
      reason: 'asset_executable_invalid',
    });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        relativePath: 'C:\\Private\\authentication-flow.md',
      }),
    ).toEqual({ ok: false, reason: 'asset_relative_path_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        rawBase64: 'ZGF0YQ==',
      }),
    ).toEqual({ ok: false, reason: 'asset_keys_invalid' });
  });

  it('requires blocked archive extraction and explicit provider-aware media extraction', () => {
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        kind: 'archive',
        relativePath: 'assets/sources.zip',
        fileName: 'sources.zip',
        mimeType: 'application/zip',
        extraction: { mode: 'direct_text', status: 'ready' },
      }),
    ).toEqual({ ok: false, reason: 'asset_archive_extraction_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        kind: 'archive',
        relativePath: 'assets/sources.zip',
        fileName: 'sources.zip',
        mimeType: 'application/zip',
        extraction: { mode: 'none', status: 'blocked' },
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        kind: 'audio',
        relativePath: 'assets/meeting.wav',
        fileName: 'meeting.wav',
        mimeType: 'audio/wav',
        extraction: { mode: 'explicit_transcription', status: 'ready' },
      }),
    ).toEqual({ ok: false, reason: 'asset_extraction_provider_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        kind: 'audio',
        relativePath: 'assets/meeting.wav',
        fileName: 'meeting.wav',
        mimeType: 'audio/wav',
        extraction: {
          mode: 'explicit_transcription',
          status: 'ready',
          provider: {
            providerId: 'ollama',
            modelId: 'whisper-local',
            authorization: 'explicit_user',
          },
        },
      }),
    ).toMatchObject({ ok: true });
  });

  it('rejects contradictory asset availability and extraction lifecycle states', () => {
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        extraction: { mode: 'none', status: 'ready' },
      }),
    ).toEqual({ ok: false, reason: 'asset_extraction_status_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        extraction: { mode: 'direct_text', status: 'not_requested' },
      }),
    ).toEqual({ ok: false, reason: 'asset_extraction_status_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        status: 'missing',
      }),
    ).toEqual({ ok: false, reason: 'asset_extraction_status_invalid' });
    expect(
      parseContextAssetV1({
        ...assetFixture(),
        status: 'quarantined',
        extraction: { mode: 'direct_text', status: 'pending' },
      }),
    ).toEqual({ ok: false, reason: 'asset_extraction_status_invalid' });
  });

  it('rejects unknown fields and provider secret-shaped fields', () => {
    expect(parseContextNoteV1({ ...noteFixture(), extra: true })).toEqual({
      ok: false,
      reason: 'note_keys_invalid',
    });
    expect(parseContextNoteRevisionV1({ ...revisionFixture(), extra: true })).toEqual({
      ok: false,
      reason: 'note_revision_keys_invalid',
    });
    const asset = assetFixture();
    asset.kind = 'audio';
    asset.relativePath = 'assets/meeting.wav';
    asset.fileName = 'meeting.wav';
    asset.mimeType = 'audio/wav';
    asset.extraction = {
      mode: 'explicit_transcription',
      status: 'ready',
      provider: {
        providerId: 'provider-1',
        modelId: 'model-1',
        authorization: 'explicit_user',
        apiKey: 'must-not-persist',
      },
    } as ContextAssetV1['extraction'];
    expect(parseContextAssetV1(asset)).toEqual({
      ok: false,
      reason: 'asset_extraction_provider_keys_invalid',
    });
  });
});
