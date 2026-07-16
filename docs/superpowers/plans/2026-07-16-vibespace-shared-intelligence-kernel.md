# VibeSpace Shared Intelligence Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Shared Intelligence Kernel as the real,
persisted, safety-enforcing foundation consumed by typed JARVIS chat, voice,
scheduled work, Hive final responses, deterministic actions, and a thin
truthful Command Center shell.

**Architecture:** Add one protected JARVIS identity/profile boundary, one
request envelope and prompt compiler, one provider prompt transport, one
response envelope and prose-enforcement pipeline, and one normalized
run/event/approval/artifact journal. Persist the new records in additive,
account-scoped Dexie v3 stores that never enter generic cloud sync. Migrate
consumers incrementally behind a runtime gate while projecting canonical state
into existing UI contracts until later phases replace those projections.

**Tech stack:** TypeScript 5.6, React 18, Zustand 5, Dexie 4, Vitest 4, Tauri 2,
Rust, existing VibeSpace AI/provider adapters and stores.

**Approved design:**
`docs/superpowers/specs/2026-07-16-vibespace-shared-intelligence-kernel-design.md`

**Program plan:** `docs/unified-goals/EXECUTION_PLAN.md`

**Implementation base:** `origin/main` at
`8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`

**Branch:** `codex/shared-intelligence-kernel-design-20260716`

## Execution Rules

- Keep `integrate/grok-workbench-pr25-v2`, its worktree, and all pre-existing
  localhost processes untouched.
- Never stage or restore the unrelated `install/install.ps1` deletion.
- Before each task, acquire exact file locks in `AGENT_COORDINATION.md`.
- Read-only discovery and brief preparation may run concurrently. Product
  implementation tasks run sequentially through fresh implementer and reviewer
  gates; contract-defining tasks land before their consumers.
- Each behavior change begins with a focused failing test and an observed
  expected failure.
- Do not use snapshot-only tests for security, migration, state-machine, or
  transport behavior.
- Use `superpowers:systematic-debugging` for unexpected failures and
  `superpowers:verification-before-completion` before any completion claim.
- Never stage a directory. Construct every `git add` from the exact literal
  files enumerated by that task.
- Immediately before every commit, run `git diff --cached --name-only`,
  `git diff --cached --check`, and `git diff --cached -- <each exact task
path>`. The name list must contain only the task's locked files, and
  `install/install.ps1` must never appear.
- Do not push, open a draft PR, or claim the kernel complete until Task 22.

### Dependency-safe execution order

Execute the task briefs in this dependency-safe order:

`1A, 1B (lock-gated), 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 11, 12, 13, 16A, 14, 15, 19, 20, 16B, 21A, 17, 21B, 22`.

Task 1A is complete. Task 1B remains deferred while
`AGENT-20260713-081843-S9BX` owns `app/src/App.tsx`; that lock does not block
Tasks 2-13, but Task 1B must land before Task 16A starts. Task 18 precedes
request consumers so it alone allocates caller-stable run IDs and owns legal
state transitions. Task 16A establishes `legacy | shadow | kernel` shadow
compilation before response cutover; Task 16B owns the tested production
default switch to `kernel`. Task 21A binds voice before schedule/Hive Task 17,
and Task 21B mounts the read-only Command Center only after all canonical
lifecycle consumers exist.

## Contract Naming and Persistence Conventions

- Domain contracts use camelCase.
- Dexie rows use snake_case.
- Explicit mappers are the only conversion boundary.
- Times are Unix milliseconds.
- IDs use stable prefixes: `jrun_`, `jappr_`, `jart_`, `jprof_`, `jident_`.
- A `JarvisEvent` has no separate prefixed ID. Its canonical identity is the
  compound `(runId, seq)` key; `idempotencyKey` is a distinct retry/crash
  deduplication key.
- `JarvisRun.id` is the caller-stable run ID and run idempotency key. Task 18
  allocates and persists it before any request envelope is built.
- Mutable identity/profile records remain separate from immutable request
  snapshots. A dispatched envelope and every nested snapshot/collection are
  deeply immutable.
- Secret values, raw credentials, cookies, auth headers, and browser storage
  never appear in any row, event, approval, artifact, log, or diagnostic.
- `accountId` is always explicit for account-bearing repository reads.
- There is no `local-unassigned` fallback.

## Task 1: Canonical Account Identity

### Task 1A: Resolver contract - complete

**Files and evidence:**

- Created: `app/src/lib/accountIdentity.ts`
- Created: `app/src/lib/accountIdentity.test.ts`
- Implementation commit:
  `a33eeb6fb9588869116c55b000a4b65e4a2fbb99`
- Review-fix commit:
  `7b51641fd159e5b58ef9604db9fa1010854aaa0a`

**Contract:**

```ts
export type AccountIdentity = {
  accountId: string;
  source: 'supabase' | 'local';
};

export function resolveAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity | null;

export function requireAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity;

export function getActiveAccountIdentity(): AccountIdentity | null;
```

- [x] **Step 1: Write and observe the focused RED test**

Cover:

- authenticated Supabase ID wins over local ID;
- a present cloud session with a blank user ID fails closed instead of falling
  through to local scope;
- stable local ID is used while signed out;
- no identity returns `null`, never `local-unassigned`;
- signing in/out changes active scope without rewriting `localUserId`;
- `requireAccountIdentity()` throws a typed boot-not-ready error.

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
```

Observed: FAIL because the module did not exist.

- [x] **Step 2: Implement and review the resolver**

The resolver is Supabase-first, local-only while signed out, and fail-closed
when a present cloud session has an unusable user ID. It never fabricates
`local-unassigned`. The independent review fix added the malformed-cloud-session
regression.

- [x] **Step 3: Verify the completed slice**

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
npm run typecheck
```

Observed: focused Vitest passed 6/6; root typecheck passed; exact-file Prettier,
whitespace, and commit-scope checks passed.

### Task 1B: App account-scope integration - deferred

**Lock prerequisite:** Do not edit or stage this task until the current
`app/src/App.tsx` owner formally releases or hands off the exact file. Preserve
that owner's staged App work during reconciliation.

**Files:**

- Modify: `app/src/App.tsx`
- Create: `app/src/App.accountIdentity.test.tsx`

- [ ] **Step 1: Write the failing App boot integration tests**

Mock only the account-scoped listener factories and prove:

- the existing V2 shell remains renderable while canonical identity is
  unavailable;
- learning, All About Me persistence, and legacy task-run persistence do not
  start until `resolveAccountIdentity()` returns a real scope;
- signed-out local scope and valid cloud scope start with the exact resolved
  `accountId`;
- a present cloud session with a blank user ID starts no scoped listener and
  never falls back to `localUserId`;
- account transitions stop every old-scope listener before starting the new
  scope, without rewriting the stable local ID.

- [ ] **Step 2: Observe the focused RED failure**

```powershell
npm --prefix app test -- src/App.accountIdentity.test.tsx
```

Expected: FAIL because `App.tsx` still contains three
`cloudSession?.user_id ?? localUserId ?? 'local-unassigned'` fallbacks and starts
the listeners before canonical scope is ready.

- [ ] **Step 3: Integrate the canonical resolver**

Replace all three fallback expressions with the Task 1A resolver. Keep
account-scoped start/stop ownership in one App boot lifecycle: no identity
means no account-scoped listener, an account change tears down the old scope
before starting the new one, and App cleanup tears down the active scope.
Delay only shared-kernel/account-scoped activation; do not delay the existing
V2 UI, database seed, non-account-scoped runtime, or unrelated boot effects.

- [ ] **Step 4: Verify the lock-gated slice**

```powershell
npm --prefix app test -- src/App.accountIdentity.test.tsx src/lib/accountIdentity.test.ts
npm run typecheck
```

Expected: both focused files and typecheck pass; the App test proves no
cross-account fallback and no V2 shell boot regression.

- [ ] **Step 5: Stage exact files, inspect the cache, and commit**

```powershell
git add -- app/src/App.tsx app/src/App.accountIdentity.test.tsx
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/App.tsx app/src/App.accountIdentity.test.tsx
git commit -m "feat(jarvis): bind app boot to canonical account identity"
```

## Task 2: Protected JARVIS Identity and Profile Contracts

**Files:**

- Create: `app/src/lib/jarvis/identity.ts`
- Create: `app/src/lib/jarvis/identity.test.ts`
- Create: `app/src/lib/jarvis/profiles/types.ts`
- Create: `app/src/lib/jarvis/profiles/types.test.ts`

**Interfaces:**

```ts
export const JARVIS_IDENTITY_ID = 'jarvis';
export const JARVIS_IDENTITY_VERSION = 1;

export interface JarvisIdentityRevision {
  id: string;
  identityId: typeof JARVIS_IDENTITY_ID;
  version: number;
  coreHash: string;
  responseContractHash: string;
  createdAt: number;
}

export interface JarvisIdentitySnapshot {
  identityVersion: number;
  coreHash: string;
  responseContractHash: string;
}

export interface JarvisProfile {
  id: string;
  revisionId: string;
  accountId: string;
  name: string;
  customInstructions: string;
  instructionSource: 'none' | 'user' | 'legacy_user_extension';
  memoryScope: 'none' | 'profile' | 'shared_selected';
  voiceEnabled: boolean;
  active: boolean;
  identityVersion: number;
  soulRevisionId?: string;
  sourcePromptHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JarvisProfileSnapshot {
  profileId: string;
  revisionId: string;
  soulRevisionId?: string;
  customInstructions: string;
  memoryScope: 'none' | 'profile' | 'shared_selected';
}

export type JarvisDeliverySurface = 'written' | 'voice';

export interface JarvisDeliveryPolicy {
  surface: JarvisDeliverySurface;
  identityVersion: number;
  identityCore: string;
  responseContract: string;
  surfaceRules: readonly string[];
}

export const JARVIS_IDENTITY_POLICY: Readonly<{
  identityVersion: 1;
  identityCore: string;
  responseContract: string;
  delivery: Readonly<Record<JarvisDeliverySurface, readonly string[]>>;
}>;

export function isProtectedJarvisAgent(agent: Pick<Agent, 'builtin' | 'slug'>): boolean;

export function getJarvisDeliveryPolicy(
  surface: JarvisDeliverySurface,
): Readonly<JarvisDeliveryPolicy>;

export function hashJarvisText(text: string): Promise<string>;

export function isKnownShippedJarvisPrompt(text: string): Promise<boolean>;

export function createJarvisIdentitySnapshot(
  revision: JarvisIdentityRevision,
): Readonly<JarvisIdentitySnapshot>;

export function createJarvisProfileSnapshot(
  profile: JarvisProfile,
): Readonly<JarvisProfileSnapshot>;
```

Mutable identity/profile records and immutable request snapshots are separate
contracts. Profile `id` remains stable across edits while `revisionId` changes
for every user-authorized revision. Snapshot factories return only hashes,
version/revision references, approved custom instructions, and memory scope;
they never expose immutable policy text, migration-only fields, active flags,
or mutable timestamps.

The shared protected-agent predicate is exactly
`agent.builtin === true && agent.slug === 'jarvis'`. Tasks 8, 10, 12, 14, 16A,
16B, and later goal work must import it rather than repeat slug-only checks.

**Frozen legacy prompt normalization and hashes:**

`normalizeLegacyJarvisPrompt(text)` must apply JavaScript `trim()` and normalize
both CRLF and lone CR to LF:

```ts
export function normalizeLegacyJarvisPrompt(text: string): string {
  return text.trim().replace(/\r\n?/g, '\n');
}
```

Hash the normalized runtime prompt string as UTF-8 bytes with SHA-256. Pin these
four unique shipped values:

```ts
export const KNOWN_SHIPPED_JARVIS_PROMPT_HASHES = {
  seed_00ceba4: '020dde65358f76f800c06ba36fd12d2309c8285b1a0ca66b6dd670f2c08b02e0',
  registry_3f90607_d611620_fa82eee:
    '5291fb94990f1be342a8f5021d5575ac8c84830a9de9d34a991e9c40a00445f9',
  registry_5b83ab0: '372097384ec803abce2c36422cc135cc0dd6b0b988b0b6f826c05dc45ae382cb',
  registry_ed91635_current: '935b8911bd134646475507d2363a79c2f5e0c232e4561285a647f07f60195bda',
} as const;
```

The first value is the `app/src/lib/db/seed.ts` prompt shipped at `00ceba4`.
The next values are runtime registry prompt variants from
`3f90607`/`d611620`/`fa82eee`, `5b83ab0`, and `ed91635` through the current
release. Do not hash TypeScript source escapes or file bytes; tests must hash
the actual runtime strings.

**Implementation responsibilities:**

- `hashJarvisText(text)` calls `normalizeLegacyJarvisPrompt(text)` exactly once,
  hashes that UTF-8 runtime string with Web Crypto SHA-256, and returns
  lowercase hexadecimal;
- `isKnownShippedJarvisPrompt(text)` hashes through that same function and
  checks only the four frozen values;
- one frozen immutable identity/security/response policy source from the
  approved design;
- `getJarvisDeliveryPolicy('written' | 'voice')` returns frozen surface policy
  whose `identityCore` and `responseContract` come from
  `JARVIS_IDENTITY_POLICY`, never a duplicated prompt;
- the protected-agent predicate and immutable snapshot factories above.

Do not use the non-cryptographic `hashString()` helper.

- [ ] **Step 1: Write the failing contract tests**

Cover:

- exact `trim()` plus CRLF/lone-CR-to-LF normalization;
- all four frozen runtime hashes and their source-history labels;
- edited-prompt and TypeScript-source-escape rejection;
- SHA-256 rather than the existing non-cryptographic helper;
- `isProtectedJarvisAgent()` accepting only built-in slug `jarvis` and rejecting
  a user-created slug collision;
- stable profile ID with a distinct changing revision ID;
- identity snapshots containing only
  `identityVersion/coreHash/responseContractHash`;
- profile snapshots containing only
  `profileId/revisionId/soulRevisionId/customInstructions/memoryScope`;
- frozen snapshots;
- exact function signatures and lowercase SHA-256 results;
- written and voice policies whose `identityCore` and `responseContract`
  equal the same frozen source values while only `surfaceRules` differ.

- [ ] **Step 2: Observe the focused RED failure**

```powershell
npm --prefix app test -- src/lib/jarvis/identity.test.ts src/lib/jarvis/profiles/types.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the minimal protected contracts**

Lift canonical immutable identity, security, truth, response, and written/voice
delivery clauses from the approved design into one frozen policy object.
Create identity/profile domain records separately from their snapshot
factories. Freeze returned snapshots. Diagnostics may contain only versions,
revision IDs, and hashes, never raw immutable rules or custom instruction
content.

- [ ] **Step 4: Verify**

```powershell
npm --prefix app test -- src/lib/jarvis/identity.test.ts src/lib/jarvis/profiles/types.test.ts
npm run typecheck
```

- [ ] **Step 5: Stage exact files, inspect the cache, and commit**

```powershell
git add -- app/src/lib/jarvis/identity.ts app/src/lib/jarvis/identity.test.ts app/src/lib/jarvis/profiles/types.ts app/src/lib/jarvis/profiles/types.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/lib/jarvis/identity.ts app/src/lib/jarvis/identity.test.ts app/src/lib/jarvis/profiles/types.ts app/src/lib/jarvis/profiles/types.test.ts
git commit -m "feat(jarvis): define protected identity and profiles"
```

## Task 3: Core Kernel Domain Contracts and Validators

**Files:**

- Create: `app/src/lib/jarvis/contracts/request.ts`
- Create: `app/src/lib/jarvis/contracts/prompt.ts`
- Create: `app/src/lib/jarvis/contracts/source.ts`
- Create: `app/src/lib/jarvis/contracts/capability.ts`
- Create: `app/src/lib/jarvis/contracts/response.ts`
- Create: `app/src/lib/jarvis/contracts/execution.ts`
- Create: `app/src/lib/jarvis/contracts/validators.ts`
- Create: `app/src/lib/jarvis/contracts/validators.test.ts`
- Create: `app/src/lib/jarvis/contracts/index.ts`

**Interfaces:**

Task 3 consumes `JarvisIdentitySnapshot` and `JarvisProfileSnapshot` from Task 2. It defines every other normative v1 shape and enum below. Later tasks may
add versioned extensions, but they must not create parallel base contracts.

`app/src/lib/jarvis/contracts/request.ts` must preserve this exact request
envelope:

```ts
export interface JarvisRequestEnvelope {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  agent: { id: string; slug: string; builtin: boolean };
  surface: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  interactionMode: 'ask' | 'plan' | 'agent';
  responseModeHint?: JarvisResponseMode;
  userText: string;
  messageHistory: LLMMessage[];
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  model: JarvisModelSnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  createdAt: number;
}
```

> The envelope is immutable after dispatch. A retry receives a new `requestId`
> and retains the same `runId` only when it is a transport retry of the same
> logical execution.

Task 18 must allocate and persist the caller-stable `runId` before Task 11
constructs this envelope. Task 11 deep-freezes the completed envelope and all
nested snapshots/collections. A logical retry creates both a new `requestId`
and a new `runId`; a transport retry creates a new `requestId` and retains the
same run.

`app/src/lib/jarvis/contracts/prompt.ts`:

```ts
export type PromptAuthority =
  | 'immutable_security'
  | 'immutable_identity'
  | 'capability_policy'
  | 'user_approved_preference'
  | 'turn_policy'
  | 'untrusted_context'
  | 'output_contract';

export interface CompiledPromptLayer {
  id: string;
  authority: PromptAuthority;
  sourceRefs: JarvisSourceRef[];
  content: string;
  contentHash: string;
  charCount: number;
  truncated: boolean;
}

export interface CompiledJarvisPrompt {
  schemaVersion: 1;
  layers: readonly CompiledPromptLayer[];
  systemText: string;
  providerPrompt?: string;
  promptHash: string;
  identityVersion: number;
  profileRevisionId: string;
  diagnostics: {
    totalChars: number;
    omittedSourceRefs: JarvisSourceRef[];
    warnings: string[];
  };
}
```

`app/src/lib/jarvis/contracts/source.ts`:

```ts
export type JarvisSourceKind =
  | 'user_message'
  | 'chat'
  | 'project'
  | 'project_file'
  | 'context_node'
  | 'memory'
  | 'terminal'
  | 'tool_result'
  | 'plugin'
  | 'mcp'
  | 'web'
  | 'schedule'
  | 'artifact'
  | 'agent_output';

export interface JarvisSourceRef {
  id: string;
  kind: JarvisSourceKind;
  label: string;
  uri?: string;
  accountId: string;
  projectId?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observedAt?: number;
  contentHash?: string;
}

export interface JarvisContextItem {
  source: JarvisSourceRef;
  purpose: 'answer' | 'execution' | 'preference' | 'history' | 'capability' | 'citation';
  excerpt: string;
  score?: number;
  truncated: boolean;
}

export interface JarvisContextPack {
  items: readonly JarvisContextItem[];
  budget: {
    maxChars: number;
    usedChars: number;
  };
  exclusions: {
    source: JarvisSourceRef;
    reason: string;
  }[];
}
```

`app/src/lib/jarvis/contracts/capability.ts`:

```ts
export interface JarvisEntitlementSnapshot {
  source: 'server' | 'local_development' | 'unavailable';
  planId?: string;
  capabilities: string[];
  verifiedAt?: number;
  expiresAt?: number;
}

export interface JarvisCapabilitySnapshot {
  capturedAt: number;
  tools: JarvisCapabilityRef[];
  plugins: JarvisCapabilityRef[];
  mcps: JarvisCapabilityRef[];
  terminals: JarvisCapabilityRef[];
  agents: JarvisCapabilityRef[];
  entitlements: JarvisEntitlementSnapshot;
}

export interface JarvisCapabilityRef {
  id: string;
  state: 'available' | 'connected' | 'authenticated' | 'degraded' | 'unavailable' | 'planned';
  operations: string[];
  evidenceRef?: string;
  lastVerifiedAt?: number;
}

export interface JarvisModelSnapshot {
  connectionId?: string;
  providerId: string;
  modelId: string;
  connectionMode: 'native-api' | 'external-cli' | 'local';
  capabilities: Record<string, boolean>;
  effectiveTemperature?: number;
  capturedAt: number;
}
```

`app/src/lib/jarvis/contracts/response.ts`:

```ts
export type JarvisResponseMode =
  | 'acknowledgement'
  | 'direct_answer'
  | 'status'
  | 'warning'
  | 'approval_required'
  | 'action_running'
  | 'action_success'
  | 'action_partial'
  | 'action_failure'
  | 'clarification'
  | 'recommendation'
  | 'long_form_delivery'
  | 'sensitive';

export interface JarvisOutputContract {
  preserveStructuredBlocks: true;
  allowActionBlocks: boolean;
  allowPlanBlocks: boolean;
  allowQuestionBlocks: boolean;
  allowPermissionBlocks: boolean;
  voiceDelivery: 'none' | 'validated_stream' | 'final_summary';
}

export interface JarvisExecutionState {
  status: JarvisRunStatus;
  verifiedBy: 'journal' | 'executor' | 'provider';
  lastEventSeq: number;
}

export interface JarvisResponseEnvelope {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  mode: JarvisResponseMode;
  displayText: string;
  spokenText?: string;
  parts: readonly Part[];
  artifactIds: readonly string[];
  sourceRefs: readonly JarvisSourceRef[];
  executionState?: JarvisExecutionState;
  provider: JarvisModelSnapshot;
  enforcement: {
    linted: boolean;
    violations: string[];
    repairAttempted: boolean;
    repairSucceeded: boolean;
    fallbackUsed: boolean;
  };
  completedAt: number;
}
```

The response envelope block above is exact. Task 14 owns semantic truth checks,
mode classification, and prose enforcement; Task 3 validates only its JSON-safe
shape and enum membership.

`app/src/lib/jarvis/contracts/execution.ts`:

```ts
export type JarvisRunStatus =
  | 'queued'
  | 'compiling'
  | 'running'
  | 'awaiting_approval'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface JarvisRun {
  id: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  source: JarvisRequestEnvelope['surface'];
  status: JarvisRunStatus;
  agentId: string;
  identityVersion: number;
  profileRevisionId: string;
  model: JarvisModelSnapshot;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface JarvisEvent {
  runId: string;
  seq: number;
  idempotencyKey: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  artifactIds: string[];
  createdAt: number;
}

export interface JarvisApproval {
  id: string;
  runId: string;
  actionId: string;
  actionVersion: number;
  params: unknown;
  secretHandleRefs?: {
    field: string;
    handleId: string;
  }[];
  paramsHash: string;
  targetSnapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  createdAt: number;
  decidedAt?: number;
  consumedAt?: number;
}

export interface JarvisArtifact {
  id: string;
  runId: string;
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mimeType?: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  createdAt: number;
}
```

`JarvisRun.id` is the caller-stable run idempotency key. A `JarvisEvent` is
identified only by `(runId, seq)`; `idempotencyKey` is required, non-empty, and
used by Task 7's unique `[run_id+idempotency_key]` index to deduplicate delivery
without inventing a separate event ID.

`app/src/lib/jarvis/contracts/validators.ts` returns:

```ts
export type JarvisContractValidationErrorCode =
  | 'missing_field'
  | 'invalid_type'
  | 'unknown_enum'
  | 'non_finite_number'
  | 'invalid_identifier'
  | 'non_json_safe';

export interface JarvisContractValidationError {
  code: JarvisContractValidationErrorCode;
  path: readonly (string | number)[];
  message: string;
}

export type JarvisContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly JarvisContractValidationError[] };

