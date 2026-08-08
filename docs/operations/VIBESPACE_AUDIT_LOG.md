# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-08 13:15 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 9 |
| Low | 0 |
| Informational | 3 |
| Resolved history | 3 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live Supabase check found that a verified authenticated session could update any `profiles` row without proving ownership.
2. **VS-AUDIT-001 — Critical:** The last successful live Supabase check found nine broad verified-session `SELECT` policies that did not enforce row ownership.
3. **VS-AUDIT-018 — High:** The shipped desktop updater's first endpoint remains stale/incomplete on unchanged `main` and may prevent reliable update delivery.
4. **VS-AUDIT-016 — High:** Supabase previously reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact remains unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
6. **VS-AUDIT-003 — High:** The connected Supabase project appeared AccessRevamp-oriented rather than clearly being the authoritative VibeSpace backend.
7. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment catalog/runtime were mismatched at the last successful live check.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved.
9. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft and its current exact-head CI is not yet complete.
10. **VS-AUDIT-024 — Medium:** PR #31 added three native browser-chat commands without updating the frozen native command-authority test, while default CI runs `cargo check` but no Rust tests. Address before merge.
11. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain is suspended for incomplete billing setup. VibeSpace dependency is unconfirmed; owner attention is required if VibeSpace support or operations depend on that tenant.
12. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Google/Stripe and Vercel administrative sign-ins still require owner confirmation if they were not recognized.

## Current run summary

### Checks completed

- **GitHub:** fetched the existing audit file before the audit and re-fetched its current blob SHA immediately before writing. Reviewed default-branch commits since the prior run, issues and pull requests updated in the interval, PR #31 metadata and its 11-commit delta, exact-head Actions/job state, PR comments/reviews/threads exposed by the connector, selected new native/browser/model-foundry/chat changes, default CI configuration, Rust dependency locking, secret-pattern searches, and current media-limit code. No application-code commit reached `main` since the prior run; the only new `main` commit before this audit was the previous audit-log update.
- **Gmail:** searched the interval and current merged inbox for VibeSpace/support/bug/crash/security/billing/payment/refund/dispute/webhook/Stripe/Supabase/login signals and searched relevant spam/trash. No clear new VibeSpace customer support, billing, payment, refund, dispute, webhook, login, security, or bug incident was identified. One GitHub notification reported a failed CI run on a superseded PR #31 head. No message, label, or inbox state was changed.
- **Supabase:** attempted live Security Advisor, Performance Advisor, and API-log access for project `vbkkimvedmklebghtkzs`. Interactive authorization was required, so current advisors/logs/RLS/schema/database/function/storage/realtime state could not be refreshed. No Supabase write was invoked.
- **Stripe:** attempted live account information and read-API discovery. Interactive authorization was required, so current payments/refunds/disputes/subscriptions/invoices/webhooks/account health could not be refreshed. No Stripe write was invoked.

### New findings

- **VS-AUDIT-024 — Medium:** PR #31's current `run_ordinary` native handler registers `browser_chat_surface_open`, `browser_chat_surface_hide`, and `browser_chat_surface_hide_all` immediately after `refresh_app_branding`, but the frozen `ORDINARY_HANDLER_AUTHORITY` still expects `chat_temp_attachment_create` next. The Rust unit test explicitly requires exact ordered equality and frozen hashes for the 141-command authority. The default CI Rust job executes `cargo check --release` only and does not run `cargo test`, so this governance regression is not covered by the default native gate. This is an unmerged release-assurance defect, not evidence of a privilege exploit.

### Changed findings

