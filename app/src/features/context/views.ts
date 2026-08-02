import type { DeepReadonly } from './contracts';

export const CONTEXT_VIEW_TYPES = [
  'table',
  'list',
  'cards',
  'kanban',
  'calendar',
  'timeline',
  'graph_subset',
  'map',
] as const;

export type ContextViewType = (typeof CONTEXT_VIEW_TYPES)[number];
export type ContextViewScalar = string | number | boolean;
export type ContextViewPropertyValue = ContextViewScalar | string[];
export type ContextViewComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'in'
  | 'exists';

export interface ContextViewComparisonFilterV1 {
  kind: 'comparison';
  field: string;
  operator: ContextViewComparisonOperator;
  value?: ContextViewPropertyValue;
}

export interface ContextViewBooleanFilterV1 {
  kind: 'and' | 'or';
  operands: ContextViewFilterV1[];
}

export interface ContextViewNegationFilterV1 {
  kind: 'not';
  operand: ContextViewFilterV1;
}

export type ContextViewFilterV1 =
  | ContextViewComparisonFilterV1
  | ContextViewBooleanFilterV1
  | ContextViewNegationFilterV1;

export type ContextViewFormulaExpressionV1 =
  | Readonly<{ kind: 'days_until'; field: string }>
  | Readonly<{ kind: 'stale_age_days'; field: string }>
  | Readonly<{ kind: 'risk_score'; severityField: string; blockerField: string }>
  | Readonly<{
      kind: 'completion_percentage';
      completedField: string;
      totalField: string;
    }>;

export interface ContextViewFormulaV1 {
  name: string;
  expression: ContextViewFormulaExpressionV1;
}

export interface ContextViewSortV1 {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ContextViewFieldV1 {
  field: string;
  visible: boolean;
  order: number;
  width: number;
}

export interface ContextViewAggregateV1 {
  id: string;
  operation: 'count' | 'count_true' | 'sum' | 'average';
  field?: string;
}

export interface ContextSavedViewV1 {
  version: 1;
  id: string;
  mapId: string;
  name: string;
  type: ContextViewType;
  filter?: ContextViewFilterV1;
  sorts: ContextViewSortV1[];
  groupBy?: string;
  pinnedRowIds: string[];
  fields: ContextViewFieldV1[];
  aggregates: ContextViewAggregateV1[];
  formulas: ContextViewFormulaV1[];
  template?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ContextViewRowV1 {
  id: string;
  kind: string;
  title: string;
  path: string;
  sourceId: string;
  updatedAt: number;
  properties: Record<string, ContextViewPropertyValue>;
  latitude?: number;
  longitude?: number;
}

export type ContextSavedViewParseResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextSavedViewV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'view_contract_invalid'
        | 'view_branding_invalid'
        | 'view_filter_invalid'
        | 'view_formula_invalid';
      detail?: string;
    }>;

export type ContextSavedViewExecutionResult =
  | Readonly<{
      ok: true;
      value: DeepReadonly<{
        rows: Array<ContextViewRowV1 & { formulaValues: Record<string, number> }>;
        groups: Array<{ key: string; rowIds: string[] }>;
        visibleFields: Array<{ field: string; order: number; width: number }>;
        aggregates: Record<string, number>;
        operations: ['edit_properties', 'open_source', 'save_as_template', 'duplicate', 'export'];
        exportRows: Array<Record<string, ContextViewPropertyValue | undefined>>;
      }>;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'view_execution_invalid'
        | 'view_input_too_large'
        | 'view_row_invalid'
        | 'map_view_requires_geography';
      detail?: string;
    }>;

const MAX_ROWS = 10_000;
const MAX_FIELDS = 64;
const MAX_SORTS = 16;
const MAX_AGGREGATES = 32;
const MAX_FORMULAS = 32;
const MAX_PINNED_ROWS = 1_000;
const MAX_FILTER_DEPTH = 12;
const MAX_FILTER_NODES = 256;
const MAX_FILTER_OPERANDS = 32;
const MAX_PROPERTIES = 256;
const MAX_PROPERTY_LIST_VALUES = 128;
const MAX_TOTAL_PROPERTY_VALUES = 1_000_000;
const MAX_TEXT = 4_096;
const MAX_NAME = 200;
const MAX_EXPORT_CELLS = 640_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_SNAPSHOT_NODES = 200_000;
const MAX_SNAPSHOT_CHARACTERS = 16 * 1024 * 1024;
const MAX_SNAPSHOT_ARRAY_LENGTH = MAX_ROWS + 1;
const MAX_SNAPSHOT_OBJECT_KEYS = 1_024;
const MAX_EXECUTION_WORK = 50_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const CORE_FIELDS = new Set([
  'id',
  'kind',
  'title',
  'path',
  'source_id',
  'updated_at',
  'latitude',
  'longitude',
]);
const VIEW_TYPES = new Set<string>(CONTEXT_VIEW_TYPES);
const COMPARISON_OPERATORS = new Set<string>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
  'exists',
]);
const UNSAFE_PROPERTY_NAMES = new Set(
  [...Object.getOwnPropertyNames(Object.prototype), '__proto__'].map((name) =>
    name.toLocaleLowerCase('en-US'),
  ),
);

type SnapshotResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; tooLarge: boolean }>;

function snapshotUnknown(value: unknown): SnapshotResult {
  const state = { nodes: 0, characters: 0, tooLarge: false };
  const active = new WeakSet<object>();

  const visit = (entry: unknown): { ok: true; value: unknown } | { ok: false } => {
    if (
      entry === undefined ||
      entry === null ||
      typeof entry === 'boolean' ||
      typeof entry === 'number'
    ) {
      return { ok: true, value: entry };
    }
    if (typeof entry === 'string') {
      state.characters += entry.length;
      if (state.characters > MAX_SNAPSHOT_CHARACTERS) {
        state.tooLarge = true;
        return { ok: false };
      }
      return { ok: true, value: entry };
    }
    if (typeof entry !== 'object') return { ok: false };

    state.nodes += 1;
    if (state.nodes > MAX_SNAPSHOT_NODES) {
      state.tooLarge = true;
      return { ok: false };
    }
    if (active.has(entry)) return { ok: false };
    active.add(entry);
    try {
      const array = Array.isArray(entry);
      const prototype = Object.getPrototypeOf(entry);
      if (
        array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
      ) {
        return { ok: false };
      }
      const keys = Reflect.ownKeys(entry);
      if (keys.some((key) => typeof key !== 'string')) return { ok: false };
      const descriptors = Object.getOwnPropertyDescriptors(entry);

      if (array) {
        const lengthDescriptor = descriptors.length;
        if (
          !lengthDescriptor ||
          !('value' in lengthDescriptor) ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 ||
          lengthDescriptor.value > MAX_SNAPSHOT_ARRAY_LENGTH
        ) {
          if (
            lengthDescriptor &&
            'value' in lengthDescriptor &&
            typeof lengthDescriptor.value === 'number' &&
            lengthDescriptor.value > MAX_SNAPSHOT_ARRAY_LENGTH
          ) {
            state.tooLarge = true;
          }
          return { ok: false };
        }
        const length = lengthDescriptor.value as number;
        if (keys.length !== length + 1) return { ok: false };
        const output: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
            return { ok: false };
          }
          const child = visit(descriptor.value);
          if (!child.ok) return child;
          output.push(child.value);
        }
        return { ok: true, value: output };
      }

      if (keys.length > MAX_SNAPSHOT_OBJECT_KEYS) {
        state.tooLarge = true;
        return { ok: false };
      }
      const output: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          return { ok: false };
        }
        state.characters += key.length;
        if (state.characters > MAX_SNAPSHOT_CHARACTERS) {
          state.tooLarge = true;
          return { ok: false };
        }
        const child = visit(descriptor.value);
        if (!child.ok) return child;
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: child.value,
        });
      }
      return { ok: true, value: output };
    } catch {
      return { ok: false };
    } finally {
      active.delete(entry);
    }
  };

  try {
    const result = visit(value);
    return result.ok
      ? Object.freeze({ ok: true, value: result.value })
      : Object.freeze({ ok: false, tooLarge: state.tooLarge });
  } catch {
    return Object.freeze({ ok: false, tooLarge: state.tooLarge });
  }
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = deepFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeText(value: unknown, maximum = MAX_TEXT): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function safePropertyName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    PROPERTY_NAME.test(value) &&
    !UNSAFE_PROPERTY_NAMES.has(value.toLocaleLowerCase('en-US'))
  );
}

function portableRelativePath(value: unknown): value is string {
  if (
    !safeText(value) ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    return false;
  }
  return value.split('/').every((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }
    return (
      Boolean(segment) &&
      segment !== '.' &&
      segment !== '..' &&
      decoded !== '.' &&
      decoded !== '..' &&
      !decoded.includes('/') &&
      !decoded.includes('\\') &&
      !CONTROL_CHARACTERS.test(decoded) &&
      !/[<>:"|?*]/u.test(decoded) &&
      !/[ .]$/u.test(decoded) &&
      !/^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(decoded)
    );
  });
}

function finiteTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP
  );
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function safeScalar(value: unknown): value is ContextViewScalar {
  return (
    (typeof value === 'string' && value.length <= MAX_TEXT && !CONTROL_CHARACTERS.test(value)) ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  );
}

function safePropertyValue(value: unknown): value is ContextViewPropertyValue {
  return (
    safeScalar(value) ||
    (Array.isArray(value) &&
      value.length <= MAX_PROPERTY_LIST_VALUES &&
      value.every(
        (entry) =>
          typeof entry === 'string' &&
          entry.length > 0 &&
          entry.length <= MAX_TEXT &&
          !CONTROL_CHARACTERS.test(entry),
      ))
  );
}

