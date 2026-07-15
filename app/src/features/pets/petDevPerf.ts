/**
 * Development-only pet performance counters.
 * Zero production spam — counters are in-memory and opt-in via import.
 */

export interface PetPerfSnapshot {
  pixiTickerFps: number;
  activePixiApplications: number;
  activeCanvasCount: number;
  textureReloadCount: number;
  stateTransitionCount: number;
  dragUpdatesPerSecond: number;
}

let textureReloadCount = 0;
let stateTransitionCount = 0;
let dragUpdateSamples: number[] = [];
let lastTickerFps = 0;
let activeCanvasCount = 0;

export function petPerfRecordTextureReload(): void {
  textureReloadCount += 1;
}

export function petPerfRecordStateTransition(): void {
  stateTransitionCount += 1;
}

export function petPerfRecordDragUpdate(nowMs: number = Date.now()): void {
  dragUpdateSamples.push(nowMs);
  // Keep ~1s window
  const cutoff = nowMs - 1000;
  dragUpdateSamples = dragUpdateSamples.filter((t) => t >= cutoff);
}

export function petPerfSetTickerFps(fps: number): void {
  lastTickerFps = Number.isFinite(fps) ? Math.max(0, fps) : 0;
}

export function petPerfSetCanvasCount(n: number): void {
  activeCanvasCount = Math.max(0, n);
}

export function petPerfReset(): void {
  textureReloadCount = 0;
  stateTransitionCount = 0;
  dragUpdateSamples = [];
  lastTickerFps = 0;
  activeCanvasCount = 0;
}

export function getPetPerfSnapshot(livePixiApps = 0): PetPerfSnapshot {
  const now = Date.now();
  const cutoff = now - 1000;
  const recent = dragUpdateSamples.filter((t) => t >= cutoff);
  return {
    pixiTickerFps: lastTickerFps,
    activePixiApplications: livePixiApps,
    activeCanvasCount,
    textureReloadCount,
    stateTransitionCount,
    dragUpdatesPerSecond: recent.length,
  };
}

/** Attach diagnostics to window in DEV only (safe no-op in production builds). */
export function installPetDevPerfGlobal(getLiveApps: () => number): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev) return () => undefined;
  const w = window as unknown as { __VIBESPACE_PET_PERF__?: () => PetPerfSnapshot };
  w.__VIBESPACE_PET_PERF__ = () => getPetPerfSnapshot(getLiveApps());
  return () => {
    delete w.__VIBESPACE_PET_PERF__;
  };
}
