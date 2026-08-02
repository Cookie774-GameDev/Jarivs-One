/**
 * Infinite Idea Canvas template domain.
 *
 * Framework-agnostic, deterministic, side-effect-free templates for the shared
 * canvas document model. Built-in templates are immutable recipes that
 * instantiate real `CanvasDocument` objects through the canonical contracts
 * factories (real blocks, edgeless placements, and presentation order as
 * appropriate). Custom templates are account/project-scoped, immutable
 * snapshots of an existing document's content semantics; they can be saved,
 * duplicated, renamed, previewed within bounds, deleted, and instantiated into
 * a brand-new document carrying fresh identifiers and timestamps while never
 * mutating the source. Every entry point validates its inputs and fails closed
 * with a `CanvasValidationError`; all returned values are deeply frozen.
 */

import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  CANVAS_MAX_TITLE_LENGTH,
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  pageOrderedBlocks,
  parseCanvasBlockId,
  parseCanvasDocument,
  withBlockAdded,
  withPlacement,
  withPresentationNote,
  withPresentationOrder,
  type CanvasBackground,
  type CanvasBlockContent,
  type CanvasDocument,
  type CanvasLayoutMode,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasSpatialPlacement,
  type CanvasTimestamp,
} from './contracts';
import { createMindMap } from './mindmaps';

// ---------------------------------------------------------------------------
// Built-in template recipes
// ---------------------------------------------------------------------------

export const BUILT_IN_CANVAS_TEMPLATE_IDS = [
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
] as const;

export type BuiltInCanvasTemplateId = (typeof BUILT_IN_CANVAS_TEMPLATE_IDS)[number];

export interface CanvasTemplateBlock {
  /** Static block content; ignored when `mindMapLabel` synthesizes a mind map. */
  readonly content: CanvasBlockContent;
  /** When set, instantiation synthesizes a fresh mind-map block from this label. */
  readonly mindMapLabel?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CanvasTemplate {
  readonly id: BuiltInCanvasTemplateId;
  readonly title: string;
  readonly layoutMode: CanvasLayoutMode;
  readonly background: CanvasBackground;
  readonly blocks: readonly CanvasTemplateBlock[];
  /** Indices into `blocks` that form the presentation order, when appropriate. */
  readonly presentationFrameIndices: readonly number[];
}

export interface InstantiateCanvasTemplateInput {
  readonly documentId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly now: number;
}

// ---------------------------------------------------------------------------
// Custom template snapshots and store
// ---------------------------------------------------------------------------

export interface CanvasTemplateSnapshotPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly z: number;
  readonly locked: boolean;
  readonly hidden: boolean;
}

export interface CanvasTemplateSnapshotBlock {
  readonly content: CanvasBlockContent;
  readonly placement?: CanvasTemplateSnapshotPlacement;
}

export interface CanvasTemplateSnapshotNote {
  readonly frameIndex: number;
  readonly text: string;
}

/**
 * Identity-free content semantics of a saved document: block contents in page
 * order, optional edgeless geometry, and presentation structure expressed as
 * block indices so a fresh document can be rebuilt with brand-new identifiers.
 */
export interface CanvasTemplateSnapshot {
  readonly layoutMode: CanvasLayoutMode;
  readonly background: CanvasBackground;
  readonly blocks: readonly CanvasTemplateSnapshotBlock[];
  readonly presentationFrameIndices: readonly number[];
  readonly presentationNotes: readonly CanvasTemplateSnapshotNote[];
}

export interface CustomCanvasTemplate {
  readonly id: string;
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
  readonly title: string;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
  readonly snapshot: CanvasTemplateSnapshot;
}

export interface CustomCanvasTemplateStore {
  readonly templates: readonly CustomCanvasTemplate[];
}

export interface CanvasTemplatePreview {
  readonly id: string;
  readonly title: string;
  readonly layoutMode: CanvasLayoutMode;
  readonly blockCount: number;
  readonly blocks: readonly CanvasBlockContent[];
}

/** Inclusive upper bound for bounded template previews. */
export const CANVAS_TEMPLATE_PREVIEW_MAX_BLOCKS = 12;

