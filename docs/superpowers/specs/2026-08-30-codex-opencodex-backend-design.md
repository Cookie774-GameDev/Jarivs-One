# Codex CLI + OpenCodex First-Class Chat Backend Design

Date: 2026-08-30  
Owner: `VS-CODEX-CODEX-OPENCODEX-BACKEND-20260830-36`  
Status: approved by the user's supplied milestone contract

## Outcome and non-negotiable boundary

VibeSpace gains `codex` beside the existing `opencode` backend. A chat chooses its backend before the first durably committed user message. That first message locks the choice permanently for that chat. Reload, reconnect, branch/duplicate, export/import, and crash recovery read the same durable authority. There is no inference and no fallback.

OpenCode behavior, the Chat shell, RLM, Context Gateway, SiYuan, permissions, execution journal, activity ledger, provider catalog, theme, and model controls remain the shared authorities. OpenCodex is only a loopback Responses API proxy below Codex; it does not own Chat messages, turns, sessions, permissions, or event projection.

```text
Chat backend authority (durable, immutable after first user message)
  |-- opencode -> existing OpenCode persistent adapter (unchanged)
  `-- codex    -> Codex structured protocol -> OpenCodex loopback provider proxy

Both -> one ProviderEvent contract -> one Chat runtime -> one chronology/activity UI
```

## Verified upstream contract

- Canonical upstream is `lidge-jun/opencodex`; stable release is `v2.36.0`, tag commit `c7d8407`, npm package `@bitkyc08/opencodex@2.36.0`.
- It is independent MIT software and is not affiliated with or endorsed by OpenAI or provider vendors.
- `ocx`/`opencodex` requires Node 18+, bundles Bun, defaults to loopback port 10100, and exposes `/healthz` plus `/readyz`.
- Machine gates include `ocx status --json`, `health --json`, and `ready --json --wait --timeout N`. Ready exits 0; non-ready exits 1; invalid arguments exit 64.
- OpenCodex can alter `$CODEX_HOME/config.toml`; VibeSpace must preserve and atomically restore existing configuration.
- Upstream publishes an npm package and source tag but no standalone SHA-256 manifest or package rollback authority. VibeSpace must pin an exact npm tarball integrity/hash, verify before extraction, atomically promote, retain last-known-good, and own rollback receipts.
- Upstream can route Ollama, use provider fallback/combo behavior, and prompt about starring its repository. VibeSpace disables Ollama and identity fallback for this backend, and never answers or bypasses the star-consent boundary.

## Durable backend authority

Canonical metadata is versioned:

```ts
type ChatBackend = 'opencode' | 'codex';

