export const CONTEXT_WORKSPACE_EXAMPLES = Object.freeze([
  'Coding',
  'Security Audit',
  'Research',
  'Release Management',
  'GitHub Review',
  'JARVIS Activity',
] as const);

export const CONTEXT_WORKSPACE_GRAPH_MODES = Object.freeze(['global', 'local'] as const);
export const CONTEXT_WORKSPACE_VIEWS = Object.freeze(['graph', 'tree', 'notes'] as const);
export const CONTEXT_WORKSPACE_INSPECTOR_TABS = Object.freeze([
  'details',
  'links',
  'activity',
] as const);

export type ContextWorkspaceGraphMode = (typeof CONTEXT_WORKSPACE_GRAPH_MODES)[number];
export type ContextWorkspaceView = (typeof CONTEXT_WORKSPACE_VIEWS)[number];
export type ContextWorkspaceInspectorTab = (typeof CONTEXT_WORKSPACE_INSPECTOR_TABS)[number];

export interface ContextWorkspaceArrangement {
  activeMapId: string | null;
  selectedNodeId: string | null;
  openContextNoteIds: readonly string[];
  graphMode: ContextWorkspaceGraphMode;
  graphFilters: {
    nodeKinds: readonly string[];
    relationshipKinds: readonly string[];
    includeArchived: boolean;
  };
  localDepth: number;
  searchQuery: string;
  activeContextView: ContextWorkspaceView;
  sidebarVisibility: {
    maps: boolean;
    inspector: boolean;
  };
  sidebarWidths: {
    maps: number;
    inspector: number;
  };
  inspectorTab: ContextWorkspaceInspectorTab;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface ContextWorkspace {
  id: string;
  accountId: string;
  name: string;
  kind: 'context_workspace';
  arrangement: Readonly<ContextWorkspaceArrangement>;
  createdAt: number;
  updatedAt: number;
}

export interface ContextWorkspaceLibrary {
  version: 1;
  accountId: string;
  updatedAt: number;
  workspaces: ReadonlyArray<Readonly<ContextWorkspace>>;
}

export type ContextWorkspaceOperation =
  | {
      kind: 'save';
      workspaceId: string;
      name: string;
      arrangement: ContextWorkspaceArrangement;
      now: number;
    }
  | {
      kind: 'update';
      workspaceId: string;
      arrangement: ContextWorkspaceArrangement;
      now: number;
    }
  | { kind: 'rename'; workspaceId: string; name: string; now: number }
  | {
      kind: 'duplicate';
      workspaceId: string;
      newWorkspaceId: string;
      name: string;
      now: number;
    }
  | { kind: 'delete'; workspaceId: string; now: number };

export interface ContextWorkspaceLoadPlan {
  operation: 'load';
  accountId: string;
  workspaceId: string;
  name: string;
  arrangement: Readonly<ContextWorkspaceArrangement>;
  executable: false;
}

export interface ContextWorkspaceSwitcherItem {
  workspaceId: string;
  name: string;
  shortcut: `Ctrl+${number}` | null;
  active: boolean;
  executable: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const FORBIDDEN_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_WORKSPACES = 100;
const MAX_OPEN_NOTES = 50;
const MAX_FILTER_VALUES = 50;
const MAX_BOUNDARY_DEPTH = 8;

function fail(reason: string): never {
  throw new Error(`Invalid Context Workspace ${reason}.`);
}

function safeText(value: unknown, reason: string, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN_TEXT.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function timestamp(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function assertClosedBoundary(value: unknown, reason: string, depth = 0): void {
  if (typeof value === 'string') {
    if (value.length > 2_000) fail(reason);
    return;
  }
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return;
  if (typeof value === 'function' || depth > MAX_BOUNDARY_DEPTH) fail(reason);
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_WORKSPACES) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosedBoundary(descriptor.value, reason, depth + 1);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosedBoundary(descriptor.value, reason, depth + 1);
  }
}

function cloneBoundary<T>(value: T, reason: string): T {
  try {
    assertClosedBoundary(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function plainRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], reason: string): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) fail(reason);
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) fail(reason);
}

