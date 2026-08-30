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
  subscribeCaoScheduledLearningStatus,
  type CaoScheduledLearningRuntimeStatus,
} from '@/features/jarvis-memory/caoScheduledLearningRuntime';

type SnapshotState =
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'unavailable' }
  | { state: 'ready'; snapshot: CaoScheduledLearningSnapshot };

export interface CaoOperationsFloorProjectionProps {
  scope: CaoScheduledLearningScope;
  scheduleState: 'active' | 'paused';
  loadSnapshot?: (scope: CaoScheduledLearningScope) => Promise<unknown>;
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

export function CaoOperationsFloorProjection({
  scope,
  scheduleState,
  loadSnapshot = loadProductionSnapshot,
  subscribeStatus = subscribeCaoScheduledLearningStatus,
}: CaoOperationsFloorProjectionProps) {
  const [snapshotState, setSnapshotState] = React.useState<SnapshotState>({ state: 'loading' });
  const [runtimeStatus, setRuntimeStatus] = React.useState<
    CaoScheduledLearningRuntimeStatus | undefined
  >();

  React.useEffect(() => {
    let disposed = false;
    let loadGeneration = 0;

    const hydrate = async (showLoading: boolean) => {
      const generation = ++loadGeneration;
      if (showLoading) setSnapshotState({ state: 'loading' });
      try {
        const raw = await loadSnapshot(scope);
        if (disposed || generation !== loadGeneration) return;
        if (raw === null || raw === undefined) {
          setSnapshotState({ state: 'empty' });
          return;
        }
        const parsed = parseCaoScheduledLearningSnapshot(raw);
        setSnapshotState(
          parsed && snapshotMatchesScope(parsed, scope)
            ? { state: 'ready', snapshot: parsed }
            : { state: 'unavailable' },
        );
      } catch {
        if (!disposed && generation === loadGeneration) {
          setSnapshotState({ state: 'unavailable' });
        }
      }
    };

    setRuntimeStatus(undefined);
    void hydrate(true);
    const unsubscribe = subscribeStatus((status) => {
      if (!sameScope(status.scope, scope)) return;
      setRuntimeStatus(status);
      if (status.state !== 'running') void hydrate(false);
    });

    return () => {
      disposed = true;
      loadGeneration += 1;
      unsubscribe();
    };
  }, [loadSnapshot, scope, subscribeStatus]);

  const runtime = runtimeLabel(runtimeStatus);
  const snapshot = snapshotState.state === 'ready' ? snapshotState.snapshot : undefined;
  const latestCompletion = snapshot?.completions.at(-1);

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
          <span className="text-metadata text-muted-foreground" aria-live="polite">
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
          className="flex items-center gap-2 px-3 py-3 text-metadata text-destructive"
          role="status"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Operational truth unavailable
        </div>
      ) : snapshotState.state === 'empty' ? (
        <p className="px-3 py-3 text-metadata text-muted-foreground">
          No durable learning snapshot yet. The first verified check will create one.
        </p>
      ) : snapshot ? (
        <div className="space-y-3 px-3 py-3">
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
            <div className="rounded-md border border-border/70 bg-panel/50 px-2.5 py-2">
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
        </div>
      ) : null}
    </div>
  );
}
