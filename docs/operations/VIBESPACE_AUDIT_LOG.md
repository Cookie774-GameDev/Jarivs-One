# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-08 21:13 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 11 |
| Low | 0 |
| Informational | 3 |
| Resolved history | 3 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live Supabase check found that a verified authenticated session could update another customer's `profiles` row without proving ownership. PR #31 now contains a substantially stronger owner-only migration, but it is unmerged and live deployment is unverified.
2. **VS-AUDIT-001 — Critical:** The last successful live Supabase check found nine broad verified-session `SELECT` policies that did not enforce row ownership. Live policy state could not be refreshed.
3. **VS-AUDIT-018 — High:** The shipped desktop updater's first endpoint still serves a stale/incomplete `0.1.48` Windows-only manifest while the app reports `1.5.0`.
4. **VS-AUDIT-016 — High:** Supabase previously reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact remains unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
6. **VS-AUDIT-003 — High:** The connected Supabase project still is not proven to be the authoritative VibeSpace backend; PR #31 now explicitly configures the VibeSpace MCP worker against a different Supabase project reference than the connected audit target.
7. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment/catalog/runtime evidence were mismatched at the last successful live check.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved.
9. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft despite green exact-head CI and AI-boundary workflows.
10. **VS-AUDIT-025 — Medium:** PR #31's Cloudflare MCP gateway enforces its 256 KiB request limit only from the caller-supplied `Content-Length` header, leaving an actual-body-size enforcement gap before the MCP handler.
11. **VS-AUDIT-026 — Medium:** PR #31's OAuth consent page accepts VibeSpace credentials while executing the Supabase client library directly from a third-party CDN at runtime.
12. **VS-AUDIT-024 — Medium:** The stale native command-authority fixture has been reconciled on the current PR head, but default CI still omits `cargo test` and does not execute the new MCP worker's dedicated tests/typecheck/dry-run checks.
13. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain remains recorded as suspended for incomplete billing setup. VibeSpace dependency is unconfirmed; owner attention is required if VibeSpace support or operations depend on that tenant.
14. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Administrative Google/Stripe/Fly.io and Vercel sign-in/authorization events require owner confirmation if unrecognized.

## Current run summary

### Checks completed

- **GitHub:** fetched the existing audit file before work and re-fetched the current blob immediately before the only write. Reviewed default-branch commits and Actions since the prior run; PR #31 metadata, 14-commit interval delta, current comparison to `main`, exact-head CI and AI-boundary workflows, issue/PR comments, reviews, inline review comments, Discussions availability, branch/security endpoint accessibility, dependency/reproducibility configuration, updater configuration, Supabase repository configuration/migrations, current secret-pattern searches, browser-chat/native authority, Model Foundry local-training trust boundaries, the new Cloudflare MCP gateway/OAuth consent/relay implementation, and selected Python cloud bridge code. No application/configuration code landed on `main` during the interval; the new `main` commit before this run was the prior audit-log update.
- **Gmail:** searched the interval and current merged inbox for VibeSpace/support/bug/crash/security/billing/payment/refund/dispute/webhook/Stripe/Supabase/login signals and searched relevant spam/trash. Read only the operationally relevant alerts. No clear new VibeSpace customer support, payment, refund, dispute, webhook, Supabase, Stripe, login, security, or bug incident was identified. Gmail did report a failed CI run on a superseded PR head, a blocked GitHub Pages deployment, a new Google sign-in alert, and a Google authorization event associated with Fly.io. No message, label, or inbox state was changed.
- **Supabase:** attempted live Security Advisor and Auth-log access for project `vbkkimvedmklebghtkzs`. Interactive authorization was required, so current advisors, logs, RLS/policies, grants, schema, database performance, migrations, deployed Edge Functions, storage, and realtime state could not be refreshed. Repository migrations/configuration were reviewed read-only. No Supabase write was invoked.
- **Stripe:** attempted live account information and read-only health discovery for account `acct_1TgcExLB61vquDsm`. Interactive authorization was required, so current payments, incomplete/failed payments, refunds, disputes, customers, subscriptions, invoices, webhooks/events, suspicious activity, integration state, and account health could not be refreshed. No Stripe write was invoked.

### New findings

