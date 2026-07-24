import { nativeFetch, type NativeFetchInit } from '@/lib/nativeFetch';
import {
  canonicalRemoteMcpEndpoint,
  claimRemoteMcpAuthorization,
  type RemoteMcpAuthorizationReceipt,
} from './remoteAuthorization';
import type {
  McpClientInvokeOptions,
  McpServerAdapter,
  McpServerClient,
  McpToolDescriptor,
} from './serverManager';

const PROTOCOL_VERSION = '2025-11-25';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_SSE_EVENTS = 128;
const MAX_SSE_LINE_CHARS = 256 * 1024;
const MAX_SESSION_ID_CHARS = 512;
const MAX_CURSOR_CHARS = 512;
const MAX_TOOL_PAGES = 8;
const MAX_TOOLS = 64;
const MAX_REQUEST_BODY_CHARS = 512 * 1024;
const MAX_ARGUMENT_DEPTH = 8;
const MAX_ARGUMENT_NODES = 512;
const MAX_ARGUMENT_KEYS = 128;
const MAX_ARGUMENT_ARRAY = 256;
const MAX_ARGUMENT_STRING_CHARS = 64 * 1024;
const MAX_ARGUMENT_TEXT_CHARS = 256 * 1024;
const SAFE_SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SAFE_TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_SESSION_ID = /^[\x21-\x7e]+$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ADAPTER_OPTION_KEYS = new Set([
  'id',
  'endpoint',
  'authorization',
  'fetch',
  'requestTimeoutMs',
]);
const BEARER_ADAPTER_OPTION_KEYS = new Set([
  'id',
  'endpoint',
  'bearerToken',
  'fetch',
  'requestTimeoutMs',
]);

type McpHttpFetch = (input: RequestInfo | URL, init?: NativeFetchInit) => Promise<Response>;

export interface StreamableHttpMcpAdapterOptions {
  readonly id: string;
  readonly endpoint: string;
  readonly authorization: RemoteMcpAuthorizationReceipt;
  readonly fetch?: McpHttpFetch;
  readonly requestTimeoutMs?: number;
}

export interface BearerStreamableHttpMcpAdapterOptions {
  readonly id: string;
  readonly endpoint: string;
  readonly bearerToken: string;
  readonly fetch?: McpHttpFetch;
  readonly requestTimeoutMs?: number;
}

type JsonRpcId = number;

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

interface ParsedResponse {
  readonly result: unknown;
  readonly sessionId?: string;
}

interface ArgumentBudget {
  nodes: number;
  textChars: number;
  seen: WeakSet<object>;
}

class SessionExpiredError extends Error {
  constructor(readonly sessionId: string) {
    super('The remote MCP session expired.');
    this.name = 'SessionExpiredError';
  }
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return value as Record<string, unknown>;
}

function ownDataValue(source: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function cloneArgumentValue(value: unknown, depth: number, budget: ArgumentBudget): unknown {
  budget.nodes += 1;
  if (budget.nodes > MAX_ARGUMENT_NODES || depth > MAX_ARGUMENT_DEPTH) {
    throw new Error('MCP tool argument budget exceeded.');
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid MCP tool argument number.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_ARGUMENT_STRING_CHARS) {
      throw new Error('MCP tool argument string is too large.');
    }
    budget.textChars += value.length;
    if (budget.textChars > MAX_ARGUMENT_TEXT_CHARS) {
      throw new Error('MCP tool argument text budget exceeded.');
    }
    return value;
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid MCP tool argument value.');
  }
  if (budget.seen.has(value)) throw new Error('Cyclic MCP tool arguments are not supported.');
  budget.seen.add(value);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error('Invalid MCP tool argument array.');
    }
    if (value.length > MAX_ARGUMENT_ARRAY) {
      throw new Error('MCP tool argument array is too large.');
    }
    let enumerableKeys = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      enumerableKeys += 1;
      if (
        enumerableKeys > MAX_ARGUMENT_ARRAY ||
        !/^(0|[1-9]\d*)$/u.test(key) ||
        Number(key) >= value.length
      ) {
        throw new Error('Invalid MCP tool argument array.');
      }
    }
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) {
        throw new Error('Invalid MCP tool argument array.');
      }
      output.push(cloneArgumentValue(descriptor.value, depth + 1, budget));
    }
    budget.seen.delete(value);
    return output;
  }

  const source = plainRecord(value);
  if (!source) throw new Error('Invalid MCP tool argument object.');
  const output: Record<string, unknown> = Object.create(null);
  let keyCount = 0;
  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    keyCount += 1;
    if (keyCount > MAX_ARGUMENT_KEYS) {
      throw new Error('MCP tool argument object is too large.');
    }
    if (FORBIDDEN_KEYS.has(key)) throw new Error('Invalid MCP tool argument key.');
    budget.textChars += key.length;
    if (budget.textChars > MAX_ARGUMENT_TEXT_CHARS) {
      throw new Error('MCP tool argument text budget exceeded.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new Error('MCP tool argument accessors are not supported.');
    }
    output[key] = cloneArgumentValue(descriptor.value, depth + 1, budget);
  }
  budget.seen.delete(value);
  return output;
}

