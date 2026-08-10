# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, recovery codes, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-10 05:00 UTC**

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

1. **VS-AUDIT-012 — Critical:** The last successful live check of the connected Supabase target found that a verified authenticated session could update another customer's `profiles` row without proving ownership. Current repository evidence says the connected target is AccessRevamp-oriented rather than the repository-pinned VibeSpace backend, so direct VibeSpace production applicability is unconfirmed; the authorization defect remains Critical on the connected project until authoritative environment ownership and live remediation are verified.
2. **VS-AUDIT-001 — Critical:** The last successful live check of the connected Supabase target found nine broad verified-session `SELECT` policies without row ownership. Current repository environment mapping disputes direct VibeSpace applicability, but the connected-project defect remains unresolved and live policy state could not be refreshed.
3. **VS-AUDIT-031 — High, NEW:** Current draft PR #31 deletes the 905-line `install/install.ps1` Windows installer even though `main` publicly documents that exact raw file as the one-line Windows install command and the PR description itself says the unexplained installer deletion is protected/excluded and not authorized for commit. If merged as-is, the documented Windows one-line install path would break. No current-user impact is claimed because the deletion is still unmerged.
4. **VS-AUDIT-029 — High:** GitHub still reports `main` as unprotected, legacy required-status enforcement off, and no repository rulesets. A writer can therefore push directly to the default branch without a repository-enforced PR/review/CI gate. No unauthorized push is claimed.
5. **VS-AUDIT-030 — High:** The signed release workflow uses mutable action references, including third-party actions, while the release job receives repository write authority and signing secrets. No upstream action compromise is alleged; this remains a release supply-chain trust gap.
6. **VS-AUDIT-018 — High:** `main` still carries the stale first updater endpoint: app version `1.5.0` points first to a `0.1.48` Windows-only manifest with no artifact signature field. PR #31 contains draft remediation, but it is unmerged.
7. **VS-AUDIT-016 — High:** Supabase previously reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact remains unconfirmed.
8. **VS-AUDIT-002 — High:** A permissive refund-request insert policy on the connected Supabase target was not bound to `auth.uid()` at the last successful live check. Direct VibeSpace applicability is environment-dependent and unconfirmed.
9. **VS-AUDIT-003 — High:** Repository evidence maps the user-specified connected Supabase target as AccessRevamp-oriented and a different project as the repository-pinned VibeSpace issuer. The audit target therefore does not currently match the backend described by the application branch.
10. **VS-AUDIT-004 — High:** The specified Stripe account and Supabase payment/catalog/runtime evidence remain unreconciled; live Stripe reads were blocked again.
11. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved; direct secret-scanning alert inventory remains inaccessible.
12. **VS-AUDIT-013 — High:** PR #31 remains an extremely large security-sensitive draft. Current head `33630c7...` is 195 commits ahead/11 behind current `main`, spans 1,568 files, and fails exact-head frontend CI even though its AI-boundary workflow and Rust compile check pass.
13. **VS-AUDIT-028 — Medium:** PR #31 exact-head account-identity tests now fail with multiple direct lifecycle assertions showing unexpected duplicate/missing cloud-sync loop starts/stops. This is release-assurance evidence, not proof of a production security exploit.
14. **VS-AUDIT-027 — Medium:** PR #31 Model Foundry knowledge ingestion has a 64 MiB per-file limit but no source-count or aggregate-byte ceiling.
15. **VS-AUDIT-025 — Medium:** The Cloudflare MCP gateway still enforces its request ceiling from declared `Content-Length` rather than independently measured body bytes before handing the request to the MCP SDK.
16. **VS-AUDIT-026 — Medium:** The OAuth credential page's third-party runtime JavaScript trust finding remains open on the draft branch.
17. **VS-AUDIT-024 — Medium:** Local native test evidence exists, but default required CI still does not make all Rust/MCP security tests mandatory.
18. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain remains recorded as suspended for incomplete billing setup; VibeSpace dependency is unconfirmed.
19. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Historical recovery/sign-in/authorization notices remain owner-confirmation items if unrecognized; this run did not establish a new confirmed account compromise.

## Current run summary

### Checks completed

