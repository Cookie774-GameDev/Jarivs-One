import { notifyDone } from '@/lib/notifications';
import { notify as nativeNotify } from '@/lib/tauri';

import { useJarvisTaskRunStore, type JarvisTaskRunStatus } from './taskRunStore';

interface TaskRunNotificationBindings {
  notify?: (title: string, body: string, status: JarvisTaskRunStatus) => Promise<unknown> | unknown;
  onError?: (error: unknown) => void;
}

const COPY: Partial<Record<JarvisTaskRunStatus, [string, string]>> = {
  completed: ['Jarvis task completed', 'Open VibeSpace to view the verified result.'],
  failed: ['Jarvis task failed', 'Open VibeSpace to review the failure and next step.'],
  'waiting-for-input': ['Jarvis task needs input', 'Open VibeSpace to provide the requested input.'],
  'waiting-for-approval': ['Jarvis task needs approval', 'Open VibeSpace to review the pending action.'],
  blocked: ['Jarvis task blocked', 'Open VibeSpace to review what is blocking progress.'],
};

async function defaultNotify(title: string, body: string, status: JarvisTaskRunStatus): Promise<void> {
  if (status === 'completed') {
    await notifyDone('tasks', title, body, { allowFallbackToast: true });
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jarvis:task-notification', { detail: { title, status } }));
  }
  await nativeNotify(title, body, { fallbackToast: true });
}

export function startJarvisTaskRunNotifications(
  bindings: TaskRunNotificationBindings = {},
): () => void {
  const notify = bindings.notify ?? defaultNotify;
  return useJarvisTaskRunStore.subscribe((state, previous) => {
    for (const run of Object.values(state.runs)) {
      const oldStatus = previous.runs[run.id]?.status;
      if (oldStatus === run.status) continue;
      const copy = COPY[run.status];
      if (!copy) continue;
      void Promise.resolve(notify(copy[0], copy[1], run.status)).catch((error) => {
        if (bindings.onError) bindings.onError(error);
        else console.warn('[jarvis-task] notification unavailable', error);
      });
    }
  });
}
