# VibeSpace PR31 work queue

Updated: 2026-08-22 by `/root`. A checked item means fresh evidence exists; implementation alone is not enough.

## P0 — August 23 stability and polish intake

These items come from direct user observation on August 23. They remain unchecked until the current code, focused automation, and the required official native VibeSpace workflow all agree. Standalone localhost inspection is not native acceptance.

### Pet desktop reliability — highest priority

- [ ] Audit the full Pet commit chain and reproduce why the Pet is visible in web mode but absent from the official Tauri app; capture the exact renderer/native lifecycle boundary before changing behavior.
- [ ] Keep the selected Axolotl or Glitch Pet visible across Chat, Benchmarks, News, Account, Settings, and other route changes without freezes, remount loops, or unexpected disappearance.
- [ ] Keep the Pet and its native mini panel above other applications without focus theft, while preserving the existing Pet art, animations, character system, and interaction design.
- [x] Enforce one presentation surface at a time: opening the mini panel closes/hides the Pet overlay, and “Show pet now” closes/hides the mini panel. Reduced-motion follows the same state path — commit `f189f946`; focused Pet boundary 44/44; Playwright Pet/panel counts proved `1/0 → 0/1 → 1/0`.
- [x] Make right-click Close an intentional persistent hide action; the recovery/watchdog loop no longer immediately reopens the Pet — commit `f189f946`; Playwright retained Pet/panel `0/0` and `overlayVisible=false` after 2.2 seconds.
- [ ] Verify lock position, drag, edge snapping, reopen, close, reduced motion, and every Pet setting in the official native app for both Axolotl and Glitch.
- [ ] Reduce Pet renderer/native coordination overhead and animation jank without replacing or degrading the existing assets, animation timing, Pixi playback, or character UI.

### Benchmark and News truth

- [ ] Explain and correct the repeated top-chart display rows (for example multiple “Claude Opus 5 (Adaptive Reasoning…)” rows) without deleting genuine distinct upstream benchmark identities. The UI must disambiguate legitimate variants or logically deduplicate only exact duplicates, while preserving the full authoritative dataset.
- [ ] Reproduce the empty “today” News state against the current Worker response; retain the last verified feed, show truthful reconnecting/partial-source status, and prove current items appear when the hourly backend has them.
- [ ] Verify the hourly backend result after a natural refresh window without triggering an unnecessary deployment or mutating Cloudflare credentials/data.

### Inspector and live accounting

- [ ] Show built-in/preloaded tools and custom tools together in Inspector → Open Tools, with truthful origin and availability labels.
- [ ] Make Active Chats, foreground/background work, runs, milestones, token usage, estimated usage, elapsed time, and file-change totals derive from real execution evidence rather than placeholders or double-counted events.
- [ ] Add focused calculation tests for retries, concurrent chats, background runs, cancellations, and missing usage receipts before accepting the Inspector numbers.

### Account, security, calls, usage, billing, and support

- [x] Refine Account information hierarchy: larger readable section headings and icons, calmer spacing, and a correctly sized “Local & private” badge that never wraps vertically or looks detached from its content — Account commits through `143fcea2`; full Account matrix 54/54; official native `3d32febe` acceptance passed at 720 px with zero horizontal overflow.
- [x] Stabilize the Account `Local & private` badge independently of the broader hierarchy redesign — commit `b90fb630`; focused portable-backup 5/5; Playwright measured one-line `nowrap`, no shrink, 109 × 27 px.
- [x] Explain the local user ID in plain language as an offline data-ownership namespace—not a password or recovery secret—or remove it from the primary UI if it has no user action — commits `68ad798f` and `2eba0847`; official native acceptance verified the explanation and copy action without exposing a recovery secret.
- [x] Expand Account Security only with capabilities the current authentication/database contract genuinely supports (for example password change, active identity/session details, recovery/support routes); never invent controls or weaken authentication — commits `68ad798f`, `2eba0847`, and `1add2ad6`; security 8/8 plus official native signed-out fail-closed acceptance passed.
- [ ] Add a Jarvis calling schedule surface showing who/what/when, status, and safe cancellation using the existing phone/schedule authority; do not expose secrets or claim an unavailable channel.
- [x] Make Usage show real account/route evidence with honest unavailable/stale states — commits `cca4e986`, `c0448b99`, and `143fcea2`; usage/support 13/13 plus official native signed-out usage truth passed.
- [ ] Redesign Billing plan comparison and included benefits with premium, readable presentation backed by current Stripe/entitlement truth; do not hard-code fictitious prices or mutate billing.
- [x] Verify Support content and actions are current and purposeful — commit `cca4e986`; official native acceptance verified support/security copy actions, documentation, and license routes with keyboard focus under forced colors.

