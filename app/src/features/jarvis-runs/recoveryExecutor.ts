import type { JarvisApprovalRepository } from '@/lib/db/jarvisRepositories';
import type {
  JarvisApprovalV1,
  JarvisRecoveryDecision,
  JarvisRecoveryScanner,
} from '@/lib/jarvis/contracts';
import { createTaskApprovalCallId, presentJarvisApproval } from './approvalBridge';

const MANUAL_RETRY_MESSAGE =
  'This task could not be recovered safely. Review it and retry manually.';

/** Pure presentation adapter. It never resumes or executes recovered work. */
export function presentCanonicalJarvisRecovery(
  decision: Readonly<JarvisRecoveryDecision>,
  approval: Readonly<JarvisApprovalV1> | undefined,
) {
  if (
    decision.kind === 'await_approval' &&
    approval?.id === decision.approvalId &&
    approval.runId === decision.run.id &&
    approval.status === 'pending'
  ) {
    return Object.freeze({
      kind: 'await_approval' as const,
      runId: decision.run.id,
      callId: createTaskApprovalCallId(approval.id),
      presentation: presentJarvisApproval(approval),
    });
  }
  return Object.freeze({
    kind: 'manual_retry_required' as const,
    runId: decision.run.id,
    message: MANUAL_RETRY_MESSAGE,
  });
}

export type JarvisRecoveryPresentation = ReturnType<typeof presentCanonicalJarvisRecovery>;

interface RecoveryExecutorBindings {
  accountId?: string;
  scanner?: Pick<JarvisRecoveryScanner, 'scanAccount'>;
  approvals?: Pick<JarvisApprovalRepository, 'getById'>;
  onPresentation?: (presentation: JarvisRecoveryPresentation) => Promise<void> | void;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  runLimit?: number;
  eventLimitPerRun?: number;
}

/**
 * Presents Task 18's bounded recovery decisions. Missing canonical wiring is
 * inert, and no decision path has action, provider, or lifecycle-write authority.
 */
export async function resumeRecoverableJarvisRuns(
  bindings: RecoveryExecutorBindings = {},
): Promise<number> {
  const isCurrent = () => !bindings.signal?.aborted && (bindings.isCurrent?.() ?? true);
  if (
    !isCurrent() ||
    !bindings.accountId ||
    !bindings.scanner ||
    !bindings.approvals ||
    !bindings.onPresentation
  ) {
    return 0;
  }

  const decisions = await bindings.scanner.scanAccount(bindings.accountId, {
    runLimit: bindings.runLimit,
    eventLimitPerRun: bindings.eventLimitPerRun,
  });
  let presented = 0;
  for (const decision of decisions) {
    if (!isCurrent()) break;
    let approval: JarvisApprovalV1 | undefined;
    if (decision.kind === 'await_approval') {
      try {
        approval = await bindings.approvals.getById(bindings.accountId, decision.approvalId);
      } catch {
        approval = undefined;
      }
      if (!isCurrent()) break;
    }
    await bindings.onPresentation(presentCanonicalJarvisRecovery(decision, approval));
    presented += 1;
  }
  return presented;
}
