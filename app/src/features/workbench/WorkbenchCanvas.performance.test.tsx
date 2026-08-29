import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchPanel as WorkbenchPanelModel } from './types';

const renders = vi.hoisted(() => ({ browser: 0, reference: 0 }));

vi.mock('./BrowserPanel', () => ({
  BrowserPanel: () => {
    renders.browser += 1;
    return <div>Browser surface</div>;
  },
}));

vi.mock('./ReferencePanel', () => ({
  ReferencePanel: () => {
    renders.reference += 1;
    return <div>Reference surface</div>;
  },
}));

vi.mock('./TerminalPanel', () => ({
  TerminalPanel: () => <div>Terminal surface</div>,
}));

import { WorkbenchCanvas } from './WorkbenchCanvas';
import { useWorkbenchStore } from './store';

const makePanel = (kind: WorkbenchPanelModel['kind'] = 'notes'): WorkbenchPanelModel => ({
  id: `${kind}-1`,
  kind,
  title: kind === 'browser' ? 'Browser' : 'Notes',
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  z: 1,
  minimized: false,
  status: 'ready',
  settings: kind === 'browser' ? { url: 'https://example.com' } : {},
});

describe('WorkbenchCanvas performance equivalence', () => {
  let animationFrames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  beforeEach(() => {
    renders.browser = 0;
    renders.reference = 0;
    animationFrames = new Map();
    nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      animationFrames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrames.delete(id);
    });
    useWorkbenchStore.setState({
      panels: [makePanel()],
      selectedIds: [],
      view: { x: 24, y: 24, zoom: 0.8 },
      canvasSize: { width: 1000, height: 700 },
      history: [],
      future: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const runAnimationFrame = () => {
    const queued = [...animationFrames.entries()];
    animationFrames.clear();
    act(() => {
      for (const [, callback] of queued) callback(performance.now());
    });
  };

  it('does not rerender unchanged non-native panel content for camera translation', () => {
    render(<WorkbenchCanvas />);
    const beforeCameraMove = renders.reference;

    act(() => useWorkbenchStore.getState().setView({ x: 80, y: -40 }));

    expect(renders.reference).toBe(beforeCameraMove);
    expect(screen.getByText('Reference surface')).toBeTruthy();
  });

  it('rerenders panel content when the panel model actually changes', () => {
    render(<WorkbenchCanvas />);
    const beforePanelUpdate = renders.reference;

    act(() => useWorkbenchStore.getState().updatePanel('notes-1', { status: 'busy' }));

    expect(renders.reference).toBeGreaterThan(beforePanelUpdate);
  });

  it('keeps native browser content rendering on camera translation for bounds reconciliation', () => {
    useWorkbenchStore.setState({ panels: [makePanel('browser')] });
    render(<WorkbenchCanvas />);
    const beforeCameraMove = renders.browser;

    act(() => useWorkbenchStore.getState().setView({ x: 80, y: -40 }));

    expect(renders.browser).toBeGreaterThan(beforeCameraMove);
  });

  it('coalesces pointer movement and flushes the exact final position on pointer up', () => {
    render(<WorkbenchCanvas />);
    const canvas = screen.getByTestId('workbench-canvas');

    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 30, clientY: 50 });
    fireEvent.pointerMove(window, { clientX: 45, clientY: 70 });
    expect(useWorkbenchStore.getState().view).toEqual({ x: 24, y: 24, zoom: 0.8 });

    fireEvent.pointerUp(window, { clientX: 55, clientY: 80 });
    expect(useWorkbenchStore.getState().view).toEqual({ x: 69, y: 84, zoom: 0.8 });
    expect(animationFrames.size).toBe(0);
  });

  it('accumulates wheel deltas into one exact camera write per frame', () => {
    render(<WorkbenchCanvas />);
    const canvas = screen.getByTestId('workbench-canvas');

    fireEvent.wheel(canvas, { deltaX: 4, deltaY: 6 });
    fireEvent.wheel(canvas, { deltaX: 3, deltaY: -2 });
    expect(useWorkbenchStore.getState().view).toEqual({ x: 24, y: 24, zoom: 0.8 });
    expect(animationFrames.size).toBe(1);

    runAnimationFrame();
    expect(useWorkbenchStore.getState().view).toEqual({ x: 17, y: 20, zoom: 0.8 });
  });

  it('preserves sequential zoom clamping while coalescing wheel input', () => {
    useWorkbenchStore.setState({ view: { x: 24, y: 24, zoom: 0.25 } });
    render(<WorkbenchCanvas />);
    const canvas = screen.getByTestId('workbench-canvas');

    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: 100 });
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100 });
    runAnimationFrame();

    expect(useWorkbenchStore.getState().view.zoom).toBeCloseTo(0.37);
  });
});
