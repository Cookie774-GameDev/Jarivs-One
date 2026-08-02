export type AppAccessGrantingStatus =
  | 'prelaunch'
  | 'trialing'
  | 'active'
  | 'cancel_at_period_end'
  | 'past_due'
  | 'grace'
  | 'admin'
  | 'internal';

export type AppAccessDeniedStatus = 'locked' | 'unknown';

export type AppAccessGateDecision =
  | { readonly kind: 'allow'; readonly status: AppAccessGrantingStatus }
  | { readonly kind: 'deny'; readonly status: 'locked' | 'unknown' }
  | {
      readonly kind: 'invalid';
      readonly status?: AppAccessGrantingStatus | AppAccessDeniedStatus;
    };

const PRODUCTION_GRANTING_STATUSES = new Set<AppAccessGrantingStatus>([
  'trialing',
  'active',
  'cancel_at_period_end',
  'past_due',
  'grace',
]);

const SERVER_BYPASS_STATUSES = new Set<AppAccessGrantingStatus>(['admin', 'internal']);

export function evaluateAppAccessGate(value: unknown): AppAccessGateDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'invalid' };
  }

  const decision = value as {
    status?: unknown;
    enabled?: unknown;
    canUseApp?: unknown;
  };
  if (
    typeof decision.status !== 'string' ||
    typeof decision.enabled !== 'boolean' ||
    typeof decision.canUseApp !== 'boolean'
  ) {
    return { kind: 'invalid' };
  }

  if (
    decision.status === 'prelaunch' &&
    decision.enabled === false &&
    decision.canUseApp === true
  ) {
    return { kind: 'allow', status: 'prelaunch' };
  }

  if (
    PRODUCTION_GRANTING_STATUSES.has(decision.status as AppAccessGrantingStatus) &&
    decision.enabled === true &&
    decision.canUseApp === true
  ) {
    return { kind: 'allow', status: decision.status as AppAccessGrantingStatus };
  }

  if (
    SERVER_BYPASS_STATUSES.has(decision.status as AppAccessGrantingStatus) &&
    decision.canUseApp === true
  ) {
    return { kind: 'allow', status: decision.status as AppAccessGrantingStatus };
  }

  if (decision.status === 'locked' && decision.enabled === true && decision.canUseApp === false) {
    return { kind: 'deny', status: 'locked' };
  }

  if (decision.status === 'unknown' && decision.canUseApp === false) {
    return { kind: 'deny', status: 'unknown' };
  }

  if (
    decision.status === 'prelaunch' ||
    PRODUCTION_GRANTING_STATUSES.has(decision.status as AppAccessGrantingStatus) ||
    SERVER_BYPASS_STATUSES.has(decision.status as AppAccessGrantingStatus) ||
    decision.status === 'locked' ||
    decision.status === 'unknown'
  ) {
    return {
      kind: 'invalid',
      status: decision.status as AppAccessGrantingStatus | AppAccessDeniedStatus,
    };
  }

  return { kind: 'invalid' };
}
