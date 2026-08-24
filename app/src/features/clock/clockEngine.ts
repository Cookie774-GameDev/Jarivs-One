import { toast } from '@/components/ui/toast';
import { notify } from '@/lib/tauri';
import { playClockSound } from './clockSound';
import { type ClockEntry, useClockStore } from './clockStore';

export interface JarvisClockFiredEventDetail {
  entry: ClockEntry;
}

declare global {
  interface WindowEventMap {
    'jarvis:clock-fired': CustomEvent<JarvisClockFiredEventDetail>;
  }
}

let runningInstanceId = 0;
let backgroundClockFlight: Promise<void> | null = null;

export function startClockEngine(
  options: {
    intervalMs?: number;
    now?: () => number;
    runDue?: (now: number) => Promise<number>;
  } = {},
): () => void {
  const intervalMs = Math.max(250, options.intervalMs ?? 1000);
  const now = options.now ?? Date.now;
  const runDue = options.runDue ?? fireDueClockEntries;
  const myInstance = ++runningInstanceId;
  let stopped = false;

  const tick = () => {
    if (stopped || myInstance !== runningInstanceId || backgroundClockFlight) return;
    const flight = runDue(now())
      .then(() => undefined)
      .catch((error) => {
        console.warn('[ClockEngine] due-alert pass failed', error);
      })
      .finally(() => {
        if (backgroundClockFlight === flight) backgroundClockFlight = null;
      });
    backgroundClockFlight = flight;
  };

  tick();
  const timer = window.setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export async function fireDueClockEntries(now = Date.now()): Promise<number> {
  const due = useClockStore
    .getState()
    .scheduled()
    .filter((entry) => entry.dueAt <= now);

  let fired = 0;
  for (const entry of due) {
    const marked = useClockStore.getState().markFired(entry.id, now);
    if (!marked) continue;
    fired += 1;
    await deliverClockAlert(marked);
  }
  return fired;
}

export async function deliverClockAlert(entry: ClockEntry): Promise<void> {
  const title = entry.kind === 'alarm' ? 'Alarm' : 'Timer done';
  const body = entry.label;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jarvis:clock-fired', { detail: { entry } }));
  }

  toast.warning(title, body, 15_000);
  playClockSound(entry.sound);
  await notify(title, body, { silent: true, fallbackToast: false });
}