const DEFAULT_PREVIEW_BLOCKS = 8;

// ---------------------------------------------------------------------------
// Validation and immutable helpers (mirror the contracts fail-closed style)
// ---------------------------------------------------------------------------

const CONTROL_CHAR_PATTERN = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']',
);

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertObjectShape(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  required: ReadonlySet<string> = allowed,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new CanvasValidationError('invalid-type', path, 'expected a plain object');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new CanvasValidationError(
        'unsupported-value',
        `${path}.${key}`,
        `unexpected field "${key}"`,
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new CanvasValidationError(
        'invalid-type',
        `${path}.${key}`,
        'required field is missing',
      );
    }
  }
  return value;
}

function assertArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CanvasValidationError('invalid-type', path, 'expected an array');
  }
  return value;
}

function assertId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    throw new CanvasValidationError(
      'invalid-id',
      path,
      'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/',
    );
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > CANVAS_MAX_TIMESTAMP
  ) {
    throw new CanvasValidationError(
      'invalid-timestamp',
      path,
      'expected an integer timestamp in [0, CANVAS_MAX_TIMESTAMP]',
    );
  }
  return value;
}

function assertBoundedInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new CanvasValidationError('invalid-number', path, 'expected an integer in [min, max]');
  }
  return value;
}

function normalizeTemplateTitle(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new CanvasValidationError('invalid-type', path, 'expected a string');
  }
  const text = value.trim();
  if (CONTROL_CHAR_PATTERN.test(text)) {
    throw new CanvasValidationError('unsupported-value', path, 'title contains control characters');
  }
  if (text.length > CANVAS_MAX_TITLE_LENGTH) {
    throw new CanvasValidationError(
      'unsupported-value',
      path,
      'title exceeds CANVAS_MAX_TITLE_LENGTH characters',
    );
  }
  return text === '' ? 'Untitled' : text;
}

function generatedBlockId(documentId: string, index: number): string {
  const suffix = '-block-' + String(index + 1);
  return documentId.slice(0, 64 - suffix.length) + suffix;
}

function generatedMindMapContent(blockId: string, label: string, now: number): CanvasBlockContent {
  const idSuffix = blockId.slice(0, 48);
  return {
    kind: 'mind-map',
    map: createMindMap({ id: 'map-' + idSuffix, rootId: 'root-' + idSuffix, label, now }),
  };
}

// ---------------------------------------------------------------------------
// Built-in recipe authoring
// ---------------------------------------------------------------------------

const noteBlock = (text: string): CanvasTemplateBlock => ({ content: { kind: 'note', text } });

const headingBlock = (level: 1 | 2 | 3 | 4 | 5 | 6, text: string): CanvasTemplateBlock => ({
  content: { kind: 'heading', level, text },
});

const mindMapBlock = (label: string): CanvasTemplateBlock => ({
  content: { kind: 'note', text: label },
  mindMapLabel: label,
});

function recipe(
  id: BuiltInCanvasTemplateId,
  title: string,
  layoutMode: CanvasLayoutMode,
  blocks: readonly CanvasTemplateBlock[],
  presentationFrameIndices: readonly number[] = [],
): CanvasTemplate {
  return deepFreeze({
    id,
    title,
    layoutMode,
    background: { kind: layoutMode === 'edgeless' ? 'dots' : 'plain', color: '#ffffff' },
    blocks,
    presentationFrameIndices,
  });
}

