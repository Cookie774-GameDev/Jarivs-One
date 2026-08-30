export type PermanentDeleteOperation = 'delete-chat' | 'delete-chat-batch' | 'delete-snapshot';

export type PermanentDeleteScope = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string | null;
  sessionId: string;
}>;

export type PermanentDeleteRequest = Readonly<{
  operation: PermanentDeleteOperation;
  resourceIds: readonly string[];
}>;

export interface PermanentDeleteReceipt {
  readonly __permanentDeleteReceipt: unique symbol;
}

export interface PermanentDeleteAuthority {
  issue(request: PermanentDeleteRequest): PermanentDeleteReceipt;
  consume(
    receipt: PermanentDeleteReceipt,
    liveScope: PermanentDeleteScope,
    request: PermanentDeleteRequest,
  ): PermanentDeleteRequest | null;
  revoke(): void;
}

const DEFAULT_TTL_MS = 30_000;
const MAX_RESOURCE_IDS = 200;

function sameScope(left: PermanentDeleteScope, right: PermanentDeleteScope): boolean {
  return (
    left.accountId === right.accountId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.sessionId === right.sessionId
  );
}

function normalizedRequest(request: PermanentDeleteRequest): PermanentDeleteRequest {
  const resourceIds = request.resourceIds.map((id) => id.trim());
  if (
    resourceIds.length === 0 ||
    resourceIds.length > MAX_RESOURCE_IDS ||
    resourceIds.some((id) => id.length === 0) ||
    new Set(resourceIds).size !== resourceIds.length
  ) {
    throw new Error('invalid_permanent_delete_targets');
  }
  return Object.freeze({ operation: request.operation, resourceIds: Object.freeze(resourceIds) });
}

function sameRequest(left: PermanentDeleteRequest, right: PermanentDeleteRequest): boolean {
  return (
    left.operation === right.operation &&
    left.resourceIds.length === right.resourceIds.length &&
    left.resourceIds.every((id, index) => id === right.resourceIds[index])
  );
}

export function createPermanentDeleteAuthority(_input: {
  scope: PermanentDeleteScope;
  now?: () => number;
  ttlMs?: number;
}): PermanentDeleteAuthority {
  const now = _input.now ?? Date.now;
  const ttlMs = _input.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('invalid_permanent_delete_ttl');

  const issued = new Map<object, { request: PermanentDeleteRequest; expiresAt: number }>();

  return {
    issue(request) {
      const receipt = Object.freeze({}) as PermanentDeleteReceipt;
      issued.set(receipt, { request: normalizedRequest(request), expiresAt: now() + ttlMs });
      return receipt;
    },
    consume(receipt, liveScope, request) {
      const record = issued.get(receipt);
      issued.delete(receipt);
      if (!record || now() > record.expiresAt || !sameScope(_input.scope, liveScope)) return null;

      let candidate: PermanentDeleteRequest;
      try {
        candidate = normalizedRequest(request);
      } catch {
        return null;
      }
      return sameRequest(record.request, candidate) ? record.request : null;
    },
    revoke() {
      issued.clear();
    },
  };
}
