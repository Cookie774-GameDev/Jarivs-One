/**
 * Deterministic performance policies for the Infinite Idea Canvas.
 *
 * This module does not time production work itself. Callers supply measured
 * durations, workload sizes, and drawing state so tests remain deterministic
 * and rendering/input adapters can use the clock and worker implementation
 * appropriate to their environment.
 */

export type CanvasPerformanceMetric =
  | 'empty-load'
  | 'pan-zoom-frame'
  | 'stroke-input'
  | 'autosave-slice'
  | 'thumbnail-slice'
  | 'virtualization';

export const CANVAS_DEFAULT_PERFORMANCE_BUDGETS: Readonly<Record<CanvasPerformanceMetric, number>> =
  Object.freeze({
    'empty-load': 100,
    'pan-zoom-frame': 16,
    'stroke-input': 8,
    'autosave-slice': 4,
    'thumbnail-slice': 8,
    virtualization: 8,
  });

export type CanvasPerformanceErrorCode =
  | 'invalid-number'
  | 'invalid-id'
  | 'unsupported-value'
  | 'duplicate-task'
  | 'index-required'
  | 'query-too-large';

export class CanvasPerformanceError extends Error {
  constructor(
    readonly code: CanvasPerformanceErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`Canvas performance check failed (${code}) at ${path}: ${message}`);
    this.name = 'CanvasPerformanceError';
  }
}

function fail(code: CanvasPerformanceErrorCode, path: string, message: string): never {
  throw new CanvasPerformanceError(code, path, message);
}

function finiteNumber(
  value: unknown,
  path: string,
  options: {
    readonly min?: number;
    readonly max?: number;
    readonly exclusiveMin?: boolean;
  } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  if (
    options.min !== undefined &&
    (options.exclusiveMin ? value <= options.min : value < options.min)
  ) {
    fail('invalid-number', path, 'value is below the allowed minimum');
  }
  if (options.max !== undefined && value > options.max) {
    fail('invalid-number', path, 'value exceeds the allowed maximum');
  }
  return value;
}

function safeInteger(
  value: unknown,
  path: string,
  options: { readonly min?: number; readonly max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-number', path, 'expected a safe integer');
  }
  if (options.min !== undefined && value < options.min) {
    fail('invalid-number', path, 'value is below the allowed minimum');
  }
  if (options.max !== undefined && value > options.max) {
    fail('invalid-number', path, 'value exceeds the allowed maximum');
  }
  return value;
}

function checkedExtent(origin: number, size: number, path: string): number {
  const extent = origin + size;
  if (!Number.isSafeInteger(extent)) {
    fail('invalid-number', path, 'computed world extent is not a safe integer');
  }
  return extent;
}

// ---------------------------------------------------------------------------
// Bounded large-canvas fixtures
// ---------------------------------------------------------------------------

export const CANVAS_MAX_PERFORMANCE_FIXTURE_ITEMS = 100_000;

export interface CanvasWorldRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasVirtualItem extends CanvasWorldRectangle {
  readonly id: string;
}

export interface CanvasPerformanceFixtureOptions {
  readonly itemCount: number;
  readonly columns?: number;
  readonly itemWidth?: number;
  readonly itemHeight?: number;
  readonly gap?: number;
}

export interface CanvasPerformanceFixture {
  readonly itemCount: number;
  readonly columns: number;
  readonly worldBounds: CanvasWorldRectangle;
  readonly items: readonly CanvasVirtualItem[];
}

