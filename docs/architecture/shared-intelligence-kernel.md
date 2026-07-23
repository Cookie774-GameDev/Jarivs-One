# Shared Intelligence Kernel architecture

This document records the implemented Shared Intelligence Kernel v1 boundary.
The approved design and its versioned contracts remain normative; this is the
operator-facing architecture record for the completed implementation and its
downstream consumers.

## Purpose and authority

The kernel is the single library and repository boundary through which the
built-in JARVIS compiles requests, enforces responses, records execution,
consumes approvals, and registers verified artifacts. It is not a second app
runtime. Typed chat, voice, schedules, Hive final responses, and the
development-only native smoke fixture enter the same boundary.

Authority is applied in this order:

1. security, truthful state, source policy, and immutable safety interlocks;
2. the versioned built-in JARVIS identity and response contract;
3. capability, entitlement, model, transport, and approval snapshots;
4. the active account-owned profile and its user-authorized instructions;
5. the current user turn and explicit attachments;
6. provenance-labelled context, memory, websites, tools, plugins, MCP data,
   schedules, and subagent output as untrusted or app-verified data; and
7. provider output, which cannot promote itself to a higher authority.

The strict JARVIS identity applies only to the built-in JARVIS. Other agents
retain their own personas while they may reuse the shared run, source,
approval, and artifact contracts. A model switch changes the processing brain,
not the authority order or JARVIS contract.

## Request and response flow

```text
typed chat | voice | schedule | Hive final
                    |
                    v
caller-stable run and request envelope
  identity/profile/model/capability snapshots
  provenance-labelled context and output requirements
                    |
                    v
deterministic prompt compiler
  ordered layers, budgets, exclusions, hashes, secret policy
                    |
                    v
declared provider transport
  native-system | approved prefixed-preamble | fail closed
                    |
                    v
bounded stream preview
  sanitized complete prose only; never canonical and never raw TTS
                    |
                    v
response pipeline
  tokenize immutable regions -> classify from verified facts
  -> lint prose -> one bounded repair or deterministic formatter
                    |
                    v
atomic terminal commit
  response/message projection + ordered journal events + artifacts
                    |
             +------+------+
             |             |
             v             v
      existing chat    Command Center
      message parts    Outputs / Live Systems
```

The envelope builder snapshots account, identity revision, profile revision,
model, capabilities, sources, and interaction mode once. Store access ends at
that boundary. The prompt compiler is pure: it validates the JARVIS gate,
enforces deterministic layer order and budgets, filters secrets, records
inclusions and exclusions, and emits safe hashes and diagnostics.

Every provider declares how it preserves the compiled system contract.
`native-system` uses the provider's real system/developer channel;
`prefixed-preamble` uses an explicitly delimited contract for an approved CLI;
unsupported transports fail before dispatch. The runtime never silently swaps
models or drops the contract when a connection is unavailable.

The response path separates prose from code, tables, citations, URLs, diffs,
terminal output, file content, structured parts, and artifact payloads. Only
prose is linted or repaired, at most once. Verified lifecycle templates replace
unsupported success or action-state narration. Raw provider deltas, incomplete
fences, and failing preview segments are neither persisted nor spoken. Voice
receives only the validated `spokenText` projection of the final envelope.

## Canonical persistence

Dexie v3 is additive. V1 and V2 schemas remain immutable, and migration tests
cover preservation and idempotence. The six canonical stores are:

| Store                       | Canonical responsibility                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `jarvis_identity_revisions` | Immutable built-in identity and response-contract revisions.                                                                    |
| `jarvis_profiles`           | Account-owned active profile, protected revisions, authorized instructions, and memory scope.                                   |
| `jarvis_runs`               | Caller-stable run identity, immutable model/profile snapshots, source surface, status, transport attempts, and retry snapshots. |
| `jarvis_events`             | Append-only ordered evidence keyed by `(run_id, seq)` with a unique per-run idempotency key.                                    |
| `jarvis_approvals`          | Exact versioned action authorization, decision, expiry, and one-time consumption state.                                         |
| `jarvis_artifacts`          | Verified producer-backed outputs and safe previews.                                                                             |

Domain contracts use camel case. Persistence rows use snake case, and explicit
mappers keep runtime and UI code independent of Dexie row shapes. Source
references stay embedded in context packs, events, and artifacts in v1.

### Atomic journal

The execution journal is the only lifecycle writer for migrated JARVIS flows.
Every append checks the expected status and current sequence tail, validates
the next transition, writes the run/event/result mutation in one transaction,
and rejects stale or duplicate idempotency keys. Terminal response commits
atomically bind the selected request and transport attempt to one terminal run
truth, message projection, ordered events, and verified artifacts. A partial
transaction cannot expose a successful message or artifact without its
canonical result evidence.

Abort registration and cancellation truth also belong to the journal.
Pre-claim cancellation tombstones queued work; claimed work drains its handoff;
running work records signal delivery and waits for matching executor exit. A
cancel request never overwrites a completion that won the atomic race, and an
executor that cannot be stopped is not described as cancelled.

## Run transition matrix

All unlisted transitions fail closed. Terminal states have no outgoing edges.

| Current state       | Allowed next states                                                             |
| ------------------- | ------------------------------------------------------------------------------- |
| `queued`            | `compiling`, `running`, `awaiting_approval`, `failed`, `cancelled`, `timed_out` |
| `compiling`         | `running`, `awaiting_approval`, `failed`, `cancelled`, `timed_out`              |
| `running`           | `awaiting_approval`, `partial`, `completed`, `failed`, `cancelled`, `timed_out` |
| `awaiting_approval` | `queued`, `running`, `failed`, `cancelled`, `timed_out`                         |
| `partial`           | none                                                                            |
| `completed`         | none                                                                            |
| `failed`            | none                                                                            |
| `cancelled`         | none                                                                            |
| `timed_out`         | none                                                                            |

