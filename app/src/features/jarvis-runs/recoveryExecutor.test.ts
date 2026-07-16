import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resumeRecoverableJarvisRuns } from './recoveryExecutor';
import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';

describe('Jarvis task recovery executor', () => {
  beforeEach(() => useJarvisTaskRunStore.getState().clearForTests());

  it('replays only explicitly recoverable typed steps and verifies completion', async () => {
    const run = createJarvisTaskRun({
      goal: 'Read current state',
      status: 'running',
      steps: [
        {
          id: 'read',
          action: 'agent.status',
          label: 'Read agents',
          recoverable: true,
          input: { scope: 'current' },
        },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    const execute = vi.fn(async () => ({ ok: true as const, summary: 'No agents active.' }));

    const resumed = await resumeRecoverableJarvisRuns({ execute });

    expect(resumed).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      'agent.status',
      { scope: 'current' },
      expect.objectContaining({ callId: expect.any(String) }),
    );
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

  it('passes the account lifecycle signal to each recoverable action', async () => {
    const run = createJarvisTaskRun({
      goal: 'Read current state',
      status: 'running',
      steps: [
        {
          id: 'read',
          action: 'agent.status',
          label: 'Read agents',
          recoverable: true,
        },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ ok: true as const, summary: 'Verified.' }));

    await resumeRecoverableJarvisRuns({
      execute,
      signal: controller.signal,
    });

    expect(execute).toHaveBeenCalledWith(
      'agent.status',
      {},
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it('does not start recovery after its account generation is invalidated', async () => {
    const run = createJarvisTaskRun({
      goal: 'Read current state',
      status: 'running',
      steps: [
        {
          id: 'read',
          action: 'agent.status',
          label: 'Read agents',
          recoverable: true,
        },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    const execute = vi.fn(async () => ({ ok: true as const, summary: 'Verified.' }));

    const resumed = await resumeRecoverableJarvisRuns({
      execute,
      isCurrent: () => false,
    });

    expect(resumed).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(useJarvisTaskRunStore.getState().runs[run.id]?.steps[0]?.status).toBe('pending');
  });

  it('cannot mutate a new account after an old recovery action resolves', async () => {
    const oldRun = createJarvisTaskRun({
      id: 'shared-run-id',
      goal: 'Old account recovery',
      status: 'running',
      steps: [
        {
          id: 'read',
          action: 'agent.status',
          label: 'Read old account',
          recoverable: true,
        },
        {
          id: 'second',
          action: 'agent.status',
          label: 'Second old account read',
          recoverable: true,
        },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(oldRun);
    const controller = new AbortController();
    let finishAction: ((result: { ok: true; summary: string }) => void) | undefined;
    const execute = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: true; summary: string }>((resolve) => {
            finishAction = resolve;
          }),
      )
      .mockResolvedValue({ ok: true as const, summary: 'Unexpected second old result.' });

    const recovery = resumeRecoverableJarvisRuns({
      execute,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    controller.abort();
    useJarvisTaskRunStore.getState().clearForTests();
    const newRun = createJarvisTaskRun({
      id: 'shared-run-id',
      goal: 'New account task',
      status: 'running',
      steps: [
        {
          id: 'read',
          action: 'agent.status',
          label: 'Read new account',
          recoverable: true,
        },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(newRun);
    finishAction?.({ ok: true, summary: 'Old account result.' });

    await recovery;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(useJarvisTaskRunStore.getState().runs['shared-run-id']).toMatchObject({
      goal: 'New account task',
      status: 'running',
      steps: [{ status: 'pending' }],
    });
  });
});