export function validateJarvisRequestEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisRequestEnvelope>;
export function validateCompiledJarvisPrompt(
  input: unknown,
): JarvisContractValidationResult<CompiledJarvisPrompt>;
export function validateJarvisSourceRef(
  input: unknown,
): JarvisContractValidationResult<JarvisSourceRef>;
export function validateJarvisContextPack(
  input: unknown,
): JarvisContractValidationResult<JarvisContextPack>;
export function validateJarvisCapabilitySnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisCapabilitySnapshot>;
export function validateJarvisModelSnapshot(
  input: unknown,
): JarvisContractValidationResult<JarvisModelSnapshot>;
export function validateJarvisResponseEnvelope(
  input: unknown,
): JarvisContractValidationResult<JarvisResponseEnvelope>;
export function validateJarvisRun(input: unknown): JarvisContractValidationResult<JarvisRun>;
export function validateJarvisEvent(input: unknown): JarvisContractValidationResult<JarvisEvent>;
export function validateJarvisApproval(
  input: unknown,
): JarvisContractValidationResult<JarvisApproval>;
export function validateJarvisArtifact(
  input: unknown,
): JarvisContractValidationResult<JarvisArtifact>;
```

Paths and messages contain only schema field names, indexes, and safe error
categories. Validators never log, stringify into diagnostics, or return the
rejected payload.

Task 3 validators enforce required fields, primitive/container shapes, literal
schema version, enum membership, finite timestamps/numbers, non-negative
integer event sequences, non-empty identifiers, and JSON-safe values. They do
not decide legal run transitions, secret-content admission, approval risk or
consumption, artifact backing, or response/executor truth:

- Task 18 owns legal state transitions and cancellation outcomes.
- Task 19 owns secret parameter rejection, risk derivation, and approval
  revalidation.
- Task 20 owns artifact backing/state rules.
- Task 14 owns response truth and prose enforcement.

- [ ] **Step 1: Write failing table-driven validator tests**

Cover:

- valid construction and JSON round trips for every contract family;
- every `PromptAuthority`, source kind/trust/sensitivity/context purpose,
  capability state, connection mode, entitlement source, voice delivery,
  response mode, run status, event type, approval risk/status, and artifact
  kind;
- unknown enum values and wrong `schemaVersion`;
- missing account/request/run ownership and empty IDs;
- non-finite timestamps/scores/budgets and negative/fractional event sequences;
- event identity as `(runId, seq)` plus a required non-empty
  `idempotencyKey`, with no event `id`;
- source refs missing account, trust, sensitivity, or kind;
- nested functions, class instances, symbols, bigint, `undefined`, sparse
  arrays, and non-finite values rejected as non-JSON-safe;
- a `console` spy proving rejected payload values are never logged or returned.

Do not add tests for transition legality, secret-shaped parameter contents,
artifact backing, or response text matching executor truth in this task.

- [ ] **Step 2: Observe the focused RED failure**

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts
```

Expected: FAIL because the contract modules do not exist.

- [ ] **Step 3: Implement minimal contracts and shape/enum validators**

Implement the exact validator exports above with shared private JSON-safety,
record, array, finite-number, non-empty-string, and enum helpers. Successful
results return the same validated value without mutation. Do not add a runtime
schema dependency unless hand-written validation is first shown materially
less safe and the dependency receives a separately scoped plan correction.
`index.ts` re-exports only these canonical definitions.

- [ ] **Step 4: Verify**

```powershell
npm --prefix app test -- src/lib/jarvis/contracts/validators.test.ts
npm run typecheck
```

- [ ] **Step 5: Stage exact files, inspect the cache, and commit**

```powershell
git add -- app/src/lib/jarvis/contracts/request.ts app/src/lib/jarvis/contracts/prompt.ts app/src/lib/jarvis/contracts/source.ts app/src/lib/jarvis/contracts/capability.ts app/src/lib/jarvis/contracts/response.ts app/src/lib/jarvis/contracts/execution.ts app/src/lib/jarvis/contracts/validators.ts app/src/lib/jarvis/contracts/validators.test.ts app/src/lib/jarvis/contracts/index.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app/src/lib/jarvis/contracts/request.ts app/src/lib/jarvis/contracts/prompt.ts app/src/lib/jarvis/contracts/source.ts app/src/lib/jarvis/contracts/capability.ts app/src/lib/jarvis/contracts/response.ts app/src/lib/jarvis/contracts/execution.ts app/src/lib/jarvis/contracts/validators.ts app/src/lib/jarvis/contracts/validators.test.ts app/src/lib/jarvis/contracts/index.ts
git commit -m "feat(jarvis): add shared kernel contracts"
```

## Task 4: Immediate Context Secret Interlock

**Files:**

- Create: `app/src/lib/jarvis/sourcePolicy.ts`
- Create: `app/src/lib/jarvis/sourcePolicy.test.ts`
- Modify: `app/src/features/context/tree.ts`
- Modify: `app/src/features/context/tree.test.ts`
- Modify: `app/src/lib/ai/context.ts`
- Modify: `app/src/lib/ai/context.test.ts`

**Interfaces:**

- Consumes: `FsReadError` from `app/src/lib/fs.ts`.
- Produces: one two-stage path-and-content admission policy shared by Context
  scanning, connected files, and explicit attachments.
- Preserves: ordinary non-secret text/media behavior; an explicit attachment
  does not bypass policy and Task 4 adds no consent UI.

**Exact contract:**

```ts
import type { FsReadError } from '@/lib/fs';

export type JarvisSourceChannel =
  | 'automatic_scan'
  | 'explicit_attachment'
  | 'connected_file'
  | 'artifact_preview'
  | 'sync';

export type JarvisSourcePolicyInput = {
  path: string;
  root?: string | null;
  sizeBytes?: number;
  channel: JarvisSourceChannel;
  kind: 'directory' | 'text' | 'media_metadata' | 'binary' | 'unknown';
  contentSample?: string;
  defaultSensitivity?: 'public' | 'private';
};

export type JarvisSourceDecision =
  | {
      allowed: true;
      reason: 'allowed_text_source';
      sensitivity: 'public' | 'private';
      safeSummary: string;
    }
  | {
      allowed: false;
      reason:
        | 'secret_filename'
        | 'secret_content'
        | 'credential_path'
        | 'binary'
        | 'too_large'
        | 'outside_allowed_root'
        | 'symlink_escape'
        | 'unsupported';
      sensitivity: 'restricted' | 'secret';
      safeSummary: string;
    };

export function classifyJarvisSource(input: JarvisSourcePolicyInput): JarvisSourceDecision;

export function classifyJarvisReadError(
  error: FsReadError,
): Extract<JarvisSourceDecision, { allowed: false }>;
```

- Run `classifyJarvisSource()` before every read. A denied path must never
  reach `readTextFileSample()`, provider prompt construction, indexing,
  artifact preview, or sync.
- For an allowed text path, run the classifier again with exactly the sampled
  content before that sample enters a provider prompt or Context tree.
- `safeSummary` uses only a basename, safe category, and reason. It never
  includes a rejected match, token fragment, credential value, raw body, or
  private absolute path.
- Local project and attachment inputs default to `sensitivity: 'private'`.
  `public` is returned only when the caller explicitly supplies
  `defaultSensitivity: 'public'`.
- `FsReadError.code === 'outside_root'` maps to
  `outside_allowed_root`; a safe native `symlink_escape` category maps to
  `symlink_escape`; `too_large`, `not_utf8`, and `unsupported_type` map to
  `too_large`, `binary`, and `unsupported`.

Path admission denies case-insensitively after slash normalization:

- `.env` and every `.env.*` variant, `.npmrc`, and `.pypirc`;
- `.pem`, `.key`, `.p12`, `.pfx`, private-key exports, `id_rsa`, and
  `id_ed25519`;
- AWS `.aws/credentials`, GCP/gcloud credential JSON, Azure credential/token
  files, provider credential directories, `.config/gh/hosts.yml`,
  `.docker/config.json`, and `.kube/config`;
- recovery-code exports, keychain exports, browser cookie databases, auth
  stores, and paths with explicit credential/secret directory semantics.

Content admission returns `secret_content` for:

- a PEM private-key header;
- non-empty `API_KEY`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `CLIENT_SECRET`,
  `PASSWORD`, or `AWS_SECRET_ACCESS_KEY` assignments;
- credential-shaped values using recognizable prefixes such as
  `github_pat_`, `ghp_`, `sk-`, or `AIza`;
- recovery-code or credential-export records.

Safe near-matches such as `src/environment.ts`, `docs/cookie-policy.md`, and
`src/keynote.ts` remain allowed.

- [ ] **Step 1: Write the failing policy and integration tests**

In `sourcePolicy.test.ts`, table-test every path class above with Windows and
POSIX separators, safe near-matches, content-only denial under
`C:\repo\notes.txt`, sensitivity output, and proof that `safeSummary` excludes
the synthetic secret.

In `tree.test.ts`, prove `.env.local`, `.npmrc`, cloud credentials, and a
normal `.txt` sample containing a secret never appear in the generated tree or
provider bundle. Assert `readTextFileSample()` is never called for path-denied
fixtures and `listDirectory()` is never called for denied `.aws`, `.azure`, or
gcloud credential child directories.

In `context.test.ts`, prove connected and explicit files share the policy,
explicit attachment does not bypass it, content-denied samples are absent from
the returned block, and ordinary text/media behavior remains available.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts src/lib/ai/context.test.ts
```

Expected: FAIL because the new module cannot be resolved and the existing
Context scan still admits `.env*` candidates.

- [ ] **Step 3: Implement the exact two-stage source policy**

Implement `sourcePolicy.ts` to the exact contract above. Normalize separators
and case for path classification, reject secret content without returning the
match, and map filesystem read failures through `classifyJarvisReadError()`.

- [ ] **Step 4: Integrate both current ingestion paths**

In `tree.ts`, remove the current
`basename(entry.path).startsWith('.env')` candidate allowance. Classify the
selected root before its first listing, every directory before recursion, and
every file before media metadata creation or text reads. Never traverse a
denied credential directory. Classify each successful text sample again before
adding it to `ScannedContextFile[]`. Omit rejected sources without copying
their contents into errors, progress strings, trees, or provider prompts.

In `ai/context.ts`, make connected-file and explicit-attachment reads use the
same pre-read and post-read policy. A denial contributes only its
`safeSummary`; the existing `--- ${path} ---` formatting must not reveal a
rejected secret path or body.

- [ ] **Step 5: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts src/lib/ai/context.test.ts
npm run typecheck
```

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/sourcePolicy.ts' 'app/src/lib/jarvis/sourcePolicy.test.ts' 'app/src/features/context/tree.ts' 'app/src/features/context/tree.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/sourcePolicy.ts' 'app/src/lib/jarvis/sourcePolicy.test.ts' 'app/src/features/context/tree.ts' 'app/src/features/context/tree.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(context): exclude secret paths and content"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the six files above. The
installer queries and whitespace checks produce no output.

## Task 5: Client Entitlement Interlock

**Files:**

- Modify: `app/src/lib/entitlements.ts`
- Create: `app/src/lib/entitlements.test.ts`
- Modify: `app/src/lib/admin.ts`
- Create: `app/src/lib/admin.test.ts`
- Modify: `app/src/components/layout/TopBar.tsx`
- Modify: `app/src/features/account/AccountPage.tsx`
- Modify: `app/src/features/ambient/AmbientAudioHost.tsx`
- Modify: `app/src/features/call/CallButton.tsx`
- Modify: `app/src/features/call/CallModal.tsx`
- Modify: `app/src/features/settings/sections/Ambient.tsx`
- Modify: `app/src/features/settings/sections/Admin.tsx`

**Interfaces:**

- Consumes: the exact `JarvisEntitlementSnapshot` exported by Task 3.
- Produces: a typed entitlement snapshot API plus a boolean
  `useAppAdmin(): boolean` compatibility selector derived only from that
  snapshot.
- Preserves: existing `effectivePlan`, `planAllowsJarvisCall`,
  `planAllowsVoiceWithAdmin`, ambient, voice-plan, and existing boolean
  consumer behavior for a true verified admin result.

**Exact typed and compatibility contract:**

```ts
import type { JarvisEntitlementSnapshot } from '@/lib/jarvis/contracts';

export const APP_ADMIN_CAPABILITY = 'app.admin';

export type EntitlementEvaluationContext = {
  production: boolean;
  now: number;
};

export type LocalDevelopmentEntitlementConfig = {
  blanketAdmin: boolean;
  adminEmails: readonly string[];
  adminLocalIds: readonly string[];
};

export function resolveLocalDevelopmentEntitlementSnapshot(
  identity: AdminIdentity,
  options?: {
    context?: Partial<EntitlementEvaluationContext>;
    config?: LocalDevelopmentEntitlementConfig;
  },
): JarvisEntitlementSnapshot;

export function entitlementSnapshotAllowsAdmin(
  snapshot: JarvisEntitlementSnapshot,
  context?: Partial<EntitlementEvaluationContext>,
): boolean;
```

```ts
export async function fetchCloudAdminEntitlementSnapshot(
  userId: string | undefined,
): Promise<JarvisEntitlementSnapshot>;

export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean>;

export function useAppEntitlementSnapshot(): JarvisEntitlementSnapshot;

/** Boolean UI compatibility selector; never a second authority source. */
export function useAppAdmin(): boolean;
```

Delete `BUILTIN_ADMIN_EMAILS`; no replacement hard-coded email or local ID is
permitted. Existing `VITE_JARVIS_ADMIN`, `VITE_JARVIS_LOCAL_ADMIN`,
`VITE_JARVIS_ADMIN_EMAILS`, and `VITE_JARVIS_ADMIN_LOCAL_IDS` inputs may
produce only a `source: 'local_development'` snapshot and only when
`production === false`:

```ts
{
  source: 'local_development',
  planId: 'ultra',
  capabilities: [APP_ADMIN_CAPABILITY],
  verifiedAt: now,
  expiresAt: now + 5 * 60_000,
}
```

In production, the same identity/configuration returns:

```ts
{ source: 'unavailable', capabilities: [] }
```

No production billing or admin operation may treat a
`source: 'local_development'` snapshot as authority.

`entitlementSnapshotAllowsAdmin()` returns true only when:

- `verifiedAt` is finite;
- `expiresAt`, when present, is greater than `now`;
- `APP_ADMIN_CAPABILITY` exists; and
- the source is `server`, or is `local_development` while
  `production === false`.

`planId` alone never grants admin. `source: 'unavailable'`, missing
verification, an expired snapshot, an empty capability list, and production
evaluation of `local_development` all fail closed.

`fetchCloudAdminEntitlementSnapshot()` maps a successful `is_app_admin` RPC to
a server snapshot. A true result includes `APP_ADMIN_CAPABILITY`; false is a
verified server snapshot with an empty capability list. Missing user ID,
missing client, RPC error, or thrown error returns
`{ source: 'unavailable', capabilities: [] }`. Cache the complete snapshot by
user ID, never return it after `expiresAt`, and preserve
`clearCloudAdminCache()` as the explicit reset.

`fetchCloudAdminStatus()` remains only this compatibility wrapper:

```ts
export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean> {
  return entitlementSnapshotAllowsAdmin(await fetchCloudAdminEntitlementSnapshot(userId));
}
```

`useAppEntitlementSnapshot()` reads current auth-store identity, prefers a
successful signed-in server result, uses explicitly configured development
state only in a non-production build, otherwise returns unavailable, and
resets on account change.

`useAppAdmin()` remains only:

```ts
export function useAppAdmin(): boolean {
  return entitlementSnapshotAllowsAdmin(useAppEntitlementSnapshot());
}
```

It is not a second authority source.

**Exact caller migration:**

Replace every direct `isAdminIdentity()` call with `useAppAdmin()` in:

- `app/src/components/layout/TopBar.tsx` for both call controls;
- `app/src/features/account/AccountPage.tsx`;
- `app/src/features/ambient/AmbientAudioHost.tsx`;
- `app/src/features/call/CallButton.tsx`;
- `app/src/features/call/CallModal.tsx`;
- `app/src/features/settings/sections/Ambient.tsx`.

Remove now-unused `email`, `cloudEmail`, and `localUserId` selectors from those
components.

Convert `app/src/features/settings/sections/Admin.tsx` from direct
`fetchCloudAdminStatus()` use to the typed
`useAppEntitlementSnapshot()` result. Its copy describes server-authoritative
admin and explicitly marked development access and removes claims that an
email allowlist is production authority.

Verify, but do not otherwise change, these existing boolean compatibility
consumers:

- `app/src/features/settings/SettingsModal.tsx`;
- `app/src/features/settings/sections/Hive.tsx`;
- `app/src/features/settings/sections/Plans.tsx`;
- `app/src/features/settings/sections/Voice.tsx`;
- `app/src/features/wallpaper-library/WallpaperLibrary.tsx`.

- [ ] **Step 1: Write the failing entitlement and admin tests**

In `entitlements.test.ts`, cover:

- `vipersel2@gmail.com`, case variants, and aliases receive no admin capability
  when the explicit local-development configuration is empty;
- explicitly configured email or local ID produces
  `source: 'local_development'` only with `production: false`;
- a handcrafted, unexpired local-development snapshot with `app.admin` still
  fails under `production: true`;
- an unexpired verified server snapshot containing `app.admin` passes;
- missing `verifiedAt`, expired `expiresAt`, unavailable source, empty
  capabilities, and `planId: 'ultra'` without the capability fail;
- legitimate `effectivePlan`, `planAllowsJarvisCall`, and
  `planAllowsVoiceWithAdmin` behavior remains unchanged when passed the
  derived boolean.

In `admin.test.ts`, mock `getSupabaseClient()` and prove:

- RPC true produces a server snapshot with `app.admin`, finite `verifiedAt`,
  and future `expiresAt`;
- RPC false produces a verified server snapshot without `app.admin`;
- missing user/client, RPC error, and thrown exception produce unavailable;
- cache entries are scoped by user ID, expire, and are cleared by
  `clearCloudAdminCache()`;
- `fetchCloudAdminStatus()` returns the boolean derived from the typed result;
- `useAppAdmin()` returns a boolean and account switching cannot retain the
  previous account's admin state.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts src/lib/admin.test.ts
```

Expected: FAIL because both tests and the typed exports are absent; once the
old implementation loads, the hard-coded owner-email expectation also fails.

- [ ] **Step 3: Implement the typed, fail-closed snapshot boundary**

Implement the exact contracts above, delete the hard-coded email path, cache
complete user-scoped snapshots, reject expired/unverified/local-production
authority, and preserve the boolean compatibility wrappers.

- [ ] **Step 4: Migrate the exact direct callers and verify compatibility**

Apply the exact caller migration above. Confirm the verify-only list still
receives a boolean from `useAppAdmin()` and that account switching clears any
prior account's snapshot-derived state.

- [ ] **Step 5: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts src/lib/admin.test.ts
npm run typecheck
```

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/entitlements.ts' 'app/src/lib/entitlements.test.ts' 'app/src/lib/admin.ts' 'app/src/lib/admin.test.ts' 'app/src/components/layout/TopBar.tsx' 'app/src/features/account/AccountPage.tsx' 'app/src/features/ambient/AmbientAudioHost.tsx' 'app/src/features/call/CallButton.tsx' 'app/src/features/call/CallModal.tsx' 'app/src/features/settings/sections/Ambient.tsx' 'app/src/features/settings/sections/Admin.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/entitlements.ts' 'app/src/lib/entitlements.test.ts' 'app/src/lib/admin.ts' 'app/src/lib/admin.test.ts' 'app/src/components/layout/TopBar.tsx' 'app/src/features/account/AccountPage.tsx' 'app/src/features/ambient/AmbientAudioHost.tsx' 'app/src/features/call/CallButton.tsx' 'app/src/features/call/CallModal.tsx' 'app/src/features/settings/sections/Ambient.tsx' 'app/src/features/settings/sections/Admin.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(entitlements): remove client admin authority"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eleven files above. The
installer queries and whitespace checks produce no output.

## Task 6: Browser Operator Approval Integrity Interlock

**Files:**

- Modify: `app/src/features/browser/browserTypes.ts`
- Modify: `app/src/features/browser/browserStore.ts`
- Modify: `app/src/features/browser/browserActions.ts`
- Modify: `app/src/features/browser/browserActions.test.ts`
- Create: `app/src/features/browser/browserStore.test.ts`
- Modify: `app/src/features/browser/BrowserPage.tsx`
- Create: `app/src/features/browser/BrowserPage.approval.test.tsx`

**Interfaces:**

- Consumes: `JarvisApproval['risk']` from Task 3, `hashJarvisText()` from Task
  2, `getActiveAccountIdentity()` from Task 1A, and
  `isProtectedJarvisAgent()` from `app/src/lib/jarvis/identity.ts`.
- Produces: a complete account-bound, session-local reviewed browser action
  record and a fail-closed immediate execution interlock.
- Defers: canonical consequential execution to Task 19's
  `JarvisApprovalV1` adapter. The browser store remains a view projection, not
  a second durable approval authority.
- Preserves: manual browser navigation and safe ordinary browser use.

**Exact reviewed-action contract:**

```ts
import type { Agent } from '@/types/agent';
import type { JarvisApproval } from '@/lib/jarvis/contracts';

export type BrowserJsonPrimitive = string | number | boolean | null;
export type BrowserJsonValue = BrowserJsonPrimitive | BrowserJsonValue[] | BrowserJsonObject;
export type BrowserJsonObject = {
  [key: string]: BrowserJsonValue;
};

export type BrowserActionRisk = JarvisApproval['risk'];

export type BrowserActionRequester = {
  kind: 'agent';
  agent: Pick<Agent, 'id' | 'slug' | 'builtin'>;
  runId?: string;
};

export type BrowserActionTarget = {
  currentUrl: string;
  requestedUrl?: string;
  selector?: string;
  coordinates?: { x: number; y: number };
};

export type BrowserReviewedActionStatus = 'pending' | 'denied' | 'expired' | 'unavailable';

export type BrowserReviewedAction = {
  id: string;
  accountId: string;
  requester: BrowserActionRequester;
  kind: string;
  actionVersion: 1;
  origin: string;
  tabId: string;
  frameId?: string;
  target: BrowserActionTarget;
  parameters: BrowserJsonObject;
  parametersHash: string;
  reviewedHash: string;
  expectedEffect: string;
  risk: BrowserActionRisk;
  safeSummary: string;
  status: BrowserReviewedActionStatus;
  requestedAt: number;
  expiresAt: number;
  result?: string;
};
```

`BrowserToolRequest` becomes:

```ts
export interface BrowserToolRequest {
  tool: string;
  params?: BrowserJsonObject;
  summary?: string;
  requester?: BrowserActionRequester;
}
```

Risk uses only the canonical vocabulary:

```ts
export function classifyRisk(tool: string, parameters?: BrowserJsonObject): JarvisApproval['risk'];
```

- read/list/inspect operations without a consequential hint are `safe`;
- click/type/press/select/check/upload/download/navigate are `confirm`;
- submit/delete/purchase/pay/password/login/sign-in/checkout or an explicitly
  destructive registered action are `dangerous`.

The caller cannot supply risk. Derive it from the registered tool plus
canonical parameters, never from caller-authored `summary`, and derive it again
at validation.

**Exact hash and validation contract:**

```ts
export const BROWSER_ACTION_VERSION = 1;
export const BROWSER_REVIEW_TTL_MS = 5 * 60_000;

export type BrowserReviewContext = {
  accountId: string;
  origin: string;
  tabId: string;
  frameId?: string;
  target: BrowserActionTarget;
  now: number;
};

export type BrowserReviewValidation =
  | { ok: true; action: BrowserReviewedAction }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_pending'
        | 'account_mismatch'
        | 'expired'
        | 'hash_mismatch'
        | 'action_changed'
        | 'origin_changed'
        | 'tab_changed'
        | 'frame_changed'
        | 'target_changed'
        | 'risk_changed';
    };

export function canonicalizeBrowserJson(value: BrowserJsonValue): string;

export async function validateBrowserReviewedAction(
  action: BrowserReviewedAction | undefined,
  request: BrowserToolRequest,
  context: BrowserReviewContext,
): Promise<BrowserReviewValidation>;

export async function consumeBrowserReviewedAction(
  actionId: string,
  cdp: CdpSession | null,
): Promise<BrowserToolResult>;
```

`canonicalizeBrowserJson()` recursively sorts object keys, preserves array
order, rejects `undefined`, functions, class instances, cycles, and non-finite
numbers, and emits one deterministic JSON string. Hash using Task 2's
cryptographic `hashJarvisText()`; do not use `hashString()`. Normalize optional
`builtin`, `runId`, `frameId`, and target fields to explicit booleans or `null`
before canonicalization.

Compute:

- `parametersHash` from canonical non-secret `parameters`;
- `reviewedHash` from canonical JSON containing exactly `accountId`,
  `requester`, `kind`, `actionVersion`, `origin`, `tabId`, `frameId` or
  `null`, `target`, `parameters`, `expectedEffect`, `risk`, and `expiresAt`.

At validation, compare stored `accountId` to
`getActiveAccountIdentity()?.accountId`, recompute both hashes, derive risk
again, and compare current origin/tab/frame/target. Any difference returns the
exact typed rejection above.

Reject before storage when any parameter key or value represents a password,
cookie, authorization header, API key, token, client secret, private key,
recovery code, or when `params.secret === true`. Neither the value, a fragment,
nor a credential-handle identifier may enter `safeSummary`, `result`, logs, or
tests.

**Immediate-interlock behavior:**

- `user_only` rejects every programmatic browser request, including `safe`.
- Every `confirm` or `dangerous` request requires a requester snapshot, a real
  active account identity, a real active tab, and a complete non-secret
  reviewed record.
