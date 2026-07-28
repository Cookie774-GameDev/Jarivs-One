import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TITLE_LENGTH,
  CanvasValidationError,
  parseCanvasDocument,
  type CanvasCamera,
  type CanvasDocument,
} from './contracts';
import type { CanvasViewport } from './camera';
import {
  CANVAS_SEARCH_LIMITS,
  cameraForFocusTarget,
  createCanvasSearchIndex,
  parseCanvasSearchFocusTarget,
  parseCanvasSearchQuery,
  projectCanvasDocumentForSearch,
  type CanvasSearchFocusTarget,
  type CanvasSearchQueryInput,
} from './search';

const MAX_GLOBAL_CANVAS_DOCUMENTS = 5_000;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const OBJECT_TYPE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const INDEX_INPUT_KEYS = new Set(['ownerId', 'projectId', 'documents']);
const SELECTION_SCOPE_KEYS = new Set(['ownerId', 'projectId']);
const RESULT_KEYS = new Set([
  'ownerId',
  'projectId',
  'documentId',
  'canvasTitle',
  'objectId',
  'objectType',
  'label',
  'score',
  'focus',
]);

type GlobalSearchValidationCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-number'
  | 'duplicate-id'
  | 'unsupported-value'
  | 'invalid-reference';

export interface CanvasGlobalSearchIndexInput {
  readonly ownerId: string;
  readonly projectId?: string | null;
  readonly documents: readonly CanvasDocument[];
}

export interface CanvasGlobalSearchResult {
  readonly ownerId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly canvasTitle: string;
  readonly objectId: string;
  readonly objectType: string;
  readonly label: string;
  readonly score: number;
  readonly focus: CanvasSearchFocusTarget;
}

export interface CanvasGlobalSearchIndex {
  readonly documentCount: number;
  readonly objectCount: number;
  query(query: CanvasSearchQueryInput): readonly CanvasGlobalSearchResult[];
}

export interface CanvasGlobalSearchSelection {
  readonly route: 'canvas';
  readonly ownerId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly objectId: string;
  readonly camera: CanvasCamera;
}

export interface CanvasGlobalSearchSelectionScope {
  readonly ownerId: string;
  readonly projectId: string;
}

export type CanvasGlobalSearchNavigationListener = (selection: CanvasGlobalSearchSelection) => void;

interface IndexedCanvasDocument {
  readonly ownerId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly canvasTitle: string;
  readonly objectCount: number;
  readonly index: ReturnType<typeof createCanvasSearchIndex>;
}

interface CanvasGlobalSearchNavigationSubscription {
  readonly scope: CanvasGlobalSearchSelectionScope;
  readonly listener: CanvasGlobalSearchNavigationListener;
}

let pendingNavigation: CanvasGlobalSearchSelection | undefined;
const navigationSubscriptions = new Set<CanvasGlobalSearchNavigationSubscription>();

