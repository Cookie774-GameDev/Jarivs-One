# VibeSpace Operational Audit Log

This file is the append-only operational record for scheduled **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify database data or configuration, alter Stripe objects, or change/send email.

> Sensitive values, personal information, payment identifiers, tokens, IP addresses, and customer content are intentionally omitted or summarized.

## Current status

Last completed audit: **2026-08-01 21:00 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 1 |
| High | 5 |
| Medium | 3 |
| Low | 0 |
| Informational | 1 |

### Immediate owner attention required

1. **VS-AUDIT-001 — Critical:** Cross-user row access is possible through broad Supabase RLS policies in the connected project.
2. **VS-AUDIT-002 — High:** A verified user can potentially submit a refund request on another user's behalf when paid orders exist.
3. **VS-AUDIT-004 — High:** The connected Stripe account does not match the live catalog/runtime state recorded in Supabase, and a webhook failure remains open.
4. **VS-AUDIT-005 — High:** GitHub push protection was bypassed for a detected Stripe API key pattern in the public repository.
5. **VS-AUDIT-006 — High:** The latest checked `main` commit has a failing Rust CI job.

---

## Active findings

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Status:** Open
- **Source:** Supabase live database policies and grants
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Authentication authorization boundary; customer profiles, projects, orders, entitlements, design/workflow data, updates, deliveries, and refund requests
- **Immediate owner attention:** Yes
- **Evidence summary:** Multiple permissive `SELECT` policies grant access when `accessrevamp_session_is_verified()` returns true, without checking that the row belongs to `auth.uid()`. The helper only verifies that the current user's session has a matching verification record; it does not validate row ownership. Authenticated users have `SELECT` grants on the affected tables. Because permissive RLS policies are combined with OR semantics, a verified session satisfies these policies for every row. Current affected data includes four profile rows, two customer-project rows, thirteen design-option rows, one project update, and one project workflow. The same policy pattern also covers currently empty but highly sensitive orders and entitlements tables.
- **Potential impact:** A verified customer may be able to read another customer's email/name, project URL and scope, design/workflow information, and future payment/order metadata.
- **Recommended remediation:** Remove or rewrite every session-only row policy so access also requires explicit ownership, such as `user_id = auth.uid()` or a join to a project/order owned by `auth.uid()`. Review all policies referencing `accessrevamp_session_is_verified()`, not only the tables named above. Validate the fix with two separate verified customer accounts and confirm each account can read only its own rows. Review access logs for evidence of cross-account reads.

### VS-AUDIT-002 — Refund-request insertion is not bound to the signed-in owner

- **Severity:** High
- **Status:** Open
- **Source:** Supabase live RLS policy, trigger, grants, and schema
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Refund request integrity
- **Immediate owner attention:** Yes
- **Evidence summary:** The authenticated role has `INSERT` access to `refund_requests`; its insert policy checks only that the session is verified. The insert trigger confirms that the supplied `user_id` matches the supplied order owner, but does not require the supplied `user_id` to equal `auth.uid()`. This does not directly execute a Stripe refund, and there are currently no paid-order/refund rows, but it creates a future cross-user request-forgery path once orders exist.
- **Potential impact:** A verified user who learns another order ID and owner ID could create a refund request attributed to that owner, generating false operational work or influencing downstream refund workflows.
- **Recommended remediation:** Require `user_id = auth.uid()` in the RLS `WITH CHECK`, require the referenced order to belong to `auth.uid()`, and enforce the same invariant in the trigger. Add a two-account negative test proving one user cannot create or read another user's refund request.

### VS-AUDIT-003 — Connected Supabase project does not appear to be the VibeSpace backend

- **Severity:** High
- **Status:** Open / ownership confirmation required
- **Source:** Supabase project tables, API/auth logs, Edge Functions, and runtime names
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Audit coverage and environment isolation
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected project is dominated by `accessrevamp_*` tables, AccessRevamp orders/projects/outreach data, AccessRevamp production gates, and traffic referring to the AccessRevamp website. Its only deployed Edge Function is `accessrevamp-runtime-health`. No deployed VibeSpace Edge Functions were visible. This may mean the wrong Supabase project was connected, or that separate products are sharing one backend.
- **Potential impact:** The actual VibeSpace production backend may be unaudited. If products are intentionally co-tenanted, a defect or credential compromise may have a larger blast radius and data-governance boundaries may be unclear.
- **Recommended remediation:** Confirm the authoritative VibeSpace Supabase project reference. If this project is AccessRevamp-only, connect the correct VibeSpace project to the audit. If co-tenancy is intentional, document the isolation model, ownership, retention, secrets, and deployment boundaries, then separate the projects where practical.

