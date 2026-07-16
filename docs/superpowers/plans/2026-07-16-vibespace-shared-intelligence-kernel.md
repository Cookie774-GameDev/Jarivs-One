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

**Contract:**

```ts
export type JarvisSourceDecision =
  | { allowed: true; reason: 'allowed_text_source' }
  | {
      allowed: false;
      reason:
        | 'secret_filename'
        | 'credential_path'
        | 'binary'
        | 'too_large'
        | 'outside_allowed_root'
        | 'symlink_escape'
        | 'unsupported';
    };

export function classifyJarvisSource(input: JarvisSourcePolicyInput): JarvisSourceDecision;
```

The denylist includes `.env`, `.env.*`, key/certificate formats, credential
stores, auth/cookie/browser-storage files, common cloud credentials, and
repository-specific secret paths. It is applied before file reads, extraction,
indexing, retrieval, prompt compilation, artifact preview, or sync.

**Step 1: Add failing security tests**

Add cases for `.env`, `.env.local`, nested `.env.production`, `.pem`, `.key`,
`.p12`, `.pfx`, credentials files, cookies, browser storage, symlink escape,
case variants, and safe similarly named files.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts
```

Expected: existing `.env*` candidate tests fail against the new policy.

**Step 3: Implement**

Make `tree.ts` and every explicit-attachment read in `ai/context.ts` delegate
to `classifyJarvisSource()` before opening the source. Remove the current
`.env*` allow behavior. Preserve supported ordinary source types.

**Step 4: Verify**

```powershell
npm --prefix app test -- src/lib/jarvis/sourcePolicy.test.ts src/features/context/tree.test.ts src/lib/ai/context.test.ts
npm run typecheck
```

**Step 5: Commit**

```powershell
git add app/src/lib/jarvis/sourcePolicy.ts app/src/lib/jarvis/sourcePolicy.test.ts app/src/features/context/tree.ts app/src/features/context/tree.test.ts app/src/lib/ai/context.ts app/src/lib/ai/context.test.ts
git diff --cached --check
git commit -m "fix(context): exclude secrets before ingestion"
```

## Task 5: Client Entitlement Interlock

**Files:**

- Modify: `app/src/lib/entitlements.ts`
- Modify: `app/src/lib/entitlements.test.ts`
- Modify: `app/src/lib/admin.ts`
- Create: `app/src/lib/admin.test.ts`
- Modify: `app/src/components/layout/TopBar.tsx`
- Modify: `app/src/features/account/AccountPage.tsx`
- Modify: `app/src/features/ambient/AmbientAudioHost.tsx`
- Modify: `app/src/features/call/CallButton.tsx`
- Modify: `app/src/features/call/CallModal.tsx`
- Modify: `app/src/features/settings/sections/Ambient.tsx`

**Behavior:**

- Remove the hard-coded email-derived admin path.
- Preserve developer/test access only through existing explicit test fixtures
  or development configuration that cannot ship enabled.
- Make entitlement resolution depend on typed server/test state, never email
  spelling or local storage alone.
- Return entitlement provenance and verification time from `admin.ts`.
- Make every direct caller consume the verified snapshot rather than
  `isAdminIdentity`.
- Keep current plan behavior for legitimate entitlement inputs.

**Step 1: Add failing tests**

Cover:

- the previously privileged email receives no admin rights without an explicit
  entitlement;
- email case variants and aliases never grant rights;
- valid signed/test entitlement inputs still resolve;
- missing/expired/unverified state fails closed.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts
```

Expected: the old email allowlist case fails.

**Step 3: Remove the bypass**

