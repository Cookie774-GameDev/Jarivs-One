# Billing, Entitlement, and Phone Jarvis Hardening

Date: 2026-07-13

Status: implementation and final verification in progress in an isolated review branch; not deployed, merged, or applied to a database

## Scope and guardrails

This change set addresses the approved billing, entitlement, cloud-sync, metering, authentication, and Phone Jarvis findings. It intentionally does not change the visible UI, plan presentation, application layout, terminal persistence, Pets, updater, installer, release process, or unrelated features.

No production Supabase migration was applied. No Edge Function or Phone Jarvis service was deployed. No Stripe object, customer, subscription, charge, refund, portal configuration, or webhook endpoint was modified. No branch was merged.

## Branch evidence

- Approved starting commit: `54ff021420c7380662d2093f75c26f4ae66f541e`
- Remote backup branch: `backup/local-main-54ff021-20260713`
- Verified backup SHA: `54ff021420c7380662d2093f75c26f4ae66f541e`
- Isolated branch: `security/billing-integrity-54ff021`
- Worktree: `C:\Users\viper\Documents\Codex\worktrees\VibeSpace-billing-integrity-54ff021`
- Origin main observed at start: `f9d2a849ade8ef14f9657ca30dfd309bfce4b60f`
- Relationship: the approved base contains 60 legitimate local commits not yet on `origin/main`.
- Open PR overlap: draft PR #17 contains separate backend-hardening work and was not merged or copied wholesale. Reviewers must resolve conceptual overlap before either branch is merged.

The implementation and final documentation commit SHAs are recorded in the draft PR because a file cannot contain the SHA of the commit that contains that file.

## Root causes and remediation

### 1. Stripe webhook processing was not atomic

Root cause: the webhook performed several independent writes and did not treat every database error as a failed event. A partial write could leave an event appearing handled while subscription or entitlement state was incomplete.

Remediation: `apply_stripe_subscription_event` now owns event registration, customer resolution, stale-event rejection, subscription upsert/revocation, and processed-state marking in one database transaction. The Edge Function returns a retryable failure when the RPC or failure-record write fails. Raw Stripe payloads and database errors are not persisted or returned.

### 2. Duplicate and out-of-order Stripe events could overwrite newer state

Root cause: subscription state had no authoritative Stripe event timestamp or deterministic same-second conflict rule.

Remediation: subscription rows track event creation time and event ID. Older events are recorded as stale without changing state. For equal Stripe timestamps, a revocation cannot be overwritten by a paid event from the same second. Already processed event IDs are idempotent.

### 3. Deleting one subscription could revoke another active subscription

Root cause: profile-tier projection depended on a row-level change rather than recalculating the user's highest active tier across all subscriptions.

Remediation: the trigger now recomputes the highest eligible active tier after insert, update, or delete. Removing one subscription leaves another valid paid subscription authoritative.

### 4. Checkout could create duplicate sessions, customers, or active subscriptions

Root cause: checkout lacked request idempotency, did not consistently check profile writes, and did not block an already-active subscription before creating another session.

Remediation: checkout accepts a bounded client idempotency key, namespaces it by user and plan, atomically claims a per-user checkout slot before any Stripe write, uses idempotent Stripe customer/session creation, checks Stripe and local active subscriptions, handles the customer-profile race, checks every database result, and rejects concurrent or already-active checkout.

### 5. Apex was not represented consistently

Root cause: plan constraints, voice mirrors, display quotas, and helpers evolved at different times.

Remediation: `apex` is accepted in the affected database constraint and server/client fallback mirrors. Canonical budget values match migration `0029_plan_budgets_deepseek_heavy.sql`. The existing visible plan naming and UI were preserved.

### 6. Privileged and maintenance RPCs had excessive execute access

Root cause: Postgres grants function execution to `PUBLIC` unless explicitly revoked, and several operational functions retained client-callable signatures.

Remediation: PBKDF2 is bounded and service-only; pruning, rate-limit maintenance, reservation settlement, provider-reference attachment, and subscription event application are service-only. Client roles cannot read raw admin, plan-limit, reservation, or subscription-event tables.

### 7. Usage reservation and settlement were retry-unsafe

Root cause: metered operations used aggregate counters without an immutable request identity. Retries, provider callbacks, cancellation, and concurrent operations could double-charge or strand reserved value.

