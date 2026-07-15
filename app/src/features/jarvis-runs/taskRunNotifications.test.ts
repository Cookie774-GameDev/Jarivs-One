import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';
import { startJarvisTaskRunNotifications } from './taskRunNotifications';

describe('Jarvis task run notifications', () => {
  beforeEach(() => useJarvisTaskRunStore.getState().clearForTests());

  it('notifies once for completion without leaking task content', async () => {
    const notify = vi.fn(async () => undefined);
    const stop = startJarvisTaskRunNotifications({ notify });
    const run = createJarvisTaskRun({
      goal: 'Process terminal output access_token=never-notify',
      status: 'running',
      steps: [{ id: 'one', action: 'terminal.collect_output', label: 'Collect', recoverable: true }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    useJarvisTaskRunStore.getState().patchRun(run.id, { status: 'completed', userVisibleSummary: 'secret terminal output' });
    useJarvisTaskRunStore.getState().patchRun(run.id, { progress: 100 });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(notify.mock.calls[0])).not.toMatch(/never-notify|secret terminal output/);
    stop();
  });

  it('reports input and failure transitions with generic safe copy', async () => {
    const notify = vi.fn(async () => undefined);
    const stop = startJarvisTaskRunNotifications({ notify });
    const run = createJarvisTaskRun({
      goal: 'Long workflow',
      status: 'running',
      steps: [{ id: 'one', action: 'agent.wait', label: 'Wait', recoverable: true }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    useJarvisTaskRunStore.getState().patchRun(run.id, { status: 'waiting-for-input' });
    useJarvisTaskRunStore.getState().patchRun(run.id, { status: 'failed' });
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    const notifyCalls = notify.mock.calls as unknown as Array<[string, string, string]>;
    expect(notifyCalls.map((call) => call[0])).toEqual([
      'Jarvis task needs input',
      'Jarvis task failed',
    ]);
    stop();
  });
});
