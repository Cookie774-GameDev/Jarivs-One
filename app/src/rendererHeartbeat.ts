import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const RENDERER_HEARTBEAT_EVENT = 'jarvis:renderer-heartbeat';
export const RENDERER_HEARTBEAT_INTERVAL_MS = 5_000;

type RendererHeartbeatOptions = {
  emit?: (event: string, payload?: unknown) => Promise<void>;
  isDesktop?: boolean;
  windowLabel?: string;
  generation?: string;
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function startRendererHeartbeat(options: RendererHeartbeatOptions = {}): () => void {
  const desktop = options.isDesktop ?? isTauriRuntime();
  if (!desktop) return () => undefined;

  const windowLabel = options.windowLabel ?? getCurrentWindow().label;
  if (windowLabel !== 'main') return () => undefined;

  const send = options.emit ?? emit;
  const generation =
    options.generation ??
    globalThis.crypto?.randomUUID?.() ??
    `renderer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let disposed = false;
  let timer: number | null = null;

  const beat = () => {
    if (disposed) return;
    void send(RENDERER_HEARTBEAT_EVENT, { at: Date.now(), generation }).catch(() => {
      // The native watchdog remains unarmed until it receives a heartbeat.
      // Renderer startup must never fail because the event bridge is unavailable.
    });
  };

  const pause = () => {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
  };

  const resume = () => {
    if (disposed || timer !== null) return;
    beat();
    timer = window.setInterval(beat, RENDERER_HEARTBEAT_INTERVAL_MS);
  };

  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  resume();

  return () => {
    disposed = true;
    pause();
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', resume);
  };
}
