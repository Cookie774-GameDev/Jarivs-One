# PR31 Model Picker UI Coordination

## 2026-08-22 — search and effort visual parity claim

- Agent/task: `VS-CODEX-MODEL-PICKER-SEARCH-UI-20260822` / `PR31-MODEL-PICKER-SEARCH-EFFORT-PARITY`; branch `integration/UnifiedChungus-final`, base HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- Exact scope: `app/src/features/chat/ModelPickerTypeahead.tsx`, its smoke test, this ledger, and the agent's own lock. The screenshot is visual reference only. Intent: use the catalog's exact selected/hover colors and effects for effort rows; replace the picker Automatic Routing row with search across provider names, display names, exact IDs, and route labels; preserve collapse state, route identity, effort support, and atomic selection.
- The actively owned five-minute provider/OpenCode catalog refresh, cache isolation, News fallback, and Context Gateway work is explicitly excluded and preserved.

## 2026-08-22 10:49:17 -05:00 — implementation verified and ownership released

- Implemented provider/model/route search in the picker, replacing the rendered Automatic Routing row while leaving compatibility props intact so the separately dirty `Composer.tsx` was not touched.
- Effort choices now reuse the model catalog's selected border, fill, copper glow, spacing, and hover treatment. Provider groups remain independently collapsible; filtered and collapsed rows remain outside keyboard navigation; model + effort still commits atomically.
- Fresh background verification: `ModelPickerTypeahead.smoke.test.tsx` 9/9, `useAccessibleChatModels.test.ts` 27/27, and `Composer.smokeContract.test.ts` 2/2; total 38/38 passing across 3 files. Prettier check passed for both picker files. `git diff --check` passed for the owned source, test, and ledger (line-ending notices only).
- No native/browser/computer control, inference, credential, deployment, commit, or push action was performed. All unrelated dirty work and other agents' ownership were preserved.
- Final branch/HEAD: `integration/UnifiedChungus-final` at `49d246aa0fe075d1c72515aa8b686fc5e043a29b`. Owned lock released; broader model refresh/News and Context Gateway work remains under separate active ownership.

## 2026-08-22 — route-chip and visual-parity correction reclaimed

- Agent/task: `VS-CODEX-MODEL-PICKER-ROUTE-UI-20260822` / `PR31-MODEL-PICKER-ROUTE-UI-CORRECTION`; branch `integration/UnifiedChungus-final`, base HEAD `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- Exact scope: the picker, its smoke test, this append-only ledger, and the new agent-scoped lock. Read-only tracing proved the duplicate shown in the supplied screenshot comes from picker rendering of `alternativeRoutes`, after the catalog already produced one logical model row.
- Intent: retain exact route identity for atomic dispatch while removing redundant route chips from the human-facing picker, centralize the exact model/effort selected and hover states, and make the search strip transparent within the catalog surface.
- Excludes all catalog refresh, provider/auth, News, Context Gateway, Composer, runtime, credential, inference, deployment, commit, push, and unrelated dirty work.
- Scope extension after fresh 143-test audit: `useAccessibleChatModels.ts` and its test, plus a new isolated response-path contract test. Exact intent is to prove actual five-minute recurrence, retain a same-account last-verified OpenCode catalog on transient refresh failure while preserving auth/account invalidation, and prove response-path modules do not import or invoke catalog refresh. Provider catalog implementation, active runtime files/tests, and every other dirty file remain excluded.

## 2026-08-22 11:07:59 -05:00 — correction verified and released

- Root-cause correction: internal `alternativeRoutes` remain available for exact selection/dispatch and search, but are no longer expanded into duplicate human-facing route chips. A single logical row automatically uses the catalog's preferred exact route; an already selected alternative still survives keyboard activation unchanged.
- Visual correction: effort and model rows now consume the same selected and idle state constants, including an explicit `bg-accent-copper/[0.12]` fill, border, shimmer, and glow. The search strip is transparent with only a subdued divider/focus edge, so it blends into the picker surface.
- Refresh correction: ordinary refresh generations retain same-account last-verified OpenCode rows during and after transient failures. A separate authentication/account generation hides them immediately when current-session authentication changes. Added executable fake-timer proof of immediate refresh plus recurrence exactly at five minutes, and a five-module response-path import/invocation contract.
- TDD evidence: the picker regression was red with 4 expected failures, then green 9/9. The refresh/response-path regression was red only on stale retention, then green 33/33.
- Final background verification: 14 files / 149 tests passed after formatting; owned Prettier check passed; owned `git diff --check` passed with line-ending notices only. The existing smoke test emits one React `act(...)` warning but passes.
- Global `npm run typecheck` remains blocked exclusively by four separately owned SiYuan test errors: `siyuanRlmProduction.test.ts:110` TS2722 and `siyuanRlmRepository.test.ts:215,254,271` TS2532. Those files were not changed.
- No native/browser/computer control, inference, credential, deployment, commit, or push action was performed. All unrelated dirty work and active ownership were preserved. Final branch/HEAD: `integration/UnifiedChungus-final` at `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
