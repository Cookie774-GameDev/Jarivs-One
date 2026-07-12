-- =============================================================================
-- 0029_plan_budgets_deepseek_heavy
-- COGS ≤ 33% of sticker. Split: DeepSeek 45% · call/voice 42.5% · SMS 12.5%.
-- (DeepSeek +15pp vs prior 30/50/20 sketch; −7.5pp each from call and SMS.)
-- =============================================================================

insert into public.subscription_plan_limits
  (plan, message_budget_usd, call_budget_usd, sms_budget_usd,
   message_credits, call_minutes, sms_count, updated_at)
values
  ('free',    0,      0,       0,      0,     0,   0,   now()),
  ('starter', 1.485,  1.4025,  0.4125, 1485,  14,  41,  now()),
  ('pro',     7.425,  7.0125,  2.0625, 7425,  70,  206, now()),
  ('ultra',   14.85,  14.025,  4.125,  14850, 140, 412, now()),
  ('apex',    29.70,  28.05,   8.25,   29700, 280, 825, now())
on conflict (plan) do update
  set message_budget_usd = excluded.message_budget_usd,
      call_budget_usd = excluded.call_budget_usd,
      sms_budget_usd = excluded.sms_budget_usd,
      message_credits = excluded.message_credits,
      call_minutes = excluded.call_minutes,
      sms_count = excluded.sms_count,
      updated_at = now();
