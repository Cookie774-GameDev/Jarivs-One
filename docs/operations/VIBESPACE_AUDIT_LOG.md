# VibeSpace Operational Audit Log

This file is the append-only operational record for scheduled **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify database data or configuration, alter Stripe objects, or change/send email.

> Sensitive values, personal information, payment identifiers, tokens, IP addresses, customer content, and unrelated account identifiers are intentionally omitted or summarized.

## Current status

Last completed audit: **2026-08-05 21:00 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 5 |
| Low | 0 |
| Informational | 3 |
| Resolved | 2 |

### Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** A verified authenticated session could update any row in `profiles` without proving ownership at the last successful live Supabase check. The new draft migration adds an owner-bound policy but does not drop the known broad verified-session policy, so it is not sufficient evidence of remediation.
2. **VS-AUDIT-001 — Critical:** Broad verified-session RLS policies allowed cross-user reads at the last successful live Supabase check. The new draft migration addresses only owner policies on `profiles` and does not remove the known broad read policies.
3. **VS-AUDIT-018 — High:** The first configured desktop-updater endpoint serves a stale, incomplete, unsigned `0.1.48` manifest while the application and signed release channel are at `1.5.0`.
4. **VS-AUDIT-016 — High:** Supabase reported a critical `rls_disabled_in_public` exposure in a different project visible through the merged inbox. Direct VibeSpace impact remains unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
6. **VS-AUDIT-003 — High:** The connected Supabase project appeared to be AccessRevamp rather than the production VibeSpace backend.
7. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment catalog/runtime were mismatched at the last successful live check.
8. **VS-AUDIT-005 — High:** The public-repository Stripe-key-pattern push-protection bypass remains unverified and unresolved.
9. **VS-AUDIT-013 — High:** Draft PR #31 expanded from 59 to 1,232 changed files and its exact current head fails frontend type checking; build, tests, and release-manifest validation were skipped. Do not merge or deploy this head.
10. **VS-AUDIT-019 — Medium:** The exact-head CI installation reported seven dependency advisories, including two classified critical and four high. The workflow output did not identify the packages or reachable paths, so exploitability is not claimed, but the advisory set must be resolved or dispositioned before release.
11. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Google/Stripe and Vercel administrative sign-ins still require owner confirmation if they were not recognized.

### Changes since the previous run

- **New finding: VS-AUDIT-019.** PR #31's exact-head CI ran `npm install` and reported seven advisories: two critical, four high, and one moderate. The workflow then failed during TypeScript checking. The available log did not enumerate advisory identifiers, affected packages, production reachability, or fixes, so this is recorded as an unresolved dependency-risk signal rather than a confirmed exploitable vulnerability.
- **Severity change: VS-AUDIT-013 increased from Medium to High.** PR #31 moved from head `57ca83a89e4659e7464c1533398f9cd2143f7a28` with 59 changed files to `5e51f5c3acbfc1808a003ae13ba47627b856505a` with **83 commits, 1,232 changed files, 137,549 additions, and 7,310 deletions** relative to `main`. It is now 83 commits ahead and zero behind. Exact-head CI failed TypeScript checking with `TS6305` and `TS7006` in `src/viteFontAccess.test.ts`; frontend build, Vitest, and release-manifest validation were skipped. Rust `cargo check` succeeded and the exact-head deterministic AI-boundary evaluation succeeded. Earlier heads also generated frontend-CI and AI-evaluation failure notices.
- **VS-AUDIT-012 / VS-AUDIT-001 changed:** The draft branch now contains migration `0037_profiles_display_name_security.sql`, which creates owner-bound profile `SELECT`/`UPDATE` policies and restricts authenticated updates to `display_name`. However, it drops only `own profile`, `profiles_owner_select`, and `profiles_owner_update`; it does not drop the live broad policies previously identified as `profiles_verified_session_update` and the broad verified-session read policy. Because permissive PostgreSQL policies combine with OR semantics, applying this migration unchanged would not, by itself, prove the live critical findings are fixed. The migration is unmerged and was not applied or tested against the connected project.
- **Resolved finding: VS-AUDIT-017.** A newer Google Workspace notice for the same merged support tenant states that a paid subscription is scheduled to begin on September 1, 2026. That supersedes the earlier evidence that billing setup was incomplete by August 6. Direct VibeSpace dependency on this AccessRevamp-oriented tenant remains unconfirmed.
- **VS-AUDIT-007 changed:** Gmail now reports **1,368 unread inbox messages**, **67 unread spam messages**, and **219 unread trash messages**. Review of recent inbox, spam, and trash items found no clear new VibeSpace customer support, billing, refund, payment, login, security, webhook, or bug report. Relevant spam matches were unrelated sales outreach.
- PR #32, the free Cloudflare AI-news backend, was merged into PR #31's branch rather than `main`. The PR #31 body states that deployment was not executed. Read-only code review found that the public news endpoint can trigger feed ingestion whenever the database is empty without an explicit single-flight/rate guard and returns raw exception text in one 500 response path. The setup script also installs dependencies from a moving draft branch. These are pre-deployment hardening concerns included under VS-AUDIT-013, not evidence of a live incident.
- PR #33 remains an open draft standalone motion-lab prototype; its exact head has a successful CI run and it does not claim runtime integration.
- No application-code commit landed on `main` after the previous audit. The only newer default-branch commit was the prior audit-log update.
- Supabase Security Advisor and API logs again required interactive user input, so live policies, advisors, logs, functions, storage, realtime, migrations, and performance could not be refreshed.
- Stripe account identity and health again required interactive user input, so payments, customers, subscriptions, invoices, refunds, disputes, events, and webhook state could not be refreshed.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update any customer profile

