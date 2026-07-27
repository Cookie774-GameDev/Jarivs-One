import { describe, expect, it } from 'vitest';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withPlacement,
  type CanvasDocument,
} from './contracts';
import { CanvasCameraError, type CanvasViewport } from './camera';
import {
  CANVAS_SEARCH_LIMITS,
  DEFAULT_RESULT_LIMIT,
  MAX_RESULT_LIMIT,
  cameraForFocusTarget,
  createCanvasSearchIndex,
  parseCanvasSearchFocusTarget,
  parseCanvasSearchObject,
  parseCanvasSearchObjects,
  parseCanvasSearchQuery,
  projectCanvasDocumentForSearch,
  type CanvasSearchObjectInput,
} from './search';

const viewport: CanvasViewport = { width: 1200, height: 800 };
const T0 = 1_750_000_000_000;

function focus(x = 0, y = 0, width = 100, height = 80) {
  return { x, y, width, height };
}

function obj(overrides: Record<string, unknown> = {}): CanvasSearchObjectInput {
  return {
    id: 'obj-1',
    objectType: 'note',
    title: '',
    text: '',
    tags: [],
    frameId: null,
    linkedSource: null,
    status: null,
    databaseFields: {},
    focus: focus(),
    ...overrides,
  };
}

describe('canvas search focus target validation', () => {
  it('accepts finite bounds including point-like zero sizes', () => {
    expect(parseCanvasSearchFocusTarget({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(parseCanvasSearchFocusTarget({ x: -5, y: -6, width: 0, height: 0 })).toEqual({
      x: -5,
      y: -6,
      width: 0,
      height: 0,
    });
  });

  it.each([
    ['non-object', 'bounds'],
    ['nan coordinate', { x: Number.NaN, y: 0, width: 1, height: 1 }],
    ['infinite coordinate', { x: 0, y: Number.POSITIVE_INFINITY, width: 1, height: 1 }],
    ['negative width', { x: 0, y: 0, width: -1, height: 1 }],
    ['negative height', { x: 0, y: 0, width: 1, height: -1 }],
    ['oversized coordinate', { x: 1e12, y: 0, width: 1, height: 1 }],
    ['oversized size', { x: 0, y: 0, width: 1e12, height: 1 }],
    ['missing height', { x: 0, y: 0, width: 1 }],
  ])('fails closed for %s', (_label, value) => {
    expect(() => parseCanvasSearchFocusTarget(value)).toThrow(CanvasValidationError);
  });
});

describe('canvas search object validation', () => {
  it('normalizes case, tags, and database fields deterministically', () => {
    const parsed = parseCanvasSearchObject(
      obj({
        id: 'Obj-1',
        objectType: 'NOTE',
        title: '  My Title  ',
        text: 'Body Text',
        tags: ['Beta', 'alpha', 'alpha', 'ALPHA'],
        status: 'In Progress',
        linkedSource: '  https://Example.com/A  ',
        databaseFields: { Priority: 'High', Area: ' Search ' },
      }),
    );

    expect(parsed.id).toBe('Obj-1');
    expect(parsed.objectType).toBe('note');
    expect(parsed.title).toBe('My Title');
    expect(parsed.text).toBe('Body Text');
    expect(parsed.tags).toEqual(['alpha', 'beta']);
    expect(parsed.status).toBe('in progress');
    expect(parsed.linkedSource).toBe('https://Example.com/A');
    expect(parsed.databaseFields).toEqual({ area: 'Search', priority: 'High' });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.focus)).toBe(true);
  });

  it('applies deterministic defaults for optional fields', () => {
    const parsed = parseCanvasSearchObject({ id: 'a', objectType: 'frame', focus: focus() });
    expect(parsed.title).toBe('');
    expect(parsed.text).toBe('');
    expect(parsed.tags).toEqual([]);
    expect(parsed.frameId).toBeNull();
    expect(parsed.linkedSource).toBeNull();
    expect(parsed.status).toBeNull();
    expect(parsed.databaseFields).toEqual({});
  });

  it.each([
    ['bad id', obj({ id: '-nope' }), 'invalid-id'],
    ['bad object type', obj({ objectType: 'has space' }), 'unsupported-value'],
    ['oversized title', obj({ title: 'x'.repeat(201) }), 'unsupported-value'],
    ['non-string text', obj({ text: 42 }), 'invalid-type'],
    ['oversized text', obj({ text: 'x'.repeat(100_001) }), 'unsupported-value'],
    [
      'too many tags',
      obj({ tags: Array.from({ length: 65 }, (_v, i) => 'tag' + i) }),
      'unsupported-value',
    ],
    ['empty tag', obj({ tags: ['   '] }), 'unsupported-value'],
    ['tag with control char', obj({ tags: ['bad\u001f'] }), 'unsupported-value'],
    ['bad frame id', obj({ frameId: 'frame 1' }), 'invalid-id'],
    ['linked source control char', obj({ linkedSource: 'bad\u001f' }), 'unsupported-value'],
    ['linked source too long', obj({ linkedSource: 'x'.repeat(2049) }), 'unsupported-value'],
    [
      'too many database fields',
      obj({
        databaseFields: Object.fromEntries(Array.from({ length: 65 }, (_v, i) => ['k' + i, 'v'])),
      }),
      'unsupported-value',
    ],
    ['bad database field key', obj({ databaseFields: { 'bad key': 'v' } }), 'unsupported-value'],
    [
      'database value too long',
      obj({ databaseFields: { k: 'x'.repeat(1001) } }),
      'unsupported-value',
    ],
    ['missing focus', { id: 'a', objectType: 'note' }, 'invalid-type'],
    ['bad focus', obj({ focus: { x: 0, y: 0, width: -1, height: 1 } }), 'invalid-number'],
  ])('fails closed for %s', (_label, value, code) => {
    expect(() => parseCanvasSearchObject(value)).toThrow(CanvasValidationError);
    try {
      parseCanvasSearchObject(value);
    } catch (error) {
      expect((error as CanvasValidationError).code).toBe(code);
    }
  });
});

describe('canvas search object batch parsing', () => {
  it('parses a batch and rejects duplicate ids', () => {
    const parsed = parseCanvasSearchObjects([obj({ id: 'a' }), obj({ id: 'b' })]);
    expect(parsed.map((item) => item.id)).toEqual(['a', 'b']);
    expect(() => parseCanvasSearchObjects([obj({ id: 'a' }), obj({ id: 'a' })])).toThrow(
      CanvasValidationError,
    );
    expect(() => parseCanvasSearchObjects([obj({ id: 'a' }), obj({ id: 'a' })])).toThrow(
      /duplicate-id|duplicate block id|duplicate/i,
    );
  });

  it('exposes the bounded index capacity', () => {
    expect(CANVAS_SEARCH_LIMITS.maxObjects).toBeGreaterThan(0);
  });
});

describe('canvas search query validation', () => {
  it('defaults the result limit', () => {
    expect(parseCanvasSearchQuery({}).limit).toBe(DEFAULT_RESULT_LIMIT);
    expect(DEFAULT_RESULT_LIMIT).toBe(50);
    expect(MAX_RESULT_LIMIT).toBe(200);
  });

  it('normalizes filter casing and tokenizes text', () => {
    const query = parseCanvasSearchQuery({
      text: '  Hello,  World!  ',
      objectType: 'NOTE',
      tag: 'ALPHA',
      status: 'DONE',
    });
    expect(query.tokens).toEqual(['hello', 'world']);
    expect(query.objectType).toBe('note');
    expect(query.tag).toBe('alpha');
    expect(query.status).toBe('done');
  });

  it.each([
    ['limit zero', { limit: 0 }],
    ['limit too large', { limit: 201 }],
    ['non-integer limit', { limit: 1.5 }],
    ['unknown key', { bogus: true }],
    ['tokenless text', { text: '!!!' }],
    ['oversized text', { text: 'x'.repeat(1001) }],
    ['bad object type', { objectType: 'has space' }],
    ['bad frame id', { frameId: 'frame 1' }],
    ['bad database field', { databaseField: { field: 'bad key' } }],
  ])('fails closed for %s', (_label, value) => {
    expect(() => parseCanvasSearchQuery(value)).toThrow(CanvasValidationError);
  });
});

describe('canvas search filtering', () => {
  const objects: CanvasSearchObjectInput[] = [
    obj({ id: 'doc', objectType: 'document', title: 'Roadmap', text: 'Roadmap' }),
    obj({
      id: 'note-1',
      objectType: 'note',
      title: 'Alpha',
      text: 'common body',
      tags: ['planning'],
    }),
    obj({
      id: 'note-2',
      objectType: 'note',
      title: 'Beta',
      text: 'other body',
      tags: ['review'],
      status: 'done',
      frameId: 'frame-1',
      linkedSource: 'https://Example.com/A',
      databaseFields: { Priority: 'High' },
    }),
  ];

  it('matches free text across title, text, and tags case-insensitively', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ text: 'alpha' }).map((r) => r.object.id)).toEqual(['note-1']);
    expect(
      index
        .query({ text: 'BODY' })
        .map((r) => r.object.id)
        .sort(),
    ).toEqual(['note-1', 'note-2']);
    expect(index.query({ text: 'planning' }).map((r) => r.object.id)).toEqual(['note-1']);
  });

  it('filters by object type case-insensitively', () => {
    const index = createCanvasSearchIndex(objects);
    expect(
      index
        .query({ objectType: 'NOTE' })
        .map((r) => r.object.id)
        .sort(),
    ).toEqual(['note-1', 'note-2']);
  });

  it('filters by tag membership case-insensitively', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ tag: 'REVIEW' }).map((r) => r.object.id)).toEqual(['note-2']);
  });

  it('filters by frame id exactly', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ frameId: 'frame-1' }).map((r) => r.object.id)).toEqual(['note-2']);
    expect(index.query({ frameId: 'frame-2' })).toEqual([]);
  });

  it('filters by linked source case-insensitively', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ linkedSource: 'https://example.com/a' }).map((r) => r.object.id)).toEqual([
      'note-2',
    ]);
  });

  it('filters by status case-insensitively', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ status: 'DONE' }).map((r) => r.object.id)).toEqual(['note-2']);
  });

  it('filters by database field presence and value', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ databaseField: { field: 'priority' } }).map((r) => r.object.id)).toEqual([
      'note-2',
    ]);
    expect(
      index.query({ databaseField: { field: 'PRIORITY', value: 'high' } }).map((r) => r.object.id),
    ).toEqual(['note-2']);
    expect(index.query({ databaseField: { field: 'missing' } })).toEqual([]);
  });

  it('combines filters with AND semantics', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({ text: 'body', status: 'done' }).map((r) => r.object.id)).toEqual([
      'note-2',
    ]);
    expect(index.query({ text: 'body', status: 'todo' })).toEqual([]);
  });

  it('returns every object bounded by limit when no filter is given', () => {
    const index = createCanvasSearchIndex(objects);
    expect(index.query({}).length).toBe(3);
    expect(index.query({ limit: 2 }).length).toBe(2);
  });
});

