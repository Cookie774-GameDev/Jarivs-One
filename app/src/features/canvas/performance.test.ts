import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_DEFAULT_PERFORMANCE_BUDGETS,
  CanvasPerformanceError,
  createCanvasVirtualIndex,
  createCanvasPerformanceFixture,
  createCanvasPerformanceMetrics,
  createCanvasWorkScheduler,
  decideCanvasThumbnail,
  decideCanvasWorker,
  virtualizeCanvasItems,
  type CanvasVirtualItem,
} from './performance';

function item(id: string, x: number, y: number, width = 20, height = 20): CanvasVirtualItem {
  return Object.freeze({ id, x, y, width, height });
}

describe('canvas performance policy', () => {
  it('creates an empty large-canvas fixture without populating placeholder work', () => {
    const fixture = createCanvasPerformanceFixture({ itemCount: 0 });

    expect(fixture).toEqual({
      itemCount: 0,
      columns: 1,
      worldBounds: { x: 0, y: 0, width: 0, height: 0 },
      items: [],
    });
    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.items)).toBe(true);
  });

  it('creates a bounded deterministic large fixture with immutable geometry', () => {
    const fixture = createCanvasPerformanceFixture({
      itemCount: 10_000,
      columns: 100,
      itemWidth: 80,
      itemHeight: 40,
      gap: 20,
    });

    expect(fixture.items).toHaveLength(10_000);
    expect(fixture.items[0]).toEqual({ id: 'perf-0', x: 0, y: 0, width: 80, height: 40 });
    expect(fixture.items[101]).toEqual({
      id: 'perf-101',
      x: 100,
      y: 60,
      width: 80,
      height: 40,
    });
    expect(fixture.worldBounds).toEqual({ x: 0, y: 0, width: 9_980, height: 5_980 });
    expect(Object.isFrozen(fixture.items[0])).toBe(true);
  });

  it('rejects fixture geometry whose computed world bounds are unsafe', () => {
    expect(() =>
      createCanvasPerformanceFixture({
        itemCount: 2,
        columns: 2,
        itemWidth: Number.MAX_SAFE_INTEGER,
        itemHeight: 10,
        gap: 1,
      }),
    ).toThrowError(CanvasPerformanceError);
  });

  it('virtualizes offscreen items with an explicit viewport overscan', () => {
    const source = [item('visible', 10, 10), item('overscan', 105, 10), item('offscreen', 131, 10)];

    const result = virtualizeCanvasItems(source, {
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      overscan: 10,
    });

    expect(result.viewportBounds).toEqual({ x: -10, y: -10, width: 120, height: 120 });
    expect(result.visibleItems.map(({ id }) => id)).toEqual(['visible', 'overscan']);
    expect(result.totalCount).toBe(3);
    expect(result.culledCount).toBe(1);
    expect(result.examinedCount).toBe(3);
    expect(Object.isFrozen(result.visibleItems)).toBe(true);
  });

  it('requires and uses a bounded spatial index for large-canvas virtualization', () => {
    const fixture = createCanvasPerformanceFixture({
      itemCount: 100_000,
      columns: 1_000,
      itemWidth: 20,
      itemHeight: 20,
      gap: 20,
    });
    expect(() =>
      virtualizeCanvasItems(fixture.items, {
        viewport: { x: 0, y: 0, width: 100, height: 100 },
        overscan: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'index-required' }));

    const index = createCanvasVirtualIndex(fixture.items, { cellSize: 128 });
    const result = index.query({
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      overscan: 0,
    });

    expect(result.totalCount).toBe(100_000);
    expect(result.visibleItems.length).toBeGreaterThan(0);
    expect(result.examinedCount).toBeLessThan(100);
  });

  it('fails closed for invalid virtual item metrics instead of corrupting culling', () => {
    expect(() =>
      virtualizeCanvasItems([item('bad', Number.POSITIVE_INFINITY, 0)], {
        viewport: { x: 0, y: 0, width: 100, height: 100 },
        overscan: 0,
      }),
    ).toThrowError(CanvasPerformanceError);
  });

  it('aggregates supplied measurements deterministically against interaction budgets', () => {
    const metrics = createCanvasPerformanceMetrics();
    metrics.record('pan-zoom-frame', 8);
    metrics.record('pan-zoom-frame', 20);
    metrics.record('stroke-input', 2);

    expect(metrics.snapshot()).toEqual({
      kinds: {
        'pan-zoom-frame': {
          count: 2,
          totalMs: 28,
          minMs: 8,
          maxMs: 20,
          averageMs: 14,
          overBudgetCount: 1,
          budgetMs: CANVAS_DEFAULT_PERFORMANCE_BUDGETS['pan-zoom-frame'],
        },
        'stroke-input': {
          count: 1,
          totalMs: 2,
          minMs: 2,
          maxMs: 2,
          averageMs: 2,
          overBudgetCount: 0,
          budgetMs: CANVAS_DEFAULT_PERFORMANCE_BUDGETS['stroke-input'],
        },
      },
      totalSamples: 3,
      totalMs: 30,
    });
  });

  it('rejects non-finite, negative, and unreasonably large supplied measurements', () => {
    const metrics = createCanvasPerformanceMetrics();
    for (const durationMs of [Number.NaN, Number.POSITIVE_INFINITY, -1, 60_001]) {
      expect(() => metrics.record('stroke-input', durationMs)).toThrowError(CanvasPerformanceError);
    }
  });

  it('runs input and drawing work first while preserving FIFO order inside a priority', () => {
    const order: string[] = [];
    const scheduler = createCanvasWorkScheduler();
    scheduler.schedule({
      id: 'thumbnail',
      priority: 'thumbnail',
      estimatedCostMs: 2,
      run: () => order.push('thumbnail'),
    });
    scheduler.schedule({
      id: 'draw-a',
      priority: 'drawing',
      estimatedCostMs: 2,
      run: () => order.push('draw-a'),
    });
    scheduler.schedule({
      id: 'input',
      priority: 'input',
      estimatedCostMs: 2,
      run: () => order.push('input'),
    });
    scheduler.schedule({
      id: 'draw-b',
      priority: 'drawing',
      estimatedCostMs: 2,
      run: () => order.push('draw-b'),
    });

    const result = scheduler.flush({ budgetMs: 8, drawingActive: false });

    expect(order).toEqual(['input', 'draw-a', 'draw-b', 'thumbnail']);
    expect(result.completedIds).toEqual(['input', 'draw-a', 'draw-b', 'thumbnail']);
    expect(result.usedBudgetMs).toBe(8);
  });

  it('defers autosave and thumbnail work while drawing without starving queued input', () => {
    const autosave = vi.fn();
    const drawing = vi.fn();
    const scheduler = createCanvasWorkScheduler();
    scheduler.schedule({
      id: 'autosave',
      priority: 'autosave',
      estimatedCostMs: 1,
      run: autosave,
    });
    scheduler.schedule({
      id: 'drawing',
      priority: 'drawing',
      estimatedCostMs: 1,
      run: drawing,
    });

    expect(scheduler.flush({ budgetMs: 4, drawingActive: true })).toMatchObject({
      completedIds: ['drawing'],
      deferredIds: ['autosave'],
      remainingCount: 1,
    });
    expect(drawing).toHaveBeenCalledOnce();
    expect(autosave).not.toHaveBeenCalled();

    expect(scheduler.flush({ budgetMs: 4, drawingActive: false })).toMatchObject({
      completedIds: ['autosave'],
      remainingCount: 0,
    });
  });

  it('does not let lower-priority work overtake drawing work that misses the remaining budget', () => {
    const order: string[] = [];
    const scheduler = createCanvasWorkScheduler();
    scheduler.schedule({
      id: 'input',
      priority: 'input',
      estimatedCostMs: 4,
      run: () => order.push('input'),
    });
    scheduler.schedule({
      id: 'drawing',
      priority: 'drawing',
      estimatedCostMs: 4,
      run: () => order.push('drawing'),
    });
    scheduler.schedule({
      id: 'background',
      priority: 'background',
      estimatedCostMs: 1,
      run: () => order.push('background'),
    });

    expect(scheduler.flush({ budgetMs: 5, drawingActive: false })).toMatchObject({
      completedIds: ['input'],
      remainingCount: 2,
    });
    expect(order).toEqual(['input']);
  });

  it('uses worker execution only above operation thresholds with a usable fallback', () => {
    expect(
      decideCanvasWorker({
        operation: 'spatial-index',
        workloadSize: 10_000,
        workerAvailable: true,
      }),
    ).toEqual({ lane: 'worker', reason: 'threshold-met', threshold: 5_000 });
    expect(
      decideCanvasWorker({
        operation: 'spatial-index',
        workloadSize: 10_000,
        workerAvailable: false,
      }),
    ).toEqual({
      lane: 'deferred',
      reason: 'worker-unavailable',
      threshold: 5_000,
      maxMainThreadChunkSize: 4_999,
    });
    expect(
      decideCanvasWorker({
        operation: 'stroke-geometry',
        workloadSize: 100,
        workerAvailable: true,
      }),
    ).toEqual({
      lane: 'main-thread',
      reason: 'below-threshold',
      threshold: 1_000,
      maxMainThreadChunkSize: 999,
    });
  });

  it('defines bounded thumbnail generation, cache, and deferral policy', () => {
    expect(
      decideCanvasThumbnail({
        pixelWidth: 4_000,
        pixelHeight: 2_000,
        byteSize: 8_000_000,
        cached: false,
        visible: true,
      }),
    ).toEqual({
      action: 'generate',
      targetWidth: 512,
      targetHeight: 256,
      executionLane: 'worker',
      reason: 'ready',
    });
    expect(
      decideCanvasThumbnail({
        pixelWidth: 800,
        pixelHeight: 600,
        byteSize: 100_000,
        cached: true,
        visible: true,
      }),
    ).toEqual({
      action: 'use-cache',
      targetWidth: 512,
      targetHeight: 384,
      executionLane: 'none',
      reason: 'cached',
    });
    expect(
      decideCanvasThumbnail({
        pixelWidth: 800,
        pixelHeight: 600,
        byteSize: 100_000,
        cached: false,
        visible: false,
      }),
    ).toEqual({
      action: 'defer',
      targetWidth: 512,
      targetHeight: 384,
      executionLane: 'none',
      reason: 'not-visible',
    });

    expect(
      decideCanvasThumbnail({
        pixelWidth: 4_000,
        pixelHeight: 2_000,
        byteSize: 8_000_000,
        cached: false,
        visible: true,
        workerAvailable: false,
      }),
    ).toMatchObject({
      action: 'defer',
      executionLane: 'none',
      reason: 'worker-unavailable',
    });
    expect(
      decideCanvasThumbnail({
        pixelWidth: 100_000,
        pixelHeight: 100_000,
        byteSize: 2_000_000_000,
        cached: false,
        visible: true,
        workerAvailable: true,
      }),
    ).toMatchObject({
      action: 'defer',
      executionLane: 'none',
      reason: 'source-too-large',
    });
  });
});
