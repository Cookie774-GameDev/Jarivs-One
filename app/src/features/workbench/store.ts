import { create } from 'zustand';
import {
  DEFAULT_PANEL_SIZE,
  PANEL_TITLES,
  type WallpaperId,
  type WorkbenchDocument,
  type WorkbenchPanel,
  type WorkbenchPanelKind,
  type WorkbenchTemplate,
  type WorkbenchView,
} from './types';
import { findBuiltInTemplate, instantiateTemplate, createWorkbenchId } from './templates';
import { loadWorkbenchDocument, saveWorkbenchDocument } from './persistence';

interface WorkbenchSnapshot {
  panels: WorkbenchPanel[];
  view: WorkbenchView;
}

interface WorkbenchState extends WorkbenchDocument {
  selectedIds: string[];
  history: WorkbenchSnapshot[];
  future: WorkbenchSnapshot[];
  persistenceWarning: string | null;
  addPanel: (kind: WorkbenchPanelKind, at?: { x: number; y: number }) => string;
  updatePanel: (
    id: string,
    patch: Partial<WorkbenchPanel>,
    options?: { recordHistory?: boolean },
  ) => void;
  removePanel: (id: string) => void;
  duplicatePanel: (id: string) => void;
  selectPanel: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  bringToFront: (id: string) => void;
  setView: (view: Partial<WorkbenchView>) => void;
  applyTemplate: (templateId: string) => boolean;
  saveTemplate: (name: string) => string | null;
  deleteTemplate: (templateId: string) => void;
  setWallpaper: (id: WallpaperId, assetUrl?: string) => void;
  configureWallpaper: (patch: Partial<WorkbenchDocument['wallpaper']>) => void;
  autoArrange: () => void;
  undo: () => void;
  redo: () => void;
  resetWorkbench: () => void;
}

const snapshot = (state: Pick<WorkbenchState, 'panels' | 'view'>): WorkbenchSnapshot => ({
  panels: state.panels.map((panel) => ({ ...panel, settings: { ...panel.settings } })),
  view: { ...state.view },
});

const historyUpdate = (
  state: WorkbenchState,
  next: Partial<WorkbenchState>,
): Partial<WorkbenchState> => ({
  ...next,
  history: [...state.history.slice(-39), snapshot(state)],
  future: [],
  updatedAt: Date.now(),
});

export function createDefaultWorkbenchDocument(): WorkbenchDocument {
  const coding = findBuiltInTemplate('coding')!;
  return {
    version: 1,
    panels: instantiateTemplate(coding),
    view: { x: 24, y: 24, zoom: 0.78 },
    wallpaper: {
      id: coding.wallpaperId,
      paused: false,
      interactive: true,
      intensity: 0.72,
      quality: 'balanced',
    },
    customTemplates: [],
    updatedAt: Date.now(),
  };
}

