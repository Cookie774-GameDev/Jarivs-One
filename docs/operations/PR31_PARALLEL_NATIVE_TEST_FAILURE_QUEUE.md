# PR31 Parallel Native Test and Failure Queue

Owner: `/root` (append-only)
Reader: `/root/deepseek_chat_stall_fix` (read-only)
Plan authority: `VIBESPACE_UNIFIED_CHAT_TERMINAL_RLM_SIYUAN_MERGE_PLAN.md`

Each test receives a monotonically increasing ID. Entries record UTC/local time, official-native surface, exact registered route identity when observed, project/context scope, sanitized timing, result, sanitized diagnostic/log locations, owned files, and the next requested repair. Never record prompts containing private source data, credentials, raw provider responses, or tokens. The worker acknowledges completed repairs only in `PR31_PARALLEL_FIX_COMPLETIONS.md`; the controller appends the matching resolution here after independent retest.

## Queue

### PR31-NATIVE-001 — pending official-native execution

- Recorded: 2026-08-22T09:48:55-05:00
- Test: Plan Test A, grounded 750-word Context summary and paired latency comparison
- Surface: official native VibeSpace only
- Route: pending live authenticated picker observation; no substitution permitted
- Project/context: pending native observation
- Result: not run in this continuation yet
- Evidence: reference video and output paths are defined in the authoritative merge plan
- Requested repair: none until a fresh native failure is observed

### PR31-CODE-001 — in progress

- Recorded: 2026-08-22T09:48:55-05:00
- Test: arbitrary Context Map source-root isolation
- Surface: focused automated regression before official-native retest
- Result: pre-fix source coupled Context Map selection to `jarvis-files-root-v2`; implementation now separates the Context source preference
- Owned files: `ContextPage.tsx`, `contextSourceRoot.ts`, and focused tests
- Requested repair: controller-owned; worker should not edit

### PR31-NATIVE-002 — open

- Recorded: 2026-08-22T15:49:31-05:00
- Test: Question A native preflight and exact model selection
- Surface: official native `jarvis.exe` window from `app/src-tauri/target/debug`
- Existing route identity: visible `opencode · alibaba/deepseek-v4-flash-0731`; connection details label `Alibaba`
- Required route identity: visible `DeepSeek V4 FLASH Vision Exp OpenCode Go`, expected fully-qualified ID must come from live catalog; no substitution permitted
- Project/context: `Project 2`; prior chat showed three sends at 08:54, 08:57, and 09:01 stuck at `@jarvis is gathering context` / `Resolving approved project and conversation context`
- Fresh-chat result: new chat creation reached `IDLE / Ready`; therefore app shell/chat creation are responsive
- Picker result: activating `Choose model` creates a native accessibility dialog with 830 omitted descendants, but no picker surface or model rows are visually rendered and focus remains on the VibeSpace pane
- Timing: old stalls remained unresolved for multiple hours; no provider-start or completion receipt was visible
- Sanitized evidence: Computer Use accessibility/screenshot observations in the active Codex task; no prompt/source/provider payload logged
- Requested repair: trace the invisible picker rendering/focus boundary without changing catalog authority, route IDs, grouping order, or exact selection persistence

### PR31-CODE-002 — fixed, automated retest green

- Recorded: 2026-08-22T15:51:59-05:00
- Test: exact OpenCode live-variant lookup and safe pre-provider request diagnostics
- Root cause: renderer passed logical provider `opencode` plus a fully-qualified model ID to a live catalog keyed by upstream provider plus provider-local model ID
- Fix: normalize only the lookup key; preserve captured and dispatched provider, connection, full model ID, effort, and performance mode byte-for-byte
- Exact route regression: `opencode-go/deepseek-v4-flash-vision-exp` resolves lookup key `opencode-go` + `deepseek-v4-flash-vision-exp` while captured ID remains unchanged
- Diagnostics: request start records safe chat/agent/provider/model/connection/reasoning/performance metadata; no prompt, source body, credential, token, or raw provider payload
- Fresh result: 4/4 targeted runtime tests passed, including bound-project federated Context dispatch
- Owned files: `app/src/lib/ai/runtime.ts`, `app/src/lib/ai/runtime.test.ts`

### PR31-NATIVE-003 — open native picker actionability defect

