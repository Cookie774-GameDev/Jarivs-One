import type { ActionResult } from '@/lib/actions/types';
import { McpServerManager, type CanonicalMcpToolDescriptor } from '@/lib/mcp/serverManager';
import { createBearerStreamableHttpMcpAdapter } from '@/lib/mcp/streamableHttpAdapter';
import type { NormalizedExternalMcpToolResult } from '@/lib/mcp/toolResult';
import type { PluginTestResult } from './types';

type CredentialMap = Readonly<Record<string, string>>;

const ZAPIER_MCP_ENDPOINT = 'https://mcp.zapier.com/api/v1/connect';
const ZAPIER_SERVER_ID = 'zapier-gateway';
const CONNECTION_TOKEN_MIN = 16;
const CONNECTION_TOKEN_MAX = 4_096;
const DISCOVERY_LIMIT = 20;
const DISCOVERY_LIMIT_MAX = 50;
const QUERY_MAX = 240;
const INPUT_JSON_MAX = 64 * 1_024;
const SAFE_TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_FINGERPRINT = /^sha256:[a-f0-9]{64}$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const GENERIC_ACTION_PREFIXES = new Set([
  'action',
  'add',
  'create',
  'delete',
  'find',
  'get',
  'list',
  'manage',
  'remove',
  'search',
  'send',
  'tool',
  'update',
  'zapier',
]);

export interface ZapierGateway {
  readonly listTools: (
    signal: AbortSignal,
  ) => Promise<readonly Readonly<CanonicalMcpToolDescriptor>[]>;
  readonly invoke: (
    actionId: string,
    input: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ) => Promise<NormalizedExternalMcpToolResult>;
  readonly close: () => Promise<void>;
}

export type ZapierGatewayFactory = (connectionToken: string) => ZapierGateway;

interface ZapierActionIdentity {
  readonly actionId: string;
  readonly actionTitle: string;
  readonly downstreamApp?: string;
  readonly untrustedDescription: string;
  readonly schemaFingerprint: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly invocationSupported: boolean;
}

class ZapierProviderError extends Error {
  constructor(reason: string) {
    super(`Zapier MCP provider denied the operation: ${reason}.`);
    this.name = 'ZapierProviderError';
  }
}

function zapierFailure(reason: string): ZapierProviderError {
  return new ZapierProviderError(reason);
}

function callerCancellation(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('Zapier operation cancelled.', 'AbortError');
}

function assertNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw callerCancellation(signal);
}

function connectionToken(values: CredentialMap): string {
  const value = values.connection_token;
  if (
    typeof value !== 'string' ||
    value.length < CONNECTION_TOKEN_MIN ||
    value.length > CONNECTION_TOKEN_MAX ||
    /\s|[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw zapierFailure('connection_token_invalid');
  }
  return value;
}

function exactRecord(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  reason: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw zapierFailure(reason);
  }
  const allowedSet = new Set(allowed);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !allowedSet.has(key) ||
      !descriptor ||
      !('value' in descriptor)
    ) {
      throw zapierFailure(reason);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactIdentityText(value: unknown, maximum: number, reason: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw zapierFailure(reason);
  }
  return value;
}

function discoveryParameters(params: Readonly<Record<string, unknown>>): {
  query?: string;
  maxResults: number;
} {
  const record = exactRecord(params, ['query', 'maxResults'], 'discovery_parameters_invalid');
  let query: string | undefined;
  if (record.query !== undefined) {
    if (
      typeof record.query !== 'string' ||
      record.query.length > QUERY_MAX ||
      /[\u0000-\u001f\u007f]/u.test(record.query)
    ) {
      throw zapierFailure('discovery_parameters_invalid');
    }
    const normalized = record.query.normalize('NFC').trim();
    if (normalized) query = normalized;
  }
  const maxResults = record.maxResults ?? DISCOVERY_LIMIT;
  if (
    typeof maxResults !== 'number' ||
    !Number.isSafeInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > DISCOVERY_LIMIT_MAX
  ) {
    throw zapierFailure('discovery_parameters_invalid');
  }
  return { ...(query === undefined ? {} : { query }), maxResults };
}

