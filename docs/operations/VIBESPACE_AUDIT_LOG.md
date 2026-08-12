# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, recovery codes, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-12 05:00 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 0 |
| High | 9 |
| Medium | 13 |
| Low | 0 |
| Informational | 3 |
| Resolved currently | 6 |
| Historical resolution events | 7 |

## Immediate owner attention required

1. **VS-AUDIT-031 — High:** Draft PR #31 still lacks `install/install.ps1`, while `main` and the signed-release workflow publish that path as the Windows one-line installer. Merging the draft without an intentional replacement would break the documented installation route.
2. **VS-AUDIT-029 — High:** `main` remains unprotected, required-status enforcement is off, and the repository has no rulesets. Writers can technically bypass PR/review/CI enforcement. No unauthorized push is claimed.
3. **VS-AUDIT-030 — High:** The signed release workflow still uses mutable GitHub Action references while holding repository-write authority and signing material. No upstream-action compromise is alleged.
4. **VS-AUDIT-018 — High:** `main` identifies VibeSpace as `1.5.0` but checks first a raw updater manifest advertising only `0.1.48`, Windows x64, with no artifact-signature field.
5. **VS-AUDIT-016 — High:** A Supabase Security Advisor email still reports an RLS-disabled public table in another project. Direct VibeSpace relevance remains unconfirmed; the specified audit target currently has RLS enabled on all listed public tables.
6. **VS-AUDIT-003 — High:** The user-specified Supabase target `vbkkimvedmklebghtkzs` remains AccessRevamp-oriented, while PR #31 identifies `tipeobvisjqvpbzcpckh` as the repository-pinned VibeSpace issuer. Authoritative VibeSpace backend coverage remains unresolved.
7. **VS-AUDIT-004 — High:** The Stripe connector is authenticated to a different sandbox account than the requested target, and the requested target cannot be read with the current OAuth permission set. The connected Supabase target also retains one unresolved historical webhook-failure warning.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified because direct secret-scanning alert inventory is inaccessible.
9. **VS-AUDIT-013 — High:** PR #31 remains a very large security-sensitive draft. Current head `eda462daab1f8c6a36a6f5965f831f2fc568a5d4` is **201 commits ahead / 17 behind** current `main`; exact-head frontend CI remains red because Vitest fails and release-manifest validation is skipped.

## Current run summary

### Checks completed

