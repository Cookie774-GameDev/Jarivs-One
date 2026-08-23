# Jarvis Phone, Messaging, and Voice Production-Readiness Design

## Outcome

VibeSpace will provide one security-governed Jarvis conversation service across:

1. The existing native voice panel using the selected local Jarvis High voice.
2. The existing owner-approved outbound call flow for calling a person or business.
3. Remote text conversations over ordinary SMS, WhatsApp, Telegram, and Discord without requiring a VibeSpace mobile application.

Slack is outside this task at the user's direction. Consumer iMessage remains explicitly `external_bridge_required`: Apple exposes no supported general-purpose server bot API for a Windows/cloud Jarvis service. An iPhone can use ordinary carrier SMS immediately through its Messages app once the SMS provider is activated. A future iMessage implementation requires a separately approved, continuously online Apple-hosted bridge and must never be presented as native iMessage before that exists.

## Starting state

- Task/agent: `PR31-JARVIS-PHONE-MESSAGING-VOICE-PRODUCTION-READINESS` / `VS-CODEX-JARVIS-COMMS-VOICE-20260822`.
- Worktree: `C:\Users\viper\VibeSpace-UnifiedChungus-Final`.
- Branch/base/upstream: `integration/UnifiedChungus-final` / `5440e986fa9376c3afe49f14cdc3ef89b7ed28f9` / `origin/UnifiedChungus`.
- Shared worktree is dirty and concurrently active. Only task-owned files may be staged or committed.
- C: free capacity at claim: `2208952320` bytes. Focused work is feasible; large native builds are capacity-sensitive.

## Verified current behavior

### Voice

- The selected Jarvis High artifacts are installed at the VibeSpace application-data model path.
- `jarvis-high.onnx` is exactly 114,199,011 bytes with SHA-256 `9791877D9C099FABBF30BE2825E011451C39B3431E21E81E866F5B6507E72993`.
- `jarvis-high.onnx.json` is exactly 7,262 bytes with SHA-256 `D0B8772D81C1DA2FCDFD79E90BFF027F46F040450E1DEB89B43A9F6B1946C5A7`.
- Native `jarvis_voice_status`, warmup, synthesis, WAV encoding, and frontend playback code exist. Therefore the reported failure is after download verification and must be isolated at engine initialization, synthesis, response routing, or audio playback.
- The voice panel currently uses `VoiceService` for speech recognition and sends a normal `jarvis:send` request with `speakReply: true`. Reply delivery passes through the shared voice router.

### Calls

- Native in-app calling uses LiveKit/WebRTC through the optional phone cloud service.
- Calling another person/business already has preparation, explicit approval, budget reservation, Telnyx creation, signed webhook handling, disclosure, opt-out, protected-action approval, and credit settlement source paths.
- Live operation still requires deployed cloud services, a public TLS/WSS origin, provider credentials, phone numbers, webhook registration, and the desktop build-time phone-cloud URL. Source presence is not live-provider proof.

### Messaging

- Outbound SMS exists through the authenticated `sms-send` Edge Function.
- `twilio-message-webhook` verifies Twilio signatures, handles STOP/HELP, and records inbound usage, but intentionally sends no Jarvis reply.
- The renderer messaging gateway defines identity pairing, roles/scopes, deduplication, conversation linking, group policy, and adapter capabilities. It uses only an in-memory repository and has no production SMS/WhatsApp/Telegram/Discord adapters.

## Architecture

### Shared remote-conversation kernel

All provider webhooks normalize into one server-side request:

```text
verified provider event
  -> stable provider event/message id
  -> channel identity + owner mapping
  -> opt-out / pairing / role / scope / group policy
  -> idempotent inbound message claim
  -> bounded Jarvis text turn
  -> persisted sanitized conversation turn
  -> provider-specific outbound delivery
  -> idempotent delivery receipt + usage settlement
```

The shared handler must accept dependencies for provider verification, persistence, Jarvis completion, and delivery so security and failure cases can be tested without live credentials. It must never invoke desktop-local URLs, desktop credentials, user-interface automation, or hidden fallback providers.

### Channel adapters

- **SMS:** Twilio signed form webhook. Map the sender to the owner's configured phone identity, honor STOP/START/HELP, preserve carrier compliance, run one Jarvis text turn, and return/send a bounded SMS response.
- **WhatsApp:** Twilio WhatsApp uses the same signed webhook contract with `whatsapp:+E164` addresses but separate channel identity, opt-in/template constraints, and capability declaration.
- **Telegram:** HTTPS webhook with the configured Telegram secret-token header; normalize direct messages and approved groups; send through the Bot API using a server-only bot token.
- **Discord:** signed Interactions/webhook entry using Discord Ed25519 verification. Initial production scope supports direct/mention-triggered text interactions and replies; a continuously connected Gateway bot is a separate runtime if ordinary unprompted server-channel messages are required.
- **iMessage:** no fake adapter. Keep `external_bridge_required` until a separately approved Apple-hosted bridge provides authenticated inbound/outbound events.

### Persistence and authorization

Add server-owned tables for channel installations, identities/pairings, conversations, inbound messages, outbound deliveries, and opt-outs. Every exposed table has RLS enabled. Authenticated users may read/manage only their own safe configuration; provider secrets and service credentials never enter browser-readable rows. Webhook handlers use server credentials only after provider signature verification.

