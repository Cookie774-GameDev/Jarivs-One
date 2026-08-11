import { HarnessError, redactHarnessText } from './errors';
import { normalizeOpenCodeEvent } from './eventNormalizer';
import { createOpenCodeHttpClient, type OpenCodeHttpClient } from './openCodeClient';
import {
  harnessRuntimeManager,
  type HarnessRuntimeManager,
  type OpenCodeServerConnection,
} from './runtimeManager';
import { parseOpenCodeProviderResponse, resolveOpenCodeSelection } from './providerReconciliation';
import type { OpenCodeSseEvent } from './sseParser';
import type {
  CreateHarnessSession,
  HarnessApprovalResponse,
  HarnessEvent,
  HarnessModel,
  HarnessProvider,
  HarnessReady,
  HarnessSendRequest,
  HarnessSession,
  VibeSpaceHarness,
} from './types';

interface OpenCodeHarnessOptions {
  fetch?: typeof globalThis.fetch;
  maxReconnectAttempts?: number;
  reconnectDelay?: (attempt: number) => Promise<void>;
}

const MAX_RECENT_EVENTS = 256;
const MAX_ERROR_LENGTH = 2_048;

function safeError(error: unknown, connection?: OpenCodeServerConnection): string {
  let message = error instanceof Error ? error.message : 'OpenCode stream failed.';
  if (connection) message = message.split(connection.password).join('[REDACTED]');
  return redactHarnessText(message).slice(0, MAX_ERROR_LENGTH);
}

class RecentEventSet {
  private readonly values = new Set<string>();
  private readonly order: string[] = [];

  add(event: OpenCodeSseEvent): boolean {
    let first = 2_166_136_261;
    let second = 5381;
    for (let index = 0; index < event.data.length; index += 1) {
      const code = event.data.charCodeAt(index);
      first = Math.imul(first ^ code, 16_777_619) >>> 0;
      second = (Math.imul(second, 33) ^ code) >>> 0;
    }
    const identity = `${event.id ?? ''}\0${event.event ?? ''}\0${event.data.length}:${first}:${second}`;
    if (this.values.has(identity)) return false;
    this.values.add(identity);
    this.order.push(identity);
    if (this.order.length > MAX_RECENT_EVENTS) {
      const expired = this.order.shift();
      if (expired !== undefined) this.values.delete(expired);
    }
    return true;
  }
}

function nextEvent(
  iterator: AsyncIterator<OpenCodeSseEvent>,
): Promise<IteratorResult<OpenCodeSseEvent>> {
  const pending = iterator.next();
  void pending.catch(() => undefined);
  return pending;
}

export class OpenCodeHarness implements VibeSpaceHarness {
  private readonly controllers = new Set<AbortController>();
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelay: (attempt: number) => Promise<void>;
  private disposed = false;

  constructor(
    private readonly runtime: HarnessRuntimeManager = harnessRuntimeManager,
    private readonly options: OpenCodeHarnessOptions = {},
  ) {
    this.maxReconnectAttempts = Math.max(0, Math.min(5, options.maxReconnectAttempts ?? 2));
    this.reconnectDelay =
      options.reconnectDelay ??
      ((attempt) => new Promise((resolve) => setTimeout(resolve, Math.min(1_000, attempt * 150))));
  }

  private connection(): OpenCodeServerConnection {
    const connection = this.runtime.getConnection();
    if (!connection) {
      throw new HarnessError({
        code: 'HARNESS_HEALTH_FAILED',
        message: 'The private OpenCode server is not ready.',
        repair: 'Retry after the harness finishes starting.',
        recoverable: true,
      });
    }
    return connection;
  }

  private client(connection = this.connection()): OpenCodeHttpClient {
    return createOpenCodeHttpClient(connection, { fetch: this.options.fetch });
  }

  async ensureReady(): Promise<HarnessReady> {
    if (this.disposed) throw new Error('OpenCode harness is disposed.');
    if (!this.runtime.getConnection()) await this.runtime.refresh();
    const connection = this.connection();
    return { source: connection.source, version: connection.version };
  }

  async createSession(input: CreateHarnessSession): Promise<HarnessSession> {
    await this.ensureReady();
    const session = await this.client().createSession({
      ...(input.title ? { title: input.title } : {}),
      ...(input.parentSessionId ? { parentID: input.parentSessionId } : {}),
    });
    return {
      id: session.id,
      chatId: input.chatId,
      ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    };
  }

