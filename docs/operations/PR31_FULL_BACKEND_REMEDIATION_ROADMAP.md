# PR31 Full Backend Remediation Roadmap

## Release policy

Current verdict: **NO-GO**. This roadmap authorizes no hosted change. Every implementation requires a new exact file claim, separate reviewed commit, focused regression evidence, and explicit authorization before any deployment, database migration, billing mutation, credential rotation, object write, or release action.

The release candidate must be one immutable commit. All required checks, deployment manifests and native artifacts must reference that same SHA. A failed security, account-isolation, billing-correctness, signature/provenance or rollback gate stops release.

## Phase 0 — Security containment

### REM-000 — Contain the phone service

- **Priority / owner:** P0 condition / Security + Phone backend owner.
- **Dependency:** Determine, read-only, whether `phone-jarvis-cloud` is publicly reachable and holds live provider/service-role credentials.
- **Action:** Until secure acceptance passes, keep `PHONE_JARVIS_ENABLED=false`, deny public ingress or remove provider credentials. Do not rely on an unused helper.
- **Regression tests:** Unsigned/invalid/replayed provider webhooks rejected; forged/expired/cross-user WebSocket start rejected; arbitrary recipient denied; STOP/opt-out honored; cost/rate caps enforced; logs contain no phone numbers, provider IDs, tokens or message content.
- **Rollback:** Re-disable ingress and revoke the task-scoped sandbox credential if any security row fails.
- **Release gate:** Independent security review plus provider-sandbox evidence. Public reachability with current source is an unconditional stop.

### REM-001 — Freeze backend drift

- **Priority / owner:** P1 / Release owner + Supabase owner.
- **Dependency:** None.
- **Action:** Freeze hosted schema/function changes; inventory every deployed migration/function digest and its owning repository; name the authoritative VibeSpace candidate.
- **Regression tests:** Drift detector comparing repository manifest, live metadata and checksums.
- **Rollback:** Documentation-only until authority is reconciled.
- **Release gate:** No unknown migration family or unowned deployment remains.

## Phase 1 — Data and deployment provenance

### REM-100 — Rehearse complete Supabase migration and function rollout

- **Priority / owner:** P1 / Supabase owner + Database reviewer.
- **Dependencies:** REM-001; disposable Supabase project or local Docker stack.
- **Action:** Replay from empty and from a production-shaped sanitized backup; reconcile numbered/timestamped migrations; deploy all intended functions with explicit JWT settings; produce rollback and restore steps.
- **Regression tests:** Empty replay, upgrade replay, checksum repeatability, function inventory/digest equality, endpoint smoke tests, restore rehearsal.
- **Rollback:** Restore disposable snapshot; production rollback plan must be approved before rollout.
- **Release gate:** Zero expected endpoint 404s and no unmanaged object.

### REM-101 — Prove two-account RLS and harden definer functions

- **Priority / owner:** P1 / Database security owner.
- **Dependencies:** REM-100.
- **Action:** Apply the reviewed `set_phone_pin` invoker hardening, inspect every definer routine and execute grant, and test all user/billing/sync/contact/call/wallpaper/admin/entitlement objects with two synthetic accounts.
- **Regression tests:** Self access succeeds; anonymous and cross-account read/write/RPC/storage access fail; service-role paths require explicit server context; admin claims cannot be client-forged.
- **Rollback:** Revert only the reviewed migration in disposable infrastructure; for hosted rollout use a forward-fix migration.
- **Release gate:** Complete isolation matrix PASS with advisor re-scan.

### REM-102 — Resolve `AccessRevamp` ownership and isolation

- **Priority / owner:** P2 / Data governance owner + both product owners.
- **Dependencies:** REM-001.
- **Action:** Locate its authoritative migration source, document Auth/data/backup/retention ownership, then formally approve co-tenancy or migrate to a separate project.
- **Regression tests:** Migration checksum inventory, RLS isolation, backup/restore and deletion/retention tests.
- **Rollback:** Retain source project read-only until exported data and restore checks match.
- **Release gate:** Signed ownership and incident-response contract.

### REM-103 — Auth and database advisor remediation

- **Priority / owner:** P2 / Identity + Database owners.
- **Dependencies:** Disposable account-flow environment.
- **Action:** Enable leaked-password protection, choose a stronger password policy, add the verified FK index, and rewrite the RLS auth expression without per-row reevaluation.
- **Regression tests:** Signup/login/reset/recovery, compromised-password denial, query plans and representative synthetic-volume latency.
- **Rollback:** Revert policy/index through reviewed forward migration; disable the password feature only if account recovery is blocked.
- **Release gate:** Security advisor clear and no material latency regression.

