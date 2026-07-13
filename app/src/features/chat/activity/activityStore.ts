import { create } from 'zustand';
import type { ChatId } from '@/types/common';
import type {
  ChatActivityEvent,
  ChatActivityPatch,
  ChatActivityStatus,
} from './types';

const MAX_EVENTS_PER_CHAT = 80;
const MAX_DETAIL_CHARS = 4000;
const MAX_DIFF_CHARS = 12000;
const MAX_PERSISTED_CHATS = 100;
const MAX_PERSISTED_RECORDS_TO_PARSE = 1000;
const MAX_PERSISTED_BYTES = 256_000;
const MAX_METRIC_VALUE = 1_000_000_000_000;
const MAX_TIMESTAMP = 10_000_000_000_000;

export const CHAT_ACTIVITY_METRICS_STORAGE_KEY = 'jarvis.chatActivity.metrics.v1';

interface PersistedChatActivityMetrics {
  chatId: string;
  status: ChatActivityStatus;
  startedAt: number;
  endedAt?: number;
  inputTokens?: number;
  outputTokens?: number;
  addedLines: number;
  removedLines: number;
  editedFileCount: number;
  agentTurns: number;
  eventCount: number;
  updatedAt: number;
}

interface PersistedChatActivityEnvelope {
  version: 1;
  records: PersistedChatActivityMetrics[];
}

interface ChatActivityState {
  eventsByChat: Record<string, ChatActivityEvent[]>;
  record: (event: ChatActivityEvent) => void;
  update: (chatId: ChatId | string, id: string, patch: ChatActivityPatch) => void;
  clearChat: (chatId: ChatId | string) => void;
}

function key(chatId: ChatId | string): string {
  return String(chatId);
}

