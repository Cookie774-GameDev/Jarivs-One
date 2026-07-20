import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Clock3,
  HelpCircle,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  parseTaskApprovalCallId,
  presentJarvisApproval,
} from '@/features/jarvis-runs/approvalBridge';
import { resolveAction } from '@/lib/actions';
import type { ActionRunContext } from '@/lib/actions/types';
import type { JarvisRun } from '@/lib/jarvis/contracts';
import type {
  JarvisCanonicalActionExecutionResult,
  JarvisKernelActionPort,
} from '@/lib/jarvis/approvalEngine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getActiveAccountIdentity } from '@/lib/accountIdentity';
import type { ActionStatus, Part } from '@/types';
import type { MessageId } from '@/types/common';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import { SIK_CONTROL, SIK_EVIDENCE } from '@/lib/jarvis/smoke/evidenceIds';

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
});

type ActionPart = Extract<Part, { kind: 'action_proposal' }>;
export type CanonicalApprovalPresentation = ReturnType<typeof presentJarvisApproval>;

export interface ActionApprovalCardProps {
  part: ActionPart;
  allParts: Part[];
  messageId: MessageId;
  chatId: string;
  /** Task 16B supplies this from canonical repository readback. */
  presentation?: CanonicalApprovalPresentation;
}

/** A native terminal handoff is running truth, never settled success. */
export function actionStatusForCanonicalExecution(
  outcome: JarvisCanonicalActionExecutionResult,
): Extract<ActionStatus, 'queued' | 'success' | 'error'> {
  if (outcome.kind === 'handoff_pending') return 'queued';
  return outcome.result.ok ? 'success' : 'error';
}

/** @internal Pure controller; Task 16B owns production card injection. */
export function createCanonicalApprovalCardController(
  actions: Pick<JarvisKernelActionPort, 'decide' | 'execute'>,
) {
  function canonicalApprovalId(callId: string): string | undefined {
    return parseTaskApprovalCallId(callId)?.approvalId;
  }

  type ApprovalRequest = { parentRun: JarvisRun; callId: string; context: ActionRunContext };
  async function approve(input: ApprovalRequest) {
    const approvalId = canonicalApprovalId(input.callId);
    if (!approvalId) return { kind: 'invalid_approval_call' as const };
    const decision = await actions.decide({
      parentRun: input.parentRun,
      approvalId,
      decision: 'approve',
    });
    if (decision.kind !== 'committed') return decision;
    if (
      decision.value.id !== approvalId ||
      decision.value.runId !== input.parentRun.id ||
      decision.value.status !== 'approved'
    ) {
      return { kind: 'approval_state_mismatch' as const };
    }
    return await actions.execute({
      parentRun: input.parentRun,
      approvalId,
      context: input.context,
    });
  }

  return Object.freeze({
    approve,
    async deny(input: { parentRun: JarvisRun; callId: string }) {
      const approvalId = canonicalApprovalId(input.callId);
      if (!approvalId) return { kind: 'invalid_approval_call' as const };
      const decision = await actions.decide({
        parentRun: input.parentRun,
        approvalId,
        decision: 'deny',
      });
      if (decision.kind !== 'committed') return decision;
      if (
        decision.value.id !== approvalId ||
        decision.value.runId !== input.parentRun.id ||
        decision.value.status !== 'denied'
      ) {
        return { kind: 'approval_state_mismatch' as const };
      }
      return decision;
    },
    async approveAll(requests: readonly ApprovalRequest[]) {
      const outcomes: Awaited<ReturnType<typeof approve>>[] = [];
      for (const request of requests) {
        const outcome = await approve(request);
        outcomes.push(outcome);
        if (outcome.kind !== 'committed') break;
        if (outcome.value.kind === 'settled' && !outcome.value.result.ok) break;
      }
      return Object.freeze(outcomes);
    },
  });
}

interface StatusVisual {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  borderClass: string;
}

