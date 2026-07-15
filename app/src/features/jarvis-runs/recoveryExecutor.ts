import { runAction as defaultRunAction } from '@/lib/actions';
import type { ActionResult, ActionRunContext } from '@/lib/actions/types';

import { useJarvisTaskRunStore } from './taskRunStore';

interface RecoveryExecutorBindings {
  execute?: (
    action: string,
    input: Record<string, unknown>,
    context: ActionRunContext,
  ) => Promise<ActionResult>;
}

/** Resume only steps that were explicitly marked recoverable/idempotent. */
export async function resumeRecoverableJarvisRuns(
  bindings: RecoveryExecutorBindings = {},
): Promise<number> {
  const execute = bindings.execute ?? ((action, input, context) =>
    defaultRunAction(action, input, context, { emitToast: false }));
  const candidates = Object.values(useJarvisTaskRunStore.getState().runs).filter((run) => {
    if (run.status !== 'running') return false;
    const unfinished = run.steps.filter((step) => !['completed', 'cancelled'].includes(step.status));
    return unfinished.length > 0 && unfinished.every((step) => step.recoverable);
  });

  for (const run of candidates) {
    for (const step of run.steps.filter((item) => !['completed', 'cancelled'].includes(item.status))) {
      const current = useJarvisTaskRunStore.getState().runs[run.id];
      if (!current || current.status === 'cancelled') break;
      useJarvisTaskRunStore.getState().updateStep(run.id, step.id, {
        status: 'running',
        startedAt: step.startedAt ?? new Date().toISOString(),
      });
      const result = await execute(step.action, step.input, {
        source: 'ai',
        chatId: run.chatId,
        callId: `recovery:${run.id}:${step.id}`,
      });
      const after = useJarvisTaskRunStore.getState().runs[run.id];
      if (!after || after.status === 'cancelled') break;
      if (!result.ok) {
        useJarvisTaskRunStore.getState().updateStep(run.id, step.id, {
          status: 'failed',
          error: result.error,
          completedAt: new Date().toISOString(),
        });
        useJarvisTaskRunStore.getState().patchRun(run.id, {
          status: /\bblocked\b/i.test(result.error) ? 'blocked' : 'failed',
          userVisibleSummary: result.error,
        });
        break;
      }
      const summary = result.summary?.trim();
      if (!summary) {
        useJarvisTaskRunStore.getState().patchRun(run.id, {
          status: 'failed',
          userVisibleSummary: `${step.action} returned no verification summary.`,
        });
        break;
      }
      useJarvisTaskRunStore.getState().updateStep(run.id, step.id, {
        status: 'completed',
        summary,
        completedAt: new Date().toISOString(),
      });
    }
    const latest = useJarvisTaskRunStore.getState().runs[run.id];
    if (latest?.status === 'running' && latest.steps.every((step) => step.status === 'completed')) {
      useJarvisTaskRunStore.getState().patchRun(run.id, {
        status: 'completed',
        progress: 100,
        userVisibleSummary: latest.steps.map((step) => step.summary).filter(Boolean).join(' '),
      });
    }
  }
  return candidates.length;
}
