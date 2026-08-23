# PR31 Full Backend and Feature Audit

## Executive verdict

**Release verdict: NO-GO.** This is a read-only audit snapshot, not a certification or a remediation change. The connected production-facing systems were inspected passively; active verification was limited to disposable local infrastructure. No hosted database, Cloudflare object, deployment, GitHub state, Stripe object, billing setting, credential, or production configuration was changed.

The immediate release blockers are:

1. The live Supabase project is materially behind the current source tree: key access, Jarvis messaging, Model Foundry, telemetry, usage-reservation, and desktop-presence migrations/functions are absent, while the database also contains an untracked `AccessRevamp` product family.
2. The FastAPI phone service source exposes provider callback and WebSocket trust boundaries without applying its available signature-validation, kill-switch, session-authentication, and log-redaction controls. This is a confirmed source failure and becomes a P0 containment event if that service is publicly reachable with live provider/service-role credentials.
3. Stripe is a VibeSpace-labeled sandbox, but tax setup is pending, no billing portal configuration exists, discount objects expected by source are absent, refund settlement is not implemented, and the deployed webhook code is older than local source.
4. Cloudflare account identity is split: the authenticated account can expose the news/music/wallpaper resources, while the MCP configuration targets a different inaccessible account. The active OAuth token is broader than required.
5. Remote PR checks apply to PR head `0ed01de9dc64561d27689b0649ecc808e7e1fe74`, not the current local integration snapshot. Dependency Review fails because dependency graph support is unavailable, and root CI omits phone, Worker, Edge Function, migration/RLS, and native acceptance suites.

## Scope, snapshots, and safety

| Item | Recorded value |
| --- | --- |
| Audit ID | `PR31-FULL-BACKEND-AND-FEATURE-AUDIT` |
| Agent | `VS-CODEX-FULL-BACKEND-AUDIT-20260823` |
| Worktree | `C:\Users\viper\VibeSpace-UnifiedChungus-Final` |
| Branch | `integration/UnifiedChungus-final` |
| Audit base | `91e23e8fcec4a1e5bca0fd985624920288430165` |
| Latest observed shared HEAD while reporting | `74cd301e6dde9c76e0d53360922e6fe7663ef1bd` |
| Upstream | `origin/UnifiedChungus` (315 commits behind the observed local branch) |
| GitHub PR 31 head/base | `0ed01de9dc64561d27689b0649ecc808e7e1fe74` / `b8d2a04c930bd984cae3d8f00942581b9e0b9aeb` |
| Hosted-service mode | Passive/read-only |
| Active-test mode | Disposable local state and mocks only |

Evidence is sanitized: no secrets, tokens, customer records, phone numbers, emails, raw provider errors, or private message content are included. A `PASS` means executable evidence existed for the stated boundary; it does not imply end-to-end production certification. Source-only judgments are `PARTIAL`, `FAIL`, or `BLOCKED`.

## Architecture and trust-boundary inventory

| Boundary | Authority and data | Audit result |
| --- | --- | --- |
| React renderer → Tauri | A large registered native-command surface controls windows, terminals/processes, filesystem-adjacent features, credentials, updates, local models, dictation, pets, and browser surfaces. Main/workbench capabilities include window/webview creation, shell open, process and updater access, broad provider HTTP, and Supabase wildcard access. | `PARTIAL`: remote browser/SiYuan zero-IPC isolation is positive; main/workbench and asset/CSP scopes remain broad. |
| Renderer persistence | UI state uses local browser storage/IndexedDB/Dexie and cloud-sync adapters. Account switching, stale-state, deletion/export, and offline-restart behavior were not executable in an official packaged app. | `BLOCKED` |
| Supabase | Authenticated clients reach RLS tables/RPCs; Edge Functions hold service-role/provider authority; Stripe and telephony webhooks cross external trust boundaries; Storage serves wallpaper objects. | `FAIL`: all public tables sampled have RLS, but deployed schema/function drift is material and no disposable full Supabase stack was available. |
| Stripe | Checkout/portal/webhook functions map customers, prices, plans, usage and entitlements. Stripe signature validation exists locally and in the sampled deployed webhook. | `PARTIAL`: sandbox identity is plausible, but tax, portal, refunds, discount dependencies, version drift, and deployed-source drift block release. |
| Cloudflare | AI News uses D1/cron; Music and Wallpaper delivery use R2; MCP uses a Durable Object relay and Supabase identity. | `PARTIAL`: local Workers pass; MCP hosted evidence is blocked by account mismatch; environments and least-privilege separation are absent. |
| Phone service | FastAPI/Twilio/LiveKit/Deepgram boundaries can originate calls, receive callbacks and accept streaming audio. | `FAIL`: callback and WebSocket authorization controls are not wired into routes. |
| GitHub/release | Workflows run app checks, CodeQL, dependency review, packaging, signing and updater-manifest checks. | `PARTIAL`: current local SHA is not covered; dependency review is non-operational; several backend suites are omitted. |