const loaded =
  typeof window === 'undefined'
    ? { document: createDefaultWorkbenchDocument(), source: 'default' as const }
    : loadWorkbenchDocument(window.localStorage, createDefaultWorkbenchDocument);

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  ...loaded.document,
  selectedIds: [],
  history: [],
  future: [],
  persistenceWarning: loaded.warning ?? null,

  addPanel: (kind, at) => {
    const id = createWorkbenchId(kind);
    set((state) => {
      const size = DEFAULT_PANEL_SIZE[kind];
      const maxZ = Math.max(0, ...state.panels.map((panel) => panel.z));
      const panel: WorkbenchPanel = {
        id,
        kind,
        title: PANEL_TITLES[kind],
        x: at?.x ?? 100 + state.panels.length * 28,
        y: at?.y ?? 90 + state.panels.length * 24,
        width: size.width,
        height: size.height,
        z: maxZ + 1,
        minimized: false,
        status: 'idle',
        settings:
          kind === 'browser'
            ? { url: 'https://developer.mozilla.org' }
            : kind === 'files'
              ? { route: 'files' }
              : kind === 'jarvis'
                ? { route: 'chat' }
                : {},
      };
      return historyUpdate(state, { panels: [...state.panels, panel], selectedIds: [id] });
    });
    return id;
  },

  updatePanel: (id, patch, options) =>
    set((state) => {
      const panels = state.panels.map((panel) =>
          panel.id === id
            ? {
                ...panel,
                ...patch,
                settings: patch.settings ? { ...panel.settings, ...patch.settings } : panel.settings,
              }
            : panel,
        );
      if (options?.recordHistory === false) {
        return { panels, updatedAt: Date.now() };
      }
      return historyUpdate(state, { panels });
    }),

  removePanel: (id) =>
    set((state) =>
      historyUpdate(state, {
        panels: state.panels.filter((panel) => panel.id !== id),
        selectedIds: state.selectedIds.filter((selected) => selected !== id),
      }),
    ),

  duplicatePanel: (id) =>
    set((state) => {
      const source = state.panels.find((panel) => panel.id === id);
      if (!source) return state;
      const nextId = createWorkbenchId(source.kind);
      const clone: WorkbenchPanel = {
        ...source,
        id: nextId,
        title: `${source.title} copy`,
        x: source.x + 36,
        y: source.y + 36,
        z: Math.max(...state.panels.map((panel) => panel.z), 0) + 1,
        status: 'idle',
        settings: { ...source.settings, resourceId: undefined },
      };
      return historyUpdate(state, { panels: [...state.panels, clone], selectedIds: [nextId] });
    }),

  selectPanel: (id, additive = false) =>
    set((state) => ({
      selectedIds: additive
        ? state.selectedIds.includes(id)
          ? state.selectedIds.filter((selected) => selected !== id)
          : [...state.selectedIds, id]
        : [id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  bringToFront: (id) =>
    set((state) => ({
      panels: state.panels.map((panel) =>
        panel.id === id
          ? { ...panel, z: Math.max(...state.panels.map((entry) => entry.z), 0) + 1 }
          : panel,
      ),
    })),
  setView: (view) =>
    set((state) => ({
      view: {
        x: Number.isFinite(view.x) ? (view.x as number) : state.view.x,
        y: Number.isFinite(view.y) ? (view.y as number) : state.view.y,
        zoom: Math.max(0.25, Math.min(2, view.zoom ?? state.view.zoom)),
      },
      updatedAt: Date.now(),
    })),

  applyTemplate: (templateId) => {
    const state = get();
    const template =
      findBuiltInTemplate(templateId) ??
      state.customTemplates.find((entry) => entry.id === templateId);
    if (!template) return false;
    set((current) =>
      historyUpdate(current, {
        panels: instantiateTemplate(template),
        selectedIds: [],
        view: { x: 24, y: 24, zoom: template.panels.length > 6 ? 0.68 : 0.8 },
        wallpaper: { ...current.wallpaper, id: template.wallpaperId, assetUrl: undefined },
      }),
    );
    return true;
  },

  saveTemplate: (name) => {
    const trimmed = name.trim().slice(0, 120);
    if (!trimmed) return null;
    const id = createWorkbenchId('template');
    set((state) => {
      const template: WorkbenchTemplate = {
        id,
        name: trimmed,
        description: 'Saved from this Workbench layout.',
        builtIn: false,
        wallpaperId: state.wallpaper.id,
        panels: state.panels.map(({ id: _id, z: _z, status: _status, ...panel }) => ({
          ...panel,
          settings: { ...panel.settings, resourceId: undefined },
        })),
      };
      return { customTemplates: [...state.customTemplates, template], updatedAt: Date.now() };
    });
    return id;
  },
  deleteTemplate: (templateId) =>
    set((state) => ({
      customTemplates: state.customTemplates.filter((entry) => entry.id !== templateId),
      updatedAt: Date.now(),
    })),
  setWallpaper: (id, assetUrl) =>
    set((state) => ({
      wallpaper: { ...state.wallpaper, id, assetUrl },
      updatedAt: Date.now(),
    })),
  configureWallpaper: (patch) =>
    set((state) => ({
      wallpaper: {
        ...state.wallpaper,
        ...patch,
        intensity: Math.max(0, Math.min(1, patch.intensity ?? state.wallpaper.intensity)),
      },
      updatedAt: Date.now(),
    })),

  autoArrange: () =>
    set((state) => {
      const columns = Math.max(1, Math.ceil(Math.sqrt(state.panels.length)));
      const panels = state.panels.map((panel, index) => ({
        ...panel,
        x: 80 + (index % columns) * 500,
        y: 80 + Math.floor(index / columns) * 390,
        width: Math.min(panel.width, 460),
        height: Math.min(panel.height, 350),
        z: index + 1,
      }));
      return historyUpdate(state, { panels, view: { x: 24, y: 24, zoom: 0.72 } });
    }),

  undo: () =>
    set((state) => {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        panels: previous.panels,
        view: previous.view,
        history: state.history.slice(0, -1),
        future: [snapshot(state), ...state.future.slice(0, 39)],
        selectedIds: [],
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        panels: next.panels,
        view: next.view,
        history: [...state.history.slice(-39), snapshot(state)],
        future: state.future.slice(1),
        selectedIds: [],
      };
    }),
  resetWorkbench: () =>
    set((state) => ({
      ...createDefaultWorkbenchDocument(),
      customTemplates: state.customTemplates,
      selectedIds: [],
      history: [],
      future: [],
      persistenceWarning: null,
    })),
}));

let saveTimer: number | null = null;
if (typeof window !== 'undefined') {
  const flush = () => {
    const state = useWorkbenchStore.getState();
    const document: WorkbenchDocument = {
      version: 1,
      panels: state.panels,
      view: state.view,
      wallpaper: state.wallpaper,
      customTemplates: state.customTemplates,
      updatedAt: state.updatedAt,
    };
    saveWorkbenchDocument(document, window.localStorage);
  };
  useWorkbenchStore.subscribe(() => {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 180);
  });
  window.addEventListener('pagehide', flush);
}
