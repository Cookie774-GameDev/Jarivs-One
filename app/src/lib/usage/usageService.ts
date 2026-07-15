import type { ChatId } from '@/types/common';
import type { Message } from '@/types/chat';
import type { ProviderConnection } from '@/lib/ai/adapters/types';
import { messageRepo } from '@/lib/db/repositories';
import type { UsageMode, UsageSnapshot, UsageValue } from './usageTypes';

const unavailable = (unit: UsageValue['unit'], reason: string): UsageValue => ({
  unit,
  provenance: 'unavailable',
  reason,
});

function exactSum(
  messages: readonly Message[],
  pick: (message: Message) => number | undefined,
  unit: UsageValue['unit'],
): UsageValue {
  const values = messages.map(pick).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return values.length > 0
    ? { value: values.reduce((sum, value) => sum + value, 0), unit, provenance: 'response-metadata' }
    : unavailable(unit, 'Not reported by responses in this chat.');
}

export function summarizeCurrentChatUsage(
  connection: Readonly<ProviderConnection>,
  messages: readonly Message[],
): UsageSnapshot {
  const scoped = messages.filter((message) => (
    message.usage
    && (!message.usage.provider || message.usage.provider === connection.providerId)
  ));
  const inputTokens = exactSum(scoped, (message) => message.usage?.input_tokens, 'tokens');
  const outputTokens = exactSum(scoped, (message) => message.usage?.output_tokens, 'tokens');
  const totalTokens = inputTokens.value !== undefined && outputTokens.value !== undefined
    ? { value: inputTokens.value + outputTokens.value, unit: 'tokens' as const, provenance: 'local-exact' as const }
    : unavailable('tokens', 'Input and output token counts are not both available.');
  const quotaReason = connection.mode === 'local'
    ? 'No subscription quota.'
    : 'This connection does not expose subscription quota through an approved surface.';
  return {
    connectionId: connection.id,
    providerId: connection.providerId,
    providerName: connection.displayName,
    modelId: connection.modelId,
    mode: connection.mode,
    authSource: connection.authSource,
    capturedAt: Date.now(),
    currentChat: {
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: exactSum(scoped, (message) => message.usage?.cost_usd, 'usd'),
      requests: scoped.length > 0
        ? { value: scoped.length, unit: 'requests', provenance: 'local-exact' }
        : unavailable('requests', 'No metered responses are stored in this chat.'),
    },
    providerPeriod: unavailable('tokens', 'Provider-period usage was not requested from an authorized official surface.'),
    quota: unavailable('percent', quotaReason),
    ...(connection.id === 'opencode-cli'
      ? { note: 'OpenCode records bridge-local response usage, not upstream subscription quota.' }
      : {}),
  };
}

const refreshFlights = new Map<string, Promise<UsageSnapshot>>();
const refreshCache = new Map<string, { expiresAt: number; value: UsageSnapshot }>();
const REFRESH_TTL_MS = 30_000;

export function parseUsageSlashCommand(input: string): UsageMode | undefined {
  const match = input.trim().match(/^\/usage(?:\s+(refresh|session|all))?$/i);
  return match ? ((match[1]?.toLowerCase() as UsageMode | undefined) ?? 'default') : undefined;
}

export async function getUsage(
  connection: Readonly<ProviderConnection>,
  chatId: ChatId,
  _mode: UsageMode = 'default',
): Promise<UsageSnapshot> {
  return summarizeCurrentChatUsage(connection, await messageRepo.listByChat(chatId));
}

export async function getAllUsage(
  connections: readonly Readonly<ProviderConnection>[],
  chatId: ChatId,
): Promise<UsageSnapshot[]> {
  const messages = await messageRepo.listByChat(chatId);
  return connections.map((connection) => summarizeCurrentChatUsage(connection, messages));
}

export async function refreshUsage(
  connection: Readonly<ProviderConnection>,
  chatId: ChatId,
): Promise<UsageSnapshot> {
  const key = `${connection.id}:${chatId}`;
  const cached = refreshCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = refreshFlights.get(key);
  if (existing) return existing;
  const flight = getUsage(connection, chatId, 'refresh').then((value) => {
    refreshCache.set(key, { expiresAt: Date.now() + REFRESH_TTL_MS, value });
    return value;
  }).finally(() => refreshFlights.delete(key));
  refreshFlights.set(key, flight);
  return flight;
}
