import { describe, expect, it, vi } from 'vitest';
import { createGlobalHistory } from './history';

describe('global undo and redo history', () => {
  it('undoes and redoes one completed action with concise labels', async () => {
    const history = createGlobalHistory({ limit: 4 });
    const undo = vi.fn();
    const redo = vi.fn();

    history.record({ label: '  Delete   agent   Researcher  ', undo, redo });
    expect(history.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: 'Delete agent Researcher',
    });

    await expect(history.undo()).resolves.toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(history.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: 'Delete agent Researcher',
    });

    await expect(history.redo()).resolves.toBe(true);
    expect(redo).toHaveBeenCalledOnce();
    expect(history.getSnapshot().canUndo).toBe(true);
  });

  it('invalidates redo after a new completed action and bounds retained history', async () => {
    const history = createGlobalHistory({ limit: 2 });
    const action = (label: string) => ({ label, undo: vi.fn(), redo: vi.fn() });

    history.record(action('One'));
    history.record(action('Two'));
    history.record(action('Three'));
    await history.undo();
    expect(history.getSnapshot().redoLabel).toBe('Three');

    history.record(action('Branch'));
    expect(history.getSnapshot()).toMatchObject({ canRedo: false, undoLabel: 'Branch' });
    await history.undo();
    await history.undo();
    expect(history.getSnapshot().canUndo).toBe(false);
  });

  it('keeps a failed action on its original stack and reports the safe error', async () => {
    const history = createGlobalHistory();
    const failure = new Error('restore failed');
    history.record({
      label: 'Delete skill',
      undo: vi.fn().mockRejectedValue(failure),
      redo: vi.fn(),
    });

    await expect(history.undo()).rejects.toBe(failure);
    expect(history.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      lastError: 'Undo failed. Nothing else was changed.',
    });
  });

  it('serializes rapid requests so operations never compete', async () => {
    const history = createGlobalHistory();
    const order: string[] = [];
    let releaseFirst!: () => void;
    history.record({
      label: 'First',
      undo: () => {
        order.push('first');
      },
      redo: vi.fn(),
    });
    history.record({
      label: 'Second',
      undo: () =>
        new Promise<void>((resolve) => {
          order.push('second:start');
          releaseFirst = () => {
            order.push('second:end');
            resolve();
          };
        }),
      redo: vi.fn(),
    });

    const second = history.undo();
    const first = history.undo();
    await vi.waitFor(() => expect(order).toEqual(['second:start']));
    releaseFirst();
    await Promise.all([second, first]);
    expect(order).toEqual(['second:start', 'second:end', 'first']);
  });

  it('clears account-bound closures immediately', () => {
    const history = createGlobalHistory();
    history.record({ label: 'Delete agent', undo: vi.fn(), redo: vi.fn() });
    history.clear();
    expect(history.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('does not reattach an in-flight action after account history is cleared', async () => {
    const history = createGlobalHistory();
    let release!: () => void;
    history.record({
      label: 'Delete agent',
      undo: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      redo: vi.fn(),
    });

    const pending = history.undo();
    await vi.waitFor(() => expect(history.getSnapshot().busy).toBe(true));
    history.clear();
    release();
    await pending;

    expect(history.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('does not remove a newer action recorded while an undo is in flight', async () => {
    const history = createGlobalHistory();
    let finishUndo!: () => void;
    history.record({
      label: 'Slow action',
      undo: () =>
        new Promise<void>((resolve) => {
          finishUndo = resolve;
        }),
      redo: vi.fn(),
    });

    const undo = history.undo();
    await vi.waitFor(() => expect(history.getSnapshot().busy).toBe(true));
    history.record({ label: 'New action', undo: vi.fn(), redo: vi.fn() });
    finishUndo();
    await undo;

    expect(history.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: 'New action',
    });
  });
});
