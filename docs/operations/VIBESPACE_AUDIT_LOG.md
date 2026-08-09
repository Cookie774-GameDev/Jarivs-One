# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-09 21:03 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 9 |
| Medium | 14 |
| Low | 0 |
| Informational | 3 |
| Resolved currently | 2 |
| Historical resolution events | 3 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live check of the connected Supabase target found that a verified authenticated session could update another customer's `profiles` row without proving ownership. Current repository evidence says that connected target is AccessRevamp-oriented rather than the repository-pinned VibeSpace backend, so direct VibeSpace production applicability is unconfirmed; the authorization defect remains Critical on the connected project until authoritative environment ownership and live remediation are verified.
2. **VS-AUDIT-001 — Critical:** The last successful live check of the connected Supabase target found nine broad verified-session `SELECT` policies without row ownership. Current repository environment mapping disputes direct VibeSpace applicability, but the connected-project defect remains unresolved and live policy state could not be refreshed.
3. **VS-AUDIT-029 — High, NEW:** GitHub reports `main` is not protected, legacy required-status enforcement is off, and the repository has no rulesets. A writer can therefore push directly to the default branch without a repository-enforced PR/review/CI gate. No unauthorized push is claimed.
4. **VS-AUDIT-030 — High, NEW:** The official release workflow uses mutable action references, including third-party actions, while the release job receives repository write authority and desktop signing secrets. No upstream action compromise is alleged, but this is a release supply-chain trust gap that should be closed before the next signed release.
5. **VS-AUDIT-018 — High:** `main` still ships the stale first updater endpoint: app version `1.5.0` points first to a `0.1.48` Windows-only manifest with no artifact signature field. PR #31 removes that legacy endpoint, but the correction is unmerged.
6. **VS-AUDIT-016 — High:** Supabase previously reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact remains unconfirmed.
7. **VS-AUDIT-002 — High:** A permissive refund-request insert policy on the connected Supabase target was not bound to `auth.uid()` at the last successful live check. Direct VibeSpace applicability is environment-dependent and unconfirmed.
8. **VS-AUDIT-003 — High:** Repository release evidence explicitly maps the user-specified connected Supabase target as AccessRevamp-only and a different project as the repository-pinned VibeSpace issuer. The audit target therefore does not currently match the backend described by the application branch, and authoritative production ownership must be resolved.
9. **VS-AUDIT-004 — High:** The user-specified Stripe account and Supabase payment/catalog/runtime evidence remain unreconciled; live Stripe reads were blocked again.
10. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved; direct secret-scanning alert inventory is still inaccessible.
11. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft. Current head `b52e964e...` is 188 commits ahead/10 behind `main`, spans 1,475 files, and fails exact-head frontend CI even though its AI-boundary workflow and Rust compile check pass.
12. **VS-AUDIT-021 — Medium, REOPENED:** Current `main` CI is red on the audit-log-only head. Vitest fails with asynchronous Ollama work surviving test teardown and release-manifest validation is skipped; this is not evidence that the Markdown change regressed application code.
13. **VS-AUDIT-028 — Medium:** PR #31 exact-head CI still fails Vitest with repeated unhandled `AbortError` annotations from Ollama bootstrap cancellation during account-identity tests.
14. **VS-AUDIT-027 — Medium:** PR #31 Model Foundry knowledge ingestion has a 64 MiB per-file limit but no source-count or aggregate-byte ceiling.
15. **VS-AUDIT-025 — Medium:** The Cloudflare MCP gateway's prior actual-body-size enforcement gap remains open on the draft branch.
16. **VS-AUDIT-026 — Medium:** The OAuth credential page's prior third-party runtime JavaScript trust finding remains open on the draft branch.
17. **VS-AUDIT-024 — Medium:** Local native test evidence exists, but default required CI still does not make all Rust/MCP security tests mandatory.
18. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain remains recorded as suspended for incomplete billing setup; VibeSpace dependency is unconfirmed.
19. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** New password-recovery/reset and Google/GitHub sign-in notices were observed. They may reflect legitimate testing/owner activity and do not establish account compromise; owner confirmation is appropriate if unrecognized.

## Current run summary

### Checks completed

