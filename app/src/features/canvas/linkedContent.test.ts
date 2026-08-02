import { describe, expect, it } from 'vitest';
import {
  CANVAS_LINKED_DOCUMENT_KINDS,
  CANVAS_LINKED_MAX_CAPTURED_FIELDS,
  CANVAS_LINKED_MAX_EXCERPT_LENGTH,
  CANVAS_LINKED_MAX_SUMMARY_LENGTH,
  CANVAS_LINKED_SOURCE_KINDS,
  CANVAS_LINKED_STATUSES,
  CanvasLinkedContentError,
  assertLinkedScope,
  createDocumentSnapshot,
  createLinkedContent,
  createLinkedDocument,
  createLinkedSnapshot,
  isLinkedContent,
  isLinkedDocument,
  isLinkedDocumentStale,
  isLinkedInScope,
  linkedSourceDefaultStatus,
  linkedSourceIcon,
  markLinkedAvailable,
  markLinkedDocumentStale,
  markLinkedUnavailable,
  projectLinkedStatus,
  refreshLinkedDocument,
  removeDocumentSnapshot,
  removeLinkedSnapshot,
  requestDocumentEdit,
  validateLinkedContent,
  validateLinkedDocument,
  withLinkedPreview,
  type CanvasLinkedSourceKind,
} from './linkedContent';

function contentInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    kind: 'chat',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    sourceId: 'chat-123',
    title: 'Team chat',
    createdAt: 1000,
    ...overrides,
  };
}

function docInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-link-1',
    documentKind: 'product-requirements',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    sourceId: 'prd-9',
    sourceVersion: 1,
    title: 'Q3 Requirements',
    summary: 'Scope and goals for the quarter',
    editable: true,
    permissionEvidence: 'role:editor',
    createdAt: 1000,
    ...overrides,
  };
}

const SCOPE = { projectId: 'proj-1', ownerId: 'owner-1' };

describe('linked source projections', () => {
  it('projects a deterministic bounded icon for every VibeSpace source kind', () => {
    expect(CANVAS_LINKED_SOURCE_KINDS.length).toBe(14);
    for (const kind of CANVAS_LINKED_SOURCE_KINDS) {
      const icon = linkedSourceIcon(kind);
      expect(icon.length).toBeGreaterThan(0);
      expect(icon.length).toBeLessThanOrEqual(48);
      expect(linkedSourceIcon(kind)).toBe(icon);
    }
  });

  it('projects a deterministic type-specific default status for every source kind', () => {
    for (const kind of CANVAS_LINKED_SOURCE_KINDS) {
      const status = linkedSourceDefaultStatus(kind);
      expect(CANVAS_LINKED_STATUSES).toContain(status);
      expect(linkedSourceDefaultStatus(kind)).toBe(status);
    }
  });

  it('rejects unknown source kinds', () => {
    expect(() => linkedSourceIcon('nope' as CanvasLinkedSourceKind)).toThrow(
      CanvasLinkedContentError,
    );
    expect(() => linkedSourceDefaultStatus('nope' as CanvasLinkedSourceKind)).toThrow(
      CanvasLinkedContentError,
    );
  });
});

