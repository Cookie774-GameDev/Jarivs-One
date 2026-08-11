import { describe, expect, it, vi } from 'vitest';
import { OpenCodeHarness } from './openCodeHarness';
import type { HarnessRuntimeManager, OpenCodeServerConnection } from './runtimeManager';
import type { HarnessEvent, HarnessSendRequest } from './types';

const connection: OpenCodeServerConnection = {
  baseUrl: 'http://127.0.0.1:43123/',
  username: 'vibespace',
  password: 's'.repeat(64),
  source: 'system',
  version: '1.2.3',
  generation: 'opencode-server-test',
};

function runtime(): HarnessRuntimeManager {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => ({ kind: 'ready', source: 'system', version: '1.2.3' }) as const),
    getConnection: vi.fn(() => connection),
    refresh: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
}

function sse(...values: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        values.forEach((value, index) => {
          const data = typeof value === 'string' ? value : JSON.stringify(value);
          controller.enqueue(encoder.encode(`id: ${index + 1}\ndata: ${data}\n\n`));
        });
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function providerResponse(providerId = 'anthropic', modelId = 'claude'): Response {
  return new Response(
    JSON.stringify({
      providers: [
        {
          id: providerId,
          name: providerId,
          models: { [modelId]: { name: modelId } },
        },
      ],
    }),
  );
}

function request(signal?: AbortSignal): HarnessSendRequest {
  return {
    sessionId: 'session-1',
    selection: { providerId: 'anthropic', modelId: 'claude' },
    parts: [{ type: 'text', text: 'hello' }],
    ...(signal ? { signal } : {}),
  };
}

async function collect(iterable: AsyncIterable<HarnessEvent>): Promise<HarnessEvent[]> {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('OpenCodeHarness', () => {
  it('creates VibeSpace sessions without leaking OpenCode response shapes', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'oc-1', title: 'Chat', extra: true })));
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await expect(
      harness.createSession({
        chatId: 'chat-1',
        title: 'Chat',
        workingDirectory: 'C:\\workspace',
      }),
    ).resolves.toEqual({
      id: 'oc-1',
      chatId: 'chat-1',
    });
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('directory')).toBe(
      'C:\\workspace',
    );
  });

  it('subscribes before prompting and streams normalized session events', async () => {
    const calls: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/config/providers') return providerResponse();
      if (path === '/event') {
        return sse(
          {
            type: 'message.part.updated',
            properties: {
              sessionID: 'session-1',
              delta: 'Hello',
              part: { type: 'text' },
            },
          },
          { type: 'session.idle', properties: { sessionID: 'session-1' } },
        );
      }
      return new Response(null, { status: 204 });
    });
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await expect(
      collect(harness.send({ ...request(), workingDirectory: 'C:\\workspace' })),
    ).resolves.toEqual([
      { type: 'assistant.delta', text: 'Hello' },
      { type: 'done', finishReason: 'idle' },
    ]);
    expect(calls.slice(0, 3)).toEqual([
      'GET /config/providers',
      'GET /event',
      'POST /session/session-1/prompt_async',
    ]);
    expect(
      fetch.mock.calls
        .filter(([url]) =>
          ['/event', '/session/session-1/prompt_async'].includes(new URL(String(url)).pathname),
        )
        .map(([url]) => new URL(String(url)).searchParams.get('directory')),
    ).toEqual(['C:\\workspace', 'C:\\workspace']);
  });

  it('reconnects, suppresses duplicates, and ignores malformed or cross-session events', async () => {
    let eventRequests = 0;
    const duplicate = {
      type: 'message.part.updated',
      properties: {
        sessionID: 'session-1',
        delta: 'one',
        part: { type: 'text' },
      },
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/config/providers') return providerResponse();
      if (path.endsWith('/prompt_async')) return new Response(null, { status: 204 });
      if (path === '/session/session-1') {
        return new Response(JSON.stringify({ id: 'session-1' }), { status: 200 });
      }
      if (path === '/event') {
        eventRequests += 1;
        return eventRequests === 1
          ? sse(duplicate)
          : sse(
              duplicate,
              '{broken',
              {
                type: 'message.part.updated',
                properties: {
                  sessionID: 'session-2',
                  delta: 'not ours',
                  part: { type: 'text' },
                },
              },
              { type: 'session.idle', properties: { sessionID: 'session-1' } },
            );
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const harness = new OpenCodeHarness(runtime(), {
      fetch,
      reconnectDelay: async () => undefined,
    });

    await expect(collect(harness.send(request()))).resolves.toEqual([
      { type: 'assistant.delta', text: 'one' },
      { type: 'done', finishReason: 'idle' },
    ]);
    expect(eventRequests).toBe(2);
  });

  it('honors cancellation and aborts the active OpenCode session', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/config/providers') return providerResponse();
      if (path === '/event') {
        controller.abort();
        return sse();
      }
      if (path.endsWith('/prompt_async')) return new Response(null, { status: 204 });
      if (path.endsWith('/abort')) return new Response('true', { status: 200 });
      throw new Error(`Unexpected request ${path}`);
    });
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await expect(collect(harness.send(request(controller.signal)))).resolves.toEqual([]);
    expect(fetch.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/abort'))).toBe(
      true,
    );
  });

  it('emits a sanitized terminal error when the server dies and recovery fails', async () => {
    const secretFailure = `server ${connection.password} died`;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/config/providers') return providerResponse();
      if (path.endsWith('/prompt_async')) return new Response(null, { status: 204 });
      if (path === '/event') {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(secretFailure));
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      if (path === '/session/session-1') throw new Error(secretFailure);
      throw new Error(`Unexpected request ${path}`);
    });
    const harness = new OpenCodeHarness(runtime(), {
      fetch,
      maxReconnectAttempts: 1,
      reconnectDelay: async () => undefined,
    });

    const events = await collect(harness.send(request()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'HARNESS_CRASHED' });
    const message = events[0]?.type === 'error' ? events[0].message : '';
    expect(message).toContain('retry the active turn');
    expect(message).not.toContain(connection.password);
  });

  it('submits only the exact reconciled OpenCode provider and model identity', async () => {
    let promptBody: unknown;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/config/providers') return providerResponse('ollama', 'qwen3:4b');
      if (path === '/event') {
        return sse({ type: 'session.idle', properties: { sessionID: 'session-1' } });
      }
      if (path.endsWith('/prompt_async')) {
        promptBody = JSON.parse(String(init?.body));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await collect(
      harness.send({
        ...request(),
        selection: { providerId: 'local', modelId: 'qwen3:4b' },
        variant: 'high',
        tools: { 'terminal.list': true, 'terminal.write': false },
      }),
    );

    expect(promptBody).toMatchObject({
      model: { providerID: 'ollama', modelID: 'qwen3:4b' },
      variant: 'high',
      tools: { 'terminal.list': true, 'terminal.write': false },
    });
  });

  it('surfaces an exact unavailable-model error before opening a stream or prompt', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(providerResponse());
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await expect(
      collect(
        harness.send({
          ...request(),
          selection: { providerId: 'anthropic', modelId: 'not-available' },
        }),
      ),
    ).resolves.toEqual([
      {
        type: 'error',
        code: 'MODEL_NOT_AVAILABLE',
        message: 'Model "not-available" is not available for "anthropic".',
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe('/config/providers');
  });

  it('disposes active streams and the scoped server instance', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('true'));
    const harness = new OpenCodeHarness(runtime(), { fetch });

    await harness.dispose();

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/instance/dispose',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