- **GitHub/default branch:** fetched this audit log before work and again before the only write. Current pre-audit `main` head was `ac84dad1d2a9fe1cc6ce1c32f1ca9955ef6ec5d6`, an audit-log-only commit. GitHub still reports `protected: false`, legacy required-status enforcement off, and no repository rulesets. Unlike the previous run, exact-head CI `31336257056` is green: dependency install, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check` all passed. This resolves VS-AUDIT-021 again; no application-code change was needed because the failing predecessor was also audit-log-only.
- **GitHub/PR #31:** current exact head is `33630c7f4c590593bc902d3da9322e918675670e`, still open/draft and mergeable, with **1,568 changed files, 185,683 additions, 10,621 deletions and 195 commits**. Compared with current `main`, it is **195 commits ahead and 11 behind**. Exact-head AI-boundary workflow passes. Exact-head CI `31336463326` fails in Vitest after dependency install/typecheck/build pass; Rust `cargo check` passes and release-manifest validation is skipped. Current annotations show multiple direct account-identity lifecycle assertion failures, including expected cloud-sync start/stop counts being exceeded, missing starts, and a released authority becoming `undefined`. No production incident is inferred from test failures alone.
- **PR interval/code review:** PR #31 advanced seven commits since the previous audited head. The delta touches auth/recovery, account identity, renderer watchdog, terminal, chat, browser relay/MCP, DB repositories, scheduling/news, providers, and release evidence. The new recovery-callback implementation scrubs callback secrets from the URL before processing, rejects duplicate/error/oversized callback material, requires a recovery transport, refuses to overwrite an existing session, validates established session identity, and bounds attributable local sign-out; no new recovery-token exposure or auth bypass was established in that reviewed path.
- **Windows installer/release path:** the PR's current patch removes all 905 lines of `install/install.ps1`. The file still exists on `main`, and the public README tells Windows users to run the raw `main/install/install.ps1` one-line PowerShell install command. The current PR description simultaneously states this unexplained installer deletion is protected/excluded and not authorized for restoration or commit. This contradiction opens VS-AUDIT-031; the deletion is unmerged, so no existing `main` install path was changed by this audit.
- **MCP/API/CORS/input handling:** re-reviewed current PR `workers/vibespace-mcp/src/index.ts` and relay code. Positive controls include canonical HTTPS host validation, allowlisted browser origins, authenticated MCP access, signed/single-use relay tickets, read-only advertised relay tools, credential-shaped registration-field rejection, and bounded WebSocket frame size. VS-AUDIT-025 remains open because `/mcp` still treats omitted `Content-Length` as zero and does not independently measure actual request bytes before SDK parsing. No auth/CORS bypass was established in the reviewed slice.
- **Issues/reviews/discussions:** no open issue updated since the previous run was returned. PR #31 was the only updated pull request. No new interval PR review/discussion item was found. Repository metadata reports GitHub Discussions disabled.
- **Dependency/secrets/governance:** Dependabot alerts remain explicitly disabled. Direct vulnerability-alert and secret-scanning inventories remain inaccessible to the connector. Selected current indexed searches returned no literal `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, private-key-header, or `dangerouslySetInnerHTML` result; this is not proof of absence from history, forks, caches, branches, or non-indexed content. `main` protection/ruleset findings remain unchanged.
- **Gmail:** current merged-inbox metadata is **INBOX 2,043 total / 1,465 unread**, **SPAM 137 / 88 unread**, **TRASH 260 / 219 unread**. Targeted searches covered VibeSpace/support/bug/crash/error/security/unauthorized/login/recovery plus billing/payment/refund/dispute/webhook/invoice/subscription/Stripe/Supabase/GitHub signals and relevant spam/trash. The material new VibeSpace-related message after the prior run was the exact current PR-head CI failure notification. No clear new VibeSpace customer support, payment/refund/dispute/webhook, confirmed unauthorized-login, or application-incident email was established. Unrelated merged-account billing messages were not treated as VibeSpace findings. No email or label state changed.
- **Supabase:** attempted Security Advisor, Performance Advisor, API/Auth/Postgres/Edge Function/storage/realtime/branch-action logs, public-table listing, migrations, Edge Functions and branches for the specified project. Every live operation was denied with `You do not have permission to perform this action`. No Supabase write was invoked.
- **Stripe:** attempted live account information and read-operation discovery. Both require user interaction/authentication in this non-interactive connector context and could not execute. No Stripe write was invoked. A targeted Gmail search found no new Stripe-domain message in the audit interval.

### New findings

- **VS-AUDIT-031 — High:** draft PR #31 deletes the public Windows one-line installer while the README still points users to that exact file and the PR's own release/safety text says that deletion was not authorized to be committed. If merged as-is, the documented Windows install command would fail.