- **Severity:** Critical
- **Status:** Open; not revalidated in the 2026-08-05 21:00 UTC run because Supabase access required interactive input
- **Source:** Supabase live RLS policies, profile schema, row counts, and draft migration `0037_profiles_display_name_security.sql`
- **First seen:** 2026-08-02 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting code evidence:** 2026-08-05 21:00 UTC
- **Affected component:** Customer identity, contact, status, address, notes, marketing preference, and Stripe-customer linkage stored in `profiles`
- **Immediate owner attention:** Yes
- **Evidence summary:** The live authenticated-role policy `profiles_verified_session_update` applied to `UPDATE` and used only `accessrevamp_session_is_verified()` in both `USING` and `WITH CHECK`. It did not compare the row to `auth.uid()` or another ownership mapping. The draft migration now creates an ownership-bound policy and narrows the authenticated column grant to `display_name`, but it does not drop `profiles_verified_session_update`. If the known broad policy remains, permissive-policy OR semantics could still permit cross-user display-name changes even after the draft migration. No exploit or cross-account write was attempted.
- **Potential impact:** A verified customer may be able to modify another customer's profile. The draft grant would reduce the client-writable scope to `display_name` if applied successfully, but it is not deployed evidence and does not remove the broad policy. A direct Stripe transaction effect was not demonstrated.
- **Recommended remediation:** Inventory and explicitly drop every existing broad profile policy by exact name before creating owner policies; restrict ordinary-user column updates; reserve operational and Stripe fields for trusted server roles; run migration tests against the actual current schema; and add two-account negative tests.

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Status:** Open; not revalidated in the 2026-08-05 21:00 UTC run because Supabase access required interactive input
- **Source:** Supabase live database policies/grants and draft migrations
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting code evidence:** 2026-08-05 21:00 UTC
- **Affected component:** Authorization boundary for customer profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Immediate owner attention:** Yes
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on `customer_projects`, `entitlements`, `orders`, `profiles`, `project_deliveries`, `project_design_options`, `project_updates`, `project_workflows`, and `refund_requests` accepted only `accessrevamp_session_is_verified()` and did not require row ownership. The new draft profile migration does not drop the known broad verified-session read policy, and the reviewed new hardening migrations do not replace the other eight broad policies.
- **Potential impact:** A verified customer may be able to read another customer's identity, project scope, design/workflow information, and future order or entitlement metadata.
- **Recommended remediation:** Replace every session-only policy with explicit ownership checks, explicitly drop all old broad policies by exact name, review every policy referencing `accessrevamp_session_is_verified()`, and validate the complete migration chain with two separate verified accounts.

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and invalid

