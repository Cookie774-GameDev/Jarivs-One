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

function liveSnapshotForRun(runId: string): JarvisLiveEvidenceSnapshot {
  const snapshot = liveSnapshot({ runId });
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({ ...node, runId })),
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
  let journalListener: (() => void) | undefined;
  let liveListener: (() => void) | undefined;
  const journalDispose = vi.fn();
  const liveDispose = vi.fn();
  const dataPort: JarvisCommandCenterDataPort = {
    getRunsForChat: vi.fn(async () => [run()]),
    getEventsForRun: vi.fn(async () => []),
    getArtifactsForRun: vi.fn(async () => []),
    getLiveEvidenceSnapshot: vi.fn(async () => snapshot),
    subscribe: vi.fn((_accountId, _chatId, listener) => {
      journalListener = listener;
      return journalDispose;
    }),
    subscribeLiveEvidence: vi.fn((_scope, listener) => {
      liveListener = listener;
      return liveDispose;
    }),
  };
  const store = createJarvisCommandCenterStore({
    accountId: 'account-1',
    chatId: 'chat-1',
    dataPort,
  });
  return {
    store,
    dataPort,
    journalDispose,
    liveDispose,
    emitJournal: () => journalListener?.(),
    emitLive: () => liveListener?.(),
  };
}

describe('createJarvisCommandCenterStore', () => {
  it('keeps collapsed journal updates lightweight, subscribes instead of polling, and exposes no mutation API', async () => {
    vi.useFakeTimers();
    const { store, dataPort, emitJournal } = setup();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    expect(dataPort.getRunsForChat).toHaveBeenCalledTimes(1);
    expect(dataPort.getEventsForRun).not.toHaveBeenCalled();
    expect(dataPort.getArtifactsForRun).not.toHaveBeenCalled();
    expect(dataPort.subscribeLiveEvidence).not.toHaveBeenCalled();

    emitJournal();
    await vi.waitFor(() => expect(dataPort.getRunsForChat).toHaveBeenCalledTimes(2));
    expect(dataPort.getEventsForRun).not.toHaveBeenCalled();
    expect(dataPort.getArtifactsForRun).not.toHaveBeenCalled();
    expect(dataPort.subscribeLiveEvidence).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    expect(dataPort.getEventsForRun).not.toHaveBeenCalled();
    expect(dataPort.getArtifactsForRun).not.toHaveBeenCalled();

    store.setExpansion('expanded');
    await vi.waitFor(() => expect(dataPort.getArtifactsForRun).toHaveBeenCalledTimes(1));

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
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    vi.mocked(dataPort.getArtifactsForRun).mockRejectedValueOnce(new Error('projection failed'));

    store.setExpansion('expanded');
    await vi.waitFor(() =>
      expect(store.getSnapshot().error).toBe('Command Center data is unavailable.'),
    );

    expect(store.getSnapshot().currentRun).toMatchObject({ id: 'run-1', status: 'running' });
    expect(store.getSnapshot().error).toBe('Command Center data is unavailable.');
  });

  it('performs one lazy exact-account/run read on expanded Live Systems and reuses it for the same run', async () => {
    const { store, dataPort, liveDispose } = setup();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));

    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledWith({
      accountId: 'account-1',
      runId: 'run-1',
    });
    expect(dataPort.subscribeLiveEvidence).toHaveBeenCalledWith(
      { accountId: 'account-1', runId: 'run-1' },
      expect.any(Function),
    );
    store.setExpansion('collapsed');
    expect(liveDispose).toHaveBeenCalledTimes(1);
    store.setExpansion('expanded');
    await Promise.resolve();
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
    expect(dataPort.subscribeLiveEvidence).toHaveBeenCalledTimes(2);
    store.setActiveTab('outputs');
    expect(liveDispose).toHaveBeenCalledTimes(2);
  });

  it('refreshes only the live snapshot for an exact-run live notification', async () => {
    const { store, dataPort, emitLive } = setup();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));

    vi.mocked(dataPort.getRunsForChat).mockClear();
    vi.mocked(dataPort.getEventsForRun).mockClear();
    vi.mocked(dataPort.getArtifactsForRun).mockClear();
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockClear();
    emitLive();
    await vi.waitFor(() => expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1));

    expect(dataPort.getRunsForChat).not.toHaveBeenCalled();
    expect(dataPort.getEventsForRun).not.toHaveBeenCalled();
    expect(dataPort.getArtifactsForRun).not.toHaveBeenCalled();
  });

  it('coalesces a live notification received during an in-flight snapshot into one follow-up read', async () => {
    const pending = deferred<JarvisLiveEvidenceSnapshot | undefined>();
    const { store, dataPort, emitLive } = setup();
    vi.mocked(dataPort.getLiveEvidenceSnapshot)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(liveSnapshot());
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1));

    emitLive();
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
    pending.resolve(liveSnapshot());

    await vi.waitFor(() => expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(2));
    expect(dataPort.getRunsForChat).toHaveBeenCalledTimes(2);
    expect(dataPort.getEventsForRun).toHaveBeenCalledTimes(1);
    expect(dataPort.getArtifactsForRun).toHaveBeenCalledTimes(1);
  });

  it('ignores a retained live callback after the store is disposed', async () => {
    const { store, dataPort, emitLive, liveDispose } = setup();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockClear();

    store.dispose();
    emitLive();
    await Promise.resolve();

    expect(liveDispose).toHaveBeenCalledTimes(1);
    expect(dataPort.getLiveEvidenceSnapshot).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
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
    const { store, dataPort, emitJournal, liveDispose } = setup();
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockReturnValueOnce(pending.promise);
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('loading'));

    store.setActiveTab('outputs');
    pending.resolve(liveSnapshot());
    await pending.promise;
    await Promise.resolve();
    expect(store.getSnapshot().liveSystems.state).not.toBe('ready');

    store.setActiveTab('live_systems');
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockResolvedValueOnce(liveSnapshotForRun('run-2'));
    vi.mocked(dataPort.getRunsForChat).mockResolvedValue([run({ id: 'run-2' })]);
    emitJournal();
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-2'));
    await vi.waitFor(() => expect(store.getSnapshot().liveSystems.state).toBe('ready'));
    expect(liveDispose).toHaveBeenCalledTimes(2);
    expect(dataPort.subscribeLiveEvidence).toHaveBeenLastCalledWith(
      { accountId: 'account-1', runId: 'run-2' },
      expect.any(Function),
    );
  });

  it('isolates a stale cross-account same-run response and cleans up', async () => {
    const pending = deferred<JarvisLiveEvidenceSnapshot | undefined>();
    const { store, dataPort, journalDispose, liveDispose } = setup();
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockReturnValueOnce(pending.promise);
    await vi.waitFor(() => expect(store.getSnapshot().currentRun?.id).toBe('run-1'));
    store.setExpansion('expanded');
    store.setActiveTab('live_systems');
    store.dispose();
    pending.resolve(liveSnapshot({ accountId: 'account-2', runId: 'run-1' }));
    await pending.promise;
    await Promise.resolve();

    expect(journalDispose).toHaveBeenCalledTimes(1);
    expect(liveDispose).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().liveSystems.state).not.toBe('ready');
  });
});
