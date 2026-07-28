import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  isCanvasDocument,
  parseCanvasDocument,
  withBlockAdded,
  withPlacement,
  withPresentationNote,
  withPresentationOrder,
  type CanvasDocument,
  type CanvasValidationErrorCode,
} from './contracts';
import { createMindMap, validateMindMap } from './mindmaps';
import {
  BUILT_IN_CANVAS_TEMPLATE_IDS,
  CANVAS_TEMPLATE_PREVIEW_MAX_BLOCKS,
  createCustomCanvasTemplateStore,
  deleteCustomTemplate,
  duplicateCustomTemplate,
  getBuiltInCanvasTemplate,
  getCustomTemplate,
  instantiateCanvasTemplate,
  instantiateCustomTemplate,
  listBuiltInCanvasTemplates,
  listCustomTemplates,
  previewCustomTemplate,
  renameCustomTemplate,
  saveCanvasDocumentAsTemplate,
  type CustomCanvasTemplateStore,
} from './templates';

const T0 = 1_750_000_000_000;
const T1 = T0 + 60_000;
const T2 = T0 + 120_000;

function expectCanvasError(
  fn: () => unknown,
  code: CanvasValidationErrorCode,
): CanvasValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasValidationError);
    const validationError = error as CanvasValidationError;
    expect(validationError.code).toBe(code);
    return validationError;
  }
  throw new Error(`expected CanvasValidationError(${code}) but nothing was thrown`);
}

