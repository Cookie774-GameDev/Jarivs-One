# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, recovery codes, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-10 13:02 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 10 |
| Medium | 13 |
| Low | 0 |
| Informational | 3 |
| Resolved currently | 3 |
| Historical resolution events | 4 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live check of the connected Supabase target found that a verified authenticated session could update another customer's `profiles` row without proving ownership. Current repository evidence maps the connected target as AccessRevamp-oriented rather than the repository-pinned VibeSpace backend, so direct VibeSpace production applicability remains unconfirmed. Live revalidation is permission-blocked.
2. **VS-AUDIT-001 — Critical:** The last successful live check of the connected Supabase target found nine broad verified-session `SELECT` policies without row ownership. Current repository environment mapping disputes direct VibeSpace applicability; the connected-project defect remains unresolved and live policy state cannot currently be refreshed.
3. **VS-AUDIT-031 — High:** Draft PR #31 still lacks `install/install.ps1`, even though `main` publicly documents that file as the Windows one-line installer and the PR description says destructive installer changes are not authorized. If merged as-is, the documented Windows install path would break.
4. **VS-AUDIT-029 — High:** `main` remains unprotected, legacy required-status enforcement remains off, and the repository has no rulesets. Writers can technically bypass PR/review/CI enforcement. No unauthorized push is claimed.
5. **VS-AUDIT-030 — High:** The signed release workflow still uses mutable action references while the release job has repository-write authority and access to signing material. No upstream action compromise is alleged.
6. **VS-AUDIT-018 — High:** `main` still identifies VibeSpace as `1.5.0` but checks first a raw updater manifest advertising only `0.1.48`, Windows x64, with no artifact-signature field.
7. **VS-AUDIT-016 — High:** A historical Supabase Security Advisor email reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace relevance remains unconfirmed.
8. **VS-AUDIT-002 — High:** A permissive refund-request insert policy on the connected Supabase target was not bound to `auth.uid()` at the last successful live check. Direct VibeSpace applicability remains environment-dependent.
9. **VS-AUDIT-003 — High:** The user-specified connected Supabase target still does not match the repository-pinned VibeSpace issuer described by current PR evidence.
10. **VS-AUDIT-004 — High:** The specified Stripe account and Supabase payment/catalog/runtime evidence remain unreconciled; current live Stripe reads are blocked by interactive authentication.
11. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified; direct secret-scanning alert inventory remains inaccessible.
12. **VS-AUDIT-013 — High:** PR #31 remains a very large security-sensitive draft. Head `33630c7f4c590593bc902d3da9322e918675670e` is unchanged, is now 195 commits ahead/12 behind current `main`, and its exact-head frontend CI remains red.

## Current run summary

### Checks completed

