import type { JarvisApprovalV1 } from '@/lib/jarvis/contracts';

const APPROVAL_CALL_PREFIX = 'jarvisapproval:';
const MAX_ACTION_ID_LENGTH = 128;
const MAX_EXPECTED_EFFECT_LENGTH = 512;
const MAX_PARAMETER_FIELD_LENGTH = 128;
const MAX_PARAMETER_VALUE_LENGTH = 160;
const MAX_PARAMETER_COUNT = 32;

export function createTaskApprovalCallId(approvalId: string): string {
  if (!approvalId || approvalId.trim() !== approvalId) throw new Error('Approval ID is invalid.');
  return `${APPROVAL_CALL_PREFIX}${encodeURIComponent(approvalId)}`;
}

export function parseTaskApprovalCallId(callId: string): { approvalId: string } | null {
  if (!callId.startsWith(APPROVAL_CALL_PREFIX)) return null;
  const encoded = callId.slice(APPROVAL_CALL_PREFIX.length);
  if (!encoded || encoded.includes(':')) return null;
  try {
    const approvalId = decodeURIComponent(encoded);
    if (!approvalId || approvalId.trim() !== approvalId) return null;
    if (createTaskApprovalCallId(approvalId) !== callId) return null;
    return { approvalId };
  } catch {
    return null;
  }
}

const SENSITIVE_PARAMETER_FIELD =
  /(?:authorization|cookie|token|jwt|api[_-]?key|password|secret|credential|private[_-]?key)/i;
const SECRET_PARAMETER_VALUE =
  /\b(?:Bearer\s+\S+|gh[pousr]_[A-Za-z0-9]{20,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9_-]{12,}|whsec_[A-Za-z0-9_]{8,}|jsecret_[A-Za-z0-9_-]+)\b/i;

function bounded(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function safeParameterValue(
  field: string,
  value: unknown,
  secretHandleIds: ReadonlySet<string>,
): string {
  if (SENSITIVE_PARAMETER_FIELD.test(field)) return '[redacted]';
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '[structured value]';
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (secretHandleIds.has(normalized) || SECRET_PARAMETER_VALUE.test(normalized))
    return '[redacted]';
  return bounded(normalized, MAX_PARAMETER_VALUE_LENGTH);
}

export function presentJarvisApproval(approval: JarvisApprovalV1): {
  actionId: string;
  expectedEffect: string;
  risk: JarvisApprovalV1['risk'];
  parameters: readonly { field: string; safeValue: string }[];
} {
  const parameters =
    approval.params && typeof approval.params === 'object' && !Array.isArray(approval.params)
      ? (approval.params as Record<string, unknown>)
      : {};
  const secretHandleIds = new Set(
    (approval.secretHandleRefs ?? []).map(({ handleId }) => handleId),
  );
  return Object.freeze({
    actionId: bounded(approval.actionId, MAX_ACTION_ID_LENGTH),
    expectedEffect: bounded(approval.expectedEffect, MAX_EXPECTED_EFFECT_LENGTH),
    risk: approval.risk,
    parameters: Object.freeze(
      Object.entries(parameters)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, MAX_PARAMETER_COUNT)
        .map(([field, value]) =>
          Object.freeze({
            field: bounded(field, MAX_PARAMETER_FIELD_LENGTH),
            safeValue: safeParameterValue(field, value, secretHandleIds),
          }),
        ),
    ),
  });
}