interface ChatBackendAffinityV1 {
  version: 1;
  backend: ChatBackend;
  locked: boolean;
  selectedAt: number;
  lockedAt?: number;
}
```

Rules:

1. Missing or invalid legacy metadata resolves deterministically to locked `opencode` for any chat that already has a committed user message, and unlocked `opencode` for a new empty chat.
2. Before the first committed user message, `/cli opencode` or `/cli codex` may replace the selection.
3. Committing the first user message atomically locks the existing selection. Readiness/install failure does not lock a chat because no user message was committed.
4. Once locked, a different backend is rejected with a typed error; selecting the same backend is idempotent.
5. Repositories enforce the transition. UI state and localStorage are never backend authority.
6. Branch/duplicate/export/import/recovery copy versioned affinity but never copy secrets or transient process/session ownership.

## Backend-specific slash commands

VibeSpace-local commands remain a separate catalog. `/cli` is a local backend selector/status command. Native CLI commands are read from a versioned, observed catalog for the selected backend, labeled with their source and capability. A locked OpenCode chat cannot execute Codex-native commands and vice versa. Unknown/stale commands fail closed.

`/cli` behavior:

- Empty chat: searchable selector with current backend, readiness, exact install review when needed.
- Locked chat: read-only status showing the immutable backend; switch arguments are rejected.
- The selector never changes provider/model/effort/Fast/CWD.

## Managed Codex/OpenCodex lifecycle

Use peer managers modeled on the managed OpenCode architecture, never an always-on general service:

1. Detect exact Codex CLI and OpenCodex versions without mutation.
2. Build one explicit review: artifact, version, upstream, destination, permissions, config backup/restore, process behavior, checksum provenance, rollback target.
3. After approval, download an exact artifact, verify registry integrity and VibeSpace SHA-256, extract into a staging directory, validate entrypoints/version/license, and atomically promote an `active.json` pointer.
4. Retain the prior known-good version and provide atomic reactivation plus a receipt.
5. Start only for a selected Codex chat, bind `127.0.0.1`, serialize ownership, and wait for both liveness and readiness.
6. Start structured Codex app-server/JSON transport against the ready proxy. Process generations isolate stale streams, cancellation, and restarts.
7. Bound logs, queue bytes, retries, and shutdown. Restore Codex config when VibeSpace ownership ends.
8. Reject any configuration/catalog entry resolving to Ollama or port 11434.

OpenCode's lifecycle and server state remain untouched.

## Provider and execution identity

Chat state retains only connection identifiers and backend affinity. Plaintext credentials never enter Chat records, OpenCodex metadata, arguments, logs, snapshots, receipts, or test evidence.

The bridge uses the existing account/workspace-scoped secret authority to lease one provider credential into the owned process environment or requires an explicit compatible OpenCodex login. The exact requested tuple is captured once per turn:

`account + workspace + project + backend + provider + model + effort + Fast + CWD + context revision`

Observed Codex/OpenCodex identity must equal it before tool execution and again in the terminal receipt. Incompatibility, unavailable bridge, stale lease, fallback, combo routing, or identity mismatch fails closed. No provider, account, model, effort, billing tier, backend, or CWD substitution is allowed.

## Structured event adapter

Codex is a `ProviderAdapter`, not a second runtime. The adapter owns:

- persistent chat-to-Codex-thread binding;
- incremental structured stream parsing;
- generation and event-sequence dedupe;
- replay/reconnect reconciliation;
- cancellation and crash recovery;
- exact identity and CWD verification;
- mapping into existing `ProviderEvent` variants.

Protocol-designated public text/progress and safe tool data map to the existing chronology. Hidden reasoning, raw environment, credentials, unsafe control sequences, restricted contents, and unbounded payloads are discarded or redacted before a `ProviderEvent` is emitted. Tool call IDs and event sequence IDs provide exactly-once projection.

## Ask, Plan, and Agent

- Ask invokes Codex with a read-only sandbox and rejects mutating tool/command requests at the transport boundary.
- Plan is read-only and emits the existing visible plan review. Only `Implement` creates a later authorized Agent turn; `Cancel` creates none.
- Agent uses existing VibeSpace permission profiles, run-scoped approvals, question cards, and denial paths.

UI-only restrictions are insufficient. Invocation policy and every mutating tool request are checked by the existing permission authority before execution.

## RLM, Context Gateway, and SiYuan

Both backends receive the same context lease, execution identity, citations, and receipts before provider dispatch. Codex does not introduce a Codex-only retrieval store. Explicit `/rlm` requirements fail closed when context preparation fails; project/worktree scope is preserved and citations remain durable across recovery.

## Recovery and truth

- Session binding persists separately from backend affinity; process ownership never does.
- Reconnect resumes from the last durable sequence and deduplicates replay.
- Crash recovery validates backend, generation, identity, and session/thread before resuming.
- Terminal state is based on a structured completion/error/cancel event, never process spawn or idle timeout alone.
- Errors state the exact failing boundary and expose a safe setup/retry/recovery action. No silent fallback.

## Ownership conflict matrix

| Surface | Current owner | This milestone action |
|---|---|---|
| `types/chat.ts`, Composer, Chat view/lifecycle | Chat handoff delivery | Start with new pure contract; integrate only after release/handoff |
| Chat activity ledger/console | Public activity task | Reuse after release; no parallel projection UI |
| OpenCode native server/transport | PR31 master continuation | Preserve unchanged; add separate Codex/OpenCodex peers later |
| Instant Command/Calyx | Instant catalog tasks | Keep `/cli` in Chat slash authority; do not alter global command engine |
| Official native CDP | Sole native controller | Coordinate one immutable-SHA acceptance run; never launch a competing app |

## Acceptance bar

Focused/unit/integration gates must pass with real exit 0, followed by typecheck, build, formatting, diff, and secret/security checks. Final acceptance uses the official native Tauri app via Playwright/CDP at one immutable SHA and proves both immutable backends, exact provider identity, Ask/Plan/Agent, events, approvals, cancellation, recovery, RLM/SiYuan, no secrets, no unexplained errors, and no Ollama process or port-11434 listener.

