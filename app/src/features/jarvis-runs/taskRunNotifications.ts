import { notifyDone } from '@/lib/notifications';
import type { JarvisEvent, JarvisRunStatus } from '@/lib/jarvis/contracts/execution';
import { notify as nativeNotify } from '@/lib/tauri';

interface TaskRunNotificationBindings {
  subscribe: (listener: (event: JarvisEvent) => void) => () => void;
  notify?: (title: string, body: string, status: JarvisRunStatus) => Promise<unknown> | unknown;
  onError?: (error: unknown) => void;
}

const COPY: Partial<Record<JarvisRunStatus, readonly [string, string]>> = {
  awaiting_approval: ['Jarvis task needs approval', 'Open VibeSpace to review the pending action.'],
  partial: ['Jarvis task needs input', 'Open VibeSpace to provide the requested input.'],
  completed: ['Jarvis task completed', 'Open VibeSpace to view the verified result.'],
  failed: ['Jarvis task failed', 'Open VibeSpace to review the failure and next step.'],
  timed_out: ['Jarvis task timed out', 'Open VibeSpace to review the timeout and next step.'],
  cancelled: ['Jarvis task cancelled', 'Open VibeSpace to view the verified cancellation.'],
};

async function defaultNotify(title: string, body: string, status: JarvisRunStatus): Promise<void> {
  if (status === 'completed') {
    await notifyDone('tasks', title, body, { allowFallbackToast: true });
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('jarvis:task-notification', { detail: { title, status } }),
    );
  }
  await nativeNotify(title, body, { fallbackToast: true });
}

export function startJarvisTaskRunNotifications(bindings: TaskRunNotificationBindings): () => void {
  const notify = bindings.notify ?? defaultNotify;
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  return bindings.subscribe((event) => {
    if (event.type !== 'run_state') return;
    const status = event.status as JarvisRunStatus | undefined;
    if (!status) return;
    const copy = COPY[status];
    if (!copy) return;
    const key = `${event.runId}:${event.seq}`;
    if (seen.has(key)) return;
    seen.add(key);
    seenOrder.push(key);
    if (seenOrder.length > 5_000) {
      const expired = seenOrder.shift();
      if (expired) seen.delete(expired);
    }
    void Promise.resolve(notify(copy[0], copy[1], status)).catch((error) => {
      if (bindings.onError) bindings.onError(error);
      else console.warn('[jarvis-task] notification unavailable', error);
    });
  });
}
