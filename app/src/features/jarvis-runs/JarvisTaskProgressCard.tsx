import * as React from 'react';
import { Bot, CircleStop, Terminal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { JarvisCancellationRequestResult } from '@/lib/jarvis/contracts/execution';
import { cn } from '@/lib/utils';

import { useJarvisTaskRunStore } from './taskRunStore';

export interface JarvisTaskProgressCardProps {
  chatId: string;
  compact?: boolean;
  requestCancellation?: (runId: string) => Promise<JarvisCancellationRequestResult>;
}

const ACTIVE_STATUSES = new Set([
  'planning',
  'waiting-for-approval',
  'running',
  'waiting-for-input',
  'blocked',
]);

function statusLabel(status: string): string {
  switch (status) {
    case 'waiting-for-approval':
      return 'Approval needed';
    case 'waiting-for-input':
      return 'Input needed';
    case 'blocked':
      return 'Blocked';
    case 'planning':
      return 'Planning';
    default:
      return 'Working';
  }
}

function cancellationResultMessage(result: JarvisCancellationRequestResult): string {
  if (result.kind === 'authority_revoked_before_intent') {
    return 'Cancellation authority changed; no intent was recorded.';
  }
  if (result.kind === 'already_terminal') {
    return `Run state is already verified as ${result.terminalStatus}.`;
  }
  const prefix =
    result.authorityState === 'revoked_after_intent'
      ? 'Cancellation intent was recorded before authority changed. '
      : '';
  switch (result.aggregate.kind) {
    case 'delivery_pending':
      return `${prefix}Cancellation delivery is pending.`;
    case 'queued_cancelled':
      return `${prefix}Queued cancellation is verified.`;
    case 'signal_delivered':
      return `${prefix}Cancellation signal delivered; waiting for verified run state.`;
    case 'handoff_pending':
      return `${prefix}Cancellation handoff is pending; waiting for verified run state.`;
    case 'unsupported':
      return `${prefix}The active executor does not support cancellation.`;
    case 'executor_missing':
      return `${prefix}No active executor accepted cancellation.`;
    case 'delivery_rejected':
      return `${prefix}The active executor rejected cancellation delivery.`;
    case 'delivery_error':
      return `${prefix}Cancellation delivery could not be verified.`;
  }
}

export function JarvisTaskProgressCard({
  chatId,
  compact = false,
  requestCancellation,
}: JarvisTaskProgressCardProps) {
  const runs = useJarvisTaskRunStore((state) => state.runs);
  const [requesting, setRequesting] = React.useState<Record<string, boolean>>({});
  const [cancellationMessages, setCancellationMessages] = React.useState<Record<string, string>>(
    {},
  );
  const visible = Object.values(runs)
    .filter((run) => run.chatId === chatId && ACTIVE_STATUSES.has(run.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);

  if (visible.length === 0) return null;

  const request = async (runId: string) => {
    if (!requestCancellation || requesting[runId]) return;
    setRequesting((current) => ({ ...current, [runId]: true }));
    try {
      const result = await requestCancellation(runId);
      setCancellationMessages((current) => ({
        ...current,
        [runId]: cancellationResultMessage(result),
      }));
    } catch {
      setCancellationMessages((current) => ({
        ...current,
        [runId]: 'Cancellation request could not be verified.',
      }));
    } finally {
      setRequesting((current) => ({ ...current, [runId]: false }));
    }
  };

  return (
    <aside
      className={cn('flex flex-col gap-2', compact ? 'mx-1 mb-3' : 'sticky bottom-2 z-10 mb-4')}
      aria-label="Jarvis task progress"
    >
      {visible.map((run) => {
        const canCancel = Boolean(
          requestCancellation && run.canonical && run.cancellable && !run.transportRetryAvailable,
        );
        return (
          <div
            key={run.runId}
            className="overflow-hidden rounded-md border border-border/80 bg-elevated/95 shadow-sm backdrop-blur"
          >
            <div className="flex items-start gap-3 px-3 pb-2 pt-2.5">
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-accent-copper/30 bg-accent-copper/10">
                <Bot className="h-3.5 w-3.5 text-accent-copper" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-secondary font-medium text-foreground">{run.goal}</p>
                  <span className="ml-auto shrink-0 text-metadata uppercase tracking-wide text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                </div>
                <p className="mt-0.5 text-metadata text-muted-foreground">
                  {run.userVisibleSummary}
                </p>
                {run.transportRetryAvailable ? (
                  <p className="mt-1 text-metadata text-muted-foreground">
                    Transport retry available
                  </p>
                ) : null}
                {cancellationMessages[run.runId] ? (
                  <p className="mt-1 text-metadata text-muted-foreground" role="status">
                    {cancellationMessages[run.runId]}
                  </p>
                ) : null}
                {(run.activeAgents.length > 0 || run.activeTerminals.length > 0) && (
                  <div className="mt-1.5 flex items-center gap-3 text-metadata text-muted-foreground">
                    {run.activeAgents.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        {run.activeAgents.length}{' '}
                        {run.activeAgents.length === 1 ? 'agent' : 'agents'}
                      </span>
                    )}
                    {run.activeTerminals.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Terminal className="h-3 w-3" aria-hidden="true" />
                        {run.activeTerminals.length}{' '}
                        {run.activeTerminals.length === 1 ? 'terminal' : 'terminals'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {canCancel ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => void request(run.runId)}
                  aria-label="Cancel task"
                  title="Cancel task"
                  disabled={requesting[run.runId]}
                >
                  <CircleStop className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <div
              className="h-0.5 bg-border/70"
              role="progressbar"
              aria-label={`${run.goal} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={run.progress}
            >
              <div
                className="h-full bg-accent-copper transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${run.progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </aside>
  );
}
