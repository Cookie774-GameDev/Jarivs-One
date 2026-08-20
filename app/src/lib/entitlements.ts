/**
 * Entitlements — single source of truth for paid-tier capabilities.
 *
 * Stripe billing IS wired through Supabase Edge Functions
 * (`create-checkout-session`, `create-customer-portal`, `stripe-webhook`);
 * the webhook updates `profiles.tier`, and hosted budgets are enforced
 * server-side by the metered edge functions. The client `plan` value is a
 * UI convenience mirror only — never treat it as security. This module
 * exists so:
 *
 *   1. The Plans settings tab has authoritative copy/quotas to render
 *      (no scattered magic numbers in the UI).
 *   2. Sign-in syncs `profiles.tier` into the auth store `plan` as `starter` /
 *      `pro` / `ultra` and consumers ask `canUseModel(...)` etc.
 *      without rewriting every call site.
 *
 * Pricing economics (the napkin math the rates are derived from):
 *
 *   - Stripe fees ~3% + sales tax/VAT ~10% blended + income tax ~25%
 *     means revenue → kept ≈ 0.97 × 0.90 × 0.75 ≈ 65%.
 *   - We target ≥ 50% net margin on the kept portion, so cost-of-goods
 *     should be ≤ ~33% of sticker price. Roughly 3× markup.
 *   - Quotas below are tuned so a typical full-burn month for a tier
 *     stays inside that 33% envelope; over-burn is rate-limited rather
 *     than charged because users hate surprise bills.
 *
 * Provider reference prices used (per-million tokens, late 2024):
 *   Gemini 2.5 Flash Lite : $0.10 in / $0.40 out
 *   Gemini 2.5 Flash      : $0.30 in / $2.50 out
 *   Gemini 2.5 Pro        : $1.25 in / $5.00 out
 *   Claude 3.5 Sonnet     : $3.00 in / $15.00 out
 *   Claude 3.5 Opus       : $15   in / $75    out
 *   GPT-4o                : $2.50 in / $10    out
 *   LiveKit voice         : ~$0.001 / participant-minute
 */

import {
  callVoiceBucketLine,
  DEEPGRAM_PROMO_LABEL,
  FOUNDER_REWARD_HEADLINE,
  FOUNDER_WELCOME_TRY_LINE,
  GLOBAL_DICTATION_LINE,
  PHONE_MINUTES_BY_PLAN,
  SCALE_5K_PAID_PROMO_LINE,
  SPARK_PHASE2_HEADLINE,
  UNLIMITED_LOCAL_KOKORO_LINE,
} from '@/lib/callVoiceMarketing';
import type { JarvisEntitlementSnapshot } from '@/lib/jarvis/contracts';

export type PlanId = 'free' | 'starter' | 'pro' | 'ultra' | 'apex';

export interface AdminIdentity {
  email?: string | null;
  cloudEmail?: string | null;
  localUserId?: string | null;
}

/**
 * One canonical capability set per tier. Keep the shape stable — UI
 * code reads these fields directly to render comparison tables.
 */
export interface PlanDef {
  id: PlanId;
  /** Display label used as card title. */
  label: string;
  /** Customer-facing total monthly package price in USD (Access + selected add-on). */
  priceUsd: number;
  /** Short tagline shown under the title. */
  tagline: string;
  /**
   * Human-readable feature lines for the Plans card. We render these
   * as a simple bulleted list — no rich content.
   */
  features: ReadonlyArray<string>;

  /* ------- Quotas / capabilities (consumed by entitlement helpers) ------- */

  /**
   * Models the user is allowed to call when running on Jarvis-hosted
   * inference (i.e. *without* their own provider key). BYOK keys are
   * always allowed in every tier — that's the Jarvis ethos.
   */
  hostedModels: ReadonlyArray<string>;
  /** Voice/call minutes included per month. `Infinity` = no cap. */
  voiceMinutesPerMonth: number;
  /** Whether Jarvis Call (outbound phone) is allowed. */
  jarvisCall: boolean;
  /** Whether cloud sync (chats, memories, custom tools) is included. */
  cloudSync: boolean;
  /** Whether the user can publish custom tools to their account. */
  toolPublishing: boolean;
  /** Whether the user is in the priority routing pool. */
  priorityRouting: boolean;
}

/* --------------------------------------------------------------------------
 * Tier definitions
 * --------------------------------------------------------------------------*/

const FREE: PlanDef = {
  id: 'free',
  label: 'Spark',
  priceUsd: 20,
  tagline: 'VibeSpace Access · local-first launchpad',
  features: [
    '1,000 shared company credits / mo (one fungible hosted-service pool)',
    'Free Gemini 2.5 Flash Lite via Google AI Studio (no card)',
    'Every BYOK provider works: Groq, Anthropic, OpenAI, OpenRouter, Together',
    UNLIMITED_LOCAL_KOKORO_LINE,
    FOUNDER_REWARD_HEADLINE,
    FOUNDER_WELCOME_TRY_LINE,
    SPARK_PHASE2_HEADLINE,
    GLOBAL_DICTATION_LINE,
    'Custom tools (local), terminal swarm, wellness break',
    'Mod+Shift+A actions palette, full chat history, project Context',
    'Local-first — your data lives on this device',
  ],
  hostedModels: [],
  voiceMinutesPerMonth: 0,
  jarvisCall: false,
  cloudSync: false,
  toolPublishing: false,
  priorityRouting: false,
};