- **GitHub/default branch:** fetched this audit log before work and again immediately before the only write. Pre-audit `main` was `654557b0adb7b023ace9174d673cbf01a3b0bbe5`, the prior audit-log-only commit. No application-code commit reached `main` after the previous audit. Exact CI run `31536748530` is green.
- **GitHub/governance/security monitoring:** `main` still reports `protected: false`, required-status enforcement is off, and repository rulesets remain empty. Dependabot alerts remain explicitly disabled. Direct secret-scanning alerts, code-scanning alerts, and default Actions workflow-permission configuration remain inaccessible to the integration. Current indexed searches returned no literal `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or searched unsafe DOM/CORS patterns; current-index absence does not clear Git history, forks, other branches, caches, or non-indexed content.
- **GitHub/PR #31:** head remains `eda462daab1f8c6a36a6f5965f831f2fc568a5d4`, open/draft, with 1,569 changed files, 187,511 additions, 10,621 deletions, and 201 commits. It is now **201 ahead / 17 behind** current `main`. Exact-head CI `31449158283` still fails in Vitest after install/typecheck/Vite pass; release-manifest validation is skipped; Rust `cargo check` succeeds. `install/install.ps1` still returns 404 at this head.
- **GitHub/collaboration:** no issues, issue comments, inline PR review comments, or PR reviews were updated after the previous cutoff. GitHub Discussions remain disabled.
- **Updater/release:** `main` still reports app version `1.5.0`, with the raw `releases/channel.json` endpoint first; that manifest still advertises `0.1.48`, Windows x64 only, without a signature field. The release workflow still uses mutable `dtolnay/rust-toolchain@stable`, `swatinem/rust-cache@v2`, and `tauri-apps/tauri-action@v0` references while receiving signing material; its post-build updater-signature verification remains a positive control.
- **Gmail:** merged-inbox metadata is **INBOX 2,092 total / 1,512 unread**, **SPAM 142 / 95 unread**, **TRASH 260 / 219 unread**. Relative to the prior run: +10 inbox/+10 unread, +2 spam/+2 unread, trash unchanged. Targeted VibeSpace/support/bug/crash/error/security/login/recovery/GitHub/Supabase/Stripe/payment/refund/dispute/webhook/invoice/subscription/billing searches, including relevant spam/trash, found no clear new VibeSpace customer-support, billing, payment, webhook, or application incident. Two new merged-account Google notices require owner recognition if unexpected: one new-sign-in security alert and one Sign in with Google authorization to Hostinger. Neither establishes unauthorized access or VibeSpace impact. No email, label, read state, or inbox state was changed.
- **Supabase/environment identity:** management-project listing currently returns `tipeobvisjqvpbzcpckh` as `ACTIVE_HEALTHY`; PR #31 also names that project as the repository-pinned VibeSpace issuer. Direct read-only operations against the user-specified `vbkkimvedmklebghtkzs` continue to work, but its schema, migrations, cron jobs, tables, and Edge Function remain AccessRevamp-oriented.
- **Supabase/advisors:** Security Advisor on `vbkkimvedmklebghtkzs` still reports only leaked-password protection disabled at warning severity. Performance Advisor returns informational unused-index candidates; no higher-severity performance item was returned.
- **Supabase/RLS/policies:** all listed public tables on the specified target have RLS enabled. Sampled critical tables retain owner-bound policies with RESTRICTIVE verified-session gates where applicable; `payment_disputes` has a restrictive browser-deny policy. A metadata query returned zero public-schema SECURITY DEFINER functions executable by `anon` or `authenticated`. No cross-account read or mutation test was performed.
- **Supabase/storage/functions:** all three listed storage buckets are private and have per-object size limits. The inspected `storage.objects` policy is a dedicated customer-private-assets read policy. The only listed active Edge Function remains `accessrevamp-runtime-health`, version 4, with JWT verification enabled; source returns a bounded readiness boolean and uses server-side environment credentials without returning them to callers.
- **Supabase/database/migrations/logs:** migration history still ends at `20260729223249 expand_project_intake_to_seven_pages`. API, Auth, Edge Function, Storage, Realtime, and branch-action log queries returned no entries in the current window. PostgreSQL logs show routine checkpoints and recurring AccessRevamp monitoring/expiry cron jobs completing; no ERROR/FATAL/PANIC entry was returned in the sampled output. Branch listing still returns `Project not found` despite successful reads against the same target, so branch coverage remains incomplete.
- **Supabase/payment-control state:** checkout remains enabled, expected live mode enabled, live payment approved, refunds disabled, and two-person refunds required. One `warning`-severity open `webhook_failure` incident remains, first/last seen 2026-07-28. Last successful webhook remains 2026-07-25; later event/fulfillment markers remain unset. Aggregate checks returned **1 open payment incident, 0 disputes, 0 open refund requests, 0 open refund authorizations, 0 unprocessed Stripe events, and 0 non-final refunds**.
- **Stripe:** the connected account is still a different sandbox account (`acct_1TgcFB…`) from the requested target (`acct_1TgcEx…`). Direct requested-target retrieval is denied because the OAuth connection lacks `limited_account_retrieve`. The audit deliberately did not inspect payment/customer/subscription data from the unrelated connected account. No Stripe write was invoked.

### New findings

- **None.** The two new Google administrative notices map to existing VS-AUDIT-014 rather than creating duplicate findings.

### Changed/revalidated findings

- **VS-AUDIT-013 / VS-AUDIT-028:** PR #31 is unchanged at the same head, but comparison drift increased to **201 ahead / 17 behind** current `main`; exact-head frontend CI remains red.
- **VS-AUDIT-014:** materially updated with a new Google account sign-in alert and a new Hostinger Sign in with Google authorization notice. Neither proves unauthorized activity; owner recognition is required if unexpected.
- **VS-AUDIT-007:** Gmail volume changed to 2,092 inbox / 1,512 unread, 142 spam / 95 unread, 260 trash / 219 unread; targeted searches found no clear new VibeSpace customer incident.
- **VS-AUDIT-003:** revalidated and strengthened by management-project listing: the repository-pinned `tipeob…` project is visible/healthy while the specified `vbkk…` target remains AccessRevamp-oriented.
- **VS-AUDIT-004:** revalidated. Requested Stripe target remains inaccessible; the connected Supabase payment-control state still contains one open historical webhook warning and no open dispute/refund/unprocessed-event aggregate.
- **VS-AUDIT-008 / VS-AUDIT-010:** revalidated by current Supabase Security/Performance Advisors.
- **VS-AUDIT-011:** no recurrence observed in the current API-log window; historical privacy evidence remains unresolved.
- **VS-AUDIT-031 / VS-AUDIT-029 / VS-AUDIT-030 / VS-AUDIT-018 / VS-AUDIT-022 / VS-AUDIT-024:** revalidated unchanged.

### Resolved findings

- **None newly resolved.** VS-AUDIT-001, VS-AUDIT-002, VS-AUDIT-012, VS-AUDIT-021, VS-AUDIT-019, and VS-AUDIT-006 remain resolved as previously recorded.

### Connector failures and blind spots

- **Supabase:** branch listing still returns `Project not found` despite successful SQL/advisor/log/table/function reads against `vbkkimvedmklebghtkzs`. More importantly, that specified project is AccessRevamp-oriented and not the repository-pinned VibeSpace issuer, so authoritative production VibeSpace RLS/log/function/storage/performance coverage is still missing. Metadata review is not a substitute for two-account negative authorization testing.
- **Stripe:** the connected OAuth session belongs to a different sandbox account than the requested target. Requested-account failed/incomplete payments, refunds, disputes, subscriptions, invoices, customers, webhooks/events, suspicious activity, and overall account health remain unverified.
- **GitHub:** secret-scanning/code-scanning alert inventories and default Actions permission configuration are integration-blocked; Dependabot alerts are disabled. PR #31 is too large for exhaustive dynamic or line-by-line review in one pass.
- **Runtime/release:** packaged Windows/macOS/Linux execution, signed installer validation, authoritative VibeSpace production migrations, two-account authorization, requested Stripe test-mode lifecycle/webhooks, deployed OAuth/MCP, rollback, high-volume media/Model Foundry stress, and long-duration soak/capacity remain unverified.
- **Gmail:** merged-account scale, aliases/routing, queue ownership, response state, and SLA tracking limit completeness. Relevant spam/trash were searched, but no-match does not guarantee absence elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-031 — Draft PR deletes the documented Windows one-line installer
- **Severity:** High
- **Source:** PR #31 file state/description; `main` installer and release workflow
- **Evidence summary:** `install/install.ps1` remains absent at PR head `eda462d…`, while the release workflow still publishes that path as the Windows one-line installer. No current-user impact is claimed because the deletion is unmerged.
- **First seen:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Windows installation/update entry point and release documentation
- **Recommended remediation:** Before merge, restore the installer or intentionally replace the Windows install mechanism and update every reference; add CI asserting documented installer paths exist and parse/dry-run successfully.
- **Immediate owner attention:** Yes before merging or releasing PR #31

### VS-AUDIT-029 — Default branch has no enforced protection or ruleset
- **Severity:** High
- **Source:** GitHub `main` branch metadata and repository rulesets API
- **Evidence summary:** `main` still reports `protected: false`, required-status enforcement off, and no repository rulesets. A direct push is technically possible without a repository-enforced PR/review/CI gate. No unauthorized push is claimed.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open
- **Affected component:** Default-branch integrity, merge/release governance
- **Recommended remediation:** Add an enforced ruleset requiring PRs, independent approvals, current required CI/security checks, force-push/deletion blocking, and tightly restricted bypass actors.
- **Immediate owner attention:** Yes

### VS-AUDIT-030 — Signed release workflow uses mutable action references
- **Severity:** High
- **Source:** `.github/workflows/release.yml`
- **Evidence summary:** The release workflow still invokes mutable references including `dtolnay/rust-toolchain@stable`, `swatinem/rust-cache@v2`, and `tauri-apps/tauri-action@v0` while the job has repository-write authority and receives signing material. No upstream-action compromise is alleged; post-build signature checks are a positive control.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open
- **Affected component:** Release supply chain, signing/updater keys, official artifacts
- **Recommended remediation:** Pin release actions to reviewed immutable full SHAs, minimize token permissions, protect signing secrets behind release approvals, and document controlled updates.
- **Immediate owner attention:** Yes before the next signed release

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and incomplete
- **Severity:** High
- **Source:** `main` `app/src-tauri/tauri.conf.json` and `releases/channel.json`
- **Evidence summary:** `main` identifies VibeSpace as `1.5.0`, while its first updater endpoint serves `0.1.48`, Windows x64 only, with no artifact-signature field.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on `main`
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Ship one authoritative signed manifest path, package-test signed update discovery/rollback, and require target/URL/signature validation in release gating.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — RLS-disabled public table alert in another Supabase project
- **Severity:** High
- **Source:** Gmail Supabase Security Advisor notification
- **Evidence summary:** A 2026-08-11 notice reports `rls_disabled_in_public` for a public table in a project other than the specified audit target. The specified target currently has RLS enabled on all listed public tables. No VibeSpace vulnerability is claimed from the email alone.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-11 16:22 UTC
- **Status:** Open; owner/project attribution required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Identify the affected project/table directly, determine ownership and intended exposure, enable/test RLS if required, and document whether VibeSpace depends on it.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase audit target does not match repository-pinned VibeSpace backend evidence
- **Severity:** High
- **Source:** Live project listing/schema/migrations/functions/logs; PR #31 environment evidence
- **Evidence summary:** Management listing returns `tipeobvisjqvpbzcpckh` as active/healthy and PR #31 calls it the repository-pinned VibeSpace issuer. Direct reads of `vbkkimvedmklebghtkzs` work, but its schema/functions/cron/migrations remain AccessRevamp-oriented.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open; authoritative VibeSpace backend is not the specified connected target
- **Affected component:** Audit coverage, authentication, deployment assurance, environment isolation
- **Recommended remediation:** Document one authoritative production VibeSpace project/owner, connect read-only audit access to that exact project, reconcile app/Edge Function/MCP/deployment configuration, and rerun all backend checks there.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Stripe connector metadata/OAuth permissions; connected-Supabase payment controls
- **Evidence summary:** The active Stripe connector is authenticated to a different sandbox account (`acct_1TgcFB…`) from the requested target (`acct_1TgcEx…`); requested-target retrieval is denied by OAuth permissions. The AccessRevamp-oriented Supabase target reports checkout enabled/live-approved, refunds disabled, one open warning `webhook_failure` dated 2026-07-28, and last successful webhook 2026-07-25, with zero disputes/open refunds/unprocessed Stripe events/non-final refunds in aggregate.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open; requested Stripe target remains unauditable end-to-end
- **Affected component:** Checkout, payment fulfillment, refunds, subscriptions, webhooks, environment configuration
- **Recommended remediation:** Connect/read-authorize the exact VibeSpace Stripe account, reconcile catalog/prices/webhook signing with the authoritative backend, review the historical webhook warning, and run isolated test-mode purchase/failure/refund/subscription/reconciliation flows.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern
- **Severity:** High
- **Source:** Historical GitHub secret-scanning notification; current search/alert endpoint limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Selected current literal searches return no result, but direct secret-scanning alerts remain inaccessible and current-index absence does not clear history/forks or prove the value synthetic/revoked.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly, prove the value synthetic or rotate/revoke it, replace key-shaped fixtures, and inspect history/forks/caches.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge/deploy without additional release evidence
- **Severity:** High
- **Source:** PR metadata/comparison, exact-head Actions, selected code/release review
- **Evidence summary:** Head `eda462d…` remains open/draft with 1,569 files, 187,511 additions, 10,621 deletions, and 201 commits; it is **201 ahead / 17 behind** current `main`. Exact-head Rust compile passes, but frontend CI fails Vitest and skips release-manifest validation. The branch spans auth, Supabase/Stripe, Tauri/native authority, browser/MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime, and deployment tooling, and still lacks the documented Windows installer.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open; unmerged draft; exact-head frontend CI failing and production-like evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope, sync `main`, resolve installer ownership, fix/rerun exact-head CI, require independent subsystem/security/billing/native review and dedicated suites, and validate packaged multi-platform apps, authoritative migrations, two-account authorization, requested Stripe test mode, OAuth/MCP deployment, rollback, and resource-exhaustion/soak on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Historical Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior notice said a merged AccessRevamp-oriented Workspace Business Starter subscription was suspended because billing setup was incomplete. No evidence establishes VibeSpace dependency and no superseding VibeSpace-relevant status message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access and verify mailbox/data continuity.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password/password-change defaults in Supabase repository configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml`; live Security Advisor on specified target
- **Evidence summary:** Repository configuration has historically specified a six-character password minimum, no composition requirement, and `secure_password_change = false`. The specified live target also reports leaked-password protection disabled, but it is AccessRevamp-oriented rather than the repository-pinned VibeSpace backend.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open; authoritative VibeSpace hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Use stronger passphrase-aligned minimums, enable recent reauthentication and leaked-password protection where supported, and verify password reset/change on the authoritative project.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Current counts are INBOX 2,092 / 1,512 unread, SPAM 142 / 95 unread, TRASH 260 / 219 unread. Public aliases, routing rules, queue ownership, response state, and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm public support routing with controlled external delivery and a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Live Supabase Security Advisor for specified target
- **Evidence summary:** Security Advisor still reports `auth_leaked_password_protection` disabled on `vbkkimvedmklebghtkzs`. Authoritative VibeSpace applicability remains unresolved because of VS-AUDIT-003.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability unverified
- **Affected component:** Password authentication
- **Recommended remediation:** Enable leaked-password protection where supported, strengthen password policy, and verify reset/change reauthentication on every in-scope environment.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView/native-command authority remains broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR browser/native changes
- **Evidence summary:** The desktop retains broad native functionality and a broad asset/CSP connectivity surface. Prior Browser Chat review found positive isolation controls and no arbitrary remote-content-to-privileged-IPC exploit was demonstrated. No application-code commit reached `main` this interval.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions, and require negative IPC/capability tests.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Historical live Supabase API logs; current empty API-log window
- **Evidence summary:** Historical logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. The current API-log query returned no entries, so no recurrence was observed; historical retention/path behavior has not been disproved. Traffic appeared AccessRevamp-related.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open historical privacy finding; no current recurrence observed
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes, minimize retention, restrict log access, and review historical deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub Dependabot/security configuration and default CI
- **Evidence summary:** Dependabot alerts remain disabled. Default CI has no repository-wide dependency-vulnerability audit gate and does not require every native/MCP security suite. Direct secret/code-scanning inventories remain integration-blocked. This is an assurance gap, not evidence of a currently exploitable dependency.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release reproducibility
- **Recommended remediation:** Enable reviewed dependency alerts/updates, add dependency audits for every package ecosystem, pin/lock release resolutions where appropriate, and require MCP/native security tests on the immutable release SHA.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation; prior direct review
- **Evidence summary:** Prior review established up to 24 media items, videos up to 40 MiB each, and no aggregate-byte ceiling, with representation/decoding paths capable of large duplicate memory footprints. No remote trigger or shipping to `main` was established. PR head is unchanged, so no fix was established.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies, and add near-limit stress tests.
- **Immediate owner attention:** Yes before merge/release

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** `.github/workflows/ci.yml`, prior PR release evidence, MCP Worker package
- **Evidence summary:** Default CI still runs Rust `cargo check --release` rather than the complete native unit/security suite, and dedicated MCP Worker checks remain outside the root required gate. Current `main` CI is green but does not close this coverage gap.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add Rust unit/security tests and MCP Worker test/typecheck/dry-run checks to required CI and require them on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts declared length instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 Cloudflare MCP Worker; prior direct review
- **Evidence summary:** Prior review found the MCP request guard relying on declared `Content-Length`, treating omission as zero, before handing the request to the MCP SDK. Authentication, canonical-host, and allowlisted-origin controls are present; no auth bypass/code execution was shown. PR head is unchanged, so no fix was established.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint and request resource consumption
- **Recommended remediation:** Enforce actual received-byte limits before SDK parsing regardless of headers and add omitted/inaccurate/chunked/oversized-body tests.
- **Immediate owner attention:** Yes before MCP deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 OAuth consent site; prior direct review
- **Evidence summary:** The consent page asks for credentials while importing Supabase JS directly from a third-party CDN at runtime. No malicious CDN behavior, XSS, or open redirect was demonstrated; the issue is avoidable supply-chain trust on a credential-handling origin. PR head is unchanged.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle/self-host the audited client, use a restrictive CSP, pin/verify build dependencies, and test the deployed artifact.
- **Immediate owner attention:** Yes before OAuth page deployment

