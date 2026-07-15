import { beforeEach, describe, expect, it } from 'vitest';
import {
  createJarvisTaskRun,
  recoverJarvisTaskRuns,
  useJarvisTaskRunStore,
} from './taskRunStore';

describe('Jarvis persistent task runs', () => {
  beforeEach(() => {
    localStorage.clear();
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('tracks step progress and active resources without flooding chat', () => {
    const run = createJarvisTaskRun({
      chatId: 'chat-task',
      goal: 'Inspect chat and terminal systems',
      steps: [
        { id: 'chat', action: 'agent.run', label: 'Inspect chat', recoverable: true },
        { id: 'terminal', action: 'agent.run', label: 'Inspect terminals', recoverable: true },
      ],
    });
    const store = useJarvisTaskRunStore.getState();
    expect(run.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(run.completedAt).toBeUndefined();
    store.addRun(run);
    store.updateStep(run.id, 'chat', { status: 'completed', summary: 'Chat inspected.' });
    store.patchRun(run.id, { activeAgents: ['agent-terminal'], activeTerminals: ['pane-1'] });

    expect(useJarvisTaskRunStore.getState().runs[run.id]).toMatchObject({
      chatId: 'chat-task',
      progress: 50,
      activeAgents: ['agent-terminal'],
      activeTerminals: ['pane-1'],
      userVisibleSummary: '1/2 steps completed',
    });
  });

  it('records a completion timestamp only for terminal run states', () => {
    const run = createJarvisTaskRun({
      goal: 'Finish safely',
      status: 'running',
      steps: [{ id: 'one', action: 'status.read', label: 'Read', recoverable: true }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    useJarvisTaskRunStore.getState().patchRun(run.id, { status: 'completed' });

    expect(useJarvisTaskRunStore.getState().runs[run.id]?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('recovers only idempotent recoverable work after an app restart', () => {
    const recoverable = createJarvisTaskRun({
      goal: 'Recover me',
      status: 'running',
      steps: [{ id: 'one', action: 'status.read', label: 'Read', recoverable: true }],
    });
    const unsafe = createJarvisTaskRun({
      goal: 'Do not replay me',
      status: 'running',
      steps: [{ id: 'one', action: 'notification.send', label: 'Notify', recoverable: false }],
    });

    const recovered = recoverJarvisTaskRuns([recoverable, unsafe]);

    expect(recovered[0]?.status).toBe('running');
    expect(recovered[0]?.steps[0]?.input).toEqual({});
    expect(recovered[1]).toMatchObject({
      status: 'waiting-for-input',
      userVisibleSummary: 'Ready to resume with your confirmation.',
    });
  });

  it('never retains credential-shaped action input in persistent task state', () => {
    const run = createJarvisTaskRun({
      goal: 'Invoke with password=goal-secret and token is natural-secret safely',
      status: 'running',
      steps: [{
        id: 'invoke',
        action: 'mcp.invoke',
        label: 'Invoke with token=label-secret',
        recoverable: true,
        input: {
          apiKey: 'sk-secret-value-that-must-not-persist',
          inputJson: JSON.stringify({ authorization: 'Bearer private-token', query: 'safe' }),
          nested: { password: 'do-not-store', query: 'keep-me' },
        },
      }],
    });

    useJarvisTaskRunStore.getState().addRun(run);
    useJarvisTaskRunStore.getState().updateStep(run.id, 'invoke', {
      summary: 'Provider returned apiKey=summary-secret',
    });
    useJarvisTaskRunStore.getState().patchRun(run.id, {
      userVisibleSummary: 'Failed with Bearer result-secret',
    });

    const storedRun = useJarvisTaskRunStore.getState().runs[run.id];
    const input = storedRun?.steps[0]?.input;
    const serialized = JSON.stringify(storedRun);
    expect(serialized).not.toContain('sk-secret-value-that-must-not-persist');
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('do-not-store');
    expect(serialized).not.toContain('goal-secret');
    expect(serialized).not.toContain('natural-secret');
    expect(serialized).not.toContain('label-secret');
    expect(serialized).not.toContain('summary-secret');
    expect(serialized).not.toContain('result-secret');
    expect(input).toMatchObject({
      apiKey: '[redacted]',
      nested: { password: '[redacted]', query: 'keep-me' },
    });
  });
});
