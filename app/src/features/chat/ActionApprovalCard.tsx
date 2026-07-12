/**
 * Inline approval card for an `action_proposal` chat part.
 *
 * Renders inside an assistant message bubble whenever the AI proposed
 * an action via a fenced ```action {...}``` block (see
 * `lib/actions/parse.ts` + the splice in `lib/ai/runtime.ts`). The user
 * sees one card per proposal: action label, rationale, params, and
 * Approve/Cancel buttons.
 *
 * Lifecycle (mirrors `ActionStatus` in `types/chat.ts`):
 *   pending   -> running     (Approve clicked)
 *   running   -> success     (runner returned ok)
 *   running   -> error       (runner returned not-ok)
 *   pending   -> cancelled   (Cancel clicked)
 *
 * State updates are persisted by mutating the parent `Message`'s
 * `parts` array via `messageRepo`. The chat thread re-renders
 * automatically because `useChatMessages` is a Dexie live-query, so we
 * don't need any local state in this component beyond a transient
 * `busy` flag while a click is in-flight.
 */

import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Check,
  Loader2,
  Play,
  X,
  type LucideIcon,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messageRepo } from '@/lib/db/repositories';
import { resolveAction, runAction } from '@/lib/actions';
import { cancelQueuedTerminalCommand } from '@/features/terminals/terminalCommandQueue';
import {
  markTerminalExecution,
  useTerminalExecutionStore,
} from '@/features/terminals/terminalExecutionStore';
import type { Part, ActionStatus } from '@/types';
import type { MessageId } from '@/types/common';

type ActionPart = Extract<Part, { kind: 'action_proposal' }>;

export interface ActionApprovalCardProps {
  part: ActionPart;
  allParts: Part[];
  messageId: MessageId;
  chatId: string;
}

/* --------------------------------------------------------------------------
 * Status visuals
 * --------------------------------------------------------------------------*/

interface StatusVisual {
  icon: LucideIcon;
  /** Tailwind class for the icon colour. */
  iconClass: string;
  /** Short status word shown next to the icon. */
  label: string;
  /** Border accent (left edge). */
  borderClass: string;
}

const STATUS_VISUALS: Record<ActionStatus, StatusVisual> = {
  pending: {
    icon: Play,
    iconClass: 'text-accent-copper',
    label: 'Awaiting approval',
    borderClass: 'border-accent-copper/40',
  },
  queued: {
    icon: Loader2,
    iconClass: 'text-accent-amber animate-spin',
    label: 'Queued',
    borderClass: 'border-accent-amber/40',
  },
  running: {
    icon: Loader2,
    iconClass: 'text-accent-amber animate-spin',
    label: 'Running',
    borderClass: 'border-accent-amber/40',
  },
  success: {
    icon: Check,
    iconClass: 'text-[hsl(var(--sage))]',
    label: 'Done',
    borderClass: 'border-[hsl(var(--sage))]/40',
  },
  error: {
    icon: AlertTriangle,
    iconClass: 'text-destructive',
    label: 'Error',
    borderClass: 'border-destructive/40',
  },
  cancelled: {
    icon: X,
    iconClass: 'text-muted-foreground',
    label: 'Cancelled',
    borderClass: 'border-border',
  },
};

/* --------------------------------------------------------------------------
 * Param formatting
 * --------------------------------------------------------------------------*/

/**
 * Render a single param value as a short, copy-friendly string. We
 * deliberately avoid pretty-printing JSON because the user is scanning
 * for "what would this do" — `cwd: C:\...` reads better than a multi-
 * line block.
 */
function formatParamValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 77) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* --------------------------------------------------------------------------
 * Component
 * --------------------------------------------------------------------------*/