### VS-AUDIT-027 — Model Foundry knowledge ingestion lacks aggregate source limits
- **Severity:** Medium
- **Source:** PR #31 Model Foundry UI/native ingestion path; prior direct review
- **Evidence summary:** Native multi-select source ingestion has a 64 MiB per-source limit but no source-count or aggregate-byte cap. Processing retains normalized chunks/artifacts in memory; a large aggregate selection can consume substantial memory/CPU/disk. This is a local availability/reliability risk, not a remote exploit claim. PR head is unchanged.
- **First seen:** 2026-08-09 05:02 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Model Foundry knowledge-source ingestion, native process memory/CPU/disk reliability
- **Recommended remediation:** Add maximum source count and aggregate-byte budgets in UI/native enforcement, stream/chunk large files, bound artifact size/active jobs, and add near-limit/concurrent stress tests.
- **Immediate owner attention:** Yes before merging/releasing Model Foundry

### VS-AUDIT-028 — Exact-head account-identity/cloud-sync lifecycle tests fail
- **Severity:** Medium
- **Source:** GitHub Actions exact-head run `31449158283` for PR #31
- **Evidence summary:** At current PR head `eda462d…`, dependency install, TypeScript, Vite build, and Rust compile pass, but Vitest fails and release-manifest validation is skipped. Prior annotations show duplicate/missing cloud-sync lifecycle calls and an expected authority becoming undefined. No production crash, cross-account access, or exploit is established.
- **First seen:** 2026-08-09 13:01 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open on draft PR #31; current exact-head CI failing
- **Affected component:** Account identity authority, cloud-sync loop lifecycle, frontend CI/release assurance
- **Recommended remediation:** Make account-authority transitions deterministic and single-owner, ensure old loops quiesce before replacement, await retry/cancellation cleanup, preserve focused regressions, and rerun the immutable head until Vitest/release-manifest validation are green.
- **Immediate owner attention:** Yes before merging/releasing PR #31

