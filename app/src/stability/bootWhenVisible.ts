const DEFAULT_VISIBLE_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_MS = 1_500;

/** Wait until this document is visible, or until timeout so boot cannot hang. */
export function waitForDocumentVisible(options?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_VISIBLE_TIMEOUT_MS;
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState === 'visible') finish();
    };
    document.addEventListener('visibilitychange', onChange);
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/** Yield until the renderer is idle so first paint is not competing with background loops. */
export function waitForIdle(timeoutMs = DEFAULT_IDLE_TIMEOUT_MS): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const ric = (window as IdleWindow).requestIdleCallback;
  if (typeof ric === 'function') {
    return new Promise((resolve) => {
      ric(() => resolve(), { timeout: timeoutMs });
    });
  }
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.min(timeoutMs, 32));
  });
}
