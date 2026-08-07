# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Stripe objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data.

## Current status

Last completed audit: **2026-08-07 05:06 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 7 |
| Low | 0 |
| Informational | 3 |
| Resolved history | 2 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live Supabase check found that a verified authenticated session could update any `profiles` row without proving ownership.
2. **VS-AUDIT-001 — Critical:** The last successful live Supabase check found nine broad verified-session `SELECT` policies that did not enforce row ownership.
3. **VS-AUDIT-018 — High:** The shipped desktop updater's first endpoint still serves a stale, incomplete, unsigned manifest and may prevent the valid fallback manifest from being reached.
4. **VS-AUDIT-016 — High:** Supabase reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact is unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
6. **VS-AUDIT-003 — High:** The connected Supabase project appeared AccessRevamp-oriented rather than clearly being the authoritative VibeSpace backend.
7. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment catalog/runtime were mismatched at the last successful live check.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved.
9. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft; its current exact head has no workflow run or combined status returned by the connector and must not be merged or deployed yet.
10. **VS-AUDIT-021 — Medium:** The current `main` commit has a failed frontend CI run: Vitest failed and release-manifest validation was skipped. Immediate attention is required before merge or release.
11. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain is now suspended for incomplete billing setup. VibeSpace dependency is unconfirmed; owner attention is required if VibeSpace support or operations depend on that tenant.
12. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Google/Stripe and Vercel administrative sign-ins still require owner confirmation if they were not recognized.

## Current run summary

### Checks completed

- **GitHub:** fetched this audit file before writing; reviewed the default branch, recent commits, issues and pull requests updated since the previous interval, PR #31 metadata and direct branch comparison, the PR's current exact-head workflow/status state, PR conversation data available through the connector, the current `main` workflow failure, updater configuration/manifest, Supabase auth configuration, selected high-risk CORS/rendering patterns, and selected literal Stripe/Supabase secret patterns.
- **Gmail:** reviewed current inbox/spam/trash counts and searched the audit interval plus a margin for VibeSpace support, bug, crash, security, billing, payment, refund, dispute, invoice, subscription, webhook, deployment, Supabase, Stripe, GitHub, Vercel, and account-access signals. Relevant spam/trash searches were included. A new Google Workspace suspension notice was reviewed as untrusted evidence. No message, label, or inbox state was changed.
- **Supabase:** attempted a live Security Advisor read for project `vbkkimvedmklebghtkzs`; the connector required interactive authentication, so live advisors, policies, logs, database state, migrations, storage/realtime state, and Edge Functions could not be refreshed.
- **Stripe:** the connected Stripe surface exposed in this runtime consisted of write-capable operations rather than read-only account/payment/dispute/webhook health reads. Under the audit's read-only constraint, none of those operations were invoked.

### New findings

- **VS-AUDIT-021 — Medium:** GitHub Actions run `31104440221` for the current `main` commit `c253f0ca0c6d09dea9e915b1f5a36b85768e256a` failed its frontend job. Checkout, Node setup, dependency installation, TypeScript checking, and the Vite build succeeded; Vitest failed; release-manifest validation was skipped as a consequence. Rust `cargo check` succeeded. The commit changed only this audit Markdown file, so the evidence does **not** establish an application-code regression. No later successful run for this exact `main` commit could be confirmed through the connector.

### Changed findings

- **VS-AUDIT-013:** PR #31 moved to exact head `9c319686ab6e8e869a1e49aff83be4d3a1941f8d`, remains open and draft, and current GitHub PR metadata still reports **1,305 changed files**, **144,203 additions**, and **7,863 deletions**. A fresh direct comparison reports **130 commits ahead and two behind `main`**. The connector returned **no workflow runs and no combined status entries for the current exact head**, so the prior green exact-head evidence applies only to an older PR head and is superseded for release-readiness purposes. The High finding remains open.
- **VS-AUDIT-018:** Revalidated on `main`: Tauri remains version `1.5.0`; the first configured updater endpoint remains `releases/channel.json`; that manifest still advertises `0.1.48`, only Windows x64, and no artifact signature. No shipped fix was found.
- **VS-AUDIT-020:** Revalidated repository configuration: `minimum_password_length = 6`, no password composition requirement, and `secure_password_change = false` remain present. Hosted applicability is still unverified.
- **VS-AUDIT-007:** Gmail now reports **1,394 unread inbox messages**, **71 unread spam messages**, and **219 unread trash messages**. No clear new VibeSpace customer support, payment, refund, dispute, webhook, login, security, or bug report was identified.
- **VS-AUDIT-017:** Reopened. A later Google notice states that the Google Workspace Business Starter subscription for the merged AccessRevamp-oriented support domain is now **suspended** because billing setup was incomplete, superseding the prior notice that a paid subscription would begin September 1. The notice warns that access/data may be lost if billing is not restored within its stated grace period. Direct VibeSpace dependency remains unconfirmed.

