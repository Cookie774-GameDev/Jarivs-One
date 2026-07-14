// @ts-nocheck
// get-call-usage: returns the authenticated user's calling usage as friendly
// minutes (never raw dollar budgets). Remaining minutes are derived from the
// SHARED company credit pool (DeepSeek + phone + SMS), not a siloed call cap.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json } from '../_shared/voice.ts';
import { USD_PER_CALL_MINUTE } from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  const usageCols = 'plan, monthly_budget_usd, used_usd, used_seconds';
  const [callResult, messageResult, smsResult] = await Promise.all([
    admin.from('call_usage').select(usageCols).eq('user_id', userId).maybeSingle(),
    admin.from('message_usage').select('plan, used_usd').eq('user_id', userId).maybeSingle(),
    admin.from('sms_usage').select('used_usd').eq('user_id', userId).maybeSingle(),
  ]);
  if (callResult.error || messageResult.error || smsResult.error) {
    return json({ error: 'usage_unavailable' }, 503, origin);
  }
  const call = callResult.data;
  const msg = messageResult.data;
  const sms = smsResult.data;

  const plan = call?.plan ?? msg?.plan ?? 'free';
  const { data: limits, error: limitsErr } = await admin
    .from('subscription_plan_limits')
    .select('call_minutes, message_budget_usd, call_budget_usd, sms_budget_usd')
    .eq('plan', plan)
    .maybeSingle();
  if (limitsErr || !limits) return json({ error: 'usage_unavailable' }, 503, origin);

  const poolBudgetUsd =
    Number(limits?.message_budget_usd ?? 0) +
    Number(limits?.call_budget_usd ?? 0) +
    Number(limits?.sms_budget_usd ?? 0);
  const poolUsedUsd =
    Number(msg?.used_usd ?? 0) + Number(call?.used_usd ?? 0) + Number(sms?.used_usd ?? 0);
  const poolRemainingUsd = Math.max(0, poolBudgetUsd - poolUsedUsd);

  // Soft headline included minutes (plan card). Remaining = pool / phone rate.
  const minutesIncluded = Number(limits?.call_minutes ?? 0);
  const minutesUsed = Math.round(Number(call?.used_seconds ?? 0) / 60);
  const minutesRemainingFromPool = Math.max(
    0,
    Math.floor(poolRemainingUsd / USD_PER_CALL_MINUTE),
  );

  return json(
    {
      plan,
      call_minutes_included: minutesIncluded,
      call_minutes_used: minutesUsed,
      call_minutes_remaining: minutesRemainingFromPool,
      company_calling_available: poolBudgetUsd > 0 && poolRemainingUsd > 0,
    },
    200,
    origin,
  );
});
