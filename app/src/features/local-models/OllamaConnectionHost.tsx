import { useEffect } from 'react';
import { bootstrapOllamaConnection } from '@/lib/ai/ollamaBootstrap';

const FOCUS_DEBOUNCE_MS = 8_000;
const RETRY_MS = [0, 2_000, 4_000, 8_000, 12_000, 20_000, 30_000, 45_000];
let lastFocusBootstrapAt = 0;

/**
 * Keeps Ollama connected in the background: launch bootstrap, retry until the
 * daemon responds, and re-check when the window regains focus.
 */
export function OllamaConnectionHost() {
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const schedule = (attempt: number) => {
      if (cancelled || attempt >= RETRY_MS.length) return;
      const delay = RETRY_MS[attempt] ?? 45_000;
      const timer = window.setTimeout(() => {
        void bootstrapOllamaConnection({ force: attempt > 0 })
          .then((result) => {
            if (cancelled || result.ready) return;
            schedule(attempt + 1);
          })
          .catch((err) => {
            if (!cancelled) {
              console.warn('[ollama] bootstrap retry failed:', err);
              schedule(attempt + 1);
            }
          });
      }, delay);
      timers.push(timer);
    };

    schedule(0);

    function onFocus() {
      const now = Date.now();
      if (now - lastFocusBootstrapAt < FOCUS_DEBOUNCE_MS) return;
      lastFocusBootstrapAt = now;
      void bootstrapOllamaConnection({ force: true }).catch((err) => {
        console.warn('[ollama] focus bootstrap failed:', err);
      });
    }

    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
