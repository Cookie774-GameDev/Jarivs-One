# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-09 13:01 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 13 |
| Low | 0 |
| Informational | 3 |
| Resolved history | 3 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live check of the connected Supabase target found that a verified authenticated session could update another customer's `profiles` row without proving ownership. Current repository evidence says that connected target is AccessRevamp-oriented rather than the repository-pinned VibeSpace backend, so direct VibeSpace production applicability is unconfirmed; the authorization defect remains Critical on the connected project until authoritative environment ownership and live remediation are verified.
2. **VS-AUDIT-001 — Critical:** The last successful live check of the connected Supabase target found nine broad verified-session `SELECT` policies without row ownership. Current repository environment mapping disputes direct VibeSpace applicability, but the connected-project defect remains unresolved and live policy state could not be refreshed.
3. **VS-AUDIT-018 — High:** `main` still ships the stale first updater endpoint: app version `1.5.0` points first to a `0.1.48` Windows-only manifest with no artifact signature field. PR #31 removes that legacy endpoint, but the correction is unmerged.
4. **VS-AUDIT-016 — High:** Supabase previously reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact remains unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request insert policy on the connected Supabase target was not bound to `auth.uid()` at the last successful live check. Direct VibeSpace applicability is environment-dependent and unconfirmed.
6. **VS-AUDIT-003 — High:** Repository release evidence explicitly maps the user-specified connected Supabase target as AccessRevamp-only and a different project as the repository-pinned VibeSpace issuer. The audit target therefore does not currently match the backend described by the application branch, and authoritative production ownership must be resolved.
7. **VS-AUDIT-004 — High:** The user-specified Stripe account and Supabase payment/catalog/runtime evidence remain unreconciled; live Stripe reads were blocked again.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved; direct secret-scanning alert inventory is still inaccessible.
9. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft and its current exact-head frontend CI is failing.
10. **VS-AUDIT-028 — Medium:** PR #31 exact-head CI now fails Vitest with repeated unhandled `AbortError` annotations from Ollama bootstrap cancellation during account-identity tests. No production crash is claimed, but the exact release candidate is not green and cancellation cleanup is not test-safe.
11. **VS-AUDIT-027 — Medium:** PR #31 Model Foundry knowledge ingestion has a 64 MiB per-file limit but no source-count or aggregate-byte ceiling; the UI permits unlimited multi-file selection/appending and the native worker reads each selected source fully into memory and accumulates all cleaned chunks before packaging.
12. **VS-AUDIT-025 — Medium:** The Cloudflare MCP gateway's prior actual-body-size enforcement gap remains open on the draft branch.
13. **VS-AUDIT-026 — Medium:** The OAuth credential page's prior third-party runtime JavaScript trust finding remains open on the draft branch.
14. **VS-AUDIT-024 — Medium:** Local PR evidence records successful native Rust tests, but default required CI still runs only `cargo check --release` and still does not require the MCP Worker's dedicated checks.
15. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain remains recorded as suspended for incomplete billing setup; VibeSpace dependency is unconfirmed.
16. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Administrative identity/application authorization events require owner confirmation if unrecognized; no new compromise evidence was established this run.

## Current run summary

### Checks completed

