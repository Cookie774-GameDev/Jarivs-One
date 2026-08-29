# VibeSpace Model Catalog Automation

## Source of truth

VibeSpace must never treat a static model name as proof that a model can run. Every executable catalog row comes from the connected account's current authority:

- OpenCode routes use the managed local OpenCode bridge's authenticated `/provider` and `/config/providers` responses. IDs remain provider-qualified, such as `openai/gpt-5.6-sol`.
- Direct BYOK routes use that provider's authenticated model-list endpoint, not an inference prompt. The key stays in the local credential vault and is never sent to the VibeSpace news Worker or another shared service.
- Local models use the installed local runtime's inventory.

The picker shows only the latest verified rows for a route. If a source removes or renames a model, the old selection is disabled and the user must choose a currently verified route. VibeSpace does not silently substitute a similarly named model.

## Five-minute refresh behavior

While the VibeSpace desktop app is running, a single background schedule refreshes connected catalogs every five minutes and refreshes immediately after a credential, OpenCode authentication, runtime, plan, or region change. It is deliberately outside model dispatch, so catalog maintenance never waits in the user's response path and cannot consume inference tokens.

The schedule is bounded: one authenticated `GET /models`-style request per connected direct provider, a single managed OpenCode catalog read, bounded concurrency, and ordinary timeout/error handling. A failed refresh retains the last verified catalog as stale information but never upgrades it to current authority.

This is the only safe way to resolve a change such as a former DeepSeek Flash ID being replaced by an upstream Vision/experimental ID. VibeSpace adopts the exact identifier only after the relevant connected provider or OpenCode route reports it. A display name, news post, or guess never changes a live route.

## Cloudflare boundary

Cloudflare is appropriate for a shared public release/change feed, not for private account catalog discovery. A Worker Cron Trigger can run a daily public-source job, cache a signed public manifest, and announce that a provider published a change. It cannot truthfully decide whether a particular user's subscription, region, key, organization, or OpenCode configuration can run a model.

Do not upload user API keys to a Worker for this. Keep private discovery in the desktop app. If a public manifest is added later, it must be advisory only; local authenticated discovery remains the final execution gate.

For a future Worker, use a `scheduled()` handler and a UTC Cron Trigger appropriate for the public feed, publish only public metadata, and keep the deploy/migration step explicitly owner-approved. Cloudflare's Free plan has finite request, CPU, subrequest, and Cron limits, so it must be monitored rather than described as an unlimited service. Private provider catalogs must still refresh locally every five minutes because their credentials never leave the desktop app.

## OpenCode connection boundary

VibeSpace currently reads OpenCode's authenticated live catalog, but saving a VibeSpace BYOK key does not silently copy that secret into OpenCode. That would create a second credential store and violate user consent. A future Settings action may offer an explicit, local-only “Connect this provider in OpenCode” flow; it must show the provider, destination, and consent before invoking OpenCode's own supported authentication/configuration path, then refresh the live catalog and prove the exact route.

## Operations checks

- Verify the model picker displays each selected route's provider-qualified ID and last verification time.
- Confirm a removed source model becomes unavailable rather than being renamed locally.
- Confirm the five-minute refresh uses catalog endpoints only and adds no model-dispatch delay.
- Check the AI News `/health` endpoint before calling a local fallback an offline condition. A live request failure can be a stale configured URL, WebView transport issue, timeout, proxy, or service outage; it is not proof that the person is offline.
