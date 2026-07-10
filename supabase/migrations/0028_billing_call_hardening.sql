-- =============================================================================
-- 0028_billing_call_hardening
-- Focused backend hardening. No UI, product, plan-price, or feature changes.
-- =============================================================================

-- Explicitly preserve the intended caller contract while removing unnecessary
-- SECURITY DEFINER exposure from helper functions.
revoke all on function public.is_app_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_app_admin(uuid) to service_role;

-- set_phone_pin intentionally remains callable by authenticated users because
-- it verifies auth.uid() = p_user_id internally. Revoke PUBLIC/anon only.
revoke all on function public.set_phone_pin(uuid, text) from public, anon;
grant execute on function public.set_phone_pin(uuid, text) to authenticated, service_role;

-- Cover the admin audit foreign key reported by the database advisor.
create index if not exists admin_credit_grants_admin_user_idx
  on public.admin_credit_grants (admin_user_id);

-- Avoid per-row auth function evaluation in the public read policy.
drop policy if exists deepgram_promo_plan_limits_read on public.deepgram_promo_plan_limits;
create policy deepgram_promo_plan_limits_read
  on public.deepgram_promo_plan_limits
  for select
  to authenticated
  using ((select auth.uid()) is not null);

-- Remove duplicate permissive SELECT policies without reducing intended access.
drop policy if exists deepgram_promo_pool_no_client_write on public.deepgram_promo_pool;
drop policy if exists deepgram_promo_usage_no_client_write on public.deepgram_promo_usage;
drop policy if exists sms_usage_no_client_write on public.sms_usage;

-- One atomic, idempotent call completion operation. Twilio can retry callbacks;
-- only the first valid completion settles budget and records the completed event.
create or replace function public.complete_call_once(
  p_call_sid text,
  p_duration_seconds integer,
  p_reserved_usd numeric,
  p_actual_usd numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_duration integer := greatest(coalesce(p_duration_seconds, 0), 0);
  v_reserved numeric := greatest(coalesce(p_reserved_usd, 0), 0);
  v_actual numeric := greatest(coalesce(p_actual_usd, 0), 0);
  v_delta numeric;
begin
  if p_call_sid is null or length(trim(p_call_sid)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_call_sid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_call_sid, 0));

  if exists (
    select 1 from public.call_events
    where call_sid = p_call_sid and status = 'completed'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select user_id into v_user_id
  from public.call_events
  where call_sid = p_call_sid
  order by created_at asc
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'call_not_found');
  end if;

  v_delta := v_actual - v_reserved;
  if v_delta < 0 then
    v_delta := greatest(v_delta, -v_reserved);
  end if;

  update public.call_usage
     set used_usd = greatest(0, used_usd + v_delta),
         window_5h_used_usd = greatest(0, window_5h_used_usd + v_delta),
         window_week_used_usd = greatest(0, window_week_used_usd + v_delta),
         used_seconds = used_seconds + v_duration,
         updated_at = now()
   where user_id = v_user_id;

  insert into public.call_events (
    user_id, call_sid, direction, duration_seconds,
    estimated_cost_usd, actual_cost_usd, status
  ) values (
    v_user_id, p_call_sid, 'outbound', v_duration,
    v_reserved, v_actual, 'completed'
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'user_id', v_user_id);
end;
$$;

revoke all on function public.complete_call_once(text, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.complete_call_once(text, integer, numeric, numeric)
  to service_role;

comment on function public.complete_call_once(text, integer, numeric, numeric) is
  'Atomically and idempotently settles one Twilio call completion callback.';
