import type {
  JarvisAuthorityBoundResult,
  JarvisRecoveryDecision,
  JarvisRecoveryScanner,
  JarvisRunStatus,
} from '@/lib/jarvis/contracts/execution';

const NONTERMINAL_STATUSES = new Set<JarvisRunStatus>([
  'queued',
  'compiling',
  'running',
  'awaiting_approval',
]);

export type VoiceRecoveryCommitResult = Readonly<{ committed: boolean }>;

export type VoiceResponseRecoveryHandle = Readonly<{
  commitRecoveredPartial(): Promise<JarvisAuthorityBoundResult<VoiceRecoveryCommitResult>>;
  dispose(): void;
}>;

export type VoiceResponseRecoverySummary = Readonly<{
  accountId: string;
  ignored: number;
  revoked: number;
  committed: number;
  conflicts: number;
}>;

export type RecoverVoiceResponsesInput = Readonly<{
  accountId: string;
  scanner: Pick<JarvisRecoveryScanner, 'scanAccount'>;
  openVoiceRecovery(
    input: Readonly<{
      accountId: string;
      runId: string;
    }>,
  ): Promise<JarvisAuthorityBoundResult<VoiceResponseRecoveryHandle>>;
}>;

function isEligible(decision: Readonly<JarvisRecoveryDecision>): boolean {
  return (
    decision.kind === 'fail_closed' &&
    NONTERMINAL_STATUSES.has(decision.run.status) &&
    decision.run.source === 'voice' &&
    (decision.reason === 'manual_retry_required' || decision.reason === 'ambiguous_executor_state')
  );
}

export async function recoverVoiceResponses(
  input: RecoverVoiceResponsesInput,
): Promise<VoiceResponseRecoverySummary> {
  const decisions = await input.scanner.scanAccount(input.accountId);
  let ignored = 0;
  let revoked = 0;
  let committed = 0;
  let conflicts = 0;
  const failures: unknown[] = [];

  for (const decision of decisions) {
    if (!isEligible(decision)) {
      ignored += 1;
      continue;
    }

    try {
      const opened = await input.openVoiceRecovery({
        accountId: input.accountId,
        runId: decision.run.id,
      });
      switch (opened.kind) {
        case 'account_authority_revoked':
          revoked += 1;
          break;
        case 'committed': {
          const handle = opened.value;
          try {
            const result = await handle.commitRecoveredPartial();
            if (result.kind === 'account_authority_revoked') revoked += 1;
            else if (result.value.committed) committed += 1;
            else conflicts += 1;
          } finally {
            handle.dispose();
          }
          break;
        }
      }
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'voice_response_recovery_failed');
  }

  return Object.freeze({
    accountId: input.accountId,
    ignored,
    revoked,
    committed,
    conflicts,
  });
}
