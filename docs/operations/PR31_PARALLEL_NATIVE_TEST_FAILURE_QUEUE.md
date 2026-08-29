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

### PR31-CODE-003 — canonical OpenCode completion and Context tool wire repair green

- Recorded: 2026-08-22T22:18:53-05:00
- Branch/base: `integration/UnifiedChungus-final` at `3cf698b53fc86a403415cd8ef6cc0180d5a95255`
- Native root causes: OpenCode Go rejected the historical dotted Context tool key, and append-only reconciliation appended an entire divergent canonical completion after the streamed answer
- Repair: use the registered provider-safe `vibespace_context` function with operations as arguments; canonical reconciliation emits only a strict suffix and leaves divergent text to the authoritative final replacement
- RED evidence: equal, prefix-extension, and divergent canonical cases failed 3/3 before the reconciler existed
- GREEN evidence: adapter matrix passed 18/18; combined OpenCode SDK, Tool Gateway protocol/runtime, detector, and adapter matrix passed 154/154; app typecheck and exact formatting/diff checks passed
- Remaining acceptance: rerun official-native Question A on exact `opencode` / `opencode-cli` / `opencode-go/deepseek-v4-flash-vision-exp`; code evidence alone is not a native pass or a 90+ score

### PR31-CODE-004 — bounded external CLI inspection green

- Recorded: 2026-08-22T22:18:53-05:00
- Branch/base: `integration/UnifiedChungus-final` at `3cf698b53fc86a403415cd8ef6cc0180d5a95255`
- Root cause: global external-connection detection awaited every CLI inspection in one `Promise.all`; one unbounded unrelated native/CLI probe prevented completed authenticated OpenCode metadata from publishing
- Repair: each whole inspection now has a 20-second upper bound; timed-out metadata is preserved and not marked session-checked, while completed routes publish through the existing compare-and-swap authority
- RED evidence: the authenticated OpenCode route remained unpublished when another detector never settled
- GREEN evidence: detector matrix passed 11/11, combined adjacent matrix passed 154/154, app typecheck and exact formatting/diff checks passed
- Remaining acceptance: observe forced detection in the official native app and confirm the exact registered route becomes actionable without substitution

### PR31-CODE-005 — exact combined effort + Fast transport green

- Recorded: 2026-08-22T22:29:29-05:00
- Root cause: the catalog prompt adapter returned an already-resolved effort variant before evaluating Fast, silently dropping the requested Fast control; the strict adapter also ignored native Fast
- Repair: an effort variant plus Fast now requires the exact combined variant advertised by live metadata; missing combined authority fails closed, and the strict adapter rejects any unsupported Fast control
- Exact identity: provider, connection, model ID, effort, performance, and RLM fields remain unchanged; no combined variant is invented and the UI toggle is not treated as provider proof
- RED/GREEN evidence: three focused regressions failed before implementation; the complete SDK client matrix now passes 9/9 and exact formatting/diff checks pass
- Remaining acceptance: Test B remains NOT RUN until the official native app exposes an authenticated GPT-5.6 Luna Max + Fast route with observed combined provider metadata; no substitute route is permitted

### PR31-CODE-006 — explicit leading read-root isolation green