- **GitHub/default branch:** fetched this audit log before work and again immediately before the only write. Current pre-audit `main` head was `c7afa0674f876d9f00598da9cadcf8c0484abfc0`, which only updated this operational audit Markdown file. Its exact CI run `31357727500` is fully green: dependency installation, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check` all passed. No application-code commit reached `main` since the previous audit.
- **GitHub/governance:** GitHub still reports `main` as `protected: false`, legacy required-status enforcement off, and the repository rulesets endpoint remains empty. GitHub Discussions are disabled. Dependabot alerts remain explicitly disabled. Direct secret-scanning alert inventory remains inaccessible to the integration.
- **GitHub/PR #31:** current exact head remains `33630c7f4c590593bc902d3da9322e918675670e`, open and draft, with **1,568 changed files, 185,683 additions, 10,621 deletions, and 195 commits**. Compared with current `main`, it is **195 commits ahead and 12 behind**. GitHub currently reports it mergeable but with `mergeable_state: unstable`. Its exact-head CI `31336463326` remains red: install/typecheck/build and Rust `cargo check` pass, Vitest fails, and release-manifest validation is skipped. No new PR commit arrived during this audit interval.
- **GitHub/collaboration:** no issue or pull request updated since the previous audit cutoff was returned; no new issue comments or PR review comments were returned. Repository metadata reports Discussions disabled.
- **Windows installer/release path:** `install/install.ps1` still returns `404 Not Found` when fetched at the current PR #31 head. The file remains present on `main`, and release/documentation paths still refer to it. VS-AUDIT-031 therefore remains open and unshipped.
- **Updater/release/dependency configuration:** revalidated `main` app version `1.5.0`, the stale first updater manifest `0.1.48`/Windows-only/no signature field, mutable release action references, default CI's Rust compile-only gate, Dependabot-disabled state, and repository Supabase auth defaults. Selected indexed searches returned no literal `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, or `Access-Control-Allow-Origin` match; these zero-result searches are **not** proof of absence from history, forks, other branches, caches, or non-indexed content.
- **Gmail:** merged-inbox metadata is **INBOX 2,049 total / 1,471 unread**, **SPAM 139 / 90 unread**, **TRASH 260 / 219 unread**. Interval-targeted searches covered VibeSpace/vibespaceos.com, GitHub, Stripe, Supabase, support/bug/crash/error/security/unauthorized/login/recovery, payment/refund/dispute/webhook/invoice/subscription/billing, and relevant spam/trash. No clear new VibeSpace customer-support, payment/refund/dispute/webhook, confirmed unauthorized-login, security, or application-incident email was established. One spam result was an unrelated promotional subscription message and was not treated as a VibeSpace finding. No email, label, read state, or inbox state was modified.
- **Supabase:** attempted Security Advisor, Performance Advisor, API/Auth/Postgres/Edge Function/storage/realtime/branch-action logs, public-table listing, migrations, Edge Functions, branches, and a read-only `pg_policies` query for project `vbkkimvedmklebghtkzs`. Every live operation returned `You do not have permission to perform this action`. No Supabase write was invoked.
- **Stripe:** attempted current account information and read-operation discovery for payment intents. Both require interactive user authentication/input in the available connector and could not execute in this run. No Stripe write was invoked.

### New findings

- **None.** No new evidence met the threshold for a distinct finding.

### Changed/revalidated findings

- **VS-AUDIT-013:** PR #31 head is unchanged, but because `main` advanced by the previous audit-log commit it is now 195 commits ahead/12 behind current `main`; GitHub reports mergeable/unstable and exact-head frontend CI remains red.
- **VS-AUDIT-031:** revalidated; the Windows installer file remains absent at the PR head.
- **VS-AUDIT-029:** revalidated; `main` remains unprotected and repository rulesets remain empty.
- **VS-AUDIT-030:** revalidated; release workflow continues to use mutable action references with release/write/signing authority.
- **VS-AUDIT-018:** revalidated; `main` is `1.5.0` while the first updater manifest is still `0.1.48`, Windows-only, and lacks a signature field.
- **VS-AUDIT-020 / VS-AUDIT-022 / VS-AUDIT-024:** weak repository auth defaults, disabled Dependabot, and incomplete required native/MCP test coverage remain unchanged.
- **VS-AUDIT-007:** Gmail volume changed to the counts above; targeted searches found no clearly actionable new VibeSpace customer/security/billing incident.
- **VS-AUDIT-001 / 002 / 003 / 004 / 008 / 010 / 011 / 012:** live Supabase/Stripe state could not be refreshed; prior evidence and environment-scope caveats remain in force.

### Resolved findings

- **None newly resolved.** VS-AUDIT-021 remains resolved because the current exact `main` head CI is green.

### Connector failures and blind spots

