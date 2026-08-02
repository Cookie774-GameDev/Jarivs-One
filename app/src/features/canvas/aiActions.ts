import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  createCanvasBlock,
  parseCanvasDocument,
  withBlockAdded,
  type CanvasBlockContent,
  type CanvasDocument,
} from './contracts';
import type { CanvasHistoryCommit } from './history';

export const CANVAS_AI_SELECTION_ACTIONS = [
  'summarize',
  'rewrite',
  'expand',
  'extract-action-items',
  'generate-mind-map',
  'generate-flowchart',
  'generate-system-diagram',
  'generate-database',
  'generate-presentation-outline',
  'organize',
  'label-clusters',
  'find-duplicates',
  'send-to-prompt-forge',
] as const;

export const CANVAS_AI_WHOLE_CANVAS_ACTIONS = [
  'generate-from-prompt',
  'answer-from-selection',
  'identify-missing-areas',
  'create-release-plan',
  'create-repository-architecture',
  'create-storyboard',
] as const;

export const CANVAS_AI_ACTIONS = [
  ...CANVAS_AI_SELECTION_ACTIONS,
  ...CANVAS_AI_WHOLE_CANVAS_ACTIONS,
] as const;

export type CanvasAiSelectionAction = (typeof CANVAS_AI_SELECTION_ACTIONS)[number];
export type CanvasAiWholeCanvasAction = (typeof CANVAS_AI_WHOLE_CANVAS_ACTIONS)[number];
export type CanvasAiAction = (typeof CANVAS_AI_ACTIONS)[number];

export type CanvasAiValidationErrorCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'duplicate-id'
  | 'invalid-reference'
  | 'unsupported-value'
  | 'unsafe-value';

export class CanvasAiValidationError extends Error {
  constructor(
    readonly code: CanvasAiValidationErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`Canvas AI validation failed (${code}) at ${path}: ${message}`);
    this.name = 'CanvasAiValidationError';
  }
}

export type CanvasAiScope =
  | { readonly kind: 'selection'; readonly blockIds: readonly string[] }
  | { readonly kind: 'whole-canvas' };

export type CanvasAiModelSelection =
  | { readonly mode: 'prefer_local' }
  | { readonly mode: 'current_chat_model' }
  | {
      readonly mode: 'single';
      readonly providerId: string;
      readonly modelId: string;
      readonly connectionId?: string;
    };

export type CanvasAiPrivacyMode = 'local_only' | 'provider_allowed';
export type CanvasAiSourceKind = 'canvas-block' | 'project-file' | 'web-reference';

export interface CanvasAiSourceReference {
  readonly id: string;
  readonly kind: CanvasAiSourceKind;
  readonly reference: string;
  readonly label: string;
}

export interface CanvasAiRequest {
  readonly id: string;
  readonly canvasId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly action: CanvasAiAction;
  readonly scope: CanvasAiScope;
  readonly prompt: string | null;
  readonly modelSelection: CanvasAiModelSelection;
  readonly privacyMode: CanvasAiPrivacyMode;
  readonly sourceReferences: readonly CanvasAiSourceReference[];
  readonly createdAt: number;
  readonly previewRequired: true;
  readonly router: 'jarvis-model-router';
}

export interface CanvasAiDispatch {
  readonly requestId: string;
  readonly router: 'jarvis-model-router';
  readonly purpose: CanvasAiPurpose;
  readonly destination: 'canvas' | 'prompt-forge';
  readonly modelSelection: CanvasAiModelSelection;
  readonly privacyMode: CanvasAiPrivacyMode;
  readonly messages: readonly {
    readonly role: 'user';
    readonly content: string;
  }[];
}

export interface CanvasAiResolvedModel {
  readonly providerId: string;
  readonly modelId: string;
  readonly connectionId: string | null;
  readonly local: boolean;
}

export interface CanvasAiGeneratedBlock {
  readonly id: string;
  readonly content: CanvasBlockContent;
  readonly sourceReferences: readonly CanvasAiSourceReference[];
}

