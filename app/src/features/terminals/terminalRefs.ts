import type { ProjectId } from '@/types/common';

export interface TerminalRef {
  paneId?: string;
  sessionId?: string;
  projectId?: ProjectId | string | null;
  label?: string;
  command?: string;
  agentSlug?: string | null;
}

/**
 * Routing-only payload shared between the Pet WebView and the main WebView.
 * Deliberately excludes labels, commands, cwd, scrollback, and environment data.
 */
export interface MainTerminalFocusTarget {
  sessionId: string;
  paneId?: string;
  projectId?: string;
}

export const MAIN_TERMINAL_FOCUS_REQUEST_EVENT = 'jarvis:terminal:focus-main';
export const TERMINAL_FOCUS_EVENT = 'jarvis:terminal:focus';
export const TERMINALS_VISIBLE_EVENT = 'jarvis:terminals:visible';

const MAX_ROUTING_ID_LENGTH = 512;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function safeRoutingId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_ROUTING_ID_LENGTH ||
    CONTROL_CHARACTER.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function toMainTerminalFocusTarget(value: unknown): MainTerminalFocusTarget | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const sessionId = safeRoutingId(candidate.sessionId);
  if (!sessionId) return null;

  const paneId = safeRoutingId(candidate.paneId);
  if (candidate.paneId != null && !paneId) return null;
  const projectId = safeRoutingId(candidate.projectId);
  if (candidate.projectId != null && !projectId) return null;

  return {
    sessionId,
    ...(paneId ? { paneId } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in (window as Window & { __TAURI_INTERNALS__?: unknown })
  );
}

/**
 * Ask the main window to own, reveal, and focus an existing PTY presentation.
 * This function never spawns, restarts, kills, or forgets a terminal session.
 */
export async function requestMainTerminalFocus(ref: TerminalRef): Promise<boolean> {
  const target = toMainTerminalFocusTarget(ref);
  if (!target || typeof window === 'undefined') return false;

  if (!isTauriRuntime()) {
    window.dispatchEvent(
      new CustomEvent(MAIN_TERMINAL_FOCUS_REQUEST_EVENT, { detail: target }),
    );
    return true;
  }

  try {
    const [{ emitTo }, { Window: TauriWindow }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/window'),
    ]);
    const mainWindow = await TauriWindow.getByLabel('main');
    if (!mainWindow) return false;

    let focused = true;
    for (const operation of [
      () => mainWindow.unminimize(),
      () => mainWindow.show(),
      () => mainWindow.setFocus(),
    ]) {
      try {
        await operation();
      } catch {
        focused = false;
      }
    }

    await emitTo('main', MAIN_TERMINAL_FOCUS_REQUEST_EVENT, target);
    return focused;
  } catch {
    return false;
  }
}

export interface MainTerminalFocusBridgeOptions {
  isTerminalRouteVisible: () => boolean;
  openTerminalRoute: (target: MainTerminalFocusTarget) => void;
}

/**
 * Install the main-WebView receiver. Requests wait for the terminal route to
 * mount before the existing TileGrid focus event is dispatched.
 */
export function installMainTerminalFocusBridge(
  options: MainTerminalFocusBridgeOptions,
): () => void {
  if (typeof window === 'undefined') return () => {};

  let disposed = false;
  let unlisten: (() => void) | null = null;
  let pending: MainTerminalFocusTarget | null = null;
  let focusFrame: number | null = null;

  const dispatchFocus = (target: MainTerminalFocusTarget) => {
    window.dispatchEvent(
      new CustomEvent(TERMINAL_FOCUS_EVENT, {
        detail: { sessionId: target.sessionId, paneId: target.paneId },
      }),
    );
  };

  const onRequest = (raw: unknown) => {
    const target = toMainTerminalFocusTarget(raw);
    if (!target) return;
    const wasVisible = options.isTerminalRouteVisible();
    pending = target;
    options.openTerminalRoute(target);

    if (wasVisible) {
      if (focusFrame != null) window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        focusFrame = null;
        if (pending !== target) return;
        pending = null;
        dispatchFocus(target);
      });
    }
  };

  const onDomRequest = (event: Event) => {
    onRequest((event as CustomEvent<unknown>).detail);
  };
  const onTerminalsVisible = () => {
    const target = pending;
    if (!target) return;
    pending = null;
    dispatchFocus(target);
  };

  window.addEventListener(MAIN_TERMINAL_FOCUS_REQUEST_EVENT, onDomRequest);
  window.addEventListener(TERMINALS_VISIBLE_EVENT, onTerminalsVisible);

  if (isTauriRuntime()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<MainTerminalFocusTarget>(MAIN_TERMINAL_FOCUS_REQUEST_EVENT, (event) => {
          onRequest(event.payload);
        }),
      )
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
  }

  return () => {
    disposed = true;
    pending = null;
    if (focusFrame != null) window.cancelAnimationFrame(focusFrame);
    window.removeEventListener(MAIN_TERMINAL_FOCUS_REQUEST_EVENT, onDomRequest);
    window.removeEventListener(TERMINALS_VISIBLE_EVENT, onTerminalsVisible);
    unlisten?.();
    unlisten = null;
  };
}

export function serializeTerminalRef(ref: TerminalRef): string {
  return JSON.stringify(ref);
}

export function parseTerminalRef(raw: string): TerminalRef | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('terminal:')) {
    return { sessionId: value.slice('terminal:'.length).trim() };
  }
  if (!value.startsWith('{')) {
    return { sessionId: value };
  }
  try {
    const parsed = JSON.parse(value) as TerminalRef;
    if (!parsed || typeof parsed !== 'object') return null;
    const paneId = typeof parsed.paneId === 'string' ? parsed.paneId.trim() : undefined;
    const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : undefined;
    if (!paneId && !sessionId) return null;
    return {
      paneId,
      sessionId,
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : parsed.projectId ?? null,
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      command: typeof parsed.command === 'string' ? parsed.command : undefined,
      agentSlug: typeof parsed.agentSlug === 'string' ? parsed.agentSlug : parsed.agentSlug ?? null,
    };
  } catch {
    return null;
  }
}

export function terminalRefKey(ref: TerminalRef): string {
  return ref.paneId || ref.sessionId || ref.label || 'terminal';
}

export function terminalRefLabel(ref: TerminalRef): string {
  return ref.label || ref.command || ref.paneId || ref.sessionId || 'terminal';
}