const STARTER: PlanDef = {
  id: 'starter',
  label: 'Orbit',
  priceUsd: 30,
  tagline: '$20 Access + $10 Orbit add-on',
  features: [
    'Everything in Spark',
    '5,500 shared company credits / mo (one fungible hosted-service pool)',
    callVoiceBucketLine('starter')!,
    UNLIMITED_LOCAL_KOKORO_LINE,
    GLOBAL_DICTATION_LINE,
    DEEPGRAM_PROMO_LABEL.starter!,
    SCALE_5K_PAID_PROMO_LINE,
    'One pool — chat, call, or text (rates: 1 · 100/min · 10/SMS)',
    'Cloud sync for chats and memories across devices',
    'Smart reminders, schedule notifications',
  ],
  hostedModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  voiceMinutesPerMonth: PHONE_MINUTES_BY_PLAN.starter,
  jarvisCall: true,
  cloudSync: true,
  toolPublishing: false,
  priorityRouting: false,
};

const PRO: PlanDef = {
  id: 'pro',
  label: 'Nova',
  priceUsd: 70,
  tagline: '$20 Access + $50 Nova add-on',
  features: [
    'Everything in Orbit',
    '27,500 shared company credits / mo (one fungible hosted-service pool)',
    callVoiceBucketLine('pro')!,
    UNLIMITED_LOCAL_KOKORO_LINE,
    GLOBAL_DICTATION_LINE,
    DEEPGRAM_PROMO_LABEL.pro!,
    SCALE_5K_PAID_PROMO_LINE,
    'One pool — chat, call, or text (rates: 1 · 100/min · 10/SMS)',
    'Publish custom tools and agents to your account',
    'Priority routing — no rate-limit pressure',
  ],
  hostedModels: [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'claude-3-5-sonnet-latest',
    'gpt-4o',
  ],
  voiceMinutesPerMonth: PHONE_MINUTES_BY_PLAN.pro,
  jarvisCall: true,
  cloudSync: true,
  toolPublishing: true,
  priorityRouting: true,
};

const ULTRA: PlanDef = {
  id: 'ultra',
  label: 'Singularity',
  priceUsd: 120,
  tagline: '$20 Access + $100 Singularity add-on',
  features: [
    'Everything in Nova',
    '55,000 shared company credits / mo (one fungible hosted-service pool)',
    callVoiceBucketLine('ultra')!,
    UNLIMITED_LOCAL_KOKORO_LINE,
    GLOBAL_DICTATION_LINE,
    DEEPGRAM_PROMO_LABEL.ultra!,
    SCALE_5K_PAID_PROMO_LINE,
    'One pool — chat, call, or text (rates: 1 · 100/min · 10/SMS)',
    'Early access to new providers and models',
    'Dedicated rate-limit pool · direct support email',
  ],
  hostedModels: [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'claude-3-5-sonnet-latest',
    'claude-3-opus-latest',
    'gpt-4o',
    'o1',
    'o1-mini',
  ],
  voiceMinutesPerMonth: PHONE_MINUTES_BY_PLAN.ultra,
  jarvisCall: true,
  cloudSync: true,
  toolPublishing: true,
  priorityRouting: true,
};

const APEX: PlanDef = {
  id: 'apex',
  label: 'Supernova',
  priceUsd: 200,
  tagline: 'The Hive flagship · double Singularity capacity',
  features: [
    'Everything in Singularity',
    '~66,000 shared company credits / mo (DeepSeek + phone + SMS)',
    callVoiceBucketLine('apex')!,
    UNLIMITED_LOCAL_KOKORO_LINE,
    GLOBAL_DICTATION_LINE,
    'One pool — chat, call, or text (rates: 1 · 100/min · 10/SMS)',
    'Highest priority hosted routing for Hive Balanced',
    'Double Singularity shared pool for heavy voice + chat',
  ],
  hostedModels: [
    ...ULTRA.hostedModels,
    'claude-opus-4-8',
    'gpt-5.5',
    'gpt-5.5-codex',
    'gemini-3.5-flash',
    'grok-4.3',
    'deepseek-v4-pro',
  ],
  voiceMinutesPerMonth: PHONE_MINUTES_BY_PLAN.apex,
  jarvisCall: true,
  cloudSync: true,
  toolPublishing: true,
  priorityRouting: true,
};

export const PLANS: Record<PlanId, PlanDef> = {
  free: FREE,
  starter: STARTER,
  pro: PRO,
  ultra: ULTRA,
  apex: APEX,
};

/** Order used for rendering — Free first, then ascending price. */
export const PLAN_ORDER: ReadonlyArray<PlanId> = ['free', 'starter', 'pro', 'ultra', 'apex'];