- Recorded: 2026-08-22T22:51:33-05:00
- Test A root cause: the leading `C:\\Users\\viper` prefix was not authoritative read scope; the active project remained the provider cwd and automatic project Context/RLM/tool overlays could replace the requested corpus
- Repair: a bounded, traversal-safe, read-only leading-root parser now selects the exact provider cwd for both legacy and canonical-kernel paths without becoming a remembered write destination
- Isolation: unrelated project blob/tree, Context Map/RLM, local knowledge, connected files, coordination, terminal context, capability/model inventory, and action overlays are excluded only for explicit-root Ask turns; explicit attachments/plugins/skills remain available
- Exact route: `opencode` / `opencode-cli` / `opencode-go/deepseek-v4-flash-vision-exp`, medium effort, quality mode, and the original user message are preserved; request-local RLM and the Context tool rewrite are disabled rather than substituted
- RED/GREEN evidence: the provider cwd regression failed with `C:\\UnrelatedProject` before implementation; focused runtime route/scope matrix passes 3/3 and parser/context matrix passes 23/23; exact formatting and diff checks pass
- Typecheck boundary: this slice's prior kernel typing error is cleared; the broad app typecheck now reports only four concurrent errors in `siyuanRlmProduction.test.ts` and `siyuanRlmRepository.test.ts`, outside this owned scope
- Broad evidence boundary: the full runtime file was attempted and currently has 65 broader failures across approval, voice, shadow, cancellation, and kernel fixtures outside this focused assertion set; this slice does not claim that broad matrix green or assign those failures a historical cause
- Remaining acceptance: rerun Question A in official native VibeSpace, inspect the real answer and receipts, independently grade it, and do not claim 90+ from code evidence alone

### PR31-CODE-007 — explicit Test A response contract checkpoint

- Recorded: 2026-08-22T23:19:45-05:00
- Root cause: both legacy and installed-kernel response paths could visibly stream and commit a response above the user's explicit word maximum; the installed kernel also applied output-reference notices and downstream action inference after response generation
- Repair: bounded generic word-contract parsing adds a 90–96% target band, buffers contracted previews, validates the complete visible response before commit, detects substantial duplicated tails and internal notices, and fails closed with a contract-compliant text-only response after the single exact provider attempt
- Installed-kernel boundary: enforcement now runs after output-reference policy, never overrides sensitive or verified lifecycle modes, never treats tokenizer-owned structured placeholders as leakage, and returns before any fallback action inference after rejection
- Exact identity: no retry or second provider call was added; provider, connection, full model ID, effort, performance, request text, and working directory remain unchanged
- Safe diagnostics: Dev Console records only request/run IDs, provider/model, fixed failure code, maximum, and word count; prompt, response, source content, credentials, and tokens remain excluded
- Fresh focused evidence: pure contract plus complete response pipeline pass 90/90; exact installed-kernel preview/fail-close regression passes 1/1; focused legacy explicit-root path remains green in the combined targeted matrix
- Latency boundary: contracted answers intentionally expose no first-token preview, so visible latency equals canonical completion latency; no streamed first-token latency claim is permitted
- Remaining acceptance: broad typecheck is still running under concurrent workspace load; official-native exact-route Question A remains paused at the user's request and is not yet rescored

#### PR31-CODE-007 follow-up — minimum quality floor and kernel control parity

- Recorded: 2026-08-22T23:34:00-05:00
- Quality floor: target-form requests such as `750-word summary` now require 675–750 visible words; the prior 144-word native answer fails with `word_limit_below_target`. Maximum-only wording remains minimum-free, and sensitive responses retain safety-mode priority
- Parser hardening: quoted incidental limit prose is not treated as an output contract; `under N words` is exclusive; tiny budgets use a one-word fail-closed response
- Kernel control repair: the already-resolved provider options plus exact effort, performance, Fast, and request-local RLM settings now pass through the installed-kernel turn into the same single provider attempt instead of falling back to router defaults
- Diagnostics: installed-kernel rejection evidence now includes the safe connection ID, observed effort, and performance alongside provider/model and fixed contract code; no content or credentials are logged
- Fresh focused evidence: pure contract plus full response pipeline pass 92/92; installed-kernel preview/minimum-floor/exact-control regression passes 1/1; legacy explicit-root test remains green
- Typecheck boundary: rerun reaches only the same four concurrent SiYuan test errors in `siyuanRlmProduction.test.ts` and `siyuanRlmRepository.test.ts`; no owned-file TypeScript error is reported
- Native boundary: app remains intentionally stopped at the user's storage-clearing request; no native rescore is claimed

