# PR31 Jarvis Phone, Messaging, and Voice Implementation Ledger

Append-only coordination record for `PR31-JARVIS-PHONE-MESSAGING-VOICE-PRODUCTION-READINESS`.

## 2026-08-22 17:48 CDT — documentation and diagnosis claim

- Agent: `VS-CODEX-JARVIS-COMMS-VOICE-20260822`.
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`.
- Branch/base/upstream: `integration/UnifiedChungus-final` at `5440e986fa9376c3afe49f14cdc3ef89b7ed28f9`, upstream `origin/UnifiedChungus`.
- Repository state: shared dirty tree preserved; no merge, rebase, or cherry-pick in progress. C: had `2208952320` free bytes.
- Exact owned files: this ledger, `docs/superpowers/specs/2026-08-22-jarvis-phone-messaging-and-voice-production-readiness.md`, and the task-specific lock. No product source is owned yet.
- Read-only evidence: Jarvis High model and config exist under the VibeSpace application-data model directory and both exact SHA-256 values match the pinned manifest. Existing source has a real native Piper command surface and a Twilio inbound-message webhook, but the webhook records usage only and never produces a Jarvis reply. The messaging gateway remains process-local and has no production adapters or persistent repository.
- Official Supabase references checked before design: current `changelog.md` dated through 2026-08-21, Edge Function authentication/webhook guidance, secrets guidance, and Row Level Security guidance. Provider webhooks must disable platform JWT verification only when the handler verifies the provider signature itself; secret/service credentials remain server-only.
- Next action: finish the native synthesis/reply-playback trace and messaging-host trace, then extend this exact lock with the smallest RED-test/source slice before editing production code.

## 2026-08-22 17:55 CDT — selected voice-input TDD claim

- Root cause: the voice panel calls `VoiceService` directly, so it always depends on Web Speech even when Settings selects installed faster-whisper or Deepgram. Jarvis High is the reply TTS model; its installed assets are healthy and cannot fix this input-side routing defect.
- Exact additional ownership: `app/src/features/voice/JarvisVoiceInputService.ts`, its focused test, `VoiceModal.tsx`, and the three existing `VoiceModal.*.test.tsx` files that mock the input service.
- Intent: adapt the shared selected-STT session to the voice panel's established event/lifecycle interface, keep one microphone owner, preserve commit-phrase/turn/session behavior, and surface selected-engine startup failures safely. No TTS model/native engine, chat runtime, settings, or global dictation source is owned in this slice.
- Next action: add RED selected-engine/exclusivity/cancel tests, implement the adapter, then rerun all affected voice tests.

## 2026-08-22 20:46 CDT — selected voice-input implementation checkpoint

- Shared branch movement preserved: HEAD advanced independently from task base `5440e986` to `4ca56889`; no reset, switch, stash, rebase, or unrelated staging occurred.
- Implemented `JarvisVoiceInputService` as the voice panel adapter over the shared selected-STT session boundary. It opens only the persisted engine, normalizes partial/final/error/end events, sanitizes provider failures, and participates in the existing one-microphone exclusivity contract. `VoiceModal` now cancels that selected session during teardown.
- TDD evidence: the selected-engine adapter began RED because the module did not exist. A later pending-open cancellation regression was separately proven RED (`1 failed, 2 passed`) because no exclusivity-stop signal was emitted, then repaired by immediate idempotent session cleanup.
- Fresh focused verification PASS: `JarvisVoiceInputService.test.ts`, `VoiceModal.stop.test.tsx`, `VoiceModal.turn.test.tsx`, and `VoiceModal.sttSmoke.test.tsx` — 4 files, 46 tests, 0 failures. Existing jsdom canvas/ref/act warnings remain non-fatal and were not represented as native proof.
- Current Groq test fixtures were updated only inside the owned voice tests from the retired Llama 3.3 catalog entry to `GROQ_DEFAULT_MODEL`; this restored the protected voice send-path regression after a separate coordinated catalog change.
- Full TypeScript check is not green: it reports four active SiYuan test nullability diagnostics plus one `cloudRecovery.test.ts` object-shape diagnostic, all outside this owned manifest. No owned TypeScript diagnostic was reported.
- Native status: the Jarvis High ONNX/config files remain hash-verified and the official native executable is running, but microphone/provider/output playback acceptance is `BLOCKED` because the user prohibited computer control and no VibeSpace-only native interaction connector is available. No native PASS is claimed.
- Next action: commit this exact voice source/test/spec/ledger slice, then claim separate clean Supabase migration/webhook files for remote SMS/WhatsApp/Telegram/Discord source readiness. Production deployment, secrets, billing, and live provider registration remain excluded.

## 2026-08-22 20:47 CDT — remote messaging core claim

- Voice implementation commit: `326f08ed` (`fix(voice): honor selected Jarvis speech input`).
- Exact additional ownership: `supabase/migrations/0046_remote_jarvis_messaging.sql`, its static security-contract test, `supabase/functions/_shared/remoteJarvisMessaging.ts`, and its focused test.
- Intent: establish durable owner-approved channel identity, replay-safe inbound event, bounded chat history, and a dependency-injected chat-only coordinator before provider webhooks are allowed to call Jarvis. Remote messages receive no tool, call, purchase, credential, deployment, or device-control authority.
- Next action: start with RED coordinator tests for unknown identity, duplicate delivery, bounded history, safe error delivery, and exact one-reply behavior; then add the migration and pure implementation.

## 2026-08-22 20:52 CDT — remote messaging core implementation checkpoint

- TDD RED: the coordinator test failed with `ERR_MODULE_NOT_FOUND`; the migration contract failed with `ENOENT` before their implementations existed.
- Added a provider-neutral coordinator that accepts only a signature-verified normalized message, claims its provider event once, requires the exact active identity with `chat` scope, loads at most 12 recent turns, invokes completion with an explicit empty capability set, delivers exactly one reply, and emits only safe retry text on failure.
- Added migration `0046` with owner-scoped identities/events/turns, hashed short-lived pairing codes, service-only pairing redemption, a five-attempt/ten-minute redemption window, event uniqueness by platform/workspace/provider event, and RLS/revokes preventing external clients from writing usage/event state.
- Fresh focused verification PASS: two Node test files, 9 tests, 0 failures. The Node module-type warning is pre-existing repository configuration noise; no Deno/network/live database execution occurred.
- Truth boundary: schema SQL has static contract proof only because no disposable local Supabase/PostgreSQL runtime is configured. No migration is applied, no webhook registered, no bot/phone credential used, and no remote channel is represented as live.
- Next action: commit the exact messaging-core slice, then claim provider-specific webhook/runtime files beginning with Twilio SMS + WhatsApp signature verification and replay-safe reply behavior.

## 2026-08-22 20:53 CDT — Twilio SMS + WhatsApp adapter claim

- Remote messaging core commit: `ea5af10b` (`feat(messaging): add secure remote Jarvis core`).
- Exact additional ownership: migration `0047` and its contract test, the shared remote runtime and test, and the existing Twilio inbound webhook plus a new focused test.
- Intent: retain Twilio signature, STOP, and HELP behavior; add one-time pairing redemption for SMS/WhatsApp; authorize the exact active identity; and use authoritative app access, request rate limits, atomic message budget, provider settlement, and event audit before replying.
- Next action: build the shared metered runtime with RED tests, then replace the minimal record-only webhook behind pure signature/payload tests.

## 2026-08-22 21:01 CDT — Twilio SMS + WhatsApp implementation checkpoint

- TDD RED: the remote runtime test failed because its module did not exist; migration `0047` failed because its SQL did not exist; the Twilio webhook test failed on the old static Deno URL import before a pure handler was available.
- Added a service-role-only access RPC so signed remote webhooks must pass the same authoritative `app_access_compute` decision as desktop hosted messages.
- Added metered remote completion with fail-closed access, provider configuration, app-admin lookup, rate limiting, atomic message-budget reservation, provider settlement, safe response parsing, and sanitized usage audit. Raw provider bodies/errors are never returned to the channel.
- Replaced the record-only inbound Twilio handler with a pure tested SMS + WhatsApp handler and guarded Deno wiring. It verifies the exact Twilio signature first, normalizes SMS versus WhatsApp identity, preserves STOP/HELP, revokes identity on opt-out, redeems one-time pairing, deduplicates provider retries, loads bounded history, meters both inference and outbound segments, escapes TwiML, and returns at most one reply.
- Fresh focused verification PASS: five Node test files, 19 tests, 0 failures. Exact diff check PASS. No Deno executable or disposable Supabase/PostgreSQL runtime is installed, so Edge type-check, migration execution, Twilio signature with a real request, provider timing, actual carrier delivery, and budget settlement against live tables remain `BLOCKED`/unclaimed.
- Activation inputs still required: deployed Supabase project URL/anon/service configuration, `DEEPSEEK_API_KEY`, `TWILIO_AUTH_TOKEN`, public `APP_BASE_URL`, Twilio SMS/WhatsApp sender setup, webhook registration, and explicit deployment approval. No secret was read or changed.
- Next action: commit this exact Twilio/runtime slice, then implement Telegram webhook signature-secret/pairing/reply behavior and Discord signed interaction behavior in separate owned slices.