function canonicalToolArguments(value: unknown): Readonly<Record<string, unknown>> {
  const cloned = cloneArgumentValue(value, 0, {
    nodes: 0,
    textChars: 0,
    seen: new WeakSet(),
  });
  const record = plainRecord(cloned);
  if (!record) throw new Error('MCP tool arguments must be an object.');
  return record;
}

function canonicalSessionId(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (!value || value.length > MAX_SESSION_ID_CHARS || !SAFE_SESSION_ID.test(value)) {
    throw new Error('Invalid MCP session identifier.');
  }
  return value;
}

function requestBody(message: JsonRpcRequest | JsonRpcNotification): string {
  const body = JSON.stringify(message);
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BODY_CHARS) {
    throw new Error('MCP request body is too large.');
  }
  return body;
}

function callerAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('MCP request aborted.', 'AbortError');
}

async function boundedResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error('Remote MCP response is too large.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Remote MCP response is too large.');
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } catch (error) {
    if (error instanceof Error && /too large/u.test(error.message)) throw error;
    throw new Error('Invalid UTF-8 in remote MCP response.');
  } finally {
    reader.releaseLock();
  }
}

function parseJsonMessage(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid MCP JSON-RPC response.');
  }
  const message = plainRecord(parsed);
  if (!message || ownDataValue(message, 'jsonrpc') !== '2.0') {
    throw new Error('Invalid MCP JSON-RPC response.');
  }
  return message;
}

function processRpcMessage(
  message: Record<string, unknown>,
  expectedId: JsonRpcId,
  progressToken: string | undefined,
  onProgress: McpClientInvokeOptions['onProgress'],
): { matched: false } | { matched: true; result: unknown } {
  const method = ownDataValue(message, 'method');
  if (method === 'notifications/progress') {
    const params = plainRecord(ownDataValue(message, 'params'));
    if (!params || ownDataValue(params, 'progressToken') !== progressToken) {
      return { matched: false };
    }
    const progress = ownDataValue(params, 'progress');
    const total = ownDataValue(params, 'total');
    const rawMessage = ownDataValue(params, 'message');
    if (
      typeof progress !== 'number' ||
      !Number.isFinite(progress) ||
      progress < 0 ||
      (total !== undefined &&
        (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || progress > total)) ||
      (rawMessage !== undefined && (typeof rawMessage !== 'string' || rawMessage.length > 1_000))
    ) {
      return { matched: false };
    }
    if (onProgress) {
      try {
        const pending = (
          onProgress as (update: { progress: number; total?: number; message?: string }) => unknown
        )({
          progress,
          ...(total === undefined ? {} : { total }),
          ...(rawMessage === undefined ? {} : { message: rawMessage }),
        });
        if (
          pending &&
          (typeof pending === 'object' || typeof pending === 'function') &&
          typeof (pending as PromiseLike<unknown>).then === 'function'
        ) {
          void Promise.resolve(pending).catch(() => undefined);
        }
      } catch {
        // Untrusted progress and observers cannot affect the protocol request.
      }
    }
    return { matched: false };
  }

  const id = ownDataValue(message, 'id');
  if (id !== undefined && id !== expectedId) {
    throw new Error('MCP response referenced an unexpected request.');
  }
  if (id !== expectedId) return { matched: false };
  const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
  const hasError = Object.prototype.hasOwnProperty.call(message, 'error');
  if (hasResult === hasError) throw new Error('Invalid MCP JSON-RPC response.');
  if (hasError) {
    const error = plainRecord(ownDataValue(message, 'error'));
    const code = error ? ownDataValue(error, 'code') : undefined;
    throw new Error(
      `Remote MCP JSON-RPC error${typeof code === 'number' && Number.isInteger(code) ? ` ${code}` : ''}.`,
    );
  }
  return { matched: true, result: ownDataValue(message, 'result') };
}