- **GitHub/default branch:** fetched the audit log before work and re-fetched its exact current blob immediately before the only write. Current `main` is `d4481c096d3e10952c2b103abb7d48db266ee60c`, an audit-log-only commit. GitHub reports `protected: false`, required-status enforcement off, and the repository rulesets endpoint returns an empty list. Current `main` CI run `31315134468` fails: dependency installation, TypeScript, Vite build and Rust `cargo check` pass; Vitest fails and release-manifest validation is skipped. Check annotations show asynchronous Ollama work reaching `window` after the test environment is torn down. This reopens VS-AUDIT-021 without attributing an application-code regression to the Markdown-only commit.
- **GitHub/PR #31:** current exact head is `b52e964e3fa2a9c4f24dc5261001fbfb89ad5bf9`, still open/draft and mergeable, with **1,475 changed files, 175,535 additions, 8,859 deletions and 188 commits**. It is **188 commits ahead and 10 behind `main`**. Exact-head AI-boundary run `31320495379` passes. Exact-head CI run `31320495377` fails in Vitest after install/typecheck/build pass; Rust `cargo check` passes and release-manifest validation is skipped. GitHub annotations again report repeated unhandled `AbortError: Ollama bootstrap cancelled` during account-identity lifecycle tests. No new issue, submitted review, or interval PR discussion item was exposed by the connector.
- **Interval code/configuration review:** reviewed the nine commits since the prior PR head and sampled security-sensitive changes in scoped context persistence, file rename/delete authority, scheduler/news fencing, auth recovery/presence, browser-chat relay and account identity. The new native file operations require an explicit project root, reject outside-root and symlink sources, and use no-clobber move behavior; no new traversal/overwrite vulnerability was established. The Nightly Second Brain store is account/workspace/project scoped, bounds persisted values and quarantines the former global schema; no new cross-account persistence defect was established in that store.
- **Release/deployment configuration:** revalidated `main` updater configuration: product version `1.5.0` still checks raw `releases/channel.json` first, and that manifest is version `0.1.48`, Windows-x64 only, with no signature field. Reviewed `.github/workflows/release.yml`: the release path has `contents: write` plus issue/PR write permissions and passes Tauri signing/private-key and Windows signing material to a job that invokes mutable action tags including `tauri-apps/tauri-action@v0`, `swatinem/rust-cache@v2` and `dtolnay/rust-toolchain@stable`. The workflow positively verifies updater signatures and publishes hashes after builds, but immutable action pinning/protected-environment controls were not established.
- **Dependency/secrets:** Dependabot alerts remain explicitly disabled. Direct secret-scanning alert inventory and repository Actions-policy reads remain inaccessible to the integration. Selected indexed searches returned no literal `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY` or private-key-header result; this is not proof of absence from history, forks, caches or non-indexed content.
- **Gmail:** current merged-inbox metadata is **INBOX 2,034 total / 1,456 unread**, **SPAM 136 / 87 unread**, **TRASH 260 / 219 unread**. Targeted interval searches covered VibeSpace/support/bug/crash/security/login/recovery plus billing/payment/refund/dispute/webhook/Stripe/Supabase signals and relevant spam/trash. Material signals were GitHub CI failures, one VibeSpace-branded password-recovery message, two additional Supabase reset notices that were not conclusively tied to VibeSpace, and a Google notice for a GitHub sign-in. No clear new customer support, payment/refund/dispute/webhook, confirmed unauthorized-login, or application-incident email was found. No email/label state changed and no code or recovery value is recorded here.
- **Supabase:** attempted Security Advisor, Performance Advisor, read-only SQL, API/Auth/Postgres/Edge Function/storage/realtime logs, public-table listing, migrations and Edge Function listing for `vbkkimvedmklebghtkzs`. Every live operation was denied with `You do not have permission to perform this action`. No Supabase write was invoked.
- **Stripe:** attempted live account information and a read-only PaymentIntent listing. Both require interactive user input in the connector and therefore could not execute in this non-interactive audit. No Stripe write was invoked.

### New findings

- **VS-AUDIT-029 — High:** Default branch governance is not enforced by GitHub: `main` is unprotected, required status checks are off, and the repository has no rulesets. This creates a direct-push path that can bypass PR review and CI. No unauthorized direct push was observed or claimed.
- **VS-AUDIT-030 — High:** The release workflow trusts mutable action references while the release job has repository write authority and signing secrets. No compromised action is alleged; the finding is the avoidable supply-chain blast radius of mutable action refs in a signing path.

