-- =============================================================================
-- 0030_unified_credit_pool_reserves
-- Monthly company spend is ONE fungible pool across DeepSeek / phone / SMS.
-- Each service still writes its own usage row (analytics), but remaining budget
-- is sum(plan budgets) - sum(used_usd across message+call+sms).
-- Window caps use the same total pool size (8% / 25% of total monthly USD).
-- =============================================================================

create or replace function public.unified_plan_budget_usd(p_plan text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(message_budget_usd, 0)
       + coalesce(call_budget_usd, 0)
       + coalesce(sms_budget_usd, 0)
    from public.subscription_plan_limits
   where plan = coalesce(p_plan, 'free');
$$;
revoke all on function public.unified_plan_budget_usd(text) from public, anon, authenticated;
grant execute on function public.unified_plan_budget_usd(text) to service_role;

create or replace function public.unified_used_usd(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select used_usd from public.message_usage where user_id = p_user_id), 0)
       + coalesce((select used_usd from public.call_usage where user_id = p_user_id), 0)
       + coalesce((select used_usd from public.sms_usage where user_id = p_user_id), 0);
$$;
revoke all on function public.unified_used_usd(uuid) from public, anon, authenticated;
grant execute on function public.unified_used_usd(uuid) to service_role;

-- Shared window state lives on message_usage (pool leader).
create or replace function public.reserve_message_budget(p_user_id uuid, p_estimate_usd numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_msg public.message_usage%rowtype;
  v_plan text;
  v_total_budget numeric;
  v_total_used numeric;
  v_cap_5h numeric; v_cap_week numeric;
  v_rem_5h numeric; v_rem_week numeric; v_rem_month numeric;
begin
  if p_estimate_usd is null or p_estimate_usd < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_estimate');
  end if;
  perform public.reset_monthly_usage_if_needed(p_user_id);

  -- Lock all three service rows so concurrent spends serialize on the pool.
  select * into v_msg from public.message_usage where user_id = p_user_id for update;
  perform 1 from public.call_usage where user_id = p_user_id for update;
  perform 1 from public.sms_usage where user_id = p_user_id for update;
  if v_msg.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_usage_row');
  end if;

  v_plan := coalesce(v_msg.plan, 'free');
  v_total_budget := public.unified_plan_budget_usd(v_plan);
  if v_total_budget <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_message_budget');
  end if;

  if v_msg.window_5h_start is null or now() >= v_msg.window_5h_start + interval '5 hours' then
    v_msg.window_5h_start := now(); v_msg.window_5h_used_usd := 0;
  end if;
  if v_msg.window_week_start is null or now() >= v_msg.window_week_start + interval '7 days' then
    v_msg.window_week_start := now(); v_msg.window_week_used_usd := 0;
  end if;

  v_total_used := public.unified_used_usd(p_user_id);
  v_cap_5h   := v_total_budget * 0.08;
  v_cap_week := v_total_budget * 0.25;
  v_rem_5h   := v_cap_5h - coalesce(v_msg.window_5h_used_usd, 0);
  v_rem_week := v_cap_week - coalesce(v_msg.window_week_used_usd, 0);
  v_rem_month := v_total_budget - v_total_used;

  if v_rem_5h < p_estimate_usd then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start, window_5h_used_usd = v_msg.window_5h_used_usd,
           window_week_start = v_msg.window_week_start, window_week_used_usd = v_msg.window_week_used_usd,
           updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'window_5h_exceeded',
      'remaining_usd', greatest(0, v_rem_5h), 'retry_after', v_msg.window_5h_start + interval '5 hours');
  end if;
  if v_rem_week < p_estimate_usd then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start, window_5h_used_usd = v_msg.window_5h_used_usd,
           window_week_start = v_msg.window_week_start, window_week_used_usd = v_msg.window_week_used_usd,
           updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'window_weekly_exceeded',
      'remaining_usd', greatest(0, v_rem_week), 'retry_after', v_msg.window_week_start + interval '7 days');
  end if;
  if v_rem_month < p_estimate_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget_exceeded',
      'remaining_usd', greatest(0, v_rem_month));
  end if;

  update public.message_usage
     set used_usd = used_usd + p_estimate_usd,
         window_5h_start = v_msg.window_5h_start,
         window_5h_used_usd = v_msg.window_5h_used_usd + p_estimate_usd,
         window_week_start = v_msg.window_week_start,
         window_week_used_usd = v_msg.window_week_used_usd + p_estimate_usd,
         updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'remaining_usd', v_rem_month - p_estimate_usd);
end;
$$;

