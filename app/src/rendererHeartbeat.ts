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
  let emissionInFlight = false;
  let emissionQueued = false;

  const beat = () => {
    if (disposed) return;
    if (emissionInFlight) {
      emissionQueued = true;
      return;
    }

    emissionInFlight = true;
    let emission: Promise<void>;
    try {
      emission = send(RENDERER_HEARTBEAT_EVENT, { at: Date.now(), generation });
    } catch {
      emissionInFlight = false;
      return;
    }

    void emission
      .catch(() => {
        // The native watchdog remains unarmed until it receives a heartbeat.
        // Renderer startup must never fail because the event bridge is unavailable.
      })
      .finally(() => {
        emissionInFlight = false;
        if (disposed || !emissionQueued) return;
        emissionQueued = false;
        beat();
      });
  };

  const sendImmediateAndEnsureCadence = () => {
    if (disposed) return;
    beat();
    if (timer === null) {
      timer = window.setInterval(beat, RENDERER_HEARTBEAT_INTERVAL_MS);
    }
  };

  const beatWhenVisible = () => {
    if (!document.hidden) {
      sendImmediateAndEnsureCadence();
    }
  };

  window.addEventListener('pageshow', sendImmediateAndEnsureCadence);
  window.addEventListener('focus', sendImmediateAndEnsureCadence);
  document.addEventListener('visibilitychange', beatWhenVisible);
  sendImmediateAndEnsureCadence();

  return () => {
    disposed = true;
    emissionQueued = false;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    window.removeEventListener('pageshow', sendImmediateAndEnsureCadence);
    window.removeEventListener('focus', sendImmediateAndEnsureCadence);
    document.removeEventListener('visibilitychange', beatWhenVisible);
  };
}
