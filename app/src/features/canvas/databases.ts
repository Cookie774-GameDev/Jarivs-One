/**
 * Canvas local databases.
 *
 * Framework-agnostic, deterministic, side-effect-free domain for useful
 * local-first databases attached to the canvas. A database is an aggregate of
 * typed fields, records, views and record templates scoped to exactly one
 * account (owner) and project. Every factory, parser and transition validates
 * its inputs and fails closed with a `CanvasValidationError`; URL and file
 * values reuse the canvas security primitives; all returned values are deeply
 * frozen so transitions never mutate their inputs.
 *
 * Formula fields are intentionally NOT provided. The requirement family allows
 * omission unless a bounded deterministic evaluator is implemented; omitting
 * the field type removes any eval/executable-formula surface entirely.
 */

import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TEXT_LENGTH,
  CANVAS_MAX_TIMESTAMP,
  CANVAS_MAX_TITLE_LENGTH,
  CanvasValidationError,
  type CanvasValidationErrorCode,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasTimestamp,
} from './contracts';
import {
  CANVAS_MAX_ASSET_BYTES,
  CANVAS_SAFE_ASSET_MIME_TYPES,
  sanitizeCanvasUrl,
} from './security';

// ---------------------------------------------------------------------------
// Errors and low-level helpers
// ---------------------------------------------------------------------------

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  return value;
}

function assertId(value: unknown, path: string): string {
  const text = assertString(value, path);
  if (!CANVAS_ID_PATTERN.test(text)) {
    fail('invalid-id', path, 'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/');
  }
  return text;
}

function assertSafeInteger(
  value: unknown,
  path: string,
  bounds: { readonly min?: number; readonly max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-number', path, 'expected a safe integer');
  }
  if (bounds.min !== undefined && value < bounds.min) {
    fail('invalid-number', path, `value must be >= ${bounds.min}`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    fail('invalid-number', path, `value must be <= ${bounds.max}`);
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    fail('invalid-timestamp', path, `timestamp out of range [0, ${CANVAS_MAX_TIMESTAMP}]`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// Constants and branded identifiers
// ---------------------------------------------------------------------------

export const CANVAS_DATABASE_SCHEMA_VERSION = 1;

export const CANVAS_DATABASE_FIELD_TYPES = [
  'text',
  'number',
  'checkbox',
  'select',
  'multi-select',
  'date',
  'url',
  'file',
  'relation',
  'status',
] as const;
export type CanvasDatabaseFieldType = (typeof CANVAS_DATABASE_FIELD_TYPES)[number];

export function isCanvasDatabaseFieldType(value: unknown): value is CanvasDatabaseFieldType {
  return (
    typeof value === 'string' && (CANVAS_DATABASE_FIELD_TYPES as readonly string[]).includes(value)
  );
}

export const CANVAS_DATABASE_VIEW_KINDS = ['table', 'cards', 'kanban', 'list', 'calendar'] as const;
export type CanvasDatabaseViewKind = (typeof CANVAS_DATABASE_VIEW_KINDS)[number];

export function isCanvasDatabaseViewKind(value: unknown): value is CanvasDatabaseViewKind {
  return (
    typeof value === 'string' && (CANVAS_DATABASE_VIEW_KINDS as readonly string[]).includes(value)
  );
}

export const CANVAS_DATABASE_FILTER_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'isEmpty',
  'isNotEmpty',
  'greaterThan',
  'lessThan',
  'before',
  'after',
  'is',
  'isNot',
] as const;
export type CanvasDatabaseFilterOperator = (typeof CANVAS_DATABASE_FILTER_OPERATORS)[number];

export function isCanvasDatabaseFilterOperator(
  value: unknown,
): value is CanvasDatabaseFilterOperator {
  return (
    typeof value === 'string' &&
    (CANVAS_DATABASE_FILTER_OPERATORS as readonly string[]).includes(value)
  );
}

export const CANVAS_DATABASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CANVAS_DATABASE_MAX_FIELDS = 100;
export const CANVAS_DATABASE_MAX_RECORDS = 1000;
export const CANVAS_DATABASE_MAX_VIEWS = 50;
export const CANVAS_DATABASE_MAX_TEMPLATES = 100;
export const CANVAS_DATABASE_MAX_OPTIONS = 200;
export const CANVAS_DATABASE_MAX_LINKS = 100;
export const CANVAS_DATABASE_MAX_SORT_RULES = 8;
export const CANVAS_DATABASE_MAX_FILTERS = 16;
export const CANVAS_DATABASE_MAX_MULTI_SELECT = 100;
export const CANVAS_DATABASE_MAX_RELATION_RECORDS = 200;
export const CANVAS_DATABASE_MIN_COLUMN_WIDTH = 40;
export const CANVAS_DATABASE_MAX_COLUMN_WIDTH = 2000;
export const CANVAS_DATABASE_DEFAULT_COLUMN_WIDTH = 160;
export const CANVAS_DATABASE_MAX_NAME_LENGTH = CANVAS_MAX_TITLE_LENGTH;
export const CANVAS_DATABASE_MAX_FILE_NAME_LENGTH = 255;

declare const canvasDatabaseBrand: unique symbol;
declare const canvasDatabaseFieldBrand: unique symbol;
declare const canvasDatabaseRecordBrand: unique symbol;
declare const canvasDatabaseViewBrand: unique symbol;
declare const canvasDatabaseTemplateBrand: unique symbol;

export type CanvasDatabaseId = string & { [canvasDatabaseBrand]: 'CanvasDatabaseId' };
export type CanvasDatabaseFieldId = string & {
  [canvasDatabaseFieldBrand]: 'CanvasDatabaseFieldId';
};
export type CanvasDatabaseRecordId = string & {
  [canvasDatabaseRecordBrand]: 'CanvasDatabaseRecordId';
};
export type CanvasDatabaseViewId = string & { [canvasDatabaseViewBrand]: 'CanvasDatabaseViewId' };
export type CanvasDatabaseTemplateId = string & {
  [canvasDatabaseTemplateBrand]: 'CanvasDatabaseTemplateId';
};

export function parseCanvasDatabaseId(value: unknown, path = 'databaseId'): CanvasDatabaseId {
  return assertId(value, path) as CanvasDatabaseId;
}
export function parseCanvasDatabaseFieldId(
  value: unknown,
  path = 'fieldId',
): CanvasDatabaseFieldId {
  return assertId(value, path) as CanvasDatabaseFieldId;
}
export function parseCanvasDatabaseRecordId(
  value: unknown,
  path = 'recordId',
): CanvasDatabaseRecordId {
  return assertId(value, path) as CanvasDatabaseRecordId;
}
export function parseCanvasDatabaseViewId(value: unknown, path = 'viewId'): CanvasDatabaseViewId {
  return assertId(value, path) as CanvasDatabaseViewId;
}
export function parseCanvasDatabaseTemplateId(
  value: unknown,
  path = 'templateId',
): CanvasDatabaseTemplateId {
  return assertId(value, path) as CanvasDatabaseTemplateId;
}

// ---------------------------------------------------------------------------
// Fields and options
// ---------------------------------------------------------------------------

export interface CanvasDatabaseFieldOption {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

export interface CanvasDatabaseField {
  readonly id: CanvasDatabaseFieldId;
  readonly name: string;
  readonly type: CanvasDatabaseFieldType;
  readonly options: readonly CanvasDatabaseFieldOption[];
  readonly relatedDatabaseId: CanvasDatabaseId | null;
}

export interface CreateCanvasDatabaseFieldInput {
  readonly id: string;
  readonly name: string;
  readonly type: CanvasDatabaseFieldType;
  readonly options?: readonly CanvasDatabaseFieldOption[];
  readonly relatedDatabaseId?: string | null;
}

const OPTION_FIELD_TYPES: readonly CanvasDatabaseFieldType[] = ['select', 'multi-select', 'status'];

function normalizeOption(input: unknown, path: string): CanvasDatabaseFieldOption {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected an option object');
  }
  const id = assertId(input.id, `${path}.id`);
  const label = assertString(input.label, `${path}.label`).trim();
  if (label.length === 0) {
    fail('unsupported-value', `${path}.label`, 'option label is empty');
  }
  if (CONTROL_CHAR_PATTERN.test(label)) {
    fail('unsupported-value', `${path}.label`, 'option label contains control characters');
  }
  if (label.length > CANVAS_MAX_TEXT_LENGTH) {
    fail('unsupported-value', `${path}.label`, 'option label is too long');
  }
  const color = assertString(input.color, `${path}.color`);
  if (!COLOR_PATTERN.test(color)) {
    fail('unsupported-value', `${path}.color`, 'expected a #rrggbb hex color');
  }
  return { id, label, color };
}

function normalizeField(input: unknown, path: string): CanvasDatabaseField {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a field object');
  }
  const id = parseCanvasDatabaseFieldId(input.id, `${path}.id`);
  const name = assertString(input.name, `${path}.name`).trim();
  if (name.length === 0) {
    fail('unsupported-value', `${path}.name`, 'field name is empty');
  }
  if (CONTROL_CHAR_PATTERN.test(name)) {
    fail('unsupported-value', `${path}.name`, 'field name contains control characters');
  }
  if (name.length > CANVAS_DATABASE_MAX_NAME_LENGTH) {
    fail('unsupported-value', `${path}.name`, 'field name is too long');
  }
  if (!isCanvasDatabaseFieldType(input.type)) {
    fail('unsupported-value', `${path}.type`, `unsupported field type "${String(input.type)}"`);
  }
  const type = input.type;
  const wantsOptions = OPTION_FIELD_TYPES.includes(type);
  const rawOptions = input.options;
  let options: CanvasDatabaseFieldOption[] = [];
  if (wantsOptions) {
    if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
      fail('unsupported-value', `${path}.options`, `${type} fields require at least one option`);
    }
    if (rawOptions.length > CANVAS_DATABASE_MAX_OPTIONS) {
      fail(
        'unsupported-value',
        `${path}.options`,
        `too many options (max ${CANVAS_DATABASE_MAX_OPTIONS})`,
      );
    }
    const seen = new Set<string>();
    options = rawOptions.map((option, index) => {
      const normalized = normalizeOption(option, `${path}.options[${index}]`);
      if (seen.has(normalized.id)) {
        fail('duplicate-id', `${path}.options`, `duplicate option id "${normalized.id}"`);
      }
      seen.add(normalized.id);
      return normalized;
    });
  } else if (rawOptions !== undefined && rawOptions !== null) {
    if (!Array.isArray(rawOptions) || rawOptions.length > 0) {
      fail('unsupported-value', `${path}.options`, `${type} fields do not support options`);
    }
  }
  const wantsRelation = type === 'relation';
  let relatedDatabaseId: CanvasDatabaseId | null = null;
  if (wantsRelation) {
    if (input.relatedDatabaseId === undefined || input.relatedDatabaseId === null) {
      fail(
        'unsupported-value',
        `${path}.relatedDatabaseId`,
        'relation fields require a target database',
      );
    }
    relatedDatabaseId = parseCanvasDatabaseId(input.relatedDatabaseId, `${path}.relatedDatabaseId`);
  } else if (input.relatedDatabaseId !== undefined && input.relatedDatabaseId !== null) {
    fail(
      'unsupported-value',
      `${path}.relatedDatabaseId`,
      `${type} fields do not support relations`,
    );
  }
  return deepFreeze({ id, name, type, options, relatedDatabaseId });
}
// ---------------------------------------------------------------------------
// Cell values
// ---------------------------------------------------------------------------

export interface CanvasDatabaseFileValue {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
}

export type CanvasDatabaseCellValue =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'checkbox'; readonly checked: boolean }
  | { readonly type: 'select'; readonly optionId: string | null }
  | { readonly type: 'multi-select'; readonly optionIds: readonly string[] }
  | { readonly type: 'date'; readonly date: string | null }
  | { readonly type: 'url'; readonly url: string | null }
  | { readonly type: 'file'; readonly file: CanvasDatabaseFileValue | null }
  | { readonly type: 'relation'; readonly recordIds: readonly string[] }
  | { readonly type: 'status'; readonly optionId: string | null };

