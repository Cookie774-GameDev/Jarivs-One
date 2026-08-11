import { resolveAccountIdentity } from '@/lib/accountIdentity';
import { useAuthStore } from '@/stores/auth';
import type { ToolGatewayRequest } from './toolGatewayProtocol';

type AuthorityScope = Readonly<{
  accountId: string;
  accountSource: 'supabase' | 'local';
  workspaceId: string;
  projectId: string | null;
}>;

type SessionAuthority = Readonly<{
  scope: AuthorityScope;
  generation: number;
}>;

const sessionAuthorities = new Map<string, SessionAuthority>();
type MutationGrant = {
  mode: 'once' | 'always';
  expiresAt: number;
  authority: SessionAuthority;
};
const grants = new Map<string, Map<string, MutationGrant>>();
const ONCE_GRANT_TTL_MS = 2 * 60_000;
const ALWAYS_GRANT_TTL_MS = 30 * 60_000;
const MAX_GRANT_SESSIONS = 128;
const MAX_GRANTS_PER_SESSION = 32;
let generation = 0;

function activeScope(): AuthorityScope | null {
  const auth = useAuthStore.getState();
  const identity = resolveAccountIdentity(auth);
  if (!identity || !auth.workspaceId) return null;
  return {
    accountId: identity.accountId,
    accountSource: identity.source,
    workspaceId: String(auth.workspaceId),
    projectId: auth.projectId ? String(auth.projectId) : null,
  };
}

function sameScope(left: AuthorityScope, right: AuthorityScope): boolean {
  return (
    left.accountId === right.accountId &&
    left.accountSource === right.accountSource &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId
  );
}

let observerInstalled = false;
let observedScope: AuthorityScope | null = null;

function ensureScopeObserver(): void {
  if (observerInstalled) return;
  observerInstalled = true;
  observedScope = activeScope();
  useAuthStore.subscribe(() => {
    const next = activeScope();
    if (
      (observedScope === null) !== (next === null) ||
      (observedScope !== null && next !== null && !sameScope(observedScope, next))
    ) {
      generation += 1;
    }
    observedScope = next;
  });
}

function currentAuthority(): SessionAuthority | null {
  ensureScopeObserver();
  const scope = activeScope();
  return scope ? { scope, generation } : null;
}

export function bindToolGatewaySessionAuthority(sessionId: string): boolean {
  const current = currentAuthority();
  if (!current) return false;
  const existing = sessionAuthorities.get(sessionId);
  if (existing) {
    return existing.generation === current.generation && sameScope(existing.scope, current.scope);
  }
  sessionAuthorities.set(sessionId, current);
  return true;
}

export function releaseToolGatewaySessionAuthority(sessionId: string): void {
  sessionAuthorities.delete(sessionId);
  grants.delete(sessionId);
}

export function authorizeToolGatewayRequest(request: ToolGatewayRequest): boolean {
  const current = currentAuthority();
  const bound = sessionAuthorities.get(request.sessionId);
  return Boolean(
    current &&
    bound &&
    bound.generation === current.generation &&
    sameScope(bound.scope, current.scope),
  );
}

export function grantToolGatewayMutation(
  sessionId: string,
  capability: string,
  mode: 'once' | 'always',
): () => void {
  const current = currentAuthority();
  const bound = sessionAuthorities.get(sessionId);
  if (
    !current ||
    !bound ||
    bound.generation !== current.generation ||
    !sameScope(bound.scope, current.scope)
  ) {
    throw new Error('tool_gateway_authority_unavailable');
  }
  let session = grants.get(sessionId);
  if (!session) {
    session = new Map();
    grants.set(sessionId, session);
  }
  session.set(capability, {
    mode,
    expiresAt: Date.now() + (mode === 'always' ? ALWAYS_GRANT_TTL_MS : ONCE_GRANT_TTL_MS),
    authority: bound,
  });
  while (session.size > MAX_GRANTS_PER_SESSION) {
    const oldest = session.keys().next().value as string | undefined;
    if (!oldest) break;
    session.delete(oldest);
  }
  while (grants.size > MAX_GRANT_SESSIONS) {
    const oldest = grants.keys().next().value as string | undefined;
    if (!oldest || oldest === sessionId) break;
    grants.delete(oldest);
  }
  return () => {
    const currentSession = grants.get(sessionId);
    currentSession?.delete(capability);
    if (currentSession?.size === 0) grants.delete(sessionId);
  };
}

export function authorizeToolGatewayMutation(request: ToolGatewayRequest): boolean {
  if (!authorizeToolGatewayRequest(request)) return false;
  const session = grants.get(request.sessionId);
  const capability = session?.has(request.tool) ? request.tool : '*';
  const grant = session?.get(capability);
  const current = currentAuthority();
  const bound = sessionAuthorities.get(request.sessionId);
  if (
    !session ||
    !grant ||
    !current ||
    !bound ||
    grant.authority.generation !== current.generation ||
    !sameScope(grant.authority.scope, current.scope) ||
    grant.authority.generation !== bound.generation ||
    !sameScope(grant.authority.scope, bound.scope) ||
    grant.expiresAt < Date.now()
  ) {
    session?.delete(capability);
    if (session?.size === 0) grants.delete(request.sessionId);
    return false;
  }
  if (grant.mode === 'once') {
    session.delete(capability);
    if (session.size === 0) grants.delete(request.sessionId);
  } else {
    grant.expiresAt = Date.now() + ALWAYS_GRANT_TTL_MS;
  }
  return true;
}

export function clearToolGatewayAuthorityForTests(): void {
  ensureScopeObserver();
  sessionAuthorities.clear();
  grants.clear();
  generation = 0;
  observedScope = activeScope();
}
