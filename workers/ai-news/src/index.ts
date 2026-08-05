interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

interface Env {
  DB: D1Database;
  AI?: AiBinding;
  ADMIN_TOKEN?: string;
  X_BEARER_TOKEN?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  YOUTUBE_API_KEY?: string;
  OFFICIAL_FEEDS?: string;
  REDDIT_SUBREDDITS?: string;
  YOUTUBE_CHANNELS?: string;
  X_QUERY?: string;
  X_OFFICIAL_USERNAMES?: string;
  AI_ENABLED?: string;
  AI_MODEL?: string;
  AI_MAX_ITEMS_PER_RUN?: string;
  MAX_ITEMS_PER_RUN?: string;
  CORS_ORIGIN?: string;
}

type Verification = "official" | "confirmed" | "community" | "unverified";

interface FeedConfig {
  name: string;
  url: string;
  company?: string;
  official?: boolean;
}

interface YouTubeChannel {
  id: string;
  name: string;
  company?: string;
  official?: boolean;
}

interface RawItem {
  sourcePlatform: "official" | "x" | "reddit" | "youtube";
  externalId: string;
  sourceName: string;
  sourceAuthor?: string;
  sourceUrl: string;
  title: string;
  text: string;
  company?: string;
  publishedAt: string;
  verification: Verification;
  metadata?: Record<string, unknown>;
}

interface EnrichedItem extends RawItem {
  headline: string;
  summary: string;
  category: string;
  modelNames: string[];
  importanceScore: number;
  dedupeKey: string;
}

interface SourceResult {
  source: string;
  items: RawItem[];
  error?: string;
}

interface IngestionResult {
  status: "success" | "partial" | "failed";
  fetched: number;
  stored: number;
  errors: Array<{ source: string; message: string }>;
  startedAt: string;
  completedAt: string;
}

interface AiEnrichment {
  headline?: unknown;
  summary?: unknown;
  company?: unknown;
  model_names?: unknown;
  category?: unknown;
  importance_score?: unknown;
}

const AI_TERMS = [
  "artificial intelligence",
  " ai ",
  "llm",
  "language model",
  "foundation model",
  "multimodal",
  "machine learning",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "grok",
  "xai",
  "qwen",
  "deepseek",
  "mistral",
  "llama",
  "kimi",
  "minimax",
  "codex",
  "chatgpt",
  "model release",
  "benchmark",
];

const COMPANY_MATCHERS: Array<[RegExp, string]> = [
  [/\bopenai\b|\bchatgpt\b|\bcodex\b/i, "OpenAI"],
  [/\banthropic\b|\bclaude\b/i, "Anthropic"],
  [/\bgoogle deepmind\b|\bgemini\b/i, "Google"],
  [/\bxai\b|\bgrok\b/i, "xAI"],
  [/\bmeta ai\b|\bllama\b/i, "Meta"],
  [/\bdeepseek\b/i, "DeepSeek"],
  [/\bqwen\b|\balibaba cloud\b/i, "Alibaba"],
  [/\bmistral\b/i, "Mistral AI"],
  [/\bmoonshot\b|\bkimi\b/i, "Moonshot AI"],
  [/\bminimax\b/i, "MiniMax"],
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = createCorsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const latestRun = await env.DB.prepare(
          `SELECT started_at, completed_at, status, fetched_count, stored_count, error_json
           FROM ingestion_runs ORDER BY id DESC LIMIT 1`,
        ).first();

        return json({ ok: true, service: "vibespace-ai-news", latestRun }, 200, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/api/news") {
        return await getNews(url, env, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/admin/run") {
        if (!isAuthorized(request, env.ADMIN_TOKEN)) {
          return json({ error: "Unauthorized" }, 401, corsHeaders);
        }

        ctx.waitUntil(runIngestion(env));
        return json({ accepted: true, message: "Ingestion started." }, 202, corsHeaders);
      }

      return json({ error: "Not found" }, 404, corsHeaders);
    } catch (error) {
      console.error("Request failed", error);
      return json({ error: "Internal server error" }, 500, corsHeaders);
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runIngestion(env, new Date(controller.scheduledTime).toISOString()));
  },
} satisfies ExportedHandler<Env>;

