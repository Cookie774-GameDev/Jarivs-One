import { beforeEach, describe, expect, it } from 'vitest';

import {
  beginTaskApprovalStep,
  cancelTaskApprovalStep,
  createTaskApprovalCallId,
  finishTaskApprovalStep,
  parseTaskApprovalCallId,
  patchTaskRunResources,
} from './approvalBridge';
import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';

describe('action approval to persistent task bridge', () => {
  beforeEach(() => useJarvisTaskRunStore.getState().clearForTests());

  function seed() {
    const run = createJarvisTaskRun({
      id: 'run-a',
      goal: 'Run approved work',
      status: 'waiting-for-approval',
      steps: [
        { id: 'step-1', action: 'chat.rename', label: 'Rename', recoverable: false },
        { id: 'step-2', action: 'file.open', label: 'Open', recoverable: true },
      ],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    return run;
  }

  it('parses scoped call ids and completes only after every step verifies', () => {
    seed();
    const first = createTaskApprovalCallId('run-a', 'step-1');
    const second = createTaskApprovalCallId('run-a', 'step-2');
    expect(parseTaskApprovalCallId(first)).toEqual({ runId: 'run-a', stepId: 'step-1' });

    expect(beginTaskApprovalStep(first)).toBe(true);
    finishTaskApprovalStep(first, { ok: true, summary: 'Renamed.' });
    expect(useJarvisTaskRunStore.getState().runs['run-a']?.status).toBe('running');
    beginTaskApprovalStep(second);
    finishTaskApprovalStep(second, { ok: true, summary: 'Opened.' });
    expect(useJarvisTaskRunStore.getState().runs['run-a']).toMatchObject({
      status: 'completed',
      progress: 100,
      userVisibleSummary: 'Renamed. Opened.',
    });
  });

  it('propagates failure and cancellation without replaying work', () => {
    seed();
    const first = createTaskApprovalCallId('run-a', 'step-1');
    finishTaskApprovalStep(first, { ok: false, error: 'Rename failed.' });
    expect(useJarvisTaskRunStore.getState().runs['run-a']?.status).toBe('failed');

    useJarvisTaskRunStore.getState().clearForTests();
    seed();
    cancelTaskApprovalStep(first);
    expect(beginTaskApprovalStep(first)).toBe(false);
    finishTaskApprovalStep(first, { ok: false, error: 'Agent batch was cancelled.' });
    expect(useJarvisTaskRunStore.getState().runs['run-a']?.status).toBe('cancelled');
  });

  it('links live agent and terminal identifiers to the owning task run', () => {
    const run = createJarvisTaskRun({
      id: 'run-resources',
      chatId: 'chat-1',
      goal: 'Track resources',
      status: 'running',
      steps: [{ id: 'step-1', action: 'agent.run_many', label: 'Run agents', recoverable: false }],
    });
    useJarvisTaskRunStore.getState().addRun(run);

    patchTaskRunResources(createTaskApprovalCallId(run.id, 'step-1'), {
      activeAgents: ['agent-a', 'agent-b'],
      activeTerminals: ['terminal-a'],
    });

    expect(useJarvisTaskRunStore.getState().runs[run.id]).toMatchObject({
      activeAgents: ['agent-a', 'agent-b'],
      activeTerminals: ['terminal-a'],
    });
  });
});
