# Plan Usage Perks Update — Rev 21 Audit

Date: 2026-08-30
Task: `official-site-plan-usage-perks-rev21`
Agent: `codex-g56-20260830-a17`
Branch: `main` (upstream `origin/main`)
Base SHA: `cc71fc31d7427ef755adb4119074df533e292391`

## Scope

This slice updates only copy and diagnostics in the existing plan catalog UI. No style system changes, routing, checkout, billing, backend, or repository-level integrations were introduced.

- `site/index.html` (plans section and runtime plan metadata)
- `docs/AGENT_COORDINATION.md` (checkpoint entry)
- Evidence artifacts in `evidence/plan-usage-perks-rev21/`

## Data and source of truth

- Primary authority used: `UnifiedChungus` branch `docs/SUBSCRIPTION_PLANS_REFERENCE.md`
- Billing/reference commit: `adc1ee3a5b0e056ac6f5efc258afd6df5a25b4f8`
- Shared pool conversion rates:
  - 100 credits per PSTN phone minute
  - 10 credits per SMS text
- Spark remains without hosted call/SMS add-ons.
- Paid plans use the shared pool conversion with a single-service-allocated maximum:
  - Orbit: 55 call mins / 550 SMS
  - Nova: 275 call mins / 2,750 SMS
  - Singularity: 550 call mins / 5,500 SMS
  - Supernova: 1,100 call mins / 11,000 SMS
- 20 USD Access line is explicitly declared as full app access across all plans.

## Changes made

- Updated the plan access strip to state:
  - "`$20 Access includes full access to the VibeSpace app.`"
- Added a `Full access to the VibeSpace app` line to all plan cards.
- Added explicit Spark limitation:
  - "`SMS not included`"
- Replaced paid-plan hosted entitlements with explicit max equivalents:
  - "`Up to X Jarvis Call minutes`"
  - "`Up to Y SMS texts`"
  - for Orbit / Nova / Singularity / Supernova.
- Added a reader-facing note clarifying shared-pool allocation and tradeoffs:
  - mixed usage reduces each maximum.
- Updated plan inspector copy and runtime diagnostics with the same semantics.

## Verification run

- Contract test executed: `node evidence/plan-usage-perks-rev21/plan-usage-perks-contract.test.cjs`
- Result: `7/7 checks passed`
- Artifacts captured:
  - `evidence/plan-usage-perks-rev21/desktop-1440x900.png`
  - `evidence/plan-usage-perks-rev21/mobile-390x844.png`
- Current tested runtime hash:
  - `site/index.html` SHA-256: `A5AE64C14A8273B9023E40417540306B48FDA572432F44054ADD274E08B3C949`
- Revision in page diagnostics:
  - `rev21-plan-usage-perks`

## Reproducibility notes

- No style framework or UI control overhaul was performed.
- No JavaScript API, Stripe/Supabase/Stripe integrations, or checkout flows were added.
- Public release posture remains unchanged: app and payments are still preview/coming soon with no checkout action.
- Changes are additive text/metadata only, on top of the existing cinematic baseline.