export interface CanvasAiPreview {
  readonly id: string;
  readonly request: CanvasAiRequest;
  readonly resolvedModel: CanvasAiResolvedModel;
  readonly summary: string;
  readonly generatedBlocks: readonly CanvasAiGeneratedBlock[];
  readonly createdAt: number;
  readonly status: 'preview';
  readonly requiresConfirmation: true;
}

export interface CanvasAiActivityEvent {
  readonly id: string;
  readonly requestId: string;
  readonly previewId: string;
  readonly transactionId: string;
  readonly action: CanvasAiAction;
  readonly status: 'inserted';
  readonly sourceReferenceIds: readonly string[];
  readonly model: CanvasAiResolvedModel;
  readonly timestamp: number;
}

export interface CanvasAiInsertionTransaction {
  readonly id: string;
  readonly insertedBlockIds: readonly string[];
  readonly historyCommit: CanvasHistoryCommit<CanvasDocument>;
  readonly activityEvent: CanvasAiActivityEvent;
}

type CanvasAiPurpose =
  | 'canvas_summarize'
  | 'canvas_rewrite'
  | 'canvas_expand'
  | 'canvas_action_items'
  | 'canvas_mind_map'
  | 'canvas_flowchart'
  | 'canvas_system_diagram'
  | 'canvas_database'
  | 'canvas_presentation'
  | 'canvas_organize'
  | 'canvas_label_clusters'
  | 'canvas_find_duplicates'
  | 'prompt_forge'
  | 'canvas_generate'
  | 'canvas_question'
  | 'canvas_missing_areas'
  | 'canvas_release_plan'
  | 'canvas_repository_architecture'
  | 'canvas_storyboard';

const PURPOSE_BY_ACTION: Readonly<Record<CanvasAiAction, CanvasAiPurpose>> = Object.freeze({
  summarize: 'canvas_summarize',
  rewrite: 'canvas_rewrite',
  expand: 'canvas_expand',
  'extract-action-items': 'canvas_action_items',
  'generate-mind-map': 'canvas_mind_map',
  'generate-flowchart': 'canvas_flowchart',
  'generate-system-diagram': 'canvas_system_diagram',
  'generate-database': 'canvas_database',
  'generate-presentation-outline': 'canvas_presentation',
  organize: 'canvas_organize',
  'label-clusters': 'canvas_label_clusters',
  'find-duplicates': 'canvas_find_duplicates',
  'send-to-prompt-forge': 'prompt_forge',
  'generate-from-prompt': 'canvas_generate',
  'answer-from-selection': 'canvas_question',
  'identify-missing-areas': 'canvas_missing_areas',
  'create-release-plan': 'canvas_release_plan',
  'create-repository-architecture': 'canvas_repository_architecture',
  'create-storyboard': 'canvas_storyboard',
});

const REQUEST_KEYS = new Set([
  'id',
  'canvasId',
  'projectId',
  'ownerId',
  'action',
  'scope',
  'prompt',
  'modelSelection',
  'privacyMode',
  'sourceReferences',
  'createdAt',
]);
const MAX_PROMPT_LENGTH = 20_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_SOURCE_REFERENCES = 256;
const MAX_GENERATED_BLOCKS = 64;
const MAX_LABEL_LENGTH = 200;
const MAX_REFERENCE_LENGTH = 2_048;
const MAX_MODEL_ID_LENGTH = 200;
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

function fail(code: CanvasAiValidationErrorCode, path: string, message: string): never {
  throw new CanvasAiValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('unsupported-value', `${path}.${key}`, `unexpected field "${key}"`);
    }
  }
}

