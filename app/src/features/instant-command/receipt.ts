export type InstantCommandReceiptStatus =
  'completed' | 'queued' | 'needs_confirmation' | 'needs_clarification' | 'rejected' | 'timed_out';

export type InstantCommandFollowUp = Readonly<{
  kind: 'confirmation' | 'clarification';
  prompt: string;
}>;

export type InstantCommandReceipt = Readonly<{
  commandId: string;
  correlationId: string;
  status: InstantCommandReceiptStatus;
  acceptedAtMs: number;
  targetIds: readonly string[];
  followUp?: InstantCommandFollowUp;
}>;

const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const RECEIPT_STATUSES = new Set<InstantCommandReceiptStatus>([
  'completed',
  'queued',
  'needs_confirmation',
  'needs_clarification',
  'rejected',
  'timed_out',
]);

export function createInstantCommandReceipt(input: InstantCommandReceipt): InstantCommandReceipt {
  if (!SAFE_IDENTIFIER.test(input.commandId)) throw new Error('Invalid command id');
  if (!SAFE_IDENTIFIER.test(input.correlationId)) throw new Error('Invalid correlation id');
  if (!RECEIPT_STATUSES.has(input.status)) throw new Error('Invalid receipt status');
  if (!Number.isSafeInteger(input.acceptedAtMs) || input.acceptedAtMs < 0) {
    throw new Error('Invalid accepted time');
  }
  if (!Array.isArray(input.targetIds)) throw new Error('Invalid receipt targets');
  if (input.targetIds.some((target) => !SAFE_IDENTIFIER.test(target))) {
    throw new Error('Invalid target id');
  }
  if (input.targetIds.length > 128 || new Set(input.targetIds).size !== input.targetIds.length) {
    throw new Error('Invalid receipt targets');
  }
  const requiredFollowUp =
    input.status === 'needs_confirmation'
      ? 'confirmation'
      : input.status === 'needs_clarification'
        ? 'clarification'
        : undefined;
  if (
    (requiredFollowUp && input.followUp?.kind !== requiredFollowUp) ||
    (!requiredFollowUp && input.followUp)
  ) {
    throw new Error('Receipt follow-up does not match status');
  }
  if (
    input.followUp &&
    (!input.followUp.prompt.trim() ||
      input.followUp.prompt.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(input.followUp.prompt))
  ) {
    throw new Error('Invalid receipt follow-up prompt');
  }
  const followUp = input.followUp
    ? Object.freeze({ kind: input.followUp.kind, prompt: input.followUp.prompt })
    : undefined;
  return Object.freeze({
    commandId: input.commandId,
    correlationId: input.correlationId,
    status: input.status,
    acceptedAtMs: input.acceptedAtMs,
    targetIds: Object.freeze([...input.targetIds].sort()),
    ...(followUp ? { followUp } : {}),
  });
}