- **GitHub/default branch:** fetched the existing audit log before work and re-fetched its current blob immediately before the only write. Reviewed the current `main` commit, `main` Actions, updater configuration, dependency/security alert surfaces and selected secret-pattern searches. Since the previous audit, `main` contains only the previous audit-log commit; no application/configuration code landed on `main`. The current `main` CI run is successful.
- **GitHub/PR #31:** reviewed PR metadata, the seven-commit interval delta, current comparison to `main`, exact-head CI and AI-boundary runs, CI jobs/check annotations, recent issues, PR conversation, submitted reviews and inline review threads, and selected changed auth/presence/Ollama code. Current exact head is `5aef5c23a538d9fbcd774f468b98fe1794b5283b`, still open/draft, with **1,449 changed files, 170,215 additions, 8,705 deletions and 179 commits**. It is **179 commits ahead and nine behind `main`**. AI-boundary evaluation passes, but exact-head CI run `31299816575` fails in Vitest after dependency installation, TypeScript and Vite build pass; Rust `cargo check` passes and release-manifest validation is skipped because the frontend job fails. No new issue, submitted PR review or inline review thread was exposed.
- **Exact-head CI failure analysis:** GitHub check annotations report repeated unhandled `AbortError: Ollama bootstrap cancelled` failures originating from `app/src/lib/ai/ollamaBootstrap.ts` while `App.accountIdentity` tests execute. The annotations warn that the error may be asynchronous after a test finishes, so the audit does not attribute every annotation to a particular assertion. Current code intentionally rejects subscriber promises on cancellation and aborts the shared flight when its last subscriber releases; expected cancellation is therefore reaching Vitest as unhandled somewhere in lifecycle cleanup.
- **New interval code review:** the seven new PR commits harden Jarvis restart/cancellation, browser relay/launch acknowledgement, chat activity evidence, stale browser-chat relay cancellation, and account identity/recovery/presence. New migration `0041_desktop_presence.sql` enables RLS, grants authenticated users owner-only `SELECT`, derives writes from `auth.uid()` through bounded `security definer` RPCs, validates metadata shapes/sizes and revokes anonymous/public execution; no new authorization defect was established in that migration. New account password UI calls the Supabase authenticated-session `updateUser` flow, which increases the importance of VS-AUDIT-020 because repository auth configuration still has `secure_password_change = false`; hosted settings remain unverified.
- **Gmail:** reviewed merged-inbox label state and targeted interval searches for VibeSpace/support/bug/crash/security/billing/payment/refund/dispute/webhook/Stripe/Supabase/login signals, including relevant spam/trash. Current metadata reports **INBOX 2,018 total / 1,447 unread**, **SPAM 135 / 86 unread**, and **TRASH 260 / 219 unread**. The material new operational email is the current PR-head CI failure notification; a prior intermediate PR head also failed the same frontend CI job. No clear new VibeSpace customer support, payment, refund, dispute, webhook, login, security, billing or application incident was identified. No email, label or inbox state was changed.
- **Supabase:** attempted Security Advisor, Performance Advisor, an innocuous read-only SQL probe, Auth logs, public-table listing, migrations and Edge Function listing for the specified connected project. Every substantive live read was denied with `You do not have permission to perform this action`. Current RLS/policies, grants, schema/data health, database performance, API/Auth/Postgres/Edge Function/storage/realtime logs, deployed migrations/functions, storage and realtime state therefore could not be refreshed. No Supabase write was invoked.
- **Stripe:** attempted live account information and a read-only payment-intent listing. The connector required interactive user input, unavailable in this run, so current failed/incomplete payments, refunds, disputes, customers, subscriptions, invoices, events/webhooks, suspicious activity, integration configuration and account health could not be refreshed. No Stripe write was invoked.
- **Repository security/configuration:** the Dependabot alerts endpoint again explicitly reports alerts disabled. The secret-scanning alert inventory remains inaccessible to the GitHub integration. Selected indexed searches returned no literal `sk_live_`, `whsec_` or `SUPABASE_SERVICE_ROLE_KEY` result; this is not proof of absence from history, forks or non-indexed content. `main` updater configuration was revalidated directly and remains stale/incomplete as described by VS-AUDIT-018.

### New findings

- **VS-AUDIT-028 — Medium:** Current PR #31 exact-head CI fails Vitest because expected Ollama cancellation is surfacing as repeated unhandled `AbortError` events during account-identity lifecycle tests. Dependency installation, TypeScript and Vite build pass; Rust `cargo check` passes. GitHub reports ten frontend annotations and skips release-manifest validation because the frontend job fails. This is release-assurance and lifecycle-cleanup evidence, not proof of a production crash, remote exploit or user-data impact.

### Changed findings