### Changed findings

- **VS-AUDIT-013:** PR #31 advanced to `33630c7...`, 1,568 files / 185,683 additions / 10,621 deletions / 195 commits, now 195 ahead/11 behind current `main`; exact-head AI-boundary is green but frontend CI remains red.
- **VS-AUDIT-028:** current exact-head failure is stronger and more specific than the prior unhandled-cancellation signal: account-identity tests now directly assert duplicate/missing cloud-sync lifecycle behavior.
- **VS-AUDIT-029:** revalidated; `main` remains unprotected and repository rulesets remain empty.
- **VS-AUDIT-025:** direct current-head review confirms the declared-length-only MCP request limit remains present.
- **VS-AUDIT-022 / VS-AUDIT-005:** Dependabot remains disabled; direct secret-scanning inventory remains inaccessible; selected literal searches did not expose a new current indexed secret but do not clear historical exposure.
- **VS-AUDIT-007:** Gmail volume changed to the counts above; targeted support/security/billing searches found no clearly actionable VibeSpace customer incident.
- **VS-AUDIT-003 / VS-AUDIT-001 / VS-AUDIT-002 / VS-AUDIT-012:** all live Supabase revalidation attempts remain permission-blocked, so these retain prior evidence and environment-applicability caveats.

### Resolved findings

- **VS-AUDIT-021 — Medium:** current pre-audit `main` head CI is green, including Vitest and release-manifest validation. The previous failing head and current successful head both changed only this audit Markdown file, so the prior red signal is resolved without claiming an application-code fix.

### Connector failures and blind spots

- **Supabase:** project-level permission denial blocks advisors, logs, tables, migrations, functions, branches and direct live RLS/database verification. Latest successful live validation available to the audit remains **2026-08-02 21:00 UTC**. Repository evidence also says the specified target is not the repository-pinned VibeSpace backend.
- **Stripe:** current live account/payment/refund/dispute/subscription/invoice/webhook/suspicious-activity/account-health reads require interactive authentication/input and could not execute. Latest successful live Stripe validation available to this audit remains **2026-08-02 21:00 UTC**.
- **GitHub:** direct secret-scanning/vulnerability-alert inventories are integration-blocked; Dependabot alerts are disabled. PR #31 is too large for exhaustive dynamic/line-by-line review in one pass.
- **Runtime/release:** packaged Windows/macOS/Linux execution, signed Windows installer validation, authoritative production Supabase migrations, live two-account authorization, Stripe test-mode lifecycle/webhooks, deployed OAuth/MCP, rollback, high-volume media/Model Foundry stress, and long-duration soak/capacity remain unverified.
- **Gmail:** merged-account scale, aliases/routing, and queue ownership limit completeness. Relevant spam/trash were searched but no-match does not guarantee absence elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update another customer profile
- **Severity:** Critical
- **Source:** Last successful live Supabase RLS/profile inspection of the connected target; PR #31 profile-security migration and current environment evidence
- **Evidence summary:** The last successful live check found a verified-session update policy on `profiles` that did not require row ownership. PR #31 contains a stronger owner-only policy/grant reset, but it is unmerged. Current repository evidence says the connected target is AccessRevamp-oriented rather than the repository-pinned VibeSpace issuer, so direct VibeSpace production applicability is unconfirmed. No cross-account write was attempted by this audit.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability and live state unverified
- **Affected component:** Connected-project customer profile authorization and server-owned identity/billing fields
- **Recommended remediation:** First establish the authoritative VibeSpace Supabase project. On every project that remains in scope, deploy the canonical owner-only policy/grant reset under controlled migration and run two-account negative read/update plus server-role billing-field tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads
- **Severity:** Critical
- **Source:** Last successful live Supabase policies/grants on the connected target; current repository environment mapping
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies across customer/project/order/entitlement/delivery/design/workflow/update/refund data accepted verified-session state without requiring row ownership at the last successful live check. Current repository evidence says the connected target is AccessRevamp-oriented; therefore direct VibeSpace production applicability is unconfirmed, but the connected-project defect remains unresolved.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Connected-project authorization boundary; direct VibeSpace production relevance unresolved
- **Recommended remediation:** Confirm environment ownership, then inventory/remove session-only permissive policies; require direct ownership or tightly scoped staff roles and run two-account negative tests across every exposed table/RPC.
- **Immediate owner attention:** Yes

