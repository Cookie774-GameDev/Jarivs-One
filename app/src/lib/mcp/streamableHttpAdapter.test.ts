import { describe, expect, it, vi } from 'vitest';
import type { NativeFetchInit } from '@/lib/nativeFetch';
import { authorizeRemoteMcpConnection } from './remoteAuthorization';
import {
  createBearerStreamableHttpMcpAdapter,
  createStreamableHttpMcpAdapter,
} from './streamableHttpAdapter';

type FetchCall = {
  url: string;
  init: NativeFetchInit;
  message?: Record<string, unknown>;
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

function success(id: unknown, result: unknown): Response {
  return jsonResponse({ jsonrpc: '2.0', id, result });
}

function createHarness(
  handler: (call: FetchCall) => Response | Promise<Response>,
  endpoint = 'https://mcp.example.com/mcp',
  requestTimeoutMs = 5_000,
) {
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init: NativeFetchInit = {}) => {
    const message =
      typeof init.body === 'string' && init.body
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    const call = { url: String(url), init, message };
    calls.push(call);
    return handler(call);
  });
  const authorization = authorizeRemoteMcpConnection({
    endpoint,
    confirmedByUser: true,
    intent: 'connect_external_mcp',
  });
  const adapter = createStreamableHttpMcpAdapter({
    id: 'remote-test',
    endpoint,
    authorization,
    fetch,
    requestTimeoutMs,
  });
  return { adapter, calls, fetch };
}

function initializedHarness(
  handler: (call: FetchCall) => Response | Promise<Response>,
  sessionId = 'session-1',
  requestTimeoutMs = 5_000,
) {
  return createHarness(
    (call) => {
      const method = call.message?.method;
      if (method === 'initialize') {
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message?.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'test-server', version: '1.0.0' },
            },
          },
          { headers: { 'mcp-session-id': sessionId } },
        );
      }
      if (method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
      }
      return handler(call);
    },
    'https://mcp.example.com/mcp',
    requestTimeoutMs,
  );
}