export function defaultCellForField(field: CanvasDatabaseField): CanvasDatabaseCellValue {
  switch (field.type) {
    case 'text':
      return deepFreeze({ type: 'text', text: '' });
    case 'number':
      return deepFreeze({ type: 'number', value: 0 });
    case 'checkbox':
      return deepFreeze({ type: 'checkbox', checked: false });
    case 'select':
      return deepFreeze({ type: 'select', optionId: null });
    case 'multi-select':
      return deepFreeze({ type: 'multi-select', optionIds: [] });
    case 'date':
      return deepFreeze({ type: 'date', date: null });
    case 'url':
      return deepFreeze({ type: 'url', url: null });
    case 'file':
      return deepFreeze({ type: 'file', file: null });
    case 'relation':
      return deepFreeze({ type: 'relation', recordIds: [] });
    case 'status':
      return deepFreeze({ type: 'status', optionId: null });
    default:
      return fail('unsupported-value', 'field.type', `unsupported field type "${field.type}"`);
  }
}

function isValidDate(value: string): boolean {
  if (!CANVAS_DATABASE_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normalizeFileValue(input: unknown, path: string): CanvasDatabaseFileValue {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a file object');
  }
  const name = assertString(input.name, `${path}.name`).trim();
  if (name.length === 0) {
    fail('unsupported-value', `${path}.name`, 'file name is empty');
  }
  if (CONTROL_CHAR_PATTERN.test(name)) {
    fail('unsupported-value', `${path}.name`, 'file name contains control characters');
  }
  if (name.length > CANVAS_DATABASE_MAX_FILE_NAME_LENGTH) {
    fail('unsupported-value', `${path}.name`, 'file name is too long');
  }
  const mimeType = assertString(input.mimeType, `${path}.mimeType`).trim().toLowerCase();
  if (!(CANVAS_SAFE_ASSET_MIME_TYPES as readonly string[]).includes(mimeType)) {
    fail('unsupported-value', `${path}.mimeType`, `unsupported file type "${mimeType}"`);
  }
  const size = assertSafeInteger(input.size, `${path}.size`, {
    min: 1,
    max: CANVAS_MAX_ASSET_BYTES,
  });
  return deepFreeze({ name, mimeType, size });
}

function normalizeCell(
  field: CanvasDatabaseField,
  value: unknown,
  path: string,
): CanvasDatabaseCellValue {
  if (!isPlainObject(value)) {
    fail('invalid-type', path, 'expected a cell object');
  }
  if (value.type !== field.type) {
    fail('invalid-type', `${path}.type`, `expected a ${field.type} cell value`);
  }
  switch (field.type) {
    case 'text': {
      const text = assertString(value.text, `${path}.text`);
      if (CONTROL_CHAR_PATTERN.test(text)) {
        fail('unsupported-value', `${path}.text`, 'text contains control characters');
      }
      if (text.length > CANVAS_MAX_TEXT_LENGTH) {
        fail(
          'unsupported-value',
          `${path}.text`,
          `text exceeds ${CANVAS_MAX_TEXT_LENGTH} characters`,
        );
      }
      return deepFreeze({ type: 'text', text });
    }
    case 'number': {
      const numeric = value.value;
      if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
        fail('invalid-number', `${path}.value`, 'expected a finite number');
      }
      return deepFreeze({ type: 'number', value: numeric });
    }
    case 'checkbox': {
      if (typeof value.checked !== 'boolean') {
        fail('invalid-type', `${path}.checked`, 'expected a boolean');
      }
      return deepFreeze({ type: 'checkbox', checked: value.checked });
    }
    case 'select':
    case 'status': {
      const optionId = value.optionId;
      if (optionId !== null) {
        const id = assertString(optionId, `${path}.optionId`);
        if (!field.options.some((option) => option.id === id)) {
          fail('unsupported-value', `${path}.optionId`, `unknown option "${id}"`);
        }
        return deepFreeze({ type: field.type, optionId: id } as CanvasDatabaseCellValue);
      }
      return deepFreeze({ type: field.type, optionId: null } as CanvasDatabaseCellValue);
    }
    case 'multi-select': {
      const optionIds = value.optionIds;
      if (!Array.isArray(optionIds)) {
        fail('invalid-type', `${path}.optionIds`, 'expected an array');
      }
      if (optionIds.length > CANVAS_DATABASE_MAX_MULTI_SELECT) {
        fail(
          'unsupported-value',
          `${path}.optionIds`,
          `too many selections (max ${CANVAS_DATABASE_MAX_MULTI_SELECT})`,
        );
      }
      const seen = new Set<string>();
      const normalized = optionIds.map((optionId, index) => {
        const id = assertString(optionId, `${path}.optionIds[${index}]`);
        if (!field.options.some((option) => option.id === id)) {
          fail('unsupported-value', `${path}.optionIds[${index}]`, `unknown option "${id}"`);
        }
        if (seen.has(id)) {
          fail('duplicate-id', `${path}.optionIds`, `duplicate option "${id}"`);
        }
        seen.add(id);
        return id;
      });
      return deepFreeze({ type: 'multi-select', optionIds: normalized });
    }
    case 'date': {
      const date = value.date;
      if (date === null) return deepFreeze({ type: 'date', date: null });
      const text = assertString(date, `${path}.date`);
      if (!isValidDate(text)) {
        fail('unsupported-value', `${path}.date`, 'expected a valid YYYY-MM-DD date');
      }
      return deepFreeze({ type: 'date', date: text });
    }
    case 'url': {
      const url = value.url;
      if (url === null) return deepFreeze({ type: 'url', url: null });
      return deepFreeze({ type: 'url', url: sanitizeCanvasUrl(url, `${path}.url`) });
    }
    case 'file': {
      const file = value.file;
      if (file === null) return deepFreeze({ type: 'file', file: null });
      return deepFreeze({ type: 'file', file: normalizeFileValue(file, `${path}.file`) });
    }
    case 'relation': {
      const recordIds = value.recordIds;
      if (!Array.isArray(recordIds)) {
        fail('invalid-type', `${path}.recordIds`, 'expected an array');
      }
      if (recordIds.length > CANVAS_DATABASE_MAX_RELATION_RECORDS) {
        fail(
          'unsupported-value',
          `${path}.recordIds`,
          `too many relations (max ${CANVAS_DATABASE_MAX_RELATION_RECORDS})`,
        );
      }
      const seen = new Set<string>();
      const normalized = recordIds.map((recordId, index) => {
        const id = assertId(recordId, `${path}.recordIds[${index}]`);
        if (seen.has(id)) {
          fail('duplicate-id', `${path}.recordIds`, `duplicate relation "${id}"`);
        }
        seen.add(id);
        return id;
      });
      return deepFreeze({ type: 'relation', recordIds: normalized });
    }
    default:
      return fail('unsupported-value', path, `unsupported field type "${field.type}"`);
  }
}

