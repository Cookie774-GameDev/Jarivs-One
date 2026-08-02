import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, type CanvasCamera } from './contracts';

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasViewport {
  readonly width: number;
  readonly height: number;
}

export interface CanvasWorldBounds extends CanvasPoint {
  readonly width: number;
  readonly height: number;
}

export class CanvasCameraError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`Invalid canvas camera value at ${path}: ${message}`);
    this.name = 'CanvasCameraError';
  }
}

function finite(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new CanvasCameraError(path, 'expected a finite number');
  }
  return value;
}

function point(value: CanvasPoint, path: string): CanvasPoint {
  return Object.freeze({
    x: finite(value.x, `${path}.x`),
    y: finite(value.y, `${path}.y`),
  });
}

function viewportSize(value: CanvasViewport): CanvasViewport {
  const width = finite(value.width, 'viewport.width');
  const height = finite(value.height, 'viewport.height');
  if (width <= 0 || height <= 0) {
    throw new CanvasCameraError('viewport', 'width and height must be positive');
  }
  return Object.freeze({ width, height });
}

function normalizedCamera(value: CanvasCamera): CanvasCamera {
  const x = finite(value.x, 'camera.x');
  const y = finite(value.y, 'camera.y');
  const zoom = finite(value.zoom, 'camera.zoom');
  if (zoom < CANVAS_MIN_ZOOM || zoom > CANVAS_MAX_ZOOM) {
    throw new CanvasCameraError(
      'camera.zoom',
      `expected a value between ${CANVAS_MIN_ZOOM} and ${CANVAS_MAX_ZOOM}`,
    );
  }
  return Object.freeze({ x, y, zoom });
}

function sameCamera(left: CanvasCamera, right: CanvasCamera): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

export function worldToScreen(
  cameraValue: CanvasCamera,
  viewportValue: CanvasViewport,
  worldValue: CanvasPoint,
): CanvasPoint {
  const camera = normalizedCamera(cameraValue);
  const viewport = viewportSize(viewportValue);
  const world = point(worldValue, 'world');
  return Object.freeze({
    x: (world.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (world.y - camera.y) * camera.zoom + viewport.height / 2,
  });
}

export function screenToWorld(
  cameraValue: CanvasCamera,
  viewportValue: CanvasViewport,
  screenValue: CanvasPoint,
): CanvasPoint {
  const camera = normalizedCamera(cameraValue);
  const viewport = viewportSize(viewportValue);
  const screen = point(screenValue, 'screen');
  return Object.freeze({
    x: camera.x + (screen.x - viewport.width / 2) / camera.zoom,
    y: camera.y + (screen.y - viewport.height / 2) / camera.zoom,
  });
}

export function panCameraByScreenDelta(
  cameraValue: CanvasCamera,
  deltaValue: CanvasPoint,
): CanvasCamera {
  const camera = normalizedCamera(cameraValue);
  const delta = point(deltaValue, 'delta');
  return Object.freeze({
    x: camera.x - delta.x / camera.zoom,
    y: camera.y - delta.y / camera.zoom,
    zoom: camera.zoom,
  });
}

export function zoomCameraAtScreenPoint(
  cameraValue: CanvasCamera,
  viewportValue: CanvasViewport,
  screenValue: CanvasPoint,
  requestedZoom: number,
): CanvasCamera {
  const camera = normalizedCamera(cameraValue);
  const viewport = viewportSize(viewportValue);
  const screen = point(screenValue, 'screen');
  const target = finite(requestedZoom, 'requestedZoom');
  const zoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, target));
  const anchor = screenToWorld(camera, viewport, screen);
  return Object.freeze({
    x: anchor.x - (screen.x - viewport.width / 2) / zoom,
    y: anchor.y - (screen.y - viewport.height / 2) / zoom,
    zoom,
  });
}

export function fitWorldBounds(
  boundsValue: CanvasWorldBounds,
  viewportValue: CanvasViewport,
  paddingValue = 48,
): CanvasCamera {
  const bounds = {
    ...point(boundsValue, 'bounds'),
    width: finite(boundsValue.width, 'bounds.width'),
    height: finite(boundsValue.height, 'bounds.height'),
  };
  if (bounds.width < 0 || bounds.height < 0) {
    throw new CanvasCameraError('bounds', 'width and height must not be negative');
  }
  const viewport = viewportSize(viewportValue);
  const padding = finite(paddingValue, 'padding');
  if (padding < 0 || padding * 2 >= viewport.width || padding * 2 >= viewport.height) {
    throw new CanvasCameraError('padding', 'must leave a positive viewport area');
  }
  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;
  const widthZoom = bounds.width === 0 ? CANVAS_MAX_ZOOM : availableWidth / bounds.width;
  const heightZoom = bounds.height === 0 ? CANVAS_MAX_ZOOM : availableHeight / bounds.height;
  const fittedZoom = Math.min(widthZoom, heightZoom);
  return Object.freeze({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    zoom: Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, fittedZoom)),
  });
}

export function resetCamera(): CanvasCamera {
  return Object.freeze({ x: 0, y: 0, zoom: 1 });
}

export function cameraZoomPercent(cameraValue: CanvasCamera): number {
  return Math.round(normalizedCamera(cameraValue).zoom * 100);
}

export interface CanvasCameraNavigator {
  current(): CanvasCamera;
  visit(camera: CanvasCamera): CanvasCamera;
  canGoBack(): boolean;
  canGoForward(): boolean;
  back(): CanvasCamera;
  forward(): CanvasCamera;
}

export function createCameraNavigator(
  initialCamera: CanvasCamera,
  capacity = 50,
): CanvasCameraNavigator {
  if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 500) {
    throw new CanvasCameraError('capacity', 'expected an integer between 2 and 500');
  }
  let entries: CanvasCamera[] = [normalizedCamera(initialCamera)];
  let index = 0;

  const current = (): CanvasCamera => entries[index];

  return Object.freeze({
    current,
    visit(cameraValue: CanvasCamera): CanvasCamera {
      const camera = normalizedCamera(cameraValue);
      if (sameCamera(current(), camera)) {
        return current();
      }
      entries = [...entries.slice(0, index + 1), camera];
      if (entries.length > capacity) {
        entries = entries.slice(entries.length - capacity);
      }
      index = entries.length - 1;
      return current();
    },
    canGoBack(): boolean {
      return index > 0;
    },
    canGoForward(): boolean {
      return index < entries.length - 1;
    },
    back(): CanvasCamera {
      if (index > 0) {
        index -= 1;
      }
      return current();
    },
    forward(): CanvasCamera {
      if (index < entries.length - 1) {
        index += 1;
      }
      return current();
    },
  });
}
