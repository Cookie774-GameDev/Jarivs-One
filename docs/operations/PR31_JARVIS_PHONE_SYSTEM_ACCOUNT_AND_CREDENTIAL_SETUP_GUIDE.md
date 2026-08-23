# Jarvis Phone, SMS, WhatsApp, Telegram, and Discord Setup Guide

Last verified: 2026-08-22 (United States pricing examples, USD)

This is the safe operator checklist for activating the VibeSpace Jarvis phone and remote-chat system. It intentionally contains **no real keys, tokens, phone numbers, project IDs, or customer data**. Provider dashboards are authoritative because prices, taxes, carrier fees, free credits, and verification rules can change.

## Quick budget

### Development and private testing

- Supabase Free: $0 while the project stays within the free limits. Free projects can pause after one week of inactivity.
- Fly.io phone server: approximately $6–$12/month for a small always-running shared machine, depending on region and memory. A payment card is required for new organizations.
- Twilio: place about **$20** in the account for a phone number and initial SMS/WhatsApp testing.
- Telnyx: place about **$20–$30** in the account for a number and initial calling tests. This is a recommended buffer, not a guaranteed provider minimum.
- Deepgram: currently advertises $200 in free pay-as-you-go credit; no starting deposit should be needed while credit remains.
- DeepSeek: place about **$5–$10** in the account for initial conversations. This is a recommended buffer, not a guaranteed minimum.
- Telegram and Discord developer accounts/bots: $0 for normal private-bot testing.
- LiveKit Cloud: optional; start on its available free/development allowance and review the dashboard before enabling paid usage.

Recommended initial prepaid balance across usage providers: **$50–$75**. A practical always-on first month is commonly **$35–$75 plus actual calls/messages**, depending on Supabase plan, machine size, destination, carrier fees, and usage. Set low provider alerts/spend caps before testing.

### Production baseline

- Consider Supabase Pro from $25/month so the backend does not pause and has production-oriented backups/support.
- Keep at least $20 available in Twilio and $20–$30 in Telnyx during controlled launch testing.
- Start with strict per-user and per-call limits. Do not preload a large balance before the call and message budget controls are verified against live provider usage.
- United States application-to-person SMS may require A2P 10DLC or toll-free verification, with registration and carrier fees not included in the simple per-message estimate.

## Accounts to create