describe('Streamable HTTP MCP adapter', () => {
  it('keeps a keychain bearer token in transport headers across the complete session', async () => {
    const calls: FetchCall[] = [];
    const fetch = vi.fn(async (url: RequestInfo | URL, init: NativeFetchInit = {}) => {
      const message =
        typeof init.body === 'string' && init.body
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      const call = { url: String(url), init, message };
      calls.push(call);
      expect(call.url).toBe('https://mcp.zapier.com/api/v1/connect');
      expect(init.redirect).toBe('error');
      expect(new Headers(init.headers).get('authorization')).toBe(
        'Bearer zapier-connection-token-kept-private',
      );
      if (init.method === 'DELETE') return new Response(null, { status: 200 });
      if (message?.method === 'initialize') {
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'zapier', version: '1.0.0' },
            },
          },
          { headers: { 'mcp-session-id': 'zapier-session' } },
        );
      }
      if (message?.method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
      }
      if (message?.method === 'tools/list') {
        return success(message.id, {
          tools: [{ name: 'slack_send_message', inputSchema: { type: 'object' } }],
        });
      }
      if (message?.method === 'tools/call') {
        return success(message.id, { content: [{ type: 'text', text: 'sent' }] });
      }
      throw new Error('unexpected request');
    });
    const adapter = createBearerStreamableHttpMcpAdapter({
      id: 'zapier',
      endpoint: 'https://mcp.zapier.com/api/v1/connect',
      bearerToken: 'zapier-connection-token-kept-private',
      fetch,
      requestTimeoutMs: 5_000,
    });

    const client = await adapter.start();
    await expect(client.listTools()).resolves.toHaveLength(1);
    await expect(client.invoke('slack_send_message', {})).resolves.toEqual({
      content: [{ type: 'text', text: 'sent' }],
    });
    await client.stop();

    expect(calls.map(({ message, init }) => message?.method ?? init.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
      'DELETE',
    ]);
  });

  it('never resends an ambiguous tool call after an expired-session response', async () => {
    let initializeCount = 0;
    let invocationCount = 0;
    const { adapter } = createHarness((call) => {
      if (call.message?.method === 'initialize') {
        initializeCount += 1;
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'remote', version: '1' },
            },
          },
          { headers: { 'mcp-session-id': `session-${initializeCount}` } },
        );
      }
      if (call.message?.method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
      }
      if (call.message?.method === 'tools/call') {
        invocationCount += 1;
        return new Response(null, { status: 404 });
      }
      throw new Error('unexpected method');
    });
    const client = await adapter.start();

    await expect(client.invoke('external.write', { value: 'approved' })).rejects.toThrow(
      /session expired/i,
    );
    expect(invocationCount).toBe(1);
    expect(initializeCount).toBe(1);
  });

  it('rejects unsafe bearer credentials and token-bearing endpoint URLs', () => {
    expect(() =>
      createBearerStreamableHttpMcpAdapter({
        id: 'zapier',
        endpoint: 'https://mcp.zapier.com/api/v1/connect',
        bearerToken: 'unsafe token',
      }),
    ).toThrow(/bearer/i);
    expect(() =>
      createBearerStreamableHttpMcpAdapter({
        id: 'zapier',
        endpoint: 'https://mcp.zapier.com/api/v1/connect?token=secret',
        bearerToken: 'otherwise-safe-token',
      }),
    ).toThrow(/endpoint|unsafe/i);
  });

  it('initializes first, negotiates 2025-11-25, and sends required headers', async () => {
    const { adapter, calls } = createHarness((call) => {
      if (call.init.method === 'DELETE') {
        expect(call.init.redirect).toBe('error');
        return new Response(null, { status: 200 });
      }
      if (call.message?.method === 'initialize') {
        const headers = new Headers(call.init.headers);
        expect(headers.get('accept')).toBe('application/json, text/event-stream');
        expect(headers.get('content-type')).toBe('application/json');
        expect(headers.has('authorization')).toBe(false);
        expect(call.init.redirect).toBe('error');
        expect(headers.has('mcp-session-id')).toBe(false);
        expect(headers.has('mcp-protocol-version')).toBe(false);
        expect(call.message).toMatchObject({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'VibeSpace', version: '1.5.0' },
          },
        });
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'remote', version: '1.0.0' },
            },
          },
          { headers: { 'mcp-session-id': 'safe-session-1' } },
        );
      }
      expect(call.message).toEqual({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      expect(call.init.redirect).toBe('error');
      const headers = new Headers(call.init.headers);
      expect(headers.get('mcp-session-id')).toBe('safe-session-1');
      expect(headers.get('mcp-protocol-version')).toBe('2025-11-25');
      return new Response(null, { status: 202 });
    });

    const client = await adapter.start();

    expect(calls.map((call) => call.message?.method)).toEqual([
      'initialize',
      'notifications/initialized',
    ]);
    await client.stop();
  });

  it.each([
    {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'old', version: '1' },
    },
    {
      protocolVersion: '2025-11-25',
      capabilities: {},
      serverInfo: { name: 'no-tools', version: '1' },
    },
  ])('fails closed on incompatible initialization: %#', async (result) => {
    const { adapter, calls } = createHarness((call) => success(call.message?.id, result));

    await expect(adapter.start()).rejects.toThrow(/initialization|capabilit|version/i);
    expect(calls).toHaveLength(1);
  });

  it('rejects unsafe session identifiers before sending initialized', async () => {
    const { adapter, calls } = createHarness((call) =>
      jsonResponse(
        {
          jsonrpc: '2.0',
          id: call.message?.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'remote', version: '1' },
          },
        },
        { headers: { 'mcp-session-id': 'unsafe session' } },
      ),
    );

    await expect(adapter.start()).rejects.toThrow(/session/i);
    expect(calls).toHaveLength(1);
  });

  it('paginates bounded tool discovery and preserves the session/version headers', async () => {
    const cursors: unknown[] = [];
    const { adapter, calls } = initializedHarness((call) => {
      if (call.message?.method !== 'tools/list') throw new Error('unexpected method');
      const params = call.message.params as Record<string, unknown> | undefined;
      cursors.push(params?.cursor);
      const id = call.message.id;
      return cursors.length === 1
        ? success(id, {
            tools: [{ name: 'repo.read', description: 'Read a repository', inputSchema: {} }],
            nextCursor: 'page-2',
          })
        : success(id, {
            tools: [{ name: 'repo.search', description: 'Search', inputSchema: {} }],
          });
    });
    const client = await adapter.start();

    await expect(client.listTools()).resolves.toEqual([
      { name: 'repo.read', description: 'Read a repository', inputSchema: {} },
      { name: 'repo.search', description: 'Search', inputSchema: {} },
    ]);
    expect(cursors).toEqual([undefined, 'page-2']);
    const listHeaders = new Headers(calls.at(-1)?.init.headers);
    expect(listHeaders.get('mcp-protocol-version')).toBe('2025-11-25');
  });

  it('invokes tools and emits matching SSE progress before the result', async () => {
    const { adapter } = initializedHarness((call) => {
      if (call.message?.method !== 'tools/call') throw new Error('unexpected method');
      const id = call.message.id;
      const progressToken = (
        (call.message.params as Record<string, unknown>)._meta as Record<string, unknown>
      ).progressToken;
      const body = [
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { progressToken, progress: 1, total: 2, message: 'Working' },
        })}`,
        '',
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: 'done' }] },
        })}`,
        '',
      ].join('\n');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    const client = await adapter.start();
    const progress = vi.fn();

    await expect(
      client.invoke('repo.read', { owner: 'openai' }, { onProgress: progress }),
    ).resolves.toEqual({ content: [{ type: 'text', text: 'done' }] });
    expect(progress).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith({
      progress: 1,
      total: 2,
      message: 'Working',
    });
  });

  it('sends an explicit cancellation notification for an aborted in-flight call', async () => {
    const cancellation = new Promise<Record<string, unknown>>((resolve) => {
      const { adapter } = initializedHarness((call) => {
        if (call.message?.method === 'notifications/cancelled') {
          resolve(call.message);
          return new Response(null, { status: 202 });
        }
        if (call.message?.method !== 'tools/call') throw new Error('unexpected method');
        return new Promise<Response>((_resolve, reject) => {
          call.init.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      });
      void (async () => {
        const client = await adapter.start();
        const controller = new AbortController();
        const pending = client.invoke('repo.read', {}, { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toThrow();
      })();
    });

    await expect(cancellation).resolves.toMatchObject({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { reason: 'Caller cancelled the MCP request.' },
    });
  });

  it('reinitializes once without an expired session and retries the request', async () => {
    let initializeCount = 0;
    let pingCount = 0;
    const { adapter, calls } = createHarness((call) => {
      if (call.message?.method === 'initialize') {
        initializeCount += 1;
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'remote', version: '1' },
            },
          },
          { headers: { 'mcp-session-id': `session-${initializeCount}` } },
        );
      }
      if (call.message?.method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
      }
      if (call.message?.method === 'ping') {
        pingCount += 1;
        return pingCount === 1 ? new Response(null, { status: 404 }) : success(call.message.id, {});
      }
      throw new Error('unexpected method');
    });
    const client = await adapter.start();

    await expect(client.health()).resolves.toBe(true);
    expect(initializeCount).toBe(2);
    const secondInitialize = calls.filter((call) => call.message?.method === 'initialize')[1];
    expect(new Headers(secondInitialize?.init.headers).has('mcp-session-id')).toBe(false);
  });

  it('deduplicates concurrent recovery from the same expired session', async () => {
    let initializeCount = 0;
    let oldSessionPings = 0;
    let releaseOldPings: (() => void) | undefined;
    let releaseReinitialized: (() => void) | undefined;
    const oldPingsReady = new Promise<void>((resolve) => {
      releaseOldPings = resolve;
    });
    const reinitialized = new Promise<void>((resolve) => {
      releaseReinitialized = resolve;
    });
    const { adapter } = createHarness(async (call) => {
      if (call.message?.method === 'initialize') {
        initializeCount += 1;
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'remote', version: '1' },
            },
          },
          { headers: { 'mcp-session-id': `session-${initializeCount}` } },
        );
      }
      if (call.message?.method === 'notifications/initialized') {
        if (initializeCount === 2) releaseReinitialized?.();
        return new Response(null, { status: 202 });
      }
      if (call.message?.method === 'ping') {
        const session = new Headers(call.init.headers).get('mcp-session-id');
        if (session === 'session-1') {
          const ordinal = ++oldSessionPings;
          if (oldSessionPings === 2) releaseOldPings?.();
          await oldPingsReady;
          if (ordinal === 2) await reinitialized;
          return new Response(null, { status: 404 });
        }
        return success(call.message.id, {});
      }
      throw new Error('unexpected method');
    });
    const client = await adapter.start();

    await expect(Promise.all([client.health(), client.health()])).resolves.toEqual([true, true]);
    expect(initializeCount).toBe(2);
  });

  it('gates requests that begin while reinitialization is still pending', async () => {
    let initializeCount = 0;
    let releaseInitialized: (() => void) | undefined;
    let announceInitialized: (() => void) | undefined;
    const initializedMayFinish = new Promise<void>((resolve) => {
      releaseInitialized = resolve;
    });
    const initializedIsPending = new Promise<void>((resolve) => {
      announceInitialized = resolve;
    });
    const pingSessions: (string | null)[] = [];
    const { adapter } = createHarness(async (call) => {
      if (call.message?.method === 'initialize') {
        initializeCount += 1;
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: call.message.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'remote', version: '1' },
            },
          },
          { headers: { 'mcp-session-id': `session-${initializeCount}` } },
        );
      }
      if (call.message?.method === 'notifications/initialized') {
        if (initializeCount === 2) {
          announceInitialized?.();
          await initializedMayFinish;
        }
        return new Response(null, { status: 202 });
      }
      if (call.message?.method === 'ping') {
        const session = new Headers(call.init.headers).get('mcp-session-id');
        pingSessions.push(session);
        return session === 'session-1'
          ? new Response(null, { status: 404 })
          : success(call.message.id, {});
      }
      throw new Error('unexpected method');
    });
    const client = await adapter.start();
    const recovering = client.health();
    await initializedIsPending;

    const duringRecovery = client.health();
    await Promise.resolve();
    expect(pingSessions).toEqual(['session-1']);

    releaseInitialized?.();
    await expect(Promise.all([recovering, duringRecovery])).resolves.toEqual([true, true]);
    expect(pingSessions).toEqual(['session-1', 'session-2', 'session-2']);
  });

  it('times out a stalled response body and issues cancellation', async () => {
    const cancellations: Record<string, unknown>[] = [];
    const { adapter } = initializedHarness(
      (call) => {
        if (call.message?.method === 'notifications/cancelled') {
          cancellations.push(call.message);
          return new Response(null, { status: 202 });
        }
        if (call.message?.method !== 'ping') throw new Error('unexpected method');
        return new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Intentionally never enqueue or close.
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
      'session-timeout',
      250,
    );
    const client = await adapter.start();

    await expect(client.health()).rejects.toThrow(/timed out/i);
    await vi.waitFor(() => expect(cancellations).toHaveLength(1));
  });

  it('uses ping for health and DELETE for idempotent session shutdown', async () => {
    const { adapter, calls } = initializedHarness((call) => {
      if (call.message?.method === 'ping') return success(call.message.id, {});
      if (call.init.method === 'DELETE') return new Response(null, { status: 200 });
      throw new Error('unexpected method');
    });
    const client = await adapter.start();

    await expect(client.health()).resolves.toBe(true);
    await client.stop();
    await client.stop();

    const deletes = calls.filter((call) => call.init.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(new Headers(deletes[0]?.init.headers).get('mcp-session-id')).toBe('session-1');
  });

  it.each([
    ['a cross-request response', { jsonrpc: '2.0', id: 999, result: {} }],
    ['a malformed JSON-RPC response', { id: 1, result: {} }],
  ])('rejects %s without exposing raw server data', async (_label, responseBody) => {
    const { adapter } = initializedHarness((call) =>
      jsonResponse({ ...responseBody, id: responseBody.id === 1 ? call.message?.id : 999 }),
    );
    const client = await adapter.start();
    await expect(client.health()).rejects.toThrow(/MCP (response|JSON-RPC)/i);
  });

  it('rejects oversized responses, cursor cycles, unsafe arguments, and forged authorization', async () => {
    const oversized = initializedHarness(
      () =>
        new Response('x'.repeat(1_048_577), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect((await oversized.adapter.start()).health()).rejects.toThrow(/large/i);

    const cycling = initializedHarness((call) =>
      success(call.message?.id, { tools: [], nextCursor: 'same' }),
    );
    await expect((await cycling.adapter.start()).listTools()).rejects.toThrow(/cursor/i);

    const safe = initializedHarness((call) => success(call.message?.id, { content: [] }));
    const client = await safe.adapter.start();
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => 'must-not-run',
    });
    await expect(client.invoke('repo.read', accessor)).rejects.toThrow(/argument/i);
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`key_${index}`, index]),
    );
    await expect(client.invoke('repo.read', tooManyKeys)).rejects.toThrow(/large/i);

    expect(() =>
      createStreamableHttpMcpAdapter({
        id: 'forged',
        endpoint: 'https://mcp.example.com/mcp',
        authorization: {
          endpoint: 'https://mcp.example.com/mcp',
          intent: 'connect_external_mcp',
          expiresAt: Number.MAX_SAFE_INTEGER,
        } as never,
        fetch: vi.fn(),
      }),
    ).toThrow(/authorization/i);

    const commandAuthorization = authorizeRemoteMcpConnection({
      endpoint: 'https://mcp.example.com/command',
      confirmedByUser: true,
      intent: 'connect_external_mcp',
    });
    expect(() =>
      createStreamableHttpMcpAdapter({
        id: 'no-command-surface',
        endpoint: 'https://mcp.example.com/command',
        authorization: commandAuthorization,
        command: 'download-and-run',
      } as never),
    ).toThrow(/options/i);
  });
});
