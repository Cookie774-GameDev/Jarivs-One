# Browser Chat provider feasibility

Last reviewed: 2026-08-08

| Provider | Provider page                | Managed desktop surface                                                       | System-browser fallback         | Local tool/MCP bridge                                                                                                                   |
| -------- | ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT  | `https://chatgpt.com/`       | Implemented with Windows WebView2; physical sign-in remains account-dependent | Windows default-browser handler | Official read-only Streamable-HTTP MCP implemented locally; deployment, Supabase OAuth enablement, and owner connection remain external |
| Claude   | `https://claude.ai/`         | Implemented; physical sign-in validation remains environment-dependent        | Implemented                     | Not configured; never inferred from page load                                                                                           |
| Gemini   | `https://gemini.google.com/` | Implemented; physical sign-in validation remains environment-dependent        | Implemented                     | Provider-unsupported in this surface                                                                                                    |

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
ChatGPT's separate MCP resource requires an OAuth token carrying both the
VibeSpace user subject and OAuth client ID, plus a live outbound desktop relay
for the same account. The first release exposes only capability discovery,
one opaque session workspace, bounded directory listing, and bounded text
reads. Absolute roots, credential files, detected secret content, write
operations, and terminal access are blocked. Read/write bridges remain future
work requiring explicit approvals, change previews, recovery, and separate
verification.