function invocationParameters(params: Readonly<Record<string, unknown>>): {
  actionId: string;
  actionTitle: string;
  downstreamApp: string;
  schemaFingerprint: string;
  input: Readonly<Record<string, unknown>>;
} {
  const record = exactRecord(
    params,
    ['actionId', 'actionTitle', 'downstreamApp', 'schemaFingerprint', 'inputJson'],
    'invocation_parameters_invalid',
  );
  const actionId = exactIdentityText(record.actionId, 128, 'invocation_parameters_invalid');
  if (!SAFE_TOOL_NAME.test(actionId)) throw zapierFailure('invocation_parameters_invalid');
  const actionTitle = exactIdentityText(record.actionTitle, 160, 'invocation_parameters_invalid');
  const downstreamApp = exactIdentityText(
    record.downstreamApp,
    80,
    'invocation_parameters_invalid',
  );
  const schemaFingerprint = exactIdentityText(
    record.schemaFingerprint,
    71,
    'invocation_parameters_invalid',
  );
  if (!SAFE_FINGERPRINT.test(schemaFingerprint)) {
    throw zapierFailure('invocation_parameters_invalid');
  }
  if (
    typeof record.inputJson !== 'string' ||
    record.inputJson.length > INPUT_JSON_MAX ||
    !record.inputJson.trim()
  ) {
    throw zapierFailure('input_json_invalid');
  }
  let input: unknown;
  try {
    input = JSON.parse(record.inputJson);
  } catch {
    throw zapierFailure('input_json_invalid');
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw zapierFailure('input_json_invalid');
  }
  return {
    actionId,
    actionTitle,
    downstreamApp,
    schemaFingerprint,
    input: input as Readonly<Record<string, unknown>>,
  };
}

function stableJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value)) {
    throw zapierFailure('action_schema_invalid');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw zapierFailure('action_schema_invalid');
      }
      return `[${value.map((entry) => stableJson(entry, seen)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw zapierFailure('action_schema_invalid');
    }
    const source = value as Record<string, unknown>;
    const keys = Reflect.ownKeys(source);
    if (keys.some((key) => typeof key !== 'string' || FORBIDDEN_KEYS.has(key))) {
      throw zapierFailure('action_schema_invalid');
    }
    return `{${(keys as string[])
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (!descriptor || !('value' in descriptor)) {
          throw zapierFailure('action_schema_invalid');
        }
        return `${JSON.stringify(key)}:${stableJson(descriptor.value, seen)}`;
      })
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

async function fingerprintSchema(schema: Readonly<Record<string, unknown>>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableJson(schema)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

function displayAppName(value: string): string | undefined {
  const normalized = value.normalize('NFC').trim();
  if (
    !normalized ||
    normalized.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    !/[\p{L}\p{N}]/u.test(normalized)
  ) {
    return undefined;
  }
  const firstWord = normalized.split(/\s+/u, 1)[0]?.toLocaleLowerCase('en-US');
  if (!firstWord || GENERIC_ACTION_PREFIXES.has(firstWord)) return undefined;
  return normalized;
}

function titleCaseIdentifier(value: string): string {
  return value
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLocaleLowerCase('en-US');
      if (lower === 'gmail') return 'Gmail';
      if (lower === 'api') return 'API';
      return `${part.charAt(0).toLocaleUpperCase('en-US')}${part.slice(1)}`;
    })
    .join(' ');
}

function downstreamApp(tool: Readonly<CanonicalMcpToolDescriptor>): string | undefined {
  let fromTitle: string | undefined;
  if (tool.title) {
    const titleMatch = tool.title.match(/^(.{1,80}?)(?:\s*[:|]\s+|\s+[-–—]\s+).+$/u);
    fromTitle = titleMatch?.[1] ? displayAppName(titleMatch[1]) : undefined;
  }
  const prefix = tool.name.match(/^([A-Za-z0-9-]{2,40})(?=__|[_.:])/u)?.[1];
  const fromName = prefix ? displayAppName(titleCaseIdentifier(prefix)) : undefined;
  if (
    fromTitle &&
    fromName &&
    fromTitle.toLocaleLowerCase('en-US') !== fromName.toLocaleLowerCase('en-US')
  ) {
    return undefined;
  }
  return fromTitle ?? fromName;
}