function text(
  value: unknown,
  path: string,
  maximum: number,
  options: { readonly nullable?: boolean; readonly allowEmpty?: boolean } = {},
): string | null {
  if (options.nullable && value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    fail('unsupported-value', path, 'must not be empty');
  }
  if (value.length > maximum) {
    fail('unsupported-value', path, `exceeds ${maximum.toLocaleString('en-US')} characters`);
  }
  if (UNSAFE_TEXT_PATTERN.test(value)) {
    fail('unsafe-value', path, 'contains unsafe control or bidirectional characters');
  }
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (result === null || !CANVAS_ID_PATTERN.test(result)) {
    fail('invalid-id', path, 'expected a stable Canvas id');
  }
  return result;
}

function timestamp(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > CANVAS_MAX_TIMESTAMP
  ) {
    fail('invalid-timestamp', path, 'expected an in-range integer timestamp');
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function uniqueIds(
  value: unknown,
  path: string,
  maximum: number,
  allowEmpty = false,
): readonly string[] {
  if (!Array.isArray(value)) {
    fail('invalid-type', path, 'expected an array');
  }
  if ((!allowEmpty && value.length === 0) || value.length > maximum) {
    fail('unsupported-value', path, `expected ${allowEmpty ? '0' : '1'}-${maximum} ids`);
  }
  const values = value.map((entry, index) => id(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) {
    fail('duplicate-id', path, 'contains a duplicate id');
  }
  return values;
}

function normalizeScope(value: unknown): CanvasAiScope {
  if (!isRecord(value)) {
    fail('invalid-type', 'request.scope', 'expected a scope object');
  }
  if (value.kind === 'whole-canvas') {
    exactKeys(value, new Set(['kind']), 'request.scope');
    return { kind: 'whole-canvas' };
  }
  if (value.kind === 'selection') {
    exactKeys(value, new Set(['kind', 'blockIds']), 'request.scope');
    return {
      kind: 'selection',
      blockIds: uniqueIds(value.blockIds, 'request.scope.blockIds', 256),
    };
  }
  fail('unsupported-value', 'request.scope.kind', 'unsupported Canvas AI scope');
}

function normalizeModelSelection(value: unknown): CanvasAiModelSelection {
  if (!isRecord(value)) {
    fail('invalid-type', 'request.modelSelection', 'expected a model selection object');
  }
  if (value.mode === 'prefer_local' || value.mode === 'current_chat_model') {
    exactKeys(value, new Set(['mode']), 'request.modelSelection');
    return { mode: value.mode };
  }
  if (value.mode !== 'single') {
    fail('unsupported-value', 'request.modelSelection.mode', 'unsupported model selection mode');
  }
  exactKeys(
    value,
    new Set(['mode', 'providerId', 'modelId', 'connectionId']),
    'request.modelSelection',
  );
  const providerId = modelToken(value.providerId, 'request.modelSelection.providerId');
  const modelId = modelToken(value.modelId, 'request.modelSelection.modelId');
  const connectionId =
    value.connectionId === undefined
      ? undefined
      : modelToken(value.connectionId, 'request.modelSelection.connectionId');
  return {
    mode: 'single',
    providerId,
    modelId,
    ...(connectionId === undefined ? {} : { connectionId }),
  };
}

function modelToken(value: unknown, path: string): string {
  const result = text(value, path, MAX_MODEL_ID_LENGTH);
  if (result === null || !SAFE_TOKEN_PATTERN.test(result)) {
    fail('unsafe-value', path, 'contains an unsafe model-routing token');
  }
  return result;
}

function normalizeSourceReference(value: unknown, index: number): CanvasAiSourceReference {
  const path = `request.sourceReferences[${index}]`;
  if (!isRecord(value)) {
    fail('invalid-type', path, 'expected a source reference object');
  }
  exactKeys(value, new Set(['id', 'kind', 'reference', 'label']), path);
  const sourceId = id(value.id, `${path}.id`);
  if (
    value.kind !== 'canvas-block' &&
    value.kind !== 'project-file' &&
    value.kind !== 'web-reference'
  ) {
    fail('unsupported-value', `${path}.kind`, 'unsupported source kind');
  }
  const reference = text(value.reference, `${path}.reference`, MAX_REFERENCE_LENGTH);
  const label = text(value.label, `${path}.label`, MAX_LABEL_LENGTH);
  if (reference === null || label === null) {
    fail('invalid-type', path, 'source reference fields must be strings');
  }
  if (
    reference.includes('\\') ||
    reference.split('/').some((segment) => segment === '..') ||
    reference.startsWith('/') ||
    /^[A-Za-z]:/.test(reference)
  ) {
    fail('unsafe-value', `${path}.reference`, 'unsafe absolute or traversing reference');
  }
  return { id: sourceId, kind: value.kind, reference, label };
}

function normalizeSourceReferences(value: unknown): readonly CanvasAiSourceReference[] {
  if (!Array.isArray(value)) {
    fail('invalid-type', 'request.sourceReferences', 'expected an array');
  }
  if (value.length > MAX_SOURCE_REFERENCES) {
    fail(
      'unsupported-value',
      'request.sourceReferences',
      `exceeds ${MAX_SOURCE_REFERENCES} references`,
    );
  }
  const references = value.map(normalizeSourceReference);
  if (new Set(references.map((reference) => reference.id)).size !== references.length) {
    fail('duplicate-id', 'request.sourceReferences', 'contains a duplicate source id');
  }
  return references;
}

function isLocalProvider(providerId: string): boolean {
  return providerId === 'ollama' || providerId === 'lmstudio' || providerId === 'local';
}

function enforcePrivacy(
  privacyMode: CanvasAiPrivacyMode,
  modelSelection: CanvasAiModelSelection,
  action: CanvasAiAction,
): void {
  if (action === 'send-to-prompt-forge' && privacyMode !== 'local_only') {
    fail(
      'unsupported-value',
      'request.privacyMode',
      'Prompt Forge handoffs require local_only privacy',
    );
  }
  if (privacyMode !== 'local_only') {
    return;
  }
  if (modelSelection.mode === 'current_chat_model') {
    fail(
      'unsupported-value',
      'request.modelSelection',
      'current_chat_model cannot guarantee local_only privacy',
    );
  }
  if (modelSelection.mode === 'single' && !isLocalProvider(modelSelection.providerId)) {
    fail(
      'unsupported-value',
      'request.modelSelection.providerId',
      'provider is incompatible with local_only privacy',
    );
  }
}

export function createCanvasAiRequest(input: unknown): CanvasAiRequest {
  if (!isRecord(input)) {
    fail('invalid-type', 'request', 'expected a request object');
  }
  exactKeys(input, REQUEST_KEYS, 'request');
  const action = input.action;
  if (!CANVAS_AI_ACTIONS.includes(action as CanvasAiAction)) {
    fail('unsupported-value', 'request.action', 'unsupported Canvas AI action');
  }
  const normalizedAction = action as CanvasAiAction;
  const scope = normalizeScope(input.scope);
  const isSelectionAction = CANVAS_AI_SELECTION_ACTIONS.includes(
    normalizedAction as CanvasAiSelectionAction,
  );
  if (isSelectionAction !== (scope.kind === 'selection')) {
    fail('unsupported-value', 'request.scope', 'action and scope are incompatible');
  }
  const prompt = text(input.prompt, 'request.prompt', MAX_PROMPT_LENGTH, {
    nullable: true,
    allowEmpty: false,
  });
  if (normalizedAction === 'generate-from-prompt' && prompt === null) {
    fail('unsupported-value', 'request.prompt', 'a prompt is required for generation');
  }
  const modelSelection = normalizeModelSelection(input.modelSelection);
  if (input.privacyMode !== 'local_only' && input.privacyMode !== 'provider_allowed') {
    fail('unsupported-value', 'request.privacyMode', 'unsupported privacy mode');
  }
  const privacyMode = input.privacyMode;
  enforcePrivacy(privacyMode, modelSelection, normalizedAction);
  const sourceReferences = normalizeSourceReferences(input.sourceReferences);
  if (
    (scope.kind === 'selection' || normalizedAction === 'answer-from-selection') &&
    sourceReferences.length === 0
  ) {
    fail('invalid-reference', 'request.sourceReferences', 'action requires at least one source');
  }
  if (scope.kind === 'selection') {
    const selectedIds = new Set(scope.blockIds);
    const canvasSources = new Set(
      sourceReferences
        .filter((reference) => reference.kind === 'canvas-block')
        .map((reference) => reference.reference),
    );
    for (const blockId of selectedIds) {
      if (!canvasSources.has(blockId)) {
        fail(
          'invalid-reference',
          'request.sourceReferences',
          `missing source for selected block "${blockId}"`,
        );
      }
    }
    for (const reference of sourceReferences) {
      if (reference.kind === 'canvas-block' && !selectedIds.has(reference.reference)) {
        fail(
          'invalid-reference',
          'request.sourceReferences',
          `canvas source "${reference.reference}" is outside the selection`,
        );
      }
    }
  }
  return deepFreeze({
    id: id(input.id, 'request.id'),
    canvasId: id(input.canvasId, 'request.canvasId'),
    projectId: id(input.projectId, 'request.projectId'),
    ownerId: id(input.ownerId, 'request.ownerId'),
    action: normalizedAction,
    scope,
    prompt,
    modelSelection,
    privacyMode,
    sourceReferences,
    createdAt: timestamp(input.createdAt, 'request.createdAt'),
    previewRequired: true,
    router: 'jarvis-model-router',
  });
}

export function createCanvasAiDispatch(request: CanvasAiRequest): CanvasAiDispatch {
  const validated = createCanvasAiRequest({
    id: request.id,
    canvasId: request.canvasId,
    projectId: request.projectId,
    ownerId: request.ownerId,
    action: request.action,
    scope: request.scope,
    prompt: request.prompt,
    modelSelection: request.modelSelection,
    privacyMode: request.privacyMode,
    sourceReferences: request.sourceReferences,
    createdAt: request.createdAt,
  });
  const sourceIds = validated.sourceReferences.map((reference) => reference.id);
  const instruction = [
    `Canvas action: ${validated.action}.`,
    `Scope: ${validated.scope.kind}.`,
    `Source reference ids: ${sourceIds.length === 0 ? 'none' : sourceIds.join(', ')}.`,
    validated.prompt === null ? '' : `User prompt: ${validated.prompt}`,
    'Return structured preview content only; do not perform network or filesystem operations.',
  ]
    .filter(Boolean)
    .join('\n');
  return deepFreeze({
    requestId: validated.id,
    router: 'jarvis-model-router',
    purpose: PURPOSE_BY_ACTION[validated.action],
    destination: validated.action === 'send-to-prompt-forge' ? 'prompt-forge' : 'canvas',
    modelSelection: validated.modelSelection,
    privacyMode: validated.privacyMode,
    messages: [{ role: 'user', content: instruction }],
  });
}

function normalizeResolvedModel(value: unknown, request: CanvasAiRequest): CanvasAiResolvedModel {
  const path = 'preview.resolvedModel';
  if (!isRecord(value)) {
    fail('invalid-type', path, 'expected a resolved model object');
  }
  exactKeys(value, new Set(['providerId', 'modelId', 'connectionId', 'local']), path);
  if (typeof value.local !== 'boolean') {
    fail('invalid-type', `${path}.local`, 'expected a boolean');
  }
  const providerId = modelToken(value.providerId, `${path}.providerId`);
  const modelId = modelToken(value.modelId, `${path}.modelId`);
  const connectionId =
    value.connectionId === null ? null : modelToken(value.connectionId, `${path}.connectionId`);
  if (request.privacyMode === 'local_only' && (!value.local || !isLocalProvider(providerId))) {
    fail('unsupported-value', path, 'resolved model violates local_only privacy');
  }
  if (request.modelSelection.mode === 'single') {
    if (
      request.modelSelection.providerId !== providerId ||
      request.modelSelection.modelId !== modelId ||
      (request.modelSelection.connectionId !== undefined &&
        request.modelSelection.connectionId !== connectionId)
    ) {
      fail('invalid-reference', path, 'resolved model does not match caller model choice');
    }
  }
  return { providerId, modelId, connectionId, local: value.local };
}

export function createCanvasAiPreview(input: unknown): CanvasAiPreview {
  const path = 'preview';
  if (!isRecord(input)) {
    fail('invalid-type', path, 'expected a preview object');
  }
  exactKeys(
    input,
    new Set(['id', 'request', 'resolvedModel', 'summary', 'generatedBlocks', 'createdAt']),
    path,
  );
  if (!isRecord(input.request)) {
    fail('invalid-type', `${path}.request`, 'expected a Canvas AI request');
  }
  const request = createCanvasAiRequest({
    id: input.request.id,
    canvasId: input.request.canvasId,
    projectId: input.request.projectId,
    ownerId: input.request.ownerId,
    action: input.request.action,
    scope: input.request.scope,
    prompt: input.request.prompt,
    modelSelection: input.request.modelSelection,
    privacyMode: input.request.privacyMode,
    sourceReferences: input.request.sourceReferences,
    createdAt: input.request.createdAt,
  });
  const resolvedModel = normalizeResolvedModel(input.resolvedModel, request);
  const summary = text(input.summary, `${path}.summary`, MAX_SUMMARY_LENGTH);
  if (summary === null) {
    fail('invalid-type', `${path}.summary`, 'expected a summary');
  }
  if (!Array.isArray(input.generatedBlocks)) {
    fail('invalid-type', `${path}.generatedBlocks`, 'expected an array');
  }
  if (input.generatedBlocks.length > MAX_GENERATED_BLOCKS) {
    fail(
      'unsupported-value',
      `${path}.generatedBlocks`,
      `exceeds ${MAX_GENERATED_BLOCKS} generated blocks`,
    );
  }
  const createdAt = timestamp(input.createdAt, `${path}.createdAt`);
  const sourceById = new Map(
    request.sourceReferences.map((reference) => [reference.id, reference]),
  );
  const generatedBlocks = input.generatedBlocks.map((value, index): CanvasAiGeneratedBlock => {
    const blockPath = `${path}.generatedBlocks[${index}]`;
    if (!isRecord(value)) {
      fail('invalid-type', blockPath, 'expected a generated block object');
    }
    exactKeys(value, new Set(['id', 'content', 'sourceReferenceIds']), blockPath);
    const blockId = id(value.id, `${blockPath}.id`);
    const validatedContent = createCanvasBlock({
      id: blockId,
      content: value.content as CanvasBlockContent,
      now: createdAt,
    }).content;
    const sourceReferenceIds = uniqueIds(
      value.sourceReferenceIds,
      `${blockPath}.sourceReferenceIds`,
      MAX_SOURCE_REFERENCES,
      true,
    );
    if (request.scope.kind === 'selection' && sourceReferenceIds.length === 0) {
      fail(
        'invalid-reference',
        `${blockPath}.sourceReferenceIds`,
        'selection output needs a source',
      );
    }
    const sourceReferences = sourceReferenceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      if (source === undefined) {
        fail(
          'invalid-reference',
          `${blockPath}.sourceReferenceIds`,
          `unknown source "${sourceId}"`,
        );
      }
      return source;
    });
    return { id: blockId, content: validatedContent, sourceReferences };
  });
  if (new Set(generatedBlocks.map((block) => block.id)).size !== generatedBlocks.length) {
    fail('duplicate-id', `${path}.generatedBlocks`, 'contains a duplicate generated block id');
  }
  return deepFreeze({
    id: id(input.id, `${path}.id`),
    request,
    resolvedModel,
    summary,
    generatedBlocks,
    createdAt,
    status: 'preview',
    requiresConfirmation: true,
  });
}