function fail(code: GlobalSearchValidationCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
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

function id(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  if (!CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable Canvas id');
  }
  return value;
}

function printable(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    fail('unsupported-value', path, 'expected bounded printable text');
  }
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function resultLabel(title: string, text: string, canvasTitle: string): string {
  const candidate = title.trim() || text.trim().split(/\r?\n/, 1)[0]?.trim() || canvasTitle;
  return candidate.slice(0, CANVAS_MAX_TITLE_LENGTH);
}

function compareResults(left: CanvasGlobalSearchResult, right: CanvasGlobalSearchResult): number {
  if (right.score !== left.score) return right.score - left.score;
  const leftTitle = left.canvasTitle.toLowerCase();
  const rightTitle = right.canvasTitle.toLowerCase();
  const titleOrder = leftTitle < rightTitle ? -1 : leftTitle > rightTitle ? 1 : 0;
  if (titleOrder !== 0) return titleOrder;
  if (left.documentId !== right.documentId) {
    return left.documentId < right.documentId ? -1 : 1;
  }
  if (left.objectType !== right.objectType) {
    return left.objectType < right.objectType ? -1 : 1;
  }
  return left.objectId < right.objectId ? -1 : left.objectId > right.objectId ? 1 : 0;
}

export function createCanvasGlobalSearchIndex(
  input: CanvasGlobalSearchIndexInput,
): CanvasGlobalSearchIndex {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'globalSearch', 'expected an input object');
  }
  assertExactKeys(input, INDEX_INPUT_KEYS, 'globalSearch');
  const ownerId = id(input.ownerId, 'globalSearch.ownerId');
  const projectId =
    input.projectId === undefined || input.projectId === null
      ? null
      : id(input.projectId, 'globalSearch.projectId');
  if (!Array.isArray(input.documents)) {
    fail('invalid-type', 'globalSearch.documents', 'expected an array');
  }
  if (input.documents.length > MAX_GLOBAL_CANVAS_DOCUMENTS) {
    fail('invalid-number', 'globalSearch.documents', 'too many Canvas documents');
  }

  const seen = new Set<string>();
  const documents: IndexedCanvasDocument[] = [];
  let objectCount = 0;
  input.documents.forEach((candidate, index) => {
    const document = parseCanvasDocument(candidate);
    if (document.ownerId !== ownerId) {
      fail('invalid-reference', `globalSearch.documents[${index}].ownerId`, 'owner scope mismatch');
    }
    if (projectId !== null && document.projectId !== projectId) {
      fail(
        'invalid-reference',
        `globalSearch.documents[${index}].projectId`,
        'project scope mismatch',
      );
    }
    if (seen.has(document.id)) {
      fail('duplicate-id', 'globalSearch.documents', `duplicate document "${document.id}"`);
    }
    seen.add(document.id);
    if (document.deletedAt !== null || document.archivedAt !== null) {
      return;
    }
    const projection = projectCanvasDocumentForSearch(document);
    objectCount += projection.objects.length;
    if (objectCount > CANVAS_SEARCH_LIMITS.maxObjects) {
      fail('invalid-number', 'globalSearch.documents', 'too many searchable Canvas objects');
    }
    documents.push(
      Object.freeze({
        ownerId: projection.ownerId,
        projectId: projection.projectId,
        documentId: projection.documentId,
        canvasTitle: projection.title,
        objectCount: projection.objects.length,
        index: createCanvasSearchIndex(projection.objects),
      }),
    );
  });

  const frozenDocuments = Object.freeze(documents);
  return Object.freeze({
    documentCount: frozenDocuments.length,
    objectCount,
    query(queryInput: CanvasSearchQueryInput): readonly CanvasGlobalSearchResult[] {
      const parsedQuery = parseCanvasSearchQuery(queryInput);
      const matches: CanvasGlobalSearchResult[] = [];
      for (const document of frozenDocuments) {
        for (const match of document.index.query(queryInput)) {
          matches.push(
            deepFreeze({
              ownerId: document.ownerId,
              projectId: document.projectId,
              documentId: document.documentId,
              canvasTitle: document.canvasTitle,
              objectId: match.object.id,
              objectType: match.object.objectType,
              label: resultLabel(match.object.title, match.object.text, document.canvasTitle),
              score: match.score,
              focus: match.focus,
            }),
          );
        }
      }
      matches.sort(compareResults);
      return Object.freeze(matches.slice(0, parsedQuery.limit));
    },
  });
}