const OPERATORS_BY_TYPE: Record<CanvasDatabaseFieldType, readonly CanvasDatabaseFilterOperator[]> =
  {
    text: ['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty'],
    url: ['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty'],
    number: ['equals', 'notEquals', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty'],
    checkbox: ['is'],
    select: ['is', 'isNot', 'isEmpty', 'isNotEmpty'],
    status: ['is', 'isNot', 'isEmpty', 'isNotEmpty'],
    'multi-select': ['contains', 'isEmpty', 'isNotEmpty'],
    date: ['is', 'before', 'after', 'isEmpty', 'isNotEmpty'],
    file: ['isEmpty', 'isNotEmpty'],
    relation: ['contains', 'isEmpty', 'isNotEmpty'],
  };

function assertOperatorForType(
  type: CanvasDatabaseFieldType,
  operator: CanvasDatabaseFilterOperator,
  path: string,
): void {
  if (!OPERATORS_BY_TYPE[type].includes(operator)) {
    fail('unsupported-value', path, `operator "${operator}" does not apply to ${type} fields`);
  }
}

function normalizeFilterValue(
  field: CanvasDatabaseField,
  operator: CanvasDatabaseFilterOperator,
  value: unknown,
  path: string,
): unknown {
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    if (value !== undefined) {
      fail('unsupported-value', path, `${operator} does not accept an operand`);
    }
    return undefined;
  }

  if (field.type === 'text' || field.type === 'url') {
    const text = assertString(value, path);
    if (CONTROL_CHAR_PATTERN.test(text) || text.length > CANVAS_MAX_TEXT_LENGTH) {
      fail('unsupported-value', path, 'filter text is unsafe or too long');
    }
    if (field.type === 'url' && operator !== 'contains') {
      return sanitizeCanvasUrl(text, path);
    }
    return text;
  }

  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('invalid-number', path, 'number filters require a finite numeric operand');
    }
    return value;
  }

  if (field.type === 'checkbox') {
    if (typeof value !== 'boolean') {
      fail('invalid-type', path, 'checkbox filters require a boolean operand');
    }
    return value;
  }

  if (field.type === 'select' || field.type === 'status') {
    if (value === null) return null;
    const optionId = assertString(value, path);
    if (!field.options.some((option) => option.id === optionId)) {
      fail('invalid-reference', path, `unknown option "${optionId}"`);
    }
    return optionId;
  }

  if (field.type === 'multi-select') {
    const optionId = assertString(value, path);
    if (!field.options.some((option) => option.id === optionId)) {
      fail('invalid-reference', path, `unknown option "${optionId}"`);
    }
    return optionId;
  }

  if (field.type === 'relation') {
    return assertId(value, path);
  }

  if (field.type === 'date') {
    const date = assertString(value, path);
    if (!isValidDate(date)) {
      fail('unsupported-value', path, 'date filters require a valid YYYY-MM-DD operand');
    }
    return date;
  }

  return fail('unsupported-value', path, `${field.type} fields do not accept filter operands`);
}

// ---------------------------------------------------------------------------
// Links, records, views, templates
// ---------------------------------------------------------------------------

export type CanvasDatabaseObjectLinkKind = 'block' | 'document';

export interface CanvasDatabaseObjectLink {
  readonly kind: CanvasDatabaseObjectLinkKind;
  readonly id: string;
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
}

export interface CanvasDatabaseObjectLinkInput {
  readonly kind: CanvasDatabaseObjectLinkKind;
  readonly id: string;
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
}

export interface CanvasDatabaseRecord {
  readonly id: CanvasDatabaseRecordId;
  readonly cells: Readonly<Record<string, CanvasDatabaseCellValue>>;
  readonly links: readonly CanvasDatabaseObjectLink[];
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CreateCanvasDatabaseRecordInput {
  readonly id: string;
  readonly cells: Readonly<Record<string, CanvasDatabaseCellValue>>;
  readonly links?: readonly CanvasDatabaseObjectLinkInput[];
}

export type CanvasDatabaseSortDirection = 'asc' | 'desc';

export interface CanvasDatabaseSortRule {
  readonly fieldId: CanvasDatabaseFieldId;
  readonly direction: CanvasDatabaseSortDirection;
}

export interface CanvasDatabaseSortRuleInput {
  readonly fieldId: string;
  readonly direction: CanvasDatabaseSortDirection;
}

export interface CanvasDatabaseFilter {
  readonly fieldId: CanvasDatabaseFieldId;
  readonly operator: CanvasDatabaseFilterOperator;
  readonly value?: unknown;
}

export interface CanvasDatabaseFilterInput {
  readonly fieldId: string;
  readonly operator: CanvasDatabaseFilterOperator;
  readonly value?: unknown;
}

export interface CanvasDatabaseView {
  readonly id: CanvasDatabaseViewId;
  readonly name: string;
  readonly kind: CanvasDatabaseViewKind;
  readonly sortRules: readonly CanvasDatabaseSortRule[];
  readonly filters: readonly CanvasDatabaseFilter[];
  readonly groupByFieldId: CanvasDatabaseFieldId | null;
  readonly hiddenFieldIds: readonly CanvasDatabaseFieldId[];
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly kanbanFieldId: CanvasDatabaseFieldId | null;
  readonly calendarDateFieldId: CanvasDatabaseFieldId | null;
}

export interface CreateCanvasDatabaseViewInput {
  readonly id: string;
  readonly name: string;
  readonly kind: CanvasDatabaseViewKind;
  readonly sortRules?: readonly CanvasDatabaseSortRuleInput[];
  readonly filters?: readonly CanvasDatabaseFilterInput[];
  readonly groupByFieldId?: string | null;
  readonly hiddenFieldIds?: readonly string[];
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly kanbanFieldId?: string | null;
  readonly calendarDateFieldId?: string | null;
}

export interface CanvasDatabaseViewChangesInput {
  readonly sortRules?: readonly CanvasDatabaseSortRuleInput[];
  readonly filters?: readonly CanvasDatabaseFilterInput[];
  readonly groupByFieldId?: string | null;
  readonly hiddenFieldIds?: readonly string[];
  readonly columnWidths?: Readonly<Record<string, number>>;
}

export interface CanvasDatabaseRecordTemplate {
  readonly id: CanvasDatabaseTemplateId;
  readonly name: string;
  readonly cells: Readonly<Record<string, CanvasDatabaseCellValue>>;
}

export interface CreateCanvasDatabaseRecordTemplateInput {
  readonly id: string;
  readonly name: string;
  readonly cells: Readonly<Record<string, CanvasDatabaseCellValue>>;
}

export interface CanvasDatabase {
  readonly schemaVersion: typeof CANVAS_DATABASE_SCHEMA_VERSION;
  readonly id: CanvasDatabaseId;
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
  readonly name: string;
  readonly fields: readonly CanvasDatabaseField[];
  readonly fieldOrder: readonly CanvasDatabaseFieldId[];
  readonly records: readonly CanvasDatabaseRecord[];
  readonly recordOrder: readonly CanvasDatabaseRecordId[];
  readonly views: readonly CanvasDatabaseView[];
  readonly viewOrder: readonly CanvasDatabaseViewId[];
  readonly templates: readonly CanvasDatabaseRecordTemplate[];
  readonly templateOrder: readonly CanvasDatabaseTemplateId[];
  readonly localRevision: number;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CreateCanvasDatabaseInput {
  readonly id: string;
  readonly ownerId: CanvasOwnerId;
  readonly projectId: CanvasProjectId;
  readonly name: string;
  readonly now: number;
}
// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeName(value: unknown, path: string): string {
  const text = assertString(value, path).trim();
  if (CONTROL_CHAR_PATTERN.test(text)) {
    fail('unsupported-value', path, 'name contains control characters');
  }
  if (text.length > CANVAS_DATABASE_MAX_NAME_LENGTH) {
    fail('unsupported-value', path, `name exceeds ${CANVAS_DATABASE_MAX_NAME_LENGTH} characters`);
  }
  return text === '' ? 'Untitled' : text;
}

function freezeDatabase(value: CanvasDatabase): CanvasDatabase {
  return deepFreeze(value);
}

function transition(
  db: CanvasDatabase,
  changes: Record<string, unknown>,
  now: number,
): CanvasDatabase {
  return freezeDatabase({ ...db, ...changes, updatedAt: now, localRevision: db.localRevision + 1 });
}

function assertTransitionTimestamp(db: CanvasDatabase, now: number): CanvasTimestamp {
  const timestamp = assertTimestamp(now, 'now');
  if (timestamp < db.updatedAt) {
    fail('invalid-timestamp', 'now', 'transition time cannot move backwards');
  }
  return timestamp;
}

function requireField(
  db: CanvasDatabase,
  fieldId: CanvasDatabaseFieldId,
  path: string,
): CanvasDatabaseField {
  const field = db.fields.find((candidate) => candidate.id === fieldId);
  if (!field) {
    fail('invalid-reference', path, `references unknown field "${fieldId}"`);
  }
  return field;
}

function normalizeOptionalFieldRef(
  db: CanvasDatabase,
  value: unknown,
  path: string,
): CanvasDatabaseFieldId | null {
  if (value === undefined || value === null) return null;
  const fieldId = parseCanvasDatabaseFieldId(value, path);
  requireField(db, fieldId, path);
  return fieldId;
}

function normalizeLink(db: CanvasDatabase, input: unknown, path: string): CanvasDatabaseObjectLink {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a link object');
  }
  const kind = assertString(input.kind, `${path}.kind`);
  if (kind !== 'block' && kind !== 'document') {
    fail('unsupported-value', `${path}.kind`, `unsupported link kind "${kind}"`);
  }
  const id = assertId(input.id, `${path}.id`);
  const ownerId = assertId(input.ownerId, `${path}.ownerId`) as CanvasOwnerId;
  const projectId = assertId(input.projectId, `${path}.projectId`) as CanvasProjectId;
  if (ownerId !== db.ownerId || projectId !== db.projectId) {
    fail('invalid-reference', path, 'link scope does not match the database account/project');
  }
  return deepFreeze({ kind: kind as CanvasDatabaseObjectLinkKind, id, ownerId, projectId });
}