const BUILT_INS: readonly CanvasTemplate[] = Object.freeze([
  recipe('blank', 'Blank canvas', 'edgeless', []),
  recipe('project-planner', 'Project planner', 'page', [
    headingBlock(1, 'Project plan'),
    noteBlock('Goal'),
    noteBlock('Milestones'),
    noteBlock('Risks'),
    noteBlock('Owners'),
  ]),
  recipe('product-roadmap', 'Product roadmap', 'edgeless', [
    headingBlock(2, 'Roadmap'),
    noteBlock('Now'),
    noteBlock('Next'),
    noteBlock('Later'),
  ]),
  recipe('software-architecture', 'Software architecture', 'edgeless', [
    noteBlock('Clients'),
    noteBlock('Application'),
    noteBlock('Data and integrations'),
  ]),
  recipe('system-design', 'System design', 'edgeless', [
    headingBlock(2, 'System design'),
    noteBlock('Requirements'),
    noteBlock('Components'),
    noteBlock('Trade-offs'),
  ]),
  recipe(
    'user-journey',
    'User journey',
    'edgeless',
    [noteBlock('Discover'), noteBlock('Decide'), noteBlock('Complete')],
    [0, 1, 2],
  ),
  recipe('mind-map', 'Mind map', 'edgeless', [mindMapBlock('Central idea')]),
  recipe('concept-map', 'Concept map', 'edgeless', [
    noteBlock('Concept'),
    noteBlock('Relationship'),
    noteBlock('Evidence'),
  ]),
  recipe(
    'storyboard',
    'Storyboard',
    'page',
    [
      headingBlock(2, 'Storyboard'),
      noteBlock('Scene 1'),
      noteBlock('Scene 2'),
      noteBlock('Scene 3'),
    ],
    [1, 2, 3],
  ),
  recipe('cornell-notes', 'Cornell notes', 'page', [
    headingBlock(2, 'Cornell notes'),
    noteBlock('Cues'),
    noteBlock('Notes'),
    noteBlock('Summary'),
  ]),
  recipe('research-board', 'Research board', 'edgeless', [
    noteBlock('Question'),
    noteBlock('Sources'),
    noteBlock('Findings'),
  ]),
  recipe(
    'launch-checklist',
    'Launch checklist',
    'page',
    [
      headingBlock(2, 'Launch checklist'),
      noteBlock('Prepare'),
      noteBlock('Verify'),
      noteBlock('Launch'),
    ],
    [1, 2, 3],
  ),
  recipe('calendar-planner', 'Calendar planner', 'page', [
    headingBlock(2, 'Calendar'),
    noteBlock('This week'),
    noteBlock('Upcoming'),
    noteBlock('Later'),
  ]),
  recipe('content-tracker', 'Content tracker', 'page', [
    headingBlock(2, 'Content tracker'),
    noteBlock('Ideas'),
    noteBlock('In progress'),
    noteBlock('Published'),
  ]),
  recipe(
    'presentation-outline',
    'Presentation outline',
    'page',
    [
      headingBlock(1, 'Title slide'),
      headingBlock(2, 'Agenda'),
      headingBlock(2, 'Key points'),
      headingBlock(2, 'Summary'),
    ],
    [0, 1, 2, 3],
  ),
]);

export function listBuiltInCanvasTemplates(): readonly CanvasTemplate[] {
  return BUILT_INS;
}

export function getBuiltInCanvasTemplate(id: string): CanvasTemplate {
  const found = BUILT_INS.find((template) => template.id === id);
  if (!found) {
    throw new CanvasValidationError('invalid-reference', 'templateId', 'unknown built-in template');
  }
  return found;
}

export function instantiateCanvasTemplate(
  template: CanvasTemplate,
  input: InstantiateCanvasTemplateInput,
): CanvasDocument {
  const documentId = assertId(input.documentId, 'documentId');
  const projectId = assertId(input.projectId, 'projectId');
  const ownerId = assertId(input.ownerId, 'ownerId');
  const now = assertTimestamp(input.now, 'now');

  let document = createCanvasDocument({
    id: documentId,
    projectId,
    ownerId,
    title: template.title,
    layoutMode: template.layoutMode,
    background: template.background,
    now,
  });

  const blockIds: string[] = [];
  template.blocks.forEach((blueprint, index) => {
    const blockId = generatedBlockId(documentId, index);
    blockIds.push(blockId);
    const content =
      blueprint.mindMapLabel !== undefined
        ? generatedMindMapContent(blockId, blueprint.mindMapLabel, now)
        : blueprint.content;
    document = withBlockAdded(document, createCanvasBlock({ id: blockId, content, now }), now);
    if (template.layoutMode === 'edgeless') {
      document = withPlacement(
        document,
        {
          blockId,
          x: blueprint.x ?? index * 360,
          y: blueprint.y ?? 0,
          width: blueprint.width ?? 300,
          height: blueprint.height ?? 180,
        },
        now,
      );
    }
  });

  if (template.presentationFrameIndices.length > 0) {
    document = withPresentationOrder(
      document,
      template.presentationFrameIndices.map((index) => blockIds[index]),
      now,
    );
  }

  return document;
}

