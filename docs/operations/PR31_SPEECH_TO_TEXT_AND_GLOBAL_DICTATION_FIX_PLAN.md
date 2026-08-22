# PR31 speech-to-text and global dictation repair plan

Status: **SOURCE COMMITTED — NATIVE QA BLOCKED BY WINDOWS APPLICATION CONTROL**

## Ownership and baseline

- Agent/task: `VS-CODEX-SPEECH-DICTATION-20260822` / `PR31-SPEECH-TO-TEXT-AND-GLOBAL-DICTATION`.
- Worktree/branch/upstream: `C:\Users\viper\VibeSpace-UnifiedChungus-Final` / `integration/UnifiedChungus-final` / `origin/UnifiedChungus`.
- Base HEAD: `49d246aa0fe075d1c72515aa8b686fc5e043a29b`.
- User authorization: received 2026-08-22 12:12 CT to take this narrow overlapping implementation scope. Existing dirty work remains preserved; this task never resets, cleans, stashes, rebases, or stages unrelated paths.
- Capacity preflight: 4.01 GiB free on C: at claim time. This permits source/tests and the plan; native rebuild remains conditional on adequate remaining capacity.
- Coordination: exact path ownership is recorded in `.agent-coordination.lock/VS-CODEX-SPEECH-DICTATION-20260822.txt`. The required append-only ledger entry is added before source work.

## Official model facts used by this task

