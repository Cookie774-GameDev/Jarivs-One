# PR31 Model Connector Truth Repair Ledger

## 2026-08-22 — active claim — VS-CODEX-MODEL-CONNECTOR-TRUTH-20260822

- **Task / base:** `PR31-MODEL-CONNECTOR-TRUTH-REPAIR` on `integration/UnifiedChungus-final` at `6a203b5fe63f272c19d7c92571718ad94cca8c7e`.
- **Owned files:** `useAccessibleChatModels`, the focused picker test, `SubscriptionCliBridge`, its focused test, `connectionDisclosure`, its focused test, this separate ledger, and the agent-scoped lock.
- **Evidence before implementation:** the persistent OpenCode adapter now filters `/config/providers` models by the authenticated `/provider` list before its catalog reaches the picker. The remaining issues are presentation authority: unconnected static OpenCode/Codex hints remain in the picker, and connector/disclosure strings foreground the local transport instead of the actual provider route.
- **Excluded:** the live root lock and PR31 ledger, benchmark/news work, credentials, OAuth material, account state, service changes, and all unrelated code.

## 2026-08-22 — scope extension — VS-CODEX-MODEL-CONNECTOR-TRUTH-20260822

- **Additional owned files:** `providerModelCatalog` and its focused tests.
- **Reason:** the Settings provider preview called `getModelsForProvider` before its authenticated dynamic `/models` response arrived. It therefore showed stale static rows as “unverified”; that violates the supplied inventory’s live-authority rule and explains misleading provider/model combinations. Dynamic providers will expose only verified live rows or a prior verified cache.

- **Settings copy extension:** if a fresh dynamic catalog request fails before any verified cache exists, the UI now says that no unverified names are shown. It does not claim a last-verified list exists when it does not.

## 2026-08-22 — implementation checkpoint — VS-CODEX-MODEL-CONNECTOR-TRUTH-20260822

- **Changed:** external subscription connection hints are empty until a current authenticated catalog supplies exact rows; dynamic cloud-provider lists fail closed until an authenticated `/models` response (or a prior verified cache) exists; Gemini discovery now accepts only chat-transport models; connector status is provider-centred; subscription disclosures name the actual bridge; and the `Free` indicator remains limited to complete, all-zero live pricing.
- **Focused verification:**
  - `npm --prefix app run test -- src/lib/ai/providerModelCatalog.test.ts` — passed, 13 tests.
  - `npm --prefix app run test -- src/lib/ai/useAccessibleChatModels.test.ts` — passed, 26 tests.
  - `npm --prefix app run test -- src/features/settings/SubscriptionCliBridge.test.tsx src/lib/ai/connectionDisclosure.test.ts` — passed, 14 tests.
  - `git diff --check` for every owned source/test file — passed.
- **Wider typecheck blocker:** `npm --prefix app run typecheck` reaches existing unrelated failures in `src/features/context/siyuanRlmProduction.test.ts:110` and `src/features/context/siyuanRlmRepository.test.ts:215,254,271`; no owned-file diagnostic was emitted. No unrelated source was changed.
- **Desktop QA:** the native `Jarvis One` window started successfully. It reported active user input before inspection, so no UI input was sent and visual validation was deliberately deferred.
- **Current work state:** uncommitted owned diff; no commit, push, deployment, credential, or OAuth mutation performed.

## 2026-08-22 — final checkpoint / released — VS-CODEX-MODEL-CONNECTOR-TRUTH-20260822

- **Final owned change set:** model pickers now require authenticated live provider rows (or their verified cache); no unauthenticated static subscription/cloud hints are rendered. Google discovery excludes non-chat model endpoints. Connector and disclosure labels identify the actual provider subscription rather than the managed local transport.
- **Fresh verification:** the three focused suites remain green (13 catalog + 26 picker + 14 connector/disclosure tests), `npm run test:release-manifest` passed (45 tests), and `git diff --check` found no whitespace errors in the owned source/test diff.
- **Repository-wide blockers (unrelated to this diff):** both `npm --prefix app run typecheck` and `npm run build` fail in the unchanged SiYuan RLM tests at `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`. A full app test run was stopped after it immediately accumulated unrelated Agent Manager, Canvas, and AI runtime failures. `cargo check` is blocked by the local Cargo dependency state (`futures-util` cannot resolve its `futures_macro` crate); retrying produced the same result. No non-owned files were changed to mask these failures.
- **Native QA:** the VibeSpace desktop window was running, but the automation boundary reported current user input before inspection. I intentionally sent no app input, so a manual visual pass remains outstanding.
- **Release state:** no commit/push/deployment performed. The owned diff began at `6a203b5fe63f272c19d7c92571718ad94cca8c7e`; while this work ran, another change advanced `integration/UnifiedChungus-final` to `0771e6e9bca87232f98b9453f10b2e98878bee68`. Agent-scoped lock released.

## 2026-08-22 — final provider-boundary correction claim — VS-CODEX-MODEL-PICKER-FINAL-20260822

