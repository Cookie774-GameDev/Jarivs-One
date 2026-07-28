import { describe, expect, it } from 'vitest';
import {
  CANVAS_ATTACHMENT_KINDS,
  CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH,
  CANVAS_ATTACHMENT_MAX_PREVIEW_LINES,
  CANVAS_ATTACHMENT_OPEN_KINDS,
  CANVAS_ATTACHMENT_TEXT_MIME_TYPES,
  CanvasAttachmentError,
  assertAttachmentScope,
  createAttachmentPreview,
  describeChatAttachment,
  describeOpenAction,
  describePromptForgeReference,
  isAttachmentInScope,
  isCanvasAttachment,
  markAttachmentMissing,
  relocateAttachment,
  restoreAttachment,
  validateCanvasAttachment,
} from './attachments';
import { CanvasSecurityError } from './security';

const NL = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);

const digest = (char: string): string => char.repeat(64);

const validChecksum = { algorithm: 'sha-256' as const, digest: digest('a') };

const validSource = {
  kind: 'project' as const,
  reference: 'docs/notes.md',
  filename: 'notes.md',
  mimeType: 'text/markdown',
  byteSize: 2048,
  checksum: validChecksum,
  originUrl: null,
};

const validInput = {
  id: 'attach_1',
  projectId: 'proj_1',
  ownerId: 'owner_1',
  source: validSource,
  preview: null,
  missing: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const scope = { projectId: 'proj_1', ownerId: 'owner_1' };

const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('canvas attachment reference validation', () => {
  it('builds a deeply frozen, scoped, stable reference for a project file', () => {
    const reference = validateCanvasAttachment(validInput);

    expect(reference.id).toBe('attach_1');
    expect(reference.projectId).toBe('proj_1');
    expect(reference.ownerId).toBe('owner_1');
    expect(reference.source.kind).toBe('project');
    expect(reference.source.reference).toBe('docs/notes.md');
    expect(reference.source.filename).toBe('notes.md');
    expect(reference.source.mimeType).toBe('text/markdown');
    expect(reference.source.byteSize).toBe(2048);
    expect(reference.source.originUrl).toBeNull();
    expect(reference.preview).toBeNull();
    expect(reference.missing).toBe(false);
    expect(reference.createdAt).toBe(1000);
    expect(reference.updatedAt).toBe(1000);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.source)).toBe(true);
    expect(Object.isFrozen(reference.source.checksum)).toBe(true);
  });

  it('is deterministic for identical input', () => {
    expect(validateCanvasAttachment(validInput)).toEqual(validateCanvasAttachment(validInput));
  });

  it('accepts an external user-selected file with an opaque bookmark', () => {
    const reference = validateCanvasAttachment({
      ...validInput,
      source: {
        ...validSource,
        kind: 'external',
        reference: 'bookmark-token-abc123',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
      },
    });

    expect(reference.source.kind).toBe('external');
    expect(reference.source.reference).toBe('bookmark-token-abc123');
    expect(reference.source.filename).toBe('report.pdf');
    expect(reference.source.mimeType).toBe('application/pdf');
  });

  it('exposes the supported attachment kinds', () => {
    expect(CANVAS_ATTACHMENT_KINDS).toEqual(['project', 'external']);
  });

  it('rejects a non-object reference', () => {
    const error = captureError(() => validateCanvasAttachment('nope'));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects unexpected fields so binary payloads cannot be smuggled in', () => {
    const error = captureError(() => validateCanvasAttachment({ ...validInput, base64: 'AAAA' }));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    const contentError = captureError(() =>
      validateCanvasAttachment({ ...validInput, content: 'bytes' }),
    );
    expect(contentError).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects an unstable id', () => {
    const error = captureError(() => validateCanvasAttachment({ ...validInput, id: 'bad id!' }));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects an invalid timestamp', () => {
    const error = captureError(() => validateCanvasAttachment({ ...validInput, createdAt: -1 }));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects updatedAt earlier than createdAt', () => {
    const error = captureError(() =>
      validateCanvasAttachment({ ...validInput, createdAt: 2000, updatedAt: 1000 }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects a malformed checksum digest', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, checksum: { algorithm: 'sha-256', digest: 'nothex' } },
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });
});

describe('source metadata validation', () => {
  it('normalizes mime type casing and surrounding whitespace', () => {
    const reference = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, mimeType: '  TEXT/MARKDOWN  ' },
    });
    expect(reference.source.mimeType).toBe('text/markdown');
  });

  it('rejects an unsupported mime type token', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, mimeType: 'not a mime' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects a non-positive byte size', () => {
    const error = captureError(() =>
      validateCanvasAttachment({ ...validInput, source: { ...validSource, byteSize: 0 } }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects an oversized byte size', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, byteSize: Number.MAX_SAFE_INTEGER },
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('normalizes a safe filename and rejects path separators', () => {
    const ok = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, filename: 'my report.final.md' },
    });
    expect(ok.source.filename).toBe('my report.final.md');

    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, filename: 'a/b.md' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects a filename with a trailing dot', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, filename: 'notes.md.' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('accepts a bounded provenance url and trims it', () => {
    const reference = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, originUrl: '  https://example.com/notes.md  ' },
    });
    expect(reference.source.originUrl).toBe('https://example.com/notes.md');
  });
});