- **Severity:** High
- **Status:** Open / strongly supported configuration inference; packaged-client validation required
- **Source:** `app/src-tauri/tauri.conf.json`, `releases/channel.json`, `.github/workflows/publish-v1-5-0.yml`, updater initialization in `app/src-tauri/src/lib.rs`, and official Tauri updater requirements
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-05 13:00 UTC
- **Affected component:** Desktop in-app updater, release delivery, and security/reliability patch distribution
- **Immediate owner attention:** Yes
- **Evidence summary:** The updater's first configured endpoint is the repository's raw `releases/channel.json`. That file currently reports version `0.1.48`, contains only `windows-x86_64`, and lacks the required artifact `signature`. The packaged application configuration is version `1.5.0`. The second endpoint points to the latest GitHub release's `latest.json`, and the v1.5.0 publication workflow verifies that separate release asset contains four signed platform entries. The workflow does not validate or replace `releases/channel.json`. Tauri documents that it advances to the next endpoint only after a non-2XX response and validates the complete static manifest before comparing versions. Because the first raw GitHub endpoint normally returns a successful response, its invalid manifest is likely to stop the check before the valid fallback is reached. No packaged application check was performed in this read-only run.
- **Potential impact:** Existing desktop installations may fail to discover or install signed security and reliability updates. No signature bypass or arbitrary-code execution was established; Tauri signature verification remains configured and cannot be disabled.
- **Recommended remediation:** Remove the legacy endpoint or atomically replace it with the same complete signed manifest used by the release; make the exact first configured endpoint part of the release gate; require all supported targets, URLs, and signatures; return a non-2XX/204 response when a channel is intentionally inactive; and add a packaged-app updater smoke test for every supported target before publishing.

### VS-AUDIT-016 — Supabase reported an RLS-disabled public table in a different project

- **Severity:** High
- **Status:** Open / owner validation required; not independently validated because Supabase access required interactive input
- **Source:** Gmail Supabase Security Advisor notification
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-04 16:26 UTC
- **Affected component:** A different Supabase project visible through the merged administrative inbox; direct VibeSpace impact is unconfirmed
- **Immediate owner attention:** Yes
- **Evidence summary:** Supabase reported a critical `rls_disabled_in_public` condition and stated that a public-schema table could be read, edited, and deleted by anyone with the project URL because RLS was not enabled. The project reference in the alert did not match the VibeSpace target project. The email did not identify the table, and this audit did not open email links or perform a live project check.
- **Potential impact:** Unauthorized data access or mutation in the affected project. No evidence currently ties the affected table to VibeSpace.
- **Recommended remediation:** Sign in directly to Supabase, open the named project from the dashboard rather than an email link, identify the affected table, verify whether public access is intentional, enable and test RLS if not, and document whether VibeSpace depends on or shares data with that project.

### VS-AUDIT-002 — Refund-request insertion is not bound to the signed-in owner

- **Severity:** High
- **Status:** Open; not revalidated in the 2026-08-05 21:00 UTC run
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
- **Source:** Stripe live account reads, Supabase payment runtime/catalog records, and Gmail Stripe onboarding notification
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting evidence:** 2026-08-04 15:10 UTC
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Immediate owner attention:** Yes
- **Evidence summary:** The connected Stripe account contained no checked PaymentIntents, Checkout Sessions, charges, products, prices, subscriptions, invoices, refunds, disputes, or webhook endpoints. Supabase simultaneously recorded six catalog rows, checkout enabled, four order drafts, zero processed Stripe events, and one open critical `webhook_failure` incident. Stripe later sent an onboarding email for a different account than the account specified for this audit, confirming that multiple Stripe accounts exist in the merged administrative environment. It does not prove which account VibeSpace uses.
- **Potential impact:** The application may point to a different Stripe account, stale price references, or a nonfunctional webhook path, causing failed purchases or paid-but-unfulfilled orders.
- **Recommended remediation:** Inventory all Stripe accounts, identify the authoritative VibeSpace account from deployed configuration without exposing secrets, reconcile catalog prices, verify the webhook endpoint and signing secret, and complete a safe test-mode end-to-end checkout through fulfillment before enabling live checkout.

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe key pattern