Delete `BUILTIN_ADMIN_EMAILS` and any derived branches. Do not add a replacement
client allowlist.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/entitlements.test.ts
npm --prefix app test -- src/lib/admin.test.ts
npm run typecheck
git add app/src/lib/entitlements.ts app/src/lib/entitlements.test.ts app/src/lib/admin.ts app/src/lib/admin.test.ts app/src/components/layout/TopBar.tsx app/src/features/account/AccountPage.tsx app/src/features/ambient/AmbientAudioHost.tsx app/src/features/call/CallButton.tsx app/src/features/call/CallModal.tsx app/src/features/settings/sections/Ambient.tsx
git diff --cached --check
git commit -m "fix(entitlements): remove client admin email bypass"
```

## Task 6: Browser Operator Approval Integrity Interlock

**Files:**

- Modify: `app/src/features/browser/browserTypes.ts`
- Modify: `app/src/features/browser/browserStore.ts`
- Modify: `app/src/features/browser/browserActions.ts`
- Modify: `app/src/features/browser/browserActions.test.ts`
- Create: `app/src/features/browser/browserStore.test.ts`
- Modify: `app/src/features/browser/BrowserPage.tsx`
- Create: `app/src/features/browser/BrowserPage.approval.test.tsx`

**Contract:**

Every consequential browser request stores and verifies:

```ts
export type BrowserReviewedAction = {
  id: string;
  kind: string;
  origin: string;
  tabId?: string;
  frameId?: string;
  target: BrowserActionTarget;
  parameters: JsonObject;
  parameterHash: string;
  expectedEffect: string;
  risk: 'low' | 'medium' | 'high';
  requestedAt: number;
  expiresAt: number;
};
```

No credential/cookie/token value may be persisted. Approval consumption must
fail when the action kind, origin, target, parameter hash, expiry, or account
scope differs. Until the real execution bridge is verified, consequential
actions remain unavailable or approval-only and cannot report success.

**Step 1: Write failing tests**

Cover parameter retention, tamper rejection, expiry, replay, origin change,
tab/URL change, redaction, unsupported execution, and truthful unavailable
state.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
```

**Step 3: Implement**

Preserve the exact reviewed action in the store, compare its hash and current
tab/URL/target at consumption, replace `BrowserPage` summary-based replay, and
quarantine any path that cannot execute through a verified bridge.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/features/browser/browserActions.test.ts src/features/browser/browserStore.test.ts src/features/browser/BrowserPage.approval.test.tsx
npm run typecheck
git add app/src/features/browser/browserTypes.ts app/src/features/browser/browserStore.ts app/src/features/browser/browserActions.ts app/src/features/browser/browserActions.test.ts app/src/features/browser/browserStore.test.ts app/src/features/browser/BrowserPage.tsx app/src/features/browser/BrowserPage.approval.test.tsx
git diff --cached --check
git commit -m "fix(browser): bind approvals to reviewed parameters"
```

## Task 7: Additive Dexie v3 Schema and Testable Database Factory

**Files:**

- Modify: `app/package.json`
- Modify: `package-lock.json`
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/db/index.ts`
- Create: `app/src/test/indexedDb.ts`
- Create: `app/src/lib/db/index.migration.test.ts`

**Schema rule:** `STORES_V1` and `STORES_V2` remain byte-for-byte unchanged.

Add:

```ts
export const DB_VERSION = 3;

export const STORES_V3 = {
  ...STORES_V2,
  jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at',
  jarvis_profiles: 'id, account_id, [account_id+active], updated_at',
  jarvis_runs:
    'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]',
  jarvis_events: '[run_id+seq], run_id, type, status, created_at',
  jarvis_approvals: 'id, run_id, status, params_hash, created_at',
  jarvis_artifacts: 'id, run_id, kind, created_at',
} as const;
```

Persist profile activity as `0 | 1`, because IndexedDB keys cannot be boolean.

Export:

```ts
export class JarvisDexie extends Dexie {
  /* typed tables */
}
export function createJarvisDb(name = DB_NAME): JarvisDexie;
```

Install `fake-indexeddb` as an app dev dependency.

**Step 1: Write migration tests**

Cover:

- fresh v3 creates all six stores;
- v1 to v3 preserves every v1 row;
- v2 to v3 preserves every v2 row;
- reopening v3 is idempotent;
- compound event keys support monotonically ordered retrieval.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
```

**Step 3: Install the test dependency**

```powershell
npm install --workspace app --save-dev fake-indexeddb
```

**Step 4: Implement the additive version chain**

Replay `version(1)`, `version(2)`, and `version(3)` explicitly. Do not add a
destructive upgrade callback.

**Step 5: Verify and commit**

```powershell
npm --prefix app test -- src/lib/db/index.migration.test.ts
npm run typecheck
git add app/package.json package-lock.json app/src/lib/db/schema.ts app/src/lib/db/index.ts app/src/test/indexedDb.ts app/src/lib/db/index.migration.test.ts
git diff --cached --check
git commit -m "feat(db): add shared intelligence kernel v3 stores"
```

## Task 8: Account Activation and Legacy JARVIS Migration

**Files:**

- Create: `app/src/lib/db/migrations/jarvisV3.ts`
- Create: `app/src/lib/db/migrations/jarvisV3.test.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.ts`
- Create: `app/src/lib/jarvis/persistenceCoordinator.test.ts`
- Modify: `app/src/App.tsx`

**Migration contract:**

```ts
export async function migrateLegacyJarvisIdentityForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3MigrationResult>;

export async function activateJarvisV3ForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3ActivationResult>;
```

Rules:

- Match only `builtin === true && slug === 'jarvis'`.
- Add the protected identity revision once.
- Add one default active profile per account.
- Known shipped prompt hash becomes empty custom instructions.
- Unknown prompt hash becomes normalized
  `legacy_user_extension` instructions.
- Preserve legacy Agent rows, provider/model, tools, capabilities, memory scope,
  temperature, and non-JARVIS agents byte-for-byte.
- Migrate legacy text only into the stable local account. A newly authenticated
  cloud account receives a clean default profile until an explicit linkage
  migration exists.
- One transaction covers agent read, identity revision, and profile writes.
- Failure leaves no partial v3 rows and does not prevent the V2 UI from opening.

**Step 1: Write failing tests**

Use the complete case list above plus repeat activation, user-created `Jarvis`
ignore, transaction rollback, and account-switch cache clearing.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
```

**Step 3: Implement**

The coordinator subscribes to real account identity changes, activates the
account, clears cached profile data before switching, and exposes a typed
`ready | degraded` state.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/db/migrations/jarvisV3.test.ts src/lib/jarvis/persistenceCoordinator.test.ts
npm run typecheck
git add app/src/lib/db/migrations/jarvisV3.ts app/src/lib/db/migrations/jarvisV3.test.ts app/src/lib/jarvis/persistenceCoordinator.ts app/src/lib/jarvis/persistenceCoordinator.test.ts app/src/App.tsx
git diff --cached --check
git commit -m "feat(jarvis): migrate protected identity and profiles"
```

## Task 9: Local-Only Row Mappers, Repositories, and Sync Interlock

**Files:**

- Create: `app/src/lib/db/jarvisMappers.ts`
- Create: `app/src/lib/db/jarvisMappers.test.ts`
- Create: `app/src/lib/db/jarvisRepositories.ts`
- Create: `app/src/lib/db/jarvisRepositories.test.ts`
- Modify: `app/src/lib/sync.ts`
- Modify: `app/src/lib/sync.test.ts`
- Modify: `app/src/lib/db/repositories.ts`
- Modify: `app/src/lib/db/repositories.connection.test.ts`

**Repository surface:**

```ts
export const jarvisIdentityRepo: JarvisIdentityRepository;
export const jarvisProfileRepo: JarvisProfileRepository;
export const jarvisRunRepo: JarvisRunRepository;
export const jarvisEventRepo: JarvisEventRepository;
export const jarvisApprovalRepo: JarvisApprovalRepository;
export const jarvisArtifactRepo: JarvisArtifactRepository;
```

All account-bearing methods receive `accountId`. Event, approval, and artifact
reads verify parent-run ownership first. Sequence allocation and terminal
transitions use Dexie transactions.

Add:

```ts
export const LOCAL_ONLY_SYNC_TABLES: ReadonlySet<string>;
export function assertCloudSyncTableAllowed(table: string): void;
```

Guard enqueue, cloud-record construction, and queue processing. Sanitize
already-pending built-in-JARVIS agent mutations so private prompt text cannot
upload. Protected JARVIS agent sync payloads omit `system_prompt`.

**Step 1: Write failing tests**

Cover mapper round trips, account isolation, monotonic sequences,
cross-account rejection, no sync-queue mutations, poisoned queued rows, and
JARVIS prompt payload stripping.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts
```