export function applyCanvasAiPreview(input: unknown): CanvasAiInsertionTransaction {
  const path = 'transaction';
  if (!isRecord(input)) {
    fail('invalid-type', path, 'expected a transaction object');
  }
  exactKeys(input, new Set(['id', 'activityEventId', 'preview', 'before', 'insertedAt']), path);
  const transactionId = id(input.id, `${path}.id`);
  const activityEventId = id(input.activityEventId, `${path}.activityEventId`);
  if (
    input.preview === null ||
    typeof input.preview !== 'object' ||
    Array.isArray(input.preview) ||
    input.before === null ||
    typeof input.before !== 'object' ||
    Array.isArray(input.before)
  ) {
    fail('invalid-type', path, 'expected preview and Canvas document objects');
  }
  const previewValue = input.preview as Record<string, unknown>;
  const before = input.before as CanvasDocument;
  if (previewValue.status !== 'preview' || previewValue.requiresConfirmation !== true) {
    fail('unsupported-value', `${path}.preview`, 'expected an unmodified confirmation preview');
  }
  if (!Array.isArray(previewValue.generatedBlocks)) {
    fail('invalid-type', `${path}.preview.generatedBlocks`, 'expected an array');
  }
  const preview = createCanvasAiPreview({
    id: previewValue.id,
    request: previewValue.request,
    resolvedModel: previewValue.resolvedModel,
    summary: previewValue.summary,
    generatedBlocks: previewValue.generatedBlocks.map((generated, index) => {
      const blockPath = `${path}.preview.generatedBlocks[${index}]`;
      if (!isRecord(generated) || !Array.isArray(generated.sourceReferences)) {
        fail('invalid-type', blockPath, 'expected a source-linked generated block');
      }
      return {
        id: generated.id,
        content: generated.content,
        sourceReferenceIds: generated.sourceReferences.map((source, sourceIndex) => {
          if (!isRecord(source)) {
            fail(
              'invalid-type',
              `${blockPath}.sourceReferences[${sourceIndex}]`,
              'expected a source reference',
            );
          }
          return source.id;
        }),
      };
    }),
    createdAt: previewValue.createdAt,
  });
  const validatedBefore = parseCanvasDocument(before);
  if (
    preview.request.canvasId !== before.id ||
    preview.request.projectId !== before.projectId ||
    preview.request.ownerId !== before.ownerId
  ) {
    fail('invalid-reference', `${path}.before`, 'preview scope does not match the Canvas document');
  }
  if (preview.request.action === 'send-to-prompt-forge') {
    fail('unsupported-value', `${path}.preview`, 'Prompt Forge handoffs cannot be inserted');
  }
  if (preview.request.scope.kind === 'selection') {
    const blockIds = new Set(validatedBefore.blocks.map((block) => block.id as string));
    for (const selectedId of preview.request.scope.blockIds) {
      if (!blockIds.has(selectedId)) {
        fail(
          'invalid-reference',
          `${path}.preview.request.scope`,
          `selected source "${selectedId}" is missing from the target Canvas`,
        );
      }
    }
  }
  const insertedAt = timestamp(input.insertedAt, `${path}.insertedAt`);
  let after = before;
  for (const generated of preview.generatedBlocks) {
    after = withBlockAdded(
      after,
      createCanvasBlock({
        id: generated.id,
        content: generated.content,
        now: insertedAt,
      }),
      insertedAt,
    );
  }
  const insertedBlockIds = preview.generatedBlocks.map((block) => block.id);
  const sourceReferenceIds = preview.request.sourceReferences.map((source) => source.id);
  return deepFreeze({
    id: transactionId,
    insertedBlockIds,
    historyCommit: {
      id: transactionId,
      label: `Canvas AI: ${preview.request.action}`,
      kind: 'ai-insertion',
      timestamp: insertedAt,
      after,
    },
    activityEvent: {
      id: activityEventId,
      requestId: preview.request.id,
      previewId: preview.id,
      transactionId,
      action: preview.request.action,
      status: 'inserted',
      sourceReferenceIds,
      model: preview.resolvedModel,
      timestamp: insertedAt,
    },
  });
}