function normalizeCells(
  db: CanvasDatabase,
  cellsInput: unknown,
  path: string,
): Record<string, CanvasDatabaseCellValue> {
  if (!isPlainObject(cellsInput)) {
    fail('invalid-type', `${path}.cells`, 'expected a cells object');
  }
  const fieldIds = new Set<string>(db.fields.map((field) => field.id));
  for (const key of Object.keys(cellsInput)) {
    if (!fieldIds.has(key)) {
      fail('unsupported-value', `${path}.cells.${key}`, 'references unknown field');
    }
  }
  const cells: Record<string, CanvasDatabaseCellValue> = {};
  for (const field of db.fields) {
    const raw = cellsInput[field.id];
    cells[field.id] =
      raw === undefined
        ? defaultCellForField(field)
        : normalizeCell(field, raw, `${path}.cells.${field.id}`);
  }
  return cells;
}

function normalizeRecord(
  db: CanvasDatabase,
  input: unknown,
  path: string,
  now: number,
): CanvasDatabaseRecord {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a record object');
  }
  const id = assertId(input.id, `${path}.id`) as CanvasDatabaseRecordId;
  const cells = normalizeCells(db, input.cells, path);
  const linksInput = input.links === undefined ? [] : input.links;
  if (!Array.isArray(linksInput)) {
    fail('invalid-type', `${path}.links`, 'expected an array');
  }
  if (linksInput.length > CANVAS_DATABASE_MAX_LINKS) {
    fail('unsupported-value', `${path}.links`, `too many links (max ${CANVAS_DATABASE_MAX_LINKS})`);
  }
  const links = linksInput.map((link, index) => normalizeLink(db, link, `${path}.links[${index}]`));
  const seenLinks = new Set<string>();
  for (const link of links) {
    if (seenLinks.has(link.id)) {
      fail('duplicate-id', `${path}.links`, `duplicate target link "${link.id}"`);
    }
    seenLinks.add(link.id);
  }
  return deepFreeze({ id, cells, links, createdAt: now, updatedAt: now });
}

function normalizeSortRule(
  db: CanvasDatabase,
  input: unknown,
  path: string,
): CanvasDatabaseSortRule {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a sort rule object');
  }
  const fieldId = parseCanvasDatabaseFieldId(input.fieldId, `${path}.fieldId`);
  requireField(db, fieldId, `${path}.fieldId`);
  const direction = assertString(input.direction, `${path}.direction`);
  if (direction !== 'asc' && direction !== 'desc') {
    fail('unsupported-value', `${path}.direction`, `unsupported sort direction "${direction}"`);
  }
  return { fieldId, direction: direction as CanvasDatabaseSortDirection };
}

function normalizeFilter(db: CanvasDatabase, input: unknown, path: string): CanvasDatabaseFilter {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a filter object');
  }
  const fieldId = parseCanvasDatabaseFieldId(input.fieldId, `${path}.fieldId`);
  const field = requireField(db, fieldId, `${path}.fieldId`);
  const operator = assertString(input.operator, `${path}.operator`);
  if (!isCanvasDatabaseFilterOperator(operator)) {
    fail('unsupported-value', `${path}.operator`, `unsupported filter operator "${operator}"`);
  }
  const typedOperator = operator as CanvasDatabaseFilterOperator;
  assertOperatorForType(field.type, typedOperator, `${path}.operator`);
  const value = normalizeFilterValue(field, typedOperator, input.value, `${path}.value`);
  return value === undefined
    ? { fieldId, operator: typedOperator }
    : { fieldId, operator: typedOperator, value };
}
function normalizeView(db: CanvasDatabase, input: unknown, path: string): CanvasDatabaseView {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a view object');
  }
  const id = parseCanvasDatabaseViewId(input.id, `${path}.id`);
  const name = normalizeName(input.name, `${path}.name`);
  const kind = assertString(input.kind, `${path}.kind`);
  if (!isCanvasDatabaseViewKind(kind)) {
    fail('unsupported-value', `${path}.kind`, `unsupported view kind "${kind}"`);
  }
  const viewKind = kind as CanvasDatabaseViewKind;

  const sortRulesInput = input.sortRules === undefined ? [] : input.sortRules;
  if (!Array.isArray(sortRulesInput)) {
    fail('invalid-type', `${path}.sortRules`, 'expected an array');
  }
  if (sortRulesInput.length > CANVAS_DATABASE_MAX_SORT_RULES) {
    fail(
      'unsupported-value',
      `${path}.sortRules`,
      `too many sort rules (max ${CANVAS_DATABASE_MAX_SORT_RULES})`,
    );
  }
  const sortRules = sortRulesInput.map((rule, index) =>
    normalizeSortRule(db, rule, `${path}.sortRules[${index}]`),
  );
  const sortedFieldIds = new Set<string>();
  for (const rule of sortRules) {
    if (sortedFieldIds.has(rule.fieldId)) {
      fail('duplicate-id', `${path}.sortRules`, `duplicate sort field "${rule.fieldId}"`);
    }
    sortedFieldIds.add(rule.fieldId);
  }

  const filtersInput = input.filters === undefined ? [] : input.filters;
  if (!Array.isArray(filtersInput)) {
    fail('invalid-type', `${path}.filters`, 'expected an array');
  }
  if (filtersInput.length > CANVAS_DATABASE_MAX_FILTERS) {
    fail(
      'unsupported-value',
      `${path}.filters`,
      `too many filters (max ${CANVAS_DATABASE_MAX_FILTERS})`,
    );
  }
  const filters = filtersInput.map((filter, index) =>
    normalizeFilter(db, filter, `${path}.filters[${index}]`),
  );

  const groupByFieldId = normalizeOptionalFieldRef(
    db,
    input.groupByFieldId,
    `${path}.groupByFieldId`,
  );

  const hiddenInput = input.hiddenFieldIds === undefined ? [] : input.hiddenFieldIds;
  if (!Array.isArray(hiddenInput)) {
    fail('invalid-type', `${path}.hiddenFieldIds`, 'expected an array');
  }
  const hiddenFieldIds = hiddenInput.map((hidden, index) => {
    const fieldId = parseCanvasDatabaseFieldId(hidden, `${path}.hiddenFieldIds[${index}]`);
    requireField(db, fieldId, `${path}.hiddenFieldIds[${index}]`);
    return fieldId;
  });
  const hiddenSeen = new Set<string>();
  for (const fieldId of hiddenFieldIds) {
    if (hiddenSeen.has(fieldId)) {
      fail('duplicate-id', `${path}.hiddenFieldIds`, `duplicate hidden field "${fieldId}"`);
    }
    hiddenSeen.add(fieldId);
  }

  const widthsInput = input.columnWidths === undefined ? {} : input.columnWidths;
  if (!isPlainObject(widthsInput)) {
    fail('invalid-type', `${path}.columnWidths`, 'expected an object');
  }
  const columnWidths: Record<string, number> = {};
  for (const key of Object.keys(widthsInput)) {
    const fieldId = parseCanvasDatabaseFieldId(key, `${path}.columnWidths`);
    requireField(db, fieldId, `${path}.columnWidths`);
    columnWidths[fieldId] = assertSafeInteger(widthsInput[key], `${path}.columnWidths.${key}`, {
      min: CANVAS_DATABASE_MIN_COLUMN_WIDTH,
      max: CANVAS_DATABASE_MAX_COLUMN_WIDTH,
    });
  }

  let kanbanFieldId: CanvasDatabaseFieldId | null = null;
  if (viewKind === 'kanban') {
    if (input.kanbanFieldId === undefined || input.kanbanFieldId === null) {
      fail(
        'unsupported-value',
        `${path}.kanbanFieldId`,
        'kanban views require a select or status grouping field',
      );
    }
    const fieldId = parseCanvasDatabaseFieldId(input.kanbanFieldId, `${path}.kanbanFieldId`);
    const field = requireField(db, fieldId, `${path}.kanbanFieldId`);
    if (field.type !== 'select' && field.type !== 'status') {
      fail(
        'unsupported-value',
        `${path}.kanbanFieldId`,
        'kanban grouping field must be a select or status field',
      );
    }
    kanbanFieldId = fieldId;
  }

  let calendarDateFieldId: CanvasDatabaseFieldId | null = null;
  if (viewKind === 'calendar') {
    if (input.calendarDateFieldId === undefined || input.calendarDateFieldId === null) {
      fail(
        'unsupported-value',
        `${path}.calendarDateFieldId`,
        'calendar views require a date field',
      );
    }
    const fieldId = parseCanvasDatabaseFieldId(
      input.calendarDateFieldId,
      `${path}.calendarDateFieldId`,
    );
    const field = requireField(db, fieldId, `${path}.calendarDateFieldId`);
    if (field.type !== 'date') {
      fail(
        'unsupported-value',
        `${path}.calendarDateFieldId`,
        'calendar field must be a date field',
      );
    }
    calendarDateFieldId = fieldId;
  }

  return deepFreeze({
    id,
    name,
    kind: viewKind,
    sortRules,
    filters,
    groupByFieldId,
    hiddenFieldIds,
    columnWidths,
    kanbanFieldId,
    calendarDateFieldId,
  });
}

