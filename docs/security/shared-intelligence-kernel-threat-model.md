# Shared Intelligence Kernel threat model

This threat model covers Shared Intelligence Kernel v1 across typed chat,
voice, schedules, Hive final responses, actions, artifacts, local persistence,
and Command Center projections. It distinguishes implemented controls from
external test limitations; no blocked external row is treated as a product
PASS.

## Security objectives

- Preserve the immutable security/JARVIS authority order across every model,
  provider, context source, and surface.
- Never dispatch a provider that cannot preserve the compiled contract.
- Authorize only the exact reviewed action, then record executor truth rather
  than model or UI claims.
- Keep private kernel data, source bodies, credentials, handles, and raw audio
  out of sync, logs, speech, and public evidence.
- Prevent replay, cross-account access, duplicate effects, fabricated
  artifacts, and cancellation/completion state corruption.
- Keep development smoke hooks unreachable from production code paths.

## Assets

| Asset                                                   | Required protection                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Identity and response-contract revisions                | Integrity, version binding, and separation from mutable profiles.                                |
| Profile instructions and memory references              | Account isolation, local-only confidentiality, and lower authority than security policy.         |
| Request envelopes and compiled prompts                  | Integrity, provenance, secret exclusion, immutable snapshots, and no diagnostic content leakage. |
| Provider credentials and OS-keychain handles            | Values never enter model output, approvals, persistence, logs, artifacts, TTS, or evidence.      |
| Runs, ordered events, approvals, and transport attempts | Atomicity, monotonic ordering, idempotency, account ownership, and replay resistance.            |
| Executor state and cancellation signals                 | Accurate delivery/result truth and race-safe terminalization.                                    |
| Artifact content and producer receipts                  | Authenticity, digest/reference integrity, quarantine on mismatch, and source/output separation.  |
| Voice audio and transcript/session binding              | Raw-audio confidentiality and exact session/chat/run provenance.                                 |
| Command Center live evidence                            | Bounded reads, proof-chain authenticity, restart revalidation, and no UI write authority.        |
| Local app profile and native smoke evidence             | Strict containment, sanitized evidence, immutable process identity, and safe cleanup.            |

## Trust boundaries

1. **User and surface to kernel.** User input is authoritative for intent but
   does not override security, approvals, entitlement, or executor truth.
2. **Context and retrieval to envelope.** Project files, websites, memory,
   plugins, MCP data, tool output, schedules, and subagent output are data with
   explicit trust and sensitivity labels.
3. **Kernel to provider/CLI.** Only declared transports receive compiled
   prompts; connection state and model selection are immutable per request.
4. **Provider output to response pipeline.** Model text is untrusted until
   tokenized, classified against verified facts, linted, and normalized.
5. **Kernel to action executors.** Exact approval consumption and effect claim
   precede execution; terminal truth returns through producer-specific ports.
6. **Runtime to local database.** Account-scoped repositories and atomic
   journal transactions are the only canonical write boundary.
7. **Canonical stores to UI/legacy projections.** Selectors are bounded and
   read-only; UI and compatibility adapters have no lifecycle authority.
8. **Development smoke harness to native app.** Explicit development flags,
   PID/path/creation-time identity, loopback port, profile digest, and launch
   nonce are all required before automation proceeds.

## Adversaries and assumptions

The model covers a malicious or compromised provider response; prompt
injection in retrieved content; a forged plugin/MCP/tool result; a stale or
cross-account local record; a malicious action proposal; approval replay or
parameter drift; PID reuse during smoke cleanup; an interrupted or duplicated
transport; and accidental leakage through logs, sync, TTS, or staged evidence.

The local operating-system account and browser profile are trusted to the
degree necessary to run the application. A fully compromised host, malicious
kernel driver, stolen OS-keychain session, or supply-chain compromise outside
the repository is out of scope. Provider, code-signing, directory-review, and
production controls remain external trust dependencies and do not become
implicitly trusted when unavailable.

## Threats and controls

