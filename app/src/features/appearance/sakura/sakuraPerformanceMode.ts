export type SakuraFrameProbeResult = 'pending' | 'met' | 'missed';
export type SakuraRenderingMode = 'enhanced' | 'static';

export interface SakuraRenderingInputs {
  forcedColors: boolean;
  frameProbe: SakuraFrameProbeResult;
  reducedMotion: boolean;
  supportsVisualEffects: boolean;
}

export interface SakuraFrameScheduler {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

export function resolveSakuraRenderingMode({
  forcedColors,
  frameProbe,
  reducedMotion,
  supportsVisualEffects,
}: SakuraRenderingInputs): SakuraRenderingMode {
  return !forcedColors && !reducedMotion && supportsVisualEffects && frameProbe === 'met'
    ? 'enhanced'
    : 'static';
}

/**
 * Samples one startup interval and then stops. This is deliberately not a
 * monitor: the scene either earns enhanced mode once or keeps its safe static
 * fallback for the lifetime of this mount.
 */
export function startSakuraFrameProbe(
  scheduler: SakuraFrameScheduler,
  onResult: (result: Exclude<SakuraFrameProbeResult, 'pending'>) => void,
  budgetMs = 34,
): () => void {
  let disposed = false;
  let frameId: number | null = null;
  let firstTimestamp: number | null = null;

  const sample: FrameRequestCallback = (timestamp) => {
    if (disposed) return;
    if (firstTimestamp === null) {
      firstTimestamp = timestamp;
      frameId = scheduler.requestFrame(sample);
      return;
    }
    frameId = null;
    onResult(timestamp - firstTimestamp <= budgetMs ? 'met' : 'missed');
  };

  frameId = scheduler.requestFrame(sample);
  return () => {
    disposed = true;
    if (frameId !== null) scheduler.cancelFrame(frameId);
    frameId = null;
  };
}

export function browserSupportsSakuraVisualEffects(): boolean {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return false;
  }
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  return CSS.supports('transform', 'translate3d(0, 0, 0)');
}
