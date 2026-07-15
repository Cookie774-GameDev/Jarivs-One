# Subscription & CLI Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add connection-aware native API, official external CLI, and local-runtime adapters to Jarvis Chat, with safe discovery/execution and a truthful built-in `/usage` experience.

**Architecture:** A typed frontend registry describes every connection and capability while a dedicated Tauri Rust supervisor performs shell-free executable discovery and structured process execution. Existing native providers and Ollama are wrapped by the same contract; each chat persists an exact local connection selection, and existing message usage metadata remains the sole usage ledger.

**Tech Stack:** React 18, TypeScript 5.6, Zustand, Dexie, Vitest, Tauri 2, Rust, `std::process::Command`, OS keyring through the existing credential commands.

## Global Constraints

- Never read browser cookies, browser sessions, provider credential files, CLI OAuth tokens, or private web endpoints.
- Never use `shell: true`, concatenated command strings, simulated terminal keystrokes, `--yolo`, `--allow-all`, or dangerous permission bypass flags.
- Native API, official CLI subscription bridge, and local runtime are distinct connection modes in storage, routing, labels, and usage.
- Unsupported capabilities are explicitly false and must never be silently emulated.
- Every usage value carries provenance; an unknown value is unavailable, never zero, unlimited, estimated-as-exact, or a guessed subscription tier/reset.
- Background scans never submit model prompts, spend credits, open login windows, or change CLI configuration.
- No Stripe, Supabase billing, subscription, entitlement, database schema, website, phone, deployment, or production-service changes.
- Windows is first-class and never requires WSL.
- The selected `connectionId` is resolved before every request; external CLI requests never fall back to an API connection or another paid provider.
- External CLI output is untrusted, bounded, ANSI-stripped, and secret-redacted before reaching React or logs.
- All feature behavior follows red-green-refactor: write a focused failing test, observe the expected failure, add the minimal implementation, and re-run the focused tests.

---

### Task 1: Connection contracts, registry, and per-chat selection

**Files:**
- Create: `app/src/lib/ai/adapters/types.ts`
- Create: `app/src/lib/ai/adapters/registry.ts`
- Test: `app/src/lib/ai/adapters/registry.test.ts`
- Modify: `app/src/lib/ai/modelSelection.ts`
- Test: `app/src/lib/ai/modelSelection.test.ts`
- Modify: `app/src/types/chat.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Test: `app/src/lib/db/repositories.test.ts`

**Interfaces:**
- Produces `ConnectionMode`, `ProviderCapabilities`, `ProviderConnection`, `ProviderEvent`, `UsageValue`, `UsageSnapshot`, `ProviderAdapter`, `registerProviderAdapter()`, `getProviderAdapter()`, and `resolveProviderConnection()`.
- Produces `ChatModelSelection.single.connectionId` and optional `Chat.connection` persisted in Dexie but stripped from unsupported cloud payloads.

- [ ] **Step 1: Write failing registry and selection tests**

```ts
it('keeps native, external, and local connections distinct', () => {
  expect(resolveProviderConnection('openai-codex').mode).toBe('external-cli');
  expect(resolveProviderConnection('openai-api').mode).toBe('native-api');
  expect(resolveProviderConnection('ollama-local').mode).toBe('local');
});

it('never substitutes another connection', () => {
  expect(() => resolveProviderConnection('missing')).toThrow('Unknown provider connection');
});

it('round-trips a chat connection through the local repository', async () => {
  const created = await chatRepo.create({ title: 'CLI chat', connection: codexSelection });
  expect((await chatRepo.get(created.id))?.connection).toEqual(codexSelection);
});
```

- [ ] **Step 2: Run focused tests and observe missing-contract failures**

Run: `npm --prefix app test -- --run src/lib/ai/adapters/registry.test.ts src/lib/ai/modelSelection.test.ts src/lib/db/repositories.test.ts`

Expected: FAIL because the adapter contracts and connection selection do not exist.

- [ ] **Step 3: Add minimal typed contracts and deterministic registry**

```ts
export type ConnectionMode = 'external-cli' | 'native-api' | 'local';
export interface ProviderCapabilities {
  text: boolean; images: boolean; files: boolean; tools: boolean;
  modelSelection: boolean; structuredOutput: boolean; streaming: boolean;
  cancellation: boolean; resumeSession: boolean; systemPrompt: boolean;
  workingDirectory: boolean; usage: boolean; subscriptionQuota: boolean;
}
export interface ProviderConnection {
  id: string; adapterId: string; providerId: string; displayName: string;
  mode: ConnectionMode; authSource: string; modelId?: string;
  capabilities: ProviderCapabilities;
}
```

Registry lookup throws on unknown or disabled connections. It does not contain fallback logic.

- [ ] **Step 4: Persist the exact connection locally**

Add `connectionId`, `mode`, `authSource`, and capability identity to the single selection. Add an optional connection to `Chat`, copy it in `chatRepo.create/update`, and omit the additive local-only field from existing Supabase serialization.

- [ ] **Step 5: Run focused tests and commit**

Run the Task 1 command again; expected PASS.

Commit: `feat(ai): add connection-aware provider registry`

---

### Task 2: Shell-free Rust CLI discovery and process supervisor

**Files:**
- Create: `app/src-tauri/src/cli_bridge.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Test: Rust tests inside `app/src-tauri/src/cli_bridge.rs`