### Skills, shell, and theme polish

- [ ] Replace generic Skill emoji presentation with a coherent VibeSpace-themed icon/emoji system while preserving custom skill identities, accessibility names, and the existing editor/registry contract.
- [x] Remove the top-bar Jarvis One / Default / Monochrome / Warm quick theme picker from the visible shell only; preserve saved theme state and Settings-based theme functionality — commit `77f80b6d`; focused TopBar 8/8; Playwright confirmed zero header appearance groups and all four Settings themes with the prior selection intact.

### Jarvis Voice module

- [ ] Redesign the compact and expanded Voice UI so error/status text cannot collapse into a narrow word-by-word column; use concise status treatment and keep full actionable detail accessible.
- [ ] Use the connected chat-model catalog/picker identity in Voice with the same VibeSpace styling and exact provider/model/connection truth.
- [ ] Show chronological `You` and `Jarvis` transcript turns like a compact conversation, including interim user speech without merging roles.
- [ ] Make live microphone energy drive the listening waveform, use a bounded speaking animation when output PCM is unavailable, and clean up tracks/nodes/timers on every terminal path.
- [ ] Polish the Warm theme, narrow widths, keyboard focus, forced colors, and reduced motion without changing voice-session, chat-binding, or Command Center authority.
- [ ] Prove selected speech input and model changes persist, unavailable models remain disabled, and real microphone transcription works without silent fallback.

### Evidence and integration rules

- [ ] For each repair: reproduce first, add a focused failing test, implement one root-cause fix, rerun focused and adjacent checks, inspect the exact diff, then commit only the owned coherent slice.
- [ ] Use Playwright against the official running Tauri WebView for product acceptance and record its owning `jarvis.exe`/profile. Browser-only localhost evidence may supplement responsive/layout diagnosis but cannot accept native capabilities.
- [ ] Preserve every active lock and inherited dirty file. If an overlapping owner is active, record the exact file/owner blocker and continue with a free slice rather than overwriting it.

## P0 — Chat responses and catalog responsiveness

- [x] **TOP PRIORITY:** fix the reproduced OpenCode canonical-completion failure after dispatch/live-evidence success; preserve exact route/model/effort, Context Gateway, tools, UI, history, and provider truth — commit `0e065022`.
- [x] Measure and minimize authenticated OpenCode catalog startup time without moving discovery onto the response path or removing catalog features — redundant legacy startup fetches removed in `0e065022`; warm supervised runtime reuse remains 19 ms.
- [x] Reproduce the current OpenCode/DeepSeek chat-response failure in the official VibeSpace app and capture the exact failed stage without exposing prompts or credentials — provider rejected dotted tool schema names.
- [x] Remove response-path catalog work and unnecessary pre-provider waits while preserving exact provider, connection, model, effort, Context Gateway, and tool identity.
- [x] Make the large model picker responsive without removing providers, models, headings, search, route truth, or accessibility.
- [x] Verify a simple live DeepSeek V4 Flash response completes within 20 seconds when the provider itself responds within that budget; official native exact-route turn completed in 10.7 seconds.
- [ ] Verify Jarvis voice/persona instructions remain present without adding latency or changing the selected model. Identity/compiler/composer proof passes 3 files / 88 tests and the exact OpenCode route case passes, but the adjacent selected-provider Final Boss runtime case currently fails before dispatch (`runAgent` 0 calls) in an actively owned runtime scope.

## P1 — Model effort selector polish

- [x] GPT-5.6 Luna exposes every supported effort except Ultra on its exact OpenAI route — commit `c101b366`.
- [x] Ultra is last for eligible models, with a custom sigil, richer inward-root animation, reduced-motion fallback, and selected-effort feedback beside the composer model control — commit `c101b366`.
- [x] Focused model/effort/picker tests and official native picker inspection passed; isolated commit `c101b366`. Full typecheck still reports only the four known, separately owned SiYuan test diagnostics.

## P2 — Remaining native product verification

