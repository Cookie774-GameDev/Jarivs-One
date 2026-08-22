import * as React from 'react';

import type {
  ContextAccess,
  ContextScopeRevision,
  ContextTaskKind,
  ExecutionIdentity,
} from '@/features/context/gateway/contextGatewayContracts';
import type { ChatGptAdeRunListener } from './ChatGptAdeAdapter';
import { ChatGptAdeRunStatusPanel } from './ChatGptAdeRunStatusPanel';
import type { ChatGptAdeRunSnapshot } from './adeContracts';

export interface ChatGptAdeTaskDraft {
  instruction: string;
  taskKind: ContextTaskKind;
  access: ContextAccess;
  userIntent: Readonly<{ context: boolean; deep: boolean }>;
  broadChange: boolean;
}

export interface ChatGptAdeTaskRun {
  execute(): Promise<Readonly<ChatGptAdeRunSnapshot>>;
  cancel(): boolean;
  subscribe(listener: ChatGptAdeRunListener): () => void;
}

export interface ChatGptAdeTaskSurfaceProps {
  executionIdentity: Readonly<ExecutionIdentity>;
  scope: Readonly<ContextScopeRevision>;
  accessCeiling: ContextAccess;
  createRun(draft: Readonly<ChatGptAdeTaskDraft>): Readonly<ChatGptAdeTaskRun>;
}

interface ActiveSurfaceRun {
  token: symbol;
  run: Readonly<ChatGptAdeTaskRun>;
  unsubscribe(): void;
  terminal: boolean;
  access: ContextAccess;
  cancellationRequested: boolean;
}

