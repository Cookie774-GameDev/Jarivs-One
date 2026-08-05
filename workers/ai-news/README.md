# VibeSpace Hourly AI News Worker

Cloudflare backend for the VibeSpace news feed:

- **Cron Trigger** starts ingestion every hour at minute 7.
- **Worker** fetches official RSS/Atom feeds plus optional X, Reddit, and YouTube sources.
- **D1** stores normalized articles and ingestion history.
- **Workers AI** optionally summarizes, categorizes, and scores a limited number of new items.
- `GET /api/news` exposes the latest feed to VibeSpace.
- `POST /admin/run` performs a protected manual ingestion run.

No API keys are committed and the desktop app is not modified by this package.

## Why minute 7?

The trigger is `7 * * * *`, meaning seven minutes after every UTC hour. It still runs hourly while avoiding the busiest top-of-hour scheduling window.

## 1. Install and authenticate

```bash
cd workers/ai-news
npm install
npx wrangler login
```

## 2. Create D1

```bash
npx wrangler d1 create vibespace-news
```

Copy `wrangler.jsonc.example` to `wrangler.jsonc`, then replace `REPLACE_WITH_D1_DATABASE_ID` with the ID returned by Cloudflare.

```bash
npx wrangler d1 migrations apply vibespace-news --remote --config wrangler.jsonc
```

## 3. Configure sources

Edit only the non-secret `vars` in `wrangler.jsonc`.

### Official RSS/Atom feeds

`OFFICIAL_FEEDS` is a JSON array:

```json
[
  {
    "name": "Company newsroom",
    "url": "https://example.com/feed.xml",
    "company": "Example AI",
    "official": true
  }
]
```

### YouTube

`YOUTUBE_CHANNELS` is a JSON array of official or trusted channel IDs:

```json
[
  {
    "id": "UC_REPLACE_ME",
    "name": "Example AI",
    "company": "Example AI",
    "official": true
  }
]
```

### Reddit

`REDDIT_SUBREDDITS` is a comma-separated list. Reddit items always remain labeled `community`; AI cannot silently promote them to official news.

### X

`X_QUERY` controls recent search. Add official account handles to `X_OFFICIAL_USERNAMES` as a comma-separated list without `@`. Posts from all other accounts remain `unverified`.

## 4. Add secrets

Only add the services you plan to use:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put X_BEARER_TOKEN
npx wrangler secret put REDDIT_CLIENT_ID
npx wrangler secret put REDDIT_CLIENT_SECRET
npx wrangler secret put REDDIT_USER_AGENT
npx wrangler secret put YOUTUBE_API_KEY
```

For local development, copy `.dev.vars.example` to `.dev.vars`. Never commit `.dev.vars`.

## 5. Test

```bash
npm run typecheck
npm run dev
```

Trigger the scheduled handler locally:

```bash
curl "http://localhost:8787/__scheduled?cron=7+*+*+*+*"
```

Read the feed:

```bash
curl "http://localhost:8787/api/news?limit=25"
```

Run it manually:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:8787/admin/run"
```

## 6. Deploy

```bash
npm run deploy
```

After deployment, Cloudflare owns the hourly schedule. VibeSpace does not need to remain open.

## API

### `GET /health`

Returns service status and the most recent ingestion run.

### `GET /api/news`

Query parameters:

- `limit`: 1–100, default 30
- `verification`: `official`, `confirmed`, `community`, or `unverified`
- `company`: exact company name

### `POST /admin/run`

Starts a manual run. Requires `Authorization: Bearer <ADMIN_TOKEN>`.

## Cost controls

- AI is disabled by default.
- When enabled, at most `AI_MAX_ITEMS_PER_RUN` items are sent to Workers AI.
- `MAX_ITEMS_PER_RUN` is capped at 40 to protect D1 and Worker limits.
- Existing URLs, external IDs, and deterministic content hashes are ignored.
- AI output can never upgrade a rumor or community post to `official`.