## Phase 2 — Phone, SMS and remote messaging

### REM-200 — Enforce callback and stream authentication

- **Priority / owner:** P1 / Phone backend owner + Security reviewer.
- **Dependencies:** REM-000.
- **Action:** Mount kill-switch middleware; validate the provider signature over the canonical public URL/body; issue single-use, expiring server-side media-session tokens bound to user/call/destination; reject client identity fields as authority.
- **Regression tests:** Signed fixtures, wrong host/proxy URL, replay, expired token, cross-user stream, duplicate callback, disconnect/reconnect and provider timeout.
- **Rollback:** Feature flag off and ingress deny.
- **Release gate:** All negative rows PASS before any public sandbox route.

### REM-201 — Abuse prevention, privacy and recovery

- **Priority / owner:** P1 / Phone product + Trust/Safety + Privacy.
- **Dependencies:** REM-200 and deployed messaging schema.
- **Action:** Add recipient verification/approval, opt-out, per-user/recipient/IP rate and spend caps, idempotent jobs, durable state transitions, reconciliation, redacted structured audit logs, retention and export/delete behavior.
- **Regression tests:** Arbitrary recipient, prompt injection, STOP, duplicate delivery, partial provider failure, budget exhaustion, account switch, deletion/export and recovery.
- **Rollback:** Stop queue consumption, disable provider actions, retain reconciliation-safe records.
- **Release gate:** No duplicate billable action and no cross-conversation leakage.

## Phase 3 — Billing correctness

### REM-300 — Establish authoritative Stripe catalog and plan mapping

- **Priority / owner:** P1 / Billing owner.
- **Dependencies:** VibeSpace sandbox authority sign-off.
- **Action:** Assign stable lookup keys/metadata, canonical price-to-plan mapping and customer-account binding. Remove unavailable discount claims or provision reviewed sandbox coupons.
- **Regression tests:** Wrong price, stale price, forged metadata, cross-customer portal/checkout, family/telemetry eligibility, duplicate events.
- **Rollback:** Disable affected checkout path; do not delete historical prices.
- **Release gate:** One documented source of entitlement truth.

### REM-301 — Complete tax, portal, refund and event lifecycle

- **Priority / owner:** P1 / Billing + Finance/Tax owners.
- **Dependencies:** REM-300.
- **Action:** Complete Stripe Tax business settings and product tax codes, choose tax behavior, configure portal, implement refund/chargeback/credit reversal and reconciliation, and define grace/cancellation rules.
- **Regression tests:** Sandbox checkout with tax, portal isolation, upgrade/downgrade, cancellation, failed payment, refund, dispute, duplicate and out-of-order events.
- **Rollback:** Disable checkout/portal and reconcile from Stripe event history.
- **Release gate:** Finance sign-off and zero unresolved synthetic ledger differences.

### REM-302 — Align SDK, endpoint and deployed webhook versions

- **Priority / owner:** P2 / Billing platform owner.
- **Dependencies:** REM-300/301.
- **Action:** Upgrade through a parallel sandbox webhook endpoint, pin event fixtures and deploy source digest, then retire the old endpoint only after replay/reconciliation.
- **Regression tests:** Old/new payload contract suite, thin/snapshot event handling, signature verification and event-order replay.
- **Rollback:** Route sandbox events back to the prior endpoint; preserve event history.
- **Release gate:** Dual-run equivalence and deployed digest proof.

## Phase 4 — Cloudflare identity, storage and isolation

### REM-400 — Resolve account mismatch and least privilege

- **Priority / owner:** P1 / Cloudflare account owner + Security.
- **Dependencies:** Authoritative account decision.
- **Action:** Replace broad operator OAuth with separate read-only audit, CI-deploy and break-glass tokens; assert configured account ID before every deployment; document MCP ownership.
- **Regression tests:** Wrong-account deployment fails before upload; read token cannot write; CI token cannot administer unrelated products; revocation rehearsal.
- **Rollback:** Revoke new scoped token and restore no-write state, not the old broad token.
- **Release gate:** MCP version/binding/secret-name evidence accessible with least privilege.

### REM-401 — Add explicit Worker environments and provenance

- **Priority / owner:** P2 / Worker owners.
- **Dependencies:** REM-400.
- **Action:** Define local/staging/production environments, account/resource bindings, migration ownership, version annotations and observability/SLO policy.
- **Regression tests:** Per-environment dry-run, local D1/R2/DO tests, binding mismatch, scheduled job idempotency and rollback version activation.
- **Rollback:** Activate prior Worker version; never mutate shared storage during rollback tests.
- **Release gate:** Source commit and deployed version/bindings match.

