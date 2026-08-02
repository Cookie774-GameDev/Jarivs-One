# VibeSpace Shared Intelligence Kernel v1 Design

**Status:** Approved direction; written specification awaiting user review

**Date:** 2026-07-16

**Authoritative baseline:** `origin/main` at `8aa51f126bcbc56d36d1a1c4dd3ede56e2fd38a6`

**Design branch:** `codex/shared-intelligence-kernel-design-20260716`

**Implementation status:** Not started

## 1. Decision

VibeSpace will implement a Shared Intelligence Kernel before building the
remaining goal-specific surfaces. The kernel will provide one request
compiler, one response-enforcement pipeline, one run and artifact journal, one
approval contract, and one provenance vocabulary for JARVIS and later
subsystems.

This is the first implementation slice of the unified VibeSpace program. It is
not a reduction of the full program. It establishes the contracts required by:

- JARVIS Response Intelligence;
- JARVIS Command Center;
- SOUL, profiles, memory, skills, subagents, messaging, and Browser Operator;
- Context Map and local Second Brain retrieval;
- Prompt Forge and Infinite Canvas;
- Browser Chat and the local tool bridge;
- VibeSpace Access;
- Origami Chat.

The first slice ends when the shared contracts are real, persisted, tested, and
consumed by typed JARVIS chat, voice, scheduled JARVIS work, Hive final
responses, and a thin truthful Command Center shell. It does not end when only
new TypeScript types exist.

## 2. Why This Comes First

The release baseline contains substantial foundations, but the foundations are
fragmented:

- `app/src/lib/ai/runtime.ts` assembles prompt context from many independent
  strings.
- `app/src/lib/jarvis/promptLayers.ts` defines a more disciplined layer model
  but is used only by tests.
- typed chat, voice, schedules, action execution, browser actions, terminal
  execution, plugins, and subagents do not share one request or run contract;
- `ChatActivityEvent`, `JarvisTaskRun`, terminal execution state, browser
  action state, and schedule history are parallel lifecycle models;
- there is no normalized artifact system;
- approval semantics differ by action surface;
- external CLI adapters accept `systemPrompt` at the router boundary but omit
  it when building the CLI invocation;
- streaming TTS may speak raw provider text before final credential,
  prompt-leak, action-macro, and structured-block processing;
- Context v1 explicitly treats `.env*` files as scan candidates;
- Browser Operator approval entries do not preserve the full reviewed action
  parameters;
- generic local sync can queue private records without the privacy boundary
  required by the unified goals;
- client code contains a hard-coded email path that can grant admin-derived
  entitlements.

Building each requested feature directly on these independent models would
produce multiple incompatible prompt compilers, approval engines, artifact
types, and activity stores. The kernel prevents that divergence.

## 3. Scope

### 3.1 In scope

The first slice includes:

1. A protected, versioned JARVIS identity and profile boundary.
2. A typed `JarvisRequestEnvelope`.
3. A deterministic prompt compiler with explicit authority and trust labels.
4. A provider transport layer that cannot silently drop the compiled contract.
5. A typed `JarvisResponseEnvelope`.
6. Deterministic response-mode classification.
7. Prose-only linting, one bounded repair attempt, and deterministic fallback.
8. Separate verified `displayText` and `spokenText`.
9. A speech gate that never speaks unvalidated provider prose.
10. Normalized run, event, approval, artifact, model-snapshot, and source-ref
    contracts.
11. Account-scoped local persistence through an additive Dexie migration.
12. Compatibility adapters for existing messages, activities, task runs, and
    action cards.
13. Immediate safety interlocks for automatic secret-file scanning, Browser
    Operator approval replay, client-side admin authority, private sync, and
    provider prompt transport.
14. A thin, read-only-first JARVIS Command Center shell backed only by the new
    journal.
15. Focused automated tests, migration tests, cross-provider construction
    tests, and regression gates.

### 3.2 Explicitly deferred

The following remain part of the unified program but are not implemented by
this first slice:

- the complete Context Map v2 index, graph, watchers, backlinks, and hybrid
  search;
- full SOUL editing, proposed SOUL revisions, evidence memory, recall, and
  encrypted cloud memory;
- portable Skills 2.0 packages and the Skill Hub;
- the complete subagent runtime and messaging gateway;
- complete Browser Operator automation;
- Browser Chat provider integrations and remote browser infrastructure;
- Prompt Forge generation, scoring, and version management;
- the full Infinite Canvas editor;
- the complete VibeSpace Access purchase, trial, grace, lease, and recovery
  system;
