# VibeSpace Operational Audit Log

This file is the append-only operational record for scheduled **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify database data or configuration, alter Stripe objects, or change/send email.

> Sensitive values, personal information, payment identifiers, tokens, IP addresses, and customer content are intentionally omitted or summarized.

## Current status

Last completed audit: **2026-08-02 13:00 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 1 |
| High | 4 |
| Medium | 4 |
| Low | 0 |
| Informational | 1 |
| Resolved | 1 |

### Immediate owner attention required

1. **VS-AUDIT-001 — Critical:** Broad verified-session Supabase RLS policies still allow cross-user reads in the connected project.
2. **VS-AUDIT-002 — High:** The permissive refund-request policy still allows insertion without binding the request to `auth.uid()`.
3. **VS-AUDIT-003 — High:** The connected Supabase project still appears to be AccessRevamp rather than the production VibeSpace backend.
4. **VS-AUDIT-004 — High:** The connected Stripe account remains empty while Supabase records six active live prices, checkout enabled, and an unresolved webhook-liveness warning.
5. **VS-AUDIT-005 — High:** The public-repository Stripe-key-pattern push-protection bypass remains unverified and unresolved.

### Changes since the previous run

- **No new findings, severity changes, or resolutions were identified.**
- No application-code commit, pull request, issue, or review activity was found after the previous audit. The only new repository commit was the prior audit-log update.
- The critical RLS ownership failure and permissive refund-request insert policy remain unchanged in the live connected database.
- The connected Supabase project still exposes only the `accessrevamp-runtime-health` Edge Function and continues to show AccessRevamp traffic and cron jobs rather than a VibeSpace production backend.
- The Stripe/Supabase mismatch remains unchanged: the connected Stripe account is still empty while Supabase retains six active live prices, checkout enabled, four order drafts, no orders or events, and one open webhook-failure incident.
- High-volume suppression-list requests continue placing batches of email addresses in request URLs retained by Supabase API logs.
- Gmail now reports **1,267 unread inbox messages**, **50 unread spam messages**, and **219 unread trash messages**. No new VibeSpace support, billing, refund, security, login, or bug report was identified in the checked period.

---

## Active findings

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Status:** Open
- **Source:** Supabase live database policies and grants
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Authorization boundary for customer profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Immediate owner attention:** Yes
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on `customer_projects`, `entitlements`, `orders`, `profiles`, `project_deliveries`, `project_design_options`, `project_updates`, `project_workflows`, and `refund_requests` still accept only `accessrevamp_session_is_verified()` and do not require row ownership. The authenticated role retains `SELECT` grants. Current affected data includes four profiles, two customer projects, thirteen design options, one project update, and one project workflow. Orders, entitlements, and deliveries are currently empty but remain covered by the unsafe policy pattern.
- **Potential impact:** A verified customer may be able to read another customer's identity, project scope, design/workflow information, and future order or entitlement metadata.
- **Recommended remediation:** Replace every session-only policy with explicit ownership checks such as `user_id = auth.uid()` or an ownership-checked join. Review every policy referencing `accessrevamp_session_is_verified()`. Validate using two separate verified accounts and inspect access logs for possible cross-account reads.

### VS-AUDIT-002 — Refund-request insertion is not bound to the signed-in owner

- **Severity:** High
- **Status:** Open
- **Source:** Supabase live RLS policies and grants
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Refund-request integrity
- **Immediate owner attention:** Yes
- **Evidence summary:** `refund_requests` still has an ownership-bound insert policy and a second permissive policy whose only check is `accessrevamp_session_is_verified()`. PostgreSQL permissive policies combine with OR semantics, so the broader policy bypasses the ownership condition. The authenticated role retains `INSERT` access. No paid orders or refund-request rows currently exist, and this policy does not itself execute a Stripe refund.
- **Potential impact:** Once paid orders exist, a verified user who learns another order and owner identifier could create a false refund request attributed to that customer.
- **Recommended remediation:** Remove the broad verified-session insert policy. Require `user_id = auth.uid()` plus an ownership-checked paid order in both RLS and server-side validation. Add a two-account negative test.

### VS-AUDIT-003 — Connected Supabase project does not appear to be the VibeSpace backend