describe('createLinkedContent', () => {
  it('creates a frozen bounded reference for every source kind with no snapshot by default', () => {
    for (const kind of CANVAS_LINKED_SOURCE_KINDS) {
      const value = createLinkedContent(contentInput({ kind, sourceId: 'src-' + kind }));
      expect(value.kind).toBe(kind);
      expect(value.icon).toBe(linkedSourceIcon(kind));
      expect(value.status).toBe(linkedSourceDefaultStatus(kind));
      expect(value.snapshot).toBeNull();
      expect(value.preview).toBeNull();
      expect(value.available).toBe(true);
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('emits a user-gesture internal open action referencing the same source with no URL', () => {
    const value = createLinkedContent(contentInput({ kind: 'agent', sourceId: 'agent-7' }));
    expect(value.openAction).toEqual({
      kind: 'vibespace-resource',
      resourceKind: 'agent',
      resourceId: 'agent-7',
      requiresUserGesture: true,
    });
    expect(JSON.stringify(value)).not.toContain('http');
    expect(Object.keys(value)).not.toContain('url');
  });

  it('never duplicates the full external record by default', () => {
    const value = createLinkedContent(contentInput());
    const keys = Object.keys(value);
    for (const forbidden of ['record', 'data', 'payload', 'body', 'content', 'document']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(value.snapshot).toBeNull();
  });
});

describe('createLinkedContent bounded preview', () => {
  it('accepts an optional bounded preview and rejects oversized preview text', () => {
    const value = createLinkedContent(
      contentInput({
        preview: { summary: 'A short summary', excerpt: 'First lines', capturedAt: 900 },
      }),
    );
    expect(value.preview).toEqual({
      summary: 'A short summary',
      excerpt: 'First lines',
      capturedAt: 900,
    });
    expect(Object.isFrozen(value.preview)).toBe(true);
    const bigSummary = 'x'.repeat(CANVAS_LINKED_MAX_SUMMARY_LENGTH + 1);
    const bigExcerpt = 'x'.repeat(CANVAS_LINKED_MAX_EXCERPT_LENGTH + 1);
    expect(() =>
      createLinkedContent(
        contentInput({ preview: { summary: bigSummary, excerpt: '', capturedAt: 1 } }),
      ),
    ).toThrow(CanvasLinkedContentError);
    expect(() =>
      createLinkedContent(
        contentInput({ preview: { summary: 'ok', excerpt: bigExcerpt, capturedAt: 1 } }),
      ),
    ).toThrow(CanvasLinkedContentError);
  });
});

describe('createLinkedContent invalid payloads', () => {
  it('fails closed on invalid identifiers, kinds, titles, sources, and timestamps', () => {
    const bad = (overrides: Record<string, unknown>) => () =>
      createLinkedContent(contentInput(overrides));
    const longTitle = 'x'.repeat(201);
    const longSource = 'x'.repeat(129);
    const ctrlTitle = 'bad' + String.fromCharCode(1) + 'title';
    expect(bad({ id: '' })).toThrow(CanvasLinkedContentError);
    expect(bad({ id: 'has space' })).toThrow(CanvasLinkedContentError);
    expect(bad({ kind: 'nope' })).toThrow(CanvasLinkedContentError);
    expect(bad({ title: '' })).toThrow(CanvasLinkedContentError);
    expect(bad({ title: longTitle })).toThrow(CanvasLinkedContentError);
    expect(bad({ title: ctrlTitle })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceId: '' })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceId: longSource })).toThrow(CanvasLinkedContentError);
    expect(bad({ createdAt: -1 })).toThrow(CanvasLinkedContentError);
    expect(bad({ createdAt: 1.5 })).toThrow(CanvasLinkedContentError);
    expect(bad({ extra: 1 })).toThrow(CanvasLinkedContentError);
    expect(() => createLinkedContent(null)).toThrow(CanvasLinkedContentError);
    expect(() => createLinkedContent('text')).toThrow(CanvasLinkedContentError);
  });
});