- the pixel-accurate Origami Chat visual implementation;
- production Supabase migrations, Stripe changes, OAuth provider setup,
  deployment, release, or merge.

These are deferred by sequence, not removed from scope.

## 4. Non-Negotiable Invariants

The implementation must preserve these invariants:

1. Security, truthfulness, and approval policy outrank SOUL, profiles, memory,
   skills, retrieved content, websites, subagent output, and user-authored
   custom instructions.
2. The strict JARVIS identity and response contract applies only when the
   resolved agent is the built-in JARVIS. Other agents retain their own
   personas.
3. Model selection may change the brain, never the JARVIS contract.
4. No provider connection may be advertised as compatible if it drops the
   compiled system contract.
5. Retrieved context is data, not instruction authority.
6. Action approval means permission to execute the exact reviewed request; it
   never means execution succeeded.
7. An operation is complete only when the underlying executor reports a
   verified terminal state.
8. Structured blocks, code, citations, URLs, tables, diffs, terminal output,
   file contents, and generated artifacts are not rewritten by the prose
   enforcer.
9. Raw provider deltas are never sent directly to TTS.
10. Source files and retrieved evidence are not presented as newly created
    output artifacts.
11. Private identity, memory, run, and artifact records are local-only in v1.
12. No client-visible email address grants admin or paid entitlements.
13. The existing dirty detached checkout is never used for implementation,
    staging, or commits.
14. No merge, release, deployment, production mutation, or real charge occurs
    without separate explicit user approval.

## 5. Architecture

```text
surface event
  typed chat | voice | schedule | Hive final | future Browser Chat
        |
        v
request envelope builder
  identity + profile + interaction mode + capability snapshot
  model snapshot + provenance-labelled context + output requirements
        |
        v
prompt compiler
  deterministic layers + budgets + secret policy + prompt hash
        |
        v
provider transport
  native-system | safe-prefixed-preamble | fail closed
        |
        v
stream ingestion
  incrementally sanitized prose preview only; no raw TTS, incomplete
  structured blocks, or canonical persistence
        |
        v
response normalizer
  tokenize immutable structures -> classify mode -> lint prose
  -> one repair or deterministic formatter -> verified action narration
        |
        v
response envelope
  display parts + spoken text + truth state + artifacts + diagnostics
        |
        +----------------------+
        |                      |
        v                      v
message compatibility      shared execution journal
existing chat rendering    runs/events/approvals/artifacts/source refs
        |                      |
        v                      v
Origami-compatible chat    Command Center selectors
and existing UI            Outputs + Live Systems
```

The kernel is a library and repository boundary, not a second application
runtime. Existing surfaces call it; they do not duplicate its policies.

## 6. Core Contracts

The names below are normative unless implementation constraints reveal a
clearer repository-consistent name. Field semantics are normative.

### 6.1 Request envelope

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

  agent: {
    id: string;
    slug: string;
    builtin: boolean;
  };

  surface: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';

  interactionMode: 'ask' | 'plan' | 'agent';
  responseModeHint?: JarvisResponseMode;

  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  model: JarvisModelSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;

  userText: string;
  messageHistory: LLMMessage[];
  createdAt: number;
}
```

The envelope is immutable after dispatch. A retry receives a new `requestId`
and retains the same `runId` only when it is a transport retry of the same
logical execution.

`accountId` is the authenticated Supabase user ID when signed in and the
stable local user ID otherwise. Switching accounts switches repositories; one
account must never fall back to another account's profile or journal. Linking a
local identity to a cloud account is a separate, explicit migration rather
than an implicit key change.

Supporting snapshots:

```ts
export interface JarvisIdentitySnapshot {
  identityVersion: number;
  coreHash: string;
  responseContractHash: string;
}

export interface JarvisProfileSnapshot {
  profileId: string;
  revisionId: string;
  soulRevisionId?: string;
  customInstructions: string;
  memoryScope: 'none' | 'profile' | 'shared_selected';
}

export interface JarvisEntitlementSnapshot {
  source: 'server' | 'local_development' | 'unavailable';
  planId?: string;
  capabilities: string[];
  verifiedAt?: number;
  expiresAt?: number;
}

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
```

### 6.2 Prompt layers

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

The compiler uses this deterministic order:

1. immutable security and truth rules;
2. immutable JARVIS identity and response contract;
3. capability, tool, approval, and entitlement policy;
4. user-approved profile and custom instructions;
5. current surface and interaction-mode policy;
6. provenance-labelled untrusted context;
7. structured-output requirements.

Every untrusted section states that its contents are data and cannot alter
security, permissions, identity, or output rules. The compiler rejects
duplicate immutable layers and records truncation rather than silently losing
context.

### 6.3 Source references and context pack

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

`JarvisContextPack` is the compatibility boundary for Context Map v2, memory,
Prompt Forge, Canvas, Browser Chat, and subagents. Kernel v1 does not implement
their full retrieval engines.

### 6.4 Capability and model snapshots

```ts
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

