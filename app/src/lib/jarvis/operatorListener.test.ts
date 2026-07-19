import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCanonicalOperatorApprovalAdapter,
  startJarvisOperatorListener,
} from './operatorListener';

type AppendedMessage = Parameters<
  Parameters<typeof startJarvisOperatorListener>[0]['appendMessage']
>[0];

describe('Jarvis operator canonical boundary', () => {
  let stop: (() => void) | undefined;
  afterEach(() => stop?.());

  it('creates canonical approval presentation only through the injected action port', async () => {
    const approval = {
      id: 'jappr_1',
      runId: 'jrun_1',
      status: 'pending',
      actionId: 'terminal.create',
      expectedEffect: 'Create one approved terminal.',
      risk: 'dangerous',
      params: {},
      secretHandleRefs: [{ field: 'token', handleId: 'jsecret_private' }],
    } as never;
    const create = vi.fn(async () => ({ kind: 'committed' as const, value: approval }));
    const adapter = createCanonicalOperatorApprovalAdapter({ create } as never);
    const request = {
      parentRun: { id: 'jrun_1', accountId: 'account-a' },
      attempt: { kind: 'initial', runId: 'jrun_1', requestId: 'request-1', attemptNumber: 1 },
      actionId: 'terminal.create',
      actionVersion: 1,
      params: {},
      expiresAt: 20_000,
    } as never;

    await expect(adapter.propose(request)).resolves.toEqual({
      kind: 'committed',
      value: {
        approvalId: 'jappr_1',
        status: 'pending',
        callId: 'jarvisapproval:jappr_1',
        presentation: {
          actionId: 'terminal.create',
          expectedEffect: 'Create one approved terminal.',
          risk: 'dangerous',
          parameters: [],
        },
      },
    });
    expect(create).toHaveBeenCalledWith(request);
    expect(JSON.stringify(await adapter.propose(request))).not.toContain('jsecret_private');
  });

  it('rejects a canonical create result that is not pending', async () => {
    const create = vi.fn(async () => ({
      kind: 'committed' as const,
      value: { id: 'jappr_1', status: 'approved' } as never,
    }));
    const adapter = createCanonicalOperatorApprovalAdapter({ create } as never);
    await expect(adapter.propose({} as never)).resolves.toEqual({
      kind: 'approval_state_mismatch',
    });
  });

  it('fails closed on actionable intent without calling a handler or provider', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({ appendMessage });
    window.addEventListener('jarvis:send', provider);

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Rename this chat to Agent Testing.' },
      }),
    );

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalledOnce());
    expect(provider).not.toHaveBeenCalled();
    expect(appendMessage.mock.calls[0]?.[0].parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringMatching(/canonical approval service.*no action was started/i),
    });
    window.removeEventListener('jarvis:send', provider);
  });

  it('blocks invented destructive execution with a scoped approval explanation', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    stop = startJarvisOperatorListener({ appendMessage });
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Delete every project.' },
      }),
    );

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalledOnce());
    const firstPart = appendMessage.mock.calls[0]?.[0].parts[0];
    expect(firstPart?.kind === 'text' ? firstPart.text : '').toMatch(/explicit scoped approval/i);
  });

  it.each([
    ['Run the plugin tool with a timeout.', /which connected plugin and declared tool/i],
    ['Use an MCP tool for this.', /which registered MCP server and declared tool/i],
  ])('asks for missing capability input without invoking anything', async (text, expected) => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    stop = startJarvisOperatorListener({ appendMessage });
    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId: 'chat-1', text } }));

    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalledOnce());
    const part = appendMessage.mock.calls[0]?.[0].parts[0];
    expect(part?.kind === 'text' ? part.text : '').toMatch(expected);
    stop();
    stop = undefined;
  });

  it('leaves contextual requests to the canonical runtime pipeline', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({ appendMessage });
    window.addEventListener('jarvis:send', provider);
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Rename this chat.', filePaths: ['a.txt'] },
      }),
    );

    expect(provider).toHaveBeenCalledOnce();
    expect(appendMessage).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:send', provider);
  });

  it('lets the memory listener persist explicit preference without adding a reply', async () => {
    const appendMessage = vi.fn(async (_message: AppendedMessage) => undefined);
    const provider = vi.fn();
    stop = startJarvisOperatorListener({ appendMessage });
    window.addEventListener('jarvis:send', provider);
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Remember that I prefer concise answers.' },
      }),
    );

    await Promise.resolve();
    expect(appendMessage).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:send', provider);
  });
});
