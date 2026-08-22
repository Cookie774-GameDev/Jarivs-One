/**
 * Preloaded AI News catalog for the in-app News mini-panel.
 *
 * Items are curated snapshots with real source URLs, image URLs, and credits.
 * Dates are ISO calendar days (YYYY-MM-DD). Sectioning (Today / Last week / More)
 * is computed at runtime from `publishedAt` relative to "now".
 *
 * No network fetch at runtime — pure static data so the panel works offline
 * and never phones home for headlines.
 */

export type NewsKind = 'model_drop' | 'ai_news' | 'youtube' | 'github';

export type NewsSectionId = 'today' | 'last_week' | 'more';

export interface NewsItem {
  id: string;
  /** Short card title. */
  title: string;
  /** 1–2 sentence summary shown on the card. */
  summary: string;
  kind: NewsKind;
  /** ISO calendar date the story published, e.g. '2026-07-11'. */
  publishedAt: string;
  /** Direct link to the source article or YouTube video. */
  url: string;
  /** Image URL (official art, publisher card, or YouTube thumbnail). */
  imageUrl: string;
  /** Credit line for the image (publisher / channel / stock). */
  imageCredit: string;
  /** Outlet or channel name. */
  source: string;
  /** Optional extra attribution for the reporting. */
  credit: string;
  /** Optional YouTube video id when kind is youtube. */
  youtubeId?: string;
  /** Optional tags for filter chips. */
  tags?: string[];
}

export const NEWS_KIND_META: Record<NewsKind, { label: string; short: string }> = {
  model_drop: { label: 'Model drop', short: 'Models' },
  ai_news: { label: 'AI news', short: 'News' },
  youtube: { label: 'YouTube', short: 'Video' },
  github: { label: 'GitHub repository', short: 'GitHub' },
};

export const NEWS_SECTION_META: Record<NewsSectionId, { label: string; description: string }> = {
  today: {
    label: 'Today',
    description: 'Headlines from today',
  },
  last_week: {
    label: 'Last week',
    description: 'The past seven days',
  },
  more: {
    label: 'More',
    description: 'Earlier and evergreen picks',
  },
};

/**
 * Catalog curated for the week ending 2026-07-11 (and a small "More" set).
 * All links and credits point at the original publishers.
 */