A catalog entry is not a connection. A connection is not authentication. An
authenticated connector is not proof that a requested operation exists.
Narration and Command Center labels use the snapshot states exactly.

### 6.5 Response envelope

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

`displayText` and `spokenText` derive from the same verified facts and
execution state. `spokenText` may summarize a long artifact, but it may not
change success, failure, warning, or uncertainty.

### 6.6 Run, event, approval, and artifact contracts

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

Events use monotonically increasing sequence numbers within a run. Terminal
state transitions and approvals are idempotent. An approved record can execute
only if its current action ID, version, parameter hash, target snapshot, and
risk classification still match.

Persisted `params` must be canonical JSON and must not contain passwords,
tokens, cookies, private keys, recovery codes, or equivalent values. An action
that legitimately needs a credential references an existing OS-keychain
handle. Secret handles are never shown in approval copy or diagnostics, and
approval never authorizes revealing the referenced secret to the model.

## 7. Components and Ownership

### 7.1 `jarvis/identity`

Owns:

- `JARVIS_IDENTITY_VERSION`;
- immutable security and response-contract text;
- written and voice delivery policies derived from the same rule object;
- protected-field validation;
- known historical built-in prompt hashes;
- separation of immutable core from user custom instructions.

It does not own SOUL memory content, tool policy, or model selection.

### 7.2 `jarvis/profiles`

Owns the minimal profile boundary needed by the kernel:

- active profile;
- protected identity revision reference;
- user-authorized custom instructions;
- SOUL revision reference for later use;
- memory-scope settings;
- default surface preferences.

Kernel v1 seeds one protected default profile. Full profile editing and SOUL
proposal workflows are deferred.

### 7.3 `jarvis/sourcePolicy`

Owns automatic source admission, sensitivity classification, and safe
summaries.

Automatic scanning must deny, at minimum:

- `.env`, `.env.*`, and similarly named environment files;
- private keys, certificates with private material, recovery codes, credential
  exports, keychain exports, and browser cookie stores;
- `.npmrc`, `.pypirc`, cloud credential directories, and provider credential
  files when they can contain tokens;
- files rejected by the existing size, binary, or path-containment rules.

Explicit user attachment does not silently bypass this policy. A restricted or
secret source is either rejected or requires a separate, visible per-request
consent flow. The first slice may fail closed rather than implement the later
consent UI.

### 7.4 `jarvis/capabilitySnapshot`

Takes immutable snapshots from the existing action registry, model-selection
state, provider catalog, plugins, MCP servers, terminals, agents, and
entitlement source.

It does not infer an operation from marketing metadata. Capability-only plugin
responses remain `planned` or `available`, not `completed`.

### 7.5 `jarvis/promptCompiler`

Purely compiles an envelope into deterministic layers. It:

- validates the JARVIS-only gate;
- enforces layer order;
- filters secrets;
- applies per-layer and total budgets;
- records every included and excluded source;
- removes duplicate identity and All About Me injection;
- emits hashes and safe diagnostics;
- never reads global stores itself.

All store access happens in the envelope builder. This keeps compilation
deterministic and testable.

### 7.6 `ai/providerPromptTransport`

Every provider connection declares one transport strategy:

- `native-system`: transmit the compiled system text through the provider's
  real system/developer-message mechanism;
- `prefixed-preamble`: for approved CLIs without a native system channel,
  prepend an explicitly delimited compiled contract to the provider prompt;
- `unsupported`: reject JARVIS execution with a truthful error.

No strategy may ignore `CompiledJarvisPrompt.systemText`. Tests inspect the
constructed request for each registered adapter. External CLI capabilities
must reflect the selected strategy truthfully.

### 7.7 `jarvis/responsePipeline`

The response pipeline has five stages:

1. **Tokenization:** split prose from immutable structured regions.
2. **Classification:** determine response mode from the user request and
   verified run state, not model intuition alone.
3. **Linting:** inspect prose only for style, unsupported state claims, prompt
   leakage, secret requests, generic AI disclaimers, excessive filler, emoji,
   and mode-specific length violations.
4. **Repair:** perform at most one bounded repair of prose only. The repair
   request cannot invoke tools and receives immutable facts and state.
5. **Formatting:** build verified display and spoken text, action narration,
   message parts, and the final envelope.

