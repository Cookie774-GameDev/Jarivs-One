import { describe, expect, it } from 'vitest';
import {
  CanvasCameraError,
  cameraZoomPercent,
  createCameraNavigator,
  fitWorldBounds,
  panCameraByScreenDelta,
  resetCamera,
  screenToWorld,
  worldToScreen,
  zoomCameraAtScreenPoint,
} from './camera';
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from './contracts';

const viewport = { width: 1200, height: 800 };

describe('canvas camera transforms', () => {
  it('round-trips floating-point world coordinates through screen space', () => {
    const camera = { x: 42.25, y: -13.5, zoom: 1.75 };
    const world = { x: 251.125, y: -98.875 };

    const screen = worldToScreen(camera, viewport, world);

    expect(screenToWorld(camera, viewport, screen)).toEqual(world);
  });

  it('pans in screen pixels without storing screen-space positions', () => {
    const camera = panCameraByScreenDelta({ x: 10, y: 20, zoom: 2 }, { x: 80, y: -40 });

    expect(camera).toEqual({ x: -30, y: 40, zoom: 2 });
  });

  it('keeps the world point under the cursor stable while zooming', () => {
    const camera = { x: 100, y: -50, zoom: 1 };
    const cursor = { x: 900, y: 250 };
    const before = screenToWorld(camera, viewport, cursor);
    const zoomed = zoomCameraAtScreenPoint(camera, viewport, cursor, 2.5);

    expect(screenToWorld(zoomed, viewport, cursor)).toEqual(before);
    expect(zoomed.zoom).toBe(2.5);
  });

  it('clamps zoom to safe minimum and maximum values', () => {
    const camera = { x: 0, y: 0, zoom: 1 };

    expect(zoomCameraAtScreenPoint(camera, viewport, { x: 600, y: 400 }, 0).zoom).toBe(
      CANVAS_MIN_ZOOM,
    );
    expect(
      zoomCameraAtScreenPoint(camera, viewport, { x: 600, y: 400 }, Number.MAX_VALUE).zoom,
    ).toBe(CANVAS_MAX_ZOOM);
  });

  it('fits all, selection, or frame bounds with padding', () => {
    const fitted = fitWorldBounds({ x: -100, y: 50, width: 400, height: 200 }, viewport, 100);

    expect(fitted).toEqual({ x: 100, y: 150, zoom: 2.5 });
  });

  it('fits point-like bounds at maximum zoom without dividing by zero', () => {
    expect(fitWorldBounds({ x: 7, y: 9, width: 0, height: 0 }, viewport)).toEqual({
      x: 7,
      y: 9,
      zoom: CANVAS_MAX_ZOOM,
    });
  });

  it('resets the view and reports a rounded zoom percentage', () => {
    expect(resetCamera()).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(cameraZoomPercent({ x: 0, y: 0, zoom: 1.257 })).toBe(126);
  });

  it.each([
    [
      'invalid camera',
      () => worldToScreen({ x: 0, y: 0, zoom: Number.NaN }, viewport, { x: 0, y: 0 }),
    ],
    [
      'invalid viewport',
      () => screenToWorld({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 1 }, { x: 0, y: 0 }),
    ],
    [
      'invalid delta',
      () => panCameraByScreenDelta({ x: 0, y: 0, zoom: 1 }, { x: Number.POSITIVE_INFINITY, y: 0 }),
    ],
    ['invalid bounds', () => fitWorldBounds({ x: 0, y: 0, width: -1, height: 1 }, viewport)],
  ])('fails closed for %s', (_label, operation) => {
    expect(operation).toThrow(CanvasCameraError);
  });
});

describe('canvas navigator history', () => {
  it('returns to the last meaningful location and can move forward again', () => {
    const navigator = createCameraNavigator({ x: 0, y: 0, zoom: 1 }, 4);
    navigator.visit({ x: 100, y: 50, zoom: 2 });
    navigator.visit({ x: -20, y: 80, zoom: 0.5 });

    expect(navigator.canGoBack()).toBe(true);
    expect(navigator.back()).toEqual({ x: 100, y: 50, zoom: 2 });
    expect(navigator.back()).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(navigator.forward()).toEqual({ x: 100, y: 50, zoom: 2 });
  });

  it('deduplicates identical visits and invalidates forward history after a branch', () => {
    const navigator = createCameraNavigator({ x: 0, y: 0, zoom: 1 });
    navigator.visit({ x: 10, y: 10, zoom: 2 });
    navigator.visit({ x: 10, y: 10, zoom: 2 });
    navigator.back();
    navigator.visit({ x: 5, y: 5, zoom: 1.5 });

    expect(navigator.canGoForward()).toBe(false);
    expect(navigator.back()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('keeps a bounded navigator history', () => {
    const navigator = createCameraNavigator({ x: 0, y: 0, zoom: 1 }, 2);
    navigator.visit({ x: 1, y: 0, zoom: 1 });
    navigator.visit({ x: 2, y: 0, zoom: 1 });

    expect(navigator.back()).toEqual({ x: 1, y: 0, zoom: 1 });
    expect(navigator.canGoBack()).toBe(false);
  });
});