### VS-AUDIT-004 — Stripe account/catalog mismatch and unresolved webhook liveness warning

- **Severity:** High
- **Status:** Open
- **Source:** Stripe live account reads and Supabase payment runtime/catalog records
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected Stripe account contains no PaymentIntents, charges, active products, active prices, subscriptions, invoices, Checkout Sessions, refunds, disputes, or webhook endpoints in the checked scope. Supabase simultaneously records six active live-mode catalog entries, has checkout enabled and live payment approved, and records a recent checkout. A sampled live catalog price reference does not exist in the connected Stripe account. Supabase also has an open webhook-failure incident: the last successful webhook predates a later checkout, while event processing and fulfillment timestamps remain empty. Refunds are disabled and two-person refund control is enabled.
- **Potential impact:** Checkout may point to a different Stripe account, use stale price references, or fail to fulfill after payment. This can produce failed purchases, paid-but-unfulfilled orders, or misleading production-readiness state.
- **Recommended remediation:** Verify that the connected Stripe account is the exact account used by the live Supabase environment. Reconcile all six live catalog references against that account, verify the webhook endpoint and signing secret, replay a safe sandbox end-to-end checkout, and keep live checkout disabled until webhook receipt and fulfillment are demonstrated. Resolve the open incident only after evidence is recorded.

### VS-AUDIT-005 — GitHub push protection bypassed for a Stripe key pattern

- **Severity:** High
- **Status:** Open pending validation and revocation decision
- **Source:** GitHub secret-scanning notification received 2026-08-01
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Public source repository and credential hygiene
- **Immediate owner attention:** Yes
- **Evidence summary:** GitHub reported that push protection was bypassed "as a test case" for a detected Stripe API key pattern in an access-gateway test file near line 287, in commit beginning `2e042600`. The repository is public. The secret value was not copied into this report.
- **Potential impact:** If the value is usable rather than a synthetic fixture, anyone with repository access may obtain it. Even a deliberately fake key can normalize bypassing secret protection and can conceal future real exposures.
- **Recommended remediation:** Inspect the GitHub secret-scanning alert directly, determine whether the value was ever valid, and rotate then revoke it if validity cannot be disproved. Remove the key-shaped fixture from current history/code and replace it with a non-secret test token that cannot match a real credential. Close the alert only with documented evidence. Do not use push-protection bypasses for test fixtures.

### VS-AUDIT-006 — `main` is failing CI

- **Severity:** High
- **Status:** Open
- **Source:** GitHub Actions notification for current checked `main` commit
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Release confidence and Rust/Tauri build
- **Immediate owner attention:** Yes before merge/release
- **Evidence summary:** The latest checked `main` commit beginning `2665128` passed the frontend job but failed the Rust `cargo check` job with two annotations. The active draft PR #30 also had frontend failures on intermediate commits `ca826fc` and `612f595`; its later PR description reports a green run on head `dd957067`, but the workflow wrapper did not independently return that run during this audit.
- **Potential impact:** The default branch is not currently a reliable release baseline, and direct releases or branches created from it can inherit build failures.
- **Recommended remediation:** Review the failing Rust job annotations and restore a green `main` run before release. Require passing CI for default-branch changes and independently verify PR #30's current head before considering merge.

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Status:** Open
- **Source:** Gmail label counts and targeted inbox/spam/trash searches
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Customer support operations
- **Immediate owner attention:** No, unless customers are already being directed to these aliases
- **Evidence summary:** The merged Gmail account contains 1,240 unread messages, including 46 unread spam messages and 219 unread trash messages. Targeted searches found GitHub/security notifications but no clear inbound customer support, billing, refund, login, or bug reports addressed to the expected VibeSpace aliases in the checked period. A lack of results does not prove no customer mail exists; it may indicate aliases/routing are not configured, mail uses another address, or relevant messages are buried in the merged inbox.
- **Potential impact:** Customer requests may be missed or delayed, and the audit cannot establish an SLA from the current merged inbox state.
- **Recommended remediation:** Confirm the exact public support address and test end-to-end delivery from an unrelated account. Apply a dedicated VibeSpace support label/routing rule and establish a small triage queue with ownership and response-state fields. Keep the audit read-only and do not auto-reply or alter inbox state.

### VS-AUDIT-008 — Supabase leaked-password protection is disabled