function toUnknown(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function instantiateBuiltIn(id: string, documentId = 'canvas-new'): CanvasDocument {
  const template = getBuiltInCanvasTemplate(id);
  return instantiateCanvasTemplate(template, {
    documentId,
    projectId: 'project-new',
    ownerId: 'owner-new',
    now: T1,
  });
}

function sourceDoc(ownerId = 'owner-a', projectId = 'proj-a'): CanvasDocument {
  let doc = createCanvasDocument({
    id: 'src-doc',
    projectId,
    ownerId,
    title: 'Source',
    layoutMode: 'edgeless',
    now: T0,
  });
  doc = withBlockAdded(
    doc,
    createCanvasBlock({
      id: 'src-b1',
      content: { kind: 'heading', level: 1, text: 'Title' },
      now: T0,
    }),
    T0,
  );
  doc = withBlockAdded(
    doc,
    createCanvasBlock({ id: 'src-b2', content: { kind: 'note', text: 'First' }, now: T0 }),
    T0,
  );
  doc = withBlockAdded(
    doc,
    createCanvasBlock({ id: 'src-b3', content: { kind: 'note', text: 'Second' }, now: T0 }),
    T0,
  );
  doc = withPlacement(doc, { blockId: 'src-b1', x: 0, y: 0, width: 300, height: 180 }, T0);
  doc = withPlacement(doc, { blockId: 'src-b2', x: 360, y: 0, width: 300, height: 180 }, T0);
  doc = withPresentationOrder(doc, ['src-b1', 'src-b2', 'src-b3'], T0);
  doc = withPresentationNote(doc, 'src-b2', 'Speaker note', T0);
  return doc;
}

function saveSource(store: CustomCanvasTemplateStore, templateId = 'tpl-1', now = T1) {
  return saveCanvasDocumentAsTemplate(store, {
    source: sourceDoc(),
    templateId,
    ownerId: 'owner-a',
    projectId: 'proj-a',
    now,
  });
}

describe('Canvas built-in templates', () => {
  it('lists exactly the fifteen required built-in families in order', () => {
    expect(BUILT_IN_CANVAS_TEMPLATE_IDS).toEqual([
      'blank',
      'project-planner',
      'product-roadmap',
      'software-architecture',
      'system-design',
      'user-journey',
      'mind-map',
      'concept-map',
      'storyboard',
      'cornell-notes',
      'research-board',
      'launch-checklist',
      'calendar-planner',
      'content-tracker',
      'presentation-outline',
    ]);
    expect(listBuiltInCanvasTemplates()).toHaveLength(15);
    expect(listBuiltInCanvasTemplates().map((template) => template.id)).toEqual(
      BUILT_IN_CANVAS_TEMPLATE_IDS,
    );
  });

  it('instantiates every built-in into a valid real canvas document', () => {
    for (const template of listBuiltInCanvasTemplates()) {
      const doc = instantiateCanvasTemplate(template, {
        documentId: 'canvas-new',
        projectId: 'project-new',
        ownerId: 'owner-new',
        now: T1,
      });
      expect(isCanvasDocument(doc), `${template.id} should be a valid document`).toBe(true);
      expect(parseCanvasDocument(toUnknown(doc))).toEqual(doc);
      expect(doc.blocks).toHaveLength(template.blocks.length);
      expect(doc.title).toBe(template.title);
      expect(doc.layoutMode).toBe(template.layoutMode);
      expect(doc.createdAt).toBe(T1);
      expect(doc.updatedAt).toBe(T1);
      expect(doc.presentationOrder).toHaveLength(template.presentationFrameIndices.length);
    }
  });

  it('gives non-blank built-ins real content blocks while blank stays empty', () => {
    const templates = listBuiltInCanvasTemplates();
    expect(templates.find((template) => template.id === 'blank')?.blocks).toHaveLength(0);
    expect(
      templates
        .filter((template) => template.id !== 'blank')
        .every((template) => template.blocks.length > 0),
    ).toBe(true);
  });

  it('places every block in edgeless built-ins and none in page built-ins', () => {
    for (const template of listBuiltInCanvasTemplates()) {
      const doc = instantiateBuiltIn(template.id);
      if (template.layoutMode === 'edgeless') {
        expect(doc.placements.map((placement) => placement.blockId)).toEqual(
          doc.blocks.map((block) => block.id),
        );
      } else {
        expect(doc.placements).toHaveLength(0);
      }
    }
  });

  it('populates presentation order only where appropriate', () => {
    const outline = instantiateBuiltIn('presentation-outline');
    expect(outline.presentationOrder).toEqual(outline.blocks.map((block) => block.id));

    const storyboard = instantiateBuiltIn('storyboard');
    expect(storyboard.presentationOrder.length).toBeGreaterThan(0);
    expect(storyboard.presentationOrder.length).toBeLessThan(storyboard.blocks.length + 1);

    const planner = instantiateBuiltIn('project-planner');
    expect(planner.presentationOrder).toHaveLength(0);
  });

  it('instantiates the mind-map built-in with a real mind-map block', () => {
    const doc = instantiateBuiltIn('mind-map');
    const mindMapBlock = doc.blocks.find((block) => block.content.kind === 'mind-map');
    expect(mindMapBlock).toBeDefined();
    if (mindMapBlock && mindMapBlock.content.kind === 'mind-map') {
      const map = mindMapBlock.content.map;
      expect(() => validateMindMap(toUnknown(map))).not.toThrow();
    }
  });

  it('resolves built-ins by id and fails closed on unknown ids', () => {
    expect(getBuiltInCanvasTemplate('software-architecture').title).toBe('Software architecture');
    expectCanvasError(() => getBuiltInCanvasTemplate('nope'), 'invalid-reference');
  });

  it('is deterministic for identical inputs', () => {
    const a = instantiateBuiltIn('product-roadmap', 'canvas-a');
    const b = instantiateBuiltIn('product-roadmap', 'canvas-a');
    expect(toUnknown(a)).toEqual(toUnknown(b));
  });

  it('validates instantiation inputs fail-closed', () => {
    const template = getBuiltInCanvasTemplate('blank');
    expectCanvasError(
      () =>
        instantiateCanvasTemplate(template, {
          documentId: 'bad id',
          projectId: 'p',
          ownerId: 'o',
          now: T1,
        }),
      'invalid-id',
    );
    expectCanvasError(
      () =>
        instantiateCanvasTemplate(template, {
          documentId: 'd',
          projectId: 'p',
          ownerId: 'o',
          now: -1,
        }),
      'invalid-timestamp',
    );
  });
});

describe('Canvas custom template lifecycle', () => {
  it('saves the current canvas document as a scoped template without mutating it', () => {
    const source = sourceDoc();
    const store = createCustomCanvasTemplateStore();
    const result = saveCanvasDocumentAsTemplate(store, {
      source,
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T1,
    });

    expect(result.template).toMatchObject({
      id: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      title: 'Source',
      createdAt: T1,
      updatedAt: T1,
    });
    expect(result.store.templates).toHaveLength(1);
    expect(store.templates).toHaveLength(0);
    expect(Object.isFrozen(result.store)).toBe(true);
    expect(Object.isFrozen(result.template)).toBe(true);
    expect(Object.isFrozen(result.template.snapshot)).toBe(true);
    // Source document is untouched.
    expect(source.blocks.map((block) => block.id)).toEqual(['src-b1', 'src-b2', 'src-b3']);
    expect(Object.isFrozen(source)).toBe(true);
  });

  it('preserves content semantics in the snapshot', () => {
    const { template } = saveSource(createCustomCanvasTemplateStore());
    const snapshot = template.snapshot;
    expect(snapshot.layoutMode).toBe('edgeless');
    expect(snapshot.blocks.map((block) => block.content)).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'note', text: 'First' },
      { kind: 'note', text: 'Second' },
    ]);
    expect(snapshot.blocks[0]?.placement).toMatchObject({ x: 0, y: 0, width: 300, height: 180 });
    expect(snapshot.blocks[1]?.placement).toMatchObject({ x: 360, y: 0, width: 300, height: 180 });
    expect(snapshot.blocks[2]?.placement).toBeUndefined();
    expect(snapshot.presentationFrameIndices).toEqual([0, 1, 2]);
    expect(snapshot.presentationNotes).toEqual([{ frameIndex: 1, text: 'Speaker note' }]);
  });

  it('instantiates a custom template into a new document with fresh identity', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const doc = instantiateCustomTemplate(store, {
      templateId: 'tpl-1',
      documentId: 'new-doc',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T2,
    });

    expect(isCanvasDocument(doc)).toBe(true);
    expect(doc).toMatchObject({
      id: 'new-doc',
      projectId: 'proj-a',
      ownerId: 'owner-a',
      title: 'Source',
      layoutMode: 'edgeless',
      createdAt: T2,
      updatedAt: T2,
    });
    expect(doc.blocks.map((block) => block.id)).toEqual([
      'new-doc-block-1',
      'new-doc-block-2',
      'new-doc-block-3',
    ]);
    expect(doc.blocks.map((block) => block.content)).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'note', text: 'First' },
      { kind: 'note', text: 'Second' },
    ]);
    expect(doc.placements.map((placement) => placement.blockId)).toEqual([
      'new-doc-block-1',
      'new-doc-block-2',
    ]);
    expect(doc.presentationOrder).toEqual([
      'new-doc-block-1',
      'new-doc-block-2',
      'new-doc-block-3',
    ]);
    expect(doc.presentationNotes).toEqual([{ frameId: 'new-doc-block-2', text: 'Speaker note' }]);
  });

  it('preserves mind-map block content when instantiating', () => {
    const map = createMindMap({ id: 'map-src', rootId: 'root-src', label: 'Idea', now: T0 });
    let source = createCanvasDocument({
      id: 'src-mm-doc',
      projectId: 'proj-a',
      ownerId: 'owner-a',
      title: 'Map source',
      now: T0,
    });
    source = withBlockAdded(
      source,
      createCanvasBlock({ id: 'src-mm', content: { kind: 'mind-map', map }, now: T0 }),
      T0,
    );
    const { store } = saveCanvasDocumentAsTemplate(createCustomCanvasTemplateStore(), {
      source,
      templateId: 'tpl-mm',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T1,
    });
    const doc = instantiateCustomTemplate(store, {
      templateId: 'tpl-mm',
      documentId: 'new-mm-doc',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T2,
    });
    const block = doc.blocks[0];
    expect(block?.content.kind).toBe('mind-map');
    if (block && block.content.kind === 'mind-map') {
      const map = block.content.map;
      expect(() => validateMindMap(toUnknown(map))).not.toThrow();
      expect(toUnknown(block.content)).toEqual(toUnknown(source.blocks[0]?.content));
    }
  });

  it('does not mutate the saved template or store on instantiate', () => {
    const { store, template } = saveSource(createCustomCanvasTemplateStore());
    const before = toUnknown(store);
    instantiateCustomTemplate(store, {
      templateId: 'tpl-1',
      documentId: 'new-doc',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T2,
    });
    expect(toUnknown(store)).toEqual(before);
    expect(template.snapshot.blocks).toHaveLength(3);
  });

  it('duplicates a template with fresh timestamps and the same content', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const result = duplicateCustomTemplate(store, {
      templateId: 'tpl-1',
      newTemplateId: 'tpl-2',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T2,
    });
    expect(result.store.templates).toHaveLength(2);
    expect(result.template).toMatchObject({
      id: 'tpl-2',
      title: 'Source',
      createdAt: T2,
      updatedAt: T2,
    });
    expect(result.template.snapshot).toEqual(store.templates[0]?.snapshot);
    expect(store.templates).toHaveLength(1);
  });

  it('renames a template and bumps updatedAt', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const result = renameCustomTemplate(store, {
      templateId: 'tpl-1',
      title: 'Renamed',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      now: T2,
    });
    expect(result.template).toMatchObject({ id: 'tpl-1', title: 'Renamed', updatedAt: T2 });
    expect(result.store.templates).toHaveLength(1);
    expect(store.templates[0]?.title).toBe('Source');
  });

  it('produces a bounded preview without identity or layout metadata', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const preview = previewCustomTemplate(store, {
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
    });
    expect(Object.keys(preview).sort()).toEqual(
      ['blockCount', 'blocks', 'id', 'layoutMode', 'title'].sort(),
    );
    expect(preview).toMatchObject({
      id: 'tpl-1',
      title: 'Source',
      layoutMode: 'edgeless',
      blockCount: 3,
    });
    expect(preview.blocks).toHaveLength(3);
    expect(preview.blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Title' });

    const bounded = previewCustomTemplate(store, {
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
      maxBlocks: 2,
    });
    expect(bounded.blocks).toHaveLength(2);
    expect(bounded.blockCount).toBe(3);
  });

  it('deletes a template', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const result = deleteCustomTemplate(store, {
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
    });
    expect(result.store.templates).toHaveLength(0);
    expect(store.templates).toHaveLength(1);
  });

  it('lists and gets only in-scope templates', () => {
    let store = createCustomCanvasTemplateStore();
    store = saveSource(store, 'tpl-1').store;
    store = saveSource(store, 'tpl-2').store;
    expect(listCustomTemplates(store, { ownerId: 'owner-a', projectId: 'proj-a' })).toHaveLength(2);
    expect(listCustomTemplates(store, { ownerId: 'owner-b', projectId: 'proj-a' })).toHaveLength(0);
    expect(
      getCustomTemplate(store, { templateId: 'tpl-1', ownerId: 'owner-a', projectId: 'proj-a' }).id,
    ).toBe('tpl-1');
  });
});