**Step 3: Implement**

The new repositories must not import generic repository mutation helpers or
call sync functions.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/db/jarvisMappers.test.ts src/lib/db/jarvisRepositories.test.ts src/lib/sync.test.ts src/lib/db/repositories.connection.test.ts
npm run typecheck
git add app/src/lib/db/jarvisMappers.ts app/src/lib/db/jarvisMappers.test.ts app/src/lib/db/jarvisRepositories.ts app/src/lib/db/jarvisRepositories.test.ts app/src/lib/sync.ts app/src/lib/sync.test.ts app/src/lib/db/repositories.ts app/src/lib/db/repositories.connection.test.ts
git diff --cached --check
git commit -m "fix(sync): keep kernel records and Jarvis prompts local"
```

## Task 10: Seed and Agent Editor Compatibility

**Files:**

- Modify: `app/src/lib/db/seed.ts`
- Create: `app/src/lib/db/seed.test.ts`
- Modify: `app/src/features/agents/registry.ts`
- Create: `app/src/features/agents/registry.test.ts`
- Modify: `app/src/features/agents/AgentManager.tsx`
- Modify: `app/src/features/agents/AgentManager.test.tsx`
- Modify: `app/src/features/agents/AgentDetail.tsx`
- Create: `app/src/features/agents/AgentDetail.test.tsx`

**Behavior:**

- One canonical built-in agent roster supplies seed and fallback registration.
- Built-in JARVIS is detected only by `builtin === true && slug === 'jarvis'`.
- Its editor field is labeled “Custom instructions.”
- Prompt edits update the active account profile, not
  `Agent.system_prompt`.
- Model, tools, capabilities, memory scope, effort, and temperature keep their
  current storage path during this slice.
- Non-JARVIS agent editing is unchanged.

**Step 1: Write failing tests**

Cover canonical roster parity, JARVIS profile editing, immutable legacy prompt,
non-JARVIS behavior, and profile/account switching.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/db/seed.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
```

**Step 3: Implement**

Reuse identity/profile factories; do not duplicate canonical prompt text.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/db/seed.test.ts src/features/agents/registry.test.ts src/features/agents/AgentManager.test.tsx src/features/agents/AgentDetail.test.tsx
npm run typecheck
git add app/src/lib/db/seed.ts app/src/lib/db/seed.test.ts app/src/features/agents/registry.ts app/src/features/agents/registry.test.ts app/src/features/agents/AgentManager.tsx app/src/features/agents/AgentManager.test.tsx app/src/features/agents/AgentDetail.tsx app/src/features/agents/AgentDetail.test.tsx
git diff --cached --check
git commit -m "refactor(agents): route builtin Jarvis through profiles"
```

## Task 11: Context Pack, Capability Snapshot, and Request Envelope Builder

**Files:**

- Create: `app/src/lib/jarvis/contextPack.ts`
- Create: `app/src/lib/jarvis/contextPack.test.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.ts`
- Create: `app/src/lib/jarvis/capabilitySnapshot.test.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.ts`
- Create: `app/src/lib/jarvis/requestEnvelope.test.ts`
- Modify: `app/src/lib/ai/context.ts`
- Modify: `app/src/lib/ai/context.test.ts`

**Contract:**

```ts
export async function buildJarvisContextPack(
  input: JarvisContextPackInput,
): Promise<JarvisContextPack>;