function normalizeTemplate(
  db: CanvasDatabase,
  input: unknown,
  path: string,
): CanvasDatabaseRecordTemplate {
  if (!isPlainObject(input)) {
    fail('invalid-type', path, 'expected a template object');
  }
  const id = parseCanvasDatabaseTemplateId(input.id, `${path}.id`);
  const name = normalizeName(input.name, `${path}.name`);
  const cells = normalizeCells(db, input.cells, path);
  return deepFreeze({ id, name, cells });
}
// ---------------------------------------------------------------------------
// Factories and accessors
// ---------------------------------------------------------------------------

export function createCanvasDatabase(input: CreateCanvasDatabaseInput): CanvasDatabase {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'database', 'expected an input object');
  }
  const id = parseCanvasDatabaseId(input.id, 'database.id');
  const ownerId = assertId(input.ownerId, 'database.ownerId') as CanvasOwnerId;
  const projectId = assertId(input.projectId, 'database.projectId') as CanvasProjectId;
  const name = normalizeName(input.name, 'database.name');
  const now = assertTimestamp(input.now, 'database.now');
  return freezeDatabase({
    schemaVersion: CANVAS_DATABASE_SCHEMA_VERSION,
    id,
    ownerId,
    projectId,
    name,
    fields: [],
    fieldOrder: [],
    records: [],
    recordOrder: [],
    views: [],
    viewOrder: [],
    templates: [],
    templateOrder: [],
    localRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function createCanvasDatabaseField(
  input: CreateCanvasDatabaseFieldInput,
): CanvasDatabaseField {
  return normalizeField(input, 'field');
}

export function databaseFieldById(
  db: CanvasDatabase,
  fieldId: string,
): CanvasDatabaseField | undefined {
  const id = parseCanvasDatabaseFieldId(fieldId);
  return db.fields.find((field) => field.id === id);
}

export function databaseRecordById(
  db: CanvasDatabase,
  recordId: string,
): CanvasDatabaseRecord | undefined {
  const id = parseCanvasDatabaseRecordId(recordId);
  return db.records.find((record) => record.id === id);
}

export function databaseViewById(
  db: CanvasDatabase,
  viewId: string,
): CanvasDatabaseView | undefined {
  const id = parseCanvasDatabaseViewId(viewId);
  return db.views.find((view) => view.id === id);
}

// ---------------------------------------------------------------------------
// Field transitions
// ---------------------------------------------------------------------------

export function withFieldAdded(
  db: CanvasDatabase,
  input: CreateCanvasDatabaseFieldInput,
  now: number,
  atIndex?: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const field = normalizeField(input, 'field');
  if (db.fields.some((existing) => existing.id === field.id)) {
    fail('duplicate-id', 'fields', `duplicate field id "${field.id}"`);
  }
  if (db.fields.some((existing) => existing.name === field.name)) {
    fail('duplicate-id', 'fields', `duplicate field name "${field.name}"`);
  }
  if (db.fields.length >= CANVAS_DATABASE_MAX_FIELDS) {
    fail('unsupported-value', 'fields', `too many fields (max ${CANVAS_DATABASE_MAX_FIELDS})`);
  }
  const index =
    atIndex === undefined
      ? db.fields.length
      : assertSafeInteger(atIndex, 'atIndex', { min: 0, max: db.fields.length });
  const fields = [...db.fields.slice(0, index), field, ...db.fields.slice(index)];
  const fieldOrder = [...db.fieldOrder.slice(0, index), field.id, ...db.fieldOrder.slice(index)];
  const records = db.records.map((record) => ({
    ...record,
    cells: { ...record.cells, [field.id]: defaultCellForField(field) },
  }));
  const templates = db.templates.map((template) => ({
    ...template,
    cells: { ...template.cells, [field.id]: defaultCellForField(field) },
  }));
  return transition(db, { fields, fieldOrder, records, templates }, now);
}

function omitWidthKey(
  widths: Readonly<Record<string, number>>,
  key: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const widthKey of Object.keys(widths)) {
    if (widthKey !== key) result[widthKey] = widths[widthKey];
  }
  return result;
}

function cleanViewField(
  view: CanvasDatabaseView,
  removedId: CanvasDatabaseFieldId,
): CanvasDatabaseView {
  return {
    ...view,
    sortRules: view.sortRules.filter((rule) => rule.fieldId !== removedId),
    filters: view.filters.filter((filter) => filter.fieldId !== removedId),
    groupByFieldId: view.groupByFieldId === removedId ? null : view.groupByFieldId,
    hiddenFieldIds: view.hiddenFieldIds.filter((fieldId) => fieldId !== removedId),
    columnWidths: omitWidthKey(view.columnWidths, removedId),
    kanbanFieldId: view.kanbanFieldId === removedId ? null : view.kanbanFieldId,
    calendarDateFieldId: view.calendarDateFieldId === removedId ? null : view.calendarDateFieldId,
  };
}

export function withFieldRemoved(db: CanvasDatabase, fieldId: string, now: number): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseFieldId(fieldId);
  if (!db.fields.some((field) => field.id === id)) {
    fail('invalid-reference', 'fields', `references unknown field "${fieldId}"`);
  }
  const requiredByView = db.views.find(
    (view) => view.kanbanFieldId === id || view.calendarDateFieldId === id,
  );
  if (requiredByView) {
    fail(
      'invalid-reference',
      'fields',
      `field "${fieldId}" is required by ${requiredByView.kind} view "${requiredByView.id}"`,
    );
  }
  const fields = db.fields.filter((field) => field.id !== id);
  const fieldOrder = db.fieldOrder.filter((candidate) => candidate !== id);
  const records = db.records.map((record) => {
    const cells: Record<string, CanvasDatabaseCellValue> = { ...record.cells };
    delete cells[id];
    return { ...record, cells };
  });
  const templates = db.templates.map((template) => {
    const cells: Record<string, CanvasDatabaseCellValue> = { ...template.cells };
    delete cells[id];
    return { ...template, cells };
  });
  const views = db.views.map((view) => cleanViewField(view, id));
  return transition(db, { fields, fieldOrder, records, templates, views }, now);
}

export function withFieldRenamed(
  db: CanvasDatabase,
  fieldId: string,
  name: string,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseFieldId(fieldId);
  const index = db.fields.findIndex((field) => field.id === id);
  if (index < 0) {
    fail('invalid-reference', 'fields', `references unknown field "${fieldId}"`);
  }
  const newName = normalizeName(name, 'name');
  if (db.fields.some((field) => field.id !== id && field.name === newName)) {
    fail('duplicate-id', 'fields', `duplicate field name "${newName}"`);
  }
  const fields = db.fields.map((field) => (field.id === id ? { ...field, name: newName } : field));
  return transition(db, { fields }, now);
}
// ---------------------------------------------------------------------------
// Record transitions
// ---------------------------------------------------------------------------

export function withRecordAdded(
  db: CanvasDatabase,
  input: CreateCanvasDatabaseRecordInput,
  now: number,
  atIndex?: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  if (db.records.length >= CANVAS_DATABASE_MAX_RECORDS) {
    fail('unsupported-value', 'records', `too many records (max ${CANVAS_DATABASE_MAX_RECORDS})`);
  }
  const record = normalizeRecord(db, input, 'record', now);
  if (db.records.some((existing) => existing.id === record.id)) {
    fail('duplicate-id', 'records', `duplicate record id "${record.id}"`);
  }
  const index =
    atIndex === undefined
      ? db.records.length
      : assertSafeInteger(atIndex, 'atIndex', { min: 0, max: db.records.length });
  const records = [...db.records.slice(0, index), record, ...db.records.slice(index)];
  const recordOrder = [
    ...db.recordOrder.slice(0, index),
    record.id,
    ...db.recordOrder.slice(index),
  ];
  return transition(db, { records, recordOrder }, now);
}

function cleanRelationRefs(
  record: CanvasDatabaseRecord,
  removedId: CanvasDatabaseRecordId,
  relationFieldIds: readonly CanvasDatabaseFieldId[],
): CanvasDatabaseRecord {
  if (relationFieldIds.length === 0) return record;
  let changed = false;
  const cells: Record<string, CanvasDatabaseCellValue> = { ...record.cells };
  for (const fieldId of relationFieldIds) {
    const cell = cells[fieldId];
    if (cell.type === 'relation' && cell.recordIds.includes(removedId)) {
      cells[fieldId] = {
        type: 'relation',
        recordIds: cell.recordIds.filter((candidate) => candidate !== removedId),
      };
      changed = true;
    }
  }
  return changed ? { ...record, cells } : record;
}

export function withRecordRemoved(
  db: CanvasDatabase,
  recordId: string,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseRecordId(recordId);
  if (!db.records.some((record) => record.id === id)) {
    fail('invalid-reference', 'records', `references unknown record "${recordId}"`);
  }
  const relationFieldIds = db.fields
    .filter((field) => field.type === 'relation' && field.relatedDatabaseId === db.id)
    .map((field) => field.id);
  const records = db.records
    .filter((record) => record.id !== id)
    .map((record) => cleanRelationRefs(record, id, relationFieldIds));
  const recordOrder = db.recordOrder.filter((candidate) => candidate !== id);
  return transition(db, { records, recordOrder }, now);
}