describe('linked content transitions', () => {
  const capture = {
    id: 'snap-1',
    title: 'Frozen title',
    summary: 'Frozen summary',
    capturedFields: ['title', 'summary', 'status'],
    capturedAt: 1500,
  };

  it('sets a bounded preview immutably and bumps updatedAt', () => {
    const base = createLinkedContent(contentInput());
    const next = withLinkedPreview(base, { summary: 'S', excerpt: 'E', capturedAt: 1200 }, 1300);
    expect(next.preview).toEqual({ summary: 'S', excerpt: 'E', capturedAt: 1200 });
    expect(next.updatedAt).toBe(1300);
    expect(base.preview).toBeNull();
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('tracks availability as a fail-closed status transition', () => {
    const base = createLinkedContent(contentInput({ kind: 'model' }));
    const down = markLinkedUnavailable(base, 1400);
    expect(down.available).toBe(false);
    expect(down.status).toBe('unavailable');
    expect(projectLinkedStatus(down)).toBe('unavailable');
    const up = markLinkedAvailable(down, 1500);
    expect(up.available).toBe(true);
    expect(up.status).toBe(linkedSourceDefaultStatus('model'));
    expect(base.available).toBe(true);
  });

  it('creates and removes an explicit bounded snapshot without copying full records', () => {
    const base = createLinkedContent(contentInput());
    const snapped = createLinkedSnapshot(base, capture, 1600);
    expect(snapped.snapshot).not.toBeNull();
    if (snapped.snapshot === null) throw new Error('expected a snapshot');
    expect(snapped.snapshot.capturedFields).toEqual(['title', 'summary', 'status']);
    expect(projectLinkedStatus(snapped)).toBe('snapshot');
    expect(JSON.stringify(snapped.snapshot)).not.toContain('full-record');
    const removed = removeLinkedSnapshot(snapped, 1700);
    expect(removed.snapshot).toBeNull();
    expect(projectLinkedStatus(removed)).toBe(linkedSourceDefaultStatus('chat'));
    expect(base.snapshot).toBeNull();
  });

  it('rejects snapshots that capture too many fields or duplicate field names', () => {
    const base = createLinkedContent(contentInput());
    const tooMany = 'f' + CANVAS_LINKED_MAX_CAPTURED_FIELDS;
    const fields = Array.from({ length: CANVAS_LINKED_MAX_CAPTURED_FIELDS + 1 }, (_, i) => 'a' + i);
    expect(() => createLinkedSnapshot(base, { ...capture, capturedFields: fields }, 1)).toThrow(
      CanvasLinkedContentError,
    );
    expect(() =>
      createLinkedSnapshot(base, { ...capture, capturedFields: ['title', 'title'] }, 1),
    ).toThrow(CanvasLinkedContentError);
    expect(tooMany.length).toBeGreaterThan(0);
  });
});

describe('linked scope and validators', () => {
  it('passes on matching account/project scope and fails closed on mismatch', () => {
    const value = createLinkedContent(contentInput());
    expect(() => assertLinkedScope(value, SCOPE)).not.toThrow();
    expect(isLinkedInScope(value, SCOPE)).toBe(true);
    const wrongProject = { projectId: 'other', ownerId: 'owner-1' };
    const wrongOwner = { projectId: 'proj-1', ownerId: 'other' };
    expect(() => assertLinkedScope(value, wrongProject)).toThrow(CanvasLinkedContentError);
    expect(() => assertLinkedScope(value, wrongOwner)).toThrow(CanvasLinkedContentError);
    expect(isLinkedInScope(value, wrongProject)).toBe(false);
    expect(isLinkedInScope(value, wrongOwner)).toBe(false);
  });

  it('round-trips create input through validateLinkedContent', () => {
    const input = contentInput();
    const value = createLinkedContent(input);
    const reparsed = validateLinkedContent(JSON.parse(JSON.stringify(input)));
    expect(reparsed).toEqual(value);
  });

  it('guards output shape with isLinkedContent', () => {
    const value = createLinkedContent(contentInput());
    expect(isLinkedContent(value)).toBe(true);
    expect(isLinkedContent({ ...value, kind: 'bogus' })).toBe(false);
    expect(
      isLinkedContent({ ...value, openAction: { ...value.openAction, resourceId: 'other' } }),
    ).toBe(false);
    expect(isLinkedContent(null)).toBe(false);
    expect(isLinkedContent(contentInput())).toBe(false);
  });
});

describe('createLinkedDocument', () => {
  it('creates a frozen live document card for every document kind, not stale, no snapshot', () => {
    for (const documentKind of CANVAS_LINKED_DOCUMENT_KINDS) {
      const doc = createLinkedDocument(docInput({ documentKind, sourceId: 'src-' + documentKind }));
      expect(doc.documentKind).toBe(documentKind);
      expect(doc.sourceVersion).toBe(1);
      expect(doc.stale).toBe(false);
      expect(doc.status).toBe('active');
      expect(doc.snapshot).toBeNull();
      expect(doc.editable).toBe(true);
      expect(doc.openAction.requiresUserGesture).toBe(true);
      expect(doc.openAction.resourceId).toBe('src-' + documentKind);
      expect(Object.isFrozen(doc)).toBe(true);
    }
    expect(CANVAS_LINKED_DOCUMENT_KINDS.length).toBe(5);
  });

  it('fails closed on invalid document payloads', () => {
    const bad = (overrides: Record<string, unknown>) => () =>
      createLinkedDocument(docInput(overrides));
    const longSummary = 'x'.repeat(CANVAS_LINKED_MAX_SUMMARY_LENGTH + 1);
    expect(bad({ documentKind: 'nope' })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceVersion: -1 })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceVersion: 1.5 })).toThrow(CanvasLinkedContentError);
    expect(bad({ summary: '' })).toThrow(CanvasLinkedContentError);
    expect(bad({ summary: longSummary })).toThrow(CanvasLinkedContentError);
    expect(bad({ editable: 'yes' })).toThrow(CanvasLinkedContentError);
    expect(bad({ extra: 1 })).toThrow(CanvasLinkedContentError);
    expect(() => createLinkedDocument(null)).toThrow(CanvasLinkedContentError);
  });
});

