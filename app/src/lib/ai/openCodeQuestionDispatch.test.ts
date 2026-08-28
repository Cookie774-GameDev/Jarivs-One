import { describe, expect, it, vi } from 'vitest';
import type { OpenCodeQuestionRequestAuthority } from './openCodeQuestionReply';
import {
  executeOpenCodeQuestionRequest,
  type ManagedOpenCodeQuestionRequest,
} from './openCodeQuestionDispatch';

const authority: OpenCodeQuestionRequestAuthority = {
  protocol: 'opencode-question-v1',
  blockId: 'qb_opencode_exact',
  requestId: 'que_native_exact',
  sessionId: 'ses_exact',
  tool: { messageId: 'msg_exact', callId: 'call_exact' },
};

const reply: ManagedOpenCodeQuestionRequest = {
  kind: 'reply',
  authority,
  method: 'POST',
  path: '/question/que_native_exact/reply',
  body: { answers: [['Alpha'], ['Red', 'Blue', 'Custom']] },
};

const reject: ManagedOpenCodeQuestionRequest = {
  kind: 'reject',
  authority,
  method: 'POST',
  path: '/question/que_native_exact/reject',
};

function dependencies(
  overrides: Partial<Parameters<typeof executeOpenCodeQuestionRequest>[1]> = {},
) {
  return {
    readWaitingAuthority: vi.fn(async () => authority),
    request: vi.fn(async () => true),
    ...overrides,
  };
}

function dispatch(
  request: ManagedOpenCodeQuestionRequest,
  deps = dependencies(),
  expected = { sessionId: authority.sessionId, blockId: authority.blockId },
) {
  return executeOpenCodeQuestionRequest(request, deps, expected);
}

describe('OpenCode question managed dispatch', () => {
  it('revalidates exact waiting authority immediately before sending the official JSON reply', async () => {
    const order: string[] = [];
    const deps = dependencies({
      readWaitingAuthority: vi.fn(async (sessionId, requestId) => {
        order.push(`read:${sessionId}:${requestId}`);
        return authority;
      }),
      request: vi.fn(async (path, init, expected) => {
        order.push('request');
        expect(path).toBe('/question/que_native_exact/reply');
        expect(init).toEqual({
          method: 'POST',
          body: JSON.stringify(reply.body),
        });
        expect(expected).toBe('json');
        return true;
      }),
    });

    await expect(dispatch(reply, deps)).resolves.toEqual({
      protocol: 'opencode-question-dispatch-receipt-v1',
      status: 'accepted',
      action: 'reply',
      sessionId: authority.sessionId,
      requestId: authority.requestId,
      blockId: authority.blockId,
      tool: authority.tool,
      questionCount: 2,
    });
    expect(order).toEqual(['read:ses_exact:que_native_exact', 'request']);
  });

  it('preserves a truly bodyless reject request', async () => {
    const request = vi.fn(async (_path: string, _init: RequestInit, _expected: 'json') => true);
    const deps = dependencies({ request });

    await expect(dispatch(reject, deps)).resolves.toMatchObject({
      status: 'accepted',
      action: 'reject',
      questionCount: 0,
    });
    expect(deps.request).toHaveBeenCalledWith(
      '/question/que_native_exact/reject',
      { method: 'POST' },
      'json',
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it.each([
    ['session', { ...authority, sessionId: 'ses_other' }],
    ['request', { ...authority, requestId: 'que_other' }],
    ['block', { ...authority, blockId: 'qb_other' }],
    ['tool call', { ...authority, tool: { ...authority.tool!, callId: 'call_other' } }],
    ['tool message', { ...authority, tool: { ...authority.tool!, messageId: 'msg_other' } }],
    ['missing tool', { ...authority, tool: undefined }],
  ])('fails closed when the waiting %s authority changed', async (_label, waiting) => {
    const deps = dependencies({ readWaitingAuthority: vi.fn(async () => waiting) });

    await expect(dispatch(reply, deps)).rejects.toThrow('OpenCode question is no longer waiting.');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('fails closed before reading when the caller session or block scope changed', async () => {
    const deps = dependencies();

    await expect(
      dispatch(reply, deps, { sessionId: 'ses_other', blockId: authority.blockId }),
    ).rejects.toThrow('OpenCode question authority is invalid.');
    await expect(
      dispatch(reply, deps, { sessionId: authority.sessionId, blockId: 'qb_other' }),
    ).rejects.toThrow('OpenCode question authority is invalid.');
    expect(deps.readWaitingAuthority).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it.each([
    ['method', { ...reply, method: 'GET' as 'POST' }],
    ['path', { ...reply, path: '/question/que_other/reply' }],
    ['empty body', { ...reply, body: { answers: [] } }],
    ['empty answer', { ...reply, body: { answers: [[]] } }],
    ['blank answer', { ...reply, body: { answers: [['   ']] } }],
    ['oversized answer', { ...reply, body: { answers: [['a'.repeat(2_049)]] } }],
    ['reject body', { ...reject, body: {} } as ManagedOpenCodeQuestionRequest],
  ])('rejects a tampered %s descriptor without I/O', async (_label, request) => {
    const deps = dependencies();

    await expect(dispatch(request, deps)).rejects.toThrow('OpenCode question request is invalid.');
    expect(deps.readWaitingAuthority).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it.each([undefined, false, {}, { data: true }, 'true'])(
    'rejects malformed success response %j without exposing it',
    async (response) => {
      const deps = dependencies({ request: vi.fn(async () => response) });

      await expect(dispatch(reply, deps)).rejects.toThrow(
        'OpenCode question response was invalid.',
      );
    },
  );

  it('sanitizes transport and waiting-state failures', async () => {
    const readFailure = dependencies({
      readWaitingAuthority: vi.fn(async () => {
        throw new Error('token=secret-waiting-value');
      }),
    });
    const requestFailure = dependencies({
      request: vi.fn(async () => {
        throw new Error('Authorization: Bearer secret-request-value');
      }),
    });

    await expect(dispatch(reply, readFailure)).rejects.toThrow(
      'OpenCode question authority could not be verified.',
    );
    await expect(dispatch(reply, readFailure)).rejects.not.toThrow('secret-waiting-value');
    await expect(dispatch(reply, requestFailure)).rejects.toThrow(
      'OpenCode question request failed.',
    );
    await expect(dispatch(reply, requestFailure)).rejects.not.toThrow('secret-request-value');
  });

  it('does not perform I/O when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = dependencies();

    await expect(
      executeOpenCodeQuestionRequest(reply, deps, {
        sessionId: authority.sessionId,
        blockId: authority.blockId,
        signal: controller.signal,
      }),
    ).rejects.toThrow('OpenCode question request was cancelled.');
    expect(deps.readWaitingAuthority).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });
});
