# VibeSpace MCP Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy and verify one branded VibeSpace MCP gateway that exposes only currently available, account/project-scoped VibeSpace tools and preserves explicit approval for mutations.

**Architecture:** Extend the existing authenticated Streamable HTTP MCP boundary with a typed capability catalog and approval-aware facade. Keep local execution inside the outbound desktop relay and existing VibeSpace permission broker; the public provider page receives no direct Tauri authority.

**Tech Stack:** Python 3.11, FastAPI/Starlette, FastMCP, Supabase OAuth, React/TypeScript, Tauri desktop relay, Vitest, Pytest, Docker, Fly.io.

## Global Constraints

- Public name is exactly `VibeSpace MCP`; use an existing official VibeSpace logo.
- Deploy only against verified VibeSpace Supabase project `tipeobvisjqvpbzcpckh`.
- Never mutate AccessRevamp project `vbkkimvedmklebghtkzs`.
- Reads remain scoped; writes, terminal commands, and browser mutations require existing explicit approval.
- Do not expose absolute roots, raw secrets, provider credentials, or unrestricted provider-WebView authority.
- Do not touch protected Warm-theme files, `install/install.ps1`, `qa/**`, or dirty `phone-jarvis/cloud/bridge_endpoint.py`.

---

### Task 1: Branded capability catalog and safe facade

**Files:**
- Modify: `phone-jarvis/cloud/browser_chat_mcp.py`
- Test: `phone-jarvis/cloud/test_browser_chat_mcp.py`

**Interfaces:**
- Consumes: `BridgeSession` advertised tool metadata and `BridgeRegistry.invoke(...)`.
- Produces: `vibespace.get_capabilities` with classified availability and stable `VibeSpace MCP` server metadata.

- [ ] **Step 1: Add failing catalog tests**

Assert the server name is `VibeSpace MCP`, available tools are derived from the
authenticated relay session, unsupported tools are unavailable, and mutation
tools are never advertised without an approval-capable relay contract.

- [ ] **Step 2: Run the focused test**

Run: `python -m pytest phone-jarvis/cloud/test_browser_chat_mcp.py -q`

Expected: new catalog assertions fail before implementation.

- [ ] **Step 3: Implement the minimal typed catalog**

Add immutable tool descriptors containing stable name, category,
classification, availability, and approval requirements. Preserve the existing
four read-only facade tools and map only relay-advertised capabilities.

- [ ] **Step 4: Run the focused test**

Run: `python -m pytest phone-jarvis/cloud/test_browser_chat_mcp.py -q`

Expected: all MCP service and protocol tests pass.

### Task 2: Package-safe deployment entrypoint

**Files:**
- Modify: `phone-jarvis/cloud/Dockerfile`
- Modify: `phone-jarvis/cloud/fly.toml`
- Modify: `phone-jarvis/cloud/main.py`
- Modify: `phone-jarvis/cloud/config.py`
- Modify: `phone-jarvis/cloud/.env.example`
- Modify: `phone-jarvis/cloud/README.md`
- Test: `phone-jarvis/cloud/test_browser_chat_mcp.py`

**Interfaces:**
- Consumes: `phone-jarvis.cloud.main:app` and environment-gated MCP mount.
- Produces: a container that imports relative Python modules correctly and exposes `/health` and `/mcp`.

- [ ] **Step 1: Add a failing entrypoint/config contract test**

Verify the Docker command uses the module-qualified application path, the
deployment name is VibeSpace-specific, and production MCP enablement requires
HTTPS VibeSpace OAuth and public endpoint configuration.

- [ ] **Step 2: Run the focused contract**

Run: `python -m pytest phone-jarvis/cloud/test_browser_chat_mcp.py -q`

Expected: the old `main:app` entrypoint and phone-specific deployment name fail.

- [ ] **Step 3: Correct package layout and deployment configuration**

Copy the cloud package under `/app/phone-jarvis/cloud`, launch
`phone-jarvis.cloud.main:app`, brand health metadata without renaming unrelated
voice routes, and document exact non-secret operator variables.

- [ ] **Step 4: Verify imports and focused tests**

Run:
`python -m compileall -q phone-jarvis/cloud`

Run:
`python -m pytest phone-jarvis/cloud/test_browser_chat_mcp.py phone-jarvis/cloud/test_bridge_security.py -q`

Expected: compilation and all focused tests pass.

### Task 3: Desktop relay classifications and approvals