### PR31-NATIVE-006 — Question A quality pass with latency still red

- Recorded: 2026-08-23T04:59:00-05:00
- Official-native route: `opencode` / `opencode-cli` / `opencode-go/deepseek-v4-flash-vision-exp`, High, Quality, Fast off; no substitute route was attempted
- Result: terminal `done`, 724 visible words, independent 92/100, zero validator/security issues; backend session `ses_fd1f4227cffe19AOtuXG1tNc16`
- Timing: 156,963 ms total; approximately 41.2 s initial evidence, 13.9 s evidence repair, and 99.2 s final synthesis
- Evidence: `D:\VibeSpace-Testing\SiYuan-Context-OpenCode-RLM-Feature-Testing\acceptance-evidence\pr31-native-question-a.jsonl`
- Acceptance boundary: quality passes the >=90 target, but latency and the paired direct-harness comparison remain red/unrun; this is not a complete Test A pass

### PR31-CODE-008 — sanitized exact-root read inventory classification green

- Recorded: 2026-08-23T05:20:00-05:00
- Root cause: a completed read of the exact approved root was stripped to an unscoped provider event, forcing a redundant repair even when grep and representative reads were complete
- Repair: the OpenCode adapter compares the completed read target with the explicit request root, emits only `explicit_root_inventory`, and the router accepts only that sanitized completed-read classification; raw paths never cross the adapter boundary
- Negative boundaries: child/file reads, started reads, and non-explicit turns remain unclassified; route, provider, connection, model, effort, performance, Fast, session, and tool authority are unchanged
- Evidence: focused adapter/router matrix passes 42/42; `git diff --check` passes; broad typecheck reaches only the same four existing SiYuan test nullability diagnostics and reports no owned-file diagnostic
- Remaining acceptance: fresh official-native Question A rerun is required to prove the redundant repair disappears and to measure the real latency delta

### PR31-NATIVE-007 — Test B exact Luna Fast Max catalog/auth preflight

- Recorded: 2026-08-23T05:20:00-05:00
- Fresh native authority after managed OpenCode generation restart: adapter authentication passed and the live catalog registered exact `openai/gpt-5.6-luna-fast` with effort variant `max`
- Identity boundary: Fast is encoded by the exact `-fast` model route; this route does not advertise a separate Fast toggle/service tier, so `/fast on` must fail closed and the base Luna model must not be substituted
- Acceptance boundary: catalog/auth is preflight only, not live execution or provider-event attestation; Test B remains pending exact native dispatch plus isolated disposable project actions and terminal receipts

### PR31-NATIVE-008 — post-fix Question A quality pass, repair removed, latency red

- Recorded: 2026-08-23T05:24:00-05:00
- Official-native identity: chat `cht_ElD0XnF9FPIz8aQw`, backend session `ses_fd1ded03effeahnl8SqtimBA4o`, exact `opencode` / `opencode-cli` / `opencode-go/deepseek-v4-flash-vision-exp`, High, Quality, Fast off, RLM on
- Result: terminal `done`, 724 visible words (716 raw backend), independent 92/100, all required categories present, zero runtime quality issues, URLs, emails, or internal markers
- Repair proof: backend contains only the initial evidence user turn and one synthesis follow-up; no evidence-repair user turn occurred, so commit `b9ae45c5` removed the redundant repair path in the real app
- Timing: 197,730 ms total; initial evidence approximately 62.665 s and no-tools synthesis approximately 130.532 s. This is 40.767 s / 25.97% slower than the prior 156.963 s sample despite removing the prior ~13.9 s repair
- Acceptance boundary: quality/security pass; latency remains severely non-green and provider-dominated/stochastic. Direct-harness paired baseline and the required warm sample set remain pending

### PR31-NATIVE-009 — Test B exact Fast route hidden behind logical picker row