async function parseSseResponse(
  response: Response,
  expectedId: JsonRpcId,
  progressToken: string | undefined,
  onProgress: McpClientInvokeOptions['onProgress'],
): Promise<unknown> {
  if (!response.body) throw new Error('MCP SSE response had no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let buffer = '';
  let dataLines: string[] = [];
  let dataChars = 0;
  let eventCount = 0;

  const dispatch = (): { matched: false } | { matched: true; result: unknown } => {
    if (dataLines.length === 0) return { matched: false };
    eventCount += 1;
    if (eventCount > MAX_SSE_EVENTS) throw new Error('Too many MCP SSE events.');
    const data = dataLines.join('\n');
    dataLines = [];
    dataChars = 0;
    if (!data) return { matched: false };
    return processRpcMessage(parseJsonMessage(data), expectedId, progressToken, onProgress);
  };

  const line = (rawLine: string): { matched: false } | { matched: true; result: unknown } => {
    const value = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (value.length > MAX_SSE_LINE_CHARS) throw new Error('MCP SSE line is too large.');
    if (!value) return dispatch();
    if (value.startsWith(':')) return { matched: false };
    const separator = value.indexOf(':');
    const field = separator < 0 ? value : value.slice(0, separator);
    const raw = separator < 0 ? '' : value.slice(separator + 1);
    const fieldValue = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'data') {
      dataChars += fieldValue.length;
      if (dataChars > MAX_EVENT_BYTES) throw new Error('MCP SSE event is too large.');
      dataLines.push(fieldValue);
    }
    return { matched: false };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Remote MCP response is too large.');
      }
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const result = line(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (result.matched) {
          await reader.cancel();
          return result.result;
        }
        newline = buffer.indexOf('\n');
      }
      if (buffer.length > MAX_SSE_LINE_CHARS) {
        throw new Error('MCP SSE line is too large.');
      }
    }
    buffer += decoder.decode();
    if (buffer) {
      const result = line(buffer);
      if (result.matched) return result.result;
    }
    const final = dispatch();
    if (final.matched) return final.result;
    throw new Error('MCP SSE stream ended without a response.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Invalid MCP SSE response.');
  } finally {
    reader.releaseLock();
  }
}

class StreamableHttpMcpClient implements McpServerClient {
  private nextId = 1;
  private sessionId: string | undefined;
  private protocolVersion: string | undefined;
  private stopped = false;
  private stopPromise: Promise<void> | undefined;
  private restartPromise: Promise<void> | undefined;

  constructor(
    private readonly endpoint: string,
    private readonly fetch: McpHttpFetch,
    private readonly requestTimeoutMs: number,
    private readonly bearerAuthorization?: string,
  ) {}

