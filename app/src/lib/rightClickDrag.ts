import {
  contextMapFilePath,
  contextNodeFilePath,
  nodeToAttachment,
  serializeContextAttachment,
  type ContextTreeNode,
  type ProjectContextTree,
} from '@/features/context/tree';
import {
  resolveResourceDestination,
  routeResourceInteraction,
  type ResourceReference,
} from './resourceInteraction';

type RightDragData =
  | { path: string }
  | { node: ContextTreeNode; tree: ProjectContextTree };

let cancelActiveRightDrag: (() => void) | null = null;

function referenceForDrag(type: 'file' | 'context', data: RightDragData): ResourceReference {
  if (type === 'file') {
    const path = (data as { path: string }).path;
    return {
      kind: 'file',
      path,
      name: path.split(/[\\/]/).pop() || path,
    };
  }

  const { node, tree } = data as { node: ContextTreeNode; tree: ProjectContextTree };
  const attachment = nodeToAttachment(tree, node);
  const path = contextNodeFilePath(tree, node)
    ?? (node.kind === 'root' && tree.rootDir ? contextMapFilePath(tree.rootDir) : undefined);
  return {
    kind: 'context',
    name: node.title,
    raw: serializeContextAttachment(attachment),
    ...(path ? { path } : {}),
  };
}

export function startRightClickDrag(
  e: React.MouseEvent | MouseEvent,
  type: 'file' | 'context',
  data: RightDragData,
): () => void {
  if (e.button !== 2) return () => {};
  e.preventDefault();
  e.stopPropagation();
  cancelActiveRightDrag?.();

  const resource = referenceForDrag(type, data);
  const startX = e.clientX;
  const startY = e.clientY;
  let latestX = startX;
  let latestY = startY;
  let dragging = false;
  let cleaned = false;
  let preview: HTMLDivElement | null = null;
  let hoverTarget: HTMLElement | null = null;
  let suppressNativeMenuUntil = 0;
  let suppressionTimer: number | null = null;

  const clearHoverTarget = () => {
    hoverTarget?.classList.remove('jarvis-terminal-drop-hover');
    hoverTarget?.classList.remove('jarvis-resource-drop-hover');
    hoverTarget = null;
  };

  const elementAtPointer = () => document.elementFromPoint(latestX, latestY) as HTMLElement | null;

  const findHoverTarget = (): HTMLElement | null => {
    const element = elementAtPointer();
    if (!element || !resolveResourceDestination(element)) return null;
    return (element.closest('[data-resource-drop], [data-terminal-drop]') as HTMLElement | null)
      ?? (element.closest('input, textarea, [contenteditable]') as HTMLElement | null);
  };

  const ensurePreview = () => {
    if (preview) return;
    preview = document.createElement('div');
    preview.className = 'jarvis-terminal-drag-preview jarvis-resource-drag-preview';
    preview.textContent = `Insert reference · ${resource.name}`;
    preview.setAttribute('aria-hidden', 'true');
    document.body.appendChild(preview);
    document.body.classList.add('jarvis-terminal-right-dragging');
  };

  const updatePreview = () => {
    if (!preview) return;
    preview.style.transform = `translate3d(${latestX + 14}px, ${latestY + 14}px, 0)`;
  };

  const removeListeners = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('dragend', onCancel);
    window.removeEventListener('jarvis:route-change', onCancel);
    window.removeEventListener('hashchange', onCancel);
    window.removeEventListener('popstate', onCancel);
    window.removeEventListener('blur', onCancel);
    window.removeEventListener('beforeunload', onCancel);
  };

  const finishContextMenuSuppression = () => {
    document.removeEventListener('contextmenu', onContextMenu, true);
    delete document.body.dataset.jarvisSuppressContextMenuUntil;
    if (suppressionTimer !== null) {
      window.clearTimeout(suppressionTimer);
      suppressionTimer = null;
    }
  };

  const cleanup = (preserveContextMenuSuppression = false) => {
    if (cleaned) return;
    cleaned = true;
    clearHoverTarget();
    preview?.remove();
    preview = null;
    document.body.classList.remove('jarvis-terminal-right-dragging');
    removeListeners();
    if (preserveContextMenuSuppression) {
      const delay = Math.max(0, suppressNativeMenuUntil - Date.now()) + 50;
      suppressionTimer = window.setTimeout(finishContextMenuSuppression, delay);
    } else {
      finishContextMenuSuppression();
    }
    if (cancelActiveRightDrag === cancel) cancelActiveRightDrag = null;
  };

  function onContextMenu(ev: MouseEvent) {
    if (dragging || Date.now() < suppressNativeMenuUntil) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  function onMove(ev: MouseEvent) {
    latestX = ev.clientX;
    latestY = ev.clientY;
    const moved = Math.hypot(latestX - startX, latestY - startY);
    if (!dragging && moved < 6) return;
    dragging = true;
    ev.preventDefault();
    ensurePreview();
    updatePreview();

    const target = findHoverTarget();
    if (target !== hoverTarget) {
      clearHoverTarget();
      hoverTarget = target;
      hoverTarget?.classList.add('jarvis-terminal-drop-hover', 'jarvis-resource-drop-hover');
    }
  }

  function onUp(ev: MouseEvent) {
    if (ev.button !== 2) return;
    if (dragging) {
      suppressNativeMenuUntil = Date.now() + 700;
      document.body.dataset.jarvisSuppressContextMenuUntil = String(suppressNativeMenuUntil);
      ev.preventDefault();
      ev.stopPropagation();
      routeResourceInteraction(resource, elementAtPointer());
      cleanup(true);
      return;
    }
    cleanup();
  }

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    cleanup();
  }

  function onCancel() {
    cleanup();
  }

  function cancel() {
    cleanup();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('dragend', onCancel);
  window.addEventListener('jarvis:route-change', onCancel);
  window.addEventListener('hashchange', onCancel);
  window.addEventListener('popstate', onCancel);
  window.addEventListener('blur', onCancel);
  window.addEventListener('beforeunload', onCancel);
  cancelActiveRightDrag = cancel;
  return cancel;
}
