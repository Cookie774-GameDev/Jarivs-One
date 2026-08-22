import { boundedFetch, nowIso, safeHttpsUrl, truncate, type Env } from './runtime';

export interface ApprovedRepository {
  id: string;
  fullName: string;
}

export interface RepositoryTrend {
  id: string;
  fullName: string;
  url: string;
  description: string;
  stars: number;
  starDelta: number;
  forks: number;
  openIssues: number;
  language?: string;
  pushedAt: string;
  observedAt: string;
}

export const APPROVED_AI_REPOSITORIES: readonly ApprovedRepository[] = [
  { id: 'openai-agents-python', fullName: 'openai/openai-agents-python' },
  { id: 'anthropic-claude-code', fullName: 'anthropics/claude-code' },
  { id: 'huggingface-transformers', fullName: 'huggingface/transformers' },
  { id: 'ollama', fullName: 'ollama/ollama' },
  { id: 'llama-cpp', fullName: 'ggml-org/llama.cpp' },
  { id: 'vllm', fullName: 'vllm-project/vllm' },
  { id: 'microsoft-autogen', fullName: 'microsoft/autogen' },
  { id: 'langchain', fullName: 'langchain-ai/langchain' },
] as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub repository metadata was malformed.');
  }
  return value as Record<string, unknown>;
}

function finiteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('GitHub repository metadata was malformed.');
  }
  return value;
}

function iso(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('GitHub repository metadata was malformed.');
  }
  return new Date(value).toISOString();
}

export function parseGitHubRepository(
  approved: ApprovedRepository,
  payload: unknown,
  previousStars: number | null,
  observedAt = nowIso(),
): RepositoryTrend {
  const source = record(payload);
  if (source.full_name !== approved.fullName) {
    throw new Error('GitHub repository identity did not match the approved source.');
  }
  const expectedUrl = `https://github.com/${approved.fullName}`;
  const url = safeHttpsUrl(typeof source.html_url === 'string' ? source.html_url : '');
  if (!url || url.replace(/\/$/u, '') !== expectedUrl) {
    throw new Error('GitHub repository identity URL did not match the approved source.');
  }
  const stars = finiteCount(source.stargazers_count);
  const description =
    typeof source.description === 'string' && source.description.trim()
      ? truncate(source.description, 320)
      : 'No repository description is available.';
  const language =
    typeof source.language === 'string' && source.language.trim()
      ? truncate(source.language, 60)
      : undefined;
  return {
    id: approved.id,
    fullName: approved.fullName,
    url: expectedUrl,
    description,
    stars,
    starDelta: previousStars === null ? 0 : stars - previousStars,
    forks: finiteCount(source.forks_count),
    openIssues: finiteCount(source.open_issues_count),
    ...(language ? { language } : {}),
    pushedAt: iso(source.pushed_at),
    observedAt: iso(observedAt),
  };
}

export function trendSignal(delta: number): string {
  if (delta > 0) return `+${delta.toLocaleString('en-US')} stars since last check`;
  if (delta < 0) return `${delta.toLocaleString('en-US')} stars since last check`;
  return 'Stars unchanged since last check';
}

export async function refreshRepositoryTrends(
  env: Pick<Env, 'DB'>,
  observedAt = nowIso(),
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.all(
    APPROVED_AI_REPOSITORIES.map(async (approved) => {
      try {
        const previous = await env.DB.prepare(
          'SELECT stars FROM intelligence_repository_trends WHERE id = ? LIMIT 1',
        )
          .bind(approved.id)
          .first<{ stars: number }>();
        const fetched = await boundedFetch(`https://api.github.com/repos/${approved.fullName}`, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'VibeSpace-AI-News/1.0',
            'x-github-api-version': '2022-11-28',
          },
          timeoutMs: 8_000,
          maxBytes: 300_000,
          maxRedirects: 1,
          retries: 1,
        });
        const trend = parseGitHubRepository(
          approved,
          JSON.parse(fetched.text) as unknown,
          previous ? Number(previous.stars) : null,
          observedAt,
        );
        await env.DB.prepare(
          `INSERT INTO intelligence_repository_trends
            (id, full_name, url, description, stars, star_delta, forks, open_issues,
             language, pushed_at, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             full_name = excluded.full_name,
             url = excluded.url,
             description = excluded.description,
             stars = excluded.stars,
             star_delta = excluded.star_delta,
             forks = excluded.forks,
             open_issues = excluded.open_issues,
             language = excluded.language,
             pushed_at = excluded.pushed_at,
             observed_at = excluded.observed_at`,
        )
          .bind(
            trend.id,
            trend.fullName,
            trend.url,
            trend.description,
            trend.stars,
            trend.starDelta,
            trend.forks,
            trend.openIssues,
            trend.language ?? null,
            trend.pushedAt,
            trend.observedAt,
          )
          .run();
        return true;
      } catch {
        return false;
      }
    }),
  );
  const succeeded = results.filter(Boolean).length;
  return { succeeded, failed: results.length - succeeded };
}

export async function readRepositoryTrends(env: Pick<Env, 'DB'>): Promise<RepositoryTrend[]> {
  const rows = await env.DB.prepare(
    `SELECT id, full_name, url, description, stars, star_delta, forks, open_issues,
              language, pushed_at, observed_at
       FROM intelligence_repository_trends
       ORDER BY star_delta DESC, stars DESC, full_name ASC
       LIMIT 12`,
  ).all<{
    id: string;
    full_name: string;
    url: string;
    description: string;
    stars: number;
    star_delta: number;
    forks: number;
    open_issues: number;
    language: string | null;
    pushed_at: string;
    observed_at: string;
  }>();
  return rows.results.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    url: row.url,
    description: row.description,
    stars: Number(row.stars),
    starDelta: Number(row.star_delta),
    forks: Number(row.forks),
    openIssues: Number(row.open_issues),
    ...(row.language ? { language: row.language } : {}),
    pushedAt: row.pushed_at,
    observedAt: row.observed_at,
  }));
}
