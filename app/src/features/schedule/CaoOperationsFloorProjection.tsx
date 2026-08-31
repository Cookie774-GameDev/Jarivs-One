import * as React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  parseCaoScheduledLearningSnapshot,
  type CaoScheduledLearningScope,
  type CaoScheduledLearningSnapshot,
} from '@/features/jarvis-memory/caoScheduledLearning';
import {
  createCaoScheduledLearningDexiePersistence,
  getCaoScheduledLearningStatus,
  subscribeCaoScheduledLearningStatus,
  type CaoScheduledLearningRuntimeStatus,
} from '@/features/jarvis-memory/caoScheduledLearningRuntime';

type SnapshotState =
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'unavailable' }
  | { state: 'ready'; snapshot: CaoScheduledLearningSnapshot }
  | { state: 'degraded'; snapshot: CaoScheduledLearningSnapshot };

export interface CaoOperationsFloorProjectionProps {
  scope: CaoScheduledLearningScope;
  scheduleState: 'active' | 'paused';
  loadSnapshot?: (scope: CaoScheduledLearningScope) => Promise<unknown>;
  getStatus?: () => CaoScheduledLearningRuntimeStatus;
  subscribeStatus?: (listener: (status: CaoScheduledLearningRuntimeStatus) => void) => () => void;
}

const productionPersistence = createCaoScheduledLearningDexiePersistence();

async function loadProductionSnapshot(scope: CaoScheduledLearningScope): Promise<unknown> {
  return productionPersistence.load(scope);
}

function sameScope(
  left: CaoScheduledLearningScope | undefined,
  right: CaoScheduledLearningScope,
): boolean {
  return Boolean(
    left &&
    left.accountId === right.accountId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.scheduleId === right.scheduleId &&
    left.targetId === right.targetId &&
    left.scheduleAnchorAt === right.scheduleAnchorAt,
  );
}

function snapshotMatchesScope(
  snapshot: CaoScheduledLearningSnapshot,
  scope: CaoScheduledLearningScope,
): boolean {
  return sameScope(snapshot, scope);
}