Remediation: `usage_reservations` provides unique idempotency keys, optional unique provider references, immutable reserved amounts/counts, explicit settlement states, bounded expiry, and an atomic claim-once transition for provider streams. Reservation and settlement RPCs serialize concurrent budget decisions, reject finalized replays, and support late provider corrections without mutating a new accounting period. Canceled, failed, and expired work releases its reservation.

### 8. Hosted provider output could exceed the amount reserved

Root cause: message completion reserved an assumed output count without sending a provider output cap, while Hive Stack accepted up to 2,048 tokens after reserving the 1,200-token default.

Remediation: `buildMessageReservationEstimate` computes one bounded output-token count used by both the budget reservation and provider request. Direct messages cap at 800; Stack requests cap at the validated requested count, no more than 2,048.

### 9. Server authority depended partly on client state

Root cause: plan/admin state was cached locally and cloud sync was skipped in the client without an equivalent database entitlement boundary.

Remediation: `get_my_entitlements()` returns only the authenticated caller's server-managed plan, admin flag, cloud-sync eligibility, and display limits. `can_use_cloud_sync()` and RLS enforce paid/admin access at the database. The client also checks the same projection to avoid wasteful retry loops.

### 10. Paid state could survive logout or account switching

Root cause: the Zustand store persisted `plan`, and failed profile refresh left the previous value untouched.

Remediation: persisted plan state is removed and store version 12 deletes legacy values during migration. Logout and identity replacement clear account caches and reset to Free immediately. Entitlement refresh verifies that the response still belongs to the active user and fails closed.

### 11. Raw billing/admin tables were client-readable

Root cause: authenticated users retained direct reads of `app_admins` and `subscription_plan_limits` in the connected project.

Remediation: migration 0033 revokes those direct reads and exposes the minimum own-user projection. Ordinary clients do not receive provider cost, margin, reservation state, webhook payloads, or other users' data.

### 12. Cloud-sync downgrade handling could either leak or delete data

Root cause: previous policy did not combine ownership and paid/admin eligibility at every operation.

Remediation: select, insert, update, and delete policies require both `auth.uid() = user_id` and server entitlement. Local queue rows are stamped with their cloud owner, flushed only for that owner, and revalidate identity before remote writes, local application, and cursor advancement. Existing records are retained on downgrade and become inaccessible until eligibility returns.

### 13. Metered Edge Functions could fail open or settle inconsistently

Root cause: message, Stack, TTS, call, SMS, promo, and usage-report handlers had different error and settlement paths.

Remediation: shared fail-closed reservation/settlement helpers are used across handlers. Desktop callers provide bounded idempotency keys. Usage endpoints fail closed on entitlement or database failures. TTS promo and Hive accounting remain separate but are idempotent. Calls reserve an exact maximum duration and provider execution is bounded to that duration.

### 14. Phone Jarvis was not safe for public exposure

Root cause: the prototype trusted caller-supplied identity/context, did not consistently verify Twilio signatures, lacked single-purpose WebSocket credentials, and could start provider-cost work before plan/budget/rate enforcement.

Remediation: Phone Jarvis defaults disabled, requires complete secure configuration, verifies exact-URL Twilio signatures, validates RS256/ES256 JWT claims and key type, enforces bridge JWT expiry for the full connection, issues short-lived HMAC bootstrap tokens, atomically claims the exact database reservation/provider pair before streaming, applies universal rate/concurrency limits, bounds token/call lifetime, sanitizes persisted context, and settles or releases through signed callbacks and stream exit paths. Health output is minimal and unauthenticated metrics are disabled.

### 15. Error and context handling could expose internal information

Root cause: some handlers returned provider/database details or accepted unbounded context.

Remediation: public responses use stable codes, persisted operational context is allowlisted and bounded, C0 controls are stripped, logs avoid raw prompts/secrets, and Phone health does not reveal transport/configuration state.

### 16. Stripe sandbox catalog is not canonical

Root cause: old Jarvis-One/Starter objects remain active, two $10 prices exist, and most prices lack canonical product names and confirmed lookup-key/metadata mapping.

Remediation in this branch: code accepts only server-side plan-to-price environment mappings and treats unknown webhook prices as retryable failures. No Stripe write was made. The approval-gated cleanup is in `docs/stripe-sandbox-change-plan-2026-07-13.md`.

## Entitlement matrix

Marketing names are included for audit traceability. Existing visible labels were not renamed by this change.