- **VS-AUDIT-013:** PR #31 advanced 11 commits from the prior audited head to `f063b29216282641d298f5e37c23c9ffba5f9e4e`. It remains open and draft. GitHub currently reports **1,362 changed files, 151,779 additions, 8,254 deletions**, and a direct comparison of **147 commits ahead and six behind `main`**. Current exact-head AI-boundary evaluation passed; Rust `cargo check` passed; frontend install/typecheck/build passed, while Vitest was still running and release-manifest validation was pending when this audit closed. A superseded intermediate head (`e60724d...`) generated a failed-CI notification during the interval. High release-readiness risk remains.
- **VS-AUDIT-022:** Dependency assurance remains incomplete. Dependabot alerts were previously reported disabled, `.github/dependabot.yml` remains absent, and default CI has no dependency-vulnerability gate. In addition, no `Cargo.lock` exists at `app/src-tauri/Cargo.lock` on either `main` or the current PR head, while `Cargo.toml` contains many broad compatible version requirements and CI runs Cargo without `--locked`. This is a reproducibility/monitoring gap, not evidence that a vulnerable Rust package is currently selected.
- **VS-AUDIT-023:** Revalidated on PR #31 current head: the composer still permits 24 media items, each video up to 40 MiB, permits duplicate/repeated drops, stores videos as base64 data, and has no aggregate media-byte budget. The local memory/reliability risk remains open and unshipped.
- **VS-AUDIT-007:** Gmail now reports INBOX **1,994 total / 1,428 unread**, SPAM **128 / 79 unread**, and TRASH **260 / 219 unread**. Targeted spam/trash searches returned no matching current operational signal.
- **VS-AUDIT-018 / VS-AUDIT-020:** No application/configuration commit reached `main` after the previous audit, so the previously revalidated updater and repository Supabase-auth configurations have not changed on the shipped/default branch.
- **VS-AUDIT-005:** Current indexed code searches returned no results for selected literal `sk_live_`, `whsec_`, or `SUPABASE_SERVICE_ROLE_KEY` patterns. This does not clear the historical push-protection bypass, repository history/forks, or direct secret-scanning alert state.

### Resolved findings

- None.

### Connector failures and blind spots

- Supabase live policies/grants/schema, Security and Performance Advisors, SQL/migrations, API/Auth/Postgres/Edge Function/storage/realtime logs, database performance, storage/realtime state, and deployed functions could not be refreshed because interactive authorization was required. Critical/High Supabase-backed findings retain their latest successful live validation timestamp of **2026-08-02 21:00 UTC**.
- Stripe account identity/health, payments, customers, products/prices, subscriptions, invoices, refunds, disputes, events, suspicious-activity signals, and webhook health could not be refreshed because read-only Stripe access required interactive authorization.
- GitHub direct secret-scanning/code-scanning alert inventories, some repository security settings, and Discussions were not exposed through a usable read path. No submitted review or inline-review evidence was found through the available PR review surfaces; absence is not equivalent to independent review.
- PR #31 is too large for complete line-by-line/dynamic review in one run. Current exact-head frontend CI was still in progress when the audit closed, and the default Rust gate does not execute native tests. Packaged Windows/macOS/Linux execution, live migrations, end-to-end billing, deployment, rollback, adversarial authorization, browser-provider behavior, and realistic media stress tests remain unverified.
- Gmail merged-account volume, search semantics, result limits, and unverified public support aliases constrain completeness. Relevant spam/trash were searched, but no-match results do not guarantee no operational email exists elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update any customer profile
- **Severity:** Critical
- **Source:** Supabase live RLS policies/profile schema; draft migrations `0037`–`0039`
- **Evidence summary:** The last successful live check found `profiles_verified_session_update` using only verified-session state in `USING` and `WITH CHECK`, without row ownership. Draft migrations appear intended to replace profile policies, but remain unmerged and unverified against the connected live project. No cross-account write was attempted.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; draft remediation present, live state unverified
- **Affected component:** Customer identity/contact/status/address/notes/marketing and Stripe-customer linkage in `profiles`
- **Recommended remediation:** Drop every broad profile policy by exact name; create owner-only policies; restrict ordinary-user column grants; reserve operational/payment fields for trusted server roles; test complete migrations with two-account negative tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads
- **Severity:** Critical
- **Source:** Supabase live policies/grants; draft migrations `0037`–`0039`
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on customer/project/order/entitlement/delivery/design/workflow/update/refund tables accepted verified-session state without requiring row ownership. Draft remediation remains unmerged and unverified live.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Authorization boundary for profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Recommended remediation:** Remove all session-only policies; require direct ownership or tightly scoped staff roles; inventory every policy using verified-session helpers; run two-account negative tests after deployment.
- **Immediate owner attention:** Yes

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and invalid
- **Severity:** High
- **Source:** `app/src-tauri/tauri.conf.json`, `releases/channel.json`, release workflow, updater behavior
- **Evidence summary:** The last shipped/default-branch validation found app version `1.5.0` while the first configured updater endpoint served version `0.1.48`, only Windows x64, with no artifact signature field. No application/configuration commit landed on `main` since that validation, so the shipped configuration is unchanged.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (unchanged `main`)
- **Status:** Open; draft fix unmerged
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Remove or atomically replace the legacy endpoint; validate the exact first configured manifest in release gating; require all supported targets/URLs/signatures; package-test update discovery.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — RLS-disabled public table alert in another Supabase project
- **Severity:** High
- **Source:** Gmail Supabase Security Advisor notification
- **Evidence summary:** Supabase reported `rls_disabled_in_public` for a public-schema table in a project whose reference did not match the specified VibeSpace project. The table was not identified in the email; direct VibeSpace impact remains unconfirmed.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-04 16:26 UTC
- **Status:** Open; owner validation required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Identify the project/table directly, determine whether public access is intentional, enable/test RLS if not, and document any VibeSpace dependency.
- **Immediate owner attention:** Yes