## Priority findings

Each finding includes the required ID, subsystem, environment, severity, evidence, impact, reproduction, correction, verification and status.

### AUD-PHONE-001 — Provider callbacks and media WebSocket are not authenticated

- **Subsystem / environment / severity / status:** Phone service / source and deployment contract / **P1 (conditional P0 if reachable with live credentials)** / **FAIL**.
- **Evidence:** `security.py` defines Twilio signature validation, context sanitization and kill-switch middleware, but repository references show no route consumes them and `main.py` does not mount the middleware. `/twiml` and `/outbound/twiml` do not validate provider signatures. The media WebSocket accepts client-supplied `user_id`, `from_number`, and `caller_preauth` start parameters without a server-issued session binding. `/admin/metrics` is unauthenticated. Provider identifiers and phone endpoints are logged without redaction.
- **Impact:** If deployed publicly, an attacker may trigger call flows, impersonate conversation identity, consume provider spend, cross user boundaries, or expose personal identifiers in logs.
- **Reproduction:** Inspect route decorators and call sites for the three security helpers; execute the existing local pytest suite and observe that no tests exercise real callback routes or forged WebSocket start frames.
- **Recommended correction:** Keep `PHONE_JARVIS_ENABLED=false` and remove/deny public routing until signed callback verification, expiring server-issued WebSocket session tokens, caller/recipient authorization, opt-out enforcement, rate limits, idempotency, kill switch, and structured redaction are enforced before provider work.
- **Verification requirement:** Local signed/invalid/replayed webhook fixtures, cross-account WebSocket denial, recipient allowlist/approval tests, STOP/opt-out tests, rate and spend caps, sanitized logs, then a controlled provider sandbox acceptance run.

### AUD-SUPA-001 — Live schema and Edge Functions materially drift from source

- **Subsystem / environment / severity / status:** Supabase / connected hosted project / **P1** / **FAIL**.
- **Evidence:** Local source contains 50 migrations and 27 deployable Edge Function directories; the connected project has 19 deployed functions. Missing deployed functions include `access-lease`, access checkout/portal, `github-context`, `jarvis-proxy`, `telemetry-consent`, `telnyx-call-webhook`, and `third-party-call`. Live metadata lacks current source tables for access leases, desktop presence, Model Foundry, Jarvis contacts/jobs/approvals/events, remote messaging, telemetry consent, usage reservations and promo reservations. Nine of the latest 100 sampled API log rows were `404` calls to `publish_desktop_presence`.
- **Impact:** UI and source can claim features that cannot execute against the connected backend; authorization fixes present in source are not active; rollback provenance is unclear.
- **Reproduction:** Compare local migration/function manifests to connected migration, schema and function metadata; sample sanitized API logs.
- **Recommended correction:** Freeze hosted changes, create a reviewed deployment manifest keyed by source commit and migration checksums, rehearse the complete migration/function rollout on a disposable branch/project, and require drift detection before release.
- **Verification requirement:** Clean migration replay, two-account RLS suite, function inventory equality, deployed-source digest equality, rollback/restore rehearsal, and zero expected-endpoint 404s.

### AUD-SUPA-002 — `set_phone_pin` remains an authenticated SECURITY DEFINER RPC

