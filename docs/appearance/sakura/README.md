# Sakura production appearance documentation

Status: **production UI/effects are implemented and the bounded real-app browser matrix passes.**

This directory records the binding Sakura Dusk reference, the implemented production
appearance, and its verified and still-pending evidence. The production slice includes the
registered opt-in theme, exact-root-scoped semantic CSS, original seven-layer scene,
deterministic petals, shared primitives, shell/routes/overlays, motion fallbacks, and
account-free visual harness. Sakura remains UI/effects only: application behavior, state,
providers, backend, billing, auth, terminals, voice lifecycle, and external systems are not
changed by the appearance.

Evidence labels used throughout:

- **Authoritative** — required by the production master goal or `STYLE_SPEC.md`.
- **Observed** — directly read or visually inspected in the immutable reference package.
- **Measured** — SHA/image metadata or Task390 WCAG color math.
- **Derived** — a production recommendation consistent with authority.
- **Pending** — evidence not yet established, including native, assistive-technology, zoom, or
  quantitative performance tracing.

The shipping appearance is `Sakura` (`sakura`), Sakura Dusk only. Jarvis Core, VibeSpace,
Default, MonoChrome, and VibeSpace’s separate Origami Chat styling must remain unchanged.

## Documents

- [REFERENCE_INVENTORY.md](REFERENCE_INVENTORY.md) and
  [asset-manifest.json](asset-manifest.json): exact source provenance.
- [REFERENCE_ANALYSIS.md](REFERENCE_ANALYSIS.md), [DESIGN.md](DESIGN.md), and
  [reference-spec.json](reference-spec.json): faithful visual analysis and design intent.
- [TOKENS.md](TOKENS.md), [design-tokens.json](design-tokens.json), and
  [ACCESSIBILITY.md](ACCESSIBILITY.md): semantic and measured acceptance gates.
- [SCENIC_ARCHITECTURE.md](SCENIC_ARCHITECTURE.md),
  [component-mapping.md](component-mapping.md), and [ROUTE_MATRIX.md](ROUTE_MATRIX.md):
  implemented production seams and bounded route evidence.
- [PERFORMANCE.md](PERFORMANCE.md), [SECURITY.md](SECURITY.md),
  [VISUAL_TEST_PLAN.md](VISUAL_TEST_PLAN.md), and [REGRESSION_PLAN.md](REGRESSION_PLAN.md):
  current controls, verified browser evidence, and remaining gates.
- [REGRESSION_RESULTS.md](REGRESSION_RESULTS.md), [ROLLBACK.md](ROLLBACK.md), and
  [FINAL_HANDOFF.md](FINAL_HANDOFF.md): current evidence state and transition checklist.

The local reference root is recorded for provenance only. No reference binary or prototype
runtime has been copied into the repository.