- **Severity:** High
- **Status:** Open pending validation and revocation decision
- **Source:** GitHub secret-scanning notification and repository searches
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-05 13:00 UTC
- **Affected component:** Public source repository and credential hygiene
- **Immediate owner attention:** Yes
- **Evidence summary:** GitHub previously reported that push protection was bypassed for a detected Stripe API-key pattern in a test file. Current indexed searches found no literal selected live-key prefixes or key names, but that cannot prove the historical value was synthetic, removed from history, or revoked.
- **Potential impact:** If the detected value was ever valid, it may remain publicly retrievable.
- **Recommended remediation:** Review the secret-scanning alert directly, prove whether the value was synthetic, rotate/revoke if validity cannot be disproved, replace key-shaped fixtures, and close the alert only with documented evidence.

### VS-AUDIT-013 — Draft PR #31 fails exact-head validation after massive scope expansion

- **Severity:** High
- **Status:** Open / unmerged draft / exact current head failing CI
- **Source:** GitHub PR metadata, branch comparison, changed-file inventory, exact-head workflow jobs/logs, recent PR activity, Gmail CI notices, and selected changed-file review
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-05 21:04 UTC
- **Affected component:** PR #31 merge readiness, application/runtime integrity, billing/auth/backend changes, and release assurance
- **Immediate owner attention:** Yes; do not merge or deploy the current head
- **Evidence summary:** PR #31 is an open draft at `5e51f5c3acbfc1808a003ae13ba47627b856505a`, 83 commits ahead and zero behind `main`, with 1,232 changed files, 137,549 additions, and 7,310 deletions. The exact-head CI failed in TypeScript checking: `src/viteFontAccess.test.ts` produced `TS6305` because a Vite declaration output had not been built and `TS7006` for an implicit `any`. Consequently the Vite build, Vitest suite, and release-manifest test were skipped. Rust `cargo check` succeeded and the deterministic AI-boundary workflow succeeded. The branch now spans native Tauri/Rust commands and capabilities, browser automation, terminals, model training, MCP/plugin handling, authentication, billing, Stripe/Supabase functions and migrations, voice/phone systems, AI-news deployment, and large UI/media additions. Earlier frontend-CI failures also occurred on predecessor heads. Review of the new free-news worker found a public empty-database ingestion trigger without an explicit single-flight/rate guard and one 500 path that returns raw exception text; deployment is stated as not executed.
- **Potential impact:** Merging the current head would bypass core frontend build/test/release validation across a very large security- and billing-sensitive change set. Untested interactions may cause regressions, authorization failures, billing errors, resource exhaustion, or release breakage. No production deployment or exploit was established.
- **Recommended remediation:** Freeze scope; fix the exact typecheck errors; obtain green frontend typecheck/build/unit/release-manifest, Rust, AI-boundary, backend function, migration, browser, packaged desktop, and native Windows results on one final SHA; run targeted security and billing tests; review every privileged capability and server endpoint; add a single-flight/rate guard and bounded public error responses to the news worker; require reviewer sign-off by subsystem; and do not merge until all release gates are green.

### VS-AUDIT-019 — CI reports unresolved critical/high dependency advisories

- **Severity:** Medium
- **Status:** Open / affected packages and reachability not yet enumerated
- **Source:** GitHub Actions exact-head frontend job log for PR #31
- **First seen:** 2026-08-05 21:02 UTC
- **Last seen:** 2026-08-05 21:02 UTC
- **Affected component:** JavaScript dependency graph installed by the root workflow
- **Immediate owner attention:** Yes, before merge or release
- **Evidence summary:** `npm install` completed with 465 audited packages and reported seven advisories: two critical, four high, and one moderate. The available workflow output did not include package names, advisory identifiers, dependency paths, development/production scope, or fixed versions. This audit therefore does not claim that any advisory is exploitable in VibeSpace.
- **Potential impact:** A vulnerable dependency may be present in the installed graph; actual impact depends on the affected package, reachability, and runtime use.
- **Recommended remediation:** Run a committed-lockfile advisory report on the exact final SHA; capture package names, advisory IDs, dependency paths, production reachability, and fixed versions; update or replace affected dependencies; document justified non-reachable exceptions; and make unresolved critical/high production advisories release-blocking.

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Status:** Open
- **Source:** Gmail label counts and targeted inbox/spam/trash searches
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-05 21:00 UTC
- **Affected component:** Customer-support operations
- **Immediate owner attention:** No, unless customers are already being directed to the current aliases
- **Evidence summary:** The merged Gmail account contains 1,368 unread inbox messages, 67 unread spam messages, and 219 unread trash messages. Review of messages since the previous run found no clear inbound VibeSpace operational request. The exact public support aliases and routing rules remain unverified.
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