async function getNews(url: URL, env: Env, headers: Headers): Promise<Response> {
  const limit = clampInteger(url.searchParams.get("limit"), 30, 1, 100);
  const verification = url.searchParams.get("verification");
  const company = url.searchParams.get("company");

  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (
    verification === "official" ||
    verification === "confirmed" ||
    verification === "community" ||
    verification === "unverified"
  ) {
    conditions.push("verification_status = ?");
    bindings.push(verification);
  }

  if (company) {
    conditions.push("company = ?");
    bindings.push(company.slice(0, 100));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const statement = env.DB.prepare(
    `SELECT
       id, source_platform, external_id, source_name, source_author, source_url,
       raw_title, ai_headline, ai_summary, company, model_names, category,
       verification_status, importance_score, published_at, collected_at
     FROM news_items
     ${where}
     ORDER BY published_at DESC
     LIMIT ?`,
  ).bind(...bindings, limit);

  const result = await statement.all<Record<string, unknown>>();
  const items = (result.results ?? []).map((item) => ({
    ...item,
    model_names: safeJsonArray(item.model_names),
  }));

  return json({ items, count: items.length }, 200, headers);
}

async function runIngestion(env: Env, scheduledAt?: string): Promise<IngestionResult> {
  const startedAt = scheduledAt ?? new Date().toISOString();
  const sourceResults = await Promise.all([
    safelyCollect("official-feeds", () => collectOfficialFeeds(env)),
    safelyCollect("x", () => collectX(env)),
    safelyCollect("reddit", () => collectReddit(env)),
    safelyCollect("youtube", () => collectYouTube(env)),
  ]);

  const errors = sourceResults
    .filter((result) => result.error)
    .map((result) => ({ source: result.source, message: result.error ?? "Unknown error" }));

  const rawItems = sourceResults
    .flatMap((result) => result.items)
    .filter(isLikelyAiNews)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const maxItems = clampInteger(env.MAX_ITEMS_PER_RUN, 40, 1, 40);
  const selected = uniqueRawItems(rawItems).slice(0, maxItems);
  const aiLimit = clampInteger(env.AI_MAX_ITEMS_PER_RUN, 4, 0, 12);
  const enriched: EnrichedItem[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const useAi = isTrue(env.AI_ENABLED) && Boolean(env.AI) && index < aiLimit;
    enriched.push(await enrichItem(item, env, useAi));
  }

  const collectedAt = new Date().toISOString();
  const insertStatements = enriched.map((item) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO news_items (
         source_platform, external_id, source_name, source_author, source_url,
         raw_title, raw_text, ai_headline, ai_summary, company, model_names,
         category, verification_status, importance_score, dedupe_key,
         published_at, collected_at, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      item.sourcePlatform,
      item.externalId,
      item.sourceName,
      item.sourceAuthor ?? null,
      item.sourceUrl,
      truncate(item.title, 500),
      truncate(item.text, 4000),
      truncate(item.headline, 300),
      truncate(item.summary, 1000),
      item.company ?? null,
      JSON.stringify(item.modelNames),
      item.category,
      item.verification,
      item.importanceScore,
      item.dedupeKey,
      item.publishedAt,
      collectedAt,
      JSON.stringify(item.metadata ?? {}),
    ),
  );

  let stored = 0;
  if (insertStatements.length > 0) {
    const results = await env.DB.batch(insertStatements);
    stored = results.reduce((count, result) => count + Number(result.meta.changes ?? 0), 0);
  }

  const completedAt = new Date().toISOString();
  const status: IngestionResult["status"] =
    errors.length === 0 ? "success" : selected.length > 0 ? "partial" : "failed";

  await env.DB.prepare(
    `INSERT INTO ingestion_runs (
       started_at, completed_at, status, fetched_count, stored_count, error_json
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      startedAt,
      completedAt,
      status,
      rawItems.length,
      stored,
      JSON.stringify(errors),
    )
    .run();

  const result: IngestionResult = {
    status,
    fetched: rawItems.length,
    stored,
    errors,
    startedAt,
    completedAt,
  };

  console.log(JSON.stringify({ event: "news_ingestion_complete", ...result }));
  return result;
}

async function safelyCollect(
  source: string,
  collect: () => Promise<RawItem[]>,
): Promise<SourceResult> {
  try {
    return { source, items: await collect() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Collector ${source} failed`, error);
    return { source, items: [], error: message };
  }
}