| Threat                                    | Attack or failure                                                                                         | Implemented mitigation                                                                                                                                                                                 | Fail-closed result                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Authority injection                       | Retrieved text, a website, memory, custom instructions, or model output claims system authority.          | Deterministic layer order; explicit source trust/sensitivity; immutable security and JARVIS layers; context treated as data.                                                                           | Source excluded, sanitized, or unable to change policy.                                  |
| Contract-dropping provider                | Adapter omits the compiled system contract or silently switches models.                                   | Per-connection `native-system`, approved `prefixed-preamble`, or `unsupported` strategy; request construction tests; immutable model snapshot.                                                         | Provider is not called and the run records a truthful failure.                           |
| Secret-source ingestion                   | Automatic scan reads environment files, credentials, private keys, cookie stores, or recovery material.   | Denied path/content classes, size/binary/containment checks, explicit sensitivity labels, no silent attachment bypass.                                                                                 | Source is excluded with a safe reason and content is not logged.                         |
| Secret persistence or prompt exfiltration | Model proposes, repeats, or requests credentials; diagnostics expose prompt/source content.               | Legitimate secrets remain OS-keychain handles; model-supplied secret values are rejected; safe hashes/labels only; output leakage quarantine.                                                          | Approval/response is rejected or replaced by a safe retry message.                       |
| Approval tampering                        | Action ID/version, parameters, target, capability, entitlement, or risk changes after review.             | Closed v1 schema; canonical parameter hash; capability-snapshot hash; target/effect binding; full consumption-time revalidation.                                                                       | Consumption is denied and a new approval is required.                                    |
| Approval replay                           | A decided record is reused, duplicated, cross-bound to another attempt, or consumed twice.                | Run/request/attempt binding, expiry, decision state, atomic one-time consumption/effect claim, idempotency keys, account ownership.                                                                    | No executor call occurs.                                                                 |
| Approval-as-success                       | UI or model reports completion immediately after approval.                                                | Approval and terminal result are separate contracts; deterministic narration reads verified journal/executor state.                                                                                    | State remains queued/running/awaiting result rather than completed.                      |
| Duplicate or ambiguous scheduled retry    | Restart auto-dispatches, reuses an attempt, or retries after response/effect evidence.                    | Durable schema-validated provider start/settlement evidence; exact ordered lifecycle; zero-byte/chunk/effect proof; same-run immutable snapshot; explicit trusted retry creates a new request/attempt. | Ambiguous work becomes manual/logical retry; no automatic dispatch.                      |
| Cancellation race                         | Cancellation overwrites a concurrently committed completion or is reported before executor exit.          | CAS status/sequence checks, abort registry, queued tombstone, claimed drain, signal-delivery evidence, atomic terminal commit.                                                                         | Exactly one terminal truth wins; undelivered cancellation is reported honestly.          |
| Event corruption or replay                | Missing/gapped/duplicate events or stale writers mutate lifecycle.                                        | `(run_id, seq)` key, unique per-run idempotency key, expected-tail transaction, legal state matrix, terminal states without outgoing edges.                                                            | Transaction rejects; dependent mutation stops.                                           |
| Artifact poisoning                        | Source file, fabricated URI, capability acknowledgement, or mismatched producer result appears as output. | Producer-specific closed receipts; canonical result/live evidence; run/request/attempt/account and digest/reference binding; quarantine state.                                                         | Artifact is omitted or quarantined; source remains only a source.                        |
| Cross-account leakage                     | A run, approval, artifact, selector, retry port, or profile is reused after account switch.               | Explicit account IDs, repository ownership validation, account-bound ports/selectors, in-memory revalidation, no unassigned fallback.                                                                  | Foreign records return no result and cannot execute.                                     |
| Sync leakage                              | Generic sync queue uploads profiles, prompts, events, approvals, artifacts, source excerpts, or handles.  | All six v3 stores are local-only and excluded from generic sync; future sync has a separate approval/migration design.                                                                                 | Private kernel records remain local.                                                     |
| Raw voice leakage                         | Provider delta, raw audio, code, URL, or unsafe prose enters TTS or canonical logs.                       | Session/chat/run binding; sentence-level speech gate; final `spokenText`; no raw provider delta or raw audio in canonical storage/evidence.                                                            | Segment is buffered/omitted; engine failure is recorded rather than injected transcript. |
| UI becomes authority                      | Command Center folds events, invents nodes/artifacts, or mutates lifecycle.                               | Read-only bounded selectors; exact producer/live proof revalidation; zero reads while collapsed; orphan active and invalid chains omitted.                                                             | Quiet empty/degraded UI with no canonical mutation.                                      |
| Legacy dual write                         | Old task/activity stores terminalize or replay a migrated run.                                            | Journal is the sole lifecycle writer; legacy adapters are read-only projections; no fabricated historical runs.                                                                                        | Canonical state remains unchanged.                                                       |
| Development-hook exposure                 | Smoke provider, fixture, selectors, or native control becomes reachable in production.                    | Compile/runtime development gates, explicit paired smoke flags, binding checks, production-inaccessibility tests.                                                                                      | Hook is unavailable and request is rejected.                                             |
| Native cleanup escapes scope              | PID reuse or stale parent/child relationship kills an unrelated process or removes a real profile.        | Process path plus creation time captured at launch; descendant parent-time ordering; per-stop revalidation; deepest-first stop; profile strict-descendant proof; no name-based kill.                   | Unidentifiable/reused process is skipped; unrelated process/profile is untouched.        |
| Unbounded native phase                    | Driver or dev app hangs and bypasses cleanup.                                                             | Per-phase deadline inside one outer `try/finally`; partial-start-safe cleanup; evidence retained on failure.                                                                                           | Phase times out and bounded cleanup runs.                                                |
| Client-granted entitlement                | Email or client-visible identity unlocks paid/admin/browser capabilities.                                 | Server-authoritative entitlement snapshot or clearly bounded local-development state; exact capability gating.                                                                                         | Capability remains unavailable.                                                          |