- **Subsystem / environment / severity / status:** Supabase database / connected hosted project / **P2** / **PARTIAL**.
- **Evidence:** The live function is `SECURITY DEFINER`, owned by `postgres`, executable by `authenticated`, and uses a safe `pg_catalog, public` search path. It checks `auth.uid() = p_user_id`, validates PIN form and hashes with PBKDF2. Local migration `0038_backend_advisor_hardening.sql` expects invoker security but is undeployed.
- **Impact:** No cross-account escalation was proven, but unnecessary definer authority expands blast radius and demonstrates deployment drift.
- **Reproduction:** Read live routine definition/ACL and compare with migration 0038 and its test.
- **Recommended correction:** Deploy the reviewed invoker-security hardening through the migration rehearsal, retain explicit ownership checks, and narrow execute grants.
- **Verification requirement:** Two synthetic accounts; self-update succeeds, cross-account and anonymous calls fail, and the routine reports invoker security.

### AUD-SUPA-003 — Auth and database advisors remain unresolved

- **Subsystem / environment / severity / status:** Supabase Auth/Postgres / connected hosted project / **P2** / **FAIL**.
- **Evidence:** Leaked-password protection is disabled. One foreign key lacks a covering index, and one RLS policy re-evaluates authentication state per row. The local password minimum is six characters. Unused-index notices were observed but are not treated as deletion instructions.
- **Impact:** Weaker account protection and avoidable database/RLS cost under load.
- **Reproduction:** Read connected security/performance advisors and local auth configuration.
- **Recommended correction:** Enable leaked-password protection after an account-flow rehearsal; raise password policy deliberately; add the proven FK index; rewrite the RLS expression using a stable init-plan-friendly auth lookup.
- **Verification requirement:** Auth regression tests, advisor re-scan, query plans on representative synthetic volume, and rollback thresholds.

### AUD-SUPA-004 — `AccessRevamp` shares the VibeSpace database without source provenance

- **Subsystem / environment / severity / status:** Supabase data governance / connected hosted project / **P2** / **PARTIAL**.
- **Evidence:** The live project contains 13 `ar_*` tables and a separate migration family not present in this repository. All sampled tables have RLS; client-readable policies are owner-scoped and server-only tables deny direct access. No cross-account exploit was proven.
- **Impact:** Shared Auth/database failure domains, unclear ownership/retention, and non-reproducible migrations make incident response and restoration unsafe.
- **Reproduction:** Compare live migrations and table prefixes with repository history.
- **Recommended correction:** Establish an authoritative owner and migration repository, document data/identity boundaries, or isolate the product into a separate project after tested export/import and rollback planning.
- **Verification requirement:** Ownership sign-off, migration checksum inventory, RLS isolation tests, backup/restore rehearsal, and documented retention/deletion contracts.

### AUD-STRIPE-001 — Billing configuration is not release-ready

- **Subsystem / environment / severity / status:** Stripe / connected sandbox / **P1** / **FAIL**.
- **Evidence:** The connected sandbox is VibeSpace-labeled and has five active monthly licensed prices. Tax setup is `pending`, product tax codes are absent, Apex tax behavior is unspecified, and checkout source does not enable automatic tax. No customer portal configuration exists. Coupon objects expected by family/telemetry plan source are absent. Refund/`charge.refunded` settlement was not found. The hosted webhook uses a newer endpoint API version than the old SDK-pinned local API version, while the deployed webhook body is materially older than current source.
- **Impact:** Incorrect tax, broken portal/discount flows, stale entitlements after refunds or event-order changes, and non-reproducible event payload behavior.
- **Reproduction:** Read sandbox catalog, endpoint, tax, portal and coupon metadata; compare to local checkout/webhook source and SDK/API pins.
- **Recommended correction:** Complete sandbox tax and portal configuration, define authoritative price/plan mappings and lookup keys, implement refund/credit reversal and reconciliation, remove unavailable coupon claims or provision reviewed sandbox objects, then upgrade API versions through a parallel endpoint.
- **Verification requirement:** Synthetic sandbox checkout/subscription/upgrade/cancel/refund/duplicate/out-of-order fixtures with customer-account isolation, tax assertions, portal isolation and reconciliation. No live-mode objects until separately approved.

### AUD-CF-001 — Cloudflare MCP account identity does not match the authenticated account