export function withRecordCellUpdated(
  db: CanvasDatabase,
  recordId: string,
  fieldId: string,
  value: CanvasDatabaseCellValue,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const rid = parseCanvasDatabaseRecordId(recordId);
  const fid = parseCanvasDatabaseFieldId(fieldId);
  const recordIndex = db.records.findIndex((record) => record.id === rid);
  if (recordIndex < 0) {
    fail('invalid-reference', 'records', `references unknown record "${recordId}"`);
  }
  const field = db.fields.find((candidate) => candidate.id === fid);
  if (!field) {
    fail('invalid-reference', 'fields', `references unknown field "${fieldId}"`);
  }
  const cell = normalizeCell(field, value, 'cell');
  const records = db.records.map((record, index) =>
    index === recordIndex
      ? { ...record, cells: { ...record.cells, [fid]: cell }, updatedAt: now }
      : record,
  );
  return transition(db, { records }, now);
}

export function withRecordLinked(
  db: CanvasDatabase,
  recordId: string,
  link: CanvasDatabaseObjectLinkInput,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const rid = parseCanvasDatabaseRecordId(recordId);
  const recordIndex = db.records.findIndex((record) => record.id === rid);
  if (recordIndex < 0) {
    fail('invalid-reference', 'records', `references unknown record "${recordId}"`);
  }
  const normalized = normalizeLink(db, link, 'link');
  const record = db.records[recordIndex];
  if (record.links.some((existing) => existing.id === normalized.id)) {
    fail('duplicate-id', 'links', `duplicate target link "${normalized.id}"`);
  }
  if (record.links.length >= CANVAS_DATABASE_MAX_LINKS) {
    fail('unsupported-value', 'links', `too many links (max ${CANVAS_DATABASE_MAX_LINKS})`);
  }
  const records = db.records.map((candidate, index) =>
    index === recordIndex
      ? { ...candidate, links: [...candidate.links, normalized], updatedAt: now }
      : candidate,
  );
  return transition(db, { records }, now);
}

export function withRecordUnlinked(
  db: CanvasDatabase,
  recordId: string,
  targetId: string,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const rid = parseCanvasDatabaseRecordId(recordId);
  const target = assertId(targetId, 'targetId');
  const recordIndex = db.records.findIndex((record) => record.id === rid);
  if (recordIndex < 0) {
    fail('invalid-reference', 'records', `references unknown record "${recordId}"`);
  }
  const record = db.records[recordIndex];
  if (!record.links.some((link) => link.id === target)) {
    fail('invalid-reference', 'links', `references unknown link "${targetId}"`);
  }
  const records = db.records.map((candidate, index) =>
    index === recordIndex
      ? {
          ...candidate,
          links: candidate.links.filter((link) => link.id !== target),
          updatedAt: now,
        }
      : candidate,
  );
  return transition(db, { records }, now);
}
// ---------------------------------------------------------------------------
// View transitions
// ---------------------------------------------------------------------------

export function withViewAdded(
  db: CanvasDatabase,
  input: CreateCanvasDatabaseViewInput,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const view = normalizeView(db, input, 'view');
  if (db.views.some((existing) => existing.id === view.id)) {
    fail('duplicate-id', 'views', `duplicate view id "${view.id}"`);
  }
  if (db.views.some((existing) => existing.name === view.name)) {
    fail('duplicate-id', 'views', `duplicate view name "${view.name}"`);
  }
  if (db.views.length >= CANVAS_DATABASE_MAX_VIEWS) {
    fail('unsupported-value', 'views', `too many views (max ${CANVAS_DATABASE_MAX_VIEWS})`);
  }
  return transition(db, { views: [...db.views, view], viewOrder: [...db.viewOrder, view.id] }, now);
}

export function withViewRemoved(db: CanvasDatabase, viewId: string, now: number): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseViewId(viewId);
  if (!db.views.some((view) => view.id === id)) {
    fail('invalid-reference', 'views', `references unknown view "${viewId}"`);
  }
  return transition(
    db,
    {
      views: db.views.filter((view) => view.id !== id),
      viewOrder: db.viewOrder.filter((candidate) => candidate !== id),
    },
    now,
  );
}

export function withViewUpdated(
  db: CanvasDatabase,
  viewId: string,
  changes: CanvasDatabaseViewChangesInput,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseViewId(viewId);
  const view = db.views.find((candidate) => candidate.id === id);
  if (!view) {
    fail('invalid-reference', 'views', `references unknown view "${viewId}"`);
  }
  const merged: CreateCanvasDatabaseViewInput = {
    id: view.id,
    name: view.name,
    kind: view.kind,
    sortRules: changes.sortRules === undefined ? view.sortRules : changes.sortRules,
    filters: changes.filters === undefined ? view.filters : changes.filters,
    groupByFieldId:
      changes.groupByFieldId === undefined ? view.groupByFieldId : changes.groupByFieldId,
    hiddenFieldIds:
      changes.hiddenFieldIds === undefined ? view.hiddenFieldIds : changes.hiddenFieldIds,
    columnWidths: changes.columnWidths === undefined ? view.columnWidths : changes.columnWidths,
    kanbanFieldId: view.kanbanFieldId,
    calendarDateFieldId: view.calendarDateFieldId,
  };
  const normalized = normalizeView(db, merged, 'view');
  const views = db.views.map((candidate) => (candidate.id === id ? normalized : candidate));
  return transition(db, { views }, now);
}

// ---------------------------------------------------------------------------
// Template transitions
// ---------------------------------------------------------------------------

export function withTemplateAdded(
  db: CanvasDatabase,
  input: CreateCanvasDatabaseRecordTemplateInput,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const template = normalizeTemplate(db, input, 'template');
  if (db.templates.some((existing) => existing.id === template.id)) {
    fail('duplicate-id', 'templates', `duplicate template id "${template.id}"`);
  }
  if (db.templates.some((existing) => existing.name === template.name)) {
    fail('duplicate-id', 'templates', `duplicate template name "${template.name}"`);
  }
  if (db.templates.length >= CANVAS_DATABASE_MAX_TEMPLATES) {
    fail(
      'unsupported-value',
      'templates',
      `too many templates (max ${CANVAS_DATABASE_MAX_TEMPLATES})`,
    );
  }
  return transition(
    db,
    { templates: [...db.templates, template], templateOrder: [...db.templateOrder, template.id] },
    now,
  );
}

export function withTemplateRemoved(
  db: CanvasDatabase,
  templateId: string,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const id = parseCanvasDatabaseTemplateId(templateId);
  if (!db.templates.some((template) => template.id === id)) {
    fail('invalid-reference', 'templates', `references unknown template "${templateId}"`);
  }
  return transition(
    db,
    {
      templates: db.templates.filter((template) => template.id !== id),
      templateOrder: db.templateOrder.filter((candidate) => candidate !== id),
    },
    now,
  );
}

export function withRecordFromTemplate(
  db: CanvasDatabase,
  templateId: string,
  recordId: string,
  now: number,
): CanvasDatabase {
  assertTransitionTimestamp(db, now);
  const tid = parseCanvasDatabaseTemplateId(templateId);
  const template = db.templates.find((candidate) => candidate.id === tid);
  if (!template) {
    fail('invalid-reference', 'templates', `references unknown template "${templateId}"`);
  }
  const rid = parseCanvasDatabaseRecordId(recordId);
  if (db.records.some((record) => record.id === rid)) {
    fail('duplicate-id', 'records', `duplicate record id "${recordId}"`);
  }
  if (db.records.length >= CANVAS_DATABASE_MAX_RECORDS) {
    fail('unsupported-value', 'records', `too many records (max ${CANVAS_DATABASE_MAX_RECORDS})`);
  }
  const record = deepFreeze({
    id: rid,
    cells: template.cells,
    links: [] as readonly CanvasDatabaseObjectLink[],
    createdAt: now,
    updatedAt: now,
  });
  return transition(
    db,
    { records: [...db.records, record], recordOrder: [...db.recordOrder, rid] },
    now,
  );
}
// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export interface CanvasDatabaseColumn {
  readonly fieldId: CanvasDatabaseFieldId;
  readonly name: string;
  readonly type: CanvasDatabaseFieldType;
  readonly width: number;
}

export interface CanvasDatabaseGroup {
  readonly key: string;
  readonly label: string;
  readonly recordIds: readonly CanvasDatabaseRecordId[];
}

export interface CanvasDatabaseKanbanColumn {
  readonly optionId: string | null;
  readonly label: string;
  readonly records: readonly CanvasDatabaseRecord[];
}

export interface CanvasDatabaseCalendarEntry {
  readonly date: string | null;
  readonly records: readonly CanvasDatabaseRecord[];
}

export type CanvasDatabaseViewProjection =
  | {
      readonly kind: 'table';
      readonly viewId: CanvasDatabaseViewId;
      readonly columns: readonly CanvasDatabaseColumn[];
      readonly rows: readonly CanvasDatabaseRecord[];
      readonly groups: readonly CanvasDatabaseGroup[];
    }
  | {
      readonly kind: 'cards';
      readonly viewId: CanvasDatabaseViewId;
      readonly cards: readonly CanvasDatabaseRecord[];
      readonly groups: readonly CanvasDatabaseGroup[];
    }
  | {
      readonly kind: 'list';
      readonly viewId: CanvasDatabaseViewId;
      readonly items: readonly CanvasDatabaseRecord[];
      readonly groups: readonly CanvasDatabaseGroup[];
    }
  | {
      readonly kind: 'kanban';
      readonly viewId: CanvasDatabaseViewId;
      readonly columns: readonly CanvasDatabaseKanbanColumn[];
    }
  | {
      readonly kind: 'calendar';
      readonly viewId: CanvasDatabaseViewId;
      readonly entries: readonly CanvasDatabaseCalendarEntry[];
    };