## Secret handling

Secrets are values, not ordinary approval parameters or artifact metadata.
Automatic sources deny common credential locations and private-key material.
Where an action legitimately needs a credential, the persisted request holds
only an OS-keychain handle reference and a canonical hash of the non-secret
request. Presentation redaction cannot change the payload that is validated at
consumption. Provider prompts, model-visible repair input, events, diagnostics,
TTS, screenshots, sanitized evidence, and staged documentation exclude secret
values and raw private content.

Suspected secret or hidden-prompt leakage quarantines the prose response and
uses a deterministic truthful retry message. It is not downgraded to a style
warning. A real secret found in branch history blocks continuation and requires
separate safe history remediation rather than documentation-only redaction.

## Approval tamper and replay analysis

The primary replay key is the tuple of account, run, request, attempt, action
version, normalized parameter hash, capability-snapshot hash, and target
snapshot. Status, expiry, decision, and consumption are checked in the same
trusted path that atomically claims the effect. Model output and UI state
cannot create or consume approval records directly. Any mismatch— including
risk downgrade, stale entitlement, target drift, duplicate lifecycle evidence,
or post-settlement provider activity—fails before executor invocation.

## Cancellation and completion races

Cancellation is an operation with evidence, not a cosmetic status update. The
journal distinguishes queued tombstoning, claimed handoff drain, running
signal delivery, and verified native exit. Terminal response commit checks the
same run/request/attempt and expected tail. Whichever terminal transaction
wins becomes immutable; the loser observes a status conflict and cannot append
a second terminal narrative, message, or artifact set.

## Artifact poisoning analysis

Artifact creation accepts only a producer-specific receipt plus its matching
canonical result evidence. The verifier checks producer kind, account, run,
request, attempt, result/reference identity, digest where applicable, and
observed time. A file that was merely read, an attachment selected as context,
a URI supplied by the model, a capability response, a stale live row, or a
cross-account result cannot become an output. Unsafe or incomplete content is
quarantined or omitted while the run retains its truthful terminal result.

## Sync and observability leakage

Kernel repositories never enqueue the six v3 stores for generic sync. Safe
diagnostics may include opaque request/run/revision/model IDs, layer sizes and
hashes, state transitions, artifact kinds, timing, and error codes. They omit
prompt/source bodies, approval payloads, handles, private paths, tokens,
cookies, command secrets, raw audio, raw provider text, and hidden reasoning.
Command Center uses user-safe summaries rather than development logs.

## Residual risk and external gates

- Native STT correctness can be proven only when the real configured local
  model is installed; absence remains `BLOCKED_EXTERNAL: model_unavailable`
  and cannot be replaced by transcript injection.
- Credential-free native CLI execution remains subject to host Windows App
  Control/code-signing policy. An unsigned blocked binary is not a transport
  PASS.
- A compromised local OS account or keychain session can access local data and
  is outside the application-only control boundary.
- Future cloud sync, Browser Operator enablement, production billing,
  deployment, release, and destructive data operations require their own
  separately authorized security gates.

Rollback retains all private v3 data and safety interlocks. It never deletes
user data or disables secret-source, entitlement, prompt-transport, or exact-
approval protections.
