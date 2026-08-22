import {
  CONTEXT_POLICY_VERSION,
  type ContextDecisionReason,
  type ContextPolicyDecision,
  type ContextPolicyInput,
  type ContextRoute,
} from './contextGatewayContracts';

const HIGH_RISK = new Set([
  'authentication', 'credentials', 'permissions', 'billing', 'subscriptions',
  'database', 'migration', 'release', 'signing', 'destructive', 'security', 'production',
]);

function unique<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

/**
 * The one deterministic managed-run context policy. Callers declare structured
 * task/risk facts; keyword heuristics may populate those facts upstream but do
 * not own the final route or required-context decision.
 */
export function decideContextPolicy(input: Readonly<ContextPolicyInput>): Readonly<ContextPolicyDecision> {
  const reasons: ContextDecisionReason[] = [];
  const highRisk = input.riskDomains?.some((risk) => HIGH_RISK.has(risk)) === true;
  const exact = (input.exactIdentifiers?.length ?? 0) > 0;
  if (exact) reasons.push('exact-identifier');
  if (input.userIntent?.context) reasons.push('explicit-context');
  if (input.userIntent?.audit) reasons.push('explicit-audit');
  if (input.userIntent?.deep) reasons.push('explicit-deep');
  if (input.historical) reasons.push('historical');
  if (input.crossSource) reasons.push('cross-source');
  if (input.broadChange) reasons.push('broad-change');
  if (input.ambiguousScope) reasons.push('ambiguous-scope');
  if (input.unresolvedContradiction) reasons.push('unresolved-contradiction');
  if (input.workingSet !== 'complete') reasons.push('incomplete-working-set');
  if (input.taskKind !== 'answer' || input.access !== 'read') reasons.push('write-capable');
  if (highRisk) reasons.push('high-risk-domain');

  const deepRequired = highRisk || input.userIntent?.deep === true || input.unresolvedContradiction === true;
  const focusedRequired =
    deepRequired || exact || input.userIntent?.context === true || input.userIntent?.audit === true ||
    input.historical === true || input.crossSource === true || input.broadChange === true ||
    input.ambiguousScope === true ||
    (input.workingSet !== 'complete' && (input.taskKind !== 'answer' || input.access !== 'read'));

  if (!focusedRequired) {
    return Object.freeze({
      policyVersion: CONTEXT_POLICY_VERSION,
      decision: 'optional-direct',
      route: 'direct',
      required: false,
      reasons: Object.freeze(['ordinary-known-work'] as ContextDecisionReason[]),
      safeFailure: null,
    });
  }

  const route: ContextRoute = deepRequired ? 'deep' : exact ? 'exact' : 'focused';
  if (!input.gatewayAvailable) {
    return Object.freeze({
      policyVersion: CONTEXT_POLICY_VERSION,
      decision: 'blocked-context-unavailable',
      route,
      required: true,
      reasons: unique(reasons),
      safeFailure: 'gateway-unavailable',
    });
  }
  return Object.freeze({
    policyVersion: CONTEXT_POLICY_VERSION,
    decision: deepRequired ? 'required-deep' : 'required-focused',
    route,
    required: true,
    reasons: unique(reasons),
    safeFailure: null,
  });
}
