# Stripe and Supabase Access operator runbook

> **TEST MODE ONLY until the release checklist is fully evidenced and an authorized operator
> approves production activation.** This document contains placeholders, never secret values,
> payment-card data, or customer data. It is not evidence that Stripe or Supabase was contacted.

VibeSpace has two independent billing ledgers:

- **VibeSpace Access:** a dedicated $20 USD monthly application-access subscription. The
  introductory 30-day Access trial starts from verified-account first use, collects no payment,
  and does not auto-convert. Continued use after trial or grace requires deliberate checkout.
- **Optional AI/voice/cloud plans:** separately priced feature subscriptions. They continue to map
  to `profiles.tier` and the shared-credit system.

Never merge these products into one Stripe subscription or apply a subscription-wide Stripe trial
to both. The Access price must never map into `profiles.tier`.

## Evidence boundary

At the documentation snapshot:

- **Static evidence** from source inspection confirms the migration, function, signature, JWT, and
  separate-ledger contracts described below;
- local Supabase SQL, Deno Edge tests, Stripe CLI flows, Stripe Test Clocks, hosted route checks,
  and remote gate changes are **NOT RUN during authoring**. This environment has no Supabase CLI,
  `psql`, or Deno, and this documentation task made no external test or live calls;
- a coordinator read-only cloud audit found that the bound Supabase target did not yet expose the
  `app_access_*` tables or the new `create-access-checkout`, `create-access-portal`, and
  `access-lease` functions. This is preflight discovery, not deployment evidence;
- the same target contains unrelated, pre-existing AccessRevamp `ar_*` objects. They are protected
  out-of-scope data structures: this runbook must never modify, drop, reset, truncate, rename, or
  replace any `ar_*` object;
- authenticated Stripe account identity was confirmed read-only, but the Access product and price
  state is **NOT VERIFIED**;
- no live verification is claimed. Every remote or test-mode step below needs its own timestamped
  evidence on the exact release-candidate SHA.

Use [the Access release checklist](access-release-checklist.md) as the release record.

## 1. Create distinct Stripe products and prices

In one Stripe **test-mode** account, create or confirm these independent products.

| Product family              | Product             | Recurring price | Server-side price variable   |
| --------------------------- | ------------------- | --------------: | ---------------------------- |
| Required application access | VibeSpace Access    |  $20.00 / month | `STRIPE_APP_ACCESS_PRICE_ID` |
| Optional feature plan       | Starter (Orbit)     |  $10.00 / month | `STRIPE_STARTER_PRICE_ID`    |
| Optional feature plan       | Pro (Nova)          |  $50.00 / month | `STRIPE_PRO_PRICE_ID`        |
| Optional feature plan       | Ultra (Singularity) | $100.00 / month | `STRIPE_ULTRA_PRICE_ID`      |
| Optional feature plan       | Supernova (Apex)    | $200.00 / month | `STRIPE_APEX_PRICE_ID`       |

For the Access product:

1. Set a stable lookup key where supported.
2. Add bounded metadata identifying `vibespace_access`.
3. Confirm the interval is monthly and the amount is exactly $20 USD.
4. Copy the test-mode Price ID into the private secret store; do not paste it into this repository.
5. Keep optional feature products separate. Their credits are internal units, not cash.

Build and evidence this contract in test mode first. During approved production prelaunch, create
or confirm a separate live-mode Access product with the same name, $20 monthly amount, interval,
and metadata, then store its distinct live-mode Price ID only in the production secret store.
Never reuse a test-mode Price ID in production.

`create-access-checkout` reads `STRIPE_APP_ACCESS_PRICE_ID` server-side and does not read the
request body. A client cannot submit a price, amount, customer, redirect, user ID, or idempotency
key. Checkout opening does not grant Access; only webhook-confirmed state can activate it.

## 2. Required Edge Function configuration

Values belong in the Supabase secret store for the selected project, not in Markdown, shell logs,
screenshots, fixtures, or Git.

