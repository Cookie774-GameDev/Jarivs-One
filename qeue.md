# VibeSpace PR31 work queue

Updated: 2026-08-22 by `/root`. A checked item means fresh evidence exists; implementation alone is not enough.

## P0 — Chat responses and catalog responsiveness

- [x] **TOP PRIORITY:** fix the reproduced OpenCode canonical-completion failure after dispatch/live-evidence success; preserve exact route/model/effort, Context Gateway, tools, UI, history, and provider truth — commit `0e065022`.
- [x] Measure and minimize authenticated OpenCode catalog startup time without moving discovery onto the response path or removing catalog features — redundant legacy startup fetches removed in `0e065022`; warm supervised runtime reuse remains 19 ms.
- [x] Reproduce the current OpenCode/DeepSeek chat-response failure in the official VibeSpace app and capture the exact failed stage without exposing prompts or credentials — provider rejected dotted tool schema names.
- [x] Remove response-path catalog work and unnecessary pre-provider waits while preserving exact provider, connection, model, effort, Context Gateway, and tool identity.
- [x] Make the large model picker responsive without removing providers, models, headings, search, route truth, or accessibility.
- [x] Verify a simple live DeepSeek V4 Flash response completes within 20 seconds when the provider itself responds within that budget; official native exact-route turn completed in 10.7 seconds.
- [ ] Verify Jarvis voice/persona instructions remain present without adding latency or changing the selected model.

## P1 — Model effort selector polish

- [x] GPT-5.6 Luna exposes every supported effort except Ultra on its exact OpenAI route — commit `c101b366`.
- [x] Ultra is last for eligible models, with a custom sigil, richer inward-root animation, reduced-motion fallback, and selected-effort feedback beside the composer model control — commit `c101b366`.
- [x] Focused model/effort/picker tests and official native picker inspection passed; isolated commit `c101b366`. Full typecheck still reports only the four known, separately owned SiYuan test diagnostics.

## P2 — Remaining native product verification

- [ ] Repair and prove the Pet overlay floats above other Windows applications without focus theft.
- [ ] Prove real microphone speech produces transcription through the selected dictation route; do not silently fall back.
- [ ] Prove VibeSpace Doctor's backup-first durable IndexedDB recovery only in a disposable profile.

## P3 — Lightweight tools and durable user state

- [x] Add **Empire Freezer** to Tools: a refined, opt-in VibeSpace-only 20-minute / 20-second eye-rest cycle using one local timer, no AI/network, safe pause while hidden or busy, and immediate run/pause controls. Focused implementation proof is green; native visual acceptance is deferred by user request.
- [ ] Inventory every user-owned local data store and classify update-safe, reset-vulnerable, backup-covered, and cloud-synced data without exposing user content.
- [ ] Make normal app updates preserve all local user information and settings; add migration/restore regression coverage before changing storage formats.
- [ ] Design and implement explicit-consent, account-scoped encrypted cloud backup/sync for eligible local information. Never upload secrets, credentials, terminal transcripts, or private files implicitly; Supabase production mutation/deployment requires separate exact authorization.
- [ ] Add user-visible backup/export, restore preview, conflict handling, and last-success/error truth so a hard reset can recover opted-in information without silently overwriting newer local data.

## Completed with evidence

- [x] Native file drag/drop preserves the exact Tauri disk path and attaches/removes safely — commit `3ce0c310`; focused 24/24; official native MP3-path proof.
- [x] OpenCode Retry/Download and one-process supervision — commit `537207aa`; focused reliability 61/61; same VibeSpace-owned server PID across concurrent Download calls.
- [x] Cold renderer refresh reuses the supervised OpenCode server — commit `7b79776a`; focused runtime 27/27; official native cold-manager adoption in 19 ms with unchanged server PID.
- [x] OpenCode readiness no longer waits on delayed native event-listener registration — commit `707c3836`; focused runtime manager 28/28.
- [x] One startup scan shares adapter detection instead of starting duplicate OpenCode readiness checks — commit `41b4d0ee`; focused connection detection 10/10; per-connection auth probes remain separate.
- [x] Large picker keeps unselected provider rows out of the DOM until expansion while search still exposes matching rows — focused picker 12/12; native app measured two mounted model rows and a 336 ms open. Committed in `c101b366`.
- [x] `/doctor` runs locally from Chat and reports storage, OpenCode, Agents, Skills, Terminals, optimization, and Settings — commit `fc16ca23`; combined 68/68, full typecheck, official native healthy report in 255 ms.

## Verified blockers

- Pet native acceptance still fails: the rebuilt official app returns `visibility_check_failed` and retains a stale overlay label; the Pet-only attempt was removed instead of being committed. The remaining repair crosses the actively owned global window-close policy in `app/src-tauri/src/lib.rs`.