**Interfaces:**
- Produces Tauri commands `cli_bridge_scan`, `cli_bridge_probe`, `cli_bridge_start`, and `cli_bridge_cancel`.
- Accepts executable IDs from a static allowlist or a confirmed custom canonical path; accepts arguments as `Vec<String>` and request input separately.
- Emits bounded `cli-bridge://event` events keyed by request ID.

- [ ] **Step 1: Write failing Rust tests for validation, redaction, and argument integrity**

```rust
#[test]
fn rejects_relative_or_non_file_custom_paths() { /* assert InvalidExecutable */ }
#[test]
fn preserves_metacharacters_as_one_argument() { /* `a & whoami` remains one arg */ }
#[test]
fn redacts_secret_shaped_output_and_strips_ansi() { /* no token survives */ }
#[test]
fn rejects_windows_script_shims_without_a_verified_launcher() { /* .cmd/.ps1 */ }
```

- [ ] **Step 2: Run Rust tests and observe missing-module failures**

Run: `cargo test --manifest-path app/src-tauri/Cargo.toml cli_bridge`

Expected: FAIL because `cli_bridge` is not registered.

- [ ] **Step 3: Implement safe discovery**

Use `std::env::split_paths`, `PATHEXT` on Windows, canonical paths, file metadata fingerprints, strict timeouts, and bounded output. Use `where.exe` only through `Command::new("where.exe").arg(name)` when direct PATH scanning is insufficient. A `.cmd` or `.ps1` result is accepted only when a known package manifest maps it to a canonical Node entrypoint and exact `node.exe`; otherwise return `requires_attention`.

- [ ] **Step 4: Implement supervised execution and cancellation**

Spawn with `Command::new(canonical_executable).args(&args)`, `stdin/stdout/stderr` piped, `CREATE_NO_WINDOW` on Windows, and process-group/job cleanup. Enforce one active process per request ID, stdout/stderr byte ceilings, wall-clock timeout, real exit-code reporting, and explicit cancellation.

- [ ] **Step 5: Register commands, run tests, and commit**

Run: `cargo test --manifest-path app/src-tauri/Cargo.toml cli_bridge`

Expected: PASS with validation, timeout, malformed output, cancellation, and redaction coverage.

Commit: `feat(tauri): add secure external CLI supervisor`

---

### Task 3: Ten-target capability catalog and external adapters

**Files:**
- Create: `app/src/lib/ai/adapters/catalog.ts`
- Create: `app/src/lib/ai/adapters/cliBridge.ts`
- Create: `app/src/lib/ai/adapters/codex.ts`
- Create: `app/src/lib/ai/adapters/claude.ts`
- Create: `app/src/lib/ai/adapters/gemini.ts`
- Create: `app/src/lib/ai/adapters/copilot.ts`
- Create: `app/src/lib/ai/adapters/qwen.ts`
- Create: `app/src/lib/ai/adapters/opencode.ts`
- Create: `app/src/lib/ai/adapters/nativeCatalog.ts`
- Test: `app/src/lib/ai/adapters/catalog.test.ts`
- Test: `app/src/lib/ai/adapters/cliParsers.test.ts`

**Interfaces:**
- Consumes Task 1 contracts and Task 2 Tauri commands.
- Produces registry descriptors for OpenAI, Anthropic, Google, GitHub, xAI, DeepSeek, Z.AI/GLM, Qwen, Ollama, and OpenCode.
- Produces per-provider JSONL normalizers yielding only shared `ProviderEvent` values.

- [ ] **Step 1: Write failing capability and command-vector tests**

```ts
it('does not invent external bridges for xAI, DeepSeek, or GLM', () => {
  for (const id of ['xai', 'deepseek', 'zai']) {
    expect(catalog[id].externalCli).toBeUndefined();
  }
});

it('builds Codex arguments without embedding the prompt', () => {
  expect(buildCodexInvocation(req).args).toContain('--json');
  expect(buildCodexInvocation(req).stdin).toBe(req.prompt);
  expect(buildCodexInvocation(req).args.join(' ')).not.toContain(req.prompt);
});

it('marks unavailable quota instead of zero', () => {
  expect(normalizeClaudeResult(result).usage.quota.provenance).toBe('unavailable');
  expect(normalizeClaudeResult(result).usage.quota.value).toBeUndefined();
});
```

