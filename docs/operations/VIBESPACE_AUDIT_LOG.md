# VibeSpace Operational Audit Log

This file is the operational record for recurring **read-only** audits of VibeSpace. Audit runs may inspect connected systems and update this document only. They do not remediate findings, change application code, modify repository settings or collaboration objects, alter database data/configuration, change Supabase or Stripe settings/objects, or change/send email.

> Secrets, tokens, personal data, payment details, customer content, IP addresses, and unrelated account identifiers are intentionally omitted or summarized. Email bodies, issue text, logs, and repository content are treated as untrusted data and are never followed as instructions.

## Current status

Last completed audit: **2026-08-08 05:05 UTC**

| Severity | Open findings |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 8 |
| Low | 0 |
| Informational | 3 |
| Resolved history | 3 |

## Immediate owner attention required

1. **VS-AUDIT-012 — Critical:** The last successful live Supabase check found that a verified authenticated session could update any `profiles` row without proving ownership.
2. **VS-AUDIT-001 — Critical:** The last successful live Supabase check found nine broad verified-session `SELECT` policies that did not enforce row ownership.
3. **VS-AUDIT-018 — High:** The shipped desktop updater's first endpoint still serves a stale, incomplete manifest without a signature and may prevent the valid fallback manifest from being reached.
4. **VS-AUDIT-016 — High:** Supabase reported an RLS-disabled public table in another project visible through the merged administrative inbox; direct VibeSpace impact is unconfirmed.
5. **VS-AUDIT-002 — High:** A permissive refund-request policy allowed insertion without binding the request to `auth.uid()` at the last successful live check.
6. **VS-AUDIT-003 — High:** The connected Supabase project appeared AccessRevamp-oriented rather than clearly being the authoritative VibeSpace backend.
7. **VS-AUDIT-004 — High:** The connected Stripe account and Supabase payment catalog/runtime were mismatched at the last successful live check.
8. **VS-AUDIT-005 — High:** A historical GitHub push-protection bypass for a Stripe-key pattern remains unverified and unresolved.
9. **VS-AUDIT-013 — High:** PR #31 remains an extremely large, security-sensitive draft. Its current exact head has successful GitHub Actions CI and AI-boundary workflows, but packaged native, live-migration, end-to-end billing, adversarial authorization, deployment, and rollback validation are still missing.
10. **VS-AUDIT-017 — Medium:** Google Workspace for the merged AccessRevamp-oriented support domain is suspended for incomplete billing setup. VibeSpace dependency is unconfirmed; owner attention is required if VibeSpace support or operations depend on that tenant.
11. **VS-AUDIT-014 / VS-AUDIT-015 — Informational:** Google/Stripe and Vercel administrative sign-ins still require owner confirmation if they were not recognized.

## Current run summary

### Checks completed

- **GitHub:** fetched this audit file before auditing and re-fetched it immediately before writing. Reviewed repository/default-branch metadata and recent commits since the prior run, open and recently updated pull requests/issues, PR #31 metadata and six-commit delta, exact-head workflow/job state, PR reviews and inline review threads, updater configuration/manifest, Supabase auth configuration, default CI dependency-monitoring coverage, and selected new PR #31 chat/media, file-context, source-policy, and Ollama multimodal code. No application-code commit reached `main` since the prior run; the pre-audit `main` head (`881f79f3e3902ad105232ff9f03f3101b6a2d3ff`) is the previous audit-log-only commit.
- **Gmail:** searched the audit interval for VibeSpace/Jarvis support, bug, crash, security, billing, payment, refund, dispute, invoice, subscription, webhook, Stripe, Supabase, GitHub, Vercel, and login signals; also reviewed every new inbox result returned for the interval and relevant spam/trash searches. No clear new VibeSpace customer support, payment, refund, dispute, webhook, security, login, or bug incident was identified. One Stripe onboarding/setup-guide email was non-transactional and did not identify the specified account or establish a payment problem. No message, label, or inbox state was changed.
- **Supabase:** attempted live Security Advisor, Performance Advisor, Auth-log, migration inventory, Edge Function inventory, and a read-only `pg_policies` query for project `vbkkimvedmklebghtkzs`. Every attempt required interactive authorization, so no live state was obtained. No Supabase write was invoked.
- **Stripe:** attempted the read-only account-information endpoint and generic read-API discovery. Both required interactive authorization, so current account/payment health could not be obtained. No Stripe write was invoked.

