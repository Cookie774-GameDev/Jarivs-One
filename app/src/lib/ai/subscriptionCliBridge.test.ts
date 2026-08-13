import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bind, capture, release, send } = vi.hoisted(() => ({
  bind: vi.fn(),
  capture: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/harness/toolGatewayAuthority', () => ({
  bindToolGatewaySessionAuthority: bind,
  captureToolGatewayAuthorityClaim: capture,
  releaseToolGatewaySessionAuthority: release,
}));

vi.mock('./adapters/codex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/codex')>();
  return { ...actual, codexCliAdapter: { id: 'codex-cli', send } };
});

import { CODEX_CLI_CONNECTION } from './adapters/catalog';
import { runSubscriptionCliBridge } from './subscriptionCliBridge';

describe('Codex subscription Context Map authority', () => {
  beforeEach(() => {
    bind.mockReset().mockReturnValue(true);
    capture.mockReset().mockReturnValue({ scope: {}, generation: 1 });
    release.mockReset();
    send.mockReset().mockImplementation(() =>
      (async function* () {
        yield { type: 'text', delta: 'answer' };
        yield { type: 'done', finishReason: 'completed' };
      })(),
    );
  });

  it('binds exact request authority, propagates only Context Map, and always releases', async () => {
    await expect(
      runSubscriptionCliBridge({
        connection: CODEX_CLI_CONNECTION,
        requestId: 'request-1',
        prompt: 'research',
        modelId: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        requirements: { tools: true },
        tools: { vibespace_context: true },
      }),
    ).resolves.toMatchObject({ text: 'answer', model: 'gpt-5.6-luna' });
    expect(bind).toHaveBeenCalledWith('request-1', expect.anything());
    expect(send.mock.calls[0]![0]).toMatchObject({
      requestId: 'request-1',
      modelId: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
      tools: { vibespace_context: true },
    });
    expect(release).toHaveBeenCalledWith('request-1');

    send.mockImplementationOnce(() =>
      (async function* () {
        throw new Error('transport failed');
      })(),
    );
    await expect(
      runSubscriptionCliBridge({
        connection: CODEX_CLI_CONNECTION,
        requestId: 'request-2',
        prompt: 'research',
        tools: { vibespace_context: true },
      }),
    ).rejects.toThrow('transport failed');
    expect(release).toHaveBeenCalledWith('request-2');
  });

  it('rejects missing, unknown, or mixed tool scope before dispatch', async () => {
    const invalidToolScopes: ReadonlyArray<Readonly<Record<string, boolean>> | undefined> = [
      undefined,
      { 'terminal.list': true },
      { vibespace_context: true, 'terminal.list': true },
    ];
    for (const tools of invalidToolScopes) {
      await expect(
        runSubscriptionCliBridge({
          connection: CODEX_CLI_CONNECTION,
          requestId: 'request-bad',
          prompt: 'research',
          requirements: { tools: true },
          ...(tools ? { tools } : {}),
        }),
      ).rejects.toThrow(/tool scope/);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves ordinary Codex runs authority-free', async () => {
    await runSubscriptionCliBridge({
      connection: CODEX_CLI_CONNECTION,
      requestId: 'request-ordinary',
      prompt: 'hello',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('fails closed when Codex reports a substituted model and still revokes authority', async () => {
    send.mockImplementationOnce(() =>
      (async function* () {
        yield { type: 'model', modelId: 'gpt-5.6-sol' };
      })(),
    );
    await expect(
      runSubscriptionCliBridge({
        connection: CODEX_CLI_CONNECTION,
        requestId: 'request-model',
        prompt: 'research',
        modelId: 'gpt-5.6-luna',
        tools: { vibespace_context: true },
      }),
    ).rejects.toThrow('model identity different');
    expect(release).toHaveBeenCalledWith('request-model');
  });
});