### VS-AUDIT-009 — Desktop WebView and application-command authority remain broad

- **Severity:** Medium
- **Status:** Open / hardening review
- **Source:** `app/src-tauri/tauri.conf.json`, capabilities, application commands, and official Tauri capability guidance
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-05 13:00 UTC
- **Affected component:** Tauri asset protocol, native HTTP capability, process/updater capability, local custom-command IPC, and Content Security Policy
- **Immediate owner attention:** No immediate exploit was demonstrated; harden before broader distribution
- **Evidence summary:** The configuration exposes broad local asset roots, multiple external WebView/native HTTP origins, process/updater permissions, multiple windows, and custom local file commands. Their `root` argument can be omitted, allowing absolute paths accessible to the OS user. The external preview surface does not declare remote capability URLs, so this audit did not establish that arbitrary preview content can invoke the file commands. PR #31 materially expands native and browser capability-related code, but its exact frontend gate is failing and a complete privilege review was not feasible in this run.
- **Potential impact:** Compromise of trusted bundled frontend code or a privileged local WebView could expose a broader local-file and system action surface than necessary. A remote-preview-to-IPC exploit was not demonstrated.
- **Recommended remediation:** Define an explicit command allowlist and per-window permissions; separate privileged and unprivileged windows; require a validated project root for every file operation; narrow roots, origins, window assignments, and plugin permissions; and add negative IPC/allowlist regression tests.

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

### VS-AUDIT-014 — Google account sign-in alerts associated with merged administrative identities

- **Severity:** Informational
- **Status:** Open / owner confirmation required; no new related alert identified in this run
- **Source:** Gmail Google Account security and data-sharing notices
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-04 14:49 UTC
- **Affected component:** Administrative Google identities and connected services
- **Immediate owner attention:** Only if the sign-ins were not initiated by the owner
- **Evidence summary:** An earlier Google new-sign-in alert was followed eight minutes later by a Stripe Google-SSO notice, suggesting one owner-initiated session but not proving legitimacy. Two additional alerts later appeared for separate merged identities within one minute of each other. The alerts contained no device, location, IP address, or VibeSpace-specific action evidence.
- **Recommended remediation:** Confirm all events in Google security activity; if any are unrecognized, revoke sessions/connections, change passwords, verify MFA, and inspect connected-service activity.

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

### VS-AUDIT-017 — Google Workspace billing setup was incomplete for a merged support domain

- **Severity:** Medium
- **Status:** Resolved 2026-08-05 20:47 UTC based on a superseding service notice
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen open:** 2026-08-05 13:00 UTC
- **Resolution evidence:** A newer Google Workspace notice for the same AccessRevamp-oriented tenant states that a paid subscription is scheduled to start on September 1, 2026. The prior finding specifically concerned incomplete billing setup and an August 6 retention deadline; the newer notice indicates a paid subscription is now scheduled.
- **Residual limitation:** This audit did not access the Admin Console, verify the payment method, or prove that VibeSpace depends on the tenant. Subscription continuity still depends on successful billing at the scheduled start.

### VS-AUDIT-006 — `main` was failing CI

- **Severity:** High
- **Status:** Resolved 2026-08-02 05:00 UTC
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen open:** 2026-08-01 21:00 UTC
- **Resolution evidence:** PR #30 was merged and the final v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64. Updater signatures were cryptographically verified and publication required all four platform entries.
- **Residual limitation:** No separate combined normal-CI status was exposed for the latest release-hardening commit; resolution is based on the completed cross-platform release build.

---

## Audit run history

### Run: 2026-08-05 21:00 UTC

**Checks completed**