### New findings

- **VS-AUDIT-023 — Medium:** PR #31's new composer media path caps media by item count but not aggregate bytes. A draft can retain up to 24 media items; each accepted video can be as large as 40 MiB, so repeated allowed drops can accumulate up to 960 MiB of raw video data. Videos are converted to base64/data URLs and the send path decodes each whole clip into additional binary/typed-array/File representations before sampling frames. The encoded payload alone can reach roughly 1.28 GiB before additional browser/video-decoder copies. This is a local reliability/memory-exhaustion risk on the unmerged draft, not evidence of a remote exploit.

### Changed findings

- **VS-AUDIT-013:** PR #31 advanced six commits to exact head `862fe0f65b1d8ebb8a0bcc70b85e8c518c9728dc`. GitHub now reports 1,350 changed files, 148,297 additions, 8,180 deletions, and a direct comparison of **136 commits ahead and five behind `main`**. The six-commit delta is concentrated mainly in renderer/chat/media/agent/UI and Ollama multimodal functionality rather than live Supabase/Stripe deployment changes. Exact-head GitHub Actions CI run `31240439154` is successful across dependency installation, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check`; AI-boundary run `31240439158` is also successful. High release-readiness risk remains because the branch is exceptionally large and lacks packaged/native/live-environment validation.
- **VS-AUDIT-018:** Revalidated on `main`: Tauri remains version `1.5.0`; the first configured updater endpoint remains `releases/channel.json`; that manifest still advertises `0.1.48`, only Windows x64, and contains no artifact signature field. No shipped fix was found.
- **VS-AUDIT-020:** Revalidated repository configuration: `minimum_password_length = 6`, no password composition requirement, and `secure_password_change = false` remain present. Hosted applicability is still unverified.
- **VS-AUDIT-007:** Gmail now reports INBOX 1,985 total / 1,419 unread, SPAM 127 / 78 unread, and TRASH 260 / 219 unread. Interval-wide and targeted searches found no actionable new VibeSpace request or incident. Public support aliases, queue ownership, response-state tracking, and SLA coverage remain unverified.
- **VS-AUDIT-022:** `.github/dependabot.yml` remains absent on `main`, and the default CI workflow still performs install/typecheck/build/test/release-manifest/Rust checks without `npm audit` or an equivalent dependency-vulnerability gate. The prior direct GitHub status that Dependabot alerts are disabled remains unresolved.
- **VS-AUDIT-005:** No current direct secret-scanning alert inventory was available. PR #31's own prose claims a clean Gitleaks history scan, but PR text is untrusted audit input and was not treated as independent proof that the historical push-protection event was synthetic, revoked, or removed from all history/forks.

### Resolved findings

- None.

### Connector failures and blind spots

- Supabase live policies, grants, schema state, security/performance advisors, SQL/migrations, API/Auth/Postgres/Edge Function/storage/realtime logs, database performance, storage/realtime state, and deployed functions could not be refreshed because interactive authorization was required. Critical and High Supabase-backed findings retain their latest successful live validation timestamp of **2026-08-02 21:00 UTC**.
- Stripe account identity/health, payments, customers, products/prices, subscriptions, invoices, refunds, disputes, events, suspicious-activity signals, and webhook health could not be refreshed because read-only Stripe access required interactive authorization.
- GitHub direct secret-scanning/code-scanning alert inventory, some security settings, and Discussions were not exposed through a usable read path. PR #31 has no submitted reviews and no inline review threads through the available connector; that is not equivalent to independent code review.
- The current `main` head is an audit-log-only commit. The connector's commit-workflow helper exposes pull-request-triggered runs and returned no runs for that exact `main` SHA, so the audit does not infer a CI regression from the absence of a returned run.
- PR #31 is too large for a complete line-by-line or dynamic review in one run. Successful exact-head CI materially improves confidence, but packaged Windows/macOS/Linux execution, native capability behavior, migrations against the live schema, end-to-end billing, browser/deployment behavior, rollback, adversarial authorization, and realistic high-volume media stress tests remain unverified.
- Gmail merged-account volume, search semantics, result limits, and unverified public support aliases constrain completeness. Relevant spam/trash coverage was searched, but the absence of a matched email is not a guarantee that no operational message exists elsewhere in the merged account.

