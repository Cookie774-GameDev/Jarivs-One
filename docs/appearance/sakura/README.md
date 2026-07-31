# Sakura Phase A documentation

Status: **Phase A complete only; production implementation is pending and gated.**

This directory converts the six-file Sakura Dusk reference package into a dependency-ready
documentation contract. It does not add a theme, CSS, scenery, routes, tests, commands, or
runtime behavior. MonoChrome must first pass its controlled B0 replay, shared theme contracts
must stabilize, and relevant locks must be released.

Evidence labels used throughout:

- **Authoritative** — required by the production master goal or `STYLE_SPEC.md`.
- **Observed** — directly read or visually inspected in the immutable reference package.
- **Measured** — SHA/image metadata or Task390 WCAG color math.
- **Derived** — a production recommendation consistent with authority.
- **Pending** — requires a later gated implementation or browser/native evidence.

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
  future production seams.
- [PERFORMANCE.md](PERFORMANCE.md), [SECURITY.md](SECURITY.md),
  [VISUAL_TEST_PLAN.md](VISUAL_TEST_PLAN.md), and [REGRESSION_PLAN.md](REGRESSION_PLAN.md):
  future verification contracts.
- [REGRESSION_RESULTS.md](REGRESSION_RESULTS.md), [ROLLBACK.md](ROLLBACK.md), and
  [FINAL_HANDOFF.md](FINAL_HANDOFF.md): current evidence state and transition checklist.

The local reference root is recorded for provenance only. No reference binary or prototype
runtime has been copied into the repository.
