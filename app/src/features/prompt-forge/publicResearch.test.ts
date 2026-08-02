import { describe, expect, it, vi } from 'vitest';
import { createPromptForgeJob } from './contracts';
import { PromptForgePublicResearchError, createGitHubPublicResearchPort } from './publicResearch';

function authorizedJob(originalDraft = 'Research resilient distributed systems') {
  return createPromptForgeJob({
    id: 'forge-job-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    projectId: null,
    originalDraft,
    originalAttachments: [],
    modelSelection: { mode: 'prefer_local' },
    privacyMode: 'provider_allowed',
    allowPublicResearch: true,
    now: 100,
  });
}

function response(payload: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status: 200,
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(new TextEncoder().encode(body).byteLength),
      ...init.headers,
    },
  });
}

function repository(
  patch: Partial<{
    id: number;
    full_name: string;
    description: string;
    html_url: string;
  }> = {},
) {
  return {
    id: patch.id ?? 42,
    name: (patch.full_name ?? 'example/distributed-computing').split('/')[1],
    full_name: patch.full_name ?? 'example/distributed-computing',
    description: patch.description ?? 'Distributed systems coordinate components over a network.',
    html_url: patch.html_url ?? 'https://github.com/example/distributed-computing',
    fork: false,
    archived: false,
    disabled: false,
    visibility: 'public',
    stargazers_count: 120,
    updated_at: '2026-07-31T12:00:00Z',
    topics: ['distributed-systems'],
    language: 'TypeScript',
  };
}