| Marketing plan | Internal ID | Monthly price | Cloud sync | Hosted messages/Stack | Cloud TTS/calls/SMS | Phone Jarvis when separately enabled | Message budget | Call/voice budget | SMS budget |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| Free | `free` | $0 | No | No | Local/BYOK and explicit promo only | No | $0 | $0 | $0 |
| Orbit | `starter` | $10 | Yes | Yes, server budgeted | Yes, server budgeted | Eligible | $1.485 | $1.4025 | $0.4125 |
| Nova | `pro` | $50 | Yes | Yes, server budgeted | Yes, server budgeted | Eligible | $7.425 | $7.0125 | $2.0625 |
| Singularity | `ultra` | $100 | Yes | Yes, server budgeted | Yes, server budgeted | Eligible | $14.85 | $14.025 | $4.125 |
| Supernova | `apex` | $200 | Yes | Yes, server budgeted | Yes, server budgeted | Eligible | $29.70 | $28.05 | $8.25 |
| Admin | server `app_admins` row | N/A | Yes | Audited, quota bypass | Audited, quota bypass | Eligible only when Phone is enabled | Zero-budget audit reservation | Zero-budget audit reservation | Zero-budget audit reservation |

Admin status is never inferred from local identity for paid cloud operations. Phone Jarvis remains disabled by default and is not deployed by this work.

## Database changes

### `0031_billing_integrity_and_rpc_hardening.sql`

- Extends Apex voice usage constraints.
- Makes voice budget lookup database-driven and service-only.
- Bounds PBKDF2 iteration/key sizes and revokes client execution.
- Restricts prune and rate-limit maintenance RPCs.
- Enforces the call-rate limiter for all users, including admins, while preserving zero-charge admin accounting.
- Adds the justified `admin_credit_grants(admin_user_id)` foreign-key index.
- Restricts and bounds `subscription_events`; adds attempt, processed, ordering, and error-code fields.
- Recomputes highest active profile tier after subscription row changes.
- Adds transactional `apply_stripe_subscription_event` and safe failure recording.
- Adds an opt-in, service-only 90-day retention function; it is not invoked by the migration.

### `0032_idempotent_usage_reservations.sql`

- Adds service-only `usage_reservations` with request/provider uniqueness, bounded expiry, and claim timestamps.
- Adds transactional reserve, settle, provider-reference, claim-once, and expiry-recovery RPCs.
- Corrects shared monthly/weekly/five-hour window settlement.
- Audits admin calls without consuming paid-plan counters.
- Makes Deepgram promo reserve/settle idempotent.
- Makes Hive step reservation and settlement idempotent.
- Stores only bounded operational metadata, never prompt or message bodies.

### `0033_own_entitlements_and_cloud_sync_rls.sql`

- Revokes direct client access to plan-limit and admin tables.
- Adds `get_my_entitlements()` and `can_use_cloud_sync()` for the authenticated caller only.
- Replaces cloud-sync policies with ownership plus paid/admin eligibility checks for every operation.
- Retains existing sync records when eligibility is removed.

## Authorization behavior

| Boundary | Before | After migration/deployment |
| --- | --- | --- |
| Plan refresh | Direct profile read; stale local plan survived errors | Own-user entitlement RPC; identity checked; fail closed to Free |
| Admin refresh | Client supplied a user ID to an admin probe | Own-user entitlement projection only |
| Raw plan/admin tables | Authenticated direct reads observed | Service role only |
| Cloud sync | Client skip logic plus owner policy | Client skip plus owner-and-entitlement RLS |
| Billing event writes | Multiple handler writes | One transactional service-only RPC |
| Usage accounting | Aggregate reserve/settle without stable request row | Idempotent service-only reservation ledger |
| Phone request | Prototype-level trust and partial checks | Disabled by default; signature/token/plan/budget/rate enforced |

## Application and Edge Function files

### Desktop application

