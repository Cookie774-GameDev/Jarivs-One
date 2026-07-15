import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkbenchStore } from './store';

describe('fitView (home / recenter)', () => {
  beforeEach(() => {
    useWorkbenchStore.getState().resetWorkbench();
    useWorkbenchStore.setState({
      panels: [
        {
          id: 'a',
          kind: 'notes',
          title: 'A',
          x: 400,
          y: 300,
          width: 320,
          height: 240,
          z: 1,
          minimized: false,
          status: 'idle',
          settings: {},
        },
        {
          id: 'b',
          kind: 'browser',
          title: 'B',
          x: 900,
          y: 500,
          width: 400,
          height: 280,
          z: 2,
          minimized: false,
          status: 'idle',
          settings: {},
        },
      ],
      view: { x: -2000, y: -1500, zoom: 0.4 },
      canvasSize: { width: 1000, height: 700 },
      history: [],
      future: [],
    });
  });

  it('only changes camera and leaves panel geometry untouched', () => {
    const before = useWorkbenchStore.getState().panels.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      z: p.z,
    }));

    useWorkbenchStore.getState().fitView();

    const after = useWorkbenchStore.getState();
    expect(
      after.panels.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        z: p.z,
      })),
    ).toEqual(before);

    // Camera moved back so the workspace is visible again.
    expect(after.view.x).not.toBe(-2000);
    expect(after.view.y).not.toBe(-1500);
    expect(after.view.zoom).toBeGreaterThan(0.25);
    expect(after.view.zoom).toBeLessThanOrEqual(1.1);
  });

  it('autoArrange still rearranges but is separate from fitView', () => {
    const beforeX = useWorkbenchStore.getState().panels.map((p) => p.x);
    useWorkbenchStore.getState().autoArrange();
    const afterX = useWorkbenchStore.getState().panels.map((p) => p.x);
    expect(afterX).not.toEqual(beforeX);
  });
});