- **Supabase:** project-level permission denial blocks advisors, logs, tables, migrations, functions, branches, storage/realtime state, performance state, and direct RLS/database verification. Latest successful live validation available to this audit remains **2026-08-02 21:00 UTC**. Repository evidence also says the specified target is not the repository-pinned VibeSpace backend.
- **Stripe:** current account/payment/refund/dispute/subscription/invoice/webhook/suspicious-activity/account-health reads require interactive authentication/input and could not execute. Latest successful live Stripe validation available to this audit remains **2026-08-02 21:00 UTC**.
- **GitHub:** direct secret-scanning alert inventory is integration-blocked and Dependabot alerts are disabled. PR #31 is too large for exhaustive dynamic or line-by-line review in one pass.
- **Runtime/release:** packaged Windows/macOS/Linux execution, signed Windows installer validation, authoritative production Supabase migrations, live two-account authorization, Stripe test-mode lifecycle/webhooks, deployed OAuth/MCP, rollback, high-volume media/Model Foundry stress, and long-duration soak/capacity remain unverified.
- **Gmail:** merged-account scale, aliases/routing, queue ownership, response state, and SLA tracking limit completeness. Relevant spam/trash were searched, but no-match does not guarantee absence elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update another customer profile
- **Severity:** Critical
- **Source:** Last successful live Supabase RLS/profile inspection of the connected target; repository/PR environment evidence
- **Evidence summary:** The last successful live check found a verified-session update policy on `profiles` that did not require row ownership. Current repository evidence maps the connected target as AccessRevamp-oriented rather than the repository-pinned VibeSpace issuer, so direct VibeSpace production applicability is unconfirmed. No cross-account write was attempted by this audit.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability and current live state unverified
- **Affected component:** Connected-project customer profile authorization and server-owned identity/billing fields
- **Recommended remediation:** Establish the authoritative VibeSpace Supabase project, deploy an owner-only policy/grant reset on every project still in scope, and run two-account negative read/update plus server-role billing-field tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads
- **Severity:** Critical
- **Source:** Last successful live Supabase policies/grants on the connected target; current repository environment mapping
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies accepted verified-session state without row ownership across customer/project/order/entitlement/delivery/design/workflow/update/refund data at the last successful live check. Current environment evidence makes direct VibeSpace production applicability unconfirmed.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Connected-project authorization boundary; direct VibeSpace production relevance unresolved
- **Recommended remediation:** Confirm environment ownership, remove session-only permissive policies, require direct ownership or tightly scoped staff roles, and run two-account negative tests across exposed tables/RPCs.
- **Immediate owner attention:** Yes

### VS-AUDIT-031 — Draft PR deletes the documented Windows one-line installer
- **Severity:** High
- **Source:** Current PR #31 file state/description; `main` installer and release/documentation references
- **Evidence summary:** `install/install.ps1` is still absent at the current PR head while `main` continues to provide and document it. The PR description says the unexplained installer deletion is protected/excluded and destructive installer changes are not authorized. If merged as-is, the documented Windows one-line install path would fail. No current production impact is claimed because the deletion is unmerged.
- **First seen:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Windows installation/update entry point and release documentation
- **Recommended remediation:** Before merge, restore the installer or intentionally replace the Windows install mechanism and update every reference in the same reviewed change; add CI asserting documented installer paths exist and parse/dry-run successfully.
- **Immediate owner attention:** Yes before merging or releasing PR #31

### VS-AUDIT-029 — Default branch has no enforced protection or ruleset
- **Severity:** High
- **Source:** GitHub `main` branch metadata and repository rulesets API
- **Evidence summary:** GitHub still reports `main` with `protected: false`, required-status enforcement off, and no repository rulesets. A direct push is technically possible without a repository-enforced PR/review/CI gate. No unauthorized push is claimed.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open
- **Affected component:** Default-branch integrity, merge/release governance, security-sensitive code and automation
- **Recommended remediation:** Add an enforced ruleset/branch policy requiring PRs, independent approvals, required current CI/security checks, blocking force-push/deletion, and tightly restricted bypass actors.
- **Immediate owner attention:** Yes