  async initialize(): Promise<void> {
    this.assertRunning();
    this.sessionId = undefined;
    this.protocolVersion = undefined;
    const response = await this.sendRequestRaw(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'VibeSpace',
          version: '1.5.0',
        },
      },
      { initialize: true },
    );
    const result = plainRecord(response.result);
    const capabilities = result ? plainRecord(ownDataValue(result, 'capabilities')) : undefined;
    const serverInfo = result ? plainRecord(ownDataValue(result, 'serverInfo')) : undefined;
    const serverName = serverInfo ? ownDataValue(serverInfo, 'name') : undefined;
    const serverVersion = serverInfo ? ownDataValue(serverInfo, 'version') : undefined;
    if (
      !result ||
      ownDataValue(result, 'protocolVersion') !== PROTOCOL_VERSION ||
      !capabilities ||
      !plainRecord(ownDataValue(capabilities, 'tools')) ||
      typeof serverName !== 'string' ||
      !serverName ||
      serverName.length > 160 ||
      typeof serverVersion !== 'string' ||
      !serverVersion ||
      serverVersion.length > 80
    ) {
      throw new Error(
        'Remote MCP initialization returned an incompatible version or capability set.',
      );
    }
    this.protocolVersion = PROTOCOL_VERSION;
    this.sessionId = response.sessionId;
    await this.sendNotification('notifications/initialized');
  }

  listTools = async (signal?: AbortSignal): Promise<McpToolDescriptor[]> => {
    const tools: McpToolDescriptor[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
      const result = plainRecord(
        await this.sendRequestWithReconnect('tools/list', cursor === undefined ? {} : { cursor }, {
          signal,
        }),
      );
      const pageTools = result ? ownDataValue(result, 'tools') : undefined;
      if (!Array.isArray(pageTools)) throw new Error('Invalid MCP tools/list response.');
      for (const candidate of pageTools) {
        const tool = plainRecord(candidate);
        if (!tool || typeof ownDataValue(tool, 'name') !== 'string') {
          throw new Error('Invalid MCP tool descriptor.');
        }
        tools.push(tool as unknown as McpToolDescriptor);
        if (tools.length > MAX_TOOLS) throw new Error('Too many MCP tools.');
      }
      const nextCursor = ownDataValue(result!, 'nextCursor');
      if (nextCursor === undefined) return tools;
      if (
        typeof nextCursor !== 'string' ||
        !nextCursor ||
        nextCursor.length > MAX_CURSOR_CHARS ||
        cursors.has(nextCursor)
      ) {
        throw new Error('Invalid or repeated MCP pagination cursor.');
      }
      cursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('MCP tools/list exceeded the page limit.');
  };

  invoke = async (
    toolName: string,
    input: unknown,
    options: McpClientInvokeOptions = {},
  ): Promise<unknown> => {
    if (!SAFE_TOOL_NAME.test(toolName)) throw new Error('Invalid MCP tool name.');
    while (this.restartPromise) {
      await this.waitForRestart(this.restartPromise, options.signal);
    }
    if (options.signal?.aborted) throw callerAbortError(options.signal);
    const progressToken = `vibespace-${this.nextId}`;
    return (
      await this.sendRequestRaw(
        'tools/call',
        {
          name: toolName,
          arguments: canonicalToolArguments(input),
          _meta: { progressToken },
        },
        {
          signal: options.signal,
          progressToken,
          onProgress: options.onProgress,
        },
      )
    ).result;
  };

  health = async (): Promise<boolean> => {
    await this.sendRequestWithReconnect('ping', {});
    return true;
  };

  stop = async (): Promise<void> => {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      if (this.stopped) return;
      this.stopped = true;
      const sessionId = this.sessionId;
      this.sessionId = undefined;
      if (!sessionId) return;
      const response = await this.fetch(this.endpoint, {
        method: 'DELETE',
        redirect: 'error',
        headers: {
          accept: 'application/json, text/event-stream',
          ...(this.bearerAuthorization === undefined
            ? {}
            : { authorization: this.bearerAuthorization }),
          'mcp-protocol-version': this.protocolVersion ?? PROTOCOL_VERSION,
          'mcp-session-id': sessionId,
        },
        timeoutMs: this.requestTimeoutMs,
      });
      if (![200, 202, 204, 404, 405].includes(response.status)) {
        throw new Error(`Remote MCP session shutdown failed with HTTP ${response.status}.`);
      }
    })();
    return this.stopPromise;
  };

  private assertRunning(): void {
    if (this.stopped) throw new Error('Remote MCP client is stopped.');
  }

  private async sendRequestWithReconnect(
    method: string,
    params: Readonly<Record<string, unknown>>,
    options: {
      signal?: AbortSignal;
      progressToken?: string;
      onProgress?: McpClientInvokeOptions['onProgress'];
    } = {},
  ): Promise<unknown> {
    while (this.restartPromise) {
      await this.waitForRestart(this.restartPromise, options.signal);
    }
    if (options.signal?.aborted) throw callerAbortError(options.signal);
    try {
      return (await this.sendRequestRaw(method, params, options)).result;
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) throw error;
      if (options.signal?.aborted) throw callerAbortError(options.signal);
      await this.restart(error.sessionId);
      if (options.signal?.aborted) throw callerAbortError(options.signal);
      return (await this.sendRequestRaw(method, params, options)).result;
    }
  }

  private async waitForRestart(
    pending: Promise<void>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (!signal) return pending;
    if (signal.aborted) throw callerAbortError(signal);
    let rejectAbort: ((error: Error) => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const abort = () => rejectAbort?.(callerAbortError(signal));
    signal.addEventListener('abort', abort, { once: true });
    try {
      await Promise.race([pending, aborted]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  private async restart(expiredSessionId: string): Promise<void> {
    if (this.restartPromise) return this.restartPromise;
    if (this.sessionId !== undefined && this.sessionId !== expiredSessionId) return;
    const pending = this.initialize();
    const tracked = pending.finally(() => {
      if (this.restartPromise === tracked) this.restartPromise = undefined;
    });
    this.restartPromise = tracked;
    return this.restartPromise;
  }

  private async sendRequestRaw(
    method: string,
    params: Readonly<Record<string, unknown>>,
    options: {
      signal?: AbortSignal;
      progressToken?: string;
      onProgress?: McpClientInvokeOptions['onProgress'];
      initialize?: boolean;
    } = {},
  ): Promise<ParsedResponse> {
    this.assertRunning();
    if (options.signal?.aborted) throw callerAbortError(options.signal);
    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    let settled = false;
    let issued = false;
    let cancellationSent = false;
    const controller = new AbortController();
    const timeoutError = new Error(
      `Remote MCP request timed out after ${this.requestTimeoutMs}ms.`,
    );
    const forwardCallerAbort = () => {
      if (!controller.signal.aborted && options.signal) {
        controller.abort(callerAbortError(options.signal));
      }
    };
    options.signal?.addEventListener('abort', forwardCallerAbort, { once: true });
    const cancel = () => {
      if (!issued || settled || options.initialize || cancellationSent) return;
      cancellationSent = true;
      const reason =
        controller.signal.reason === timeoutError
          ? 'MCP request timed out.'
          : 'Caller cancelled the MCP request.';
      void this.sendNotification('notifications/cancelled', {
        requestId: id,
        reason,
      }).catch(() => undefined);
    };
    let rejectAbort: ((error: Error) => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const rejectOnAbort = () => {
      cancel();
      const reason = controller.signal.reason;
      rejectAbort?.(
        reason instanceof Error ? reason : new DOMException('MCP request aborted.', 'AbortError'),
      );
    };
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(timeoutError), this.requestTimeoutMs);

    try {
      const operation = (async (): Promise<ParsedResponse> => {
        const headers: Record<string, string> = {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        };
        if (this.bearerAuthorization) headers.authorization = this.bearerAuthorization;
        if (!options.initialize && this.protocolVersion) {
          headers['mcp-protocol-version'] = this.protocolVersion;
        }
        const requestSessionId = options.initialize ? undefined : this.sessionId;
        if (requestSessionId) headers['mcp-session-id'] = requestSessionId;
        issued = true;
        const response = await this.fetch(this.endpoint, {
          method: 'POST',
          redirect: 'error',
          headers,
          body: requestBody(message),
          signal: controller.signal,
          timeoutMs: 0,
        });
        if (response.status === 404 && requestSessionId !== undefined) {
          throw new SessionExpiredError(requestSessionId);
        }
        if (response.status === 401) {
          throw new Error('Remote MCP server requires an authorized credential flow.');
        }
        if (!response.ok) {
          throw new Error(`Remote MCP request failed with HTTP ${response.status}.`);
        }

        const contentType = response.headers
          .get('content-type')
          ?.split(';', 1)[0]
          ?.trim()
          .toLowerCase();
        let result: unknown;
        if (contentType === 'application/json') {
          const messageRecord = parseJsonMessage(await boundedResponseText(response));
          const processed = processRpcMessage(
            messageRecord,
            id,
            options.progressToken,
            options.onProgress,
          );
          if (!processed.matched) {
            throw new Error('MCP response did not contain the request result.');
          }
          result = processed.result;
        } else if (contentType === 'text/event-stream') {
          result = await parseSseResponse(response, id, options.progressToken, options.onProgress);
        } else {
          throw new Error('Unsupported remote MCP response content type.');
        }
        return {
          result,
          ...(options.initialize
            ? { sessionId: canonicalSessionId(response.headers.get('mcp-session-id')) }
            : {}),
        };
      })();
      return await Promise.race([operation, aborted]);
    } finally {
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardCallerAbort);
      controller.signal.removeEventListener('abort', rejectOnAbort);
    }
  }

  private async sendNotification(
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.assertRunning();
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    };
    const headers: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };
    if (this.bearerAuthorization) headers.authorization = this.bearerAuthorization;
    if (this.protocolVersion) headers['mcp-protocol-version'] = this.protocolVersion;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: requestBody(message),
      timeoutMs: this.requestTimeoutMs,
    });
    if (response.status !== 202) {
      throw new Error(`Remote MCP notification failed with HTTP ${response.status}.`);
    }
  }
}