**Remediation performed:** **None.** The only write was updating this Markdown audit record.

---

## Active findings

### VS-AUDIT-012 — Verified sessions can update any customer profile

- **Severity:** Critical
- **Source:** Supabase live RLS policies/profile schema; draft migrations `0037`–`0039`
- **Evidence summary:** The last successful live check found `profiles_verified_session_update` using only `accessrevamp_session_is_verified()` in `USING` and `WITH CHECK`, without row ownership. Draft branch migrations appeared designed to replace profile policies with owner-scoped policies and narrow ordinary profile updates, but they remain unmerged and unverified against the connected live project. No cross-account write was attempted.
- **First seen:** 2026-08-02 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Customer identity/contact/status/address/notes/marketing and Stripe-customer linkage in `profiles`
- **Recommended remediation:** Explicitly drop every broad profile policy by exact name; create owner-only policies; restrict ordinary-user column grants; reserve operational/payment fields for trusted server roles; test the complete migration chain against the actual schema with two-account negative tests.
- **Immediate owner attention:** Yes

### VS-AUDIT-001 — Verified-session RLS policies allow cross-user reads

- **Severity:** Critical
- **Source:** Supabase live policies/grants; draft migrations `0037`–`0039`
- **Evidence summary:** Nine permissive authenticated-role `SELECT` policies on customer/project/order/entitlement/delivery/design/workflow/update/refund tables accepted only verified-session state and did not require ownership. Draft migration `0039` appeared designed to replace these reads with owner-scoped policies, but it remains unmerged and was not applied or tested against the live project.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Authorization boundary for profiles, projects, orders, entitlements, deliveries, design/workflow data, updates, and refund requests
- **Recommended remediation:** Explicitly remove all session-only policies; require direct ownership or tightly scoped staff roles; validate every policy referencing `accessrevamp_session_is_verified()`; run two-account negative tests and policy inventory checks after deployment.
- **Immediate owner attention:** Yes

### VS-AUDIT-018 — Primary in-app updater endpoint is stale and invalid

- **Severity:** High
- **Source:** `app/src-tauri/tauri.conf.json`, `releases/channel.json`, release workflow, updater initialization, and Tauri updater behavior
- **Evidence summary:** On `main`, the first updater endpoint serves version `0.1.48`, only a Windows x64 entry, and no artifact signature field, while the application is configured as `1.5.0`. A successful response containing an invalid manifest is likely to stop the check before a valid fallback. Draft branch changes previously appeared to address this, but no packaged-client validation was performed and no fix is shipped.
- **First seen:** 2026-08-05 13:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC
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
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; draft remediation present, unmerged and live state unverified
- **Affected component:** Refund-request integrity
- **Recommended remediation:** Remove every broad insert policy; require `user_id = auth.uid()` and an ownership-checked eligible order in RLS and server-side validation; test forged-owner/order cases.
- **Immediate owner attention:** Yes

### VS-AUDIT-003 — Connected Supabase project does not clearly appear to be the VibeSpace backend

- **Severity:** High
- **Source:** Supabase schema, logs, deployed Edge Functions, and project naming observed during the last successful live check
- **Evidence summary:** The connected project was dominated by AccessRevamp-oriented tables/activity, and the only visible deployed Edge Function was `accessrevamp-runtime-health`; no clearly VibeSpace-specific production backend was visible.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; authoritative environment confirmation required
- **Affected component:** Audit coverage, deployment assurance, and environment isolation
- **Recommended remediation:** Confirm and document the authoritative VibeSpace project reference. If co-tenancy is intentional, document and harden isolation boundaries and audit the actual deployed VibeSpace schema/functions.
- **Immediate owner attention:** Yes

### VS-AUDIT-004 — Stripe account/catalog mismatch and webhook-state uncertainty