- **Severity:** High
- **Status:** Open / authoritative-environment confirmation required
- **Source:** Supabase schema, Auth/API/Postgres logs, and deployed Edge Functions
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Audit coverage, deployment assurance, and environment isolation
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected project remains dominated by `accessrevamp_*`, outreach, website-project, and AccessRevamp payment tables. Auth logs reference `accessrevamp.com`; database cron jobs repeatedly execute AccessRevamp anomaly, webhook-liveness, and preview-expiry functions. The only deployed Edge Function is `accessrevamp-runtime-health` with JWT verification enabled. No VibeSpace call, TTS, access, billing, or other VibeSpace Edge Functions are deployed in this project.
- **Potential impact:** The real VibeSpace production backend may be completely outside this audit. If both products intentionally share a backend, their operational and data boundaries are unclear and the blast radius is larger.
- **Recommended remediation:** Confirm and document the authoritative VibeSpace Supabase project reference and connect that exact environment to this audit. If co-tenancy is intentional, document isolation, secrets, retention, ownership, and deployment boundaries and separate the products where practical.

### VS-AUDIT-004 — Stripe account/catalog mismatch and unresolved webhook warning

- **Severity:** High
- **Status:** Open
- **Source:** Stripe live account reads and Supabase payment runtime/catalog records
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected Stripe account `acct_1TgcExLB61vquDsm` still contains no PaymentIntents, Checkout Sessions, charges, active products, active prices, subscriptions, invoices, refunds, disputes, or webhook endpoints in the checked scope. Supabase simultaneously records six active live-mode catalog rows, checkout enabled, live payment approved, four order drafts, zero orders, zero Stripe events, zero entitlements, and one open `webhook_failure` incident. The last successful webhook predates the most recent checkout creation; event receipt, checkout-event processing, and fulfillment timestamps remain empty. Refunds are disabled and two-person refund control is enabled.
- **Potential impact:** The application may point to a different Stripe account, stale price references, or a nonfunctional webhook path, causing failed purchases or paid-but-unfulfilled orders.
- **Recommended remediation:** Verify that the connected Stripe account is exactly the account used by the live environment. Reconcile every catalog price, verify the webhook endpoint and signing secret, and run a safe test-mode end-to-end checkout through fulfillment. Keep live checkout disabled until receipt and fulfillment are demonstrated.

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe key pattern

- **Severity:** High
- **Status:** Open pending validation and revocation decision
- **Source:** GitHub secret-scanning notification
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Public source repository and credential hygiene
- **Immediate owner attention:** Yes
- **Evidence summary:** GitHub previously reported that push protection was bypassed as a test case for a detected Stripe API-key pattern in an access-gateway test file. The repository remains public. No later notification or connected-data evidence showed that the alert was validated, revoked, or closed. Current repository searches returned no literal `sk_live_`, `whsec_`, or `STRIPE_SECRET_KEY` match, but those searches do not prove the historical value was never valid or is no longer retrievable from history.
- **Potential impact:** If the detected value was ever valid, it may be publicly retrievable. Even a synthetic key-shaped fixture weakens secret-protection discipline.
- **Recommended remediation:** Review the secret-scanning alert directly, prove whether the value was synthetic, and rotate/revoke it if validity cannot be disproved. Replace key-shaped fixtures with impossible test tokens and close the alert only with documented evidence.

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Status:** Open
- **Source:** Gmail label counts and targeted inbox/spam/trash searches
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Customer-support operations
- **Immediate owner attention:** No, unless customers are already being directed to the current aliases
- **Evidence summary:** The merged Gmail account now contains 1,267 unread inbox messages, 50 unread spam messages, and 219 unread trash messages. The checked period contained one unrelated promotion, an unrelated business conversation, and two spam replies; no clear inbound VibeSpace customer-support, billing, refund, login, security, or bug report was found. A lack of results does not prove no customer mail exists because the exact public aliases and routing rules remain unverified.
- **Potential impact:** Customer requests can be buried or missed, and no support SLA can be established from the current merged inbox state.
- **Recommended remediation:** Confirm the exact public support address with a delivery test from an unrelated account. Route it into a dedicated VibeSpace label or queue with owner and response-state fields.

### VS-AUDIT-008 — Supabase leaked-password protection is disabled

- **Severity:** Medium
- **Status:** Open
- **Source:** Supabase Security Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Password authentication
- **Immediate owner attention:** No, but enable before broader launch
- **Evidence summary:** The live Security Advisor still reports `auth_leaked_password_protection` disabled.
- **Potential impact:** Users can choose passwords known to be compromised, increasing account-takeover risk.
- **Recommended remediation:** Enable leaked-password protection, enforce a stronger minimum password policy, and verify reset/change reauthentication behavior. Supabase guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### VS-AUDIT-009 — Desktop WebView file/network allowlists remain broad