export function createCanvasPerformanceFixture(
  options: CanvasPerformanceFixtureOptions,
): CanvasPerformanceFixture {
  const itemCount = safeInteger(options.itemCount, 'options.itemCount', {
    min: 0,
    max: CANVAS_MAX_PERFORMANCE_FIXTURE_ITEMS,
  });
  const requestedColumns = safeInteger(options.columns ?? 100, 'options.columns', {
    min: 1,
    max: CANVAS_MAX_PERFORMANCE_FIXTURE_ITEMS,
  });
  const columns = itemCount === 0 ? 1 : Math.min(requestedColumns, itemCount);
  const itemWidth = safeInteger(options.itemWidth ?? 80, 'options.itemWidth', {
    min: 1,
  });
  const itemHeight = safeInteger(options.itemHeight ?? 48, 'options.itemHeight', {
    min: 1,
  });
  const gap = safeInteger(options.gap ?? 16, 'options.gap', { min: 0 });

  if (itemCount === 0) {
    return Object.freeze({
      itemCount,
      columns,
      worldBounds: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }),
      items: Object.freeze([]),
    });
  }

  const columnStride = checkedExtent(itemWidth, gap, 'options.itemWidth');
  const rowStride = checkedExtent(itemHeight, gap, 'options.itemHeight');
  const rows = Math.ceil(itemCount / columns);
  const finalRowCount = itemCount - (rows - 1) * columns;
  const occupiedColumns = rows === 1 ? finalRowCount : columns;
  const width = checkedExtent(
    checkedExtent(0, occupiedColumns - 1, 'fixture.worldBounds.width') * columnStride,
    itemWidth,
    'fixture.worldBounds.width',
  );
  const height = checkedExtent(
    checkedExtent(0, rows - 1, 'fixture.worldBounds.height') * rowStride,
    itemHeight,
    'fixture.worldBounds.height',
  );

  const items: CanvasVirtualItem[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * columnStride;
    const y = row * rowStride;
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      fail('invalid-number', `fixture.items[${index}]`, 'computed position is not a safe integer');
    }
    items.push(
      Object.freeze({
        id: `perf-${index}`,
        x,
        y,
        width: itemWidth,
        height: itemHeight,
      }),
    );
  }

  return Object.freeze({
    itemCount,
    columns,
    worldBounds: Object.freeze({ x: 0, y: 0, width, height }),
    items: Object.freeze(items),
  });
}

// ---------------------------------------------------------------------------
// Viewport virtualization
// ---------------------------------------------------------------------------

export interface CanvasVirtualizationOptions {
  readonly viewport: CanvasWorldRectangle;
  /** World-space padding rendered beyond every viewport edge. */
  readonly overscan: number;
}

export interface CanvasVirtualizationResult<T extends CanvasVirtualItem> {
  readonly viewportBounds: CanvasWorldRectangle;
  readonly visibleItems: readonly T[];
  readonly totalCount: number;
  readonly culledCount: number;
  /** Number of candidates whose geometry was examined for this query. */
  readonly examinedCount: number;
}

function validateRectangle(rectangle: CanvasWorldRectangle, path: string): CanvasWorldRectangle {
  const x = finiteNumber(rectangle.x, `${path}.x`);
  const y = finiteNumber(rectangle.y, `${path}.y`);
  const width = finiteNumber(rectangle.width, `${path}.width`, { min: 0 });
  const height = finiteNumber(rectangle.height, `${path}.height`, { min: 0 });
  if (!Number.isFinite(x + width) || !Number.isFinite(y + height)) {
    fail('invalid-number', path, 'rectangle has a non-finite extent');
  }
  return { x, y, width, height };
}

export const CANVAS_MAX_LINEAR_VIRTUAL_ITEMS = 2_000;
export const CANVAS_MAX_VIRTUAL_QUERY_CELLS = 4_096;
const CANVAS_MAX_INDEX_CELLS_PER_ITEM = 256;
const CANVAS_MAX_INDEX_OVERFLOW_ITEMS = 256;

export interface CanvasVirtualIndexOptions {
  readonly cellSize?: number;
}

export interface CanvasVirtualIndex<T extends CanvasVirtualItem> {
  readonly kind: 'canvas-virtual-index';
  readonly totalCount: number;
  readonly cellSize: number;
  query(options: CanvasVirtualizationOptions): CanvasVirtualizationResult<T>;
}