async function actionIdentity(
  tool: Readonly<CanonicalMcpToolDescriptor>,
): Promise<Readonly<ZapierActionIdentity>> {
  const actionTitle = tool.title ?? tool.name;
  const app = downstreamApp(tool);
  return Object.freeze({
    actionId: tool.name,
    actionTitle,
    ...(app === undefined ? {} : { downstreamApp: app }),
    untrustedDescription: tool.description,
    schemaFingerprint: await fingerprintSchema(tool.inputSchema),
    inputSchema: tool.inputSchema,
    invocationSupported: app !== undefined,
  });
}

function isNormalizedResult(value: unknown): value is NormalizedExternalMcpToolResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.contentTrust === 'external_untrusted' &&
    typeof record.ok === 'boolean' &&
    typeof record.safeSummary === 'string' &&
    Array.isArray(record.textExcerpts) &&
    Array.isArray(record.sourceRefs) &&
    Array.isArray(record.artifacts) &&
    Array.isArray(record.suggestedNextActions) &&
    typeof record.omitted === 'object' &&
    record.omitted !== null
  );
}

function productionGateway(connectionTokenValue: string): ZapierGateway {
  const manager = new McpServerManager({
    discoveryTimeoutMs: 12_000,
    invocationTimeoutMs: 30_000,
    idleTimeoutMs: 60_000,
  });
  const unregister = manager.register(
    createBearerStreamableHttpMcpAdapter({
      id: ZAPIER_SERVER_ID,
      endpoint: ZAPIER_MCP_ENDPOINT,
      bearerToken: connectionTokenValue,
      requestTimeoutMs: 30_000,
    }),
    {
      kind: 'external_mcp',
      domains: ['zapier'],
      exposure: { mode: 'none' },
    },
  );
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    listTools: (signal: AbortSignal) =>
      manager.listTools(ZAPIER_SERVER_ID, { signal, timeoutMs: 12_000 }),
    invoke: async (
      actionId: string,
      input: Readonly<Record<string, unknown>>,
      signal: AbortSignal,
    ) => {
      manager.setToolExposure(ZAPIER_SERVER_ID, {
        mode: 'allowlist',
        toolNames: [actionId],
      });
      const result = await manager.invoke(ZAPIER_SERVER_ID, actionId, input, {
        signal,
        timeoutMs: 30_000,
        restartOnFailure: false,
      });
      if (!isNormalizedResult(result)) throw zapierFailure('gateway_result_invalid');
      return result;
    },
    close: () => {
      closePromise ??= unregister();
      return closePromise;
    },
  });
}

async function withGateway<T>(input: {
  connectionToken: string;
  signal: AbortSignal;
  gatewayFactory: ZapierGatewayFactory;
  operation: (gateway: ZapierGateway) => Promise<T>;
}): Promise<T> {
  assertNotCancelled(input.signal);
  let gateway: ZapierGateway;
  try {
    gateway = input.gatewayFactory(input.connectionToken);
    if (
      !gateway ||
      typeof gateway.listTools !== 'function' ||
      typeof gateway.invoke !== 'function' ||
      typeof gateway.close !== 'function'
    ) {
      throw new Error('Invalid gateway.');
    }
  } catch {
    throw zapierFailure('gateway_operation_failed');
  }
  try {
    return await input.operation(gateway);
  } catch (error) {
    if (error instanceof ZapierProviderError) throw error;
    if (input.signal.aborted) throw callerCancellation(input.signal);
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw zapierFailure('gateway_operation_failed');
  } finally {
    await gateway.close().catch(() => undefined);
  }
}

async function identitiesFor(
  tools: readonly Readonly<CanonicalMcpToolDescriptor>[],
): Promise<readonly Readonly<ZapierActionIdentity>[]> {
  assertUniqueActionIds(tools);
  return await Promise.all(tools.map(actionIdentity));
}