export const NEWS_CATALOG: readonly NewsItem[] = [
  // ── Today (2026-07-11) ──────────────────────────────────────────────
  {
    id: 'openai-gpt56-copilot-2026-07-09',
    title: 'GPT-5.6 is now the preferred model in Microsoft 365 Copilot',
    summary:
      'OpenAI reports GPT-5.6 as the preferred model in Microsoft 365 Copilot, following the Sol / Terra / Luna general-availability rollout.',
    kind: 'model_drop',
    publishedAt: '2026-07-11',
    url: 'https://openai.com/index/gpt-5-6-preferred-model-microsoft-365-copilot/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/3MPipvFMxS8m3kTyCtwFgj/015747dcd34cb667a221688cfca64e0f/Frame.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI product art',
    source: 'OpenAI',
    credit: 'OpenAI News · Product · Jul 9–11, 2026',
    tags: ['OpenAI', 'GPT-5.6', 'Microsoft', 'Copilot'],
  },
  {
    id: 'meta-muse-spark-11-cnbc-2026-07-09',
    title: 'Meta ships Muse Spark 1.1 for agentic coding',
    summary:
      'Meta Superintelligence Labs rolled out Muse Spark 1.1 — framed as its strongest model yet for agentic and coding work — days after Muse Image.',
    kind: 'model_drop',
    publishedAt: '2026-07-11',
    url: 'https://www.cnbc.com/2026/07/09/meta-jumps-into-ai-coding-market-to-chase-anthropic-and-openai.html',
    imageUrl:
      'https://image.cnbcfm.com/api/v1/image/108016124-17231280922024-08-08t140508z_1149205049_rc2g89a5zq5n_rtrmadp_0_meta-platforms-results.jpg?v=1723128172&w=1200&h=675',
    imageCredit: 'CNBC / Reuters',
    source: 'CNBC',
    credit: 'Roselyne Min / CNBC · Jul 9, 2026',
    tags: ['Meta', 'Muse Spark', 'coding'],
  },
  {
    id: 'yt-anthropic-discovery-2026-07-08',
    title: 'Anthropic research spotlight — global workspace in language models',
    summary:
      'Community breakdown of Anthropic’s July research post on a global workspace in language models (covers the Jul 6 announcement).',
    kind: 'youtube',
    publishedAt: '2026-07-11',
    url: 'https://www.youtube.com/watch?v=Jjhvjlr8EVM',
    imageUrl: 'https://i.ytimg.com/vi/Jjhvjlr8EVM/hqdefault.jpg',
    imageCredit: 'YouTube thumbnail · Dr. Know-it-all Knows it all',
    source: 'YouTube',
    credit: 'Dr. Know-it-all Knows it all · uploaded ~Jul 8, 2026',
    youtubeId: 'Jjhvjlr8EVM',
    tags: ['Anthropic', 'research', 'YouTube'],
  },

  // ── Last week (≈ Jul 4–10) ──────────────────────────────────────────
  {
    id: 'openai-gpt56-family-2026-07-09',
    title: 'GPT-5.6 family launches: Sol, Terra, and Luna',
    summary:
      'OpenAI made the GPT-5.6 lineup generally available — flagship Sol plus balanced Terra and cost-efficient Luna — after a limited preview.',
    kind: 'model_drop',
    publishedAt: '2026-07-09',
    url: 'https://openai.com/index/gpt-5-6/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/2ygRvL6yUYAvtHiZYmCT8K/91195cbe6f282c24026d154fe3ac422e/System_card_1_1.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI system-card art',
    source: 'OpenAI',
    credit: 'OpenAI · Product · Jul 9, 2026',
    tags: ['OpenAI', 'GPT-5.6', 'Sol', 'Terra', 'Luna'],
  },
  {
    id: 'openai-gpt-live-2026-07-08',
    title: 'Introducing GPT-Live — next-gen voice conversation',
    summary:
      'OpenAI launched GPT-Live, a new generation of voice models aimed at more natural, less stop-and-start spoken interaction.',
    kind: 'model_drop',
    publishedAt: '2026-07-08',
    url: 'https://openai.com/index/introducing-gpt-live/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/4vJ1lSvYeKz0zM4RVCKwIC/855f7e54052d8a7635e4bf45adf41737/Art_Card_1_1.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI product art',
    source: 'OpenAI',
    credit: 'OpenAI · Product · Jul 8, 2026',
    tags: ['OpenAI', 'voice', 'GPT-Live'],
  },
  {
    id: 'meta-muse-image-2026-07-07',
    title: 'Meta debuts Muse Image (codename Mango)',
    summary:
      'Meta Superintelligence Labs released Muse Image — its first image-generation model — free via Meta AI app, WhatsApp DMs, and Instagram Stories.',
    kind: 'model_drop',
    publishedAt: '2026-07-07',
    url: 'https://www.cnbc.com/2026/07/07/meta-ai-muse-image.html',
    imageUrl:
      'https://image.cnbcfm.com/api/v1/image/108016124-17231280922024-08-08t140508z_1149205049_rc2g89a5zq5n_rtrmadp_0_meta-platforms-results.jpg?v=1723128172&w=1200&h=675',
    imageCredit: 'CNBC / Reuters',
    source: 'CNBC',
    credit: 'CNBC · Jul 7, 2026 · Meta Superintelligence Labs',
    tags: ['Meta', 'Muse Image', 'image gen'],
  },
  {
    id: 'euronews-week-of-releases-2026-07-08',
    title: 'OpenAI, Meta, and SpaceXAI push major model news in one week',
    summary:
      'Euronews roundup of a crowded release week: GPT-5.6 Sol/Terra/Luna plans, Meta Muse Image, and reports of SpaceXAI / Cursor-related model work.',
    kind: 'ai_news',
    publishedAt: '2026-07-08',
    url: 'https://www.euronews.com/next/2026/07/08/openai-meta-and-spacexai-push-new-ai-models-in-a-week-of-major-releases',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/4vJ1lSvYeKz0zM4RVCKwIC/855f7e54052d8a7635e4bf45adf41737/Art_Card_1_1.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI art used as visual stand-in · story by Euronews Next',
    source: 'Euronews Next',
    credit: 'Roselyne Min · Euronews · Jul 8, 2026',
    tags: ['OpenAI', 'Meta', 'SpaceXAI', 'industry'],
  },
  {
    id: 'yt-cnbc-ai-narratives-2026-07-02',
    title: "AI's 3 big narrative violations — CNBC (Jul 2)",
    summary:
      'CNBC Television digs into three market narratives that broke in early July 2026, including Meta’s cloud/compute framing around AI infrastructure.',
    kind: 'youtube',
    publishedAt: '2026-07-02',
    url: 'https://www.youtube.com/watch?v=yFEOnBT0Hgw',
    imageUrl: 'https://i.ytimg.com/vi/yFEOnBT0Hgw/hqdefault.jpg',
    imageCredit: 'YouTube thumbnail · CNBC Television',
    source: 'YouTube · CNBC Television',
    credit: 'CNBC Television · Jul 2, 2026',
    youtubeId: 'yFEOnBT0Hgw',
    tags: ['CNBC', 'markets', 'Meta'],
  },
  {
    id: 'marketingprofs-ai-update-2026-07-03',
    title: 'AI Update: GPT-5.6 oversight delay, Mythos 5, Claude Fable 5',
    summary:
      'MarketingProfs weekly digest covers OpenAI’s temporary GPT-5.6 public-rollout delay under US oversight requests, limited Mythos 5 access, and restored Claude Fable 5 availability.',
    kind: 'ai_news',
    publishedAt: '2026-07-03',
    url: 'https://www.marketingprofs.com/opinions/2026/55197/ai-update-july-3-2026-ai-news-and-views-from-the-past-week',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/7j6M3prKIsTmV6cbMaHjhZ/e66f7cdd98c66c99546853cbc22cfe84/Seperating-signal-from-noise-card.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI research art · visual for policy roundup card',
    source: 'MarketingProfs',
    credit: 'MarketingProfs AI Update · Jul 3, 2026',
    tags: ['policy', 'Anthropic', 'OpenAI', 'security'],
  },
  {
    id: 'meta-official-muse-image-2026-07-07',
    title: 'Introducing Muse Image — image generation built for your world',
    summary:
      'Official Meta newsroom post for Muse Image from Meta Superintelligence Labs (July 2026).',
    kind: 'model_drop',
    publishedAt: '2026-07-07',
    url: 'https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/',
    imageUrl:
      'https://image.cnbcfm.com/api/v1/image/108016124-17231280922024-08-08t140508z_1149205049_rc2g89a5zq5n_rtrmadp_0_meta-platforms-results.jpg?v=1723128172&w=1200&h=675',
    imageCredit: 'CNBC / Reuters photo used with Meta newsroom link',
    source: 'Meta Newsroom',
    credit: 'Meta · about.fb.com · Jul 7, 2026',
    tags: ['Meta', 'Muse Image'],
  },
  {
    id: 'openai-coding-evals-2026-07-08',
    title: 'Separating signal from noise in coding evaluations',
    summary:
      'OpenAI research post on measuring coding agent quality more cleanly amid noisy public evals — published alongside the GPT-5.6 wave.',
    kind: 'ai_news',
    publishedAt: '2026-07-08',
    url: 'https://openai.com/index/separating-signal-from-noise-coding-evaluations/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/7j6M3prKIsTmV6cbMaHjhZ/e66f7cdd98c66c99546853cbc22cfe84/Seperating-signal-from-noise-card.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI research art',
    source: 'OpenAI',
    credit: 'OpenAI Research · Jul 8, 2026',
    tags: ['evals', 'coding', 'OpenAI'],
  },

  // ── More (earlier / evergreen context) ──────────────────────────────
  {
    id: 'claude-sonnet-5-mean-ceo-2026-06-30',
    title: 'Claude Sonnet 5 lands for lower-cost agentic work',
    summary:
      'Anthropic’s midsize Sonnet 5 release (tracked ~Jun 30) targets agentic tasks closer to larger models at lower cost — coding, tools, and knowledge work.',
    kind: 'model_drop',
    publishedAt: '2026-06-30',
    url: 'https://blog.mean.ceo/new-ai-model-releases-news-july-2026/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/2wba91t9mgdv1oBPai3LTb/e48f5d6b5e44bdaafb0eac51f96458d1/bug_bounty_1_1.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI art · visual stand-in for Sonnet 5 roundup',
    source: 'Mean.CEO / AI Release Tracker',
    credit: 'Model-release roundup citing AI Release Tracker · Jun 30–Jul 1, 2026',
    tags: ['Anthropic', 'Sonnet 5'],
  },
  {
    id: 'google-june-ai-recap-2026-07-01',
    title: 'Google’s June 2026 AI recap — Gemini 3.5 Live Translate & more',
    summary:
      'Google’s official June AI wrap: Gemini 3.5 Live Translate, Android 17 AI features, and Home Speaker built for Gemini.',
    kind: 'ai_news',
    publishedAt: '2026-07-01',
    url: 'https://blog.google/innovation-and-ai/technology/ai/google-ai-updates-june-2026/',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/3MPipvFMxS8m3kTyCtwFgj/015747dcd34cb667a221688cfca64e0f/Frame.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI product art · visual stand-in; story is Google The Keyword',
    source: 'Google The Keyword',
    credit: 'Google · Jul 1, 2026 (June recap)',
    tags: ['Google', 'Gemini'],
  },
  {
    id: 'yt-nate-b-jones-2026-stories',
    title: 'OpenAI, Google, and Anthropic agree on one thing (2026 stories)',
    summary:
      'Nate B Jones walks ten defining 2026 AI stories — NVIDIA platforms, MCP foundation moves, managed MCP servers, Cursor/Graphite, and more.',
    kind: 'youtube',
    publishedAt: '2026-06-28',
    url: 'https://www.youtube.com/watch?v=TTMOSR-nKjg',
    imageUrl: 'https://i.ytimg.com/vi/TTMOSR-nKjg/hqdefault.jpg',
    imageCredit: 'YouTube thumbnail · AI News & Strategy Daily | Nate B Jones',
    source: 'YouTube · Nate B Jones',
    credit: 'AI News & Strategy Daily | Nate B Jones',
    youtubeId: 'TTMOSR-nKjg',
    tags: ['YouTube', 'MCP', 'industry'],
  },
  {
    id: 'meta-muse-spark-intro-2026-04-08',
    title: 'Introducing Muse Spark — Meta’s most powerful model (context)',
    summary:
      'Backgrounder: Meta’s April Muse Spark launch under Superintelligence Labs, the predecessor to this week’s Muse Image + Muse Spark 1.1 updates.',
    kind: 'model_drop',
    publishedAt: '2026-04-08',
    url: 'https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/',
    imageUrl:
      'https://image.cnbcfm.com/api/v1/image/108016124-17231280922024-08-08t140508z_1149205049_rc2g89a5zq5n_rtrmadp_0_meta-platforms-results.jpg?v=1723128172&w=1200&h=675',
    imageCredit: 'CNBC / Reuters',
    source: 'Meta Newsroom',
    credit: 'Meta · Apr 8, 2026',
    tags: ['Meta', 'Muse Spark', 'context'],
  },
  {
    id: 'openai-gpt56-system-card-2026-07-09',
    title: 'GPT-5.6 System Card',
    summary:
      'Official safety system card for the GPT-5.6 model family (Sol / Terra / Luna), published with the July 9 GA window.',
    kind: 'ai_news',
    publishedAt: '2026-07-09',
    url: 'https://deploymentsafety.openai.com/gpt-5-6',
    imageUrl:
      'https://images.ctfassets.net/kftzwdyauwt9/2ygRvL6yUYAvtHiZYmCT8K/91195cbe6f282c24026d154fe3ac422e/System_card_1_1.png?w=1200&q=80&fm=webp',
    imageCredit: 'OpenAI Deployment Safety Hub art',
    source: 'OpenAI Deployment Safety Hub',
    credit: 'OpenAI · Jul 9, 2026',
    tags: ['safety', 'system card', 'GPT-5.6'],
  },
] as const;
