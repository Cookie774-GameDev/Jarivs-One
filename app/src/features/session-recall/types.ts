export const SESSION_SURFACES = [
  'native_chat',
  'voice',
  'terminal',
  'call',
  'sms',
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'signal',
  'email',
  'schedule',
] as const;

export type SessionSurface = (typeof SESSION_SURFACES)[number];
export type SessionStatus = 'active' | 'archived';
export type TurnRole = 'user' | 'assistant' | 'agent' | 'tool' | 'system';
export type RetentionDuration = '7d' | '30d' | 'indefinite';
export type RetentionStorage = 'local' | 'encrypted_sync';
export type BrowserChatProvider = 'chatgpt' | 'claude' | 'gemini';

export interface SessionRecord {
  id: string;
  ownerId: string;
  profileId: string;
  projectId?: string;
  surface: SessionSurface;
  externalThreadId?: string;
  title: string;
  participantRefs: string[];
  startedAt: number;
  updatedAt: number;
  archivedAt?: number;
  retentionPolicyId: string;
  contentRevision: number;
}

export interface IndexedSessionTurn {
  id: string;
  sessionId: string;
  sequence: number;
  occurredAt: number;
  participantRef: string;
  role: TurnRole;
  text: string;
  filePaths?: string[];
  command?: string;
  agentRef?: string;
  model?: string;
  resultType?: string;
}

export type SessionContentSource =
  | { kind: 'vibespace_owned' }
  | { kind: 'imported_user_authorized' }
  | {
      kind: 'browser_chat_metadata';
      provider: BrowserChatProvider;
      url: string;
    };

export interface SessionIndexInput {
  session: SessionRecord;
  source: SessionContentSource;
  turns: IndexedSessionTurn[];
  tags?: string[];
  status?: SessionStatus;
}

export interface RetentionPolicy {
  id: string;
  indexing: 'enabled' | 'disabled';
  retention: RetentionDuration;
  storage: RetentionStorage;
  deleteOnConversationDeletion: boolean;
}

export interface RecallScope {
  ownerId: string;
  profileId: string;
  projectId?: string;
}

export interface DateRange {
  since?: number;
  until?: number;
}

export interface RecallBooleanQuery {
  all?: string[];
  any?: string[];
  not?: string[];
}

export interface RecallQuery {
  exactPhrase?: string;
  keywords?: string[];
  boolean?: RecallBooleanQuery;
  date?: DateRange;
  projectId?: string;
  profileId?: string;
  platform?: SessionSurface;
  participant?: string;
  filePath?: string;
  command?: string;
  agent?: string;
  model?: string;
  resultType?: string;
}

export interface BrowseFilters {
  date?: DateRange;
  projectId?: string;
  profileId?: string;
  platform?: SessionSurface;
  agent?: string;
  title?: string;
  tag?: string;
  status?: SessionStatus;
}

export type RecallOpenAction =
  | { kind: 'open_session'; sessionId: string; turnId: string }
  | { kind: 'open_url'; url: string };

export interface RecallCitation {
  title: string;
  date: number;
  platform: SessionSurface | BrowserChatProvider;
  messageRange: { start: number; end: number } | null;
  projectId?: string;
  openAction: RecallOpenAction;
}

export interface RecallDiscoveryResult {
  session: SessionRecord;
  score: number;
  matchedBy: Array<'title' | 'tag' | 'participant' | 'content'>;
  excerpt: string;
  citation: RecallCitation;
}

export interface SessionBrowseResult extends SessionRecord {
  tags: string[];
  status: SessionStatus;
}

export interface SessionScrollResult {
  session: SessionRecord;
  anchorIndex: number;
  turns: IndexedSessionTurn[];
}

export interface IndexVerification {
  sessions: number;
  turns: number;
  errors: string[];
}

export type RecallCommandResult =
  | { kind: 'recall'; query: RecallQuery; results: RecallDiscoveryResult[] }
  | { kind: 'history'; sessions: SessionBrowseResult[] };