- [ ] Repair and prove the Pet overlay floats above other Windows applications without focus theft. Fresh bridge/lifecycle/overlay-recovery/native-panel contracts pass within the combined 11-file / 57-test native-boundary matrix; Windows topmost/focus acceptance still requires the native app.
- [ ] Prove real microphone speech produces transcription through the selected dictation route; do not silently fall back. Fresh composer STT and global dictation session/Deepgram/failure/overlay contracts pass within the combined 11-file / 57-test matrix; real microphone capture still requires native hardware/app acceptance.
- [ ] Prove VibeSpace Doctor's backup-first durable IndexedDB recovery only in a disposable profile. Fresh storage Doctor and `/doctor` contracts pass within the combined 11-file / 57-test matrix; restart-safe repair still requires a disposable native profile and explicit confirmation.

## P3 — Lightweight tools and durable user state

- [x] Add **Empire Freezer** to Tools: a refined, opt-in VibeSpace-only 20-minute / 20-second eye-rest cycle using one local timer, no AI/network, safe pause while hidden or busy, and immediate run/pause controls. Focused implementation proof is green; native visual acceptance is deferred by user request.
- [x] Inventory every user-owned local data store and classify update-safe, reset-vulnerable, backup-covered, and cloud-synced data without exposing user content. The executable inventory covers all 51 Dexie stores plus major localStorage, native app-data/file, keychain, and cache families; future Dexie stores fail focused tests until classified.
- [x] Make normal app updates preserve all local user information and settings: the installed WebView identifier and `jarvis-v1` database identity are frozen, V1→V12 remains additive without destructive upgrade hooks, same-authority reopen preserves IndexedDB rows and local preferences, and portable/cloud restore paths have focused regression coverage.
- [x] Design and implement explicit-consent, account-scoped encrypted cloud backup for the eligible portable workspace artifact. AES-256-GCM/PBKDF2 encryption happens locally; the passphrase is never saved or transmitted; only ciphertext enters the existing RLS-protected account record; download decrypts locally into the same additive restore preview. No Supabase deployment or live production mutation was performed.
- [x] Add Account → Cloud Recovery preview and explicit-confirmation safe merge for core records already protected by account RLS. It preserves newer/equal/ambiguous local rows, skips cloud deletion tombstones, rejects cross-account/malformed/unsupported rows, and excludes settings blobs, secrets, credentials, terminals, files, provider state, and local-only Context data. Focused Account/cloud/migration matrix: 4 files / 32 tests.
- [x] Add a portable local backup/export with strict account/version validation, additive-only restore preview, explicit confirmation, and account-scoped last-success/error history for workspaces, chats/messages, and Canvas data intentionally outside core cloud recovery. It never deletes or overwrites local rows and excludes credentials, provider state, terminals, file bytes, and private paths.

## Completed with evidence

- [x] Native file drag/drop preserves the exact Tauri disk path and attaches/removes safely — commit `3ce0c310`; focused 24/24; official native MP3-path proof.
- [x] OpenCode Retry/Download and one-process supervision — commit `537207aa`; focused reliability 61/61; same VibeSpace-owned server PID across concurrent Download calls.
- [x] Cold renderer refresh reuses the supervised OpenCode server — commit `7b79776a`; focused runtime 27/27; official native cold-manager adoption in 19 ms with unchanged server PID.
- [x] OpenCode readiness no longer waits on delayed native event-listener registration — commit `707c3836`; focused runtime manager 28/28.
- [x] One startup scan shares adapter detection instead of starting duplicate OpenCode readiness checks — commit `41b4d0ee`; focused connection detection 10/10; per-connection auth probes remain separate.
- [x] Large picker keeps unselected provider rows out of the DOM until expansion while search still exposes matching rows — focused picker 12/12; native app measured two mounted model rows and a 336 ms open. Committed in `c101b366`.
- [x] `/doctor` runs locally from Chat and reports storage, OpenCode, Agents, Skills, Terminals, optimization, and Settings — commit `fc16ca23`; combined 68/68, full typecheck, official native healthy report in 255 ms.

## Verified blockers

- Pet presentation repair is committed in `f189f946`: stale-handle recovery, typed failure truth, persistent Close, and panel/Pet mutual exclusion pass focused renderer/native tests. Final detached native always-on-top/show-panel-close acceptance remains unclaimed because the concurrently owned shared Tauri command dispatcher stalled during the app-only Playwright sequence; the process/configuration was preserved rather than killed or overwritten.
- The final Jarvis selected-provider instruction runtime proof is blocked by a fresh pre-dispatch test failure in actively owned `app/src/lib/ai/runtime.ts` / `runtime.test.ts`; identity/compiler/composer and the exact OpenCode route proof remain green.
- Real microphone transcription, Pet topmost/focus behavior, and Doctor durable recovery cannot be accepted in browser/Vite mode. They remain native-only while the user's current no-live-app instruction is active.
