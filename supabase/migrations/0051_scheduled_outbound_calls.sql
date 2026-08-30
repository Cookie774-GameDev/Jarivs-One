-- Durable, account-scoped scheduling authority for approved Call Anyone jobs.

create table if not exists public.scheduled_outbound_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  call_job_id uuid not null unique references public.outbound_call_jobs(id) on delete cascade,
  approval_fingerprint text not null check (approval_fingerprint ~ '^[a-f0-9]{64}$'),
  destination_phone_e164 text not null check (destination_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  destination_display_name text not null check (char_length(destination_display_name) between 1 and 160),
  purpose text not null check (char_length(purpose) between 3 and 600),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','dispatching','queued','cancelled','failed')),
  revision bigint not null default 1 check (revision > 0),
  dispatch_token uuid,
  claim_expires_at timestamptz,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists scheduled_outbound_calls_user_time_idx
  on public.scheduled_outbound_calls(user_id, scheduled_for desc);
create index if not exists scheduled_outbound_calls_due_idx
  on public.scheduled_outbound_calls(status, scheduled_for)
  where status in ('scheduled','dispatching');

alter table public.scheduled_outbound_calls enable row level security;
drop policy if exists scheduled_outbound_calls_select_own on public.scheduled_outbound_calls;
create policy scheduled_outbound_calls_select_own on public.scheduled_outbound_calls
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.scheduled_outbound_calls from public, anon, authenticated;
grant select on public.scheduled_outbound_calls to authenticated;
grant all on public.scheduled_outbound_calls to service_role;

create or replace function public.schedule_outbound_call(
  p_user_id uuid,
  p_job_id uuid,
  p_scheduled_for timestamptz,
  p_fingerprint text,
  p_idempotency_key text
) returns public.scheduled_outbound_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.outbound_call_jobs;
  v_schedule public.scheduled_outbound_calls;
begin
  if p_scheduled_for <= now() + interval '30 seconds'
     or p_scheduled_for > now() + interval '366 days' then
    raise exception 'invalid_schedule_time';
  end if;
  if p_fingerprint !~ '^[a-f0-9]{64}$'
     or char_length(p_idempotency_key) not between 16 and 160 then
    raise exception 'invalid_schedule_authority';
  end if;
  select * into v_job from public.outbound_call_jobs
    where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'call_job_not_found'; end if;
  if v_job.status <> 'approved'
     or v_job.approval_fingerprint is distinct from p_fingerprint
     or not exists (
       select 1 from public.outbound_call_approvals a
       where a.call_job_id = v_job.id
         and a.user_id = p_user_id
         and a.invalidated_at is null
         and a.approval_fingerprint = p_fingerprint
         and a.approved_destination_phone_e164 = v_job.destination_phone_e164
         and a.approved_purpose = v_job.purpose
         and a.approved_script = v_job.approved_script
         and a.approved_opening_disclosure = v_job.opening_disclosure
         and a.approved_allowed_actions = v_job.allowed_actions
         and a.approved_maximum_duration_seconds = v_job.maximum_duration_seconds
         and a.approved_maximum_credit_reservation = v_job.maximum_credit_reservation
     ) then
    raise exception 'approval_required';
  end if;
  insert into public.scheduled_outbound_calls(
    user_id, call_job_id, approval_fingerprint, destination_phone_e164,
    destination_display_name, purpose, scheduled_for, idempotency_key
  ) values (
    p_user_id, v_job.id, p_fingerprint, v_job.destination_phone_e164,
    v_job.destination_display_name, v_job.purpose, p_scheduled_for, p_idempotency_key
  )
  on conflict (user_id, idempotency_key) do update
    set updated_at = public.scheduled_outbound_calls.updated_at
  returning * into v_schedule;
  if v_schedule.call_job_id <> v_job.id
     or v_schedule.scheduled_for <> p_scheduled_for then
    raise exception 'schedule_idempotency_conflict';
  end if;
  return v_schedule;
end;
$$;
revoke all on function public.schedule_outbound_call(uuid,uuid,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.schedule_outbound_call(uuid,uuid,timestamptz,text,text)
  to service_role;

create or replace function public.claim_scheduled_outbound_call(
  p_user_id uuid,
  p_schedule_id uuid,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.scheduled_outbound_calls;
  v_job public.outbound_call_jobs;
begin
  select * into v_schedule from public.scheduled_outbound_calls
    where id = p_schedule_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','schedule_not_found'); end if;
  if v_schedule.revision <> p_expected_revision then
    return jsonb_build_object('ok',false,'reason','schedule_revision_conflict');
  end if;
  if v_schedule.scheduled_for > now() then
    return jsonb_build_object('ok',false,'reason','schedule_not_due');
  end if;
  if v_schedule.status <> 'scheduled'
     and not (v_schedule.status = 'dispatching' and v_schedule.claim_expires_at <= now()) then
    return jsonb_build_object('ok',false,'reason','schedule_not_claimable');
  end if;
  select * into v_job from public.outbound_call_jobs
    where id = v_schedule.call_job_id and user_id = p_user_id for update;
  if found and v_job.status in ('queued','dialing','ringing','in_progress','completed') then
    update public.scheduled_outbound_calls set
      status = 'queued', dispatch_token = null, claim_expires_at = null,
      revision = revision + 1, updated_at = now()
      where id = v_schedule.id;
    return jsonb_build_object('ok',false,'reason','already_dispatched');
  end if;
  if not found
     or v_job.status not in ('approved','credits_reserved')
     or v_job.approval_fingerprint is distinct from v_schedule.approval_fingerprint
     or v_job.destination_phone_e164 is distinct from v_schedule.destination_phone_e164
     or v_job.destination_display_name is distinct from v_schedule.destination_display_name
     or v_job.purpose is distinct from v_schedule.purpose
     or not exists (
       select 1 from public.outbound_call_approvals a
       where a.call_job_id = v_job.id
         and a.user_id = p_user_id
         and a.invalidated_at is null
         and a.approval_fingerprint = v_schedule.approval_fingerprint
         and a.approved_destination_phone_e164 = v_job.destination_phone_e164
         and a.approved_purpose = v_job.purpose
         and a.approved_script = v_job.approved_script
         and a.approved_opening_disclosure = v_job.opening_disclosure
         and a.approved_allowed_actions = v_job.allowed_actions
         and a.approved_maximum_duration_seconds = v_job.maximum_duration_seconds
         and a.approved_maximum_credit_reservation = v_job.maximum_credit_reservation
     ) then
    update public.scheduled_outbound_calls set
      status = 'failed', failure_reason = 'schedule_authority_drift',
      dispatch_token = null, claim_expires_at = null,
      revision = revision + 1, updated_at = now()
      where id = v_schedule.id;
    return jsonb_build_object('ok',false,'reason','schedule_authority_drift');
  end if;
  update public.scheduled_outbound_calls set
    status = 'dispatching',
    dispatch_token = gen_random_uuid(),
    claim_expires_at = now() + interval '2 minutes',
    failure_reason = null,
    revision = revision + 1,
    updated_at = now()
  where id = v_schedule.id returning * into v_schedule;
  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'dispatch_token', v_schedule.dispatch_token,
    'revision', v_schedule.revision,
    'approval_fingerprint', v_schedule.approval_fingerprint
  );
end;
$$;
revoke all on function public.claim_scheduled_outbound_call(uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.claim_scheduled_outbound_call(uuid,uuid,bigint)
  to service_role;

create or replace function public.finish_scheduled_outbound_call_claim(
  p_user_id uuid,
  p_schedule_id uuid,
  p_dispatch_token uuid,
  p_status text,
  p_reason text default null
) returns public.scheduled_outbound_calls
language plpgsql
security definer
set search_path = public
as $$
declare v_schedule public.scheduled_outbound_calls;
begin
  if p_status not in ('queued','failed') then raise exception 'invalid_schedule_status'; end if;
  select * into v_schedule from public.scheduled_outbound_calls
    where id = p_schedule_id and user_id = p_user_id for update;
  if not found then raise exception 'schedule_not_found'; end if;
  if v_schedule.status <> 'dispatching'
     or v_schedule.dispatch_token is distinct from p_dispatch_token then
    raise exception 'schedule_claim_lost';
  end if;
  update public.scheduled_outbound_calls set
    status = p_status,
    failure_reason = case when p_status = 'failed' then left(coalesce(p_reason,'dispatch_failed'),500) else null end,
    dispatch_token = null,
    claim_expires_at = null,
    revision = revision + 1,
    updated_at = now()
  where id = v_schedule.id returning * into v_schedule;
  return v_schedule;
end;
$$;
revoke all on function public.finish_scheduled_outbound_call_claim(uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.finish_scheduled_outbound_call_claim(uuid,uuid,uuid,text,text)
  to service_role;

create or replace function public.cancel_scheduled_outbound_call(
  p_user_id uuid,
  p_schedule_id uuid,
  p_expected_revision bigint
) returns public.scheduled_outbound_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.scheduled_outbound_calls;
  v_job public.outbound_call_jobs;
begin
  select * into v_schedule from public.scheduled_outbound_calls
    where id = p_schedule_id and user_id = p_user_id for update;
  if not found then raise exception 'schedule_not_found'; end if;
  if v_schedule.revision <> p_expected_revision then raise exception 'schedule_revision_conflict'; end if;
  if v_schedule.status <> 'scheduled' then raise exception 'schedule_not_cancellable'; end if;
  select * into v_job from public.outbound_call_jobs
    where id = v_schedule.call_job_id and user_id = p_user_id for update;
  if not found or v_job.status <> 'approved'
     or v_job.approval_fingerprint is distinct from v_schedule.approval_fingerprint then
    raise exception 'schedule_authority_drift';
  end if;
  update public.outbound_call_approvals set
    invalidated_at = now(), invalidation_reason = 'scheduled_call_cancelled'
    where call_job_id = v_job.id and user_id = p_user_id and invalidated_at is null;
  update public.outbound_call_jobs set
    status = 'cancelled', failure_reason = 'scheduled_call_cancelled',
    completed_at = now(), updated_at = now()
    where id = v_job.id;
  update public.scheduled_outbound_calls set
    status = 'cancelled', failure_reason = 'user_cancelled',
    revision = revision + 1, updated_at = now()
    where id = v_schedule.id returning * into v_schedule;
  return v_schedule;
end;
$$;
revoke all on function public.cancel_scheduled_outbound_call(uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.cancel_scheduled_outbound_call(uuid,uuid,bigint)
  to service_role;
