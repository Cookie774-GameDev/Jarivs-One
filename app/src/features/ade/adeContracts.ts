import type { PerformanceProfile } from '@/features/chat/runtime/performanceProfile';
import type {
  ContextAccess,
  ContextDecisionReason,
  ContextPolicyDecisionKind,
  ContextRiskDomain,
  ContextRoute,
  ContextSafeFailure,
  ContextScopeRevision,
  ContextTaskKind,
  ExecutionIdentity,
} from '@/features/context/gateway/contextGatewayContracts';

export type ChatGptAdeRunStatus =
  | 'preparing-context'
  | 'dispatching'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ChatGptAdeSafeFailure =
  | ContextSafeFailure
  | 'invalid-run'
  | 'terminal-link-unauthorized'
  | 'required-context-invalid'
  | 'context-scope-mismatch'
  | 'execution-identity-mismatch'
  | 'history-unavailable'
  | 'dispatch-output-invalid'
  | 'dispatch-output-mismatch'
  | 'dispatch-failed';

export interface ChatGptAdeTerminalLinkRequest {
  identityId: string;
  terminalSessionId: string;
  paneId: string;
}

export interface ChatGptAdeAuthorizedTerminalLink {
  identityId: string;
  terminalSessionId: string;
  paneId: string;
  accountId: string;
  workspaceId: string;
  projectId: string;
  worktreeId: string;
  access: ContextAccess;
  runGeneration: number;
}

export interface ChatGptAdeTerminalProjection {
  terminalSessionId: string;
  paneId: string;
  runGeneration: number;
}

export interface ChatGptAdeRunRequest {
  runId: string;
  requestId: string;
  selectedHarness: 'chatgpt';
  instruction: string;
  taskKind: ContextTaskKind;
  access: ContextAccess;
  workingSet: 'complete' | 'incomplete' | 'unknown';
  scope: Readonly<ContextScopeRevision>;
  executionIdentity: Readonly<ExecutionIdentity>;
  performance: PerformanceProfile;
  optionalEnrichmentEnabled: boolean;
  terminalLink?: Readonly<ChatGptAdeTerminalLinkRequest>;
  activePaths?: readonly string[];
  exactIdentifiers?: readonly string[];
  userIntent?: Readonly<{ context?: boolean; audit?: boolean; deep?: boolean }>;
  historical?: boolean;
  crossSource?: boolean;
  broadChange?: boolean;
  ambiguousScope?: boolean;
  unresolvedContradiction?: boolean;
  riskDomains?: readonly ContextRiskDomain[];
}

export interface ChatGptAdeContextProjection {
  receiptId: string;
  policyVersion: string;
  route: ContextRoute;
  decision: ContextPolicyDecisionKind;
  reasons: readonly ContextDecisionReason[];
  required: boolean;
  status: 'ready' | 'unavailable';
  safeFailure: ContextSafeFailure | null;
  sources: readonly Readonly<{ sourceId: string; revision: string }>[];
  cacheStatus: 'miss' | 'hit' | 'shared' | 'not-applicable';
  queueDepthAtStart: number;
  stageTimingsMs: Readonly<Record<string, number>>;
}

export interface ChatGptAdeRunSnapshot {
  runId: string;
  requestId: string;
  selectedHarness: 'chatgpt';
  status: ChatGptAdeRunStatus;
  scope: Readonly<ContextScopeRevision>;
  executionIdentity: Readonly<ExecutionIdentity>;
  terminalLink: Readonly<ChatGptAdeTerminalProjection> | null;
  context: Readonly<ChatGptAdeContextProjection> | null;
  output: string | null;
  safeFailure: ChatGptAdeSafeFailure | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ChatGptAdeLifecycleEvent {
  runId: string;
  requestId: string;
  type: ChatGptAdeRunStatus;
  at: string;
  receiptId: string | null;
  terminalSessionId: string | null;
  safeFailure: ChatGptAdeSafeFailure | null;
}

export interface ChatGptAdeDispatchRequest {
  runId: string;
  selectedHarness: 'chatgpt';
  instruction: string;
  contextPromptBlock: string;
  executionIdentity: Readonly<ExecutionIdentity>;
  scope: Readonly<ContextScopeRevision>;
  terminalLink: Readonly<ChatGptAdeTerminalProjection> | null;
  signal: AbortSignal;
  onOutput(delta: string): void;
}

export interface ChatGptAdeDispatchResult {
  output: string;
  observedExecutionIdentity: Readonly<ExecutionIdentity>;
  observedScope: Readonly<ContextScopeRevision>;
}