### Resolved findings

- **None.** Existing findings were not marked resolved without direct evidence.

### Connector failures and blind spots

- Supabase live policies, grants, schema state, advisors, SQL/migrations, API/auth/Postgres/Edge Function/storage/realtime logs, database performance, and deployed functions could not be refreshed because interactive authentication was required. Critical and High Supabase-backed findings retain their latest successful live validation timestamp of **2026-08-02 21:00 UTC**.
- Stripe account identity, account health, payments, customers, products, prices, subscriptions, invoices, refunds, disputes, events, suspicious-activity signals, and webhook health could not be refreshed because the currently exposed Stripe connector functions were write-capable and were not invoked under the read-only constraint.
- The GitHub connector exposed the failed CI step state for run `31104440221` but did not provide the failing Vitest assertion/log content in the successful reads available this run. A later successful rerun for the same `main` SHA could not be confirmed.
- GitHub direct secret-scanning alert inventory, Dependabot alerts, branch-protection/ruleset details, repository security settings, and all discussion surfaces were not fully exposed by the available connector. Selected literal searches found no `sk_live_` or `whsec_` results; `SUPABASE_SERVICE_ROLE_KEY` searches returned references rather than an established secret value. This does not clear repository history or the historical push-protection event.
- PR #31 is too large for a complete line-by-line or dynamic review in one run. The absence of exact-head CI plus the branch's scope means packaged desktop, native Windows, migration-against-live-schema, end-to-end billing, browser, deployment, rollback, and adversarial authorization validation remain necessary.
- Gmail merged-account volume, search semantics, connector result limits, and unverified support aliases constrain completeness. The Workspace suspension concerns an AccessRevamp-oriented domain; no evidence established that VibeSpace depends on it.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update any customer profile

- **Severity:** Critical
- **Source:** Supabase live RLS policies/profile schema; draft migrations `0037`–`0039`
- **Evidence summary:** The last successful live check found `profiles_verified_session_update` using only `accessrevamp_session_is_verified()` in `USING` and `WITH CHECK`, without row ownership. Draft branch migrations appeared designed to replace profile policies with owner-scoped policies and narrow ordinary profile updates, but they remain unmerged and unverified against the connected live project. No cross-account write was attempted.
- **First seen:** 2026-08-02 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting code evidence:** 2026-08-06 05:15 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Customer identity/contact/status/address/notes/marketing and Stripe-customer linkage in `profiles`
- **Recommended remediation:** Explicitly drop every broad profile policy by exact name; create owner-only policies; restrict ordinary-user column grants; reserve operational/payment fields for trusted server roles; test the complete migration chain against the actual schema with two-account negative tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Source:** Supabase live policies/grants; draft migrations `0037`–`0039`
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on customer/project/order/entitlement/delivery/design/workflow/update/refund tables accepted only verified-session state and did not require ownership. Draft migration `0039` appeared designed to replace these reads with owner-scoped policies, but it remains unmerged and was not applied or tested against the live project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting code evidence:** 2026-08-06 05:15 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Authorization boundary for profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Recommended remediation:** Explicitly remove all session-only policies; require direct ownership or tightly scoped staff roles; validate every policy referencing `accessrevamp_session_is_verified()`; run two-account negative tests and policy inventory checks after deployment.
- **Immediate owner attention:** Yes

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and invalid