### VS-AUDIT-014 — Administrative identity/application authorization events
- **Severity:** Informational
- **Source:** Gmail Google/Supabase/Stripe/Fly.io/GitHub security and authorization notifications
- **Evidence summary:** A new Google-account sign-in alert arrived at 2026-08-12 01:54 UTC, and a Sign in with Google notice recorded a Hostinger authorization at 2026-08-11 22:00 UTC. The messages do not establish unauthorized access or VibeSpace impact, and sensitive account details are omitted. Historical authorization/recovery/sign-in notices likewise may be owner-initiated.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-12 01:54 UTC
- **Status:** Open; owner confirmation required for unrecognized activity
- **Affected component:** Administrative identity, password recovery, and connected third-party applications
- **Recommended remediation:** Confirm expected sign-ins/app authorizations in provider security activity; revoke unknown sessions/apps and rotate credentials if unrecognized; verify MFA/recovery controls.
- **Immediate owner attention:** Only if unrecognized/unexpected

### VS-AUDIT-015 — New Vercel administrative sign-in
- **Severity:** Informational
- **Source:** Historical Gmail Vercel security notification
- **Evidence summary:** Vercel historically reported a sign-in from a new location/device/browser. The alert did not establish unauthorized access or a VibeSpace-specific action; no new related signal was found.
- **First seen:** 2026-08-03 20:25 UTC
- **Last seen:** 2026-08-03 20:25 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Vercel administrative/deployment account; direct VibeSpace relevance unconfirmed
- **Recommended remediation:** Confirm in Vercel activity, revoke unknown sessions/tokens, and ensure MFA.
- **Immediate owner attention:** Only if unrecognized