const STATUS_VISUALS: Record<ActionStatus, StatusVisual> = {
  pending: {
    icon: Clock3,
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

function resultLine(part: ActionPart): string | undefined {
  if (part.status === 'queued') return 'Execution handed off.';
  if (part.status === 'running') return 'Execution is still in progress.';
  if (part.status === 'success') return 'Action completed.';
  if (part.status === 'error') return part.error ?? 'The action failed.';
  if (part.status === 'cancelled') return 'This action was denied or cancelled.';
  return undefined;
}

/**
 * Read-only projection until Task 16B injects the canonical controller. Legacy
 * cards remain truthful and cannot call an action or mutate lifecycle state.
 */
export function ActionApprovalCard({ part, presentation }: ActionApprovalCardProps) {
  const definition = resolveAction(part.action_id);
  const canonical = parseTaskApprovalCallId(part.call_id);
  const visual = STATUS_VISUALS[part.status] ?? STATUS_VISUALS.pending;
  const Icon = definition?.icon ?? HelpCircle;
  const StatusIcon = visual.icon;
  const terminalCopy = resultLine(part);
  const [smokeDecisionState, setSmokeDecisionState] = React.useState<
    'idle' | 'busy' | 'submitted' | 'failed'
  >('idle');
  const smokeDangerous = part.action_id === 'task.cancel' || part.action_id === 'terminal.run';

  const approveSmokeFixture = async () => {
    if (!KERNEL_SMOKE_ENABLED || !canonical || smokeDecisionState === 'busy') return;
    const identity = getActiveAccountIdentity();
    if (!identity) {
      setSmokeDecisionState('failed');
      return;
    }
    setSmokeDecisionState('busy');
    try {
      const { createJarvisKernelClient } = await import('@/lib/jarvis/kernelClient');
      const client = createJarvisKernelClient();
      try {
        const decision = await client.decideApproval({
          accountId: identity.accountId,
          approvalId: canonical.approvalId,
          decision: 'approve',
        });
        if (
          decision.kind !== 'approval_decided' ||
          decision.approvalId !== canonical.approvalId ||
          decision.status !== 'approved'
        ) {
          throw new Error('kernel_smoke_approval_decision_failed');
        }
        const execution = await client.executeApproval({
          accountId: identity.accountId,
          approvalId: canonical.approvalId,
        });
        if (
          execution.kind !== 'approval_execution' ||
          execution.approvalId !== canonical.approvalId ||
          !['queued', 'running', 'completed'].includes(execution.status)
        ) {
          throw new Error('kernel_smoke_approval_execution_failed');
        }
        setSmokeDecisionState('submitted');
      } finally {
        client.dispose();
      }
    } catch {
      setSmokeDecisionState('failed');
    }
  };

  return (
    <div
      className={cn(
        'rounded-md border-l-2 border bg-elevated px-3 py-2.5',
        'flex flex-col gap-1.5',
        visual.borderClass,
      )}
      data-action-id={part.action_id}
      data-status={part.status}
      data-approval-kind={canonical ? 'canonical' : 'legacy'}
      data-sik-evidence={KERNEL_SMOKE_ENABLED ? SIK_EVIDENCE.approvalCard : undefined}
    >
      <div className="flex items-center gap-2 text-secondary">
        <Icon className="h-4 w-4 shrink-0 text-accent-copper" />
        <span className="font-medium text-foreground">
          {presentation?.actionId ?? definition?.label ?? part.action_id}
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

      {canonical && presentation ? (
        <>
          <p className="text-secondary italic leading-relaxed text-muted-foreground">
            {presentation.expectedEffect}
          </p>
          {presentation.parameters.length > 0 && (
            <ul className="flex flex-col gap-0.5 font-mono text-metadata text-muted-foreground">
              {presentation.parameters.map(({ field, safeValue }) => (
                <li key={field} className="truncate">
                  <span className="text-foreground/80">{field}</span>
                  <span className="opacity-60"> = </span>
                  <span>{safeValue}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : part.status === 'pending' ? (
        <p className="text-secondary leading-relaxed text-muted-foreground">
          {canonical
            ? 'Canonical approval controls are not connected yet. Review and retry manually.'
            : 'This historical action card is view-only. Review current state and retry manually.'}
        </p>
      ) : null}

      {terminalCopy && (
        <p
          className={cn(
            'text-secondary leading-relaxed',
            part.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {terminalCopy}
        </p>
      )}

      {KERNEL_SMOKE_ENABLED && canonical && part.status === 'pending' ? (
        <Button
          type="button"
          size="sm"
          variant={smokeDangerous ? 'destructive' : 'secondary'}
          disabled={smokeDecisionState === 'busy' || smokeDecisionState === 'submitted'}
          onClick={() => void approveSmokeFixture()}
          data-sik-evidence={
            smokeDangerous ? SIK_CONTROL.approvalConfirmDangerous : SIK_CONTROL.approvalConfirm
          }
          data-approval-submit-state={smokeDecisionState}
        >
          {smokeDecisionState === 'busy' ? 'Approving…' : 'Approve fixed action'}
        </Button>
      ) : null}
    </div>
  );
}