describe('linked document refresh and stale detection', () => {
  it('treats a same-version refresh as current without changing the version', () => {
    const doc = createLinkedDocument(docInput());
    const result = refreshLinkedDocument(
      doc,
      { sourceVersion: 1, available: true, summary: 'Refreshed summary' },
      2000,
    );
    expect(result.changed).toBe(false);
    expect(result.previousVersion).toBe(1);
    expect(result.nextVersion).toBe(1);
    expect(result.document.sourceVersion).toBe(1);
    expect(result.document.summary).toBe('Refreshed summary');
    expect(result.document.stale).toBe(false);
    expect(result.document.status).toBe('active');
    expect(result.document.lastRefreshedAt).toBe(2000);
  });

  it('tracks a version advance as a changed refresh result and updates the preview', () => {
    const doc = createLinkedDocument(docInput());
    const result = refreshLinkedDocument(
      doc,
      { sourceVersion: 2, available: true, summary: 'New summary', excerpt: 'New excerpt' },
      2100,
    );
    expect(result.changed).toBe(true);
    expect(result.previousVersion).toBe(1);
    expect(result.nextVersion).toBe(2);
    expect(result.document.sourceVersion).toBe(2);
    expect(result.document.summary).toBe('New summary');
    expect(result.document.excerpt).toBe('New excerpt');
    expect(result.document.stale).toBe(false);
    expect(doc.sourceVersion).toBe(1);
  });

  it('marks the card unavailable when the source is unreachable', () => {
    const doc = createLinkedDocument(docInput());
    const result = refreshLinkedDocument(doc, { sourceVersion: 5, available: false }, 2200);
    expect(result.changed).toBe(false);
    expect(result.document.status).toBe('unavailable');
    expect(result.document.sourceVersion).toBe(1);
    expect(result.document.lastRefreshedAt).toBe(2200);
  });

  it('exposes stale state and clears it on the next refresh', () => {
    const doc = createLinkedDocument(docInput());
    const stale = markLinkedDocumentStale(doc, 2300);
    expect(stale.stale).toBe(true);
    expect(stale.status).toBe('stale');
    expect(isLinkedDocumentStale(stale)).toBe(true);
    expect(markLinkedDocumentStale(stale, 2400)).toBe(stale);
    const result = refreshLinkedDocument(stale, { sourceVersion: 1, available: true }, 2500);
    expect(result.document.stale).toBe(false);
    expect(isLinkedDocumentStale(result.document)).toBe(false);
    expect(doc.stale).toBe(false);
  });

  it('rejects invalid refresh results', () => {
    const doc = createLinkedDocument(docInput());
    const bad = (result: Record<string, unknown>) => () => refreshLinkedDocument(doc, result, 1);
    expect(bad({ sourceVersion: -1, available: true })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceVersion: 1, available: 'yes' })).toThrow(CanvasLinkedContentError);
    expect(bad({ sourceVersion: 1, available: true, extra: 1 })).toThrow(CanvasLinkedContentError);
  });
});

