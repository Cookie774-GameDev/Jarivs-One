import { assertSiyuanIdentifier } from './siyuanContracts';

export const SIYUAN_SURFACE_COMMANDS = Object.freeze({
  open: 'siyuan_surface_open',
  setBounds: 'siyuan_surface_set_bounds',
  hide: 'siyuan_surface_hide',
  reload: 'siyuan_surface_reload',
  close: 'siyuan_surface_close',
  status: 'siyuan_surface_status',
});

export interface SiyuanSurfaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SiyuanSurfaceStatus {
  created: boolean;
  visible: boolean;
  projectId: string | null;
  mapId: string | null;
  notebookId: string | null;
  rootDocumentId: string | null;
  graphMode: 'local' | 'global' | null;
}

export interface SiyuanSurfaceTarget {
  mapId: string;
  notebookId: string | null;
  rootDocumentId: string | null;
  graphMode: 'local' | 'global';
}

export type SiyuanSurfaceInvoker = (
  command: string,
  argumentsValue?: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('siyuan_surface_status_invalid');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('siyuan_surface_status_invalid');
  }
  return value as Record<string, unknown>;
}

export function redactSiyuanSurfaceError(value: unknown): string {
  const message = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  return /^siyuan_[a-z0-9_]{1,96}$/u.test(message) ? message : 'siyuan_surface_unavailable';
}

export function parseSiyuanSurfaceStatus(value: unknown): SiyuanSurfaceStatus {
  const status = record(value);
  if (
    Object.keys(status).sort().join(',') !==
      'created,graphMode,mapId,notebookId,projectId,rootDocumentId,visible' ||
    typeof status.created !== 'boolean' ||
    typeof status.visible !== 'boolean' ||
    (status.projectId !== null && typeof status.projectId !== 'string') ||
    (status.mapId !== null && typeof status.mapId !== 'string') ||
    (status.notebookId !== null && typeof status.notebookId !== 'string') ||
    (status.rootDocumentId !== null && typeof status.rootDocumentId !== 'string') ||
    (status.graphMode !== null && status.graphMode !== 'local' && status.graphMode !== 'global')
  ) {
    throw new Error('siyuan_surface_status_invalid');
  }
  return Object.freeze({
    created: status.created,
    visible: status.visible,
    projectId:
      status.projectId === null
        ? null
        : assertSiyuanIdentifier(status.projectId, 'siyuan_project_id_invalid'),
    mapId:
      status.mapId === null ? null : assertSiyuanIdentifier(status.mapId, 'siyuan_map_id_invalid'),
    notebookId: status.notebookId === null ? null : assertSiyuanNodeId(status.notebookId),
    rootDocumentId:
      status.rootDocumentId === null ? null : assertSiyuanNodeId(status.rootDocumentId),
    graphMode: status.graphMode as SiyuanSurfaceStatus['graphMode'],
  });
}

function assertSiyuanNodeId(value: string): string {
  const exact = value.trim();
  if (!/^\d{14}-[a-z0-9]{7}$/u.test(exact)) throw new Error('siyuan_node_id_invalid');
  return exact;
}

export function assertSiyuanSurfaceTarget(value: SiyuanSurfaceTarget): SiyuanSurfaceTarget {
  const target: SiyuanSurfaceTarget = {
    mapId: assertSiyuanIdentifier(value.mapId, 'siyuan_map_id_invalid'),
    notebookId: value.notebookId === null ? null : assertSiyuanNodeId(value.notebookId),
    rootDocumentId: value.rootDocumentId === null ? null : assertSiyuanNodeId(value.rootDocumentId),
    graphMode: value.graphMode,
  };
  if (target.graphMode === 'local' && (!target.notebookId || !target.rootDocumentId)) {
    throw new Error('siyuan_surface_target_invalid');
  }
  return Object.freeze(target);
}

export function assertSiyuanSurfaceBounds(value: SiyuanSurfaceBounds): SiyuanSurfaceBounds {
  const finite = [value.x, value.y, value.width, value.height].every(Number.isFinite);
  if (
    !finite ||
    Math.abs(value.x) > 16_384 ||
    Math.abs(value.y) > 16_384 ||
    value.width < 320 ||
    value.height < 240 ||
    value.width > 16_384 ||
    value.height > 16_384
  ) {
    throw new Error('siyuan_surface_bounds_invalid');
  }
  return Object.freeze({ ...value });
}

export function measureSiyuanSurfaceBounds(element: HTMLElement): SiyuanSurfaceBounds {
  const rect = element.getBoundingClientRect();
  return assertSiyuanSurfaceBounds({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
}

export interface SiyuanSurfaceBridge {
  open(
    projectId: string,
    target: SiyuanSurfaceTarget,
    bounds: SiyuanSurfaceBounds,
  ): Promise<SiyuanSurfaceStatus>;
  setBounds(bounds: SiyuanSurfaceBounds): Promise<boolean>;
  hide(): Promise<boolean>;
  reload(): Promise<boolean>;
  close(): Promise<boolean>;
  status(): Promise<SiyuanSurfaceStatus>;
}

export function createSiyuanSurfaceBridge(invoke: SiyuanSurfaceInvoker): SiyuanSurfaceBridge {
  return Object.freeze<SiyuanSurfaceBridge>({
    async open(projectId: string, target: SiyuanSurfaceTarget, bounds: SiyuanSurfaceBounds) {
      const safeTarget = assertSiyuanSurfaceTarget(target);
      return parseSiyuanSurfaceStatus(
        await invoke(SIYUAN_SURFACE_COMMANDS.open, {
          projectId: assertSiyuanIdentifier(projectId, 'siyuan_project_id_invalid'),
          ...safeTarget,
          bounds: assertSiyuanSurfaceBounds(bounds),
        }),
      );
    },
    async setBounds(bounds: SiyuanSurfaceBounds) {
      return (
        (await invoke(SIYUAN_SURFACE_COMMANDS.setBounds, {
          bounds: assertSiyuanSurfaceBounds(bounds),
        })) === true
      );
    },
    async hide() {
      return (await invoke(SIYUAN_SURFACE_COMMANDS.hide)) === true;
    },
    async reload() {
      return (await invoke(SIYUAN_SURFACE_COMMANDS.reload)) === true;
    },
    async close() {
      return (await invoke(SIYUAN_SURFACE_COMMANDS.close)) === true;
    },
    async status() {
      return parseSiyuanSurfaceStatus(await invoke(SIYUAN_SURFACE_COMMANDS.status));
    },
  });
}

const invokeNative: SiyuanSurfaceInvoker = async (command, argumentsValue) => {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('siyuan_surface_desktop_required');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, argumentsValue);
};

export const productionSiyuanSurfaceBridge = createSiyuanSurfaceBridge(invokeNative);