export function createStreamableHttpMcpAdapter(
  options: StreamableHttpMcpAdapterOptions,
): Readonly<McpServerAdapter> {
  const source = plainRecord(options);
  if (!source) {
    throw new Error('Invalid Streamable HTTP MCP adapter options.');
  }
  for (const key of Reflect.ownKeys(source)) {
    if (
      typeof key !== 'string' ||
      !ADAPTER_OPTION_KEYS.has(key) ||
      !Object.getOwnPropertyDescriptor(source, key) ||
      !('value' in Object.getOwnPropertyDescriptor(source, key)!)
    ) {
      throw new Error('Invalid Streamable HTTP MCP adapter options.');
    }
  }
  const id = ownDataValue(source, 'id');
  const endpoint = ownDataValue(source, 'endpoint');
  const receipt = ownDataValue(source, 'authorization');
  const configuredFetch = ownDataValue(source, 'fetch');
  const configuredTimeout = ownDataValue(source, 'requestTimeoutMs');
  if (typeof id !== 'string' || !SAFE_SERVER_ID.test(id)) {
    throw new Error('Invalid MCP server id.');
  }
  if (typeof endpoint !== 'string') throw new Error('Invalid remote MCP endpoint.');
  const authorization = claimRemoteMcpAuthorization(
    receipt as RemoteMcpAuthorizationReceipt,
    endpoint,
  );
  if (configuredTimeout !== undefined && typeof configuredTimeout !== 'number') {
    throw new Error('Invalid MCP request timeout.');
  }
  const requestTimeoutMs = configuredTimeout ?? 30_000;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 250 ||
    requestTimeoutMs > 120_000
  ) {
    throw new Error('Invalid MCP request timeout.');
  }
  if (configuredFetch !== undefined && typeof configuredFetch !== 'function') {
    throw new Error('Invalid MCP HTTP transport.');
  }
  const fetch: McpHttpFetch =
    configuredFetch === undefined ? nativeFetch : (configuredFetch as McpHttpFetch);

  return Object.freeze({
    id,
    start: async (): Promise<McpServerClient> => {
      const client = new StreamableHttpMcpClient(authorization.endpoint, fetch, requestTimeoutMs);
      try {
        await client.initialize();
        return client;
      } catch (error) {
        await client.stop().catch(() => undefined);
        throw error;
      }
    },
  });
}