// ---------------------------------------------------------------------------
// Custom template store: pure, immutable, account/project-scoped
// ---------------------------------------------------------------------------

interface TemplateScope {
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
}

function assertScope(ownerId: unknown, projectId: unknown): TemplateScope {
  return {
    ownerId: assertId(ownerId, 'ownerId') as CanvasOwnerId,
    projectId: assertId(projectId, 'projectId') as CanvasProjectId,
  };
}

function findInScope(
  store: CustomCanvasTemplateStore,
  scope: TemplateScope,
  templateId: string,
): CustomCanvasTemplate | undefined {
  return store.templates.find(
    (template) =>
      template.id === templateId &&
      template.ownerId === scope.ownerId &&
      template.projectId === scope.projectId,
  );
}

function requireInScope(
  store: CustomCanvasTemplateStore,
  scope: TemplateScope,
  templateId: string,
): CustomCanvasTemplate {
  const found = findInScope(store, scope, templateId);
  if (!found) {
    throw new CanvasValidationError('invalid-reference', 'templateId', 'unknown template in scope');
  }
  return found;
}

const STORE_KEYS = new Set(['templates']);
const CUSTOM_TEMPLATE_KEYS = new Set([
  'id',
  'ownerId',
  'projectId',
  'title',
  'createdAt',
  'updatedAt',
  'snapshot',
]);
const SNAPSHOT_KEYS = new Set([
  'layoutMode',
  'background',
  'blocks',
  'presentationFrameIndices',
  'presentationNotes',
]);
const SNAPSHOT_BLOCK_KEYS = new Set(['content', 'placement']);
const SNAPSHOT_BLOCK_REQUIRED_KEYS = new Set(['content']);
const SNAPSHOT_PLACEMENT_KEYS = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'z',
  'locked',
  'hidden',
]);
const SNAPSHOT_NOTE_KEYS = new Set(['frameIndex', 'text']);

function buildSnapshot(source: CanvasDocument): CanvasTemplateSnapshot {
  const ordered = pageOrderedBlocks(source);
  const indexById = new Map<string, number>(source.pageOrder.map((id, index) => [id, index]));
  const placementById = new Map<string, CanvasSpatialPlacement>(
    source.placements.map((placement) => [placement.blockId, placement]),
  );

  const blocks: CanvasTemplateSnapshotBlock[] = ordered.map((block) => {
    const placement = placementById.get(block.id);
    if (!placement) {
      return { content: block.content };
    }
    return {
      content: block.content,
      placement: {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotation: placement.rotation,
        z: placement.z,
        locked: placement.locked,
        hidden: placement.hidden,
      },
    };
  });

  const presentationFrameIndices = source.presentationOrder.map((id) => indexById.get(id)!);
  const presentationNotes: CanvasTemplateSnapshotNote[] = source.presentationNotes.map((note) => ({
    frameIndex: indexById.get(note.frameId)!,
    text: note.text,
  }));

  return deepFreeze({
    layoutMode: source.layoutMode,
    background: source.background,
    blocks,
    presentationFrameIndices,
    presentationNotes,
  });
}