export function createJarvisCapabilitySnapshot(
  input: CapabilitySnapshotInput,
): JarvisCapabilitySnapshot;

export async function createJarvisRequestEnvelope(
  input: JarvisRequestInput,
): Promise<JarvisRequestEnvelope>;
```

The context pack:

- applies source policy before reading;
- includes trust, provenance, freshness, byte/token cost, and truncation reason;
- orders explicit user attachments before retrieved context;
- treats retrieved/external content as untrusted data, never instructions;
- uses deterministic budgets;
- omits source body when only a reference is authorized.

Capability snapshots distinguish the approved connection and availability
states and are derived from live typed state. The exact persisted vocabulary is
`available | connected | authenticated | degraded | unavailable | planned`.

**Step 1: Write failing tests**

Cover deterministic ordering/budgets, secret exclusion, trust isolation,
stale sources, missing connectors, model/provider state, entitlements, and
request-source variants.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts
```

**Step 3: Implement**

Adapt existing AI context resolution through the new builder without deleting
the old non-JARVIS path.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/contextPack.test.ts src/lib/jarvis/capabilitySnapshot.test.ts src/lib/jarvis/requestEnvelope.test.ts src/lib/ai/context.test.ts
npm run typecheck
git add app/src/lib/jarvis/contextPack.ts app/src/lib/jarvis/contextPack.test.ts app/src/lib/jarvis/capabilitySnapshot.ts app/src/lib/jarvis/capabilitySnapshot.test.ts app/src/lib/jarvis/requestEnvelope.ts app/src/lib/jarvis/requestEnvelope.test.ts app/src/lib/ai/context.ts app/src/lib/ai/context.test.ts
git diff --cached --check
git commit -m "feat(jarvis): build typed request envelopes"
```

## Task 12: Deterministic Prompt Compiler

**Files:**

- Create: `app/src/lib/jarvis/promptCompiler.ts`
- Create: `app/src/lib/jarvis/promptCompiler.test.ts`
- Modify: `app/src/lib/jarvis/promptLayers.ts`
- Modify: `app/src/lib/jarvis/promptLayers.test.ts`

**Compiler surface:**

```ts
export function compileJarvisPrompt(envelope: JarvisRequestEnvelope): CompiledJarvisPrompt;
```

Authority order:

1. immutable security and truth rules;
2. immutable JARVIS identity and response contract;
3. capability, tool, approval, and entitlement policy;
4. user-approved profile and custom instructions;
5. current surface and interaction-mode policy;
6. provenance-labelled untrusted context;
7. structured-output requirements.

The compiler emits separately addressable layers with stable IDs, authority,
trust, provenance, byte/token estimates, source hashes, and a deterministic
compiled hash. Untrusted text is enclosed as data and cannot introduce system
instructions.

**Step 1: Write failing tests**

Cover stable output/hash, authority ordering, profile isolation, source
escaping, budget truncation, structured output rules, model switching,
schedule/Hive source differences, and no duplicate identity layers.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptLayers.test.ts
```

**Step 3: Implement**

