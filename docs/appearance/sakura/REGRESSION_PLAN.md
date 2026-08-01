# Sakura regression plan

## Preserved-theme baseline

The passing real-app matrix proves default-theme Sakura-scene isolation. A broader preserved
theme screenshot matrix for Jarvis Core, VibeSpace, Default, and MonoChrome on Chat, Context,
Terminal, Settings, Account, Canvas, and Browser Chat remains a delivery gate. Compare the same
build and deterministic fixture.

Reject unscoped body, font, radius, backdrop, scene, petal, or portal rules. Explicitly verify:

- Origami Chat score and assets remain unchanged and activate only for VibeSpace.
- MonoChrome has no glass, petals, Sakura radii, serif override, or scenic art.
- Default and Jarvis Core retain existing geometry and tokens.
- Remote provider pages, user Canvas content, terminal content, and Pixel Pet transparency
  remain unchanged.

## Functional matrix

Run behavior tests for navigation, projects, chats, pins, send/stream, model/agent picker,
skills, Context attachments, Prompt Forge, Ask/Plan/Agent/Hive, STT/TTS/JARVIS voice,
Outputs/Live Systems, terminals/PTY/commands, `/vibespace`, Context Map/GitHub Context, Canvas,
Browser Chat/operator/local bridge/messaging, files/tasks/schedule, billing test mode,
trial/grace/lock, exports, settings, persistence, and all theme parsing/sync.

Registry tests cover five IDs; aliases cover `Sakura`, `sakura dusk`, `dusk`, optional
`blossom`, and unknown. Appearance covers five cards, icon/label/description, keyboard/radio,
selection, persistence, and synchronization. Scene host covers Sakura-only mount, unmount,
inert semantics, route intensity, hidden document, reduced motion, narrow window, and no
pet-overlay/remote-content injection.

## Verification ladder

Run focused tests first, then discovered equivalents of typecheck, app tests, build, Rust
checks where affected, Playwright visual tests, other-theme screenshots, contrast, reduced
motion, Windows native/packaged smoke, performance trace, dependency audit if assets change,
and secret scan. Record exact commands and results. Screenshots never replace functional
tests.