| Order | Provider/account | Why it is needed | Account/setup location | Suggested starting money |
| --- | --- | --- | --- | ---: |
| 1 | Supabase | Database, authentication, pairing records, Edge Functions, usage limits | [Supabase Dashboard](https://supabase.com/dashboard) | $0 test; $25/month production baseline |
| 2 | Fly.io | Always-on HTTPS/WSS phone voice gateway | [Fly.io](https://fly.io/) | Approximately $6–$12/month |
| 3 | Twilio | SMS and WhatsApp transport; existing optional Twilio voice path | [Twilio Console](https://console.twilio.com/) | About $20 test balance |
| 4 | Meta Business Portfolio | Production WhatsApp Business sender through Twilio | [Meta Business](https://business.facebook.com/) | Verification is free; messaging charges apply through Twilio/Meta |
| 5 | Telnyx | Approved “Call Anyone” PSTN transport and phone number | [Telnyx Mission Control](https://portal.telnyx.com/) | About $20–$30 test balance |
| 6 | Deepgram | Streaming speech recognition and remote-call speech output | [Deepgram Console](https://console.deepgram.com/) | Current advertised $200 free credit, then usage |
| 7 | DeepSeek | Jarvis remote-message/call language model | [DeepSeek Platform](https://platform.deepseek.com/) | About $5–$10 test balance |
| 8 | Telegram | Free private Jarvis bot | Message [@BotFather](https://t.me/BotFather) in Telegram | $0 |
| 9 | Discord | Free Jarvis application/bot | [Discord Developer Portal](https://discord.com/developers/applications) | $0 |
| 10 | LiveKit (optional) | In-app WebRTC rooms | [LiveKit Cloud](https://cloud.livekit.io/) | Start with available development allowance |

## Values to collect

Never put the values in this document. Record them in a password manager first, then install them into the correct server-side secret store.

### Supabase

From the Supabase project settings/API keys and project URL areas, collect:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or current publishable key — allowed in the desktop client
- `SUPABASE_SERVICE_ROLE_KEY` or current server secret key — **server only**
- Project reference, used to form Edge Function URLs

Public Edge base URL:

`https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1`

Required public webhooks after their functions are deployed:

- Twilio SMS/WhatsApp: `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/twilio-message-webhook`
- Telnyx calls: `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/telnyx-call-webhook`
- Telegram: `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/telegram-message-webhook` after that adapter is implemented/deployed
- Discord: `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/discord-interaction-webhook` after that adapter is implemented/deployed

Server configuration also needs:

- `APP_BASE_URL=https://<SUPABASE_PROJECT_REF>.supabase.co`
- `APP_VERSION=<the deployed VibeSpace version>`

### Fly.io phone service

Create the Fly app, attach billing, and obtain its HTTPS hostname. Collect/configure:

- `PHONE_JARVIS_ENABLED=true` only after every required value is installed
- `PHONE_JARVIS_PUBLIC_BASE_URL=https://<YOUR_FLY_APP>.fly.dev`
- `VITE_PHONE_JARVIS_CLOUD_URL=https://<YOUR_FLY_APP>.fly.dev` in the desktop build
- `BRIDGE_TOKEN_PEPPER=<generated 64-character hexadecimal secret>`

Generate the pepper locally with a cryptographically secure password generator or:

`python -c "import secrets; print(secrets.token_hex(32))"`

The generated output is a password. Store it only as a Fly/server secret and in the operator password manager.

### Twilio SMS and WhatsApp

From the Twilio Console, collect:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` in international E.164 form

Steps:

1. Create and upgrade the Twilio account.
2. Buy an SMS-capable number or configure an approved sender.
3. For private WhatsApp testing, activate the Twilio WhatsApp Sandbox.
4. For production WhatsApp, use Twilio WhatsApp Self Sign-up, connect/create a Meta Business Portfolio and WhatsApp Business Account, verify number ownership, and complete Meta business verification.
5. Set the incoming-message webhook to the exact deployed `twilio-message-webhook` URL using HTTPS and `POST`.
6. Enable low-balance alerts and review geographic permissions.

Current United States examples: SMS begins around $0.0083 per inbound/outbound segment plus carrier fees; WhatsApp begins around $0.005 per message plus applicable Meta fees; Twilio numbers begin around $1.15/month. Treat the live Twilio Console as authoritative.

### Telnyx “Call Anyone”

Complete identity/payment verification, fund the account, buy a voice-capable number, and create a Call Control application. Collect:

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY` for webhook signature verification
- `TELNYX_CALL_CONTROL_CONNECTION_ID`
- `TELNYX_PHONE_NUMBER`
- `TELNYX_CALL_WEBHOOK_URL=https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/telnyx-call-webhook`
- `TELNYX_MEDIA_STREAM_URL=wss://<YOUR_FLY_APP>.fly.dev/telnyx/media`

Telnyx currently describes Voice API as pay-as-you-go, with Call Control around $0.002/minute plus destination-specific SIP-trunking fees; numbers start around $1/month. Verify the exact destination rate and permitted countries before enabling outbound calls.

### Deepgram speech

Create an API key with the minimum useful project scope. Collect:

- `DEEPGRAM_API_KEY`
- `DEEPGRAM_FLUX_MODEL=flux-general-en` or the verified selected runtime ID
- `DEEPGRAM_AURA_MODEL=aura-2-thalia-en` or the verified selected voice ID

Deepgram currently advertises $200 free pay-as-you-go credit with no minimum and no expiration. Confirm model availability and live prices in its dashboard before setting the VibeSpace cost-rate variables.

### DeepSeek Jarvis reasoning

Create an API key and add a small test balance. Collect:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL=deepseek-chat`

The official price page currently lists `deepseek-chat` per one million tokens, with separate cached-input, uncached-input, and output prices. Do not hard-code a dollar budget from this guide; configure the current rates in the server and keep a low initial balance.

### Telegram

1. Open the real verified `@BotFather` account in Telegram.
2. Run `/newbot`, choose a display name and a username ending in `bot`.
3. Save the returned token in the password manager.
4. Generate a separate random webhook secret.

Collect:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Telegram’s normal Bot Platform is free for users and developers. A bot cannot initiate a private conversation; the user must message/start it first. Never share the token—anyone holding it controls the bot.

### Discord

1. Create an application in the Discord Developer Portal.
2. Copy Application ID and Public Key from General Information.
3. Open Bot, generate/reset the bot token, and store it immediately.
4. Grant only the required install scopes/permissions: `applications.commands` and, if server installation is needed, `bot` with Send Messages.
5. Set the Interactions Endpoint URL after the signed adapter is deployed.

Collect:

- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_BOT_TOKEN`

Normal Discord application/bot creation is free. The bot token is a secret; Application ID and Public Key are identifiers/verification material but should still be managed deliberately.

### Optional LiveKit

Create a project and collect:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL=wss://<YOUR_PROJECT>.livekit.cloud`

LiveKit Cloud is usage-metered. Review its current project allowance and pricing before enabling production rooms.

## Cost-control variables

Set these from the provider rates shown in the actual signed-in dashboards at deployment time:

- `TELNYX_VOICE_USD_PER_MINUTE`
- `DEEPGRAM_FLUX_USD_PER_MINUTE`
- `DEEPGRAM_AURA_USD_PER_MILLION_CHARS`
- `DEEPSEEK_INPUT_USD_PER_MILLION_TOKENS`
- `DEEPSEEK_OUTPUT_USD_PER_MILLION_TOKENS`
- `CALL_ANYONE_MAX_CREDITS_PER_MINUTE`

Do not launch with zero or guessed pricing values. Start with conservative limits, one approved destination, short call-duration caps, low message limits, and provider billing alerts.

## Safe storage map

| Value type | Safe destination | Never place it in |
| --- | --- | --- |
| Supabase service-role/secret key | Supabase Edge Function secrets and Fly secrets | Desktop app, any `VITE_` value, Git, chat, screenshots |
| Twilio/Telnyx/Deepgram/DeepSeek tokens | Supabase Function secrets or Fly secrets according to the component using them | Git, frontend bundles, logs, support screenshots |
| Telegram/Discord bot tokens | Supabase Edge Function secrets | Git, Discord/Telegram messages, desktop environment |
| Fly bridge pepper | Fly secret plus password manager backup | Git or public environment variables |
| Supabase publishable/anon key | Desktop build configuration; protected by RLS | Do not mistake it for authorization by itself |
| Public HTTPS/WSS URLs | Desktop/server configuration | These are not secrets, but must use the exact deployed origin |

For local development only, use an ignored `.env` copied from `phone-jarvis/cloud/.env.example`. Before adding any value, verify `.env` is ignored by Git. Production values belong in Supabase/Fly secret stores, not a file in the repository.

## Activation order

1. Create Supabase and apply the reviewed migrations/functions in a non-production project.
2. Create/deploy the Fly phone service while `PHONE_JARVIS_ENABLED=false`.
3. Install server-side Supabase, DeepSeek, Deepgram, Telnyx, and Twilio secrets.
4. Configure cost-rate variables, spend caps, destination allowlists, duration limits, and provider alerts.
5. Deploy the signed webhook adapters.
6. Register each exact webhook URL in the provider dashboard.
7. Test pairing and one private conversation per channel.
8. Test one approved short phone call, cancellation, invalid signatures, replay, insufficient balance, and provider outage.
9. Compare VibeSpace usage records with actual provider usage/cost dashboards.
10. Only after the comparison passes, set `PHONE_JARVIS_ENABLED=true` and widen access gradually.

## Status boundaries

- SMS/WhatsApp code exists, but it is not live until Supabase deployment, Twilio credentials, sender configuration, and webhook registration are complete.
- Telegram and Discord need their signed adapters deployed before their listed webhook URLs can be registered.
- iMessage is not part of the current production system. Keep it labeled future/experimental unless an Apple-supported, reviewable transport is selected; do not use private-device automation as a hidden bridge.
- A source test is not proof of carrier delivery. Record live sanitized evidence for every provider before marking it operational.

## Official sources

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase product security](https://supabase.com/docs/guides/security/product-security)
- [Fly.io resource pricing](https://fly.io/docs/about/pricing/)
- [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)
- [Twilio messaging pricing](https://www.twilio.com/en-us/pricing/messaging)
- [Twilio WhatsApp Self Sign-up](https://www.twilio.com/docs/whatsapp/self-sign-up)
- [Twilio webhook request validation](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api)
- [Deepgram pricing](https://deepgram.com/pricing)
- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing-details-usd)
- [Telegram bot introduction](https://core.telegram.org/bots)
- [Telegram bot creation tutorial](https://core.telegram.org/bots/tutorial)
- [Discord application/bot quick start](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord interaction verification](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [LiveKit Cloud billing](https://docs.livekit.io/deploy/admin/billing/)