- `app/src/App.tsx`: `applyCloudSession`, `syncPlanFromProfile`, account cache invalidation.
- `app/src/stores/auth.ts`: store version 12, `clearAccountEntitlements`, removal of persisted plan.
- `app/src/lib/supabase/entitlements.ts`: own-user entitlement projection, identity validation, short cache.
- `app/src/lib/admin.ts`: cloud admin status from own-user entitlements.
- `app/src/lib/sync.ts`, `app/src/lib/db/schema.ts`, and `app/src/lib/db/index.ts`: paid/admin cloud-sync preflight, owner-scoped queues, and identity revalidation while preserving pending work.
- `app/src/features/settings/sections/Account.tsx`: logout cache clearing.
- `app/src/features/voice/voicePlans.ts`: canonical Apex budget mirror.
- `app/src/features/call/CallService.ts`, `app/src/features/call/outbound.ts`, `app/src/features/voice/providers/cloudTts.ts`, `app/src/features/voice/providers/deepgramTts.ts`, and `app/src/lib/ai/stacks/hostedStack.ts`: bounded idempotency headers.
- Tests: `auth.test.ts`, `entitlements.test.ts`, `admin.test.ts`, `sync.test.ts`, `voicePlans.test.ts`, and `billingSecurity.test.ts`.

### Shared server helpers and handlers

- `supabase/functions/_shared/billingSecurity.ts`: safe Stripe/usage idempotency keys and transactional event argument normalization.
- `supabase/functions/_shared/metering.ts`: fail-closed reserve/settle, bounded call reservation, and call-rate enforcement.
- `supabase/functions/_shared/budget.ts` and `_shared/voice.ts`: canonical budget mirrors and exact provider output-token reservation.
- `create-checkout-session`, `create-customer-portal`, and `stripe-webhook`: checked writes, idempotency, ordering, duplicate-subscription prevention, safe errors.
- `message-complete`, `stack-complete`, `tts-speak`, `call-start`, `call-status`, and `sms-send`: idempotent reserve/settle and bounded provider work.
- `claim-launch-promo`, `get-message-usage`, `get-call-usage`, and `get-voice-usage`: fail-closed database handling.

### Phone Jarvis

- `phone-jarvis/cloud/security.py`: Twilio verification, one-time tokens, replay cache, control stripping, bounded context, and field/pattern secret redaction.
- `phone-jarvis/cloud/auth.py`: strict JWT algorithm, claims, issuer/audience/role/UUID, JWK type, and key-rotation refresh.
- `phone-jarvis/cloud/billing.py`: plan/rate check, bounded reservation, setup-aware timeout, bounded settlement duration.
- `config.py`, `main.py`, `bridge_endpoint.py`, `outbound.py`, `twilio_handler.py`, and `livekit_handler.py`: safe defaults and enforcement at each entry point.
- `.env.example`, `README.md`, and `requirements.txt`: secure configuration/runbook and pinned JOSE dependency.
- Tests: `test_auth.py`, `test_billing.py`, `test_outbound_status.py`, `test_twilio_security.py`, and `test_websocket_security.py`.

## Verification results

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 351 packages installed. Deprecated xterm warnings and two dev-only audit findings were observed. |
| Focused Vitest suite for auth/entitlements/admin/sync/voice/billing | Passed: 71/71 across 8 files. |
| `python -m pytest -q cloud/tests` | Passed: 21/21. |
| `python -m compileall -q cloud` | Passed. |
| `pglast.parse_sql` for migrations 0031-0033 and the three new SQL behavior files | Passed: all six files parsed. Existing `rls_voice_verification.sql` contains `psql` meta-syntax and is unsupported by `pglast`; it was not changed. |
| `npx --yes deno check` for changed Edge Function/shared TypeScript files | Passed: 18 files checked. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed: 3,700 modules transformed. Existing chunk-size and mixed dynamic/static import warnings remain. |
| `npm run test:release-manifest` | Passed: 1/1. |
| `cargo check --release` | Passed. Four warnings remain in untouched Rust files (`pets.rs`, `lib.rs`, `faster_whisper.rs`). |
| `cargo test --release` | Passed: 26/26. The same untouched Rust warnings remain. |
| Full `npm test` | Timed out after 10 minutes with no flushed test output. This run is unverified; the focused 71-test suite passed. |
| `npm audit --omit=dev` | Passed: zero production vulnerabilities. |
| `npm audit` | Failed: one moderate `esbuild` and one high `vite` dev-tool finding. Available fix requires a breaking Vite 8 upgrade and was not applied. |
| Changed-file credential pattern scan | One match occurred only in the intentionally fake sanitizer-test token; no real credential found. `gitleaks` is not installed. |
| `git diff --check` | Passed; only Windows LF-to-CRLF notices were emitted. |
| Independent re-review | Not completed: both assigned agents exhausted their Codex usage allowance before reporting. |
| `npx --yes supabase --version` | Passed: CLI 2.109.1. |
| `docker info` | Timed out after 30 seconds; local database stack unavailable. |

## Unverified boundaries

