# VibeSpace app replica — REV18 verification

Artifact under test: `site/index.html`

Pre-deployment SHA-256: `A439F343B5A8CF718A2F1EC3B9D8D8647B658269B11F04E6CDD518A74A9A1DAA`

## Contract and runtime

- Red baseline: 9/9 app-replica contract assertions failed before implementation.
- Green result: 9/9 assertions pass after implementation.
- Exactly three simulated chats are present: Release check, Context route, and Terminal swarm.
- Selecting a chat starts its deterministic four-step route.
- Rapid Release → Context → Terminal switching leaves only Terminal selected; stale timers are cancelled.
- A completed route reports `step: 4`, `timerCount: 0`, `externalEffects: 0`.
- Sending a message adds the visitor message and returns a truthful `Download VibeSpace` link to `#plans`.
- The old `LiquidField` class and `#liquidCanvas` owner are absent.
- Runtime ownership remains one Three.js renderer, one animation scheduler, and one shared frame task.

## Responsive matrix

Playwright checks passed at 1920×1080, 1440×900, 1024×768, 900×900, 768×1024, 390×844, and 320×568.

- Document horizontal overflow: 0 at every viewport.
- Replica-window overflow: 0 at every viewport.
- Composer contained by the replica window: yes at every viewport.
- All three labels fit. At 420px and below, intentional Release / Context / Swarm labels replace truncation while explicit full accessible labels remain.
- Desktop panel height remains the replaced effect's 690px maximum; mobile keeps the same application composition in a stacked 690px frame.

## Interaction and accessibility

- Pointer selection, Arrow-key selection, focus transfer, live status, transcript scrolling, and composer submission passed.
- Reduced motion: message animation is `none`; the full route completes deterministically with five messages and zero remaining timers.
- axe-core 4.10.3 WCAG A/AA: 0 violations at 1440×900 and 390×844.
- Fresh browser console: 0 warnings/errors.
- Seven-message final state includes one user message, the three-step run plus evidence, and one Jarvis download response.

## Visual evidence

- `app-replica-final-1440x900.png`
- `app-replica-mobile-panel-390x844.png`
- `app-replica-narrow-final-320x568.png`

The real VibeSpace application was not opened, launched, or modified. The design was derived from existing website media and previously captured Playwright/reference imagery only.