function parseGlobalSearchResult(input: unknown): CanvasGlobalSearchResult {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'globalSearch.result', 'expected a result object');
  }
  assertExactKeys(input, RESULT_KEYS, 'globalSearch.result');
  const objectType = printable(
    input.objectType,
    'globalSearch.result.objectType',
    32,
  ).toLowerCase();
  if (!OBJECT_TYPE_PATTERN.test(objectType)) {
    fail('unsupported-value', 'globalSearch.result.objectType', 'unsupported object type');
  }
  if (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < 0) {
    fail('invalid-number', 'globalSearch.result.score', 'expected a non-negative score');
  }
  return deepFreeze({
    ownerId: id(input.ownerId, 'globalSearch.result.ownerId'),
    projectId: id(input.projectId, 'globalSearch.result.projectId'),
    documentId: id(input.documentId, 'globalSearch.result.documentId'),
    canvasTitle: printable(
      input.canvasTitle,
      'globalSearch.result.canvasTitle',
      CANVAS_MAX_TITLE_LENGTH,
    ),
    objectId: id(input.objectId, 'globalSearch.result.objectId'),
    objectType,
    label: printable(input.label, 'globalSearch.result.label', CANVAS_MAX_TITLE_LENGTH),
    score: input.score,
    focus: parseCanvasSearchFocusTarget(input.focus),
  });
}

function parseSelectionScope(input: unknown): CanvasGlobalSearchSelectionScope {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'globalSearch.selectionScope', 'expected a scope object');
  }
  assertExactKeys(input, SELECTION_SCOPE_KEYS, 'globalSearch.selectionScope');
  return Object.freeze({
    ownerId: id(input.ownerId, 'globalSearch.selectionScope.ownerId'),
    projectId: id(input.projectId, 'globalSearch.selectionScope.projectId'),
  });
}

function selectionMatchesScope(
  selection: Pick<CanvasGlobalSearchSelection, 'ownerId' | 'projectId'>,
  scope: CanvasGlobalSearchSelectionScope,
): boolean {
  return selection.ownerId === scope.ownerId && selection.projectId === scope.projectId;
}

export function selectCanvasGlobalSearchResult(
  resultValue: CanvasGlobalSearchResult,
  expectedScopeValue: CanvasGlobalSearchSelectionScope,
  viewport: CanvasViewport,
  padding = 48,
): CanvasGlobalSearchSelection {
  const result = parseGlobalSearchResult(resultValue);
  const expectedScope = parseSelectionScope(expectedScopeValue);
  if (!selectionMatchesScope(result, expectedScope)) {
    fail(
      'invalid-reference',
      'globalSearch.result',
      'result does not belong to the active owner and project scope',
    );
  }
  return deepFreeze({
    route: 'canvas' as const,
    ownerId: result.ownerId,
    projectId: result.projectId,
    documentId: result.documentId,
    objectId: result.objectId,
    camera: cameraForFocusTarget(result.focus, viewport, padding),
  });
}

export function requestCanvasGlobalSearchNavigation(
  result: CanvasGlobalSearchResult,
  expectedScope: CanvasGlobalSearchSelectionScope,
  viewport: CanvasViewport,
  padding = 48,
): CanvasGlobalSearchSelection {
  const selection = selectCanvasGlobalSearchResult(result, expectedScope, viewport, padding);
  pendingNavigation = selection;
  let delivered = false;
  for (const subscription of navigationSubscriptions) {
    if (!selectionMatchesScope(selection, subscription.scope)) continue;
    delivered = true;
    subscription.listener(selection);
  }
  if (delivered) pendingNavigation = undefined;
  return selection;
}

export function takePendingCanvasGlobalSearchNavigation(
  expectedScopeValue: CanvasGlobalSearchSelectionScope,
): CanvasGlobalSearchSelection | undefined {
  const expectedScope = parseSelectionScope(expectedScopeValue);
  const selection = pendingNavigation;
  pendingNavigation = undefined;
  return selection && selectionMatchesScope(selection, expectedScope) ? selection : undefined;
}

export function subscribeCanvasGlobalSearchNavigation(
  expectedScopeValue: CanvasGlobalSearchSelectionScope,
  listener: CanvasGlobalSearchNavigationListener,
): () => void {
  const scope = parseSelectionScope(expectedScopeValue);
  if (typeof listener !== 'function') {
    fail('invalid-type', 'globalSearch.navigationListener', 'expected a function');
  }
  const subscription = Object.freeze({ scope, listener });
  navigationSubscriptions.add(subscription);
  return () => navigationSubscriptions.delete(subscription);
}