- **Severity:** High
- **Source:** Stripe live reads, Supabase payment/catalog/runtime records, and Gmail Stripe account notifications
- **Evidence summary:** At the last successful live check, the specified Stripe account contained no checked payments, sessions, charges, catalog, subscriptions, invoices, refunds, disputes, or webhook endpoints, while Supabase recorded six catalog rows, checkout enabled, four order drafts, zero processed Stripe events, and an open webhook-failure incident. Gmail later referenced a different Stripe account, confirming multiple accounts exist but not which one VibeSpace uses. A new generic Stripe setup-guide email this run did not identify an account and does not establish a transactional problem.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; Stripe/Supabase live refresh blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; Stripe and Supabase live state could not be refreshed
- **Affected component:** Checkout, payment fulfillment, webhook processing, and environment configuration
- **Recommended remediation:** Inventory accounts; identify the authoritative account from deployed configuration without exposing secrets; reconcile prices/catalog; verify webhook endpoint/signing secret; complete a safe test-mode end-to-end purchase and fulfillment test.
- **Immediate owner attention:** Yes

### VS-AUDIT-005 — GitHub push protection was bypassed for a Stripe-key pattern

- **Severity:** High
- **Source:** GitHub secret-scanning notification, repository history context, and current connector security-alert limitations
- **Evidence summary:** GitHub previously reported a push-protection bypass for a Stripe API-key pattern in a public test file. Direct secret-scanning alert inventory is restricted by the current connector. PR #31 prose claims a clean Gitleaks history scan, but that self-reported PR text is not independent evidence that the historical value was synthetic, removed from all history/forks, or revoked.
- **First seen:** 2026-08-01 20:01 UTC
- **Last seen:** 2026-08-08 05:05 UTC (unresolved historical event; current direct alert state unavailable)
- **Status:** Open pending direct alert validation and revocation decision
- **Affected component:** Public repository history and credential hygiene
- **Recommended remediation:** Review the alert directly; prove the value synthetic or rotate/revoke it; replace key-shaped fixtures; inspect history and forks/caches; close the alert only with documented evidence.
- **Immediate owner attention:** Yes

### VS-AUDIT-013 — Draft PR #31 remains unsafe to merge or deploy

- **Severity:** High
- **Source:** GitHub PR metadata, direct branch comparison, exact-head workflow/job reads, review state, changed-file inventory, and selected code review
- **Evidence summary:** PR #31 is an open draft at `862fe0f65b1d8ebb8a0bcc70b85e8c518c9728dc`. GitHub reports 1,350 changed files, 148,297 additions, and 8,180 deletions; direct comparison reports 136 commits ahead and five behind `main`. Exact-head CI run `31240439154` passes dependency installation, TypeScript, Vite build, Vitest, release-manifest validation, and Rust `cargo check`; AI-boundary run `31240439158` passes. The six commits added since the previous audited head are concentrated mainly in renderer/chat/media/agent/UI and Ollama multimodal functionality, including a newly identified aggregate-media memory-risk finding tracked separately as VS-AUDIT-023. The full branch still spans authentication, billing, Stripe/Supabase functions and migrations, Tauri/native capabilities, browser/terminal automation, AI/model/training, voice/phone, MCP/plugin handling, news ingestion, and extensive UI/media. There is still no packaged desktop, native Windows, live migration, end-to-end billing, deployment, adversarial-authorization, rollback, or complete independent subsystem review evidence.
- **First seen:** 2026-08-02 19:17 UTC
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open; unmerged draft; exact-head Actions are green, but runtime/live-environment validation gaps remain
- **Affected component:** Merge/release readiness and application/runtime/security/billing integrity
- **Recommended remediation:** Freeze scope; synchronize with `main`; split or review by subsystem; require independent security/billing/native reviews; run migrations against a production-like schema; execute two-account authorization tests, Stripe test-mode flows, packaged Windows/macOS/Linux tests, browser/deployment tests, rollback tests, realistic media-memory stress tests, and final gates on one immutable SHA.
- **Immediate owner attention:** Yes; do not merge or deploy until the remaining validation gaps are closed

### VS-AUDIT-017 — Google Workspace subscription for merged support domain is suspended

- **Severity:** Medium
- **Source:** Gmail Google Payments/Workspace billing notification
- **Evidence summary:** A Google notice states that the Google Workspace Business Starter subscription associated with the merged AccessRevamp-oriented support domain has been suspended because billing setup was not completed. This supersedes the earlier notice that a paid subscription would begin September 1. The notice states that access may already be lost and warns of cancellation/data loss if billing is not restored within the stated grace period. No evidence established that VibeSpace currently depends on this Workspace tenant.
- **First seen:** 2026-08-04 20:47 UTC
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
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open; hosted applicability unverified
- **Affected component:** Supabase Auth password policy and account-change protection
- **Recommended remediation:** Adopt a stronger passphrase-aligned minimum, enable recent reauthentication for password changes, configure leaked-password protection, deploy through controlled configuration, and verify hosted settings and reset/change flows.
- **Immediate owner attention:** No, but address before broader release