### Changed/reopened findings

- **VS-AUDIT-021 — Reopened, Medium:** current `main` CI is failing Vitest and skipping release-manifest validation. The head changed only the audit Markdown file, so the evidence points to test/lifecycle nondeterminism or stale asynchronous work rather than a proven application regression.
- **VS-AUDIT-013 / VS-AUDIT-028:** PR #31 advanced nine commits to `b52e964e...`, grew to 1,475 files / 175,535 additions / 8,859 deletions / 188 commits, is 188 ahead/10 behind `main`, and remains exact-head frontend-red. AI-boundary evaluation and Rust compile remain green.
- **VS-AUDIT-018:** revalidated unchanged on `main` with direct reads of `tauri.conf.json` and `releases/channel.json`.
- **VS-AUDIT-022 / VS-AUDIT-005:** Dependabot remains disabled; secret-scanning alert inventory is still inaccessible. Current indexed literal searches did not expose a new live Stripe/Supabase/private-key literal, but historical exposure is not cleared.
- **VS-AUDIT-007:** Gmail volume changed to the counts above; targeted support/security/billing searches found no clearly actionable VibeSpace customer incident.
- **VS-AUDIT-014:** new recovery/reset and Google/GitHub sign-in notices were observed; no successful account takeover was evidenced.
- **VS-AUDIT-003 / VS-AUDIT-001 / VS-AUDIT-002 / VS-AUDIT-012:** all live Supabase revalidation attempts remain permission-blocked, so these retain their prior evidence and environment-applicability caveat.

### Resolved findings

- None. VS-AUDIT-021, which had previously been resolved, is reopened by the current `main` failure.

### Connector failures and blind spots

- **Supabase:** project-level permission denial blocks advisors, SQL, all requested service logs, tables, migrations and functions. Latest successful live validation available to the audit remains **2026-08-02 21:00 UTC**. Repository evidence also says the specified target is not the repository-pinned VibeSpace backend.
- **Stripe:** current live payment/account reads require interactive authentication/input; failed/incomplete payments, refunds, disputes, customers, subscriptions, invoices, events/webhooks, suspicious activity, integration configuration and account health remain unverified. Latest successful live Stripe validation remains **2026-08-02 21:00 UTC**.
- **GitHub:** direct secret-scanning alerts and repository Actions-policy settings are integration-blocked. GitHub Discussions were not exposed as a usable read surface in this run. PR #31 remains too large for exhaustive dynamic/line-by-line review in one pass.
- **Runtime/release:** packaged Windows/macOS/Linux execution, signed Windows installer validation, authoritative production Supabase migrations, live two-account authorization, Stripe test-mode lifecycle/webhooks, deployed OAuth/MCP, rollback, high-volume media/Model Foundry stress, and long-duration soak/capacity remain unverified.
- **Gmail:** merged-account scale, result limits, aliases/routing and queue ownership limit completeness; relevant spam/trash were searched but no-match does not guarantee absence elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-029 — Default branch has no enforced protection or ruleset
- **Severity:** High
- **Source:** GitHub `main` branch metadata and repository rulesets API
- **Evidence summary:** GitHub reports `main` with `protected: false`; its legacy required-status-check enforcement is off. The repository rulesets endpoint, including parent rulesets, returns an empty list. The connected GitHub identity has write/admin capability, so a direct push to `main` is technically possible without a repository-enforced PR/review/CI gate. The audit does not claim that an unauthorized direct push occurred.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open
- **Affected component:** Default-branch integrity, merge/release governance, protection of security-sensitive code and automation
- **Recommended remediation:** Add an enforced repository ruleset/branch protection for `main` requiring pull requests, independent approvals, current required CI/security checks, branch freshness where appropriate, and blocking force-push/deletion; tightly restrict bypass actors. If the audit log must remain directly writable, grant only a narrowly scoped bot exception or use a controlled PR workflow rather than leaving the entire branch unprotected.
- **Immediate owner attention:** Yes

