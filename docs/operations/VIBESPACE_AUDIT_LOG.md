# VibeSpace Operational Audit Log

This file is the append-only operational record for scheduled **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify database data or configuration, alter Stripe objects, or change/send email.

> Sensitive values, personal information, payment identifiers, tokens, IP addresses, and customer content are intentionally omitted or summarized.

## Current status

Last completed audit: **2026-08-04 05:00 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 0 |
| Informational | 3 |
| Resolved | 1 |

### Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** A verified authenticated session could update any row in `profiles` without proving ownership at the last successful live Supabase check. Supabase could not be refreshed in this run.
2. **VS-AUDIT-001 — Critical:** Broad verified-session RLS policies allowed cross-user reads at the last successful live Supabase check. Supabase could not be refreshed in this run.
3. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
4. **VS-AUDIT-003 — High:** The connected Supabase project appeared to be AccessRevamp rather than the production VibeSpace backend.
5. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment catalog/runtime were mismatched at the last successful live check. Neither environment could be refreshed in this run.
6. **VS-AUDIT-005 — High:** The public-repository Stripe-key-pattern push-protection bypass remains unverified and unresolved.
7. **VS-AUDIT-013 — Medium:** Draft PR #31 still has no green validation for its exact head, is now six commits behind `main`, and still does not contain the taskbar-usage files described by the bot report.
8. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Previously reported Google/Stripe and Vercel administrative sign-ins still require owner confirmation if they were not recognized.

### Changes since the previous run

- **No new findings, severity changes, or resolutions.**
- **VS-AUDIT-013 changed:** PR #31 remains open, unmerged, and draft at head `57ca83a89e4659e7464c1533398f9cd2143f7a28`. It remains 37 commits ahead but is now **six commits behind** `main`. GitHub exposed no workflow run or combined status for that exact head. The reported native taskbar file remains absent at that head.
- No application-code commit landed on `main` after the previous audit. The only newer default-branch commit was the prior audit-log update.
- Current indexed repository searches again returned no literal `sk_live_`, `whsec_`, `STRIPE_SECRET_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` match. This does not resolve the historical push-protection bypass or prove repository history is clean.
- Gmail now reports **1,309 unread inbox messages**, **59 unread spam messages**, and **219 unread trash messages**. Targeted searches of the previous eight hours found no clear inbound VibeSpace support, billing, refund, login, security, payment, or bug report, including relevant spam/trash checks.
- No new account-security, payment, dispute, refund, webhook, or billing alert email was identified in the checked interval.
- Supabase Security Advisor and read-only SQL could not be refreshed because the connector requested interactive user input in this non-interactive run.
- Stripe account and object reads could not be refreshed for the same connector limitation. Supabase- and Stripe-backed findings retain their last successfully validated evidence timestamps and were not represented as newly confirmed.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update any customer profile

- **Severity:** Critical
- **Status:** Open; not revalidated in the 2026-08-04 05:00 UTC run because Supabase access required interactive input
- **Source:** Supabase live RLS policies, profile schema, and row counts
- **First seen:** 2026-08-02 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Customer identity, contact, status, address, notes, marketing preference, and Stripe-customer linkage stored in `profiles`
- **Immediate owner attention:** Yes
- **Evidence summary:** The authenticated-role policy `profiles_verified_session_update` applied to `UPDATE` and used only `accessrevamp_session_is_verified()` in both `USING` and `WITH CHECK`. It did not compare the row to `auth.uid()` or another ownership mapping. The table contained four rows and included sensitive customer and operational fields. No exploit or cross-account write was attempted.
- **Potential impact:** A verified customer may be able to modify another customer's profile and operational metadata or tamper with billing-customer linkage. A direct Stripe transaction effect was not demonstrated.
- **Recommended remediation:** Replace the session-only policy with ownership-bound checks in both `USING` and `WITH CHECK`; restrict ordinary-user column updates; reserve status, notes, and Stripe linkage for trusted server roles; and add two-account negative tests.

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Status:** Open; not revalidated in the 2026-08-04 05:00 UTC run because Supabase access required interactive input
- **Source:** Supabase live database policies and grants
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Authorization boundary for customer profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Immediate owner attention:** Yes
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on `customer_projects`, `entitlements`, `orders`, `profiles`, `project_deliveries`, `project_design_options`, `project_updates`, `project_workflows`, and `refund_requests` accepted only `accessrevamp_session_is_verified()` and did not require row ownership. The authenticated role retained `SELECT` grants.
- **Potential impact:** A verified customer may be able to read another customer's identity, project scope, design/workflow information, and future order or entitlement metadata.
- **Recommended remediation:** Replace every session-only policy with explicit ownership checks, review every policy referencing `accessrevamp_session_is_verified()`, and validate with two separate verified accounts.

