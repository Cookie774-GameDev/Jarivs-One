# Stripe Sandbox Canonicalization Plan

Date: 2026-07-13

Status: read-only proposal; no Stripe object or configuration was changed

## Objective

Establish one explicit Stripe sandbox mapping for VibeSpace plans without deleting, deactivating, or rewriting legacy objects until subscription/webhook/portal behavior is proven. Live Stripe is out of scope.

## Observed sandbox state

The connected account is a Stripe test/sandbox account. Read-only connector queries returned five active USD prices and no non-canceled subscriptions at the time of review.

| Amount/month | Price ID | Product ID | Product name | Proposed internal plan |
| ---: | --- | --- | --- | --- |
| $10 | `price_1TgmwePsULCV4aFrMQtFgrrK` | `prod_Ug9FTXvXcAkXG6` | Starter | `starter` (Orbit) canonical candidate |
| $10 | `price_1TgmwEPsULCV4aFrBNGP17Ed` | `prod_Ug9EvC2udaGZKa` | Jarvis-One | legacy; retain until verified unused |
| $50 | `price_1TgmzZPsULCV4aFrYw8Nzg0i` | `prod_Ug9EvC2udaGZKa` | Jarvis-One | `pro` (Nova) current candidate |
| $100 | `price_1TgmzZPsULCV4aFrjYf6uImc` | `prod_Ug9EvC2udaGZKa` | Jarvis-One | `ultra` (Singularity) current candidate |
| $200 | `price_1Ts99HPsULCV4aFruBZ3NG97` | `prod_UrsvhWBeMOx2Np` | Apex (Supernova) | `apex` (Supernova) current candidate |

The connector response did not expose a confirmed recurring interval, lookup key, or metadata block. Those fields must be read and recorded immediately before any approved sandbox write. No Edge Function secret value was read, so current deployed price-ID assignment is not claimed.

## Canonical target catalog

Existing UI labels are not changed by this plan. The marketing names below define Stripe metadata and audit mapping only.

| Marketing name | Internal plan | Monthly USD | Proposed product name | Proposed lookup key | Required metadata |
| --- | --- | ---: | --- | --- | --- |
| Orbit | `starter` | $10 | `VibeSpace Orbit` | `vibespace_orbit_monthly_v1` | `plan_id=starter`, `app=vibespace`, `billing_period=monthly`, `catalog_version=1` |
| Nova | `pro` | $50 | `VibeSpace Nova` | `vibespace_nova_monthly_v1` | `plan_id=pro`, `app=vibespace`, `billing_period=monthly`, `catalog_version=1` |
| Singularity | `ultra` | $100 | `VibeSpace Singularity` | `vibespace_singularity_monthly_v1` | `plan_id=ultra`, `app=vibespace`, `billing_period=monthly`, `catalog_version=1` |
| Supernova | `apex` | $200 | `VibeSpace Supernova` | `vibespace_supernova_monthly_v1` | `plan_id=apex`, `app=vibespace`, `billing_period=monthly`, `catalog_version=1` |

Do not reuse a lookup key across prices. Do not infer authorization from display names or amount. The server mapping and webhook allowlist remain authoritative.

## Edge Function mapping

After separate approval, set sandbox Edge Function secrets to exactly one price per internal plan:

| Internal plan | Primary secret | Backward-compatible alias read by code | Candidate price |
| --- | --- | --- | --- |
| `starter` | `STRIPE_STARTER_PRICE_ID` | `STRIPE_PRICE_STARTER` | `price_1TgmwePsULCV4aFrMQtFgrrK` |
| `pro` | `STRIPE_PRO_PRICE_ID` | `STRIPE_PRICE_PRO` | `price_1TgmzZPsULCV4aFrYw8Nzg0i` |
| `ultra` | `STRIPE_ULTRA_PRICE_ID` | `STRIPE_PRICE_ULTRA` | `price_1TgmzZPsULCV4aFrjYf6uImc` |
| `apex` | `STRIPE_APEX_PRICE_ID` | `STRIPE_PRICE_APEX` | `price_1Ts99HPsULCV4aFruBZ3NG97` |

