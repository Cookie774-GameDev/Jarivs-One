import { describe, expect, it } from 'vitest';
import {
  CANVAS_HISTORY_ACTION_KINDS,
  CanvasHistoryError,
  createCanvasHistory,
  restoreCanvasHistory,
  type CanvasHistoryActionKind,
} from './history';

interface TestState {
  readonly objects: readonly string[];
  readonly mode: 'page' | 'edgeless';
}

const initial: TestState = { objects: [], mode: 'page' };

function commit(
  history: ReturnType<typeof createCanvasHistory<TestState>>,
  id: string,
  after: TestState,
  overrides: Partial<{
    kind: CanvasHistoryActionKind;
    timestamp: number;
    coalesceKey: string;
  }> = {},
): void {
  history.commit({
    id,
    label: id,
    kind: overrides.kind ?? 'object-create',
    timestamp: overrides.timestamp ?? 1,
    after,
    coalesceKey: overrides.coalesceKey,
  });
}

describe('canvas transactional history', () => {
  it('defines every required undoable action kind as a closed set', () => {
    expect(CANVAS_HISTORY_ACTION_KINDS).toEqual([
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
    ]);
  });

  it('commits, undoes, and redoes an atomic state transition', () => {
    const history = createCanvasHistory(initial);
    const created = { objects: ['one'], mode: 'page' } as const;

    commit(history, 'create-one', created);

    expect(history.current()).toBe(created);
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(initial);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe(created);
  });

  it('treats multi-object changes as one transaction', () => {
    const history = createCanvasHistory(initial);
    const inserted = { objects: ['one', 'two', 'three'], mode: 'edgeless' } as const;

    commit(history, 'template', inserted, { kind: 'template-insertion' });

    expect(history.undo()).toBe(initial);
    expect(history.redo()).toBe(inserted);
    expect(history.entries()).toHaveLength(1);
  });

  it('invalidates redo history when a new branch is committed', () => {
    const history = createCanvasHistory(initial);
    const first = { objects: ['one'], mode: 'page' } as const;
    const branch = { objects: ['two'], mode: 'page' } as const;
    commit(history, 'first', first);
    history.undo();

    commit(history, 'branch', branch);

    expect(history.current()).toBe(branch);
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBe(branch);
  });

  it('coalesces continuous pointer movement by kind, key, and time window', () => {
    const history = createCanvasHistory(initial, { coalesceWindowMs: 500 });
    const movedOnce = { objects: ['x=1'], mode: 'page' } as const;
    const movedTwice = { objects: ['x=2'], mode: 'page' } as const;
    commit(history, 'move-1', movedOnce, {
      kind: 'object-move',
      timestamp: 100,
      coalesceKey: 'object:one:pointer',
    });
    commit(history, 'move-2', movedTwice, {
      kind: 'object-move',
      timestamp: 450,
      coalesceKey: 'object:one:pointer',
    });

    expect(history.entries()).toHaveLength(1);
    expect(history.undo()).toBe(initial);
    expect(history.redo()).toBe(movedTwice);
  });

  it('does not coalesce different keys or actions outside the time window', () => {
    const history = createCanvasHistory(initial, { coalesceWindowMs: 100 });
    commit(
      history,
      'move-1',
      { objects: ['x=1'], mode: 'page' },
      {
        kind: 'object-move',
        timestamp: 100,
        coalesceKey: 'object:one:pointer',
      },
    );
    commit(
      history,
      'move-2',
      { objects: ['x=2'], mode: 'page' },
      {
        kind: 'object-move',
        timestamp: 300,
        coalesceKey: 'object:one:pointer',
      },
    );
    commit(
      history,
      'move-other',
      { objects: ['x=2', 'other=1'], mode: 'page' },
      {
        kind: 'object-move',
        timestamp: 320,
        coalesceKey: 'object:two:pointer',
      },
    );

    expect(history.entries()).toHaveLength(3);
  });

  it('bounds retained transactions without losing the current state', () => {
    const history = createCanvasHistory(initial, { capacity: 2 });
    const one = { objects: ['one'], mode: 'page' } as const;
    const two = { objects: ['two'], mode: 'page' } as const;
    const three = { objects: ['three'], mode: 'page' } as const;
    commit(history, 'one', one);
    commit(history, 'two', two);
    commit(history, 'three', three);

    expect(history.entries()).toHaveLength(2);
    expect(history.undo()).toBe(two);
    expect(history.undo()).toBe(one);
    expect(history.canUndo()).toBe(false);
  });

  it('creates and restores a crash-recovery snapshot with undo and redo state', () => {
    const history = createCanvasHistory(initial);
    const one = { objects: ['one'], mode: 'page' } as const;
    const two = { objects: ['two'], mode: 'edgeless' } as const;
    commit(history, 'one', one);
    commit(history, 'two', two, { kind: 'mode-change', timestamp: 2 });
    history.undo();

    const restored = restoreCanvasHistory<TestState>(history.snapshot());

    expect(restored.current()).toEqual(one);
    expect(restored.undo()).toEqual(initial);
    expect(restored.redo()).toEqual(one);
    expect(restored.redo()).toEqual(two);
  });

  it.each([
    ['invalid capacity', () => createCanvasHistory(initial, { capacity: 0 })],
    [
      'unsupported action kind',
      () =>
        createCanvasHistory(initial).commit({
          id: 'bad',
          label: 'bad',
          kind: 'teleport' as never,
          timestamp: 1,
          after: initial,
        }),
    ],
    [
      'invalid timestamp',
      () =>
        createCanvasHistory(initial).commit({
          id: 'bad',
          label: 'bad',
          kind: 'object-create',
          timestamp: Number.NaN,
          after: { objects: ['one'], mode: 'page' },
        }),
    ],
    ['malformed recovery', () => restoreCanvasHistory({ schemaVersion: 99 } as never)],
  ])('fails closed for %s', (_label, operation) => {
    expect(operation).toThrow(CanvasHistoryError);
  });
});