- Control mode never bypasses review for `confirm` or `dangerous`.
- `safe` read/list/inspect actions may continue through the existing executor.
- `browser.stop` continues to abort current agent actions.
- The store preserves the complete record and keeps it session-local; its
  persisted `partialize` payload excludes reviewed records.
- `BrowserPage` Approve calls
  `consumeBrowserReviewedAction(action.id, cdpRef.current)`.
- Delete summary reconstruction through:

```ts
executeBrowserTool({ tool: action.tool, summary: action.summary }, cdpRef.current);
```

Even after local validation succeeds, `consumeBrowserReviewedAction()` returns
truthful unavailability:

```ts
{
  ok: false,
  tool: action.kind,
  message:
    'Browser Operator execution is unavailable until canonical approval is active.',
  data: { status: 'unavailable', actionId: action.id },
}
```

It updates the view record to `unavailable`, never calls
`executeBrowserTool()`, and never marks the action done, completed, or
successful. Deny updates the exact record to `denied`. Manual typing and
navigation performed directly by the user remain enabled.

When Task 6 needs a JARVIS-specific label or branch, it imports
`isProtectedJarvisAgent()` and never checks slug alone. The predicate is true
only for `agent.builtin === true && agent.slug === 'jarvis'`; a user-created
`{ slug: 'jarvis', builtin: false }` is not protected. Task 10 owns the other
slug-only call sites in `App.tsx`, `Inspector.tsx`, `Composer.tsx`,
`FilesPage.tsx`, `FileExplorerDialog.tsx`, `modelSelection.ts`, and
`runtime.ts`.

- [ ] **Step 1: Write the failing action-integrity tests**

In `browserActions.test.ts`, prove:

- risk returns only `safe | confirm | dangerous`;
- a benign summary cannot downgrade tool/parameter-derived risk;
- user-only mode rejects even safe programmatic actions;
- confirm/dangerous cannot bypass review in any control mode;
- records preserve canonical parameters, account, action version, origin,
  tab/frame, target, risk, and expiry;
- object-key reordering leaves both hashes unchanged;
- changing each bound field changes or rejects the reviewed hash;
- non-`pending` status rejects replay with `not_pending`;
- account switch, expiry, origin change, tab/URL change, frame change, target
  change, risk drift, replay, and tamper are rejected;
- secret/cookie/token/private-key/recovery-code parameters are rejected before
  insertion;
- valid local review returns truthful unavailable and never calls the
  executor;
- `isProtectedJarvisAgent()` distinguishes built-in JARVIS from a user-created
  slug collision.

- [ ] **Step 2: Write the failing store and UI tests**

In `browserStore.test.ts`, prove the enqueue path stores the complete record,
status transitions are limited to
`pending -> denied|expired|unavailable`, records are bounded to 100, and
reviewed records are absent from the persisted `partialize` payload.

In `BrowserPage.approval.test.tsx`, mount a pending record and prove Approve
passes only the action ID and current CDP handle, never reconstructs a request
from `safeSummary`, renders unavailable rather than success/done, Deny marks
the exact record denied, and ordinary manual URL navigation remains enabled.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
```

Expected: FAIL because the two new tests do not exist, current records discard
parameters/account/target, `BrowserPage` reconstructs only tool/summary, and
the current risk vocabulary is not canonical.

- [ ] **Step 4: Implement the complete reviewed-record and validation contract**

Implement canonical JSON, cryptographic parameter/reviewed hashes, secret
rejection, account/tab/frame/target/risk/expiry binding, bounded session-local
storage, and the exact typed validation failures above.

- [ ] **Step 5: Implement the fail-closed BrowserPage consumption path**

Replace summary replay with ID-only consumption. Preserve safe actions and
manual navigation, but return the exact unavailable result for locally
reviewed consequential actions until Task 19 is canonical.

- [ ] **Step 6: Verify the implementation**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
npm run typecheck
```

- [ ] **Step 7: Record the required Task 19 follow-through**

Task 19 must add these exact browser paths to its file list, focused tests, and
literal staging command:

- `app/src/features/browser/browserTypes.ts`
- `app/src/features/browser/browserStore.ts`
- `app/src/features/browser/browserStore.test.ts`
- `app/src/features/browser/browserActions.ts`
- `app/src/features/browser/browserActions.test.ts`
- `app/src/features/browser/BrowserPage.tsx`
- `app/src/features/browser/BrowserPage.approval.test.tsx`

Task 19 replaces Task 6's session-local validation/unavailable outcome with an
adapter to canonical `JarvisApprovalV1`, inherits account scope from the
parent run, and revalidates action version, canonical parameter hash, target,
risk, capability snapshot, entitlement, expiry, and single-use consumption.
The browser store remains only a view projection.

- [ ] **Step 8: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/browser/browserTypes.ts' 'app/src/features/browser/browserStore.ts' 'app/src/features/browser/browserActions.ts' 'app/src/features/browser/browserActions.test.ts' 'app/src/features/browser/browserStore.test.ts' 'app/src/features/browser/BrowserPage.tsx' 'app/src/features/browser/BrowserPage.approval.test.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(browser): quarantine unbound browser approvals"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the seven files above. The
installer queries and whitespace checks produce no output.

## Task 7: Additive Dexie v3 Schema and Injected Database Factory

**Files:**

- Modify: `app/package.json`
- Modify: `package-lock.json`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/index.ts`
- Create: `app/src/test/indexedDb.ts`
- Create: `app/src/lib/db/index.migration.test.ts`

**Interfaces:**

- Consumes: `JarvisIdentitySnapshot` and mutable `JarvisProfile` from Task 2;
  `JarvisRun`, `JarvisEvent`, `JarvisApproval`, `JarvisArtifact`,
  `JarvisModelSnapshot`, and `JarvisSourceRef` from Task 3.
- Produces: additive snake_case V3 rows, six typed Dexie tables, the unique
  `[run_id+idempotency_key]` event-delivery constraint, and an injected
  database factory used by Tasks 8, 9, 18, 19, and 20.
- Preserves: every character of `STORES_V1` and `STORES_V2` and every existing
  V1/V2 row. V3 adds no destructive `.upgrade()` callback.

**Exact row contracts:**

Action `params` and `target_snapshot` remain canonical JSON payloads and
retain their registered action field names. All kernel-owned row fields use
snake_case:

```ts
export type JarvisModelSnapshotRow = {
  connection_id?: string;
  provider_id: string;
  model_id: string;
  connection_mode: 'native-api' | 'external-cli' | 'local';
  capabilities: Record<string, boolean>;
  effective_temperature?: number;
  captured_at: number;
};

export type JarvisSourceRefRow = {
  id: string;
  kind:
    | 'user_message'
    | 'chat'
    | 'project'
    | 'project_file'
    | 'context_node'
    | 'memory'
    | 'terminal'
    | 'tool_result'
    | 'plugin'
    | 'mcp'
    | 'web'
    | 'schedule'
    | 'artifact'
    | 'agent_output';
  label: string;
  uri?: string;
  account_id: string;
  project_id?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observed_at?: number;
  content_hash?: string;
};

export type JarvisIdentityRevisionRow = {
  id: string;
  identity_id: 'jarvis';
  version: number;
  core_hash: string;
  response_contract_hash: string;
  created_at: number;
};

export type JarvisProfileRow = {
  id: string;
  account_id: string;
  name: string;
  active: 0 | 1;
  identity_version: number;
  revision_id: string;
  soul_revision_id?: string;
  custom_instructions: string;
  instruction_source: 'none' | 'user' | 'legacy_user_extension';
  memory_scope: 'none' | 'profile' | 'shared_selected';
  voice_enabled: boolean;
  source_prompt_hash?: string;
  created_at: number;
  updated_at: number;
  migration_version: 3;
  migration_source: 'legacy_agent' | 'clean_default';
  migration_source_prompt_hash?: string;
  migration_completed_at: number;
};

export type JarvisRunRow = {
  id: string;
  account_id: string;
  workspace_id?: string;
  project_id?: string;
  chat_id?: string;
  parent_run_id?: string;
  source: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  status:
    | 'queued'
    | 'compiling'
    | 'running'
    | 'awaiting_approval'
    | 'partial'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed_out';
  agent_id: string;
  identity_version: number;
  profile_revision_id: string;
  model: JarvisModelSnapshotRow;
  created_at: number;
  updated_at: number;
  completed_at?: number;
};

export type JarvisEventRow = {
  run_id: string;
  seq: number;
  idempotency_key: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safe_summary?: string;
  source_refs: JarvisSourceRefRow[];
  artifact_ids: string[];
  created_at: number;
};

export type JarvisApprovalRow = {
  id: string;
  run_id: string;
  action_id: string;
  action_version: number;
  params: unknown;
  secret_handle_refs?: { field: string; handle_id: string }[];
  params_hash: string;
  target_snapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  created_at: number;
  decided_at?: number;
  consumed_at?: number;
};

export type JarvisArtifactRow = {
  id: string;
  run_id: string;
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mime_type?: string;
  safe_summary?: string;
  source_refs: JarvisSourceRefRow[];
  created_at: number;
};
```

Tasks 19 and 20 extend `JarvisApprovalRow` and `JarvisArtifactRow` without
changing the V3 object-store or index declaration.

**Exact additive schema:**

```ts
export const DB_VERSION = 3;

export const STORES_V3 = {
  ...STORES_V2,
  jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at',
  jarvis_profiles: 'id, account_id, [account_id+active], updated_at',
  jarvis_runs:
    'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]',
  jarvis_events:
    '[run_id+seq], run_id, idempotency_key, &[run_id+idempotency_key], type, status, created_at',
  jarvis_approvals: 'id, run_id, status, params_hash, created_at',
  jarvis_artifacts: 'id, run_id, kind, created_at',
} as const;

export const STORES = STORES_V3;
```

Do not alter any character of the existing `STORES_V1` and `STORES_V2`
objects. `active` is `0 | 1`; IndexedDB boolean keys are invalid.

**Exact database factory:**

```ts
export type JarvisDexieDependencies = {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
};

export class JarvisDexie extends Dexie {
  jarvis_identity_revisions!: EntityTable<JarvisIdentityRevisionRow, 'id'>;
  jarvis_profiles!: EntityTable<JarvisProfileRow, 'id'>;
  jarvis_runs!: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events!: Table<JarvisEventRow, [string, number]>;
  jarvis_approvals!: EntityTable<JarvisApprovalRow, 'id'>;
  jarvis_artifacts!: EntityTable<JarvisArtifactRow, 'id'>;

  constructor(name = DB_NAME, dependencies?: JarvisDexieDependencies) {
    super(name, dependencies);
    this.version(1).stores(STORES_V1);
    this.version(2).stores(STORES_V2);
    this.version(3).stores(STORES_V3);
  }
}

export function createJarvisDb(
  name = DB_NAME,
  dependencies?: JarvisDexieDependencies,
): JarvisDexie {
  return new JarvisDexie(name, dependencies);
}

export const db = createJarvisDb();
```

Import `Table` from Dexie for the compound event primary key. Do not type the
event table as though `run_id` alone were its primary key.

`app/src/test/indexedDb.ts` exports:

```ts
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

export const TEST_INDEXED_DB = { indexedDB, IDBKeyRange } as const;

export function uniqueTestDbName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
```

Every migration test creates a unique database name, closes its database in
`afterEach`, and deletes only that exact test database.

- [ ] **Step 1: Write the failing additive-migration tests**

In `index.migration.test.ts`, prove:

- fresh V3 exposes every existing store plus the six kernel stores;
- the exact `STORES_V1` and `STORES_V2` literals are unchanged;
- V1→V3 preserves every inserted V1 row byte-for-byte;
- V2→V3 preserves every inserted V1/V2 row byte-for-byte;
- reopening V3 is idempotent;
- `[run_id+seq]` retrieves event sequences `1, 2, 3` in order;
- duplicate `(run_id, seq)` fails;
- duplicate `(run_id, idempotency_key)` fails even with another sequence;
- the same idempotency key succeeds in another run; and
- the V3 declaration has no destructive `.upgrade()` callback.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
```

Expected: FAIL because the V3 rows, injected factory, test helper, and
`fake-indexeddb` dependency do not exist.

- [ ] **Step 3: Install the isolated IndexedDB test dependency**

```powershell
npm install --workspace app --save-dev fake-indexeddb
```

Expected: only `app/package.json` and `package-lock.json` change.

- [ ] **Step 4: Implement the rows, additive version chain, and injected factory**

Add the exact row contracts, schema, factory, typed tables, and test helper
above. Replay `version(1)`, `version(2)`, and `version(3)` explicitly, preserve
the process singleton through `createJarvisDb()`, and add no data-copy or
deletion callback.

- [ ] **Step 5: Verify the migration implementation**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
npm run typecheck
```

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/package.json' 'package-lock.json' 'app/src/lib/db/schema.ts' 'app/src/lib/db/index.ts' 'app/src/test/indexedDb.ts' 'app/src/lib/db/index.migration.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/package.json' 'package-lock.json' 'app/src/lib/db/schema.ts' 'app/src/lib/db/index.ts' 'app/src/test/indexedDb.ts' 'app/src/lib/db/index.migration.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(db): add shared intelligence kernel v3 stores"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the six files above. The
installer queries and whitespace checks produce no output.

## Task 8: Transactional Account Activation and Legacy JARVIS Migration

**Files:**

- Create: `app/src/lib/db/migrations/jarvisV3.ts`
- Create: `app/src/lib/db/migrations/jarvisV3.test.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.test.ts`

Do not claim or stage `app/src/App.tsx`. Task 8 builds and tests activation as
a library. Task 1B/16A mounts the coordinator only after the authoritative App
lock is formally released.

**Interfaces:**

- Consumes: `AccountIdentity` from Task 1, protected identity/profile factories
  and `isProtectedJarvisAgent()` from Task 2, and `JarvisDexie` plus V3 tables
  from Task 7.
- Produces: deterministic account profile IDs, transactional migration
  metadata, a retryable activation result, and an account-aware persistence
  coordinator with explicit `activating | ready | degraded` states.
- Preserves: V2 UI availability and every legacy Agent row. Activation failure
  never deletes or rewrites V1/V2 data.

**Exact migration and activation contracts:**

```ts
export type JarvisV3MigrationSource = 'legacy_agent' | 'clean_default';

export type JarvisV3MigrationResult = {
  accountId: string;
  profileId: string;
  identityRevisionId: string;
  migrationVersion: 3;
  source: JarvisV3MigrationSource;
  migrationSourcePromptHash?: string;
  migrated: boolean;
};

export type JarvisV3MigrationErrorCode =
  | 'migration_conflict'
  | 'profile_integrity_error'
  | 'invalid_account_identity';

export class JarvisV3MigrationError extends Error {
  readonly code: JarvisV3MigrationErrorCode;
}

export async function defaultJarvisProfileId(accountId: string): Promise<string>;

export type JarvisV3ActivationResult =
  | { state: 'ready'; migration: JarvisV3MigrationResult }
  | {
      state: 'degraded';
      accountId: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<JarvisV3ActivationResult>;
    };

export async function migrateLegacyJarvisIdentityForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3MigrationResult>;

export async function activateJarvisV3ForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3ActivationResult>;
```

The coordinator exports:

```ts
export type JarvisPersistenceState =
  | { status: 'activating'; accountId: string }
  | { status: 'ready'; accountId: string; profileId: string }
  | {
      status: 'degraded';
      accountId?: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<void>;
    };

export function createJarvisPersistenceCoordinator(input: {
  db: JarvisDexie;
  readIdentity: () => AccountIdentity | null;
  subscribeIdentity: (listener: () => void) => () => void;
}): {
  start(): () => void;
  retry(): Promise<void>;
  getState(): JarvisPersistenceState;
  subscribe(listener: () => void): () => void;
};
```

**Exact migration algorithm:**

Perform the protected Agent read, identity-revision verification/write,
profile verification/write, and migration-marker write within one
`db.transaction('rw', db.agents, db.jarvis_identity_revisions,
db.jarvis_profiles, async () => ...)`.

Inside that transaction:

1. Resolve a legacy row only with `isProtectedJarvisAgent(agent)`.
2. For `identity.source === 'local'`, inspect that row's complete
   `system_prompt`. For `identity.source === 'supabase'`, import no local
   prompt text and use `clean_default`.
3. Normalize and SHA-256 hash the complete legacy prompt through Task 2.
4. A known shipped hash produces `custom_instructions: ''` and
   `instruction_source: 'none'`.
5. An unknown local hash preserves the complete normalized text as
   `custom_instructions` with
   `instruction_source: 'legacy_user_extension'`.
6. Seed the deterministic protected identity revision exactly once.
7. Seed the deterministic default profile for the account exactly once.
8. Write `migration_version`, `migration_source`, optional
   `migration_source_prompt_hash`, and `migration_completed_at` on that profile
   in the same transaction.
9. A repeat with the same account, version, source, and source hash returns the
   existing rows with `migrated: false`.
10. Do not modify a legacy Agent row, any user-created agent, provider, model,
    tools, capabilities, memory scope, effort, temperature, or timestamp.

A different source hash for an already completed migration version fails
closed with `migration_conflict`; it never silently overwrites the profile.

`defaultJarvisProfileId(accountId)` rejects blank or non-canonical
leading/trailing-whitespace account IDs, SHA-256 hashes the exact UTF-8 account
ID bytes, returns `jprof_${hexDigest.slice(0, 24)}`, and never exposes the raw
account ID:

```ts
const identityRevisionId = `jident_jarvis_v${JARVIS_IDENTITY_VERSION}`;
const profileId = await defaultJarvisProfileId(identity.accountId);
const initialRevisionId = `${profileId}_r1`;
```

For every local `legacy_agent` source, set
`migration_source_prompt_hash` and result `migrationSourcePromptHash` to the
normalized complete prompt hash, including when it matches a known shipped
prompt. Only a preserved unknown extension also sets domain
`sourcePromptHash`/row `source_prompt_hash`. For `clean_default`, all source
hash fields are absent.

Before inserting, query every profile row for the account. More than one
active row is `profile_integrity_error`. An existing deterministic profile
with a different account, identity version, revision, or migration marker is
`migration_conflict`. If either the deterministic identity revision ID or
`[identity_id+version]` row exists, its complete mapped value must match the
protected revision or activation fails closed. Wrap Web Crypto work performed
while the transaction is open in `Dexie.waitFor(...)` so the transaction
cannot auto-commit during hashing.

The coordinator publishes `activating` before each activation attempt,
publishes only the matching account's `ready` result, and maps safe failure
categories to `degraded`. On identity change it synchronously discards the
previous ready/profile state before starting the next activation. `stop()`
unsubscribes and prevents late async publication; `retry()` reruns only the
current identity.

- [ ] **Step 1: Write the failing transactional migration tests**

In `jarvisV3.test.ts`, prove:

- a known local shipped prompt seeds empty custom instructions;
- an edited local prompt is preserved completely as
  `legacy_user_extension`;
- a signed-in cloud identity receives `clean_default` and never local text;
- only `builtin === true && slug === 'jarvis'` is selected and a user-created
  slug collision is ignored;
- the protected identity revision and one active profile seed once;
- the same migration marker/source hash is a no-op, while a changed hash is a
  typed conflict;
- a known shipped local prompt records only the migration source hash and
  leaves profile `sourcePromptHash` absent;
- deterministic profile IDs are stable per account, differ across accounts,
  and contain neither account ID;
- multiple active profiles and conflicting identity revisions fail closed;
- an injected failure after each write point leaves no identity, profile, or
  migration marker;
- the legacy Agent and every non-JARVIS row remain byte-for-byte unchanged.

- [ ] **Step 2: Write the failing coordinator-state tests**

In `persistenceCoordinator.test.ts`, prove:

- startup emits `activating → ready`;
- an account switch clears prior ready/profile state before activating the
  next account;
- database-open, migration, and missing-identity failures publish only their
  bounded `degraded` category plus a working retry;
- V2 UI availability is not conditioned on coordinator readiness; and
- stop unsubscribes and prevents a late activation result from publishing.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
```

Expected: FAIL because the migration and coordinator modules do not exist.

- [ ] **Step 4: Implement the atomic migration and activation boundary**

Implement the exact contracts and transaction above. Use deterministic IDs,
complete-row conflict checks, `Dexie.waitFor()` around hashing, and typed
fail-closed errors. Do not mount the coordinator or change `App.tsx`.

- [ ] **Step 5: Implement the account-aware coordinator**

Implement start, retry, state reads, subscriptions, account generation guards,
safe degraded mapping, and stop cleanup exactly as specified. A late result
from a prior account must be ignored.

- [ ] **Step 6: Verify the activation implementation**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
npm run typecheck
```

- [ ] **Step 7: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/db/migrations/jarvisV3.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/db/migrations/jarvisV3.ts' 'app/src/lib/db/migrations/jarvisV3.test.ts' 'app/src/lib/jarvis/persistenceCoordinator.ts' 'app/src/lib/jarvis/persistenceCoordinator.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): add transactional account activation"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the four files above. The
installer queries and whitespace checks produce no output.

## Task 9: Explicit Mappers, Local-Only Repositories, and Sync Interlock

**Files:**

- Create: `app/src/lib/db/jarvisMappers.ts`
- Create: `app/src/lib/db/jarvisMappers.test.ts`
- Create: `app/src/lib/db/jarvisRepositories.ts`
- Create: `app/src/lib/db/jarvisRepositories.test.ts`
- Modify: `app/src/lib/sync.ts`
- Modify: `app/src/lib/sync.test.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`

**Interfaces:**

- Consumes: Task 2 identity/profile contracts, Task 3 execution contracts, the
  V3 rows and injected `JarvisDexie` factory from Task 7, and migration
  metadata from Task 8.
- Produces: explicit domain↔row mappers, account-scoped repositories, a
  caller-stable run ID contract, standalone idempotent non-transition event
  appends, one atomic run-transition/event primitive for Task 18, profile
  revision persistence, and the local-only sync denylist.
- Boundary: Task 18 owns the legal transition matrix and must call
  `assertJarvisRunTransition()` before the atomic repository primitive.
  Task 9 contains no legal transition table.

**Exact mapper contract:**

```ts
export type JarvisProfileMigrationMetadata = {
  migrationVersion: 3;
  migrationSource: 'legacy_agent' | 'clean_default';
  migrationSourcePromptHash?: string;
  migrationCompletedAt: number;
};

export function toJarvisIdentityRevisionRow(
  value: JarvisIdentityRevision,
): JarvisIdentityRevisionRow;
export function fromJarvisIdentityRevisionRow(
  row: JarvisIdentityRevisionRow,
): JarvisIdentityRevision;

export function toJarvisProfileRow(input: {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
}): JarvisProfileRow;
export function fromJarvisProfileRow(row: JarvisProfileRow): {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
};

export function toJarvisRunRow(value: JarvisRun): JarvisRunRow;
export function fromJarvisRunRow(row: JarvisRunRow): JarvisRun;
export function toJarvisEventRow(value: JarvisEvent): JarvisEventRow;
export function fromJarvisEventRow(row: JarvisEventRow): JarvisEvent;
export function toJarvisApprovalRow(value: JarvisApproval): JarvisApprovalRow;
export function fromJarvisApprovalRow(row: JarvisApprovalRow): JarvisApproval;
export function toJarvisArtifactRow(value: JarvisArtifact): JarvisArtifactRow;
export function fromJarvisArtifactRow(row: JarvisArtifactRow): JarvisArtifact;
export function toJarvisModelSnapshotRow(value: JarvisModelSnapshot): JarvisModelSnapshotRow;
export function fromJarvisModelSnapshotRow(row: JarvisModelSnapshotRow): JarvisModelSnapshot;
export function toJarvisSourceRefRow(value: JarvisSourceRef): JarvisSourceRefRow;
export function fromJarvisSourceRefRow(row: JarvisSourceRefRow): JarvisSourceRef;
```

No UI or runtime file imports a `*Row` type. Mappers clone arrays and nested
records so a caller cannot mutate persisted state through shared references.

**Exact repository interfaces:**

```ts
export interface JarvisIdentityRepository {
  getVersion(identityId: 'jarvis', version: number): Promise<JarvisIdentityRevision | undefined>;
  putIfAbsent(revision: JarvisIdentityRevision): Promise<JarvisIdentityRevision>;
}

export interface JarvisProfileRepository {
  getById(accountId: string, profileId: string): Promise<JarvisProfile | undefined>;
  getActive(accountId: string): Promise<JarvisProfile | undefined>;
  putForAccount(
    accountId: string,
    input: {
      profile: JarvisProfile;
      migration: JarvisProfileMigrationMetadata;
    },
  ): Promise<JarvisProfile>;
  updateCustomInstructions(
    accountId: string,
    profileId: string,
    customInstructions: string,
  ): Promise<JarvisProfile>;
}