function overscannedViewport(options: CanvasVirtualizationOptions): CanvasWorldRectangle {
  const viewport = validateRectangle(options.viewport, 'options.viewport');
  const overscan = finiteNumber(options.overscan, 'options.overscan', { min: 0 });
  const x = viewport.x - overscan;
  const y = viewport.y - overscan;
  const width = viewport.width + overscan * 2;
  const height = viewport.height + overscan * 2;
  if (![x, y, width, height, x + width, y + height].every(Number.isFinite)) {
    fail('invalid-number', 'options.overscan', 'overscanned viewport has a non-finite extent');
  }
  return Object.freeze({ x, y, width, height });
}

function intersects(left: CanvasWorldRectangle, right: CanvasWorldRectangle): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

export function createCanvasVirtualIndex<T extends CanvasVirtualItem>(
  source: readonly T[],
  options: CanvasVirtualIndexOptions = {},
): CanvasVirtualIndex<T> {
  if (!Array.isArray(source)) fail('unsupported-value', 'items', 'expected an item array');
  const cellSize = safeInteger(options.cellSize ?? 512, 'options.cellSize', {
    min: 1,
    max: 1_000_000_000,
  });
  const ids = new Set<string>();
  const items: T[] = [];
  const buckets = new Map<string, number[]>();
  const overflow: number[] = [];

  source.forEach((candidate, index) => {
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      fail('invalid-id', `items[${index}].id`, 'expected a non-empty id');
    }
    if (ids.has(candidate.id)) {
      fail('invalid-id', `items[${index}].id`, 'virtual item ids must be unique');
    }
    ids.add(candidate.id);
    const bounds = validateRectangle(candidate, `items[${index}]`);
    const snapshot = Object.freeze({ ...candidate, ...bounds }) as T;
    const snapshotIndex = items.push(snapshot) - 1;
    const minCellX = Math.floor(bounds.x / cellSize);
    const maxCellX = Math.floor((bounds.x + bounds.width) / cellSize);
    const minCellY = Math.floor(bounds.y / cellSize);
    const maxCellY = Math.floor((bounds.y + bounds.height) / cellSize);
    const cellColumns = maxCellX - minCellX + 1;
    const cellRows = maxCellY - minCellY + 1;
    const cellCount = cellColumns * cellRows;
    if (
      !Number.isSafeInteger(cellCount) ||
      cellColumns <= 0 ||
      cellRows <= 0 ||
      cellCount > CANVAS_MAX_INDEX_CELLS_PER_ITEM
    ) {
      overflow.push(snapshotIndex);
      if (overflow.length > CANVAS_MAX_INDEX_OVERFLOW_ITEMS) {
        fail(
          'unsupported-value',
          `items[${index}]`,
          'too many large items for this cell size; rebuild with a coarser index',
        );
      }
      return;
    }
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = `${cellX}:${cellY}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(snapshotIndex);
        buckets.set(key, bucket);
      }
    }
  });

  const frozenBuckets = new Map(
    [...buckets].map(([key, indices]) => [key, Object.freeze(indices.slice())] as const),
  );
  const frozenItems = Object.freeze(items.slice());
  const frozenOverflow = Object.freeze(overflow.slice());
  return Object.freeze({
    kind: 'canvas-virtual-index' as const,
    totalCount: frozenItems.length,
    cellSize,
    query(queryOptions: CanvasVirtualizationOptions): CanvasVirtualizationResult<T> {
      const viewportBounds = overscannedViewport(queryOptions);
      const minCellX = Math.floor(viewportBounds.x / cellSize);
      const maxCellX = Math.floor((viewportBounds.x + viewportBounds.width) / cellSize);
      const minCellY = Math.floor(viewportBounds.y / cellSize);
      const maxCellY = Math.floor((viewportBounds.y + viewportBounds.height) / cellSize);
      const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
      if (!Number.isSafeInteger(cellCount) || cellCount > CANVAS_MAX_VIRTUAL_QUERY_CELLS) {
        fail(
          'query-too-large',
          'options.viewport',
          'viewport spans too many index cells; use a coarser index or paged overview',
        );
      }
      const candidateIndices = new Set<number>(frozenOverflow);
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          for (const index of frozenBuckets.get(`${cellX}:${cellY}`) ?? []) {
            candidateIndices.add(index);
          }
        }
      }
      const orderedCandidates = [...candidateIndices].sort((left, right) => left - right);
      const visibleItems = orderedCandidates
        .map((index) => frozenItems[index])
        .filter((candidate) => intersects(candidate, viewportBounds));
      return Object.freeze({
        viewportBounds,
        visibleItems: Object.freeze(visibleItems),
        totalCount: frozenItems.length,
        culledCount: frozenItems.length - visibleItems.length,
        examinedCount: orderedCandidates.length,
      });
    },
  });
}

export function virtualizeCanvasItems<T extends CanvasVirtualItem>(
  items: readonly T[],
  options: CanvasVirtualizationOptions,
): CanvasVirtualizationResult<T> {
  if (items.length > CANVAS_MAX_LINEAR_VIRTUAL_ITEMS) {
    fail(
      'index-required',
      'items',
      `linear virtualization is limited to ${CANVAS_MAX_LINEAR_VIRTUAL_ITEMS} items`,
    );
  }
  const viewportBounds = overscannedViewport(options);
  const visibleItems: T[] = [];
  const ids = new Set<string>();

  items.forEach((candidate, index) => {
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      fail('invalid-id', `items[${index}].id`, 'expected a non-empty id');
    }
    if (ids.has(candidate.id)) {
      fail('invalid-id', `items[${index}].id`, 'virtual item ids must be unique');
    }
    ids.add(candidate.id);
    const itemBounds = validateRectangle(candidate, `items[${index}]`);
    if (intersects(itemBounds, viewportBounds)) {
      visibleItems.push(candidate);
    }
  });

  return Object.freeze({
    viewportBounds,
    visibleItems: Object.freeze(visibleItems),
    totalCount: items.length,
    culledCount: items.length - visibleItems.length,
    examinedCount: items.length,
  });
}

// ---------------------------------------------------------------------------
// Supplied-time measurement aggregation
// ---------------------------------------------------------------------------

export interface CanvasPerformanceMetricSummary {
  readonly count: number;
  readonly totalMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly averageMs: number;
  readonly overBudgetCount: number;
  readonly budgetMs: number;
}

export interface CanvasPerformanceSnapshot {
  readonly kinds: Readonly<
    Partial<Record<CanvasPerformanceMetric, CanvasPerformanceMetricSummary>>
  >;
  readonly totalSamples: number;
  readonly totalMs: number;
}

export interface CanvasPerformanceMetrics {
  record(kind: CanvasPerformanceMetric, durationMs: number): void;
  snapshot(): CanvasPerformanceSnapshot;
}

interface MutableMetricSummary {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  overBudgetCount: number;
}

const MAX_MEASUREMENT_MS = 60_000;

export function createCanvasPerformanceMetrics(
  budgets: Readonly<Partial<Record<CanvasPerformanceMetric, number>>> = {},
): CanvasPerformanceMetrics {
  const resolvedBudgets: Record<CanvasPerformanceMetric, number> = {
    ...CANVAS_DEFAULT_PERFORMANCE_BUDGETS,
  };
  for (const [kind, value] of Object.entries(budgets)) {
    if (!(kind in CANVAS_DEFAULT_PERFORMANCE_BUDGETS)) {
      fail('unsupported-value', `budgets.${kind}`, 'unknown metric kind');
    }
    resolvedBudgets[kind as CanvasPerformanceMetric] = finiteNumber(value, `budgets.${kind}`, {
      min: 0,
      exclusiveMin: true,
      max: MAX_MEASUREMENT_MS,
    });
  }
  const samples = new Map<CanvasPerformanceMetric, MutableMetricSummary>();

  const metrics: CanvasPerformanceMetrics = {
    record(kind: CanvasPerformanceMetric, durationMs: number) {
      if (!(kind in CANVAS_DEFAULT_PERFORMANCE_BUDGETS)) {
        fail('unsupported-value', 'kind', 'unknown metric kind');
      }
      const duration = finiteNumber(durationMs, 'durationMs', {
        min: 0,
        max: MAX_MEASUREMENT_MS,
      });
      const current = samples.get(kind);
      if (current === undefined) {
        samples.set(kind, {
          count: 1,
          totalMs: duration,
          minMs: duration,
          maxMs: duration,
          overBudgetCount: duration > resolvedBudgets[kind] ? 1 : 0,
        });
        return;
      }
      current.count += 1;
      current.totalMs += duration;
      current.minMs = Math.min(current.minMs, duration);
      current.maxMs = Math.max(current.maxMs, duration);
      if (duration > resolvedBudgets[kind]) current.overBudgetCount += 1;
    },
    snapshot() {
      const kinds: Partial<Record<CanvasPerformanceMetric, CanvasPerformanceMetricSummary>> = {};
      let totalSamples = 0;
      let totalMs = 0;
      for (const [kind, sample] of samples) {
        totalSamples += sample.count;
        totalMs += sample.totalMs;
        kinds[kind] = Object.freeze({
          count: sample.count,
          totalMs: sample.totalMs,
          minMs: sample.minMs,
          maxMs: sample.maxMs,
          averageMs: sample.totalMs / sample.count,
          overBudgetCount: sample.overBudgetCount,
          budgetMs: resolvedBudgets[kind],
        });
      }
      return Object.freeze({ kinds: Object.freeze(kinds), totalSamples, totalMs });
    },
  };
  return Object.freeze(metrics);
}

// ---------------------------------------------------------------------------
// Stable priority scheduling
// ---------------------------------------------------------------------------

export const CANVAS_WORK_PRIORITIES = Object.freeze([
  'input',
  'drawing',
  'viewport',
  'autosave',
  'thumbnail',
  'background',
] as const);

export type CanvasWorkPriority = (typeof CANVAS_WORK_PRIORITIES)[number];

export interface CanvasWorkTask {
  readonly id: string;
  readonly priority: CanvasWorkPriority;
  /** Deterministic cost estimate used to plan a frame slice. */
  readonly estimatedCostMs: number;
  readonly run: () => void;
}

export interface CanvasWorkFlushOptions {
  readonly budgetMs: number;
  readonly drawingActive: boolean;
}

export interface CanvasWorkFlushResult {
  readonly completedIds: readonly string[];
  readonly deferredIds: readonly string[];
  readonly usedBudgetMs: number;
  readonly remainingCount: number;
}

export interface CanvasWorkScheduler {
  schedule(task: CanvasWorkTask): void;
  flush(options: CanvasWorkFlushOptions): CanvasWorkFlushResult;
}

const INTERACTIVE_PRIORITIES = new Set<CanvasWorkPriority>(['input', 'drawing', 'viewport']);

export function createCanvasWorkScheduler(): CanvasWorkScheduler {
  const queues = new Map<CanvasWorkPriority, CanvasWorkTask[]>(
    CANVAS_WORK_PRIORITIES.map((priority) => [priority, []]),
  );
  const taskIds = new Set<string>();

  const scheduler: CanvasWorkScheduler = {
    schedule(task: CanvasWorkTask) {
      if (typeof task.id !== 'string' || task.id.length === 0) {
        fail('invalid-id', 'task.id', 'expected a non-empty id');
      }
      if (!CANVAS_WORK_PRIORITIES.includes(task.priority)) {
        fail('unsupported-value', 'task.priority', 'unknown work priority');
      }
      finiteNumber(task.estimatedCostMs, 'task.estimatedCostMs', {
        min: 0,
        max: MAX_MEASUREMENT_MS,
      });
      if (typeof task.run !== 'function') {
        fail('unsupported-value', 'task.run', 'expected a function');
      }
      if (taskIds.has(task.id)) {
        fail('duplicate-task', 'task.id', 'task id is already queued');
      }
      taskIds.add(task.id);
      queues.get(task.priority)?.push(task);
    },
    flush(options: CanvasWorkFlushOptions) {
      const budgetMs = finiteNumber(options.budgetMs, 'options.budgetMs', {
        min: 0,
        max: MAX_MEASUREMENT_MS,
      });
      if (typeof options.drawingActive !== 'boolean') {
        fail('unsupported-value', 'options.drawingActive', 'expected a boolean');
      }
      const completedIds: string[] = [];
      const deferredIds: string[] = [];
      let usedBudgetMs = 0;

      priorityLoop: for (const priority of CANVAS_WORK_PRIORITIES) {
        const queue = queues.get(priority)!;
        if (options.drawingActive && !INTERACTIVE_PRIORITIES.has(priority)) {
          deferredIds.push(...queue.map(({ id }) => id));
          continue;
        }
        while (queue.length > 0) {
          const next = queue[0];
          const fitsBudget = usedBudgetMs + next.estimatedCostMs <= budgetMs;
          if (!fitsBudget && !(usedBudgetMs === 0 && INTERACTIVE_PRIORITIES.has(priority))) {
            break priorityLoop;
          }
          queue.shift();
          taskIds.delete(next.id);
          next.run();
          completedIds.push(next.id);
          usedBudgetMs += next.estimatedCostMs;
        }
      }

      return Object.freeze({
        completedIds: Object.freeze(completedIds),
        deferredIds: Object.freeze(deferredIds),
        usedBudgetMs,
        remainingCount: taskIds.size,
      });
    },
  };
  return Object.freeze(scheduler);
}

// ---------------------------------------------------------------------------
// Worker and thumbnail policies
// ---------------------------------------------------------------------------

export const CANVAS_WORKER_THRESHOLDS = Object.freeze({
  'spatial-index': 5_000,
  'stroke-geometry': 1_000,
  'thumbnail-generation': 1_000_000,
  'search-index': 2_000,
} as const);

export type CanvasWorkerOperation = keyof typeof CANVAS_WORKER_THRESHOLDS;

export interface CanvasWorkerDecisionInput {
  readonly operation: CanvasWorkerOperation;
  readonly workloadSize: number;
  readonly workerAvailable: boolean;
}

export interface CanvasWorkerDecision {
  readonly lane: 'main-thread' | 'worker' | 'deferred';
  readonly reason: 'threshold-met' | 'below-threshold' | 'worker-unavailable';
  readonly threshold: number;
  /** Present when bounded main-thread chunking is safe or required as a fallback. */
  readonly maxMainThreadChunkSize?: number;
}

export function decideCanvasWorker(input: CanvasWorkerDecisionInput): CanvasWorkerDecision {
  if (!(input.operation in CANVAS_WORKER_THRESHOLDS)) {
    fail('unsupported-value', 'input.operation', 'unknown worker operation');
  }
  const workloadSize = safeInteger(input.workloadSize, 'input.workloadSize', { min: 0 });
  if (typeof input.workerAvailable !== 'boolean') {
    fail('unsupported-value', 'input.workerAvailable', 'expected a boolean');
  }
  const threshold = CANVAS_WORKER_THRESHOLDS[input.operation];
  if (workloadSize < threshold) {
    return Object.freeze({
      lane: 'main-thread',
      reason: 'below-threshold',
      threshold,
      maxMainThreadChunkSize: Math.max(1, threshold - 1),
    });
  }
  if (!input.workerAvailable) {
    return Object.freeze({
      lane: 'deferred',
      reason: 'worker-unavailable',
      threshold,
      maxMainThreadChunkSize: Math.max(1, threshold - 1),
    });
  }
  return Object.freeze({ lane: 'worker', reason: 'threshold-met', threshold });
}

export interface CanvasThumbnailDecisionInput {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly byteSize: number;
  readonly cached: boolean;
  readonly visible: boolean;
  readonly workerAvailable?: boolean;
}

export interface CanvasThumbnailDecision {
  readonly action: 'use-cache' | 'generate' | 'defer';
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly executionLane: 'none' | 'main-thread' | 'worker';
  readonly reason: 'cached' | 'not-visible' | 'source-too-large' | 'worker-unavailable' | 'ready';
}

export const CANVAS_THUMBNAIL_MAX_DIMENSION = 512;
const MAX_THUMBNAIL_SOURCE_DIMENSION = 100_000;
const MAX_THUMBNAIL_SOURCE_BYTES = 2_000_000_000;
export const CANVAS_THUMBNAIL_MAX_SOURCE_PIXELS = 64_000_000;
export const CANVAS_THUMBNAIL_MAX_SOURCE_BYTES = 512 * 1024 * 1024;

export function decideCanvasThumbnail(
  input: CanvasThumbnailDecisionInput,
): CanvasThumbnailDecision {
  const pixelWidth = safeInteger(input.pixelWidth, 'input.pixelWidth', {
    min: 1,
    max: MAX_THUMBNAIL_SOURCE_DIMENSION,
  });
  const pixelHeight = safeInteger(input.pixelHeight, 'input.pixelHeight', {
    min: 1,
    max: MAX_THUMBNAIL_SOURCE_DIMENSION,
  });
  const byteSize = safeInteger(input.byteSize, 'input.byteSize', {
    min: 0,
    max: MAX_THUMBNAIL_SOURCE_BYTES,
  });
  if (typeof input.cached !== 'boolean' || typeof input.visible !== 'boolean') {
    fail('unsupported-value', 'input', 'cached and visible must be booleans');
  }
  if (input.workerAvailable !== undefined && typeof input.workerAvailable !== 'boolean') {
    fail('unsupported-value', 'input.workerAvailable', 'expected a boolean');
  }

  const scale = Math.min(1, CANVAS_THUMBNAIL_MAX_DIMENSION / Math.max(pixelWidth, pixelHeight));
  const targetWidth = Math.max(1, Math.round(pixelWidth * scale));
  const targetHeight = Math.max(1, Math.round(pixelHeight * scale));
  if (input.cached) {
    return Object.freeze({
      action: 'use-cache',
      targetWidth,
      targetHeight,
      executionLane: 'none',
      reason: 'cached',
    });
  }
  if (!input.visible) {
    return Object.freeze({
      action: 'defer',
      targetWidth,
      targetHeight,
      executionLane: 'none',
      reason: 'not-visible',
    });
  }

  const workloadSize = pixelWidth * pixelHeight;
  if (!Number.isSafeInteger(workloadSize)) {
    fail('invalid-number', 'input', 'thumbnail pixel workload is not a safe integer');
  }
  if (
    workloadSize > CANVAS_THUMBNAIL_MAX_SOURCE_PIXELS ||
    byteSize > CANVAS_THUMBNAIL_MAX_SOURCE_BYTES
  ) {
    return Object.freeze({
      action: 'defer',
      targetWidth,
      targetHeight,
      executionLane: 'none',
      reason: 'source-too-large',
    });
  }
  const workerDecision = decideCanvasWorker({
    operation: 'thumbnail-generation',
    workloadSize: Math.max(workloadSize, byteSize),
    workerAvailable: input.workerAvailable ?? true,
  });
  if (workerDecision.lane === 'deferred') {
    return Object.freeze({
      action: 'defer',
      targetWidth,
      targetHeight,
      executionLane: 'none',
      reason: 'worker-unavailable',
    });
  }
  return Object.freeze({
    action: 'generate',
    targetWidth,
    targetHeight,
    executionLane: workerDecision.lane,
    reason: 'ready',
  });
}
