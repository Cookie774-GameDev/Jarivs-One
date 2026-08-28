import type {
  OpenCodeQuestionRejectRequest,
  OpenCodeQuestionReplyRequest,
  OpenCodeQuestionRequestAuthority,
} from './openCodeQuestionReply';

export type ManagedOpenCodeQuestionRequest =
  | OpenCodeQuestionReplyRequest
  | OpenCodeQuestionRejectRequest;

export interface OpenCodeQuestionDispatchReceipt {
  protocol: 'opencode-question-dispatch-receipt-v1';
  status: 'accepted';
  action: 'reply' | 'reject';
  sessionId: string;
  requestId: string;
  blockId: string;
  tool?: Readonly<{ messageId: string; callId: string }>;
  questionCount: number;
}

/**
 * This closure must already be bound to VibeSpace's authenticated managed OpenCode
 * generation and working-directory scope. This module never creates a transport.
 */
export type ManagedOpenCodeJsonRequest = (
  path: string,
  init: RequestInit,
  expected: 'json',
) => Promise<unknown>;

export interface OpenCodeQuestionDispatchDependencies {
  readWaitingAuthority(
    sessionId: string,
    requestId: string,
  ): Promise<OpenCodeQuestionRequestAuthority | undefined>;
  request: ManagedOpenCodeJsonRequest;
}

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const OPAQUE_ID = /^[A-Za-z0-9._:-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function opaqueId(value: unknown): value is string {
  return stableText(value, 512) && OPAQUE_ID.test(value);
}

function validAuthority(value: unknown): value is OpenCodeQuestionRequestAuthority {
  if (!isRecord(value)) return false;
  if (
    value.protocol !== 'opencode-question-v1' ||
    !opaqueId(value.blockId) ||
    !opaqueId(value.requestId) ||
    !value.requestId.startsWith('que') ||
    !opaqueId(value.sessionId)
  ) {
    return false;
  }
  if (value.tool === undefined) return true;
  return isRecord(value.tool) && opaqueId(value.tool.messageId) && opaqueId(value.tool.callId);
}

function sameAuthority(
  expected: OpenCodeQuestionRequestAuthority,
  waiting: OpenCodeQuestionRequestAuthority,
): boolean {
  return (
    waiting.protocol === expected.protocol &&
    waiting.blockId === expected.blockId &&
    waiting.requestId === expected.requestId &&
    waiting.sessionId === expected.sessionId &&
    waiting.tool?.messageId === expected.tool?.messageId &&
    waiting.tool?.callId === expected.tool?.callId
  );
}

function validReplyBody(value: unknown): value is OpenCodeQuestionReplyRequest['body'] {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'answers')) return false;
  if (!Array.isArray(value.answers) || value.answers.length === 0 || value.answers.length > 8) {
    return false;
  }
  return value.answers.every(
    (answer) =>
      Array.isArray(answer) &&
      answer.length > 0 &&
      answer.length <= 9 &&
      answer.every((entry) => stableText(entry, 2_048)),
  );
}

function validRequest(value: unknown): value is ManagedOpenCodeQuestionRequest {
  if (!isRecord(value) || !validAuthority(value.authority) || value.method !== 'POST') return false;
  const expectedBase = `/question/${encodeURIComponent(value.authority.requestId)}`;
  if (value.kind === 'reply') {
    return value.path === `${expectedBase}/reply` && validReplyBody(value.body);
  }
  if (value.kind === 'reject') {
    return value.path === `${expectedBase}/reject` && !('body' in value);
  }
  return false;
}

function cancelledError(): Error {
  return new Error('OpenCode question request was cancelled.');
}

export async function executeOpenCodeQuestionRequest(
  request: ManagedOpenCodeQuestionRequest,
  dependencies: OpenCodeQuestionDispatchDependencies,
  expected: { sessionId: string; blockId: string; signal?: AbortSignal },
): Promise<OpenCodeQuestionDispatchReceipt> {
  if (expected.signal?.aborted) throw cancelledError();
  if (!validRequest(request)) throw new Error('OpenCode question request is invalid.');
  if (
    !opaqueId(expected.sessionId) ||
    !opaqueId(expected.blockId) ||
    request.authority.sessionId !== expected.sessionId ||
    request.authority.blockId !== expected.blockId
  ) {
    throw new Error('OpenCode question authority is invalid.');
  }

  let waiting: OpenCodeQuestionRequestAuthority | undefined;
  try {
    waiting = await dependencies.readWaitingAuthority(
      request.authority.sessionId,
      request.authority.requestId,
    );
  } catch {
    throw new Error('OpenCode question authority could not be verified.');
  }
  if (expected.signal?.aborted) throw cancelledError();
  if (!validAuthority(waiting) || !sameAuthority(request.authority, waiting)) {
    throw new Error('OpenCode question is no longer waiting.');
  }

  const init: RequestInit = {
    method: 'POST',
    ...(request.kind === 'reply' ? { body: JSON.stringify(request.body) } : {}),
    ...(expected.signal ? { signal: expected.signal } : {}),
  };
  let response: unknown;
  try {
    response = await dependencies.request(request.path, init, 'json');
  } catch {
    if (expected.signal?.aborted) throw cancelledError();
    throw new Error('OpenCode question request failed.');
  }
  if (response !== true) throw new Error('OpenCode question response was invalid.');

  return {
    protocol: 'opencode-question-dispatch-receipt-v1',
    status: 'accepted',
    action: request.kind,
    sessionId: request.authority.sessionId,
    requestId: request.authority.requestId,
    blockId: request.authority.blockId,
    ...(request.authority.tool ? { tool: { ...request.authority.tool } } : {}),
    questionCount: request.kind === 'reply' ? request.body.answers.length : 0,
  };
}
