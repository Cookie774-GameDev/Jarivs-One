# Sakura production component mapping

These are the active production seams. Sakura changes their presentation only and preserves
the behavior named in the final column.

| Production seam    | Current path                                                           | Active Sakura responsibility                                | Must preserve                                           |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Registry source    | `app/src/features/appearance/themeContract.source.json`                | fifth `sakura` definition, document theme, aliases          | order, fallback, legacy migration                       |
| Generated contract | `app/src/features/appearance/themeContract.generated.ts`               | generated Sakura contract                                   | generated-file authority                                |
| Parsing/sync       | `app/src/features/appearance/themeContract.ts`, `themeSync.ts`         | validate, apply, persist, synchronize Sakura                | malformed/unknown rejection                             |
| Appearance card    | `app/src/features/settings/sections/Appearance.tsx`                    | label, licensed existing icon, description, radio selection | keyboard/radio semantics                                |
| CSS entry          | `app/src/main.tsx`                                                     | import the scoped Sakura stylesheet after preserved themes  | current import ordering                                 |
| Theme tokens       | `app/src/styles/sakura-theme.css`                                      | semantic variables, forced colors, reduced motion           | no unscoped body/font/radius rules                      |
| Shell              | `app/src/components/layout/AppShell.tsx`                               | scene host boundary and shell material                      | layout and cached surfaces                              |
| Top bar            | `app/src/components/layout/TopBar.tsx`                                 | Night material, restrained active accent                    | native controls and voice behavior                      |
| Navigation         | `app/src/components/layout/NavPane.tsx`                                | active Pink rail, dark glass, collapse states               | 240/56 behavior and semantics                           |
| Tabs               | `app/src/components/layout/TabStrip.tsx`                               | selected edge/material                                      | drag, close, overflow, keyboard                         |
| Inspector          | `app/src/components/layout/Inspector.tsx`                              | secondary Night panel and tab states                        | resizing, portals, content                              |
| Routes             | `app/src/components/layout/PageRouter.tsx`                             | route-intensity presentation signal only                    | lazy loading and cached Terminal/Canvas/Preview/Browser |
| Chat               | `app/src/features/chat/**`                                             | messages, composer, model/agent controls                    | send/stream/cancel/attachments/STT/TTS                  |
| JARVIS             | `app/src/features/jarvis-command-center/**` and current voice surfaces | Sakura visual states                                        | lifecycle, verified action results                      |
| Workbench          | `app/src/features/workbench/**`                                        | orchestration cards/canvas chrome                           | graph/runtime behavior                                  |
| Terminal           | `app/src/features/terminals/**`                                        | outer chrome only; measured terminal theme if required      | PTY, transcript, ANSI, input                            |
| Settings/account   | `app/src/features/settings/**`, `app/src/features/account/**`          | quiet material and semantic controls                        | auth, plans, entitlement, persistence                   |
| Shared primitives  | current `app/src/components/ui/**`                                     | consume generic semantic variables                          | Radix semantics and all other themes                    |

The existing `data-monochrome-surface` hooks are evidence that shell seams exist; Sakura should
not repurpose MonoChrome-named attributes. Prefer generic semantic variables or new narrowly
named Sakura hooks only where tokens cannot express the scene/material.

## Implemented dependency order

1. Registry, generated contract, sync, persistence, command/parser, Appearance card, and tests.
2. Scenic foundation host and deterministic presentation policy.
3. Semantic Sakura CSS and shared primitives.
4. Shell, route groups, Chat/JARVIS/voice, windows, portals, and overlays.
5. Exact-reference/source contracts and the deterministic real-app browser matrix.

Source and browser contracts close these implementation seams. Quantitative performance,
native Tauri, assistive-technology, zoom, and full preserved-theme screenshot evidence remain
separate gates.

Origami remains in `app/src/styles/origami-chat.css` and must continue to activate only for
VibeSpace. Sakura must not import, alias, or broaden Origami selectors.