export type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

export interface JarvisRunRepository {
  createIdempotent(run: JarvisRun): Promise<JarvisRun>;
  getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  listByAccount(
    accountId: string,
    options?: { statuses?: JarvisRunStatus[]; limit?: number },
  ): Promise<JarvisRun[]>;
  compareAndAppendTransitionEvent(input: {
    accountId: string;
    runId: string;
    expectedStatus: JarvisRunStatus;
    nextStatus: JarvisRunStatus;
    updatedAt: number;
    completedAt?: number;
    event: JarvisRunTransitionEventInput;
  }): Promise<
    { applied: true; run: JarvisRun; event: JarvisEvent } | { applied: false; current: JarvisRun }
  >;
}

export type JarvisNonTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type'> & {
  type: Exclude<JarvisEvent['type'], 'run_state'>;
};

export interface JarvisEventRepository {
  appendIdempotent(
    accountId: string,
    runId: string,
    event: JarvisNonTransitionEventInput,
  ): Promise<JarvisEvent>;
  listByRun(
    accountId: string,
    runId: string,
    options?: { afterSeq?: number; limit?: number },
  ): Promise<JarvisEvent[]>;
}

export interface JarvisApprovalRepository {
  getById(accountId: string, approvalId: string): Promise<JarvisApproval | undefined>;
  putForRun(accountId: string, approval: JarvisApproval): Promise<JarvisApproval>;
}

export interface JarvisArtifactRepository {
  getById(accountId: string, artifactId: string): Promise<JarvisArtifact | undefined>;
  listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifact[]>;
  putForRun(accountId: string, artifact: JarvisArtifact): Promise<JarvisArtifact>;
}

export type JarvisRepositoryErrorCode =
  | 'account_scope_mismatch'
  | 'parent_run_not_found'
  | 'run_id_conflict'
  | 'event_idempotency_conflict'
  | 'transition_event_requires_atomic_run_update'
  | 'profile_integrity_error'
  | 'invalid_limit';

export class JarvisRepositoryError extends Error {
  readonly code: JarvisRepositoryErrorCode;
}

export function newJarvisProfileRevisionId(): string;

export type JarvisRepositories = {
  identity: JarvisIdentityRepository;
  profile: JarvisProfileRepository;
  run: JarvisRunRepository;
  event: JarvisEventRepository;
  approval: JarvisApprovalRepository;
  artifact: JarvisArtifactRepository;
};

export function createJarvisRepositories(
  db: JarvisDexie,
  dependencies?: {
    now?: () => number;
    newProfileRevisionId?: () => string;
  },
): JarvisRepositories;

export const jarvisIdentityRepo: JarvisIdentityRepository;
export const jarvisProfileRepo: JarvisProfileRepository;
export const jarvisRunRepo: JarvisRunRepository;
export const jarvisEventRepo: JarvisEventRepository;
export const jarvisApprovalRepo: JarvisApprovalRepository;
export const jarvisArtifactRepo: JarvisArtifactRepository;
```

All run/profile reads require an explicit `accountId`. Event, approval, and
artifact methods load and verify parent-run ownership before reading or
writing child rows. Run creation with `parentRunId` verifies that the parent
belongs to the same account. Limits are positive integers capped at 500.
`listByRun(accountId, runId, { afterSeq, limit })` returns ascending events
strictly after `afterSeq`. When `afterSeq` is omitted, it reverse-scans the
compound `[run_id+seq]` index for only the newest `limit` rows, then reverses
that bounded tail into ascending sequence order before returning it. It never
loads an unbounded run history.

`createIdempotent()` uses the caller-supplied `run.id`; the repository never
generates a replacement. An exact retry returns the existing row after
comparing the complete detached mapped value. A different row under the same
ID throws `run_id_conflict`.

`appendIdempotent()` is only for non-transition events. It rejects a runtime
`run_state` input, including one forced through a cast, with
`transition_event_requires_atomic_run_update`. In one Dexie transaction it:

1. verifies parent-run account ownership;
2. requires a non-empty `event.idempotencyKey`;
3. returns an existing event for an exact retry after comparing every caller
   field;
4. rejects a changed payload under the same run/key with
   `event_idempotency_conflict`;
5. obtains `seq = currentMax + 1` from the upper bound of `[run_id+seq]`; and
6. inserts one event row.

An exact retry preserves the original `seq` and `createdAt`; the same
idempotency key remains valid in another run.

`compareAndAppendTransitionEvent()` is the only repository primitive that
persists a run transition. Task 18 first loads the current run and calls
`assertJarvisRunTransition(current.status, input.nextStatus)`. Task 9 then
performs the compare, update, allocation, and insert in one
`db.transaction('rw', db.jarvis_runs, db.jarvis_events, async () => ...)`.

Inside that transaction:

1. load the run and verify `accountId`;
2. if `run.status !== expectedStatus`, return
   `{ applied: false, current }` without writing either table;
3. update the run to `nextStatus`, `updatedAt`, and the supplied
   `completedAt`;
4. allocate the next sequence from `[run_id+seq]`;
5. construct the event from `event` while forcing
   `runId`, `seq`, `type: 'run_state'`, and `status: nextStatus`; and
6. insert the event before committing.

An event constraint or injected insertion failure rolls back the run update.
The returned `{ applied: true }` values are detached domain objects from the
committed rows. The repository checks only expected-status equality; it does
not import, implement, or infer the Task 18 legality matrix.

`getActive()` reads every `[account_id+active] = [accountId, 1]` row and throws
`profile_integrity_error` rather than selecting arbitrarily when more than one
exists. `putForAccount()` verifies `profile.accountId === accountId`, prevents
a second active profile, and persists supplied migration metadata unchanged.

`newJarvisProfileRevisionId()` returns
`jprof_rev_${crypto.randomUUID()}`. `updateCustomInstructions()` normalizes
CRLF and lone CR to LF without trimming user text. Unchanged normalized text
is a no-op. A changed value uses the injected generator for a new revision ID,
sets `updatedAt` from the injected clock, sets `instructionSource` to `user`
or `none`, clears domain `sourcePromptHash`, and preserves every migration
marker.

The new repositories never import generic repository mutation helpers, sync
functions, or a transition table.

**Exact sync interlock:**

```ts
export const LOCAL_ONLY_SYNC_TABLES: ReadonlySet<string> = new Set([
  'jarvis_identity_revisions',
  'jarvis_profiles',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_approvals',
  'jarvis_artifacts',
] as const);

export function assertCloudSyncTableAllowed(table: string): void;
```

Call `assertCloudSyncTableAllowed()` from `enqueueMutation()`,
`buildCloudSyncRecord()`, and queue processing. Poisoned queued kernel rows are
marked `error` with safe code `local_only_table`; no payload is logged or
uploaded.

For the existing `agents` table, protected JARVIS sync payloads omit
`system_prompt`, and already-pending protected-agent rows are sanitized before
upload. Use Task 2's shared predicate, not slug-only matching. Non-JARVIS agent
sync and current connection serialization remain unchanged.

- [ ] **Step 1: Write the failing mapper tests**

In `jarvisMappers.test.ts`, round-trip every identity revision, profile plus
migration metadata, run, event, approval, artifact, model snapshot, and source
ref. Assert exact camelCase↔snake_case names and mutate each mapper result to
prove nested arrays/records are deeply detached.

- [ ] **Step 2: Write the failing repository and atomic-transition tests**

In `jarvisRepositories.test.ts`, prove:

- run/profile account isolation and cross-account child read/write rejection;
- parent-run creation rejects a parent owned by another account;
- caller-stable run ID exact retry and changed-payload conflict;
- standalone non-transition event sequences are `1, 2, 3`;
- a same-key exact retry returns one row/sequence, a changed payload rejects,
  and the same key in another run succeeds;
- standalone append rejects `run_state`;
- `compareAndAppendTransitionEvent()` updates the expected run and inserts one
  forced `run_state` event with the same committed transaction;
- a CAS miss returns the current run and changes neither the run nor event
  count;
- two concurrent expected-status attempts produce exactly one applied result
  and one transition event;
- duplicate-idempotency and injected event-insert failures roll back the run
  status, timestamps, completion field, and event count;
- the repository accepts a transition Task 18 may reject, proving there is no
  hidden legality table;
- `afterSeq` returns ascending later events, while omitted `afterSeq` returns
  only the newest bounded tail reordered ascending without an unbounded load;
- repository limits are positive and capped at 500;
- active-profile integrity failure, stable profile ID, fresh revision ID,
  line-ending normalization, no-op save, source-hash clearing, and migration
  marker preservation.

- [ ] **Step 3: Write the failing sync-interlock tests**

In `sync.test.ts` and `repositories.connection.test.ts`, prove:

- kernel repository writes create zero generic sync-queue rows;
- enqueue, cloud-record construction, and queue processing each reject every
  local-only table;
- poisoned pending kernel rows never reach Supabase and expose only
  `local_only_table`;
- protected built-in JARVIS payloads and already-pending mutations omit
  `system_prompt`;
- a user-created slug collision keeps its ordinary prompt payload; and
- current connection serialization remains green.

- [ ] **Step 4: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts src/lib/db/repositories.connection.test.ts
```

Expected: FAIL because the mapper/repository modules and local-only guards do
not exist.

- [ ] **Step 5: Implement explicit mappers and repositories**

Implement the exact interfaces and rules above using the injected
`JarvisDexie`. Keep row types below the repository boundary, compare complete
detached rows for idempotency, and implement the coordinated
`compareAndAppendTransitionEvent()` transaction without a legality table.

- [ ] **Step 6: Implement all three sync boundaries and Agent sanitization**

Add the exact denylist/assertion, fail closed at enqueue/build/process time,
sanitize pending protected-agent records, preserve collision-agent prompts,
and leave non-kernel sync behavior unchanged.

- [ ] **Step 7: Verify the repository and sync implementation**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts src/lib/db/repositories.connection.test.ts
npm run typecheck
```

- [ ] **Step 8: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/sync.ts' 'app/src/lib/sync.test.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/db/jarvisMappers.ts' 'app/src/lib/db/jarvisMappers.test.ts' 'app/src/lib/db/jarvisRepositories.ts' 'app/src/lib/db/jarvisRepositories.test.ts' 'app/src/lib/sync.ts' 'app/src/lib/sync.test.ts' 'app/src/lib/db/repositories.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(sync): keep kernel records and Jarvis prompts local"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eight files above. The
installer queries and whitespace checks produce no output.

## Task 10: Canonical Built-Ins and Profile-Aware Agent Editor

**Files:**

- Create: `app/src/lib/jarvis/builtinAgents.ts`
- Create: `app/src/lib/jarvis/builtinAgents.test.ts`
- Modify: `app/src/lib/db/seed.ts`
- Create: `app/src/lib/db/seed.test.ts`
- Modify: `app/src/lib/db/index.ts`
- Modify: `app/src/features/agents/registry.ts`
- Create: `app/src/features/agents/registry.test.ts`
- Modify: `app/src/features/agents/AgentManager.tsx`
- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify: `app/src/features/agents/AgentDetail.tsx`
- Create: `app/src/features/agents/AgentDetail.test.tsx`
- Modify: `app/src/types/agent.ts`

**Interfaces:**

- Consumes: `resolveAccountIdentity()` from Task 1,
  `isProtectedJarvisAgent()`, prompt normalization, and known shipped hashes
  from Task 2; activation/profile IDs from Task 8; and
  `jarvisProfileRepo` from Task 9.
- Produces: the only fresh-install/fallback built-in roster, a compatibility
  registry export, protected-JARVIS profile editing/detail behavior, and
  explicit later ownership for every remaining slug-only production branch.
- Preserves: every existing persisted agent on a non-fresh database and every
  non-JARVIS edit, clone, delete, model, provider, tool, capability, memory,
  effort, temperature, output-token, description, name, and color path.

**Exact canonical roster contract:**

`app/src/lib/jarvis/builtinAgents.ts` is the only roster definition. Preserve
the newer two-agent product decision exactly: `jarvis` and `coder`.

Move the currently shipped registry JARVIS prompt into this module as
`LEGACY_JARVIS_AGENT_COMPATIBILITY_PROMPT`. It is compatibility data for the
legacy `Agent.system_prompt` column, not Task 2's immutable identity text. Its
normalized SHA-256 must equal
`KNOWN_SHIPPED_JARVIS_PROMPT_HASHES.registry_ed91635_current`
(`935b8911bd134646475507d2363a79c2f5e0c232e4561285a647f07f60195bda`).
Move the current Coder prompt and both exact current registry definitions into
the same module; `registry.ts` retains no roster fields or prompt text.

```ts
export const BUILTIN_AGENT_ROSTER_VERSION = 1;

export function createBuiltinAgentRoster(input?: { now?: number; newId?: () => AgentId }): Agent[];

export function getBuiltinAgentDefinition(
  slug: 'jarvis' | 'coder',
): Omit<Agent, 'id' | 'created_at' | 'updated_at'>;
```

`app/src/features/agents/registry.ts` becomes only:

```ts
export {
  createBuiltinAgentRoster as getDefaultAgents,
  getBuiltinAgentDefinition,
} from '@/lib/jarvis/builtinAgents';
```

`seedIfEmpty()` calls `createBuiltinAgentRoster({ now: ts })` exactly once
inside the existing fresh-database transaction and bulk-adds that returned
array. Remove `DEFAULT_AGENT_SEEDS` and its re-export from
`app/src/lib/db/index.ts`; update its stale reference in
`app/src/types/agent.ts`. A non-fresh database never deletes, rewrites, or
backfills historical seven-agent, two-agent, or user-created rows.

**Protected predicate and collision rule:**

Every Task 10 branch imports Task 2's one shared predicate:

```ts
export function isProtectedJarvisAgent(agent: Pick<Agent, 'builtin' | 'slug'>): boolean {
  return agent.builtin === true && agent.slug === 'jarvis';
}
```

Task 10 does not define a second predicate. A user-created
`{ slug: 'jarvis', builtin: false }`, an agent with missing `builtin`, or a
built-in display name `Jarvis` under another slug is not protected.

The remaining current slug-only production sites are assigned, but not edited,
here:

- Task 1B owns `app/src/App.tsx` after its authoritative lock is released.
- Task 16B owns `app/src/components/layout/Inspector.tsx`,
  `app/src/features/chat/Composer.tsx`,
  `app/src/features/files/FilesPage.tsx`,
  `app/src/features/files/FileExplorerDialog.tsx`,
  `app/src/lib/ai/modelSelection.ts`, and `app/src/lib/ai/runtime.ts`.

Those later tasks import the same predicate and add collision regressions. No
slug-only JARVIS branch or second protected-agent predicate may remain after
Task 16B.

**Exact protected editor/detail behavior:**

- Resolve account scope only with
  `resolveAccountIdentity({ cloudSession, localUserId })`. Never use
  `local-unassigned` or fall back to local scope while a malformed cloud
  session is present.
- For protected JARVIS, load
  `jarvisProfileRepo.getActive(accountId)` only after canonical identity
  resolution.
- Label the textarea and detail card `Custom instructions`.
- The protected textarea value is `profile.customInstructions`, never
  `Agent.system_prompt`.
- Saving protected text calls:

```ts
jarvisProfileRepo.updateCustomInstructions(accountId, profile.id, text);
```

Task 9 creates a fresh profile `revisionId`, normalizes line endings, sets
`instructionSource` to `user` for non-empty text and `none` for empty text,
clears legacy domain `sourcePromptHash`, and preserves migration metadata.
An unchanged normalized value is a no-op.

- A protected-JARVIS `agentRepo.update()` patch must not contain
  `system_prompt`. Simultaneous non-prompt edits retain their existing Agent
  row path.
- For non-JARVIS agents, preserve the existing `System prompt` label,
  validation, persistence, clone, and delete behavior.
- On account change, synchronously clear the previous profile text before
  loading the next account.
- Guard async profile loads with account ID/request generation so a stale
  previous-account result cannot repopulate the editor or detail card.
- While profile state is not ready, disable only protected JARVIS custom
  instruction saving and show a bounded `Profile is still loading` state. The
  remainder of the V2 editor stays usable.
- `AgentDetail` reads protected JARVIS custom instructions from the active
  profile and retains legacy system-prompt display only for non-JARVIS agents.
- A user-created slug collision follows the ordinary non-JARVIS System prompt
  path and is never hidden or routed to profile persistence.

- [ ] **Step 1: Write the failing canonical-roster and seed tests**

In `builtinAgents.test.ts`, `registry.test.ts`, and `seed.test.ts`, prove:

- the canonical roster contains exactly `jarvis` and `coder` with the current
  shipped definitions;
- the compatibility JARVIS prompt normalizes to the frozen current hash;
- registry and seed return identical definitions apart from generated IDs and
  timestamps;
- protected built-in JARVIS is true, while false/missing `builtin`, display
  name-only, and user-created slug-collision cases are false;
- a fresh database seeds the canonical roster once; and
- a non-fresh database preserves historical and custom rows byte-for-byte.

- [ ] **Step 2: Write the failing profile-aware editor and detail tests**

In `AgentManager.test.tsx` and `AgentDetail.test.tsx`, prove:

- protected JARVIS displays `Custom instructions`;
- protected save updates the active profile/revision and never patches
  `system_prompt`;
- unchanged normalized text creates no revision;
- simultaneous non-prompt edits still update the Agent row;
- an account switch clears and reloads profile text;
- a stale previous-account load is ignored;
- profile loading disables only the protected prompt save and leaves the V2
  editor usable;
- a user-created slug collision uses ordinary `System prompt` editing;
- non-JARVIS save/clone/delete regressions remain green; and
- `AgentDetail` uses profile text only for protected JARVIS.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm --prefix app test -- src/lib/jarvis/builtinAgents.test.ts src/lib/db/seed.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
```

Expected: FAIL because the canonical roster module and new tests do not exist,
and the current protected editor still reads/writes `Agent.system_prompt`.

- [ ] **Step 4: Implement the canonical roster and fresh-database seed**

Move the exact two current registry definitions and compatibility prompts into
`builtinAgents.ts`, reduce `registry.ts` to the compatibility export, route
fresh seeding through `createBuiltinAgentRoster()`, and remove the stale
`DEFAULT_AGENT_SEEDS` API without modifying persisted databases.

- [ ] **Step 5: Implement profile-aware protected editing and detail display**

Use the exact account resolver, protected predicate, repository call, loading
state, generation guard, and Agent-row exclusions above. Preserve the complete
non-JARVIS lifecycle.

- [ ] **Step 6: Verify the implementation**

```powershell
npm --prefix app test -- src/lib/jarvis/builtinAgents.test.ts src/lib/db/seed.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
npm run typecheck
```

- [ ] **Step 7: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/builtinAgents.ts' 'app/src/lib/jarvis/builtinAgents.test.ts' 'app/src/lib/db/seed.ts' 'app/src/lib/db/seed.test.ts' 'app/src/lib/db/index.ts' 'app/src/features/agents/registry.ts' 'app/src/features/agents/registry.test.ts' 'app/src/features/agents/AgentManager.tsx' 'app/src/features/agents/AgentManager.test.tsx' 'app/src/features/agents/AgentDetail.tsx' 'app/src/features/agents/AgentDetail.test.tsx' 'app/src/types/agent.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/builtinAgents.ts' 'app/src/lib/jarvis/builtinAgents.test.ts' 'app/src/lib/db/seed.ts' 'app/src/lib/db/seed.test.ts' 'app/src/lib/db/index.ts' 'app/src/features/agents/registry.ts' 'app/src/features/agents/registry.test.ts' 'app/src/features/agents/AgentManager.tsx' 'app/src/features/agents/AgentManager.test.tsx' 'app/src/features/agents/AgentDetail.tsx' 'app/src/features/agents/AgentDetail.test.tsx' 'app/src/types/agent.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "refactor(agents): route builtin Jarvis through profiles"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the twelve files above. The
installer queries and whitespace checks produce no output.

## Task 18: Execution Journal State Machine and Abort Registry

**Files:**

- Create: `app/src/lib/jarvis/executionJournal/stateMachine.ts`
- Create: `app/src/lib/jarvis/executionJournal/stateMachine.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/journal.ts`
- Create: `app/src/lib/jarvis/executionJournal/journal.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/abortRegistry.ts`
- Create: `app/src/lib/jarvis/executionJournal/abortRegistry.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/index.ts`

**State-machine rule:**

All transitions pass through:

```ts
export function assertJarvisRunTransition(from: JarvisRunStatus, to: JarvisRunStatus): void;
```

Terminal statuses are immutable. Event sequence allocation and run transition
commit atomically. Idempotency keys prevent duplicate runs/events.

Abort registry:

```ts
export type CancellationDelivery = {
  delivered: boolean;
  verified: boolean;
  reason: 'queued_removed' | 'signal_delivered' | 'unsupported' | 'executor_missing';
};

export function registerRunAborter(
  runId: string,
  aborter: () => boolean | Promise<boolean>,
): () => void;

export function requestRunCancellation(
  accountId: string,
  runId: string,
): Promise<CancellationDelivery>;
```

**Step 1: Write failing tests**

Cover every legal/illegal transition, concurrent events, duplicate idempotency
keys, terminal immutability, crash recovery, registration cleanup, abort tree,
late abort, and cross-account access.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/executionJournal
```

**Step 3: Implement**

Use the v3 repositories; never write a second canonical lifecycle to
`JarvisTaskRun` or `ChatActivityEvent`.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/executionJournal
npm run typecheck
git add app/src/lib/jarvis/executionJournal
git diff --cached --check
git commit -m "feat(jarvis): add normalized execution journal"
```

## Task 11: Context, Capability, Immutable Envelope, and Retry Identity

**Files:**

- Create: `app/src/lib/jarvis/contextPack.ts`
- Create: `app/src/lib/jarvis/contextPack.test.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.test.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.test.ts`
- Modify: `app/src/lib/ai/context.ts`
- Modify: `app/src/lib/ai/context.test.ts`

**Interfaces:**

- Consumes Task 2's `JarvisIdentitySnapshot`,
  `JarvisProfileSnapshot`, and frozen profile factories.
- Consumes Task 3's `JarvisRequestEnvelope`, `JarvisContextPack`,
  `JarvisCapabilitySnapshot`, `JarvisModelSnapshot`,
  `JarvisOutputContract`, and validators.
- Consumes Task 4's two-stage `classifyJarvisSource()` path/content
  admission.
- Consumes Task 5's verified `JarvisEntitlementSnapshot`.
- Consumes Task 9's account-scoped repositories and local-only enforcement.
- Consumes Task 18's already-persisted `runId`, parent-run ownership, and
  journal transition primitives layered over Task 9's
  `compareAndAppendTransitionEvent()`. Task 11 never allocates a run ID.
- Produces `validateJarvisRequestAttempt()`, `buildJarvisContextPack()`,
  `createJarvisCapabilitySnapshot()`, and
  `createJarvisRequestEnvelope()` for Tasks 12, 16A, 16B, 21A, and 17.

**Exact contracts:**

```ts
export type JarvisRequestAttempt =
  | {
      kind: 'initial';
      requestId: string;
      runId: string;
    }
  | {
      kind: 'transport_retry';
      requestId: string;
      runId: string;
      previousRequestId: string;
      previousRunId: string;
    }
  | {
      kind: 'logical_retry';
      requestId: string;
      runId: string;
      previousRequestId: string;
      previousRunId: string;
    };

export interface JarvisContextCandidate {
  source: JarvisSourceRef;
  purpose: JarvisContextItem['purpose'];
  excerpt?: string;
  score?: number;
  explicitlyAttached: boolean;
  authorizedBody: boolean;
}

export interface JarvisContextPackInput {
  accountId: string;
  candidates: readonly JarvisContextCandidate[];
  maxChars: number;
}

export interface CapabilitySnapshotInput {
  capturedAt: number;
  tools: readonly JarvisCapabilityRef[];
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminals: readonly JarvisCapabilityRef[];
  agents: readonly JarvisCapabilityRef[];
  entitlements: JarvisEntitlementSnapshot;
}

export interface JarvisRequestInput {
  attempt: JarvisRequestAttempt;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  agent: JarvisRequestEnvelope['agent'];
  surface: JarvisRequestEnvelope['surface'];
  interactionMode: JarvisRequestEnvelope['interactionMode'];
  responseModeHint?: JarvisResponseMode;
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  model: JarvisModelSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  userText: string;
  messageHistory: readonly LLMMessage[];
  createdAt: number;
}

export function validateJarvisRequestAttempt(
  attempt: JarvisRequestAttempt,
): Readonly<{ requestId: string; runId: string }>;

export async function buildJarvisContextPack(
  input: JarvisContextPackInput,
): Promise<Readonly<JarvisContextPack>>;

export function createJarvisCapabilitySnapshot(
  input: CapabilitySnapshotInput,
): Readonly<JarvisCapabilitySnapshot>;

export async function createJarvisRequestEnvelope(
  input: JarvisRequestInput,
): Promise<Readonly<JarvisRequestEnvelope>>;
```