- **Severity:** High
- **Source:** `app/src-tauri/tauri.conf.json`, `releases/channel.json`, release workflow, updater initialization, and Tauri updater behavior
- **Evidence summary:** On `main`, the first updater endpoint serves version `0.1.48`, only a Windows entry, and no artifact signature, while the application is configured as `1.5.0`. A successful response containing an invalid manifest is likely to stop the check before a valid fallback. Draft branch changes previously appeared to address this, but no packaged-client validation was performed and no fix is shipped.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open; strongly supported configuration inference, draft fix unmerged
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Remove or atomically replace the legacy endpoint; validate the exact first configured manifest in the release gate; require all supported targets/URLs/signatures; add packaged updater smoke tests before publication.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — Supabase reported an RLS-disabled public table in a different project

- **Severity:** High
- **Source:** Gmail Supabase Security Advisor notification
- **Evidence summary:** Supabase reported `rls_disabled_in_public` and warned that a public-schema table could be read, edited, or deleted by anyone with the project URL. The project reference did not match the specified VibeSpace project, and the email did not identify the table. Direct VibeSpace impact is unconfirmed.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-04 16:26 UTC
- **Status:** Open; owner validation required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Open the project directly from Supabase, identify the table, determine whether public access is intentional, enable/test RLS if not, and document whether VibeSpace shares data or dependencies with it.
- **Immediate owner attention:** Yes

### VS-AUDIT-002 — Refund-request insertion is not bound to the signed-in owner

- **Severity:** High
- **Source:** Supabase live RLS policies/grants; draft migration `0039`
- **Evidence summary:** The last live check found an owner-bound insert policy plus a second permissive policy checking only verified-session state. PostgreSQL permissive policies combine with OR semantics. Draft migration `0039` appeared designed to replace refund policies with owner-scoped checks, but it remains unmerged and live state is unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting code evidence:** 2026-08-06 05:15 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Refund-request integrity
- **Recommended remediation:** Remove every broad insert policy; require `user_id = auth.uid()` and an ownership-checked eligible order in RLS and server-side validation; test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase project does not clearly appear to be the VibeSpace backend

- **Severity:** High
- **Source:** Supabase schema, logs, deployed Edge Functions, and project naming observed during the last successful live check
- **Evidence summary:** The connected project was dominated by AccessRevamp-oriented tables/activity, and the only visible deployed Edge Function was `accessrevamp-runtime-health`; no clearly VibeSpace-specific production backend was visible.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; authoritative environment confirmation required
- **Affected component:** Audit coverage, deployment assurance, and environment isolation
- **Recommended remediation:** Confirm and document the authoritative VibeSpace project reference. If co-tenancy is intentional, document and harden isolation boundaries and audit the actual deployed VibeSpace schema/functions.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty

- **Severity:** High
- **Source:** Stripe live reads, Supabase payment/catalog/runtime records, and Gmail Stripe account notifications
- **Evidence summary:** At the last successful live check, the specified Stripe account contained no checked payments, sessions, charges, catalog, subscriptions, invoices, refunds, disputes, or webhook endpoints, while Supabase recorded six catalog rows, checkout enabled, four order drafts, zero processed Stripe events, and an open webhook-failure incident. Gmail later referenced a different Stripe account, confirming multiple accounts exist but not which one VibeSpace uses.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Last supporting evidence:** 2026-08-04 15:10 UTC
- **Status:** Open; Stripe and Supabase live state could not be refreshed
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Recommended remediation:** Inventory accounts; identify the authoritative account from deployed configuration without exposing secrets; reconcile prices/catalog; verify webhook endpoint/signing secret; complete a safe test-mode end-to-end purchase and fulfillment test.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern

- **Severity:** High
- **Source:** GitHub secret-scanning notification and repository searches
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Current selected literal searches did not find obvious live-key or webhook-secret prefixes, but that does not prove the historical value was synthetic, removed from history, or revoked.
- **First seen:** 2026-08-01 20:01 UTC
- **Last reviewed:** 2026-08-07 05:06 UTC
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the alert directly; prove the value synthetic or rotate/revoke it; replace key-shaped fixtures; inspect history and forks/caches; close the alert only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge or deploy