export function ActionApprovalCard({
  part,
  allParts,
  messageId,
  chatId,
}: ActionApprovalCardProps) {
  const def = resolveAction(part.action_id);
  const executionId = (part.result as { executionId?: string } | undefined)?.executionId;
  const execution = useTerminalExecutionStore((state) =>
    executionId ? state.executions[executionId] : undefined,
  );
  const effectiveStatus: ActionStatus = (() => {
    if (!execution) return part.status;
    if (execution.status === 'queued' || execution.status === 'starting') return 'queued';
    if (execution.status === 'running') return 'running';
    if (execution.status === 'complete') return 'success';
    if (execution.status === 'failed') return 'error';
    return 'cancelled';
  })();
  const visual = STATUS_VISUALS[effectiveStatus] ?? STATUS_VISUALS.pending;
  const Icon = def?.icon ?? HelpCircle;
  const StatusIcon = visual.icon;

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const syncedExecutionStatusRef = useRef<string>();
  const pendingActions = allParts.filter(
    (p): p is ActionPart => p.kind === 'action_proposal' && p.status === 'pending',
  );
  const isFirstPending = pendingActions[0]?.call_id === part.call_id;

  /** Persist a status patch onto the matching part inside the message. */
  const writeStatus = async (patch: Partial<ActionPart>): Promise<void> => {
    const msg = await messageRepo.getById(messageId);
    if (!msg) return;
    const nextParts: Part[] = msg.parts.map((p) =>
      p.kind === 'action_proposal' && p.call_id === part.call_id
        ? { ...p, ...patch }
        : p,
    );
    await messageRepo.update(messageId, { parts: nextParts });
  };

  useEffect(() => {
    if (!execution || syncedExecutionStatusRef.current === execution.status) return;
    syncedExecutionStatusRef.current = execution.status;
    if (execution.status === 'complete') {
      void writeStatus({ status: 'success', error: undefined });
    } else if (execution.status === 'failed') {
      void writeStatus({
        status: 'error',
        error: execution.exitCode === undefined
          ? 'The command failed.'
          : `The command exited with code ${execution.exitCode}.`,
      });
    } else if (execution.status === 'cancelled') {
      void writeStatus({ status: 'cancelled', error: undefined });
    }
  }, [execution?.exitCode, execution?.status]);

  const handleApprove = async () => {
    if (busyRef.current || part.status !== 'pending') return;
    busyRef.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      await writeStatus({ status: 'running' });
      const result = await runAction(
        part.action_id,
        part.params,
        { source: 'ai', chatId, messageId, callId: part.call_id },
        { emitToast: false },
      );
      const queued = result.ok
        && typeof result.data === 'object'
        && result.data !== null
        && (result.data as { state?: string }).state === 'queued';
      await writeStatus(result.ok
        ? { status: queued ? 'queued' : 'success', result: result.data, error: undefined }
        : { status: 'error', error: result.error });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'The action could not start. Please retry.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busyRef.current || part.status !== 'pending') return;
    busyRef.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      await writeStatus({ status: 'cancelled' });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'The action could not be cancelled.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCancelExecution = async () => {
    if (busyRef.current || !executionId) return;
    busyRef.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      const removedFromQueue = cancelQueuedTerminalCommand(executionId);
      if (!removedFromQueue && execution?.sessionId) {
        await invoke('terminal_kill', { sessionId: execution.sessionId });
      } else if (!removedFromQueue && execution?.status === 'running') {
        throw new Error('The running terminal session is not available to cancel.');
      }
      syncedExecutionStatusRef.current = 'cancelled';
      markTerminalExecution(executionId, 'cancelled', { exitCode: null });
      await writeStatus({ status: 'cancelled', error: undefined });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'The command could not be cancelled.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleApproveAll = async () => {
    if (busyRef.current || part.status !== 'pending' || pendingActions.length <= 1) return;
    busyRef.current = true;
    setBusy(true);
    setLocalError(null);
    const runnable = pendingActions.filter((p) => resolveAction(p.action_id));
    if (runnable.length === 0) {
      busyRef.current = false;
      setBusy(false);
      return;
    }

    const mark = async (callId: string, patch: Partial<ActionPart>) => {
      const msg = await messageRepo.getById(messageId);
      if (!msg) return;
      await messageRepo.update(messageId, {
        parts: msg.parts.map((p) =>
          p.kind === 'action_proposal' && p.call_id === callId
            ? { ...p, ...patch }
            : p,
        ),
      });
    };

    try {
      for (const action of runnable) {
        await mark(action.call_id, { status: 'running' });
        const result = await runAction(
          action.action_id,
          action.params,
          { source: 'ai', chatId, messageId, callId: action.call_id },
          { emitToast: false },
        );
        const queued = result.ok
          && typeof result.data === 'object'
          && result.data !== null
          && (result.data as { state?: string }).state === 'queued';
        await mark(action.call_id, result.ok
          ? { status: queued ? 'queued' : 'success', result: result.data, error: undefined }
          : { status: 'error', error: result.error });
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'One or more actions could not run.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Body text for the inline result line shown after a non-pending run.
  const resultLine = (() => {
    if (effectiveStatus === 'queued') {
      return execution?.status === 'starting' ? 'Starting in Terminal.' : 'Queued in Terminal.';
    }
    if (effectiveStatus === 'running') return 'Running in Terminal.';
    if (effectiveStatus === 'success') {
      const data = part.result as { summary?: string } | undefined;
      return data?.summary ?? 'Action completed.';
    }
    if (effectiveStatus === 'error') {
      if (execution?.exitCode !== undefined) return `The command exited with code ${execution.exitCode}.`;
      return part.error ?? 'Unknown error.';
    }
    if (effectiveStatus === 'cancelled') return 'You cancelled this action.';
    return null;
  })();

  return (
    <div
      className={cn(
        'rounded-md border-l-2 border bg-elevated px-3 py-2.5',
        'flex flex-col gap-1.5',
        visual.borderClass,
      )}
      data-action-id={part.action_id}
      data-status={effectiveStatus}
    >
      {/* Header: action icon + label + status badge */}
      <div className="flex items-center gap-2 text-secondary">
        <Icon className="h-4 w-4 text-accent-copper shrink-0" />
        <span className="font-medium text-foreground">
          {def?.label ?? part.action_id}
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-metadata uppercase tracking-wide',
            visual.iconClass,
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {visual.label}
        </span>
      </div>

      {/* Rationale (italic muted) — AI's "why this action?" */}
      {part.rationale && (
        <div className="text-secondary italic text-muted-foreground leading-relaxed">
          {part.rationale}
        </div>
      )}

      {/* Params summary, only for actions that take any. */}
      {Object.keys(part.params).length > 0 && (
        <ul className="flex flex-col gap-0.5 text-metadata text-muted-foreground font-mono">
          {Object.entries(part.params).map(([k, v]) => (
            <li key={k} className="truncate">
              <span className="text-foreground/80">{k}</span>
              <span className="opacity-60"> = </span>
              <span>{formatParamValue(v)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer: buttons (pending) or result text (anything else) */}
      {part.status === 'pending' ? (
        <div className="mt-1 flex items-center gap-2">
          {isFirstPending && pendingActions.length > 1 && (
            <Button
              size="sm"
              variant="accent"
              onClick={handleApproveAll}
              disabled={busy}
              title={`Run all ${pendingActions.length} pending actions in this message`}
            >
              <Check className="h-3.5 w-3.5" /> Approve all ({pendingActions.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            onClick={handleApprove}
            disabled={busy || !def}
            title={
              def
                ? `Run ${def.label}`
                : `Unknown action: ${part.action_id}. Cannot run.`
            }
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          {!def && (
            <span className="text-metadata text-destructive">
              Action <span className="font-mono">{part.action_id}</span> isn't
              registered. The AI may have hallucinated the id.
            </span>
          )}
        </div>
      ) : (
        <>
        {resultLine && (
          <div
            className={cn(
              'text-secondary leading-relaxed',
              effectiveStatus === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {resultLine}
          </div>
        )}
        {(effectiveStatus === 'queued' || effectiveStatus === 'running') && executionId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancelExecution}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" /> Cancel command
          </Button>
        )}
        </>
      )}
      {localError && (
        <p role="alert" className="text-secondary text-destructive">
          {localError} No duplicate action was started.
        </p>
      )}
    </div>
  );
}