### VS-AUDIT-010 — Database index advisory signals require observation
- **Severity:** Informational
- **Source:** Live Supabase Performance Advisor
- **Evidence summary:** Performance Advisor returns multiple `unused_index` informational candidates across the AccessRevamp-oriented schema and no higher-severity item in the returned set. Low/atypical traffic means the signal alone does not justify deletion.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Open; observe on relevant environment
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** Observe representative query statistics and remove/consolidate indexes only after proving redundancy and constraint/query safety on the authoritative project.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-012 — Verified sessions could update another customer profile
- **Severity:** Critical
- **Source:** Historical/current live Supabase RLS/profile/grant inspection of connected target
- **Evidence summary:** Historical state allowed a verified session to update a profile row without proving ownership. Current connected-target state has owner-bound update authority with RESTRICTIVE verified-session gating; current metadata also shows no public SECURITY DEFINER browser-executable function. No cross-account mutation test was performed.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen as open:** 2026-08-11 05:00 UTC
- **Resolved:** 2026-08-11 13:00 UTC
- **Status:** Resolved on specified connected project; authoritative VibeSpace backend still differs
- **Affected component:** Connected-project customer profile authorization
- **Recommended remediation:** Preserve owner-only policy/grant structure, add two-account negative tests, and independently verify the authoritative VibeSpace backend.
- **Immediate owner attention:** No for this connected-project defect; VS-AUDIT-003 remains High