### VS-AUDIT-002 — Refund-request insertion is not bound to the signed-in owner

- **Severity:** High
- **Status:** Open; not revalidated in the 2026-08-04 05:00 UTC run
- **Source:** Supabase live RLS policies and grants
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Refund-request integrity
- **Immediate owner attention:** Yes
- **Evidence summary:** `refund_requests` had an ownership-bound insert policy and a second permissive policy whose only check was `accessrevamp_session_is_verified()`. Permissive policies combine with OR semantics, allowing the broader policy to bypass the ownership condition.
- **Potential impact:** Once paid orders exist, a verified user who learns another order and owner identifier could submit a false refund request attributed to that customer.
- **Recommended remediation:** Remove the broad verified-session insert policy and require `user_id = auth.uid()` plus an ownership-checked paid order in both RLS and server-side validation.

### VS-AUDIT-003 — Connected Supabase project does not appear to be the VibeSpace backend

- **Severity:** High
- **Status:** Open / authoritative-environment confirmation required; not revalidated in this run
- **Source:** Supabase schema, logs, and deployed Edge Functions
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Audit coverage, deployment assurance, and environment isolation
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected project was dominated by AccessRevamp-oriented tables and activity. The only deployed Edge Function was `accessrevamp-runtime-health`; no VibeSpace-specific backend functions were visible.
- **Potential impact:** The real VibeSpace production backend may be outside this audit. Intentional co-tenancy would increase boundary and blast-radius concerns.
- **Recommended remediation:** Confirm and document the authoritative VibeSpace Supabase project reference and connect that exact environment. If co-tenancy is intentional, document and harden isolation boundaries.

### VS-AUDIT-004 — Stripe account/catalog mismatch and unresolved webhook warning

- **Severity:** High
- **Status:** Open; neither Stripe nor Supabase could be revalidated in this run
- **Source:** Stripe live account reads and Supabase payment runtime/catalog records
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected Stripe account contained no checked PaymentIntents, Checkout Sessions, charges, products, prices, subscriptions, invoices, refunds, disputes, or webhook endpoints. Supabase simultaneously recorded six catalog rows, checkout enabled, four order drafts, zero processed Stripe events, and one open critical `webhook_failure` incident.
- **Potential impact:** The application may point to a different Stripe account, stale price references, or a nonfunctional webhook path, causing failed purchases or paid-but-unfulfilled orders.
- **Recommended remediation:** Verify the exact live Stripe account, reconcile catalog prices, verify the webhook endpoint and signing secret, and complete a safe test-mode end-to-end checkout through fulfillment before enabling live checkout.

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe key pattern

- **Severity:** High
- **Status:** Open pending validation and revocation decision
- **Source:** GitHub secret-scanning notification and current repository searches
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-04 05:00 UTC
- **Affected component:** Public source repository and credential hygiene
- **Immediate owner attention:** Yes
- **Evidence summary:** GitHub previously reported that push protection was bypassed for a detected Stripe API-key pattern in a test file. Current indexed searches found no literal selected live-key prefixes or key names, but that cannot prove the historical value was synthetic, removed from history, or revoked.
- **Potential impact:** If the detected value was ever valid, it may remain publicly retrievable.
- **Recommended remediation:** Review the secret-scanning alert directly, prove whether the value was synthetic, rotate/revoke if validity cannot be disproved, replace key-shaped fixtures, and close the alert only with documented evidence.