**Request-attempt rules:**

- `requestId`, `runId`, and all previous IDs are non-empty.
- `initial` accepts Task 18's persisted run and a fresh request ID.
- A transport retry requires a new request ID and the same run ID:

```ts
attempt.requestId !== attempt.previousRequestId;
attempt.runId === attempt.previousRunId;
```

- A logical retry requires both a new request ID and a new run ID:

```ts
attempt.requestId !== attempt.previousRequestId;
attempt.runId !== attempt.previousRunId;
```

- Invalid combinations throw a typed local `JarvisRequestAttemptError` before
  provider dispatch.
- The envelope contains only the current attempt's IDs. Previous IDs are
  journal relations, not hidden prompt fields.
- Task 18 must return the persisted run before
  `createJarvisRequestEnvelope()` is called. The builder has no run-ID
  generator import.

**Context and capability rules:**

- Explicit user attachments sort ahead of retrieved candidates.
- Within the same class, sort by descending finite score, then
  `source.observedAt` descending, then `source.id` ascending.
- Every candidate account must match `input.accountId`.
- Re-run Task 4 source admission before including an excerpt.
- `authorizedBody: false` retains only the source reference and adds no body.
- Secret/restricted exclusions contain the source ref plus a safe category,
  never the rejected body.
- External/retrieved context stays `trust: 'external_untrusted'` and cannot
  become a preference or authority layer.
- Truncation is deterministic, never splits a UTF-16 surrogate pair, and
  records the source in `exclusions` when no excerpt character fits.
- Capability arrays are copied, sorted by stable ID, and frozen.
- Capability state uses only
  `available | connected | authenticated | degraded | unavailable | planned`.
- A catalog entry alone cannot become `connected` or `authenticated`.
- Entitlements are copied from Task 5's verified snapshot without inference.

**Deep-freeze rule:**

Use one cycle-safe recursive freezer owned by `requestEnvelope.ts`. Do not
freeze caller-owned objects in place. Build detached copies, then freeze:

- the envelope and `agent`;
- identity, profile, model, capability, entitlement, and output snapshots;
- capability arrays and every capability object;
- context, items, exclusions, budget, every source ref, and every item;
- `messageHistory`, every message, content-part array, and every content part;
- every nested plain array/object reachable from model capabilities.

A strict-mode mutation attempt must throw or leave the value unchanged.

- [ ] **Step 1: Write the focused failing tests**

In `requestEnvelope.test.ts`, table-test initial IDs; transport retry with a
new request and same run; logical retry with a new request and new run; reused
request IDs; transport retry with a different run; logical retry with the same
run; missing IDs; the Task 18 run supplied exactly once; every nested
`Object.isFrozen()` assertion; caller inputs remaining unfrozen and unchanged;
mutation attempts against arrays, message parts, capabilities, source refs,
profile text, and model flags; and validator failure preventing return.

In `contextPack.test.ts`, cover explicit-first ordering, deterministic ties,
account mismatch, body-not-authorized behavior, stale refs, secret path and
content exclusion, stable truncation, and untrusted-authority isolation.

In `capabilitySnapshot.test.ts`, cover every capability state, catalog-only
`planned/available`, signed-out/unavailable connectors, exact model/provider
state, entitlement provenance, detached copies, and deep freezing.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts src/lib/ai/context.test.ts
```

Expected: FAIL because the three new modules cannot be resolved.

- [ ] **Step 3: Implement the minimal complete boundary**

Implement the exact contracts, attempt validation, deterministic context
ranking/budgeting, verified capability copy, detached deep-freeze behavior,
and the existing AI-context adapter. Preserve the non-JARVIS context path.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts src/lib/ai/context.test.ts
npm run typecheck
```

Expected: the focused suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/contextPack.ts' 'app/src/lib/jarvis/contextPack.test.ts' 'app/src/lib/jarvis/capabilitySnapshot.ts' 'app/src/lib/jarvis/capabilitySnapshot.test.ts' 'app/src/lib/jarvis/requestEnvelope.ts' 'app/src/lib/jarvis/requestEnvelope.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/contextPack.ts' 'app/src/lib/jarvis/contextPack.test.ts' 'app/src/lib/jarvis/capabilitySnapshot.ts' 'app/src/lib/jarvis/capabilitySnapshot.test.ts' 'app/src/lib/jarvis/requestEnvelope.ts' 'app/src/lib/jarvis/requestEnvelope.test.ts' 'app/src/lib/ai/context.ts' 'app/src/lib/ai/context.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): build immutable request envelopes"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eight files above. The
installer and whitespace queries produce no output.

## Task 12: Pure Protected Prompt Compiler with Defense in Depth

**Files:**

- Create: `app/src/lib/jarvis/promptCompiler.ts`
- Create: `app/src/lib/jarvis/promptCompiler.test.ts`
- Create: `app/src/lib/jarvis/promptCompiler.performance.test.ts`
- Modify: `app/src/lib/jarvis/promptLayers.ts`
- Modify: `app/src/lib/jarvis/promptLayers.test.ts`

**Interfaces:**

- Consumes only the frozen Task 11 `JarvisRequestEnvelope`, Task 3 domain
  contracts, Task 2 protected-agent predicate and immutable policy exports,
  and Task 4 pure source-classification function.
- Produces one deterministic `CompiledJarvisPrompt` for Task 13 transport and
  Tasks 16A/16B/21A/17 runtime consumers.
- Imports no Zustand store, repository, router, provider, UI, browser, auth,
  agent getter, or All About Me getter.

**Exact compiler surface and errors:**

```ts
export const JARVIS_ALL_ABOUT_ME_SOURCE_ID = 'jarvis:all-about-me';

export type JarvisPromptCompilationErrorCode =
  | 'not_protected_jarvis'
  | 'secret_source'
  | 'duplicate_immutable_layer'
  | 'invalid_envelope'
  | 'prompt_budget_exceeded';

export class JarvisPromptCompilationError extends Error {
  readonly code: JarvisPromptCompilationErrorCode;

  constructor(code: JarvisPromptCompilationErrorCode, message: string) {
    super(message);
    this.name = 'JarvisPromptCompilationError';
    this.code = code;
  }
}

export function compileJarvisPrompt(
  envelope: Readonly<JarvisRequestEnvelope>,
): Readonly<CompiledJarvisPrompt>;
```

**Protected-agent gate:**

Compilation begins with:

```ts
if (!isProtectedJarvisAgent(envelope.agent)) {
  throw new JarvisPromptCompilationError(
    'not_protected_jarvis',
    'The protected JARVIS compiler is unavailable for this agent.',
  );
}
```

The predicate remains exactly:

```ts
agent.builtin === true && agent.slug === 'jarvis';
```

A user-created agent whose slug is `jarvis` fails before layer construction,
hashing, diagnostics, or provider dispatch.

**Compiler-owned secret defense:**

Before rendering context:

1. reject every source with `sensitivity === 'secret'`;
2. re-run `classifyJarvisSource()` on every included excerpt using its safe
   URI/label, `kind: 'text'`, the appropriate context channel, and
   `contentSample: item.excerpt`;
3. reject a denied `secret_filename`, `credential_path`, or `secret_content`;
4. never put the rejected excerpt, path, token fragment, or source body in the
   thrown error or diagnostics.

Restricted sources remain excluded unless a later explicit-consent contract
has already converted them to an allowed private context item. This task does
not invent that consent flow.

**Exact layer order and duplicate rules:**

Build exactly these seven layer IDs in order:

```ts
[
  'immutable-security',
  'immutable-identity',
  'capability-policy',
  'user-approved-preference',
  'turn-policy',
  'untrusted-context',
  'output-contract',
];
```

Map them to Task 3's `PromptAuthority` values in the same order.

- Immutable security appears once.
- Immutable identity/response contract appears once.
- `profile.customInstructions` appears once in
  `user-approved-preference`.
- Context items whose source ID is `JARVIS_ALL_ABOUT_ME_SOURCE_ID` are
  deduplicated by source ID and content hash, then injected exactly once in
  the same preference layer.
- Duplicate All About Me candidates are recorded in
  `diagnostics.omittedSourceRefs`; their text is not repeated.
- A second immutable security or identity layer throws
  `duplicate_immutable_layer`.
- Untrusted source text is fenced and labelled as data. It cannot emit a new
  authority-layer header.
- Budgeting and hash input are deterministic.
- `systemText` is produced from frozen layer copies.
- Diagnostics contain only layer IDs, character counts, truncation flags,
  source IDs, and hashes.

**No-global-read gate:**

`promptCompiler.ts` and its transitive production imports may not import:

```text
@/stores/*
@/lib/db/*
@/features/*
@/lib/ai/router
@/lib/ai/providers/*
```

Tests replace auth, agent, All About Me, and repository getters with functions
that throw. Compilation must still succeed from the supplied envelope.

`assembleJarvisPromptLayers()` becomes a compatibility wrapper over
`compileJarvisPrompt()` only for callers that already supply a complete
envelope. It cannot retain a second universal core or read user state.

- [ ] **Step 1: Write the focused failing tests**

Cover protected built-in acceptance; user-created slug collision and missing
built-in rejection; all seven layers in exact order; stable hashes across
detached equal inputs; model changes not altering immutable identity text;
secret sensitivity and secret-shaped ordinary text rejection; safe errors and
diagnostics; duplicate immutable-layer rejection; All About Me absent, once,
and duplicated; profile custom instructions exactly once; context unable to
add authority; no global getter called; and the compatibility wrapper using
the canonical compiler text.

In `promptCompiler.performance.test.ts`, build a representative detached
ordinary-chat input with 24 context items and 20 history messages. Warm the
path, then measure at least 200 iterations of:

```ts
await createJarvisRequestEnvelope(input);
compileJarvisPrompt(envelope);
```

Exclude context retrieval and provider I/O. Sort durations, assert p95 below
`25` milliseconds, and print only iteration count, sanitized character
counts, and p95.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptCompiler.performance.test.ts src/lib/jarvis/promptLayers.test.ts
```

Expected: FAIL because `promptCompiler.ts` does not exist.

- [ ] **Step 3: Implement the pure compiler and compatibility wrapper**

Implement the protected gate, compiler-owned secret admission, exact seven
layers, deterministic budgets/hashes, exactly-once profile and All About Me
context, frozen safe diagnostics, and wrapper. Do not add a store/repository/
router/provider/UI/browser read.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptCompiler.performance.test.ts src/lib/jarvis/promptLayers.test.ts
npm run typecheck
```

Expected: the focused correctness/performance suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/promptCompiler.ts' 'app/src/lib/jarvis/promptCompiler.test.ts' 'app/src/lib/jarvis/promptCompiler.performance.test.ts' 'app/src/lib/jarvis/promptLayers.ts' 'app/src/lib/jarvis/promptLayers.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/promptCompiler.ts' 'app/src/lib/jarvis/promptCompiler.test.ts' 'app/src/lib/jarvis/promptCompiler.performance.test.ts' 'app/src/lib/jarvis/promptLayers.ts' 'app/src/lib/jarvis/promptLayers.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): compile one protected prompt contract"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the five files above. The
installer and whitespace queries produce no output.

## Task 13: Exact Provider Prompt Transport for Every Adapter

**Files:**

- Create: `app/src/lib/ai/providerPromptTransport.ts`
- Create: `app/src/lib/ai/providerPromptTransport.test.ts`
- Modify: `app/src/lib/ai/types.ts`
- Modify: `app/src/lib/ai/router.ts`
- Modify: `app/src/lib/ai/router.test.ts`
- Modify: `app/src/lib/ai/router.connection.test.ts`
- Modify: `app/src/lib/ai/adapters/types.ts`
- Modify: `app/src/lib/ai/adapters/catalog.ts`
- Modify: `app/src/lib/ai/adapters/catalog.test.ts`
- Modify: `app/src/lib/ai/adapters/nativeCatalog.ts`
- Modify: `app/src/lib/ai/adapters/registry.test.ts`
- Modify: `app/src/lib/ai/adapters/cliBridge.ts`
- Modify: `app/src/lib/ai/adapters/cliParsers.test.ts`
- Modify: `app/src/lib/ai/adapters/claude.ts`
- Modify: `app/src/lib/ai/adapters/codex.ts`
- Modify: `app/src/lib/ai/adapters/copilot.ts`
- Modify: `app/src/lib/ai/adapters/gemini.ts`
- Modify: `app/src/lib/ai/adapters/opencode.ts`
- Modify: `app/src/lib/ai/adapters/qwen.ts`
- Modify: `app/src/lib/ai/providers/anthropic.ts`
- Modify: `app/src/lib/ai/providers/google.ts`
- Modify: `app/src/lib/ai/providers/groq.ts`
- Modify: `app/src/lib/ai/providers/mock.ts`
- Modify: `app/src/lib/ai/providers/mock.test.ts`
- Modify: `app/src/lib/ai/providers/ollama.ts`
- Modify: `app/src/lib/ai/providers/ollama.test.ts`
- Modify: `app/src/lib/ai/providers/openai.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.test.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`

Do not stage `app/src/lib/ai/adapters`, `app/src/lib/ai/providers`, or another
directory pathspec.

**Interfaces:**

- Consumes Task 12's frozen `CompiledJarvisPrompt`.
- Extends every registered provider connection and CLI definition with one
  explicit strategy.
- Produces `buildProviderPromptTransport()` and protected-router inputs for
  Tasks 16A, 16B, 21A, and 17.

**Exact strategy vocabulary:**

```ts
export type JarvisPromptTransportStrategy = 'native-system' | 'prefixed-preamble' | 'unsupported';
```

Add this required field to catalog/registry connection descriptors:

```ts
export interface ProviderConnection {
  // existing fields remain
  promptTransport: JarvisPromptTransportStrategy;
}
```

Add the same required declaration to every external CLI definition:

```ts
export interface CliProviderDefinition {
  // existing fields remain
  promptTransport: 'prefixed-preamble' | 'unsupported';
}
```

The catalog rejects registration when an external connection and its adapter
definition disagree.

**Current connection matrix:**

Pin this table in `providerPromptTransport.test.ts`:

| Connection ID           | Strategy            |
| ----------------------- | ------------------- |
| `openai-codex`          | `prefixed-preamble` |
| `openai-api`            | `native-system`     |
| `anthropic-claude-code` | `prefixed-preamble` |
| `anthropic-api`         | `native-system`     |
| `google-gemini-cli`     | `prefixed-preamble` |
| `google-gemini-api`     | `native-system`     |
| `google-vertex`         | `native-system`     |
| `github-copilot-cli`    | `prefixed-preamble` |
| `xai-api`               | `native-system`     |
| `deepseek-api`          | `native-system`     |
| `zai-api`               | `native-system`     |
| `qwen-code`             | `prefixed-preamble` |
| `qwen-api`              | `native-system`     |
| `ollama-local`          | `native-system`     |
| `opencode-cli`          | `prefixed-preamble` |

Synthetic unknown/custom connections use `unsupported` until an explicit
strategy is registered.

**Exact construction contract:**

```ts
export type ProviderPromptTransport =
  | {
      strategy: 'native-system';
      systemPrompt: string;
      messages: readonly LLMMessage[];
      compiledHash: string;
    }
  | {
      strategy: 'prefixed-preamble';
      prompt: string;
      compiledHash: string;
    };

export class UnsupportedPromptTransportError extends Error {
  readonly code = 'unsupported_prompt_transport';
  readonly connectionId: string;

  constructor(connectionId: string) {
    super(`The selected connection cannot preserve the protected prompt contract.`);
    this.name = 'UnsupportedPromptTransportError';
    this.connectionId = connectionId;
  }
}

export function buildProviderPromptTransport(input: {
  compiled: Readonly<CompiledJarvisPrompt>;
  connection: Readonly<ProviderConnection>;
  messages: readonly LLMMessage[];
}): Readonly<ProviderPromptTransport>;
```

For `native-system`:

- `systemPrompt` equals `compiled.systemText` exactly;
- message roles/content stay semantically unchanged;
- providers use their real system/developer field;
- no system text is duplicated into a user message.

For `prefixed-preamble`, create one deterministic string:

```text
<VIBESPACE_SYSTEM_CONTRACT schema="1" sha256="<compiled.promptHash>">
<compiled.systemText>
</VIBESPACE_SYSTEM_CONTRACT>
<VIBESPACE_MESSAGES>
<deterministically serialized messages>
</VIBESPACE_MESSAGES>
```

- Preserve Unicode and line endings after compiler normalization.
- Pass the complete string as one prompt through stdin when the CLI supports
  stdin.
- Gemini, Copilot, and Qwen keep the complete prompt as one literal argv
  element where their CLI contract requires `-p`.
- Never concatenate a shell command.
- Never put secrets, API keys, auth state, or connection credentials in the
  preamble.

For `unsupported`, throw `UnsupportedPromptTransportError` before provider
detection, authentication probe, process spawn, network fetch, or usage
mutation.

**Router and cancellation rules:**

`runAgent()` accepts canonical compiled input only for protected JARVIS kernel
dispatch:

```ts
compiledPrompt?: Readonly<CompiledJarvisPrompt>;
requestId?: string;
```

- If `compiledPrompt` exists, `requestId` is required and the selected
  connection's declared strategy is used.
- Preserve the exact connection ID, provider ID, model ID, temperature, output
  token limit, working directory, and message history.
- Forward the exact caller `AbortSignal` to native fetch/provider code and the
  Tauri CLI bridge.
- Abort before send causes no provider/adapter call.
- Mid-stream abort remains an `AbortError`; it is never wrapped as a provider
  failure or retried as another logical execution.
- A connection advertising cancellation proves the signal reaches its
  provider/bridge. A connection without cancellation reports that truthfully
  in its capability snapshot.
- Non-JARVIS calls without `compiledPrompt` retain existing behavior.

- [ ] **Step 1: Write the table-driven failing construction tests**

For every row in `PROVIDER_CONNECTIONS`, assert exact strategy; connection,
provider, model, and mode preservation; compiled hash preservation; protected
contract transmission; user-message preservation; unsupported fail-closed
behavior; and advertised cancellation forwarding.

Also cover quotes, Unicode, multiline text, option-looking values, PowerShell
syntax, shell metacharacters, and prompt-injection-like text; no raw command
construction; exact stdin/argv behavior for all six external adapters; native
request construction for OpenAI, Anthropic, Google/Vertex, OpenAI-compatible,
Ollama, Groq, and mock; updated persisted connection fixtures; an abort racing
CLI registration; and no unsupported fallback to mutable
`Agent.system_prompt`.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts src/lib/ai/providers/mock.test.ts src/lib/ai/providers/ollama.test.ts src/lib/ai/providers/openai-compatible.test.ts src/lib/db/repositories.connection.test.ts
```

Expected: FAIL because the transport module is missing and current external
CLI construction drops `systemPrompt`.

- [ ] **Step 3: Implement every declared transport and cancellation path**

Add the required strategy to every connection/adapter, reject mismatches and
unsupported routes before side effects, construct exact native or preamble
requests, preserve selection/options/history, and propagate the same abort
signal without changing non-JARVIS calls.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts src/lib/ai/providers/mock.test.ts src/lib/ai/providers/ollama.test.ts src/lib/ai/providers/openai-compatible.test.ts src/lib/db/repositories.connection.test.ts
npm run typecheck
```

Expected: the full construction matrix and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/ai/providerPromptTransport.ts' 'app/src/lib/ai/providerPromptTransport.test.ts' 'app/src/lib/ai/types.ts' 'app/src/lib/ai/router.ts' 'app/src/lib/ai/router.test.ts' 'app/src/lib/ai/router.connection.test.ts' 'app/src/lib/ai/adapters/types.ts' 'app/src/lib/ai/adapters/catalog.ts' 'app/src/lib/ai/adapters/catalog.test.ts' 'app/src/lib/ai/adapters/nativeCatalog.ts' 'app/src/lib/ai/adapters/registry.test.ts' 'app/src/lib/ai/adapters/cliBridge.ts' 'app/src/lib/ai/adapters/cliParsers.test.ts' 'app/src/lib/ai/adapters/claude.ts' 'app/src/lib/ai/adapters/codex.ts' 'app/src/lib/ai/adapters/copilot.ts' 'app/src/lib/ai/adapters/gemini.ts' 'app/src/lib/ai/adapters/opencode.ts' 'app/src/lib/ai/adapters/qwen.ts' 'app/src/lib/ai/providers/anthropic.ts' 'app/src/lib/ai/providers/google.ts' 'app/src/lib/ai/providers/groq.ts' 'app/src/lib/ai/providers/mock.ts' 'app/src/lib/ai/providers/mock.test.ts' 'app/src/lib/ai/providers/ollama.ts' 'app/src/lib/ai/providers/ollama.test.ts' 'app/src/lib/ai/providers/openai.ts' 'app/src/lib/ai/providers/openai-compatible.ts' 'app/src/lib/ai/providers/openai-compatible.test.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/ai/providerPromptTransport.ts' 'app/src/lib/ai/providerPromptTransport.test.ts' 'app/src/lib/ai/types.ts' 'app/src/lib/ai/router.ts' 'app/src/lib/ai/router.test.ts' 'app/src/lib/ai/router.connection.test.ts' 'app/src/lib/ai/adapters/types.ts' 'app/src/lib/ai/adapters/catalog.ts' 'app/src/lib/ai/adapters/catalog.test.ts' 'app/src/lib/ai/adapters/nativeCatalog.ts' 'app/src/lib/ai/adapters/registry.test.ts' 'app/src/lib/ai/adapters/cliBridge.ts' 'app/src/lib/ai/adapters/cliParsers.test.ts' 'app/src/lib/ai/adapters/claude.ts' 'app/src/lib/ai/adapters/codex.ts' 'app/src/lib/ai/adapters/copilot.ts' 'app/src/lib/ai/adapters/gemini.ts' 'app/src/lib/ai/adapters/opencode.ts' 'app/src/lib/ai/adapters/qwen.ts' 'app/src/lib/ai/providers/anthropic.ts' 'app/src/lib/ai/providers/google.ts' 'app/src/lib/ai/providers/groq.ts' 'app/src/lib/ai/providers/mock.ts' 'app/src/lib/ai/providers/mock.test.ts' 'app/src/lib/ai/providers/ollama.ts' 'app/src/lib/ai/providers/ollama.test.ts' 'app/src/lib/ai/providers/openai.ts' 'app/src/lib/ai/providers/openai-compatible.ts' 'app/src/lib/ai/providers/openai-compatible.test.ts' 'app/src/lib/db/repositories.connection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "fix(ai): preserve protected prompts across transports"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirty files above. The
installer and whitespace queries produce no output.

## Task 16A: Shadow Compilation and the Three-State Runtime Gate

**Prerequisites:**

- Task 1B has landed after formal `app/src/App.tsx` lock handoff.
- Tasks 2-13 and Task 18 are complete.
- Secret-source, entitlement, Browser Operator, private-sync, and unsafe
  prompt-transport interlocks are active.

**Files:**

- Create: `app/src/lib/jarvis/kernelMode.ts`
- Create: `app/src/lib/jarvis/kernelMode.test.ts`
- Create: `app/src/lib/jarvis/shadowCompilation.ts`
- Create: `app/src/lib/jarvis/shadowCompilation.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/ai/runtimeSafety.test.ts`

**Interfaces:**

- Consumes Task 18's persisted-run creation and Task 9's atomic
  `compareAndAppendTransitionEvent()` primitive.
- Consumes Task 11's immutable envelope builder, Task 12's pure compiler, and
  Task 13's prompt-transport support check.
- Produces the gate and observational shadow path that Task 16B later converts
  to canonical kernel dispatch.
- Does not own canonical assistant messages, response envelopes, approvals,
  artifacts, or the default switch to `kernel`.

**Exact gate:**

```ts
export type JarvisKernelMode = 'legacy' | 'shadow' | 'kernel';

export const DEFAULT_JARVIS_KERNEL_MODE: JarvisKernelMode = 'shadow';

export class JarvisKernelModeError extends Error {
  readonly code: 'invalid_kernel_mode' | 'kernel_mode_not_ready';

  constructor(code: 'invalid_kernel_mode' | 'kernel_mode_not_ready', message: string) {
    super(message);
    this.name = 'JarvisKernelModeError';
    this.code = code;
  }
}

export function resolveJarvisKernelMode(override?: JarvisKernelMode): JarvisKernelMode;
```

