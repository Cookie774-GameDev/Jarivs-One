import { evaluateAppAccessGate } from './appAccessGate.ts';

interface AppAccessResponse {
  status: string;
  enabled: boolean;
  serverTime: string;
  canUseApp: boolean;
  canEdit: boolean;
  canExport: boolean;
  requiresCheckout: boolean;
}

interface ProviderResult {
  ok: boolean;
  status: number;
  body: unknown;
}

interface ReservationResult {
  ok: boolean;
  reason?: string;
}

export interface RemoteCompletionDeps {
  getAppAccess(userId: string): Promise<AppAccessResponse | null>;
  isProviderConfigured(): boolean;
  isAppAdmin(userId: string): Promise<boolean>;
  rateLimitHit(
    userId: string,
    windowStart: string,
    chars: number,
    max: number,
  ): Promise<{ limited: boolean } | null>;
  reserveBudget(userId: string, estimateUsd: number): Promise<ReservationResult | null>;
  settleBudget(userId: string, reserved: number, actual: number): Promise<void>;
  recordEvent(userId: string, payload: Record<string, unknown>): Promise<void>;
  callProvider(messages: readonly unknown[]): Promise<ProviderResult>;
  now(): Date;
}

export interface RemoteCompletionRequest {
  userId: string;
  eventId: string;
  messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[];
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const MAX_PROMPT_CHARS = 40_000;
const EST_COMPLETION_TOKENS = 600;
const DEEPSEEK_IN_MISS_PER_TOKEN = 0.14 / 1_000_000;
const DEEPSEEK_IN_HIT_PER_TOKEN = 0.0028 / 1_000_000;
const DEEPSEEK_OUT_PER_TOKEN = 0.28 / 1_000_000;

function estimateMessageCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    Math.max(0, promptTokens) * DEEPSEEK_IN_MISS_PER_TOKEN +
    Math.max(0, completionTokens) * DEEPSEEK_OUT_PER_TOKEN
  );
}

function deepseekActualCostUsd(usage: Record<string, number | undefined>): number {
  const prompt = Math.max(0, usage.prompt_tokens ?? 0);
  const completion = Math.max(0, usage.completion_tokens ?? 0);
  const hit = Math.max(0, usage.prompt_cache_hit_tokens ?? 0);
  const miss = Math.max(0, usage.prompt_cache_miss_tokens ?? Math.max(0, prompt - hit));
  return (
    miss * DEEPSEEK_IN_MISS_PER_TOKEN +
    hit * DEEPSEEK_IN_HIT_PER_TOKEN +
    completion * DEEPSEEK_OUT_PER_TOKEN
  );
}

function fail(code: string): never {
  throw new Error(code);
}

export async function completeRemoteJarvis(
  deps: RemoteCompletionDeps,
  request: RemoteCompletionRequest,
): Promise<{ text: string }> {
  const promptChars = JSON.stringify(request.messages).length;
  if (promptChars < 1 || promptChars > MAX_PROMPT_CHARS) fail('remote_prompt_invalid');

  const access = await deps.getAppAccess(request.userId).catch(() => null);
  if (evaluateAppAccessGate(access).kind !== 'allow') fail('remote_access_denied');
  if (!deps.isProviderConfigured()) fail('remote_provider_unavailable');

  const appAdmin = await deps
    .isAppAdmin(request.userId)
    .catch(() => fail('remote_usage_unavailable'));
  const now = deps.now().getTime();
  const windowStart = new Date(Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  const rate = await deps
    .rateLimitHit(request.userId, windowStart, promptChars, RATE_MAX)
    .catch(() => null);
  if (!rate) fail('remote_usage_unavailable');
  if (rate.limited) fail('remote_rate_limited');

  const estimatedPromptTokens = Math.ceil(promptChars / 4);
  const reservedCost = estimateMessageCostUsd(estimatedPromptTokens, EST_COMPLETION_TOKENS);
  if (!appAdmin) {
    const reservation = await deps.reserveBudget(request.userId, reservedCost).catch(() => null);
    if (!reservation) fail('remote_usage_unavailable');
    if (!reservation.ok) fail('remote_budget_denied');
  }

  let upstream: ProviderResult;
  try {
    upstream = await deps.callProvider(request.messages);
  } catch {
    if (!appAdmin) await deps.settleBudget(request.userId, reservedCost, 0);
    fail('remote_provider_unavailable');
  }

  if (!upstream.ok) {
    if (!appAdmin) await deps.settleBudget(request.userId, reservedCost, 0);
    await deps
      .recordEvent(request.userId, {
        provider: 'deepseek',
        model: 'deepseek-chat',
        channel: 'remote-messaging',
        remote_event_id: request.eventId,
        status: 'error',
        error_code: `provider_${upstream.status}`,
      })
      .catch(() => undefined);
    fail('remote_provider_error');
  }

  const body = upstream.body as Record<string, unknown> | null;
  const choices = Array.isArray(body?.choices) ? body.choices : [];
  const message = choices[0]?.message as Record<string, unknown> | undefined;
  const text = typeof message?.content === 'string' ? message.content.trim().slice(0, 3_000) : '';
  if (!text) {
    if (!appAdmin) await deps.settleBudget(request.userId, reservedCost, 0);
    fail('remote_provider_error');
  }

  const usage = (body?.usage ?? {}) as Record<string, number | undefined>;
  const actualCost = deepseekActualCostUsd({
    prompt_tokens: usage.prompt_tokens ?? estimatedPromptTokens,
    completion_tokens: usage.completion_tokens ?? EST_COMPLETION_TOKENS,
    prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens,
  });
  if (!appAdmin) await deps.settleBudget(request.userId, reservedCost, actualCost);
  await deps
    .recordEvent(request.userId, {
      provider: 'deepseek',
      model: 'deepseek-chat',
      channel: 'remote-messaging',
      remote_event_id: request.eventId,
      prompt_tokens: usage.prompt_tokens ?? estimatedPromptTokens,
      completion_tokens: usage.completion_tokens ?? 0,
      estimated_cost_usd: appAdmin ? 0 : reservedCost,
      actual_cost_usd: appAdmin ? 0 : actualCost,
      status: 'ok',
    })
    .catch(() => undefined);
  return { text };
}