During streaming, a separate incremental preview gate may expose only complete
or safely bounded prose that has passed secret, prompt-leak, and structured
fence checks. Incomplete fenced content and any failing segment remain hidden
until final normalization. The preview is replaceable UI state, is never
spoken, and is never the canonical stored response.

Deterministic state templates override model narration for approval, running,
success, partial, failure, cancellation, timeout, model-switch, and connector
availability states.

If repair fails:

- style-only violations use deterministic text transformations;
- action-state conflicts use verified state templates;
- suspected secret or hidden-prompt leakage is quarantined and replaced by a
  truthful retry message;
- structured regions and artifacts remain unchanged.

### 7.8 `voice/speechGate`

Streaming provider text is not speech-ready text.

The speech gate may speak a streaming segment only when it is:

- a complete prose sentence;
- outside code and structured fences;
- free of secret and prompt-leak signals;
- compatible with the classified response mode;
- consistent with the current verified execution state;
- accepted by the deterministic linter.

Any failing or incomplete segment remains buffered. At completion, TTS receives
only `JarvisResponseEnvelope.spokenText`. Long outputs speak a concise summary;
code, JSON, raw URLs, and large paths are not read aloud.

### 7.9 `jarvis/executionJournal`

The journal is the sole canonical lifecycle source for migrated JARVIS flows.
It provides:

- account-scoped repositories;
- append-only ordered events;
- valid state-transition enforcement;
- abort-controller registration and real cancellation propagation;
- approval consumption;
- artifact registration;
- selectors for transcript, Outputs, and Live Systems;
- bounded retention and safe recovery after restart.

Legacy stores become compatibility projections, not competing truth sources.

### 7.10 `jarvis/artifactNormalizer`

Normalizes verified outputs from files, links, provider results, terminal
commands, plugins, MCP tools, schedules, and later browser runs.

An artifact must have a real URI, content payload, or executor result. A source
attachment is not an output. A capability-only acknowledgement is not an
artifact.

### 7.11 `jarvis/approvalEngine`

The first slice consolidates the approval data contract and validation rules.
Existing action cards may remain visually unchanged.

The engine:

- computes risk from the registered action definition;
- stores exact non-secret parameters and the target snapshot;
- replaces legitimate credential values with OS-keychain handles before
  persistence;
- rejects model-provided secret values instead of approving or storing them;
- redacts sensitive non-secret fields in presentation and diagnostics without
  changing the validated execution payload;
- expires stale approvals;
- revalidates capability, entitlement, parameters, target, and risk at
  consumption;
- consumes an approval at most once;
- never treats approval as completion.

Browser Operator remains unavailable to JARVIS until it uses this contract and
preserves full parameters.

### 7.12 Thin Command Center proof

The first slice adds the minimum real shell required to prove the contracts:

- collapsed and expanded state;
- a voice-session-bound transcript;
- exactly two lower tabs: `Outputs` and `Live Systems`;
- active model and run state from immutable snapshots;
- real cancellation when an executor supports it;
- quiet truthful empty states;
- no fake nodes, rotating networks, unavailable connectors, or synthetic
  artifacts.

The shell uses existing application theme tokens. It does not implement the
final Origami Chat visual treatment.

## 8. Data Flow

### 8.1 Typed JARVIS chat

1. Composer persists the user message as it does today.
2. Runtime resolves the built-in JARVIS and creates a run.
3. Envelope builder snapshots identity, profile, model, capabilities, and
   context exactly once.
4. Compiler produces the prompt and safe diagnostics.
5. Transport sends it using the declared strategy.
6. Provider deltas pass the incremental preview gate before updating
   replaceable UI preview text and run progress.
7. The final response passes through the response pipeline.
8. Final message parts and the response envelope are persisted.
9. Artifacts and events update Command Center selectors.

### 8.2 Voice

Voice uses the same request path. `voiceSessionChatId` is captured when the
voice session starts and is not replaced by unrelated route or Workbench chat
selection. The same response envelope supplies the visible transcript and TTS.

### 8.3 Scheduled JARVIS work

The schedule runner snapshots the saved model selection, identity version, and
profile revision at dispatch. Schedule output uses a concise schedule response
mode. A schedule trigger creates a run; it does not bypass approval for later
side effects.

### 8.4 Hive

Internal Hive steps may retain specialist/provider voices in their hidden or
inspectable step records. The final user-facing response is compiled and
enforced through the JARVIS final-response path with a `hive_final` surface.

### 8.5 Deterministic actions

Action proposals create approval records. Execution produces journal events
and artifacts. Cancellation propagates to the actual executor when supported;
otherwise the UI truthfully reports that cancellation could not be delivered.