async function collectOfficialFeeds(env: Env): Promise<RawItem[]> {
  const feeds = parseJsonArray<FeedConfig>(env.OFFICIAL_FEEDS);
  if (feeds.length === 0) return [];

  const cappedFeeds = feeds.filter((feed) => feed.name && feed.url).slice(0, 12);
  const results = await Promise.allSettled(
    cappedFeeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "User-Agent": "VibeSpaceNews/0.1",
        },
      });

      if (!response.ok) throw new Error(`${feed.name} returned HTTP ${response.status}`);
      return parseFeed(await response.text(), feed);
    }),
  );

  const items: RawItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") items.push(...result.value);
    else console.error("Official feed failed", result.reason);
  }
  return items;
}

function parseFeed(xml: string, feed: FeedConfig): RawItem[] {
  const blocks = [...extractXmlBlocks(xml, "item"), ...extractXmlBlocks(xml, "entry")].slice(0, 20);

  return blocks.flatMap((block, index) => {
    const title = cleanText(readXmlTag(block, ["title"]));
    const href =
      readAtomLink(block) ||
      cleanText(readXmlTag(block, ["link"])) ||
      cleanText(readXmlTag(block, ["guid", "id"]));
    const id = cleanText(readXmlTag(block, ["guid", "id"])) || href || `${feed.url}#${index}`;
    const description = cleanText(
      readXmlTag(block, ["description", "summary", "content:encoded", "content"]),
    );
    const publishedAt = normalizeDate(
      readXmlTag(block, ["pubDate", "published", "updated", "dc:date"]),
    );

    if (!title || !href) return [];
    return [{
      sourcePlatform: "official",
      externalId: id,
      sourceName: feed.name,
      sourceUrl: href,
      title,
      text: description,
      company: feed.company,
      publishedAt,
      verification: feed.official === false ? "confirmed" : "official",
      metadata: { feedUrl: feed.url },
    } satisfies RawItem];
  });
}

async function collectX(env: Env): Promise<RawItem[]> {
  if (!env.X_BEARER_TOKEN || !env.X_QUERY) return [];

  const params = new URLSearchParams({
    query: env.X_QUERY,
    max_results: "25",
    "tweet.fields": "created_at,author_id,lang",
    expansions: "author_id",
    "user.fields": "username,name,verified",
  });

  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });
  if (!response.ok) throw new Error(`X API returned HTTP ${response.status}`);

  const payload = (await response.json()) as {
    data?: Array<{ id: string; text: string; created_at?: string; author_id?: string }>;
    includes?: { users?: Array<{ id: string; username: string; name: string; verified?: boolean }> };
  };
  const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
  const officialUsers = new Set(splitCsv(env.X_OFFICIAL_USERNAMES).map((name) => name.toLowerCase()));

  return (payload.data ?? []).map((tweet) => {
    const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const username = author?.username ?? "unknown";
    const official = officialUsers.has(username.toLowerCase());
    return {
      sourcePlatform: "x",
      externalId: tweet.id,
      sourceName: "X",
      sourceAuthor: author?.name ?? username,
      sourceUrl: `https://x.com/${username}/status/${tweet.id}`,
      title: firstSentence(tweet.text),
      text: tweet.text,
      publishedAt: normalizeDate(tweet.created_at),
      verification: official ? "official" : "unverified",
      metadata: { username, platformVerified: author?.verified ?? false },
    };
  });
}