describe('Canvas custom template validation and isolation', () => {
  it('fails closed on duplicate template id within a scope', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    expectCanvasError(() => saveSource(store, 'tpl-1'), 'duplicate-id');
  });

  it('allows the same id across different projects and owners', () => {
    let store = createCustomCanvasTemplateStore();
    store = saveSource(store, 'tpl-1').store;
    const otherProject = saveCanvasDocumentAsTemplate(store, {
      source: sourceDoc('owner-a', 'proj-b'),
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-b',
      now: T1,
    });
    expect(otherProject.store.templates).toHaveLength(2);
    const otherOwner = saveCanvasDocumentAsTemplate(store, {
      source: sourceDoc('owner-b', 'proj-a'),
      templateId: 'tpl-1',
      ownerId: 'owner-b',
      projectId: 'proj-a',
      now: T1,
    });
    expect(otherOwner.store.templates).toHaveLength(2);
  });

  it('fails closed on invalid identifiers', () => {
    const store = createCustomCanvasTemplateStore();
    expectCanvasError(() => saveSource(store, 'bad id!'), 'invalid-id');
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner bad',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-id',
    );
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner-a',
          projectId: 'proj bad',
          now: T1,
        }),
      'invalid-id',
    );
    const { store: saved } = saveSource(store);
    expectCanvasError(
      () =>
        instantiateCustomTemplate(saved, {
          templateId: 'tpl-1',
          documentId: 'bad doc',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-id',
    );
  });

  it('fails closed on invalid timestamps and titles', () => {
    const store = createCustomCanvasTemplateStore();
    expectCanvasError(() => saveSource(store, 'tpl-1', -1), 'invalid-timestamp');
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          title: 'bad\u0001title',
          now: T1,
        }),
      'unsupported-value',
    );
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          title: 'x'.repeat(201),
          now: T1,
        }),
      'unsupported-value',
    );
  });

  it('fails closed on a malformed source document', () => {
    const store = createCustomCanvasTemplateStore();
    const malformed = { not: 'a document' } as unknown as CanvasDocument;
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: malformed,
          templateId: 'tpl-1',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-type',
    );
  });

  it('fails closed when the source document belongs to another account or project', () => {
    const store = createCustomCanvasTemplateStore();
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner-b',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        saveCanvasDocumentAsTemplate(store, {
          source: sourceDoc(),
          templateId: 'tpl-1',
          ownerId: 'owner-a',
          projectId: 'proj-b',
          now: T1,
        }),
      'invalid-reference',
    );
  });

  it('validates persisted stores and malformed snapshots fail closed', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const malformed = toUnknown(store) as CustomCanvasTemplateStore;
    (malformed.templates[0]!.snapshot.presentationFrameIndices as unknown as number[])[0] = 99;

    expectCanvasError(
      () =>
        instantiateCustomTemplate(malformed, {
          templateId: 'tpl-1',
          documentId: 'new-doc',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T2,
        }),
      'invalid-reference',
    );

    const unexpectedField = toUnknown(store) as CustomCanvasTemplateStore & {
      unexpected?: boolean;
    };
    unexpectedField.unexpected = true;
    expectCanvasError(
      () => listCustomTemplates(unexpectedField, { ownerId: 'owner-a', projectId: 'proj-a' }),
      'unsupported-value',
    );
  });

  it('normalizes persisted stores without freezing caller-owned input', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const mutable = toUnknown(store) as CustomCanvasTemplateStore;
    const mutableContent = mutable.templates[0]!.snapshot.blocks[0]!.content;

    const preview = previewCustomTemplate(mutable, {
      templateId: 'tpl-1',
      ownerId: 'owner-a',
      projectId: 'proj-a',
    });

    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.blocks[0])).toBe(true);
    expect(Object.isFrozen(mutable)).toBe(false);
    expect(Object.isFrozen(mutable.templates)).toBe(false);
    expect(Object.isFrozen(mutableContent)).toBe(false);
  });

  it('rejects template timestamp rollback', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    expectCanvasError(
      () =>
        renameCustomTemplate(store, {
          templateId: 'tpl-1',
          title: 'Older update',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T0,
        }),
      'invalid-timestamp',
    );
  });

  it('fails closed on missing templates and isolated scopes', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    expectCanvasError(
      () =>
        instantiateCustomTemplate(store, {
          templateId: 'missing',
          documentId: 'new-doc',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-reference',
    );
    // Cross-owner isolation.
    expectCanvasError(
      () =>
        instantiateCustomTemplate(store, {
          templateId: 'tpl-1',
          documentId: 'new-doc',
          ownerId: 'owner-b',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-reference',
    );
    // Cross-project isolation.
    expectCanvasError(
      () =>
        instantiateCustomTemplate(store, {
          templateId: 'tpl-1',
          documentId: 'new-doc',
          ownerId: 'owner-a',
          projectId: 'proj-b',
          now: T1,
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        renameCustomTemplate(store, {
          templateId: 'missing',
          title: 'x',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        deleteCustomTemplate(store, {
          templateId: 'missing',
          ownerId: 'owner-a',
          projectId: 'proj-a',
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        previewCustomTemplate(store, {
          templateId: 'missing',
          ownerId: 'owner-a',
          projectId: 'proj-a',
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        getCustomTemplate(store, {
          templateId: 'missing',
          ownerId: 'owner-a',
          projectId: 'proj-a',
        }),
      'invalid-reference',
    );
    expectCanvasError(
      () =>
        duplicateCustomTemplate(store, {
          templateId: 'missing',
          newTemplateId: 'tpl-2',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T1,
        }),
      'invalid-reference',
    );
  });

  it('fails closed on duplicate target ids when duplicating', () => {
    let store = createCustomCanvasTemplateStore();
    store = saveSource(store, 'tpl-1').store;
    store = saveSource(store, 'tpl-2').store;
    expectCanvasError(
      () =>
        duplicateCustomTemplate(store, {
          templateId: 'tpl-1',
          newTemplateId: 'tpl-2',
          ownerId: 'owner-a',
          projectId: 'proj-a',
          now: T2,
        }),
      'duplicate-id',
    );
  });

  it('enforces preview bounds', () => {
    const { store } = saveSource(createCustomCanvasTemplateStore());
    const base = { templateId: 'tpl-1', ownerId: 'owner-a', projectId: 'proj-a' } as const;
    expectCanvasError(
      () => previewCustomTemplate(store, { ...base, maxBlocks: 0 }),
      'invalid-number',
    );
    expectCanvasError(
      () => previewCustomTemplate(store, { ...base, maxBlocks: -2 }),
      'invalid-number',
    );
    expectCanvasError(
      () => previewCustomTemplate(store, { ...base, maxBlocks: 1.5 }),
      'invalid-number',
    );
    expectCanvasError(
      () =>
        previewCustomTemplate(store, {
          ...base,
          maxBlocks: CANVAS_TEMPLATE_PREVIEW_MAX_BLOCKS + 1,
        }),
      'invalid-number',
    );
  });
});
