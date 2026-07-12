# Stripe Setup (Test Mode)

Use **test mode** only until launch. No live charges during setup/testing.

## 1. Create products + recurring prices

In the Stripe dashboard (test mode) → Products, create four monthly prices:

| Plan | Price | Note (customer-facing: shared company credits) |
|------|-------|------|
| Starter (Orbit) | $10.00 / month | ~3,300 shared credits (DeepSeek + phone + SMS) |
| Pro (Nova) | $50.00 / month | ~16,500 shared credits |
| Ultra (Singularity) | $100.00 / month | ~33,000 shared credits |
| Supernova (Apex) | $200.00 / month | ~66,000 shared credits |

Credits are **internal company units** (not cash). Stripe only sells the subscription tier;
usage is enforced in Supabase via a fungible monthly pool (`reserve_*` RPCs, migration 0030).

Copy each **Price ID** (`price_...`).

## 2. Set Supabase secrets

```powershell
npx supabase secrets set STRIPE_SECRET_KEY="<stripe-secret-key>"
npx supabase secrets set STRIPE_STARTER_PRICE_ID="price_..."
npx supabase secrets set STRIPE_PRO_PRICE_ID="price_..."
npx supabase secrets set STRIPE_ULTRA_PRICE_ID="price_..."
npx supabase secrets set STRIPE_APEX_PRICE_ID="price_..."
npx supabase secrets set APP_BASE_URL="https://vibespaceos.com"
```

## 3. Create the webhook endpoint

Stripe dashboard → Developers → Webhooks → Add endpoint:

```
https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
```

Select events:
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_succeeded`, `invoice.payment_failed`.

Copy the signing secret and set it:

```powershell
npx supabase secrets set STRIPE_WEBHOOK_SECRET="<stripe-webhook-secret>"
```

## 4. Deploy

```powershell
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy create-checkout-session create-customer-portal stack-complete
# CRITICAL: Stripe has no Supabase JWT — must disable gateway JWT:
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy call-status twilio-voice-webhook twilio-message-webhook model-manifest --no-verify-jwt
```

`supabase/config.toml` sets `verify_jwt = false` for webhook/Twilio/manifest so local + deploy stay aligned.

## 5. Test (test mode)

- Use Stripe CLI to forward events: `stripe listen --forward-to <webhook url>`.
- Use test card `4242 4242 4242 4242` (any future expiry, any CVC).
- The app sends only a **plan name** (`starter`/`pro`/`ultra`/`apex`); the price is
  resolved server-side. Frontend-supplied prices are ignored.
- Health check (must return 200 text, **not** 401 JSON):  
  `GET https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Unauthenticated checkout must be **401**:  
  `POST .../create-checkout-session` without `Authorization` → gateway rejects.
- After a successful test Checkout: `profiles.tier` updates →  
  `sync_message_call_usage_for_user` seeds message/call/sms rows for that plan’s
  budgets. Usage is a **shared company credit pool** (not Stripe metered billing).
- SQL regression (transactional, rolls back):  
  `supabase/tests/subscription_v2_behavior.sql` and  
  `supabase/tests/unified_credit_pool_behavior.sql`

## Security guarantees (implemented)

- Webhook signature verified against the **raw** request body; invalid/modified
  bodies → 400.
- Gateway JWT is **off** for `stripe-webhook` so Stripe events reach the handler.
- Idempotent: each `event.id` is inserted into `subscription_events` with a
  unique constraint, so duplicates can't double-credit.
- Plan is derived **only** from the Stripe price ID server-side.
- Paid benefits are granted after Stripe confirms (`profiles.tier` update
  fires the usage-seeding triggers).
- **Dunning:** `past_due` keeps the paid plan; `invoice.payment_failed` does **not**
  force free. Access is revoked on `canceled` / `unpaid` / `incomplete_expired`
  or `customer.subscription.deleted`.

## Blocked until you provide

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four price IDs.
- A real test checkout + webhook round-trip (needs the above).