### VS-AUDIT-007 — VibeSpace support routing and triage cannot be reliably verified

- **Severity:** Medium
- **Source:** Gmail label metadata and targeted inbox/spam/trash searches
- **Evidence summary:** Targeted and interval-wide searches found no clear new VibeSpace operational request. Gmail currently reports INBOX 1,985 total / 1,419 unread, SPAM 127 / 78 unread, and TRASH 260 / 219 unread. Prior evidence confirms that at least one VibeSpace-domain destination reaches the merged inbox, but exact public support aliases, routing rules, queue ownership, response state, and SLA tracking remain unverified.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open; one domain-address routing path is evidenced, end-to-end support triage remains unverified
- **Affected component:** Customer-support operations
- **Recommended remediation:** Confirm the actual public support address with a controlled external delivery test and route it to a dedicated VibeSpace queue with ownership, response state, and SLA tracking.
- **Immediate owner attention:** No, unless customers are already directed to unverified aliases

### VS-AUDIT-008 — Supabase leaked-password protection is disabled

- **Severity:** Medium
- **Source:** Supabase Security Advisor
- **Evidence summary:** The last successful live Security Advisor check reported `auth_leaked_password_protection` disabled. Live advisor state could not be refreshed in this run.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Password authentication
- **Recommended remediation:** Enable leaked-password protection, strengthen password policy, and verify reset/change reauthentication behavior.
- **Immediate owner attention:** No, but address before broader launch

### VS-AUDIT-009 — Desktop WebView and native-command authority remain broad

- **Severity:** Medium
- **Source:** Tauri configuration/capabilities, custom commands, application windows, and selected PR #31 native/browser changes
- **Evidence summary:** The application exposes broad local asset roots, multiple external WebView/native HTTP origins, process/updater permissions, multiple windows, and custom local file commands. Current Tauri configuration was re-read this run. An exploit path from arbitrary remote preview content to privileged IPC was not demonstrated. PR #31 expands native/browser capability code, increasing review requirements.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open; hardening review
- **Affected component:** Tauri asset protocol, native HTTP/process/updater permissions, local IPC, file access, and CSP/window isolation
- **Recommended remediation:** Use explicit command allowlists and per-window capabilities; separate privileged/unprivileged windows; require validated project roots; narrow roots/origins/plugin permissions; add negative IPC and capability tests.
- **Immediate owner attention:** No immediate exploit was established; harden before broad distribution

### VS-AUDIT-011 — Email addresses are embedded in API URLs and retained in logs

- **Severity:** Medium
- **Source:** Supabase API logs
- **Evidence summary:** Suppression-list requests placed batches of email addresses in URL query parameters, causing API logs to retain them. The traffic appeared AccessRevamp-related rather than clearly VibeSpace-related. Live logs could not be refreshed this run.
- **First seen:** 2026-08-02 05:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; not revalidated
- **Affected component:** Privacy, logging, suppression-list processing, and observability access
- **Recommended remediation:** Move address data to a bounded server-side body/RPC flow or keyed hashes; minimize retention; restrict log access; review historical retention/deletion controls.
- **Immediate owner attention:** No immediate external disclosure was demonstrated

### VS-AUDIT-022 — Dependabot vulnerability alerts are disabled

- **Severity:** Medium
- **Source:** GitHub Dependabot alerts API, `.github` configuration on `main`, and default CI workflow
- **Evidence summary:** GitHub's Dependabot-alert endpoint previously explicitly returned that Dependabot alerts are disabled for this repository. In the current run, `.github/dependabot.yml` still returns not found on `main`, and the default CI workflow still installs dependencies and runs typecheck/build/tests/release-manifest/Rust checks without `npm audit` or an equivalent dependency-vulnerability gate. This establishes a dependency-monitoring gap, not the presence of a vulnerable or exploitable dependency.
- **First seen:** 2026-08-07 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open
- **Affected component:** Dependency vulnerability monitoring and release assurance
- **Recommended remediation:** Enable Dependabot alerts and, if appropriate, security updates; add a reviewed Dependabot configuration; use reproducible lockfile-based CI and a dependency audit/review gate with a documented process for exceptions and false positives.
- **Immediate owner attention:** No immediate vulnerability was established; address before the next release or large merge

