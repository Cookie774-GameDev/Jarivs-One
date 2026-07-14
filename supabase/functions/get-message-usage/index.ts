// @ts-nocheck
// get-message-usage: returns the authenticated user's full usage picture —
// AI message credits, call minutes, and SMS texts — including monthly,
// weekly (25%) and 5-hour (8%) window remainders, as friendly units
// (never raw dollar budgets).
//
// Company spend is ONE fungible credit pool: DeepSeek + phone + SMS share
// the same monthly / window budget. Per-service rows still exist for
// analytics; remaining_now is computed against the shared pool.
//
// Backward compatible: the original top-level message_credits_* fields are
// still returned for older clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json } from '../_shared/voice.ts';
import {
  USD_PER_CALL_MINUTE,
  USD_PER_MESSAGE_CREDIT,
  USD_PER_SMS,
  WINDOW_5H_FRACTION,
  WINDOW_WEEK_FRACTION,
} from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
const WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface UsageRow {
  plan?: string;
  monthly_budget_usd?: number;
  used_usd?: number;
  reset_date?: string | null;
  window_5h_start?: string | null;
  window_5h_used_usd?: number;
  window_week_start?: string | null;
  window_week_used_usd?: number;
}

/** Remaining dollars in a fixed window, accounting for lazy window rolls. */
function windowRemainingUsd(
  budget: number,
  fraction: number,
  start: string | null | undefined,
  used: number | undefined,
  spanMs: number,
): number {
  const cap = budget * fraction;
  if (!start) return Math.max(0, cap);
  const elapsed = Date.now() - new Date(start).getTime();
  if (elapsed >= spanMs) return Math.max(0, cap);
  return Math.max(0, cap - Number(used ?? 0));
}

/**
 * Analytics bucket for one service (used/included in that service's units)
 * plus remaining_now against the SHARED company pool.
 */
function bucket(
  row: UsageRow | null,
  usdPerUnit: number,
  included: number,
  poolRemainingUsd: number,
  rem5hUsd: number,
  remWeekUsd: number,
  poolBudgetUsd: number,
) {
  const used = Number(row?.used_usd ?? 0);
  const toUnits = (usd: number) => Math.max(0, Math.floor(usd / usdPerUnit));
  const usedUnits = Math.round(used / usdPerUnit);
  // Soft “included” still mirrors plan card units for legend; remaining is pool-based.
  const remainingUnits = toUnits(poolRemainingUsd);
  return {
    included,
    used: usedUnits,
    remaining: remainingUnits,
    // Effective remaining = tightest of pool monthly / week / 5h (in this unit).
    remaining_now: Math.min(toUnits(poolRemainingUsd), toUnits(remWeekUsd), toUnits(rem5hUsd)),
    window_5h_remaining: toUnits(Math.min(rem5hUsd, poolRemainingUsd)),
    window_weekly_remaining: toUnits(Math.min(remWeekUsd, poolRemainingUsd)),
    available: poolBudgetUsd > 0 && poolRemainingUsd > 0,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: json({}, 200, origin).headers });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error } = await userClient.auth.getUser(jwt);
  if (error || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const usageCols =
    'plan, monthly_budget_usd, used_usd, reset_date, window_5h_start, window_5h_used_usd, window_week_start, window_week_used_usd';
  const [messageResult, callResult, smsResult, adminResult] = await Promise.all([
    admin.from('message_usage').select(usageCols).eq('user_id', userId).maybeSingle(),
    admin.from('call_usage').select(usageCols).eq('user_id', userId).maybeSingle(),
    admin.from('sms_usage').select(usageCols).eq('user_id', userId).maybeSingle(),
    admin.rpc('is_app_admin', { p_user_id: userId }),
  ]);
  if (messageResult.error || callResult.error || smsResult.error || adminResult.error) {
    return json({ error: 'usage_unavailable' }, 503, origin);
  }
  const msg = messageResult.data;
  const call = callResult.data;
  const sms = smsResult.data;
  const adminFlag = adminResult.data;

  const plan = (msg?.plan ?? call?.plan ?? sms?.plan ?? 'free') as string;
  const { data: limits, error: limitsErr } = await admin
    .from('subscription_plan_limits')
    .select('message_credits, call_minutes, sms_count, message_budget_usd, call_budget_usd, sms_budget_usd')
    .eq('plan', plan)
    .maybeSingle();
  if (limitsErr || !limits) return json({ error: 'usage_unavailable' }, 503, origin);

  // Shared pool = sum of plan budgets; used = sum of service used_usd.
  const poolBudgetUsd =
    Number(limits?.message_budget_usd ?? 0) +
    Number(limits?.call_budget_usd ?? 0) +
    Number(limits?.sms_budget_usd ?? 0);
  const poolUsedUsd =
    Number(msg?.used_usd ?? 0) + Number(call?.used_usd ?? 0) + Number(sms?.used_usd ?? 0);
  const poolRemainingUsd = Math.max(0, poolBudgetUsd - poolUsedUsd);

  // Window caps sit on message_usage (pool leader) against TOTAL monthly budget.
  const rem5hUsd = windowRemainingUsd(
    poolBudgetUsd, WINDOW_5H_FRACTION, msg?.window_5h_start, msg?.window_5h_used_usd, WINDOW_5H_MS,
  );
  const remWeekUsd = windowRemainingUsd(
    poolBudgetUsd, WINDOW_WEEK_FRACTION, msg?.window_week_start, msg?.window_week_used_usd, WINDOW_WEEK_MS,
  );

  const messageBucket = bucket(
    msg, USD_PER_MESSAGE_CREDIT, Number(limits?.message_credits ?? 0),
    poolRemainingUsd, rem5hUsd, remWeekUsd, poolBudgetUsd,
  );
  const callBucket = bucket(
    call, USD_PER_CALL_MINUTE, Number(limits?.call_minutes ?? 0),
    poolRemainingUsd, rem5hUsd, remWeekUsd, poolBudgetUsd,
  );
  const smsBucket = bucket(
    sms, USD_PER_SMS, Number(limits?.sms_count ?? 0),
    poolRemainingUsd, rem5hUsd, remWeekUsd, poolBudgetUsd,
  );

  // 1 credit = $0.001 (DeepSeek unit). Pool size in credits for the Account bar.
  const creditsIncluded = Math.round(poolBudgetUsd / USD_PER_MESSAGE_CREDIT);
  const creditsUsed = Math.round(poolUsedUsd / USD_PER_MESSAGE_CREDIT);

  return json(
    {
      plan,
      admin_unlimited: Boolean(adminFlag),
      reset_date: msg?.reset_date ?? call?.reset_date ?? sms?.reset_date ?? null,
      message: messageBucket,
      call: callBucket,
      sms: smsBucket,
      // Unified company credit pool (DeepSeek + phone + SMS).
      credits_included: creditsIncluded,
      credits_used: Math.min(creditsUsed, creditsIncluded || creditsUsed),
      credits_remaining: Math.max(0, creditsIncluded - creditsUsed),
      // Legacy fields (pre-0021 clients).
      message_credits_included: messageBucket.included,
      message_credits_used: messageBucket.used,
      message_credits_remaining: messageBucket.remaining,
      company_messaging_available: messageBucket.available,
    },
    200,
    origin,
  );
});