- **Severity:** Medium
- **Status:** Open
- **Source:** Supabase Security Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Password authentication
- **Immediate owner attention:** No, but enable before broader launch
- **Evidence summary:** Supabase's live Security Advisor reports `auth_leaked_password_protection` disabled. The repository's local Supabase config also permits six-character passwords with no composition rule, though local config is not proof of the live Auth settings.
- **Potential impact:** Users can choose passwords known to be compromised, increasing account-takeover risk.
- **Recommended remediation:** Enable leaked-password protection, adopt a stronger minimum password policy, keep email confirmation enabled, and verify password reset/change reauthentication behavior in the live environment.

### VS-AUDIT-009 — Desktop WebView file/network allowlists are broad

- **Severity:** Medium
- **Status:** Open / hardening review
- **Source:** `app/src-tauri/tauri.conf.json` on `main`
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** Tauri asset protocol and Content Security Policy
- **Immediate owner attention:** No immediate exploit was demonstrated
- **Evidence summary:** The asset protocol allows all files under application data, the user's Downloads directory, and resources. The CSP allows inline styles, any HTTPS image/media source, generic secure and insecure WebSocket schemes, and numerous external APIs. This may be intentional for a multi-provider workspace, but it increases the impact of any future renderer injection or unsafe URL handling.
- **Potential impact:** A renderer compromise could have broader local-file visibility or external exfiltration options than necessary.
- **Recommended remediation:** Inventory the exact file roots and origins required per feature, reduce wildcard scopes, avoid exposing all Downloads where possible, separate privileged windows from general browsing content, and add regression tests that reject unapproved asset paths and origins.

### VS-AUDIT-010 — Many indexes currently report no usage

- **Severity:** Informational
- **Status:** Open / observe
- **Source:** Supabase Performance Advisor
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-01 21:00 UTC
- **Affected component:** PostgreSQL maintenance and write overhead
- **Immediate owner attention:** No
- **Evidence summary:** The Performance Advisor reports numerous unused indexes across contact, outreach, payment, refund, project, messaging, and security tables. The database is young and several tables have little or no traffic, so this signal is not sufficient by itself to remove indexes.
- **Potential impact:** Unnecessary indexes increase storage and write maintenance, but premature removal could harm future query performance.
- **Recommended remediation:** Observe production query/index statistics over a representative period, retain indexes supporting constraints or expected launch queries, and remove only those confirmed redundant after query-plan review.

---

## Audit run history

### Run: 2026-08-01 21:00 UTC

**Checks completed**

- Gmail: inbox/unread/spam/trash counts; targeted VibeSpace support, bug, security, billing, login, refund, and payment searches; detailed review of current GitHub security/CI notifications.
- GitHub: repository/default branch, recent commits, open issues, open/recent pull requests, current selected configuration/manifests, audit-file existence, CI notifications, and secret-scanning notification.
- Supabase: project identity, Security and Performance Advisors, public tables and RLS state, selected grants/policies/functions/triggers, storage buckets and object policy, API/Auth/Postgres/Edge/Storage/Realtime log samples, deployed Edge Functions, payment incident aggregates, payment runtime state, and production-readiness markers.
- Stripe: account identity, PaymentIntents, charges, Checkout Sessions, products, prices, subscriptions, invoices, refunds, disputes, webhook endpoints, and one catalog-reference reconciliation test.

**New findings:** VS-AUDIT-001 through VS-AUDIT-010.

**Changed findings:** None; first recorded run.

**Resolved findings:** None. Supabase contains historical resolved payment incidents, but one webhook warning remains open and was recorded under VS-AUDIT-004.

**Observed healthy controls**

- All listed public Supabase tables have RLS enabled, although several policies are unsafe as described above.
- Sensitive payment/security tables reviewed use explicit deny-browser policies.
- Storage buckets are private; the reviewed customer-object read helper includes user/project ownership checks.
- Recent sampled API/Auth traffic completed successfully, sampled Postgres cron jobs completed, and no Postgres `ERROR` or `FATAL` entry appeared in the returned log window.
- No Stripe disputes, refunds, charges, or failed PaymentIntents were found in the connected account; this is partly because the account showed no payment activity.

**Limitations and blind spots**

- The connected Supabase environment appears to belong primarily to AccessRevamp rather than VibeSpace, so actual VibeSpace backend coverage is uncertain.
- Full-repository cloning and complete all-file static analysis were unavailable in the audit runtime; selected files, GitHub metadata, notifications, and available code search were reviewed instead.
- GitHub Actions run retrieval did not independently return PR #30's reported latest green run.
- The Stripe connector did not expose event-delivery log enumeration; webhook health was inferred from webhook endpoint inventory and Supabase runtime evidence.
- No exploit, destructive test, paid transaction, email-state change, or live remediation was attempted.

**Remediation performed:** **None.** The audit was read-only. The only write was creating this Markdown audit record.