export type CanvasDatabaseReferenceResolver = (id: string) => CanvasDatabase | undefined;

function cellIsEmpty(cell: CanvasDatabaseCellValue): boolean {
  switch (cell.type) {
    case 'text':
      return cell.text === '';
    case 'url':
      return cell.url === null || cell.url === '';
    case 'number':
      return false;
    case 'checkbox':
      return false;
    case 'select':
    case 'status':
      return cell.optionId === null;
    case 'multi-select':
      return cell.optionIds.length === 0;
    case 'date':
      return cell.date === null;
    case 'file':
      return cell.file === null;
    case 'relation':
      return cell.recordIds.length === 0;
    default:
      return false;
  }
}

export function evaluateDatabaseFilter(
  field: CanvasDatabaseField,
  cell: CanvasDatabaseCellValue,
  filter: CanvasDatabaseFilterInput,
): boolean {
  if (filter.fieldId !== field.id) {
    fail('invalid-reference', 'filter.fieldId', `filter does not match field "${field.id}"`);
  }
  assertOperatorForType(field.type, filter.operator, 'filter.operator');
  const value = normalizeFilterValue(field, filter.operator, filter.value, 'filter.value');
  switch (filter.operator) {
    case 'isEmpty':
      return cellIsEmpty(cell);
    case 'isNotEmpty':
      return !cellIsEmpty(cell);
    case 'equals':
      if (cell.type === 'text') return cell.text === value;
      if (cell.type === 'url') return cell.url === value;
      if (cell.type === 'number') return cell.value === value;
      return false;
    case 'notEquals':
      if (cell.type === 'text') return cell.text !== value;
      if (cell.type === 'url') return cell.url !== value;
      if (cell.type === 'number') return cell.value !== value;
      return true;
    case 'contains':
      if (cell.type === 'text') return cell.text.includes(String(value));
      if (cell.type === 'url') return (cell.url ?? '').includes(String(value));
      if (cell.type === 'multi-select') return cell.optionIds.includes(String(value));
      if (cell.type === 'relation') return cell.recordIds.includes(String(value));
      return false;
    case 'greaterThan':
      return cell.type === 'number' && cell.value > Number(value);
    case 'lessThan':
      return cell.type === 'number' && cell.value < Number(value);
    case 'is':
      if (cell.type === 'checkbox') return cell.checked === value;
      if (cell.type === 'select' || cell.type === 'status') return cell.optionId === value;
      return false;
    case 'isNot':
      if (cell.type === 'select' || cell.type === 'status') return cell.optionId !== value;
      return false;
    case 'before':
      return cell.type === 'date' && cell.date !== null && cell.date < String(value);
    case 'after':
      return cell.type === 'date' && cell.date !== null && cell.date > String(value);
    default:
      return false;
  }
}

function optionIndex(field: CanvasDatabaseField, optionId: string | null): number {
  if (optionId === null) return -1;
  return field.options.findIndex((option) => option.id === optionId);
}