describe('canvas search ranking and determinism', () => {
  it('ranks title matches above tag matches above body matches', () => {
    const index = createCanvasSearchIndex([
      obj({ id: 'x', title: 'unrelated', text: 'has widget inside' }),
      obj({ id: 'g', title: 'unrelated', text: 'unrelated', tags: ['widget'] }),
      obj({ id: 't', title: 'Widget', text: 'unrelated' }),
    ]);
    expect(index.query({ text: 'widget' }).map((r) => r.object.id)).toEqual(['t', 'g', 'x']);
  });

  it('produces identical ordering across instances and repeated calls', () => {
    const input = [
      obj({ id: 'm', title: 'Match', text: 'zeta' }),
      obj({ id: 'a', title: 'Match', text: 'alpha' }),
      obj({ id: 'z', title: 'aaa', text: 'match' }),
    ];
    const first = createCanvasSearchIndex(input).query({ text: 'match' });
    const second = createCanvasSearchIndex(input).query({ text: 'match' });
    const index = createCanvasSearchIndex(input);
    expect(index.query({ text: 'match' })).toEqual(first);
    expect(second).toEqual(first);
  });

  it('breaks ties by normalized title then id', () => {
    const byTitle = createCanvasSearchIndex([
      obj({ id: 'b', title: 'Zeta', text: 'match' }),
      obj({ id: 'a', title: 'Alpha', text: 'match' }),
    ]);
    expect(byTitle.query({ text: 'match' }).map((r) => r.object.id)).toEqual(['a', 'b']);

    const byId = createCanvasSearchIndex([
      obj({ id: 'b', title: 'Same', text: 'match' }),
      obj({ id: 'a', title: 'Same', text: 'match' }),
    ]);
    expect(byId.query({ text: 'match' }).map((r) => r.object.id)).toEqual(['a', 'b']);
  });
});