### VS-AUDIT-002 — Refund-request insertion is not bound to signed-in owner
- **Severity:** High
- **Source:** Supabase live RLS policies/grants; draft migration `0039`
- **Evidence summary:** The last live check found an owner-bound insert policy plus a second permissive policy checking only verified-session state. Permissive PostgreSQL policies combine with OR semantics. Draft remediation remains unmerged and live state is unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Refund-request integrity
- **Recommended remediation:** Remove broad insert policies; require `user_id = auth.uid()` and an ownership-checked eligible order in both RLS and server-side validation; test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase project does not clearly appear to be the VibeSpace backend
- **Severity:** High
- **Source:** Supabase schema/logs/functions/project naming from latest successful live check
- **Evidence summary:** The connected project was dominated by AccessRevamp-oriented tables/activity and the visible deployed function was AccessRevamp-oriented; no clearly VibeSpace-specific production backend was visible.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; authoritative environment confirmation required
- **Affected component:** Audit coverage, deployment assurance, environment isolation
- **Recommended remediation:** Confirm/document the authoritative VibeSpace project reference; if co-tenancy is intentional, document and harden isolation and audit the deployed VibeSpace schema/functions.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Stripe live reads, Supabase payment/catalog/runtime records, Gmail Stripe notifications
- **Evidence summary:** At the last successful live check, the specified Stripe account had none of the checked transactional/catalog/webhook objects while Supabase recorded catalog/order/runtime state and an open webhook-failure incident. Gmail evidence also indicated multiple Stripe accounts exist. Live refresh is currently blocked.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live refresh blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Checkout, payment fulfillment, webhook processing, environment configuration
- **Recommended remediation:** Inventory accounts; identify authoritative deployed account without exposing secrets; reconcile catalog/prices; verify webhook endpoint/signing secret; complete a safe test-mode end-to-end purchase/fulfillment test.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern
- **Severity:** High
- **Source:** GitHub secret-scanning notification, repository history context, current connector limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Selected current indexed searches returned no literal key-prefix results, but direct secret-scanning alert inventory is unavailable and this does not prove the historical value synthetic/revoked or absent from history/forks.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-08 13:15 UTC (historical event unresolved)
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the alert directly; prove synthetic or rotate/revoke; replace key-shaped fixtures; inspect history/forks/caches; close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge or deploy
- **Severity:** High
- **Source:** GitHub PR metadata, comparisons, exact-head workflow/job reads, review surfaces, selected code review
- **Evidence summary:** PR #31 is draft at `f063b29216282641d298f5e37c23c9ffba5f9e4e`, with 1,362 changed files, 151,779 additions, 8,254 deletions, 147 commits ahead and six behind `main`. It advanced 11 commits since the previous audit across native browser-chat, model-foundry training/runtime trust, multimodal and AI/runtime code. AI-boundary passed; Rust `cargo check` passed; frontend install/typecheck/build passed, while Vitest remained in progress and release-manifest validation pending at audit close. A superseded intermediate head produced a failed-CI notification. Separate findings track media-memory risk (VS-AUDIT-023) and stale native command-authority testing (VS-AUDIT-024). No full packaged/live-environment validation exists.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open; unmerged draft; current exact-head CI incomplete at audit close
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope; sync `main`; require independent subsystem/security/billing/native review; run production-like migrations, two-account auth tests, Stripe test-mode flows, packaged multi-platform tests, browser/deployment/rollback tests, media-memory stress tests, and final gates on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior Google notice states the merged AccessRevamp-oriented Workspace Business Starter subscription is suspended because billing setup was not completed. No evidence establishes that VibeSpace depends on the tenant, and no superseding message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-07 02:51 UTC
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access and verify mailbox/data continuity; document tenant isolation.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password and password-change defaults in Supabase configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml` on `main`
- **Evidence summary:** Repository configuration uses a six-character minimum, no composition requirement, and `secure_password_change = false`. No application/configuration commit landed on `main` since the previous validation. Hosted applicability remains unverified.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-08 13:15 UTC (unchanged `main`)
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Adopt stronger passphrase-aligned minimums, recent reauthentication for password changes, leaked-password protection, controlled deployment, and hosted-flow verification.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new operational request was found. Gmail reports INBOX 1,994 total / 1,428 unread, SPAM 128 / 79 unread, TRASH 260 / 219 unread. At least one VibeSpace-domain route is previously evidenced, but public support aliases, routing rules, queue ownership, response state, and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm the public support address with controlled external delivery and use a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Supabase Security Advisor
- **Evidence summary:** The last successful live Security Advisor check reported leaked-password protection disabled. Current advisor access was blocked by interactive authorization.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Password authentication
- **Recommended remediation:** Enable leaked-password protection, strengthen password policy, verify reset/change reauthentication behavior.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView and native-command authority remain broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR #31 native/browser changes
- **Evidence summary:** The application has broad local/native functionality and PR #31 adds provider browser WebViews/native commands. The inspected browser surface limits command callers to the `main` WebView and does not grant remote provider WebViews matching capabilities; no exploit path from arbitrary remote content to privileged IPC was demonstrated. The new command-authority test drift is tracked separately as VS-AUDIT-024.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions, and add negative IPC/capability tests.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Supabase API logs
- **Evidence summary:** The latest successful live logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. Traffic appeared AccessRevamp-related rather than clearly VibeSpace-related. Live logs could not be refreshed.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub Dependabot status, `.github` configuration, default CI, `app/src-tauri/Cargo.toml`, absent `Cargo.lock`
- **Evidence summary:** GitHub previously reported Dependabot alerts disabled. `.github/dependabot.yml` remains absent and default CI has no dependency-vulnerability audit gate. `app/src-tauri/Cargo.lock` is absent on both `main` and PR #31 current head; Rust dependencies include broad compatible version ranges and CI runs `cargo check --release` without `--locked`. JavaScript has a committed root `package-lock.json`. This establishes monitoring/reproducibility gaps, not a current vulnerable-dependency claim.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open; scope expanded to Rust build reproducibility
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable Dependabot alerts/security updates as appropriate; add reviewed update configuration and dependency audit/review gates; commit `Cargo.lock` for the desktop application; use `cargo ... --locked` in CI/release; document exceptions/false positives.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 current head `f063b29216282641d298f5e37c23c9ffba5f9e4e`; `app/src/features/chat/imageAttachments.ts`
- **Evidence summary:** Current code still permits 24 media items, duplicate/repeated drops, and videos up to 40 MiB each without aggregate bytes. It reads each video as data URL/base64 and later decodes full video payloads into additional binary/typed-array/File copies before frame extraction. Up to 960 MiB raw / roughly 1.28 GiB encoded payload is possible before extra runtime/video-decoder overhead. No remote trigger was established; this is user-driven local reliability/memory exhaustion on an unmerged draft.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies where possible, and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Block merge/release until bounded and stress-tested

### VS-AUDIT-024 — Frozen native command-authority test is stale and Rust tests are absent from default CI
- **Severity:** Medium
- **Source:** PR #31 current head `f063b29216282641d298f5e37c23c9ffba5f9e4e`; `app/src-tauri/src/lib.rs`; `.github/workflows/ci.yml`
- **Evidence summary:** `run_ordinary` registers three new browser-chat commands immediately after `refresh_app_branding`, while `ORDINARY_HANDLER_AUTHORITY` expects `chat_temp_attachment_create` immediately after that command. The unit test requires exact ordered equality plus frozen authority hashes and labels the authority as 141 production commands. Therefore that equality assertion is expected to fail if the current native unit tests execute. Default CI runs only `cargo check --release`; it does not execute `cargo test`, so Rust compilation can pass without exercising the command-authority regression test. This is a deterministic test/governance mismatch on an unmerged branch, not evidence that the new commands are exploitable.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-08 13:15 UTC
- **Status:** Open on draft PR #31
- **Affected component:** Native Tauri command authority, security-regression tests, CI release assurance
- **Recommended remediation:** Security-review the three new commands, deliberately reconcile the frozen authority/count/hash if approved, then add an appropriate Rust unit-test gate (at minimum the library/security governance tests) to CI and require it on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-014 — Google/Stripe sign-in alerts associated with merged administrative identities
- **Severity:** Informational
- **Source:** Gmail Google Account security and Stripe SSO notices
- **Evidence summary:** Several Google new-sign-in alerts and a closely timed Stripe Google-SSO notice were observed historically. Some may be owner-initiated, but legitimacy is not proven; no new related signal was found this run.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-04 14:49 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Administrative Google identities and connected services
- **Recommended remediation:** Confirm in Google/Stripe security activity; revoke unknown sessions/connections; rotate credentials and verify MFA if unrecognized.
- **Immediate owner attention:** Only if unrecognized

### VS-AUDIT-015 — New Vercel administrative sign-in
- **Severity:** Informational
- **Source:** Gmail Vercel security notification
- **Evidence summary:** Vercel historically reported a sign-in from a new location/device/browser. The alert did not establish unauthorized access or VibeSpace-specific action; no superseding current signal was found.
- **First seen:** 2026-08-03 20:25 UTC
- **Last seen:** 2026-08-03 20:25 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Vercel administrative/deployment account; direct VibeSpace relevance unconfirmed
- **Recommended remediation:** Confirm in Vercel activity; revoke unknown sessions/tokens; ensure MFA.
- **Immediate owner attention:** Only if unrecognized

### VS-AUDIT-010 — Database index advisory signals require observation
- **Severity:** Informational
- **Source:** Supabase Performance Advisor
- **Evidence summary:** Latest successful advisor check reported unused/duplicate-index signals. The database was young and low-traffic, so signal alone did not justify index deletion. Current advisor state could not be refreshed.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 13:15 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; observe
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** Observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical GitHub Actions run `31104440221` and later successful `main` runs including `31181878422`
- **Evidence summary:** A prior audit-log-only `main` commit failed Vitest and skipped release-manifest validation, while typecheck/build/Rust passed. Later directly verified `main` CI passed dependency install, typecheck, Vite build, 28 Vitest files / 111 tests, release-manifest validation, and Rust `cargo check`.
- **First seen:** 2026-08-07 05:06 UTC
- **Last seen:** 2026-08-07 13:04 UTC as open
- **Resolved:** 2026-08-07 21:00 UTC
- **Status:** Resolved
- **Affected component:** Default-branch frontend CI/release-manifest gate
- **Recommended remediation:** Keep test/release-manifest gates required; investigate recurrence rather than assuming flakiness.
- **Immediate owner attention:** No

### VS-AUDIT-019 — Exact-head CI reported critical/high dependency advisories
- **Severity:** Medium
- **Source:** Historical PR #31 CI output and subsequent successful dependency review/audit
- **Evidence summary:** A prior PR run reported critical/high dependency advisories without package detail. A later exact-head dependency review and `npm audit` passed before application gates passed. VS-AUDIT-022 separately tracks repository-wide monitoring/reproducibility gaps.
- **First seen:** 2026-08-05 21:02 UTC
- **Last seen:** 2026-08-05 21:02 UTC as open
- **Resolved:** 2026-08-06 05:10 UTC
- **Status:** Resolved for that branch-head signal
- **Affected component:** PR #31 dependency assurance
- **Recommended remediation:** Continue immutable-release-candidate dependency review.
- **Immediate owner attention:** No

### VS-AUDIT-006 — `main` was failing CI
- **Severity:** High
- **Source:** Historical GitHub Actions release/CI history
- **Evidence summary:** `main` previously failed CI. PR #30 was subsequently merged and the v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64, including updater-signature verification/publication gates.
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen:** 2026-08-01 21:00 UTC as open
- **Resolved:** 2026-08-02 05:00 UTC
- **Status:** Resolved
- **Affected component:** Default-branch/release CI
- **Recommended remediation:** Continue immutable-SHA multi-platform release gating and align updater validation with the actual first configured manifest.
- **Immediate owner attention:** No

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
| 2026-08-05 21:00 | VS-AUDIT-013 raised to High after PR #31 expanded massively and failed exact-head frontend validation; VS-AUDIT-019 opened; VS-AUDIT-017 temporarily resolved by a superseding billing notice. |
| 2026-08-06 05:15 | PR #31 exact-head CI/CodeQL became green but branch remained High risk; draft authorization migrations improved; VS-AUDIT-019 resolved; VS-AUDIT-020 opened. |
| 2026-08-06 13:00 | No new findings/resolutions; PR #31 remained large with green exact-head workflows; no application-code commit reached `main`; Supabase/Stripe live refresh stayed blocked. |
| 2026-08-07 05:06 | VS-AUDIT-021 opened after audit-log-only `main` CI failed Vitest; VS-AUDIT-017 reopened after Google reported Workspace suspension. |
| 2026-08-07 13:04 | PR #31 current head re-established with successful exact-head Actions; stale updater/weak auth defaults unchanged; no new actionable Gmail signal; live Supabase/Stripe blocked. |
| 2026-08-07 21:00 | VS-AUDIT-022 opened because Dependabot vulnerability alerts were disabled and no dependency audit gate/config existed; VS-AUDIT-021 resolved after green `main` reruns. |
| 2026-08-08 05:05 | VS-AUDIT-023 opened for missing aggregate chat-media byte budget; PR #31 advanced to `862fe0...` with green CI/AI-boundary; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-08 13:15 | VS-AUDIT-024 opened because three new native browser-chat commands were added without updating the frozen command-authority test and default CI does not run Rust tests. PR #31 advanced 11 commits to `f063b292...`, 1,362 files / 151,779 additions / 8,254 deletions, 147 ahead/six behind `main`; AI-boundary and Rust check passed while frontend Vitest remained in progress at audit close. VS-AUDIT-022 scope expanded after confirming no committed Rust `Cargo.lock`. Gmail found no actionable VibeSpace incident; Supabase/Stripe live refresh remained blocked by interactive authorization. |

Every run was read-only except for maintaining this file. No application, repository, database, Supabase, Stripe, or Gmail remediation has been performed by the audit automation.