function uniqueIds(value: unknown, reason: string, maximum: number): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length > maximum) fail(reason);
  const ids = value.map((item) => stableId(item, reason));
  if (new Set(ids).size !== ids.length) fail(`duplicate ${reason}`);
  return Object.freeze(ids);
}

function boundedNumber(value: unknown, minimum: number, maximum: number, reason: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(reason);
  }
  return value;
}

function parseArrangement(raw: ContextWorkspaceArrangement): Readonly<ContextWorkspaceArrangement> {
  // Every caller supplies data already normalized by an enclosing closed-boundary clone.
  const arrangement = plainRecord(raw, 'arrangement');
  exactKeys(
    arrangement,
    [
      'activeMapId',
      'selectedNodeId',
      'openContextNoteIds',
      'graphMode',
      'graphFilters',
      'localDepth',
      'searchQuery',
      'activeContextView',
      'sidebarVisibility',
      'sidebarWidths',
      'inspectorTab',
      'camera',
    ],
    'arrangement',
  );
  if (!(CONTEXT_WORKSPACE_GRAPH_MODES as readonly unknown[]).includes(arrangement.graphMode)) {
    fail('graph mode');
  }
  if (!(CONTEXT_WORKSPACE_VIEWS as readonly unknown[]).includes(arrangement.activeContextView)) {
    fail('view');
  }
  if (
    !(CONTEXT_WORKSPACE_INSPECTOR_TABS as readonly unknown[]).includes(arrangement.inspectorTab)
  ) {
    fail('inspector tab');
  }
  if (
    !Number.isInteger(arrangement.localDepth) ||
    (arrangement.localDepth as number) < 1 ||
    (arrangement.localDepth as number) > 10
  ) {
    fail('local depth');
  }

  const filters = plainRecord(arrangement.graphFilters, 'graph filters');
  exactKeys(filters, ['nodeKinds', 'relationshipKinds', 'includeArchived'], 'graph filters');
  if (typeof filters.includeArchived !== 'boolean') fail('graph filters');
  const visibility = plainRecord(arrangement.sidebarVisibility, 'sidebar visibility');
  exactKeys(visibility, ['maps', 'inspector'], 'sidebar visibility');
  if (typeof visibility.maps !== 'boolean' || typeof visibility.inspector !== 'boolean') {
    fail('sidebar visibility');
  }
  const widths = plainRecord(arrangement.sidebarWidths, 'sidebar widths');
  exactKeys(widths, ['maps', 'inspector'], 'sidebar widths');
  const mapsWidth = boundedNumber(widths.maps, 180, 800, 'sidebar width');
  const inspectorWidth = boundedNumber(widths.inspector, 180, 800, 'sidebar width');
  if (!Number.isInteger(mapsWidth) || !Number.isInteger(inspectorWidth)) fail('sidebar width');
  const camera = plainRecord(arrangement.camera, 'camera');
  exactKeys(camera, ['x', 'y', 'zoom'], 'camera');

  return Object.freeze({
    activeMapId:
      arrangement.activeMapId === null ? null : stableId(arrangement.activeMapId, 'active map ID'),
    selectedNodeId:
      arrangement.selectedNodeId === null
        ? null
        : stableId(arrangement.selectedNodeId, 'selected node ID'),
    openContextNoteIds: uniqueIds(arrangement.openContextNoteIds, 'note ID', MAX_OPEN_NOTES),
    graphMode: arrangement.graphMode as ContextWorkspaceGraphMode,
    graphFilters: Object.freeze({
      nodeKinds: uniqueIds(filters.nodeKinds, 'node kind', MAX_FILTER_VALUES),
      relationshipKinds: uniqueIds(
        filters.relationshipKinds,
        'relationship kind',
        MAX_FILTER_VALUES,
      ),
      includeArchived: filters.includeArchived,
    }),
    localDepth: arrangement.localDepth as number,
    searchQuery: safeText(arrangement.searchQuery, 'search query', 2_000, true),
    activeContextView: arrangement.activeContextView as ContextWorkspaceView,
    sidebarVisibility: Object.freeze({
      maps: visibility.maps,
      inspector: visibility.inspector,
    }),
    sidebarWidths: Object.freeze({ maps: mapsWidth, inspector: inspectorWidth }),
    inspectorTab: arrangement.inspectorTab as ContextWorkspaceInspectorTab,
    camera: Object.freeze({
      x: boundedNumber(camera.x, -1_000_000, 1_000_000, 'camera'),
      y: boundedNumber(camera.y, -1_000_000, 1_000_000, 'camera'),
      zoom: boundedNumber(camera.zoom, 0.05, 8, 'camera'),
    }),
  });
}