function compareCells(
  field: CanvasDatabaseField,
  a: CanvasDatabaseCellValue,
  b: CanvasDatabaseCellValue,
): number {
  switch (field.type) {
    case 'text':
      if (a.type === 'text' && b.type === 'text')
        return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
      return 0;
    case 'url': {
      const av = a.type === 'url' ? (a.url ?? '') : '';
      const bv = b.type === 'url' ? (b.url ?? '') : '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    case 'number':
      if (a.type === 'number' && b.type === 'number') {
        return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      }
      return 0;
    case 'checkbox': {
      const av = a.type === 'checkbox' && a.checked ? 1 : 0;
      const bv = b.type === 'checkbox' && b.checked ? 1 : 0;
      return av - bv;
    }
    case 'select':
    case 'status': {
      const av = a.type === 'select' || a.type === 'status' ? optionIndex(field, a.optionId) : -1;
      const bv = b.type === 'select' || b.type === 'status' ? optionIndex(field, b.optionId) : -1;
      return av - bv;
    }
    case 'multi-select': {
      const av = a.type === 'multi-select' ? a.optionIds.join(',') : '';
      const bv = b.type === 'multi-select' ? b.optionIds.join(',') : '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    case 'date': {
      const av = a.type === 'date' ? (a.date ?? '') : '';
      const bv = b.type === 'date' ? (b.date ?? '') : '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    case 'file': {
      const av = a.type === 'file' ? (a.file?.name ?? '') : '';
      const bv = b.type === 'file' ? (b.file?.name ?? '') : '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    case 'relation': {
      const av = a.type === 'relation' ? a.recordIds.join(',') : '';
      const bv = b.type === 'relation' ? b.recordIds.join(',') : '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    default:
      return 0;
  }
}

function sortRecords(
  records: readonly CanvasDatabaseRecord[],
  sortRules: readonly CanvasDatabaseSortRule[],
  fieldsById: ReadonlyMap<string, CanvasDatabaseField>,
): readonly CanvasDatabaseRecord[] {
  if (sortRules.length === 0) return records;
  return [...records].sort((a, b) => {
    for (const rule of sortRules) {
      const field = fieldsById.get(rule.fieldId);
      if (!field) continue;
      const cmp = compareCells(field, a.cells[field.id], b.cells[field.id]);
      if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function filterRecords(
  records: readonly CanvasDatabaseRecord[],
  filters: readonly CanvasDatabaseFilter[],
  fieldsById: ReadonlyMap<string, CanvasDatabaseField>,
): readonly CanvasDatabaseRecord[] {
  if (filters.length === 0) return records;
  return records.filter((record) =>
    filters.every((filter) => {
      const field = fieldsById.get(filter.fieldId);
      if (!field) return false;
      return evaluateDatabaseFilter(field, record.cells[field.id], filter);
    }),
  );
}
function cellGroupKey(field: CanvasDatabaseField, cell: CanvasDatabaseCellValue): string {
  switch (cell.type) {
    case 'text':
      return cell.text;
    case 'url':
      return cell.url ?? '';
    case 'number':
      return String(cell.value);
    case 'checkbox':
      return cell.checked ? 'true' : 'false';
    case 'date':
      return cell.date ?? '';
    case 'file':
      return cell.file?.name ?? '';
    case 'multi-select':
      return cell.optionIds.join(',');
    case 'relation':
      return cell.recordIds.join(',');
    case 'select':
    case 'status':
      return cell.optionId ?? '';
    default:
      return '';
  }
}

function computeGroups(
  records: readonly CanvasDatabaseRecord[],
  groupField: CanvasDatabaseField | undefined,
): CanvasDatabaseGroup[] {
  if (!groupField) return [];
  if (groupField.type === 'select' || groupField.type === 'status') {
    const groups: CanvasDatabaseGroup[] = groupField.options.map((option) => ({
      key: option.id,
      label: option.label,
      recordIds: records
        .filter((record) => {
          const cell = record.cells[groupField.id];
          return (cell.type === 'select' || cell.type === 'status') && cell.optionId === option.id;
        })
        .map((record) => record.id),
    }));
    const ungrouped = records
      .filter((record) => {
        const cell = record.cells[groupField.id];
        return (cell.type === 'select' || cell.type === 'status') && cell.optionId === null;
      })
      .map((record) => record.id);
    if (ungrouped.length > 0) {
      groups.push({ key: '', label: 'Ungrouped', recordIds: ungrouped });
    }
    return groups;
  }
  const byKey = new Map<string, CanvasDatabaseRecordId[]>();
  for (const record of records) {
    const key = cellGroupKey(groupField, record.cells[groupField.id]);
    const list = byKey.get(key);
    if (list) list.push(record.id);
    else byKey.set(key, [record.id]);
  }
  const groups: CanvasDatabaseGroup[] = Array.from(byKey.keys())
    .filter((key) => key !== '')
    .sort()
    .map((key) => ({ key, label: key, recordIds: byKey.get(key)! }));
  const emptyKey = byKey.get('');
  if (emptyKey && emptyKey.length > 0) {
    groups.push({ key: '', label: 'Ungrouped', recordIds: emptyKey });
  }
  return groups;
}

export function projectDatabaseView(
  db: CanvasDatabase,
  viewId: string,
): CanvasDatabaseViewProjection {
  const vid = parseCanvasDatabaseViewId(viewId);
  const view = db.views.find((candidate) => candidate.id === vid);
  if (!view) {
    fail('invalid-reference', 'viewId', `references unknown view "${viewId}"`);
  }
  const fieldsById = new Map<string, CanvasDatabaseField>(
    db.fields.map((field) => [field.id, field]),
  );
  const recordsById = new Map<string, CanvasDatabaseRecord>(
    db.records.map((record) => [record.id, record]),
  );
  const inOrder = db.recordOrder
    .map((id) => recordsById.get(id))
    .filter((record): record is CanvasDatabaseRecord => record !== undefined);
  const filtered = filterRecords(inOrder, view.filters, fieldsById);
  const sorted = sortRecords(filtered, view.sortRules, fieldsById);

  if (view.kind === 'kanban') {
    const field = view.kanbanFieldId ? fieldsById.get(view.kanbanFieldId) : undefined;
    if (!field || (field.type !== 'select' && field.type !== 'status')) {
      fail('invalid-reference', 'view.kanbanFieldId', 'kanban view requires a select/status field');
    }
    const kanbanField = field;
    const columns: CanvasDatabaseKanbanColumn[] = kanbanField.options.map((option) => ({
      optionId: option.id,
      label: option.label,
      records: sorted.filter((record) => {
        const cell = record.cells[kanbanField.id];
        return (cell.type === 'select' || cell.type === 'status') && cell.optionId === option.id;
      }),
    }));
    columns.push({
      optionId: null,
      label: 'Ungrouped',
      records: sorted.filter((record) => {
        const cell = record.cells[kanbanField.id];
        return (cell.type === 'select' || cell.type === 'status') && cell.optionId === null;
      }),
    });
    return deepFreeze({ kind: 'kanban', viewId: vid, columns });
  }

  if (view.kind === 'calendar') {
    const field = view.calendarDateFieldId ? fieldsById.get(view.calendarDateFieldId) : undefined;
    if (!field || field.type !== 'date') {
      fail('invalid-reference', 'view.calendarDateFieldId', 'calendar view requires a date field');
    }
    const dateField = field;
    const dated: { date: string; record: CanvasDatabaseRecord }[] = [];
    const undated: CanvasDatabaseRecord[] = [];
    for (const record of sorted) {
      const cell = record.cells[dateField.id];
      if (cell.type === 'date' && cell.date !== null) dated.push({ date: cell.date, record });
      else undated.push(record);
    }
    const dates = Array.from(new Set(dated.map((entry) => entry.date))).sort();
    const entries: CanvasDatabaseCalendarEntry[] = dates.map((date) => ({
      date,
      records: dated.filter((entry) => entry.date === date).map((entry) => entry.record),
    }));
    if (undated.length > 0) entries.push({ date: null, records: undated });
    return deepFreeze({ kind: 'calendar', viewId: vid, entries });
  }

  const visibleFields = db.fields.filter((field) => !view.hiddenFieldIds.includes(field.id));
  const columns: CanvasDatabaseColumn[] = visibleFields.map((field) => ({
    fieldId: field.id,
    name: field.name,
    type: field.type,
    width: view.columnWidths[field.id] ?? CANVAS_DATABASE_DEFAULT_COLUMN_WIDTH,
  }));
  const groupField = view.groupByFieldId ? fieldsById.get(view.groupByFieldId) : undefined;
  const groups = computeGroups(sorted, groupField);
  const rows =
    groups.length > 0
      ? groups.flatMap((group) =>
          group.recordIds
            .map((id) => recordsById.get(id))
            .filter((record): record is CanvasDatabaseRecord => record !== undefined),
        )
      : sorted;
  if (view.kind === 'table') {
    return deepFreeze({ kind: 'table', viewId: vid, columns, rows, groups });
  }
  if (view.kind === 'cards') {
    return deepFreeze({ kind: 'cards', viewId: vid, cards: rows, groups });
  }
  return deepFreeze({ kind: 'list', viewId: vid, items: rows, groups });
}

// ---------------------------------------------------------------------------
// Scope and reference validation
// ---------------------------------------------------------------------------

export function assertDatabaseScope(
  db: CanvasDatabase,
  ownerId: CanvasOwnerId,
  projectId: CanvasProjectId,
): CanvasDatabase {
  if (db.ownerId !== ownerId || db.projectId !== projectId) {
    fail('invalid-reference', 'database', 'account/project scope mismatch');
  }
  return db;
}

export function validateDatabaseReferences(
  db: CanvasDatabase,
  resolveDatabase: CanvasDatabaseReferenceResolver,
): CanvasDatabase {
  for (const field of db.fields) {
    if (field.type !== 'relation') continue;
    const targetId = field.relatedDatabaseId;
    if (targetId === null) {
      fail('invalid-reference', `fields.${field.id}`, 'relation field has no target database');
    }
    const target = resolveDatabase(targetId);
    if (!target) {
      fail('invalid-reference', `fields.${field.id}`, `related database "${targetId}" is missing`);
    }
    if (target.ownerId !== db.ownerId || target.projectId !== db.projectId) {
      fail(
        'invalid-reference',
        `fields.${field.id}`,
        `related database "${targetId}" is out of scope`,
      );
    }
    const targetRecordIds = new Set<string>(target.records.map((record) => record.id));
    for (const record of db.records) {
      const cell = record.cells[field.id];
      if (cell.type !== 'relation') continue;
      for (const refId of cell.recordIds) {
        if (!targetRecordIds.has(refId)) {
          fail(
            'invalid-reference',
            `records.${record.id}.${field.id}`,
            `references unknown record "${refId}"`,
          );
        }
      }
    }
  }
  return db;
}

// ---------------------------------------------------------------------------
// Structural guard
// ---------------------------------------------------------------------------

export function isCanvasDatabase(value: unknown): value is CanvasDatabase {
  try {
    if (!isPlainObject(value)) return false;
    if (value.schemaVersion !== CANVAS_DATABASE_SCHEMA_VERSION) return false;
    const id = parseCanvasDatabaseId(value.id);
    const ownerId = assertId(value.ownerId, 'database.ownerId') as CanvasOwnerId;
    const projectId = assertId(value.projectId, 'database.projectId') as CanvasProjectId;
    const name = normalizeName(value.name, 'database.name');
    if (name !== value.name) return false;
    const createdAt = assertTimestamp(value.createdAt, 'database.createdAt');
    const updatedAt = assertTimestamp(value.updatedAt, 'database.updatedAt');
    if (updatedAt < createdAt) return false;
    const localRevision = assertSafeInteger(value.localRevision, 'database.localRevision', {
      min: 0,
    });

    if (
      !Array.isArray(value.fields) ||
      !Array.isArray(value.fieldOrder) ||
      value.fields.length > CANVAS_DATABASE_MAX_FIELDS ||
      value.fields.length !== value.fieldOrder.length
    ) {
      return false;
    }
    const fields = value.fields.map((field, index) =>
      normalizeField(field, `database.fields[${index}]`),
    );
    const fieldOrder = value.fieldOrder as unknown[];
    if (new Set(fields.map((field) => field.id)).size !== fields.length) return false;
    if (new Set(fields.map((field) => field.name)).size !== fields.length) return false;
    if (fields.some((field, index) => field.id !== fieldOrder[index])) return false;

    const shell: CanvasDatabase = {
      schemaVersion: CANVAS_DATABASE_SCHEMA_VERSION,
      id,
      ownerId,
      projectId,
      name,
      fields,
      fieldOrder: fields.map((field) => field.id),
      records: [],
      recordOrder: [],
      views: [],
      viewOrder: [],
      templates: [],
      templateOrder: [],
      localRevision,
      createdAt,
      updatedAt,
    };

    if (
      !Array.isArray(value.records) ||
      !Array.isArray(value.recordOrder) ||
      value.records.length > CANVAS_DATABASE_MAX_RECORDS ||
      value.records.length !== value.recordOrder.length
    ) {
      return false;
    }
    const records = value.records.map((record, index) => {
      if (!isPlainObject(record)) {
        fail('invalid-type', `database.records[${index}]`, 'expected a record object');
      }
      const recordCreatedAt = assertTimestamp(
        record.createdAt,
        `database.records[${index}].createdAt`,
      );
      const recordUpdatedAt = assertTimestamp(
        record.updatedAt,
        `database.records[${index}].updatedAt`,
      );
      if (
        recordCreatedAt < createdAt ||
        recordUpdatedAt < recordCreatedAt ||
        recordUpdatedAt > updatedAt
      ) {
        fail(
          'invalid-timestamp',
          `database.records[${index}]`,
          'record timestamps are inconsistent',
        );
      }
      return normalizeRecord(shell, record, `database.records[${index}]`, recordCreatedAt);
    });
    const recordOrder = value.recordOrder as unknown[];
    if (new Set(records.map((record) => record.id)).size !== records.length) return false;
    if (records.some((record, index) => record.id !== recordOrder[index])) return false;

    const recordShell: CanvasDatabase = {
      ...shell,
      records,
      recordOrder: records.map((record) => record.id),
    };
    for (const field of fields) {
      if (field.type !== 'relation' || field.relatedDatabaseId !== id) continue;
      const recordIds = new Set<string>(records.map((record) => record.id));
      for (const record of records) {
        const cell = record.cells[field.id];
        if (
          cell.type !== 'relation' ||
          cell.recordIds.some((recordId) => !recordIds.has(recordId))
        ) {
          return false;
        }
      }
    }

    if (
      !Array.isArray(value.views) ||
      !Array.isArray(value.viewOrder) ||
      value.views.length > CANVAS_DATABASE_MAX_VIEWS ||
      value.views.length !== value.viewOrder.length
    ) {
      return false;
    }
    const views = value.views.map((view, index) =>
      normalizeView(recordShell, view, `database.views[${index}]`),
    );
    const viewOrder = value.viewOrder as unknown[];
    if (new Set(views.map((view) => view.id)).size !== views.length) return false;
    if (new Set(views.map((view) => view.name)).size !== views.length) return false;
    if (views.some((view, index) => view.id !== viewOrder[index])) return false;

    if (
      !Array.isArray(value.templates) ||
      !Array.isArray(value.templateOrder) ||
      value.templates.length > CANVAS_DATABASE_MAX_TEMPLATES ||
      value.templates.length !== value.templateOrder.length
    ) {
      return false;
    }
    const templates = value.templates.map((template, index) =>
      normalizeTemplate(recordShell, template, `database.templates[${index}]`),
    );
    const templateOrder = value.templateOrder as unknown[];
    if (new Set(templates.map((template) => template.id)).size !== templates.length) return false;
    if (new Set(templates.map((template) => template.name)).size !== templates.length) return false;
    if (templates.some((template, index) => template.id !== templateOrder[index])) return false;

    return true;
  } catch {
    return false;
  }
}
