import * as React from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  createJarvisCommandCenterStore,
  type JarvisCommandCenterStore,
} from './commandCenterStore';
import {
  mapJarvisCancellationRequestResult,
  mapScheduledJarvisAttemptResult,
} from './resultMappers';
import { canCancelRun, selectRetryAction } from './selectors';
import type {
  JarvisCommandCenterDataPort,
  JarvisCommandCenterHandlers,
  JarvisCommandCenterHostPort,
  JarvisCommandCenterSnapshot,
  JarvisCommandCenterTab,
} from './types';
import { JarvisOutputsTab } from './JarvisOutputsTab';
import {
  requestJarvisApprovalNavigation,
  selectPendingJarvisApprovalId,
} from './approvalNavigation';
import './jarvis-command-center.css';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import { SIK_CONTROL, SIK_EVIDENCE } from '@/lib/jarvis/smoke/evidenceIds';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

const LazyJarvisLiveSystemsTab = React.lazy(() =>
  import('./JarvisLiveSystemsTab').then((module) => ({
    default: module.JarvisLiveSystemsTab,
  })),
);

export type JarvisCommandCenterBinding = Readonly<{
  hostPort: JarvisCommandCenterHostPort;
  dataPort: JarvisCommandCenterDataPort;
}>;

const JarvisCommandCenterContext = React.createContext<JarvisCommandCenterBinding | undefined>(
  undefined,
);

export const JarvisCommandCenterProvider = JarvisCommandCenterContext.Provider;

export function useJarvisCommandCenterBinding(): JarvisCommandCenterBinding | undefined {
  return React.useContext(JarvisCommandCenterContext);
}

const EMPTY_COMMAND_CENTER_SUBSCRIBE = () => () => undefined;

function useCommandCenterStore(input: {
  accountId: string;
  chatId: string;
  dataPort: JarvisCommandCenterDataPort;
}): JarvisCommandCenterStore | undefined {
  const [state, setState] = React.useState<{
    accountId: string;
    chatId: string;
    dataPort: JarvisCommandCenterDataPort;
    store: JarvisCommandCenterStore;
  }>();

  React.useEffect(() => {
    const store = createJarvisCommandCenterStore(input);
    setState({ ...input, store });
    return () => store.dispose();
  }, [input.accountId, input.chatId, input.dataPort]);

  return state?.accountId === input.accountId &&
    state.chatId === input.chatId &&
    state.dataPort === input.dataPort
    ? state.store
    : undefined;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );

  React.useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

type SmokeRunEvidence = Readonly<{
  runDigest: string;
  snapshotDigest?: string;
  requestDigest?: string;
  attemptNumber?: number;
  effectBarrierState?: string;
  effectBarrierVersion?: number;
  attemptState?: string;
  responseStarted?: boolean;
  chunkCount?: number;
  actionDispatchCount?: number;
  approvalCount?: number;
  artifactCount?: number;
  executorClaimCount?: number;
}>;