function parseWorkspace(value: unknown, accountId: string): Readonly<ContextWorkspace> {
  const workspace = plainRecord(value, 'workspace');
  exactKeys(
    workspace,
    ['id', 'accountId', 'name', 'kind', 'arrangement', 'createdAt', 'updatedAt'],
    'workspace',
  );
  if (workspace.accountId !== accountId) fail('account scope');
  if (workspace.kind !== 'context_workspace') fail('workspace kind');
  const createdAt = timestamp(workspace.createdAt, 'created time');
  const updatedAt = timestamp(workspace.updatedAt, 'updated time');
  if (updatedAt < createdAt) fail('updated time');
  return Object.freeze({
    id: stableId(workspace.id, 'workspace ID'),
    accountId,
    name: safeText(workspace.name, 'workspace name', 120),
    kind: 'context_workspace',
    arrangement: parseArrangement(workspace.arrangement as ContextWorkspaceArrangement),
    createdAt,
    updatedAt,
  });
}

function parseLibrary(raw: ContextWorkspaceLibrary): Readonly<ContextWorkspaceLibrary> {
  const library = plainRecord(cloneBoundary(raw, 'library'), 'library');
  exactKeys(library, ['version', 'accountId', 'updatedAt', 'workspaces'], 'library');
  if (library.version !== 1 || !Array.isArray(library.workspaces)) fail('library');
  if (library.workspaces.length > MAX_WORKSPACES) fail('library');
  const accountId = stableId(library.accountId, 'account ID');
  const updatedAt = timestamp(library.updatedAt, 'library updated time');
  const workspaces = library.workspaces.map((value) => parseWorkspace(value, accountId));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const workspace of workspaces) {
    const name = workspace.name.toLocaleLowerCase('en-US');
    if (ids.has(workspace.id) || names.has(name)) fail('duplicate workspace');
    if (workspace.updatedAt > updatedAt) fail('library updated time');
    ids.add(workspace.id);
    names.add(name);
  }
  return Object.freeze({
    version: 1,
    accountId,
    updatedAt,
    workspaces: Object.freeze(workspaces),
  });
}

export function createContextWorkspaceLibrary(accountId: string): ContextWorkspaceLibrary {
  return parseLibrary({
    version: 1,
    accountId: stableId(accountId, 'account ID'),
    updatedAt: 0,
    workspaces: [],
  });
}

function freezeLibrary(
  library: ContextWorkspaceLibrary,
  workspaces: readonly ContextWorkspace[],
  updatedAt: number,
): ContextWorkspaceLibrary {
  return parseLibrary({
    version: 1,
    accountId: library.accountId,
    updatedAt,
    workspaces: [...workspaces],
  });
}

function findWorkspace(library: ContextWorkspaceLibrary, rawId: unknown) {
  const id = stableId(rawId, 'workspace ID');
  return library.workspaces.find((workspace) => workspace.id === id);
}

function assertUnique(
  library: ContextWorkspaceLibrary,
  id: string,
  name: string,
  excludedId?: string,
): void {
  const normalizedName = name.toLocaleLowerCase('en-US');
  if (
    library.workspaces.some(
      (workspace) =>
        workspace.id !== excludedId &&
        (workspace.id === id || workspace.name.toLocaleLowerCase('en-US') === normalizedName),
    )
  ) {
    fail('duplicate workspace');
  }
}

