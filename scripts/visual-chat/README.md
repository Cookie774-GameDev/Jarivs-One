# Deterministic Origami Chat capture

This harness renders the production Chat page with deterministic local data. It
does not add a fixture route or replace React UI: it seeds the normal Zustand
local-storage envelopes and the existing `jarvis-v1` IndexedDB stores,
including an intentionally empty activity projection, reloads the app, waits for exact
Chat/session/composer/thread state, and takes one viewport screenshot.

The capture is local-only. Output must stay beneath `.artifacts`, and the
temporary static server is created in-process and closed in `finally`. Auth and
UI partialize fields, database keys, versions, stores, indexes, and
mapper-required run/event fields are validated against production source before
launch.

## Unit verification (no browser launch)

```powershell
node --test tests/visual/chat/fixture-data.test.mjs scripts/visual-chat/capture-chat.test.mjs
npx prettier --check tests/visual/chat/fixture-data.mjs tests/visual/chat/fixture-data.test.mjs scripts/visual-chat/static-server.mjs scripts/visual-chat/browser-launch.mjs scripts/visual-chat/chat-fixture.mjs scripts/visual-chat/capture-chat.mjs scripts/visual-chat/capture-chat.test.mjs scripts/visual-chat/README.md
git diff --check -- tests/visual/chat scripts/visual-chat
```

## Announced smoke capture

Build first. This command intentionally launches a headless browser:

```powershell
npm run build
node scripts/visual-chat/capture-chat.mjs --dist app/dist --output .artifacts/origami-chat/smoke/chat.png
```

Browser resolution is: `VIBESPACE_BROWSER_EXECUTABLE`, installed Edge,
installed Chrome, then Playwright-managed Chromium from the installed
`playwright-core` package. The resulting receipt records the selected source.

Web preview cannot provide native Tauri bridges. Exactly two diagnostics are
excluded: `pageerror: Cannot read properties of undefined (reading 'invoke')`
and
`console: [boot] account scope startup: jarvis_kernel_host_not_installed`.
Variants, symbol mentions, generic TypeErrors, and every unrelated console/page
error fail capture.
Native-only voice transport, microphone capture, window chrome, filesystem
commands, and OS integrations are not attested by this browser screenshot. The
harness requires exactly one visible “Open Jarvis voice panel” control and a
visible reduced-motion production panel. It requires the exact `Ready` status
and `Click to talk` control once the panel opens, then checks them again after
stable layout at the screenshot boundary so a late error/listening transition
refuses capture. It never fabricates a Jarvis module. The harness also locks the
document to the top, the Chat thread to its exact bottom, and the expected
session metrics before stable layout sampling. Date and animation-frame
freezing apply only at their document-boot and screenshot boundaries,
respectively. DOM/style screenshot cleanup is independent and preserves the
capture error first; any resource-close failure is likewise reported.

The web preview's automatic Ollama discovery is isolated from the machine: the
browser context serves deterministic fixture responses only for loopback
`/api/version` and `/api/tags`, and blocks every other port-11434 request.
