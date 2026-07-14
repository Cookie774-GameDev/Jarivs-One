// Shared helpers for VibeSpace voice/subscription Edge Functions.
// Deno runtime (Supabase Edge Functions). Not bundled into the desktop app.

export const COST_PER_SECOND_USD = 0.00025; // ~$0.015/min, OpenAI gpt-4o-mini-tts

export type PlanId = 'free' | 'starter' | 'pro' | 'ultra' | 'apex';

/** Deepgram Aura-1 (aura-orion-en / aura-luna-en): ~$15/1M chars ≈ $0.01125/min. */
export const DEEPGRAM_COST_PER_SECOND_USD = 0.0001875;

/** Launch promo: one-time Deepgram seconds per plan from the $1k company pool. */
export const DEEPGRAM_PROMO_SECONDS: Record<PlanId, number> = {
  free: 60,
  starter: 1800,
  pro: 5400,
  ultra: 10800,
  apex: 21600,
};

export const DEEPGRAM_PROMO_POOL_USD = 1200; // $1.2k ceiling ($200 reward headroom)
export const DEEPGRAM_PROMO_PAUSE_AT_USD = 1000; // normal promo hard-stop

export function deepgramCostUsd(seconds: number): number {
  return Math.max(0, seconds) * DEEPGRAM_COST_PER_SECOND_USD;
}

export const PLAN_BUDGET_USD: Record<PlanId, number> = {
  free: 0,
  starter: 1.4025,
  pro: 7.0125,
  ultra: 14.025,
  apex: 28.05,
};

export function secondsForBudget(budgetUsd: number): number {
  return Math.floor((budgetUsd || 0) / COST_PER_SECOND_USD);
}

export type PaidPlanId = Exclude<PlanId, 'free'>;
export type PricePlanMapping = Partial<Record<PaidPlanId, string | undefined>>;

export function hasUniqueConfiguredPrices(mapping: PricePlanMapping): boolean {
  const prices = Object.values(mapping).filter((value): value is string => Boolean(value));
  return new Set(prices).size === prices.length;
}

export function planForPriceMapping(
  priceId: string | null | undefined,
  mapping: PricePlanMapping,
): PaidPlanId | null {
  if (!priceId) return null;
  const matches = (Object.entries(mapping) as Array<[PaidPlanId, string | undefined]>)
    .filter(([, configuredPrice]) => configuredPrice === priceId)
    .map(([plan]) => plan);
  return matches.length === 1 ? matches[0] : null;
}

// Map a Stripe price ID to a plan, server-side only. Never trust the client.
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  return planForPriceMapping(priceId, {
    starter: env?.get('STRIPE_STARTER_PRICE_ID') ?? env?.get('STRIPE_PRICE_STARTER'),
    pro: env?.get('STRIPE_PRO_PRICE_ID') ?? env?.get('STRIPE_PRICE_PRO'),
    ultra: env?.get('STRIPE_ULTRA_PRICE_ID') ?? env?.get('STRIPE_PRICE_ULTRA'),
    apex: env?.get('STRIPE_APEX_PRICE_ID') ?? env?.get('STRIPE_PRICE_APEX'),
  });
}

// Restrictive CORS: the desktop app runs under tauri://localhost and the dev
// server under http://localhost:1420. Allow those; reject other origins.
const ALLOWED_ORIGINS = new Set<string>([
  'tauri://localhost',
  'http://localhost:1420',
  'http://localhost:5173',
  'https://tauri.localhost',
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'tauri://localhost';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers':
      'authorization, x-client-info, apikey, content-type, x-idempotency-key',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'vary': 'Origin',
  };
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
  });
}

// Approved provider allow-list. Anything else is rejected.
export const APPROVED_PROVIDERS = new Set(['openai_tts', 'deepgram_tts', 'elevenlabs_tts']);
export const APPROVED_PRESETS = new Set(['jarvis', 'friday']);

export const MAX_TTS_CHARS = 4000;

// Rough audio-seconds estimate from character count (~14 chars/sec speech).
export function estimateSeconds(chars: number): number {
  return Math.max(1, Math.ceil(chars / 14));
}