function validateSnapshotReferences(snapshot: CanvasTemplateSnapshot, path: string): void {
  const presentationIndices = new Set<number>();
  snapshot.presentationFrameIndices.forEach((value, position) => {
    const referencePath = `${path}.presentationFrameIndices[${position}]`;
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >= snapshot.blocks.length
    ) {
      throw new CanvasValidationError(
        'invalid-reference',
        referencePath,
        'presentation frame index is outside the snapshot blocks',
      );
    }
    const index = value;
    if (presentationIndices.has(index)) {
      throw new CanvasValidationError(
        'duplicate-id',
        `${path}.presentationFrameIndices[${position}]`,
        'duplicate presentation frame index',
      );
    }
    presentationIndices.add(index);
  });

  const noteIndices = new Set<number>();
  snapshot.presentationNotes.forEach((note, position) => {
    const notePath = `${path}.presentationNotes[${position}]`;
    const index = note.frameIndex;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= snapshot.blocks.length
    ) {
      throw new CanvasValidationError(
        'invalid-reference',
        `${notePath}.frameIndex`,
        'note frame index is outside the snapshot blocks',
      );
    }
    if (!presentationIndices.has(index)) {
      throw new CanvasValidationError(
        'invalid-reference',
        `${notePath}.frameIndex`,
        'note frame is outside presentation order',
      );
    }
    if (noteIndices.has(index)) {
      throw new CanvasValidationError(
        'duplicate-id',
        `${notePath}.frameIndex`,
        'duplicate note for presentation frame',
      );
    }
    noteIndices.add(index);
  });
}

function instantiateSnapshot(
  snapshot: CanvasTemplateSnapshot,
  title: string,
  scope: TemplateScope,
  documentId: string,
  now: number,
): CanvasDocument {
  validateSnapshotReferences(snapshot, 'snapshot');
  let document = createCanvasDocument({
    id: documentId,
    projectId: scope.projectId,
    ownerId: scope.ownerId,
    title,
    layoutMode: snapshot.layoutMode,
    background: snapshot.background,
    now,
  });

  const blockIds: string[] = [];
  snapshot.blocks.forEach((snapshotBlock, index) => {
    const blockId = generatedBlockId(documentId, index);
    blockIds.push(blockId);
    const candidate = snapshotBlock.content as unknown;
    const validationBlockId =
      isPlainObject(candidate) &&
      candidate.kind === 'shape' &&
      isPlainObject(candidate.shape) &&
      typeof candidate.shape.id === 'string'
        ? candidate.shape.id
        : blockId;
    const validatedContent = createCanvasBlock({
      id: validationBlockId,
      content: candidate as CanvasBlockContent,
      now,
    }).content;
    const content =
      validatedContent.kind === 'shape'
        ? {
            kind: 'shape' as const,
            shape: { ...validatedContent.shape, id: parseCanvasBlockId(blockId) },
          }
        : validatedContent;
    document = withBlockAdded(document, createCanvasBlock({ id: blockId, content, now }), now);
    if (snapshot.layoutMode === 'edgeless' && snapshotBlock.placement) {
      document = withPlacement(document, { blockId, ...snapshotBlock.placement }, now);
    }
  });

  if (snapshot.presentationFrameIndices.length > 0) {
    document = withPresentationOrder(
      document,
      snapshot.presentationFrameIndices.map((index) => blockIds[index]),
      now,
    );
    for (const note of snapshot.presentationNotes) {
      document = withPresentationNote(document, blockIds[note.frameIndex], note.text, now);
    }
  }

  return document;
}

function parseCustomCanvasTemplateSnapshot(input: unknown, path: string): CanvasTemplateSnapshot {
  const value = assertObjectShape(input, path, SNAPSHOT_KEYS);
  const blocks = assertArray(value.blocks, `${path}.blocks`).map((entry, index) => {
    const blockPath = `${path}.blocks[${index}]`;
    const block = assertObjectShape(
      entry,
      blockPath,
      SNAPSHOT_BLOCK_KEYS,
      SNAPSHOT_BLOCK_REQUIRED_KEYS,
    );
    if (!isPlainObject(block.content)) {
      throw new CanvasValidationError('invalid-type', `${blockPath}.content`, 'expected an object');
    }
    const placement =
      block.placement === undefined
        ? undefined
        : assertObjectShape(block.placement, `${blockPath}.placement`, SNAPSHOT_PLACEMENT_KEYS);
    return {
      content: block.content as unknown as CanvasBlockContent,
      placement: placement as unknown as CanvasTemplateSnapshotPlacement | undefined,
    };
  });
  const presentationFrameIndices = assertArray(
    value.presentationFrameIndices,
    `${path}.presentationFrameIndices`,
  ) as readonly number[];
  const presentationNotes = assertArray(value.presentationNotes, `${path}.presentationNotes`).map(
    (entry, index) => {
      const note = assertObjectShape(
        entry,
        `${path}.presentationNotes[${index}]`,
        SNAPSHOT_NOTE_KEYS,
      );
      return {
        frameIndex: note.frameIndex as number,
        text: note.text as string,
      };
    },
  );
  const snapshot: CanvasTemplateSnapshot = {
    layoutMode: value.layoutMode as CanvasLayoutMode,
    background: value.background as CanvasBackground,
    blocks,
    presentationFrameIndices,
    presentationNotes,
  };
  validateSnapshotReferences(snapshot, path);

  const normalized = instantiateSnapshot(
    snapshot,
    'Template validation',
    {
      ownerId: 'template-owner' as CanvasOwnerId,
      projectId: 'template-project' as CanvasProjectId,
    },
    'template-document',
    0,
  );
  return buildSnapshot(normalized);
}