create or replace function public.reserve_call_budget(p_user_id uuid, p_estimate_usd numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_call public.call_usage%rowtype;
  v_msg public.message_usage%rowtype;
  v_plan text;
  v_total_budget numeric;
  v_total_used numeric;
  v_cap_5h numeric; v_cap_week numeric;
  v_rem_5h numeric; v_rem_week numeric; v_rem_month numeric;
begin
  if p_estimate_usd is null or p_estimate_usd < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_estimate');
  end if;
  perform public.reset_monthly_usage_if_needed(p_user_id);

  select * into v_msg from public.message_usage where user_id = p_user_id for update;
  select * into v_call from public.call_usage where user_id = p_user_id for update;
  perform 1 from public.sms_usage where user_id = p_user_id for update;
  if v_call.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_usage_row');
  end if;

  v_plan := coalesce(v_call.plan, v_msg.plan, 'free');
  v_total_budget := public.unified_plan_budget_usd(v_plan);
  if v_total_budget <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_call_budget');
  end if;

  -- Pool windows tracked on message_usage when present.
  if v_msg.user_id is not null then
    if v_msg.window_5h_start is null or now() >= v_msg.window_5h_start + interval '5 hours' then
      v_msg.window_5h_start := now(); v_msg.window_5h_used_usd := 0;
    end if;
    if v_msg.window_week_start is null or now() >= v_msg.window_week_start + interval '7 days' then
      v_msg.window_week_start := now(); v_msg.window_week_used_usd := 0;
    end if;
  end if;

  v_total_used := public.unified_used_usd(p_user_id);
  v_cap_5h   := v_total_budget * 0.08;
  v_cap_week := v_total_budget * 0.25;
  v_rem_5h   := v_cap_5h - coalesce(v_msg.window_5h_used_usd, 0);
  v_rem_week := v_cap_week - coalesce(v_msg.window_week_used_usd, 0);
  v_rem_month := v_total_budget - v_total_used;

  if v_msg.user_id is not null and v_rem_5h < p_estimate_usd then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start, window_5h_used_usd = v_msg.window_5h_used_usd,
           window_week_start = v_msg.window_week_start, window_week_used_usd = v_msg.window_week_used_usd,
           updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'window_5h_exceeded',
      'remaining_usd', greatest(0, v_rem_5h));
  end if;
  if v_msg.user_id is not null and v_rem_week < p_estimate_usd then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start, window_5h_used_usd = v_msg.window_5h_used_usd,
           window_week_start = v_msg.window_week_start, window_week_used_usd = v_msg.window_week_used_usd,
           updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'window_weekly_exceeded',
      'remaining_usd', greatest(0, v_rem_week));
  end if;
  if v_rem_month < p_estimate_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget_exceeded',
      'remaining_usd', greatest(0, v_rem_month));
  end if;

  update public.call_usage
     set used_usd = used_usd + p_estimate_usd, updated_at = now()
   where user_id = p_user_id;

  if v_msg.user_id is not null then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start,
           window_5h_used_usd = v_msg.window_5h_used_usd + p_estimate_usd,
           window_week_start = v_msg.window_week_start,
           window_week_used_usd = v_msg.window_week_used_usd + p_estimate_usd,
           updated_at = now()
     where user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'remaining_usd', v_rem_month - p_estimate_usd);
end;
$$;

create or replace function public.reserve_sms_budget(p_user_id uuid, p_estimate_usd numeric, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sms public.sms_usage%rowtype;
  v_msg public.message_usage%rowtype;
  v_plan text;
  v_total_budget numeric;
  v_total_used numeric;
  v_cap_5h numeric; v_cap_week numeric;
  v_rem_5h numeric; v_rem_week numeric; v_rem_month numeric;
  v_count integer := greatest(coalesce(p_count, 1), 1);
begin
  if p_estimate_usd is null or p_estimate_usd < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_estimate');
  end if;
  perform public.reset_monthly_usage_if_needed(p_user_id);

  select * into v_msg from public.message_usage where user_id = p_user_id for update;
  perform 1 from public.call_usage where user_id = p_user_id for update;
  select * into v_sms from public.sms_usage where user_id = p_user_id for update;
  if v_sms.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_usage_row');
  end if;

  v_plan := coalesce(v_sms.plan, v_msg.plan, 'free');
  v_total_budget := public.unified_plan_budget_usd(v_plan);
  if v_total_budget <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_sms_budget');
  end if;

  if v_msg.user_id is not null then
    if v_msg.window_5h_start is null or now() >= v_msg.window_5h_start + interval '5 hours' then
      v_msg.window_5h_start := now(); v_msg.window_5h_used_usd := 0;
    end if;
    if v_msg.window_week_start is null or now() >= v_msg.window_week_start + interval '7 days' then
      v_msg.window_week_start := now(); v_msg.window_week_used_usd := 0;
    end if;
  end if;

  v_total_used := public.unified_used_usd(p_user_id);
  v_cap_5h   := v_total_budget * 0.08;
  v_cap_week := v_total_budget * 0.25;
  v_rem_5h   := v_cap_5h - coalesce(v_msg.window_5h_used_usd, 0);
  v_rem_week := v_cap_week - coalesce(v_msg.window_week_used_usd, 0);
  v_rem_month := v_total_budget - v_total_used;

  if v_msg.user_id is not null and v_rem_5h < p_estimate_usd then
    return jsonb_build_object('ok', false, 'reason', 'window_5h_exceeded',
      'remaining_usd', greatest(0, v_rem_5h));
  end if;
  if v_msg.user_id is not null and v_rem_week < p_estimate_usd then
    return jsonb_build_object('ok', false, 'reason', 'window_weekly_exceeded',
      'remaining_usd', greatest(0, v_rem_week));
  end if;
  if v_rem_month < p_estimate_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget_exceeded',
      'remaining_usd', greatest(0, v_rem_month));
  end if;

  update public.sms_usage
     set used_usd = used_usd + p_estimate_usd,
         used_count = used_count + v_count,
         updated_at = now()
   where user_id = p_user_id;

  if v_msg.user_id is not null then
    update public.message_usage
       set window_5h_start = v_msg.window_5h_start,
           window_5h_used_usd = v_msg.window_5h_used_usd + p_estimate_usd,
           window_week_start = v_msg.window_week_start,
           window_week_used_usd = v_msg.window_week_used_usd + p_estimate_usd,
           updated_at = now()
     where user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'remaining_usd', v_rem_month - p_estimate_usd);
end;
$$;