/* --------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/

/**
 * Resolve a plan id to its definition. Falls back to Free for unknown
 * ids so a corrupt persisted store can't crash the UI.
 */
export function getPlan(id: PlanId | string | null | undefined): PlanDef {
  if (!id) return FREE;
  return PLANS[id as PlanId] ?? FREE;
}

/**
 * Whether a given hosted model id is allowed on this plan. BYOK
 * (the user supplied their own key) is always allowed — call this
 * only for hosted Jarvis inference.
 */
export function planAllowsHostedModel(plan: PlanId, modelId: string): boolean {
  return PLANS[plan].hostedModels.includes(modelId);
}

/** Whether voice/call features are allowed at all. */
export function planAllowsVoice(plan: PlanId): boolean {
  return PLANS[plan].voiceMinutesPerMonth > 0;
}

/** Voice/call minutes included per month. */
export function planVoiceQuota(plan: PlanId): number {
  return PLANS[plan].voiceMinutesPerMonth;
}

function envList(name: string): string[] {
  const value = String((import.meta.env as Record<string, unknown>)[name] ?? '');
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const APP_ADMIN_CAPABILITY = 'app.admin';

export type EntitlementEvaluationContext = {
  production: boolean;
  now: number;
};

export type LocalDevelopmentEntitlementConfig = {
  blanketAdmin: boolean;
  adminEmails: readonly string[];
  adminLocalIds: readonly string[];
};

const ENTITLEMENT_TTL_MS = 5 * 60_000;
const UNAVAILABLE_ENTITLEMENT: JarvisEntitlementSnapshot = {
  source: 'unavailable',
  capabilities: [],
};

function entitlementContext(
  context: Partial<EntitlementEvaluationContext> = {},
): EntitlementEvaluationContext {
  return {
    production: context.production ?? import.meta.env.PROD,
    now: context.now ?? Date.now(),
  };
}

/**
 * Admin is a computed entitlement from build/runtime configuration, not a
 * user-editable client flag. This keeps paid-feature gates from becoming a
 * trivial localStorage toggle while still allowing internal/admin builds.
 */
function blanketAdminBuildFlagEnabled(): boolean {
  const admin = String(import.meta.env.VITE_JARVIS_ADMIN ?? '').toLowerCase();
  const local = String(import.meta.env.VITE_JARVIS_LOCAL_ADMIN ?? '').toLowerCase();
  return admin === '1' || admin === 'true' || local === '1' || local === 'true';
}

function localDevelopmentEntitlementConfig(): LocalDevelopmentEntitlementConfig {
  return {
    blanketAdmin: blanketAdminBuildFlagEnabled(),
    adminEmails: envList('VITE_JARVIS_ADMIN_EMAILS'),
    adminLocalIds: envList('VITE_JARVIS_ADMIN_LOCAL_IDS'),
  };
}

function normalizedEntries(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function resolveLocalDevelopmentEntitlementSnapshot(
  identity: AdminIdentity,
  options: {
    context?: Partial<EntitlementEvaluationContext>;
    config?: LocalDevelopmentEntitlementConfig;
  } = {},
): JarvisEntitlementSnapshot {
  const context = entitlementContext(options.context);
  if (context.production) return { ...UNAVAILABLE_ENTITLEMENT };

  const config = options.config ?? localDevelopmentEntitlementConfig();
  const emails = normalizedEntries(config.adminEmails);
  const localIds = normalizedEntries(config.adminLocalIds);
  const identityEmails = [identity.email, identity.cloudEmail]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean) as string[];
  const localUserId = identity.localUserId?.trim().toLowerCase();
  const configured =
    config.blanketAdmin ||
    identityEmails.some((email) => emails.has(email)) ||
    Boolean(localUserId && localIds.has(localUserId));

  if (!configured) return { ...UNAVAILABLE_ENTITLEMENT };
  return {
    source: 'local_development',
    planId: 'ultra',
    capabilities: [APP_ADMIN_CAPABILITY],
    verifiedAt: context.now,
    expiresAt: context.now + ENTITLEMENT_TTL_MS,
  };
}

export function entitlementSnapshotAllowsAdmin(
  snapshot: JarvisEntitlementSnapshot,
  contextInput: Partial<EntitlementEvaluationContext> = {},
): boolean {
  const context = entitlementContext(contextInput);
  if (!Number.isFinite(snapshot.verifiedAt)) return false;
  if (!Number.isFinite(snapshot.expiresAt) || !(snapshot.expiresAt! > context.now)) return false;
  if (!snapshot.capabilities.includes(APP_ADMIN_CAPABILITY)) return false;
  if (snapshot.source === 'server') return true;
  return snapshot.source === 'local_development' && !context.production;
}

export function effectivePlan(plan: PlanId | string | null | undefined, admin = false): PlanId {
  if (admin) return 'ultra';
  const resolved = getPlan(plan);
  return resolved.id;
}

export function planAllowsJarvisCall(plan: PlanId, admin = false): boolean {
  return admin || PLANS[plan].jarvisCall;
}

export function planAllowsVoiceWithAdmin(plan: PlanId, admin = false): boolean {
  return admin || planAllowsVoice(plan);
}
