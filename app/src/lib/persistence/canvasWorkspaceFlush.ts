/**
 * Lightweight registry for Canvas persistence providers.
 *
 * This module intentionally has no terminal or UI dependencies so Canvas
 * domain tests and autosave code do not load the full workspace persistence
 * graph merely to register an awaitable flush.
 */
export type CanvasWorkspaceFlushProvider = (reason: string) => Promise<void>;

export const CANVAS_FLUSH_TIMEOUT_MS = 1_200;

export interface CanvasWorkspaceFlushResult {
  readonly completed: number;
  readonly failed: number;
  readonly timedOut: boolean;
}

const providers = new Set<CanvasWorkspaceFlushProvider>();
let activeFlush: Promise<CanvasWorkspaceFlushResult> | null = null;

export function bindCanvasWorkspaceFlush(provider: CanvasWorkspaceFlushProvider): () => void {
  providers.add(provider);
  return () => {
    providers.delete(provider);
  };
}

export function _resetCanvasFlushForTests(): void {
  providers.clear();
  activeFlush = null;
}

export function flushCanvasWorkspaceState(
  reason: string,
  timeoutMs = CANVAS_FLUSH_TIMEOUT_MS,
): Promise<CanvasWorkspaceFlushResult> {
  if (activeFlush) return activeFlush;

  activeFlush = (async () => {
    const callbacks = [...providers];
    let completed = 0;
    let failed = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const work = Promise.all(
      callbacks.map(async (provider) => {
        try {
          await provider(reason);
          completed += 1;
        } catch (error) {
          failed += 1;
          console.warn('[workspace] canvas persistence flush failed:', error);
        }
      }),
    ).then(() => false);
    const timeout = new Promise<true>((resolve) => {
      timeoutId = setTimeout(() => resolve(true), Math.max(0, timeoutMs));
    });
    const timedOut = await Promise.race([work, timeout]);
    if (timeoutId) clearTimeout(timeoutId);
    return { completed, failed, timedOut };
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}