function validPropertyField(value: string): boolean {
  return value.startsWith('property.') && safePropertyName(value.slice('property.'.length));
}

function validFormulaField(value: string, formulaNames: ReadonlySet<string>): boolean {
  return (
    value.startsWith('formula.') &&
    safePropertyName(value.slice('formula.'.length)) &&
    formulaNames.has(value.slice('formula.'.length))
  );
}

function validField(value: unknown, formulaNames: ReadonlySet<string>): value is string {
  return (
    typeof value === 'string' &&
    (CORE_FIELDS.has(value) || validPropertyField(value) || validFormulaField(value, formulaNames))
  );
}

function parseFormulaExpression(value: unknown): ContextViewFormulaExpressionV1 | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  if (
    value.kind === 'days_until' &&
    hasOnlyKeys(value, ['kind', 'field']) &&
    typeof value.field === 'string' &&
    validPropertyField(value.field)
  ) {
    return { kind: 'days_until', field: value.field };
  }
  if (
    value.kind === 'stale_age_days' &&
    hasOnlyKeys(value, ['kind', 'field']) &&
    value.field === 'updated_at'
  ) {
    return { kind: 'stale_age_days', field: 'updated_at' };
  }
  if (
    value.kind === 'risk_score' &&
    hasOnlyKeys(value, ['kind', 'severityField', 'blockerField']) &&
    typeof value.severityField === 'string' &&
    typeof value.blockerField === 'string' &&
    validPropertyField(value.severityField) &&
    validPropertyField(value.blockerField)
  ) {
    return {
      kind: 'risk_score',
      severityField: value.severityField,
      blockerField: value.blockerField,
    };
  }
  if (
    value.kind === 'completion_percentage' &&
    hasOnlyKeys(value, ['kind', 'completedField', 'totalField']) &&
    typeof value.completedField === 'string' &&
    typeof value.totalField === 'string' &&
    validPropertyField(value.completedField) &&
    validPropertyField(value.totalField)
  ) {
    return {
      kind: 'completion_percentage',
      completedField: value.completedField,
      totalField: value.totalField,
    };
  }
  return null;
}

function parseFormulas(
  value: unknown,
):
  | Readonly<{ ok: true; formulas: ContextViewFormulaV1[]; names: Set<string> }>
  | Readonly<{ ok: false; detail?: string }> {
  if (!Array.isArray(value) || value.length > MAX_FORMULAS) return { ok: false };
  const formulas: ContextViewFormulaV1[] = [];
  const names = new Set<string>();
  for (const rawFormula of value) {
    const detail =
      isRecord(rawFormula) && typeof rawFormula.name === 'string' ? rawFormula.name : undefined;
    if (
      !isRecord(rawFormula) ||
      !hasOnlyKeys(rawFormula, ['name', 'expression']) ||
      !safePropertyName(rawFormula.name) ||
      names.has(rawFormula.name)
    ) {
      return { ok: false, ...(detail ? { detail } : {}) };
    }
    const expression = parseFormulaExpression(rawFormula.expression);
    if (!expression) return { ok: false, detail: rawFormula.name };
    names.add(rawFormula.name);
    formulas.push({ name: rawFormula.name, expression });
  }
  return { ok: true, formulas, names };
}

function parseFilter(
  value: unknown,
  formulaNames: ReadonlySet<string>,
  depth = 0,
  counter: { count: number } = { count: 0 },
): ContextViewFilterV1 | null {
  counter.count += 1;
  if (
    counter.count > MAX_FILTER_NODES ||
    depth > MAX_FILTER_DEPTH ||
    !isRecord(value) ||
    typeof value.kind !== 'string'
  ) {
    return null;
  }
  if (value.kind === 'comparison') {
    if (
      !hasOnlyKeys(value, ['kind', 'field', 'operator', 'value']) ||
      !validField(value.field, formulaNames) ||
      typeof value.operator !== 'string' ||
      !COMPARISON_OPERATORS.has(value.operator)
    ) {
      return null;
    }
    if (value.operator === 'exists') {
      if (value.value !== undefined && typeof value.value !== 'boolean') return null;
      return {
        kind: 'comparison',
        field: value.field,
        operator: 'exists',
        ...(value.value !== undefined ? { value: value.value } : {}),
      };
    }
    if (!safePropertyValue(value.value)) return null;
    if (value.operator === 'in' && !Array.isArray(value.value)) return null;
    return {
      kind: 'comparison',
      field: value.field,
      operator: value.operator as ContextViewComparisonOperator,
      value: Array.isArray(value.value) ? [...value.value] : value.value,
    };
  }
  if (value.kind === 'and' || value.kind === 'or') {
    if (
      !hasOnlyKeys(value, ['kind', 'operands']) ||
      !Array.isArray(value.operands) ||
      value.operands.length === 0 ||
      value.operands.length > MAX_FILTER_OPERANDS
    ) {
      return null;
    }
    const operands: ContextViewFilterV1[] = [];
    for (const operand of value.operands) {
      const parsed = parseFilter(operand, formulaNames, depth + 1, counter);
      if (!parsed) return null;
      operands.push(parsed);
    }
    return { kind: value.kind, operands };
  }
  if (value.kind === 'not') {
    if (!hasOnlyKeys(value, ['kind', 'operand'])) return null;
    const operand = parseFilter(value.operand, formulaNames, depth + 1, counter);
    return operand ? { kind: 'not', operand } : null;
  }
  return null;
}

