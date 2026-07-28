import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Hand,
  Heading,
  ListTree,
  Maximize2,
  Minus,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
  StickyNote,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { canvasBlockAccessibleLabel, canvasZoomAnnouncement } from './accessibility';
import {
  blockById,
  createCanvasBlock,
  createCanvasDocument,
  pageOrderedBlocks,
  parseCanvasBlockId,
  parseCanvasDocument,
  resolveEdgelessLayout,
  withBlockAdded,
  withBlockContent,
  withBlockRemoved,
  withBackground,
  withCamera,
  withLayoutMode,
  withPlacement,
  withPresentationOrder,
  withTitle,
  type CanvasBlock,
  type CanvasBlockKind,
  type CanvasBackground,
  type CanvasBackgroundKind,
  type CanvasCamera,
  type CanvasDocument,
  type CanvasLayoutMode,
} from './contracts';
import { db } from '@/lib/db';
import { resolveAccountIdentity } from '@/lib/accountIdentity';
import { useAuthStore } from '@/stores/auth';
import {
  cameraZoomPercent,
  createCameraNavigator,
  fitWorldBounds,
  panCameraByScreenDelta,
  resetCamera,
  screenToWorld,
  zoomCameraAtScreenPoint,
} from './camera';
import { copyBlocks, cutBlocks, pasteBlocks, type CanvasClipboardPayload } from './clipboard';
import { createCanvasHistory, type CanvasHistory, type CanvasHistoryActionKind } from './history';
import { decodeCanvasPackage, encodeCanvasPackage } from './packageFormat';
import {
  clearCanvasSelection,
  createCanvasSelection,
  marqueeSelect,
  selectAllCanvasBlocks,
  selectCanvasBlock,
  selectionHas,
} from './selection';
import { createCanvasSpatialIndex } from './spatialIndex';
import { CanvasOutline } from './CanvasOutline';
import {
  addMindMapChild,
  addMindMapSibling as appendMindMapSibling,
  createMindMap,
  navigateMindMap,
  reorderMindMapBranch,
  setMindMapBranchCollapsed,
  setMindMapDirection,
  setMindMapConnectorStyle,
  setMindMapNodeStyle,
  type MindMapConnectorStyle,
  type MindMapDirection,
  type MindMapNodeShape,
} from './mindmaps';
import {
  createCanvasAutosaveController,
  registerCanvasWorkspaceFlush,
  type CanvasAutosaveController,
  type CanvasPersistenceStatus,
  type CanvasRecoveryEntry,
} from './autosave';
import {
  createCanvasPersistencePort,
  createCanvasPersistenceRepository,
  type CanvasPersistenceRepository,
  type CanvasPersistenceScope,
} from './persistence';
import {
  enterPresentMode,
  exitPresentMode,
  nextFrame,
  presentationFromDocument,
  presentationProgress,
  previousFrame,
  type PresentationState,
} from './presentation';
import {
  subscribeCanvasGlobalSearchNavigation,
  takePendingCanvasGlobalSearchNavigation,
  type CanvasGlobalSearchSelection,
} from './globalSearch';

type CanvasTool = 'select' | 'hand' | 'note';

const CANVAS_TOOL_LABELS: Readonly<Record<CanvasTool, string>> = Object.freeze({
  select: 'Select',
  hand: 'Hand',
  note: 'Note',
});

const CANVAS_BLOCK_KIND_LABELS: Readonly<Record<CanvasBlockKind, string>> = Object.freeze({
  heading: 'Heading',
  text: 'Text',
  note: 'Note',
  code: 'Code',
  'mind-map': 'Mind map',
});

const CANVAS_BACKGROUND_LABELS: Readonly<Record<CanvasBackgroundKind, string>> = Object.freeze({
  plain: 'Plain paper',
  dots: 'Dot grid',
  grid: 'Square grid',
  lines: 'Lined paper',
});