describe('Prompt Forge GitHub public research', () => {
  it('retrieves bounded cited public sources from the fixed credential-free endpoint', async () => {
    const fetchFn = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            total_count: 1,
            incomplete_results: false,
            items: [repository()],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-length': '260',
            },
          },
        ),
    );
    const research = createGitHubPublicResearchPort({ fetchFn });
    const signal = new AbortController().signal;

    const sources = await research({ job: authorizedJob(), signal, now: 1_000 });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = fetchFn.mock.calls[0]!;
    const url = new URL(String(requestUrl));
    expect(url.origin).toBe('https://api.github.com');
    expect(url.pathname).toBe('/search/repositories');
    expect(url.searchParams.get('per_page')).toBe('5');
    expect(url.searchParams.get('q')).toBe('Research resilient distributed systems is:public');
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal),
    });
    expect(sources).toEqual([
      {
        id: 'public:github:42',
        kind: 'public_web',
        label: 'example/distributed-computing',
        reference: 'https://github.com/example/distributed-computing',
        content:
          'Repository: example/distributed-computing\nDescription: Distributed systems coordinate components over a network.\nLanguage: TypeScript\nTopics: distributed-systems\nStars: 120',
        verified: true,
        explicit: false,
        projectScoped: false,
        trust: 'external',
        exactMatch: false,
        lexicalScore: 1 / 3,
        semanticScore: null,
        taskIntentScore: 1,
        publicSourceClass: 'reputable_technical_reference',
        observedAt: 1_000,
        whySelected:
          'GitHub public repository search result 1 for the authorized Prompt Forge query.',
      },
    ]);
  });

  it.each([
    {
      label: 'per-run permission is disabled',
      job: createPromptForgeJob({
        ...authorizedJob(),
        allowPublicResearch: false,
        now: 100,
      }),
    },
    {
      label: 'privacy is local-only',
      job: createPromptForgeJob({
        ...authorizedJob(),
        privacyMode: 'local_only',
        now: 100,
      }),
    },
  ])('denies research before network access when $label', async ({ job }) => {
    const fetchFn = vi.fn();
    const research = createGitHubPublicResearchPort({ fetchFn });

    await expect(
      research({ job, signal: new AbortController().signal, now: 1_000 }),
    ).rejects.toMatchObject({
      code: 'not_authorized',
      message: 'Public research is not authorized for this Prompt Forge run.',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('denies network access when the public provider is administratively disabled', async () => {
    const fetchFn = vi.fn();
    const research = createGitHubPublicResearchPort({ fetchFn, enabled: false });

    await expect(
      research({ job: authorizedJob(), signal: new AbortController().signal, now: 1_000 }),
    ).rejects.toMatchObject({
      code: 'disabled',
      message: 'Public research is unavailable.',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects credential-shaped draft text before constructing a public search request', async () => {
    const fetchFn = vi.fn();
    const research = createGitHubPublicResearchPort({ fetchFn });

    await expect(
      research({
        job: authorizedJob('Research this repository; my password is hunter2'),
        signal: new AbortController().signal,
        now: 1_000,
      }),
    ).rejects.toMatchObject({
      code: 'unsafe_query',
      message: 'Public research cannot use credential-shaped draft text.',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('preserves caller cancellation and bounds provider time', async () => {
    const alreadyCancelled = new AbortController();
    alreadyCancelled.abort();
    const fetchFn = vi.fn();
    const research = createGitHubPublicResearchPort({ fetchFn, timeoutMs: 5 });
    await expect(
      research({ job: authorizedJob(), signal: alreadyCancelled.signal, now: 1_000 }),
    ).rejects.toMatchObject({ code: 'cancelled', message: 'Public research was cancelled.' });
    expect(fetchFn).not.toHaveBeenCalled();

    vi.useFakeTimers();
    try {
      const hangingFetch = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('provider detail must stay private', 'AbortError')),
              { once: true },
            );
          }),
      );
      const timedResearch = createGitHubPublicResearchPort({
        fetchFn: hangingFetch,
        timeoutMs: 5,
      });
      const pending = timedResearch({
        job: authorizedJob(),
        signal: new AbortController().signal,
        now: 1_000,
      });
      const expectation = expect(pending).rejects.toMatchObject({
        code: 'timed_out',
        message: 'Public research timed out.',
      });
      await vi.advanceTimersByTimeAsync(5);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves caller cancellation while the bounded response body is streaming', async () => {
    const caller = new AbortController();
    let bodyStarted!: () => void;
    const bodyIsStreaming = new Promise<void>((resolve) => {
      bodyStarted = resolve;
    });
    const research = createGitHubPublicResearchPort({
      fetchFn: async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('private stream detail', 'AbortError')),
                { once: true },
              );
            },
            pull() {
              bodyStarted();
              return new Promise(() => undefined);
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    });
    const pending = research({ job: authorizedJob(), signal: caller.signal, now: 1_000 });
    const expectation = expect(pending).rejects.toMatchObject({
      code: 'cancelled',
      message: 'Public research was cancelled.',
    });

    await bodyIsStreaming;
    caller.abort();

    await expectation;
  });

  it.each([
    {
      label: 'non-success status',
      fetchFn: async () => new Response('private upstream detail', { status: 503 }),
      code: 'unavailable',
    },
    {
      label: 'malformed JSON',
      fetchFn: async () =>
        new Response('{not-json', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': '9' },
        }),
      code: 'invalid_response',
    },
    {
      label: 'oversized declared body',
      fetchFn: async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': '300000' },
        }),
      code: 'response_too_large',
    },
    {
      label: 'wrong content type',
      fetchFn: async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'text/html', 'content-length': '2' },
        }),
      code: 'invalid_response',
    },
  ])('returns a sanitized error for a $label', async ({ fetchFn, code }) => {
    const research = createGitHubPublicResearchPort({ fetchFn });
    const failure = research({
      job: authorizedJob(),
      signal: new AbortController().signal,
      now: 1_000,
    });

    await expect(failure).rejects.toBeInstanceOf(PromptForgePublicResearchError);
    await expect(failure).rejects.toMatchObject({ code });
    await expect(failure).rejects.not.toThrow(/private upstream detail|not-json|503/i);
  });

  it('rejects redirects and result URLs outside the fixed HTTPS article origin', async () => {
    const redirected = response({
      total_count: 1,
      incomplete_results: false,
      items: [repository()],
    });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const redirectedResearch = createGitHubPublicResearchPort({
      fetchFn: async () => redirected,
    });
    await expect(
      redirectedResearch({
        job: authorizedJob(),
        signal: new AbortController().signal,
        now: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'unsafe_response' });

    const unsafeResearch = createGitHubPublicResearchPort({
      fetchFn: async () =>
        response({
          total_count: 1,
          incomplete_results: false,
          items: [repository({ html_url: 'https://attacker.invalid/example/repository' })],
        }),
    });
    await expect(
      unsafeResearch({ job: authorizedJob(), signal: new AbortController().signal, now: 1_000 }),
    ).rejects.toMatchObject({ code: 'unsafe_response' });
  });

  it('deduplicates canonical citations and retains deterministic provider provenance', async () => {
    const research = createGitHubPublicResearchPort({
      fetchFn: async () =>
        response({
          total_count: 3,
          incomplete_results: false,
          items: [
            repository({
              id: 7,
              full_name: 'example/later-result',
              html_url: 'https://github.com/example/later-result',
            }),
            repository(),
            repository({ id: 42, description: 'Duplicate should not enter the pack.' }),
          ],
        }),
    });

    const sources = await research({
      job: authorizedJob(),
      signal: new AbortController().signal,
      now: 1_000,
    });

    expect(sources.map(({ id }) => id)).toEqual(['public:github:7', 'public:github:42']);
    expect(sources[0]).toMatchObject({
      reference: 'https://github.com/example/later-result',
      whySelected:
        'GitHub public repository search result 1 for the authorized Prompt Forge query.',
      observedAt: 1_000,
    });
  });

  it('never exposes raw fetch errors', async () => {
    const research = createGitHubPublicResearchPort({
      fetchFn: async () => {
        throw new Error('secret-token-value from resolver');
      },
    });

    const failure = research({
      job: authorizedJob(),
      signal: new AbortController().signal,
      now: 1_000,
    });
    await expect(failure).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Public research is unavailable.',
    });
    await expect(failure).rejects.not.toThrow(/secret-token-value/i);
  });
});
