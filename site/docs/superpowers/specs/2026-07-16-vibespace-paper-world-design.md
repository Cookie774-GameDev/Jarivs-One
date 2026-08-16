# VibeSpace Paper World Design Specification

## Intent

Rebuild the VibeSpace marketing page as a tactile, editorial paper interface that feels native to the existing Origami Scroll World. The result must look materially different from the current dark SaaS theme while preserving the working Living Desktop, iPhone, voice/calling demos, installation controls, and cinematic scroll-scrub engine.

## Reference-derived visual language

- Warm ivory parchment is the primary surface, with cream raised sheets and dark warm-brown ink.
- Coral is the primary action and active-state color. Lavender, sage, dusty blue, and ochre are supporting facets.
- Navigation, badges, cards, tabs, and buttons use clipped paper geometry, folded corners, inset edge highlights, and soft multi-layer shadows.
- A faceted lavender/coral ribbon at the top and a sparse paper-garden edge frame form the signature silhouette.
- Fraunces provides editorial display type; Inter stays for dense body/UI copy; JetBrains Mono stays for terminal content.
- A dark indigo faceted surface is used once in the hero/device stage for contrast and depth.
- Decorative layers stay CSS-native so they are crisp, responsive, lightweight, and consistent with the supplied references.

## Page composition

1. **Paper frame and navigation** — A sticky parchment ribbon with folded active action, compact brand seal, visible section links, and responsive drawer.
2. **Hero fold** — A left editorial cover with a short product thesis and paper-chip proof. The right side is a raised interactive device folio with always-visible Desktop/iPhone tabs.
3. **Living OS stage** — The existing simulator is not replaced. It is reskinned as a paper-crafted operating environment, and the desktop receives an explicit macOS/Windows shell toggle that persists for the session.
4. **Origami Scroll World** — Remains a separate full-bleed cinematic chapter inside the same index page, using the six scene anchors and eleven generated video segments already wired.
5. **Product chapters** — Existing feature, terminal, voice, calling, Hive, Council, Inspector, pricing, download, architecture, changelog, letter, and FAQ content remains functional but is regrouped visually into alternating paper sheets, folded cards, paper tapes, and colored facets.
6. **Closing garden** — The letter, FAQ, and footer become a layered stationery close rather than a generic dark footer.

## Interaction rules

- Hover motion should resemble lifting paper: small translate, rotating at most one degree, shadow separation, and no neon glow.
- Active controls use coral fills or coral paper strips with dark ink and a light upper fold.
- The Desktop/iPhone toggle is always visible at all widths.
- The desktop shell toggle changes macOS/Windows chrome without resetting open app windows and stores the selected shell in `sessionStorage` under `vs-desktop-shell`.
- Existing IDs, `data-*` attributes, and JavaScript hooks must be retained unless a tested replacement is introduced.
- Reduced-motion mode removes decorative transforms and preserves all content.

## Responsive rules

- At 960px and below the hero becomes a single column and the interactive folio remains fully visible.
- At 620px and below folded decoration becomes sparser, cards become one column, simulator controls remain at least 44px tall, and no horizontal page overflow is allowed.
- The Origami Scroll World retains its existing mobile behavior and semantic fallback.

## Accessibility and quality bar

- Warm ink on parchment must meet readable contrast for primary copy.
- Focus-visible states use a dark-ink outline plus coral offset, not color alone.
- Decorative paper layers are `aria-hidden` and pointer-inert.
- The page must load with no local request failures, console errors, or page errors.
- Automated checks must confirm the new theme hook, style order, shell switch, preserved scroll-world mount, desktop/mobile overflow, and scroll-world segment chain.
