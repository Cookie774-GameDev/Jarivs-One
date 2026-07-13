import type { AgentId, ChatId } from '@/types/common';

export type ChatActivityKind = 'agent' | 'subagent' | 'file' | 'url' | 'diff' | 'tool';
export type ChatActivityStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'error';

export interface ChatActivityAggregateTotals {
  editedFileCount: number;
  agentTurns: number;
  eventCount: number;
}

export interface ChatActivityEvent {
  id: string;
  chatId: ChatId | string;
  kind: ChatActivityKind;
  status: ChatActivityStatus;
  title: string;
  subtitle?: string;
  ts: number;
  /** When the work started (ms). Defaults to ts when omitted. */
  startedAt?: number;
  /** When the work finished (ms). */
  endedAt?: number;
  agentId?: AgentId;
  agentSlug?: string;
  filePath?: string;
  url?: string;
  addedLines?: number;
  removedLines?: number;
  inputTokens?: number;
  outputTokens?: number;
  detail?: string;
  diff?: string;
  /** Restart-safe aggregate synthesized from sanitized local metrics. */
  restoredAggregate?: boolean;
  /** Counts that cannot be reconstructed without persisting private event data. */
  aggregateTotals?: ChatActivityAggregateTotals;
}

export type ChatActivityPatch = Partial<Omit<ChatActivityEvent, 'id' | 'chatId'>>;

