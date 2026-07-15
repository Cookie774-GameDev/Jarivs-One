import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resumeRecoverableJarvisRuns } from './recoveryExecutor';
import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';

describe('Jarvis task recovery executor', () => {
  beforeEach(() => useJarvisTaskRunStore.getState().clearForTests());

  it('replays only explicitly recoverable typed steps and verifies completion', async () => {
    const run = createJarvisTaskRun({
      goal: 'Read current state',
      status: 'running',
      steps: [{
        id: 'read',
        action: 'agent.status',
        label: 'Read agents',
        recoverable: true,
        input: { scope: 'current' },
      }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    const execute = vi.fn(async () => ({ ok: true as const, summary: 'No agents active.' }));

    const resumed = await resumeRecoverableJarvisRuns({ execute });

    expect(resumed).toBe(1);
    expect(execute).toHaveBeenCalledWith('agent.status', { scope: 'current' }, expect.objectContaining({ callId: expect.any(String) }));
    expect(useJarvisTaskRunStore.getState().runs[run.id]).toMatchObject({
      status: 'completed',
      userVisibleSummary: 'No agents active.',
    });
  });

  it('does not replay non-recoverable work', async () => {
    const run = createJarvisTaskRun({
      goal: 'External message',
      status: 'waiting-for-input',
      steps: [{ id: 'send', action: 'notification.send', label: 'Notify', recoverable: false }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    const execute = vi.fn();
    expect(await resumeRecoverableJarvisRuns({ execute })).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });
});