export function applyContextWorkspaceOperation(
  rawLibrary: ContextWorkspaceLibrary,
  rawOperation: ContextWorkspaceOperation,
): ContextWorkspaceLibrary {
  const library = parseLibrary(rawLibrary);
  const operation = plainRecord(cloneBoundary(rawOperation, 'operation'), 'operation');
  const now = timestamp(operation.now, 'operation time');
  if (now < library.updatedAt) fail('operation time');

  if (operation.kind === 'save') {
    exactKeys(operation, ['kind', 'workspaceId', 'name', 'arrangement', 'now'], 'operation');
    const id = stableId(operation.workspaceId, 'workspace ID');
    const name = safeText(operation.name, 'workspace name', 120);
    assertUnique(library, id, name);
    const workspace = parseWorkspace(
      {
        id,
        accountId: library.accountId,
        name,
        kind: 'context_workspace',
        arrangement: operation.arrangement,
        createdAt: now,
        updatedAt: now,
      },
      library.accountId,
    );
    return freezeLibrary(library, [...library.workspaces, workspace], now);
  }

  const workspaceId = stableId(operation.workspaceId, 'workspace ID');
  const index = library.workspaces.findIndex(({ id }) => id === workspaceId);
  const existing = library.workspaces[index];
  if (!existing || index < 0) fail('workspace');

  if (operation.kind === 'duplicate') {
    exactKeys(operation, ['kind', 'workspaceId', 'newWorkspaceId', 'name', 'now'], 'operation');
    const id = stableId(operation.newWorkspaceId, 'workspace ID');
    const name = safeText(operation.name, 'workspace name', 120);
    assertUnique(library, id, name);
    const duplicate = parseWorkspace(
      {
        ...existing,
        id,
        name,
        arrangement: existing.arrangement,
        createdAt: now,
        updatedAt: now,
      },
      library.accountId,
    );
    return freezeLibrary(library, [...library.workspaces, duplicate], now);
  }

  const workspaces = [...library.workspaces];
  if (operation.kind === 'update') {
    exactKeys(operation, ['kind', 'workspaceId', 'arrangement', 'now'], 'operation');
    workspaces[index] = {
      ...existing,
      arrangement: parseArrangement(operation.arrangement as ContextWorkspaceArrangement),
      updatedAt: now,
    };
  } else if (operation.kind === 'rename') {
    exactKeys(operation, ['kind', 'workspaceId', 'name', 'now'], 'operation');
    const name = safeText(operation.name, 'workspace name', 120);
    assertUnique(library, existing.id, name, existing.id);
    workspaces[index] = { ...existing, name, updatedAt: now };
  } else if (operation.kind === 'delete') {
    exactKeys(operation, ['kind', 'workspaceId', 'now'], 'operation');
    workspaces.splice(index, 1);
  } else {
    fail('operation');
  }
  return freezeLibrary(library, workspaces, now);
}

export function loadContextWorkspace(
  rawLibrary: ContextWorkspaceLibrary,
  rawWorkspaceId: string,
): Readonly<ContextWorkspaceLoadPlan> {
  const library = parseLibrary(rawLibrary);
  const workspace = findWorkspace(library, rawWorkspaceId);
  if (!workspace) fail('workspace');
  return Object.freeze({
    operation: 'load',
    accountId: library.accountId,
    workspaceId: workspace.id,
    name: workspace.name,
    arrangement: workspace.arrangement,
    executable: false,
  });
}

export function buildContextWorkspaceSwitcher(
  rawLibrary: ContextWorkspaceLibrary,
  rawActiveWorkspaceId?: string,
): ReadonlyArray<Readonly<ContextWorkspaceSwitcherItem>> {
  const library = parseLibrary(rawLibrary);
  const activeWorkspaceId =
    rawActiveWorkspaceId === undefined
      ? undefined
      : stableId(rawActiveWorkspaceId, 'active workspace ID');
  if (
    activeWorkspaceId !== undefined &&
    !library.workspaces.some(({ id }) => id === activeWorkspaceId)
  ) {
    fail('active workspace');
  }
  return Object.freeze(
    library.workspaces.map((workspace, index) =>
      Object.freeze({
        workspaceId: workspace.id,
        name: workspace.name,
        shortcut: index < 9 ? (`Ctrl+${index + 1}` as const) : null,
        active: workspace.id === activeWorkspaceId,
        executable: false,
      }),
    ),
  );
}
