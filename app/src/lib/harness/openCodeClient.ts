import { redactHarnessText } from './errors';
import type { OpenCodeServerConnection } from './runtimeManager';
import { parseOpenCodeSse, type OpenCodeSseEvent } from './sseParser';

type JsonRecord = Record<string, unknown>;

export interface OpenCodeSession extends JsonRecord {
  id: string;
  title?: string;
  parentID?: string;
}

export interface OpenCodePrompt {
  model: { providerID: string; modelID: string };
  parts: readonly unknown[];
  system?: string;
}

export interface OpenCodeHttpClient {
  health(): Promise<{ healthy: true; version: string }>;
  configProviders(): Promise<unknown>;
  createSession(input: { title?: string; parentID?: string }): Promise<OpenCodeSession>;
  getSession(sessionId: string): Promise<OpenCodeSession>;
  deleteSession(sessionId: string): Promise<boolean>;
  children(sessionId: string): Promise<readonly unknown[]>;
  messages(sessionId: string): Promise<readonly unknown[]>;
  diff(sessionId: string): Promise<readonly unknown[]>;
  promptAsync(sessionId: string, input: OpenCodePrompt, signal?: AbortSignal): Promise<void>;
  command(sessionId: string, input: unknown): Promise<unknown>;
  shell(sessionId: string, input: unknown): Promise<unknown>;
  abortSession(sessionId: string): Promise<boolean>;
  replyPermission(
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject',
  ): Promise<boolean>;
  events(signal?: AbortSignal): AsyncIterable<OpenCodeSseEvent>;
  disposeInstance(): Promise<boolean>;
}

interface ClientOptions {
  fetch?: typeof globalThis.fetch;
}

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_JSON_BYTES = 32 * 1024 * 1024;
const MAX_ERROR_BYTES = 2_048;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBounded(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let value = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      value += decoder.decode(chunk.value, { stream: true });
      if (value.length > maximumBytes) {
        value = value.slice(0, maximumBytes);
        break;
      }
    }
    return value + decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The body may already be closed.
    }
    reader.releaseLock();
  }
}

function requireSession(value: unknown): OpenCodeSession {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
    throw new Error('OpenCode returned an invalid session.');
  }
  return value as OpenCodeSession;
}

export function createOpenCodeHttpClient(
  connection: OpenCodeServerConnection,
  options: ClientOptions = {},
): OpenCodeHttpClient {
  const connectionUrl = new URL(connection.baseUrl);
  if (
    connectionUrl.protocol !== 'http:' ||
    connectionUrl.hostname !== '127.0.0.1' ||
    connectionUrl.username ||
    connectionUrl.password ||
    connectionUrl.pathname !== '/' ||
    connectionUrl.search ||
    connectionUrl.hash ||
    connection.username !== 'vibespace' ||
    !/^[A-Za-z0-9_-]{64}$/.test(connection.password)
  ) {
    throw new Error('OpenCode client requires a validated private loopback connection.');
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const authorization = `Basic ${btoa(`${connection.username}:${connection.password}`)}`;
  const baseUrl = connection.baseUrl;

  const sanitize = (value: string): string =>
    redactHarnessText(value.split(connection.password).join('[REDACTED]')).slice(
      0,
      MAX_ERROR_BYTES,
    );

  const request = async (
    path: string,
    init: RequestInit = {},
    expected: 'json' | 'void' = 'json',
    maximumBytes = MAX_JSON_BYTES,
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl).toString(), {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        headers: {
          accept: expected === 'json' ? 'application/json' : '*/*',
          authorization,
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new Error(
        sanitize(error instanceof Error ? error.message : 'OpenCode request failed.'),
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new Error('OpenCode refused an unsafe redirect.');
    }
    if (!response.ok) {
      const detail = sanitize(await readBounded(response, MAX_ERROR_BYTES));
      throw new Error(`OpenCode request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    if (expected === 'void' || response.status === 204) return undefined;
    const text = await readBounded(response, maximumBytes);
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('OpenCode returned malformed JSON.');
    }
  };

  const sessionPath = (sessionId: string, suffix = '') =>
    `/session/${encodeURIComponent(sessionId)}${suffix}`;
  const booleanRequest = async (path: string, init: RequestInit): Promise<boolean> =>
    (await request(path, init)) === true;

  return {
    async health() {
      const value = await request('/global/health');
      if (
        !isRecord(value) ||
        value.healthy !== true ||
        typeof value.version !== 'string' ||
        !value.version
      ) {
        throw new Error('OpenCode returned an invalid health response.');
      }
      return { healthy: true, version: value.version };
    },
    configProviders: () => request('/config/providers', {}, 'json', MAX_PROVIDER_JSON_BYTES),
    async createSession(input) {
      return requireSession(
        await request('/session', { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    async getSession(sessionId) {
      return requireSession(await request(sessionPath(sessionId)));
    },
    deleteSession: (sessionId) => booleanRequest(sessionPath(sessionId), { method: 'DELETE' }),
    async children(sessionId) {
      const value = await request(sessionPath(sessionId, '/children'));
      if (!Array.isArray(value)) throw new Error('OpenCode returned invalid child sessions.');
      return value;
    },
    async messages(sessionId) {
      const value = await request(sessionPath(sessionId, '/message'));
      if (!Array.isArray(value)) throw new Error('OpenCode returned invalid messages.');
      return value;
    },
    async diff(sessionId) {
      const value = await request(sessionPath(sessionId, '/diff'));
      if (!Array.isArray(value)) throw new Error('OpenCode returned an invalid session diff.');
      return value;
    },
    async promptAsync(sessionId, input, signal) {
      await request(
        sessionPath(sessionId, '/prompt_async'),
        { method: 'POST', body: JSON.stringify(input), signal },
        'void',
      );
    },
    command: (sessionId, input) =>
      request(sessionPath(sessionId, '/command'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    shell: (sessionId, input) =>
      request(sessionPath(sessionId, '/shell'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    abortSession: (sessionId) =>
      booleanRequest(sessionPath(sessionId, '/abort'), { method: 'POST' }),
    replyPermission: (sessionId, permissionId, response) =>
      booleanRequest(`${sessionPath(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      }),
    async *events(signal) {
      let response: Response;
      try {
        response = await fetchImpl(new URL('/event', baseUrl).toString(), {
          method: 'GET',
          credentials: 'omit',
          redirect: 'error',
          signal,
          headers: {
            accept: 'text/event-stream',
            authorization,
            'cache-control': 'no-cache',
          },
        });
      } catch (error) {
        if (signal?.aborted) return;
        throw new Error(
          sanitize(error instanceof Error ? error.message : 'OpenCode event stream failed.'),
        );
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (
        (response.status >= 300 && response.status < 400) ||
        !response.ok ||
        !contentType.includes('text/event-stream') ||
        !response.body
      ) {
        throw new Error('OpenCode returned an invalid event stream.');
      }
      yield* parseOpenCodeSse(response.body, signal);
    },
    disposeInstance: () => booleanRequest('/instance/dispose', { method: 'POST' }),
  };
}
