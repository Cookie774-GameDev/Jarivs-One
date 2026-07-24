import {
  isJarvisCommandCenterLiveSnapshotValid,
  selectCurrentRun,
  selectEvents,
  selectLiveSystems,
  selectOutputs,
  selectRetryState,
} from './selectors';
import type {
  JarvisCommandCenterDataPort,
  JarvisCommandCenterExpansion,
  JarvisCommandCenterSnapshot,
  JarvisCommandCenterTab,
  JarvisRun,
} from './types';

const LIVE_EVIDENCE_INVALID = 'Live evidence could not be verified.';
const LIVE_EVIDENCE_UNAVAILABLE = 'Live evidence is unavailable.';
const DATA_UNAVAILABLE = 'Command Center data is unavailable.';

export type JarvisCommandCenterStore = Readonly<{
  getSnapshot(): Readonly<JarvisCommandCenterSnapshot>;
  subscribe(listener: () => void): () => void;
  setExpansion(expansion: JarvisCommandCenterExpansion): void;
  setActiveTab(tab: JarvisCommandCenterTab): void;
  refresh(): Promise<void>;
  dispose(): void;
}>;

export function createJarvisCommandCenterStore(input: {
  accountId: string;
  chatId: string;
  dataPort: JarvisCommandCenterDataPort;
  limits?: Readonly<{ runs?: number; events?: number; artifacts?: number }>;
}): JarvisCommandCenterStore {
  const limits = {
    runs: input.limits?.runs ?? 100,
    events: input.limits?.events ?? 500,
    artifacts: input.limits?.artifacts ?? 500,
  };
  let snapshot: JarvisCommandCenterSnapshot = {
    accountId: input.accountId,
    chatId: input.chatId,
    expansion: 'collapsed',
    activeTab: 'outputs',
    retryState: { kind: 'none' },
    events: [],
    outputs: [],
    liveSystems: { state: 'not_loaded' },
  };
  let disposed = false;
  let refreshGeneration = 0;
  let liveGeneration = 0;
  let loadedLiveRunId: string | undefined;
  let liveRequestRunId: string | undefined;
  let liveRefreshPending = false;
  let liveSubscriptionRunId: string | undefined;
  let disposeLiveSubscription: () => void = () => undefined;
  const listeners = new Set<() => void>();

  const publish = (next: JarvisCommandCenterSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const invalidateLiveRequest = () => {
    liveGeneration += 1;
    liveRequestRunId = undefined;
    liveRefreshPending = false;
  };

  const mayReadLive = (run: JarvisRun | undefined) =>
    !!run && snapshot.expansion === 'expanded' && snapshot.activeTab === 'live_systems';

  const clearLiveSubscription = () => {
    disposeLiveSubscription();
    disposeLiveSubscription = () => undefined;
    liveSubscriptionRunId = undefined;
  };

  const loadLiveSystems = async (run: JarvisRun, force = false): Promise<void> => {
    if (disposed || !mayReadLive(run)) return;
    if (!force && loadedLiveRunId === run.id && snapshot.liveSystems.state === 'ready') return;
    if (liveRequestRunId === run.id) {
      if (force) liveRefreshPending = true;
      return;
    }
    const generation = ++liveGeneration;
    liveRequestRunId = run.id;
    liveRefreshPending = false;
    const flushPendingRefresh = () => {
      const shouldRefresh = liveRefreshPending;
      liveRefreshPending = false;
      if (shouldRefresh) void loadLiveSystems(run, true);
    };
    publish({ ...snapshot, liveSystems: { state: 'loading' } });
    try {
      const result = await input.dataPort.getLiveEvidenceSnapshot({
        accountId: input.accountId,
        runId: run.id,
      });
      if (
        disposed ||
        generation !== liveGeneration ||
        snapshot.accountId !== input.accountId ||
        snapshot.currentRun?.id !== run.id ||
        snapshot.expansion !== 'expanded' ||
        snapshot.activeTab !== 'live_systems'
      ) {
        return;
      }
      liveRequestRunId = undefined;
      if (!result) {
        loadedLiveRunId = undefined;
        publish({
          ...snapshot,
          liveSystems: { state: 'unavailable', reason: LIVE_EVIDENCE_UNAVAILABLE },
        });
        flushPendingRefresh();
        return;
      }
      if (!isJarvisCommandCenterLiveSnapshotValid(result, run)) {
        loadedLiveRunId = undefined;
        publish({
          ...snapshot,
          liveSystems: { state: 'unavailable', reason: LIVE_EVIDENCE_INVALID },
        });
        flushPendingRefresh();
        return;
      }
      loadedLiveRunId = run.id;
      publish({
        ...snapshot,
        liveSystems: { state: 'ready', nodes: selectLiveSystems(result, run) },
      });
      flushPendingRefresh();
    } catch {
      if (
        !disposed &&
        generation === liveGeneration &&
        snapshot.currentRun?.id === run.id &&
        snapshot.expansion === 'expanded' &&
        snapshot.activeTab === 'live_systems'
      ) {
        liveRequestRunId = undefined;
        loadedLiveRunId = undefined;
        publish({
          ...snapshot,
          liveSystems: { state: 'unavailable', reason: LIVE_EVIDENCE_UNAVAILABLE },
        });
        flushPendingRefresh();
      }
    }
  };

  const syncLiveSubscription = () => {
    const run = snapshot.currentRun;
    const nextRunId =
      mayReadLive(run) && input.dataPort.subscribeLiveEvidence ? run?.id : undefined;
    if (nextRunId === liveSubscriptionRunId) return;
    clearLiveSubscription();
    if (!nextRunId || !input.dataPort.subscribeLiveEvidence) return;
    liveSubscriptionRunId = nextRunId;
    disposeLiveSubscription = input.dataPort.subscribeLiveEvidence(
      { accountId: input.accountId, runId: nextRunId },
      () => {
        const currentRun = snapshot.currentRun;
        if (!currentRun || currentRun.id !== nextRunId || !mayReadLive(currentRun)) return;
        void loadLiveSystems(currentRun, true);
      },
    );
  };

  const refresh = async (forceLive = false): Promise<void> => {
    if (disposed) return;
    const generation = ++refreshGeneration;
    try {
      const runs = await input.dataPort.getRunsForChat({
        accountId: input.accountId,
        chatId: input.chatId,
        limit: limits.runs,
      });
      if (disposed || generation !== refreshGeneration) return;
      const currentRun = selectCurrentRun(runs, input.accountId, input.chatId);
      const previousRunId = snapshot.currentRun?.id;
      if (currentRun?.id !== previousRunId) {
        invalidateLiveRequest();
        loadedLiveRunId = undefined;
      }

      if (!currentRun) {
        publish({
          ...snapshot,
          currentRun: undefined,
          retryState: { kind: 'none' },
          events: [],
          outputs: [],
          liveSystems: { state: 'not_loaded' },
          error: undefined,
        });
        syncLiveSubscription();
        return;
      }

      const runChanged = previousRunId !== currentRun.id;
      publish({
        ...snapshot,
        currentRun,
        retryState: selectRetryState(currentRun),
        events: runChanged ? [] : snapshot.events,
        outputs: runChanged ? [] : snapshot.outputs,
        liveSystems: runChanged ? { state: 'not_loaded' } : snapshot.liveSystems,
        error: undefined,
      });
      syncLiveSubscription();

      if (snapshot.expansion !== 'expanded') return;

      const [events, artifacts] = await Promise.all([
        input.dataPort.getEventsForRun({
          accountId: input.accountId,
          runId: currentRun.id,
          limit: limits.events,
        }),
        input.dataPort.getArtifactsForRun({
          accountId: input.accountId,
          runId: currentRun.id,
          limit: limits.artifacts,
        }),
      ]);
      if (disposed || generation !== refreshGeneration) return;
      publish({
        ...snapshot,
        currentRun,
        retryState: selectRetryState(currentRun),
        events: selectEvents(events, currentRun.id, limits.events),
        outputs: selectOutputs(artifacts, currentRun.id, limits.artifacts),
        liveSystems: runChanged ? { state: 'not_loaded' } : snapshot.liveSystems,
        error: undefined,
      });
      syncLiveSubscription();
      if (mayReadLive(currentRun)) await loadLiveSystems(currentRun, forceLive);
    } catch {
      if (!disposed && generation === refreshGeneration) {
        publish({ ...snapshot, error: DATA_UNAVAILABLE });
      }
    }
  };

  const disposePortSubscription = input.dataPort.subscribe(
    input.accountId,
    input.chatId,
    () => void refresh(),
  );
  void refresh();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setExpansion(expansion) {
      if (disposed || expansion === snapshot.expansion) return;
      if (expansion === 'collapsed') invalidateLiveRequest();
      publish({ ...snapshot, expansion });
      syncLiveSubscription();
      if (expansion === 'expanded') void refresh();
    },
    setActiveTab(activeTab) {
      if (disposed || activeTab === snapshot.activeTab) return;
      if (activeTab !== 'live_systems') invalidateLiveRequest();
      publish({ ...snapshot, activeTab });
      syncLiveSubscription();
      if (
        activeTab === 'live_systems' &&
        snapshot.currentRun &&
        snapshot.expansion === 'expanded'
      ) {
        void loadLiveSystems(snapshot.currentRun);
      }
    },
    refresh: () => refresh(),
    dispose() {
      if (disposed) return;
      disposed = true;
      refreshGeneration += 1;
      invalidateLiveRequest();
      clearLiveSubscription();
      disposePortSubscription();
      listeners.clear();
    },
  };
}