function parseContextSavedViewData(value: unknown): ContextSavedViewParseResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'version',
      'id',
      'mapId',
      'name',
      'type',
      'filter',
      'sorts',
      'groupBy',
      'pinnedRowIds',
      'fields',
      'aggregates',
      'formulas',
      'template',
      'createdAt',
      'updatedAt',
    ]) ||
    value.version !== 1 ||
    !safeId(value.id) ||
    !safeId(value.mapId) ||
    !safeText(value.name, MAX_NAME) ||
    typeof value.type !== 'string' ||
    !VIEW_TYPES.has(value.type) ||
    !Array.isArray(value.sorts) ||
    value.sorts.length > MAX_SORTS ||
    !Array.isArray(value.pinnedRowIds) ||
    value.pinnedRowIds.length > MAX_PINNED_ROWS ||
    !Array.isArray(value.fields) ||
    value.fields.length === 0 ||
    value.fields.length > MAX_FIELDS ||
    !Array.isArray(value.aggregates) ||
    value.aggregates.length > MAX_AGGREGATES ||
    (value.template !== undefined && typeof value.template !== 'boolean') ||
    !finiteTimestamp(value.createdAt) ||
    !finiteTimestamp(value.updatedAt) ||
    value.updatedAt < value.createdAt
  ) {
    return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
  }
  if (/\bbases?\b/iu.test(value.name.normalize('NFKC'))) {
    return Object.freeze({ ok: false, reason: 'view_branding_invalid', detail: 'name' });
  }

  const parsedFormulas = parseFormulas(value.formulas);
  if (!parsedFormulas.ok) {
    return Object.freeze({
      ok: false,
      reason: 'view_formula_invalid',
      ...(parsedFormulas.detail ? { detail: parsedFormulas.detail } : {}),
    });
  }

  let filter: ContextViewFilterV1 | undefined;
  if (value.filter !== undefined) {
    filter = parseFilter(value.filter, parsedFormulas.names) ?? undefined;
    if (!filter) return Object.freeze({ ok: false, reason: 'view_filter_invalid' });
  }

  const sorts: ContextViewSortV1[] = [];
  const sortFields = new Set<string>();
  for (const sort of value.sorts) {
    if (
      !isRecord(sort) ||
      !hasOnlyKeys(sort, ['field', 'direction']) ||
      !validField(sort.field, parsedFormulas.names) ||
      (sort.direction !== 'asc' && sort.direction !== 'desc') ||
      sortFields.has(sort.field)
    ) {
      return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
    }
    sortFields.add(sort.field);
    sorts.push({ field: sort.field, direction: sort.direction });
  }

  if (value.groupBy !== undefined && !validField(value.groupBy, parsedFormulas.names)) {
    return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
  }

  const pinnedRowIds: string[] = [];
  const pinnedIds = new Set<string>();
  for (const rowId of value.pinnedRowIds) {
    if (!safeId(rowId) || pinnedIds.has(rowId)) {
      return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
    }
    pinnedIds.add(rowId);
    pinnedRowIds.push(rowId);
  }

  const fields: ContextViewFieldV1[] = [];
  const fieldNames = new Set<string>();
  const fieldOrders = new Set<number>();
  for (const field of value.fields) {
    if (
      !isRecord(field) ||
      !hasOnlyKeys(field, ['field', 'visible', 'order', 'width']) ||
      !validField(field.field, parsedFormulas.names) ||
      typeof field.visible !== 'boolean' ||
      !Number.isSafeInteger(field.order) ||
      (field.order as number) < 0 ||
      (field.order as number) >= MAX_FIELDS ||
      !Number.isSafeInteger(field.width) ||
      (field.width as number) < 40 ||
      (field.width as number) > 2_000 ||
      fieldNames.has(field.field) ||
      fieldOrders.has(field.order as number)
    ) {
      return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
    }
    fieldNames.add(field.field);
    fieldOrders.add(field.order as number);
    fields.push({
      field: field.field,
      visible: field.visible,
      order: field.order as number,
      width: field.width as number,
    });
  }

  const aggregates: ContextViewAggregateV1[] = [];
  const aggregateIds = new Set<string>();
  for (const aggregate of value.aggregates) {
    if (
      !isRecord(aggregate) ||
      !hasOnlyKeys(aggregate, ['id', 'operation', 'field']) ||
      !safePropertyName(aggregate.id) ||
      aggregateIds.has(aggregate.id) ||
      !['count', 'count_true', 'sum', 'average'].includes(String(aggregate.operation)) ||
      (aggregate.operation === 'count' && aggregate.field !== undefined) ||
      (aggregate.operation !== 'count' && !validField(aggregate.field, parsedFormulas.names))
    ) {
      return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
    }
    aggregateIds.add(aggregate.id);
    aggregates.push({
      id: aggregate.id,
      operation: aggregate.operation as ContextViewAggregateV1['operation'],
      ...(typeof aggregate.field === 'string' ? { field: aggregate.field } : {}),
    });
  }

  return Object.freeze({
    ok: true,
    value: deepFreeze({
      version: 1 as const,
      id: value.id,
      mapId: value.mapId,
      name: value.name,
      type: value.type as ContextViewType,
      ...(filter ? { filter } : {}),
      sorts,
      ...(typeof value.groupBy === 'string' ? { groupBy: value.groupBy } : {}),
      pinnedRowIds,
      fields,
      aggregates,
      formulas: parsedFormulas.formulas,
      ...(value.template !== undefined ? { template: value.template } : {}),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    }),
  });
}