### VS-AUDIT-030 — Signed release workflow uses mutable action references
- **Severity:** High
- **Source:** `.github/workflows/release.yml`
- **Evidence summary:** The official release workflow invokes mutable action references, including third-party `tauri-apps/tauri-action@v0`, `swatinem/rust-cache@v2`, and `dtolnay/rust-toolchain@stable` (plus GitHub-maintained major tags). The release job has repository write authority and receives desktop updater/private signing keys and Windows signing material. If a mutable upstream action reference were maliciously changed or compromised, its execution context could expose high-impact release credentials or alter artifacts. No upstream action compromise or credential exfiltration is alleged. Post-build updater-signature verification and SHA256 generation are positive controls but do not remove pre-build action trust.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open
- **Affected component:** GitHub Actions release supply chain, code-signing/updater keys, official release artifacts
- **Recommended remediation:** Pin every release action to a reviewed immutable full commit SHA, especially third-party actions; minimize `GITHUB_TOKEN` permissions per job; place signing secrets behind a protected release environment/approval boundary; scope credentials to the smallest job; document a controlled process for updating pinned SHAs.
- **Immediate owner attention:** Yes before the next signed release

### VS-AUDIT-012 — Verified sessions can update another customer profile
- **Severity:** Critical
- **Source:** Last successful live Supabase RLS/profile inspection of the connected target; PR #31 profile-security migration and current environment evidence
- **Evidence summary:** The last successful live check found a verified-session update policy on `profiles` that did not require row ownership. PR #31 contains a stronger owner-only policy/grant reset, but it is unmerged. Current repository release evidence says the connected target is AccessRevamp-only rather than the repository-pinned VibeSpace issuer, so direct VibeSpace production applicability is unconfirmed. No cross-account write was attempted by this audit.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status/environment applicability carried; live revalidation blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC (open status/environment applicability carried; live revalidation blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC
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
- **Last seen:** 2026-08-09 21:03 UTC (status/environment applicability carried; live revalidation blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC
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
- **Last seen:** 2026-08-09 21:03 UTC (status carried; live refresh blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC (historical event unresolved; alert inventory still inaccessible)
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly; prove synthetic or rotate/revoke; replace key-shaped fixtures; inspect history/forks/caches; close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge/deploy without additional release evidence
- **Severity:** High
- **Source:** GitHub PR metadata/comparison, exact-head Actions, review surfaces, selected code/release review
- **Evidence summary:** Current PR #31 head is `b52e964e3fa2a9c4f24dc5261001fbfb89ad5bf9`, open/draft, with 1,475 files, 175,535 additions, 8,859 deletions and 188 commits; it is 188 ahead/10 behind `main`. Exact-head AI-boundary evaluation is green, but exact-head CI fails Vitest with repeated unhandled Ollama-cancellation errors. The branch spans auth, Supabase/Stripe, Tauri/native authority, browser automation, MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime and deployment tooling. No new submitted review or interval issue/review-comment signal was exposed.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open; unmerged draft; exact-head frontend CI failing and external/production-like evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope; sync `main`; fix/re-run exact-head CI; require independent subsystem/security/billing/native review and every dedicated suite; validate packaged multi-platform apps, authoritative live migrations, two-account authorization, Stripe test mode, OAuth/MCP deployment, rollback and resource-exhaustion/soak on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-021 — Default-branch frontend CI fails Vitest and skips release-manifest validation
- **Severity:** Medium
- **Source:** Historical run `31104440221`, prior green reruns, and current `main` run `31315134468`
- **Evidence summary:** This finding was previously resolved after later green `main` runs. It is now reopened: current `main` head `d4481c096d3e10952c2b103abb7d48db266ee60c` fails frontend Vitest while install, TypeScript, Vite build and Rust `cargo check` pass; release-manifest validation is skipped. GitHub annotations show repeated asynchronous `ReferenceError: window is not defined` from the Ollama reachability/bootstrap path after the test environment has torn down during account-identity tests. The current head changed only this audit Markdown file, so the audit does not claim an application-code regression; the evidence instead demonstrates nondeterministic/uncontained lifecycle work that keeps the default branch red.
- **First seen:** 2026-08-07 05:06 UTC
- **Historically resolved:** 2026-08-07 21:00 UTC
- **Reopened:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Reopened; current `main` frontend CI failing
- **Affected component:** Default-branch frontend test lifecycle and release-manifest gate
- **Recommended remediation:** Ensure all Ollama bootstrap/reachability tasks are cancelled/awaited before test teardown, add deterministic account-identity lifecycle coverage, rerun the exact `main` head until Vitest and release-manifest gates are green, and keep these gates required by branch governance.
- **Immediate owner attention:** Yes before release/merge decisions

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
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Current counts are INBOX 2,034 / 1,456 unread, SPAM 136 / 87 unread, TRASH 260 / 219 unread. At least one VibeSpace-domain route was previously evidenced, but public aliases, routing rules, queue ownership, response state and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm public support routing with controlled external delivery and a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Last successful live Supabase Security Advisor
- **Evidence summary:** The last successful live advisor check reported leaked-password protection disabled. Current advisor access is denied by the connector, and current repository environment evidence means direct VibeSpace applicability must be reassessed against the authoritative project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status carried; live revalidation blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC (open status/environment relevance carried; live revalidation blocked)
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
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable reviewed dependency alerts/updates; add dependency audit/review for every package ecosystem; pin/lock release resolutions where appropriate; require MCP Worker and native security tests on the immutable release SHA.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation
- **Evidence summary:** Prior direct review established up to 24 media items, videos up to 40 MiB each and no aggregate-byte ceiling, with representations/decoding capable of creating large duplicate memory footprints. No remote trigger or shipping to `main` was established. The interval delta did not establish a fix.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status carried; no interval fix established)
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Yes before merge/release

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** `.github/workflows/ci.yml`, PR #31 release evidence, MCP Worker package
- **Evidence summary:** The prior native command-authority mismatch is fixed. PR evidence records a local Windows default-feature `cargo test --lib` run with 256 passed and eight intentional ignores. Default GitHub CI nevertheless runs only `cargo check --release`, so native unit/security tests are not a required merge gate; the MCP Worker package's dedicated checks also remain outside default CI.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open; local evidence improved, systemic required-CI gap remains
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add appropriate Rust unit/security tests and MCP Worker test/typecheck/dry-run checks to required CI; require them on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts declared length instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 Cloudflare MCP Worker; prior direct code review
- **Evidence summary:** Prior review found the 256 KiB Worker limit depended on caller-supplied `Content-Length` and did not independently count the body before the MCP SDK handler. Authentication remained required and no auth bypass/code execution was shown. No interval fix was established this run.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status carried)
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint, request parsing/resource consumption
- **Recommended remediation:** Enforce actual received-byte limits before SDK parsing, regardless of headers; add omitted/inaccurate/chunked/oversized-body tests while preserving auth/origin/host checks.
- **Immediate owner attention:** Yes before MCP deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 OAuth consent site; prior direct review
- **Evidence summary:** The consent page asks for credentials while importing Supabase JS directly from jsDelivr at runtime. No malicious CDN behavior or XSS/open redirect was demonstrated; the issue is supply-chain trust on a credential-handling origin. No interval change established remediation.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status carried)
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle/self-host the exact audited client, use a restrictive self-centered CSP, pin/verify build dependencies and test the deployed artifact.
- **Immediate owner attention:** Yes before OAuth page deployment