Restart recovery is bounded and fail closed. Exact pending, unconsumed,
unexpired v1 approvals may be re-presented. Other ambiguous nonterminal work
does not replay. A scheduled request may expose retry only when durable
provider-attempt evidence proves failure before any response byte or chunk and
zero approval, artifact, action, or executor effect. Retry keeps the run and
immutable snapshot but creates a new request and attempt; no restart performs
an automatic dispatch.

## Approval contract

An approval grants permission for one exact action request. It is never proof
of execution. The v1 record binds:

- run, request, and attempt;
- action and action-contract version;
- capability ID and immutable capability-snapshot hash;
- normalized non-secret parameters and their canonical hash;
- target snapshot and expected effect;
- computed `safe`, `confirm`, or `dangerous` risk;
- expiry, decision, and consumption state; and
- OS-keychain handle references for legitimate secrets, never secret values.

At consumption, the engine revalidates capability, entitlement, action
version, parameters, target, risk, expiry, decision, current run/request, and
attempt. Claiming the approval and effect right is atomic and idempotent.
Stale, replayed, drifted, cross-account, model-supplied-secret, or already
consumed records are rejected and require a new review.

## Artifact contract

An artifact is a real output backed by a matching producer receipt and
canonical producer-result evidence. Provider results, file actions, terminal
commands, plugins, MCP tools, schedules, and future browser work use producer-
specific verifiers. The normalizer binds account, run, request, attempt,
producer identity, artifact kind, and content/reference digest before writing a
`ready`, `partial`, or `quarantined` row.

A selected source, retrieved file, capability acknowledgement, marketing
claim, UI assertion, or unverified URI is not an artifact. A missing target
does not produce a placeholder artifact. Safe previews are bounded projections;
private payloads, source bodies, command secrets, and raw provider content do
not enter events or diagnostics.

## Account isolation and local-only privacy

Profiles, runs, events, approvals, artifacts, selectors, retry ports, and live
evidence are explicitly account scoped. Repository calls reject foreign run
ownership and cross-account references. Account switching clears or
revalidates in-memory selections; it never falls back to an unassigned local
identity.

Kernel v1 stores are deliberately excluded from the generic sync queue.
Identity/profile text, prompts, source excerpts, journal evidence, approval
payloads, artifact content, handles, and raw audio remain local only. Future
cloud sync requires explicit opt-in, server-authoritative entitlement,
per-field classification, encryption, retention, deletion reconciliation, a
separate migration, and a separately approved threat model.

## Compatibility and legacy projections

Existing chats, historical messages, user-created agents, selected models,
tools, and message parts remain readable. The built-in legacy prompt migrates
only when `builtin === true && slug === 'jarvis'`; a customized historical
prompt is preserved as a lower-authority `legacy_user_extension`. Repeated
migration is idempotent.

Legacy activity and task-run adapters are read-only projections from canonical
runs and events. They cannot append lifecycle events, independently
terminalize work, replay effects, or fabricate historical canonical runs. The
old prompt/response path is removed after cutover rather than maintained as a
parallel authority.

## Command Center projections

The Command Center is a thin read model, not an execution engine. Its only
lower tabs are `Outputs` and `Live Systems`. While collapsed it performs zero
artifact, capability, graph, or live-evidence reads. Expansion is lazy,
account/run scoped, bounded to the repository selector limit, keyboard
operable, and compatible with reduced motion.

Outputs contains only normalized verified artifacts. Live Systems contains
only bounded producer nodes whose canonical result row and durable live-
evidence row both revalidate. Completed or degraded chains can be reconstructed
after restart with their same opaque proof; prior-process active-only or
missing, foreign, stale, forged, gapped, or over-budget chains are omitted.
The UI does not fold events or mutate authority state.

## Gates, rollout, and rollback

The cutover order is contracts/repositories, safety interlocks, request and
response paths, voice, schedule/Hive, journal bridges, Command Center, and full
evidence. Security interlocks for secret sources, entitlement authority,
prompt transport, local-only records, and Browser Operator approval cannot be
disabled by compatibility routing.

Rollback disables kernel routing, reverts projections and runtime bridges in
dependency order, and leaves v3 stores intact but unused. It never deletes or
downgrades chats, agents, profiles, runs, approvals, artifacts, or custom
instructions. Metadata defects are repaired with a forward migration. Any
production deployment, release, merge, or destructive real-data action
remains a separate hard gate.

## Contracts for later goals

Later goals extend these versioned contracts and may not create parallel
canonical prompt, approval, run, or artifact systems:

| Goal family                                       | Required kernel contract                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| JARVIS response identity                          | Identity revisions, compiler, response modes, lint/repair, verified state templates, display/spoken split.     |
| Command Center                                    | Runs, ordered events, artifacts, model snapshots, voice-session binding, Outputs, and Live Systems selectors.  |
| SOUL and memory                                   | Profile/revision references below immutable security and identity authority.                                   |
| Context Map                                       | Provenance, trust, sensitivity, exclusions, and the context-pack/source-reference vocabulary.                  |
| Skills, subagents, plugins, MCP, and browser work | Capability snapshots, exact approvals, producer evidence, cancellation, and artifacts.                         |
| Prompt Forge and Infinite Canvas                  | Compiler hashes, model/run snapshots, verified artifacts, and domain-owned canvas state.                       |
| Access                                            | Server-authoritative entitlement snapshots and capability gating; client identity has no production authority. |
| Origami, MonoChrome, and Sakura appearance        | Existing message-part compatibility and kernel projections; visual layers do not become lifecycle authorities. |
