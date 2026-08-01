export type SoulValidationIssue =
  | 'permission_bypass'
  | 'false_success'
  | 'private_memory_reveal'
  | 'unapproved_messaging'
  | 'style_authority_override'
  | 'embedded_secret';

export interface SoulValidation {
  valid: boolean;
  issues: SoulValidationIssue[];
}

export interface SourceReference {
  kind: 'owner_edit' | 'protected_default' | 'profile_clone' | 'restore' | 'import';
  id: string;
  refs: string[];
}

export type ActivationBoundary = 'next_turn' | 'session_boundary';
export type ActivationState = 'pending' | 'active';

export interface SoulRevision {
  version: number;
  content: string;
  hash: string;
  source: SourceReference;
  refs: string[];
  activation: {
    mode: 'initial' | ActivationBoundary;
    state: ActivationState;
  };
  supersedesVersion?: number;
  supersededByVersion?: number;
}

export interface SoulChangeStage {
  id: string;
  oldContent: string;
  newContent: string;
  reason: string;
  source: SourceReference;
  affectedBehavior: string[];
  validation: SoulValidation;
  undo: { restoreVersion: number };
  revision: SoulRevision;
}

export interface JarvisProfileDocument {
  ownerId: string;
  profileId: string;
  name: string;
  protected: boolean;
  voiceAuthority: 'canonical';
  credentialRefs: string[];
  conversationHistoryRefs: string[];
}

export type PromptBlockType =
  | 'canonical_response_security'
  | 'verified_capabilities'
  | 'soul'
  | 'active_profile'
  | 'user'
  | 'memory'
  | 'request_conversation'
  | 'context'
  | 'recall'
  | 'skills'
  | 'tools'
  | 'platform_formatting';

export type PromptTrust =
  | 'protected'
  | 'verified'
  | 'owner'
  | 'trusted'
  | 'retrieved'
  | 'tool'
  | 'untrusted';
export type InstructionBoundary = 'authoritative' | 'bounded_instruction' | 'data_only';

export interface PromptBlockInput {
  type: PromptBlockType;
  content: string;
  source: string;
  freshness: {
    status: 'current' | 'stale' | 'unknown';
    asOf: string;
  };
  trust: PromptTrust;
}

export interface PromptCompilerInput {
  canonicalResponseSecurity: PromptBlockInput;
  verifiedCapabilities: PromptBlockInput;
  soul: PromptBlockInput;
  activeProfile: PromptBlockInput;
  user: PromptBlockInput;
  memory: PromptBlockInput;
  requestConversation: PromptBlockInput;
  context: PromptBlockInput;
  recall: PromptBlockInput;
  skills: PromptBlockInput;
  tools: PromptBlockInput;
  platformFormatting: PromptBlockInput;
}

export interface CompiledPromptBlock extends PromptBlockInput {
  instructionBoundary: InstructionBoundary;
  renderedContent: string;
  rendered: string;
}

export interface CompiledPrompt {
  blocks: CompiledPromptBlock[];
  stablePrefix: {
    blocks: CompiledPromptBlock[];
    hashInput: string;
    hash: string;
    rendered: string;
  };
  dynamic: {
    blocks: CompiledPromptBlock[];
    rendered: string;
  };
  rendered: string;
}

export interface SnapshotItem {
  id: string;
  content: string;
  tokens: number;
}

export interface TokenBoundedSnapshot {
  budgetTokens: number;
  usedTokens: number;
  included: SnapshotItem[];
  omitted: Array<{
    id: string;
    tokens: number;
    reason: 'token_budget';
  }>;
  complete: boolean;
}