- [Deepgram Model Options](https://developers.deepgram.com/docs/model) documents Nova-3 streaming at `v1/listen` and Flux streaming at `v2/listen`; Flux is conversational speech recognition with integrated end-of-turn handling, while Nova-3 is a transcription model.
- [Deepgram Measuring STT Latency](https://developers.deepgram.com/docs/measuring-streaming-latency) distinguishes transcript and end-of-turn latency, describes the network/client factors that affect both, and says measured percentile evidence is required instead of a static latency promise.
- The UI must not present cached prices or subjective rankings as current facts. It displays the runtime model ID, endpoint, language/support notes, model-source date/freshness, and the explicit measurement caveat. No per-model Deepgram logo will be invented: the official corporate mark is used with neutral model-ID badges.

## Root-cause evidence and reproduction matrix

| Surface                   | Verified current behavior                                                                                                                                 | Required correction                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat composer             | `startStt` reads `composerSttProvider` and routes Deepgram to `startDeepgramStt`.                                                                         | Preserve selected-provider routing and join the single-active-session coordinator without replacing its existing text-preview behavior.                                            |
| Global Ctrl+Space overlay | `createGlobalDictationSession` tries installed faster-whisper, then `VoiceService`, then Deepgram/Groq. A selected Deepgram engine can become Web Speech. | Resolve exactly the saved engine first; selected Deepgram fails with a safe Deepgram/model fix path, never silently downgrades.                                                    |
| Generic editable fields   | `GlobalSttHost` calls `VoiceService` directly.                                                                                                            | Use the selected-session lifecycle and saved selection/caret.                                                                                                                      |
| Terminal                  | `TerminalView` calls and subscribes to `VoiceService` directly.                                                                                           | Use the selected session and write only final text to the focused terminal session.                                                                                                |
| Ctrl+Space native routing | `lib.rs` routes in-focus presses to `jarvis:global-dictation-in-app`; registration is unconditional.                                                      | Persist an independent setting, register only while enabled, and open the existing compact overlay from either focus state.                                                        |
| Settings/Deepgram models  | Accessibility only controls `composerStt`; the Deepgram cards use cyan selection and custom `N3`/`FX` artwork.                                            | Add a true global-dictation setting and selected cards with a 2px copper/gold rim, inner ring, checkmark, explicit Selected text, accessible state, and monochrome-safe treatment. |

## Owned implementation files

The exact owned manifest is in the task lock. The implementation is intentionally restricted to the global dictation/session, generic-field, terminal, composer coordination, Accessibility, Deepgram catalog/card, and native shortcut seams plus their focused tests. It excludes credentials, billing, Supabase, Stripe, Cloudflare, deployments, OS dictation fallback, and unrelated model-catalog work.

## Design and acceptance criteria

1. `selectedSttSession` is the single boundary for a saved provider/model: `deepgram`, installed selected `faster-whisper`, or `system`. It emits start/partial/final/level/error/close, protects against concurrent microphone sessions, and produces fixed safe errors without provider details or keys.
2. Selecting Deepgram keeps the exact `DeepgramSttOptionId`, runtime model, and endpoint (`v1/listen` Nova or `v2/listen` Flux). Missing key, microphone denial, WebSocket/network error, empty speech, cancellation, and retry remain distinguishable and safe. The session never falls back to Web Speech or Groq.
3. Each destination remains separate from capture: composer commits its normal snapshot; generic fields preserve a saved selection; terminal writes one final transcript only to the focused session; the compact overlay pastes only after explicit confirm and preserves the existing native clipboard-safe paste path.
4. `globalDictationEnabled` is persisted separately from the composer mic visibility setting. The renderer synchronizes it with a native command. Native Ctrl+Space is registered only while enabled and always opens the compact overlay, whether VibeSpace has focus or not.
5. The existing `GlobalDictationOverlay` remains the only mini dictation UI. It shows selected engine/model, streaming state, partial/final text, start/stop, confirm/paste, retry, clear, cancel, and existing safe failure narration.
6. Deepgram cards use the official Deepgram corporate mark and neutral model labels. They visibly and semantically expose selected state; no unsupported logo, static-current price claim, or fabricated quality/latency ranking is added.

## Test matrix

| Phase          | Required automated evidence                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selection      | RED/GREEN for selected Deepgram, faster-whisper, and system; exact selected model/endpoint; no Deepgram downgrade to `VoiceService`; Nova v1 and Flux v2 message shapes. |
| Destinations   | Generic-field saved selection; terminal focused-session-only final write/no duplicate; composer retained selected-provider behavior and coordinator claim.               |
| Session safety | Exclusivity, retry, cancel/no paste, no speech, microphone denial, missing key, WebSocket/network failure, and paste failure.                                            |
| Shortcut       | Enabled/disabled native registration contract; focused and unfocused Ctrl+Space both open the compact module; renderer synchronization is idempotent.                    |
| Settings/UI    | Persisted independent preference, accessible switch, selected-card text/checkmark/keyboard semantics, copper rim, and monochrome rules.                                  |
| Integration    | Exact focused Vitest/Rust suites after each behavior change; repository typecheck/build/native checks only while disk capacity permits.                                  |

## Manual native evidence template

Use only the official running/built VibeSpace desktop app—never a regular browser or Playwright—for this evidence.

| Timestamp | Commit  | Provider/model             | Surface                                                                                            | Expected                                       | Actual  | Sanitized error / evidence                   |
| --------- | ------- | -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------- | -------------------------------------------- |
| 2026-08-22 13:03 CT | Pending | System | Chat, generic field, terminal, Ctrl+Space focused/unfocused | Selected engine and correct destination | Not run | Updated desktop binary could not be built: Windows Application Control blocked Tauri `tauri-plugin-dialog` build script (`os error 4551`). |
| Pending   | Pending | Installed faster-whisper   | Same matrix                                                                                        | Selected local engine, no cloud fallback       | Not run | Pending installed-model availability         |
| Pending   | Pending | Each saved Deepgram option | Same matrix                                                                                        | Exact label/model/endpoint and compact overlay | Not run | Pending key/network and explicit user action |
| Pending   | Pending | Error paths                | Disabled, mic-denied, invalid key, temporary network loss, no speech, cancel, retry, paste failure | Safe error; no unintended paste                | Not run | Pending                                      |

## Findings queue and risk controls

1. **Open:** 4.01 GiB free is enough to begin, but a Tauri rebuild can consume it; stop a build immediately if capacity becomes insufficient and record the exact failure.
2. **Open:** Existing unrelated dirty work includes a model-popover edit in `Composer.tsx` outside the STT region. Preserve it exactly and stage only task-owned hunks/files.
3. **Open:** Native tests must prove shortcut register/unregister behavior without assuming a live global keyboard hook is available in CI.
4. **Open:** Do not call a secret-bearing Deepgram endpoint or alter a Deepgram account. Documentation verifies facts; only user-configured runtime behavior may use the existing local credential path.
5. **Blocked external environment:** `npm run tauri:dev` reached Rust compilation with 3.93 GiB free, then Windows Application Control blocked `tauri-plugin-dialog`'s build script with `os error 4551`. The source binary on disk predates this task, so no native manual result can be inferred. The VibeSpace-specific app connector was also unavailable (two internal-error responses); after user direction, no desktop-computer control is being used.
6. **Closed task-owned compiler finding:** removing the composer fallback recorder left one `clearAudioSilenceTimer` reference. The full typecheck found it, it was removed, and the rerun reported no task-owned type error.

## Commit and completion record

- Source commit: `51b0819f3b0f4c0eaba63ac4034fd2c5af387013` — `fix(pr31): honor selected dictation engine`.
- Coordination ledger: append-only final record pending release of this task's lock; it is intentionally not staged because the shared ledger contains other agents' dirty entries.
- Focused tests:
  - PASS 2026-08-22 13:05 CT: focused PR31 renderer matrix: `Composer.stt.test.tsx` (1), `dictationSession.test.ts` (9), `deepgramDictation.test.ts` (3), `GlobalSttHost.test.tsx` (10), `Accessibility.test.tsx` (5), `ComposerStt.test.tsx` (5), `catalog.test.ts` (7), and `TerminalView.execution.test.tsx` (29): **8 files / 69 tests**. The terminal suite prints two expected jsdom canvas capability warnings and Accessibility prints two expected jsdom media-play warnings.
  - TDD: the new composer fallback regression failed first because `trySystemSttFallbacks` remained in the source, then passed after exact-provider behavior replaced Groq/Windows fallback.
  - PASS 2026-08-22: `Accessibility.test.tsx` (5 tests), `ComposerStt.test.tsx` (5 tests), and `catalog.test.ts` (7 tests). Accessibility prints two expected jsdom media-play warnings.
  - PASS 2026-08-22 12:58 CT: `cargo fmt --check`; `cargo test global_dictation --lib --no-default-features` and `cargo test dictation_routes_to_the_same_overlay --lib --no-default-features` (1/1 each). Ten existing unrelated Rust warnings remain in `jarvis_voice`, pets, and monochrome modules.
  - Full `tsc --noEmit` was rerun after the task-owned cleanup. It has no PR31 dictation error; it remains non-green on unrelated SiYuan test nullability errors and a concurrently introduced Doctor test/module issue.
- Native manual evidence: blocked; see finding 5. No pass is claimed.
- Remaining risks/blockers: Windows Application Control (`os error 4551`) prevents a rebuilt desktop binary and therefore all required real-native matrix items. The source binary on disk was built on 2026-08-21 before these changes. C: has 3.93 GiB free at the latest verification checkpoint. The PR31 lock remains active and no commit has yet been made.