describe('canvas search focus targets and camera', () => {
  it('attaches a validated focus target to every result', () => {
    const index = createCanvasSearchIndex([
      obj({ id: 'a', title: 'Hello', focus: focus(10, 20, 30, 40) }),
    ]);
    const results = index.query({ text: 'hello' });
    expect(results[0].focus).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(Object.isFrozen(results[0].focus)).toBe(true);
    expect(results[0].focus).toBe(results[0].object.focus);
  });

  it('derives a camera that fits the focus target', () => {
    const camera = cameraForFocusTarget(focus(0, 0, 400, 200), viewport, 100);
    expect(Number.isFinite(camera.x)).toBe(true);
    expect(Number.isFinite(camera.y)).toBe(true);
    expect(camera.zoom).toBeGreaterThanOrEqual(CANVAS_MIN_ZOOM);
    expect(camera.zoom).toBeLessThanOrEqual(CANVAS_MAX_ZOOM);
    expect(cameraForFocusTarget(focus(7, 9, 0, 0), viewport).zoom).toBe(CANVAS_MAX_ZOOM);
  });

  it('fails closed for invalid focus or viewport', () => {
    expect(() => cameraForFocusTarget({ x: 0, y: 0, width: -1, height: 1 }, viewport)).toThrow(
      CanvasValidationError,
    );
    expect(() => cameraForFocusTarget(focus(0, 0, 10, 10), { width: 0, height: 0 })).toThrow(
      CanvasCameraError,
    );
  });
});