### VS-AUDIT-027 — Model Foundry knowledge ingestion lacks aggregate source limits
- **Severity:** Medium
- **Source:** PR #31 `BuildYourOwnAIHub.tsx`, `modelHub.ts`, native `model_foundry.rs`
- **Evidence summary:** The UI opens a native multi-select picker and appends all selected supported paths without a source-count or aggregate-byte cap. `mayStartTraining` requires only that at least one supported source exists. Native `validated_sources` enforces a 64 MiB maximum **per source** but no total count/bytes. `clean_chunks` then reads every source fully with `fs::read_to_string`, normalizes/deduplicates chunks in memory and later serializes the full artifact. A sufficiently large aggregate selection can therefore consume substantial memory/CPU/disk; concurrent job limits were not established in the reviewed start path. This is a local availability/reliability risk, not a remote exploit claim.
- **First seen:** 2026-08-09 05:02 UTC
- **Last seen:** 2026-08-09 21:03 UTC (open status carried; no interval fix established)
- **Status:** Open on unmerged PR #31
- **Affected component:** Model Foundry knowledge-source ingestion, native process memory/CPU/disk reliability
- **Recommended remediation:** Add a small explicit maximum source count and aggregate source-byte budget in both UI and native enforcement; stream/chunk large files instead of whole-file reads; bound total chunk/artifact size and active jobs; add adversarial near-limit/many-file/concurrent-job stress tests.
- **Immediate owner attention:** Yes before merging/releasing Model Foundry

