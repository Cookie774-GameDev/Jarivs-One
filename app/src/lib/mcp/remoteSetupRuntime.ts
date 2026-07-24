import {
  authorizeRemoteMcpConnection,
  type RemoteMcpAuthorizationReceipt,
  type RemoteMcpAuthorizationRequest,
} from './remoteAuthorization';
import {
  createStreamableHttpMcpAdapter,
  type StreamableHttpMcpAdapterOptions,
} from './streamableHttpAdapter';
import {
  jarvisMcpServerManager,
  type CanonicalMcpToolDescriptor,
  type McpServerAdapter,
  type McpServerManager,
  type McpServerRegistration,
  type McpToolExposurePolicy,
} from './serverManager';

const SAFE_SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const CONNECT_REQUEST_KEYS = new Set(['id', 'endpoint', 'confirmedByUser']);
const FORBIDDEN_CREDENTIAL_KEY = /credential|token|secret|password|authorization|api.?key/i;
const FORBIDDEN_PROCESS_KEY = /command|process|executable|argv|environment|working.?directory/i;
const SAFE_CONNECTION_ERROR = 'Unable to connect to this MCP server.';

export interface RemoteMcpConnectRequest {
  readonly id: string;
  readonly endpoint: string;
  readonly confirmedByUser: boolean;
}

export interface RemoteMcpSetupTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly exposed: boolean;
}

export type RemoteMcpSetupState = 'connecting' | 'connected' | 'failed';

export interface RemoteMcpSetupConnection {
  readonly id: string;
  readonly endpoint: string;
  readonly state: RemoteMcpSetupState;
  readonly tools: readonly Readonly<RemoteMcpSetupTool>[];
  readonly exposedTools: readonly string[];
  readonly error?: string;
}

export interface RemoteMcpSetupRuntime {
  getSnapshot(): readonly Readonly<RemoteMcpSetupConnection>[];
  subscribe(listener: () => void): () => void;
  connect(request: RemoteMcpConnectRequest): Promise<void>;
  setToolExposure(id: string, toolNames: readonly string[]): void;
  disconnect(id: string): Promise<void>;
}

interface SetupManager {
  register(adapter: McpServerAdapter, registration?: McpServerRegistration): () => Promise<void>;
  start(id: string): Promise<unknown>;
  listTools(id: string): Promise<readonly Readonly<CanonicalMcpToolDescriptor>[]>;
  setToolExposure(id: string, exposure: McpToolExposurePolicy): void;
}

export interface RemoteMcpSetupDependencies {
  readonly manager?: SetupManager;
  readonly authorize?: (
    request: RemoteMcpAuthorizationRequest,
  ) => Readonly<RemoteMcpAuthorizationReceipt>;
  readonly createAdapter?: (options: StreamableHttpMcpAdapterOptions) => Readonly<McpServerAdapter>;
}

interface ManagedSetupConnection {
  id: string;
  endpoint: string;
  state: RemoteMcpSetupState;
  disconnecting: boolean;
  tools: readonly Readonly<RemoteMcpSetupTool>[];
  exposedTools: readonly string[];
  error?: string;
  release(): Promise<void>;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return value as Record<string, unknown>;
}

function dataProperty(source: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !('value' in descriptor)) {
    throw new Error('Invalid remote MCP setup request.');
  }
  return descriptor.value;
}

function validatedConnectRequest(value: unknown): RemoteMcpConnectRequest {
  const source = plainRecord(value);
  if (!source) throw new Error('Invalid remote MCP setup request.');
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== 'string') throw new Error('Invalid remote MCP setup request.');
    if (FORBIDDEN_CREDENTIAL_KEY.test(key)) {
      throw new Error('Remote MCP credentials are not supported by this setup flow.');
    }
    if (FORBIDDEN_PROCESS_KEY.test(key)) {
      throw new Error('Remote MCP process configuration is not supported by this setup flow.');
    }
    if (!CONNECT_REQUEST_KEYS.has(key)) {
      throw new Error('Invalid remote MCP setup request.');
    }
    dataProperty(source, key);
  }
  const id = dataProperty(source, 'id');
  const endpoint = dataProperty(source, 'endpoint');
  const confirmedByUser = dataProperty(source, 'confirmedByUser');
  if (typeof id !== 'string' || !SAFE_SERVER_ID.test(id)) {
    throw new Error('Invalid MCP server id.');
  }
  if (typeof endpoint !== 'string') throw new Error('Invalid remote MCP endpoint.');
  if (confirmedByUser !== true) {
    throw new Error('Explicit user authorization is required for remote MCP connections.');
  }
  return { id, endpoint, confirmedByUser: true };
}

function frozenTools(
  tools: readonly Readonly<CanonicalMcpToolDescriptor>[],
  exposedTools: readonly string[] = [],
): readonly Readonly<RemoteMcpSetupTool>[] {
  const exposed = new Set(exposedTools);
  const result = tools.map((tool) =>
    Object.freeze({
      name: tool.name,
      ...(tool.title === undefined ? {} : { title: tool.title }),
      description: tool.description,
      exposed: exposed.has(tool.name),
    }),
  );
  result.sort((left, right) =>
    left.name.localeCompare(right.name, 'en', { numeric: true, sensitivity: 'variant' }),
  );
  return Object.freeze(result);
}