- Recorded: 2026-08-22T16:20:17-05:00
- Surface: Playwright attached by CDP to the official native WebView2 owned by `jarvis.exe` PID 38768; WebView2 PID 32316; official `ai.jarvis.desktop\\EBWebView` profile; Tauri bridge present
- Picker identity: exact registered OpenCode Go option observed as `opencode-cli:opencode-go/deepseek-v4-flash-vision-exp`; separate OpenRouter duplicate observed and explicitly rejected
- Provider grouping: provider headers are present, consistently grouped, and expose working collapse semantics through `aria-expanded` / `aria-controls`
- Failure: on initial open, `.jarvis-slash-dropdown` was in the correct z-120 portal and hit-tested at its center, but remained at `opacity: 0` with the entry motion transform long enough for ordinary Playwright `fill` to time out at 30 seconds; later inspection found opacity 1 after the timeout
- Evidence boundary: no hiding CSS was found; retained composer focus is intentional. The defect is the delayed/non-settling native picker actionability during entry motion, not missing catalog identity or absent provider headers
- Requested repair: make the native picker become visibly actionable within its intended short entry transition without changing catalog authority, grouping, route identity, or focus policy; add a focused regression around settled opacity/actionability

### PR31-NATIVE-004 — open exact-route provider failure in Question A

- Recorded: 2026-08-22T16:20:17-05:00
- Test: three parallel official-native Question A chats; exact contract prompt used without logging source contents here
- Exact route on every send: provider `opencode`, connection `opencode-cli`, model `opencode-go/deepseek-v4-flash-vision-exp`; the selected button remained `opencode · opencode-go/deepseek-v4-flash-vision-exp`
- Starts: 2026-08-22T21:16:18.225Z, 2026-08-22T21:16:28.931Z, and 2026-08-22T21:16:41.153Z
- Context boundary: the two canonical receipts each report `8 approved context sources selected`; request compilation completed far enough for protected provider dispatch and live-execution evidence update
- Outcomes: chat 1 `FAILED` after 2s; chat 2 `FAILED` after 12s; both report `0 files`, no assistant completion, and `The protected provider request failed before canonical completion.` Chat 3 lost its canonical session surface during a native hot reload and therefore remains unverified rather than counted as pass/fail
- Root-cause boundary: failure is downstream of Context selection and at/after exact OpenCode Go provider dispatch; it is not the former indefinite gathering-context stall and no substitute route was attempted
- Requested repair: inspect the native Harness/OpenCode failure receipt and runtime boundary for the exact registered route; preserve exact provider/connection/model/effort/performance identity and expose a sanitized actionable failure reason without leaking prompt, sources, credentials, tokens, or raw provider payload

### PR31-NATIVE-005 — arbitrary-folder Context Map native pass

- Recorded: 2026-08-22T16:20:17-05:00
- Surface: same verified official native Tauri WebView
- Project state: `No projects yet`; no project root was available or created
- Source: user-selected local corpus folder outside any VibeSpace project binding; exact private path retained only in local native state
- Result: `Save Source` enabled and persisted the folder, `Create Map` enabled, and the map became `ACTIVE` with 102 indexed files and its generated `context_map.json`
- Acceptance: proves Context Map creation no longer requires a VibeSpace project root for this real native fixture
- Requested repair: none; keep automated isolation coverage and retest persistence/reopen before final acceptance

### PR31-CODE-001 — accepted arbitrary-folder Context source isolation

- Recorded: 2026-08-22T22:04:23-05:00
- Branch/base: `integration/UnifiedChungus-final` at `119be9e4affb455fa5324dd775d1bcc38b249898`
- Root cause: Context Map reused the Files feature's project-root preference, so selecting a corpus outside a bound project could inherit or mutate an unrelated Files root
- Repair: Context now persists an account- and optional-project-scoped source independently, including the unbound-project case; folder/file selection and map creation use that source without changing the Files project root
- Focused evidence: Context source and focused ContextPage matrix passed 7/7; adjacent adapter-inclusive matrix passed 22/22
- Broad evidence: app TypeScript typecheck passed; exact four-file Prettier check passed after formatting
- Official-native evidence: `PR31-NATIVE-005` created an ACTIVE 102-file map from an arbitrary selected folder while `No projects yet` was visible
- Remaining acceptance: verify source persistence after native app reopen; no claim yet for unrelated Context Gateway, Terminal, or Test A behavior