export function createBearerStreamableHttpMcpAdapter(
  options: BearerStreamableHttpMcpAdapterOptions,
): Readonly<McpServerAdapter> {
  const source = plainRecord(options);
  if (!source) throw new Error('Invalid bearer Streamable HTTP MCP adapter options.');
  for (const key of Reflect.ownKeys(source)) {
    const descriptor =
      typeof key === 'string' ? Object.getOwnPropertyDescriptor(source, key) : undefined;
    if (
      typeof key !== 'string' ||
      !BEARER_ADAPTER_OPTION_KEYS.has(key) ||
      !descriptor ||
      !('value' in descriptor)
    ) {
      throw new Error('Invalid bearer Streamable HTTP MCP adapter options.');
    }
  }
  const id = ownDataValue(source, 'id');
  const endpoint = ownDataValue(source, 'endpoint');
  const bearerToken = ownDataValue(source, 'bearerToken');
  const configuredFetch = ownDataValue(source, 'fetch');
  const configuredTimeout = ownDataValue(source, 'requestTimeoutMs');
  if (typeof id !== 'string' || !SAFE_SERVER_ID.test(id)) {
    throw new Error('Invalid MCP server id.');
  }
  const canonicalEndpoint = canonicalRemoteMcpEndpoint(endpoint);
  if (
    typeof bearerToken !== 'string' ||
    bearerToken.length < 16 ||
    bearerToken.length > 4_096 ||
    /[\s\u0000-\u001f\u007f]/u.test(bearerToken)
  ) {
    throw new Error('Invalid MCP bearer credential.');
  }
  if (configuredTimeout !== undefined && typeof configuredTimeout !== 'number') {
    throw new Error('Invalid MCP request timeout.');
  }
  const requestTimeoutMs = configuredTimeout ?? 30_000;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 250 ||
    requestTimeoutMs > 120_000
  ) {
    throw new Error('Invalid MCP request timeout.');
  }
  if (configuredFetch !== undefined && typeof configuredFetch !== 'function') {
    throw new Error('Invalid MCP HTTP transport.');
  }
  const fetch: McpHttpFetch =
    configuredFetch === undefined ? nativeFetch : (configuredFetch as McpHttpFetch);
  const bearerAuthorization = `Bearer ${bearerToken}`;
  return Object.freeze({
    id,
    start: async (): Promise<McpServerClient> => {
      const client = new StreamableHttpMcpClient(
        canonicalEndpoint,
        fetch,
        requestTimeoutMs,
        bearerAuthorization,
      );
      try {
        await client.initialize();
        return client;
      } catch (error) {
        await client.stop().catch(() => undefined);
        throw error;
      }
    },
  });
}