### VS-AUDIT-001 — Verified-session RLS policies allowed cross-user reads
- **Severity:** Critical
- **Source:** Historical/current live Supabase policies/grants on connected target
- **Evidence summary:** Historical state had broad verified-session SELECT policies without row ownership. Current state uses owner-bound permissive policies plus verified-session RESTRICTIVE policies on affected data, and all listed public tables have RLS enabled. No cross-account data read was attempted.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen as open:** 2026-08-11 05:00 UTC
- **Resolved:** 2026-08-11 13:00 UTC
- **Status:** Resolved on specified connected project; authoritative VibeSpace backend still differs
- **Affected component:** Connected-project authorization boundary
- **Recommended remediation:** Preserve owner-bound policies/restrictive gates, require two-account negative tests, and verify the authoritative VibeSpace project.
- **Immediate owner attention:** No for this connected-project defect; VS-AUDIT-003 remains High

### VS-AUDIT-002 — Refund-request insertion was not bound to signed-in owner
- **Severity:** High
- **Source:** Historical/current live Supabase refund RLS/grants on connected target
- **Evidence summary:** Historical state combined an owner-bound insert with a permissive verified-session insert. Current state uses owner-bound refund insertion plus a RESTRICTIVE verified-session gate.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen as open:** 2026-08-11 05:00 UTC
- **Resolved:** 2026-08-11 13:00 UTC
- **Status:** Resolved on specified connected project; authoritative VibeSpace backend still differs
- **Affected component:** Refund-request integrity on connected environment
- **Recommended remediation:** Keep forged-owner/order negative tests in migration/authorization gates and verify the authoritative VibeSpace project.
- **Immediate owner attention:** No for this connected-project defect; VS-AUDIT-003/004 remain High

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical failing `main` runs and current successful run `31536748530`
- **Evidence summary:** This finding opened after an audit-log-only `main` head failed Vitest, was resolved, reopened after another audit-log-only failure, and is resolved again. Current pre-audit `main` head `654557b0…` changes only this audit log and its exact CI is green. No application-code remediation is claimed.
- **First seen:** 2026-08-07 05:06 UTC
- **Historically resolved:** 2026-08-07 21:00 UTC
- **Reopened:** 2026-08-09 21:03 UTC
- **Resolved again:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-12 05:00 UTC
- **Status:** Resolved for current `main` CI health
- **Affected component:** Default-branch frontend test lifecycle and release-manifest gate
- **Recommended remediation:** Continue deterministic async cleanup and keep Vitest/release-manifest validation required by branch governance.
- **Immediate owner attention:** No for this resolved signal; branch protection remains separately High