## 9. Persistence and Migration

### 9.1 Dexie v3

The migration is additive. V1 and V2 schema definitions remain immutable.

Proposed V3 stores:

```ts
jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at';

jarvis_profiles: 'id, account_id, [account_id+active], updated_at';

jarvis_runs: 'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]';

jarvis_events: '[run_id+seq], run_id, type, status, created_at';

jarvis_approvals: 'id, run_id, status, params_hash, created_at';

jarvis_artifacts: 'id, run_id, kind, created_at';
```

Source references remain embedded in events, context packs, and artifacts in
v1. A separate source table may be introduced only when Context Map v2 proves
it is required.

Domain contracts use camelCase. Persistence rows use the repository's existing
snake_case convention, with explicit mapper functions at the repository
boundary. UI and runtime code do not depend on Dexie row shapes directly.

### 9.2 Identity migration

Migration targets only the built-in agent where:

```ts
agent.builtin === true && agent.slug === 'jarvis';
```

It must not target a user-created agent based on display name.

Rules:

1. Seed the protected identity revision exactly once.
2. Seed one default profile per account exactly once.
3. Compare the existing built-in prompt with known shipped prompt hashes.
4. If it matches a known shipped prompt, do not preserve it as custom
   instructions.
5. If it differs, preserve the complete text as a labelled
   `legacy_user_extension` below immutable policy.
6. Preserve the selected provider, model, tool allowlist, permissions,
   capabilities, memory scope, and user-created agents.
7. Change an existing temperature only if it exactly matches a known old
   shipped default; otherwise preserve it.
8. Record migration completion and source hashes so repeated runs are
   idempotent.

The immutable identity lives in versioned kernel data, not in the mutable
`Agent.system_prompt` column. The existing column remains readable for
compatibility during migration.

### 9.3 Run migration

Historical chat messages remain unchanged. Kernel v1 does not fabricate runs
for all old chats.

- New migrated flows write canonical runs and events.
- Existing `JarvisTaskRun` records may be exposed through a read-only legacy
  adapter.
- No old task run is rewritten until a later explicit migration.
- Message parts remain backward compatible.

### 9.4 Local-only privacy

The new repositories do not call the generic sync queue in v1. No identity,
profile, prompt, run event, approval payload, artifact content, or private
source excerpt is uploaded.

Future cloud sync requires:

- explicit opt-in;
- server-authoritative entitlement;
- per-field data classification;
- encryption design;
- deletion reconciliation;
- retention controls;
- separate migration and threat-model approval.

## 10. Immediate Safety Interlocks

These fixes ship with the kernel and are not feature flags:

### 10.1 Secret sources

Automatic Context scans deny secret-bearing paths and content. Existing project
selection and ordinary text/media scanning remain available.

### 10.2 Browser Operator

JARVIS cannot execute Browser Operator actions until the approval record
contains exact parameters and a revalidated target snapshot. Manual browser
use remains available. Unsupported browser actions report unavailable rather
than “completed.”

### 10.3 Entitlements

Remove client-side hard-coded email authority. Entitlement snapshots come from
verified server state or a clearly marked local-development state that cannot
unlock production billing or admin operations.

This does not implement the complete VibeSpace Access product.

### 10.4 Private sync

Kernel repositories remain local-only and generic memory/profile sync is
prevented from silently expanding to the new private tables.

### 10.5 Prompt transport

Any JARVIS provider connection that cannot preserve the compiled contract fails
closed with a truthful, actionable error. There is no silent downgrade to
provider personality.

## 11. Compatibility Strategy

### 11.1 Existing UI and messages

The response envelope maps back to existing `Part[]` message structures.
Question, plan, permission, action, stack-step, image, and text parts remain
readable. No chat-history rewrite is required.

### 11.2 Existing runtime

Refactor `app/src/lib/ai/runtime.ts` into orchestration code that calls focused
kernel modules. It must no longer own independent copies of identity,
capability, context, response, or voice policy.

### 11.3 Existing prompt layers

`app/src/lib/jarvis/promptLayers.ts` is either replaced by or reduced to a
compatibility export from the new compiler. There will not be two production
prompt architectures.

### 11.4 Existing activity and task runs

During transition:

- the execution journal is canonical for migrated JARVIS flows;
- a projection adapter may feed existing timeline/card components;
- old stores remain readable for historical items;
- new code cannot independently write semantically duplicate terminal states.

### 11.5 Non-JARVIS agents

Other agents keep their existing personas and generic response style. They may
use the shared model, source, run, artifact, and approval contracts without
receiving the JARVIS identity or JARVIS prose enforcer.

