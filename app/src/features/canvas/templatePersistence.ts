import type { JarvisDexie } from '@/lib/db';
import type { CanvasTemplateRow } from '@/lib/db/schema';
import {
  listCustomTemplates,
  parseCustomCanvasTemplateStore,
  type CustomCanvasTemplate,
  type CustomCanvasTemplateStore,
} from './templates';

export interface CanvasTemplatePersistenceScope {
  readonly accountId: string;
  readonly ownerId: string;
  readonly projectId: string;
}

export interface CanvasTemplatePersistenceLimits {
  readonly maxTemplatesPerScope: number;
  readonly maxRowBytes: number;
  readonly maxScopeBytes: number;
}

export interface CanvasTemplatePersistenceRepository {
  load(scope: CanvasTemplatePersistenceScope): Promise<CustomCanvasTemplateStore>;
  replace(scope: CanvasTemplatePersistenceScope, store: CustomCanvasTemplateStore): Promise<void>;
}

export type CanvasTemplatePersistenceErrorCode =
  | 'invalid-data'
  | 'limit-exceeded'
  | 'scope-conflict'
  | 'storage-failure';

export class CanvasTemplatePersistenceError extends Error {
  constructor(
    readonly code: CanvasTemplatePersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CanvasTemplatePersistenceError';
  }
}

export const DEFAULT_CANVAS_TEMPLATE_PERSISTENCE_LIMITS: CanvasTemplatePersistenceLimits =
  Object.freeze({
    maxTemplatesPerScope: 128,
    maxRowBytes: 512 * 1024,
    maxScopeBytes: 8 * 1024 * 1024,
  });

const textEncoder = new TextEncoder();
const SAFE_SCOPE_COMPONENT = /^[^\u0000-\u001f\u007f]{1,200}$/u;

function assertScope(scope: CanvasTemplatePersistenceScope): CanvasTemplatePersistenceScope {
  for (const value of [scope.accountId, scope.ownerId, scope.projectId]) {
    if (typeof value !== 'string' || value.trim() !== value || !SAFE_SCOPE_COMPONENT.test(value)) {
      throw new CanvasTemplatePersistenceError(
        'invalid-data',
        'The template persistence scope is invalid.',
      );
    }
  }
  return Object.freeze({ ...scope });
}