### VS-AUDIT-023 — Composer media attachments have no aggregate byte budget

- **Severity:** Medium
- **Source:** PR #31 exact head `862fe0f65b1d8ebb8a0bcc70b85e8c518c9728dc`; `app/src/features/chat/imageAttachments.ts`, `Composer.tsx`, and `videoAttachments.ts`
- **Evidence summary:** The composer permits up to 24 media items on one draft, allows repeated drops and duplicate items, and enforces a 40 MiB per-video limit but no aggregate media-byte limit. Eight videos may be accepted per individual drop, so repeated drops can retain 24 × 40 MiB = 960 MiB of raw video data. Each browser video is converted to a data URL/base64 payload; on send, video payloads are decoded again into a binary string, `Uint8Array`, and `File` before frame extraction. Base64 expansion means the retained encoded payload alone can reach roughly 1.28 GiB before JS/runtime/video-decoder overhead. No remote trigger or exploit path was established; this is a user-driven local memory/reliability risk on an unmerged draft.
- **First seen:** 2026-08-08 05:05 UTC
- **Last seen:** 2026-08-08 05:05 UTC
- **Status:** Open on draft PR #31; not shipped on `main`
- **Affected component:** Chat composer drag/drop/paste media, renderer memory, video preview, and model-send preprocessing
- **Recommended remediation:** Add an aggregate byte budget across the entire draft and enforce it before reading files; lower the global video count; prefer Blob/object URLs or bounded native/temp-file references over retaining full base64 in React state; sample/stream videos without recreating whole-file copies where possible; add stress/regression tests for repeated near-limit drops and send-time memory behavior.
- **Immediate owner attention:** No immediate production impact demonstrated because the code is unmerged; block merge/release until bounded and stress-tested

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
- **Evidence summary:** The last successful advisor check reported unused and duplicate-index signals. The database was young and some tables had little traffic, so the signal alone did not justify index deletion. Live advisor state could not be refreshed this run.
- **First seen:** 2026-08-01 21:00 UTC
- **Last seen:** 2026-08-08 05:05 UTC (status carried forward; live revalidation blocked)
- **Last successfully validated:** 2026-08-02 21:00 UTC
- **Status:** Open; observe, not revalidated
- **Affected component:** PostgreSQL maintenance and write overhead
- **Recommended remediation:** Observe representative query statistics and remove/consolidate an index only after proving it redundant and not required by constraints or expected queries.
- **Immediate owner attention:** No

---

## Resolved findings

### VS-AUDIT-021 — Default-branch frontend CI failed Vitest and skipped release-manifest validation

- **Severity:** Medium
- **Source:** GitHub Actions run `31104440221` and current successful `main` runs including `31181878422`
- **Evidence summary:** A prior audit-log-only `main` commit failed at Vitest and skipped release-manifest validation, while typecheck/build and Rust checks passed. Current pre-audit `main` head `69918a22d834408d618834bbdbab27e0463be906` then had a successful CI run: dependency install, typecheck, Vite build, Vitest (28 files / 111 tests), release-manifest validation, and Rust `cargo check` all passed. The immediately preceding audit-log-only head also passed CI.
- **First seen:** 2026-08-07 05:06 UTC
- **Last seen:** 2026-08-07 13:04 UTC as open
- **Resolved:** 2026-08-07 21:00 UTC
- **Status:** Resolved; latest directly verified default-branch gate is green
- **Affected component:** Default-branch frontend CI, automated test assurance, and release-manifest gate
- **Recommended remediation:** Keep Vitest and release-manifest validation required for merge/release decisions; investigate if the historical failure recurs rather than assuming flakiness.
- **Immediate owner attention:** No after current successful reruns

### VS-AUDIT-019 — Exact-head CI reported critical/high dependency advisories

