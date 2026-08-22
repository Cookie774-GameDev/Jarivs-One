export type TerminalContextBridgeAccess = 'read' | 'write' | 'full';

export type TerminalContextBridgeIdentity = Readonly<{
  version: 1;
  identityId: string;
  accountId: string;
  workspaceId: string;
  projectId: string;
  worktreeId: string;
  paneId: string;
  terminalSessionId: string | null;
  access: TerminalContextBridgeAccess;
  runGeneration: number;
  scopeRevision: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type MintTerminalContextBridgeIdentityInput = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
  worktreeId: string;
  paneId: string;
  access: TerminalContextBridgeAccess;
  lifetimeMs?: number;
}>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_SCOPE_TEXT = 2_048;
const DEFAULT_LIFETIME_MS = 60 * 60 * 1_000;
const MAX_LIFETIME_MS = 4 * 60 * 60 * 1_000;
const identities = new Map<string, TerminalContextBridgeIdentity>();

function safeId(value: string): boolean {
  return SAFE_ID.test(value);
}

function safeScopeText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_SCOPE_TEXT &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  );
}

function defaultId(): string {
  return `terminal-context-${crypto.randomUUID()}`;
}

export function mintTerminalContextBridgeIdentity(
  input: MintTerminalContextBridgeIdentityInput,
  dependencies: Readonly<{ now(): number; createId(): string }> = {
    now: Date.now,
    createId: defaultId,
  },
): TerminalContextBridgeIdentity {
  const identityId = dependencies.createId();
  const issuedAt = dependencies.now();
  const lifetimeMs = Math.min(
    MAX_LIFETIME_MS,
    Math.max(1, input.lifetimeMs ?? DEFAULT_LIFETIME_MS),
  );
  if (
    !safeId(identityId) ||
    !safeId(input.accountId) ||
    !safeId(input.workspaceId) ||
    !safeId(input.projectId) ||
    !safeId(input.paneId) ||
    !safeScopeText(input.worktreeId) ||
    !Number.isSafeInteger(issuedAt) ||
    issuedAt < 0
  )
    throw new TypeError('terminal_context_identity_invalid');
  const identity = Object.freeze({
    version: 1 as const,
    identityId,
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    worktreeId: input.worktreeId,
    paneId: input.paneId,
    terminalSessionId: null,
    access: input.access,
    runGeneration: 0,
    scopeRevision: `${identityId}:0`,
    issuedAt,
    expiresAt: issuedAt + lifetimeMs,
  });
  if (identities.has(identityId)) throw new TypeError('terminal_context_identity_conflict');
  identities.set(identityId, identity);
  return identity;
}

export function bindTerminalContextBridgeIdentity(
  identityId: string,
  scope: Readonly<{ terminalSessionId: string; paneId: string; projectId: string }>,
  now = Date.now(),
): TerminalContextBridgeIdentity | null {
  const current = identities.get(identityId);
  if (
    !current ||
    current.expiresAt < now ||
    current.paneId !== scope.paneId ||
    current.projectId !== scope.projectId ||
    !safeId(scope.terminalSessionId) ||
    (current.terminalSessionId !== null && current.terminalSessionId !== scope.terminalSessionId)
  )
    return null;
  const next = Object.freeze({ ...current, terminalSessionId: scope.terminalSessionId });
  identities.set(identityId, next);
  return next;
}

export function authorizeTerminalContextBridgeIdentity(
  scope: Readonly<{
    identityId: string;
    terminalSessionId: string | null;
    paneId: string | null;
    projectId: string | null;
  }>,
  now = Date.now(),
): TerminalContextBridgeIdentity | null {
  const identity = identities.get(scope.identityId);
  if (!identity) return null;
  if (identity.expiresAt < now) {
    identities.delete(scope.identityId);
    return null;
  }
  return identity.terminalSessionId !== null &&
    identity.terminalSessionId === scope.terminalSessionId &&
    identity.paneId === scope.paneId &&
    identity.projectId === scope.projectId
    ? identity
    : null;
}

export function revokeTerminalContextBridgeIdentity(identityId: string): void {
  identities.delete(identityId);
}

export function resetTerminalContextBridgeIdentitiesForTests(): void {
  identities.clear();
}