The mode override is an internal `RuntimeOptions.jarvisKernelMode` test and
rollback input. It is not accepted from a `jarvis:send` event, model output,
chat message, URL, or local prompt.

**Shadow contracts and safe diagnostics:**

```ts
export interface JarvisShadowLayerDiagnostic {
  id: string;
  authority: PromptAuthority;
  charCount: number;
  truncated: boolean;
  contentHash: string;
}

export interface JarvisShadowDiagnostic {
  mode: 'shadow';
  requestId: string;
  runId: string;
  promptHash?: string;
  layers: readonly JarvisShadowLayerDiagnostic[];
  errorCategory?: string;
  durationMs: number;
}

export interface JarvisShadowCompilationDeps {
  createPersistedRun(input: JarvisRunCreateInput): Promise<JarvisRun>;
  buildEnvelope(input: JarvisRequestInput): Promise<Readonly<JarvisRequestEnvelope>>;
  compilePrompt(envelope: Readonly<JarvisRequestEnvelope>): Readonly<CompiledJarvisPrompt>;
  recordDiagnostic(diagnostic: JarvisShadowDiagnostic): void;
  now(): number;
}

export interface JarvisShadowTurnInput {
  run: JarvisRunCreateInput;
  attempt: Extract<JarvisRequestAttempt, { kind: 'initial' }>;
  request: Omit<JarvisRequestInput, 'attempt'>;
}

export async function compileJarvisShadowTurn(
  input: JarvisShadowTurnInput,
  deps: JarvisShadowCompilationDeps,
): Promise<
  | {
      ok: true;
      envelope: Readonly<JarvisRequestEnvelope>;
      compiled: Readonly<CompiledJarvisPrompt>;
    }
  | {
      ok: false;
      requestId: string;
      runId: string;
      errorCategory: string;
    }
>;
```

Task 18 creates the run first. Shadow compilation never allocates an
unpersisted run ID.

Diagnostics may contain only request/run IDs; identity/profile revision IDs;
layer IDs; character counts; truncation flags; content/prompt hashes;
sanitized duration; and a safe error category. They may not contain prompt
text, user text, custom instructions, source excerpts, file paths, provider
credentials, approval parameters, or model reasoning.

**Mode behavior:**

`legacy`:

- run the current non-kernel request/response path;
- do not build a shadow envelope;
- still enforce Task 4 source admission, Task 5 entitlements, Task 6 Browser
  Operator quarantine, Task 9 private-sync guard, and Task 13 prompt-transport
  support.

`shadow`:

- only for protected built-in JARVIS, create the canonical run, build/validate
  the envelope, compile the prompt, and record safe diagnostics;
- dispatch the current legacy request and use the current legacy response;
- do not send the compiled prompt to the provider;
- do not write a canonical kernel assistant response or artifact;
- after successful shadow compilation, mirror the real legacy provider
  running/completed/failed/cancelled outcome through Task 18 and Task 9's
  `compareAndAppendTransitionEvent()` primitive so no nonterminal shadow run
  is orphaned;
- a compiler/shape defect transitions the shadow run to `failed`, records a
  safe category, and still lets the separate legacy dispatch continue;
- an independent safety-interlock denial fails closed and does not continue;
- cancellation signal delivery alone remains nonterminal until an owning
  executor verifies the terminal state.

`kernel` in Task 16A:

- resolve as a valid mode;
- fail with `kernel_mode_not_ready` before provider dispatch because Task 16B
  has not installed the canonical dispatcher.

Non-JARVIS agents skip shadow compilation and preserve their existing path in
all modes.

**Interlocks stay outside the gate:**

```ts
export interface JarvisRuntimeInterlockPort {
  assertCanonicalAccountIdentity(): void;
  assertSourcesAdmitted(): void;
  assertEntitlementAllowsRequestedCapability(): void;
  assertBrowserOperatorAvailableOrQuarantined(): void;
  assertPrivateSyncBoundary(): void;
  assertSelectedPromptTransportSupported(): void;
}

export interface RuntimeOptions {
  // existing options remain
  jarvisKernelMode?: JarvisKernelMode;
  jarvisInterlocks?: JarvisRuntimeInterlockPort;
  jarvisShadow?: JarvisShadowCompilationDeps;
}
```

Call every port method before the mode branch. Production boot supplies the
real interlock port; focused tests inject spies/failures. Rollback changes
dispatch ownership only and cannot disable or short-circuit these checks.

- [ ] **Step 1: Write the focused failing tests**

Cover the `shadow` default; explicit `legacy`, `shadow`, and `kernel`;
invalid-mode rejection; legacy dispatch once with no shadow build; shadow
compile once plus legacy dispatch once; allowlisted diagnostics only; shadow
failure recording a safe category while legacy still dispatches; every
interlock denial preventing dispatch in `legacy` and `shadow`; unsupported
transport and private-sync denial in every mode; `kernel_mode_not_ready` with
zero provider calls; non-JARVIS and user-created slug collisions skipping
shadow; canonical App identity; no `local-unassigned`; atomic shadow terminal
mirroring; and delivered-but-unverified cancellation remaining nonterminal.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelMode.test.ts src/lib/jarvis/shadowCompilation.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts
```

Expected: FAIL because the gate and shadow modules do not exist.

- [ ] **Step 3: Implement observational shadow compilation**

Implement the exact gate, persisted-run-first shadow builder, safe diagnostic
allowlist, independent interlock port, legacy/shadow/kernel behavior, and
atomic terminal mirroring. Keep the default `shadow`; do not persist canonical
assistant output or dispatch a compiled prompt.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/kernelMode.test.ts src/lib/jarvis/shadowCompilation.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts
npm run typecheck
```

Expected: the gate/shadow/runtime safety suite and root typecheck pass, with
the production default still `shadow`.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/shadowCompilation.ts' 'app/src/lib/jarvis/shadowCompilation.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/shadowCompilation.ts' 'app/src/lib/jarvis/shadowCompilation.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): add safe shadow compilation"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the seven files above. The
installer and whitespace queries produce no output, and the default remains
`shadow`.

## Task 14: Conditional Prose Repair and Verified Response Truth

**Files:**

- Create: `app/src/lib/jarvis/response/tokenizer.ts`
- Create: `app/src/lib/jarvis/response/tokenizer.test.ts`
- Create: `app/src/lib/jarvis/response/modeClassifier.ts`
- Create: `app/src/lib/jarvis/response/modeClassifier.test.ts`
- Create: `app/src/lib/jarvis/response/linter.ts`
- Create: `app/src/lib/jarvis/response/linter.test.ts`
- Create: `app/src/lib/jarvis/response/repair.ts`
- Create: `app/src/lib/jarvis/response/repair.test.ts`
- Create: `app/src/lib/jarvis/response/templates.ts`
- Create: `app/src/lib/jarvis/response/templates.test.ts`
- Create: `app/src/lib/jarvis/response/pipeline.ts`
- Create: `app/src/lib/jarvis/response/pipeline.test.ts`
- Create: `app/src/lib/jarvis/response/pipeline.performance.test.ts`
- Create: `app/src/lib/jarvis/response/index.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.test.ts`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`

Do not stage `app/src/lib/jarvis/response` as a directory.

**Interfaces:**

- Consumes Task 3 request/response/execution contracts, Task 11's immutable
  envelope, Task 18's verified run state, and Task 2's protected predicate.
- Produces the canonical response processor used by Tasks 16B, 21A, and 17.
- Owns prose-only repair and deterministic truth narration; it never changes
  verified lifecycle state.

**Exact pipeline contracts:**

```ts
export type JarvisStructuredRegionKind =
  | 'code_fence'
  | 'action'
  | 'plan'
  | 'question'
  | 'permission'
  | 'table'
  | 'diff'
  | 'citation'
  | 'url'
  | 'quoted_text';

export interface JarvisStructuredRegion {
  index: number;
  kind: JarvisStructuredRegionKind;
  bytes: string;
  valid: boolean;
  errorCode?: 'unclosed_fence' | 'invalid_json' | 'invalid_shape';
}

export interface TokenizedJarvisResponse {
  proseWithPlaceholders: string;
  regions: readonly JarvisStructuredRegion[];
}

export type JarvisLintViolationDisposition = 'repairable' | 'deterministic' | 'quarantine';

export interface JarvisLintViolation {
  code: string;
  disposition: JarvisLintViolationDisposition;
  safeSummary: string;
}

export interface JarvisVerifiedFacts {
  executionState?: JarvisExecutionState;
  modelState: 'available' | 'connected' | 'authenticated' | 'degraded' | 'unavailable';
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminalState?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
}

export interface RawProviderResponse {
  text: string;
  provider: JarvisModelSnapshot;
  verifiedFacts: JarvisVerifiedFacts;
  completedAt: number;
}

export interface JarvisRepairRequest {
  prose: string;
  immutablePlaceholders: readonly string[];
  mode: JarvisResponseMode;
  verifiedFacts: JarvisVerifiedFacts;
  violations: readonly JarvisLintViolation[];
}

export interface JarvisRepairPort {
  repair(request: Readonly<JarvisRepairRequest>): Promise<string>;
}

export async function processJarvisResponse(
  raw: Readonly<RawProviderResponse>,
  request: Readonly<JarvisRequestEnvelope>,
  repair: JarvisRepairPort,
): Promise<Readonly<JarvisResponseEnvelope>>;
```

**Exact processing order:**

1. tokenize immutable structured regions;
2. classify mode from the request plus verified facts;
3. sanitize secret requests, hidden-prompt leakage, and unsupported action
   macros in prose only;
4. lint prose only;
5. if and only if one or more `repairable` violations exist and no
   `quarantine` violation exists, make at most one repair call;
6. for `deterministic` violations or failed repair, apply local deterministic
   transformations/templates;
7. for `quarantine`, make zero repair calls and replace prose with the safe
   retry template;
8. restore every valid structured region byte-for-byte;
9. never turn an invalid structured region into an executable `Part`;
10. derive `displayText` and `spokenText` from the same mode and verified
    facts;
11. validate the final envelope.

When lint passes, `repair.repair` is called zero times. Style compliance cannot
add provider latency.

**Malformed structured-region behavior:**

- Preserve the exact malformed region in `JarvisStructuredRegion.bytes` for
  the in-memory diagnostic result.
- Do not parse, execute, or convert it to an action, plan, permission,
  question, tool, or terminal part.
- Return a safe text part stating that structured output could not be
  validated.
- Put only the safe code and region index in `enforcement.violations`.
- Do not put raw malformed bytes in logs, events, spoken text, approval copy,
  or repair input.

**Truth fixtures:**

| Verified fact                        | Required narration behavior                                    |
| ------------------------------------ | -------------------------------------------------------------- |
| run `awaiting_approval`              | mode `approval_required`; never says running/completed         |
| run `running`                        | mode `action_running`; never says completed                    |
| run `completed` and journal verified | mode `action_success`                                          |
| run `partial`                        | mode `action_partial`; names incomplete state                  |
| run `failed`                         | mode `action_failure`; never says completed                    |
| run `cancelled`                      | mode `status` or `warning`; states cancelled before completion |
| run `timed_out`                      | mode `warning` or `action_failure`; states timed out           |
| model `unavailable`                  | mode `warning`; no silent model switch                         |
| plugin/MCP `available`               | says available, not connected                                  |
| plugin/MCP `connected`               | says connected, not authenticated unless the snapshot says so  |
| plugin/MCP `authenticated`           | says authenticated                                             |
| terminal `queued`                    | says queued, not running                                       |
| terminal `running`                   | says running, not completed                                    |
| terminal `completed`                 | says completed only with executor/journal verification         |

Model prose cannot override these templates. Delivered-but-unverified
cancellation is not a `cancelled` truth fixture.

**Protected local-response listener:**

`responseListener.ts` may intercept a greeting only after resolving the exact
agent and calling `isProtectedJarvisAgent()`. Extend its binding:

```ts
resolveAgent(detail: LocalSendDetail): Agent | null | Promise<Agent | null>;
```

A user-created slug collision, unresolved agent, non-JARVIS chat, or
context-bearing turn is not intercepted. Task 16B later removes direct
canonical message writes from this listener.

- [ ] **Step 1: Write the focused failing tests**

Cover every required response mode, structured block round trips, prompt leak,
credential leak, “Sir” cadence, dry humor, generic fallback replacement,
submission vs completion, approval/running/success/failure/partial states,
citations, artifacts, model switch, frustrated-user tone, sensitive topics,
and deterministic idempotence.

Also cover zero repair calls when lint passes; exactly one repair call for one
or many repairable violations; no second call when repaired output still
fails; zero calls for deterministic-only or quarantine violations; repair
rejection fallback; malformed action/plan/question/permission blocks remaining
non-executable; cancellation, timeout, unavailable model, plugin/MCP states,
and terminal queued/running/completed truth; provider completion unable to
override journal state; display/spoken severity agreement; no prose rewrite of
code, URLs, citations, tables, diffs, terminal output, or artifacts; protected
greeting interception; and user-created collision rejection.

In `pipeline.performance.test.ts`, build a representative ordinary response
and a repair port that throws if called. Warm the path, measure at least 500
iterations of deterministic classification plus prose linting, sort
durations, assert p95 below `15` milliseconds, and record only iteration
count, sanitized length, violation count, and p95.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/response/tokenizer.test.ts src/lib/jarvis/response/modeClassifier.test.ts src/lib/jarvis/response/linter.test.ts src/lib/jarvis/response/repair.test.ts src/lib/jarvis/response/templates.test.ts src/lib/jarvis/response/pipeline.test.ts src/lib/jarvis/response/pipeline.performance.test.ts src/lib/jarvis/responsePolicy.test.ts src/lib/jarvis/responseListener.test.ts
```

Expected: FAIL because the response modules do not exist.

- [ ] **Step 3: Implement conditional repair and verified templates**

Implement the exact processing order, prose-only sanitizer/linter, conditional
single repair, deterministic/quarantine fallbacks, immutable structured
restoration, verified display/spoken derivation, response-policy wrappers, and
protected greeting resolution.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/response/tokenizer.test.ts src/lib/jarvis/response/modeClassifier.test.ts src/lib/jarvis/response/linter.test.ts src/lib/jarvis/response/repair.test.ts src/lib/jarvis/response/templates.test.ts src/lib/jarvis/response/pipeline.test.ts src/lib/jarvis/response/pipeline.performance.test.ts src/lib/jarvis/responsePolicy.test.ts src/lib/jarvis/responseListener.test.ts
npm run typecheck
```

Expected: the response correctness/performance suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/response/tokenizer.ts' 'app/src/lib/jarvis/response/tokenizer.test.ts' 'app/src/lib/jarvis/response/modeClassifier.ts' 'app/src/lib/jarvis/response/modeClassifier.test.ts' 'app/src/lib/jarvis/response/linter.ts' 'app/src/lib/jarvis/response/linter.test.ts' 'app/src/lib/jarvis/response/repair.ts' 'app/src/lib/jarvis/response/repair.test.ts' 'app/src/lib/jarvis/response/templates.ts' 'app/src/lib/jarvis/response/templates.test.ts' 'app/src/lib/jarvis/response/pipeline.ts' 'app/src/lib/jarvis/response/pipeline.test.ts' 'app/src/lib/jarvis/response/pipeline.performance.test.ts' 'app/src/lib/jarvis/response/index.ts' 'app/src/lib/jarvis/responsePolicy.ts' 'app/src/lib/jarvis/responsePolicy.test.ts' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/response/tokenizer.ts' 'app/src/lib/jarvis/response/tokenizer.test.ts' 'app/src/lib/jarvis/response/modeClassifier.ts' 'app/src/lib/jarvis/response/modeClassifier.test.ts' 'app/src/lib/jarvis/response/linter.ts' 'app/src/lib/jarvis/response/linter.test.ts' 'app/src/lib/jarvis/response/repair.ts' 'app/src/lib/jarvis/response/repair.test.ts' 'app/src/lib/jarvis/response/templates.ts' 'app/src/lib/jarvis/response/templates.test.ts' 'app/src/lib/jarvis/response/pipeline.ts' 'app/src/lib/jarvis/response/pipeline.test.ts' 'app/src/lib/jarvis/response/pipeline.performance.test.ts' 'app/src/lib/jarvis/response/index.ts' 'app/src/lib/jarvis/responsePolicy.ts' 'app/src/lib/jarvis/responsePolicy.test.ts' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): enforce verified response truth"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the eighteen files above. The
installer and whitespace queries produce no output.

## Task 15: Preview and Speech Gate Preparation Only

**Files:**

- Create: `app/src/lib/jarvis/response/streamingPreviewGate.ts`
- Create: `app/src/lib/jarvis/response/streamingPreviewGate.test.ts`
- Create: `app/src/features/chat/streamingPreviewStore.ts`
- Create: `app/src/features/chat/streamingPreviewStore.test.ts`
- Create: `app/src/features/voice/speechGate.ts`
- Create: `app/src/features/voice/speechGate.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/features/voice/textCleanup.ts`
- Modify: `app/src/features/voice/textCleanup.test.ts`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`

**Interfaces:**

- Consumes Task 14's response mode, linter violation, execution-state, and
  final response contracts.
- Produces ephemeral preview and branded validated-speech inputs for Task 16B
  and Task 21A.
- Does not modify `app/src/lib/ai/runtime.ts` and does not claim the current
  raw runtime writes or accumulated-text TTS calls are removed.

Task 16B owns replacing raw assistant placeholders with ephemeral preview,
removing direct accumulated raw text from TTS, and persisting only a final
validated response or final validated cancellation/partial response.

**Exact preview contracts:**

```ts
export interface StreamingPreviewState {
  buffered: string;
  visible: string;
  insideFence: boolean;
}

export type StreamingPreviewDecision =
  | {
      allowed: true;
      state: Readonly<StreamingPreviewState>;
      visibleText: string;
    }
  | {
      allowed: false;
      state: Readonly<StreamingPreviewState>;
      reason:
        | 'incomplete_sentence'
        | 'inside_structured_fence'
        | 'secret_signal'
        | 'prompt_leak_signal'
        | 'invalid_structure';
    };

export function createStreamingPreviewState(): Readonly<StreamingPreviewState>;

export function pushStreamingPreviewChunk(
  state: Readonly<StreamingPreviewState>,
  delta: string,
): StreamingPreviewDecision;

export interface JarvisStreamingPreview {
  accountId: string;
  runId: string;
  requestId: string;
  chatId: string;
  text: string;
  updatedAt: number;
}
```

`streamingPreviewStore` exposes only:

```ts
setPreview(preview: JarvisStreamingPreview): void;
getPreview(accountId: string, runId: string): JarvisStreamingPreview | null;
clearPreview(accountId: string, runId: string): void;
clearAccountPreviews(accountId: string): void;
```

It has no Dexie, message-repository, journal-mutation, local-storage, or sync
import. Preview state is replaceable and process-local.

**Exact speech-gate contract:**

```ts
declare const validatedSpeechChunkBrand: unique symbol;

export type ValidatedSpeechChunk = string & {
  readonly [validatedSpeechChunkBrand]: true;
};

export interface SpeechGateInput {
  text: string;
  completeSentence: boolean;
  insideFence: boolean;
  mode: JarvisResponseMode;
  executionState?: JarvisExecutionState;
  lintViolations: readonly JarvisLintViolation[];
}

export type SpeechGateDecision =
  | { allowed: true; chunk: ValidatedSpeechChunk }
  | {
      allowed: false;
      reason:
        | 'incomplete_sentence'
        | 'inside_fence'
        | 'secret_signal'
        | 'prompt_leak_signal'
        | 'mode_mismatch'
        | 'execution_state_mismatch'
        | 'lint_failure';
    };

export function validateSpeechChunk(input: Readonly<SpeechGateInput>): SpeechGateDecision;
```

A spoken streaming chunk must pass all six independent checks:

1. complete sentence;
2. outside code/structured fences;
3. no secret or hidden-prompt signal;
4. response-mode compatibility;
5. verified execution-state compatibility;
6. deterministic linter acceptance.

`streamingVoice.ts` adds:

```ts
enqueueValidatedChunk(chunk: ValidatedSpeechChunk): void;
completeValidated(
  response: Readonly<
    Pick<JarvisResponseEnvelope, 'spokenText' | 'mode' | 'executionState'>
  >,
): Promise<void>;
```

The legacy raw `onDelta(string)` compatibility entry may remain only until
Task 16B removes its final caller. Label it as a temporary legacy boundary and
do not use it from new Task 15 code or tests.

**Stop and playback rules:**

- Stop/cancel clears queued sentence buffers.
- Stop/cancel aborts current synthesis and playback.
- Late synthesis completion cannot restart playback.
- Mic state after stop follows existing hands-free/push-to-talk behavior.
- `VoiceModal.stop.test.tsx` is mandatory in RED and GREEN commands.
- Code, JSON, URLs, citations, raw paths, action macros, and hidden metadata
  are not spoken unless a deterministic accessibility template supplies the
  text.

- [ ] **Step 1: Write the focused failing tests**

Cover chunk boundaries inside secrets and prompt-leak phrases; Markdown,
action, plan, question, and permission fence boundaries; Unicode sentence
boundaries; incomplete sentences withheld; preview store never calling
message/Dexie/local-storage APIs; preview replace/clear by run; every
speech-gate rejection reason; validated brand creation only by the gate; final
spoken severity for warning/failure/cancellation; queued synthesis/playback
stop; late completion not resuming audio; and existing VoiceModal stop/mic
state.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/voice/textCleanup.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx
```

Expected: FAIL because the preview and speech-gate modules do not exist.

- [ ] **Step 3: Implement the preview/speech libraries and stop contract**

Implement the exact pure preview gate/store, six-check speech gate, branded
streaming-voice entry points, cleanup behavior, and VoiceModal stop
regressions. Do not edit runtime or claim canonical cutover.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/voice/textCleanup.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx
npm run typecheck
```

Expected: the focused preview/voice suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/response/streamingPreviewGate.ts' 'app/src/lib/jarvis/response/streamingPreviewGate.test.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/voice/textCleanup.ts' 'app/src/features/voice/textCleanup.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/response/streamingPreviewGate.ts' 'app/src/lib/jarvis/response/streamingPreviewGate.test.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/voice/textCleanup.ts' 'app/src/features/voice/textCleanup.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(voice): prepare validated preview and speech gates"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirteen files above. The
installer and whitespace queries produce no output.

## Task 19: Approval Engine, Deterministic Actions, and Real Cancellation

**Files:**

- Create: `app/src/lib/jarvis/approvalEngine.ts`
- Create: `app/src/lib/jarvis/approvalEngine.test.ts`
- Modify: `app/src/features/jarvis-runs/approvalBridge.ts`
- Modify: `app/src/features/jarvis-runs/approvalBridge.test.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.ts`
- Modify: `app/src/features/jarvis-runs/taskRunStore.test.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.ts`
- Modify: `app/src/lib/jarvis/actions/catalog.test.ts`
- Modify: `app/src/lib/jarvis/actions/planner.ts`
- Modify: `app/src/lib/jarvis/actions/planner.test.ts`
- Modify: `app/src/lib/actions/types.ts`
- Modify: `app/src/lib/actions/runner.ts`
- Modify: `app/src/lib/actions/runner.test.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.ts`
- Modify: `app/src/lib/actions/registryJarvisCore.test.ts`
- Modify: `app/src/lib/jarvis/operatorListener.ts`
- Modify: `app/src/lib/jarvis/operatorListener.test.ts`
- Modify: `app/src/features/chat/ActionApprovalCard.tsx`
- Modify: `app/src/features/chat/ActionApprovalCard.test.tsx`
- Modify: `app/src/features/jarvis-runs/recoveryExecutor.ts`
- Modify: `app/src/features/jarvis-runs/recoveryExecutor.test.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.ts`
- Modify: `app/src/features/terminals/terminalExecutionStore.test.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.ts`
- Modify: `app/src/features/terminals/terminalCommandQueue.stress.test.ts`
- Modify: `app/src/features/terminals/TerminalView.tsx`
- Modify: `app/src/features/terminals/TileGrid.tsx`
- Modify: `app/src/features/terminals/TileGrid.refit.test.tsx`

**Approval contract:**

- Durable immutable reviewed parameters and parameter hash.
- Account/run/action/capability scope.
- Risk, expected effect, creation, expiry, decision, and single-use state.
- Secret values replaced with keychain/credential handles before persistence.
- Consumption verifies every bound field.

**Behavior:**