- **Severity:** High
- **Source:** GitHub PR metadata, direct branch comparison, exact-head workflow/status reads, comments, changed-file inventory, and selected code review
- **Evidence summary:** PR #31 is an open draft at `9c319686ab6e8e869a1e49aff83be4d3a1941f8d`. Current GitHub metadata reports 1,305 changed files, 144,203 additions, and 7,863 deletions; a direct comparison reports 130 commits ahead and two behind `main`. Previous PR heads had green CI, but for the **current exact head** the connector returned no workflow runs and no combined status entries. The branch spans authentication, billing, Stripe/Supabase functions and migrations, Tauri/native capabilities, browser/terminal automation, AI/model/training, voice/phone, MCP/plugin handling, news ingestion, and extensive UI/media. There is still no packaged desktop, native Windows, live migration, end-to-end billing, deployment, authorization-adversarial, rollback, or complete subsystem review evidence.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open; unmerged draft; current exact head lacks returned CI/status evidence
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze scope; synchronize with `main`; split or review by subsystem; require independent security/billing/native reviews; run migrations against a production-like schema; execute two-account authorization tests, Stripe test-mode flows, packaged Windows/macOS/Linux tests, browser/deployment tests, rollback tests, and final gates on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-021 — Current `main` frontend CI fails at Vitest

- **Severity:** Medium
- **Source:** GitHub Actions run `31104440221`, job `92625845088`, current `main` commit `c253f0ca0c6d09dea9e915b1f5a36b85768e256a`
- **Evidence summary:** The frontend job completed checkout, Node setup, dependency installation, TypeScript checking, and Vite build successfully, then failed at `Test (vitest)`. `Test release manifest` was skipped. The Rust job in the same run passed `cargo check`. The `main` commit changed only the operational audit Markdown file, so this does not establish an application-code regression. The connector did not expose the exact failing Vitest assertion in the successful reads available this run, and no later successful run for the same SHA was confirmed.
- **First seen:** 2026-08-07 05:06 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open; default-branch quality/release gate is red or otherwise unverified
- **Affected component:** Default-branch frontend CI, automated test assurance, and release-manifest gate
- **Recommended remediation:** Identify and reproduce the failing Vitest case; determine whether the failure is deterministic, environment-related, or flaky; rerun on the exact `main` SHA; require Vitest and release-manifest validation to complete successfully before any merge or release decision.
- **Immediate owner attention:** Yes, before merge or release

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended

- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A new Google notice states that the Google Workspace Business Starter subscription associated with the merged AccessRevamp-oriented support domain has been suspended because billing setup was not completed. This supersedes the earlier notice that a paid subscription would begin September 1. The notice states that access may already be lost and warns of cancellation/data loss if billing is not restored within the stated grace period. No evidence established that VibeSpace currently depends on this Workspace tenant.
- **First seen:** 2026-08-04 20:47 UTC
- **Reopened:** 2026-08-07 02:51 UTC
- **Last seen:** 2026-08-07 02:51 UTC
- **Status:** Open/reopened; suspension confirmed for the merged support tenant, VibeSpace relevance unconfirmed
- **Affected component:** Google Workspace/mailbox availability for an AccessRevamp-oriented administrative/support domain; VibeSpace dependency unknown
- **Recommended remediation:** Determine whether any VibeSpace support, administrative identity, recovery path, or operational mailbox relies on this tenant. If it does, restore billing/access through the Workspace owner and verify mailbox/data continuity. Keep VibeSpace and unrelated tenant dependencies documented and isolated.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password and password-change defaults in Supabase configuration