function runtimeLabel(status: CaoScheduledLearningRuntimeStatus | undefined): string | null {
  if (!status || status.state === 'idle') return null;
  const state = status.state[0]!.toUpperCase() + status.state.slice(1);
  if (!status.trigger) return state;
  const trigger =
    status.trigger === 'manual_force'
      ? 'Manual force'
      : status.trigger === 'learning_threshold'
        ? 'Learning threshold'
        : 'Scheduled';
  return `${state} · ${trigger}`;
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatTrigger(trigger: CaoScheduledLearningSnapshot['completions'][number]['trigger']) {
  if (trigger === 'manual_force') return 'Manual force';
  if (trigger === 'learning_threshold') return 'Learning threshold';
  return 'Scheduled';
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`;
  return `${Number((seconds / 60).toFixed(1))} min`;
}

function RetryOperationalTruth({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      className="rounded-md border border-current/30 px-2 py-1 font-medium transition-colors hover:bg-current/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
      onClick={onRetry}
      type="button"
    >
      Retry operational truth
    </button>
  );
}

export function CaoOperationsFloorProjection({
  scope,
  scheduleState,
  loadSnapshot = loadProductionSnapshot,
  getStatus = getCaoScheduledLearningStatus,
  subscribeStatus = subscribeCaoScheduledLearningStatus,
}: CaoOperationsFloorProjectionProps) {
  const [snapshotState, setSnapshotState] = React.useState<SnapshotState>({ state: 'loading' });
  const [runtimeStatus, setRuntimeStatus] = React.useState<
    CaoScheduledLearningRuntimeStatus | undefined
  >();
  const hydrateRef = React.useRef<(showLoading: boolean) => void>(() => undefined);

  React.useEffect(() => {
    let disposed = false;
    let loadGeneration = 0;

    const hydrate = async (showLoading: boolean) => {
      const generation = ++loadGeneration;
      if (showLoading) setSnapshotState({ state: 'loading' });
      const markUnavailable = () =>
        setSnapshotState((current) =>
          !showLoading && (current.state === 'ready' || current.state === 'degraded')
            ? { state: 'degraded', snapshot: current.snapshot }
            : { state: 'unavailable' },
        );
      try {
        const raw = await loadSnapshot(scope);
        if (disposed || generation !== loadGeneration) return;
        if (raw === null || raw === undefined) {
          setSnapshotState({ state: 'empty' });
          return;
        }
        const parsed = parseCaoScheduledLearningSnapshot(raw);
        if (parsed && snapshotMatchesScope(parsed, scope)) {
          setSnapshotState({ state: 'ready', snapshot: parsed });
        } else {
          markUnavailable();
        }
      } catch {
        if (!disposed && generation === loadGeneration) {
          markUnavailable();
        }
      }
    };

    hydrateRef.current = (showLoading) => void hydrate(showLoading);
    try {
      const currentStatus = getStatus();
      setRuntimeStatus(sameScope(currentStatus.scope, scope) ? currentStatus : undefined);
    } catch {
      setRuntimeStatus(undefined);
    }
    void hydrate(true);
    const unsubscribe = subscribeStatus((status) => {
      if (!sameScope(status.scope, scope)) return;
      setRuntimeStatus(status);
      if (status.state !== 'running') void hydrate(false);
    });

    return () => {
      disposed = true;
      loadGeneration += 1;
      hydrateRef.current = () => undefined;
      unsubscribe();
    };
  }, [getStatus, loadSnapshot, scope, subscribeStatus]);

  const retry = () => hydrateRef.current(snapshotState.state !== 'degraded');

  const runtime = runtimeLabel(runtimeStatus);
  const snapshot =
    snapshotState.state === 'ready' || snapshotState.state === 'degraded'
      ? snapshotState.snapshot
      : undefined;
  const latestCompletion = snapshot?.completions.at(-1);
  const visibleCompletions = snapshot ? [...snapshot.completions].slice(-5).reverse() : [];

  return (
    <div
      aria-label="CAO operations floor"
      className="mt-3 overflow-hidden rounded-lg border border-accent-cyan/30 bg-background/70 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-accent-cyan/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-accent-cyan" aria-hidden />
          <span className="font-display text-ui-strong text-foreground">Operations floor</span>
          <Badge variant={scheduleState === 'paused' ? 'secondary' : 'outline'}>
            {scheduleState === 'paused' ? 'Schedule paused' : 'Schedule active'}
          </Badge>
        </div>
        {runtime ? (
          <span
            aria-label="CAO live runtime state"
            className="text-metadata text-muted-foreground"
            role="status"
          >
            {runtime}
          </span>
        ) : null}
      </div>

      {snapshotState.state === 'loading' ? (
        <p className="px-3 py-3 text-metadata text-muted-foreground" aria-live="polite">
          Loading operational truth…
        </p>
      ) : snapshotState.state === 'unavailable' ? (
        <div
          aria-label="CAO operational truth health"
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-metadata text-destructive"
          role="status"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Operational truth unavailable
          </span>
          <RetryOperationalTruth onRetry={retry} />
        </div>
      ) : snapshotState.state === 'empty' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-metadata text-muted-foreground">
          <p>No durable learning snapshot yet. The first verified check will create one.</p>
          <RetryOperationalTruth onRetry={retry} />
        </div>
      ) : snapshot ? (
        <div className="space-y-3 px-3 py-3">
          {snapshotState.state === 'degraded' ? (
            <div
              aria-label="CAO operational truth health"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent-copper/40 bg-accent-copper/5 px-2.5 py-2 text-metadata text-accent-copper"
              role="status"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Operational truth degraded. Showing the last verified snapshot.
              </span>
              <RetryOperationalTruth onRetry={retry} />
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-2 text-metadata sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Learning cursor</dt>
              <dd className="font-display text-ui-strong text-foreground">
                {snapshot.lastLearningSeqConsumed}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Snapshot</dt>
              <dd className="font-medium text-foreground">Revision {snapshot.revision}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Schedule journal</dt>
              <dd className="font-medium text-foreground">
                {snapshot.scheduledOccurrenceCount} scheduled checks
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last scheduled due</dt>
              <dd className="font-medium text-foreground">
                {snapshot.lastScheduledDueAt
                  ? formatTimestamp(snapshot.lastScheduledDueAt)
                  : 'Not yet scheduled'}
              </dd>
            </div>
          </dl>

          <div className="grid gap-2 text-metadata sm:grid-cols-2">
            <div className="rounded-md border border-border/70 bg-panel/50 px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Database className="h-3.5 w-3.5" aria-hidden />
                Latest verified receipt
              </div>
              <div className="mt-1 truncate font-mono text-foreground">
                {latestCompletion?.receiptId ?? 'No verified receipt yet'}
              </div>
            </div>
            <div
              aria-label="CAO durable recovery state"
              className="rounded-md border border-border/70 bg-panel/50 px-2.5 py-2"
              role="status"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {snapshot.pending ? (
                  <Clock3 className="h-3.5 w-3.5 text-accent-copper" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent-cyan" aria-hidden />
                )}
                {snapshot.pending ? 'Recovery required' : 'No active blocker'}
              </div>
              <div className="mt-1 truncate font-mono text-foreground">
                {snapshot.pending?.passId ?? 'Durable state settled'}
              </div>
            </div>
          </div>

          {snapshot.pending ? (
            <details className="rounded-md border border-accent-copper/30 bg-accent-copper/5 px-2.5 py-2 text-metadata">
              <summary className="cursor-pointer font-display text-ui-strong text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
                Recovery details
              </summary>
              <div className="mt-2 grid gap-1 font-mono text-foreground sm:grid-cols-2">
                <span>Request: {snapshot.pending.requestId}</span>
                <span>Pass: {snapshot.pending.passId}</span>
                <span>
                  Cursor: {snapshot.pending.fromSeqExclusive} →{' '}
                  {snapshot.pending.throughSeqInclusive}
                </span>
                <span>Trigger: {formatTrigger(snapshot.pending.trigger)}</span>
                <span>
                  Requested:{' '}
                  <time dateTime={new Date(snapshot.pending.requestedAt).toISOString()}>
                    {formatTimestamp(snapshot.pending.requestedAt)}
                  </time>
                </span>
              </div>
            </details>
          ) : null}

          {visibleCompletions.length > 0 ? (
            <details className="rounded-md border border-border/70 bg-panel/25 px-2.5 py-2">
              <summary className="flex cursor-pointer items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
                <span className="font-display text-ui-strong text-foreground">
                  Verified completion history
                </span>
                <span className="text-metadata text-muted-foreground">
                  Showing {visibleCompletions.length} of {snapshot.completions.length}
                </span>
              </summary>
              <ol
                aria-label="Verified completion history"
                className="mt-2 space-y-1.5 text-metadata"
              >
                {visibleCompletions.map((completion) => (
                  <li
                    className="rounded-md border border-border/60 bg-panel/35 px-2.5 py-2"
                    key={completion.requestId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">
                        {formatTrigger(completion.trigger)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDuration(completion.completedAt - completion.requestedAt)} ·{' '}
                        <time dateTime={new Date(completion.completedAt).toISOString()}>
                          {formatTimestamp(completion.completedAt)}
                        </time>
                      </span>
                    </div>
                    <div className="mt-1 grid min-w-0 gap-1 font-mono text-foreground sm:grid-cols-3">
                      <span className="truncate" title={completion.receiptId ?? 'No receipt'}>
                        Receipt: {completion.receiptId ?? 'No receipt'}
                      </span>
                      <span className="truncate" title={completion.passId ?? 'No pass'}>
                        Pass: {completion.passId ?? 'No pass'}
                      </span>
                      <span className="truncate" title={completion.requestId}>
                        Request: {completion.requestId}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