- **Subsystem / environment / severity / status:** Cloudflare MCP / connected hosted configuration / **P1** / **BLOCKED**.
- **Evidence:** The authenticated account identifier ends in `180fb`; MCP configuration references an account ending in `d3aa`. MCP deployment and secret-name inspection return authorization failure, while other account resources are visible.
- **Impact:** MCP deployment provenance, secrets, Durable Object state and production behavior cannot be verified; operators can inspect or deploy the wrong account.
- **Reproduction:** Compare Wrangler account configuration with the authenticated account identity and attempt read-only deployment metadata inspection.
- **Recommended correction:** Identify the authoritative account, bind a read-only audit credential to it, document ownership, and fail CI/deploy when configured and authenticated account identities diverge.
- **Verification requirement:** Read-only version/binding/secret-name inventory, local-to-deployed digest comparison, and a sandbox relay isolation test.

### AUD-CF-002 — Cloudflare credential and environment separation are too broad

- **Subsystem / environment / severity / status:** Cloudflare governance / connected account and source / **P2** / **FAIL**.
- **Evidence:** The connected OAuth token exposes broad Workers, D1, R2, Pages, Queues and container write/admin permissions. Worker configurations use `workers_dev=true` and do not define explicit staging/production environments. Observability sampling varies from 5–100%.
- **Impact:** A compromised operator token has unnecessary blast radius; environment confusion can cause deployment drift and weak incident evidence.
- **Reproduction:** Read token permission names and Worker configurations; no token values were accessed.
- **Recommended correction:** Replace with separate least-privilege read, CI deploy and break-glass tokens; add explicit environments, account checks and deployment manifests.
- **Verification requirement:** Permission-negative tests, environment-specific dry runs, provenance records and revocation rehearsal.

### AUD-CF-003 — Music delivery is public and not entitlement-bound

- **Subsystem / environment / severity / status:** Cloudflare R2 music / connected source contract / **P2** / **PARTIAL**.
- **Evidence:** The Music Worker serves matching object names over unauthenticated GET/HEAD and applies long-lived public immutable caching. Local tests, typecheck and dry-run pass. No subscription or entitlement verification exists in this delivery boundary.
- **Impact:** If any music is intended to be paid/private, direct URLs bypass product entitlements and revocation. If all tracks are intentionally public, the behavior is acceptable but must be documented.
- **Reproduction:** Read route/auth/cache logic and execute local Worker tests.
- **Recommended correction:** Make the catalog classification explicit. Keep public assets in a public bucket; put entitled assets behind short-lived signed URLs or an authenticated gateway with private caching.
- **Verification requirement:** Anonymous/public and expired/wrong-user/private-object matrix plus cache-leak tests.

### AUD-TAURI-001 — Native renderer authority is broader than least privilege

- **Subsystem / environment / severity / status:** Tauri/native / local source / **P2** / **PARTIAL**.
- **Evidence:** Main/workbench capabilities allow webview/window creation, shell open, process/updater defaults, broad external HTTP and wildcard Supabase hosts. Asset protocol allows application data, Downloads and resources; CSP permits broad HTTPS media/images plus `ws:`/`wss:`. Dedicated remote-browser and SiYuan surfaces have zero-IPC isolation, which is a positive control.
- **Impact:** Renderer compromise in a privileged window has a wider native/network/file blast radius than necessary.
- **Reproduction:** Inspect capability JSON, Tauri configuration, window labels and registered command tests.
- **Recommended correction:** Split capabilities by exact window and command, narrow hosts and asset paths, remove unused shell/process grants, and add command-level path/URL validation tests.
- **Verification requirement:** Capability-negative integration tests and official packaged native QA. The currently running binary is a debug build and was not used as release proof.

### AUD-GH-001 — PR and CI evidence does not cover the release candidate