**Files:**
- Modify: `app/src/lib/bridge/BridgeClient.ts`
- Modify: `app/src/lib/bridge/BridgeClient.test.ts`
- Modify: `app/src/lib/bridge/useBrowserChatRelay.ts`
- Modify: `app/src/lib/bridge/useBrowserChatRelay.test.tsx`

**Interfaces:**
- Consumes: the existing workspace grant and VibeSpace action-approval broker.
- Produces: a bounded advertised capability manifest and rejects mutations without an exact approval receipt.

- [ ] **Step 1: Add failing relay-policy tests**

Cover read-only startup, optional classified capabilities, wrong account/project,
unadvertised tools, missing approvals, replay, expiry, request limits, and
sanitized failures.

- [ ] **Step 2: Run focused relay tests**

Run:
`npm --prefix app test -- src/lib/bridge/BridgeClient.test.ts src/lib/bridge/useBrowserChatRelay.test.tsx`

Expected: new classification/approval assertions fail before implementation.

- [ ] **Step 3: Implement the smallest approval-aware manifest**

Keep default grants read-only. Include a mutation capability only when the
existing action broker supplies the matching account/project-scoped approval;
never send local roots or credentials.

- [ ] **Step 4: Re-run focused relay tests**

Run:
`npm --prefix app test -- src/lib/bridge/BridgeClient.test.ts src/lib/bridge/useBrowserChatRelay.test.tsx`

Expected: all focused tests pass.

### Task 4: Browser Chat one-connector UX

**Files:**
- Modify: `app/src/features/browser-chat/BrowserChatHub.tsx`
- Modify: `app/src/features/browser-chat/BrowserChatHub.test.tsx`

**Interfaces:**
- Consumes: configured `VibeSpace MCP` public endpoint and live relay status.
- Produces: honest one-time ChatGPT connection guidance and automatic post-approval relay reconnect.

- [ ] **Step 1: Add failing user-flow tests**

Verify the page shows the exact app name, connected/disconnected states,
available categories, approval requirements, official endpoint copy/open
actions, and no claim that OAuth approval can be bypassed.

- [ ] **Step 2: Run focused Browser Chat tests**

Run:
`npm --prefix app test -- src/features/browser-chat/BrowserChatHub.test.tsx`

Expected: the new connection and catalog copy assertions fail.

- [ ] **Step 3: Implement focused connection state**

Reuse existing UI primitives. Keep ChatGPT embedded-provider behavior intact,
surface one VibeSpace MCP connection, and reconnect the desktop relay only
after an active workspace grant exists.

- [ ] **Step 4: Re-run focused frontend tests and TypeScript**

Run:
`npm --prefix app test -- src/features/browser-chat/BrowserChatHub.test.tsx`

Run:
`npm run typecheck`

Expected: focused tests and TypeScript pass.

### Task 5: Deployment and live protocol verification

**Files:**
- Modify: `docs/browser-chat/PROVIDER_FEASIBILITY.md`
- Modify: `docs/operations/PR31_EXECUTION_LEDGER.md`

**Interfaces:**
- Consumes: verified Fly identity, VibeSpace Supabase OAuth issuer, and built service.
- Produces: public HTTPS MCP endpoint and truthful live evidence.

- [ ] **Step 1: Verify owner-controlled identities**

Run Fly `auth whoami`, list Fly apps, and list Supabase projects/functions
without printing secret values. Confirm project ref `tipeobvisjqvpbzcpckh`.

- [ ] **Step 2: Deploy with secrets passed directly**

Create or reuse only the VibeSpace MCP Fly app. Set the verified VibeSpace
Supabase URL, correct project service credential, generated bridge pepper, and
public `/mcp` URL without echoing values. Deploy the exact committed source.

- [ ] **Step 3: Exercise the public boundary**

Verify `/health`, OAuth metadata, unauthenticated denial, MCP initialize/tool
discovery, one approved read, and one denied mutation. Record exact statuses
without storing tokens or user content.

- [ ] **Step 4: Register and test ChatGPT app**

Create/connect `VibeSpace MCP` with the official logo, approve OAuth once, and
verify catalog visibility plus desktop reconnect. If owner authentication or
account eligibility blocks registration, record the exact external gate while
preserving the fully tested deployed endpoint.

- [ ] **Step 5: Update evidence and publish the focused commit**

Run formatting, `git diff --check`, focused secret scans, stage only owned
paths, commit, and push normally to PR #31. Never stage protected dirty paths.