- Recorded: 2026-08-23T05:29:00-05:00
- Authority: authenticated adapter catalog contains exact `openai/gpt-5.6-luna-fast` with `max`; native picker search matched its logical Luna row but rendered only base `opencode-cli:openai/gpt-5.6-luna`
- Failure: exact Fast `data-value` count was zero at the catalog level and the guarded driver stopped at `configure_model_failed` before any provider dispatch; no base Luna substitution occurred
- Root cause: logical grouping retained Fast only in `alternativeRoutes`, while the visible row always began effort selection for the preferred base route and exposed no route-choice surface
- Repair checkpoint: logical rows with multiple routes now expose a separate exact-route group, visible exact model IDs, disabled unavailable routes, keyboard navigation, cancellation, then the existing effort stage. Native HMR proof exposes both base and exact Fast route IDs under the retained OpenAI header
- Fresh focused evidence: picker smoke 13/13 and guarded driver 10/10 pass; formatting/diff checks pass; typecheck reports only the same four unrelated SiYuan test diagnostics
- Remaining acceptance: commit the exact four-file slice, then perform exact Fast + Max native dispatch and isolated project file/terminal verification

### PR31-NATIVE-010 — Test B exact provider reached; todo permission and stale project root blocked execution

- Recorded: 2026-08-23T05:48:00-05:00
- Exact identity observed: `opencode` / `opencode-cli` / `openai/gpt-5.6-luna-fast`, Max, Quality, Fast encoded in the model ID, RLM on; request `jreq_4620840a-...`, backend session `ses_fd1cedf65ffevGJbRW0M8vKlRC`
- Failure: the provider's first `todowrite` request inherited managed OpenCode's global `*=ask`, received no valid approval path, and the turn stopped after approximately 13.9 seconds with zero visible output and zero files written
- Scope defect: Ctrl+T created the attempted chat under stale project `prj_wd1kZ1n42eQ1BUbi` and cwd `C:\Users\viper\Documents\Codex\2026-08-21`, not disposable Test B project `prj_leBT3oqNPBtoSMmf`; direct store mutation raced the tab strip, while semantic native UI project selection correctly binds the new project/chat/root
- Repair in progress: allow only non-filesystem todo tools globally; transmit VibeSpace's already-computed exact request permission rules to the owned session before prompt dispatch; retain global edit/bash/task deny, external-directory and sensitive-read denies, immutable one-run approval authority, and one-active-turn-per-chat isolation
- Acceptance boundary: exact provider reach is proven, but Test B remains failed until the rebuilt official native app accepts the scoped session update, writes only inside `D:\VibeSpace-Testing\PR31-Test-B-Luna-Fast-Max-20260823`, verifies the files, and attests the same exact provider/model/variant

### PR31-NATIVE-011 — Test B recovered and accepted after scoped permission, fallback-path, and collector repairs

- Recorded: 2026-08-23T07:14:02-05:00
- Official-native proof: chat `cht_xCa7A4R1lMGqZzMN`, backend `ses_fd179deeaffeuGwj21t4vDWo5W`, exact `opencode` / `opencode-cli` / `openai/gpt-5.6-luna-fast`, variant `max`, Quality, RLM on, request-scoped Approve All
- Result: collector `ok=true`, terminal `done`, 246,146 ms, zero approval cards or fallback mismatch; backend final `stop` with 20/20 completed tools and no pending/rejected tool
- Artifact proof: only the disposable Test B root was used; `index.html` 8,215 bytes, `styles.css` 17,980 bytes, and `game.js` 20,255 bytes; fresh `node --check`, HTML linkage, and root-isolation checks passed
- Recovery proof: the earlier false `/restart/index.html` approval remains preserved as failure evidence; the fresh run did not recreate it. One-shot runtime controls cleared only after dispatch, while immutable dispatch and durable exact route/visible identity remained authoritative
- Remaining boundary: this accepts Test B only. The two-managed-terminal receipt/evidence/cancellation isolation required by Test C remains pending