### VS-AUDIT-013 — Draft PR #31 lacks green validation and contains a reporting/content mismatch

- **Severity:** Medium
- **Status:** Open / unmerged draft / exact current head unvalidated
- **Source:** GitHub PR state, branch comparison, current-head file fetch, workflow lookup, and status lookup
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-04 05:00 UTC
- **Affected component:** PR #31 merge readiness
- **Immediate owner attention:** Yes, before review or merge
- **Evidence summary:** PR #31 remains draft at `57ca83a89e4659e7464c1533398f9cd2143f7a28`, changes 59 files, is 37 commits ahead and six behind `main`, and has no workflow run or combined status for the exact head. The compare inventory still contains none of the named taskbar-usage implementation files, and `app/src-tauri/src/taskbar_usage.rs` returns 404 at the current head.
- **Potential impact:** Reviewers may believe missing or unvalidated functionality is present. Merging could ship regressions or omit a production-blocking feature.
- **Recommended remediation:** Reconcile branch contents with reported implementation, sync with current `main`, and run all required frontend, Rust, release, browser, and native Windows tests on the exact final head before merging.

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Status:** Open
- **Source:** Gmail label counts and targeted inbox/spam/trash searches
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-04 05:00 UTC
- **Affected component:** Customer-support operations
- **Immediate owner attention:** No, unless customers are already being directed to the current aliases
- **Evidence summary:** The merged Gmail account contains 1,309 unread inbox messages, 59 unread spam messages, and 219 unread trash messages. Targeted searches across the previous eight hours found no clear inbound VibeSpace operational request. The exact public support aliases and routing rules remain unverified.
- **Potential impact:** Customer requests can be buried or missed, and no reliable support SLA can be established.
- **Recommended remediation:** Confirm the public support address with a delivery test from an unrelated account and route it to a dedicated VibeSpace queue with ownership and response-state tracking.

### VS-AUDIT-008 — Supabase leaked-password protection is disabled

- **Severity:** Medium
- **Status:** Open; not revalidated in this run
- **Source:** Supabase Security Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Password authentication
- **Immediate owner attention:** No, but enable before broader launch
- **Evidence summary:** The live Security Advisor reported `auth_leaked_password_protection` disabled.
- **Potential impact:** Users can choose passwords known to be compromised.
- **Recommended remediation:** Enable leaked-password protection, strengthen password requirements, and verify reset/change reauthentication behavior.

### VS-AUDIT-009 — Desktop WebView file/network allowlists remain broad

- **Severity:** Medium
- **Status:** Open / hardening review; no application-code change occurred after the previous validation
- **Source:** `app/src-tauri/tauri.conf.json` and default-branch commit history
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-04 05:00 UTC
- **Affected component:** Tauri asset protocol and Content Security Policy
- **Immediate owner attention:** No immediate exploit was demonstrated
- **Evidence summary:** The validated configuration exposes broad application-data, Downloads, and resource roots and broad external WebView allowances. No application-code or configuration commit landed after the previous audit.
- **Potential impact:** A renderer compromise could have broader local-file visibility or external exfiltration options than necessary.
- **Recommended remediation:** Narrow roots and origins to feature-specific requirements, avoid exposing the full Downloads directory, isolate privileged windows, and add allowlist regression tests.

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs

- **Severity:** Medium
- **Status:** Open; not revalidated in this run
- **Source:** Supabase API logs
- **First seen:** 2026-08-02 05:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** Privacy, logging, suppression-list processing, and observability access
- **Immediate owner attention:** No immediate external disclosure was demonstrated
- **Evidence summary:** Suppression-list requests placed batches of email addresses in URL query parameters, causing Supabase API logs to retain them. This traffic appeared related to AccessRevamp outreach rather than VibeSpace.
- **Potential impact:** Personal data is duplicated into logging systems, broadening access and retention scope.
- **Recommended remediation:** Move address data to a bounded server-side body/RPC flow or keyed hashes, minimize retention, and restrict log access.

### VS-AUDIT-014 — New Google account sign-in associated with Stripe SSO

- **Severity:** Informational
- **Status:** Open / owner confirmation required; no new related alert identified in this run
- **Source:** Gmail Google Account security and data-sharing notices
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-03 05:00 UTC
- **Affected component:** Administrative Google identity and Stripe sign-in
- **Immediate owner attention:** Only if the sign-in was not initiated by the owner
- **Evidence summary:** Google reported a new sign-in and, eight minutes later, confirmed use of Google SSO for Stripe. The timing suggests one owner-initiated session but does not prove legitimacy.
- **Recommended remediation:** Confirm in Google security activity; if unrecognized, revoke sessions/connections, change the password, verify MFA, and inspect Stripe activity.

### VS-AUDIT-015 — New Vercel administrative sign-in

- **Severity:** Informational
- **Status:** Open / owner confirmation required; no new related alert identified in this run
- **Source:** Gmail Vercel security notification
- **First seen:** 2026-08-03 20:25 UTC
- **Last seen:** 2026-08-03 20:25 UTC
- **Affected component:** Vercel administrative/deployment account; direct VibeSpace relevance is unconfirmed
- **Immediate owner attention:** Only if the sign-in was not initiated by the owner
- **Evidence summary:** Vercel reported a sign-in from a new location, device, or browser. The alert did not establish unauthorized access or a VibeSpace-specific action.
- **Recommended remediation:** Confirm the event in Vercel activity, revoke unknown sessions/tokens, and ensure MFA is enabled.

### VS-AUDIT-010 — Index advisory signal requires review, not immediate deletion

- **Severity:** Informational
- **Status:** Open / observe; not revalidated in this run
- **Source:** Supabase Performance Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Affected component:** PostgreSQL maintenance and write overhead
- **Immediate owner attention:** No
- **Evidence summary:** The advisor reported unused and duplicate-index signals. The database is young and some tables have little traffic, so the signal alone is insufficient for removal.
- **Recommended remediation:** Observe representative query statistics and remove or consolidate an index only after proving it is redundant and not needed by constraints or expected queries.

---

## Resolved findings

### VS-AUDIT-006 — `main` was failing CI

- **Severity:** High
- **Status:** Resolved 2026-08-02 05:00 UTC
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen open:** 2026-08-01 21:00 UTC
- **Resolution evidence:** PR #30 was merged and the final v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64. Updater signatures were cryptographically verified and publication required all four platform entries.
- **Residual limitation:** No separate combined normal-CI status was exposed for the latest release-hardening commit; resolution is based on the completed cross-platform release build.

---

## Audit run history

### Run: 2026-08-04 05:00 UTC

**Checks completed**

- Gmail: inbox/spam/trash unread counts; VibeSpace-specific search; broad recent operational-term review; account-security search; and relevant spam/trash searches over the previous eight hours. No email or inbox state was changed.
- GitHub: repository visibility and metadata; latest default-branch commits; issue/PR activity since the prior run; PR #31 state, branch divergence, exact-head workflow/status checks, current-head taskbar-file check; and indexed searches for selected Stripe/Supabase secret patterns. No repository object other than this Markdown log was changed.
- Supabase: attempted Security Advisor and read-only SQL. Both were blocked by interactive-authentication requirements.
- Stripe: attempted connected-account read. It was blocked by interactive-authentication requirements.

**New findings:** None.