- **VS-AUDIT-025 — Medium:** The unmerged Cloudflare MCP gateway declares `MAX_MCP_REQUEST_BYTES = 256 * 1024`, but `/mcp` rejects large requests only when the caller-provided `Content-Length` value exceeds that threshold. If the header is omitted or otherwise does not represent the actual body length, the code does not independently count/bound body bytes before passing the request to the MCP handler. The parallel Python ASGI implementation does enforce an actual streamed-byte ceiling, demonstrating an intended stronger boundary. No authentication bypass, code execution, or proven production outage is claimed; this is an input-boundary/availability risk on an unmerged public endpoint.
- **VS-AUDIT-026 — Medium:** The unmerged OAuth consent page contains a password form and executes `@supabase/supabase-js` by direct ESM import from jsDelivr at runtime. The page itself uses safe text insertion and HTTPS redirect checks, and no malicious CDN behavior was observed. However, because authentication credentials are handled in a page whose executable dependency is fetched from a third-party distribution origin at runtime, compromise/misdirection of that dependency path would have credential-confidentiality impact. The observed GitHub Pages deployment attempt was blocked, so this is not being presented as a shipped incident.

### Changed findings

- **VS-AUDIT-013:** PR #31 advanced 14 commits from the prior audited head to `b6bee7cd686b8252634831bb5660b4b3dd9039aa`. It remains open and draft. GitHub reports **1,404 changed files, 162,890 additions, 8,411 deletions**, and the branch is **161 commits ahead and seven behind `main`**. Exact-head CI completed successfully after TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check`; the exact-head AI-boundary workflow also passed. A superseded head failed Vitest with a post-test async teardown error (`window is not defined`) in the Ollama bootstrap path, but the current head is green. A GitHub Pages deployment attempt for the OAuth-consent branch was rejected by environment protection rules. No submitted PR review or inline review comments were exposed. High release-readiness risk remains because the branch is enormous and production-like packaged/native, live migration, billing, authorization, deployment, rollback, MCP gateway, and stress testing remain incomplete or external.
- **VS-AUDIT-024:** The current `run_ordinary` command list and frozen `ORDINARY_HANDLER_AUTHORITY` now both include the three browser-chat surface commands, so the deterministic stale-fixture mismatch identified in the prior run is corrected on the branch. The finding remains open because default CI still executes only `cargo check --release`, not `cargo test`, and root npm workspaces include only `app`, so the new `workers/vibespace-mcp` package's own security tests/typecheck/Wrangler dry-run are not part of the default PR gate.
- **VS-AUDIT-003:** Environment identity uncertainty is stronger. The latest successful connected-project check looked AccessRevamp-oriented, while PR #31's explicitly VibeSpace-branded MCP Worker is configured against a different Supabase project reference than `vbkkimvedmklebghtkzs`. This does not prove the connected project is obsolete, but it proves multiple candidate Supabase environments now exist in the operational surface and the authoritative production backend must be documented before live findings can be closed.
- **VS-AUDIT-012:** PR #31 migration `0037_profiles_display_name_security.sql` now drops the complete existing `profiles` policy set, creates owner-only `SELECT`/`UPDATE` policies using `auth.uid() = id`, removes broad table grants, and grants authenticated users only `SELECT` plus `UPDATE(display_name)`. That draft is materially stronger and appears structurally aligned with the prior Critical profile finding, but it is unmerged and cannot be treated as remediation until deployed and tested on the authoritative live project with two-account negative tests.
- **VS-AUDIT-018:** Revalidated on `main`: the application remains version `1.5.0`; the first updater endpoint is still `releases/channel.json`; that manifest is still `0.1.48`, Windows x64 only, and lacks an artifact signature field.
- **VS-AUDIT-020:** Revalidated repository defaults on `main`: six-character minimum password, no password composition requirement, and `secure_password_change = false`. Hosted applicability remains unverified.
- **VS-AUDIT-022:** Dependency/reproducibility gaps remain. The default workflow has no dependency-vulnerability gate; direct vulnerability-alert status could not be re-read due connector permissions; no committed desktop `Cargo.lock` was previously verified; and the newly added MCP worker has an independent dependency/test surface not exercised by root CI.
- **VS-AUDIT-023:** The prior media-memory finding remains open on the draft branch; no evidence this run established an aggregate media-byte cap or shipping to `main`.
- **VS-AUDIT-007:** Gmail now reports **INBOX 2,006 total / 1,435 unread**, **SPAM 131 / 82 unread**, and **TRASH 260 / 219 unread**. Targeted current searches found no actionable VibeSpace customer support or billing/security incident.
- **VS-AUDIT-014:** A new Google sign-in alert and a Google data-sharing authorization event for Fly.io appeared during the interval. No evidence establishes unauthorized access or VibeSpace-specific impact; owner confirmation remains appropriate if those actions were not recognized.
- **VS-AUDIT-005:** Current indexed repository searches returned no result for selected literal `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, or private-key-header patterns. This does not clear repository history/forks, the historical push-protection bypass, or direct secret-scanning alerts, which remain unavailable through the connector.

### Resolved findings

- None.

### Connector failures and blind spots

- Supabase live policies/grants/schema, Security and Performance Advisors, API/Auth/Postgres/Edge Function/storage/realtime logs, database performance, deployed migrations/functions, and storage/realtime state could not be refreshed because interactive authorization was required. Critical/High Supabase-backed findings retain their latest successful live validation timestamp of **2026-08-02 21:00 UTC**.
- Stripe account identity/health, payments, customers, products/prices, subscriptions, invoices, refunds, disputes, events, suspicious-activity signals, and webhook health could not be refreshed because read-only Stripe access required interactive authorization. The latest successful live Stripe validation remains **2026-08-02 21:00 UTC**.
- GitHub Discussions are disabled. Branch-protection and direct vulnerability/secret/code-scanning alert endpoints were not accessible to the integration. No submitted review or inline-review comment was found through available PR review surfaces; absence is not equivalent to independent review.
- PR #31 is too large for complete line-by-line and dynamic review in one run. Current CI is green but the default Rust gate does not run native tests, and the dedicated MCP Worker package is outside the root workspace/CI. Packaged Windows/macOS/Linux execution, live migrations, end-to-end billing, two-account adversarial authorization, OAuth/MCP deployment, rollback, browser-provider behavior, and realistic media/resource-exhaustion tests remain unverified.
- Gmail merged-account volume, search semantics, result limits, and unverified public support aliases constrain completeness. Relevant spam/trash were searched, but no-match results do not prove no operational email exists elsewhere.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update another customer profile
- **Severity:** Critical
- **Source:** Supabase live RLS policies/profile schema; PR #31 migration `0037_profiles_display_name_security.sql`
- **Evidence summary:** The last successful live check found a verified-session update policy on `profiles` that did not require row ownership. The current draft migration now resets all profile policies, creates owner-only `SELECT`/`UPDATE` checks using `auth.uid() = id`, and restricts ordinary authenticated writes to `display_name`, but it is unmerged and its deployment to the authoritative live project is unverified. No cross-account write was attempted by this audit.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (open status carried forward; draft remediation strengthened; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; strong draft remediation exists, live state unverified
- **Affected component:** Customer profile authorization and server-owned identity/billing fields
- **Recommended remediation:** Deploy the canonical policy/grant reset only to the confirmed VibeSpace backend under controlled migration; verify no environment-specific permissive policies survive; run two-account negative read/update tests and server-role billing-field tests before release.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads
- **Severity:** Critical
- **Source:** Supabase live policies/grants; draft authorization migrations
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies across customer/project/order/entitlement/delivery/design/workflow/update/refund data accepted verified-session state without requiring row ownership at the last successful live check. Repository hardening work exists, but current live policies could not be inspected.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Authorization boundary for profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Recommended remediation:** Inventory and remove every session-only permissive policy on the authoritative project; require direct ownership or tightly scoped staff roles; deploy controlled migrations; run two-account negative tests for every exposed table/RPC.
- **Immediate owner attention:** Yes

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and invalid
- **Severity:** High
- **Source:** `app/src-tauri/tauri.conf.json`, `releases/channel.json`, updater configuration
- **Evidence summary:** `main` identifies VibeSpace as `1.5.0` while the first configured updater endpoint still serves `0.1.48`, only Windows x64, and has no artifact signature field. The second endpoint may be valid, but this audit does not assume fallback behavior makes a successful-but-invalid first manifest harmless.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; current on `main`
- **Affected component:** Desktop update discovery and security/reliability patch delivery
- **Recommended remediation:** Remove or atomically replace the legacy first endpoint; validate the exact first configured manifest in release gating; require supported targets/URLs/signatures; package-test update discovery and rollback on signed artifacts.
- **Immediate owner attention:** Yes

### VS-AUDIT-016 — RLS-disabled public table alert in another Supabase project
- **Severity:** High
- **Source:** Gmail Supabase Security Advisor notification
- **Evidence summary:** Supabase reported `rls_disabled_in_public` for a public-schema table in a project whose reference did not match the specified VibeSpace audit target. The table was not identified in the email; direct VibeSpace impact remains unconfirmed.
- **First seen:** 2026-08-04 16:26 UTC
- **Last seen:** 2026-08-04 16:26 UTC
- **Status:** Open; owner validation required
- **Affected component:** Another Supabase project visible through the merged administrative inbox
- **Recommended remediation:** Identify the project/table directly, determine whether public access is intentional, enable/test RLS if not, and document any VibeSpace dependency.
- **Immediate owner attention:** Yes

### VS-AUDIT-002 — Refund-request insertion is not bound to signed-in owner
- **Severity:** High
- **Source:** Supabase live RLS policies/grants
- **Evidence summary:** The last live check found an owner-bound insert policy plus a second permissive policy checking only verified-session state. Permissive PostgreSQL policies combine with OR semantics. Current live state is unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Refund-request integrity
- **Recommended remediation:** Remove broad insert policies; require `user_id = auth.uid()` and an ownership-checked eligible order in RLS/server validation; test forged-owner and forged-order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Authoritative VibeSpace Supabase project is not established
- **Severity:** High
- **Source:** Last successful connected-project schema/log/function inspection; PR #31 MCP Worker configuration
- **Evidence summary:** The connected project previously appeared dominated by AccessRevamp-oriented state rather than clearly VibeSpace-specific production state. Current PR #31 now explicitly configures the VibeSpace MCP Worker against a different Supabase project reference than the connected audit target, proving multiple candidate environments exist. This does not by itself establish which environment is production.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; evidence strengthened; authoritative environment confirmation required
- **Affected component:** Audit coverage, authentication, deployment assurance, environment isolation
- **Recommended remediation:** Establish and document a single authoritative production VibeSpace Supabase project reference and ownership boundary; reconcile desktop, Edge Function, MCP Worker, and deployment configuration; then rerun advisors/RLS/log/function checks against that exact project.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty
- **Severity:** High
- **Source:** Last successful Stripe reads, Supabase payment/catalog/runtime evidence, Gmail Stripe notifications
- **Evidence summary:** At the last successful live check, the specified Stripe account had none of the checked transactional/catalog/webhook objects while the connected Supabase environment recorded catalog/order/runtime state and an open webhook-failure incident. Multiple Stripe identities/accounts have appeared in merged administrative evidence. Live refresh is blocked.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live refresh blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Checkout, payment fulfillment, webhook processing, environment configuration
- **Recommended remediation:** Inventory and document the authoritative Stripe account/environment; reconcile catalog/prices with the confirmed VibeSpace backend; verify webhook endpoint/signing secret without exposing it; complete safe test-mode end-to-end purchase, failure, refund, subscription, and fulfillment tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern
- **Severity:** High
- **Source:** Historical GitHub secret-scanning notification, current repository searches, connector limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Current indexed searches did not return selected literal secret prefixes, but direct secret-scanning alert inventory is inaccessible and this does not prove the historical value synthetic/revoked or absent from history/forks.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-08 21:13 UTC (historical event unresolved)
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the original alert directly; prove synthetic or rotate/revoke; replace key-shaped fixtures; inspect history/forks/caches; close only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge or deploy without additional release evidence
- **Severity:** High
- **Source:** GitHub PR metadata/comparison, exact-head Actions, review surfaces, selected code/deployment review
- **Evidence summary:** PR #31 is draft at `b6bee7cd686b8252634831bb5660b4b3dd9039aa`, with 1,404 changed files, 162,890 additions, 8,411 deletions, 161 commits ahead and seven behind `main`. Exact-head CI and AI-boundary workflows pass. The branch includes major changes across auth, Supabase/Stripe-related code, Tauri/native commands, browser automation, MCP/OAuth/relay, model training, multimodal chat, voice/calling, AI runtime, themes/UI, and deployment tooling. No submitted review or inline review comments were exposed. A superseded head had a Vitest async-teardown error; a Pages deployment attempt was blocked by environment protection. Separate findings track media-memory, CI/security-test coverage, MCP request sizing, and OAuth dependency trust.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; unmerged draft; exact-head CI green but release evidence incomplete
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze/split scope; sync `main`; require independent subsystem/security/billing/native review; enforce all dedicated test suites; run production-like migrations, two-account authorization tests, Stripe test-mode flows, packaged multi-platform/native-device tests, OAuth/MCP deployment tests, rollback tests, and media/resource-exhaustion stress tests on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy yet

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended
- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A prior Google notice states the merged AccessRevamp-oriented Workspace Business Starter subscription is suspended because billing setup was not completed. No evidence establishes that VibeSpace depends on that tenant, and no superseding billing-status message was found this run.
- **First seen:** 2026-08-04 20:47 UTC
- **Last seen:** 2026-08-07 02:51 UTC
- **Status:** Open/reopened; VibeSpace relevance unconfirmed
- **Affected component:** Workspace/mailbox availability for a merged administrative/support domain
- **Recommended remediation:** Determine whether VibeSpace support/admin identity/recovery relies on this tenant; if so restore billing/access and verify mailbox/data continuity; document tenant isolation.
- **Immediate owner attention:** Conditional — yes if VibeSpace depends on this tenant

### VS-AUDIT-020 — Weak password and password-change defaults in Supabase configuration
- **Severity:** Medium
- **Source:** Repository `supabase/config.toml` on `main`
- **Evidence summary:** Repository configuration still uses a six-character minimum, no composition requirement, and `secure_password_change = false`. Hosted applicability remains unverified because live settings could not be read.
- **First seen:** 2026-08-06 05:15 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy/account-change protection
- **Recommended remediation:** Adopt stronger passphrase-aligned minimums, recent reauthentication for password changes, leaked-password protection, controlled deployment, and hosted-flow verification.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified
- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** No clear new VibeSpace customer operational request was found. Gmail reports INBOX 2,006 total / 1,435 unread, SPAM 131 / 82 unread, and TRASH 260 / 219 unread. At least one VibeSpace-domain route is previously evidenced, but public support aliases, routing rules, queue ownership, response state, and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm the public support address with controlled external delivery and use a dedicated VibeSpace queue with ownership/response-state/SLA tracking.
- **Immediate owner attention:** No, unless customers use unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled
- **Severity:** Medium
- **Source:** Supabase Security Advisor
- **Evidence summary:** The last successful live Security Advisor check reported leaked-password protection disabled. Current advisor access was blocked by interactive authorization.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Password authentication
- **Recommended remediation:** Enable leaked-password protection, strengthen password policy, verify reset/change reauthentication behavior.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView and native-command authority remain broad
- **Severity:** Medium
- **Source:** Tauri configuration/capabilities/custom commands/windows and selected PR #31 native/browser changes
- **Evidence summary:** The application has broad local/native functionality and PR #31 adds provider browser WebViews/native commands. Inspected browser-chat grants remain read-only and constrained to user-selected workspace roots; no exploit path from arbitrary remote content to privileged IPC was demonstrated. The native frozen-authority mismatch from the previous run is now fixed, while test-gate coverage remains tracked separately in VS-AUDIT-024.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset/native HTTP/process/updater permissions, IPC, file access, CSP/window isolation
- **Recommended remediation:** Maintain explicit per-window command allowlists, separate privileged/unprivileged WebViews, narrow roots/origins/plugin permissions, and add negative IPC/capability tests to required CI.
- **Immediate owner attention:** No immediate exploit established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs
- **Severity:** Medium
- **Source:** Supabase API logs from latest successful live check
- **Evidence summary:** The latest successful live logs showed suppression-list requests placing batches of email addresses in query parameters, causing log retention. Traffic appeared AccessRevamp-related rather than clearly VibeSpace-related. Live logs could not be refreshed.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open
- **Affected component:** Privacy/logging/suppression-list processing
- **Recommended remediation:** Move address data to bounded server-side bodies/RPC or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure demonstrated

### VS-AUDIT-022 — Dependency vulnerability monitoring and reproducibility are incomplete
- **Severity:** Medium
- **Source:** GitHub dependency/security configuration, default CI, Rust build state, MCP Worker package
- **Evidence summary:** GitHub previously reported Dependabot alerts disabled. `.github/dependabot.yml` was absent in prior checks; default CI has no dependency-vulnerability audit gate; a committed desktop `Cargo.lock` was not found in prior checks and Cargo runs without `--locked`. The new `workers/vibespace-mcp` package defines its own test/typecheck/dry-run `check` but is not in the root npm workspace and is not executed by default CI. This establishes monitoring/reproducibility/test-assurance gaps, not a current vulnerable-dependency claim.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; scope expanded to the MCP Worker dependency/test surface
- **Affected component:** Dependency vulnerability monitoring and release reproducibility/assurance
- **Recommended remediation:** Enable reviewed dependency alerts/updates; add dependency audit/review gates for every package ecosystem; commit/pin Rust application resolution as appropriate and use locked release builds; integrate the MCP Worker package checks into required CI; document exceptions/false positives.
- **Immediate owner attention:** No current vulnerable package established; address before next release/large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget
- **Severity:** Medium
- **Source:** PR #31 chat media implementation
- **Evidence summary:** Prior direct review established that the draft composer permits 24 media items, duplicate/repeated drops, and videos up to 40 MiB each without an aggregate-byte ceiling, while video payloads are represented/decoded in ways that can create large duplicate memory footprints. No remote trigger was established and no evidence shows this code shipped to `main`.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer media, renderer memory, video preview/model preprocessing
- **Recommended remediation:** Enforce aggregate draft bytes before reads, lower global video count, prefer Blob/object URLs or bounded temp-file references, avoid full-file copies where possible, and add near-limit repeated-drop/send stress tests.
- **Immediate owner attention:** Block merge/release until bounded and stress-tested

### VS-AUDIT-024 — Default CI omits security-critical Rust and MCP Worker test suites
- **Severity:** Medium
- **Source:** PR #31 current `app/src-tauri/src/lib.rs`, `.github/workflows/ci.yml`, root `package.json`, `workers/vibespace-mcp/package.json`
- **Evidence summary:** The prior deterministic mismatch between the native command registration list and frozen authority is fixed on current head: both now include the three browser-chat surface commands. However, default CI still performs Rust `cargo check --release` without `cargo test`, so frozen command-authority and other native unit/security tests are not required. Root npm workspaces include only `app`, while the new MCP Worker package has its own tests/typecheck/Wrangler dry-run checks that default CI does not call. This is a release-assurance gap, not evidence that a command or Worker endpoint is exploitable.
- **First seen:** 2026-08-08 13:15 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open; stale authority fixed, systemic test-gate gap remains
- **Affected component:** Native Tauri command authority, MCP gateway, security-regression CI
- **Recommended remediation:** Add appropriate Rust unit/security tests to required CI; execute `workers/vibespace-mcp` test/typecheck/dry-run checks on every relevant PR; require these on the immutable release SHA.
- **Immediate owner attention:** Yes before merging PR #31

### VS-AUDIT-025 — Cloudflare MCP body limit trusts `Content-Length` instead of measured body bytes
- **Severity:** Medium
- **Source:** PR #31 `workers/vibespace-mcp/src/index.ts`; parallel bounded Python MCP implementation
- **Evidence summary:** The Worker sets a 256 KiB maximum but derives the decision solely from `Number(request.headers.get('content-length') ?? 0)`. Requests with no `Content-Length` pass that check as zero, and the code does not independently read/count/bound body bytes before handing the request to the MCP SDK handler. Authentication is still required; no auth bypass or code execution is claimed. The parallel Python ASGI bridge explicitly counts streamed request bytes, which shows the stronger bound is feasible and consistent with the intended policy.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open on unmerged PR #31
- **Affected component:** Public Cloudflare MCP HTTP endpoint, request parsing/resource consumption
- **Recommended remediation:** Enforce the limit on actual received bytes before SDK parsing regardless of headers; reject over-limit streams deterministically; add tests for omitted, inaccurate, and oversized `Content-Length` cases plus chunked/streamed bodies; preserve authentication and origin/host checks.
- **Immediate owner attention:** Yes before MCP gateway deployment

### VS-AUDIT-026 — OAuth credential page executes authentication library from a third-party CDN at runtime
- **Severity:** Medium
- **Source:** PR #31 `site/oauth/consent/index.html` and `site/oauth/consent/oauth-consent.js`
- **Evidence summary:** The consent page asks for email/password and its module imports the Supabase client directly from a pinned jsDelivr URL at runtime. The inspected page uses `textContent` for untrusted display data and requires HTTPS for returned redirects; no XSS/open-redirect or malicious CDN behavior was demonstrated. The concern is supply-chain trust: executable third-party CDN content runs in a credential-handling origin. A deployment attempt was blocked by GitHub Pages environment protection, so no shipped compromise is claimed.
- **First seen:** 2026-08-08 21:13 UTC
- **Last seen:** 2026-08-08 21:13 UTC
- **Status:** Open on unmerged/unverified deployment path
- **Affected component:** OAuth consent/sign-in page and credential confidentiality/availability
- **Recommended remediation:** Bundle and self-host the exact audited Supabase client with the deployed site artifact; add a restrictive CSP centered on `'self'`; pin/verify build dependencies in CI and test the final deployed artifact. Avoid runtime third-party executable dependencies on credential-entry pages where possible.
- **Immediate owner attention:** Yes before deploying the OAuth consent page

### VS-AUDIT-014 — Administrative Google/Stripe/Fly.io sign-in and authorization alerts
- **Severity:** Informational
- **Source:** Gmail Google Account security/authorization and historical Stripe SSO notices
- **Evidence summary:** Several Google new-sign-in alerts and a closely timed Stripe Google-SSO notice were observed historically. This run added a new Google sign-in alert and an authorization notice that Google account profile data was shared with Fly.io. These may be owner-initiated and do not establish unauthorized VibeSpace access.
- **First seen:** 2026-08-03 03:06 UTC
- **Last seen:** 2026-08-08 16:52 UTC
- **Status:** Open; owner confirmation required
- **Affected component:** Administrative Google identity and connected services
- **Recommended remediation:** Confirm the events in Google/Stripe/Fly.io security activity; revoke unknown sessions/connections and rotate credentials if unrecognized; verify MFA/recovery controls.
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
- **Evidence summary:** The latest successful advisor check reported unused/duplicate-index signals. The database was young and low-traffic, so signal alone did not justify index deletion. Current advisor state could not be refreshed.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 21:13 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated live:** 2026-08-02 21:00 UTC
- **Status:** Open; observe
- **Affected component:** PostgreSQL maintenance/write overhead
- **Recommended remediation:** Observe representative query statistics and remove/consolidate only after proving redundancy and constraint/query safety.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation
- **Severity:** Medium
- **Source:** Historical GitHub Actions run `31104440221` and later successful `main` runs
- **Evidence summary:** A prior audit-log-only `main` commit failed Vitest and skipped release-manifest validation, while typecheck/build/Rust passed. Later directly verified `main` CI passed dependency install, typecheck, Vite build, Vitest, release-manifest validation, and Rust `cargo check`. The current interval's audit-log-only `main` commit also has successful CI.
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
| 2026-08-07 13:04 | PR #31 current head re-established with successful exact-head Actions; stale updater/weak auth defaults unchanged; no new actionable Gmail signal; live Supabase/Stripe blocked. |
| 2026-08-07 21:00 | VS-AUDIT-022 opened because Dependabot vulnerability alerts were disabled and no dependency audit gate/config existed; VS-AUDIT-021 resolved after green `main` reruns. |
| 2026-08-08 05:05 | VS-AUDIT-023 opened for missing aggregate chat-media byte budget; PR #31 advanced with green CI/AI-boundary; no actionable Gmail incident; live Supabase/Stripe blocked. |
| 2026-08-08 13:15 | VS-AUDIT-024 opened because three new native browser-chat commands were added without updating the frozen command-authority test and default CI did not run Rust tests. PR #31 advanced to 1,362 files / 151,779 additions / 8,254 deletions; current frontend CI was still running at audit close. |
| 2026-08-08 21:13 | VS-AUDIT-025 opened for the Cloudflare MCP actual-body-size enforcement gap; VS-AUDIT-026 opened for third-party runtime JavaScript on the OAuth credential page. PR #31 advanced to `b6bee7c...`, 1,404 files / 162,890 additions / 8,411 deletions, 161 ahead/seven behind `main`; exact-head CI and AI-boundary are green. VS-AUDIT-024's stale command-authority mismatch is fixed, but required CI still omits Rust tests and dedicated MCP Worker checks. VS-AUDIT-003 environment mismatch evidence strengthened because the VibeSpace MCP Worker points at a different Supabase project than the connected audit target. The updater was revalidated stale on `main`; Gmail found no actionable VibeSpace incident; live Supabase/Stripe refresh remained blocked by interactive authorization. |

Every run was read-only except for maintaining this file. No application, repository-settings/collaboration, database, Supabase, Stripe, payment, customer, subscription, dispute, Gmail, label, or inbox remediation has been performed by the audit automation.