async function smokeSha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function JarvisCommandCenter({
  accountId,
  chatId,
  dataPort,
  handlers,
  compact = false,
  embedded = false,
}: {
  accountId: string;
  chatId: string;
  dataPort: JarvisCommandCenterDataPort;
  handlers: JarvisCommandCenterHandlers;
  compact?: boolean;
  embedded?: boolean;
}) {
  const store = useCommandCenterStore({ accountId, chatId, dataPort });
  const bodyId = React.useId();
  const emptySnapshot = React.useMemo<JarvisCommandCenterSnapshot>(
    () => ({
      accountId,
      chatId,
      expansion: 'collapsed',
      activeTab: 'outputs',
      retryState: { kind: 'none' },
      events: [],
      outputs: [],
      liveSystems: { state: 'not_loaded' },
    }),
    [accountId, chatId],
  );
  const getSnapshot = React.useCallback(
    () => store?.getSnapshot() ?? emptySnapshot,
    [emptySnapshot, store],
  );
  const snapshot = React.useSyncExternalStore(
    store?.subscribe ?? EMPTY_COMMAND_CENTER_SUBSCRIBE,
    getSnapshot,
    getSnapshot,
  );
  const [feedback, setFeedback] = React.useState<string>();
  const [busyAction, setBusyAction] = React.useState(false);
  const [smokeRunEvidence, setSmokeRunEvidence] = React.useState<SmokeRunEvidence>();
  const [smokeFocusedControl, setSmokeFocusedControl] = React.useState<string>();
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  React.useEffect(() => setFeedback(undefined), [snapshot.currentRun?.id]);
  React.useEffect(() => {
    if (embedded) store?.setExpansion('expanded');
  }, [embedded, store]);

  const expanded = embedded || snapshot.expansion === 'expanded';
  const run = snapshot.currentRun;
  const pendingApprovalId =
    run?.status === 'awaiting_approval'
      ? selectPendingJarvisApprovalId(run.id, snapshot.events)
      : undefined;
  const retryAction = selectRetryAction(snapshot.retryState, handlers);
  const cancelVisible = canCancelRun(run, snapshot.retryState, handlers);

  React.useEffect(() => {
    let disposed = false;
    if (!KERNEL_SMOKE_ENABLED || !run) {
      setSmokeRunEvidence(undefined);
      return () => undefined;
    }
    const latestAttempt = run.transportAttempts?.at(-1);
    void Promise.all([
      smokeSha256(run.id),
      run.scheduledRetrySnapshot
        ? smokeSha256(JSON.stringify(run.scheduledRetrySnapshot))
        : Promise.resolve(undefined),
      latestAttempt?.requestId ? smokeSha256(latestAttempt.requestId) : Promise.resolve(undefined),
    ]).then(([runDigest, snapshotDigest, requestDigest]) => {
      if (disposed) return;
      setSmokeRunEvidence(
        Object.freeze({
          runDigest,
          ...(snapshotDigest ? { snapshotDigest } : {}),
          ...(requestDigest ? { requestDigest } : {}),
          ...(latestAttempt
            ? {
                attemptNumber: latestAttempt.attemptNumber,
                effectBarrierState: latestAttempt.effectBarrier.state,
                effectBarrierVersion: latestAttempt.effectBarrier.version,
                attemptState: latestAttempt.state,
                ...(latestAttempt.zeroEffectEvidence
                  ? {
                      responseStarted:
                        latestAttempt.zeroEffectEvidence.providerBoundary.responseStarted,
                      chunkCount: latestAttempt.zeroEffectEvidence.providerBoundary.chunkCount,
                      actionDispatchCount:
                        latestAttempt.zeroEffectEvidence.providerBoundary.actionDispatchCount,
                      approvalCount: latestAttempt.zeroEffectEvidence.approvals.count,
                      artifactCount: latestAttempt.zeroEffectEvidence.artifacts.count,
                      executorClaimCount: latestAttempt.zeroEffectEvidence.executorClaims.count,
                    }
                  : {}),
              }
            : {}),
        }),
      );
    });
    return () => {
      disposed = true;
    };
  }, [run]);

  const execute = async (operation: () => Promise<string>) => {
    setBusyAction(true);
    setFeedback(undefined);
    try {
      setFeedback(await operation());
      await store?.refresh();
    } catch {
      setFeedback('The requested action is unavailable for this account session.');
    } finally {
      setBusyAction(false);
    }
  };

  const toggle = () => {
    store?.setExpansion(expanded ? 'collapsed' : 'expanded');
  };

  const onEscape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.key !== 'Escape' || !expanded || embedded) return;
    event.preventDefault();
    store?.setExpansion('collapsed');
    toggleRef.current?.focus();
  };

  const openApprovalInChat = () => {
    if (!run || run.status !== 'awaiting_approval' || !pendingApprovalId) return;
    requestJarvisApprovalNavigation({
      accountId,
      chatId,
      runId: run.id,
      approvalId: pendingApprovalId,
    });
  };

  return (
    <section
      className={cn(
        'jarvis-command-center',
        '[[data-theme=monochrome]_&]:!rounded-sm [[data-theme=monochrome]_&]:!bg-background [[data-theme=monochrome]_&]:!bg-none [[data-theme=monochrome]_&]:!shadow-none [[data-theme=monochrome]_&]:before:!hidden',
        "[[data-theme=monochrome]_&]:[&_[class*='jarvis-live-systems'][class*='map-wrap']]:!bg-none",
        "[[data-theme=monochrome]_&]:[&_[class*='jarvis-live-systems'][class*='edge']::after]:!hidden",
        "[[data-theme=monochrome]_&]:[&_[class*='jarvis-live-systems'][class*='node--root']]:!bg-none [[data-theme=monochrome]_&]:[&_[class*='jarvis-live-systems'][class*='node--root']]:!shadow-none",
        !reducedMotion && 'jarvis-command-center--motion',
        compact && 'jarvis-command-center--compact',
        embedded && 'jarvis-command-center--embedded',
      )}
      aria-label={embedded ? 'Jarvis Command Center details' : 'Jarvis Command Center'}
      data-monochrome-surface="jarvis-command-center"
      data-jarvis-expansion={expanded ? 'expanded' : 'collapsed'}
      data-jarvis-run-state={run?.status ?? 'empty'}
      data-testid="jarvis-command-center"
      data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_CONTROL.commandCenterSurface : undefined}
      data-motion-enabled={KERNEL_SMOKE_ENABLED ? String(!reducedMotion) : undefined}
    >
      <header className="jarvis-command-center__header">
        <div className="jarvis-command-center__identity">
          {!embedded ? <div className="jarvis-command-center__eyebrow">Command Center</div> : null}
          <div
            className="jarvis-command-center__summary"
            data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.runStatus : undefined}
            data-run-status={KERNEL_SMOKE_ENABLED ? (run?.status ?? 'empty') : undefined}
            data-run-digest={KERNEL_SMOKE_ENABLED ? smokeRunEvidence?.runDigest : undefined}
            data-snapshot-digest={
              KERNEL_SMOKE_ENABLED ? smokeRunEvidence?.snapshotDigest : undefined
            }
            data-request-digest={KERNEL_SMOKE_ENABLED ? smokeRunEvidence?.requestDigest : undefined}
            data-attempt-number={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.attemptNumber
                ? String(smokeRunEvidence.attemptNumber)
                : undefined
            }
            data-effect-barrier-state={
              KERNEL_SMOKE_ENABLED ? smokeRunEvidence?.effectBarrierState : undefined
            }
            data-effect-barrier-version={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.effectBarrierVersion !== undefined
                ? String(smokeRunEvidence.effectBarrierVersion)
                : undefined
            }
            data-attempt-state={KERNEL_SMOKE_ENABLED ? smokeRunEvidence?.attemptState : undefined}
            data-response-started={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.responseStarted !== undefined
                ? String(smokeRunEvidence.responseStarted)
                : undefined
            }
            data-chunk-count={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.chunkCount !== undefined
                ? String(smokeRunEvidence.chunkCount)
                : undefined
            }
            data-action-dispatch-count={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.actionDispatchCount !== undefined
                ? String(smokeRunEvidence.actionDispatchCount)
                : undefined
            }
            data-approval-count={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.approvalCount !== undefined
                ? String(smokeRunEvidence.approvalCount)
                : undefined
            }
            data-artifact-count={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.artifactCount !== undefined
                ? String(smokeRunEvidence.artifactCount)
                : undefined
            }
            data-executor-claim-count={
              KERNEL_SMOKE_ENABLED && smokeRunEvidence?.executorClaimCount !== undefined
                ? String(smokeRunEvidence.executorClaimCount)
                : undefined
            }
          >
            {run
              ? run.status === 'awaiting_approval'
                ? 'Waiting for approval'
                : `Run ${run.status.replaceAll('_', ' ')}`
              : 'Waiting for a canonical run'}
          </div>
          {run ? (
            <p className="jarvis-command-center__eyebrow">
              <span className="sr-only">Active model</span>
              <span aria-hidden="true">: </span>
              <span>
                {run.model.providerId} / {run.model.modelId}
              </span>
            </p>
          ) : null}
        </div>

        <div className="jarvis-command-center__actions">
          {run?.status === 'awaiting_approval' && pendingApprovalId ? (
            <Button type="button" size="sm" variant="ghost" onClick={openApprovalInChat}>
              Open approval in chat
            </Button>
          ) : null}

          {cancelVisible && run && handlers.cancelRun ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busyAction}
              onClick={() =>
                void execute(async () =>
                  mapJarvisCancellationRequestResult(await handlers.cancelRun!(accountId, run.id)),
                )
              }
              data-sik-evidence={
                KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.cancellationDelivery : undefined
              }
            >
              <Square aria-hidden="true" />
              Cancel
            </Button>
          ) : null}

          {run && retryAction.kind !== 'none' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busyAction}
              onClick={() =>
                void execute(async () => {
                  const result =
                    retryAction.kind === 'retry_transport'
                      ? await retryAction.handler(accountId, run.id)
                      : await retryAction.handler(accountId, run.id);
                  return mapScheduledJarvisAttemptResult(result);
                })
              }
              data-sik-evidence={
                KERNEL_SMOKE_ENABLED && retryAction.kind === 'retry_transport'
                  ? SIK_CONTROL.retryTransport
                  : undefined
              }
            >
              <RotateCcw aria-hidden="true" />
              {retryAction.kind === 'retry_transport' ? 'Retry transport' : 'Retry as new run'}
            </Button>
          ) : null}

          {!embedded ? (
            <Button
              ref={toggleRef}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-expanded={expanded}
              aria-controls={bodyId}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} Command Center`}
              title={`${expanded ? 'Collapse' : 'Expand'} Command Center`}
              onClick={toggle}
              onFocus={() => setSmokeFocusedControl(SIK_CONTROL.commandCenterDisclosure)}
              onBlur={() => setSmokeFocusedControl(undefined)}
              data-sik-evidence={
                KERNEL_SMOKE_ENABLED ? SIK_CONTROL.commandCenterDisclosure : undefined
              }
              data-focus-state={
                KERNEL_SMOKE_ENABLED
                  ? smokeFocusedControl === SIK_CONTROL.commandCenterDisclosure
                    ? 'focused'
                    : 'blurred'
                  : undefined
              }
            >
              {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </Button>
          ) : null}
        </div>
      </header>

      {KERNEL_SMOKE_ENABLED && run?.status === 'partial' ? (
        <output hidden data-sik-evidence={SIK_EVIDENCE.partialState} />
      ) : null}
      {KERNEL_SMOKE_ENABLED &&
      (snapshot.error ||
        feedback ||
        run?.status === 'failed' ||
        run?.status === 'timed_out' ||
        (snapshot.retryState.kind !== 'none' && retryAction.kind === 'none')) ? (
        <output hidden data-sik-evidence={SIK_EVIDENCE.errorState} />
      ) : null}

      {snapshot.retryState.kind !== 'none' && retryAction.kind === 'none' ? (
        <p className="jarvis-command-center__feedback">
          {snapshot.retryState.kind === 'scheduled_transport_available'
            ? 'Transport retry is available; this view cannot request it.'
            : 'A new logical run is available; this view cannot request it.'}
        </p>
      ) : null}
      {feedback ? (
        <p className="jarvis-command-center__feedback" aria-live="polite">
          {feedback}
        </p>
      ) : null}

      {expanded ? (
        <div className="jarvis-command-center__body" id={bodyId} onKeyDown={onEscape}>
          <Tabs
            className="jarvis-command-center__tabs"
            value={snapshot.activeTab}
            onValueChange={(value) => store?.setActiveTab(value as JarvisCommandCenterTab)}
          >
            <TabsList className="jarvis-command-center__tablist" aria-label="Command Center views">
              <TabsTrigger
                value="outputs"
                data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.outputsTab : undefined}
                onFocus={() => setSmokeFocusedControl(SIK_EVIDENCE.outputsTab)}
                onBlur={() => setSmokeFocusedControl(undefined)}
                data-focus-state={
                  KERNEL_SMOKE_ENABLED
                    ? smokeFocusedControl === SIK_EVIDENCE.outputsTab
                      ? 'focused'
                      : 'blurred'
                    : undefined
                }
              >
                Outputs
              </TabsTrigger>
              <TabsTrigger
                value="live_systems"
                data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.liveSystemsTab : undefined}
                onFocus={() => setSmokeFocusedControl(SIK_EVIDENCE.liveSystemsTab)}
                onBlur={() => setSmokeFocusedControl(undefined)}
                data-focus-state={
                  KERNEL_SMOKE_ENABLED
                    ? smokeFocusedControl === SIK_EVIDENCE.liveSystemsTab
                      ? 'focused'
                      : 'blurred'
                    : undefined
                }
              >
                Live Systems
              </TabsTrigger>
            </TabsList>
            <TabsContent className="jarvis-command-center__panel" value="outputs">
              {snapshot.error ? (
                <p className="jarvis-command-center__empty">{snapshot.error}</p>
              ) : (
                <JarvisOutputsTab outputs={snapshot.outputs} />
              )}
            </TabsContent>
            <TabsContent className="jarvis-command-center__panel" value="live_systems">
              {snapshot.error ? (
                <p className="jarvis-command-center__empty">{snapshot.error}</p>
              ) : snapshot.activeTab === 'live_systems' ? (
                <React.Suspense
                  fallback={<p className="jarvis-command-center__empty">Loading Live Systems…</p>}
                >
                  <LazyJarvisLiveSystemsTab
                    liveSystems={snapshot.liveSystems}
                    run={run}
                    events={snapshot.events}
                    outputs={snapshot.outputs}
                    motionEnabled={!reducedMotion}
                  />
                </React.Suspense>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </section>
  );
}