### VS-AUDIT-030 — Signed release workflow uses mutable action references
- **Severity:** High
- **Source:** `.github/workflows/release.yml`
- **Evidence summary:** The official release workflow still invokes mutable references including `dtolnay/rust-toolchain@stable`, `swatinem/rust-cache@v2`, and `tauri-apps/tauri-action@v0`. The release job has repository-write authority and receives updater/private and Windows signing material. No action compromise is alleged; signature/hash validation is a positive control but does not eliminate pre-build supply-chain trust.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open
- **Affected component:** GitHub Actions release supply chain, signing/updater keys, official artifacts
- **Recommended remediation:** Pin all release actions to reviewed immutable full commit SHAs, minimize job token permissions, place signing secrets behind protected release environments/approval, and document controlled SHA updates.
- **Immediate owner attention:** Yes before the next signed release

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and incomplete
- **Severity:** High
- **Source:** `main` `app/src-tauri/tauri.conf.json` and `releases/channel.json`
- **Evidence summary:** `main` identifies VibeSpace as `1.5.0` while its first updater endpoint still serves `0.1.48`, only Windows x64, and no artifact-signature field. No application-code commit reached `main` in the interval.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on `main`; draft remediation has previously been observed in PR #31
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Merge only after immutable-SHA review, then package-test signed update discovery/rollback and require manifest target/URL/signature validation in release gating.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — RLS-disabled public table alert in another Supabase project
- **Severity:** High
- **Source:** Historical Gmail Supabase Security Advisor notification
- **Evidence summary:** Supabase reported `rls_disabled_in_public` for a public-schema table in a project that did not match the specified audit target. The table was not identified in the email; direct VibeSpace impact remains unconfirmed. No superseding relevant alert was found this run.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; no superseding relevant notice)
- **Status:** Open; owner validation required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Identify the project/table directly, determine whether public access is intentional, enable/test RLS if not, and document any VibeSpace dependency.
- **Immediate owner attention:** Yes

