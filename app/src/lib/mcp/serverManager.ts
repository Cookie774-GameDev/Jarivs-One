import { toolRegistry } from './registry';
import { supabaseMcpAdapter } from './supabaseAdapter';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerClient {
  listTools: () => Promise<McpToolDescriptor[]>;
  invoke: (toolName: string, input: unknown, signal?: AbortSignal) => Promise<unknown>;
  health: () => Promise<boolean>;
  stop: () => Promise<void>;
}

export interface McpServerAdapter {
  id: string;
  start: () => Promise<McpServerClient>;
}

export type McpServerState = 'stopped' | 'starting' | 'running' | 'unhealthy' | 'failed';

export interface McpServerStatus {
  id: string;
  state: McpServerState;
  healthy: boolean;
  lastUsedAt?: number;
  error?: string;
}

interface ManagedServer {
  adapter: McpServerAdapter;
  state: McpServerState;
  generation: number;
  client?: McpServerClient;
  startPromise?: Promise<McpServerStatus>;
  idleTimer?: ReturnType<typeof setTimeout>;
  lastUsedAt?: number;
  error?: string;
}

export interface McpServerManagerOptions {
  invocationTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface McpInvokeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  restartOnFailure?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class McpServerManager {
  private readonly servers = new Map<string, ManagedServer>();
  private readonly invocationTimeoutMs: number;
  private readonly idleTimeoutMs: number;

  constructor(options: McpServerManagerOptions = {}) {
    this.invocationTimeoutMs = options.invocationTimeoutMs ?? 30_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60_000;
  }

  register(adapter: McpServerAdapter): () => void {
    if (!adapter.id.trim()) throw new Error('MCP server id is required.');
    if (this.servers.has(adapter.id)) throw new Error(`MCP server '${adapter.id}' is already registered.`);
    this.servers.set(adapter.id, { adapter, state: 'stopped', generation: 0 });
    return () => { void this.stop(adapter.id).finally(() => this.servers.delete(adapter.id)); };
  }

  discover(): McpServerStatus[] {
    return [...this.servers.keys()].sort().map((id) => this.status(id));
  }

  status(id: string): McpServerStatus {
    const server = this.requireServer(id);
    return {
      id,
      state: server.state,
      healthy: server.state === 'running',
      lastUsedAt: server.lastUsedAt,
      error: server.error,
    };
  }

  async start(id: string): Promise<McpServerStatus> {
    const server = this.requireServer(id);
    if (server.state === 'running' && server.client) {
      this.touch(id, server);
      return this.status(id);
    }
    if (server.startPromise) return server.startPromise;

    const generation = server.generation;
    server.state = 'starting';
    server.error = undefined;
    server.startPromise = (async () => {
      try {
        const staleClient = server.client;
        server.client = undefined;
        if (staleClient) await staleClient.stop().catch(() => undefined);
        const client = await server.adapter.start();
        if (!(await client.health())) {
          await client.stop().catch(() => undefined);
          throw new Error('health check failed');
        }
        if (server.generation !== generation) {
          await client.stop().catch(() => undefined);
          server.state = 'stopped';
          server.error = undefined;
          return this.status(id);
        }
        server.client = client;
        server.state = 'running';
        this.touch(id, server);
        return this.status(id);
      } catch (error) {
        if (server.generation !== generation) {
          server.client = undefined;
          server.state = 'stopped';
          server.error = undefined;
          return this.status(id);
        }
        server.client = undefined;
        server.state = 'failed';
        server.error = errorMessage(error);
        throw new Error(`MCP server '${id}' failed to start: ${server.error}`);
      } finally {
        server.startPromise = undefined;
      }
    })();
    return server.startPromise;
  }

  async stop(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;
    const pendingStart = server.startPromise;
    server.generation += 1;
    if (server.idleTimer) clearTimeout(server.idleTimer);
    server.idleTimer = undefined;
    const client = server.client;
    server.client = undefined;
    server.state = 'stopped';
    server.error = undefined;
    if (client) await client.stop().catch(() => undefined);
    if (pendingStart) await pendingStart.catch(() => undefined);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((id) => this.stop(id)));
  }

  async health(id: string): Promise<McpServerStatus> {
    const server = this.requireServer(id);
    if (!server.client || server.state !== 'running') return this.status(id);
    try {
      const healthy = await server.client.health();
      if (!healthy) {
        server.state = 'unhealthy';
        server.error = 'Health check failed.';
      }
    } catch (error) {
      server.state = 'unhealthy';
      server.error = errorMessage(error);
    }
    return this.status(id);
  }

  async listTools(id: string): Promise<McpToolDescriptor[]> {
    await this.start(id);
    const server = this.requireServer(id);
    if (!server.client || server.state !== 'running') {
      throw new Error(`MCP server '${id}' was stopped during startup.`);
    }
    this.touch(id, server);
    return server.client.listTools();
  }

  async invoke(
    id: string,
    toolName: string,
    input: unknown,
    options: McpInvokeOptions = {},
  ): Promise<unknown> {
    if (!toolName.trim()) throw new Error('MCP tool name is required.');
    await this.start(id);
    const server = this.requireServer(id);
    if (!server.client || server.state !== 'running') {
      throw new Error(`MCP server '${id}' was stopped during startup.`);
    }
    const timeoutMs = options.timeoutMs ?? this.invocationTimeoutMs;
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      this.touch(id, server);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error('timeout'));
          reject(new Error(`MCP ${id}.${toolName} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      });
      return await Promise.race([
        server.client.invoke(toolName, input, controller.signal),
        timeout,
      ]);
    } catch (error) {
      server.state = 'unhealthy';
      server.error = errorMessage(error);
      // Retrying after an ambiguous transport failure can duplicate a write
      // that the remote tool already performed. Only an explicitly
      // idempotent/read-only caller may opt into one restart.
      if (options.restartOnFailure !== true || options.signal?.aborted) throw error;
      await this.stop(id);
      await this.start(id);
      return this.invoke(id, toolName, input, { ...options, restartOnFailure: false });
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private requireServer(id: string): ManagedServer {
    const server = this.servers.get(id);
    if (!server) throw new Error(`Unknown MCP server '${id}'.`);
    return server;
  }

  private touch(id: string, server: ManagedServer): void {
    server.lastUsedAt = Date.now();
    if (server.idleTimer) clearTimeout(server.idleTimer);
    server.idleTimer = setTimeout(() => { void this.stop(id); }, this.idleTimeoutMs);
  }
}

/** The in-process MCP tool registry exposed through the same lifecycle contract. */
export const jarvisMcpServerManager = new McpServerManager();
jarvisMcpServerManager.register({
  id: 'vibespace-local',
  start: async () => ({
    listTools: async () => toolRegistry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    invoke: async (name, input) => toolRegistry.invoke(name, input),
    health: async () => true,
    stop: async () => undefined,
  }),
});
jarvisMcpServerManager.register(supabaseMcpAdapter);