- **Subsystem / environment / severity / status:** GitHub/CI / remote and local / **P1** / **FAIL**.
- **Evidence:** PR 31 is a draft with 513 commits and 2,038 changed files. CI, AI boundary and CodeQL pass at PR head `0ed01d…`; Dependency Review fails because dependency graph support is unavailable. The shared local integration branch was observed at `74cd301…`, 315 commits ahead of its upstream. Root CI does not execute phone pytest, Worker tests, Deno Edge tests, migration/RLS behavior, or official-native acceptance. It uses `npm install`, not lockfile-strict `npm ci`.
- **Impact:** Green remote checks do not establish the safety of the actual local candidate or major backend boundaries.
- **Reproduction:** Read PR checks/workflows and compare exact SHAs and suite commands.
- **Recommended correction:** Define a frozen candidate SHA; enable dependency graph/review; add path-aware backend jobs, lockfile-strict installs, migration replay, two-account RLS, phone security tests, Worker/Edge suites and signed-artifact provenance.
- **Verification requirement:** All required checks on one immutable SHA with artifact digest/signature/attestation evidence and branch-protection enforcement.

### AUD-TEST-001 — Edge Function suite and dependency audit are not hermetic

- **Subsystem / environment / severity / status:** Test/supply chain / local / **P2** / **FAIL**.
- **Evidence:** Deno execution produced 306 passes and 9 failures. Three are stale CORS expectations (`200` expected while shared handling returns valid `204`); the rest expose mixed Vitest/Deno discovery, missing read permission and modules that start `Deno.serve` during import. AI News has no lockfile, so `npm audit` cannot run. Full-history Gitleaks found no leaks in 2,045 commits and approximately 102.79 MB scanned.
- **Impact:** Backend regressions can be masked by runner failures and non-reproducible dependency resolution.
- **Reproduction:** Run the recorded Deno command and production dependency audits in the evidence JSON.
- **Recommended correction:** Separate unit/handler/serve tests, make modules import-safe, pin the runner and dependencies, add an AI News lockfile, and enforce each suite in CI.
- **Verification requirement:** Clean hermetic reruns from a fresh checkout with no generated diff.

### AUD-QA-001 — Official native and disposable Supabase acceptance are blocked

- **Subsystem / environment / severity / status:** End-to-end QA / local / **P1** / **BLOCKED**.
- **Evidence:** Docker was unavailable and Supabase CLI was not installed, so full migration replay and two-account RLS could not run. A debug `jarvis.exe` process was present, but no approved app-only controller or packaged/release-identical build was available. Browser preview is not native proof. A serial Rust release `cargo check` completed successfully with 35 warnings, but compilation is not product acceptance.
- **Impact:** Account switching, desktop/native commands, global dictation, pet windows, terminal/process integration, updater, installer, offline restart and end-to-end billing/phone flows are not release-verified.
- **Reproduction:** Check local prerequisites and binary provenance.
- **Recommended correction:** Provision disposable Supabase/Docker and a signed candidate build tied to the frozen SHA; execute the native matrix with synthetic accounts and local services.
- **Verification requirement:** Timestamped PASS/FAIL/BLOCKED rows for every native outcome, exact build SHA and sanitized logs. No source inspection may upgrade this finding to PASS.

## Feature outcome matrix

| Feature family | Verdict | Evidence and principal gap |
| --- | --- | --- |
| AI chat, providers, model selection, approvals, tools/actions | `PARTIAL` | Source/tests exist, but current whole-app suite was inconclusive and official-native provider success/denial/timeout/cancel/account-switching were not run. |
| Browser chat, MCP, context, memory, RLM, cloud sync | `PARTIAL` | Zero-IPC browser/SiYuan boundaries are positive; MCP local tests pass, hosted MCP is account-blocked; cloud sync and stale/account-switch behavior are unverified. |
| Terminals, agents, skills, local models, Model Foundry | `BLOCKED` | Native command and persistence outcomes require packaged native QA; live Supabase lacks current Model Foundry metadata. |
| STT, TTS, Jarvis voice, global dictation | `PARTIAL` | Focused Jarvis cancellation rerun passed after a transient broad-run failure; device permission, engine/model truth, global overlay and retry behavior remain native-unverified. |
| Phone calls, SMS, remote messaging | `FAIL` | Phone trust boundaries fail source audit; current messaging/contact/job migrations/functions are absent from live Supabase. |
| Authentication and account lifecycle | `PARTIAL` | RLS coverage is broad, but leaked-password protection is disabled and two-account hosted/local execution is blocked. |
| Subscription, Access leases, checkout, portal, budgets, rewards, admin | `FAIL` | Access backend is not deployed; Stripe tax/portal/refund/discount readiness is incomplete; deployed webhook drift exists. |
| Wallpapers | `PARTIAL` | Signed private delivery design and local tests pass; bucket contents/CORS, entitlement end-to-end and native download behavior were not actively checked. |
| Music and 24/7 delivery | `PARTIAL` | Worker tests pass; delivery is public and entitlement intent is unresolved; media/editor/native persistence not accepted. |
| AI News | `PARTIAL` | 46 local tests, typecheck and disposable D1 migration replay pass; dependency lockfile and production authorization/data behavior remain gaps. |
| Telemetry, privacy, export/deletion, backup/restore | `FAIL` | Telemetry-consent backend is not deployed; phone audit is local JSONL with central upload marked future; end-to-end export/deletion/restore evidence is absent. |
| Pets/native windows | `BLOCKED` | Requires official packaged native QA; no browser/source-only PASS awarded. |
| Updater, installer, release | `PARTIAL` | Release manifest tests and signing checks exist; immutable candidate/attestation and official install/update/rollback evidence are absent. |