| Name                          | Source                | Purpose                                                          |
| ----------------------------- | --------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`                | Platform-provided     | Project API used by authenticated Edge Functions                 |
| `SUPABASE_ANON_KEY`           | Platform-provided     | Server-side user JWT validation in checkout, portal, and lease   |
| `SUPABASE_SERVICE_ROLE_KEY`   | Platform-provided     | Server-only entitlement and attempt RPC access                   |
| `STRIPE_SECRET_KEY`           | Operator-set          | Test-mode Stripe server credential                               |
| `STRIPE_WEBHOOK_SECRET`       | Operator-set          | Signature verification for the selected endpoint                 |
| `STRIPE_APP_ACCESS_PRICE_ID`  | Operator-set          | Current dedicated $20 Access Price ID                            |
| `STRIPE_APP_ACCESS_PRICE_IDS` | Optional operator-set | Comma-separated rotation allowlist for old/current Access prices |
| `ACCESS_LEASE_KEY_ID`         | Operator-set          | Bounded `kid` naming the current offline-lease verification key  |
| `ACCESS_LEASE_SIGNING_JWK`    | Operator-set          | P-256 private JWK used only by the server-side lease signer      |
| `APP_BASE_URL`                | Operator-set          | Exact credential-free HTTPS public origin                        |
| `APP_ACCESS_GRACE_DAYS`       | Optional operator-set | Webhook grace duration; committed default is `3`                 |
| Feature price variables       | Operator-set          | Existing optional-plan Price IDs listed above                    |

Use an installed, organization-approved Supabase CLI version; do not let `npx` fetch an unpinned
release during a deployment. Record `supabase --version` in restricted release evidence.

Inject values through an organization-approved secret injection workflow or secret manager.
Record only the variable names and the tool/version used. Never put a literal credential, Price ID,
private JWK, bearer token, or project/account identifier in a command line, shell history,
environment dump, process capture, terminal transcript, CI log, screenshot, or repository file.
Disabling history after exposure does not undo the exposure.

Prefer a direct secret-manager/platform integration that never materializes plaintext locally. If
the approved workflow requires a protected temporary file, create it outside the repository on
encrypted local storage, restrict its ACL/permissions to the current operator before writing,
exclude it from backup/indexing, prevent command echo and process capture, ingest it without
printing it, verify only the key names, and delete it immediately after successful ingestion under
the organization's secure-cleanup policy. Abort if the tool cannot meet this lifecycle. Do not
invent an ad hoc shell-variable or clipboard workflow.

`ACCESS_LEASE_SIGNING_JWK` must be a private P-256 JWK with signing use and must never reach the
desktop client. `ACCESS_LEASE_KEY_ID` must be a bounded, non-secret identifier. Keep the public JWK
without private `d` material in the reviewed client trust configuration under the same `kid`.

Abort if the project reference, Stripe mode, public origin, or secret provenance is ambiguous.
Never put a live credential into a test project or a test credential into production.

## 3. Apply and verify migrations in order

The Access schema is additive and must be deployed in this exact order:

1. `0032_app_access.sql` — disabled-by-default launch config, entitlements, events, RLS, trial and
   status RPCs.
2. `0033_app_access_event_reconcile.sql` — atomic webhook reconciliation and event completion.
3. `0034_app_access_lease_freshness.sql` — row-locked entitlement revision for signed offline
   leases.
4. `0035_app_access_checkout_attempts.sql` — service-role-only durable checkout-attempt lifecycle.

These migrations may create or alter only their reviewed `app_access_*` objects and named Access
RPCs. Existing AccessRevamp `ar_*` objects belong to another system. If the dry run or generated SQL
would modify, drop, reset, truncate, rename, replace, or otherwise mutate any `ar_*` object, abort
without applying anything.

On the authorized test project, preview before applying:

```powershell
supabase --version
supabase link --project-ref <test-project-ref>
supabase migration list --linked
supabase db push --dry-run --linked
```

The dry run must show only reviewed pending migrations, including `0032` through `0035` in order.
If it shows a gap, unexpected migration, destructive statement, or a different project, abort.

A verified read-only preflight found a mixed version namespace: the bound remote migration history
records `0001` through `0019`, then timestamped versions for later changes. Local migration files
use numeric `0020` through `0035` and intentionally skip `0025`. Reconcile the
exact local filenames, checksums/content, remote version records, and already-present schema objects
in a reviewed, read-only comparison before trusting dry-run output. If a pending entry other than
the reviewed Access migrations `0032` through `0035` appears, abort without applying anything.
Never repair migration history blindly, mark an unapplied migration as applied, replay older numeric
migrations, or use `db push` to guess through the namespace mismatch. Escalate the evidence to the
database owner for an explicit reconciliation plan outside this runbook.

After approval:

```powershell
supabase db push --linked
supabase migration list --linked
```

Verify in the test database without selecting customer identifiers or user content:

```sql
select id, enabled, launch_at, minimum_version, trial_days, grace_days,
       monthly_price_usd, require_payment_method_for_trial