- **Task / base:** `PR31-MODEL-PICKER-PROVIDER-BOUNDARY-FINAL` on `integration/UnifiedChungus-final` at `0771e6e9bca87232f98b9453f10b2e98878bee68`.
- **Adopted scope:** the released uncommitted model-connector truth repair is preserved exactly and extended only in `useAccessibleChatModels.ts`/test and `providerModelCatalog.ts`/test. No active lock overlaps these files.
- **Root cause:** presentation still partitioned authenticated OpenAI subscription rows under a transport-derived `OpenAI Subscription` group while native API rows used a separate connection group; route subtitles could still expose `OpenCode Bridge`. The OpenAI-compatible non-chat ID filter also lacked generic translation, Deep Research, and agent endpoint segments.
- **Intent:** coalesce only the OpenAI API and direct Codex/ChatGPT subscription presentation under one `OpenAI` heading while retaining exact internal provider/connection/upstream IDs; label every subscription route by its real provider bridge; and reject the missing non-chat endpoint families without inventing model IDs or changing routing/auth authority.
- **Disclosure scope extension:** `ConnectionInfoPopover.tsx`, its exact `Composer.tsx` call site, and the already-adopted `connectionDisclosure.ts`/test are included after tracing the selected route. They receive the existing exact model ID so neither the picker subtitle, info popover, nor persisted runtime disclosure needs to show a generic bridge or the OpenCode transport identity.

### Final correction verification and release

- TDD RED failed exactly on the old behavior before production changed: the picker returned two OpenAI groups, upstream rows retained transport-facing labels, and OpenAI-compatible catalogs admitted translation, Deep Research, agent, and computer-use endpoints. The correction now coalesces duplicate logical OpenAI rows under one `OpenAI` heading, preserves exact API/subscription/fast route IDs as alternatives, keeps OpenRouter and every other upstream owner in its own group, and derives picker/popover/runtime disclosure text from the real provider route rather than the OpenCode transport.
- Final focused verification PASS: 13 files / 132 tests across accessible-model grouping and smoke authority, provider and connection catalogs, canonical aliases, variants, adapter routing, runtime model controls, atomic picker behavior, subscription settings, supported-provider settings, Qwen settings, and route disclosures. Release-manifest PASS 45/45. Exact Prettier and `git diff --check` PASS. The only focused warnings are existing React `act(...)` warnings in provider/smoke tests.
- Typecheck reaches only four unchanged SiYuan test nullability errors: `siyuanRlmProduction.test.ts:110` and `siyuanRlmRepository.test.ts:215,254,271`. No correction-owned diagnostic is present.
- Official native VibeSpace inspection used Windows app control, not a browser. The currently running debug binary began at 00:04:58 and has no Vite listener, so it still displays the old packaged picker strings. It was not replaced while the user may be working; current-source native visual acceptance remains blocked on a safe rebuild/relaunch. No inference or durable model selection was performed.
- No commit, push, deployment, credential, OAuth, billing, or unrelated-file mutation occurred. Another active task advanced the shared branch while this pass ran; exact correction scope is released with its changes still uncommitted at current HEAD `6acd811b53ca1b188d05d935444fc65cb2f61d36`.

## 2026-08-22 — collapsible provider headings claim

- Agent/task: `VS-CODEX-MODEL-PICKER-COLLAPSIBLE-20260822` / `PR31-MODEL-PICKER-COLLAPSIBLE-PROVIDERS`; branch `integration/UnifiedChungus-final`, base HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- Exact scope: `app/src/features/chat/ModelPickerTypeahead.tsx`, its smoke test, this append-only ledger, and the agent's own lock file. Intent: make each provider heading independently expandable/collapsible, default expanded, with accessible state and no catalog, route, effort, auth, credential, deployment, or unrelated-system change.

### Verification and release

- Every provider heading is now an independent native button, defaults expanded, exposes `aria-expanded`/`aria-controls`, and visually rotates its chevron when collapsed. Collapsed groups are removed from keyboard model navigation without changing the committed model, exact route, effort confirmation, or provider data.
- TDD RED reproduced the missing control. Final focused verification passes 3 files / 38 tests; exact Prettier and diff checks pass. Full typecheck reports only the four already-recorded SiYuan test nullability errors outside this scope. The running official native VibeSpace window was inspected, but its picker did not open on two bounded safe attempts, so current-source native visual acceptance is not claimed.
- Exact source/test ownership is released uncommitted at HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`. No model selection, inference, credential, deployment, commit, push, or unrelated-file mutation occurred.

## 2026-08-22 — daily catalog authority and news diagnostics claim

- Agent/task: `VS-CODEX-ROOT-MODEL-REFRESH-NEWS-20260822` / `PR31-MODEL-CATALOG-DAILY-AUTHORITY-AND-NEWS-DIAGNOSTICS`; branch `integration/UnifiedChungus-final`, base HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- Exact scope: daily catalog scheduler plus released direct-provider/OpenCode catalog code and tests; News API/panel diagnostics and tests; the new operations document; this append-only ledger; and this agent lock. No live provider credentials, OAuth, billing, Cloudflare deployment, or unrelated source is in scope.
- Evidence before change: VibeSpace's public news Worker returned HTTP 200 and a valid fresh feed; CORS preflight returned HTTP 204 with wildcard origin; `/health` was fresh. Therefore an installed-client `Failed to fetch` fallback does not prove local offline status. Current direct provider catalog cache is in-memory and expires after five minutes, while OpenCode picker cache expires after one minute; neither provides the requested daily background authority contract.

### Cadence refinement

- The user changed the requested catalog cadence to every five minutes. The scope now makes connected direct-provider and authenticated OpenCode list reads run on that bounded cadence, with immediate forced invalidation on a changed direct key or existing OpenCode auth/reconnect event. These reads never send prompts, stay outside model dispatch, and preserve the local credential boundary.