- Deterministic actions create runs/events before execution.
- Awaiting approval is distinct from queued/running.
- Cancellation invokes the actual registered abort handle.
- Removing a queued terminal command is verified cancellation. Signalling a
  running PTY records delivery but only its exit callback may verify the
  terminal cancelled/failed/completed state.
- UI dismissal does not count as cancellation.
- Submission does not count as success.
- Recovery can resume only idempotent steps or require renewed approval.

**Step 1: Write failing tests**

Cover approve/deny/expire/replay/tamper, secret rejection, action lifecycle,
native/network abort propagation, race with completion, duplicate submission,
recovery, and legacy card compatibility.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/approvalEngine.test.ts src/features/jarvis-runs/approvalBridge.test.ts src/features/jarvis-runs/taskRunStore.test.ts src/features/jarvis-runs/recoveryExecutor.test.ts src/lib/jarvis/actions src/lib/actions/runner.test.ts src/lib/actions/registryJarvisCore.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx src/features/terminals/terminalExecutionStore.test.ts src/features/terminals/terminalCommandQueue.stress.test.ts src/features/terminals/TileGrid.refit.test.tsx
```

**Step 3: Implement**

The existing approval bridge becomes an adapter to the canonical engine.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/approvalEngine.test.ts src/features/jarvis-runs src/lib/jarvis/actions src/lib/actions/runner.test.ts src/lib/actions/registryJarvisCore.test.ts src/lib/jarvis/operatorListener.test.ts src/features/chat/ActionApprovalCard.test.tsx src/features/terminals/terminalExecutionStore.test.ts src/features/terminals/terminalCommandQueue.stress.test.ts src/features/terminals/TileGrid.refit.test.tsx
npm run typecheck
git add app/src/lib/jarvis/approvalEngine.ts app/src/lib/jarvis/approvalEngine.test.ts app/src/features/jarvis-runs app/src/lib/jarvis/actions app/src/lib/jarvis/operatorListener.ts app/src/lib/jarvis/operatorListener.test.ts app/src/lib/actions/types.ts app/src/lib/actions/runner.ts app/src/lib/actions/runner.test.ts app/src/lib/actions/registryJarvisCore.ts app/src/lib/actions/registryJarvisCore.test.ts app/src/features/chat/ActionApprovalCard.tsx app/src/features/chat/ActionApprovalCard.test.tsx app/src/features/terminals/terminalExecutionStore.ts app/src/features/terminals/terminalExecutionStore.test.ts app/src/features/terminals/terminalCommandQueue.ts app/src/features/terminals/terminalCommandQueue.stress.test.ts app/src/features/terminals/TerminalView.tsx app/src/features/terminals/TileGrid.tsx app/src/features/terminals/TileGrid.refit.test.tsx
git diff --cached --check
git commit -m "feat(jarvis): unify approvals actions and cancellation"
```

## Task 20: Artifact Normalizer and Legacy Read-Only Projections

**Files:**

- Create: `app/src/lib/jarvis/artifactNormalizer.ts`
- Create: `app/src/lib/jarvis/artifactNormalizer.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts`
- Create: `app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.tsx`
- Modify: `app/src/features/chat/activity/ChatActivityTimeline.test.tsx`
- Modify: `app/src/features/jarvis-runs/JarvisTaskProgressCard.tsx`
- Modify: `app/src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx`

**Artifact rules:**

- Normalize only the approved v1 artifact kinds: `file`, `link`, `text`,
  `image`, `document`, `code`, `terminal_output`, and `provider_result`.
- Store provenance, source refs, content hash, MIME, size, state, preview
  metadata, and local reference.
- Inline secret-bearing content is rejected or redacted before persistence.
- Existing task-run/activity components receive read-only projections.
- Historical chats do not fabricate canonical runs.
- Canonical terminal states are never written back into legacy stores.

**Step 1: Write failing tests**

Cover all artifact kinds, content hashes, invalid/secret payloads, projections,
no duplicate state writes, and account isolation.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/artifactNormalizer.test.ts src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts
```

**Step 3: Implement**

Use bounded previews and preserve source/artifact IDs through response
envelopes and UI projections.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/artifactNormalizer.test.ts src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts src/features/chat/activity/ChatActivityTimeline.test.tsx src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx
npm run typecheck
git add app/src/lib/jarvis/artifactNormalizer.ts app/src/lib/jarvis/artifactNormalizer.test.ts app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.ts app/src/lib/jarvis/executionJournal/legacyTaskRunAdapter.test.ts app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts app/src/features/chat/activity/ChatActivityTimeline.tsx app/src/features/chat/activity/ChatActivityTimeline.test.tsx app/src/features/jarvis-runs/JarvisTaskProgressCard.tsx app/src/features/jarvis-runs/JarvisTaskProgressCard.test.tsx
git diff --cached --check
git commit -m "feat(jarvis): normalize artifacts and project legacy activity"
```

## Task 16B: Typed-Chat Kernel Cutover and Tested Default Switch

**Prerequisites:**

- Tasks 1B, 11-15, 16A, 18, 19, and 20 are complete.
- The production default in `kernelMode.ts` is still `shadow`.
- Task 20 exposes canonical artifact lookup and read-only legacy projections.

**Files:**

- Create: `app/src/lib/jarvis/kernel.ts`
- Create: `app/src/lib/jarvis/kernel.integration.test.ts`
- Create: `app/src/lib/jarvis/kernelMessageProjection.ts`
- Create: `app/src/lib/jarvis/kernelMessageProjection.test.ts`
- Modify: `app/src/lib/jarvis/kernelMode.ts`
- Modify: `app/src/lib/jarvis/kernelMode.test.ts`
- Modify: `app/src/lib/jarvis/identity.ts`
- Modify: `app/src/lib/jarvis/identity.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/ai/runtimeSafety.test.ts`
- Modify: `app/src/types/chat.ts`
- Modify: `app/src/features/chat/streamingPreviewStore.ts`
- Modify: `app/src/features/chat/streamingPreviewStore.test.ts`
- Modify: `app/src/features/voice/speechGate.ts`
- Modify: `app/src/features/voice/speechGate.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/features/chat/ChatView.tsx`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Modify: `app/src/features/chat/ChatThread.agentPanel.test.tsx`
- Modify: `app/src/features/chat/MessagePart.tsx`
- Modify: `app/src/features/chat/MessagePart.jarvisCreator.test.tsx`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`
- Modify: `app/src/components/layout/Inspector.tsx`
- Modify: `app/src/features/chat/Composer.tsx`
- Modify: `app/src/features/files/FilesPage.tsx`
- Modify: `app/src/features/files/FileExplorerDialog.tsx`
- Modify: `app/src/lib/ai/modelSelection.ts`
- Modify: `app/src/lib/ai/modelSelection.test.ts`

`app/src/types/common.ts` is intentionally not modified. Legacy `ContextRef`
continues to represent legacy file/chat references. Kernel provenance and
artifact references use explicit new message-part variants.

**Interfaces:**

- Consumes Tasks 11-15, Task 18's state machine/abort registry, Task 19's
  approval engine, and Task 20's backed artifacts/projections.
- Produces canonical protected typed-chat dispatch and source/artifact message
  projection for Task 21A and Task 17.
- Owns the only production-default change from `shadow` to `kernel`.

**Canonical dispatcher:**

```ts
export interface JarvisKernelTurnInput {
  run: Readonly<JarvisRun>;
  attempt: JarvisRequestAttempt;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId: string;
  parentRunId?: string;
  userMessageId: string;
  agent: Agent;
  surface: JarvisRequestEnvelope['surface'];
  interactionMode: JarvisRequestEnvelope['interactionMode'];
  userText: string;
  messageHistory: readonly LLMMessage[];
  model: JarvisModelSnapshot;
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  workingDirectory?: string;
}

export interface JarvisKernelTurnResult {
  request: Readonly<JarvisRequestEnvelope>;
  compiled: Readonly<CompiledJarvisPrompt>;
  response: Readonly<JarvisResponseEnvelope>;
  messageParts: readonly Part[];
}

export interface JarvisKernelDeps {
  journal: JarvisExecutionJournal;
  approvals: JarvisApprovalEngine;
  artifacts: JarvisArtifactRepository;
  dispatchProvider(input: {
    requestId: string;
    compiled: Readonly<CompiledJarvisPrompt>;
    model: JarvisModelSnapshot;
    messages: readonly LLMMessage[];
    signal: AbortSignal;
    workingDirectory?: string;
    onChunk(delta: string): void;
  }): Promise<RawProviderResponse>;
  processResponse(
    raw: Readonly<RawProviderResponse>,
    request: Readonly<JarvisRequestEnvelope>,
  ): Promise<Readonly<JarvisResponseEnvelope>>;
  now(): number;
}

export async function runJarvisKernelTurn(
  input: Readonly<JarvisKernelTurnInput>,
  deps: JarvisKernelDeps,
): Promise<JarvisKernelTurnResult>;
```

**Canonical execution order:**

For protected typed JARVIS:

1. verify canonical account, `input.run.id === input.attempt.runId`, and the
   already-persisted Task 18 run;
2. transition `queued -> compiling`;
3. build and validate one envelope;
4. compile one prompt;
5. transition `compiling -> running`;
6. register the provider aborter:

```ts
{
  accountId,
  runId,
  registrationId: `${runId}:provider`,
  kind: 'provider_stream',
  abort: () => {
    controller.abort();
    return true;
  },
}
```

7. dispatch through Task 13 exactly once;
8. pass deltas only through Task 15's preview gate/store;
9. process the final/terminal response through Task 14;
10. normalize verified artifacts through Task 20;
11. project response/source/artifact refs into typed message parts;
12. persist one canonical assistant message;
13. append canonical events and perform Task 18's legal terminal transition
    through Task 9's `compareAndAppendTransitionEvent()` primitive;
14. clear preview and dispose the exact provider abort registration in
    `finally`.

Approval creation/consumption and consequential action execution use Task 19.
Kernel mode never invokes legacy auto-approval directly.

**Preview, partial, and persistence rules:**

- Do not create an empty assistant placeholder in kernel mode.
- Provider deltas update only `streamingPreviewStore`.
- No preview chunk is a canonical message, terminal activity state, artifact,
  approval, or event body.
- On normal completion, persist only final validated projected parts.
- On cancellation or provider interruption, run the safe accumulated preview
  through Task 14 with verified `cancelled`, `failed`, or `timed_out` facts.
  Persist it only as a final validated partial/cancellation envelope.
- If no safe partial exists, persist the deterministic terminal-state
  template.
- Never persist the raw accumulator on an error path.
- Remove `streamingVoice.onDelta(rawString)`. Only
  `enqueueValidatedChunk()` or final `spokenText` may reach TTS.
- Abort signal delivery remains nonterminal; only the owning provider/executor
  confirmation may transition the run to `cancelled`.

**Safe failures:**

Envelope validation failure:

- zero provider calls;
- append a safe validation-error event;
- transition the canonical run to `failed`;
- persist no fabricated assistant output beyond the deterministic safe local
  error envelope.

Journal create/transition failure before provider dispatch:

- zero provider calls;
- retain the already-persisted user message;
- persist no assistant placeholder;
- surface a recovery error with a safe category.

Journal failure after provider output:

- do not write an unjournaled success message;
- retain the user message and canonical run evidence already committed;
- surface a recovery error;
- never fall back to legacy in the same logical execution.

Task 13 unsupported transport:

- zero provider calls;
- safe failed run;
- no mutable legacy prompt fallback.

**Typed source and artifact projection:**

Add these variants to `Part` in `types/chat.ts`:

```ts
export type JarvisSourceMessageRef = {
  id: string;
  kind: JarvisSourceKind;
  label: string;
  uri?: string;
  trust: JarvisSourceRef['trust'];
  sensitivity: JarvisSourceRef['sensitivity'];
  observedAt?: number;
};

export type JarvisArtifactMessageRef = {
  id: string;
  kind: JarvisArtifact['kind'];
  title: string;
  state: JarvisArtifactState;
  uri?: string;
  safeSummary?: string;
};

export type Part =
  | /* existing variants unchanged */
  | { kind: 'jarvis_source_ref'; source: JarvisSourceMessageRef }
  | { kind: 'jarvis_artifact_ref'; artifact: JarvisArtifactMessageRef };
```

Projection surface:

```ts
export function projectJarvisEnvelopeToMessageParts(input: {
  response: Readonly<JarvisResponseEnvelope>;
  artifacts: readonly JarvisArtifactV1[];
}): readonly Part[];
```

Rules:

- preserve every existing structured `response.parts` item;
- append each unique source ID once;
- append each unique artifact ID once;
- every `response.artifactIds` value resolves to a real Task 20 row with
  backing; a missing row is a typed projection error, not a fake card;
- keep source `accountId` in the canonical envelope/journal but not in visible
  projection copy;
- omit restricted/secret source URIs;
- never copy artifact inline content into a part;
- `MessagePart.tsx` renders safe labels, state, and real links only;
- old `file_ref` and every historical part render unchanged.

**Protected-agent helper and slug-only call sites:**

Extend Task 2's identity module:

```ts
export function findProtectedJarvisAgent<T extends Pick<Agent, 'builtin' | 'slug'>>(
  agents: Iterable<T>,
): T | undefined;
```

It returns the first agent satisfying `isProtectedJarvisAgent()`.

Replace slug-only protected behavior in:

```text
app/src/components/layout/Inspector.tsx
app/src/features/chat/Composer.tsx
app/src/features/files/FilesPage.tsx
app/src/features/files/FileExplorerDialog.tsx
app/src/lib/ai/modelSelection.ts
app/src/lib/ai/runtime.ts
```

`app/src/App.tsx` remains owned/tested by Task 1B and must already use the same
predicate/helper before Task 16A.

Collision rules:

- `builtin: false, slug: 'jarvis'` remains a normal user agent;
- it is not selected as the protected default;
- it receives no JARVIS model override, prompt compiler, response enforcer,
  profile storage, greeting interception, hidden-editor behavior, or
  auto-approval treatment;
- the protected built-in retains those exact paths.

After changes:

```powershell
rg -n --fixed-strings ".slug === 'jarvis'" app/src/App.tsx app/src/components/layout/Inspector.tsx app/src/features/chat/Composer.tsx app/src/features/files/FilesPage.tsx app/src/features/files/FileExplorerDialog.tsx app/src/lib/ai/modelSelection.ts app/src/lib/ai/runtime.ts
```

Expected: no output. Explicit user-facing slug parsing in unrelated routing
utilities is not redefined as protected identity.

**Activation and rollback:**

1. Leave `DEFAULT_JARVIS_KERNEL_MODE = 'shadow'`.
2. Implement the kernel and run focused integration tests with an explicit
   internal `kernel` override.
3. Prove non-JARVIS, rollback, safety, persistence, cancellation, source, and
   artifact cases pass.
4. Change only:

```ts
export const DEFAULT_JARVIS_KERNEL_MODE: JarvisKernelMode = 'kernel';
```

5. Rerun the same tests without an override.
6. Rerun runtime safety and Task 13 transport tests.

Do not switch the default before the explicit override suite passes.

An internal `legacy` override routes protected chat through compatibility
runtime while still enforcing Task 4 source admission, Task 5 entitlements,
Task 6 browser quarantine, Task 9 private-sync guard, and Task 13 unsupported
transport denial. Rollback leaves Dexie v3 intact and cannot delete or
downgrade it.

- [ ] **Step 1: Write the focused failing integration tests**

Cover explicit kernel currently returning `kernel_mode_not_ready`; one
envelope/compiler/provider/pipeline for protected chat; user-created slug
collision and non-JARVIS staying legacy; request/run continuity; transport
versus logical retry IDs; no raw placeholder; ephemeral preview and clear; no
preview persistence; one final message; safe cancelled/failed partial;
provider abort registration/disposal; structured parts; typed source/artifact
projection/rendering; missing artifact backing; response-listener direct write
removal; validation before provider; journal failure retaining the user
message; unsupported transport fail-closed; rollback interlocks; activation
order; and every protected call site rejecting the collision.

- [ ] **Step 2: Run the initial RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/jarvis/kernelMode.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/jarvis/identity.test.ts src/lib/ai/modelSelection.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts
```

Expected: FAIL because the canonical dispatcher/projection do not exist and
explicit kernel mode is not ready.

- [ ] **Step 3: Implement canonical cutover while the default stays shadow**

Implement the exact dispatcher, preview/response/artifact/message ordering,
safe failures, protected-agent call-site cleanup, and rollback behavior. Keep
`DEFAULT_JARVIS_KERNEL_MODE = 'shadow'`.

- [ ] **Step 4: Prove explicit kernel mode before activation**

```powershell
npm --prefix app test -- src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx
```

Expected: PASS with the production default still `shadow`.

- [ ] **Step 5: Change the default to kernel and rerun focused and broader verification**

Change only the default constant after Step 4 passes, then run:

```powershell
npm --prefix app test -- src/lib/jarvis/kernel.integration.test.ts src/lib/jarvis/kernelMessageProjection.test.ts src/lib/jarvis/kernelMode.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/jarvis/identity.test.ts src/lib/ai/modelSelection.test.ts src/lib/ai/providerPromptTransport.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts
npm run typecheck
rg -n --fixed-strings ".slug === 'jarvis'" app/src/App.tsx app/src/components/layout/Inspector.tsx app/src/features/chat/Composer.tsx app/src/features/files/FilesPage.tsx app/src/features/files/FileExplorerDialog.tsx app/src/lib/ai/modelSelection.ts app/src/lib/ai/runtime.ts
```

Expected: focused tests and typecheck pass; the slug-only scan produces no
output; tests without an override prove the default is now `kernel`.

- [ ] **Step 6: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelMessageProjection.ts' 'app/src/lib/jarvis/kernelMessageProjection.test.ts' 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts' 'app/src/types/chat.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/chat/ChatView.tsx' 'app/src/features/chat/ChatThread.tsx' 'app/src/features/chat/ChatThread.agentPanel.test.tsx' 'app/src/features/chat/MessagePart.tsx' 'app/src/features/chat/MessagePart.jarvisCreator.test.tsx' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts' 'app/src/components/layout/Inspector.tsx' 'app/src/features/chat/Composer.tsx' 'app/src/features/files/FilesPage.tsx' 'app/src/features/files/FileExplorerDialog.tsx' 'app/src/lib/ai/modelSelection.ts' 'app/src/lib/ai/modelSelection.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/jarvis/kernelMessageProjection.ts' 'app/src/lib/jarvis/kernelMessageProjection.test.ts' 'app/src/lib/jarvis/kernelMode.ts' 'app/src/lib/jarvis/kernelMode.test.ts' 'app/src/lib/jarvis/identity.ts' 'app/src/lib/jarvis/identity.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts' 'app/src/lib/ai/runtimeSafety.test.ts' 'app/src/types/chat.ts' 'app/src/features/chat/streamingPreviewStore.ts' 'app/src/features/chat/streamingPreviewStore.test.ts' 'app/src/features/voice/speechGate.ts' 'app/src/features/voice/speechGate.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/features/chat/ChatView.tsx' 'app/src/features/chat/ChatThread.tsx' 'app/src/features/chat/ChatThread.agentPanel.test.tsx' 'app/src/features/chat/MessagePart.tsx' 'app/src/features/chat/MessagePart.jarvisCreator.test.tsx' 'app/src/lib/jarvis/responseListener.ts' 'app/src/lib/jarvis/responseListener.test.ts' 'app/src/components/layout/Inspector.tsx' 'app/src/features/chat/Composer.tsx' 'app/src/features/files/FilesPage.tsx' 'app/src/features/files/FileExplorerDialog.tsx' 'app/src/lib/ai/modelSelection.ts' 'app/src/lib/ai/modelSelection.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(chat): cut protected Jarvis over to the kernel"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the thirty-one files above. The
installer and whitespace queries produce no output.

## Task 21A: Voice-Session Binding Through the Canonical Kernel

**Prerequisites:**

- Task 16B's default kernel cutover is complete.
- Task 18 supports multiple labelled abort registrations per run.
- Task 19 approval/action execution and Task 20 artifacts are canonical.

**Files:**

- Create: `app/src/features/voice/voiceSessionBinding.ts`
- Create: `app/src/features/voice/voiceSessionBinding.test.ts`
- Modify: `app/src/features/voice/voiceChatRouting.ts`
- Modify: `app/src/features/voice/voiceChatRouting.test.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.test.ts`
- Modify: `app/src/features/voice/store.ts`
- Modify: `app/src/features/voice/store.test.ts`
- Modify: `app/src/features/voice/VoiceModal.tsx`
- Modify: `app/src/features/voice/VoiceModal.turn.test.tsx`
- Modify: `app/src/features/voice/VoiceModal.stop.test.tsx`
- Modify: `app/src/features/voice/voiceRouter.ts`
- Modify: `app/src/features/voice/voiceRouter.test.ts`
- Modify: `app/src/features/voice/streamingVoice.ts`
- Modify: `app/src/features/voice/streamingVoice.test.ts`
- Modify: `app/src/lib/jarvis/kernel.ts`
- Modify: `app/src/lib/jarvis/kernel.integration.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`

**Interfaces:**

- Consumes Task 16B's canonical kernel, Task 18's labelled abort registry and
  atomic verified transition, and Task 15's speech/playback gates.
- Produces one immutable voice-session binding and canonical voice envelope
  lineage for Task 17 and Task 21B.
- Does not create a second voice lifecycle or treat abort delivery as a
  terminal cancellation.

**Exact binding:**

```ts
export interface VoiceSessionBinding {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
  activeRunId?: string;
}

export function newVoiceSessionId(): string;

export function createVoiceSessionBinding(input: {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
}): Readonly<VoiceSessionBinding>;
```

`useVoiceStore` adds:

```ts
session: Readonly<VoiceSessionBinding> | null;
beginSession(binding: Readonly<VoiceSessionBinding>): boolean;
setSessionRun(runId: string | undefined): void;
endSession(): void;
```

`newVoiceSessionId()` returns
`vsession_${globalThis.crypto.randomUUID()}`. If Web Crypto is unavailable,
session start fails safely instead of using a timestamp-only or shared ID.

Rules:

- `beginSession()` succeeds only when no session is active.
- Capture the binding once when voice opens after resolving both canonical
  account identity and a protected JARVIS chat.
- Route, Workbench tab, active-chat, project-panel, or later
  `ensureJarvisChatForVoice()` changes cannot replace the binding.
- Account change ends the old session before a new session begins.
- A malformed cloud session or missing canonical identity starts no bound
  session.
- Closing requests cancellation for the active run before clearing the
  binding.
- Default JARVIS voice turns always use `session.chatId`.
- Explicit non-JARVIS voice turns retain the legacy agent path and receive no
  protected identity merely because their slug collides.

**Protected chat resolution:**

Replace slug-only `isJarvisChat()` behavior with `isProtectedJarvisAgent()`.
An unbound chat defaults to the protected built-in only after
`findProtectedJarvisAgent()` succeeds. A user-created `jarvis` slug is not a
protected default.

**Voice envelope and transcript:**

Every bound protected turn calls the same kernel with:

```ts
{
  surface: 'voice',
  accountId: session.accountId,
  chatId: session.chatId,
}
```

- User message, run, request, response, source refs, artifact refs, and spoken
  text share that account/chat/run lineage.
- `VoiceModal` transcript reads `session.chatId`, not mutable
  `activeChatId`.
- `focusVoiceChat()` may change visible navigation but cannot mutate the
  session binding.
- Store the current run ID only after Task 18 returns the canonical run.
- Clear it only after the kernel reaches a verified terminal state.

**Exact abort-registry dependency:**

Consume Task 18's contract:

```ts
export type JarvisAbortKind =
  | 'provider_stream'
  | 'tts_generation'
  | 'audio_playback'
  | 'terminal'
  | 'native_process'
  | 'network'
  | 'child_run'
  | 'other';

export type JarvisAbortRegistration = {
  accountId: string;
  runId: string;
  registrationId: string;
  kind: JarvisAbortKind;
  parentRunId?: string;
  abort: () => boolean | Promise<boolean>;
};

export function registerRunAborter(registration: JarvisAbortRegistration): () => void;

export function requestRunCancellation(
  accountId: string,
  runId: string,
): Promise<CancellationDelivery>;
```

For one voice run, register:

```ts
`${runId}:provider` // provider_stream
`${runId}:tts` // tts_generation
`${runId}:playback`; // audio_playback
```

Registration IDs are unique within account/run. Re-registering replaces only
the same ID. Every disposer is idempotent and removes only its matching
function.

**Cancellation truth:**

- `stopCurrentVoiceResponse()` calls
  `requestRunCancellation(session.accountId, session.activeRunId)` and stops
  local output.
- Task 18 snapshots current run/descendant registrations and calls each
  supported aborter exactly once.