### VS-AUDIT-002 — Refund-request insertion is not bound to signed-in owner
- **Severity:** High
- **Source:** Last successful live Supabase RLS policies/grants on the connected target
- **Evidence summary:** The last live check found an owner-bound insert policy plus a second permissive verified-session policy. PostgreSQL permissive policies combine with OR semantics. Current repository environment evidence makes direct VibeSpace applicability uncertain and live state cannot be refreshed.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Refund-request integrity on the connected environment
- **Recommended remediation:** Confirm environment ownership, remove broad insert policies, require `user_id = auth.uid()` and ownership-checked eligible orders, and test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase audit target does not match repository-pinned VibeSpace backend evidence
- **Severity:** High
- **Source:** Last successful connected-project inspection; current PR #31 release/environment evidence
- **Evidence summary:** The connected project previously appeared AccessRevamp-oriented, while current PR evidence explicitly describes another Supabase project as the repository-pinned VibeSpace issuer. Repository content is evidence, not live connector proof, but the scope mismatch remains material.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Last successfully validated live:** 2026-08-02 21:00 UTC for the connected target
- **Status:** Open; environment mismatch materially established but authoritative live target is not connected
- **Affected component:** Audit coverage, authentication, deployment assurance, environment isolation
- **Recommended remediation:** Document one authoritative production VibeSpace project/owner, reconnect read-only audit access to that exact project, reconcile app/Edge Function/MCP/deployment configuration, and rerun advisors/RLS/log/function checks.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Last successful Stripe reads, Supabase payment/catalog/runtime evidence, historical Gmail Stripe notices, current blocked Stripe access
- **Evidence summary:** At the last successful live check, the specified Stripe account did not reconcile with connected Supabase catalog/order/runtime state and historical webhook-failure evidence. Current live Stripe account/payment reads remain blocked by interactive authentication.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live refresh blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Checkout, payment fulfillment, subscriptions, webhooks, environment configuration
- **Recommended remediation:** Identify/document the authoritative VibeSpace Stripe account/environment, reconcile catalog/prices with the authoritative backend, verify webhook endpoint/signing-secret configuration without exposing secrets, and run isolated test-mode purchase/failure/refund/subscription/reconciliation flows.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern
- **Severity:** High
- **Source:** Historical GitHub secret-scanning notification; current search/alert endpoint limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Current selected literal searches return no result, but direct secret-scanning alerts remain inaccessible and current-index absence does not clear history/forks or prove the value synthetic/revoked.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly, prove the value synthetic or rotate/revoke it, replace key-shaped fixtures, inspect history/forks/caches, and close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge/deploy without additional release evidence
- **Severity:** High
- **Source:** GitHub PR metadata/comparison, exact-head Actions, selected code/release review
- **Evidence summary:** Current head `33630c7f4c590593bc902d3da9322e918675670e` remains open/draft with 1,568 files, 185,683 additions, 10,621 deletions, and 195 commits; it is now 195 ahead/12 behind current `main`. GitHub reports mergeable but unstable. Exact-head Rust compile passes, but frontend CI fails Vitest and skips release-manifest validation. The branch spans auth, Supabase/Stripe, Tauri/native authority, browser/MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime, and deployment tooling, and still lacks the documented Windows installer.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open; unmerged draft; exact-head frontend CI failing and production-like evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope, sync `main`, resolve installer ownership, fix/re-run exact-head CI, require independent subsystem/security/billing/native review and dedicated suites, and validate packaged multi-platform apps, authoritative migrations, two-account authorization, Stripe test mode, OAuth/MCP deployment, rollback, and resource-exhaustion/soak on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Historical Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior Google notice said the merged AccessRevamp-oriented Workspace Business Starter subscription was suspended because billing setup was incomplete. No evidence establishes VibeSpace dependency and no superseding VibeSpace-relevant status message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; no superseding relevant notice)
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access, verify mailbox/data continuity, and document tenant isolation.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password/password-change defaults in Supabase repository configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml`
- **Evidence summary:** Repository configuration still specifies a six-character minimum password, no composition requirement, and `secure_password_change = false`. Hosted applicability cannot be verified because live Supabase access is permission-blocked.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Adopt stronger passphrase-aligned minimums, enable recent reauthentication for password changes and leaked-password protection where supported, and verify normal/recovery password-change flows on the authoritative hosted project.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Current counts are INBOX 2,049 / 1,471 unread, SPAM 139 / 90 unread, TRASH 260 / 219 unread. At least one VibeSpace-domain route was previously evidenced, but public aliases, routing rules, queue ownership, response state, and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm public support routing with controlled external delivery and a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Last successful live Supabase Security Advisor
- **Evidence summary:** The last successful advisor check reported leaked-password protection disabled. Current advisor access is permission-denied, and direct VibeSpace applicability must be reassessed against the authoritative project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability unverified
- **Affected component:** Password authentication
- **Recommended remediation:** On the authoritative VibeSpace project, verify/enable leaked-password protection, strengthen password policy, and verify reset/change reauthentication.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView/native-command authority remains broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR browser/native changes
- **Evidence summary:** The desktop retains broad native functionality and PR #31 adds browser/provider/native surfaces. The current `main` CSP and asset protocol remain broad enough to merit hardening review. Previously reviewed Browser Chat/MCP paths use scoped/authenticated/read-only controls. No arbitrary remote-content-to-privileged-IPC exploit was demonstrated.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions, and require negative IPC/capability tests.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Last successful live Supabase API logs
- **Evidence summary:** Prior live logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. Traffic appeared AccessRevamp-related. Current logs are permission-blocked and environment mapping reduces confidence this is a VibeSpace path.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; direct VibeSpace relevance unconfirmed
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes, minimize retention, restrict log access, and review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub Dependabot/security configuration and default CI
- **Evidence summary:** Dependabot alerts remain explicitly disabled. Default CI has no repository-wide dependency-vulnerability audit gate and does not require every native/MCP security suite. Direct secret-scanning inventory remains integration-blocked. This is a monitoring/release-assurance gap, not evidence of a currently exploitable dependency.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable reviewed dependency alerts/updates, add dependency audit/review for every package ecosystem, pin/lock release resolutions where appropriate, and require MCP Worker/native security tests on the immutable release SHA.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation; prior direct review
- **Evidence summary:** Prior review established up to 24 media items, videos up to 40 MiB each, and no aggregate-byte ceiling, with representation/decoding paths capable of large duplicate memory footprints. No remote trigger or shipping to `main` was established. The PR head is unchanged, so no interval fix was established.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies, and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Yes before merge/release

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** `.github/workflows/ci.yml`, prior PR release evidence, MCP Worker package
- **Evidence summary:** Default CI still runs Rust `cargo check --release` rather than the complete native unit/security suite, and dedicated MCP Worker checks remain outside the root required gate. Current `main` CI is green but does not close this coverage gap.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add appropriate Rust unit/security tests and MCP Worker test/typecheck/dry-run checks to required CI and require them on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts declared length instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 Cloudflare MCP Worker; prior/current-head review evidence
- **Evidence summary:** Current PR code previously reviewed parses `Content-Length`, treats omission as zero, rejects only declared sizes above its limit, then hands the original request to the MCP SDK without independently counting actual body bytes. Authentication, canonical-host, and allowlisted-origin controls are present; no auth bypass/code execution was shown. The PR head is unchanged.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint and request resource consumption
- **Recommended remediation:** Enforce actual received-byte limits before SDK parsing regardless of headers and add omitted/inaccurate/chunked/oversized-body tests while preserving auth/origin/host checks.
- **Immediate owner attention:** Yes before MCP deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 OAuth consent site; prior direct review
- **Evidence summary:** The consent page asks for credentials while importing Supabase JS directly from a third-party CDN at runtime. No malicious CDN behavior, XSS, or open redirect was demonstrated; the issue is avoidable supply-chain trust on a credential-handling origin. The PR head is unchanged.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle/self-host the exact audited client, use a restrictive self-centered CSP, pin/verify build dependencies, and test the deployed artifact.
- **Immediate owner attention:** Yes before OAuth page deployment

### VS-AUDIT-027 — Model Foundry knowledge ingestion lacks aggregate source limits
- **Severity:** Medium
- **Source:** PR #31 Model Foundry UI/native ingestion path; prior direct review
- **Evidence summary:** Native multi-select source ingestion has a 64 MiB per-source limit but no source-count or aggregate-byte cap. Processing reads source content and retains normalized chunks/artifacts in memory; a large aggregate selection can consume substantial memory/CPU/disk. This is a local availability/reliability risk, not a remote exploit claim. The PR head is unchanged.
- **First seen:** 2026-08-09 05:02 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Model Foundry knowledge-source ingestion, native process memory/CPU/disk reliability
- **Recommended remediation:** Add explicit maximum source count and aggregate-byte budgets in UI and native enforcement, stream/chunk large files, bound total artifact size/active jobs, and add near-limit/many-file/concurrent-job stress tests.
- **Immediate owner attention:** Yes before merging/releasing Model Foundry

### VS-AUDIT-028 — Exact-head account-identity/cloud-sync lifecycle tests fail
- **Severity:** Medium
- **Source:** GitHub Actions exact-head run `31336463326` for PR #31
- **Evidence summary:** At current PR head `33630c7...`, dependency install, TypeScript, Vite build, and Rust compile pass, but Vitest fails and release-manifest validation is skipped. Prior annotations for this exact head showed duplicate/missing cloud-sync lifecycle assertions and one expected authority becoming undefined. No production crash, cross-account access, or exploit is established; this is a release-assurance defect.
- **First seen:** 2026-08-09 13:01 UTC
- **Last seen:** 2026-08-10 13:02 UTC
- **Status:** Open on draft PR #31; current exact-head CI failing
- **Affected component:** Account identity authority, cloud-sync loop lifecycle, frontend CI/release assurance
- **Recommended remediation:** Make account-authority transitions deterministic and single-owner, ensure old loops quiesce before replacement, await retry/cancellation cleanup, preserve focused regressions, and rerun the immutable head until Vitest/release-manifest validation are green.
- **Immediate owner attention:** Yes before merging/releasing PR #31

### VS-AUDIT-014 — Administrative identity/application authorization events
- **Severity:** Informational
- **Source:** Historical Gmail Google/Supabase/Stripe/Fly.io/GitHub security and authorization notifications
- **Evidence summary:** Historical authorization/recovery/sign-in notices may be owner-initiated and did not establish unauthorized access. No new confirmed compromise was established this run; no recovery value or sensitive account content is recorded here.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; no new confirmed compromise)
- **Status:** Open; owner confirmation required for unrecognized activity
- **Affected component:** Administrative identity, password recovery, and connected third-party applications
- **Recommended remediation:** Confirm expected recovery requests/sign-ins/app authorization in provider security activity; revoke unknown sessions/apps and rotate credentials if unrecognized; verify MFA/recovery controls.
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
- **Source:** Last successful Supabase Performance Advisor
- **Evidence summary:** The last successful advisor check reported unused/duplicate-index signals. The database was young/low-traffic, so signal alone did not justify deletion. Current advisor state is permission-blocked and direct VibeSpace applicability depends on authoritative project identity.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; observe on relevant environment
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** On the authoritative project, observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical failing `main` runs and current successful run `31357727500`
- **Evidence summary:** This finding first opened after an audit-log-only `main` head failed Vitest, was resolved after green reruns, reopened after another audit-log-only failure, and is currently resolved again. Current pre-audit `main` head `c7afa067...` changes only this audit log and its exact CI fully passes install, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check`. No application-code remediation is claimed.
- **First seen:** 2026-08-07 05:06 UTC
- **Historically resolved:** 2026-08-07 21:00 UTC
- **Reopened:** 2026-08-09 21:03 UTC
- **Resolved again:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-10 13:02 UTC (current `main` remains green)
- **Status:** Resolved for current `main` CI health
- **Affected component:** Default-branch frontend test lifecycle and release-manifest gate
- **Recommended remediation:** Continue deterministic cleanup of asynchronous Ollama/account-identity work and keep Vitest/release-manifest validation required by branch governance.
- **Immediate owner attention:** No for this resolved signal; branch protection remains separately High

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
| 2026-08-07 13:04 | PR #31 current head re-established with successful exact-head Actions; stale updater/weak auth defaults unchanged; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-07 21:00 | VS-AUDIT-022 opened because Dependabot vulnerability alerts were disabled and no dependency audit gate/config existed; VS-AUDIT-021 resolved after green `main` reruns. |
| 2026-08-08 05:05 | VS-AUDIT-023 opened for missing aggregate chat-media byte budget; PR #31 advanced with green CI/AI-boundary; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-08 13:15 | VS-AUDIT-024 opened because native security/governance tests were not fully mandatory in default CI. |
| 2026-08-08 21:13 | VS-AUDIT-025 opened for the Cloudflare MCP actual-body-size enforcement gap; VS-AUDIT-026 opened for third-party runtime JavaScript on the OAuth credential page. |
| 2026-08-09 05:02 | VS-AUDIT-027 opened for missing Model Foundry aggregate source limits. Repository release evidence mapped the connected Supabase target as AccessRevamp-oriented and a different project as the repository-pinned VibeSpace issuer. |
| 2026-08-09 13:01 | VS-AUDIT-028 opened after PR #31 exact-head Vitest failed with Ollama/account-lifecycle failures; AI-boundary and Rust compile checks remained successful. |
| 2026-08-09 21:03 | VS-AUDIT-029 opened after branch/ruleset reads showed `main` unprotected with no enforced ruleset. VS-AUDIT-030 opened for mutable action references in the signed release pipeline. VS-AUDIT-021 reopened because an audit-log-only `main` head failed Vitest. |
| 2026-08-10 05:00 | VS-AUDIT-031 opened after PR #31 was found deleting the documented Windows installer despite PR safety text saying the deletion was protected/not authorized. PR head `33630c7...` remained frontend-red; current `main` CI became green and VS-AUDIT-021 resolved again. |
| 2026-08-10 13:02 | No new or newly resolved findings. `main` advanced only by the prior audit-log commit `c7afa067...`; exact CI is fully green. PR #31 head remains `33630c7...`, now 195 ahead/12 behind current `main`, mergeable but unstable, with exact-head frontend CI still red. Main remains unprotected/no rulesets; stale updater, mutable release refs, weak auth defaults, disabled Dependabot, installer deletion, and incomplete required native/MCP tests were revalidated. No interval issues/PRs/review or issue comments were returned; Discussions remain disabled. Gmail counts are INBOX 2,049/1,471 unread, SPAM 139/90 unread, TRASH 260/219 unread with no new clear VibeSpace operational/security/billing signal. Supabase live reads remain permission-denied and Stripe live reads require interactive authentication. No remediation was performed. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.