- Gmail: inbox/spam/trash unread counts; all recent messages over the audit interval plus margin; targeted VibeSpace/support/bug/security/billing/payment/refund/dispute/webhook/login/platform searches; direct reading of current and predecessor GitHub CI notices; direct reading of the Google Workspace billing notice; and explicit relevant spam/trash searches. No email, label, or inbox state was changed.
- GitHub: repository metadata; default-branch commits; issues and pull requests updated since the previous run; PR #31, #32, and #33 metadata; PR #31 branch comparison and all changed filenames; exact-head workflow runs, jobs, and frontend logs; predecessor CI notices; selected new AI-news worker/setup files; selected Supabase migrations/configuration/Stripe-webhook code; and current audit-log state. No repository object other than this Markdown log was changed.
- Supabase: attempted Security Advisor and API-log reads for project `vbkkimvedmklebghtkzs`. Both were blocked by interactive-authentication requirements; no live state was modified.
- Stripe: attempted connected-account read. It was blocked by interactive-authentication requirements; no Stripe object was modified.

**New findings:** VS-AUDIT-019.

**Changed findings:** VS-AUDIT-001 and VS-AUDIT-012 received new draft-migration evidence; VS-AUDIT-007 received current Gmail evidence; VS-AUDIT-013 increased from Medium to High after the branch expanded to 1,232 files and exact-head CI failed.

**Resolved findings:** VS-AUDIT-017, based on a superseding Workspace notice that a paid subscription is scheduled.

**Observed healthy controls**

- No application-code change landed on `main` after the previous run.
- PR #31 remains draft and unmerged, is zero commits behind current `main`, and its Rust check and deterministic AI-boundary evaluation succeeded.
- PR #33's exact head has a successful CI run and remains a draft standalone prototype.
- The reviewed draft profile migration introduces owner-bound policies and a column-level profile update grant, although it does not yet remove the known broad policies.
- The reviewed Stripe webhook draft includes raw-body signature verification design, body bounds, server-side price classification, idempotency handling, and bounded public error codes in the reviewed paths. This was code inspection only; deployment and live webhook behavior were not tested.
- No clear new VibeSpace customer operational email was identified.

**Limitations and blind spots**

- Supabase live state, advisors, logs, policies, grants, functions, migrations, storage, realtime, SQL state, and performance could not be refreshed. Critical/high findings remain based on the last successful live validation at 2026-08-02 21:00 UTC.
- Stripe account identity, account health, payments, customers, products, prices, subscriptions, invoices, refunds, disputes, events, and webhooks could not be refreshed.
- PR #31 now changes 1,232 files. This run reviewed metadata, complete filename inventory, exact-head CI, and selected high-risk files but could not line-review or dynamically execute the entire branch.
- The exact dependency packages and advisory identifiers were not present in the CI output; no exploitability conclusion was made.
- Direct GitHub secret-scanning, Dependabot, code-scanning, branch-protection/ruleset, and discussion enumeration were not exposed by the connector.
- The updater inference was not validated with a packaged desktop client.
- Browserbase was unavailable because its connected quota was exhausted, and the local environment could not resolve public network names.
- Gmail support routing cannot be proven until exact public aliases are confirmed and tested. Search semantics, merged-account volume, and connector result limits constrain completeness.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

### Run: 2026-08-05 13:00 UTC

**Checks completed**

- Gmail: inbox/spam/trash unread counts; recent VibeSpace-name search; targeted support/bug/security/billing/payment/refund/webhook/login terms; platform-sender search; and explicit relevant spam/trash search since the previous run. No email or inbox state was changed.
- GitHub: repository metadata; latest default-branch commits; issue/PR activity since the previous run; PR #31 metadata, branch divergence, exact-head workflow/status checks, and comments; updater configuration, release channel, v1.5.0 publication gate, updater initialization, Tauri capability configuration, preview isolation, custom file-command implementation, and frontend/Rust dependency manifests; plus indexed searches for selected secret, injection, dynamic-code, and process-execution patterns. No repository object other than this Markdown log was changed.
- Supabase: attempted Security Advisor read. It was blocked by interactive-authentication requirements; no live state was modified.
- Stripe: attempted connected-account read. It was blocked by interactive-authentication requirements; no Stripe object was modified.

**New findings:** VS-AUDIT-018.

