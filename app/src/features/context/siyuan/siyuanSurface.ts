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
  graphState: 'loading' | 'ready' | 'failed' | null;
  graphPhase:
    | 'starting'
    | 'document-loaded'
    | 'about-blank'
    | 'origin-navigated'
    | 'origin-reloaded'
    | 'origin-navigation-pending'
    | 'session-reload-requested'
    | 'navigation-status-unavailable'
    | 'navigation-unexpected'
    | 'bootstrap-dispatched'
    | 'eval-entered'
    | 'bootstrapped'
    | 'block-verified'
    | 'tree-opened'
    | 'graph-dock-found'
    | 'fullscreen-requested'
    | 'ready'
    | 'failed'
    | null;
  graphError: string | null;
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

const SIYUAN_GRAPH_ERRORS = new Set([
  'siyuan_graph_target_timeout',
  'siyuan_graph_target_unavailable',
  'siyuan_graph_target_invalid',
  'siyuan_graph_unavailable',
  'siyuan_graph_frame_mismatch',
  'siyuan_graph_origin_mismatch',
  'siyuan_graph_root_navigation_unavailable',
  'siyuan_graph_main_thread_unavailable',
]);
const SIYUAN_GRAPH_PHASES = new Set([
  'starting',
  'document-loaded',
  'about-blank',
  'origin-navigated',
  'origin-reloaded',
  'origin-navigation-pending',
  'session-reload-requested',
  'navigation-status-unavailable',
  'navigation-unexpected',
  'bootstrap-dispatched',
  'eval-entered',
  'bootstrapped',
  'block-verified',
  'tree-opened',
  'graph-dock-found',
  'fullscreen-requested',
  'ready',
  'failed',
]);

export function redactSiyuanSurfaceError(value: unknown): string {
  const message = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  return /^siyuan_[a-z0-9_]{1,96}$/u.test(message) ? message : 'siyuan_surface_unavailable';
}

export function parseSiyuanSurfaceStatus(value: unknown): SiyuanSurfaceStatus {
  const status = record(value);
  if (
    Object.keys(status).sort().join(',') !==
      'created,graphError,graphMode,graphPhase,graphState,mapId,notebookId,projectId,rootDocumentId,visible' ||
    typeof status.created !== 'boolean' ||
    typeof status.visible !== 'boolean' ||
    (status.projectId !== null && typeof status.projectId !== 'string') ||
    (status.mapId !== null && typeof status.mapId !== 'string') ||
    (status.notebookId !== null && typeof status.notebookId !== 'string') ||
    (status.rootDocumentId !== null && typeof status.rootDocumentId !== 'string') ||
    (status.graphMode !== null && status.graphMode !== 'local' && status.graphMode !== 'global') ||
    (status.graphState !== null &&
      status.graphState !== 'loading' &&
      status.graphState !== 'ready' &&
      status.graphState !== 'failed') ||
    (status.graphPhase !== null &&
      (typeof status.graphPhase !== 'string' || !SIYUAN_GRAPH_PHASES.has(status.graphPhase))) ||
    (status.graphError !== null &&
      (typeof status.graphError !== 'string' || !SIYUAN_GRAPH_ERRORS.has(status.graphError))) ||
    (status.graphState === 'failed' && status.graphError === null) ||
    (status.graphState !== 'failed' && status.graphError !== null) ||
    (status.graphState === null) !== (status.graphPhase === null) ||
    (status.graphState === 'ready' && status.graphPhase !== 'ready') ||
    (status.graphState === 'failed' && status.graphPhase !== 'failed')
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
    graphState: status.graphState as SiyuanSurfaceStatus['graphState'],
    graphPhase: status.graphPhase as SiyuanSurfaceStatus['graphPhase'],
    graphError: status.graphError as string | null,
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
    operationId: string,
    projectId: string,
    target: SiyuanSurfaceTarget,
    bounds: SiyuanSurfaceBounds,
  ): Promise<SiyuanSurfaceStatus>;
  setBounds(operationId: string, bounds: SiyuanSurfaceBounds): Promise<boolean>;
  hide(operationId: string): Promise<boolean>;
  reload(operationId: string): Promise<boolean>;
  close(operationId: string): Promise<boolean>;
  status(): Promise<SiyuanSurfaceStatus>;
}

export function createSiyuanSurfaceBridge(invoke: SiyuanSurfaceInvoker): SiyuanSurfaceBridge {
  return Object.freeze<SiyuanSurfaceBridge>({
    async open(
      operationId: string,
      projectId: string,
      target: SiyuanSurfaceTarget,
      bounds: SiyuanSurfaceBounds,
    ) {
      const safeTarget = assertSiyuanSurfaceTarget(target);
      return parseSiyuanSurfaceStatus(
        await invoke(SIYUAN_SURFACE_COMMANDS.open, {
          operationId: assertSiyuanIdentifier(operationId, 'siyuan_surface_operation_invalid'),
          projectId: assertSiyuanIdentifier(projectId, 'siyuan_project_id_invalid'),
          ...safeTarget,
          bounds: assertSiyuanSurfaceBounds(bounds),
        }),
      );
    },
    async setBounds(operationId: string, bounds: SiyuanSurfaceBounds) {
      return (
        (await invoke(SIYUAN_SURFACE_COMMANDS.setBounds, {
          operationId: assertSiyuanIdentifier(operationId, 'siyuan_surface_operation_invalid'),
          bounds: assertSiyuanSurfaceBounds(bounds),
        })) === true
      );
    },
    async hide(operationId: string) {
      return (
        (await invoke(SIYUAN_SURFACE_COMMANDS.hide, {
          operationId: assertSiyuanIdentifier(operationId, 'siyuan_surface_operation_invalid'),
        })) === true
      );
    },
    async reload(operationId: string) {
      return (
        (await invoke(SIYUAN_SURFACE_COMMANDS.reload, {
          operationId: assertSiyuanIdentifier(operationId, 'siyuan_surface_operation_invalid'),
        })) === true
      );
    },
    async close(operationId: string) {
      return (
        (await invoke(SIYUAN_SURFACE_COMMANDS.close, {
          operationId: assertSiyuanIdentifier(operationId, 'siyuan_surface_operation_invalid'),
        })) === true
      );
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