from public.app_access_launch_config
where id = 1;

select to_regclass('public.app_access_entitlements') as entitlements,
       to_regclass('public.app_access_events') as events,
       to_regclass('public.app_access_checkout_attempts') as attempts,
       to_regprocedure('public.get_app_access(text)') as status_rpc,
       to_regprocedure('public.get_app_access_lease_snapshot(text)') as lease_rpc,
       to_regprocedure(
         'public.app_access_reconcile_event(text,uuid,bigint,timestamptz,jsonb,jsonb)'
       ) as reconcile_rpc;
```

Required result: singleton config exists with `enabled = false`, `trial_days = 30`,
`grace_days = 3`, `monthly_price_usd = 20.00`, and no payment method required for the local trial.
All three tables and RPCs must resolve. Verify RLS and grants with the SQL behavior tests; do not
infer policy correctness only from object existence.

## 4. Deploy the dedicated functions

Deploy authenticated checkout, portal, and offline-lease issuance with gateway JWT verification
left on. Do **not** pass `--no-verify-jwt` to any of these commands:

```powershell
supabase functions deploy create-access-checkout --project-ref <test-project-ref>
supabase functions deploy create-access-portal --project-ref <test-project-ref>
supabase functions deploy access-lease --project-ref <test-project-ref>
```

The effective deployment/config contract for all three is `verify_jwt = true`; an absent
function-specific override retains the authenticated default. Checkout and portal call
`auth.getUser(jwt)` server-side, accept `POST` only, ignore the request body for billing authority,
and return only validated Stripe-hosted HTTPS URLs. `access-lease` also validates the user token
server-side and reads the authoritative access snapshot; it never accepts client entitlement state.
Missing or invalid signing configuration fails closed with `500 lease_unconfigured`.

Stripe cannot send a Supabase user JWT. Deploy the webhook with gateway JWT verification off:

```powershell
supabase functions deploy stripe-webhook --project-ref <test-project-ref> --no-verify-jwt
```

This matches:

```toml
[functions.stripe-webhook]
verify_jwt = false
```

The webhook's substitute trust boundary is mandatory Stripe signature verification over the raw
request body. `create-access-checkout` and `create-access-portal` must retain
`verify_jwt = true` behavior through the default gateway setting plus their server-side user-token
validation.

After authorized test deployment, prove the outer boundary before any checkout:

```powershell
# Webhook health is intentionally public.
curl.exe -i "https://<test-project-ref>.supabase.co/functions/v1/stripe-webhook"