- **Severity:** Medium
- **Source:** Repository `supabase/config.toml` on `main`
- **Evidence summary:** The configuration sets `minimum_password_length = 6`, leaves `password_requirements` empty, and sets `secure_password_change = false`. Email confirmation and refresh-token rotation are enabled, and manual account linking is disabled. The audit could not verify whether the hosted target project uses these exact settings, so this is a deployment-configuration risk rather than a claim about live accounts.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy and account-change protection
- **Recommended remediation:** Adopt a stronger passphrase-aligned minimum, enable recent reauthentication for password changes, configure leaked-password protection, deploy through controlled configuration, and verify hosted settings and reset/change flows.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Source:** Gmail label counts and targeted inbox/spam/trash searches
- **Evidence summary:** The merged inbox currently has 1,394 unread inbox messages, 71 unread spam messages, and 219 unread trash messages. No clear new VibeSpace operational request was found, but exact public support aliases, routing rules, and queue ownership remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm the public support address with a controlled external delivery test and route it to a dedicated VibeSpace queue with ownership, response state, and SLA tracking.
- **Immediate owner attention:** No, unless customers are already directed to unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled

- **Severity:** Medium
- **Source:** Supabase Security Advisor
- **Evidence summary:** The last successful live Security Advisor check reported `auth_leaked_password_protection` disabled.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Password authentication
- **Recommended remediation:** Enable leaked-password protection, strengthen password policy, and verify reset/change reauthentication behavior.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView and native-command authority remain broad

- **Severity:** Medium
- **Source:** Tauri configuration/capabilities, custom commands, application windows, and selected PR #31 native/browser changes
- **Evidence summary:** The application exposes broad local asset roots, multiple external WebView/native HTTP origins, process/updater permissions, multiple windows, and custom local file commands. An exploit path from arbitrary remote preview content to privileged IPC was not demonstrated. PR #31 expands native/browser capability code, increasing review requirements.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-07 05:06 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset protocol, native HTTP/process/updater permissions, local IPC, file access, and CSP/window isolation
- **Recommended remediation:** Use explicit command allowlists and per-window capabilities; separate privileged/unprivileged windows; require validated project roots; narrow roots/origins/plugin permissions; add negative IPC and capability tests.
- **Immediate owner attention:** No immediate exploit was established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs

- **Severity:** Medium
- **Source:** Supabase API logs
- **Evidence summary:** Suppression-list requests placed batches of email addresses in URL query parameters, causing API logs to retain them. The traffic appeared AccessRevamp-related rather than clearly VibeSpace-related.
- **First seen:** 2026-08-02 05:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Privacy, logging, suppression-list processing, and observability access
- **Recommended remediation:** Move address data to a bounded server-side body/RPC flow or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure was demonstrated

### VS-AUDIT-014 — Google/Stripe sign-in alerts associated with merged administrative identities

- **Severity:** Informational
- **Source:** Gmail Google Account security and Stripe SSO notices
- **Evidence summary:** Several Google new-sign-in alerts and a closely timed Stripe Google-SSO notice were observed. Timing suggests some may be owner-initiated, but legitimacy is not proven. No device/IP/location details or VibeSpace-specific action evidence were available.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-04 14:49 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Administrative Google identities and connected services
- **Recommended remediation:** Confirm events in Google/Stripe security activity; revoke unknown sessions/connections; rotate credentials and verify MFA if any event is unrecognized.
- **Immediate owner attention:** Only if unrecognized

### VS-AUDIT-015 — New Vercel administrative sign-in

- **Severity:** Informational
- **Source:** Gmail Vercel security notification
- **Evidence summary:** Vercel reported a sign-in from a new location, device, or browser. The alert did not establish unauthorized access or a VibeSpace-specific action.
- **First seen:** 2026-08-03 20:25 UTC
- **Last seen:** 2026-08-03 20:25 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Vercel administrative/deployment account; direct VibeSpace relevance unconfirmed
- **Recommended remediation:** Confirm the event in Vercel activity; revoke unknown sessions/tokens; ensure MFA is enabled.
- **Immediate owner attention:** Only if unrecognized

### VS-AUDIT-010 — Database index advisory signals require observation

- **Severity:** Informational
- **Source:** Supabase Performance Advisor
- **Evidence summary:** The last successful advisor check reported unused and duplicate-index signals. The database was young and some tables had little traffic, so the signal alone did not justify index deletion.
- **First seen:** 2026-08-01 21:00 UTC
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; observe, not revalidated
- **Affected component:** PostgreSQL maintenance and write overhead
- **Recommended remediation:** Observe representative query statistics and remove/consolidate an index only after proving it redundant and not required by constraints or expected queries.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-019 — Exact-head CI reported critical/high dependency advisories