Make the old `assembleJarvisPromptLayers()` a compatibility wrapper over the
compiler or remove it only after all imports prove obsolete.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/promptCompiler.test.ts src/lib/jarvis/promptLayers.test.ts
npm run typecheck
git add app/src/lib/jarvis/promptCompiler.ts app/src/lib/jarvis/promptCompiler.test.ts app/src/lib/jarvis/promptLayers.ts app/src/lib/jarvis/promptLayers.test.ts
git diff --cached --check
git commit -m "feat(jarvis): compile one authoritative prompt"
```

## Task 13: Provider Prompt Transport

**Files:**

- Create: `app/src/lib/ai/providerPromptTransport.ts`
- Create: `app/src/lib/ai/providerPromptTransport.test.ts`
- Modify: `app/src/lib/ai/router.ts`
- Modify: `app/src/lib/ai/router.test.ts`
- Modify: `app/src/lib/ai/router.connection.test.ts`
- Modify: `app/src/lib/ai/types.ts`
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
- Modify: `app/src/lib/ai/providers/ollama.ts`
- Modify: `app/src/lib/ai/providers/ollama.test.ts`
- Modify: `app/src/lib/ai/providers/openai.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.ts`
- Modify: `app/src/lib/ai/providers/openai-compatible.test.ts`

**Contract:**

```ts
export type ProviderPromptTransport = {
  system: string;
  messages: readonly AiMessage[];
  compiledHash: string;
  transport: 'native_system' | 'preamble_message' | 'cli_preamble';
};

export function buildProviderPromptTransport(
  compiled: CompiledJarvisPrompt,
  target: ProviderTransportTarget,
): ProviderPromptTransport;
```

Rules:

- Native system fields receive the compiled system contract.
- Providers without system fields receive a deterministic first-message
  preamble.
- External CLI adapters receive the compiled preamble through stdin or a
  documented safe argument; never through unsafe command concatenation.
- If a transport cannot preserve the contract, JARVIS requests fail closed
  with typed `unsupported_prompt_transport`.
- Non-JARVIS behavior remains compatible.

**Step 1: Write failing construction tests**

Assert the identity hash and output contract are present in every provider and
CLI invocation. Include whitespace, quotes, Unicode, multiline text, and
prompt-injection-like input.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts
```

Expected: current external CLI adapter cases demonstrate dropped system prompt.

**Step 3: Implement**

Keep secret-bearing provider configuration out of the compiled prompt and test
diagnostics.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/ai/providerPromptTransport.test.ts src/lib/ai/router.test.ts src/lib/ai/router.connection.test.ts src/lib/ai/adapters/catalog.test.ts src/lib/ai/adapters/registry.test.ts src/lib/ai/adapters/cliParsers.test.ts
npm --prefix app test -- src/lib/ai/providers
npm run typecheck
git add app/src/lib/ai/providerPromptTransport.ts app/src/lib/ai/providerPromptTransport.test.ts app/src/lib/ai/router.ts app/src/lib/ai/router.test.ts app/src/lib/ai/adapters app/src/lib/ai/providers
git diff --cached --check
git commit -m "fix(ai): preserve compiled Jarvis prompts across providers"
```

## Task 14: Response Tokenizer, Modes, Linter, Repair, and Envelope

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
- Create: `app/src/lib/jarvis/response/index.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.ts`
- Modify: `app/src/lib/jarvis/responsePolicy.test.ts`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`

**Pipeline:**

```ts
export async function processJarvisResponse(
  raw: RawProviderResponse,
  request: JarvisRequestEnvelope,
  repair: JarvisRepairPort,
): Promise<JarvisResponseEnvelope>;
```

Order:

1. tokenize immutable structured blocks;
2. classify deterministic response mode from request and execution state;
3. sanitize credential/prompt-leak/action-macro content;
4. lint prose only;
5. apply deterministic repair to prose only;
6. use templates for action lifecycle narration;
7. restore structured blocks byte-for-byte;
8. derive display and spoken text from the same verified truth state;
9. validate the response envelope.

Permit at most one bounded prose-only repair through a low-level provider port.
The repair receives immutable placeholders and verified facts, cannot invoke
tools, cannot recursively invoke the kernel, and cannot change structured
regions or execution state. If it fails, use deterministic transformations,
verified state templates, or a quarantined retry response as required by the
approved design.

**Step 1: Write failing tests**

