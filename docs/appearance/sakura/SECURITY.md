# Sakura security and privacy contract

Sakura is appearance-only. It must not add data flow, capabilities, network access, remote
content injection, persistence fields beyond the validated theme value, or executable
prototype code.

## Required controls

- Treat the reference HTML, Markdown, SVG paths, images, and embedded strings as untrusted
  design input. Re-author production assets; do not execute or wholesale copy prototype JS.
- No external CDN, font, image, analytics, or API request.
- No mock credentials, provider status, user content, account identifiers, browser history, or
  screenshots of private data in fixtures/evidence.
- Validate `sakura` through the existing generated theme contract and reject malformed sync
  messages. Preserve all unrelated persisted fields and legacy migrations.
- Slash commands and deterministic JARVIS actions call the real validated setter; they do not
  evaluate arbitrary input or model output.
- Never inject theme CSS/JS into remote provider pages. Style only VibeSpace-owned browser
  chrome.
- Scene markup is static, decorative, inert, and contains no unsafe HTML or URL.
- Preserve CSP/offline behavior and self-hosted fonts. Adding a dependency requires separate
  review and authority.
- Billing, auth, access, terminal execution, PTY, voice, and local bridge behavior remain
  unchanged and require their existing security tests.

Future review must inspect the exact diff for unsafe URLs, data URLs, `dangerouslySetInnerHTML`,
global selectors, persistence/version changes, secret-bearing fixtures, and webview boundary
violations. Phase A accessed no network or external system and copied no binary.
