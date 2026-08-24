import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { GlobalUndoRedoHost } from './GlobalUndoRedoHost';
import { globalUndoRedo } from './history';

describe('GlobalUndoRedoHost', () => {
  beforeEach(() => {
    globalUndoRedo.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({ route: 'chat' });
    useAuthStore.setState({ localUserId: 'local-a', cloudSession: null });
  });

  afterEach(() => {
    cleanup();
    globalUndoRedo.clear();
  });

  it('renders no visible undo/redo interface and preserves native editor shortcuts', () => {
    const rendered = render(
      <>
        <input aria-label="Name" defaultValue="Researcher" />
        <GlobalUndoRedoHost />
      </>,
    );
    const input = rendered.getByRole('textbox', { name: 'Name' });
    input.focus();
    const cut = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(cut);
    input.dispatchEvent(undo);

    expect(cut.defaultPrevented).toBe(false);
    expect(undo.defaultPrevented).toBe(false);
    expect(rendered.container.querySelector('button')).toBeNull();
  });

  it('supports Ctrl+X Undo outside editors and Ctrl+Y Redo without stealing local editor history', async () => {
    const undo = vi.fn();
    const redo = vi.fn();
    globalUndoRedo.record({ label: 'Delete agent Researcher', undo, redo });
    render(<GlobalUndoRedoHost />);

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    await vi.waitFor(() => expect(undo).toHaveBeenCalledOnce());

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalledOnce());
  });

  it('clears action history when account or workspace authority changes', () => {
    globalUndoRedo.record({ label: 'Delete skill', undo: vi.fn(), redo: vi.fn() });
    render(<GlobalUndoRedoHost />);
    expect(globalUndoRedo.getSnapshot().canUndo).toBe(true);

    act(() => useAuthStore.setState({ localUserId: 'local-b' }));
    expect(globalUndoRedo.getSnapshot().canUndo).toBe(false);
  });

  it('defers Canvas and Workbench to their existing document histories', () => {
    useUIStore.setState({ route: 'canvas' });
    const undo = vi.fn();
    globalUndoRedo.record({ label: 'Global action', undo, redo: vi.fn() });
    const rendered = render(<GlobalUndoRedoHost />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(rendered.container.innerHTML).toBe('');
    expect(undo).not.toHaveBeenCalled();
  });
});