const ACCESS_LEVELS = Object.freeze<readonly ContextAccess[]>(['read', 'write', 'full']);
const TERMINAL_STATUSES = new Set<ChatGptAdeRunSnapshot['status']>([
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);
const IDENTITY_KEYS = Object.freeze([
  'transportConnectionId',
  'transportAdapterId',
  'upstreamProviderId',
  'upstreamModelId',
  'providerQualifiedModelId',
  'authBillingRoute',
  'effort',
  'fastVariant',
  'catalogRevision',
  'observedProviderIdentity',
] as const);

function accessOptions(ceiling: ContextAccess): readonly ContextAccess[] {
  return ACCESS_LEVELS.slice(0, ACCESS_LEVELS.indexOf(ceiling) + 1);
}

function accessLabel(access: ContextAccess): string {
  if (access === 'full') return 'Full access';
  return `${access[0]!.toUpperCase()}${access.slice(1)}`;
}

function exactSnapshotAuthority(
  snapshot: Readonly<ChatGptAdeRunSnapshot>,
  scope: Readonly<ContextScopeRevision>,
  identity: Readonly<ExecutionIdentity>,
): boolean {
  return (
    snapshot.selectedHarness === 'chatgpt' &&
    snapshot.scope.accountId === scope.accountId &&
    snapshot.scope.workspaceId === scope.workspaceId &&
    snapshot.scope.projectId === scope.projectId &&
    snapshot.scope.worktreeId === scope.worktreeId &&
    snapshot.scope.revision === scope.revision &&
    IDENTITY_KEYS.every((key) => snapshot.executionIdentity[key] === identity[key])
  );
}

export function ChatGptAdeTaskSurface({
  executionIdentity,
  scope,
  accessCeiling,
  createRun,
}: Readonly<ChatGptAdeTaskSurfaceProps>) {
  const allowedAccess = React.useMemo(() => accessOptions(accessCeiling), [accessCeiling]);
  const [instruction, setInstruction] = React.useState('');
  const [taskKind, setTaskKind] = React.useState<ContextTaskKind>('answer');
  const [access, setAccess] = React.useState<ContextAccess>('read');
  const [contextRequired, setContextRequired] = React.useState(false);
  const [deepRequired, setDeepRequired] = React.useState(false);
  const [broadChange, setBroadChange] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<Readonly<ChatGptAdeRunSnapshot> | null>(null);
  const [running, setRunning] = React.useState(false);
  const [safeError, setSafeError] = React.useState<string | null>(null);
  const activeRef = React.useRef<ActiveSurfaceRun | null>(null);

  React.useEffect(() => {
    if (allowedAccess.includes(access)) return;
    setAccess(allowedAccess.at(-1) ?? 'read');
  }, [access, allowedAccess]);

  React.useEffect(() => {
    const active = activeRef.current;
    if (
      !active ||
      active.terminal ||
      active.cancellationRequested ||
      ACCESS_LEVELS.indexOf(active.access) <= ACCESS_LEVELS.indexOf(accessCeiling)
    ) {
      return;
    }
    active.cancellationRequested = true;
    try {
      active.run.cancel();
    } catch {
      setSafeError('ADE cancellation failed safely.');
    }
  }, [accessCeiling]);

  React.useEffect(
    () => () => {
      const active = activeRef.current;
      activeRef.current = null;
      if (!active) return;
      if (!active.terminal && !active.cancellationRequested) {
        try {
          active.run.cancel();
        } catch {
          // Unmount must still release the presentation subscription.
        }
      }
      active.unsubscribe();
    },
    [],
  );

  const start = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeRef.current || running) return;
    const normalizedInstruction = instruction.trim();
    if (!normalizedInstruction) {
      setSafeError('Enter an instruction before starting.');
      return;
    }

    let run: Readonly<ChatGptAdeTaskRun>;
    try {
      run = createRun(
        Object.freeze({
          instruction: normalizedInstruction,
          taskKind,
          access,
          userIntent: Object.freeze({ context: contextRequired, deep: deepRequired }),
          broadChange,
        }),
      );
    } catch {
      setSafeError('ADE run unavailable.');
      return;
    }

    const token = Symbol('chatgpt-ade-surface-run');
    const boundScope = Object.freeze({ ...scope });
    const boundIdentity = Object.freeze({ ...executionIdentity });
    const active: ActiveSurfaceRun = {
      token,
      run,
      unsubscribe: () => {},
      terminal: false,
      access,
      cancellationRequested: false,
    };
    activeRef.current = active;
    setSafeError(null);
    setSnapshot(null);
    setRunning(true);

    let boundRunId: string | undefined;
    let boundRequestId: string | undefined;
    const acceptSnapshot: ChatGptAdeRunListener = (next) => {
      const current = activeRef.current;
      if (current?.token !== token || current.terminal) return;
      if (
        !exactSnapshotAuthority(next, boundScope, boundIdentity) ||
        (boundRunId !== undefined &&
          (next.runId !== boundRunId || next.requestId !== boundRequestId))
      ) {
        current.terminal = true;
        try {
          current.run.cancel();
        } catch {
          // The identity violation is already fail-closed at this boundary.
        }
        setSafeError('ADE run identity changed.');
        return;
      }
      boundRunId = next.runId;
      boundRequestId = next.requestId;
      if (TERMINAL_STATUSES.has(next.status)) current.terminal = true;
      setSnapshot(next);
    };
    try {
      active.unsubscribe = run.subscribe(acceptSnapshot);
    } catch {
      activeRef.current = null;
      try {
        run.cancel();
      } catch {
        // Subscription failure already prevents execution and visible output.
      }
      setRunning(false);
      setSafeError('ADE run unavailable.');
      return;
    }

    let execution: Promise<Readonly<ChatGptAdeRunSnapshot>>;
    try {
      execution = run.execute();
    } catch {
      active.unsubscribe();
      activeRef.current = null;
      try {
        run.cancel();
      } catch {
        // A synchronous execute failure is already terminal at this boundary.
      }
      setRunning(false);
      setSafeError('ADE run failed safely.');
      return;
    }

    void execution
      .then(acceptSnapshot)
      .catch(() => {
        const current = activeRef.current;
        if (current?.token === token && !current.terminal && !current.cancellationRequested) {
          setSafeError('ADE run failed safely.');
        }
      })
      .finally(() => {
        if (activeRef.current?.token !== token) return;
        active.unsubscribe();
        activeRef.current = null;
        setRunning(false);
      });
  };

  const cancel = () => {
    const active = activeRef.current;
    if (!active || active.terminal || active.cancellationRequested) return;
    active.cancellationRequested = true;
    try {
      active.run.cancel();
    } catch {
      setSafeError('ADE cancellation failed safely.');
    }
  };

  return (
    <main className="h-full overflow-auto bg-background p-5 text-foreground" data-ade-surface>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            VibeSpace-local agent development environment
          </p>
          <h1 className="mt-1 text-2xl font-semibold">ChatGPT ADE</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Uses the shared VibeSpace Context Gateway and the exact selected route.
          </p>
          <div className="mt-4 text-sm">
            <p className="font-medium">
              {executionIdentity.upstreamProviderId} / {executionIdentity.upstreamModelId}
            </p>
            <p className="text-xs text-muted-foreground">
              {executionIdentity.effort} effort · {executionIdentity.fastVariant}
            </p>
          </div>
        </header>

        <form
          aria-label="ChatGPT ADE task"
          className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm"
          onSubmit={start}
        >
          <label className="block text-sm font-medium" htmlFor="chatgpt-ade-instruction">
            Instruction
          </label>
          <textarea
            aria-label="ADE instruction"
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={running}
            id="chatgpt-ade-instruction"
            maxLength={128 * 1024}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Describe the task…"
            value={instruction}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Task kind
              <select
                aria-label="Task kind"
                className="mt-1 block w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 font-normal"
                disabled={running}
                onChange={(event) => setTaskKind(event.target.value as ContextTaskKind)}
                value={taskKind}
              >
                <option value="answer">Answer</option>
                <option value="write">Write</option>
                <option value="action">Action</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Access
              <select
                aria-label="Access"
                className="mt-1 block w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 font-normal"
                disabled={running}
                onChange={(event) => setAccess(event.target.value as ContextAccess)}
                value={access}
              >
                {allowedAccess.map((level) => (
                  <option key={level} value={level}>
                    {accessLabel(level)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="mt-4 grid gap-2 text-sm sm:grid-cols-3" disabled={running}>
            <label className="flex items-center gap-2">
              <input
                aria-label="Require VibeSpace Context"
                checked={contextRequired}
                onChange={(event) => {
                  setContextRequired(event.target.checked);
                  if (!event.target.checked) setDeepRequired(false);
                }}
                type="checkbox"
              />
              Require VibeSpace Context
            </label>
            <label className="flex items-center gap-2">
              <input
                aria-label="Require deep investigation"
                checked={deepRequired}
                onChange={(event) => {
                  setDeepRequired(event.target.checked);
                  if (event.target.checked) setContextRequired(true);
                }}
                type="checkbox"
              />
              Deep investigation
            </label>
            <label className="flex items-center gap-2">
              <input
                aria-label="Broad project change"
                checked={broadChange}
                onChange={(event) => setBroadChange(event.target.checked)}
                type="checkbox"
              />
              Broad project change
            </label>
          </fieldset>

          {safeError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {safeError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={running || !instruction.trim()}
              type="submit"
            >
              Start ADE task
            </button>
            {running ? (
              <button
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
                onClick={cancel}
                type="button"
              >
                Cancel ADE task
              </button>
            ) : null}
          </div>
        </form>

        {snapshot ? <ChatGptAdeRunStatusPanel run={snapshot} /> : null}
      </div>
    </main>
  );
}