function canvasBackgroundStyle(background: CanvasBackground): React.CSSProperties {
  const lineColor = 'rgba(104, 86, 64, 0.22)';
  switch (background.kind) {
    case 'dots':
      return {
        backgroundColor: background.color,
        backgroundImage: `radial-gradient(circle, ${lineColor} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      };
    case 'grid':
      return {
        backgroundColor: background.color,
        backgroundImage: [
          `linear-gradient(to right, ${lineColor} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: '24px 24px',
      };
    case 'lines':
      return {
        backgroundColor: background.color,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 27px, ${lineColor} 28px)`,
        backgroundSize: '100% 28px',
      };
    case 'plain':
      return {
        backgroundColor: background.color,
        backgroundImage: 'none',
      };
  }
}

const INITIAL_DOCUMENT = createCanvasDocument({
  id: 'local-canvas-draft',
  projectId: 'local-project',
  ownerId: 'local-user',
  title: 'Untitled canvas',
  now: 1,
});

const CAMERA_VIEWPORT = Object.freeze({ width: 1200, height: 800 });
const CAMERA_CENTER = Object.freeze({ x: 600, y: 400 });
let documentSequence = 0;

export interface CanvasPagePersistenceBinding {
  readonly repository: CanvasPersistenceRepository;
  readonly scope: CanvasPersistenceScope | null;
  readonly autosaveDelayMs?: number;
  readonly now?: () => number;
  readonly createDocumentId?: () => string;
}

export interface CanvasPageProps {
  readonly persistence?: CanvasPagePersistenceBinding;
}

type CanvasPersistenceUiStatus = CanvasPersistenceStatus | 'loading';

const PERSISTENCE_LABELS: Readonly<Record<CanvasPersistenceUiStatus, string>> = Object.freeze({
  saved: 'Saved locally',
  saving: 'Saving…',
  offline: 'Saved offline',
  'local-only': 'Saved locally',
  syncing: 'Syncing…',
  'sync-error': 'Save failed',
  'recovered-unsaved-work': 'Recovered unsaved work',
  loading: 'Loading local canvas…',
});

function createDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `canvas-${globalThis.crypto.randomUUID()}`;
  }
  documentSequence += 1;
  return `canvas-${Date.now().toString(36)}-${documentSequence.toString(36)}`;
}

interface ToolButtonProps {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function ToolButton({ active, label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
        active
          ? 'border-foreground/20 bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function CanvasPage({ persistence }: CanvasPageProps = {}) {
  const cloudSession = useAuthStore((state) => state.cloudSession);
  const localUserId = useAuthStore((state) => state.localUserId);
  const projectId = useAuthStore((state) => state.projectId);
  const accountIdentity = resolveAccountIdentity({ cloudSession, localUserId });
  const defaultRepository = React.useMemo(() => createCanvasPersistenceRepository(db), []);
  const defaultScope = React.useMemo<CanvasPersistenceScope | null>(
    () =>
      accountIdentity
        ? {
            accountId: accountIdentity.accountId,
            projectId: projectId ?? 'local-project',
            ownerId: accountIdentity.accountId,
          }
        : null,
    [accountIdentity?.accountId, projectId],
  );
  const activeRepository = persistence?.repository ?? defaultRepository;
  const activeScope = persistence === undefined ? defaultScope : persistence.scope;
  const persistenceScopeKey = activeScope
    ? `${activeScope.accountId}\u0000${activeScope.projectId}\u0000${activeScope.ownerId}`
    : '';
  const historyRef = React.useRef<CanvasHistory<CanvasDocument>>(
    createCanvasHistory(INITIAL_DOCUMENT),
  );
  const [document, setDocument] = React.useState(INITIAL_DOCUMENT);
  const documentRef = React.useRef<CanvasDocument>(INITIAL_DOCUMENT);
  const [presentation, setPresentation] = React.useState<PresentationState>(() =>
    presentationFromDocument(INITIAL_DOCUMENT),
  );
  const presentationTriggerRef = React.useRef<HTMLButtonElement>(null);
  const presentationRegionRef = React.useRef<HTMLElement>(null);
  const wasPresentingRef = React.useRef(false);
  const autosaveRef = React.useRef<CanvasAutosaveController | null>(null);
  const autosaveUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const workspaceUnbindRef = React.useRef<(() => void) | null>(null);
  const hydrationGeneration = React.useRef(0);
  const [persistenceStatus, setPersistenceStatus] =
    React.useState<CanvasPersistenceUiStatus>('local-only');
  const [recoveryOffer, setRecoveryOffer] = React.useState<CanvasRecoveryEntry | null>(null);
  const [camera, setCameraState] = React.useState(resetCamera);
  const cameraRef = React.useRef(camera);
  const cameraNavigator = React.useRef(createCameraNavigator(camera));
  const [, refreshCameraNavigation] = React.useReducer((revision: number) => revision + 1, 0);
  const setCamera = React.useCallback(
    (action: React.SetStateAction<CanvasCamera>, recordLocation = true) => {
      const next = typeof action === 'function' ? action(cameraRef.current) : action;
      cameraRef.current = next;
      if (recordLocation) {
        cameraNavigator.current.visit(next);
        refreshCameraNavigation();
      }
      setCameraState(next);
      if (recordLocation && next !== documentRef.current.camera) {
        const nextDocument = withCamera(documentRef.current, next);
        documentRef.current = nextDocument;
        setDocument(nextDocument);
        autosaveRef.current?.schedule(nextDocument);
      }
    },
    [],
  );
  const restoreCameraLocation = React.useCallback((next: CanvasCamera) => {
    cameraRef.current = next;
    setCameraState(next);
    refreshCameraNavigation();
    const nextDocument = withCamera(documentRef.current, next);
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    autosaveRef.current?.schedule(nextDocument);
  }, []);
  const [tool, setTool] = React.useState<CanvasTool>('select');
  const [selected, setSelected] = React.useState(createCanvasSelection);
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [propertiesOpen, setPropertiesOpen] = React.useState(false);
  const [packageMessage, setPackageMessage] = React.useState('');
  const [marqueeVisual, setMarqueeVisual] = React.useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const sequence = React.useRef(0);
  const clipboardSequence = React.useRef(0);
  const clipboard = React.useRef<CanvasClipboardPayload | null>(null);
  const clock = React.useRef(INITIAL_DOCUMENT.updatedAt);
  const spaceHeld = React.useRef(false);
  const panPointer = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const activePointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{
    distance: number;
    center: { x: number; y: number };
  } | null>(null);
  const objectDrag = React.useRef<{
    pointerId: number;
    ids: readonly string[];
    x: number;
    y: number;
    zoom: number;
    totalX: number;
    totalY: number;
    moved: boolean;
  } | null>(null);
  const blockElements = React.useRef(new Map<string, HTMLElement>());
  const suppressObjectClick = React.useRef(false);
  const marqueeGesture = React.useRef<{
    pointerId: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    baseIds: readonly string[];
  } | null>(null);

  const detachAutosave = React.useCallback(() => {
    workspaceUnbindRef.current?.();
    workspaceUnbindRef.current = null;
    autosaveUnsubscribeRef.current?.();
    autosaveUnsubscribeRef.current = null;
    const controller = autosaveRef.current;
    autosaveRef.current = null;
    if (controller) void controller.dispose();
  }, []);

  const replaceActiveDocument = React.useCallback((next: CanvasDocument) => {
    historyRef.current = createCanvasHistory(next);
    documentRef.current = next;
    clock.current = next.updatedAt;
    sequence.current = 0;
    clipboardSequence.current = 0;
    clipboard.current = null;
    cameraRef.current = next.camera;
    cameraNavigator.current = createCameraNavigator(next.camera);
    setCameraState(next.camera);
    refreshCameraNavigation();
    setSelected(clearCanvasSelection);
    setPresentation(presentationFromDocument(next));
    setDocument(next);
  }, []);

  const attachAutosave = React.useCallback(
    (
      repository: CanvasPersistenceRepository,
      scope: CanvasPersistenceScope,
      initialRevision: number,
    ) => {
      detachAutosave();
      const controller = createCanvasAutosaveController({
        persistence: createCanvasPersistencePort(repository, scope),
        initialRevision,
        delayMs: persistence?.autosaveDelayMs,
        now: persistence?.now,
      });
      autosaveRef.current = controller;
      setPersistenceStatus(controller.getState().status);
      autosaveUnsubscribeRef.current = controller.subscribe((state) => {
        setPersistenceStatus(state.status);
      });
      workspaceUnbindRef.current = registerCanvasWorkspaceFlush(controller);
      return controller;
    },
    [detachAutosave, persistence?.autosaveDelayMs, persistence?.now],
  );

  React.useEffect(() => {
    hydrationGeneration.current += 1;
    const generation = hydrationGeneration.current;
    let cancelled = false;
    setRecoveryOffer(null);

    if (!activeScope) {
      detachAutosave();
      if (documentRef.current.ownerId !== INITIAL_DOCUMENT.ownerId) {
        replaceActiveDocument(INITIAL_DOCUMENT);
      }
      setPersistenceStatus('local-only');
      return () => {
        cancelled = true;
      };
    }

    const scope = activeScope;
    const navigationScope = {
      ownerId: scope.ownerId,
      projectId: scope.projectId,
    };
    const pendingNavigation = takePendingCanvasGlobalSearchNavigation(navigationScope);
    setPersistenceStatus('loading');
    const requestedDocument = pendingNavigation
      ? activeRepository.load(scope, pendingNavigation.documentId).then(async (loaded) => ({
          loaded: loaded ?? (await activeRepository.loadLatest(scope)),
          navigation: loaded ? pendingNavigation : undefined,
        }))
      : activeRepository.loadLatest(scope).then((loaded) => ({
          loaded,
          navigation: undefined as CanvasGlobalSearchSelection | undefined,
        }));
    void Promise.all([requestedDocument, activeRepository.listRecovery(scope)]).then(
      ([request, recovery]) => {
        if (cancelled || hydrationGeneration.current !== generation) return;
        const now = persistence?.now?.() ?? Date.now();
        const base =
          request.loaded ??
          createCanvasDocument({
            id: persistence?.createDocumentId?.() ?? createDocumentId(),
            projectId: scope.projectId,
            ownerId: scope.ownerId,
            title: 'Untitled canvas',
            now,
          });
        const next = request.navigation ? withCamera(base, request.navigation.camera) : base;
        replaceActiveDocument(next);
        const controller = attachAutosave(activeRepository, scope, base.localRevision);
        if (request.navigation) {
          controller.schedule(next);
          if (next.blocks.some((block) => block.id === request.navigation?.objectId)) {
            setSelected(createCanvasSelection([request.navigation.objectId]));
          }
        }
        setRecoveryOffer(recovery[0] ?? null);
      },
      () => {
        if (cancelled || hydrationGeneration.current !== generation) return;
        detachAutosave();
        setPersistenceStatus('sync-error');
      },
    );

    const openNavigation = async (selection: CanvasGlobalSearchSelection) => {
      const currentController = autosaveRef.current;
      await currentController?.flush();
      if (cancelled || hydrationGeneration.current !== generation) return;
      if (
        currentController?.getState().status === 'sync-error' ||
        currentController?.getState().status === 'recovered-unsaved-work'
      ) {
        setPersistenceStatus(currentController.getState().status);
        return;
      }
      const loaded = await activeRepository.load(scope, selection.documentId);
      if (!loaded || cancelled || hydrationGeneration.current !== generation) return;
      const focused = withCamera(loaded, selection.camera);
      replaceActiveDocument(focused);
      const controller = attachAutosave(activeRepository, scope, loaded.localRevision);
      controller.schedule(focused);
      if (focused.blocks.some((block) => block.id === selection.objectId)) {
        setSelected(createCanvasSelection([selection.objectId]));
      }
    };
    const unsubscribeNavigation = subscribeCanvasGlobalSearchNavigation(
      navigationScope,
      (selection) => {
        void openNavigation(selection);
      },
    );

    return () => {
      cancelled = true;
      unsubscribeNavigation();
      if (hydrationGeneration.current === generation) {
        detachAutosave();
      }
    };
  }, [
    activeRepository,
    activeScope?.accountId,
    activeScope?.ownerId,
    activeScope?.projectId,
    attachAutosave,
    detachAutosave,
    persistence?.createDocumentId,
    persistence?.now,
    persistenceScopeKey,
    replaceActiveDocument,
  ]);

  const commit = React.useCallback(
    (
      kind: CanvasHistoryActionKind,
      label: string,
      transition: (current: CanvasDocument, now: number) => CanvasDocument,
      coalesceKey?: string,
    ) => {
      clock.current += 1;
      const next = transition(documentRef.current, clock.current);
      historyRef.current.commit({
        id: `canvas-action-${clock.current}`,
        label,
        kind,
        timestamp: clock.current,
        after: next,
        coalesceKey,
      });
      documentRef.current = next;
      setDocument(next);
      autosaveRef.current?.schedule(next);
    },
    [],
  );

  const applyHistorySnapshot = React.useCallback((snapshot: CanvasDocument) => {
    const current = documentRef.current;
    clock.current = Math.max(clock.current, current.updatedAt, snapshot.updatedAt) + 1;
    const next = parseCanvasDocument({
      ...snapshot,
      id: current.id,
      projectId: current.projectId,
      ownerId: current.ownerId,
      localRevision: current.localRevision + 1,
      syncRevision: current.syncRevision,
      createdAt: current.createdAt,
      updatedAt: clock.current,
    });
    documentRef.current = next;
    cameraRef.current = next.camera;
    setCameraState(next.camera);
    setDocument(next);
    autosaveRef.current?.schedule(next);
  }, []);

  const undo = React.useCallback(() => {
    if (!historyRef.current.canUndo()) return;
    applyHistorySnapshot(historyRef.current.undo());
  }, [applyHistorySnapshot]);

  const redo = React.useCallback(() => {
    if (!historyRef.current.canRedo()) return;
    applyHistorySnapshot(historyRef.current.redo());
  }, [applyHistorySnapshot]);

  const deleteSelected = React.useCallback(() => {
    if (selected.ids.length === 0) return;
    const ids = selected.ids;
    commit(
      'object-delete',
      `Delete ${ids.length} canvas object${ids.length === 1 ? '' : 's'}`,
      (current, now) => ids.reduce((next, id) => withBlockRemoved(next, id, now), current),
    );
    setSelected(clearCanvasSelection);
  }, [commit, selected.ids]);

  const nudgeSelected = React.useCallback(
    (x: number, y: number) => {
      if (selected.ids.length === 0 || document.layoutMode !== 'edgeless') return;
      const ids = selected.ids;
      commit(
        'object-move',
        `Move ${ids.length} canvas object${ids.length === 1 ? '' : 's'}`,
        (current, now) =>
          ids.reduce((next, id) => {
            const placement = resolveEdgelessLayout(next).get(parseCanvasBlockId(id));
            if (!placement) return next;
            return withPlacement(
              next,
              { ...placement, x: placement.x + x, y: placement.y + y },
              now,
            );
          }, current),
        `keyboard-nudge:${ids.join(',')}`,
      );
    },
    [commit, document.layoutMode, selected.ids],
  );

  const copySelected = React.useCallback(() => {
    if (selected.ids.length === 0) return;
    clipboard.current = copyBlocks(documentRef.current, selected.ids);
  }, [selected.ids]);

  const pastePayload = React.useCallback(
    (payload: CanvasClipboardPayload, label: string) => {
      const pastedIds: string[] = [];
      commit('object-create', label, (current, now) =>
        pasteBlocks(current, payload, {
          now,
          offset: { dx: 24, dy: 24 },
          generateId: () => {
            let id: string;
            do {
              clipboardSequence.current += 1;
              id = `${documentRef.current.id}-copy-${clipboardSequence.current}`;
            } while (blockById(documentRef.current, id));
            pastedIds.push(id);
            return id;
          },
        }),
      );
      setSelected(createCanvasSelection(pastedIds));
    },
    [commit],
  );

  const pasteClipboard = React.useCallback(() => {
    if (clipboard.current) {
      pastePayload(clipboard.current, 'Paste canvas objects');
    }
  }, [pastePayload]);

  const duplicateSelected = React.useCallback(() => {
    if (selected.ids.length === 0) return;
    pastePayload(copyBlocks(documentRef.current, selected.ids), 'Duplicate canvas objects');
  }, [pastePayload, selected.ids]);

  const cutSelected = React.useCallback(() => {
    if (selected.ids.length === 0) return;
    const ids = selected.ids;
    clipboard.current = copyBlocks(documentRef.current, ids);
    commit(
      'object-delete',
      `Cut ${ids.length} canvas object${ids.length === 1 ? '' : 's'}`,
      (current, now) => cutBlocks(current, ids, now),
    );
    setSelected(clearCanvasSelection);
  }, [commit, selected.ids]);

  React.useEffect(() => {
    setPresentation((current) =>
      current.status === 'presenting' ? current : presentationFromDocument(document),
    );
  }, [document.presentationOrder]);

  React.useEffect(() => {
    if (presentation.status === 'presenting') {
      wasPresentingRef.current = true;
      presentationRegionRef.current?.focus();
      return;
    }
    if (wasPresentingRef.current) {
      wasPresentingRef.current = false;
      presentationTriggerRef.current?.focus();
    }
  }, [presentation.status]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (presentation.status === 'presenting') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setPresentation((current) => exitPresentMode(current));
          return;
        }
        if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
          event.preventDefault();
          setPresentation((current) => nextFrame(current));
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          event.preventDefault();
          setPresentation((current) => previousFrame(current));
          return;
        }
      }
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape' && selected.ids.length > 0) {
        event.preventDefault();
        setSelected(clearCanvasSelection);
        return;
      }
      if (event.code === 'Space' && document.layoutMode === 'edgeless') {
        event.preventDefault();
        spaceHeld.current = true;
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'c' && selected.ids.length > 0) {
          event.preventDefault();
          copySelected();
          return;
        }
        if (key === 'x' && selected.ids.length > 0) {
          event.preventDefault();
          cutSelected();
          return;
        }
        if (key === 'v' && clipboard.current) {
          event.preventDefault();
          pasteClipboard();
          return;
        }
        if (key === 'd' && selected.ids.length > 0) {
          event.preventDefault();
          duplicateSelected();
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(selectAllCanvasBlocks(documentRef.current.pageOrder));
        return;
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.startsWith('Arrow')) {
        const amount = event.shiftKey ? 10 : 1;
        const deltaByKey: Record<string, readonly [number, number]> = {
          ArrowLeft: [-amount, 0],
          ArrowRight: [amount, 0],
          ArrowUp: [0, -amount],
          ArrowDown: [0, amount],
        };
        const delta = deltaByKey[event.key];
        if (delta && selected.ids.length > 0 && document.layoutMode === 'edgeless') {
          event.preventDefault();
          nudgeSelected(delta[0], delta[1]);
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld.current = false;
      }
    };
    const onBlur = () => {
      spaceHeld.current = false;
      panPointer.current = null;
      activePointers.current.clear();
      pinch.current = null;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    copySelected,
    cutSelected,
    deleteSelected,
    document.layoutMode,
    duplicateSelected,
    nudgeSelected,
    pasteClipboard,
    presentation.status,
    redo,
    selected.ids.length,
    undo,
  ]);

  React.useEffect(() => {
    const existing = new Set<string>(document.blocks.map((block) => block.id));
    setSelected((current) => createCanvasSelection(current.ids.filter((id) => existing.has(id))));
  }, [document.blocks]);

  const pointerPoint = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const readPinch = () => {
    const [first, second] = [...activePointers.current.values()];
    if (!first || !second) return null;
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (document.layoutMode !== 'edgeless') return;
    const point = pointerPoint(event);
    activePointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (
      activePointers.current.size === 1 &&
      event.target === event.currentTarget &&
      tool === 'select' &&
      event.button === 0 &&
      event.pointerType !== 'touch'
    ) {
      event.preventDefault();
      const gesture = {
        pointerId: event.pointerId,
        start: point,
        end: point,
        baseIds:
          event.shiftKey || event.ctrlKey || event.metaKey
            ? selected.ids
            : ([] as readonly string[]),
      };
      marqueeGesture.current = gesture;
      setMarqueeVisual({ start: point, end: point });
      return;
    }

    if (activePointers.current.size === 2) {
      pinch.current = readPinch();
      panPointer.current = null;
      return;
    }

    if (
      tool === 'hand' ||
      spaceHeld.current ||
      event.button === 1 ||
      event.pointerType === 'touch'
    ) {
      event.preventDefault();
      panPointer.current = { pointerId: event.pointerId, ...point };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (document.layoutMode !== 'edgeless' || !activePointers.current.has(event.pointerId)) return;
    const point = pointerPoint(event);
    activePointers.current.set(event.pointerId, point);

    const activeMarquee = marqueeGesture.current;
    if (activeMarquee?.pointerId === event.pointerId) {
      event.preventDefault();
      marqueeGesture.current = { ...activeMarquee, end: point };
      setMarqueeVisual({ start: activeMarquee.start, end: point });
      return;
    }

    const previousPinch = pinch.current;
    const nextPinch = readPinch();
    if (previousPinch && nextPinch && previousPinch.distance > 0 && nextPinch.distance > 0) {
      event.preventDefault();
      setCamera((current) => {
        const panned = panCameraByScreenDelta(current, {
          x: nextPinch.center.x - previousPinch.center.x,
          y: nextPinch.center.y - previousPinch.center.y,
        });
        return zoomCameraAtScreenPoint(
          panned,
          CAMERA_VIEWPORT,
          nextPinch.center,
          panned.zoom * (nextPinch.distance / previousPinch.distance),
        );
      }, false);
      pinch.current = nextPinch;
      return;
    }

    const previous = panPointer.current;
    if (previous?.pointerId !== event.pointerId) return;
    event.preventDefault();
    setCamera(
      (current) =>
        panCameraByScreenDelta(current, { x: point.x - previous.x, y: point.y - previous.y }),
      false,
    );
    panPointer.current = { pointerId: event.pointerId, ...point };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    const activeMarquee = marqueeGesture.current;
    if (activeMarquee?.pointerId === event.pointerId) {
      if (event.type === 'pointercancel') {
        setSelected(createCanvasSelection(activeMarquee.baseIds));
      } else {
        const end = pointerPoint(event);
        const startWorld = screenToWorld(camera, CAMERA_VIEWPORT, activeMarquee.start);
        const endWorld = screenToWorld(camera, CAMERA_VIEWPORT, end);
        const placements = [...resolveEdgelessLayout(documentRef.current).values()].map(
          (placement) => ({ ...placement, id: placement.blockId }),
        );
        const inMarquee = marqueeSelect(placements, startWorld, endWorld);
        setSelected(createCanvasSelection([...activeMarquee.baseIds, ...inMarquee.ids]));
      }
      marqueeGesture.current = null;
      setMarqueeVisual(null);
    }
    const completedCameraGesture =
      panPointer.current?.pointerId === event.pointerId || pinch.current !== null;
    activePointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (panPointer.current?.pointerId === event.pointerId) {
      panPointer.current = null;
    }
    pinch.current = activePointers.current.size === 2 ? readPinch() : null;
    if (completedCameraGesture) {
      setCamera(cameraRef.current);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (document.layoutMode !== 'edgeless') return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const factor = Math.exp(-event.deltaY * 0.001);
    setCamera((current) =>
      zoomCameraAtScreenPoint(current, CAMERA_VIEWPORT, point, current.zoom * factor),
    );
  };

  const onObjectPointerDown = (event: React.PointerEvent<HTMLElement>, blockId: string) => {
    if (
      document.layoutMode !== 'edgeless' ||
      tool === 'hand' ||
      spaceHeld.current ||
      event.button === 1 ||
      event.pointerType === 'touch'
    ) {
      return;
    }
    event.stopPropagation();
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const ids = selectionHas(selected, blockId) ? selected.ids : [blockId];
    if (!selectionHas(selected, blockId)) {
      setSelected(selectCanvasBlock(selected, blockId));
    }
    objectDrag.current = {
      pointerId: event.pointerId,
      ids,
      x: event.clientX,
      y: event.clientY,
      zoom: camera.zoom,
      totalX: 0,
      totalY: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onObjectPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = objectDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = (event.clientX - drag.x) / drag.zoom;
    const y = (event.clientY - drag.y) / drag.zoom;
    if (x === 0 && y === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const totalX = drag.totalX + x;
    const totalY = drag.totalY + y;
    for (const id of drag.ids) {
      const element = blockElements.current.get(id);
      if (element) {
        element.style.transform = `translate(${totalX}px, ${totalY}px)`;
      }
    }
    objectDrag.current = {
      ...drag,
      x: event.clientX,
      y: event.clientY,
      totalX,
      totalY,
      moved: true,
    };
  };

  const onObjectPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    const drag = objectDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    for (const id of drag.ids) {
      const element = blockElements.current.get(id);
      if (element) {
        element.style.transform = '';
      }
    }
    if (drag.moved && event.type !== 'pointercancel') {
      commit(
        'object-move',
        `Move ${drag.ids.length} canvas object${drag.ids.length === 1 ? '' : 's'}`,
        (current, now) =>
          drag.ids.reduce((next, id) => {
            const placement = resolveEdgelessLayout(next).get(parseCanvasBlockId(id));
            if (!placement) return next;
            return withPlacement(
              next,
              {
                ...placement,
                x: placement.x + drag.totalX,
                y: placement.y + drag.totalY,
              },
              now,
            );
          }, current),
      );
    }
    suppressObjectClick.current = drag.moved;
    objectDrag.current = null;
  };

  const addBlock = (kind: Exclude<CanvasBlockKind, 'mind-map'>) => {
    let blockNumber: number;
    let blockId: string;
    do {
      sequence.current += 1;
      blockNumber = sequence.current;
      blockId = `${documentRef.current.id}-${kind}-${blockNumber}`;
    } while (blockById(documentRef.current, blockId));
    const content =
      kind === 'heading'
        ? ({ kind, level: 2, text: `New heading ${blockNumber}` } as const)
        : kind === 'code'
          ? ({ kind, language: 'typescript', text: `// New code block ${blockNumber}` } as const)
          : ({ kind, text: `New ${kind} ${blockNumber}` } as const);
    commit('object-create', `Add ${kind} ${blockNumber}`, (current, now) =>
      withBlockAdded(
        current,
        createCanvasBlock({
          id: blockId,
          content,
          now,
        }),
        now,
      ),
    );
  };

  const addNote = () => addBlock('note');

  const addMindMap = () => {
    let blockNumber: number;
    let blockId: string;
    do {
      sequence.current += 1;
      blockNumber = sequence.current;
      blockId = `${documentRef.current.id}-mind-map-${blockNumber}`;
    } while (blockById(documentRef.current, blockId));
    commit('object-create', `Add mind map ${blockNumber}`, (current, now) =>
      withBlockAdded(
        current,
        createCanvasBlock({
          id: blockId,
          content: {
            kind: 'mind-map',
            map: createMindMap({
              id: `mind-map-${blockNumber}`,
              rootId: `mind-map-root-${blockNumber}`,
              label: `New mind map ${blockNumber}`,
              now,
            }),
          },
          now,
        }),
        now,
      ),
    );
  };

  const addMindMapChildToRoot = (blockId: string) => {
    commit('block-change', 'Add mind-map branch', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      const map = content.map;
      const root = map.nodes.find((node) => node.id === map.rootId);
      if (!root) return current;
      const branchNumber = root.childIds.length + 1;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: addMindMapChild(map, {
            parentId: root.id,
            nodeId: `${map.id}-branch-${branchNumber}`,
            label: `New branch ${branchNumber}`,
            now,
          }),
        },
        now,
      );
    });
  };

  const toggleMindMapRootCollapsed = (blockId: string) => {
    commit('block-change', 'Toggle mind-map branch', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      const map = content.map;
      const root = map.nodes.find((node) => node.id === map.rootId);
      if (!root) return current;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: setMindMapBranchCollapsed(map, root.id, !root.collapsed, now),
        },
        now,
      );
    });
  };

  const addMindMapSibling = (blockId: string, siblingId: string) => {
    commit('block-change', 'Add mind-map sibling', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      const sibling = content.map.nodes.find((node) => node.id === siblingId);
      if (!sibling || sibling.parentId === null) return current;
      const parent = content.map.nodes.find((node) => node.id === sibling.parentId);
      const branchNumber = (parent?.childIds.length ?? 0) + 1;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: appendMindMapSibling(content.map, {
            siblingId,
            nodeId: `${content.map.id}-branch-${branchNumber}`,
            label: `New branch ${branchNumber}`,
            now,
          }),
        },
        now,
      );
    });
  };

  const moveMindMapBranchEarlier = (blockId: string, nodeId: string) => {
    commit('block-change', 'Reorder mind-map branch', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      const node = content.map.nodes.find((entry) => entry.id === nodeId);
      if (!node || node.parentId === null) return current;
      const parent = content.map.nodes.find((entry) => entry.id === node.parentId);
      const index = parent?.childIds.indexOf(node.id) ?? -1;
      if (!parent || index <= 0) return current;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: reorderMindMapBranch(content.map, {
            parentId: parent.id,
            nodeId: node.id,
            index: index - 1,
            now,
          }),
        },
        now,
      );
    });
  };

  const changeMindMapDirection = (blockId: string, value: string) => {
    commit('block-change', 'Change mind-map direction', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: setMindMapDirection(content.map, value as MindMapDirection, now),
        },
        now,
      );
    });
  };

  const changeMindMapConnectorStyle = (blockId: string, value: string) => {
    commit('block-change', 'Change mind-map connector style', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: setMindMapConnectorStyle(content.map, value as MindMapConnectorStyle, now),
        },
        now,
      );
    });
  };

  const changeMindMapRootShape = (blockId: string, value: string) => {
    commit('block-change', 'Change mind-map root shape', (current, now) => {
      const block = blockById(current, blockId);
      const content = block?.content;
      if (!content || content.kind !== 'mind-map') return current;
      const root = content.map.nodes.find((node) => node.id === content.map.rootId);
      if (!root) return current;
      return withBlockContent(
        current,
        blockId,
        {
          kind: 'mind-map',
          map: setMindMapNodeStyle(content.map, root.id, { shape: value as MindMapNodeShape }, now),
        },
        now,
      );
    });
  };

  const navigateMindMapNode = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    map: Parameters<typeof navigateMindMap>[0],
    nodeId: string,
  ) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextId = navigateMindMap(map, nodeId, event.key as Parameters<typeof navigateMindMap>[2]);
    const container = event.currentTarget.closest<HTMLElement>('[data-mind-map-id]');
    const next = [
      ...(container?.querySelectorAll<HTMLButtonElement>('[data-mind-map-node-id]') ?? []),
    ].find((element) => element.dataset.mindMapNodeId === nextId);
    next?.focus();
  };

  const updateBlockText = (blockId: string, text: string) => {
    commit(
      'text-change',
      'Edit canvas block',
      (current, now) => {
        const block = blockById(current, blockId);
        if (!block || block.content.kind === 'mind-map') return current;
        return withBlockContent(current, blockId, { ...block.content, text }, now);
      },
      `canvas-block:${blockId}`,
    );
  };

  const updateHeadingLevel = (blockId: string, level: number) => {
    if (!Number.isInteger(level) || level < 1 || level > 6) return;
    commit('block-change', 'Change heading level', (current, now) => {
      const block = blockById(current, blockId);
      if (!block || block.content.kind !== 'heading') return current;
      return withBlockContent(
        current,
        blockId,
        { ...block.content, level: level as 1 | 2 | 3 | 4 | 5 | 6 },
        now,
      );
    });
  };

  const startPresentation = () => {
    if (document.presentationOrder.length === 0) return;
    setPresentation(enterPresentMode(presentationFromDocument(documentRef.current)));
  };

  const importPackage = async (file: File) => {
    try {
      const imported = decodeCanvasPackage(await file.text()).document;
      clock.current = Math.max(clock.current, imported.updatedAt);
      commit('block-change', 'Import canvas package', (current, now) =>
        parseCanvasDocument({
          ...imported,
          id: current.id,
          projectId: current.projectId,
          ownerId: current.ownerId,
          localRevision: current.localRevision + 1,
          syncRevision: current.syncRevision,
          createdAt: current.createdAt,
          updatedAt: now,
          archivedAt: null,
          deletedAt: null,
        }),
      );
      setSelected(clearCanvasSelection);
      setCamera(imported.camera);
      setPackageMessage(`Imported ${file.name}`);
    } catch (error) {
      setPackageMessage(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : 'Import failed: invalid package',
      );
    }
  };

  const exportPackage = () => {
    const blob = new Blob([encodeCanvasPackage(documentRef.current)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    const safeTitle =
      documentRef.current.title
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'canvas';
    anchor.href = url;
    anchor.download = `${safeTitle}.vibespace-canvas.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setPackageMessage('Canvas package exported');
  };

  const setLayout = (layoutMode: CanvasLayoutMode) => {
    if (document.layoutMode === layoutMode) return;
    commit('mode-change', `Switch to ${layoutMode} layout`, (current, now) =>
      withLayoutMode(current, layoutMode, now),
    );
  };

  const setBackgroundKind = (kind: CanvasBackgroundKind) => {
    if (document.background.kind === kind) return;
    commit('style-change', `Use ${CANVAS_BACKGROUND_LABELS[kind]}`, (current, now) =>
      withBackground(current, { ...current.background, kind }, now),
    );
  };

  const setBackgroundColor = (color: string) => {
    if (document.background.color === color) return;
    commit(
      'style-change',
      'Change canvas background color',
      (current, now) => withBackground(current, { ...current.background, color }, now),
      'canvas:background-color',
    );
  };

  const setZoom = (factor: number) => {
    setCamera((current) =>
      zoomCameraAtScreenPoint(current, CAMERA_VIEWPORT, CAMERA_CENTER, current.zoom * factor),
    );
  };

  const fitContent = () => {
    const placements = [...resolveEdgelessLayout(document).values()];
    if (placements.length === 0) {
      setCamera(resetCamera());
      return;
    }
    const left = Math.min(...placements.map((placement) => placement.x));
    const top = Math.min(...placements.map((placement) => placement.y));
    const right = Math.max(...placements.map((placement) => placement.x + placement.width));
    const bottom = Math.max(...placements.map((placement) => placement.y + placement.height));
    setCamera(
      fitWorldBounds(
        { x: left, y: top, width: right - left, height: bottom - top },
        CAMERA_VIEWPORT,
      ),
    );
  };

  const restoreRecovery = () => {
    if (!recoveryOffer || !activeScope) return;
    const entry = recoveryOffer;
    replaceActiveDocument(entry.document);
    const controller = attachAutosave(activeRepository, activeScope, entry.baseRevision);
    controller.schedule(entry.document);
    setRecoveryOffer(null);
    setPersistenceStatus('recovered-unsaved-work');
  };

  const discardRecovery = async () => {
    if (!recoveryOffer || !activeScope) return;
    const entry = recoveryOffer;
    try {
      await activeRepository.clearRecovery(activeScope, entry.id);
      setRecoveryOffer((current) => (current?.id === entry.id ? null : current));
    } catch {
      setPersistenceStatus('sync-error');
    }
  };

  const blocks = pageOrderedBlocks(document);
  const selectedBlocks = selected.ids.flatMap((blockId) => {
    const block = blockById(document, blockId);
    return block ? [block] : [];
  });
  const selectedBlock = selectedBlocks.length === 1 ? selectedBlocks[0] : undefined;
  const selectedBlockIsPresentationFrame = selectedBlock
    ? document.presentationOrder.includes(selectedBlock.id)
    : false;
  const activePresentationFrame =
    presentation.status === 'presenting' && presentation.currentIndex >= 0
      ? presentation.frames[presentation.currentIndex]
      : undefined;
  const activePresentationBlock = activePresentationFrame
    ? blockById(document, activePresentationFrame.id)
    : undefined;
  const activePresentationMindMap =
    activePresentationBlock?.content.kind === 'mind-map'
      ? activePresentationBlock.content.map
      : undefined;
  const activePresentationMindMapRoot = activePresentationMindMap?.nodes.find(
    (node) => node.id === activePresentationMindMap.rootId,
  );
  const activePresentationProgress = presentationProgress(presentation);
  const zoomAnnouncement = canvasZoomAnnouncement(camera.zoom);
  const toggleSelectedPresentationFrame = () => {
    if (!selectedBlock) return;
    const blockId = selectedBlock.id;
    const alreadyIncluded = document.presentationOrder.includes(blockId);
    commit(
      'block-change',
      alreadyIncluded ? 'Remove presentation frame' : 'Add presentation frame',
      (current, now) => {
        const nextOrder = current.presentationOrder.includes(blockId)
          ? current.presentationOrder.filter((entry) => entry !== blockId)
          : [...current.presentationOrder, blockId];
        return withPresentationOrder(current, nextOrder, now);
      },
    );
  };
  const placementById = resolveEdgelessLayout(document);
  const minimap = React.useMemo(() => {
    const placements = [...resolveEdgelessLayout(document).values()];
    const viewportBounds = {
      x: camera.x - CAMERA_VIEWPORT.width / camera.zoom / 2,
      y: camera.y - CAMERA_VIEWPORT.height / camera.zoom / 2,
      width: CAMERA_VIEWPORT.width / camera.zoom,
      height: CAMERA_VIEWPORT.height / camera.zoom,
    };
    const bounds = [...placements, viewportBounds];
    const left = Math.min(...bounds.map((item) => item.x));
    const top = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.x + item.width));
    const bottom = Math.max(...bounds.map((item) => item.y + item.height));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const rectangle = (item: { x: number; y: number; width: number; height: number }) => ({
      left: `${((item.x - left) / width) * 100}%`,
      top: `${((item.y - top) / height) * 100}%`,
      width: `${Math.max(2, (item.width / width) * 100)}%`,
      height: `${Math.max(2, (item.height / height) * 100)}%`,
    });
    return {
      placements: placements.map((placement) => ({
        blockId: placement.blockId,
        rectangle: rectangle(placement),
      })),
      viewport: rectangle(viewportBounds),
    };
  }, [camera, document]);
  const goBack = () => {
    restoreCameraLocation(cameraNavigator.current.back());
  };
  const goForward = () => {
    restoreCameraLocation(cameraNavigator.current.forward());
  };
  const visibleEdgelessBlockIds = React.useMemo(() => {
    const index = createCanvasSpatialIndex();
    for (const placement of resolveEdgelessLayout(document).values()) {
      index.upsert(placement);
    }
    return new Set(
      index.queryViewport(camera, CAMERA_VIEWPORT).map((placement) => placement.blockId),
    );
  }, [camera, document]);
  const visibleEdgelessBlocks = blocks.filter((block) => visibleEdgelessBlockIds.has(block.id));
  const renderBlockEditor = (block: CanvasBlock) => {
    const content = block.content;
    if (content.kind === 'mind-map') {
      const root = content.map.nodes.find((node) => node.id === content.map.rootId);
      const nodesById = new Map(content.map.nodes.map((node) => [node.id, node]));
      const rootChildren = root
        ? root.childIds.flatMap((nodeId) => {
            const node = nodesById.get(nodeId);
            return node ? [node] : [];
          })
        : [];
      return (
        <section
          aria-label={`Mind map: ${root?.label ?? 'Untitled'}`}
          data-mind-map-id={content.map.id}
          className="space-y-2"
        >
          {root ? (
            <button
              type="button"
              aria-label={`Mind map node: ${root.label}`}
              data-mind-map-node-id={root.id}
              onKeyDown={(event) => navigateMindMapNode(event, content.map, root.id)}
              className="text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {root.label}
            </button>
          ) : (
            <p className="text-sm font-medium">Untitled</p>
          )}
          <button
            type="button"
            aria-label={`Add child to ${root?.label ?? 'Untitled'}`}
            onClick={(event) => {
              event.stopPropagation();
              addMindMapChildToRoot(block.id);
            }}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Add child
          </button>
          <button
            type="button"
            aria-label={`${root?.collapsed ? 'Expand' : 'Collapse'} ${root?.label ?? 'Untitled'}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleMindMapRootCollapsed(block.id);
            }}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {root?.collapsed ? 'Expand' : 'Collapse'}
          </button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Direction
            <select
              aria-label="Mind map direction"
              value={content.map.direction}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => changeMindMapDirection(block.id, event.currentTarget.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="both">Both</option>
              <option value="down">Down</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Connector
            <select
              aria-label="Mind map connector style"
              value={content.map.connectorStyle}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => changeMindMapConnectorStyle(block.id, event.currentTarget.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              <option value="curved">Curved</option>
              <option value="elbow">Elbow</option>
              <option value="straight">Straight</option>
            </select>
          </label>
          {root ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Root shape
              <select
                aria-label="Mind map root shape"
                value={root.style.shape}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => changeMindMapRootShape(block.id, event.currentTarget.value)}
                className="rounded border border-border bg-background px-2 py-1 text-foreground"
              >
                <option value="rounded">Rounded</option>
                <option value="pill">Pill</option>
                <option value="card">Card</option>
              </select>
            </label>
          ) : null}
          {root?.collapsed ? null : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {rootChildren.map((node, index) => (
                <li key={node.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Mind map node: ${node.label}`}
                    data-mind-map-node-id={node.id}
                    onKeyDown={(event) => navigateMindMapNode(event, content.map, node.id)}
                    className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {node.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Add sibling to ${node.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      addMindMapSibling(block.id, node.id);
                    }}
                    className="rounded border border-border px-2 py-1 text-xs"
                  >
                    Add sibling
                  </button>
                  {index > 0 ? (
                    <button
                      type="button"
                      aria-label={`Move ${node.label} before ${rootChildren[index - 1]?.label ?? 'previous branch'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveMindMapBranchEarlier(block.id, node.id);
                      }}
                      className="rounded border border-border px-2 py-1 text-xs"
                    >
                      Move up
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    }
    return (
      <textarea
        aria-label={`Edit ${content.kind} block`}
        value={content.text}
        rows={content.kind === 'heading' ? 1 : content.kind === 'code' ? 6 : 3}
        spellCheck={content.kind !== 'code'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => updateBlockText(block.id, event.currentTarget.value)}
        className={[
          'h-full min-h-8 w-full resize-none bg-transparent text-sm outline-none',
          content.kind === 'heading' ? 'text-lg font-semibold' : '',
          content.kind === 'code' ? 'font-mono text-xs' : '',
        ].join(' ')}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <header className="flex min-h-14 items-center gap-3 border-b border-border bg-background px-4">
        <div className="min-w-0 flex-1">
          <h1 className="sr-only">Infinite Idea Canvas</h1>
          <input
            aria-label="Canvas title"
            value={document.title}
            onChange={(event) => {
              const title = event.currentTarget.value;
              commit(
                'text-change',
                'Rename canvas',
                (current, now) => withTitle(current, title, now),
                'canvas:title',
              );
            }}
            className="w-full max-w-sm truncate rounded border border-transparent bg-transparent px-2 py-1 font-medium outline-none hover:border-border focus:border-ring"
          />
          <p className="px-2 text-xs text-muted-foreground">
            {activeScope ? PERSISTENCE_LABELS[persistenceStatus] : 'Local draft'}
          </p>
        </div>

        <div className="inline-flex rounded-md border border-border p-1" aria-label="Canvas layout">
          {(['page', 'edgeless'] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              aria-label={`${layout === 'page' ? 'Page' : 'Edgeless'} layout`}
              aria-pressed={document.layoutMode === layout}
              onClick={() => setLayout(layout)}
              className={[
                'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                document.layoutMode === layout
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {layout}
            </button>
          ))}
        </div>
        <button
          ref={presentationTriggerRef}
          type="button"
          aria-label="Present canvas"
          disabled={document.presentationOrder.length === 0}
          onClick={startPresentation}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play aria-hidden size={15} />
          Present
        </button>
        <label
          title="Import canvas package"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Upload aria-hidden size={17} />
          <input
            aria-label="Import canvas package"
            type="file"
            accept=".json,.vibespace-canvas.json,application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void importPackage(file);
            }}
          />
        </label>
        <button
          type="button"
          aria-label="Export canvas package"
          onClick={exportPackage}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download aria-hidden size={17} />
        </button>
        <button
          type="button"
          aria-label={outlineOpen ? 'Hide canvas outline' : 'Show canvas outline'}
          aria-expanded={outlineOpen}
          aria-controls="canvas-object-outline"
          onClick={() => {
            setOutlineOpen((current) => !current);
            setPropertiesOpen(false);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ListTree aria-hidden size={17} />
        </button>
        <button
          type="button"
          aria-label={propertiesOpen ? 'Hide canvas properties' : 'Show canvas properties'}
          aria-expanded={propertiesOpen}
          aria-controls="canvas-properties-panel"
          onClick={() => {
            setPropertiesOpen((current) => !current);
            setOutlineOpen(false);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings2 aria-hidden size={17} />
        </button>
      </header>
      {recoveryOffer ? (
        <section
          aria-label="Canvas recovery"
          className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm"
        >
          <p>Unsaved canvas recovery is available.</p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Restore recovered canvas"
              onClick={restoreRecovery}
              className="rounded bg-foreground px-3 py-1 text-background"
            >
              Restore
            </button>
            <button
              type="button"
              aria-label="Discard recovered canvas"
              onClick={() => void discardRecovery()}
              className="rounded border border-border px-3 py-1"
            >
              Discard
            </button>
          </div>
        </section>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {packageMessage}
      </p>
      <output
        role="status"
        aria-label="Canvas zoom announcement"
        aria-live={zoomAnnouncement.politeness}
        className="sr-only"
      >
        {zoomAnnouncement.message}
      </output>

      {presentation.status === 'presenting' ? (
        <section
          ref={presentationRegionRef}
          role="region"
          aria-label="Canvas presentation"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col bg-foreground p-6 text-background"
        >
          <header className="flex items-center justify-between gap-4">
            <output
              role="status"
              aria-label="Presentation progress"
              className="text-sm tabular-nums text-background/75"
            >
              Slide {activePresentationProgress.current} of {activePresentationProgress.total}
            </output>
            <button
              type="button"
              aria-label="Exit presentation"
              onClick={() => setPresentation((current) => exitPresentMode(current))}
              className="rounded-md border border-background/30 px-3 py-2 text-sm hover:bg-background/10"
            >
              Exit
            </button>
          </header>
          <div className="flex min-h-0 flex-1 items-center justify-center py-8">
            <article className="max-h-full w-full max-w-5xl overflow-auto rounded-2xl bg-background p-10 text-foreground shadow-2xl">
              {activePresentationBlock ? (
                activePresentationBlock.content.kind === 'mind-map' ? (
                  <div className="space-y-4">
                    <h2 className="text-3xl font-semibold">
                      {activePresentationMindMapRoot?.label ?? 'Untitled mind map'}
                    </h2>
                    <p className="text-muted-foreground">
                      {activePresentationMindMap?.nodes.length ?? 0} mind-map nodes
                    </p>
                  </div>
                ) : activePresentationBlock.content.kind === 'code' ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {activePresentationBlock.content.language}
                    </p>
                    <pre className="whitespace-pre-wrap font-mono text-base">
                      {activePresentationBlock.content.text}
                    </pre>
                  </div>
                ) : activePresentationBlock.content.kind === 'heading' ? (
                  <h2 className="text-4xl font-semibold">{activePresentationBlock.content.text}</h2>
                ) : (
                  <p className="whitespace-pre-wrap text-2xl leading-relaxed">
                    {activePresentationBlock.content.text}
                  </p>
                )
              ) : (
                <p className="text-muted-foreground">Presentation frame unavailable.</p>
              )}
            </article>
          </div>
          <footer className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Previous presentation frame"
              disabled={activePresentationProgress.isFirst}
              onClick={() => setPresentation((current) => previousFrame(current))}
              className="rounded-md border border-background/30 px-4 py-2 text-sm hover:bg-background/10 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              aria-label="Next presentation frame"
              disabled={activePresentationProgress.isLast}
              onClick={() => setPresentation((current) => nextFrame(current))}
              className="rounded-md border border-background/30 px-4 py-2 text-sm hover:bg-background/10 disabled:opacity-40"
            >
              Next
            </button>
          </footer>
        </section>
      ) : null}

      <div hidden={presentation.status === 'presenting'} className="flex min-h-0 flex-1">
        <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-background py-3">
          <div role="toolbar" aria-label="Canvas tools" className="flex flex-col gap-2">
            <ToolButton
              active={tool === 'select'}
              label="Select tool"
              onClick={() => setTool('select')}
            >
              <MousePointer2 aria-hidden size={17} />
            </ToolButton>
            <ToolButton active={tool === 'hand'} label="Hand tool" onClick={() => setTool('hand')}>
              <Hand aria-hidden size={17} />
            </ToolButton>
            <ToolButton active={tool === 'note'} label="Note tool" onClick={() => setTool('note')}>
              <StickyNote aria-hidden size={17} />
            </ToolButton>
          </div>
          <div className="my-1 h-px w-7 bg-border" />
          <button
            type="button"
            aria-label="Add note"
            onClick={addNote}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background hover:opacity-90"
          >
            <Plus aria-hidden size={18} />
          </button>
          <button
            type="button"
            aria-label="Add text"
            onClick={() => addBlock('text')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Type aria-hidden size={17} />
          </button>
          <button
            type="button"
            aria-label="Add heading"
            onClick={() => addBlock('heading')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Heading aria-hidden size={17} />
          </button>
          <button
            type="button"
            aria-label="Add code block"
            onClick={() => addBlock('code')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Code2 aria-hidden size={17} />
          </button>
          <button
            type="button"
            aria-label="Add mind map"
            onClick={addMindMap}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ListTree aria-hidden size={17} />
          </button>
        </aside>

        <main
          role="region"
          aria-label="Canvas workspace"
          data-layout={document.layoutMode}
          data-camera-x={camera.x}
          data-camera-y={camera.y}
          data-camera-zoom={camera.zoom}
          data-background-kind={document.background.kind}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelected(clearCanvasSelection);
            }
          }}
          className="relative min-h-0 flex-1 overflow-auto bg-muted/20"
          style={{
            ...canvasBackgroundStyle(document.background),
            cursor: document.layoutMode === 'edgeless' && tool === 'hand' ? 'grab' : undefined,
            touchAction: document.layoutMode === 'edgeless' ? 'none' : undefined,
          }}
        >
          {blocks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-xl border border-dashed border-border bg-background/90 p-8 text-center shadow-sm">
                <StickyNote aria-hidden className="mx-auto mb-3 text-muted-foreground" />
                <h2 className="font-medium">Start with an idea</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a note, then arrange the same content in page or edgeless mode.
                </p>
                <button
                  type="button"
                  onClick={addNote}
                  className="mt-4 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
                >
                  Add first note
                </button>
              </div>
            </div>
          ) : document.layoutMode === 'page' ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-8">
              {blocks.map((block) => (
                <article
                  key={block.id}
                  aria-label={`Canvas ${block.content.kind}`}
                  aria-description={canvasBlockAccessibleLabel(block)}
                  aria-current={selectionHas(selected, block.id) ? 'true' : undefined}
                  data-selected={selectionHas(selected, block.id)}
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected((current) =>
                      selectCanvasBlock(
                        current,
                        block.id,
                        event.shiftKey || event.ctrlKey || event.metaKey,
                      ),
                    );
                  }}
                  className={[
                    'rounded-lg border border-border bg-background p-4 shadow-sm outline-none',
                    selectionHas(selected, block.id)
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'focus-visible:ring-2 focus-visible:ring-ring',
                  ].join(' ')}
                >
                  {renderBlockEditor(block)}
                </article>
              ))}
            </div>
          ) : (
            <div
              className="relative min-h-full min-w-full"
              style={{
                width: CAMERA_VIEWPORT.width,
                height: CAMERA_VIEWPORT.height,
                transform: `translate(${CAMERA_VIEWPORT.width / 2 - camera.x * camera.zoom}px, ${
                  CAMERA_VIEWPORT.height / 2 - camera.y * camera.zoom
                }px) scale(${camera.zoom})`,
                transformOrigin: '0 0',
              }}
            >
              {visibleEdgelessBlocks.map((block) => {
                const placement = placementById.get(block.id);
                return (
                  <article
                    key={block.id}
                    ref={(element) => {
                      if (element) {
                        blockElements.current.set(block.id, element);
                      } else {
                        blockElements.current.delete(block.id);
                      }
                    }}
                    aria-label={`Canvas ${block.content.kind}`}
                    aria-description={canvasBlockAccessibleLabel(block)}
                    aria-current={selectionHas(selected, block.id) ? 'true' : undefined}
                    data-selected={selectionHas(selected, block.id)}
                    tabIndex={0}
                    onPointerDown={(event) => onObjectPointerDown(event, block.id)}
                    onPointerMove={onObjectPointerMove}
                    onPointerUp={onObjectPointerEnd}
                    onPointerCancel={onObjectPointerEnd}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (suppressObjectClick.current) {
                        suppressObjectClick.current = false;
                        return;
                      }
                      setSelected((current) =>
                        selectCanvasBlock(
                          current,
                          block.id,
                          event.shiftKey || event.ctrlKey || event.metaKey,
                        ),
                      );
                    }}
                    className={[
                      'absolute overflow-auto rounded-lg border border-border bg-background p-4 shadow-sm outline-none',
                      selectionHas(selected, block.id)
                        ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                        : 'focus-visible:ring-2 focus-visible:ring-ring',
                    ].join(' ')}
                    style={{
                      left: placement?.x ?? 0,
                      top: placement?.y ?? 0,
                      width: placement?.width ?? 280,
                      height: placement?.height ?? 180,
                    }}
                  >
                    {renderBlockEditor(block)}
                  </article>
                );
              })}
            </div>
          )}

          {marqueeVisual ? (
            <div
              data-selection-marquee
              aria-hidden
              className="pointer-events-none absolute border border-ring bg-ring/10"
              style={{
                left: Math.min(marqueeVisual.start.x, marqueeVisual.end.x),
                top: Math.min(marqueeVisual.start.y, marqueeVisual.end.y),
                width: Math.abs(marqueeVisual.end.x - marqueeVisual.start.x),
                height: Math.abs(marqueeVisual.end.y - marqueeVisual.start.y),
              }}
            />
          ) : null}

          {document.layoutMode === 'edgeless' ? (
            <section
              role="region"
              aria-label="Canvas minimap"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              className="absolute bottom-4 right-4 h-28 w-44 overflow-hidden rounded-lg border border-border bg-background/95 p-2 shadow-sm"
            >
              <div className="relative h-full w-full overflow-hidden rounded bg-muted/50">
                {minimap.placements.map((item) => (
                  <button
                    key={item.blockId}
                    type="button"
                    aria-label={`Focus ${item.blockId} from minimap`}
                    onClick={() => {
                      const placement = placementById.get(item.blockId);
                      if (placement) {
                        setCamera(fitWorldBounds(placement, CAMERA_VIEWPORT, 120));
                      }
                    }}
                    className="absolute min-h-1 min-w-1 rounded-sm bg-foreground/55 hover:bg-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    style={item.rectangle}
                  />
                ))}
                <div
                  aria-hidden
                  className="pointer-events-none absolute border border-ring bg-ring/10"
                  style={minimap.viewport}
                />
              </div>
            </section>
          ) : null}

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
            <button
              type="button"
              aria-label="Undo"
              disabled={!historyRef.current.canUndo()}
              onClick={undo}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Undo2 aria-hidden size={16} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={!historyRef.current.canRedo()}
              onClick={redo}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Redo2 aria-hidden size={16} />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button
              type="button"
              aria-label="Back to previous canvas location"
              disabled={!cameraNavigator.current.canGoBack()}
              onClick={goBack}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft aria-hidden size={16} />
            </button>
            <button
              type="button"
              aria-label="Forward to next canvas location"
              disabled={!cameraNavigator.current.canGoForward()}
              onClick={goForward}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight aria-hidden size={16} />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <output
              role="status"
              aria-label="Current canvas tool"
              className="min-w-12 px-1 text-center text-xs text-muted-foreground"
            >
              {CANVAS_TOOL_LABELS[tool]}
            </output>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <output
              role="status"
              aria-label="Presentation frame count"
              className="min-w-12 px-1 text-center text-xs text-muted-foreground"
            >
              {document.presentationOrder.length}{' '}
              {document.presentationOrder.length === 1 ? 'slide' : 'slides'}
            </output>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <output aria-live="polite" className="sr-only">
              {selected.ids.length === 0
                ? 'No canvas objects selected'
                : `${selected.ids.length} canvas object${selected.ids.length === 1 ? '' : 's'} selected`}
            </output>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom(0.8)}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Minus aria-hidden size={16} />
            </button>
            <output aria-label="Current zoom" className="min-w-12 text-center text-xs tabular-nums">
              {cameraZoomPercent(camera)}%
            </output>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom(1.25)}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus aria-hidden size={16} />
            </button>
            <button
              type="button"
              aria-label="Fit content"
              onClick={fitContent}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Maximize2 aria-hidden size={16} />
            </button>
            <button
              type="button"
              aria-label="Reset view"
              onClick={() => setCamera(resetCamera())}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw aria-hidden size={16} />
            </button>
          </div>
        </main>
        {outlineOpen ? (
          <aside
            id="canvas-object-outline"
            aria-label="Canvas outline panel"
            className="w-72 shrink-0 overflow-auto border-l border-border bg-background"
          >
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Canvas outline
            </div>
            <CanvasOutline
              document={document}
              selectedIds={selected.ids}
              onActivate={(blockId) => setSelected(selectCanvasBlock(selected, blockId))}
            />
          </aside>
        ) : null}
        {propertiesOpen ? (
          <aside
            id="canvas-properties-panel"
            role="region"
            aria-label="Canvas properties panel"
            className="w-72 shrink-0 overflow-auto border-l border-border bg-background"
          >
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Properties
            </div>
            <div className="space-y-4 p-3">
              <section aria-label="Canvas background properties" className="space-y-3">
                <h2 className="text-sm font-medium">Canvas background</h2>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Pattern
                  <select
                    aria-label="Canvas background pattern"
                    value={document.background.kind}
                    onChange={(event) =>
                      setBackgroundKind(event.currentTarget.value as CanvasBackgroundKind)
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    {Object.entries(CANVAS_BACKGROUND_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Color
                  <input
                    aria-label="Canvas background color"
                    type="color"
                    value={document.background.color}
                    onChange={(event) => setBackgroundColor(event.currentTarget.value)}
                    className="h-9 w-full cursor-pointer rounded-md border border-border bg-background p-1"
                  />
                </label>
              </section>
              <div className="h-px bg-border" />
              {selectedBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Select a canvas object to inspect its properties.
                </p>
              ) : selectedBlock ? (
                <>
                  <h2 className="text-sm font-medium">
                    {CANVAS_BLOCK_KIND_LABELS[selectedBlock.content.kind]} properties
                  </h2>
                  {selectedBlock.content.kind === 'mind-map' ? (
                    <p className="text-sm text-muted-foreground">
                      Mind-map direction, connector, and node controls are available on the object.
                    </p>
                  ) : (
                    <label className="block space-y-1 text-xs text-muted-foreground">
                      Content
                      <textarea
                        aria-label="Selected block text"
                        value={selectedBlock.content.text}
                        rows={5}
                        spellCheck={selectedBlock.content.kind !== 'code'}
                        onChange={(event) =>
                          updateBlockText(selectedBlock.id, event.currentTarget.value)
                        }
                        className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-ring"
                      />
                    </label>
                  )}
                  {selectedBlock.content.kind === 'heading' ? (
                    <label className="block space-y-1 text-xs text-muted-foreground">
                      Heading level
                      <select
                        aria-label="Heading level"
                        value={selectedBlock.content.level}
                        onChange={(event) =>
                          updateHeadingLevel(
                            selectedBlock.id,
                            Number.parseInt(event.currentTarget.value, 10),
                          )
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      >
                        {[1, 2, 3, 4, 5, 6].map((level) => (
                          <option key={level} value={level}>
                            Heading {level}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {selectedBlock.content.kind === 'code' ? (
                    <div className="block space-y-1 text-xs text-muted-foreground">
                      Language
                      <output
                        aria-label="Code language"
                        className="block w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-sm text-foreground"
                      >
                        {selectedBlock.content.language}
                      </output>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    aria-label={
                      selectedBlockIsPresentationFrame
                        ? 'Remove selected object from presentation'
                        : 'Add selected object to presentation'
                    }
                    onClick={toggleSelectedPresentationFrame}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    {selectedBlockIsPresentationFrame
                      ? 'Remove from presentation'
                      : 'Add to presentation'}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete selected object"
                    onClick={deleteSelected}
                    className="w-full rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    Delete object
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{selectedBlocks.length} objects selected</p>
                  <p className="text-sm text-muted-foreground">
                    Shared actions apply to the complete selection.
                  </p>
                  <button
                    type="button"
                    aria-label="Delete selected objects"
                    onClick={deleteSelected}
                    className="w-full rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    Delete selected objects
                  </button>
                </>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
