import type { AgentId, ChatId } from '@/types/common';

export type ChatActivityKind = 'agent' | 'subagent' | 'file' | 'url' | 'diff' | 'tool';
export type ChatActivityStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'error';

export interface ChatActivityEvent {
  id: string;
  chatId: ChatId | string;
  kind: ChatActivityKind;
  status: ChatActivityStatus;
  title: string;
  subtitle?: string;
  ts: number;
  agentId?: AgentId;
  agentSlug?: string;
  filePath?: string;
  url?: string;
  addedLines?: number;
  removedLines?: number;
  detail?: string;
  diff?: string;
}

export type ChatActivityPatch = Partial<Omit<ChatActivityEvent, 'id' | 'chatId'>>;