function normalizeLimits(
  overrides: Partial<CanvasTemplatePersistenceLimits> | undefined,
): CanvasTemplatePersistenceLimits {
  const limits = { ...DEFAULT_CANVAS_TEMPLATE_PERSISTENCE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`);
    }
  }
  if (limits.maxRowBytes > limits.maxScopeBytes) {
    throw new TypeError('maxRowBytes cannot exceed maxScopeBytes');
  }
  return Object.freeze(limits);
}

function serializedBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('value is not JSON serializable');
    }
    return textEncoder.encode(serialized).byteLength;
  } catch (error) {
    throw new CanvasTemplatePersistenceError(
      'invalid-data',
      'Saved templates could not be loaded safely.',
      { cause: error },
    );
  }
}

function rowToTemplate(row: CanvasTemplateRow): CustomCanvasTemplate {
  const parsed = parseCustomCanvasTemplateStore({
    templates: [
      {
        id: row.id,
        ownerId: row.ownerId,
        projectId: row.projectId,
        title: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        snapshot: row.snapshot,
      },
    ],
  }).templates[0]!;
  if (
    row.projectId === null ||
    row.layoutMode !== parsed.snapshot.layoutMode ||
    JSON.stringify(row.background) !== JSON.stringify(parsed.snapshot.background)
  ) {
    throw new Error('template row metadata does not match its snapshot');
  }
  return parsed;
}

function templateToRow(
  scope: CanvasTemplatePersistenceScope,
  template: CustomCanvasTemplate,
): CanvasTemplateRow {
  return {
    id: template.id,
    accountId: scope.accountId,
    ownerId: template.ownerId,
    projectId: template.projectId,
    name: template.title,
    layoutMode: template.snapshot.layoutMode,
    background: template.snapshot.background,
    snapshot: template.snapshot,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function assertBoundedRows(
  rows: readonly CanvasTemplateRow[],
  limits: CanvasTemplatePersistenceLimits,
  errorMessage: string,
): void {
  if (rows.length > limits.maxTemplatesPerScope) {
    throw new CanvasTemplatePersistenceError('limit-exceeded', errorMessage);
  }
  let scopeBytes = 0;
  for (const row of rows) {
    const rowBytes = serializedBytes(row);
    if (rowBytes > limits.maxRowBytes) {
      throw new CanvasTemplatePersistenceError('limit-exceeded', errorMessage);
    }
    scopeBytes += rowBytes;
    if (scopeBytes > limits.maxScopeBytes) {
      throw new CanvasTemplatePersistenceError('limit-exceeded', errorMessage);
    }
  }
}

function scopedRows(database: JarvisDexie, scope: CanvasTemplatePersistenceScope, limit: number) {
  return database.canvas_templates
    .where('[accountId+projectId]')
    .equals([scope.accountId, scope.projectId])
    .filter((row) => row.ownerId === scope.ownerId)
    .limit(limit)
    .toArray();
}

function storageError(action: 'load' | 'save', cause: unknown): CanvasTemplatePersistenceError {
  return new CanvasTemplatePersistenceError(
    'storage-failure',
    action === 'load'
      ? 'Templates could not be loaded locally.'
      : 'Templates could not be saved locally.',
    { cause },
  );
}

export function createCanvasTemplatePersistenceRepository(
  database: JarvisDexie,
  limitOverrides?: Partial<CanvasTemplatePersistenceLimits>,
): CanvasTemplatePersistenceRepository {
  const limits = normalizeLimits(limitOverrides);

  return Object.freeze({
    async load(inputScope: CanvasTemplatePersistenceScope) {
      const scope = assertScope(inputScope);
      try {
        const rows = await scopedRows(database, scope, limits.maxTemplatesPerScope + 1);
        assertBoundedRows(rows, limits, 'Too many saved templates exist in this scope.');
        let store: CustomCanvasTemplateStore;
        try {
          store = parseCustomCanvasTemplateStore({
            templates: rows.map((row) => rowToTemplate(row)),
          });
        } catch (error) {
          if (error instanceof CanvasTemplatePersistenceError) throw error;
          throw new CanvasTemplatePersistenceError(
            'invalid-data',
            'Saved templates could not be loaded safely.',
            { cause: error },
          );
        }
        return store;
      } catch (error) {
        if (error instanceof CanvasTemplatePersistenceError) throw error;
        throw storageError('load', error);
      }
    },

    async replace(
      inputScope: CanvasTemplatePersistenceScope,
      inputStore: CustomCanvasTemplateStore,
    ) {
      const scope = assertScope(inputScope);
      let store: CustomCanvasTemplateStore;
      try {
        store = parseCustomCanvasTemplateStore(inputStore);
      } catch (error) {
        throw new CanvasTemplatePersistenceError(
          'invalid-data',
          'Templates could not be saved safely.',
          { cause: error },
        );
      }
      const templates = listCustomTemplates(store, scope);
      if (templates.length !== store.templates.length) {
        throw new CanvasTemplatePersistenceError(
          'scope-conflict',
          'Templates could not be saved outside the active scope.',
        );
      }
      const desiredRows = templates.map((template) => templateToRow(scope, template));
      assertBoundedRows(desiredRows, limits, 'Template storage limits were exceeded.');

      try {
        await database.transaction('rw', database.canvas_templates, async () => {
          const currentRows = await scopedRows(database, scope, limits.maxTemplatesPerScope + 1);
          assertBoundedRows(currentRows, limits, 'Too many saved templates exist in this scope.');
          const existingRows = await database.canvas_templates.bulkGet(
            desiredRows.map((row) => row.id),
          );
          if (
            existingRows.some(
              (row) =>
                row !== undefined &&
                (row.accountId !== scope.accountId ||
                  row.ownerId !== scope.ownerId ||
                  row.projectId !== scope.projectId),
            )
          ) {
            throw new CanvasTemplatePersistenceError(
              'scope-conflict',
              'A template identifier is unavailable in this scope.',
            );
          }

          const desiredIds = new Set(desiredRows.map((row) => row.id));
          const removedIds = currentRows
            .filter((row) => !desiredIds.has(row.id))
            .map((row) => row.id);
          if (removedIds.length > 0) {
            await database.canvas_templates.bulkDelete(removedIds);
          }
          if (desiredRows.length > 0) {
            await database.canvas_templates.bulkPut(desiredRows);
          }
        });
      } catch (error) {
        if (error instanceof CanvasTemplatePersistenceError) throw error;
        throw storageError('save', error);
      }
    },
  });
}