- [ ] **Step 2: Run focused tests and observe missing-catalog failures**

Run: `npm --prefix app test -- --run src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/cliParsers.test.ts`

Expected: FAIL because the catalog and parsers do not exist.

- [ ] **Step 3: Add verified read-only probes and invocations**

Use only these documented surfaces:

- Codex: `--version`, `login status`, `exec --json --cd <cwd> --model <model>` with prompt on stdin.
- Claude: `--version`, `auth status`, `-p --output-format stream-json --verbose --include-partial-messages --model <model>`.
- Gemini: `--version`, `-p <prompt> --output-format stream-json`; auth remains `unknown` because no safe status command is documented.
- Copilot: `version`, `-p <prompt> --output-format=json --model=<model>`; auth remains `unknown`, and `login` is user-click only.
- Qwen: `--version`, `-p <prompt> --output-format stream-json --model <model>`; auth remains `unknown`.
- OpenCode: `--version`, `auth list`, `models`, `run --format json --model <provider/model>`.

All dangerous tool permissions are false. Native xAI, DeepSeek, Z.AI, Qwen API, existing native providers, and Ollama descriptors contain no external executable command unless official automation is documented.

- [ ] **Step 4: Normalize structured output and usage**

Parse line-by-line with per-line size limits. Preserve text, session ID, tool status, warnings, errors, completion, response usage, and model identity. Reject malformed required terminal events while treating unknown future event types as bounded warnings. Never pass raw auth/account payloads through.

- [ ] **Step 5: Run focused tests and commit**

Run the Task 3 command again; expected PASS.

Commit: `feat(ai): add provider capability catalog and CLI adapters`

---

### Task 4: Connection-aware routing, model picker, and settings

**Files:**
- Modify: `app/src/lib/ai/router.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/useAccessibleChatModels.ts`
- Modify: `app/src/features/chat/ModelPickerTypeahead.tsx`
- Create: `app/src/features/chat/ConnectionInfoPopover.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Create: `app/src/features/settings/sections/SubscriptionCliBridge.tsx`
- Modify: `app/src/features/settings/SettingsModal.tsx`
- Modify: `app/src/features/settings/settingsPrefetch.ts`
- Modify: `app/src/features/settings/settingsTabMemory.ts`
- Test: `app/src/lib/ai/router.connection.test.ts`
- Test: `app/src/lib/ai/useAccessibleChatModels.test.ts`
- Test: `app/src/features/settings/SubscriptionCliBridge.test.tsx`

**Interfaces:**
- Consumes Task 1 registry and Task 3 adapters.
- Produces exact connection routing, capability-gated composer controls, grouped picker entries, and scan/refresh/configure settings actions.

- [ ] **Step 1: Write failing routing and UI behavior tests**

```ts
it('routes an external selection only through its exact adapter', async () => {
  await runAgent(reqWithConnection('openai-codex'));
  expect(codex.send).toHaveBeenCalledOnce();
  expect(openaiApi.run).not.toHaveBeenCalled();
});

it('rejects an unsupported attachment before spawning a CLI', async () => {
  await expect(sendWithImage(copilotConnection)).rejects.toThrow('does not support image attachments');
});
```

- [ ] **Step 2: Run focused tests and observe current provider-only routing failures**

Run: `npm --prefix app test -- --run src/lib/ai/router.connection.test.ts src/lib/ai/useAccessibleChatModels.test.ts src/features/settings/SubscriptionCliBridge.test.tsx`

- [ ] **Step 3: Resolve exact connection before request execution**

Native connections delegate to the existing `LLMProvider`. External connections delegate to the CLI adapter stream. Local connections delegate to the existing Ollama path. Unknown, disabled, signed-out, or unsupported connections fail with explicit errors; no paid-provider fallback occurs.

- [ ] **Step 4: Extend the existing picker and composer**

Group entries by provider, then display `Subscription bridge · External agent`, `Native Jarvis Chat · API billed`, or `Local runtime`. Save selection to the active chat. Disable images/files/tools based on capabilities and expose a compact connection-details popover.

- [ ] **Step 5: Add focused settings surface**

Add `AI Connections` without redesigning Settings. Cards display installation/auth state, canonical executable path, version, capabilities, usage availability, last check, and explicit Scan, Refresh, Sign in, Configure, Disable, Forget metadata, or Add API key actions. Sign in never launches without a click.

- [ ] **Step 6: Run focused tests and commit**

Run the Task 4 command again; expected PASS.

Commit: `feat(chat): route and present provider connections`

---

### Task 5: Truthful structured `/usage`

**Files:**
- Create: `app/src/lib/usage/usageTypes.ts`
- Create: `app/src/lib/usage/usageService.ts`
- Modify: `app/src/lib/usage/usageSummary.ts`
- Create: `app/src/features/chat/UsageCard.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/chat/SlashCommandTypeahead.tsx`
- Modify: `app/src/features/chat/MessagePart.tsx`
- Modify: `app/src/types/chat.ts`
- Test: `app/src/lib/usage/usageService.test.ts`
- Test: `app/src/features/chat/Composer.usage.test.tsx`
- Test: `app/src/features/chat/UsageCard.test.tsx`

**Interfaces:**
- Consumes response usage events and existing message usage metadata.
- Produces `getUsage(connection, chatId, mode)`, `refreshUsage(connection)`, and `usage_card` message parts.

- [ ] **Step 1: Write failing provenance and interception tests**

```ts
it('shows unavailable quota without a zero value', async () => {
  const usage = await getUsage(codexConnection, chatId, 'default');
  expect(usage.quota.value).toBeUndefined();
  expect(usage.quota.provenance).toBe('unavailable');
});