export function parseCustomCanvasTemplateStore(input: unknown): CustomCanvasTemplateStore {
  const value = assertObjectShape(input, 'store', STORE_KEYS);
  const templates = assertArray(value.templates, 'store.templates').map((entry, index) => {
    const path = `store.templates[${index}]`;
    const template = assertObjectShape(entry, path, CUSTOM_TEMPLATE_KEYS);
    const createdAt = assertTimestamp(template.createdAt, `${path}.createdAt`);
    const updatedAt = assertTimestamp(template.updatedAt, `${path}.updatedAt`);
    if (updatedAt < createdAt) {
      throw new CanvasValidationError(
        'invalid-timestamp',
        `${path}.updatedAt`,
        'updatedAt precedes createdAt',
      );
    }
    return deepFreeze({
      id: assertId(template.id, `${path}.id`),
      ownerId: assertId(template.ownerId, `${path}.ownerId`) as CanvasOwnerId,
      projectId: assertId(template.projectId, `${path}.projectId`) as CanvasProjectId,
      title: normalizeTemplateTitle(template.title, `${path}.title`),
      createdAt,
      updatedAt,
      snapshot: parseCustomCanvasTemplateSnapshot(template.snapshot, `${path}.snapshot`),
    });
  });
  const identities = new Set<string>();
  templates.forEach((template, index) => {
    const identity = `${template.ownerId}\u0000${template.projectId}\u0000${template.id}`;
    if (identities.has(identity)) {
      throw new CanvasValidationError(
        'duplicate-id',
        `store.templates[${index}].id`,
        'duplicate template id in scope',
      );
    }
    identities.add(identity);
  });
  return deepFreeze({ templates });
}

export function createCustomCanvasTemplateStore(): CustomCanvasTemplateStore {
  return deepFreeze({ templates: [] });
}

export function saveCanvasDocumentAsTemplate(
  store: CustomCanvasTemplateStore,
  input: {
    readonly source: CanvasDocument;
    readonly templateId: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly title?: string;
    readonly now: number;
  },
): { store: CustomCanvasTemplateStore; template: CustomCanvasTemplate } {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  let source: CanvasDocument;
  try {
    source = parseCanvasDocument(input.source);
  } catch (error) {
    if (error instanceof CanvasValidationError) {
      throw new CanvasValidationError('invalid-type', 'source', 'expected a canvas document');
    }
    throw error;
  }
  const scope = assertScope(input.ownerId, input.projectId);
  if (source.ownerId !== scope.ownerId || source.projectId !== scope.projectId) {
    throw new CanvasValidationError(
      'invalid-reference',
      'source',
      'source document is outside the requested owner/project scope',
    );
  }
  const templateId = assertId(input.templateId, 'templateId');
  const now = assertTimestamp(input.now, 'now');
  const title =
    input.title === undefined ? source.title : normalizeTemplateTitle(input.title, 'title');
  if (findInScope(normalizedStore, scope, templateId)) {
    throw new CanvasValidationError(
      'duplicate-id',
      'templateId',
      'template already exists in scope',
    );
  }
  const template = deepFreeze({
    id: templateId,
    ownerId: scope.ownerId,
    projectId: scope.projectId,
    title,
    createdAt: now,
    updatedAt: now,
    snapshot: buildSnapshot(source),
  });
  return {
    store: deepFreeze({ templates: [...normalizedStore.templates, template] }),
    template,
  };
}