- **VS-AUDIT-013:** PR #31 advanced seven commits to `5aef5c23...`, grew to 1,449 files / 170,215 additions / 8,705 deletions / 179 commits, is 179 ahead/nine behind `main`, and no longer has green exact-head CI. AI-boundary evaluation remains successful, but current frontend validation fails.
- **VS-AUDIT-020:** repository `supabase/config.toml` at the current PR head still specifies a six-character minimum, no composition rule and `secure_password_change = false`. The new account-security panel exposes direct signed-in password change via Supabase `updateUser`, so hosted recent-reauthentication settings should be verified before release. This remains a configuration-hardening finding; hosted applicability was not proven.
- **VS-AUDIT-018:** revalidated unchanged on `main`: app version `1.5.0` still checks the raw-repository `0.1.48` Windows-only manifest first and that manifest has no signature field.
- **VS-AUDIT-022:** revalidated: Dependabot vulnerability alerts are disabled; direct secret-scanning inventory is inaccessible. No currently exploitable dependency was established.
- **VS-AUDIT-007:** Gmail volume increased to the counts above; targeted searches still did not surface a clear actionable VibeSpace customer incident.
- **VS-AUDIT-003 / VS-AUDIT-001 / VS-AUDIT-002 / VS-AUDIT-012:** live Supabase access remains permission-blocked, so the connected-project findings retain their prior evidence and environment-applicability caveat rather than being marked newly validated or resolved.

### Resolved findings

- None.

### Connector failures and blind spots

- **Supabase:** live read access remains denied at the project level across advisors, SQL, logs, tables, migrations and Edge Functions. The latest successful live Supabase validation available to this audit remains **2026-08-02 21:00 UTC**. Current repository evidence also indicates the specified connected project is not the repository-pinned VibeSpace backend, so both authorization and authoritative-environment identity must be corrected before live VibeSpace Supabase assurance is possible.
- **Stripe:** live reads require interactive authentication/input and therefore remain unavailable in this non-interactive run. Latest successful live Stripe validation remains **2026-08-02 21:00 UTC**.
- **GitHub:** direct secret-scanning alert inventory is inaccessible. Absence of submitted PR reviews/comments is not equivalent to independent review. PR #31 is too large for complete line-by-line and dynamic audit in a single run.
- **Runtime/release:** signed Windows release packaging, macOS/Linux packaged apps, production Supabase migrations, live two-account authorization tests, Stripe test-mode lifecycle/webhooks, OAuth/MCP production deployment, rollback, provider-browser behavior, high-volume media, Model Foundry aggregate-source stress and realistic long-duration soak/capacity remain unverified. Current exact-head frontend CI is additionally red.
- **Gmail:** merged-account scale, search semantics/result limits, routing aliases and queue ownership constrain completeness; relevant spam/trash were searched, but a no-match result does not guarantee no operational message exists elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update another customer profile
- **Severity:** Critical
- **Source:** Last successful live Supabase RLS/profile inspection of the connected target; PR #31 profile-security migration and current environment evidence
- **Evidence summary:** The last successful live check found a verified-session update policy on `profiles` that did not require row ownership. PR #31 contains a stronger owner-only policy/grant reset, but it is unmerged. Current repository release evidence says the connected target is AccessRevamp-only rather than the repository-pinned VibeSpace issuer, so direct VibeSpace production applicability is unconfirmed. No cross-account write was attempted by this audit.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status/environment applicability carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; strong draft remediation exists; authoritative VibeSpace applicability and live state unverified
- **Affected component:** Connected-project customer profile authorization and server-owned identity/billing fields; direct VibeSpace production relevance unresolved
- **Recommended remediation:** First establish the authoritative VibeSpace Supabase project. On every project that remains in scope, deploy the canonical owner-only policy/grant reset under controlled migration and run two-account negative read/update plus server-role billing-field tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads
- **Severity:** Critical
- **Source:** Last successful live Supabase policies/grants on the connected target; current repository environment mapping
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies across customer/project/order/entitlement/delivery/design/workflow/update/refund data accepted verified-session state without requiring row ownership at the last successful live check. Current repository evidence says the connected target is AccessRevamp-only; therefore direct VibeSpace production applicability is unconfirmed, but the connected-project defect remains unresolved.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status/environment applicability carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Connected-project authorization boundary; direct VibeSpace production relevance unresolved
- **Recommended remediation:** Confirm environment ownership, then inventory/remove session-only permissive policies; require direct ownership or tightly scoped staff roles and run two-account negative tests across every exposed table/RPC.
- **Immediate owner attention:** Yes

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and incomplete
- **Severity:** High
- **Source:** `main` `app/src-tauri/tauri.conf.json`, `releases/channel.json`; PR #31 updater configuration
- **Evidence summary:** `main` identifies VibeSpace as `1.5.0` while its first updater endpoint serves `0.1.48`, only Windows x64, with no artifact signature field. Current PR #31 removes that legacy endpoint and leaves the GitHub Releases manifest endpoint, but the change is unmerged.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open on `main`; draft remediation present in PR #31
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Merge only after immutable-SHA review, then package-test signed update discovery/rollback and require manifest target/URL/signature validation in release gating.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — RLS-disabled public table alert in another Supabase project
- **Severity:** High
- **Source:** Gmail Supabase Security Advisor notification
- **Evidence summary:** Supabase reported `rls_disabled_in_public` for a public-schema table in a project that did not match the specified audit target. The table was not identified in the email; direct VibeSpace impact remains unconfirmed.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-04 16:26 UTC
- **Status:** Open; owner validation required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Identify the project/table directly, determine whether public access is intentional, enable/test RLS if not, and document any VibeSpace dependency.
- **Immediate owner attention:** Yes