The existing role/scope contract remains authoritative. Remote channels default to the minimum text-conversation scope. Costly operations, tool actions, project files, private memory, model switching, and calls require explicit pairing/approval. Group messages are mention-gated, channel-allowlisted, bot-filtered, cooled down, and never receive private-memory context.

### Voice repair boundary

The voice fix will add a failing regression at the earliest reproducible boundary, then make the smallest change that:

- distinguishes installed, checksum-verified, engine-ready, synthesis-ready, and playback-ready states;
- reports a safe actionable error instead of silently appearing to work;
- uses the exact selected engine/preset for voice replies;
- cancels stale synthesis/playback and never duplicates audio;
- preserves OS-local fallback only when explicitly documented and visible;
- leaves chat, Command Center, session binding, and response validation boundaries unchanged.

## Security and privacy requirements

- Verify provider signatures against the exact externally visible request URL and raw body/form required by that provider.
- Reject missing, malformed, stale, replayed, or mismatched provider events before database or Jarvis work.
- Never log message bodies, phone numbers, API tokens, raw provider errors, private memory, or model prompts. Store only necessary content under the owner's explicit retention policy.
- Use constant-time comparisons where shared-secret comparison is required.
- Apply idempotency before completion and delivery; retries must return the prior safe result or no-op.
- Rate-limit per provider identity and owner, bound body size and text length, and time-bound every external call.
- Preserve STOP/opt-out and blocked-recipient authority across channels.
- Keep Supabase secret/service keys server-only. External webhooks may use `verify_jwt = false` only because their handlers perform provider-specific verification.

## Acceptance matrix

| Surface                      | Required proof                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Jarvis High install          | Exact size/hash verified; corrupt/missing assets fail visibly                                                        |
| Jarvis High synthesis        | Real native synthesis returns a valid non-empty WAV at the expected sample rate                                      |
| Voice conversation           | User speech creates one turn; one validated Jarvis reply plays; stop cancels; no duplicate audio                     |
| Voice errors                 | Mic denial, engine init failure, synthesis timeout, and playback failure are visible and recoverable                 |
| Call Jarvis                  | Deployed configured build joins one LiveKit room and exchanges audio                                                 |
| Call another person/business | Prepare -> explicit approval -> disclose -> converse -> hang up/opt out -> settle, with signed webhook evidence      |
| SMS                          | Signed inbound text from an iPhone or Android phone receives one correlated Jarvis reply; STOP never invokes Jarvis  |
| WhatsApp                     | Signed inbound DM receives one reply with separate channel identity and opt-in enforcement                           |
| Telegram                     | Correct secret-token webhook receives one reply; invalid token and duplicate update do nothing                       |
| Discord                      | Valid signed direct/mention interaction receives one reply; invalid signature/bot/self/unapproved channel do nothing |
| iMessage                     | UI/docs say Apple bridge required; no claim of live iMessage support                                                 |
| Security                     | Pairing, scope denial, rate limit, idempotency, replay, content bounds, secret redaction, and RLS tests pass         |

## Test order

1. Focused RED test at the Jarvis High native/provider boundary.
2. Voice provider/router/component tests after each behavior change.
3. Shared remote-conversation unit tests for identity, authorization, idempotency, timeout, redaction, and delivery failure.
4. Provider fixtures for Twilio SMS/WhatsApp, Telegram secret token, and Discord Ed25519 signatures.
5. Migration/RLS policy tests and Supabase security advisors when a safe non-production target is explicitly authorized.
6. Python call-cloud security/Telnyx regression tests.
7. Repository typecheck/build/native checks only while disk capacity permits.
8. Official native VibeSpace manual QA. No standalone browser evidence and no Windows computer-control automation per the user's instruction.

## Live activation inputs still required

- Public phone-cloud base URL and deployed LiveKit/Telnyx/Twilio services.
- Supabase project migration/function deployment approval.
- Twilio account/auth token, SMS/WhatsApp sender configuration, and public webhook URLs.
- Telegram bot token, webhook secret token, and approved chats/groups.
- Discord application public key, bot/application token as required, interaction URL, and approved guild/channel IDs.
- Deepgram/LLM/TTS credentials required by the chosen hosted call/messaging completion path.

Credentials must be provided through the platform secret stores later, never committed or pasted into fixtures/logs. Until activation and real-provider acceptance are performed, the truthful completion state is **source-ready and tested**, not **live verified**.

## Risks and stop conditions

- Shared branch changes may advance HEAD; each commit records its actual parent and exact manifest.
- C: capacity may block native compilation; no caches/files will be deleted without permission.
- Three failed root-cause attempts or an architectural conflict triggers a documented stop for user direction.
- Consumer iMessage cannot be made a supported Windows/cloud bot channel by relabeling SMS or using private automation.

## Commit and native evidence template

- Commit SHA(s): pending.
- Exact owned files: docs currently; source/test ownership added before edits.
- Focused tests: pending.
- Full checks: pending/capacity-gated.
- Native timestamp/build SHA/provider/model/surface/expected/actual/sanitized error: pending.
- Live SMS/WhatsApp/Telegram/Discord/call evidence: blocked until credentials, deployment, and provider configuration are supplied.

## References

- Supabase changelog: <https://supabase.com/changelog.md>
- Supabase Edge Function security: <https://supabase.com/docs/guides/functions/auth>
- Supabase secrets: <https://supabase.com/docs/guides/functions/secrets>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Existing pinned Jarvis High design: `docs/superpowers/specs/2026-08-02-jarvis-high-voice-design.md`