it.each(['/usage', '/usage refresh', '/usage session', '/usage all'])(
  '%s never reaches the selected model', async command => {
    await submitComposer(command);
    expect(provider.send).not.toHaveBeenCalled();
  },
);
```

- [ ] **Step 2: Run focused tests and observe current plain-text behavior failures**

Run: `npm --prefix app test -- --run src/lib/usage/usageService.test.ts src/features/chat/Composer.usage.test.tsx src/features/chat/UsageCard.test.tsx`

- [ ] **Step 3: Aggregate only the current Jarvis chat**

Query existing message records by `chatId`. Keep response-metadata counts exact, estimates labeled, provider-period values separate, and every value independently sourced. Do not create a second usage database or store prompts/responses for accounting.

- [ ] **Step 4: Implement safe refresh and all-provider summary**

Use official usage APIs/status commands only where documented, with timeout, single-flight, short TTL, and no prompt. OpenAI API organization usage remains API spending/usage, never Codex subscription quota. Ollama says `No subscription quota`. OpenCode is labeled as bridge-local usage, not upstream subscription quota.

- [ ] **Step 5: Render and persist a compact structured card**

Intercept commands in `handleSlashCommand`, create/update a `usage_card` part, and render provider, selected agent/model, connection mode, authentication source, current-chat usage, provider-period usage, quota/spending when authorized, provenance, refresh time, and unavailable reasons.

- [ ] **Step 6: Run focused tests and commit**

Run the Task 5 command again; expected PASS.

Commit: `feat(chat): add truthful provider usage cards`

---

### Task 6: Reliability, security regression suite, and draft PR

**Files:**
- Modify focused tests created in Tasks 1–5 only.
- Modify: `docs/AGENT_COORDINATION.md`

**Interfaces:**
- Verifies all acceptance criteria and produces a reviewed feature branch plus draft PR; it does not merge or deploy.

- [ ] **Step 1: Add missing matrix cases before fixes**

Add focused failing cases for installed/missing/custom/invalid/symlinked executables, version timeout, auth states, ANSI/malformed/secret/oversized output, stderr/nonzero exit, cancellation/shutdown/child cleanup, duplicate suppression, saved chat switching, no fallback, quota exact/unavailable/error/estimate, `/usage all`, and zero billable usage checks.

- [ ] **Step 2: Run each new test to verify the expected failure, then minimally fix it**

Use the focused Vitest or Cargo command naming the changed file/test. Preserve each red-green result in the task report.

- [ ] **Step 3: Run fresh full verification**

```powershell
npm run typecheck
npm --prefix app test -- --run
npm run build
cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check
cargo check --manifest-path app/src-tauri/Cargo.toml --release
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
npm audit --omit=dev --audit-level=high
git diff --check main...HEAD
```

Expected: every command exits 0. Existing build-size warnings may remain documented, but no new warning or failure is accepted.

- [ ] **Step 4: Perform manual Windows smoke verification without provider credentials**

Package or run the Tauri app, verify compact layout, scan cancellation, missing-tool states, invalid custom path rejection, picker distinctions, local Ollama behavior, and `/usage` unavailable messaging. Real account auth/quota tests require explicit user-provided authorization and are not simulated.

- [ ] **Step 5: Run whole-branch code review and fix all Critical/Important findings**

Generate a review package from the merge base through `HEAD`, dispatch the final reviewer, apply findings with focused tests, and repeat the review if required.

- [ ] **Step 6: Update coordination, release locks, push, and open a draft PR**

Record commits and verification in `docs/AGENT_COORDINATION.md`, set every feature lock to released, push `feature/subscription-cli-bridge`, and open a draft PR. Do not merge, deploy, publish, or change production services.