### VS-AUDIT-019 — Exact-head CI reported critical/high dependency advisories
- **Severity:** Medium
- **Source:** Historical PR #31 CI output and subsequent successful dependency review/audit
- **Evidence summary:** A prior PR run reported critical/high dependency advisories without package detail. A later exact-head dependency review and `npm audit` passed. VS-AUDIT-022 tracks repository-wide monitoring/reproducibility gaps.
- **First seen:** 2026-08-05 21:02 UTC
- **Last seen as open:** 2026-08-05 21:02 UTC
- **Resolved:** 2026-08-06 05:10 UTC
- **Status:** Resolved for that branch-head signal
- **Affected component:** PR #31 dependency assurance
- **Recommended remediation:** Continue immutable-release-candidate dependency review across every package ecosystem.
- **Immediate owner attention:** No

### VS-AUDIT-006 — `main` was failing CI
- **Severity:** High
- **Source:** Historical GitHub Actions release/CI history
- **Evidence summary:** `main` previously failed CI. PR #30 was subsequently merged and the v1.5.0 release run completed across Windows x64, Linux x64, macOS x64, and macOS arm64, including updater-signature verification/publication gates.
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen as open:** 2026-08-01 21:00 UTC
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
| 2026-08-02 21:00 | VS-AUDIT-012 opened for cross-profile updates. |
| 2026-08-03 03:06 | VS-AUDIT-014 opened for merged-account Google/Stripe sign-in alerts. |
| 2026-08-03 20:25 | VS-AUDIT-015 opened for a Vercel administrative sign-in alert. |
| 2026-08-04 16:26 | VS-AUDIT-016 opened for an RLS-disabled public table alert in another Supabase project. |
| 2026-08-04 20:47 | VS-AUDIT-017 opened for incomplete Google Workspace billing. |
| 2026-08-05 13:00 | VS-AUDIT-018 opened for the stale/invalid primary updater endpoint. |
| 2026-08-05 21:00 | VS-AUDIT-013 raised to High after PR #31 expanded massively and failed exact-head frontend validation; VS-AUDIT-019 opened; VS-AUDIT-017 temporarily resolved by a superseding billing notice. |
| 2026-08-06 05:15 | PR #31 exact-head CI/CodeQL became green but branch remained High risk; draft authorization migrations improved; VS-AUDIT-019 resolved; VS-AUDIT-020 opened. |
| 2026-08-06 13:00 | No new findings/resolutions; PR #31 remained large with green exact-head workflows; no application-code commit reached `main`; Supabase/Stripe live refresh stayed blocked. |
| 2026-08-07 05:06 | VS-AUDIT-021 opened after audit-log-only `main` CI failed Vitest; VS-AUDIT-017 reopened after Google reported Workspace suspension. |
| 2026-08-07 13:04 | PR #31 current head re-established with successful exact-head Actions; stale updater/weak auth defaults unchanged; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-07 21:00 | VS-AUDIT-022 opened because Dependabot vulnerability alerts were disabled and no dependency audit gate/config existed; VS-AUDIT-021 resolved after green `main` reruns. |
| 2026-08-08 05:05 | VS-AUDIT-023 opened for missing aggregate chat-media byte budget; PR #31 advanced with green CI/AI-boundary; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-08 13:15 | VS-AUDIT-024 opened because native security/governance tests were not fully mandatory in default CI. |
| 2026-08-08 21:13 | VS-AUDIT-025 opened for the Cloudflare MCP actual-body-size enforcement gap; VS-AUDIT-026 opened for third-party runtime JavaScript on the OAuth credential page. |
| 2026-08-09 05:02 | VS-AUDIT-027 opened for missing Model Foundry aggregate source limits. Repository release evidence mapped the connected Supabase target as AccessRevamp-oriented and a different project as the repository-pinned VibeSpace issuer. |
| 2026-08-09 13:01 | VS-AUDIT-028 opened after PR #31 exact-head Vitest failed with Ollama/account-lifecycle failures; AI-boundary and Rust compile checks remained successful. |
| 2026-08-09 21:03 | VS-AUDIT-029 opened after branch/ruleset reads showed `main` unprotected with no enforced ruleset. VS-AUDIT-030 opened for mutable action references in the signed release pipeline. VS-AUDIT-021 reopened because an audit-log-only `main` head failed Vitest. |
| 2026-08-10 05:00 | VS-AUDIT-031 opened after PR #31 was found deleting the documented Windows installer despite PR safety text saying the deletion was protected/not authorized. PR head remained frontend-red; current `main` CI became green and VS-AUDIT-021 resolved again. |
| 2026-08-10 13:02 | No new/resolved findings. `main` advanced only by prior audit-log commit; CI green. PR #31 remained frontend-red; governance/updater/release/auth/dependency gaps revalidated. Gmail and blocked Supabase/Stripe state recorded. |
| 2026-08-10 21:00 | No new/resolved findings. `main` remained green; PR #31 remained frontend-red; branch protection/ruleset, updater, release-action, dependency, and environment-access gaps persisted. |
| 2026-08-11 05:00 | No new/resolved findings. PR #31 advanced to `eda462d…`; exact-head frontend CI red on account-identity/cloud-sync tests, AI-boundary/Rust checks green; installer absent; Stripe connected to wrong sandbox; Supabase live reads still blocked. |
| 2026-08-11 13:00 | Major live Supabase revalidation. VS-AUDIT-001, VS-AUDIT-002, and VS-AUDIT-012 resolved on the specified connected project after current owner-bound/restrictive policy review. Target still AccessRevamp-oriented; requested Stripe target remained inaccessible. |
| 2026-08-11 21:00 | No new/resolved findings. A Supabase advisor email reported RLS disabled in another project, strengthening VS-AUDIT-016. Specified target remained RLS-enabled on all listed public tables; historical webhook warning persisted; `main` green/unprotected; PR #31 201 ahead/16 behind and frontend-red. |
| 2026-08-12 05:00 | **No new or newly resolved findings.** `main` advanced only by the prior audit-log commit `654557b0…`; exact CI `31536748530` is green. PR #31 remains `eda462d…`, 201 ahead/17 behind, frontend-red at Vitest, and missing the Windows installer. Branch protection/rulesets, stale updater, mutable release actions, disabled Dependabot, secret/code-scanning visibility, and incomplete native/MCP required tests remain open. Management project listing now directly reinforces that `tipeob…` is the visible active VibeSpace-pinned Supabase project while requested `vbkk…` remains AccessRevamp-oriented. The requested Stripe account remains unreadable because the connected OAuth session is a different sandbox and lacks account-retrieve permission. Gmail counts are INBOX 2,092/1,512 unread, SPAM 142/95 unread, TRASH 260/219 unread; a new Google sign-in alert and Hostinger authorization notice update VS-AUDIT-014 without proving unauthorized access. Specified-target Supabase advisors/RLS/storage/functions/logs/payment aggregates were revalidated; leaked-password protection remains disabled and the single historical webhook warning remains open. No remediation was performed. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.