### VS-AUDIT-031 — Draft PR deletes the documented Windows one-line installer
- **Severity:** High
- **Source:** Current PR #31 file patch and PR description; `main` `install/install.ps1`; public `README.md`
- **Evidence summary:** Current PR #31 removes all 905 lines of `install/install.ps1`; fetching that path at the PR head returns no file. `main` still contains the installer, and the README tells Windows users to execute that exact raw `main/install/install.ps1` URL. The current PR description also says the unexplained deletion is deliberately protected/excluded and that destructive installer changes are not authorized. If this draft were merged as-is, the documented Windows one-line installer would become unavailable. No current production impact is claimed because `main` is unchanged.
- **First seen:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Windows installation/update entry point, release documentation, PR release-integrity evidence
- **Recommended remediation:** Before merge, either restore the installer on the PR branch or intentionally replace the Windows install mechanism and update every README/download/update reference in the same reviewed change. Reconcile the PR description with the actual diff and add CI that asserts documented installer paths exist and parse/dry-run successfully.
- **Immediate owner attention:** Yes before merging or releasing PR #31

### VS-AUDIT-029 — Default branch has no enforced protection or ruleset
- **Severity:** High
- **Source:** GitHub `main` branch metadata and repository rulesets API
- **Evidence summary:** GitHub reports `main` with `protected: false`; legacy required-status-check enforcement is off. The repository rulesets endpoint returns an empty list. A direct push to `main` is technically possible without a repository-enforced PR/review/CI gate. The audit does not claim that an unauthorized direct push occurred.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open
- **Affected component:** Default-branch integrity, merge/release governance, security-sensitive code and automation
- **Recommended remediation:** Add an enforced repository ruleset/branch protection for `main` requiring pull requests, independent approvals, current required CI/security checks, branch freshness where appropriate, and blocking force-push/deletion; tightly restrict bypass actors.
- **Immediate owner attention:** Yes

