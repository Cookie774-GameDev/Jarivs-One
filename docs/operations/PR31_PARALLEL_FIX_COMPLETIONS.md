# PR31 Parallel Fix Completion Receipts

Owner: `/root/deepseek_chat_stall_fix` (append-only)
Reader: `/root` (read-only)

For each completed worker repair, append the matching queue ID (or a worker-issued ID), timestamp, root cause, exact files changed, tests and fresh results, remaining blocker, and commit/diff reference. Do not edit the controller queue and do not record secrets, prompts containing private source data, raw provider responses, credentials, or tokens.

## Completion receipts

### PR31-CODE-002 — exact OpenCode lookup identity and safe request diagnostics

- Completed: 2026-08-22T15:58:48-05:00
- Root cause: the Chat runtime passed logical provider `opencode` plus a fully-qualified model ID to a live catalog keyed by exact upstream provider plus provider-local model ID. That bypassed live variant authority during effort resolution.
- Exact files: `app/src/lib/ai/runtime.ts`; `app/src/lib/ai/runtime.test.ts`.
- Fix: normalize only the live-catalog lookup key. The captured and dispatched provider, `opencode-cli` connection, fully-qualified model ID, effort, and performance selection remain unchanged. Safe request-start diagnostics add only chat/agent/provider/model/connection/reasoning/performance metadata; no prompt, source content, credential, token, or raw provider payload is logged.
- Exact identity regression: captured `opencode-go/deepseek-v4-flash-vision-exp` remains byte-for-byte unchanged; lookup authority resolves `opencode-go` plus `deepseek-v4-flash-vision-exp`.
- Fresh verification: `npm --prefix app run test -- --run src/lib/ai/runtime.test.ts -t "uses the upstream live-provider key|keeps native API catalog lookups|looks up the required OpenCode Go DeepSeek route|dispatches a bound-project fact lookup"` — PASS, 1 file, 4 passed, 110 skipped, duration 25.31s.
- Diff reference: uncommitted owned runtime diff at branch HEAD `49d246aa`; 2 files, 105 insertions, 4 deletions. Controller independently applied the patch and recorded the matching queue resolution.
- Remaining blocker: PR31-NATIVE-002 reports an invisible model-picker dialog; picker/Composer/catalog files are dirty and owned elsewhere, so this lane is tracing that failure read-only and will not edit them.

### PR31-CODE-003 — exact DeepSeek Context dispatch integration proof

- Completed: 2026-08-22T16:19:32-05:00
- Root cause covered: the earlier runtime regression test proved only the live-catalog lookup normalization. It did not prove that a real listener turn retained the complete selected OpenCode Go identity while crossing the bound-project federated Context path.
- Exact files: `app/src/lib/ai/runtime.test.ts`; existing production fix remains in `app/src/lib/ai/runtime.ts`.
- Proof added: the listener now receives the live `opencode-go` catalog row and dispatches provider `opencode`, connection `opencode-cli`, full model ID `opencode-go/deepseek-v4-flash-vision-exp`, effort `medium`, performance `quality`, and only the federated `vibespace_context` tool. The test also proves no invented provider-specific reasoning field is added; this route's verified effort is carried through `runtimeSettings`.
- Fresh focused verification: four exact runtime regressions PASS, 1 file, 4 passed, 110 skipped, duration 19.06s. Prettier check and scoped diff check PASS.
- Broader-matrix blocker: the full `runtime.test.ts` currently reports 65 unrelated failures (49 pass), beginning with an existing OpenCode approval test and reproducing a representative profile-context failure even when run alone. The exact DeepSeek dispatch test remains green; no unrelated runtime behavior was changed to mask that separate baseline failure set.
- Diff reference: uncommitted owned runtime diff at current branch HEAD `3063b841`; 2 files, 125 insertions, 14 deletions. No commit was created because the broader runtime matrix is not green.
- Remaining native blocker: PR31-NATIVE-002 still requires app-scoped computed layout evidence. Read-only source tracing found no hiding theme rule; retained focus is intentional because `onOpenAutoFocus` is prevented.
