import { describe, expect, it, vi } from 'vitest';
import { nativeOpenCodeEvents, nativeOpenCodeRequest } from './openCodeNativeTransport';

describe('native OpenCode transport', () => {
  it('sends only generation-bound request metadata through the native command', async () => {
    const invoke = vi.fn(async () => ({ status: 200, statusText: 'OK', body: '{"healthy":true}' }));
    const response = await nativeOpenCodeRequest(
      'opencode-server-generation',
      '/global/health?directory=C%3A%5Cworkspace',
      { method: 'GET' },
      5_000,
      async () => ({ invoke, channel: vi.fn() as never }),
    );

    expect(await response.json()).toEqual({ healthy: true });
    expect(invoke).toHaveBeenCalledWith('opencode_server_request', {
      request: {
        generation: 'opencode-server-generation',
        route: { kind: 'health' },
        directory: 'C:\\workspace',
        body: undefined,
        timeoutMs: 5_000,
      },
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/authorization|password|basic/i);
  });

  it.each([204, 205, 304])('constructs bodyless HTTP %s responses', async (status) => {
    const invoke = vi.fn(async () => ({ status, statusText: 'No Content', body: '' }));

    const response = await nativeOpenCodeRequest(
      'opencode-server-generation',
      '/session/session-1/prompt_async',
      { method: 'POST', body: '{"parts":[{"type":"text","text":"hello"}]}' },
      5_000,
      async () => ({ invoke, channel: vi.fn() as never }),
    );

    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });

  it('delivers native channel events and cancels the exact generation stream', async () => {
    let onmessage: ((message: unknown) => void) | undefined;
    const invoke = vi.fn(async (command: string, _args: Record<string, unknown>) => {
      if (command === 'opencode_server_event_stream') {
        queueMicrotask(() => {
          onmessage?.({
            kind: 'event',
            data: JSON.stringify({ type: 'message.part.updated', properties: { delta: 'hello' } }),
          });
          onmessage?.({ kind: 'done' });
        });
      }
      return command === 'opencode_server_event_cancel' ? true : undefined;
    });
    const bridge = async () => ({
      invoke,
      channel: (handler: (message: unknown) => void) => {
        onmessage = handler;
        return { onmessage: handler };
      },
    });

    const received = [];
    for await (const event of nativeOpenCodeEvents(
      'opencode-server-generation',
      '/event?directory=C%3A%5Cworkspace',
      undefined,
      bridge,
    )) {
      received.push(event);
    }

    expect(received).toEqual([
      { type: 'message.part.updated', properties: { delta: 'hello' } },
    ]);
    const start = invoke.mock.calls.find(([command]) => command === 'opencode_server_event_stream');
    const cancel = invoke.mock.calls.find(([command]) => command === 'opencode_server_event_cancel');
    expect(start?.[1]).toMatchObject({
      generation: 'opencode-server-generation',
      directory: 'C:\\workspace',
    });
    expect(cancel?.[1]).toMatchObject({
      generation: 'opencode-server-generation',
      streamId: expect.stringMatching(/^opencode-stream-[a-f0-9]+$/u),
    });
  });

  it('cancels without yielding when the caller aborts', async () => {
    let onmessage: ((message: unknown) => void) | undefined;
    const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => undefined);
    const controller = new AbortController();
    const bridge = async () => ({
      invoke,
      channel: (handler: (message: unknown) => void) => {
        onmessage = handler;
        return { onmessage: handler };
      },
    });
    const consume = (async () => {
      for await (const _event of nativeOpenCodeEvents(
        'opencode-server-generation',
        '/event',
        controller.signal,
        bridge,
      )) {
        throw new Error('unexpected event');
      }
    })();

    await Promise.resolve();
    controller.abort();
    onmessage?.({ kind: 'done' });
    await consume;
    expect(invoke).toHaveBeenCalledWith(
      'opencode_server_event_cancel',
      expect.objectContaining({ generation: 'opencode-server-generation' }),
    );
  });
});
