import {
  DEFAULT_PANEL_SIZE,
  PANEL_TITLES,
  WORKBENCH_PANEL_KINDS,
  type WallpaperId,
  type WorkbenchDocument,
  type WorkbenchPanel,
  type WorkbenchPanelKind,
  type WorkbenchPanelSettings,
  type WorkbenchTemplate,
} from './types';
import { BUILT_IN_WALLPAPERS, isSafeWallpaperAssetUrl } from './wallpapers';

export const WORKBENCH_STORAGE_KEY = 'vibespace-workbench:v1';
export const LAST_KNOWN_GOOD_KEY = 'vibespace-workbench:v1:last-known-good';

type StorageSource = 'primary' | 'last-known-good' | 'default';

export interface WorkbenchLoadResult {
  document: WorkbenchDocument;
  source: StorageSource;
  warning?: string;
}

const kindSet = new Set<string>(WORKBENCH_PANEL_KINDS);
const wallpaperSet = new Set<string>(BUILT_IN_WALLPAPERS.map((entry) => entry.id));
const SECRET_LIKE =
  /(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{8,}|aiza[a-z0-9_-]{12,}|sb_(?:secret|publishable)_[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]{8,}|(?:api[-_]?key|access[-_]?token|secret|password)\s*[:=])/i;

const finite = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, parsed));
};

function safeSettings(value: unknown): WorkbenchPanelSettings {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const settings: WorkbenchPanelSettings = {};
  for (const key of ['url', 'cwd', 'command', 'route', 'resourceId', 'agentId', 'note', 'language'] as const) {
    if (typeof input[key] === 'string') {
      const text = input[key].slice(0, key === 'note' ? 20_000 : 2048);
      settings[key] = (key === 'command' || key === 'url') && SECRET_LIKE.test(text)
        ? '[redacted]'
        : text;
    }
  }
  return settings;
}

function safePanel(value: unknown, index: number): WorkbenchPanel | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.kind !== 'string' || !kindSet.has(input.kind)) return null;
  const kind = input.kind as WorkbenchPanelKind;
  const defaults = DEFAULT_PANEL_SIZE[kind];
  return {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.slice(0, 160)
        : `${kind}-recovered-${index}`,
    kind,
    title:
      typeof input.title === 'string' && input.title.trim()
        ? input.title.slice(0, 120)
        : PANEL_TITLES[kind],
    x: finite(input.x, 80 + index * 30, -20_000, 20_000),
    y: finite(input.y, 80 + index * 30, -20_000, 20_000),
    width: finite(input.width, defaults.width, 240, 2000),
    height: finite(input.height, defaults.height, 160, 1400),
    z: finite(input.z, index + 1, 1, 100_000),
    minimized: input.minimized === true,
    status:
      input.status === 'ready' ||
      input.status === 'busy' ||
      input.status === 'attention' ||
      input.status === 'error'
        ? input.status
        : 'idle',
    settings: safeSettings(input.settings),
  };
}

function safeTemplate(value: unknown): WorkbenchTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || typeof input.name !== 'string') return null;
  const panels = Array.isArray(input.panels)
    ? input.panels
        .map((entry, index) => safePanel(entry, index))
        .filter((entry): entry is WorkbenchPanel => !!entry)
        .map(({ id: _id, z: _z, ...entry }) => entry)
    : [];
  return {
    id: input.id.slice(0, 160),
    name: input.name.slice(0, 120),
    description: typeof input.description === 'string' ? input.description.slice(0, 320) : '',
    builtIn: false,
    wallpaperId:
      typeof input.wallpaperId === 'string' && wallpaperSet.has(input.wallpaperId)
        ? (input.wallpaperId as WallpaperId)
        : 'warm-gradient',
    panels,
  };
}

export function sanitizeWorkbenchDocument(
  value: unknown,
  fallback: () => WorkbenchDocument,
): WorkbenchDocument {
  if (!value || typeof value !== 'object') return fallback();
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.panels)) return fallback();
  const wallpaperInput =
    input.wallpaper && typeof input.wallpaper === 'object'
      ? (input.wallpaper as Record<string, unknown>)
      : {};
  const id =
    typeof wallpaperInput.id === 'string' && wallpaperSet.has(wallpaperInput.id)
      ? (wallpaperInput.id as WallpaperId)
      : 'space-clouds';
  const rawAssetUrl =
    typeof wallpaperInput.assetUrl === 'string'
      ? wallpaperInput.assetUrl.slice(0, 4_000_000)
      : undefined;
  const assetKind = id === 'custom-video' ? 'video' : id === 'custom-image' ? 'image' : null;
  const assetUrl =
    assetKind && rawAssetUrl && isSafeWallpaperAssetUrl(rawAssetUrl, assetKind)
      ? rawAssetUrl
      : undefined;

  return {
    version: 1,
    panels: input.panels
      .slice(0, 80)
      .map((entry, index) => safePanel(entry, index))
      .filter((entry): entry is WorkbenchPanel => !!entry),
    view: {
      x: finite((input.view as Record<string, unknown> | undefined)?.x, 24, -20_000, 20_000),
      y: finite((input.view as Record<string, unknown> | undefined)?.y, 24, -20_000, 20_000),
      zoom: finite((input.view as Record<string, unknown> | undefined)?.zoom, 0.8, 0.25, 2),
    },
    wallpaper: {
      id,
      paused: wallpaperInput.paused === true,
      interactive: wallpaperInput.interactive !== false,
      intensity: finite(wallpaperInput.intensity, 0.72, 0, 1),
      quality:
        wallpaperInput.quality === 'low' || wallpaperInput.quality === 'high'
          ? wallpaperInput.quality
          : 'balanced',
      assetUrl,
    },
    customTemplates: Array.isArray(input.customTemplates)
      ? input.customTemplates
          .slice(0, 24)
          .map(safeTemplate)
          .filter((entry): entry is WorkbenchTemplate => !!entry)
      : [],
    updatedAt: finite(input.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

function parseDocument(raw: string | null, fallback: () => WorkbenchDocument): WorkbenchDocument | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1) {
      return null;
    }
    return sanitizeWorkbenchDocument(parsed, fallback);
  } catch {
    return null;
  }
}

export function saveWorkbenchDocument(
  document: WorkbenchDocument,
  storage: Storage = window.localStorage,
): boolean {
  try {
    const sanitized = sanitizeWorkbenchDocument(document, () => document);
    const serialized = JSON.stringify({ ...sanitized, updatedAt: Date.now() });
    storage.setItem(LAST_KNOWN_GOOD_KEY, serialized);
    storage.setItem(WORKBENCH_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function loadWorkbenchDocument(
  storage: Storage = window.localStorage,
  fallback?: () => WorkbenchDocument,
): WorkbenchLoadResult {
  const createFallback =
    fallback ??
    (() => ({
      version: 1 as const,
      panels: [],
      view: { x: 24, y: 24, zoom: 0.8 },
      wallpaper: {
        id: 'space-clouds' as const,
        paused: false,
        interactive: true,
        intensity: 0.72,
        quality: 'balanced' as const,
      },
      customTemplates: [],
      updatedAt: Date.now(),
    }));
  const primary = parseDocument(storage.getItem(WORKBENCH_STORAGE_KEY), createFallback);
  if (primary) return { document: primary, source: 'primary' };
  const backup = parseDocument(storage.getItem(LAST_KNOWN_GOOD_KEY), createFallback);
  if (backup) {
    return {
      document: backup,
      source: 'last-known-good',
      warning: 'Recovered the last known good Workbench layout.',
    };
  }
  return { document: createFallback(), source: 'default' };
}