### VS-AUDIT-002 — Refund-request insertion is not bound to signed-in owner
- **Severity:** High
- **Source:** Last successful live Supabase RLS policies/grants on the connected target
- **Evidence summary:** The last live check found an owner-bound insert policy plus a second permissive verified-session policy. PostgreSQL permissive policies combine with OR semantics. Current repository environment evidence makes direct VibeSpace applicability uncertain; current live state is unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (status/environment applicability carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Refund-request integrity on the connected environment
- **Recommended remediation:** Confirm environment ownership; remove broad insert policies; require `user_id = auth.uid()` and ownership-checked eligible orders; test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase audit target does not match current repository-pinned VibeSpace backend evidence
- **Severity:** High
- **Source:** Last successful connected-project inspection; current PR #31 release evidence/configuration
- **Evidence summary:** The connected project previously appeared AccessRevamp-oriented. Current PR #31 release evidence explicitly states the repository-pinned VibeSpace issuer is a different Supabase project and that the specified connected target is AccessRevamp-only. That repository evidence is not a substitute for current live connector proof, but it materially establishes an operational scope mismatch.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Last successfully validated live:** 2026-08-02 21:00 UTC for the connected target
- **Status:** Open; environment mismatch materially strengthened
- **Affected component:** Audit coverage, authentication, deployment assurance, environment isolation
- **Recommended remediation:** Document a single authoritative production VibeSpace project reference/owner; reconnect read-only audit access to that exact project; reconcile desktop, Edge Function, MCP Worker and deployment configuration; then rerun advisors/RLS/log/function checks.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Last successful Stripe reads, Supabase payment/catalog/runtime evidence, Gmail Stripe notifications, current blocked Stripe access
- **Evidence summary:** At the last successful live check, the specified Stripe account did not reconcile with the connected Supabase catalog/order/runtime state and historical webhook-failure evidence. Current live Stripe account reads remain blocked.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (status carried; live refresh blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Checkout, payment fulfillment, subscriptions, webhooks, environment configuration
- **Recommended remediation:** Identify/document the authoritative VibeSpace Stripe account/environment; reconcile catalog/prices with the authoritative backend; verify webhook endpoint/signing secret without exposing it; run isolated test-mode purchase/failure/refund/subscription/reconciliation flows.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern
- **Severity:** High
- **Source:** Historical GitHub secret-scanning notification; current searches/alert endpoint limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Current selected literal searches return no result, but direct secret-scanning alerts remain inaccessible and absence from indexed current files does not clear history/forks or prove the value synthetic/revoked.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-09 13:01 UTC (historical event unresolved)
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly; prove synthetic or rotate/revoke; replace key-shaped fixtures; inspect history/forks/caches; close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge/deploy without additional release evidence
- **Severity:** High
- **Source:** GitHub PR metadata/comparison, exact-head Actions, review surfaces, selected code/release review
- **Evidence summary:** Current PR #31 head is `5aef5c23a538d9fbcd774f468b98fe1794b5283b`, open/draft, with 1,449 files, 170,215 additions, 8,705 deletions and 179 commits; it is 179 ahead/nine behind `main`. Exact-head AI-boundary evaluation is green, but current exact-head CI fails Vitest with repeated unhandled Ollama-cancellation errors. The branch spans auth, Supabase/Stripe, Tauri/native authority, browser automation, MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime and deployment tooling. No submitted review or inline review thread was exposed.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open; unmerged draft; exact-head frontend CI failing and external/production-like evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope; sync `main`; fix/re-run exact-head CI; require independent subsystem/security/billing/native review and every dedicated suite; validate packaged multi-platform apps, authoritative live migrations, two-account authorization, Stripe test mode, OAuth/MCP deployment, rollback and resource-exhaustion/soak on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior Google notice says the merged AccessRevamp-oriented Workspace Business Starter subscription is suspended because billing setup was not completed. No evidence establishes VibeSpace dependency and no superseding billing-status message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-07 02:51 UTC
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access and verify mailbox/data continuity; document tenant isolation.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password/password-change defaults in Supabase repository configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml`; current PR account-security UI
- **Evidence summary:** Repository configuration at the current PR head specifies a six-character minimum password, no composition requirement and `secure_password_change = false`. Current PR #31 also exposes an authenticated in-session password-change panel that calls Supabase `auth.updateUser({ password })`. If the hosted project mirrors the repository setting, recent reauthentication would not be required; hosted applicability could not be verified because live Supabase access is blocked.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Adopt stronger passphrase-aligned minimums, enable recent reauthentication for password changes, enable leaked-password protection where supported, deploy under change control and verify both normal and recovery password-change flows on the authoritative hosted project.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Current counts are INBOX 2,018 / 1,447 unread, SPAM 135 / 86 unread, TRASH 260 / 219 unread. At least one VibeSpace-domain route was previously evidenced, but public aliases, routing rules, queue ownership, response state and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm public support routing with controlled external delivery and a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Last successful live Supabase Security Advisor
- **Evidence summary:** The last successful live advisor check reported leaked-password protection disabled. Current advisor access is denied by the connector, and current repository environment evidence means direct VibeSpace applicability must be reassessed against the authoritative project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability unverified
- **Affected component:** Password authentication
- **Recommended remediation:** On the authoritative VibeSpace project, verify/enable leaked-password protection, strengthen password policy and verify reset/change reauthentication.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView/native-command authority remains broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR #31 browser/native changes
- **Evidence summary:** The desktop retains broad native functionality and PR #31 adds browser/provider/native surfaces. Reviewed Browser Chat MCP preflight requires HTTPS, exact `/mcp`, validates protected-resource and authorization-server issuer metadata, and workspace grants are account/project scoped. No arbitrary remote-content-to-privileged-IPC exploit was demonstrated. CI coverage limits are tracked separately.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions and require negative IPC/capability tests.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Last successful live Supabase API logs
- **Evidence summary:** Prior live logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. Traffic appeared AccessRevamp-related. Current logs are permission-blocked and current environment mapping further reduces confidence that this is a VibeSpace path.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status/environment relevance carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; direct VibeSpace relevance unconfirmed
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub Dependabot/security configuration, default CI, Rust/MCP package state
- **Evidence summary:** The Dependabot alerts endpoint again explicitly reports alerts disabled. Default CI has no dependency-vulnerability audit gate and runs Rust `cargo check --release` without a required native-test gate. The MCP Worker has its own checks outside default CI. Direct secret-scanning inventory is also integration-blocked. This establishes monitoring/release-assurance gaps, not a claim of a currently exploitable dependency.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable reviewed dependency alerts/updates; add dependency audit/review for every package ecosystem; pin/lock release resolutions where appropriate; require MCP Worker and native security tests on the immutable release SHA.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation
- **Evidence summary:** Prior direct review established up to 24 media items, videos up to 40 MiB each and no aggregate-byte ceiling, with representations/decoding capable of creating large duplicate memory footprints. No remote trigger or shipping to `main` was established. The interval delta did not establish a fix.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status carried)
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Yes before merge/release

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** `.github/workflows/ci.yml`, PR #31 release evidence, MCP Worker package
- **Evidence summary:** The prior native command-authority mismatch is fixed. PR evidence records a local Windows default-feature `cargo test --lib` run with 256 passed and eight intentional ignores. Default GitHub CI nevertheless runs only `cargo check --release`, so native unit/security tests are not a required merge gate; the MCP Worker package's dedicated checks also remain outside default CI.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open; local evidence improved, systemic required-CI gap remains
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add appropriate Rust unit/security tests and MCP Worker test/typecheck/dry-run checks to required CI; require them on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts declared length instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 Cloudflare MCP Worker; prior direct code review
- **Evidence summary:** Prior review found the 256 KiB Worker limit depended on caller-supplied `Content-Length` and did not independently count the body before the MCP SDK handler. Authentication remained required and no auth bypass/code execution was shown. The interval delta did not include the Worker path, so no fix was established this run.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status carried)
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint, request parsing/resource consumption
- **Recommended remediation:** Enforce actual received-byte limits before SDK parsing, regardless of headers; add omitted/inaccurate/chunked/oversized-body tests while preserving auth/origin/host checks.
- **Immediate owner attention:** Yes before MCP deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 OAuth consent site; prior direct review
- **Evidence summary:** The consent page asks for credentials while importing Supabase JS directly from jsDelivr at runtime. No malicious CDN behavior or XSS/open redirect was demonstrated; the issue is supply-chain trust on a credential-handling origin. No interval change established remediation.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-09 13:01 UTC (open status carried)
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle/self-host the exact audited client, use a restrictive self-centered CSP, pin/verify build dependencies and test the deployed artifact.
- **Immediate owner attention:** Yes before OAuth page deployment

### VS-AUDIT-027 — Model Foundry knowledge ingestion lacks aggregate source limits
- **Severity:** Medium
- **Source:** PR #31 `BuildYourOwnAIHub.tsx`, `modelHub.ts`, native `model_foundry.rs`
- **Evidence summary:** The UI opens a native multi-select picker and appends all selected supported paths without a source-count or aggregate-byte cap. `mayStartTraining` requires only that at least one supported source exists. Native `validated_sources` enforces a 64 MiB maximum **per source** but no total count/bytes. `clean_chunks` then reads every source fully with `fs::read_to_string`, normalizes/deduplicates chunks in memory and later serializes the full artifact. A sufficiently large aggregate selection can therefore consume substantial memory/CPU/disk; concurrent job limits were not established in the reviewed start path. This is a local availability/reliability risk, not a remote exploit claim.
- **First seen:** 2026-08-09 05:02 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Model Foundry knowledge-source ingestion, native process memory/CPU/disk reliability
- **Recommended remediation:** Add a small explicit maximum source count and aggregate source-byte budget in both UI and native enforcement; stream/chunk large files instead of whole-file reads; bound total chunk/artifact size and active jobs; add adversarial near-limit/many-file/concurrent-job stress tests.
- **Immediate owner attention:** Yes before merging/releasing Model Foundry

### VS-AUDIT-028 — Exact-head frontend CI leaks expected Ollama cancellation as unhandled errors
- **Severity:** Medium
- **Source:** GitHub Actions exact-head run `31299816575`, check annotations, current `app/src/lib/ai/ollamaBootstrap.ts`
- **Evidence summary:** At PR #31 head `5aef5c23...`, dependency installation, TypeScript and Vite build pass, but Vitest fails and release-manifest validation is skipped. GitHub reports ten failure annotations with repeated `AbortError: Ollama bootstrap cancelled` originating at the bootstrap cancellation path while account-identity lifecycle tests execute. Current bootstrap code rejects cancelled subscribers and aborts the shared controller once all subscribers release. The annotation itself notes the error may occur asynchronously after individual tests complete. No production crash, security exploit or user-data impact is established; the demonstrated defect is uncaught expected cancellation in the test/lifecycle boundary plus a red exact release candidate.
- **First seen:** 2026-08-09 13:01 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open on draft PR #31; current exact-head CI failing
- **Affected component:** Ollama bootstrap cancellation lifecycle, account-identity cleanup tests, frontend CI/release assurance
- **Recommended remediation:** Treat expected cancellation as a consumed/awaited lifecycle outcome; ensure every bootstrap subscriber/cleanup path handles `AbortError` without unhandled rejections; add focused cancellation/unmount/account-switch regressions; then rerun the exact head until Vitest and release-manifest validation are green.
- **Immediate owner attention:** Yes before merging/releasing PR #31

### VS-AUDIT-014 — Administrative identity/application authorization events
- **Severity:** Informational
- **Source:** Gmail Google/Stripe/Fly.io/GitHub security and authorization notifications
- **Evidence summary:** Historical Google sign-in/Stripe SSO/Fly.io authorization notices may be owner-initiated and did not establish unauthorized access. A prior GitHub notice said the installed Grok (xAI) GitHub App requested additional permissions; no evidence in this run shows approval or compromise.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-08 23:44 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Administrative identity and connected third-party applications
- **Recommended remediation:** Confirm expected sign-ins/app authorization requests in provider security activity; do not grant unexpected scopes; revoke unknown sessions/apps and rotate credentials if unrecognized; verify MFA/recovery controls.
- **Immediate owner attention:** Only if unrecognized/unexpected

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
- **Source:** Last successful Supabase Performance Advisor
- **Evidence summary:** The last successful advisor check reported unused/duplicate-index signals. The database was young/low-traffic, so signal alone did not justify deletion. Current advisor state is permission-blocked and direct VibeSpace applicability depends on authoritative project identity.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 13:01 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; observe on relevant environment
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** On the authoritative project, observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical GitHub Actions run `31104440221` and later successful `main` runs
- **Evidence summary:** A prior audit-log-only `main` commit failed Vitest and skipped release-manifest validation. Later direct `main` runs passed; the current `main` audit-log commit also has successful CI.
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
- **Evidence summary:** A prior PR run reported critical/high dependency advisories without package detail. A later exact-head dependency review and `npm audit` passed. VS-AUDIT-022 tracks repository-wide monitoring/reproducibility gaps.
- **First seen:** 2026-08-05 21:02 UTC
- **Last seen:** 2026-08-05 21:02 UTC as open
- **Resolved:** 2026-08-06 05:10 UTC
- **Status:** Resolved for that branch-head signal
- **Affected component:** PR #31 dependency assurance
- **Recommended remediation:** Continue immutable-release-candidate dependency review across every package ecosystem.
- **Immediate owner attention:** No

### VS-AUDIT-006 — `main` was failing CI
- **Severity:** High
- **Source:** Historical GitHub Actions release/CI history
- **Evidence summary:** `main` previously failed CI. PR #30 was subsequently merged and the v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64 and macOS arm64, including updater-signature verification/publication gates.
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
| 2026-08-08 05:05 | VS-AUDIT-023 opened for missing aggregate chat-media byte budget; PR #31 advanced with green CI/AI-boundary; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-08 13:15 | VS-AUDIT-024 opened because new native browser-chat commands were added without updating the frozen command-authority test and default CI did not run Rust tests. |
| 2026-08-08 21:13 | VS-AUDIT-025 opened for the Cloudflare MCP actual-body-size enforcement gap; VS-AUDIT-026 opened for third-party runtime JavaScript on the OAuth credential page. PR #31 advanced to 1,404 files with green exact-head workflows; environment mismatch evidence strengthened; updater revalidated stale; live Supabase/Stripe remained blocked. |
| 2026-08-09 05:02 | VS-AUDIT-027 opened for missing Model Foundry aggregate source limits. PR #31 advanced to `b81d934...`, 1,408 files / 164,715 additions / 8,436 deletions / 172 commits and exact-head workflows were green. Repository release evidence explicitly mapped the connected Supabase target as AccessRevamp-only and a different project as the repository-pinned VibeSpace issuer, so direct VibeSpace applicability of the connected-project Critical/High Supabase findings remained unconfirmed pending authoritative live environment access. `main` updater remained stale while PR #31 contained draft remediation. Dependabot alerts remained disabled. Gmail found no clear actionable VibeSpace customer incident and added an unapproved/unspecified GitHub App permission-request notice. Supabase live reads failed with connector permission denial; Stripe live reads remained blocked by interactive authentication. |
| 2026-08-09 13:01 | VS-AUDIT-028 opened after current PR #31 head `5aef5c23...` failed exact-head Vitest with repeated unhandled Ollama cancellation errors; AI-boundary and Rust compile checks remained successful. PR #31 grew to 1,449 files / 170,215 additions / 8,705 deletions / 179 commits and is 179 ahead/nine behind `main`. `main` remains application-code unchanged and its CI is green; stale updater was revalidated. Dependabot alerts remain disabled and direct secret-scanning inventory remains inaccessible. Gmail surfaced the exact-head CI failure but no clear new customer/security/billing incident. Supabase live reads remain permission-denied and Stripe live reads remain blocked by interactive authentication. No remediation was performed. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.