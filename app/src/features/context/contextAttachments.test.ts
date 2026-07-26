import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_ATTACHMENT_KINDS,
  buildContextAttachmentReference,
  planContextAttachmentExtraction,
  planContextAttachmentPreview,
  planSafeContextWebOpen,
  serializeContextAttachmentReference,
} from './contextAttachments';

const base = {
  accountId: 'account-1',
  attachmentId: 'attachment-1',
  target: { kind: 'context_note' as const, id: 'note-1' },
  kind: 'image' as const,
  fileName: 'diagram.png',
  mimeType: 'image/png',
  byteSize: 42_000,
  assetKey: 'context/account-1/attachment-1',
  checksum: {
    algorithm: 'sha256' as const,
    value: 'a'.repeat(64),
  },
};

describe('Context attachments and media', () => {
  it('supports every approved attachment kind', () => {
    expect(CONTEXT_ATTACHMENT_KINDS).toEqual([
      'image',
      'audio',
      'video',
      'pdf',
      'text',
      'source',
      'archive',
      'approved_other',
    ]);
  });

  it('builds immutable asset references and checksums without embedding bytes', () => {
    const reference = buildContextAttachmentReference(base);
    expect(reference).toEqual({
      ...base,
      storage: 'asset_reference',
      executable: false,
    });
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.target)).toBe(true);
    expect(Object.isFrozen(reference.checksum)).toBe(true);
    const json = serializeContextAttachmentReference(reference);
    expect(json).toContain('"assetKey"');
    expect(json).not.toMatch(/base64|data:/i);
    expect(json.length).toBeLessThan(10_000);
  });

  it('selects the required preview with metadata fallback', () => {
    const expected = {
      image: 'image_thumbnail',
      audio: 'audio_player',
      video: 'video_player',
      pdf: 'pdf_page_preview',
      text: 'text_preview',
      source: 'text_preview',
      archive: 'metadata_fallback',
      approved_other: 'metadata_fallback',
    } as const;
    const mimeTypes = {
      image: 'image/png',
      audio: 'audio/mpeg',
      video: 'video/mp4',
      pdf: 'application/pdf',
      text: 'text/plain',
      source: 'application/typescript',
      archive: 'application/zip',
      approved_other: 'model/gltf-binary',
    } as const;
    for (const [kind, preview] of Object.entries(expected)) {
      const reference = buildContextAttachmentReference({
        ...base,
        kind: kind as keyof typeof expected,
        mimeType: mimeTypes[kind as keyof typeof expected],
        ...(kind === 'approved_other' ? { approvedTypeId: 'cad-model' } : {}),
      });
      expect(planContextAttachmentPreview(reference)).toMatchObject({
        kind: preview,
        attachmentId: 'attachment-1',
        executable: false,
      });
    }
  });

  it('plans direct text and page-provenance PDF extraction without executing', () => {
    const text = buildContextAttachmentReference({
      ...base,
      kind: 'text',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
    });
    expect(planContextAttachmentExtraction(text, { explicit: false })).toEqual({
      kind: 'parse_text_directly',
      attachmentId: 'attachment-1',
      pageProvenance: false,
      executable: false,
    });
    const pdf = buildContextAttachmentReference({
      ...base,
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
    });
    expect(planContextAttachmentExtraction(pdf, { explicit: false })).toEqual({
      kind: 'extract_pdf_text',
      attachmentId: 'attachment-1',
      pageProvenance: true,
      executable: false,
    });
  });

  it('requires explicit provider-aware media transcription and image vision requests', () => {
    const audio = buildContextAttachmentReference({
      ...base,
      kind: 'audio',
      fileName: 'meeting.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(planContextAttachmentExtraction(audio, { explicit: false })).toEqual({
      kind: 'none',
      attachmentId: 'attachment-1',
      reason: 'explicit_request_required',
      executable: false,
    });
    expect(
      planContextAttachmentExtraction(audio, {
        explicit: true,
        providerId: 'ollama',
        modelId: 'whisper-free',
      }),
    ).toMatchObject({
      kind: 'transcribe_media',
      providerId: 'ollama',
      modelId: 'whisper-free',
      executable: false,
    });
    expect(() => planContextAttachmentExtraction(audio, { explicit: true })).toThrow(
      /provider|model/i,
    );

    const image = buildContextAttachmentReference(base);
    expect(
      planContextAttachmentExtraction(image, {
        explicit: true,
        providerId: 'ollama',
        modelId: 'vision-free',
      }),
    ).toMatchObject({ kind: 'summarize_image', executable: false });
  });

  it('never extracts archives automatically or grants execution authority', () => {
    const archive = buildContextAttachmentReference({
      ...base,
      kind: 'archive',
      fileName: 'logs.zip',
      mimeType: 'application/zip',
    });
    expect(
      planContextAttachmentExtraction(archive, {
        explicit: true,
        providerId: 'ollama',
        modelId: 'model',
      }),
    ).toEqual({
      kind: 'none',
      attachmentId: 'attachment-1',
      reason: 'archive_metadata_only',
      executable: false,
    });
  });

  it('rejects base64/data payloads, traversal, malformed hashes, kind/MIME mismatches, and unapproved other types', () => {
    expect(() =>
      buildContextAttachmentReference({ ...base, assetKey: 'data:image/png;base64,aa' }),
    ).toThrow(/asset/i);
    expect(() => buildContextAttachmentReference({ ...base, assetKey: '../private/file' })).toThrow(
      /asset/i,
    );
    expect(() =>
      buildContextAttachmentReference({
        ...base,
        checksum: { algorithm: 'sha256', value: 'weak' },
      }),
    ).toThrow(/checksum/i);
    expect(() =>
      buildContextAttachmentReference({ ...base, kind: 'pdf', mimeType: 'image/png' }),
    ).toThrow(/mime/i);
    expect(() => buildContextAttachmentReference({ ...base, kind: 'approved_other' })).toThrow(
      /approved type/i,
    );
    expect(() =>
      buildContextAttachmentReference({
        ...base,
        assetKey: 'context/account-2/attachment-1',
      }),
    ).toThrow(/asset/i);
    expect(() =>
      buildContextAttachmentReference({
        ...base,
        assetKey: 'context/account-1/attachment-2',
      }),
    ).toThrow(/asset/i);
  });

  it('creates only safe HTTPS web-open plans', () => {
    expect(planSafeContextWebOpen('https://example.com/docs?q=context')).toEqual({
      url: 'https://example.com/docs?q=context',
      target: '_blank',
      rel: 'noopener noreferrer',
      referrerPolicy: 'no-referrer',
      executable: false,
    });
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,unsafe',
      'file:///private.txt',
      'http://example.com',
      'https://user:pass@example.com',
      'https://localhost/private',
      'https://localhost./private',
      'https://service.local./private',
      'https://intranet/private',
      'https://127.0.0.1/private',
      'https://10.0.0.1/private',
    ]) {
      expect(() => planSafeContextWebOpen(url)).toThrow(/web link/i);
    }
  });

  it('rejects accessor, symbol, proxy, and oversized boundaries before cloning', () => {
    let getterCalls = 0;
    const accessor = {
      ...base,
      get fileName() {
        getterCalls += 1;
        return 'diagram.png';
      },
    };
    expect(() => buildContextAttachmentReference(accessor)).toThrow(/attachment/i);
    expect(getterCalls).toBe(0);
    const symbolic = { ...base } as typeof base & Record<symbol, string>;
    symbolic[Symbol('hidden')] = 'opaque';
    expect(() => buildContextAttachmentReference(symbolic)).toThrow(/attachment/i);
    expect(() => buildContextAttachmentReference(new Proxy(base, {}))).toThrow(/attachment/i);

    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(() =>
        buildContextAttachmentReference({ ...base, fileName: 'x'.repeat(100_000) }),
      ).toThrow(/attachment/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });
});