export function parseContextSavedView(value: unknown): ContextSavedViewParseResult {
  const snapshot = snapshotUnknown(value);
  return snapshot.ok
    ? parseContextSavedViewData(snapshot.value)
    : Object.freeze({ ok: false, reason: 'view_contract_invalid' });
}

function parseRow(value: unknown): ContextViewRowV1 | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'kind',
      'title',
      'path',
      'sourceId',
      'updatedAt',
      'properties',
      'latitude',
      'longitude',
    ]) ||
    !safeId(value.id) ||
    !safeText(value.kind, 100) ||
    !safeText(value.title, 1_000) ||
    !portableRelativePath(value.path) ||
    !safeId(value.sourceId) ||
    !finiteTimestamp(value.updatedAt) ||
    !isRecord(value.properties) ||
    Object.keys(value.properties).length > MAX_PROPERTIES ||
    (value.latitude !== undefined && !finiteCoordinate(value.latitude, -90, 90)) ||
    (value.longitude !== undefined && !finiteCoordinate(value.longitude, -180, 180)) ||
    (value.latitude === undefined) !== (value.longitude === undefined)
  ) {
    return null;
  }
  const properties: Record<string, ContextViewPropertyValue> = {};
  for (const [name, propertyValue] of Object.entries(value.properties)) {
    if (!safePropertyName(name) || !safePropertyValue(propertyValue)) return null;
    properties[name] = Array.isArray(propertyValue) ? [...propertyValue] : propertyValue;
  }
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    path: value.path,
    sourceId: value.sourceId,
    updatedAt: value.updatedAt,
    properties,
    ...(value.latitude !== undefined ? { latitude: value.latitude as number } : {}),
    ...(value.longitude !== undefined ? { longitude: value.longitude as number } : {}),
  };
}

function fieldValue(
  row: ContextViewRowV1,
  formulaValues: Readonly<Record<string, number>>,
  field: string,
): ContextViewPropertyValue | undefined {
  if (field.startsWith('property.')) return row.properties[field.slice('property.'.length)];
  if (field.startsWith('formula.')) return formulaValues[field.slice('formula.'.length)];
  switch (field) {
    case 'id':
      return row.id;
    case 'kind':
      return row.kind;
    case 'title':
      return row.title;
    case 'path':
      return row.path;
    case 'source_id':
      return row.sourceId;
    case 'updated_at':
      return row.updatedAt;
    case 'latitude':
      return row.latitude;
    case 'longitude':
      return row.longitude;
    default:
      return undefined;
  }
}

function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function evaluateFormula(
  expression: DeepReadonly<ContextViewFormulaExpressionV1>,
  row: ContextViewRowV1,
  now: number,
): number {
  const value = (field: string): ContextViewPropertyValue | undefined => fieldValue(row, {}, field);
  switch (expression.kind) {
    case 'days_until': {
      const raw = value(expression.field);
      if (typeof raw !== 'string' || !validCalendarDate(raw)) return 0;
      const target = Date.parse(`${raw}T00:00:00.000Z`);
      if (!Number.isFinite(target)) return 0;
      const today = Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate(),
      );
      return Math.ceil((target - today) / 86_400_000);
    }
    case 'stale_age_days': {
      const raw = value(expression.field);
      return typeof raw === 'number' ? Math.max(0, Math.floor((now - raw) / 86_400_000)) : 0;
    }
    case 'risk_score': {
      const severity = value(expression.severityField);
      const blocker = value(expression.blockerField);
      const weights: Readonly<Record<string, number>> = {
        critical: 8,
        high: 6,
        medium: 3,
        low: 1,
      };
      const base = typeof severity === 'string' ? (weights[severity.toLowerCase()] ?? 0) : 0;
      return Math.min(10, base + (blocker === true ? 2 : 0));
    }
    case 'completion_percentage': {
      const completed = value(expression.completedField);
      const total = value(expression.totalField);
      if (
        typeof completed !== 'number' ||
        typeof total !== 'number' ||
        !Number.isFinite(completed) ||
        !Number.isFinite(total) ||
        total <= 0
      ) {
        return 0;
      }
      return Math.max(0, Math.min(100, Math.round((completed / total) * 10_000) / 100));
    }
  }
}