describe('unsafe path and url handling fails closed', () => {
  it('rejects a project reference that is actually a url scheme', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: 'https://example.com/notes.md' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects path traversal', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: '../secrets/keys.md' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects absolute paths', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: '/etc/passwd.md' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects backslashes in project paths', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: 'media' + BACKSLASH + 'photo.png' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects hidden path segments', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: '.config/notes.md' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects unsupported project file extensions', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, reference: 'tools/runner.exe' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects a javascript: provenance url', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, originUrl: 'javascript:alert(1)' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects a data: provenance url', () => {
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, originUrl: 'data:text/html,payload' },
      }),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('reports unsafe inputs as not-a-reference through the guard', () => {
    expect(
      isCanvasAttachment({
        ...validInput,
        source: { ...validSource, originUrl: 'javascript:alert(1)' },
      }),
    ).toBe(false);
    expect(isCanvasAttachment({ ...validInput, id: 'bad id!' })).toBe(false);
    expect(isCanvasAttachment(validInput)).toBe(true);
  });
});

describe('bounded text previews', () => {
  it('exposes the text-preview-eligible mime types', () => {
    expect(CANVAS_ATTACHMENT_TEXT_MIME_TYPES).toContain('text/plain');
    expect(CANVAS_ATTACHMENT_TEXT_MIME_TYPES).toContain('text/markdown');
  });

  it('builds a frozen preview from safe text', () => {
    const preview = createAttachmentPreview('line one' + NL + 'line two', 'text/plain');
    expect(preview.text).toBe('line one' + NL + 'line two');
    expect(preview.truncated).toBe(false);
    expect(preview.lineCount).toBe(2);
    expect(preview.encoding).toBe('utf-8');
    expect(Object.isFrozen(preview)).toBe(true);
  });

  it('truncates previews that exceed the length bound', () => {
    const long = 'x'.repeat(CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH + 500);
    const preview = createAttachmentPreview(long, 'text/plain');
    expect(preview.text.length).toBe(CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH);
    expect(preview.truncated).toBe(true);
  });

  it('truncates previews that exceed the line bound', () => {
    const manyLines = Array.from({ length: 250 }, (_, index) => 'line' + index).join(NL);
    const preview = createAttachmentPreview(manyLines, 'text/plain');
    expect(preview.truncated).toBe(true);
    expect(preview.lineCount).toBe(CANVAS_ATTACHMENT_MAX_PREVIEW_LINES);
  });

  it('rejects preview text containing binary control characters', () => {
    const error = captureError(() =>
      createAttachmentPreview('hello' + NUL + 'world', 'text/plain'),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('rejects a preview for a non-text mime type', () => {
    const error = captureError(() => createAttachmentPreview('bytes', 'image/png'));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    expect((error as CanvasAttachmentError).code).toBe('content-not-allowed');
  });

  it('attaches a bounded preview to a text reference', () => {
    const preview = createAttachmentPreview('hello world', 'text/markdown');
    const reference = validateCanvasAttachment({ ...validInput, preview });
    expect(reference.preview).not.toBeNull();
    expect(reference.preview?.text).toBe('hello world');
    expect(Object.isFrozen(reference.preview)).toBe(true);
  });

  it('rejects a preview embedded on a binary reference', () => {
    const preview = createAttachmentPreview('hello', 'text/plain');
    const error = captureError(() =>
      validateCanvasAttachment({
        ...validInput,
        source: { ...validSource, mimeType: 'image/png' },
        preview,
      }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    expect((error as CanvasAttachmentError).code).toBe('content-not-allowed');
  });
});

describe('user-initiated open actions', () => {
  it('exposes the open action kinds', () => {
    expect(CANVAS_ATTACHMENT_OPEN_KINDS).toEqual(['in-files', 'external']);
  });

  it('describes an open-in-files action keyed to the stable reference', () => {
    const reference = validateCanvasAttachment(validInput);
    const descriptor = describeOpenAction(reference, 'in-files');
    expect(descriptor.kind).toBe('in-files');
    expect(descriptor.target).toBe('docs/notes.md');
    expect(descriptor.label).toBe('notes.md');
    expect(descriptor.attachmentId).toBe('attach_1');
    expect(descriptor.userInitiated).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it('describes an open-external action for a user-selected file', () => {
    const reference = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, kind: 'external', reference: 'bookmark-1', filename: 'a.pdf' },
    });
    const descriptor = describeOpenAction(reference, 'external');
    expect(descriptor.kind).toBe('external');
    expect(descriptor.target).toBe('bookmark-1');
    expect(descriptor.label).toBe('a.pdf');
  });

  it('rejects an unsupported open action kind', () => {
    const reference = validateCanvasAttachment(validInput);
    const error = captureError(() => describeOpenAction(reference, 'bogus'));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });

  it('fails closed when opening a missing attachment', () => {
    const reference = markAttachmentMissing(validateCanvasAttachment(validInput));
    const error = captureError(() => describeOpenAction(reference, 'in-files'));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    expect((error as CanvasAttachmentError).code).toBe('missing-attachment');
  });
});

describe('chat attachment descriptors', () => {
  it('summarizes a text attachment with a bounded preview and no bytes', () => {
    const preview = createAttachmentPreview('hello world', 'text/markdown');
    const reference = validateCanvasAttachment({ ...validInput, preview });
    const descriptor = describeChatAttachment(reference);
    expect(descriptor.attachmentId).toBe('attach_1');
    expect(descriptor.kind).toBe('project');
    expect(descriptor.filename).toBe('notes.md');
    expect(descriptor.mimeType).toBe('text/markdown');
    expect(descriptor.byteSize).toBe(2048);
    expect(descriptor.missing).toBe(false);
    expect(descriptor.summary).toContain('notes.md');
    expect(descriptor.summary).toContain('text/markdown');
    expect(descriptor.preview?.text).toBe('hello world');
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it('produces a metadata-only descriptor for binary attachments', () => {
    const reference = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, mimeType: 'image/png', filename: 'photo.png' },
    });
    const descriptor = describeChatAttachment(reference);
    expect(descriptor.preview).toBeNull();
    expect(descriptor.summary).toContain('photo.png');
    expect(descriptor.summary).toContain('image/png');
  });

  it('reflects missing state in the summary', () => {
    const reference = markAttachmentMissing(validateCanvasAttachment(validInput));
    const descriptor = describeChatAttachment(reference);
    expect(descriptor.missing).toBe(true);
    expect(descriptor.summary.toLowerCase()).toContain('missing');
  });
});

describe('prompt forge reference descriptors', () => {
  it('builds a stable, deterministic reference token', () => {
    const reference = validateCanvasAttachment(validInput);
    const first = describePromptForgeReference(reference);
    const second = describePromptForgeReference(reference);
    expect(first.token).toBe('@attachment:attach_1');
    expect(first).toEqual(second);
    expect(first.attachmentId).toBe('attach_1');
    expect(first.filename).toBe('notes.md');
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('carries a bounded preview only for text attachments', () => {
    const preview = createAttachmentPreview('snippet', 'text/plain');
    const textRef = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, mimeType: 'text/plain', filename: 'a.txt' },
      preview,
    });
    expect(describePromptForgeReference(textRef).preview?.text).toBe('snippet');

    const binaryRef = validateCanvasAttachment({
      ...validInput,
      source: { ...validSource, mimeType: 'image/png', filename: 'a.png' },
    });
    expect(describePromptForgeReference(binaryRef).preview).toBeNull();
  });

  it('fails closed when referencing a missing attachment', () => {
    const reference = markAttachmentMissing(validateCanvasAttachment(validInput));
    const error = captureError(() => describePromptForgeReference(reference));
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    expect((error as CanvasAttachmentError).code).toBe('missing-attachment');
  });
});

describe('moved and missing recovery', () => {
  it('marks a reference missing idempotently', () => {
    const reference = validateCanvasAttachment(validInput);
    const missing = markAttachmentMissing(reference);
    expect(missing.missing).toBe(true);
    expect(missing.id).toBe('attach_1');
    expect(markAttachmentMissing(missing)).toBe(missing);
  });

  it('restores a missing reference', () => {
    const reference = markAttachmentMissing(validateCanvasAttachment(validInput));
    const restored = restoreAttachment(reference);
    expect(restored.missing).toBe(false);
    expect(restoreAttachment(restored)).toBe(restored);
  });

  it('relocates a moved file while preserving identity and scope', () => {
    const reference = validateCanvasAttachment(validInput);
    const moved = relocateAttachment(
      reference,
      { kind: 'project', reference: 'archive/notes-2026.md' },
      2000,
    );
    expect(moved.id).toBe('attach_1');
    expect(moved.projectId).toBe('proj_1');
    expect(moved.ownerId).toBe('owner_1');
    expect(moved.source.reference).toBe('archive/notes-2026.md');
    expect(moved.missing).toBe(false);
    expect(moved.createdAt).toBe(1000);
    expect(moved.updatedAt).toBe(2000);
    expect(Object.isFrozen(moved)).toBe(true);
  });

  it('validates the new location on relocation', () => {
    const reference = validateCanvasAttachment(validInput);
    const error = captureError(() =>
      relocateAttachment(reference, { reference: '../outside.md' }, 2000),
    );
    expect(error).toBeInstanceOf(CanvasSecurityError);
  });

  it('rejects a relocation timestamp earlier than creation', () => {
    const reference = validateCanvasAttachment(validInput);
    const error = captureError(() =>
      relocateAttachment(reference, { reference: 'archive/n.md' }, 500),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });
});

describe('account and project scope isolation', () => {
  it('accepts a reference within scope', () => {
    const reference = validateCanvasAttachment(validInput);
    expect(assertAttachmentScope(reference, scope)).toBe(reference);
    expect(isAttachmentInScope(reference, scope)).toBe(true);
  });

  it('rejects a reference from another project', () => {
    const reference = validateCanvasAttachment(validInput);
    const error = captureError(() =>
      assertAttachmentScope(reference, { projectId: 'proj_2', ownerId: 'owner_1' }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
    expect((error as CanvasAttachmentError).code).toBe('scope-violation');
    expect(isAttachmentInScope(reference, { projectId: 'proj_2', ownerId: 'owner_1' })).toBe(false);
  });

  it('rejects a reference from another owner account', () => {
    const reference = validateCanvasAttachment(validInput);
    expect(isAttachmentInScope(reference, { projectId: 'proj_1', ownerId: 'owner_2' })).toBe(false);
  });

  it('validates scope identifiers', () => {
    const reference = validateCanvasAttachment(validInput);
    const error = captureError(() =>
      assertAttachmentScope(reference, { projectId: 'bad id!', ownerId: 'owner_1' }),
    );
    expect(error).toBeInstanceOf(CanvasAttachmentError);
  });
});

describe('immutability guarantees', () => {
  it('freezes nested structures and rejects mutation', () => {
    const preview = createAttachmentPreview('text', 'text/plain');
    const reference = validateCanvasAttachment({ ...validInput, preview });
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.source)).toBe(true);
    expect(Object.isFrozen(reference.source.checksum)).toBe(true);
    expect(Object.isFrozen(reference.preview)).toBe(true);

    const mutable = reference as unknown as { missing: boolean };
    expect(() => {
      mutable.missing = true;
    }).toThrow();
  });
});
