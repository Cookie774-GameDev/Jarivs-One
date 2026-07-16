import type { ActionResult } from '@/lib/actions/types';

import { useJarvisTaskRunStore } from './taskRunStore';

const PREFIX = 'jarvisrun:';

export function createTaskApprovalCallId(runId: string, stepId: string): string {
  return `${PREFIX}${encodeURIComponent(runId)}:${encodeURIComponent(stepId)}`;
}

export function parseTaskApprovalCallId(callId: string): { runId: string; stepId: string } | null {
  if (!callId.startsWith(PREFIX)) return null;
  const parts = callId.slice(PREFIX.length).split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    return { runId: decodeURIComponent(parts[0]), stepId: decodeURIComponent(parts[1]) };
  } catch {
    return null;
  }
}

export function patchTaskRunResources(
  callId: string | undefined,
  patch: { activeAgents?: string[]; activeTerminals?: string[] },
): void {
  if (!callId) return;
  const parsed = parseTaskApprovalCallId(callId);
  if (!parsed) return;
  const store = useJarvisTaskRunStore.getState();
  const run = store.runs[parsed.runId];
  if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) return;
  store.patchRun(parsed.runId, patch);
}

export function beginTaskApprovalStep(callId: string): boolean {
  const parsed = parseTaskApprovalCallId(callId);
  if (!parsed) return true;
  const store = useJarvisTaskRunStore.getState();
  const run = store.runs[parsed.runId];
  const step = run?.steps.find((candidate) => candidate.id === parsed.stepId);
  if (!run || !step || ['completed', 'failed', 'cancelled'].includes(run.status)
    || ['completed', 'failed', 'cancelled'].includes(step.status)) return false;
  store.patchRun(parsed.runId, { status: 'running', userVisibleSummary: 'Approved action is running.' });
  store.updateStep(parsed.runId, parsed.stepId, {
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  return true;
}

export function finishTaskApprovalStep(callId: string, result: ActionResult): void {
  const parsed = parseTaskApprovalCallId(callId);
  if (!parsed) return;
  const store = useJarvisTaskRunStore.getState();
  if (!store.runs[parsed.runId] || store.runs[parsed.runId]?.status === 'cancelled') return;
  const now = new Date().toISOString();
  if (!result.ok) {
    store.updateStep(parsed.runId, parsed.stepId, {
      status: 'failed',
      error: result.error,
      completedAt: now,
    });
    store.patchRun(parsed.runId, { status: /\bblocked\b/i.test(result.error) ? 'blocked' : 'failed', userVisibleSummary: result.error });
    return;
  }
  const summary = result.summary?.trim() || 'Action completed and returned no summary.';
  store.updateStep(parsed.runId, parsed.stepId, {
    status: 'completed',
    summary,
    completedAt: now,
  });
  const latest = useJarvisTaskRunStore.getState().runs[parsed.runId];
  if (!latest) return;
  if (latest.steps.every((step) => step.status === 'completed')) {
    store.patchRun(parsed.runId, {
      status: 'completed',
      progress: 100,
      userVisibleSummary: latest.steps.map((step) => step.summary).filter(Boolean).join(' '),
    });
  } else {
    store.patchRun(parsed.runId, { status: 'running' });
  }
}

export function cancelTaskApprovalStep(callId: string): void {
  const parsed = parseTaskApprovalCallId(callId);
  if (!parsed) return;
  useJarvisTaskRunStore.getState().cancelRun(parsed.runId);
}