function formulaValuesForRow(
  view: DeepReadonly<ContextSavedViewV1>,
  row: ContextViewRowV1,
  now: number,
): Record<string, number> {
  return Object.fromEntries(
    view.formulas.map((formula) => [formula.name, evaluateFormula(formula.expression, row, now)]),
  );
}

function equalValues(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => entry === (right as readonly unknown[])[index])
    );
  }
  return left === right;
}

function evaluateComparison(
  actual: ContextViewPropertyValue | undefined,
  filter: DeepReadonly<ContextViewComparisonFilterV1>,
): boolean {
  if (filter.operator === 'exists') {
    const expected = filter.value === undefined ? true : filter.value === true;
    return (actual !== undefined) === expected;
  }
  const expected = filter.value;
  switch (filter.operator) {
    case 'eq':
      return equalValues(actual, expected);
    case 'neq':
      return !equalValues(actual, expected);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (
        !(
          (typeof actual === 'number' && typeof expected === 'number') ||
          (typeof actual === 'string' && typeof expected === 'string')
        )
      ) {
        return false;
      }
      if (filter.operator === 'gt') return actual > expected;
      if (filter.operator === 'gte') return actual >= expected;
      if (filter.operator === 'lt') return actual < expected;
      return actual <= expected;
    }
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
      }
      if (Array.isArray(actual) && typeof expected === 'string') return actual.includes(expected);
      return false;
    case 'in':
      return Array.isArray(expected) && expected.some((entry) => equalValues(actual, entry));
  }
}

function matchesFilter(
  filter: DeepReadonly<ContextViewFilterV1>,
  row: ContextViewRowV1,
  formulaValues: Readonly<Record<string, number>>,
): boolean {
  switch (filter.kind) {
    case 'comparison':
      return evaluateComparison(fieldValue(row, formulaValues, filter.field), filter);
    case 'and':
      return filter.operands.every((operand) => matchesFilter(operand, row, formulaValues));
    case 'or':
      return filter.operands.some((operand) => matchesFilter(operand, row, formulaValues));
    case 'not':
      return !matchesFilter(filter.operand, row, formulaValues);
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(left).localeCompare(String(right), 'en-US', {
    numeric: true,
    sensitivity: 'base',
  });
}

function groupKey(value: ContextViewPropertyValue | undefined): string {
  if (value === undefined) return '(empty)';
  if (Array.isArray(value)) return `@v:a:${JSON.stringify(value)}`;
  if (typeof value === 'number') return `@v:n:${String(value)}`;
  if (typeof value === 'boolean') return `@v:b:${String(value)}`;
  return value === '(empty)' || value.startsWith('@v:') ? `@v:s:${JSON.stringify(value)}` : value;
}

function valueWorkCharacters(
  value: ContextViewPropertyValue | readonly string[] | undefined,
): number {
  if (value === undefined) return 1;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + entry.length + 1, 0);
  }
  return 16;
}

function collectFilterComparisons(
  filter: DeepReadonly<ContextViewFilterV1> | undefined,
  output: Array<DeepReadonly<ContextViewComparisonFilterV1>>,
): number {
  if (!filter) return 0;
  if (filter.kind === 'comparison') {
    output.push(filter);
    return 1;
  }
  if (filter.kind === 'not') return 1 + collectFilterComparisons(filter.operand, output);
  return (
    1 +
    filter.operands.reduce((total, operand) => total + collectFilterComparisons(operand, output), 0)
  );
}

function formulaWorkEstimate(
  view: DeepReadonly<ContextSavedViewV1>,
  rows: readonly ContextViewRowV1[],
): number | null {
  let work = view.formulas.length * rows.length;
  for (const row of rows) {
    for (const formula of view.formulas) {
      switch (formula.expression.kind) {
        case 'days_until':
          work += valueWorkCharacters(fieldValue(row, {}, formula.expression.field)) + 32;
          break;
        case 'stale_age_days':
          work += 16;
          break;
        case 'risk_score':
          work +=
            valueWorkCharacters(fieldValue(row, {}, formula.expression.severityField)) +
            valueWorkCharacters(fieldValue(row, {}, formula.expression.blockerField)) +
            16;
          break;
        case 'completion_percentage':
          work +=
            valueWorkCharacters(fieldValue(row, {}, formula.expression.completedField)) +
            valueWorkCharacters(fieldValue(row, {}, formula.expression.totalField)) +
            16;
          break;
      }
      if (work > MAX_EXECUTION_WORK) return null;
    }
  }
  return work;
}