- SQL behavior tests were authored for stale/equal-time/delete/multiple-subscription handling, permissions, reservation retries/duplicates/admin behavior, and cloud-sync cross-user/tier behavior, but were not executed against Postgres because Docker was unavailable.
- Migrations were not applied to production or any hosted branch database.
- Real Stripe webhook delivery, Checkout, customer portal, subscription lifecycle, charge, refund, and sandbox transaction flows were not executed.
- Phone Jarvis external reachability could not be proven absent in every third-party hosting account. It was not discoverably deployed through the connected project/repository state.
- No real Twilio call/SMS, LiveKit room, or provider-cost request was made.
- The complete frontend suite did not finish before the 10-minute verification limit. The focused coverage, typecheck, and production build passed, but a full-suite rerun remains required before merge.
- Independent re-review remains required because both assigned reviewers exhausted their usage allowance before reporting.
- The task changed no Rust files; `cargo check --release` and all 26 release-mode Rust tests passed. New scoped behavioral coverage is in TypeScript, Python, and SQL.

## Deployment order requiring separate approval

1. Create a verified Supabase backup and record the migration/version baseline.
2. Execute migrations 0031, 0032, and 0033 in a disposable/staging database.
3. Run all SQL behavior files as anon, authenticated User A, authenticated User B, admin, and service role.
4. Verify advisors and compare grants/RLS/function ownership to expected output.
5. Quiesce metered staging traffic so old handlers cannot create reservations while the new RPC contract is changing.
6. Configure canonical Stripe sandbox price IDs and webhook secret without changing live Stripe.
7. Deploy the migrations and compatible shared helpers/authenticated usage functions to staging as one reviewed release unit.
8. Deploy checkout/portal, then the signed Stripe webhook with `verify_jwt = false` and handler-level Stripe verification.
9. Replay signed sandbox fixtures for duplicate, stale, unknown-price, failed-write, delete, and multiple-subscription cases.
10. Deploy the desktop build to an internal channel and verify account switching, downgrade, and preserved sync records.
11. Keep Phone Jarvis disabled until the SQL behavior tests, real infrastructure configuration, and an end-to-end Twilio/LiveKit test pass.

## Rollback

Code rollback is a normal revert of the focused commits; the approved backup branch preserves the complete pre-change tree.

Database migrations are forward-only. Do not drop reservation/event evidence. If deployment must be rolled back:

1. Disable new metered traffic before restoring any prior function version; old handlers are not compatible with reservations already claimed under the new contract.
2. Keep new tables and columns in place; they are additive and service-only.
3. Restore prior grants/policies only through a reviewed forward migration.
4. Preserve `usage_reservations` and `subscription_events` for reconciliation.
5. Reconcile unsettled reservations and unprocessed Stripe events before retrying deployment.
6. Re-enable old RPC call paths only if their prior security exposure is explicitly accepted for the rollback window.
7. Do not delete customer sync records on downgrade or rollback.

Stripe rollback is non-destructive: restore previous Edge Function secret mappings and portal/webhook configuration, while leaving legacy products/prices available until no subscriptions reference them.

## Remaining risks

- The Phone one-time-token nonce cache and PIN failure tracking remain process-local. Actual media startup additionally requires a database-backed single claim of the exact reservation and provider reference, preventing a token replay from starting a second billed stream across instances. A shared PIN-attempt store remains required before public scale-out.
- `phone_settings.byok_provider_keys` has no application-level encryption in this change. Do not populate it until a separately reviewed Vault/envelope-encryption design is deployed.
- Provider-specific Stack cost accounting still uses the legacy DeepSeek-equivalent estimator. Reservations are now idempotent and bounded, but exact multi-provider cost-of-goods requires a separately reviewed canonical provider pricing catalog.
- The connected Supabase security advisor reports leaked-password protection disabled; enabling it is a dashboard/auth policy action outside this code-only phase.
- `set_phone_pin` remains a `SECURITY DEFINER` advisor finding. Its own-user check must be revalidated in staging before migration approval.
- Existing low-traffic/unused-index and overlapping-policy advisor findings outside this scope were not removed merely from advisor statistics.
- Vite/esbuild development advisories remain because the available automatic fix is a semver-major toolchain upgrade.
- The branch starts from local history 60 commits ahead of `origin/main`; reviewers must understand that history before integration.
- Draft PR #17 overlaps conceptually and must be reconciled, not merged wholesale alongside this branch.
