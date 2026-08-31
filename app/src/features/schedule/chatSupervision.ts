const CHAT_SUPERVISION_KEYS = new Set([
  'version',
  'sourceChatId',
  'supervisingChatId',
  'originatingMessageId',
  'originatingCardMessageId',
  'handoffPolicyVersion',
  'instruction',
  'allowReplyToSource',
  'endsAt',
]);

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface ChatSupervisionBindingV1 {
  version: 1;
  sourceChatId: string;
  supervisingChatId: string;
  originatingMessageId: string;
  originatingCardMessageId: string;
  handoffPolicyVersion: 1;
  instruction: string;
  allowReplyToSource: boolean;
  endsAt?: number;
}

export function parseChatSupervisionBinding(value: unknown): ChatSupervisionBindingV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !CHAT_SUPERVISION_KEYS.has(key)) ||
    record.version !== 1 ||
    !STABLE_ID.test(String(record.sourceChatId ?? '')) ||
    !STABLE_ID.test(String(record.supervisingChatId ?? '')) ||
    !STABLE_ID.test(String(record.originatingMessageId ?? '')) ||
    !STABLE_ID.test(String(record.originatingCardMessageId ?? '')) ||
    record.handoffPolicyVersion !== 1 ||
    typeof record.instruction !== 'string' ||
    !record.instruction.trim() ||
    record.instruction !== record.instruction.trim() ||
    record.instruction.length > 8_000 ||
    typeof record.allowReplyToSource !== 'boolean' ||
    (record.endsAt !== undefined &&
      (!Number.isSafeInteger(record.endsAt) || (record.endsAt as number) <= 0))
  ) {
    return null;
  }

  return {
    version: 1,
    sourceChatId: record.sourceChatId as string,
    supervisingChatId: record.supervisingChatId as string,
    originatingMessageId: record.originatingMessageId as string,
    originatingCardMessageId: record.originatingCardMessageId as string,
    handoffPolicyVersion: 1,
    instruction: record.instruction,
    allowReplyToSource: record.allowReplyToSource,
    ...(record.endsAt === undefined ? {} : { endsAt: record.endsAt as number }),
  };
}