- **Severity:** Medium
- **Source:** Historical PR #31 CI dependency output and subsequent successful dependency review/audit
- **Evidence summary:** A prior PR #31 run reported critical/high dependency advisories without package/advisory detail. A later exact-head run completed dependency review and `npm audit` successfully before lint, TypeScript, build, Vitest, and release-manifest validation passed.
- **First seen:** 2026-08-05 21:02 UTC
- **Last seen:** 2026-08-05 21:02 UTC as open
- **Resolved:** 2026-08-06 05:10 UTC
- **Status:** Resolved for that branch-head signal
- **Affected component:** PR #31 dependency assurance
- **Recommended remediation:** Continue dependency monitoring on every immutable release candidate; note that VS-AUDIT-022 separately tracks repository-wide Dependabot monitoring being disabled.
- **Immediate owner attention:** No after resolution

### VS-AUDIT-006 — `main` was failing CI

- **Severity:** High
- **Source:** GitHub Actions release/CI history
- **Evidence summary:** `main` previously failed CI. PR #30 was subsequently merged and the v1.5.0 release run completed successfully across Windows x64, Linux x64, macOS x64, and macOS arm64, including updater-signature verification and a four-platform publication gate.
- **First seen:** 2026-07-31 22:47 UTC
- **Last seen:** 2026-08-01 21:00 UTC as open
- **Resolved:** 2026-08-02 05:00 UTC
- **Status:** Resolved
- **Affected component:** Default-branch/release CI
- **Recommended remediation:** Continue immutable-SHA multi-platform release gating and keep updater validation aligned with the actual first configured manifest.
- **Immediate owner attention:** No after resolution

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
| 2026-08-07 05:06 | VS-AUDIT-021 opened after a `main` CI run failed at Vitest and skipped release-manifest validation; Rust passed and the commit changed only the audit log, so no application regression was claimed. PR #31 was observed at an earlier head with no exact-head workflows returned in that run. VS-AUDIT-017 reopened after Google reported the merged AccessRevamp-oriented Workspace subscription suspended for incomplete billing setup; VibeSpace dependency remains unconfirmed. Supabase required interactive authentication. |
| 2026-08-07 13:04 | No new findings or resolutions. PR #31 current head was re-established as `bff28481e0dca86ed408a2147b0e000b635f4251`; fresh exact-head reads corrected the prior no-CI observation and showed successful CI and AI-boundary workflows. High release-readiness risk remained because packaged native/live migration/billing/authorization/deployment/rollback validation was missing. The stale updater and weak repo auth defaults were revalidated unchanged. Gmail targeted inbox/spam/trash searches found no new actionable VibeSpace signal. Supabase and Stripe read-only refreshes were blocked by interactive authentication. |
| 2026-08-07 21:00 | VS-AUDIT-022 opened because GitHub explicitly reports Dependabot vulnerability alerts disabled; `.github/dependabot.yml` is absent and default CI lacks a dependency-vulnerability audit gate. VS-AUDIT-021 resolved after current `main` CI run `31181878422` passed typecheck, build, 28 Vitest files / 111 tests, release-manifest validation, and Rust `cargo check`; the immediately preceding `main` run also passed. PR #31 remains unchanged at its exact head with green Actions and is now 130 ahead/four behind `main` due audit-log-only main commits. The stale updater manifest and weak Supabase auth defaults were revalidated. Gmail showed no new actionable VibeSpace incident; one VibeSpace-domain routed message narrowed support-routing uncertainty. Supabase and Stripe live refreshes remained blocked by interactive authorization. |
| 2026-08-08 05:05 | VS-AUDIT-023 opened for PR #31's missing aggregate media-byte budget: repeated allowed drops can retain up to 960 MiB of raw video content and roughly 1.28 GiB of base64 payload before extra decoding/video-processing copies. PR #31 advanced six commits to `862fe0f65b1d8ebb8a0bcc70b85e8c518c9728dc`, 1,350 files / 148,297 additions / 8,180 deletions, 136 ahead/five behind `main`; exact-head CI and AI-boundary workflows are successful. The stale updater, weak repo auth defaults, and dependency-monitoring gap were revalidated. Gmail found no new actionable VibeSpace incident. Supabase and Stripe live refreshes remained blocked by interactive authorization. |

Every run was read-only except for maintaining this file. No application, repository, database, Supabase, Stripe, or Gmail remediation has been performed by the audit automation.