### REM-402 — Separate public and entitled media

- **Priority / owner:** P2 / Media backend + Product.
- **Dependencies:** Catalog entitlement decision.
- **Action:** Keep only intentionally public music/wallpaper previews publicly cacheable; serve paid/private assets with short-lived identity-bound signatures and private/no-store semantics.
- **Regression tests:** Anonymous preview, private object denial, expired/wrong-user signature, range requests, traversal, cache leakage, revocation and account switch.
- **Rollback:** Disable private delivery and preserve objects.
- **Release gate:** Every object class has a documented access policy and passing matrix.

## Phase 5 — Native security and feature reliability

### REM-500 — Narrow Tauri capabilities and URLs

- **Priority / owner:** P2 / Native security owner.
- **Dependencies:** Complete command/window ownership inventory.
- **Action:** Split capabilities by window label, reduce shell/process/updater grants, narrow HTTP hosts and asset paths, retain zero-IPC remote surfaces, and validate every path/URL argument server-side.
- **Regression tests:** Unauthorized window/command/host/path attempts, traversal, shell metacharacters, SSRF URLs, credential/log redaction and renderer-compromise scenarios.
- **Rollback:** Re-enable only the exact capability demonstrated necessary by a test.
- **Release gate:** Capability-negative suite and security review PASS.

### REM-501 — Official native outcome matrix

- **Priority / owner:** P1 / Desktop QA + feature owners.
- **Dependencies:** Frozen signed candidate and disposable services.
- **Action:** Exercise success, denial, timeout, retry, cancel, duplicate, partial failure, offline restart, stale state and account switch for chat, terminals, agents, skills, local models, Model Foundry, voice/dictation, Jarvis, calls/SMS, auth/billing, media, news, telemetry, pets, updater, installer, backup/restore.
- **Regression tests:** The matrix itself, recorded with timestamp, SHA, environment and sanitized evidence.
- **Rollback:** Stop test providers and revert to disposable snapshots.
- **Release gate:** All P0/P1 rows PASS; no source-only PASS.

## Phase 6 — CI, dependencies and release provenance

### REM-600 — Make backend CI hermetic

- **Priority / owner:** P1 / CI owner + backend owners.
- **Dependencies:** Stable test entrypoints.
- **Action:** Add separate jobs for phone pytest/security routes, every Worker, Deno Edge handlers, Supabase migration replay/two-account RLS, Stripe fixtures and Rust/native command contracts. Use lockfile-strict installs and prevent servers from starting at import time.
- **Regression tests:** Fresh-checkout execution; Deno suite must move from `306 passed / 9 failed` to clean; AI News gains a committed lockfile and audit.
- **Rollback:** Revert the isolated workflow job, never relax required existing checks.
- **Release gate:** Required jobs pass on the candidate SHA.

### REM-601 — Restore dependency/security enforcement

- **Priority / owner:** P1 / Repository administrator + Security.
- **Dependencies:** GitHub dependency graph availability.
- **Action:** Enable dependency graph/review, scheduled dependency audits, CodeQL coverage for relevant languages, Gitleaks and artifact SBOM/attestation.
- **Regression tests:** Intentionally vulnerable test PR is blocked; synthetic secret is detected in a disposable fixture; artifact digest matches manifest/signature/attestation.
- **Rollback:** Preserve CodeQL/Gitleaks while correcting false-positive policy.
- **Release gate:** Dependency Review operational, not merely present.

### REM-602 — Freeze and prove release artifacts

- **Priority / owner:** P1 / Release owner.
- **Dependencies:** All prior P1 gates.
- **Action:** Cut one immutable candidate, run every check against it, build/sign/package from CI, verify updater and installer rollback, and publish checksums/SBOM/attestation.
- **Regression tests:** Clean install, update, interrupted update, signature failure, rollback, backup/restore and artifact digest comparison.
- **Rollback:** Restore last signed updater manifest and installer only through the documented release process.
- **Release gate:** GO requires zero open P0/P1 findings and complete native/provenance evidence. Otherwise verdict remains NO-GO or, after explicit risk acceptance, GO WITH CONDITIONS.

## Sequencing summary

1. Contain phone exposure and freeze backend drift.
2. Establish authoritative Supabase, Stripe and Cloudflare ownership/provenance.
3. Rehearse schema/function rollout and prove two-account isolation.
4. Finish phone abuse controls and billing lifecycle correctness.
5. Narrow native authority and separate entitled media.
6. Make every backend suite hermetic and required on one frozen SHA.
7. Run signed official-native and rollback acceptance; only then reconsider the release verdict.