# Unsigned webhook POST must be 400.
curl.exe -i -X POST "https://<test-project-ref>.supabase.co/functions/v1/stripe-webhook" `
  -H "Content-Type: application/json" --data "{}"

# Authenticated functions without a user bearer JWT must be 401.
curl.exe -i -X POST "https://<test-project-ref>.supabase.co/functions/v1/create-access-checkout"
curl.exe -i -X POST "https://<test-project-ref>.supabase.co/functions/v1/create-access-portal"
curl.exe -i -X POST "https://<test-project-ref>.supabase.co/functions/v1/access-lease"
```

Required responses are webhook health `200`, unsigned webhook `400`, and both unauthenticated user
functions plus unauthenticated `access-lease` `401`. A health `401` means webhook gateway JWT is
wrong; a checkout, portal, or lease response other than `401` means its authenticated boundary needs
investigation. Do not put a bearer token in release evidence.

Using an approved test harness that supplies a test-user bearer token without command-line, shell
history, log, or process exposure, perform authenticated issuance for an eligible test user.
Required result is `200` with a signed lease, bounded `kid`, revision, issue time, and expiry; no
private key or raw token may appear in evidence. Verify the returned lease through the actual client
verifier using the public key registered under that `kid`. The public key must match the private
signing key/JWK, contain no private `d` field, and reject a different or unknown `kid`. The public
key and private signing key must have matching P-256 coordinates and the same `kid`.

Key rotation lifecycle must retain an overlap for verification, then retire or revoke the old key
without accepting an unknown `kid`. The operational sequence is fail-closed:

1. Generate a replacement P-256 pair in the approved key-management system.
2. Ship the new public key and `kid` to trusted client configuration before server cutover.
3. Confirm client public-key/private-signing-key parity in test mode.
4. Change `ACCESS_LEASE_KEY_ID` and `ACCESS_LEASE_SIGNING_JWK` atomically.
5. Retain the old public key only for the maximum old-lease lifetime plus clock-skew overlap.
6. Stop issuing the old `kid`, then retire it after all valid leases expire. On compromise, revoke
   it immediately and require online refresh rather than trusting affected offline leases.

## 5. Configure the Stripe webhook

Create a test-mode endpoint:

```text
https://<test-project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end`

The last event is retained for compatibility if a future Stripe-managed trial is introduced. The
current introductory Access trial is Supabase-authoritative, not a Stripe subscription trial.

Security and delivery contract:

- `stripe-signature` is required and checked before routing.
- The raw request body is passed to Stripe verification; a parsed or modified body must fail.
- `subscription_events.event_id` is the durable global event claim.
- `app_access_reconcile_event` atomically applies Access entitlement state, bounded audit events,
  and processed completion.
- Duplicate, stale, out-of-order, and concurrent deliveries must not broaden Access.
- Classification uses known server-side price IDs or bounded Access metadata.
- Access events update `app_access_entitlements`; optional feature events retain the separate
  `profiles.tier` behavior.
- A non-2xx handler result remains retryable; no raw payload or provider error is returned.

## 6. Configure the Billing Portal

The Stripe test-mode portal must expose:

- VibeSpace Access and optional feature subscriptions as clearly named separate products;
- payment-method and invoice review;
- renewal and cancel-at-period-end controls;
- immediate cancellation only if the product owner explicitly supports and tests it.

`create-access-portal` uses the authenticated user's existing server-owned Stripe customer mapping,
never creates a customer, and constructs `APP_BASE_URL + /account` server-side.

## 7. Return-route parity is a release gate

At starting SHA `ef4b38b`, `create-access-checkout` constructed:

- `/billing/access/success`
- `/billing/access/cancel`

while the committed public site publishes:

- `/billing/success/`
- `/billing/cancel/`

Commit `f76f927` corrected the source paths to `/billing/success` and `/billing/cancel`. That source
correction is not a deployed route-walk result. Before any gate activation, inspect the exact
release-candidate checkout source and deployed site. The constructed success/cancel URLs must return
the intended static pages without redirect loops, authentication claims, or entitlement inference.
Follow `RETURN_ROUTE_PARITY_ABORT` in the release checklist if parity is absent.