function truncatePayload(value: string | undefined, maxChars: number, label: string): string | undefined {
  if (!value || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[${label} truncated by VibeSpace: ${value.length - maxChars} chars hidden]`;
}

function boundedEvent(event: ChatActivityEvent): ChatActivityEvent {
  return {
    ...event,
    detail: truncatePayload(event.detail, MAX_DETAIL_CHARS, 'detail'),
    diff: truncatePayload(event.diff, MAX_DIFF_CHARS, 'diff'),
  };
}

function boundedPatch(patch: ChatActivityPatch): ChatActivityPatch {
  return {
    ...patch,
    detail: truncatePayload(patch.detail, MAX_DETAIL_CHARS, 'detail'),
    diff: truncatePayload(patch.diff, MAX_DIFF_CHARS, 'diff'),
  };
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isBoundedInteger(value: unknown, max = MAX_METRIC_VALUE): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
}

function isStatus(value: unknown): value is ChatActivityStatus {
  return value === 'pending'
    || value === 'running'
    || value === 'done'
    || value === 'cancelled'
    || value === 'error';
}

const PERSISTED_RECORD_KEYS = new Set([
  'chatId',
  'status',
  'startedAt',
  'endedAt',
  'inputTokens',
  'outputTokens',
  'addedLines',
  'removedLines',
  'editedFileCount',
  'agentTurns',
  'eventCount',
  'updatedAt',
]);

function parsePersistedRecord(value: unknown): PersistedChatActivityMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((recordKey) => !PERSISTED_RECORD_KEYS.has(recordKey))) return null;
  if (typeof record.chatId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(record.chatId)) {
    return null;
  }
  if (!isStatus(record.status)
    || !isBoundedInteger(record.startedAt, MAX_TIMESTAMP)
    || !isBoundedInteger(record.updatedAt, MAX_TIMESTAMP)
    || !isBoundedInteger(record.addedLines)
    || !isBoundedInteger(record.removedLines)
    || !isBoundedInteger(record.editedFileCount)
    || !isBoundedInteger(record.agentTurns)
    || !isBoundedInteger(record.eventCount)) {
    return null;
  }
  if (record.endedAt !== undefined && !isBoundedInteger(record.endedAt, MAX_TIMESTAMP)) return null;
  if (record.inputTokens !== undefined && !isBoundedInteger(record.inputTokens)) return null;
  if (record.outputTokens !== undefined && !isBoundedInteger(record.outputTokens)) return null;
  if ((record.inputTokens === undefined) !== (record.outputTokens === undefined)) return null;

  return record as unknown as PersistedChatActivityMetrics;
}

function restoredEvent(record: PersistedChatActivityMetrics): ChatActivityEvent {
  const wasInterrupted = record.status === 'pending' || record.status === 'running';
  const usageKnown = (record.inputTokens ?? 0) + (record.outputTokens ?? 0) > 0;
  return {
    id: `restored_${record.chatId}`,
    chatId: record.chatId,
    kind: 'agent',
    status: wasInterrupted ? 'cancelled' : record.status,
    title: 'Restored session metrics',
    ts: record.updatedAt,
    startedAt: record.startedAt,
    endedAt: wasInterrupted
      ? Math.max(record.updatedAt, record.startedAt + 1)
      : record.endedAt,
    ...(usageKnown ? {
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    } : {}),
    addedLines: record.addedLines,
    removedLines: record.removedLines,
    restoredAggregate: true,
    aggregateTotals: {
      editedFileCount: record.editedFileCount,
      agentTurns: record.agentTurns,
      eventCount: record.eventCount,
    },
  };
}

export function deserializeChatActivityMetrics(raw: string | null): Record<string, ChatActivityEvent[]> {
  if (!raw || raw.length > MAX_PERSISTED_BYTES) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const envelope = value as Record<string, unknown>;
    if (Object.keys(envelope).some((envelopeKey) => envelopeKey !== 'version' && envelopeKey !== 'records')) {
      return {};
    }
    if (envelope.version !== 1
      || !Array.isArray(envelope.records)
      || envelope.records.length > MAX_PERSISTED_RECORDS_TO_PARSE) {
      return {};
    }

    const byChat = new Map<string, PersistedChatActivityMetrics>();
    for (const candidate of envelope.records) {
      const record = parsePersistedRecord(candidate);
      if (!record) return {};
      const existing = byChat.get(record.chatId);
      if (!existing || record.updatedAt >= existing.updatedAt) byChat.set(record.chatId, record);
    }

    return Object.fromEntries(
      [...byChat.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_PERSISTED_CHATS)
        .map((record) => [record.chatId, [restoredEvent(record)]]),
    );
  } catch {
    return {};
  }
}

function metricValue(value: number | undefined): number {
  return isBoundedInteger(value) ? value : 0;
}

function timestampValue(value: number | undefined): number {
  return isBoundedInteger(value, MAX_TIMESTAMP) ? value : 0;
}

function aggregateChatMetrics(chatId: string, events: ChatActivityEvent[]): PersistedChatActivityMetrics | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(chatId) || events.length === 0) return null;

  let startedAt = MAX_TIMESTAMP;
  let endedAt: number | undefined;
  let updatedAt = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let usageKnown = false;
  let addedLines = 0;
  let removedLines = 0;
  let restoredEditedFileCount = 0;
  let agentTurns = 0;
  let eventCount = 0;
  const editedFiles = new Set<string>();
  const deduplicated = [...new Map(events.map((event) => [event.id, event])).values()];
  const latest = [...deduplicated].sort((a, b) => b.ts - a.ts)[0];
  const operationalEvents = deduplicated.filter((event) =>
    event.kind === 'agent' || event.kind === 'subagent' || event.kind === 'tool');
  const latestOperational = [...operationalEvents].sort((a, b) => b.ts - a.ts)[0];
  const live = operationalEvents.find((event) => event.status === 'running' || event.status === 'pending');

  for (const event of deduplicated) {
    const eventStart = isBoundedInteger(event.startedAt, MAX_TIMESTAMP)
      ? event.startedAt
      : timestampValue(event.ts);
    startedAt = Math.min(startedAt, eventStart);
    updatedAt = Math.max(updatedAt, timestampValue(event.endedAt), timestampValue(event.ts));
    if (isBoundedInteger(event.endedAt, MAX_TIMESTAMP)) {
      endedAt = Math.max(endedAt ?? 0, event.endedAt);
    }
    if (metricValue(event.inputTokens) + metricValue(event.outputTokens) > 0) {
      inputTokens += metricValue(event.inputTokens);
      outputTokens += metricValue(event.outputTokens);
      usageKnown = true;
    }
    if (event.restoredAggregate) {
      addedLines += metricValue(event.addedLines);
      removedLines += metricValue(event.removedLines);
    } else if (event.kind === 'diff' || event.kind === 'tool') {
      addedLines += metricValue(event.addedLines);
      removedLines += metricValue(event.removedLines);
      if (event.filePath && (event.addedLines !== undefined || event.removedLines !== undefined)) {
        editedFiles.add(event.filePath);
      }
    }
    if (event.restoredAggregate && event.aggregateTotals) {
      restoredEditedFileCount += metricValue(event.aggregateTotals.editedFileCount);
      agentTurns += metricValue(event.aggregateTotals.agentTurns);
      eventCount += metricValue(event.aggregateTotals.eventCount);
    } else {
      eventCount += 1;
      if (event.kind === 'agent' || event.kind === 'subagent') agentTurns += 1;
    }
  }

  const status = live?.status ?? latestOperational?.status ?? latest?.status ?? 'done';
  const record: PersistedChatActivityMetrics = {
    chatId,
    status,
    startedAt: startedAt === MAX_TIMESTAMP ? 0 : startedAt,
    addedLines: Math.min(addedLines, MAX_METRIC_VALUE),
    removedLines: Math.min(removedLines, MAX_METRIC_VALUE),
    editedFileCount: Math.min(restoredEditedFileCount + editedFiles.size, MAX_METRIC_VALUE),
    agentTurns: Math.min(agentTurns, MAX_METRIC_VALUE),
    eventCount: Math.min(eventCount, MAX_METRIC_VALUE),
    updatedAt,
  };
  if (endedAt !== undefined) record.endedAt = endedAt;
  if (usageKnown) {
    record.inputTokens = Math.min(inputTokens, MAX_METRIC_VALUE);
    record.outputTokens = Math.min(outputTokens, MAX_METRIC_VALUE);
  }
  return record;
}

function serializeMetrics(eventsByChat: Record<string, ChatActivityEvent[]>): string {
  const records = Object.entries(eventsByChat)
    .map(([chatId, events]) => aggregateChatMetrics(chatId, events))
    .filter((record): record is PersistedChatActivityMetrics => record !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PERSISTED_CHATS);
  const envelope: PersistedChatActivityEnvelope = { version: 1, records };
  return JSON.stringify(envelope);
}

function persistEvents(eventsByChat: Record<string, ChatActivityEvent[]>): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.setItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY, serializeMetrics(eventsByChat));
  } catch {
    // Activity metrics are best-effort and must never block chat execution.
  }
}

function readHydratedEvents(): Record<string, ChatActivityEvent[]> {
  const storage = storageOrNull();
  if (!storage) return {};
  try {
    const raw = storage.getItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY);
    const hydrated = deserializeChatActivityMetrics(raw);
    if (raw && Object.keys(hydrated).length === 0) {
      storage.removeItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY);
    }
    return hydrated;
  } catch {
    return {};
  }
}

export function createChatActivityId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatActivityStore = create<ChatActivityState>((set) => ({
  eventsByChat: readHydratedEvents(),
  record(event) {
    set((state) => {
      const nextEvent = boundedEvent(event);
      const chatKey = key(nextEvent.chatId);
      const existing = state.eventsByChat[chatKey] ?? [];
      const next = [...existing.filter((item) => item.id !== nextEvent.id), nextEvent]
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_EVENTS_PER_CHAT);
      const eventsByChat = {
        ...state.eventsByChat,
        [chatKey]: next,
      };
      persistEvents(eventsByChat);
      return {
        eventsByChat,
      };
    });
  },
  update(chatId, id, patch) {
    set((state) => {
      const chatKey = key(chatId);
      const existing = state.eventsByChat[chatKey] ?? [];
      if (!existing.some((event) => event.id === id)) return state;
      const nextPatch = boundedPatch(patch);
      const eventsByChat = {
        ...state.eventsByChat,
        [chatKey]: existing.map((event) =>
          event.id === id
            ? { ...event, ...nextPatch, ts: event.ts, startedAt: event.startedAt }
            : event,
        ),
      };
      persistEvents(eventsByChat);
      return { eventsByChat };
    });
  },
  clearChat(chatId) {
    set((state) => {
      const chatKey = key(chatId);
      if (!state.eventsByChat[chatKey]) return state;
      const { [chatKey]: _removed, ...rest } = state.eventsByChat;
      persistEvents(rest);
      return { eventsByChat: rest };
    });
  },
}));

export function flushChatActivityMetrics(): void {
  persistEvents(useChatActivityStore.getState().eventsByChat);
}

export function hydrateChatActivityMetrics(): void {
  useChatActivityStore.setState({ eventsByChat: readHydratedEvents() });
}

export function getChatActivityEvents(chatId: ChatId | string): ChatActivityEvent[] {
  return useChatActivityStore.getState().eventsByChat[key(chatId)] ?? [];
}

export function countUnifiedDiffLines(diff: string): { addedLines: number; removedLines: number } {
  let addedLines = 0;
  let removedLines = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) addedLines += 1;
    else if (line.startsWith('-')) removedLines += 1;
  }
  return { addedLines, removedLines };
}

export function recordChatDiffActivity(args: {
  chatId: ChatId | string;
  filePath: string;
  diff: string;
  title?: string;
  agentSlug?: string;
}): void {
  const counts = countUnifiedDiffLines(args.diff);
  useChatActivityStore.getState().record({
    id: createChatActivityId('diff'),
    chatId: args.chatId,
    kind: 'diff',
    status: 'done',
    title: args.title ?? 'Wrote file',
    subtitle: args.filePath,
    filePath: args.filePath,
    diff: args.diff,
    agentSlug: args.agentSlug,
    ts: Date.now(),
    ...counts,
  });
}

