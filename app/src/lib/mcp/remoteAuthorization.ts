const RECEIPT_TTL_MS = 5 * 60_000;
const MAX_ENDPOINT_CHARS = 2_048;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ALLOWED_REQUEST_KEYS = new Set(['endpoint', 'confirmedByUser', 'intent']);

export interface RemoteMcpAuthorizationRequest {
  readonly endpoint: string;
  readonly confirmedByUser: boolean;
  readonly intent: 'connect_external_mcp';
}

export interface RemoteMcpAuthorizationReceipt {
  readonly endpoint: string;
  readonly intent: 'connect_external_mcp';
  readonly expiresAt: number;
}

export interface ClaimedRemoteMcpAuthorization {
  readonly endpoint: string;
  readonly intent: 'connect_external_mcp';
}

interface ReceiptState {
  endpoint: string;
  expiresAt: number;
  claimed: boolean;
}

const receiptStates = new WeakMap<object, ReceiptState>();

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return value as Record<string, unknown>;
}

function dataProperty(source: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !('value' in descriptor)) {
    throw new Error('Invalid remote MCP authorization request.');
  }
  return descriptor.value;
}

export function canonicalRemoteMcpEndpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid remote MCP endpoint.');
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_ENDPOINT_CHARS) {
    throw new Error('Invalid remote MCP endpoint.');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(candidate);
  } catch {
    throw new Error('Invalid remote MCP endpoint.');
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search ||
    (endpoint.protocol !== 'https:' &&
      !(endpoint.protocol === 'http:' && LOOPBACK_HOSTS.has(endpoint.hostname.toLowerCase())))
  ) {
    throw new Error('Unsafe remote MCP endpoint.');
  }
  if (!endpoint.hostname || endpoint.href.length > MAX_ENDPOINT_CHARS) {
    throw new Error('Invalid remote MCP endpoint.');
  }
  return endpoint.href;
}

export function authorizeRemoteMcpConnection(
  request: RemoteMcpAuthorizationRequest,
): Readonly<RemoteMcpAuthorizationReceipt> {
  const source = plainRecord(request);
  if (!source) throw new Error('Invalid remote MCP authorization request.');
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== 'string') {
      throw new Error('Invalid remote MCP authorization request.');
    }
    if (/credential|token|secret|password|authorization|api.?key/i.test(key)) {
      throw new Error('Remote MCP credential authorization is not supported by this flow.');
    }
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      throw new Error('Invalid remote MCP authorization request.');
    }
  }

  if (dataProperty(source, 'confirmedByUser') !== true) {
    throw new Error('Explicit user authorization is required for remote MCP connections.');
  }
  if (dataProperty(source, 'intent') !== 'connect_external_mcp') {
    throw new Error('Invalid remote MCP authorization intent.');
  }
  const endpoint = canonicalRemoteMcpEndpoint(dataProperty(source, 'endpoint'));
  const rawNow = Date.now();
  if (
    typeof rawNow !== 'number' ||
    !Number.isFinite(rawNow) ||
    rawNow < 0 ||
    !Number.isSafeInteger(rawNow) ||
    rawNow > Number.MAX_SAFE_INTEGER - RECEIPT_TTL_MS
  ) {
    throw new Error('Invalid remote MCP authorization timestamp.');
  }

  const receipt = Object.freeze({
    endpoint,
    intent: 'connect_external_mcp' as const,
    expiresAt: rawNow + RECEIPT_TTL_MS,
  });
  receiptStates.set(receipt, {
    endpoint,
    expiresAt: receipt.expiresAt,
    claimed: false,
  });
  return receipt;
}

export function claimRemoteMcpAuthorization(
  receipt: RemoteMcpAuthorizationReceipt,
  endpoint: string,
): Readonly<ClaimedRemoteMcpAuthorization> {
  const state =
    receipt && typeof receipt === 'object' ? receiptStates.get(receipt as object) : undefined;
  if (!state || state.claimed) {
    throw new Error('Invalid or already used remote MCP authorization.');
  }
  const now = Date.now();
  if (!Number.isFinite(now) || now < 0 || !Number.isSafeInteger(now)) {
    throw new Error('Invalid remote MCP authorization timestamp.');
  }
  if (now > state.expiresAt) {
    state.claimed = true;
    throw new Error('Remote MCP authorization expired.');
  }
  if (canonicalRemoteMcpEndpoint(endpoint) !== state.endpoint) {
    throw new Error('Remote MCP authorization endpoint mismatch.');
  }
  state.claimed = true;
  return Object.freeze({
    endpoint: state.endpoint,
    intent: 'connect_external_mcp' as const,
  });
}
