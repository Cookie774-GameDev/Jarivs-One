import { describe, expect, it, vi } from 'vitest';
import type { JarvisCommandCenterDataPort, JarvisLiveEvidenceSnapshot, JarvisRun } from './types';
import { createJarvisCommandCenterStore } from './commandCenterStore';

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 90,
    },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function liveSnapshot(
  overrides: Partial<JarvisLiveEvidenceSnapshot> = {},
): JarvisLiveEvidenceSnapshot {
  return {
    schemaVersion: 1,
    accountId: 'account-1',
    runId: 'run-1',
    capturedAt: 150,
    nodes: [
      {
        kind: 'capability',
        id: 'capability:registration-1',
        accountId: 'account-1',
        runId: 'run-1',
        state: 'ready',
        operations: ['execute'],
        evidenceRef: 'jlive_proof-1',
        verifiedAt: 125,
        category: 'tool',
        capabilityId: 'tool-1',
      },
    ],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(snapshot: JarvisLiveEvidenceSnapshot | undefined = liveSnapshot()) {
  let subscriptionListener: (() => void) | undefined;
  const subscriptionDispose = vi.fn();
  const dataPort: JarvisCommandCenterDataPort = {
    getRunsForChat: vi.fn(async () => [run()]),
    getEventsForRun: vi.fn(async () => []),
    getArtifactsForRun: vi.fn(async () => []),
    getLiveEvidenceSnapshot: vi.fn(async () => snapshot),
    subscribe: vi.fn((_accountId, _chatId, listener) => {
      subscriptionListener = listener;
      return subscriptionDispose;
    }),
  };
  const store = createJarvisCommandCenterStore({
    accountId: 'account-1',
    chatId: 'chat-1',
    dataPort,
  });
  return { store, dataPort, subscriptionDispose, emit: () => subscriptionListener?.() };
}

describe('createJarvisCommandCenterStore', () => {
  it('subscribes instead of polling and exposes no lifecycle mutation API', async () => {
    vi.useFakeTimers();
    const { store, dataPort } = setup();
    await store.refresh();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(dataPort.subscribe).toHaveBeenCalledTimes(1);
    expect(dataPort.getRunsForChat).toHaveBeenCalledTimes(2);
    expect(store).not.toHaveProperty('cancelRun');
    expect(store).not.toHaveProperty('retryRun');
    expect(store).not.toHaveProperty('appendEvent');
    vi.useRealTimers();
  });

  it('uses exact default read limits and does not read live evidence while collapsed or Outputs is active', async () => {
    const { store, dataPort } = setup();
    await store.refresh();
    store.setExpansion('expanded');
    await store.refresh();

    expect(dataPort.getRunsForChat).toHaveBeenLastCalledWith({
      accountId: 'account-1',
      chatId: 'chat-1',
      limit: 100,
    });
    expect(dataPort.getEventsForRun).toHaveBeenLastCalledWith({
      accountId: 'account-1',
      runId: 'run-1',
      limit: 500,
    });
    expect(dataPort.getArtifactsForRun).toHaveBeenLastCalledWith({
      accountId: 'account-1',
      runId: 'run-1',
      limit: 500,
    });
    expect(dataPort.getLiveEvidenceSnapshot).not.toHaveBeenCalled();
  });

  it('retains the canonical run when dependent event or artifact projection reads fail', async () => {
    const { store, dataPort } = setup();
    vi.mocked(dataPort.getArtifactsForRun).mockRejectedValueOnce(new Error('projection failed'));

    await store.refresh();

    expect(store.getSnapshot().currentRun).toMatchObject({ id: 'run-1', status: 'running' });
    expect(store.getSnapshot().error).toBe('Command Center data is unavailable.');
  });

  it('performs one lazy exact-account/run read on expanded Live Systems and reuses it for the same run', async () => {
    const { store, dataPort } = setup();
    await store.refresh();
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));

    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledWith({
      accountId: 'account-1',
      runId: 'run-1',
    });
    store.setExpansion('collapsed');
    store.setExpansion('expanded');
    await Promise.resolve();
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['snapshot account', liveSnapshot({ accountId: 'account-2' })],
    ['snapshot run', liveSnapshot({ runId: 'run-2' })],
    ['capture before run', liveSnapshot({ capturedAt: 99 })],
    [
      'node account',
      liveSnapshot({ nodes: [{ ...liveSnapshot().nodes[0]!, accountId: 'account-2' }] }),
    ],
    ['node time', liveSnapshot({ nodes: [{ ...liveSnapshot().nodes[0]!, verifiedAt: 151 }] })],
    [
      'proof',
      liveSnapshot({ nodes: [{ ...liveSnapshot().nodes[0]!, evidenceRef: 'free-form' } as never] }),
    ],
    [
      'category',
      liveSnapshot({ nodes: [{ ...liveSnapshot().nodes[0]!, category: 'planned' } as never] }),
    ],
    [
      'stable id',
      liveSnapshot({ nodes: [{ ...liveSnapshot().nodes[0]!, id: 'capability:' } as never] }),
    ],
  ])('rejects the entire invalid live result for %s', async (_label, invalid) => {
    const { store } = setup(invalid);
    await store.refresh();
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');

    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('unavailable'));
    expect(store.getSnapshot().liveSystems).toEqual({
      state: 'unavailable',
      reason: 'Live evidence could not be verified.',
    });
  });

  it('suppresses stale live responses after collapse, tab, and run changes', async () => {
    const pending = deferred<JarvisLiveEvidenceSnapshot | undefined>();
    const { store, dataPort, emit } = setup();
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockReturnValueOnce(pending.promise);
    await store.refresh();
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('loading'));

    store.setActiveTab('outputs');
    pending.resolve(liveSnapshot());
    await pending.promise;
    await Promise.resolve();
    expect(store.getSnapshot().liveSystems.state).not.toBe('ready');

    vi.mocked(dataPort.getRunsForChat).mockResolvedValue([run({ id: 'run-2' })]);
    emit();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-2'));
    expect(store.getSnapshot().liveSystems).toEqual({ state: 'not_loaded' });
  });

  it('isolates a stale cross-account same-run response and cleans up', async () => {
    const pending = deferred<JarvisLiveEvidenceSnapshot | undefined>();
    const { store, dataPort, subscriptionDispose } = setup();
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockReturnValueOnce(pending.promise);
    await store.refresh();
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    store.dispose();
    pending.resolve(liveSnapshot({ accountId: 'account-2', runId: 'run-1' }));
    await pending.promise;
    await Promise.resolve();

    expect(subscriptionDispose).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().liveSystems.state).not.toBe('ready');
  });
});