**Changed findings:** VS-AUDIT-005, VS-AUDIT-007, VS-AUDIT-009, and VS-AUDIT-013 received current evidence. Supabase- and Stripe-backed findings were explicitly left at their last successful validation timestamps.

**Resolved findings:** None.

**Observed healthy controls**

- No application-code commit landed on `main` after the previous audit.
- PR #31 remains draft and unmerged.
- No workflow run or combined status exists for PR #31's exact head.
- Current indexed repository searches returned no literal selected secret prefixes/key names or selected injection/dynamic-code patterns.
- No issue or PR activity occurred after the previous run.
- The external preview window has no configured remote capability URL, so remote preview pages are not granted Tauri API access by default.
- No clear new VibeSpace customer support, billing, refund, login, payment, security, or bug email was identified.

**Limitations and blind spots**

- The updater failure inference was not validated by running a packaged desktop client against the configured endpoint chain.
- Supabase live state, logs, policies, functions, advisors, migrations, storage, realtime, and payment runtime could not be refreshed. Critical/high target-project findings remain based on 2026-08-02 21:00 UTC evidence.
- Stripe account identity, objects, events, disputes, refunds, payments, products, prices, subscriptions, invoices, webhooks, and account health could not be refreshed.
- Direct GitHub secret-scanning alerts, dependency alerts, code-scanning alerts, branch protection/rulesets, and repository discussions were not exposed by the connector. Indexed search results cannot clear historical alerts or replace dedicated scanners.
- PR #31 changes 59 files. This run reviewed metadata, branch divergence, changed-file inventory, exact-head status, and comments but did not dynamically execute the branch.
- The codebase could not be cloned into the local audit environment because outbound network name resolution was unavailable, and Browserbase had exhausted its available browser minutes.
- Gmail support routing cannot be proven until exact public aliases are confirmed and tested.
- Log-retention windows, Gmail search semantics, and connector result limits constrain historical completeness.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

### Run: 2026-08-05 05:00 UTC

**Checks completed**

- Gmail: inbox/spam/trash unread counts; complete recent-message review with an eight-hour interval plus margin; targeted VibeSpace support/bug/security/billing/payment/refund/login searches; platform-account alert search; and explicit relevant spam/trash searches. No email or inbox state was changed.
- GitHub: repository metadata; latest default-branch commits; activity since the previous run; PR #31 metadata, branch divergence, exact-head workflow/status checks, comments, and changed-file inventory; current Tauri security/capability configuration; frontend and Rust dependency manifests; and indexed searches for selected secret, injection, dynamic-code, and CORS patterns. No repository object other than this Markdown log was changed.
- Supabase: attempted Security Advisor, Edge Function, and API-log reads. All were blocked by interactive-authentication requirements.
- Stripe: attempted connected-account read. It was blocked by interactive-authentication requirements.

**New findings:** None.

**Changed findings:** VS-AUDIT-005, VS-AUDIT-007, VS-AUDIT-009, and VS-AUDIT-013 received current evidence. Supabase- and Stripe-backed findings were explicitly left at their last successful validation timestamps.

**Resolved findings:** None.

**Observed healthy controls**

- No application-code commit landed on `main` after the previous audit.
- PR #31 remains draft and unmerged.
- No workflow run or combined status exists for PR #31's exact head.
- Current indexed repository searches returned no literal selected secret prefixes/key names or selected injection/CORS patterns.
- No issue or PR activity occurred after the previous run.
- No clear new VibeSpace customer support, billing, refund, login, payment, security, or bug email was identified.
- Relevant spam and trash searches returned no recent matches.

**Limitations and blind spots**

- Supabase live state, logs, policies, functions, advisors, migrations, storage, realtime, and payment runtime could not be refreshed. Critical/high target-project findings remain based on 2026-08-02 21:00 UTC evidence.
- Stripe account identity, objects, events, disputes, refunds, payments, products, prices, subscriptions, invoices, webhooks, and account health could not be refreshed.
- Direct GitHub secret-scanning alerts, dependency alerts, code-scanning alerts, branch protection/rulesets, repository discussions, and a complete repository-tree listing were not exposed by the connector. Indexed search results cannot clear historical alerts or replace dedicated scanners.
- PR #31 changes 59 files. This run reviewed metadata, branch divergence, changed-file inventory, exact-head status, and comments but did not dynamically execute the branch.
- The codebase could not be cloned into the local audit environment because outbound network name resolution was unavailable.
- Gmail support routing cannot be proven until exact public aliases are confirmed and tested.
- Log-retention windows, Gmail search semantics, and connector result limits constrain historical completeness.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