async function collectReddit(env: Env): Promise<RawItem[]> {
  const subreddits = splitCsv(env.REDDIT_SUBREDDITS).slice(0, 6);
  if (subreddits.length === 0 || !env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return [];

  const credentials = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);
  const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": env.REDDIT_USER_AGENT ?? "VibeSpaceNews/0.1",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw new Error(`Reddit OAuth returned HTTP ${tokenResponse.status}`);

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) throw new Error("Reddit OAuth response did not include an access token");

  const listings = await Promise.allSettled(
    subreddits.map(async (subreddit) => {
      const response = await fetch(
        `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new?limit=15&raw_json=1`,
        {
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
            "User-Agent": env.REDDIT_USER_AGENT ?? "VibeSpaceNews/0.1",
          },
        },
      );
      if (!response.ok) throw new Error(`r/${subreddit} returned HTTP ${response.status}`);
      return (await response.json()) as {
        data?: { children?: Array<{ data?: {
          id?: string; title?: string; selftext?: string; author?: string;
          permalink?: string; url?: string; created_utc?: number;
        } }> };
      };
    }),
  );

  const items: RawItem[] = [];
  for (const listing of listings) {
    if (listing.status !== "fulfilled") {
      console.error("Reddit listing failed", listing.reason);
      continue;
    }
    for (const child of listing.value.data?.children ?? []) {
      const post = child.data;
      if (!post?.id || !post.title || !post.permalink) continue;
      items.push({
        sourcePlatform: "reddit",
        externalId: post.id,
        sourceName: "Reddit",
        sourceAuthor: post.author,
        sourceUrl: `https://www.reddit.com${post.permalink}`,
        title: post.title,
        text: post.selftext ?? "",
        publishedAt: normalizeDate(post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined),
        verification: "community",
        metadata: { outboundUrl: post.url },
      });
    }
  }
  return items;
}

async function collectYouTube(env: Env): Promise<RawItem[]> {
  const channels = parseJsonArray<YouTubeChannel>(env.YOUTUBE_CHANNELS)
    .filter((channel) => channel.id && channel.name)
    .slice(0, 8);
  if (channels.length === 0 || !env.YOUTUBE_API_KEY) return [];

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const channelParams = new URLSearchParams({
        part: "contentDetails",
        id: channel.id,
        key: env.YOUTUBE_API_KEY ?? "",
      });
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${channelParams}`,
      );
      if (!channelResponse.ok) {
        throw new Error(`${channel.name} channel lookup returned HTTP ${channelResponse.status}`);
      }

      const channelPayload = (await channelResponse.json()) as {
        items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
      };
      const uploads = channelPayload.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];

      const playlistParams = new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId: uploads,
        maxResults: "10",
        key: env.YOUTUBE_API_KEY ?? "",
      });
      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams}`,
      );
      if (!playlistResponse.ok) {
        throw new Error(`${channel.name} uploads returned HTTP ${playlistResponse.status}`);
      }

      const playlistPayload = (await playlistResponse.json()) as {
        items?: Array<{
          snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string };
          contentDetails?: { videoId?: string; videoPublishedAt?: string };
        }>;
      };

      return (playlistPayload.items ?? []).flatMap((video) => {
        const id = video.contentDetails?.videoId;
        const title = video.snippet?.title;
        if (!id || !title) return [];
        return [{
          sourcePlatform: "youtube",
          externalId: id,
          sourceName: channel.name,
          sourceAuthor: video.snippet?.channelTitle ?? channel.name,
          sourceUrl: `https://www.youtube.com/watch?v=${id}`,
          title,
          text: video.snippet?.description ?? "",
          company: channel.company,
          publishedAt: normalizeDate(video.contentDetails?.videoPublishedAt ?? video.snippet?.publishedAt),
          verification: channel.official ? "official" : "community",
          metadata: { channelId: channel.id },
        } satisfies RawItem];
      });
    }),
  );

  const items: RawItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") items.push(...result.value);
    else console.error("YouTube channel failed", result.reason);
  }
  return items;
}