function snapshotConnection(
  connection: ManagedSetupConnection,
): Readonly<RemoteMcpSetupConnection> {
  return Object.freeze({
    id: connection.id,
    endpoint: connection.endpoint,
    state: connection.state,
    tools: connection.tools,
    exposedTools: connection.exposedTools,
    ...(connection.error === undefined ? {} : { error: connection.error }),
  });
}

export function createRemoteMcpSetupRuntime(
  dependencies: RemoteMcpSetupDependencies = {},
): RemoteMcpSetupRuntime {
  const manager = (dependencies.manager ?? jarvisMcpServerManager) as SetupManager;
  const authorize = dependencies.authorize ?? authorizeRemoteMcpConnection;
  const createAdapter = dependencies.createAdapter ?? createStreamableHttpMcpAdapter;
  const connections = new Map<string, ManagedSetupConnection>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Readonly<RemoteMcpSetupConnection>[] = Object.freeze([]);

  const emit = () => {
    snapshot = Object.freeze(
      [...connections.values()]
        .sort((left, right) =>
          left.id.localeCompare(right.id, 'en', { numeric: true, sensitivity: 'variant' }),
        )
        .map(snapshotConnection),
    );
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // UI subscribers are observational and cannot alter connection state.
      }
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async connect(candidate) {
      const request = validatedConnectRequest(candidate);
      if (connections.has(request.id)) {
        throw new Error(`MCP server '${request.id}' is already configured.`);
      }
      const authorization = authorize({
        endpoint: request.endpoint,
        confirmedByUser: true,
        intent: 'connect_external_mcp',
      });
      const adapter = createAdapter({
        id: request.id,
        endpoint: authorization.endpoint,
        authorization,
      });
      const unregister = manager.register(adapter, {
        kind: 'external_mcp',
        domains: [],
        exposure: { mode: 'none' },
      });
      let releasePromise: Promise<void> | undefined;
      const release = () => {
        releasePromise ??= Promise.resolve().then(unregister);
        return releasePromise;
      };
      const connection: ManagedSetupConnection = {
        id: request.id,
        endpoint: authorization.endpoint,
        state: 'connecting',
        disconnecting: false,
        tools: Object.freeze([]),
        exposedTools: Object.freeze([]),
        release,
      };
      connections.set(request.id, connection);
      emit();

      try {
        await manager.start(request.id);
        if (connection.disconnecting || connections.get(request.id) !== connection) {
          await release().catch(() => undefined);
          return;
        }
        const tools = await manager.listTools(request.id);
        if (connections.get(request.id) !== connection) return;
        connection.state = 'connected';
        connection.tools = frozenTools(tools);
        emit();
      } catch {
        await release().catch(() => undefined);
        if (connection.disconnecting || connections.get(request.id) !== connection) {
          return;
        }
        if (connections.get(request.id) === connection) {
          connection.state = 'failed';
          connection.tools = Object.freeze([]);
          connection.exposedTools = Object.freeze([]);
          connection.error = SAFE_CONNECTION_ERROR;
          emit();
        }
        throw new Error(SAFE_CONNECTION_ERROR);
      }
    },
    setToolExposure(id, requestedToolNames) {
      const connection = connections.get(id);
      if (!connection || connection.state !== 'connected') {
        throw new Error('Remote MCP server is not connected.');
      }
      if (!Array.isArray(requestedToolNames)) {
        throw new Error('Invalid remote MCP tool allowlist.');
      }
      const discovered = new Set(connection.tools.map((tool) => tool.name));
      const toolNames = [...new Set(requestedToolNames)];
      for (const name of toolNames) {
        if (typeof name !== 'string' || !discovered.has(name)) {
          throw new Error('Only discovered MCP tools may be exposed.');
        }
      }
      toolNames.sort((left, right) =>
        left.localeCompare(right, 'en', { numeric: true, sensitivity: 'variant' }),
      );
      manager.setToolExposure(
        id,
        toolNames.length === 0
          ? { mode: 'none' }
          : { mode: 'allowlist', toolNames: Object.freeze(toolNames) },
      );
      connection.exposedTools = Object.freeze([...toolNames]);
      connection.tools = Object.freeze(
        connection.tools.map((tool) =>
          Object.freeze({ ...tool, exposed: toolNames.includes(tool.name) }),
        ),
      );
      emit();
    },
    async disconnect(id) {
      const connection = connections.get(id);
      if (!connection) return;
      connection.disconnecting = true;
      await connection.release();
      if (connections.get(id) === connection) {
        connections.delete(id);
        emit();
      }
    },
  };
}

export const remoteMcpSetupRuntime = createRemoteMcpSetupRuntime({
  manager: jarvisMcpServerManager as McpServerManager,
});
