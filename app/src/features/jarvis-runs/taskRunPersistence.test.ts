import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';
import { startJarvisTaskRunPersistence } from './taskRunPersistence';

describe('account-scoped Jarvis task persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('migrates legacy runs into a cryptographic account key without exposing the account id', async () => {
    const legacy = createJarvisTaskRun({
      id: 'legacy-run',
      goal: 'Resume safe inspection',
      status: 'waiting-for-input',
      steps: [{ id: 'one', action: 'agent.status', label: 'Status', recoverable: true }],
    });
    localStorage.setItem(
      'jarvis-task-runs-v1',
      JSON.stringify({
        state: { runs: { [legacy.id]: legacy } },
        version: 1,
      }),
    );

    const stop = startJarvisTaskRunPersistence({
      getAccountId: () => 'private-account@example.com',
    });

    await vi.waitFor(() =>
      expect(useJarvisTaskRunStore.getState().runs['legacy-run']).toBeTruthy(),
    );
    const keys = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.key(index) ?? '',
    );
    expect(keys).toContainEqual(
      expect.stringMatching(/^jarvis-task-runs-v2:account-[a-f0-9]{64}$/),
    );
    expect(keys.join('\n')).not.toContain('private-account@example.com');
    expect(localStorage.getItem('jarvis-task-runs-v1')).toBeNull();
    stop();
  });

  it('clears visible runs before loading another account and restores only that account', async () => {
    let accountId = 'account-a';
    let accountChanged: () => void = () => undefined;
    const hydrated = vi.fn();
    const stop = startJarvisTaskRunPersistence({
      getAccountId: () => accountId,
      subscribeAccount: (listener) => {
        accountChanged = listener;
        return () => undefined;
      },
      onHydrated: hydrated,
    });
    await vi.waitFor(() => expect(hydrated).toHaveBeenCalledTimes(1));
    const runA = createJarvisTaskRun({
      id: 'run-a',
      goal: 'Account A task',
      steps: [{ id: 'one', action: 'agent.status', label: 'Status', recoverable: true }],
    });
    useJarvisTaskRunStore.getState().addRun(runA);

    accountId = 'account-b';
    accountChanged();
    expect(useJarvisTaskRunStore.getState().runs).toEqual({});
    await vi.waitFor(() => expect(hydrated).toHaveBeenCalledTimes(2));
    expect(useJarvisTaskRunStore.getState().runs).toEqual({});

    const runB = createJarvisTaskRun({
      id: 'run-b',
      goal: 'Account B task',
      steps: [{ id: 'one', action: 'agent.status', label: 'Status', recoverable: true }],
    });
    useJarvisTaskRunStore.getState().addRun(runB);
    accountId = 'account-a';
    accountChanged();
    expect(useJarvisTaskRunStore.getState().runs).toEqual({});
    await vi.waitFor(() => expect(hydrated).toHaveBeenCalledTimes(3));
    expect(Object.keys(useJarvisTaskRunStore.getState().runs)).toEqual(['run-a']);
    stop();
  });

  it('keeps a blank canonical identity quarantined without hashing local-unassigned', async () => {
    const hydrated = vi.fn();
    const stop = startJarvisTaskRunPersistence({
      getAccountId: () => '   ',
      onHydrated: hydrated,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hydrated).not.toHaveBeenCalled();
    expect(useJarvisTaskRunStore.getState()).toMatchObject({
      accountScope: '',
      runs: {},
    });
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? ''),
    ).not.toContainEqual(expect.stringMatching(/^jarvis-task-runs-v2:/));
    await stop();
  });
});
