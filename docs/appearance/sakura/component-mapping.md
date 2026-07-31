# Future Sakura component mapping

Every path in this document is **future/pending**. Phase A changed none of them.

| Production seam | Current path | Future Sakura responsibility | Must preserve |
|---|---|---|---|
| Registry source | `app/src/features/appearance/themeContract.source.json` | fifth `sakura` definition, document theme, aliases | order, fallback, legacy migration |
| Generated contract | `app/src/features/appearance/themeContract.generated.ts` | regenerate from source only | generated-file authority |
| Parsing/sync | `app/src/features/appearance/themeContract.ts`, `themeSync.ts` | validate, apply, persist, synchronize Sakura | malformed/unknown rejection |
| Appearance card | `app/src/features/settings/sections/Appearance.tsx` | label, licensed existing icon, description, radio selection | keyboard/radio semantics |
| CSS entry | `app/src/main.tsx` | import a future scoped Sakura stylesheet | current import ordering |
| Theme tokens | future `app/src/styles/sakura-theme.css` | semantic variables, forced colors, reduced motion | no unscoped body/font/radius rules |
| Shell | `app/src/components/layout/AppShell.tsx` | scene host boundary and shell material | layout and cached surfaces |
| Top bar | `app/src/components/layout/TopBar.tsx` | Night material, restrained active accent | native controls and voice behavior |
| Navigation | `app/src/components/layout/NavPane.tsx` | active Pink rail, dark glass, collapse states | 240/56 behavior and semantics |
| Tabs | `app/src/components/layout/TabStrip.tsx` | selected edge/material | drag, close, overflow, keyboard |
| Inspector | `app/src/components/layout/Inspector.tsx` | secondary Night panel and tab states | resizing, portals, content |
| Routes | `app/src/components/layout/PageRouter.tsx` | route-intensity presentation signal only | lazy loading and cached Terminal/Canvas/Preview/Browser |
| Chat | `app/src/features/chat/**` | messages, composer, model/agent controls | send/stream/cancel/attachments/STT/TTS |
| JARVIS | `app/src/features/jarvis-command-center/**` and current voice surfaces | Sakura visual states | lifecycle, verified action results |
| Workbench | `app/src/features/workbench/**` | orchestration cards/canvas chrome | graph/runtime behavior |
| Terminal | `app/src/features/terminals/**` | outer chrome only; measured terminal theme if required | PTY, transcript, ANSI, input |
| Settings/account | `app/src/features/settings/**`, `app/src/features/account/**` | quiet material and semantic controls | auth, plans, entitlement, persistence |
| Shared primitives | current `app/src/components/ui/**` | consume generic semantic variables | Radix semantics and all other themes |

The existing `data-monochrome-surface` hooks are evidence that shell seams exist; Sakura should
not repurpose MonoChrome-named attributes. Prefer generic semantic variables or new narrowly
named Sakura hooks only where tokens cannot express the scene/material.

## Dependency order

1. MonoChrome B0 replay accepted and relevant locks released.
2. SK0B: source registry, generated contract, sync, persistence, command/parser, Appearance
   card, and tests.
3. Scenic foundation host with no route-specific restyling.
4. Semantic Sakura CSS and shared primitives.
5. Shell, then route groups under non-overlapping locks.
6. SK7A Chat/JARVIS/voice only after shared semantics stabilize.
7. Full visual/accessibility/regression evidence.

Origami remains in `app/src/styles/origami-chat.css` and must continue to activate only for
VibeSpace. Sakura must not import, alias, or broaden Origami selectors.
