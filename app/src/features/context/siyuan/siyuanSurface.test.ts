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
  it('sends exact map/notebook/root graph identity and bounded geometry', async () => {
    const status = {
      created: true,
      visible: true,
      projectId: 'project-1',
      mapId: 'map-1',
      notebookId: '20260824010101-abcdefg',
      rootDocumentId: '20260824010102-abcdefg',
      graphMode: 'local' as const,
      graphState: 'ready' as const,
      graphPhase: 'ready' as const,
      graphError: null,
    };
    const invoke = vi.fn(async () => status);
    const bridge = createSiyuanSurfaceBridge(invoke);
    await expect(
      bridge.open(
        'operation-1',
        'project-1',
        {
          mapId: 'map-1',
          notebookId: '20260824010101-abcdefg',
          rootDocumentId: '20260824010102-abcdefg',
          graphMode: 'local',
        },
        { x: 400, y: 80, width: 1_200, height: 800 },
      ),
    ).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith(SIYUAN_SURFACE_COMMANDS.open, {
      projectId: 'project-1',
      operationId: 'operation-1',
      mapId: 'map-1',
      notebookId: '20260824010101-abcdefg',
      rootDocumentId: '20260824010102-abcdefg',
      graphMode: 'local',
      bounds: { x: 400, y: 80, width: 1_200, height: 800 },
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/cookie|token|origin|port|url/iu);
  });

  it('binds every renderer mutation to the exact open operation', async () => {
    const invoke = vi.fn(async () => true);
    const bridge = createSiyuanSurfaceBridge(invoke);
    const operationId = 'operation-1';
    const bounds = { x: 400, y: 80, width: 1_200, height: 800 };

    await bridge.setBounds(operationId, bounds);
    await bridge.hide(operationId);
    await bridge.reload(operationId);
    await bridge.close(operationId);

    expect(invoke.mock.calls).toEqual([
      [SIYUAN_SURFACE_COMMANDS.setBounds, { operationId, bounds }],
      [SIYUAN_SURFACE_COMMANDS.hide, { operationId }],
      [SIYUAN_SURFACE_COMMANDS.reload, { operationId }],
      [SIYUAN_SURFACE_COMMANDS.close, { operationId }],
    ]);
  });

  it('rejects secret-bearing or extra response fields and unsafe geometry', () => {
    expect(() =>
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        mapId: 'map-1',
        notebookId: '20260824010101-abcdefg',
        rootDocumentId: '20260824010102-abcdefg',
        graphMode: 'local',
        graphState: 'ready',
        graphPhase: 'ready',
        graphError: null,
        token: 'forbidden',
      }),
    ).toThrow('siyuan_surface_status_invalid');
    expect(() =>
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        mapId: 'map-1',
        notebookId: '20260824010101-abcdefg',
        rootDocumentId: '20260824010102-abcdefg',
        graphMode: 'local',
        graphState: 'ready',
        graphPhase: 'ready',
        graphError: 'siyuan_graph_target_unavailable',
      }),
    ).toThrow('siyuan_surface_status_invalid');
    expect(() => assertSiyuanSurfaceBounds({ x: 0, y: 0, width: 319, height: 800 })).toThrow(
      'siyuan_surface_bounds_invalid',
    );
  });

  it('accepts the authenticated managed-origin reload phase while loading', () => {
    expect(
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        mapId: 'map-1',
        notebookId: '20260824010101-abcdefg',
        rootDocumentId: '20260824010102-abcdefg',
        graphMode: 'local',
        graphState: 'loading',
        graphPhase: 'origin-reloaded',
        graphError: null,
      }),
    ).toMatchObject({ graphState: 'loading', graphPhase: 'origin-reloaded' });
  });

  it('accepts a new child waiting for its managed-origin navigation', () => {
    expect(
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        mapId: 'map-1',
        notebookId: '20260824010101-abcdefg',
        rootDocumentId: '20260824010102-abcdefg',
        graphMode: 'local',
        graphState: 'loading',
        graphPhase: 'origin-navigation-pending',
        graphError: null,
      }),
    ).toMatchObject({ graphState: 'loading', graphPhase: 'origin-navigation-pending' });
  });

  it('accepts the one-time authenticated session reload phase', () => {
    expect(
      parseSiyuanSurfaceStatus({
        created: true,
        visible: true,
        projectId: 'project-1',
        mapId: 'map-1',
        notebookId: '20260824010101-abcdefg',
        rootDocumentId: '20260824010102-abcdefg',
        graphMode: 'local',
        graphState: 'loading',
        graphPhase: 'session-reload-requested',
        graphError: null,
      }),
    ).toMatchObject({ graphState: 'loading', graphPhase: 'session-reload-requested' });
  });

  it.each(['siyuan_graph_root_navigation_unavailable', 'siyuan_graph_main_thread_unavailable'])(
    'accepts the fixed native lifecycle repair code %s',
    (graphError) => {
      expect(
        parseSiyuanSurfaceStatus({
          created: true,
          visible: true,
          projectId: 'project-1',
          mapId: 'map-1',
          notebookId: '20260824010101-abcdefg',
          rootDocumentId: '20260824010102-abcdefg',
          graphMode: 'local',
          graphState: 'failed',
          graphPhase: 'failed',
          graphError,
        }),
      ).toMatchObject({ graphState: 'failed', graphPhase: 'failed', graphError });
    },
  );

  it('redacts arbitrary runtime text while preserving stable surface error codes', () => {
    expect(redactSiyuanSurfaceError(new Error('siyuan_surface_window_unavailable'))).toBe(
      'siyuan_surface_window_unavailable',
    );
    expect(redactSiyuanSurfaceError('siyuan_transport_unavailable')).toBe(
      'siyuan_transport_unavailable',
    );
    expect(
      redactSiyuanSurfaceError(new Error('failed at http://127.0.0.1:63333?token=secret')),
    ).toBe('siyuan_surface_unavailable');
    expect(redactSiyuanSurfaceError('failed at http://127.0.0.1:63333?token=secret')).toBe(
      'siyuan_surface_unavailable',
    );
    expect(redactSiyuanSurfaceError({ message: 'siyuan_transport_unavailable' })).toBe(
      'siyuan_surface_unavailable',
    );
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
