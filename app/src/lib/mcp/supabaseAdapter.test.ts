import { describe, expect, it, vi } from 'vitest';

import { createSupabaseMcpAdapter } from './supabaseAdapter';

function jsonResponse(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

describe('Supabase read-only MCP adapter', () => {
  it('lists visible tables through a GET-only OpenAPI request', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        swagger: '2.0',
        definitions: {
          profiles: { type: 'object' },
          chats: { type: 'object' },
        },
      }),
    );
    const adapter = createSupabaseMcpAdapter({
      readEnv: () => ({
        url: 'https://project.supabase.co/',
        key: 'synthetic-anon-key',
      }),
      fetch: fetchImpl,
      timeoutMs: 1_000,
    });

    const client = await adapter.start();
    expect(await client.health()).toBe(true);
    expect(await client.listTools()).toEqual([expect.objectContaining({ name: 'list_tables' })]);
    await expect(client.invoke('list_tables', {})).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: '2 Supabase tables are visible to the configured read-only role.',
        },
      ],
      structuredContent: {
        tables: ['chats', 'profiles'],
        count: 2,
        readOnly: true,
        source: 'supabase-rest-openapi',
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/rest/v1/');
    expect(init).toMatchObject({ method: 'GET' });
    expect(init).not.toHaveProperty('body');
    expect(init?.headers).toMatchObject({
      apikey: 'synthetic-anon-key',
      Authorization: 'Bearer synthetic-anon-key',
    });
  });

  it('fails closed without configuration and never calls the network', async () => {
    const fetchImpl = vi.fn();
    const adapter = createSupabaseMcpAdapter({
      readEnv: () => ({}),
      fetch: fetchImpl,
    });

    await expect(adapter.start()).rejects.toThrow('Supabase is not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not expose configured credentials in HTTP errors', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({}, 403),
    );
    const adapter = createSupabaseMcpAdapter({
      readEnv: () => ({
        url: 'https://project.supabase.co',
        key: 'synthetic-secret-value',
      }),
      fetch: fetchImpl,
    });
    const client = await adapter.start();

    await expect(client.health()).rejects.toThrow('HTTP 403');
    await expect(client.health()).rejects.not.toThrow('synthetic-secret-value');
  });
});