### VS-AUDIT-028 — Exact-head frontend CI leaks expected Ollama cancellation as unhandled errors
- **Severity:** Medium
- **Source:** GitHub Actions exact-head run `31320495377`, check annotations, current `app/src/lib/ai/ollamaBootstrap.ts`
- **Evidence summary:** At PR #31 head `b52e964e...`, dependency installation, TypeScript and Vite build pass, but Vitest fails and release-manifest validation is skipped. GitHub reports repeated `AbortError: Ollama bootstrap cancelled` failure annotations originating at the bootstrap cancellation path while account-identity lifecycle tests execute. The annotations note the error may occur asynchronously after individual tests complete. No production crash, security exploit or user-data impact is established; the demonstrated defect is uncaught expected cancellation in the test/lifecycle boundary plus a red exact release candidate.
- **First seen:** 2026-08-09 13:01 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open on draft PR #31; current exact-head CI failing
- **Affected component:** Ollama bootstrap cancellation lifecycle, account-identity cleanup tests, frontend CI/release assurance
- **Recommended remediation:** Treat expected cancellation as a consumed/awaited lifecycle outcome; ensure every bootstrap subscriber/cleanup path handles `AbortError` without unhandled rejections; add focused cancellation/unmount/account-switch regressions; then rerun the exact head until Vitest and release-manifest validation are green.
- **Immediate owner attention:** Yes before merging/releasing PR #31

### VS-AUDIT-014 — Administrative identity/application authorization events
- **Severity:** Informational
- **Source:** Gmail Google/Supabase/Stripe/Fly.io/GitHub security and authorization notifications
- **Evidence summary:** Historical Google/Stripe/Fly.io/GitHub authorization notices may be owner-initiated and did not establish unauthorized access. This run added one VibeSpace-branded password-recovery message, two additional Supabase reset notices not conclusively attributable to VibeSpace, and a Google notice that Sign in with Google was used with GitHub. No evidence establishes successful unauthorized access, and no recovery value or customer content is recorded.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-09 21:03 UTC
- **Status:** Open; owner confirmation required for unrecognized activity
- **Affected component:** Administrative identity, password recovery and connected third-party applications
- **Recommended remediation:** Confirm expected recovery requests/sign-ins/app authorization in provider security activity; do not grant unexpected scopes; revoke unknown sessions/apps and rotate credentials if unrecognized; verify MFA/recovery controls.
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
- **Last seen:** 2026-08-09 21:03 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; observe on relevant environment
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** On the authoritative project, observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

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
| 2026-08-09 13:01 | VS-AUDIT-028 opened after current PR #31 head `5aef5c23...` failed exact-head Vitest with repeated unhandled Ollama cancellation errors; AI-boundary and Rust compile checks remained successful. PR #31 grew to 1,449 files / 170,215 additions / 8,705 deletions / 179 commits and is 179 ahead/nine behind `main`. `main` remained application-code unchanged and was then believed green; stale updater was revalidated. Dependabot alerts remained disabled and direct secret-scanning inventory remained inaccessible. Gmail surfaced the exact-head CI failure but no clear new customer/security/billing incident. Supabase live reads remained permission-denied and Stripe live reads remained blocked by interactive authentication. No remediation was performed. |
| 2026-08-09 21:03 | VS-AUDIT-029 opened after direct GitHub branch/ruleset reads showed `main` unprotected with no enforced ruleset. VS-AUDIT-030 opened for mutable action references in the signed release pipeline. VS-AUDIT-021 reopened because current audit-log-only `main` head fails Vitest with asynchronous Ollama work after test teardown and skips release-manifest validation. PR #31 advanced nine commits to `b52e964e...`, 1,475 files / 175,535 additions / 8,859 deletions / 188 commits, 188 ahead/10 behind `main`; AI-boundary remains green but exact-head frontend CI is red with unhandled Ollama cancellation. Updater remains stale. Gmail added recovery/reset and Google/GitHub sign-in notices but no confirmed compromise/customer/payment incident. Supabase remains permission-denied and Stripe remains blocked by interactive authentication. No remediation was performed. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.