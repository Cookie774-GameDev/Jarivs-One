# PR31 Worker 2 — Jarvis, Ollama, Actions, and Multitask

## Scope

- Task: `VS-PR31-W2-JARVIS-OLLAMA-20260808`
- Starting HEAD: `b81d93489b39b307204fbb7b6747799d50c32384`
- Authority: master section 9 and scenarios A–D
- External mutation: none
- Model download or deletion: none

## Preserved verified behavior

Current PR31 code and focused regression coverage already prove the following
substantial behavior, so this worker did not replace or duplicate it:

- local Ollama responses use authoritative native IPC with bounded retry,
  first-response timeout, cancellation, installed-model discovery, and pull/delete
  lifecycle contracts;
- local action prose cannot become fabricated completion and file, terminal,
  creator, agent, and skill actions remain bound to canonical approval authority;
- Fully Local mode excludes cloud models and public escalation, while opt-in
  escalation returns a disclosure that still requires approval before data is sent;
- Deep mode supplies the Planner → Executor → Verifier contract and local Final
  Boss performs one private bounded critique/revision pass;
- child-agent launch, native-chat pinning, parent/child cards, canonical live status,
  bounded display, and terminal completion reconciliation have focused coverage.

## Proven remaining gaps and repairs

### Restart persistence failed open

The persisted interaction store serialized session-only plan approval and active
child statuses unchanged. A renderer restart could therefore restore stale
`queued`, `thinking`, `editing`, or similar work with no owning runtime, and could
retain prior plan-safe approval.

Persistence version 2 now:

- clears plan-safe approval before writing or migrating persisted state;
- converts every nonterminal child status to an explicit failed
  `Interrupted by app restart` result;
- preserves already terminal child results;
- sanitizes both version migrations and current-version hydration while
  preserving live store methods;
- drops malformed persisted rows instead of breaking application startup;
- covers all seven active statuses: `queued`, `thinking`, `planning`,
  `asking_question`, `waiting_permission`, `editing`, and `testing`.

### Ollama bootstrap cancellation crossed callers

The app deduplicated bootstrap with one promise whose underlying signal belonged to
the first caller. Unmounting that caller could abort another mounted consumer.

The bootstrap now owns one internal controller and gives each caller an independent
subscription. One caller may cancel without cancelling another; the underlying
probe aborts only when its final subscriber leaves. The mounted connection host
passes a lifecycle signal to initial, focus, and background probes and suppresses
expected unmount-abort warnings. An already-aborted caller now fails before
ready-cache invalidation, flight creation, or any provider request.

### Planner timeout left execution alive

The typed planner previously raced a timeout against an already-started action
promise, so it could report failure while the action continued without any
cancellation channel.

The executor now receives a dedicated `AbortSignal`. Timeout or caller
cancellation aborts that signal before the plan records its terminal result.

## Model inventory and bounded live evidence

Read-only inventory on 2026-08-09:

- `llama3.2:latest`, ID prefix `a80c4f17acd5`, approximately 2.0 GB;
- `qwen2.5:1.5b-instruct-q4_K_M`, ID prefix `65ec06548149`, approximately
  986 MB;
- no model was initially running.

One bounded `llama3.2:latest` `/api/chat` probe used `stream=false`,
`keep_alive=0`, temperature 0, `num_predict=24`, and a 180-second HTTP timeout.
It did not return; the containing command timed out after 205 seconds. This is
failed environment evidence, not a successful completion.

After the timeout:

- `/api/version` remained healthy at Ollama `0.21.0`;
- direct `/api/ps` returned an empty model list, restoring the initial no-running
  state;
- the `ollama ps` CLI separately failed to allocate memory under current host
  pressure;
- no model was downloaded, removed, or left loaded.

Real Llama completion and destructive remove/reinstall proof therefore remain
blocked by current host memory pressure and controller scheduling requirements.

## Verification

- RED/GREEN:
  - interaction restart migration/serialization, current-version merge
    sanitation, all active statuses, and malformed persistence;
  - independent shared-bootstrap cancellation, pre-aborted zero-provider work,
    and host unmount cleanup;
  - executor abort before planner timeout completion.
- Focused gate: 13 files, 162 tests passed.
- TypeScript:
  - the first repository run identified and led to correction of the owned
    Zustand persisted-state generic, alongside unrelated sparse-worktree missing
    imports;
  - a second repository run timed out under concurrent host load;
  - a compiler-API check using `app/tsconfig.json` and the eight exact changed
    TypeScript/TSX roots passed with no diagnostics.
- Focused native `kernel_host::tests` did not reach test execution because the
  sparse worktree omits the configured `resources/intro/*` path required by the
  Tauri build script. No native source changed in this worker.

## Rollback

Revert only the eight Worker 2 source/test paths and this report. No external or
model state needs rollback.
