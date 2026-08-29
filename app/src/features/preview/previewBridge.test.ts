import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewEmulation } from './previewDevices';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { previewCreate, previewSetBounds } from './previewBridge';

const bounds = { x: 12, y: 34, width: 195, height: 422 };
const emulation: PreviewEmulation = {
  viewportWidth: 390,
  viewportHeight: 844,
  screenWidth: 390,
  screenHeight: 844,
  deviceScaleFactor: 3,
  displayScale: 0.5,
  mobile: true,
  touch: true,
  orientation: 'portrait',
};

describe('native preview bridge emulation contract', () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(true);
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
  });

  it('sends logical device metrics separately from visual surface bounds on create', async () => {
    await previewCreate('https://example.com', bounds, emulation);

    expect(invokeMock).toHaveBeenCalledWith('preview_create', {
      url: 'https://example.com/',
      bounds,
      emulation,
    });
  });

  it('reapplies the same device metrics whenever bounds change', async () => {
    await previewSetBounds(bounds, emulation);

    expect(invokeMock).toHaveBeenCalledWith('preview_set_bounds', { bounds, emulation });
  });
});