### Run: 2026-08-04 21:00 UTC

**Checks completed**

- Gmail: inbox/spam/trash unread counts; VibeSpace-specific search; broad recent operational-term review; payment/platform/account-security search; direct reading of relevant Supabase, Stripe, Google Account, and Google Workspace notifications; and explicit relevant spam/trash searches over the previous nine hours. No email or inbox state was changed.
- GitHub: public repository metadata; latest default-branch commits; recent issue/PR activity; PR #31 metadata, branch divergence, exact-head workflow/status checks, comments, and changed-file inventory; current Tauri security configuration; application dependency manifests; and indexed searches for selected secret, HTML-injection, and CORS-header patterns. No repository object other than this Markdown log was changed.
- Supabase: attempted Security Advisor and Edge Function reads. Both were blocked by interactive-authentication requirements.
- Stripe: attempted connected-account read. It was blocked by interactive-authentication requirements.

**New findings:** VS-AUDIT-016 and VS-AUDIT-017.

**Changed findings:** VS-AUDIT-004, VS-AUDIT-007, VS-AUDIT-013, and VS-AUDIT-014 received current evidence. VS-AUDIT-005 and VS-AUDIT-009 received current GitHub evidence. Supabase- and Stripe-backed findings were explicitly left at their last successful validation timestamps.

**Resolved findings:** None.

**Observed healthy controls**

- No application-code commit landed on `main` after the previous audit.
- PR #31 remains draft and unmerged.
- No workflow run or combined status exists for PR #31's exact head.
- Current indexed repository searches found no literal selected secret prefixes or key names and no `dangerouslySetInnerHTML` or explicit `Access-Control-Allow-Origin` match.
- No open standalone VibeSpace issue was identified; the only current VibeSpace item returned by the recent-issue feed was draft PR #31.
- No clear new VibeSpace customer support, billing, refund, login, payment, or bug email was identified.
- Relevant spam and trash searches returned no recent matches.

**Limitations and blind spots**

- Supabase live state, logs, policies, functions, advisors, migrations, storage, realtime, and payment runtime could not be refreshed. Critical/high target-project findings remain based on 2026-08-02 21:00 UTC evidence.
- The newly reported different-project Supabase warning could not be independently validated, and the affected table was not named in the email.
- Stripe account identity, objects, events, disputes, refunds, payments, products, prices, subscriptions, invoices, and webhooks could not be refreshed.
- Direct GitHub secret-scanning alert enumeration, dependency alerts, code-scanning alerts, branch protection/rulesets, and repository discussions were not exposed by the connector. Current code search cannot clear a historical alert or repository history.
- PR #31 changes 59 files. This run reviewed metadata, branch divergence, changed-file inventory, exact-head status, and comments but did not dynamically execute the branch.
- Gmail support routing cannot be proven until exact public aliases are confirmed and tested.
- Log-retention windows, Gmail search semantics, and connector result limits constrain historical completeness.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

### Run: 2026-08-04 13:00 UTC

- **New findings:** None.
- PR #31 remained draft, 37 commits ahead and seven behind `main`, with no exact-head workflow run and a mismatch between bot-reported taskbar implementation and current branch contents.
- Gmail showed 1,315 unread inbox messages, 60 unread spam messages, and 219 unread trash messages.
- Supabase and Stripe live reads were blocked.
- **Remediation performed:** None; only this audit file was updated.

### Run: 2026-08-04 05:00 UTC

- **New findings:** None.
- PR #31 remained draft, 37 commits ahead and six behind `main`, with no exact-head workflow run.
- Gmail showed 1,309 unread inbox messages, 59 unread spam messages, and 219 unread trash messages.
- Supabase and Stripe live reads were blocked.
- **Remediation performed:** None; only this audit file was updated.

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
- PR #31 was 37 commits ahead and three behind with no exact-head workflow run.
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