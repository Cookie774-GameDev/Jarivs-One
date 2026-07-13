import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchPage } from './WorkbenchPage';
import { useWorkbenchStore } from './store';

vi.mock('@/features/terminals/TerminalView', () => ({
  TerminalView: ({ onReady }: { onReady?: (id: string) => void }) => {
    React.useEffect(() => onReady?.('pty-test-session'), [onReady]);
    return <div data-testid="live-terminal">Live PTY terminal</div>;
  },
}));

vi.mock('@/lib/tauri', () => ({
  openExternal: vi.fn(async () => undefined),
}));

describe('WorkbenchPage', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    useWorkbenchStore.getState().resetWorkbench();
  });

  afterEach(() => vi.restoreAllMocks());

  it('exposes the live canvas, templates, wallpaper controls, and panel palette', () => {
    render(<WorkbenchPage />);

    expect(screen.getByRole('main', { name: 'VibeSpace Workbench' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spawn Workbench' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wallpapers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Terminal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Browser' })).toBeTruthy();
    expect(screen.getAllByTestId('live-terminal')).toHaveLength(2);
    expect(screen.getByTestId('workbench-wallpaper').style.pointerEvents).toBe('none');
  });

  it('adds and removes a real terminal panel without auto-running a command', () => {
    render(<WorkbenchPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Terminal' }));

    expect(screen.getAllByTestId('live-terminal')).toHaveLength(3);
    expect(useWorkbenchStore.getState().panels.at(-1)?.settings.command).toBeUndefined();

    fireEvent.click(screen.getAllByRole('button', { name: /Close Terminal/i }).at(-1)!);
    expect(screen.getAllByTestId('live-terminal')).toHaveLength(2);
  });

  it('supports keyboard zoom and undo on the spatial canvas', () => {
    render(<WorkbenchPage />);
    const canvas = screen.getByTestId('workbench-canvas');
    const startZoom = useWorkbenchStore.getState().view.zoom;

    fireEvent.keyDown(canvas, { key: '+' });
    expect(useWorkbenchStore.getState().view.zoom).toBeGreaterThan(startZoom);

    fireEvent.click(screen.getByRole('button', { name: 'Add Notes' }));
    expect(useWorkbenchStore.getState().panels.some((panel) => panel.kind === 'notes')).toBe(true);
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(useWorkbenchStore.getState().panels.some((panel) => panel.kind === 'notes')).toBe(false);
  });
});