describe('global canvas document search projection', () => {
  function projectionDoc(): CanvasDocument {
    let doc = createCanvasDocument({
      id: 'doc-1',
      projectId: 'project-1',
      ownerId: 'owner-1',
      title: 'Roadmap',
      now: T0,
      icon: 'rocket',
      thumbnail: 'data:image/png;base64,SECRET',
    });
    doc = withBlockAdded(
      doc,
      createCanvasBlock({
        id: 'blk-a',
        content: { kind: 'heading', level: 1, text: 'Alpha heading' },
        now: T0,
      }),
      T0,
    );
    doc = withBlockAdded(
      doc,
      createCanvasBlock({
        id: 'blk-b',
        content: { kind: 'text', text: 'Beta body text' },
        now: T0,
      }),
      T0,
    );
    doc = withPlacement(doc, { blockId: 'blk-a', x: 10, y: 20, width: 200, height: 100 }, T0);
    doc = withPlacement(doc, { blockId: 'blk-b', x: 300, y: 400, width: 200, height: 100 }, T0);
    return doc;
  }

  it('projects the title and each block as searchable objects with focus targets', () => {
    const projection = projectCanvasDocumentForSearch(projectionDoc());
    expect(projection.documentId).toBe('doc-1');
    expect(projection.title).toBe('Roadmap');
    expect(projection.objects.length).toBe(3);

    const titleObject = projection.objects.find((item) => item.objectType === 'document');
    expect(titleObject?.text).toBe('Roadmap');
    expect(titleObject?.focus).toEqual({ x: 10, y: 20, width: 490, height: 480 });

    const heading = projection.objects.find((item) => item.id === 'blk-a');
    expect(heading?.objectType).toBe('heading');
    expect(heading?.text).toBe('Alpha heading');
    expect(heading?.focus).toEqual({ x: 10, y: 20, width: 200, height: 100 });

    const body = projection.objects.find((item) => item.id === 'blk-b');
    expect(body?.objectType).toBe('text');
    expect(body?.text).toBe('Beta body text');
    expect(body?.focus).toEqual({ x: 300, y: 400, width: 200, height: 100 });
  });

  it('does not leak binary or private payloads', () => {
    const json = JSON.stringify(projectCanvasDocumentForSearch(projectionDoc()));
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('thumbnail');
    expect(json).not.toContain('icon');
    expect(json).not.toContain('camera');
  });

  it('makes canvas titles and content globally searchable with a zoomable focus', () => {
    const projection = projectCanvasDocumentForSearch(projectionDoc());
    const index = createCanvasSearchIndex(projection.objects);

    const byTitle = index.query({ text: 'roadmap' });
    expect(byTitle[0].object.objectType).toBe('document');

    const byContent = index.query({ text: 'beta' });
    expect(byContent[0].object.id).toBe('blk-b');

    for (const result of [...byTitle, ...byContent]) {
      const camera = cameraForFocusTarget(result.focus, viewport);
      expect(Number.isFinite(camera.zoom)).toBe(true);
    }
  });

  it('keeps projected object ids unique even when a block shares the document id', () => {
    let doc = createCanvasDocument({
      id: 'doc-x',
      projectId: 'project-1',
      ownerId: 'owner-1',
      title: 'T',
      now: T0,
    });
    doc = withBlockAdded(
      doc,
      createCanvasBlock({ id: 'doc-x', content: { kind: 'text', text: 'same id' }, now: T0 }),
      T0,
    );
    const projection = projectCanvasDocumentForSearch(doc);
    const ids = projection.objects.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