## 12. Error Handling

| Failure                            | Required behavior                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Envelope validation fails          | Do not call a provider; persist a safe failed run and show a precise local error.                         |
| Secret source detected             | Exclude it, record a safe exclusion reason, and never log its content.                                    |
| Context budget exceeded            | Deterministically rank and truncate; record omitted source refs.                                          |
| Provider drops system contract     | Fail closed before dispatch.                                                                              |
| Provider unavailable or signed out | Use exact connection state; do not silently switch models.                                                |
| Stream interrupted                 | Preserve safe provisional text as partial only when it passes sanitization; mark run failed or cancelled. |
| Structured block malformed         | Preserve it for diagnosis, do not execute it, and show a structured validation error.                     |
| Response style violation           | Repair prose once or use deterministic formatting.                                                        |
| Unsupported success claim          | Replace status narration with the verified run template.                                                  |
| Approval stale or mismatched       | Deny consumption and require a new approval.                                                              |
| Executor ignores cancellation      | Report cancellation delivery failure; do not mark cancelled until verified.                               |
| Artifact target missing            | Keep the run result but do not create a fake artifact.                                                    |
| Journal write fails                | Stop dependent mutations when safe; retain the user message and surface a recovery error.                 |
| Migration fails                    | Abort V3 activation, preserve V2 data, and offer retry/rollback diagnostics.                              |

## 13. Observability

Development diagnostics may include:

- request ID and run ID;
- identity/profile revision IDs;
- model and connection IDs;
- layer IDs, sizes, truncation flags, and hashes;
- state transitions;
- artifact IDs and kinds;
- sanitized timing and error codes.

Diagnostics must not include:

- prompt or source contents;
- secrets or approval payloads;
- private file paths when a safe label is sufficient;
- cookies, tokens, command secrets, or hidden model reasoning;
- raw SOUL, USER, MEMORY, or All About Me text.

The Command Center displays user-safe summaries, not internal logs.

## 14. Performance Budgets

Kernel v1 targets:

- envelope validation and prompt compilation: p95 under 25 ms excluding
  context retrieval;
- deterministic response classification and linting: p95 under 15 ms for
  ordinary replies;
- no additional provider call when lint passes;
- at most one repair call per final response;
- no graph layout work while Command Center is collapsed;
- bounded journal selectors and no unbounded in-memory event arrays;
- lazy loading for expanded Live Systems;
- prompt and context budgets enforced before provider dispatch;
- no regression to terminal, voice-capture, or chat input responsiveness.

Performance tests record sanitized sizes and durations only.

## 15. Testing Strategy

### 15.1 Contract tests

- request envelope validation;
- deterministic layer order and hashes;
- JARVIS-only identity gate;
- context trust and sensitivity labels;
- duplicate immutable-layer rejection;
- source exclusion and budget behavior;
- model and capability snapshot immutability;
- run state-machine transitions;
- ordered event sequences;
- approval idempotency and parameter-hash validation;
- artifact source/output distinction.

### 15.2 Prompt construction tests

Verify:

- typed and voice JARVIS share the same identity source;
- schedule and Hive final use the same contract;
- non-JARVIS agents do not receive the JARVIS identity;
- current model selection remains intact;
- user extensions appear once in the correct authority layer;
- All About Me appears once;
- lower-trust context cannot replace immutable rules;
- `.env*` and credential files are excluded;
- action schemas and Ask/Plan/Agent requirements remain present.

### 15.3 Provider transport tests

For every registered provider adapter:

- inspect the constructed request;
- prove the system contract is transmitted natively or through the approved
  preamble strategy;
- prove unsupported connections fail closed;
- preserve exact model and connection selection;
- preserve cancellation where advertised;
- never claim unsupported tools, images, files, or system-prompt support.

No live API call is required for construction tests.

### 15.4 Response tests

Fixtures cover:

- greeting;
- direct answer;
- clarification;
- warning and sensitive topics;
- approval required;
- running, success, partial, failure, cancellation, and timeout;
- model switch and unavailable model;
- plugin/MCP available versus connected versus unavailable;
- terminal queued versus running versus completed;
- schedule output;
- delegation and Hive final;
- long-form artifact;
- structured blocks mixed with prose;
- code, citations, URLs, tables, diffs, and quoted text;
- secret request and hidden-prompt leakage;
- repair failure and deterministic fallback.

Assertions include:

- structured regions remain byte-for-byte equivalent;
- verified action state cannot be changed by prose;
- ordinary JARVIS replies normally meet the configured mode policy;
- `spokenText` preserves severity and truth state;
- raw provider deltas never reach TTS.