function executionWorkIsBounded(
  view: DeepReadonly<ContextSavedViewV1>,
  rows: readonly Readonly<{
    row: ContextViewRowV1;
    formulaValues: Readonly<Record<string, number>>;
  }>[],
  initialWork: number,
): boolean {
  const comparisons: Array<DeepReadonly<ContextViewComparisonFilterV1>> = [];
  const filterNodes = collectFilterComparisons(view.filter, comparisons);
  const sortPasses = Math.max(1, Math.ceil(Math.log2(rows.length + 1)));
  let work = initialWork + filterNodes * rows.length + view.sorts.length * rows.length * sortPasses;
  if (work > MAX_EXECUTION_WORK) return false;
  for (const { row, formulaValues } of rows) {
    for (const comparison of comparisons) {
      work +=
        valueWorkCharacters(fieldValue(row, formulaValues, comparison.field)) +
        valueWorkCharacters(comparison.value);
      if (work > MAX_EXECUTION_WORK) return false;
    }
    for (const sort of view.sorts) {
      work += valueWorkCharacters(fieldValue(row, formulaValues, sort.field)) * sortPasses;
      if (work > MAX_EXECUTION_WORK) return false;
    }
  }
  return true;
}

function executeContextSavedViewData(input: {
  view: DeepReadonly<ContextSavedViewV1>;
  rows: readonly ContextViewRowV1[];
  now: number;
}): ContextSavedViewExecutionResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['view', 'rows', 'now']) ||
    !Array.isArray(input.rows) ||
    !finiteTimestamp(input.now)
  ) {
    return Object.freeze({ ok: false, reason: 'view_execution_invalid' });
  }
  if (input.rows.length > MAX_ROWS) {
    return Object.freeze({ ok: false, reason: 'view_input_too_large' });
  }
  const parsedView = parseContextSavedViewData(input.view);
  if (!parsedView.ok) return Object.freeze({ ok: false, reason: 'view_execution_invalid' });

  const rows: ContextViewRowV1[] = [];
  const rowIds = new Set<string>();
  let totalPropertyValues = 0;
  for (const rawRow of input.rows) {
    const row = parseRow(rawRow);
    const detail = isRecord(rawRow) && typeof rawRow.id === 'string' ? rawRow.id : undefined;
    if (!row || rowIds.has(row.id)) {
      return Object.freeze({
        ok: false,
        reason: 'view_row_invalid',
        ...(detail ? { detail } : {}),
      });
    }
    rowIds.add(row.id);
    for (const propertyValue of Object.values(row.properties)) {
      totalPropertyValues += Array.isArray(propertyValue) ? propertyValue.length : 1;
    }
    if (totalPropertyValues > MAX_TOTAL_PROPERTY_VALUES) {
      return Object.freeze({ ok: false, reason: 'view_input_too_large' });
    }
    rows.push(row);
  }

  const formulaWork = formulaWorkEstimate(parsedView.value, rows);
  if (formulaWork === null) {
    return Object.freeze({ ok: false, reason: 'view_input_too_large' });
  }
  const evaluated = rows.map((row, originalIndex) => {
    const formulaValues = formulaValuesForRow(parsedView.value, row, input.now);
    return { row, formulaValues, originalIndex };
  });
  if (
    evaluated.some(({ formulaValues }) =>
      Object.values(formulaValues).some((value) => !Number.isFinite(value)),
    )
  ) {
    return Object.freeze({ ok: false, reason: 'view_execution_invalid' });
  }
  if (!executionWorkIsBounded(parsedView.value, evaluated, formulaWork)) {
    return Object.freeze({ ok: false, reason: 'view_input_too_large' });
  }
  const filtered = evaluated.filter(
    ({ row, formulaValues }) =>
      !parsedView.value.filter || matchesFilter(parsedView.value.filter, row, formulaValues),
  );

  const pinOrder = new Map(parsedView.value.pinnedRowIds.map((rowId, index) => [rowId, index]));
  filtered.sort((left, right) => {
    const leftPin = pinOrder.get(left.row.id);
    const rightPin = pinOrder.get(right.row.id);
    if (leftPin !== undefined || rightPin !== undefined) {
      if (leftPin === undefined) return 1;
      if (rightPin === undefined) return -1;
      if (leftPin !== rightPin) return leftPin - rightPin;
    }
    for (const sort of parsedView.value.sorts) {
      const compared = compareValues(
        fieldValue(left.row, left.formulaValues, sort.field),
        fieldValue(right.row, right.formulaValues, sort.field),
      );
      if (compared !== 0) return sort.direction === 'asc' ? compared : -compared;
    }
    return left.originalIndex - right.originalIndex;
  });

  if (
    parsedView.value.type === 'map' &&
    !filtered.some(
      ({ row }) =>
        row.latitude !== undefined &&
        row.longitude !== undefined &&
        finiteCoordinate(row.latitude, -90, 90) &&
        finiteCoordinate(row.longitude, -180, 180),
    )
  ) {
    return Object.freeze({ ok: false, reason: 'map_view_requires_geography' });
  }

  const groups: Array<{ key: string; rowIds: string[] }> = [];
  if (parsedView.value.groupBy) {
    const groupIndexes = new Map<string, number>();
    for (const { row, formulaValues } of filtered) {
      const key = groupKey(fieldValue(row, formulaValues, parsedView.value.groupBy));
      let index = groupIndexes.get(key);
      if (index === undefined) {
        index = groups.length;
        groupIndexes.set(key, index);
        groups.push({ key, rowIds: [] });
      }
      groups[index]!.rowIds.push(row.id);
    }
  }

  const visibleFields = parsedView.value.fields
    .filter(({ visible }) => visible)
    .sort((left, right) => left.order - right.order)
    .map(({ field, order, width }) => ({ field, order, width }));
  if (visibleFields.length * filtered.length > MAX_EXPORT_CELLS) {
    return Object.freeze({ ok: false, reason: 'view_input_too_large' });
  }

  const aggregates: Record<string, number> = {};
  for (const aggregate of parsedView.value.aggregates) {
    if (aggregate.operation === 'count') {
      aggregates[aggregate.id] = filtered.length;
      continue;
    }
    const values = filtered.map(({ row, formulaValues }) =>
      fieldValue(row, formulaValues, aggregate.field!),
    );
    if (aggregate.operation === 'count_true') {
      aggregates[aggregate.id] = values.filter((value) => value === true).length;
      continue;
    }
    const numbers = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    let sum = 0;
    for (const number of numbers) {
      sum += number;
      if (!Number.isFinite(sum)) {
        return Object.freeze({ ok: false, reason: 'view_execution_invalid' });
      }
    }
    const result =
      aggregate.operation === 'average' && numbers.length > 0 ? sum / numbers.length : sum;
    if (!Number.isFinite(result)) {
      return Object.freeze({ ok: false, reason: 'view_execution_invalid' });
    }
    aggregates[aggregate.id] = result;
  }

  const resultRows = filtered.map(({ row, formulaValues }) => ({
    ...row,
    properties: { ...row.properties },
    formulaValues,
  }));
  const exportRows = filtered.map(({ row, formulaValues }) =>
    Object.fromEntries(
      visibleFields.map(({ field }) => [field, fieldValue(row, formulaValues, field)]),
    ),
  );

  return Object.freeze({
    ok: true,
    value: deepFreeze({
      rows: resultRows,
      groups,
      visibleFields,
      aggregates,
      operations: [
        'edit_properties',
        'open_source',
        'save_as_template',
        'duplicate',
        'export',
      ] as const,
      exportRows,
    }),
  });
}