async function enrichItem(item: RawItem, env: Env, useAi: boolean): Promise<EnrichedItem> {
  const fallback = buildFallbackEnrichment(item);
  let enrichment = fallback;

  if (useAi && env.AI) {
    try {
      const prompt = [
        "Return only one JSON object. Do not use markdown.",
        "Summarize this AI-news item without inventing facts.",
        `The source verification label is \"${item.verification}\" and MUST NOT be upgraded.`,
        "Required keys: headline, summary, company, model_names, category, importance_score.",
        "importance_score must be an integer from 0 to 100.",
        `SOURCE: ${item.sourceName}`,
        `TITLE: ${truncate(item.title, 500)}`,
        `TEXT: ${truncate(item.text, 2500)}`,
      ].join("\n");

      const result = await env.AI.run(env.AI_MODEL ?? "@cf/meta/llama-3.2-3b-instruct", {
        messages: [
          {
            role: "system",
            content: "You are a conservative news editor. Preserve uncertainty and never convert rumors into confirmed facts.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 350,
        temperature: 0.1,
      });

      const parsed = parseAiJson(extractAiText(result));
      enrichment = mergeAiEnrichment(fallback, parsed);
    } catch (error) {
      console.error("Workers AI enrichment failed; using deterministic fallback", error);
    }
  }

  return {
    ...item,
    headline: enrichment.headline,
    summary: enrichment.summary,
    company: enrichment.company ?? item.company,
    modelNames: enrichment.modelNames,
    category: enrichment.category,
    importanceScore: enrichment.importanceScore,
    dedupeKey: await createDedupeKey(item),
  };
}

function buildFallbackEnrichment(item: RawItem): {
  headline: string;
  summary: string;
  company?: string;
  modelNames: string[];
  category: string;
  importanceScore: number;
} {
  const combined = `${item.title}\n${item.text}`;
  const company = item.company ?? COMPANY_MATCHERS.find(([matcher]) => matcher.test(combined))?.[1];
  const lower = combined.toLowerCase();
  const category =
    /\b(released?|launch(?:ed)?|available now|generally available|ga)\b/.test(lower)
      ? "model-release"
      : /\b(leak|rumou?r|reportedly|unconfirmed)\b/.test(lower)
        ? "leak-rumor"
        : /\bbenchmark|eval(?:uation)?|score\b/.test(lower)
          ? "benchmark"
          : /\bresearch|paper|arxiv|study\b/.test(lower)
            ? "research"
            : /\bupdate|upgrade|preview|beta\b/.test(lower)
              ? "product-update"
              : "general";

  const modelNames = extractModelNames(combined);
  const summary = truncate(cleanText(item.text) || item.title, 420);
  const importanceScore = Math.max(
    0,
    Math.min(
      100,
      40 +
        (item.verification === "official" ? 30 : 0) +
        (category === "model-release" ? 20 : 0) +
        (modelNames.length > 0 ? 5 : 0) -
        (item.verification === "unverified" ? 15 : 0),
    ),
  );

  return {
    headline: truncate(item.title, 220),
    summary,
    company,
    modelNames,
    category,
    importanceScore,
  };
}

function mergeAiEnrichment(
  fallback: ReturnType<typeof buildFallbackEnrichment>,
  ai: AiEnrichment | null,
): ReturnType<typeof buildFallbackEnrichment> {
  if (!ai) return fallback;
  return {
    headline:
      typeof ai.headline === "string" && ai.headline.trim()
        ? truncate(ai.headline.trim(), 220)
        : fallback.headline,
    summary:
      typeof ai.summary === "string" && ai.summary.trim()
        ? truncate(ai.summary.trim(), 700)
        : fallback.summary,
    company:
      typeof ai.company === "string" && ai.company.trim()
        ? truncate(ai.company.trim(), 100)
        : fallback.company,
    modelNames: Array.isArray(ai.model_names)
      ? ai.model_names
          .filter((value): value is string => typeof value === "string")
          .map((value) => truncate(value.trim(), 100))
          .filter(Boolean)
          .slice(0, 10)
      : fallback.modelNames,
    category:
      typeof ai.category === "string" && ai.category.trim()
        ? truncate(ai.category.trim().toLowerCase(), 60)
        : fallback.category,
    importanceScore:
      typeof ai.importance_score === "number"
        ? Math.max(0, Math.min(100, Math.round(ai.importance_score)))
        : fallback.importanceScore,
  };
}

function parseAiJson(value: string): AiEnrichment | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1)) as AiEnrichment;
  } catch {
    return null;
  }
}