- **Severity:** Medium
- **Status:** Open / hardening review
- **Source:** Current `app/src-tauri/tauri.conf.json`
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Tauri asset protocol and Content Security Policy
- **Immediate owner attention:** No immediate exploit was demonstrated
- **Evidence summary:** The asset protocol still exposes all application-data files, all user Downloads, and resources. The CSP still permits inline styles, any HTTPS image/media source, generic `wss:` and `ws:` connections, and a broad set of external APIs. This may support intended multi-provider features, but it increases the impact of a future renderer injection or unsafe URL path.
- **Potential impact:** A renderer compromise could have broader local-file visibility or external exfiltration options than necessary.
- **Recommended remediation:** Inventory required roots and origins per feature, narrow wildcard scopes, avoid exposing the full Downloads directory, isolate privileged windows, and add allowlist regression tests.

### VS-AUDIT-010 — Many indexes report no usage

- **Severity:** Informational
- **Status:** Open / observe
- **Source:** Supabase Performance Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** PostgreSQL maintenance and write overhead
- **Immediate owner attention:** No
- **Evidence summary:** The advisor continues to report many unused indexes across contact, outreach, payment, refund, project, messaging, and security tables. The database is young and several tables have little traffic, so the signal is not sufficient by itself to remove indexes.
- **Recommended remediation:** Observe representative production query statistics and remove an index only after confirming it is redundant and not required by constraints or expected launch queries. Supabase guidance: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs

- **Severity:** Medium
- **Status:** Open
- **Source:** Supabase API logs
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-02 13:00 UTC
- **Affected component:** Privacy, logging, suppression-list processing, and observability access
- **Immediate owner attention:** No immediate external disclosure was demonstrated
- **Evidence summary:** High-volume `GET /rest/v1/suppression_list` requests continue submitting batches of email addresses inside `email=in.(...)` query parameters. Supabase API logs retain the complete request URL, so those addresses are copied into operational logs. The sampled requests returned HTTP 200. This traffic appears related to AccessRevamp outreach rather than VibeSpace.
- **Potential impact:** Personal data is duplicated into log systems, broadening access, retention, export, and incident-response scope. URLs can also leak through intermediaries more readily than request bodies.
- **Recommended remediation:** Replace address-bearing GET URLs with a server-side RPC or bounded POST/body workflow, or compare keyed hashes where feasible. Restrict log access, minimize retention, and verify whether historical logs require deletion under the applicable privacy policy.

---

## Resolved findings

### VS-AUDIT-006 — `main` was failing CI

- **Severity:** High
- **Status:** Resolved 2026-08-02 05:00 UTC
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen open:** 2026-08-01 21:00 UTC
- **Resolution evidence:** PR #30 was merged, and the final official v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64. The updater-manifest and checksum job also succeeded. The release workflow cryptographically verified updater signatures and required all four platform entries before publication.
- **Residual limitation:** The GitHub connector did not expose a separate combined normal-CI status for the latest release-hardening commit, so resolution is based on the stronger completed cross-platform release build rather than a standalone `CI` status context.

---

## Audit run history

### Run: 2026-08-02 13:00 UTC

**Checks completed**

- Gmail: inbox, unread, spam, and trash counts; all messages from the previous eight hours; targeted VibeSpace support, billing, security, refund, login, and bug review. No email state was changed.
- GitHub: repository visibility and current default branch; commits after the prior audit; current issues and pull requests; current Tauri configuration; audit-log state; and selected secret-pattern searches. No code, issue, pull-request, workflow, or repository setting was changed.
- Supabase: live RLS policies and authenticated grants; current affected-row counts; payment runtime and catalog state; open payment incidents; Security and Performance Advisors; API, Auth, Postgres, Edge Function, Storage, and Realtime logs; and deployed Edge Functions.
- Stripe: account identity; PaymentIntents, Checkout Sessions, charges, active products, active prices, subscriptions, invoices, webhook endpoints, refunds, and disputes.

**New findings:** None.

**Changed findings:** None. VS-AUDIT-007 and VS-AUDIT-011 received updated evidence counts/activity without a severity or status change.

**Resolved findings:** None.

**Observed healthy controls**

- No new application-code change was introduced after the prior audit.
- No new GitHub issue or pull-request activity was identified in the checked period.
- Sampled Supabase API requests completed with HTTP 200, and repeated anomaly, webhook-liveness, and preview-expiry cron jobs completed without an `ERROR` or `FATAL` entry in the returned Postgres window.
- The sole deployed Edge Function requires JWT verification.
- The connected Stripe account showed no charges, failed PaymentIntents, refunds, disputes, subscriptions, invoices, or customer billing activity; this is partly because it showed no payment objects at all.
- No new clear inbound VibeSpace customer-support message was identified.