## Verification results

| Verification | Result |
| --- | --- |
| Supabase Node contract tests | **PASS — 18/18** |
| Phone pytest | **PASS — 24/24**, but route/security coverage gap remains |
| AI News Vitest | **PASS — 46/46** |
| AI News typecheck and disposable local D1 replay | **PASS** |
| Music Worker tests/typecheck/dry-run | **PASS — 3/3** |
| Wallpaper Worker tests/typecheck/dry-run | **PASS — 3/3** |
| MCP Worker tests/typecheck/dry-run | **PASS — 30/30** |
| Release manifest tests | **PASS — 45/45** |
| Rust release `cargo check` with one build job | **PASS — exit 0; 35 warnings** |
| Full-history Gitleaks | **PASS — no leaks reported** |
| Production npm audit: root/music/wallpaper/MCP | **PASS — 0 reported vulnerabilities** |
| AI News npm audit | **BLOCKED — no lockfile** |
| Deno Edge Function sweep | **FAIL — 306 passed, 9 failed** |
| Repository typecheck | **FAIL — four unrelated SiYuan test diagnostics at the observed shared snapshot** |
| Whole app Vitest | **INCONCLUSIVE — final runner result unavailable; no PASS claimed** |
| Official packaged native QA | **BLOCKED** |
| Disposable full Supabase/two-account RLS | **BLOCKED — prerequisites unavailable** |

## Capacity and resilience coverage

No production load test was performed. The completed Worker/phone/unit tests do not establish latency percentiles, sustained error rate, queue depth, database contention, memory limits or recovery behavior. A future isolated capacity run must define stop thresholds before execution: zero cross-account leakage, zero duplicate billable actions, bounded queue growth, error rate under the product SLO, and automatic stop on memory pressure or downstream sandbox instability.

## Evidence limitations

- The shared branch advanced while the audit ran; every remote result is tied to its explicit SHA, and local findings are tied to the observed snapshot rather than silently conflated with PR 31.
- Branch protection, hosted phone-service reachability, Cloudflare MCP deployment state, R2 object contents/CORS, official packaged-app behavior, backup restoration and production capacity were not proven.
- Live logs were sampled and sanitized, not exhaustively exported.
- Stripe remained read-only even though the VibeSpace-labeled sandbox was identified; no synthetic billing objects were needed to establish the current blockers.

## Authoritative references

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe customer portal: https://docs.stripe.com/customer-management/integrate-customer-portal
- Stripe Tax setup: https://docs.stripe.com/tax/set-up
- Stripe Tax with Checkout: https://docs.stripe.com/tax/checkout
- Stripe webhook versioning: https://docs.stripe.com/webhooks/versioning
- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Cloudflare environments: https://developers.cloudflare.com/workers/wrangler/environments/
- Cloudflare API permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Durable Objects rules: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Workers observability: https://developers.cloudflare.com/workers/observability/

The prioritized correction order, owners, tests, rollback criteria and release gates are in `PR31_FULL_BACKEND_REMEDIATION_ROADMAP.md`; sanitized structured evidence is in `PR31_FULL_BACKEND_AUDIT_EVIDENCE.json`.
