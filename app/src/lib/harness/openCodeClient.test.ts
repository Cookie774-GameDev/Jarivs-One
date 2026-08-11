import { describe, expect, it, vi } from 'vitest';
import { createOpenCodeHttpClient } from './openCodeClient';
import type { OpenCodeServerConnection } from './runtimeManager';

const connection: OpenCodeServerConnection = {
  baseUrl: 'http://127.0.0.1:43123/',
  username: 'vibespace',
  password: 'p'.repeat(64),
  source: 'managed',
  version: '1.2.3',
  generation: 'opencode-server-test',
};

describe('OpenCodeHttpClient', () => {
  it('rejects non-loopback or credential-bearing connection URLs', () => {
    expect(() =>
      createOpenCodeHttpClient(
        { ...connection, baseUrl: 'https://example.com/', password: 'secret-in-url' },
        { fetch: vi.fn() },
      ),
    ).toThrow('private loopback');
  });

  it('builds typed authenticated endpoints and encodes path segments', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'session/one', title: 'Chat' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createOpenCodeHttpClient(connection, { fetch });

    await expect(client.getSession('session/one')).resolves.toEqual({
      id: 'session/one',
      title: 'Chat',
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:43123/session/session%2Fone');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Basic ${btoa(`vibespace:${'p'.repeat(64)}`)}`,
    );
    expect(init?.redirect).toBe('error');
    expect(init?.credentials).toBe('omit');
  });

  it('supports session creation, async prompts, cancellation, and permission replies', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/session' && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'session-1' }), { status: 200 });
      }
      if (path.endsWith('/prompt_async')) return new Response(null, { status: 204 });
      return new Response('true', { status: 200 });
    });
    const client = createOpenCodeHttpClient(connection, { fetch });

    await expect(client.createSession({ title: 'Chat' })).resolves.toEqual({ id: 'session-1' });
    await client.promptAsync('session-1', {
      model: { providerID: 'anthropic', modelID: 'claude' },
      parts: [{ type: 'text', text: 'hello' }],
    });
    await expect(client.abortSession('session-1')).resolves.toBe(true);
    await expect(client.replyPermission('session-1', 'approval/1', 'once')).resolves.toBe(true);

    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/session',
      '/session/session-1/prompt_async',
      '/session/session-1/abort',
      '/session/session-1/permissions/approval%2F1',
    ]);
  });

  it('rejects redirects and redacts credentials from bounded server errors', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302 }))
      .mockResolvedValueOnce(
        new Response(`Bearer ${connection.password} ${'x'.repeat(10_000)}`, { status: 500 }),
      );
    const client = createOpenCodeHttpClient(connection, { fetch });

    await expect(client.health()).rejects.toThrow('redirect');
    await expect(client.health()).rejects.toSatisfy((error: Error) => {
      expect(error.message).not.toContain(connection.password);
      expect(error.message.length).toBeLessThan(2_300);
      return true;
    });
  });

  it('requires an authenticated event-stream response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('not a stream', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const client = createOpenCodeHttpClient(connection, { fetch });
    const consume = async () => {
      for await (const _event of client.events()) {
        // consume
      }
    };

    await expect(consume()).rejects.toThrow('event stream');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      `Basic ${btoa(`vibespace:${'p'.repeat(64)}`)}`,
    );
  });
});