**Changed findings:** VS-AUDIT-007 and VS-AUDIT-013 received current evidence. VS-AUDIT-005 and VS-AUDIT-009 received current GitHub evidence. Supabase- and Stripe-backed findings were explicitly left at their last successful validation timestamps.

**Resolved findings:** None.

**Observed healthy controls**

- No application-code commit landed on `main` after the previous audit.
- PR #31 remains draft and unmerged.
- No workflow run or status exists for PR #31's exact head.
- Current indexed repository searches found no literal selected secret prefixes or key names.
- No clear new VibeSpace support, billing, refund, login, security, payment, or bug email was identified.
- No new Stripe payment, dispute, refund, webhook, payout, or charge alert email was identified.

**Limitations and blind spots**

- Supabase live state, logs, policies, functions, advisors, and payment runtime could not be refreshed. Critical/high Supabase findings remain based on 2026-08-02 21:00 UTC evidence.
- Stripe account identity, objects, events, disputes, refunds, payments, products, prices, subscriptions, invoices, and webhooks could not be refreshed.
- Direct GitHub secret-scanning alert enumeration was unavailable; current code search cannot clear a historical alert or repository history.
- PR #31 changes 59 files. This run reviewed metadata, complete changed-file inventory, exact-head status, and the disputed current-head path but did not dynamically execute the branch.
- Gmail support routing cannot be proven until exact public aliases are confirmed and tested.
- Log-retention windows and connector result limits constrain historical completeness.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

### Run: 2026-08-03 21:00 UTC

- **New finding:** VS-AUDIT-015, after a Vercel new-sign-in alert.
- PR #31 remained draft at the same head, 37 commits ahead and five behind `main`, with no exact-head workflow run.
- Gmail showed 1,300 unread inbox messages, 55 unread spam messages, and 219 unread trash messages; no clear inbound VibeSpace operational request was found.
- Supabase and Stripe live reads were blocked by interactive authentication requirements.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-03 13:00 UTC

- **New findings:** None.
- PR #31 remained draft, 37 commits ahead and four behind `main`, with no exact-head workflow run and a mismatch between bot-reported taskbar implementation and current branch contents.
- Gmail showed 1,289 unread inbox messages, 52 unread spam messages, and 219 unread trash messages.
- Supabase and Stripe live reads were blocked.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-03 05:00 UTC

- **New finding:** VS-AUDIT-014, after a Google new-sign-in alert and Stripe Google-SSO notice.
- PR #31 was 37 commits ahead/three behind with no exact-head workflow run.
- Gmail showed 1,282 unread inbox messages, 52 unread spam messages, and 219 unread trash messages.
- Supabase and Stripe live reads were blocked.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-02 21:00 UTC

- **New findings:** VS-AUDIT-012 and VS-AUDIT-013.
- Live Supabase review confirmed the profile-update ownership failure, nine broad verified-session read policies, refund insertion weakness, AccessRevamp-oriented environment, payment-runtime mismatch, disabled leaked-password protection, and personal data in suppression-list URLs/logs.
- Stripe contained no checked payment objects or webhook endpoints while Supabase retained live catalog/runtime records and an open webhook-failure incident.
- PR #31's earlier workflow passed lint, type checking, frontend build, and Rust but failed unit tests.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-02 13:00 UTC

- **New findings:** None.
- Revalidated critical/high Supabase policies, payment mismatch, advisors, logs, Edge Function state, Stripe object emptiness, current GitHub state, and Gmail support search.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-02 05:00 UTC

- **New finding:** VS-AUDIT-011.
- **Resolved finding:** VS-AUDIT-006 after the final v1.5.0 release succeeded across all four target platforms with verified updater controls.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-01 21:00 UTC

Initial audit established VS-AUDIT-001 through VS-AUDIT-010 after reviewing Gmail, GitHub, selected frontend/backend configuration, Supabase schema/RLS/advisors/logs/functions/payment records, and the connected Stripe account.

**Remediation performed:** **None.** The only write was creating this Markdown audit record.