export function instantiateCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: {
    readonly templateId: string;
    readonly documentId: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly now: number;
  },
): CanvasDocument {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  const documentId = assertId(input.documentId, 'documentId');
  const now = assertTimestamp(input.now, 'now');
  const template = requireInScope(normalizedStore, scope, templateId);
  return instantiateSnapshot(template.snapshot, template.title, scope, documentId, now);
}

export function duplicateCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: {
    readonly templateId: string;
    readonly newTemplateId: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly now: number;
  },
): { store: CustomCanvasTemplateStore; template: CustomCanvasTemplate } {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  const newTemplateId = assertId(input.newTemplateId, 'newTemplateId');
  const now = assertTimestamp(input.now, 'now');
  const source = requireInScope(normalizedStore, scope, templateId);
  if (findInScope(normalizedStore, scope, newTemplateId)) {
    throw new CanvasValidationError(
      'duplicate-id',
      'newTemplateId',
      'template already exists in scope',
    );
  }
  const template = deepFreeze({ ...source, id: newTemplateId, createdAt: now, updatedAt: now });
  return {
    store: deepFreeze({ templates: [...normalizedStore.templates, template] }),
    template,
  };
}

export function renameCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: {
    readonly templateId: string;
    readonly title: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly now: number;
  },
): { store: CustomCanvasTemplateStore; template: CustomCanvasTemplate } {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  const now = assertTimestamp(input.now, 'now');
  const title = normalizeTemplateTitle(input.title, 'title');
  const target = requireInScope(normalizedStore, scope, templateId);
  if (now < target.updatedAt) {
    throw new CanvasValidationError(
      'invalid-timestamp',
      'now',
      'template update timestamp cannot move backwards',
    );
  }
  const template = deepFreeze({ ...target, title, updatedAt: now });
  return {
    store: deepFreeze({
      templates: normalizedStore.templates.map((entry) => (entry === target ? template : entry)),
    }),
    template,
  };
}

export function previewCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: {
    readonly templateId: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly maxBlocks?: number;
  },
): CanvasTemplatePreview {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  const maxBlocks =
    input.maxBlocks === undefined
      ? DEFAULT_PREVIEW_BLOCKS
      : assertBoundedInteger(input.maxBlocks, 'maxBlocks', 1, CANVAS_TEMPLATE_PREVIEW_MAX_BLOCKS);
  const template = requireInScope(normalizedStore, scope, templateId);
  const snapshot = template.snapshot;
  return deepFreeze({
    id: template.id,
    title: template.title,
    layoutMode: snapshot.layoutMode,
    blockCount: snapshot.blocks.length,
    blocks: snapshot.blocks.slice(0, maxBlocks).map((block) => block.content),
  });
}

export function deleteCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: { readonly templateId: string; readonly ownerId: string; readonly projectId: string },
): { store: CustomCanvasTemplateStore } {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  const target = requireInScope(normalizedStore, scope, templateId);
  return {
    store: deepFreeze({
      templates: normalizedStore.templates.filter((entry) => entry !== target),
    }),
  };
}

export function listCustomTemplates(
  store: CustomCanvasTemplateStore,
  input: { readonly ownerId: string; readonly projectId: string },
): readonly CustomCanvasTemplate[] {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  return Object.freeze(
    normalizedStore.templates.filter(
      (template) => template.ownerId === scope.ownerId && template.projectId === scope.projectId,
    ),
  );
}

export function getCustomTemplate(
  store: CustomCanvasTemplateStore,
  input: { readonly templateId: string; readonly ownerId: string; readonly projectId: string },
): CustomCanvasTemplate {
  const normalizedStore = parseCustomCanvasTemplateStore(store);
  const scope = assertScope(input.ownerId, input.projectId);
  const templateId = assertId(input.templateId, 'templateId');
  return requireInScope(normalizedStore, scope, templateId);
}