- **Severity:** Medium
- **First seen:** 2026-08-05 21:02 UTC
- **Resolved:** 2026-08-06 05:10 UTC
- **Resolution evidence:** The then-current PR #31 exact-head frontend job completed dependency review and `npm audit` successfully before lint, TypeScript, build, Vitest, and release-manifest validation also passed.
- **Residual limitation:** This resolves the prior branch-head advisory signal only. It is not a guarantee against future, transitive, non-JavaScript, runtime, or newly disclosed dependency risks. The current PR head has no workflow/status evidence returned by the connector.

### VS-AUDIT-006 — `main` was failing CI

- **Severity:** High
- **First seen:** 2026-07-31 22:47 UTC
- **Resolved:** 2026-08-02 05:00 UTC
- **Resolution evidence:** PR #30 was merged and the v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64, including updater-signature verification and a four-platform publication gate.
- **Residual limitation:** A separate new `main` CI failure is tracked as **VS-AUDIT-021**; that does not retroactively invalidate the evidence that resolved this older release-era failure.

---

## Finding and run history

| Date (UTC) | Material audit history |
|---|---|
| 2026-07-31 22:47 | VS-AUDIT-006 opened for failing `main` CI. |
| 2026-08-01 21:00 | Initial deep audit established VS-AUDIT-001 through VS-AUDIT-005 and VS-AUDIT-007 through VS-AUDIT-010; live Supabase/Stripe/Gmail/GitHub coverage recorded. |
| 2026-08-02 05:00 | VS-AUDIT-006 resolved after successful release validation; VS-AUDIT-011 opened for PII in logged request URLs. |
| 2026-08-02 21:00 | VS-AUDIT-012 opened for cross-profile updates; this remains the latest successful live Supabase/Stripe validation point. |
| 2026-08-03 03:06 | VS-AUDIT-014 opened for merged-account Google/Stripe sign-in alerts. |
| 2026-08-03 20:25 | VS-AUDIT-015 opened for a Vercel administrative sign-in alert. |
| 2026-08-04 16:26 | VS-AUDIT-016 opened for an RLS-disabled public table alert in another Supabase project. |
| 2026-08-04 20:47 | VS-AUDIT-017 opened for incomplete Google Workspace billing. |
| 2026-08-05 13:00 | VS-AUDIT-018 opened for the stale/invalid primary updater endpoint. |
| 2026-08-05 21:00 | VS-AUDIT-013 raised to High after PR #31 expanded massively and failed exact-head frontend validation; VS-AUDIT-019 opened for dependency advisories; VS-AUDIT-017 resolved by a superseding billing notice. |
| 2026-08-06 05:15 | PR #31 exact-head CI/CodeQL became green but branch remained extremely large and High risk; draft authorization migrations improved; VS-AUDIT-019 resolved; VS-AUDIT-020 opened for weak auth defaults. Supabase and Stripe remained blocked by interactive authentication. |
| 2026-08-06 13:00 | No new findings or resolutions. PR #31 head and successful exact-head workflows were unchanged; refreshed metadata reported 1,305 files, 144,203 additions, 7,863 deletions, and a direct comparison of 130 ahead/one behind. No application-code commit reached `main`. Gmail counts changed to 1,379/70/219. Supabase and Stripe remained unavailable for live refresh. |
| 2026-08-07 05:06 | VS-AUDIT-021 opened after current `main` CI failed at Vitest and skipped release-manifest validation; Rust passed and the commit changed only the audit log, so no application regression was claimed. PR #31 moved to `9c319686ab6e8e869a1e49aff83be4d3a1941f8d`, 130 ahead/two behind, with no exact-head workflows or combined statuses returned. VS-AUDIT-017 reopened after Google reported the merged AccessRevamp-oriented Workspace subscription suspended for incomplete billing setup; VibeSpace dependency remains unconfirmed. Gmail counts changed to 1,394/71/219. Supabase required interactive authentication, and no Stripe write-capable action was invoked. |

Every run was read-only except for maintaining this file. No application, repository, database, Supabase, Stripe, or Gmail remediation has been performed by the audit automation.