Cover every required response mode, structured block round trips, prompt leak,
credential leak, “Sir” cadence, dry humor, generic fallback replacement,
submission vs completion, approval/running/success/failure/partial states,
citations, artifacts, model switch, frustrated-user tone, sensitive topics,
and deterministic idempotence.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/response
```

**Step 3: Implement**

Retain old public response-policy functions as wrappers where existing
consumers need them. Greeting interception must check the selected built-in
JARVIS identity before preempting the provider.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/response src/lib/jarvis/responsePolicy.test.ts src/lib/jarvis/responseListener.test.ts
npm run typecheck
git add app/src/lib/jarvis/response app/src/lib/jarvis/responsePolicy.ts app/src/lib/jarvis/responsePolicy.test.ts app/src/lib/jarvis/responseListener.ts app/src/lib/jarvis/responseListener.test.ts
git diff --cached --check
git commit -m "feat(jarvis): enforce verified response envelopes"
```

## Task 15: Streaming Preview Gate and Speech Gate

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

**Rules:**

- Streaming preview may display only incrementally validated prose.
- Streaming preview remains ephemeral and is never written to Dexie as a
  canonical assistant message.
- An incomplete structured block remains buffered.
- Secret-like or prompt-leak-like spans are withheld.
- TTS accepts only `JarvisResponseEnvelope.spokenText` or validated safe chunks
  produced by the speech gate.
- Stop/cancel aborts queued synthesis and playback.
- Structured blocks, URLs, citations, code, tables, action macros, and hidden
  metadata are not spoken unless an explicit accessible narration template
  provides safe text.

**Step 1: Write failing tests**

Include chunk boundaries inside secrets, Markdown fences, action blocks,
Unicode, sentence boundaries, late cancellation, provider error, and final
display/spoken consistency.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts
```

**Step 3: Implement**

Remove every path that sends accumulated raw provider text directly to TTS or
canonical message persistence.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/response/streamingPreviewGate.test.ts src/features/chat/streamingPreviewStore.test.ts src/features/voice/speechGate.test.ts src/features/voice/streamingVoice.test.ts src/features/voice/textCleanup.test.ts src/features/voice/VoiceModal.turn.test.tsx
npm run typecheck
git add app/src/lib/jarvis/response/streamingPreviewGate.ts app/src/lib/jarvis/response/streamingPreviewGate.test.ts app/src/features/chat/streamingPreviewStore.ts app/src/features/chat/streamingPreviewStore.test.ts app/src/features/voice/speechGate.ts app/src/features/voice/speechGate.test.ts app/src/features/voice/streamingVoice.ts app/src/features/voice/streamingVoice.test.ts app/src/features/voice/textCleanup.ts app/src/features/voice/textCleanup.test.ts app/src/features/voice/VoiceModal.tsx app/src/features/voice/VoiceModal.turn.test.tsx
git diff --cached --check
git commit -m "fix(voice): gate streaming and speech through verified text"
```

## Task 16: Typed Chat Runtime Cutover

**Files:**

- Create: `app/src/lib/jarvis/kernel.ts`
- Create: `app/src/lib/jarvis/kernel.integration.test.ts`
- Modify: `app/src/lib/ai/runtime.ts`
- Modify: `app/src/lib/ai/runtime.test.ts`
- Modify: `app/src/lib/ai/runtimeSafety.test.ts`
- Modify: `app/src/features/chat/ChatView.tsx`
- Modify: `app/src/features/chat/ChatThread.tsx`
- Modify: `app/src/features/chat/ChatThread.agentPanel.test.tsx`
- Modify: `app/src/features/chat/MessagePart.jarvisCreator.test.tsx`
- Modify: `app/src/lib/jarvis/responseListener.ts`
- Modify: `app/src/lib/jarvis/responseListener.test.ts`

**Behavior:**

- Only built-in JARVIS chat turns use the kernel path in this task.
- Build the request envelope once.
- Compile and transport the prompt once.
- Stream through the preview gate.
- Finalize through `processJarvisResponse()`.
- Persist one canonical assistant message only after final enforcement; on an
  interrupted turn persist only the preview gate's safe partial with explicit
  interruption state.