The candidate mapping must not be activated until product/price interval, active state, currency, tax behavior, metadata, lookup key, and portal eligibility are verified. If the existing `Jarvis-One` prices cannot be safely renamed or annotated, create canonical replacement products/prices and leave legacy prices active for historical subscriptions.

## Required webhook endpoint

The Stripe webhook endpoint must use the deployed `stripe-webhook` URL, Supabase gateway `verify_jwt = false`, and handler-level verification with `STRIPE_WEBHOOK_SECRET`. Subscribe only to the events the handler processes:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Before changing the event list, compare it against the final handler switch. Do not send raw webhook payloads to logs or store them in `subscription_events`.

## Customer Portal plan

Configure a sandbox portal configuration that:

- Allows customers to update payment methods and view invoices.
- Allows cancellation according to the product policy.
- Allows plan changes only among the four canonical monthly prices after transition tests pass.
- Does not expose both canonical and legacy $10 prices as separate upgrade choices.
- Uses the configured VibeSpace return URL; no legacy Jarvis-One fallback.
- Does not allow a downgrade path that bypasses webhook-driven entitlement reconciliation.

Record the portal configuration ID in deployment documentation, not in the desktop client.

## Non-destructive execution sequence

This sequence requires explicit sandbox-write approval.

1. Export/read all current products, prices, lookup keys, metadata, subscriptions, portal configurations, and webhook endpoints.
2. Confirm the connected account is test mode and that there are no active/non-canceled subscriptions requiring migration.
3. Decide whether each legacy product can be safely updated or needs a canonical replacement.
4. Add canonical product metadata and create missing prices only where needed.
5. Assign unique lookup keys and exact `plan_id` metadata.
6. Configure the four Edge Function price secrets in staging/sandbox.
7. Configure the Customer Portal with only canonical choices.
8. Create/update the signed webhook endpoint and required event list.
9. Run approved sandbox Checkout transactions for each plan.
10. Replay duplicate, stale, same-second, unknown-price, deletion, failed-write, and multiple-subscription cases.
11. Verify `subscriptions`, `profiles.tier`, `subscription_events`, and own-user entitlements after every case.
12. Only after successful reconciliation, mark legacy prices inactive if they are unreferenced. Never delete them.

## Validation matrix

| Case | Expected result |
| --- | --- |
| Orbit/Nova/Singularity/Supernova Checkout | One customer, one Checkout session per idempotency key, correct canonical price |
| Repeat same Checkout request | Same Stripe operation or safe duplicate response; no second subscription |
| Active subscription attempts new Checkout | Rejected before a new session is created |
| Known subscription event | Transaction commits and event becomes processed |
| Unknown price | Retryable failure; event remains unprocessed |
| Database write failure | Retryable failure; event remains unprocessed |
| Older event | Recorded stale; newer entitlement unchanged |
| Equal-time revoke then paid event | Revocation remains authoritative for that Stripe second |
| Delete one of two active subscriptions | Highest remaining active plan stays authoritative |
| Duplicate delivery | Idempotent success with no duplicate entitlement mutation |
| Portal cancel/downgrade | Webhook reconciles tier; existing cloud-sync data retained but access gated |

## Rollback

1. Restore the previous Edge Function secret values from the pre-change record.
2. Restore the previous portal configuration as default.
3. Disable the new webhook endpoint or restore its previous event selection.
4. Keep all created products/prices for audit; mark unused new prices inactive only after confirming no subscriptions reference them.
5. Keep legacy prices active until every historical subscription and invoice path is reconciled.
6. Replay failed/unprocessed events after restoring the known-good function/database combination.

## Approval gates and remaining unknowns

- Sandbox writes and test transactions require separate approval.
- Live Stripe is never modified under this plan.
- The exact deployed Edge Function secret-to-price mapping remains unverified because secret values were not read.
- Current price recurring intervals, lookup keys, metadata, tax behavior, and portal configuration must be captured before writes.
- Legacy product/price objects must not be deleted or automatically deactivated.
- Production migration and Edge Function deployment must complete staging validation before any Stripe catalog change is promoted.