## 8. Focused local and test-mode verification

Static checks that are safe in this repository:

```powershell
node scripts/check-access-release-docs.mjs
npx --no-install prettier --check docs/stripe-setup.md docs/access-release-checklist.md scripts/check-access-release-docs.mjs
git diff --check <recorded-base-sha> -- docs/stripe-setup.md docs/access-release-checklist.md scripts/check-access-release-docs.mjs
Get-FileHash -Algorithm SHA256 docs/stripe-setup.md,docs/access-release-checklist.md,scripts/check-access-release-docs.mjs
```

The base-aware diff command covers tracked and staged candidate changes relative to the recorded
base. It does not include untracked files. For each untracked owned file, run an explicit
`git diff --no-index --check -- NUL <path>` content/whitespace check: exit `1` with no diagnostic is
the expected clean-new-file result, while any whitespace diagnostic fails the gate. `Test-Path`,
the SHA-256 record, the checker (which reads all three paths), and Prettier must include every
candidate path whether tracked, staged, or untracked.

The focused Access-pattern check built into `check-access-release-docs.mjs` is supplemental. It does
not perform or prove a repository-wide secret scan. Before release, run the organization's approved
repository-wide secret scanner against the exact release-candidate tree (including untracked
candidate content), the relevant diff from the recorded release base, and the Git history reachable
from that candidate. Record the scanner/version/config and exact RC SHA in restricted evidence,
without copying detected values.

The approved scanner must cover at least private keys and private JWK material, JWTs, Supabase
`sb_secret_` and service-role families, Stripe credentials, GitHub tokens, signing/notarization
material, common cloud credentials, and high-entropy candidates. Resolve every finding through the
security owner. The documentation checker only asserts that these release instructions exist; it
cannot claim that the organization-approved repository-wide scanner ran or passed.

When Deno is installed, run the network-free Edge suites:

```powershell
deno test supabase/functions/create-access-checkout/index.test.ts
deno test supabase/functions/create-access-portal/index.test.ts
deno test supabase/functions/stripe-webhook/appAccess.test.ts
deno test supabase/functions/stripe-webhook/index.test.ts
deno test supabase/functions/access-lease/index.test.ts
```

When an isolated local Supabase/Postgres environment is available, run:

```powershell
supabase db reset
supabase test db
```

`supabase db reset` is permitted only for a disposable local database created for this test. Never
run it against a linked or remote project, and never use reset as a way to reconcile protected
`ar_*` objects.

Required Access SQL coverage includes:

- `supabase/tests/app_access_behavior.sql`
- `supabase/tests/app_access_lease_freshness.sql`
- `supabase/tests/app_access_checkout_attempts.sql`

These commands were not run while authoring this guide. Do not convert their expected outcomes into
pass claims. Test-mode Checkout, webhook, portal, and Test Clock work is recorded scenario by
scenario in the release checklist. Use Stripe-hosted test payment methods; do not record payment
numbers in repository evidence.

## 9. Activation and rollback

Keep `app_access_launch_config.enabled = false` throughout migrations, function deployment, test
mode, and v0.1.51 publication. Activation is a separate remote operation after every checklist
precondition passes. The database gate, not a client build flag, is authoritative.

If activation causes harm:

1. Disable the remote gate first. Prelaunch mode keeps the app usable.
2. Preserve all entitlement, event, checkout-attempt, account, billing, and workspace data.
3. Do not drop, delete, truncate, cancel, refund, archive a price, or rewrite customer state as an
   automatic rollback.
4. Never modify, drop, reset, truncate, rename, or replace any pre-existing AccessRevamp `ar_*`
   object during rollback.
5. Redeploy a previously approved function artifact only when its exact SHA and compatibility are
   known.
6. Reconcile billing state from signature-verified Stripe events after the incident is understood.

Use the exact prelaunch, activation, abort, and data-preserving rollback SQL in
[the Access release checklist](access-release-checklist.md).
