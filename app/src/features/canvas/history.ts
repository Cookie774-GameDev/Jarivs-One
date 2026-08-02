export const CANVAS_HISTORY_ACTION_KINDS = [
  'object-create',
  'object-delete',
  'object-move',
  'object-resize',
  'object-rotate',
  'style-change',
  'text-change',
  'block-change',
  'drawing-change',
  'group-change',
  'connector-change',
  'mode-change',
  'ai-insertion',
  'template-insertion',
  'asset-addition',
  'database-edit',
  'frame-order',
  'presentation-order',
] as const;

export type CanvasHistoryActionKind = (typeof CANVAS_HISTORY_ACTION_KINDS)[number];

export class CanvasHistoryError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`Invalid canvas history value at ${path}: ${message}`);
    this.name = 'CanvasHistoryError';
  }
}

export interface CanvasHistoryCommit<T> {
  readonly id: string;
  readonly label: string;
  readonly kind: CanvasHistoryActionKind;
  readonly timestamp: number;
  readonly after: T;
  readonly coalesceKey?: string;
}

export interface CanvasHistoryEntry<T> extends CanvasHistoryCommit<T> {
  readonly before: T;
}

export interface CanvasHistoryOptions {
  readonly capacity?: number;
  readonly coalesceWindowMs?: number;
}

export interface CanvasHistorySnapshot<T> {
  readonly schemaVersion: 1;
  readonly capacity: number;
  readonly coalesceWindowMs: number;
  readonly cursor: number;
  readonly current: T;
  readonly entries: readonly CanvasHistoryEntry<T>[];
}