- Persist/display source and artifact refs.
- Preserve existing non-JARVIS agent behavior.
- A typed feature gate permits forward rollback to the legacy JARVIS runtime
  without rolling back Dexie.

**Step 1: Write failing integration tests**

Cover built-in JARVIS gate, user-created `jarvis` slug rejection, request ID
continuity, provider transport, final envelope, structured UI parts, error,
abort, retry, and non-JARVIS compatibility.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts
```

**Step 3: Implement the cutover**

Keep legacy code reachable only through the explicit rollback gate; do not
maintain two implicit prompt paths. Replace the standalone response listener's
direct message writes with kernel-controlled deterministic responses.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/lib/jarvis/kernel.integration.test.ts src/lib/ai/runtime.test.ts src/lib/ai/runtimeSafety.test.ts src/features/chat/ChatThread.agentPanel.test.tsx src/features/chat/MessagePart.jarvisCreator.test.tsx src/lib/jarvis/responseListener.test.ts
npm run typecheck
git add app/src/lib/jarvis/kernel.ts app/src/lib/jarvis/kernel.integration.test.ts app/src/lib/ai/runtime.ts app/src/lib/ai/runtime.test.ts app/src/lib/ai/runtimeSafety.test.ts app/src/features/chat/ChatView.tsx app/src/features/chat/ChatThread.tsx app/src/features/chat/ChatThread.agentPanel.test.tsx app/src/features/chat/MessagePart.jarvisCreator.test.tsx app/src/lib/jarvis/responseListener.ts app/src/lib/jarvis/responseListener.test.ts
git diff --cached --check
git commit -m "feat(chat): route builtin Jarvis through the kernel"
```

## Task 17: Schedule and Hive Final Cutovers

**Files:**

- Modify: `app/src/features/schedule/jarvisScheduleRunner.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.test.ts`
- Modify: `app/src/features/schedule/jarvisScheduleRunner.retry.test.ts`
- Modify: `app/src/lib/ai/stacks/runner.ts`
- Modify: `app/src/lib/ai/stacks/runner.test.ts`
- Modify: `app/src/lib/ai/stacks/hiveBalance.test.ts`

**Behavior:**

- Scheduled JARVIS work builds a `surface: 'schedule'` request envelope with the
  schedule, retry, and execution truth.
- Hive workers retain independent prompts and identities.
- Only the selected JARVIS final synthesis uses `surface: 'hive_final'`.
- Worker attribution, source refs, partial success, costs, cancellation, and
  errors survive into the final envelope.
- Retries are idempotent and do not duplicate completed side effects.

**Step 1: Write failing tests**

Cover schedule success/retry/failure/cancel, Hive all-success/partial/failure,
worker attribution, no worker personality overwrite, and final JARVIS response
enforcement.

**Step 2: Observe failure**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts
```

**Step 3: Implement**

Use shared envelope/compiler/pipeline functions; do not duplicate schedule or
Hive prompt overlays.

**Step 4: Verify and commit**

```powershell
npm --prefix app test -- src/features/schedule/jarvisScheduleRunner.test.ts src/features/schedule/jarvisScheduleRunner.retry.test.ts src/lib/ai/stacks/runner.test.ts src/lib/ai/stacks/hiveBalance.test.ts
npm run typecheck
git add app/src/features/schedule/jarvisScheduleRunner.ts app/src/features/schedule/jarvisScheduleRunner.test.ts app/src/features/schedule/jarvisScheduleRunner.retry.test.ts app/src/lib/ai/stacks/runner.ts app/src/lib/ai/stacks/runner.test.ts app/src/lib/ai/stacks/hiveBalance.test.ts
git diff --cached --check
git commit -m "feat(jarvis): enforce schedule and Hive final responses"
```

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

## Task 21: Voice Session Binding and Thin Truthful Command Center

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