  async *send(input: HarnessSendRequest): AsyncIterable<HarnessEvent> {
    await this.ensureReady();
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) controller.abort();
    this.controllers.add(controller);

    let connection = this.connection();
    let client = this.client(connection);
    let promptSubmitted = false;
    let terminal = false;
    let reconnects = 0;
    const recent = new RecentEventSet();

    try {
      const resolvedSelection = resolveOpenCodeSelection(
        input.selection,
        await this.listProviders(),
      );
      let iterator = client.events(controller.signal)[Symbol.asyncIterator]();
      let pending = nextEvent(iterator);
      if (!controller.signal.aborted) {
        await client.promptAsync(
          input.sessionId,
          {
            model: {
              providerID: resolvedSelection.providerId,
              modelID: resolvedSelection.modelId,
            },
            parts: input.parts,
            ...(input.system ? { system: input.system } : {}),
          },
          controller.signal,
        );
        promptSubmitted = true;
      }

      while (!controller.signal.aborted && !terminal) {
        try {
          const item = await pending;
          if (item.done) throw new Error('OpenCode event stream closed before completion.');
          pending = nextEvent(iterator);
          if (!recent.add(item.value)) continue;

          let raw: unknown;
          try {
            raw = JSON.parse(item.value.data) as unknown;
          } catch {
            continue;
          }
          const normalized = normalizeOpenCodeEvent(raw, input.sessionId);
          for (const event of normalized) {
            yield event;
            if (event.type === 'done' || event.type === 'error') {
              terminal = true;
              break;
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          if (reconnects >= this.maxReconnectAttempts) {
            const detail = safeError(error, connection);
            yield {
              type: 'error',
              code: 'HARNESS_CRASHED',
              message: `OpenCode connection could not be recovered; retry the active turn.${
                detail ? ` ${detail}` : ''
              }`.slice(0, MAX_ERROR_LENGTH),
            };
            terminal = true;
            break;
          }
          reconnects += 1;
          await this.reconnectDelay(reconnects);
          try {
            await this.runtime.refresh();
            connection = this.connection();
            client = this.client(connection);
            await client.getSession(input.sessionId);
            iterator = client.events(controller.signal)[Symbol.asyncIterator]();
            pending = nextEvent(iterator);
          } catch (recoveryError) {
            if (reconnects >= this.maxReconnectAttempts) {
              const detail = safeError(recoveryError, connection);
              yield {
                type: 'error',
                code: 'HARNESS_CRASHED',
                message: `OpenCode server recovery failed; retry the active turn.${
                  detail ? ` ${detail}` : ''
                }`.slice(0, MAX_ERROR_LENGTH),
              };
              terminal = true;
            }
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        yield {
          type: 'error',
          code:
            error instanceof HarnessError
              ? error.code
              : promptSubmitted
                ? 'HARNESS_CRASHED'
                : 'HARNESS_START_FAILED',
          message: safeError(error, connection),
        };
      }
    } finally {
      controller.abort();
      this.controllers.delete(controller);
      input.signal?.removeEventListener('abort', abort);
      if (((promptSubmitted && !terminal) || input.signal?.aborted) && !this.disposed) {
        try {
          await client.abortSession(input.sessionId);
        } catch {
          // Best effort: the server may be the reason the stream ended.
        }
      }
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.controllers.forEach((controller) => controller.abort());
    await this.client().abortSession(sessionId);
  }

  async listProviders(): Promise<readonly HarnessProvider[]> {
    return parseOpenCodeProviderResponse(await this.client().configProviders());
  }

  async listModels(providerId?: string): Promise<readonly HarnessModel[]> {
    const providers = await this.listProviders();
    return providerId
      ? (providers.find((provider) => provider.id === providerId)?.models ?? [])
      : providers.flatMap((provider) => provider.models);
  }

  async respondToApproval(input: HarnessApprovalResponse): Promise<void> {
    await this.client().replyPermission(input.sessionId, input.approvalId, input.response);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    const connection = this.runtime.getConnection();
    if (connection) await this.client(connection).disposeInstance();
  }
}

export const openCodeHarness: VibeSpaceHarness = new OpenCodeHarness();