export interface CanvasHistory<T> {
  current(): T;
  entries(): readonly CanvasHistoryEntry<T>[];
  canUndo(): boolean;
  canRedo(): boolean;
  commit(change: CanvasHistoryCommit<T>): T;
  undo(): T;
  redo(): T;
  clear(): void;
  snapshot(): CanvasHistorySnapshot<T>;
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_COALESCE_WINDOW_MS = 500;
const MAX_CAPACITY = 10_000;
const MAX_COALESCE_WINDOW_MS = 60_000;
const MAX_METADATA_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerInRange(value: unknown, path: string, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new CanvasHistoryError(path, `expected an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function metadata(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new CanvasHistoryError(path, 'expected a string');
  }
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > MAX_METADATA_LENGTH) {
    throw new CanvasHistoryError(path, `expected 1-${MAX_METADATA_LENGTH} characters`);
  }
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CanvasHistoryError(path, 'control characters are not allowed');
  }
  return normalized;
}

function actionKind(value: unknown, path: string): CanvasHistoryActionKind {
  if (!CANVAS_HISTORY_ACTION_KINDS.includes(value as CanvasHistoryActionKind)) {
    throw new CanvasHistoryError(path, 'unsupported history action kind');
  }
  return value as CanvasHistoryActionKind;
}

function normalizeOptions(options: CanvasHistoryOptions): Required<CanvasHistoryOptions> {
  return {
    capacity: integerInRange(
      options.capacity ?? DEFAULT_CAPACITY,
      'options.capacity',
      1,
      MAX_CAPACITY,
    ),
    coalesceWindowMs: integerInRange(
      options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS,
      'options.coalesceWindowMs',
      0,
      MAX_COALESCE_WINDOW_MS,
    ),
  };
}

function normalizeCommit<T>(change: CanvasHistoryCommit<T>, before: T): CanvasHistoryEntry<T> {
  if (!isRecord(change)) {
    throw new CanvasHistoryError('change', 'expected an object');
  }
  const id = metadata(change.id, 'change.id');
  const label = metadata(change.label, 'change.label');
  const kind = actionKind(change.kind, 'change.kind');
  const timestamp = integerInRange(
    change.timestamp,
    'change.timestamp',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const coalesceKey =
    change.coalesceKey === undefined
      ? undefined
      : metadata(change.coalesceKey, 'change.coalesceKey');
  return Object.freeze({
    id,
    label,
    kind,
    timestamp,
    after: change.after,
    before,
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
  });
}

function normalizeRecoveryEntry<T>(value: unknown, index: number): CanvasHistoryEntry<T> {
  const path = `snapshot.entries[${index}]`;
  if (!isRecord(value) || !('before' in value) || !('after' in value)) {
    throw new CanvasHistoryError(path, 'expected a complete transaction');
  }
  return normalizeCommit(
    {
      id: value.id as string,
      label: value.label as string,
      kind: value.kind as CanvasHistoryActionKind,
      timestamp: value.timestamp as number,
      after: value.after as T,
      ...(value.coalesceKey === undefined ? {} : { coalesceKey: value.coalesceKey as string }),
    },
    value.before as T,
  );
}

function createHistoryFromState<T>(
  currentState: T,
  optionsValue: CanvasHistoryOptions,
  initialEntries: readonly CanvasHistoryEntry<T>[] = [],
  initialCursor = 0,
): CanvasHistory<T> {
  const options = normalizeOptions(optionsValue);
  let state = currentState;
  let transactions = [...initialEntries];
  let cursor = initialCursor;

  const entries = (): readonly CanvasHistoryEntry<T>[] => Object.freeze(transactions.slice());

  const snapshot = (): CanvasHistorySnapshot<T> =>
    Object.freeze({
      schemaVersion: 1,
      capacity: options.capacity,
      coalesceWindowMs: options.coalesceWindowMs,
      cursor,
      current: state,
      entries: entries(),
    });

  return Object.freeze({
    current(): T {
      return state;
    },
    entries,
    canUndo(): boolean {
      return cursor > 0;
    },
    canRedo(): boolean {
      return cursor < transactions.length;
    },
    commit(change: CanvasHistoryCommit<T>): T {
      const entry = normalizeCommit(change, state);
      if (Object.is(state, entry.after)) {
        return state;
      }
      if (cursor < transactions.length) {
        transactions = transactions.slice(0, cursor);
      }
      const previous = transactions.at(-1);
      const shouldCoalesce =
        previous !== undefined &&
        cursor === transactions.length &&
        entry.coalesceKey !== undefined &&
        previous.coalesceKey === entry.coalesceKey &&
        previous.kind === entry.kind &&
        entry.timestamp >= previous.timestamp &&
        entry.timestamp - previous.timestamp <= options.coalesceWindowMs;

      if (shouldCoalesce) {
        transactions[transactions.length - 1] = Object.freeze({
          ...previous,
          label: entry.label,
          timestamp: entry.timestamp,
          after: entry.after,
        });
      } else {
        transactions.push(entry);
        if (transactions.length > options.capacity) {
          transactions = transactions.slice(transactions.length - options.capacity);
        }
      }
      cursor = transactions.length;
      state = entry.after;
      return state;
    },
    undo(): T {
      if (cursor === 0) {
        return state;
      }
      cursor -= 1;
      state = transactions[cursor].before;
      return state;
    },
    redo(): T {
      if (cursor >= transactions.length) {
        return state;
      }
      state = transactions[cursor].after;
      cursor += 1;
      return state;
    },
    clear(): void {
      transactions = [];
      cursor = 0;
    },
    snapshot,
  });
}

export function createCanvasHistory<T>(
  initialState: T,
  options: CanvasHistoryOptions = {},
): CanvasHistory<T> {
  return createHistoryFromState(initialState, options);
}

export function restoreCanvasHistory<T>(value: CanvasHistorySnapshot<T>): CanvasHistory<T> {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new CanvasHistoryError('snapshot.schemaVersion', 'unsupported recovery schema');
  }
  if (!Array.isArray(value.entries) || !('current' in value)) {
    throw new CanvasHistoryError('snapshot', 'expected entries and current state');
  }
  const capacity = integerInRange(value.capacity, 'snapshot.capacity', 1, MAX_CAPACITY);
  const coalesceWindowMs = integerInRange(
    value.coalesceWindowMs,
    'snapshot.coalesceWindowMs',
    0,
    MAX_COALESCE_WINDOW_MS,
  );
  const entries = value.entries.map((entry, index) => normalizeRecoveryEntry<T>(entry, index));
  if (entries.length > capacity) {
    throw new CanvasHistoryError('snapshot.entries', 'entry count exceeds capacity');
  }
  const cursor = integerInRange(value.cursor, 'snapshot.cursor', 0, entries.length);
  return createHistoryFromState(
    value.current as T,
    { capacity, coalesceWindowMs },
    entries,
    cursor,
  );
}