### 15.5 Migration tests

- fresh V3 database;
- V1 to V3 and V2 to V3;
- existing rows preserved exactly;
- protected identity seeded once;
- default profile seeded once per account;
- repeat migration is idempotent;
- known built-in prompt upgraded;
- edited built-in prompt preserved as legacy extension;
- user-created agent untouched;
- provider/model/tools/permissions preserved;
- failure rolls back without deleting V2 data.

### 15.6 Integration tests

- typed chat end to end;
- voice-session transcript isolation;
- speech gating and final spoken summary;
- schedule dispatch;
- Hive final response;
- deterministic action approval and actual cancellation;
- artifact creation and Command Center selectors;
- route changes and restart recovery;
- account switching and data isolation.

### 15.7 Regression and build gates

At implementation completion, run at minimum:

- `npm run typecheck`;
- `npm --prefix app test`;
- `npm run test:release-manifest`;
- `npm run build`;
- focused Rust tests and `cargo check` for touched native code;
- `git diff --check`;
- added-line secret scan;
- manual Tauri smoke tests for typed chat, voice, cancellation, restart, and
  Command Center.

A test not run is `NOT_RUN`, never `PASS`.

## 16. Rollout

Implementation uses these stages:

1. **Contracts and repositories:** types, validators, Dexie v3, migrations,
   tests.
2. **Safety interlocks:** secret source policy, prompt transport enforcement,
   browser quarantine, client entitlement cleanup.
3. **Shadow compilation:** build and compare envelopes without changing
   provider output; record only safe diagnostics.
4. **Typed JARVIS cutover:** request compiler and response pipeline become
   canonical for built-in JARVIS chat.
5. **Voice cutover:** session binding, speech gate, and spoken response.
6. **Schedule and Hive final cutover.**
7. **Execution journal bridge:** actions, approvals, cancellation, artifacts.
8. **Thin Command Center proof.**
9. **Full verification and written evidence.**

The kernel may have an emergency compatibility flag during rollout. Safety
interlocks are not disabled by that flag. Once all migrated paths pass, remove
the legacy JARVIS prompt and response path instead of maintaining permanent
dual implementations.

## 17. Rollback

Rollback is additive and ordered:

1. Disable kernel routing through the emergency compatibility flag.
2. Keep secret-source, entitlement-authority, and unsafe Browser Operator
   protections enabled.
3. Revert Command Center projections.
4. Revert runtime bridges.
5. Revert response and prompt modules.
6. Leave V3 stores intact but unused; never downgrade IndexedDB by deleting
   user data.
7. If needed, ship a forward migration that repairs V3 metadata.

No rollback step deletes chats, agents, profiles, runs, approvals, artifacts,
or user custom instructions.

## 18. Downstream Contract Commitments

Later goal implementations must consume these kernel contracts:

| Goal family     | Kernel commitment                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JRI             | Identity, prompt compiler, response mode, linter, repair, state templates, display/spoken split.                           |
| JCC             | Runs, events, artifacts, model snapshots, transcript binding, Outputs and Live Systems selectors.                          |
| SOUL            | Profile and revision references under immutable security and identity authority.                                           |
| Context Map     | `JarvisContextPack` and `JarvisSourceRef` with sensitivity, trust, provenance, and exclusions.                             |
| Prompt Forge    | Compiler API, prompt hashes, model snapshots, run records, and prompt artifacts.                                           |
| Infinite Canvas | Run and artifact references; Canvas state remains its own domain model.                                                    |
| Browser Chat    | Provider transport, context, approvals, runs, and artifacts; remains distinct from Browser Operator.                       |
| Access          | Server-authoritative entitlement snapshot and capability gating.                                                           |
| Origami Chat    | Existing message-part compatibility plus kernel activity/artifact data; visual authority remains the supplied target pack. |

Goal-specific systems may extend these contracts with versioned optional fields.
They may not create parallel canonical prompt, approval, run, or artifact
systems.

## 19. Requirement Mapping

Stable kernel requirements:

| ID      | Requirement                                                                          | Upstream families            |
| ------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| SIK-001 | One immutable, versioned JARVIS identity and profile boundary.                       | JRI, SOUL                    |
| SIK-002 | One typed request envelope and deterministic prompt compiler.                        | JRI, SOUL, CTX, PF, BCHAT    |
| SIK-003 | Every provider preserves the compiled contract or fails closed.                      | JRI, BCHAT                   |
| SIK-004 | One typed response envelope with deterministic response modes.                       | JRI, JCC                     |
| SIK-005 | Prose-only enforcement preserves structured and artifact content.                    | JRI                          |
| SIK-006 | TTS receives only validated spoken text.                                             | JRI, JCC                     |
| SIK-007 | One account-scoped run/event journal with real cancellation state.                   | JCC, SOUL, PF, CANVAS, BCHAT |
| SIK-008 | One exact, idempotent approval contract.                                             | JCC, SOUL, BCHAT, ACCESS     |
| SIK-009 | One verified artifact contract that separates sources from outputs.                  | JCC, PF, CANVAS, BCHAT       |
| SIK-010 | One provenance and sensitivity vocabulary.                                           | CTX, SOUL, JCC, PF           |
| SIK-011 | Automatic secret-file scanning fails closed.                                         | CTX, BCHAT                   |
| SIK-012 | Client identity cannot grant production admin or paid access.                        | ACCESS                       |
| SIK-013 | Private kernel records remain local-only in v1.                                      | SOUL, ACCESS                 |
| SIK-014 | Existing chats, agents, tools, model selection, and message parts remain compatible. | All                          |
| SIK-015 | Thin Command Center proves real transcript, outputs, and execution state.            | JCC                          |
| SIK-016 | Later goals extend rather than duplicate shared contracts.                           | All                          |

The unified program’s complete requirement matrix remains a separate required
artifact under `docs/unified-goals/REQUIREMENTS_MATRIX.md`. This design does not
claim that the remaining goal families are complete.

## 20. Acceptance Criteria

The Shared Intelligence Kernel v1 slice is complete only when all of the
following are proven:

### Architecture

- one production prompt compiler exists;
- one production response pipeline exists;
- no production JARVIS prompt source can drift independently;
- typed, voice, schedule, and Hive final use the kernel;
- non-JARVIS agents remain behaviorally isolated;
- provider request construction proves contract preservation;
- canonical run, approval, artifact, and source-ref repositories are real.

### Truth and safety

- automatic Context scans do not read `.env*` or credential files;
- retrieved content cannot override immutable rules;
- pending work cannot be narrated as complete;
- catalog-only connectors cannot appear operational;
- Browser Operator cannot replay an approval without exact parameters;
- raw streaming text cannot reach TTS;
- client email cannot grant production entitlement;
- private kernel tables do not enter generic cloud sync.

### Persistence

- V2 data survives the V3 migration;
- identity and profiles are account-scoped and idempotent;
- custom built-in JARVIS instructions are preserved separately;
- runs and artifacts survive route changes and supported restart scenarios;
- cancellation and terminal states recover truthfully.

### User experience

- ordinary JARVIS replies remain recognizable across model switches;
- existing chat history and structured cards render correctly;
- voice uses the same identity and truth state as typed chat;
- Outputs contains only real artifacts;
- Live Systems contains only real active or completed nodes;
- empty, partial, error, cancelled, and unavailable states are explicit;
- no full application or Origami visual redesign occurs in this slice.

### Verification

- all focused tests pass;
- repository typecheck, app tests, build, and applicable Rust checks pass;
- manual Tauri smoke tests pass;
- migration and rollback evidence is written;
- no secrets or unrelated changes appear in the diff;
- no merge or deployment is claimed without separate approval.

## 21. Implementation Boundaries

Likely implementation surfaces include:

```text
app/src/lib/jarvis/
  identity.ts
  profiles/
  requestEnvelope.ts
  promptCompiler.ts
  sourcePolicy.ts
  capabilitySnapshot.ts
  responseModes.ts
  responsePipeline.ts
  responseTemplates.ts
  executionJournal/
  approvalEngine.ts
  artifactNormalizer.ts

app/src/lib/ai/
  runtime.ts
  router.ts
  providerPromptTransport.ts
  adapters/

app/src/features/voice/
  streamingVoice.ts
  speechGate.ts
  voiceChatRouting.ts

app/src/features/jarvis-command-center/
  types.ts
  selectors.ts
  JarvisCommandCenter.tsx
  JarvisOutputsTab.tsx
  JarvisLiveSystemsTab.tsx

app/src/lib/db/
  schema.ts
  index.ts
  repositories.ts

app/src/features/context/
  tree.ts

app/src/features/browser/
  browserActions.ts
  BrowserPage.tsx

app/src/lib/
  entitlements.ts
```

This list guides planning; it is not permission for broad refactoring. The
implementation plan must assign exact files, tests, migrations, verification
commands, ownership, and rollback checkpoints before product edits begin.

## 22. Design Review Gate

This written specification requires explicit user review. After approval, the
next action is to invoke the `writing-plans` workflow and produce a detailed
implementation plan. Product implementation remains prohibited until that
plan exists and its execution gates are satisfied.
