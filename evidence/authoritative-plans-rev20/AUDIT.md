# Authoritative Plans Rev20 Audit

## Authority

- Source branch: `origin/UnifiedChungus`
- Source commit: `adc1ee3a5b0e056ac6f5efc258afd6df5a25b4f8`
- Verified files: `docs/SUBSCRIPTION_PLANS_REFERENCE.md`, `supabase/functions/_shared/billingCatalog.ts`, and `site/tests/access-pricing.test.mjs`
- Billing model: 30-day introductory Access trial, then $20/month Access; optional feature plans are billed separately.

## Implemented catalog

| Plan | Monthly total | Access | Feature plan | Shared credits |
| --- | ---: | ---: | ---: | ---: |
| Spark | $20 | $20 | $0 | 1,000 |
| Orbit | $30 | $20 | $10 | 5,500 |
| Nova | $70 | $20 | $50 | 27,500 |
| Singularity | $120 | $20 | $100 | 55,000 |
| Supernova | $220 | $20 | $200 | 110,000 |

Every card shows BYOK and unlimited local Kokoro. Spark and Orbit state their unavailable capability boundaries; Nova, Singularity, and Supernova state the included publishing and priority-routing capabilities. App and payment language remains truthful: app coming soon, payments opening later, no checkout.

## Verification

- Contract: `authoritative-plans-contract.test.cjs` — 13/13 passed.
- Preserved app replica contract: 9/9 passed.
- `git diff --check` — passed.
- Browser console warnings/errors — 0.
- Warm hover: verified computed cream/peach/copper gradient, copper border, warm glow, and completed edge sweep.
- Keyboard: ArrowRight moved Nova to Singularity, retained focus, updated `aria-pressed`, and refreshed the live inspector.
- Responsive matrix: 1920×1080, 1440×900, 1024×768, 900×900, 768×1024, 390×844, and 320×568.
- At every tested viewport: no document horizontal overflow; all five plan titles fit; all card footers fit; no plan card has internal horizontal overflow.
- Reduced motion: contract confirms the warm sweep is removed under `prefers-reduced-motion: reduce`.

## Visual evidence

- `desktop-1440x900.png`
- `mobile-390x844.png`
- `mobile-card-390x844.png`

