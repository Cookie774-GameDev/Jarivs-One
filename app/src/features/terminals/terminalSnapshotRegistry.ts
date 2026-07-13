export const TERMINAL_FLUSH_TIMEOUT_MS = 1_200;

export type TerminalSnapshotFlush = () => Promise<void>;

export interface TerminalSnapshotFlushResult {
  completed: number;
  failed: number;
  timedOut: boolean;
}

const registeredFlushes = new Map<string, TerminalSnapshotFlush>();
let activeGlobalFlush: Promise<TerminalSnapshotFlushResult> | null = null;

export function registerTerminalSnapshotFlush(
  paneKey: string,
  flush: TerminalSnapshotFlush,
): () => void {
  registeredFlushes.set(paneKey, flush);
  return () => {
    if (registeredFlushes.get(paneKey) === flush) {
      registeredFlushes.delete(paneKey);
    }
  };
}

export function flushRegisteredTerminalSnapshots(
  timeoutMs = TERMINAL_FLUSH_TIMEOUT_MS,
): Promise<TerminalSnapshotFlushResult> {
  if (activeGlobalFlush) return activeGlobalFlush;

  activeGlobalFlush = (async () => {
    const callbacks = [...registeredFlushes.values()];
    let completed = 0;
    let failed = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const work = Promise.all(
      callbacks.map(async (flush) => {
        try {
          await flush();
          completed += 1;
        } catch {
          failed += 1;
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
    activeGlobalFlush = null;
  });

  return activeGlobalFlush;
}

export function _resetTerminalSnapshotRegistryForTests(): void {
  registeredFlushes.clear();
  activeGlobalFlush = null;
}
