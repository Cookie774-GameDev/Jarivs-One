# Browser Chat provider feasibility

Last reviewed: 2026-08-05

| Provider | Provider page                | Managed desktop surface                                                | System-browser fallback | Local tool/MCP bridge                         |
| -------- | ---------------------------- | ---------------------------------------------------------------------- | ----------------------- | --------------------------------------------- |
| ChatGPT  | `https://chatgpt.com/`       | Implemented; physical sign-in validation remains environment-dependent | Implemented             | Not configured; never inferred from page load |
| Claude   | `https://claude.ai/`         | Implemented; physical sign-in validation remains environment-dependent | Implemented             | Not configured; never inferred from page load |
| Gemini   | `https://gemini.google.com/` | Implemented; physical sign-in validation remains environment-dependent | Implemented             | Provider-unsupported in this surface          |

## Acceptance boundary

The managed surface uses only fixed registry URLs and independent local
profiles. It has no initialization script and receives no VibeSpace IPC
capability. These controls are verified in focused automated tests.

A real provider sign-in, challenge flow, subscription entitlement, or
provider-side policy can change outside VibeSpace. Those flows must be
validated against the installed desktop build and the user's own account;
unit tests cannot truthfully certify them. If a provider rejects embedding,
the supported result is the system-browser fallback—not scraping, cookie
transfer, automation, or security bypass.

No provider is labeled tool-connected merely because its page is available.
Future read/write bridges require a documented official provider interface,
explicit user authorization, scoped permissions, revocation, and separate
verification.
