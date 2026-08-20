import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  SIYUAN_SURFACE_COMMANDS,
  assertSiyuanSurfaceBounds,
  createSiyuanSurfaceBridge,
  measureSiyuanSurfaceBounds,
  parseSiyuanSurfaceStatus,
  redactSiyuanSurfaceError,
} from './siyuanSurface';

describe('SiYuan restricted surface bridge', () => {
  it('sends only project identity and bounded geometry and accepts a redacted status', async () => {
    const invoke = vi.fn(async () => ({ created: true, visible: true, projectId: 'project-1' }));
    const bridge = createSiyuanSurfaceBridge(invoke);
    await expect(
      bridge.open('project-1', { x: 400, y: 80, width: 1_200, height: 800 }),
    ).resolves.toEqual({ created: true, visible: true, projectId: 'project-1' });
    expect(invoke).toHaveBeenCalledWith(SIYUAN_SURFACE_COMMANDS.open, {
      projectId: 'project-1',
      bounds: { x: 400, y: 80, width: 1_200, height: 800 },
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/cookie|token|origin|port|url/iu);
  });

  it('rejects secret-bearing or extra response fields and unsafe geometry', () => {
    expect(() =>
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        token: 'forbidden',
      }),
    ).toThrow('siyuan_surface_status_invalid');
    expect(() => assertSiyuanSurfaceBounds({ x: 0, y: 0, width: 319, height: 800 })).toThrow(
      'siyuan_surface_bounds_invalid',
    );
  });

  it('redacts arbitrary runtime text while preserving stable surface error codes', () => {
    expect(redactSiyuanSurfaceError(new Error('siyuan_surface_window_unavailable'))).toBe(
      'siyuan_surface_window_unavailable',
    );
    expect(
      redactSiyuanSurfaceError(new Error('failed at http://127.0.0.1:63333?token=secret')),
    ).toBe('siyuan_surface_unavailable');
  });

  it('measures the exact reserved renderer rectangle', () => {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 421.4,
      top: 92.6,
      right: 1_621.8,
      bottom: 892.4,
      width: 1_200.4,
      height: 799.8,
      toJSON: () => ({}),
    });
    expect(measureSiyuanSurfaceBounds(element)).toEqual({
      x: 421,
      y: 93,
      width: 1_200,
      height: 800,
    });
  });

  it('gives the remote official surface zero Tauri authority', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tauriRoot = path.resolve(here, '../../../../src-tauri');
    const capability = JSON.parse(
      fs.readFileSync(path.join(tauriRoot, 'capabilities/siyuan-context-vault.json'), 'utf8'),
    ) as { windows?: unknown; permissions?: unknown; remote?: unknown; webviews?: unknown };
    const defaultCapability = JSON.parse(
      fs.readFileSync(path.join(tauriRoot, 'capabilities/default.json'), 'utf8'),
    ) as { windows?: unknown[]; webviews?: unknown[] };
    const config = JSON.parse(fs.readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8')) as {
      app?: { security?: { capabilities?: unknown[] } };
    };

    expect(capability.windows).toEqual(['siyuan-context-vault']);
    expect(capability.permissions).toEqual([]);
    expect(capability).not.toHaveProperty('remote');
    expect(capability).not.toHaveProperty('webviews');
    expect(defaultCapability.windows ?? []).not.toContain('siyuan-context-vault');
    expect(defaultCapability.webviews ?? []).not.toContain('siyuan-context-vault');
    expect(config.app?.security?.capabilities).toContain('siyuan-context-vault');
  });
});