function extractAiText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;
  if (typeof record.result === "string") return record.result;
  return JSON.stringify(result);
}

function isLikelyAiNews(item: RawItem): boolean {
  const padded = ` ${item.title} ${item.text} `.toLowerCase();
  return AI_TERMS.some((term) => padded.includes(term));
}

function uniqueRawItems(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourcePlatform}:${item.externalId}:${normalizeUrl(item.sourceUrl)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createDedupeKey(item: RawItem): Promise<string> {
  const normalized = [
    normalizeWords(item.title),
    item.company?.toLowerCase() ?? "",
    new URL(item.sourceUrl).hostname.toLowerCase(),
  ].join("|");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extractModelNames(value: string): string[] {
  const matches = value.match(
    /\b(?:GPT[-\s]?\d[\w.-]*|Claude(?:\s+\w+){0,3}|Gemini(?:\s+\w+){0,3}|Grok(?:\s+\w+){0,2}|Llama(?:\s+\w+){0,2}|Qwen(?:\s+\w+){0,2}|DeepSeek(?:\s+\w+){0,2}|Mistral(?:\s+\w+){0,2}|Kimi(?:\s+\w+){0,2}|MiniMax(?:\s+\w+){0,2})\b/gi,
  );
  return [...new Set((matches ?? []).map((match) => match.trim()))].slice(0, 10);
}

function normalizeDate(value?: string): string {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function extractXmlBlocks(xml: string, tag: string): string[] {
  const expression = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return Array.from(xml.matchAll(expression), (match) => match[1] ?? "");
}

function readXmlTag(block: string, tags: string[]): string {
  for (const tag of tags) {
    const expression = new RegExp(
      `<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`,
      "i",
    );
    const match = block.match(expression);
    if (match?.[1]) return stripCdata(match[1]);
  }
  return "";
}

function readAtomLink(block: string): string {
  const alternate = block.match(
    /<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*\/?>/i,
  );
  if (alternate?.[1]) return decodeXml(alternate[1]);
  const anyLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return anyLink?.[1] ? decodeXml(anyLink[1]) : "";
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1");
}

function cleanText(value: string): string {
  return decodeXml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeXml(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .trim();
}

function firstSentence(value: string): string {
  const cleaned = cleanText(value);
  const match = cleaned.match(/^(.{1,220}?[.!?])(?:\s|$)/);
  return truncate(match?.[1] ?? cleaned, 220);
}

function normalizeWords(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    const trackingKeys: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (key.toLowerCase().startsWith("utm_")) trackingKeys.push(key);
    });
    for (const key of trackingKeys) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return value;
  }
}

function parseJsonArray<T>(value?: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    console.error("Invalid JSON array configuration");
    return [];
  }
}

function splitCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isAuthorized(request: Request, token?: string): boolean {
  if (!token) return false;
  return request.headers.get("Authorization") === `Bearer ${token}`;
}

function isTrue(value?: string): boolean {
  return value?.toLowerCase() === "true";
}

function clampInteger(
  value: string | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createCorsHeaders(env: Env): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": env.CORS_ORIGIN ?? "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
}

function json(payload: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
