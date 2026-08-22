import type { PerformanceProfile } from '@/features/chat/runtime/performanceProfile';

export const CONTEXT_POLICY_VERSION = 'vibespace-context-policy-v1' as const;

export type ContextRoute = 'direct' | 'exact' | 'focused' | 'deep';
export type ContextPolicyDecisionKind =
  | 'optional-direct'
  | 'required-focused'
  | 'required-deep'
  | 'blocked-context-unavailable';
export type ContextTaskKind = 'answer' | 'write' | 'action';
export type ContextAccess = 'read' | 'write' | 'full';
export type ContextRiskDomain =
  | 'authentication'
  | 'credentials'
  | 'permissions'
  | 'billing'
  | 'subscriptions'
  | 'database'
  | 'migration'
  | 'release'
  | 'signing'
  | 'destructive'
  | 'security'
  | 'production';
export type ContextDecisionReason =
  | 'ordinary-known-work'
  | 'exact-identifier'
  | 'explicit-context'
  | 'explicit-audit'
  | 'explicit-deep'
  | 'historical'
  | 'cross-source'
  | 'broad-change'
  | 'ambiguous-scope'
  | 'incomplete-working-set'
  | 'write-capable'
  | 'high-risk-domain'
  | 'unresolved-contradiction';
export type ContextSafeFailure =
  | 'gateway-unavailable'
  | 'unauthorized-scope'
  | 'stale-source'
  | 'budget-exhausted'
  | 'cancelled'
  | 'retrieval-failed';

export interface ContextScopeRevision {
  accountId: string;
  workspaceId: string;
  projectId: string;
  worktreeId: string;
  revision: string;
}

export interface ExecutionIdentity {
  transportConnectionId: string;
  transportAdapterId: string;
  upstreamProviderId: string;
  upstreamModelId: string;
  providerQualifiedModelId: string;
  authBillingRoute: string;
  effort: string;
  fastVariant: string;
  catalogRevision: string;
  observedProviderIdentity?: string;
}

export interface ContextPolicyInput {
  scope: Readonly<ContextScopeRevision>;
  taskKind: ContextTaskKind;
  access: ContextAccess;
  workingSet: 'complete' | 'incomplete' | 'unknown';
  exactIdentifiers?: readonly string[];
  userIntent?: Readonly<{ context?: boolean; audit?: boolean; deep?: boolean }>;
  historical?: boolean;
  crossSource?: boolean;
  broadChange?: boolean;
  ambiguousScope?: boolean;
  unresolvedContradiction?: boolean;
  riskDomains?: readonly ContextRiskDomain[];
  gatewayAvailable: boolean;
  optionalEnrichmentEnabled: boolean;
}

export interface ContextPolicyDecision {
  policyVersion: typeof CONTEXT_POLICY_VERSION;
  decision: ContextPolicyDecisionKind;
  route: ContextRoute;
  required: boolean;
  reasons: readonly ContextDecisionReason[];
  safeFailure: ContextSafeFailure | null;
}

export interface ContextGatewayRequest extends Omit<ContextPolicyInput, 'gatewayAvailable'> {
  requestId: string;
  question: string;
  executionIdentity: Readonly<ExecutionIdentity>;
  performance: PerformanceProfile;
  activePaths?: readonly string[];
  signal?: AbortSignal;
}

export interface ContextSourceRevision {
  sourceId: string;
  revision: string;
}

export interface ContextEvidence {
  handle: string;
  sourceId: string;
  sourceRevision: string;
  contentHash: string;
  byteStart: string;
  byteEnd: string;
  text: string;
}

export interface ContextGatewayBackendRequest {
  route: Exclude<ContextRoute, 'direct'>;
  question: string;
  scope: Readonly<ContextScopeRevision>;
  performance: PerformanceProfile;
  activePaths?: readonly string[];
  exactIdentifiers?: readonly string[];
  cancellationGeneration: number;
  signal: AbortSignal;
}

export interface ContextGatewayBackendResult {
  promptBlock: string;
  sourceRevisions: readonly Readonly<ContextSourceRevision>[];
  evidence: readonly Readonly<ContextEvidence>[];
  stageTimingsMs: Readonly<Record<string, number>>;
}

export interface ContextGatewayBackend {
  available(): boolean;
  ask(
    input: Readonly<ContextGatewayBackendRequest>,
  ): Promise<Readonly<ContextGatewayBackendResult>>;
}

export interface ContextReceipt {
  receiptId: string;
  policyVersion: typeof CONTEXT_POLICY_VERSION;
  route: ContextRoute;
  decision: ContextPolicyDecisionKind;
  required: boolean;
  decisionReasons: readonly ContextDecisionReason[];
  scopeRevision: Readonly<ContextScopeRevision>;
  sourceRevisions: readonly Readonly<ContextSourceRevision>[];
  evidenceHandles: readonly string[];
  cacheStatus: 'miss' | 'hit' | 'shared' | 'not-applicable';
  /** Number of same-scope retrieval flights waiting ahead when this flight entered the queue. */
  queueDepthAtStart: number;
  stageTimingsMs: Readonly<Record<string, number>>;
  cancellationGeneration: number;
  safeFailure: ContextSafeFailure | null;
  executionIdentity: Readonly<ExecutionIdentity>;
}

export interface PreparedContextTurn {
  promptBlock: string;
  receipt: Readonly<ContextReceipt>;
}

export interface OpenEvidenceRequest {
  receiptId: string;
  handle: string;
  scope: Readonly<ContextScopeRevision>;
}

export type OpenEvidenceResult = Readonly<ContextEvidence>;

export interface VerifyContextReceiptRequest {
  receiptId: string;
  requestId: string;
  scope: Readonly<ContextScopeRevision>;
  minimumRoute: 'focused' | 'deep';
}