describe('linked document snapshots', () => {
  const capture = {
    id: 'doc-snap-1',
    title: 'Captured title',
    summary: 'Captured summary',
    capturedFields: ['title', 'summary'],
    capturedAt: 3000,
  };

  it('creates an explicit bounded snapshot and removes it without losing the source reference', () => {
    const doc = createLinkedDocument(docInput());
    const snapped = createDocumentSnapshot(doc, capture, 3100);
    expect(snapped.snapshot).not.toBeNull();
    if (snapped.snapshot === null) throw new Error('expected a snapshot');
    expect(snapped.snapshot.capturedFields).toEqual(['title', 'summary']);
    expect(snapped.status).toBe('snapshot');
    expect(snapped.sourceId).toBe(doc.sourceId);
    const removed = removeDocumentSnapshot(snapped, 3200);
    expect(removed.snapshot).toBeNull();
    expect(removed.status).toBe('active');
    expect(removed.sourceId).toBe(doc.sourceId);
    expect(doc.snapshot).toBeNull();
  });

  it('restores stale status when removing a snapshot from a stale card', () => {
    const doc = markLinkedDocumentStale(createLinkedDocument(docInput()), 3300);
    const snapped = createDocumentSnapshot(doc, capture, 3400);
    expect(snapped.status).toBe('snapshot');
    const removed = removeDocumentSnapshot(snapped, 3500);
    expect(removed.status).toBe('stale');
    expect(removed.stale).toBe(true);
  });

  it('rejects oversized or malformed snapshot captures', () => {
    const doc = createLinkedDocument(docInput());
    const longTitle = 'x'.repeat(201);
    expect(() => createDocumentSnapshot(doc, { ...capture, title: longTitle }, 1)).toThrow(
      CanvasLinkedContentError,
    );
    expect(() => createDocumentSnapshot(doc, { ...capture, extra: 1 }, 1)).toThrow(
      CanvasLinkedContentError,
    );
  });
});

describe('linked document edit requests (same-source, permission-aware)', () => {
  it('produces an edit descriptor that updates the same source with permission evidence', () => {
    const doc = createLinkedDocument(docInput());
    const request = requestDocumentEdit(doc, { intent: 'Update acceptance criteria' }, 4000);
    expect(request.kind).toBe('source-edit');
    expect(request.sourceId).toBe(doc.sourceId);
    expect(request.documentId).toBe(doc.id);
    expect(request.documentKind).toBe(doc.documentKind);
    expect(request.intent).toBe('Update acceptance criteria');
    expect(request.permissionEvidence).toBe('role:editor');
    expect(request.updatesSameSource).toBe(true);
    expect(request.requestedAt).toBe(4000);
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('fails closed with permission-denied when the document is not editable', () => {
    const doc = createLinkedDocument(docInput({ editable: false }));
    expect(() => requestDocumentEdit(doc, { intent: 'Edit' }, 4100)).toThrow(
      CanvasLinkedContentError,
    );
    try {
      requestDocumentEdit(doc, { intent: 'Edit' }, 4100);
    } catch (error) {
      expect((error as CanvasLinkedContentError).code).toBe('permission-denied');
    }
  });

  it('fails closed when no permission evidence is available', () => {
    const doc = createLinkedDocument(docInput({ permissionEvidence: null }));
    expect(() => requestDocumentEdit(doc, { intent: 'Edit' }, 4200)).toThrow(
      CanvasLinkedContentError,
    );
    const withEvidence = requestDocumentEdit(
      doc,
      { intent: 'Edit', permissionEvidence: 'token:abc' },
      4300,
    );
    expect(withEvidence.permissionEvidence).toBe('token:abc');
  });

  it('rejects empty or oversized edit intents', () => {
    const doc = createLinkedDocument(docInput());
    const longIntent = 'x'.repeat(2001);
    expect(() => requestDocumentEdit(doc, { intent: '' }, 1)).toThrow(CanvasLinkedContentError);
    expect(() => requestDocumentEdit(doc, { intent: longIntent }, 1)).toThrow(
      CanvasLinkedContentError,
    );
  });
});

describe('linked document validators', () => {
  it('round-trips create input and guards output shape', () => {
    const input = docInput();
    const doc = createLinkedDocument(input);
    const reparsed = validateLinkedDocument(JSON.parse(JSON.stringify(input)));
    expect(reparsed).toEqual(doc);
    expect(isLinkedDocument(doc)).toBe(true);
    expect(isLinkedDocument({ ...doc, documentKind: 'bogus' })).toBe(false);
    expect(
      isLinkedDocument({ ...doc, openAction: { ...doc.openAction, resourceId: 'other' } }),
    ).toBe(false);
    expect(isLinkedDocument(null)).toBe(false);
    expect(isLinkedDocument(input)).toBe(false);
  });

  it('enforces account/project scope on document cards', () => {
    const doc = createLinkedDocument(docInput());
    expect(isLinkedInScope(doc, SCOPE)).toBe(true);
    expect(() => assertLinkedScope(doc, { projectId: 'other', ownerId: 'owner-1' })).toThrow(
      CanvasLinkedContentError,
    );
  });
});
