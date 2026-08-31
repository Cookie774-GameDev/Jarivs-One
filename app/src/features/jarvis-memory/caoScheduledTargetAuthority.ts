import type { CaoLearningExecutionInput, CaoLearningExecutionResult } from './caoScheduledLearning';
import type { CaoTargetKind, CaoTargetLeaseV1 } from '@/lib/jarvis/contracts/execution';
import { validateCaoTargetLease } from '@/lib/jarvis/contracts/validators';

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type CaoScheduledTargetAuthorityErrorCode =
  | 'cao_learning_target_lease_required'
  | 'cao_learning_target_lease_scope_mismatch'
  | 'cao_learning_target_lease_invalid'
  | 'cao_learning_target_authority_unavailable'
  | 'cao_learning_target_not_authorized'
  | 'cao_learning_target_revision_stale';

export class CaoScheduledTargetAuthorityError extends Error {
  readonly code: CaoScheduledTargetAuthorityErrorCode;

  constructor(code: CaoScheduledTargetAuthorityErrorCode) {
    super(code);
    this.name = 'CaoScheduledTargetAuthorityError';
    this.code = code;
  }
}

type VerifyTargetLeaseInput = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  leaseId: string;
}>;

export type CaoScheduledTargetExecutionInput = Readonly<{
  execution: CaoLearningExecutionInput;
  runId: string;
  leaseId: string;
  targetKind: CaoTargetKind;
  targetRevision: number;
}>;

type Dependencies = Readonly<{
  authority: Readonly<{
    verify(input: VerifyTargetLeaseInput): Promise<CaoTargetLeaseV1>;
  }>;
  execute(input: CaoLearningExecutionInput): Promise<CaoLearningExecutionResult>;
}>;

function validId(value: string): boolean {
  return OPAQUE_ID.test(value);
}

function requireExplicitAuthority(input: CaoScheduledTargetExecutionInput): void {
  if (!validId(input.leaseId) || !validId(input.runId)) {
    throw new CaoScheduledTargetAuthorityError('cao_learning_target_lease_required');
  }
  if (!Number.isSafeInteger(input.targetRevision) || input.targetRevision < 0) {
    throw new CaoScheduledTargetAuthorityError('cao_learning_target_revision_stale');
  }
}

function assertExactScope(lease: CaoTargetLeaseV1, input: CaoScheduledTargetExecutionInput): void {
  const { execution } = input;
  if (
    lease.leaseId !== input.leaseId ||
    lease.accountId !== execution.accountId ||
    lease.workspaceId !== execution.workspaceId ||
    lease.projectId !== execution.projectId ||
    lease.runId !== input.runId
  ) {
    throw new CaoScheduledTargetAuthorityError('cao_learning_target_lease_scope_mismatch');
  }
}

function assertExactTarget(lease: CaoTargetLeaseV1, input: CaoScheduledTargetExecutionInput): void {
  const target = lease.targets.find(
    (candidate) =>
      candidate.kind === input.targetKind && candidate.targetId === input.execution.targetId,
  );
  if (!target) {
    throw new CaoScheduledTargetAuthorityError('cao_learning_target_not_authorized');
  }
  if (target.revision !== input.targetRevision) {
    throw new CaoScheduledTargetAuthorityError('cao_learning_target_revision_stale');
  }
}

function isStableAuthorityError(error: unknown): error is Error {
  return error instanceof Error && /^cao_(?:target|run)_[a-z0-9_]+$/.test(error.message);
}

export function createCaoScheduledTargetExecution(dependencies: Dependencies): Readonly<{
  execute(input: CaoScheduledTargetExecutionInput): Promise<CaoLearningExecutionResult>;
}> {
  return {
    async execute(input) {
      const snapshot = structuredClone(input);
      requireExplicitAuthority(snapshot);
      let recovered: CaoTargetLeaseV1;
      try {
        recovered = await dependencies.authority.verify({
          accountId: snapshot.execution.accountId,
          workspaceId: snapshot.execution.workspaceId,
          projectId: snapshot.execution.projectId,
          runId: snapshot.runId,
          leaseId: snapshot.leaseId,
        });
      } catch (error) {
        if (isStableAuthorityError(error)) throw error;
        throw new CaoScheduledTargetAuthorityError('cao_learning_target_authority_unavailable');
      }
      const validated = validateCaoTargetLease(recovered);
      if (!validated.ok) {
        throw new CaoScheduledTargetAuthorityError('cao_learning_target_lease_invalid');
      }
      const lease = validated.value;
      assertExactScope(lease, snapshot);
      assertExactTarget(lease, snapshot);
      return dependencies.execute(snapshot.execution);
    },
  };
}