function assertUniqueActionIds(tools: readonly Readonly<CanonicalMcpToolDescriptor>[]): void {
  const actionIds = new Set<string>();
  for (const tool of tools) {
    if (actionIds.has(tool.name)) throw zapierFailure('duplicate_action_identity');
    actionIds.add(tool.name);
  }
}

export async function testZapierConnection(input: {
  values: CredentialMap;
  signal: AbortSignal;
  gatewayFactory?: ZapierGatewayFactory;
}): Promise<PluginTestResult> {
  const token = connectionToken(input.values);
  const actionCount = await withGateway({
    connectionToken: token,
    signal: input.signal,
    gatewayFactory: input.gatewayFactory ?? productionGateway,
    operation: async (gateway) => (await gateway.listTools(input.signal)).length,
  });
  return {
    ok: true,
    accountLabel: `Zapier MCP · ${actionCount} exposed ${actionCount === 1 ? 'action' : 'actions'}`,
  };
}

export async function runZapierTool(input: {
  toolName: string;
  params: Readonly<Record<string, unknown>>;
  values: CredentialMap;
  signal: AbortSignal;
  gatewayFactory?: ZapierGatewayFactory;
}): Promise<ActionResult> {
  const token = connectionToken(input.values);
  if (input.toolName === 'actions_discover') {
    const parameters = discoveryParameters(input.params);
    return await withGateway({
      connectionToken: token,
      signal: input.signal,
      gatewayFactory: input.gatewayFactory ?? productionGateway,
      operation: async (gateway) => {
        const actions = await identitiesFor(await gateway.listTools(input.signal));
        const query = parameters.query?.toLocaleLowerCase('en-US');
        const matches = actions.filter((action) => {
          if (!query) return true;
          return [
            action.actionId,
            action.actionTitle,
            action.downstreamApp ?? '',
            action.untrustedDescription,
          ].some((value) => value.toLocaleLowerCase('en-US').includes(query));
        });
        const bounded = Object.freeze(matches.slice(0, parameters.maxResults));
        return {
          ok: true,
          summary: `${bounded.length} currently exposed Zapier ${
            bounded.length === 1 ? 'action' : 'actions'
          } found.`,
          data: Object.freeze({
            source: 'currently_configured_zapier_actions',
            contentTrust: 'external_untrusted',
            actions: bounded,
          }),
        };
      },
    });
  }

  if (input.toolName === 'action_invoke') {
    const approved = invocationParameters(input.params);
    return await withGateway({
      connectionToken: token,
      signal: input.signal,
      gatewayFactory: input.gatewayFactory ?? productionGateway,
      operation: async (gateway) => {
        const tools = await gateway.listTools(input.signal);
        assertUniqueActionIds(tools);
        const selected = tools.find(({ name }) => name === approved.actionId);
        if (!selected) throw zapierFailure('approved_action_unavailable');
        const current = await actionIdentity(selected);
        if (!current.downstreamApp || !current.invocationSupported) {
          throw zapierFailure('downstream_app_unavailable');
        }
        if (
          current.actionTitle !== approved.actionTitle ||
          current.downstreamApp !== approved.downstreamApp ||
          current.schemaFingerprint !== approved.schemaFingerprint
        ) {
          throw zapierFailure('approved_action_changed');
        }
        const result = await gateway.invoke(current.actionId, approved.input, input.signal);
        if (!result.ok) {
          return {
            ok: false,
            error: `Zapier action “${current.actionTitle}” reported a downstream failure through ${current.downstreamApp}.`,
          };
        }
        return {
          ok: true,
          summary: `Zapier action “${current.actionTitle}” completed through ${current.downstreamApp}.`,
          data: Object.freeze({
            actionId: current.actionId,
            actionTitle: current.actionTitle,
            downstreamApp: current.downstreamApp,
            schemaFingerprint: current.schemaFingerprint,
            contentTrust: 'external_untrusted',
            result,
          }),
        };
      },
    });
  }

  throw zapierFailure('tool_unavailable');
}
