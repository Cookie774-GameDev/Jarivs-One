export type JarvisSourceKind =
  | 'user_message'
  | 'chat'
  | 'project'
  | 'project_file'
  | 'context_node'
  | 'memory'
  | 'terminal'
  | 'tool_result'
  | 'plugin'
  | 'mcp'
  | 'web'
  | 'schedule'
  | 'artifact'
  | 'agent_output';

export interface JarvisSourceRef {
  id: string;
  kind: JarvisSourceKind;
  label: string;
  uri?: string;
  accountId: string;
  projectId?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  origin?: 'user_authored' | 'app_observed' | 'model_inference' | 'mixed' | 'external_retrieved';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observedAt?: number;
  contentHash?: string;
}

export type JarvisContextFreshness = 'current' | 'stale' | 'unknown';

export type JarvisContextConflictResolutionBasis =
  | 'user_selected'
  | 'higher_authority'
  | 'newer_verified_observation';

export type JarvisContextConflict =
  | {
      groupId: string;
      status: 'unresolved';
      sourceIds: readonly string[];
    }
  | {
      groupId: string;
      status: 'resolved';
      sourceIds: readonly string[];
      winnerSourceId: string;
      basis: JarvisContextConflictResolutionBasis;
    };

export interface JarvisContextItem {
  source: JarvisSourceRef;
  purpose: 'answer' | 'execution' | 'preference' | 'history' | 'capability' | 'citation';
  excerpt: string;
  score?: number;
  freshness?: JarvisContextFreshness;
  conflict?: JarvisContextConflict;
  truncated: boolean;
}

export interface JarvisContextPack {
  items: readonly JarvisContextItem[];
  budget: {
    maxChars: number;
    usedChars: number;
  };
  exclusions: {
    source: JarvisSourceRef;
    reason: string;
  }[];
}
