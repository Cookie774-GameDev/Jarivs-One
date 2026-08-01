import type { PromptForgePublicResearchPort } from './contextPreparation';
import type { PromptForgeSourceCandidate } from './sourcePack';
import { hasDetectedSecret } from '@/lib/security/secretDetector';

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';
const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_WEB_ORIGIN = 'https://github.com';
const MAX_RESULTS = 5;
const MAX_QUERY_CHARS = 500;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const CONTROL_AND_BIDI =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

export type PromptForgePublicResearchErrorCode =
  | 'not_authorized'
  | 'disabled'
  | 'cancelled'
  | 'timed_out'
  | 'unavailable'
  | 'invalid_response'
  | 'response_too_large'
  | 'unsafe_query'
  | 'unsafe_response';

const ERROR_MESSAGES: Readonly<Record<PromptForgePublicResearchErrorCode, string>> = Object.freeze({
  not_authorized: 'Public research is not authorized for this Prompt Forge run.',
  disabled: 'Public research is unavailable.',
  cancelled: 'Public research was cancelled.',
  timed_out: 'Public research timed out.',
  unavailable: 'Public research is unavailable.',
  invalid_response: 'Public research returned an invalid response.',
  response_too_large: 'Public research returned too much data.',
  unsafe_query: 'Public research cannot use credential-shaped draft text.',
  unsafe_response: 'Public research returned an unsafe response.',
});

export class PromptForgePublicResearchError extends Error {
  readonly code: PromptForgePublicResearchErrorCode;

  constructor(code: PromptForgePublicResearchErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'PromptForgePublicResearchError';
    this.code = code;
  }
}

export interface GitHubPublicResearchOptions {
  fetchFn?: typeof fetch;
  enabled?: boolean;
  timeoutMs?: number;
}

type GitHubRepository = Readonly<{
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  stars: number;
  topics: readonly string[];
  language: string | null;
}>;

function fail(code: PromptForgePublicResearchErrorCode): never {
  throw new PromptForgePublicResearchError(code);
}

function cleanText(value: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    return fail('invalid_response');
  }
  const cleaned = value.normalize('NFKC').replace(CONTROL_AND_BIDI, ' ').trim();
  if (!cleaned) return fail('invalid_response');
  return cleaned;
}

function lexicalScore(query: string, title: string): number {
  const queryTokens = new Set(query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []);
  const titleTokens = new Set(title.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []);
  if (titleTokens.size === 0) return 0;
  let matches = 0;
  for (const token of titleTokens) {
    if (queryTokens.has(token)) matches += 1;
  }
  return matches / titleTokens.size;
}

function buildUrl(query: string): URL {
  const url = new URL(GITHUB_SEARCH_URL);
  url.search = new URLSearchParams({
    q: `${query} is:public`,
    per_page: String(MAX_RESULTS),
  }).toString();
  return url;
}

function safeRepositoryUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail('unsafe_response');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== GITHUB_WEB_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname.split('/').filter(Boolean).length !== 2
  ) {
    return fail('unsafe_response');
  }
  return parsed.href;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) return fail('invalid_response');
    if (bytes > MAX_RESPONSE_BYTES) return fail('response_too_large');
  }
  const contentType = response.headers.get('content-type')?.toLocaleLowerCase('en-US') ?? '';
  if (!contentType.startsWith('application/json')) return fail('invalid_response');

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) return fail('response_too_large');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return fail('invalid_response');
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return fail('response_too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof PromptForgePublicResearchError) throw error;
    return fail('invalid_response');
  } finally {
    reader.releaseLock();
  }
}

function parseRepositories(text: string): GitHubRepository[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail('invalid_response');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return fail('invalid_response');
  }
  if (
    !Number.isSafeInteger(Reflect.get(payload, 'total_count')) ||
    typeof Reflect.get(payload, 'incomplete_results') !== 'boolean'
  ) {
    return fail('invalid_response');
  }
  const rawRepositories = Reflect.get(payload, 'items');
  if (!Array.isArray(rawRepositories) || rawRepositories.length > MAX_RESULTS) {
    return fail('invalid_response');
  }
  return rawRepositories.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return fail('invalid_response');
    }
    const id = Reflect.get(value, 'id');
    const name = Reflect.get(value, 'name');
    const fullName = Reflect.get(value, 'full_name');
    const description = Reflect.get(value, 'description');
    const htmlUrl = Reflect.get(value, 'html_url');
    const fork = Reflect.get(value, 'fork');
    const archived = Reflect.get(value, 'archived');
    const disabled = Reflect.get(value, 'disabled');
    const visibility = Reflect.get(value, 'visibility');
    const stars = Reflect.get(value, 'stargazers_count');
    const topics = Reflect.get(value, 'topics');
    const language = Reflect.get(value, 'language');
    if (
      !Number.isSafeInteger(id) ||
      (id as number) < 1 ||
      typeof name !== 'string' ||
      typeof fullName !== 'string' ||
      (description !== null && typeof description !== 'string') ||
      typeof htmlUrl !== 'string' ||
      typeof fork !== 'boolean' ||
      typeof archived !== 'boolean' ||
      typeof disabled !== 'boolean' ||
      visibility !== 'public' ||
      !Number.isSafeInteger(stars) ||
      (stars as number) < 0 ||
      !Array.isArray(topics) ||
      topics.length > 20 ||
      topics.some((topic) => typeof topic !== 'string') ||
      (language !== null && typeof language !== 'string')
    ) {
      return fail('invalid_response');
    }
    return Object.freeze({
      id: id as number,
      name: cleanText(name, 100),
      fullName: cleanText(fullName, 200),
      description:
        description === null ? 'No description provided.' : cleanText(description, 1_000),
      htmlUrl: safeRepositoryUrl(htmlUrl),
      fork,
      archived,
      disabled,
      stars: stars as number,
      topics: Object.freeze(
        (topics as string[])
          .map((topic) => cleanText(topic, 50))
          .sort((a, b) => a.localeCompare(b)),
      ),
      language: language === null ? null : cleanText(language, 100),
    });
  });
}

