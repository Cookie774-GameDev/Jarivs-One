export type SafeDelegationCapability = 'file_read' | 'file_write' | 'test' | 'analysis';

export type ProhibitedDelegationCapability =
  | 'soul_write'
  | 'user_profile_write'
  | 'memory_write'
  | 'skills_write'
  | 'schedule_write'
  | 'external_message'
  | 'external_call'
  | 'external_post'
  | 'purchase'
  | 'billing'
  | 'broad_delete'
  | 'subagent_spawn';

export interface DelegatedFileClaim {
  path: string;
  access: 'read' | 'write';
}

export interface DelegatedWorkItem {
  id: string;
  ownerId: string;
  parentRunId: string;
  parentWorkItemId: string | null;
  depth: number;
  title: string;
  objective: string;
  deliverable: string;
  context: {
    kind: 'focused';
    summary: string;
    references: readonly string[];
  };
  model: {
    provider: string;
    model: string;
    reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh';
  };
  skills: readonly string[];
  tools: readonly SafeDelegationCapability[];
  roots: readonly string[];
  fileClaims: readonly DelegatedFileClaim[];
  maxTokens: number;
  maxCostUsd: number;
  timeoutMs: number;
  dependencies: readonly string[];
  mutationPolicy: {
    mode: 'owned_files_only' | 'read_only';
    capabilities: readonly SafeDelegationCapability[];
  };
  required: boolean;
}

export interface SubagentLifecycleLimits {
  maxConcurrent: number;
  maxQueued: number;
  maxDepth: number;
  maxTokensPerWorkItem: number;
  maxCostUsdPerWorkItem: number;
  maxTimeoutMs: number;
}

export const DEFAULT_SUBAGENT_LIFECYCLE_LIMITS: Readonly<SubagentLifecycleLimits> = Object.freeze({
  maxConcurrent: 3,
  maxQueued: 12,
  maxDepth: 1,
  maxTokensPerWorkItem: 64_000,
  maxCostUsdPerWorkItem: 25,
  maxTimeoutMs: 30 * 60_000,
});

export type SubagentAttemptStatus =
  | 'queued'
  | 'running'
  | 'reconnecting'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export interface SubagentAttempt {
  id: string;
  workItemId: string;
  ownerId: string;
  parentRunId: string;
  attemptNumber: number;
  status: SubagentAttemptStatus;
  workItem: DelegatedWorkItem;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  retryable: boolean;
  warning?: string;
  remoteJob?: {
    id: string;
    reconnectSupported: boolean;
  };
  result?: SubagentResult;
}

export type SubagentResultStatus = 'completed' | 'partial' | 'blocked' | 'failed' | 'cancelled';

export interface SubagentEvidenceSource {
  id: string;
  kind: 'file' | 'test' | 'artifact' | 'reference';
  locator: string;
  sha256?: string;
}

export interface SubagentResult {
  attemptId: string;
  workItemId: string;
  ownerId: string;
  parentRunId: string;
  status: SubagentResultStatus;
  findings: readonly {
    id: string;
    summary: string;
    sourceIds: readonly string[];
  }[];
  sources: readonly SubagentEvidenceSource[];
  files: readonly {
    path: string;
    action: 'created' | 'modified' | 'deleted';
    sha256: string | null;
  }[];
  proposals: readonly {
    summary: string;
    sourceIds: readonly string[];
  }[];
  artifacts: readonly {
    id: string;
    kind: string;
    locator: string;
    sha256: string;
  }[];
  tests: readonly {
    command: string;
    status: 'passed' | 'failed' | 'skipped';
    exitCode: number | null;
    durationMs: number;
  }[];
  warnings: readonly string[];
  usage: {
    tokens: number;
    costUsd: number;
    durationMs: number;
  };
}

export interface SubagentLifecycleCheckpoint {
  version: 1;
  attempts: readonly SubagentAttempt[];
}