export function executeContextSavedView(input: {
  view: DeepReadonly<ContextSavedViewV1>;
  rows: readonly ContextViewRowV1[];
  now: number;
}): ContextSavedViewExecutionResult {
  const snapshot = snapshotUnknown(input);
  if (!snapshot.ok) {
    return Object.freeze({
      ok: false,
      reason: snapshot.tooLarge ? 'view_input_too_large' : 'view_execution_invalid',
    });
  }
  return executeContextSavedViewData(
    snapshot.value as {
      view: DeepReadonly<ContextSavedViewV1>;
      rows: readonly ContextViewRowV1[];
      now: number;
    },
  );
}

export function duplicateContextSavedView(input: {
  view: DeepReadonly<ContextSavedViewV1>;
  id: string;
  name: string;
  now: number;
  asTemplate?: boolean;
}): ContextSavedViewParseResult {
  const snapshot = snapshotUnknown(input);
  if (!snapshot.ok) {
    return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
  }
  input = snapshot.value as {
    view: DeepReadonly<ContextSavedViewV1>;
    id: string;
    name: string;
    now: number;
    asTemplate?: boolean;
  };
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['view', 'id', 'name', 'now', 'asTemplate']) ||
    !safeId(input.id) ||
    !safeText(input.name, MAX_NAME) ||
    !finiteTimestamp(input.now) ||
    (input.asTemplate !== undefined && typeof input.asTemplate !== 'boolean')
  ) {
    return Object.freeze({ ok: false, reason: 'view_contract_invalid' });
  }
  const source = parseContextSavedViewData(input.view);
  if (!source.ok) return source;
  return parseContextSavedViewData({
    ...source.value,
    id: input.id,
    name: input.name,
    ...(input.asTemplate === true ? { template: true } : { template: false }),
    createdAt: input.now,
    updatedAt: input.now,
  });
}