### VS-AUDIT-030 — Signed release workflow uses mutable action references
- **Severity:** High
- **Source:** `.github/workflows/release.yml`
- **Evidence summary:** The official release workflow invokes mutable action references, including third-party `tauri-apps/tauri-action@v0`, `swatinem/rust-cache@v2`, and `dtolnay/rust-toolchain@stable`. The release job has repository write authority and receives desktop updater/private signing keys and Windows signing material. No upstream action compromise or credential exfiltration is alleged. Post-build signature/hash verification is a positive control but does not remove pre-build action trust.
- **First seen:** 2026-08-09 21:03 UTC
- **Last seen:** 2026-08-10 05:00 UTC (unchanged; no application/release-workflow main change in interval)
- **Status:** Open
- **Affected component:** GitHub Actions release supply chain, signing/updater keys, official artifacts
- **Recommended remediation:** Pin every release action to a reviewed immutable full commit SHA; minimize job token permissions; place signing secrets behind protected release environments/approval; document controlled SHA updates.
- **Immediate owner attention:** Yes before the next signed release

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and incomplete
- **Severity:** High
- **Source:** `main` `app/src-tauri/tauri.conf.json`, `releases/channel.json`; PR #31 updater configuration
- **Evidence summary:** `main` identifies VibeSpace as `1.5.0` while its first updater endpoint serves `0.1.48`, only Windows x64, with no artifact signature field. Current PR #31 contains draft endpoint remediation, but it is unmerged. No application-code commit reached `main` in the interval.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
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
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation permission-blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project
- **Affected component:** Refund-request integrity on the connected environment
- **Recommended remediation:** Confirm environment ownership; remove broad insert policies; require `user_id = auth.uid()` and ownership-checked eligible orders; test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase audit target does not match repository-pinned VibeSpace backend evidence
- **Severity:** High
- **Source:** Last successful connected-project inspection; current PR #31 release evidence/configuration
- **Evidence summary:** The connected project previously appeared AccessRevamp-oriented. Current PR #31 release evidence explicitly states the repository-pinned VibeSpace issuer is a different project. That repository evidence is not a substitute for current live connector proof, but it materially establishes an operational scope mismatch.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Last successfully validated live:** 2026-08-02 21:00 UTC for the connected target
- **Status:** Open; environment mismatch materially strengthened
- **Affected component:** Audit coverage, authentication, deployment assurance, environment isolation
- **Recommended remediation:** Document one authoritative production VibeSpace project/owner; reconnect read-only audit access to that exact project; reconcile desktop, Edge Function, MCP Worker and deployment configuration; rerun advisors/RLS/log/function checks.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Last successful Stripe reads, Supabase payment/catalog/runtime evidence, Gmail Stripe notifications, current blocked Stripe access
- **Evidence summary:** At the last successful live check, the specified Stripe account did not reconcile with the connected Supabase catalog/order/runtime state and historical webhook-failure evidence. Current live Stripe account reads remain blocked.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live refresh blocked)
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
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly; prove synthetic or rotate/revoke; replace key-shaped fixtures; inspect history/forks/caches; close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge/deploy without additional release evidence
- **Severity:** High
- **Source:** GitHub PR metadata/comparison, exact-head Actions, review surfaces, selected code/release review
- **Evidence summary:** Current PR #31 head is `33630c7f4c590593bc902d3da9322e918675670e`, open/draft, with 1,568 files, 185,683 additions, 10,621 deletions and 195 commits; it is 195 ahead/11 behind current `main`. Exact-head AI-boundary evaluation is green and Rust `cargo check` passes, but exact-head frontend CI fails Vitest and release-manifest validation is skipped. The branch spans auth, Supabase/Stripe, Tauri/native authority, browser automation, MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime and deployment tooling. It also currently deletes the documented Windows installer (tracked separately as VS-AUDIT-031).
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open; unmerged draft; exact-head frontend CI failing and external/production-like evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope; sync `main`; resolve installer ownership; fix/re-run exact-head CI; require independent subsystem/security/billing/native review and every dedicated suite; validate packaged multi-platform apps, authoritative live migrations, two-account authorization, Stripe test mode, OAuth/MCP deployment, rollback and resource-exhaustion/soak on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior Google notice says the merged AccessRevamp-oriented Workspace Business Starter subscription is suspended because billing setup was not completed. No evidence establishes VibeSpace dependency and no superseding VibeSpace-relevant billing-status message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; no superseding relevant notice found)
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access and verify mailbox/data continuity; document tenant isolation.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password/password-change defaults in Supabase repository configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml`; current PR account-security UI
- **Evidence summary:** Repository configuration specifies a six-character minimum password, no composition requirement and `secure_password_change = false`. PR #31 exposes an authenticated in-session password-change panel. Hosted applicability cannot be verified because live Supabase access is blocked.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-09 13:01 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Adopt stronger passphrase-aligned minimums, enable recent reauthentication for password changes and leaked-password protection where supported; deploy under change control and verify normal/recovery password-change flows on the authoritative hosted project.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Current counts are INBOX 2,043 / 1,465 unread, SPAM 137 / 88 unread, TRASH 260 / 219 unread. At least one VibeSpace-domain route was previously evidenced, but public aliases, routing rules, queue ownership, response state and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm public support routing with controlled external delivery and a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Last successful live Supabase Security Advisor
- **Evidence summary:** The last successful live advisor check reported leaked-password protection disabled. Current advisor access is permission-denied, and direct VibeSpace applicability must be reassessed against the authoritative project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; authoritative VibeSpace applicability unverified
- **Affected component:** Password authentication
- **Recommended remediation:** On the authoritative VibeSpace project, verify/enable leaked-password protection, strengthen password policy and verify reset/change reauthentication.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView/native-command authority remains broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR #31 browser/native changes
- **Evidence summary:** The desktop retains broad native functionality and PR #31 adds browser/provider/native surfaces. Reviewed Browser Chat/MCP paths use scoped/authenticated/read-only controls. No arbitrary remote-content-to-privileged-IPC exploit was demonstrated. CI coverage limits are tracked separately.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (hardening status carried; selected relay paths re-reviewed)
- **Status:** Open; hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions and require negative IPC/capability tests.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Last successful live Supabase API logs
- **Evidence summary:** Prior live logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. Traffic appeared AccessRevamp-related. Current logs are permission-blocked and environment mapping reduces confidence this is a VibeSpace path.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open on connected project; direct VibeSpace relevance unconfirmed
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub Dependabot/security configuration, default CI, Rust/MCP package state
- **Evidence summary:** Dependabot alerts again explicitly report disabled. Default CI has no repository-wide dependency-vulnerability audit gate and does not require every native/MCP security suite. Direct secret-scanning/vulnerability inventories remain integration-blocked. This establishes monitoring/release-assurance gaps, not a claim of a currently exploitable dependency.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable reviewed dependency alerts/updates; add dependency audit/review for every package ecosystem; pin/lock release resolutions where appropriate; require MCP Worker and native security tests on the immutable release SHA.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation
- **Evidence summary:** Prior direct review established up to 24 media items, videos up to 40 MiB each and no aggregate-byte ceiling, with representations/decoding capable of creating large duplicate memory footprints. No remote trigger or shipping to `main` was established. No interval fix was established.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-10 05:00 UTC (open status carried; no interval fix established)
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Yes before merge/release

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** `.github/workflows/ci.yml`, PR #31 release evidence, MCP Worker package
- **Evidence summary:** Prior native command-authority mismatch was fixed and local native test evidence exists. Default GitHub CI nevertheless runs Rust compile checking rather than requiring the complete native unit/security suite, and the MCP Worker package's dedicated checks remain outside the root required gate.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open; local evidence improved, systemic required-CI gap remains
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add appropriate Rust unit/security tests and MCP Worker test/typecheck/dry-run checks to required CI; require them on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts declared length instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 Cloudflare MCP Worker; current direct code review
- **Evidence summary:** Current `/mcp` code parses `Content-Length`, treats an omitted header as zero, rejects only when the declared value exceeds 256 KiB, authenticates, and then hands the original request to the MCP SDK handler without independently counting actual body bytes. Authentication, canonical host checks and allowlisted-origin controls remain present; no auth bypass/code execution was shown.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint, request parsing/resource consumption
- **Recommended remediation:** Enforce actual received-byte limits before SDK parsing regardless of headers; add omitted/inaccurate/chunked/oversized-body tests while preserving auth/origin/host checks.
- **Immediate owner attention:** Yes before MCP deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 OAuth consent site; prior direct review
- **Evidence summary:** The consent page asks for credentials while importing Supabase JS directly from a third-party CDN at runtime. No malicious CDN behavior or XSS/open redirect was demonstrated; the issue is supply-chain trust on a credential-handling origin. No interval change established remediation.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-10 05:00 UTC (open status carried)
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle/self-host the exact audited client, use a restrictive self-centered CSP, pin/verify build dependencies and test the deployed artifact.
- **Immediate owner attention:** Yes before OAuth page deployment

### VS-AUDIT-027 — Model Foundry knowledge ingestion lacks aggregate source limits
- **Severity:** Medium
- **Source:** PR #31 Model Foundry UI/native ingestion path
- **Evidence summary:** Prior review established native multi-select source ingestion without a source-count or aggregate-byte cap. Native validation limits each source to 64 MiB but not total bytes/count; processing reads source content and retains normalized chunks/artifacts in memory. A sufficiently large aggregate selection can consume substantial memory/CPU/disk. This is a local availability/reliability risk, not a remote exploit claim.
- **First seen:** 2026-08-09 05:02 UTC
- **Last seen:** 2026-08-10 05:00 UTC (open status carried; no interval fix established)
- **Status:** Open on unmerged PR #31
- **Affected component:** Model Foundry knowledge-source ingestion, native process memory/CPU/disk reliability
- **Recommended remediation:** Add explicit maximum source count and aggregate-byte budgets in UI and native enforcement; stream/chunk large files; bound total artifact size and active jobs; add adversarial near-limit/many-file/concurrent-job stress tests.
- **Immediate owner attention:** Yes before merging/releasing Model Foundry

### VS-AUDIT-028 — Exact-head account-identity/cloud-sync lifecycle tests fail
- **Severity:** Medium
- **Source:** GitHub Actions exact-head run `31336463326` and check annotations for `app/src/App.accountIdentity.test.tsx`
- **Evidence summary:** At current PR #31 head `33630c7...`, dependency install, TypeScript and Vite build pass, but Vitest fails and release-manifest validation is skipped. Current annotations include multiple direct assertion failures: some tests expect one cloud-sync start/stop but observe two, three or five; other tests expect a start but observe zero; one expected verified queue authority but received `undefined`. These tests target account authority, sign-out/malformed-session cleanup, and quiescing/restart behavior. No production crash, cross-account access or security exploit is established; the evidence is a real lifecycle/release-assurance defect on the current branch head.
- **First seen:** 2026-08-09 13:01 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Open on draft PR #31; current exact-head CI failing
- **Affected component:** Account identity authority, cloud-sync loop lifecycle, frontend CI/release assurance
- **Recommended remediation:** Make account-authority transitions deterministic and single-owner; ensure old loops quiesce before replacement, sign-out/malformed sessions stop exactly once, and retry/cancellation tasks are awaited. Keep focused regressions and rerun the exact head until Vitest and release-manifest validation are green.
- **Immediate owner attention:** Yes before merging/releasing PR #31

### VS-AUDIT-014 — Administrative identity/application authorization events
- **Severity:** Informational
- **Source:** Gmail Google/Supabase/Stripe/Fly.io/GitHub security and authorization notifications
- **Evidence summary:** Historical authorization/recovery/sign-in notices may be owner-initiated and did not establish unauthorized access. No new confirmed compromise was established in this run; no recovery value or sensitive account content is recorded here.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-10 05:00 UTC (status carried; no new confirmed compromise)
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
- **Last seen:** 2026-08-10 05:00 UTC (status carried; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; observe on relevant environment
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** On the authoritative project, observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical failing `main` runs and current successful run `31336257056`
- **Evidence summary:** The finding first opened after a prior audit-log-only `main` head failed Vitest, was resolved after green reruns, and reopened on 2026-08-09 when another audit-log-only head failed with asynchronous Ollama lifecycle errors. The current pre-audit `main` head `ac84dad...` again changes only this Markdown audit log and its exact CI is fully green: install, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check` all pass. This resolves the current default-branch red signal without claiming an application-code remediation.
- **First seen:** 2026-08-07 05:06 UTC
- **Historically resolved:** 2026-08-07 21:00 UTC
- **Reopened:** 2026-08-09 21:03 UTC
- **Resolved again:** 2026-08-10 05:00 UTC
- **Last seen:** 2026-08-10 05:00 UTC
- **Status:** Resolved for current `main` CI health
- **Affected component:** Default-branch frontend test lifecycle and release-manifest gate
- **Recommended remediation:** Continue deterministic cleanup of asynchronous Ollama/account-identity tasks and keep Vitest plus release-manifest validation required by branch governance.
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
| 2026-08-08 21:13 | VS-AUDIT-025 opened for the Cloudflare MCP actual-body-size enforcement gap; VS-AUDIT-026 opened for third-party runtime JavaScript on the OAuth credential page. PR #31 advanced with green exact-head workflows; environment mismatch evidence strengthened; updater revalidated stale; live Supabase/Stripe remained blocked. |
| 2026-08-09 05:02 | VS-AUDIT-027 opened for missing Model Foundry aggregate source limits. Repository release evidence explicitly mapped the connected Supabase target as AccessRevamp-oriented and a different project as the repository-pinned VibeSpace issuer; live Supabase/Stripe remained blocked. |
| 2026-08-09 13:01 | VS-AUDIT-028 opened after PR #31 exact-head Vitest failed with unhandled Ollama cancellation errors; AI-boundary and Rust compile checks remained successful. Dependabot alerts remained disabled; no clear actionable Gmail customer incident. |
| 2026-08-09 21:03 | VS-AUDIT-029 opened after GitHub branch/ruleset reads showed `main` unprotected with no enforced ruleset. VS-AUDIT-030 opened for mutable action references in the signed release pipeline. VS-AUDIT-021 reopened because the audit-log-only `main` head failed Vitest and skipped release-manifest validation. PR #31 remained exact-head frontend-red. Supabase stayed permission-denied and Stripe stayed blocked by interactive authentication. No remediation was performed. |
| 2026-08-10 05:00 | VS-AUDIT-031 opened after the current PR patch was found deleting the documented 905-line Windows installer despite PR release text saying that unexplained deletion was protected/not authorized. Current PR head `33630c7...` is 1,568 files / 185,683 additions / 10,621 deletions / 195 commits, 195 ahead/11 behind current `main`; AI-boundary and Rust compile pass, but Vitest fails with direct account-identity/cloud-sync lifecycle assertions and release-manifest validation is skipped. Current pre-audit `main` CI is green, resolving VS-AUDIT-021 again. Branch protection remains absent, Dependabot remains disabled, no new indexed literal secret was found, and current MCP code still trusts declared request length. Gmail found the exact-head CI failure but no clear customer/payment/security incident. Supabase live reads remain permission-denied and Stripe reads remain blocked by non-interactive authentication. No remediation was performed. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.