export function createGitHubPublicResearchPort(
  options: GitHubPublicResearchOptions = {},
): PromptForgePublicResearchPort {
  const enabled = options.enabled ?? true;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('Invalid public research timeout.');
  }

  return async ({ job, signal, now }) => {
    if (!enabled) return fail('disabled');
    if (!job.allowPublicResearch || job.privacyMode !== 'provider_allowed') {
      return fail('not_authorized');
    }
    if (signal.aborted) return fail('cancelled');

    const query = cleanText(job.originalDraft.trim().slice(0, MAX_QUERY_CHARS), MAX_QUERY_CHARS);
    if (hasDetectedSecret(query)) return fail('unsafe_query');
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => controller.abort();
    signal.addEventListener('abort', onCallerAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const fetchFn = options.fetchFn ?? globalThis.fetch;
      if (typeof fetchFn !== 'function') return fail('disabled');
      let response: Response;
      try {
        response = await fetchFn(buildUrl(query), {
          method: 'GET',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: controller.signal,
        });
      } catch {
        if (signal.aborted) return fail('cancelled');
        if (timedOut) return fail('timed_out');
        return fail('unavailable');
      }
      if (signal.aborted) return fail('cancelled');
      if (timedOut) return fail('timed_out');
      if (!response.ok) return fail('unavailable');
      if (response.redirected) return fail('unsafe_response');
      if (response.url) {
        const finalUrl = new URL(response.url);
        if (finalUrl.origin !== GITHUB_API_ORIGIN || finalUrl.pathname !== '/search/repositories') {
          return fail('unsafe_response');
        }
      }

      const repositories = parseRepositories(await readBoundedBody(response));
      const seenIds = new Set<number>();
      const seenUrls = new Set<string>();
      const uniqueRepositories = repositories
        .filter((repository) => !repository.fork && !repository.archived && !repository.disabled)
        .filter((repository) => {
          if (seenIds.has(repository.id) || seenUrls.has(repository.htmlUrl)) return false;
          seenIds.add(repository.id);
          seenUrls.add(repository.htmlUrl);
          return true;
        })
        .slice(0, MAX_RESULTS);

      return Object.freeze(
        uniqueRepositories.map(
          (repository, index): PromptForgeSourceCandidate =>
            Object.freeze({
              id: `public:github:${repository.id}`,
              kind: 'public_web',
              label: repository.fullName,
              reference: repository.htmlUrl,
              content: [
                `Repository: ${repository.fullName}`,
                `Description: ${repository.description}`,
                ...(repository.language === null ? [] : [`Language: ${repository.language}`]),
                ...(repository.topics.length === 0
                  ? []
                  : [`Topics: ${repository.topics.join(', ')}`]),
                `Stars: ${repository.stars}`,
              ].join('\n'),
              verified: true,
              explicit: false,
              projectScoped: false,
              trust: 'external',
              exactMatch:
                repository.fullName.localeCompare(query, 'en-US', { sensitivity: 'base' }) === 0 ||
                repository.name.localeCompare(query, 'en-US', { sensitivity: 'base' }) === 0,
              lexicalScore: lexicalScore(query, repository.fullName),
              semanticScore: null,
              taskIntentScore: 1,
              publicSourceClass: 'reputable_technical_reference',
              observedAt: now,
              whySelected: `GitHub public repository search result ${index + 1} for the authorized Prompt Forge query.`,
            }),
        ),
      );
    } catch (error) {
      if (signal.aborted) return fail('cancelled');
      if (timedOut) return fail('timed_out');
      if (error instanceof PromptForgePublicResearchError) throw error;
      return fail('invalid_response');
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onCallerAbort);
    }
  };
}

export const githubPublicResearchPort = createGitHubPublicResearchPort();