- An aborter returning `true` produces
  `{ delivered: true, verified: false, reason: 'signal_delivered' }`, appends a
  safe cancellation-request event, and leaves the run nonterminal.
- Signal delivery alone never marks the run `cancelled`.
- The provider, TTS generator, or playback owner calls Task 18's exact atomic
  journal method only after its real abort/stop callback confirms termination:

```ts
await journal.transitionRun({
  accountId,
  runId,
  expectedStatus: 'running',
  nextStatus: 'cancelled',
  completedAt: now,
  event: {
    idempotencyKey: `cancel-confirm:${runId}:${owner}`,
    title: 'Run cancelled',
    safeSummary: 'Cancellation confirmed by the active executor.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: now,
  },
});
```

`transitionRun()` supplies `updatedAt` from its injected clock and Task 9
forces the transition event to `run_state` plus `cancelled`; callers do not
supply run ID, sequence, event type, or status inside the event input.
Task 18 validates legality, then delegates the row/event commit to Task 9's
`compareAndAppendTransitionEvent()`; no second transition table or non-atomic
event write is permitted.

- If completion wins before cancellation is verified, the run may truthfully
  complete. Catch Task 18's typed transition conflict and retain the committed
  terminal truth.
- Once `cancelled` is verified, reject late completion/failure transitions.
- If aborters reject, throw, or are missing, report Task 18's exact
  `delivery_rejected`, `delivery_error`, `unsupported`, or `executor_missing`
  reason without claiming the operation stopped.
- Never put raw audio, TTS text, prompt text, or provider deltas in
  cancellation events.

**Voice completion ordering:**

For `surface: 'voice'`, do not mark the run completed until:

1. provider response is final and validated;
2. canonical assistant message/events/artifacts are committed;
3. final `spokenText` playback completes or a truthful unavailable/degraded
   speech outcome is recorded.

A stop during synthesis/playback can therefore become verified
`cancelled`; a completed transcript is not conflated with completed audio.

- [ ] **Step 1: Write the focused failing tests**

Cover one-time account/chat/session capture; no session without identity;
route/Workbench/active-chat changes not replacing binding; account change
ending the old binding; transcript using bound chat; protected voice surface;
user-created slug collision remaining non-protected; provider/TTS/playback
registrations sharing one run; exact disposer ownership; exact account/run
cancel request; `signal_delivered` remaining unverified/nonterminal; real
provider/TTS/playback callback verifying cancellation; completion winning
before verified stop; late completion after verified cancellation rejected;
truthful delivery rejection/error/unavailable; close cancelling before clear;
and existing hands-free/push-to-talk mic behavior.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/features/voice/voiceSessionBinding.test.ts src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/store.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/voiceRouter.test.ts src/features/voice/streamingVoice.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts
```

Expected: FAIL because voice binding does not exist and stop still broadcasts
an unscoped legacy cancellation event.

- [ ] **Step 3: Implement canonical voice binding and abort ownership**

Implement the immutable binding, protected chat resolution, canonical voice
kernel call, bound transcript, three labelled abort registrations, verified
cancellation callbacks, and completion ordering while preserving non-JARVIS
voice and current mic modes.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/features/voice/voiceSessionBinding.test.ts src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/store.test.ts src/features/voice/VoiceModal.turn.test.tsx src/features/voice/VoiceModal.stop.test.tsx src/features/voice/voiceRouter.test.ts src/features/voice/streamingVoice.test.ts src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts
npm run typecheck
```

Expected: the voice/kernel/runtime suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/voice/voiceSessionBinding.ts' 'app/src/features/voice/voiceSessionBinding.test.ts' 'app/src/features/voice/voiceChatRouting.ts' 'app/src/features/voice/voiceChatRouting.test.ts' 'app/src/features/voice/voiceTurnCommit.ts' 'app/src/features/voice/voiceTurnCommit.test.ts' 'app/src/features/voice/store.ts' 'app/src/features/voice/store.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx' 'app/src/features/voice/voiceRouter.ts' 'app/src/features/voice/voiceRouter.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/voice/voiceSessionBinding.ts' 'app/src/features/voice/voiceSessionBinding.test.ts' 'app/src/features/voice/voiceChatRouting.ts' 'app/src/features/voice/voiceChatRouting.test.ts' 'app/src/features/voice/voiceTurnCommit.ts' 'app/src/features/voice/voiceTurnCommit.test.ts' 'app/src/features/voice/store.ts' 'app/src/features/voice/store.test.ts' 'app/src/features/voice/VoiceModal.tsx' 'app/src/features/voice/VoiceModal.turn.test.tsx' 'app/src/features/voice/VoiceModal.stop.test.tsx' 'app/src/features/voice/voiceRouter.ts' 'app/src/features/voice/voiceRouter.test.ts' 'app/src/features/voice/streamingVoice.ts' 'app/src/features/voice/streamingVoice.test.ts' 'app/src/lib/jarvis/kernel.ts' 'app/src/lib/jarvis/kernel.integration.test.ts' 'app/src/lib/ai/runtime.ts' 'app/src/lib/ai/runtime.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(voice): bind sessions to canonical Jarvis runs"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the nineteen files above. The
installer and whitespace queries produce no output.

## Task 17: Scheduled JARVIS and Hive Final Kernel Dispatch

**Prerequisites:**

- Task 21A voice binding is complete.
- Tasks 16B, 18, 19, and 20 are canonical.
- Task 13 has no silent prompt-transport downgrade.

**Files:**

- Create: `app/src/features/schedule/jarvisScheduleDispatch.ts`
- Create: `app/src/features/schedule/jarvisScheduleDispatch.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.retry.test.ts`
- Modify: `app/src/features/schedule/jarvisSchedules.ts`
- Modify: `app/src/features/schedule/jarvisSchedules.test.ts`
- Create: `app/src/lib/ai/stacks/hiveFinalizer.ts`
- Create: `app/src/lib/ai/stacks/hiveFinalizer.test.ts`
- Modify: `app/src/lib/ai/stacks/runner.ts`
- Modify: `app/src/lib/ai/stacks/runner.test.ts`
- Modify: `app/src/lib/ai/stacks/hiveBalance.test.ts`

**Interfaces:**

- Consumes Task 16B's canonical kernel, Task 11's request-attempt rules, Task
  18's persisted runs/child cancellation, Task 19's approval engine, and Task
  20's artifacts.
- Produces canonical scheduled and Hive-final runs while preserving worker
  identities and schedule-saved model selection.
- Does not dispatch canonical schedules through mutable UI state or bypass
  approval for consequential side effects.

**Versioned schedule run history:**

Replace dispatch-as-success records with:

```ts
export type JarvisScheduleRunHistoryStatus =
  | 'dispatched'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface JarvisScheduleRunHistoryEntryV1 {
  schemaVersion: 1;
  at: number;
  runId: string;
  requestId: string;
  status: JarvisScheduleRunHistoryStatus;
  summary?: string;
}

export interface JarvisScheduleLegacyRunHistoryEntry {
  schemaVersion: 0;
  at: number;
  status: 'legacy_dispatched';
  summary?: string;
}

export type JarvisScheduleRunHistoryEntry =
  | JarvisScheduleRunHistoryEntryV1
  | JarvisScheduleLegacyRunHistoryEntry;
```

`JarvisScheduleMetadata.runHistory` uses this union. Parsing stays backward
compatible:

- normalize old `{ status: 'success', summary: 'Run dispatched to Jarvis.' }`
  to `schemaVersion: 0, status: 'legacy_dispatched'` without fabricating a
  request/run ID;
- keep old error history readable;
- cap history at `JARVIS_SCHEDULE_HISTORY_CAP`;
- treat metadata history as a compatibility summary only; Task 18 remains
  lifecycle authority.

**Exact schedule dispatcher:**

```ts
export interface ScheduledJarvisDispatchDeps {
  journal: JarvisExecutionJournal;
  resolveSavedModel(selection: ChatModelSelection): Promise<Readonly<JarvisModelSnapshot>>;
  getIdentitySnapshot(): Promise<Readonly<JarvisIdentitySnapshot>>;
  getActiveProfileSnapshot(accountId: string): Promise<Readonly<JarvisProfileSnapshot>>;
  getCapabilitySnapshot(): Promise<Readonly<JarvisCapabilitySnapshot>>;
  runKernel(input: Readonly<JarvisKernelTurnInput>): Promise<JarvisKernelTurnResult>;
  newRequestId(): string;
  now(): number;
}

export async function scheduleOccurrenceRunId(input: {
  eventId: string;
  dueAt: number;
  logicalAttempt: number;
}): Promise<string>;

export async function dispatchScheduledJarvisOccurrence(
  input: {
    accountId: string;
    workspaceId: string;
    projectId?: string;
    chatId: string;
    eventId: string;
    dueAt: number;
    logicalAttempt: number;
    prompt: string;
    savedModelSelection: ChatModelSelection;
    agent: Agent;
    parentRunId?: string;
  },
  deps: ScheduledJarvisDispatchDeps,
): Promise<JarvisKernelTurnResult>;
```

`scheduleOccurrenceRunId()` hashes:

```ts
`${eventId}\u0000${dueAt}\u0000${logicalAttempt}`;
```

with Task 2's SHA-256 helper and returns:

```ts
`jrun_${digest.slice(0, 32)}`;
```

`logicalAttempt` is `0` for the original occurrence. A duplicate poll for the
same occurrence uses the same run ID and Task 18 idempotently returns the
existing run. Only an explicit logical retry increments the ordinal.

**Dispatch snapshot rules:**

Immediately before building the envelope:

1. resolve the schedule's saved `modelSelection`;
2. capture the current protected identity snapshot;
3. capture the active profile revision for `accountId`;
4. capture the capability/entitlement snapshot;
5. create/persist the canonical run;
6. create a fresh request ID;
7. build `surface: 'schedule'`.

Pass these values as immutable snapshots and do not re-read them after
dispatch starts.

- Global model changes do not affect the run.
- Profile edits after dispatch do not affect the run.
- Identity revision changes after dispatch do not affect the run.
- If the saved model is unavailable, signed out, or unsupported, fail the run
  truthfully without switching models.

**Approval and side-effect rules:**

- A schedule trigger may create and start a run without interactive approval.
- Any consequential action still creates a Task 19 approval and transitions
  to `awaiting_approval`.
- Scheduled dispatch passes no `autoApproveActions` flag.
- A stored schedule cannot embed a consumed approval, credential, cookie,
  token, or secret-handle ID.
- Resuming after approval consumes the exact current approval once.
- Re-running a completed occurrence cannot duplicate completed side effects.

**Exact retry semantics:**

Transport retry:

```text
new requestId
same runId
same saved model snapshot
same identity/profile snapshots
same non-secret parameters
```

It is allowed only when Task 19/executor evidence proves no consequential side
effect completed.

Logical retry:

```text
new requestId
new runId from logicalAttempt + 1
parentRunId = previous run
fresh current identity/profile/capability snapshots
same schedule-saved model selection resolved again
```

A normal poll after pre-dispatch local-storage failure is neither a transport
nor logical provider retry. It reuses the occurrence's stable
`logicalAttempt: 0` run ID and Task 18 idempotency.

**Hive finalizer:**

```ts
export interface HiveWorkerResult {
  stepId: string;
  label: string;
  agentId: string;
  providerId: string;
  modelId: string;
  text?: string;
  status: 'completed' | 'failed' | 'cancelled';
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  errorCategory?: string;
}

export interface HiveFinalizerDeps {
  runKernel(input: Readonly<JarvisKernelTurnInput>): Promise<JarvisKernelTurnResult>;
  createSourceRef(result: HiveWorkerResult, accountId: string): JarvisSourceRef;
}

export async function finalizeHiveWithJarvis(
  input: {
    accountId: string;
    workspaceId?: string;
    projectId?: string;
    chatId: string;
    parentRunId?: string;
    attempt: JarvisRequestAttempt;
    agent: Agent;
    userText: string;
    workers: readonly HiveWorkerResult[];
    identity: JarvisIdentitySnapshot;
    profile: JarvisProfileSnapshot;
    model: JarvisModelSnapshot;
    capabilities: JarvisCapabilitySnapshot;
  },
  deps: HiveFinalizerDeps,
): Promise<JarvisKernelTurnResult>;
```

Rules:

- Worker prompts and identities remain unchanged.
- Each worker output becomes an `agent_output` source ref with
  `trust: 'external_untrusted'`.
- Failed/cancelled workers contribute safe status metadata, never fabricated
  text.
- Final user-facing synthesis uses `surface: 'hive_final'` through the
  protected compiler/pipeline.
- Preserve all-success, partial, all-failed, cancellation, costs, worker
  attribution, source refs, and errors in the final envelope/journal.
- A worker result cannot claim plugin, MCP, terminal, or artifact success
  without canonical evidence.
- Consequential actions in final output still require Task 19 approval.
- Cancellation reaches registered child runs and the finalizer; signal
  delivery remains nonterminal until each owning executor confirms.

**Runner integration:**

`jarvisScheduleRunner.ts` stops dispatching generic `jarvis:send` events for
canonical schedules. It calls `dispatchScheduledJarvisOccurrence()` through
injected dependencies so active UI route/chat/model state cannot alter the
run.

`runStack()` keeps specialist steps, then calls
`finalizeHiveWithJarvis()` once for the visible final response. It does not
replace each specialist prompt with JARVIS identity.

- [ ] **Step 1: Write the focused failing tests**

Schedule cases: saved model over current global model; identity/profile
captured once; later model/profile/identity changes not mutating the envelope;
unavailable saved model failing without switch; canonical run creation;
approval-required action waiting with no executor call; duplicate poll reuse;
transport retry same run/new request; logical retry new run/new request/parent;
no duplicated completed side effect; success/partial/failure/cancel/timeout/
missed occurrence; bounded versioned history and legacy normalization.

Hive cases: unchanged worker identities/prompts; protected `hive_final`;
all-success/partial/all-failed/cancelled workers; attribution, refs, costs, and
safe error categories; no personality overwrite or unverified success; final
action approval; and truthful child/finalizer cancellation.

- [ ] **Step 2: Run the focused RED test and confirm the expected cause**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleDispatch.test.ts src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/features/schedule/jarvisSchedules.test.ts src/lib/ai/stacks/hiveFinalizer.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts
```

Expected: FAIL because the schedule dispatcher and Hive finalizer do not exist;
the current runner records dispatch as success and uses mutable UI dispatch.

- [ ] **Step 3: Implement canonical scheduled and Hive-final dispatch**

Implement stable occurrence IDs, persisted-run-first dispatch, immutable
saved-model/identity/profile/capability snapshots, exact retry categories,
approval preservation, versioned history, worker source refs, canonical final
synthesis, and child cancellation without rewriting worker prompts.

- [ ] **Step 4: Run focused and broader verification**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleDispatch.test.ts src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/features/schedule/jarvisSchedules.test.ts src/lib/ai/stacks/hiveFinalizer.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts
npm run typecheck
```

Expected: the schedule/Hive suite and root typecheck pass.

- [ ] **Step 5: Stage literal files, inspect the cache, and commit**

```powershell
git add -- 'app/src/features/schedule/jarvisScheduleDispatch.ts' 'app/src/features/schedule/jarvisScheduleDispatch.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.ts' 'app/src/features/schedule/jarvisScheduleRunner.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.retry.test.ts' 'app/src/features/schedule/jarvisSchedules.ts' 'app/src/features/schedule/jarvisSchedules.test.ts' 'app/src/lib/ai/stacks/hiveFinalizer.ts' 'app/src/lib/ai/stacks/hiveFinalizer.test.ts' 'app/src/lib/ai/stacks/runner.ts' 'app/src/lib/ai/stacks/runner.test.ts' 'app/src/lib/ai/stacks/hiveBalance.test.ts'
git diff --cached --name-only
git diff --cached --check
git diff --cached -- 'app/src/features/schedule/jarvisScheduleDispatch.ts' 'app/src/features/schedule/jarvisScheduleDispatch.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.ts' 'app/src/features/schedule/jarvisScheduleRunner.test.ts' 'app/src/features/schedule/jarvisScheduleRunner.retry.test.ts' 'app/src/features/schedule/jarvisSchedules.ts' 'app/src/features/schedule/jarvisSchedules.test.ts' 'app/src/lib/ai/stacks/hiveFinalizer.ts' 'app/src/lib/ai/stacks/hiveFinalizer.test.ts' 'app/src/lib/ai/stacks/runner.ts' 'app/src/lib/ai/stacks/runner.test.ts' 'app/src/lib/ai/stacks/hiveBalance.test.ts'
git diff --cached --name-only -- 'install/install.ps1'
git commit -m "feat(jarvis): bind schedules and Hive finals to the kernel"
git show --check --stat HEAD
git diff-tree --no-commit-id --name-only -r HEAD
git log --oneline origin/main..HEAD -- 'install/install.ps1'
```

Expected staged and committed names: exactly the twelve files above. The
installer and whitespace queries produce no output.

## Task 21B: Voice Session Binding and Thin Truthful Command Center

**Files:**

- Create: `app/src/features/jarvis-command-center/commandCenterStore.ts`
- Create: `app/src/features/jarvis-command-center/commandCenterStore.test.ts`
- Create: `app/src/features/jarvis-command-center/types.ts`
- Create: `app/src/features/jarvis-command-center/selectors.ts`
- Create: `app/src/features/jarvis-command-center/selectors.test.ts`
- Create: `app/src/features/jarvis-command-center/JarvisCommandCenter.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisCommandCenter.test.tsx`
- Create: `app/src/features/jarvis-command-center/RunTranscript.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisOutputsTab.tsx`
- Create: `app/src/features/jarvis-command-center/JarvisLiveSystemsTab.tsx`
- Create: `app/src/features/jarvis-command-center/jarvis-command-center.css`
- Modify: `app/src/features/voice/voiceChatRouting.ts`
- Modify: `app/src/features/voice/voiceChatRouting.test.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.ts`
- Modify: `app/src/features/voice/voiceTurnCommit.test.ts`
- Modify: `app/src/features/voice/store.ts`
- Modify: `app/src/features/voice/store.test.ts`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Create: `app/src/features/chat/ChatThread.commandCenter.test.tsx`

**Voice behavior:**

- Every voice session binds to the same chat/session/account IDs used by typed
  chat.
- Voice turns build `surface: 'voice'` envelopes.
- Transcript, display, spoken text, run, sources, artifacts, and cancellation
  share IDs.
- Stop propagates through the abort registry to provider stream, TTS, and
  playback.

**Thin Command Center scope:**

- Current run and bounded transcript.
- Honest progress and approval state.
- Outputs panel backed by artifact repository.
- Live Systems panel backed by capability/model/connector snapshots.
- Source and worker attribution.
- Retry/cancel only when real handlers exist.
- No fake metrics, speculative connector states, or polling when subscriptions
  exist.

This is a functional proof shell; the full visual Command Center is Phase 3 of
the program plan.

**Step 1: Write failing tests**

Cover voice/chat binding, account switching, stop propagation, current run,
bounded event list, artifact outputs, live/degraded/unavailable systems,
keyboard/focus/accessibility, error/retry, and no fake data.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/store.test.ts src/features/jarvis-command-center
```

**Step 3: Implement**

Subscribe to canonical repositories/events and mount the proof shell where
`ChatActivityTimeline` currently appears for canonical built-in-JARVIS flows.
Keep the compact legacy projection for non-canonical flows. Do not start the
Origami or full Command Center visual redesign in this task.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/features/voice/voiceChatRouting.test.ts src/features/voice/voiceTurnCommit.test.ts src/features/voice/store.test.ts src/features/jarvis-command-center src/features/chat/ChatThread.commandCenter.test.tsx
npm run typecheck
git add app/src/features/voice/voiceChatRouting.ts app/src/features/voice/voiceChatRouting.test.ts app/src/features/voice/voiceTurnCommit.ts app/src/features/voice/voiceTurnCommit.test.ts app/src/features/voice/store.ts app/src/features/voice/store.test.ts app/src/features/jarvis-command-center app/src/features/chat/ChatThread.tsx app/src/features/chat/ChatThread.commandCenter.test.tsx
git diff --cached --check
git commit -m "feat(jarvis): bind voice and expose the kernel command center"
```

## Task 22: Rollout, Full Verification, Review, and Successor Draft PR

**Files:**

- Create: `docs/architecture/shared-intelligence-kernel.md`
- Create: `docs/testing/shared-intelligence-kernel-verification.md`
- Create: `docs/security/shared-intelligence-kernel-threat-model.md`
- Modify: `AGENT_COORDINATION.md` in the root checkout only while holding its
  coordination mutex.

**Rollout behavior:**

- Keep the forward-only Dexie v3 migration.
- Provide a typed runtime gate for legacy-vs-kernel JARVIS execution.
- Default the gate on only after focused integration tests pass.
- Rollback disables new execution while preserving v3 data.
- Record migration version, active account, compiled hash, run/event IDs, and
  error categories without raw prompts or source bodies.

**Step 1: Run focused kernel suites**

```powershell
npm --prefix app test -- src/lib/accountIdentity.test.ts
npm --prefix app test -- src/lib/jarvis
npm --prefix app test -- src/lib/db/index.migration.test.ts src/lib/db/migrations/jarvisV3.test.ts src/lib/db/jarvisRepositories.test.ts
npm --prefix app test -- src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/lib/ai/providerPromptTransport.test.ts
npm --prefix app test -- src/features/voice
npm --prefix app test -- src/features/schedule
npm --prefix app test -- src/features/jarvis-runs
npm --prefix app test -- src/features/jarvis-command-center
```

Expected: all pass with no skipped security/migration assertions.

**Step 2: Run repository gates**

```powershell
npm run typecheck
npm --prefix app test
npm run test:release-manifest
npm run build
cargo check --manifest-path app/src-tauri/Cargo.toml
git diff --check
```

Run affected Rust tests when native cancellation/CLI transport code changes:

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml
```

Expected: all configured gates pass. Diagnose and fix ordinary failures before
continuing.

**Step 3: Run an isolated localhost smoke**

Select an unused port dynamically and set a disposable app-data/profile
directory owned by this branch. Record the chosen values. Start only the new
process, exercise typed JARVIS chat, model swap, structured block, voice stop,
schedule, Hive final, approval, cancel, artifact, and Command Center scenarios,
then stop only that process.

Do not use port 5173 unless process inventory proves it is unused and not the
protected instance.

**Step 4: Security and performance review**

Verify:

- `.env*` and secret files never enter context;
- no client email grants entitlements;
- no kernel table or JARVIS prompt reaches sync;
- external CLI prompt transport is present and safely escaped;
- raw provider text cannot reach TTS;
- approvals bind exact reviewed parameters;
- cancellation reaches actual operations;
- bounded event/context/artifact rendering and stated performance budgets;
- account/profile switching cannot leak data.

**Step 5: Independent review**

Invoke `superpowers:requesting-code-review`. Address every actionable finding
with TDD and rerun the affected gates. Do not treat a workflow acknowledgment
as another user approval gate.

**Step 6: Documentation and final kernel commit**

Document architecture, data flow, stores, migrations, feature gate, privacy,
threat model, rollback, test evidence, known external limitations, and how
later goals consume the contracts.

```powershell
git add docs/architecture/shared-intelligence-kernel.md docs/testing/shared-intelligence-kernel-verification.md docs/security/shared-intelligence-kernel-threat-model.md
git diff --cached --check
git commit -m "docs: document the shared intelligence kernel"
```

**Step 7: Branch and PR preparation**

Run final:

```powershell
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git show --check --oneline HEAD
```

Confirm `install/install.ps1` is absent from every commit. Use `github:yeet` to
push normally and create/update the successor draft PR. Do not merge it.

## Kernel Completion Gate

This plan is complete only when:

- all six v3 stores exist and migration tests prove V1/V2 preservation and
  idempotence;
- canonical identity/profile migration preserves user extensions and account
  isolation;
- kernel records and private JARVIS instructions cannot enter generic sync;
- all JARVIS request sources build the shared envelope and compiled prompt;
- all provider transports preserve or explicitly reject the compiled contract;
- structured blocks survive response enforcement byte-for-byte;
- response truth, display text, and spoken text agree;
- raw provider text cannot reach TTS;
- normalized runs/events/approvals/artifacts drive real consumers;
- approval and cancellation reach real operations;
- typed chat, voice, schedules, Hive finals, and deterministic actions use the
  kernel;
- the thin Command Center shows only live canonical state;
- full typecheck, unit, manifest, build, Rust-affected, security, migration,
  isolated smoke, and review gates have recorded evidence;
- the successor branch/draft PR excludes the protected branch/worktree,
  pre-existing localhost process, installer anomaly, production state, and real
  user data.