**Limitations and blind spots**

- The connected Supabase project still appears to be AccessRevamp rather than VibeSpace, so actual VibeSpace backend coverage is uncertain.
- GitHub direct secret-scanning alert enumeration was unavailable; the alert remains open in this report because no resolution evidence was found.
- The GitHub connector did not expose a full repository-wide dynamic security scan or a complete workflow-run feed for every branch. No application commit occurred in this interval, so current-state configuration and prior release evidence were prioritized.
- The Stripe connector did not expose webhook delivery-attempt logs; liveness was assessed from endpoint inventory and Supabase runtime records.
- Gmail routing cannot be proven until the exact public VibeSpace aliases are confirmed and tested.
- No exploit, destructive test, paid transaction, email-state change, deployment, or remediation was attempted.

**Remediation performed:** **None.** The audit was read-only. The only write was updating this Markdown audit record.

### Run: 2026-08-02 05:00 UTC

**Checks completed**

- Gmail: inbox/unread/spam/trash counts; targeted VibeSpace support, bug, security, billing, login, refund, and payment searches; release, CI, and secret-alert review. No email state was changed.
- GitHub: current commits since the previous audit; PR #30 merge; open issues and pull requests; release run jobs; release workflow and updater hardening; current Tauri configuration; current audit file; selected secret-pattern searches; and a 549-commit comparison from the previous audit baseline.
- Supabase: project identity, public schema, RLS policies and authenticated grants, affected-row aggregates, Security and Performance Advisors, API/Auth/Postgres/Edge/Storage/Realtime logs, deployed Edge Functions, payment runtime state, catalog counts, payment incidents, orders, drafts, events, refunds, and disputes.
- Stripe: account identity; PaymentIntents, Checkout Sessions, charges, active products, active prices, webhook endpoints, refunds, and disputes.

**New findings:** VS-AUDIT-011.

**Changed findings:** VS-AUDIT-003, VS-AUDIT-004, VS-AUDIT-006, and VS-AUDIT-007.

**Resolved findings:** VS-AUDIT-006.

**Observed healthy controls**

- The final v1.5.0 release run succeeded on all four target platforms and generated the updater manifest and checksums.
- Updater signatures are cryptographically verified against the configured public key before manifest publication, and publication requires a complete four-platform manifest.
- Sampled Supabase API/Auth requests completed successfully. Repeated database anomaly, webhook-liveness, and preview-expiry cron jobs completed without an `ERROR` or `FATAL` entry in the returned Postgres window.
- The connected Stripe account showed no charges, failed PaymentIntents, refunds, disputes, or customer billing activity; this is partly because it showed no payment objects at all.
- No new clear inbound VibeSpace customer-support message was identified in the searched period.

**Limitations and blind spots**

- The connected Supabase project still appears to be AccessRevamp rather than VibeSpace, so actual VibeSpace backend coverage is uncertain.
- The 549-commit change set was too large for complete all-file manual review through the connector. Security-sensitive release configuration, Tauri configuration, live backend state, metadata, and available tests/workflows were prioritized.
- GitHub secret-scanning alert state was inferred from notifications because direct alert enumeration was unavailable.
- The Stripe connector did not expose webhook delivery-event logs; liveness was assessed from endpoint inventory and Supabase runtime records.
- Gmail routing cannot be proven until the exact public VibeSpace aliases are confirmed and tested.
- No exploit, destructive test, paid transaction, email-state change, deployment, or remediation was attempted.

**Remediation performed:** **None.** The audit was read-only. The only write was updating this Markdown audit record.

### Run: 2026-08-01 21:00 UTC

Initial audit established findings VS-AUDIT-001 through VS-AUDIT-010 after reviewing Gmail support/security/CI mail, GitHub repository and pull-request state, selected frontend/backend configuration, Supabase schema/RLS/advisors/logs/functions/payment records, and the connected Stripe account. It found the critical RLS ownership failure, refund-request policy weakness, probable Supabase environment mismatch, Stripe/catalog mismatch, secret-protection bypass, failing `main` CI, unverified support routing, disabled leaked-password protection, broad Tauri allowlists, and unused-index advisory signal.

**Remediation performed:** **None.** The only write was creating this Markdown audit record.
