import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVED_AI_REPOSITORIES,
  parseGitHubRepository,
  refreshRepositoryTrends,
  trendSignal,
} from './repositoryTrends';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('approved AI repository trends', () => {
  it('uses a bounded unique repository allowlist', () => {
    expect(APPROVED_AI_REPOSITORIES.length).toBeGreaterThanOrEqual(5);
    expect(APPROVED_AI_REPOSITORIES.length).toBeLessThanOrEqual(12);
    expect(new Set(APPROVED_AI_REPOSITORIES.map((repository) => repository.fullName)).size).toBe(
      APPROVED_AI_REPOSITORIES.length,
    );
  });

  it('preserves readable GitHub metadata and a measured trend delta', () => {
    const parsed = parseGitHubRepository(
      APPROVED_AI_REPOSITORIES[0]!,
      {
        full_name: APPROVED_AI_REPOSITORIES[0]!.fullName,
        html_url: `https://github.com/${APPROVED_AI_REPOSITORIES[0]!.fullName}`,
        private: false,
        visibility: 'public',
        description: 'Official AI tooling repository.',
        stargazers_count: 125,
        forks_count: 20,
        open_issues_count: 4,
        language: 'TypeScript',
        pushed_at: '2026-08-22T01:02:03Z',
      },
      120,
      '2026-08-22T02:00:00Z',
    );
    expect(parsed).toMatchObject({
      stars: 125,
      starDelta: 5,
      language: 'TypeScript',
      pushedAt: '2026-08-22T01:02:03.000Z',
      observedAt: '2026-08-22T02:00:00.000Z',
    });
    expect(trendSignal(parsed.starDelta)).toBe('+5 stars since last check');
  });

  it.each([
    { private: true, visibility: 'private' },
    { private: false, visibility: 'internal' },
    { private: true, visibility: 'public' },
    { private: false },
    { visibility: 'public' },
  ])('rejects repository metadata that is not explicitly public: %o', (visibility) => {
    expect(() =>
      parseGitHubRepository(
        APPROVED_AI_REPOSITORIES[0]!,
        {
          full_name: APPROVED_AI_REPOSITORIES[0]!.fullName,
          html_url: `https://github.com/${APPROVED_AI_REPOSITORIES[0]!.fullName}`,
          description: 'PRIVATE SENTINEL',
          stargazers_count: 125,
          forks_count: 20,
          open_issues_count: 4,
          pushed_at: '2026-08-22T01:02:03Z',
          ...visibility,
        },
        120,
        '2026-08-22T02:00:00Z',
      ),
    ).toThrow(/explicitly public/i);
  });

  it('purges a stale public row when GitHub explicitly reports an allowlisted repository as private', async () => {
    const operations: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => ({ stars: 120 }),
          run: async () => {
            operations.push({ sql, params });
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const fullName = new URL(String(input)).pathname.replace(/^\/repos\//u, '');
        return Response.json({
          full_name: fullName,
          html_url: `https://github.com/${fullName}`,
          private: true,
          visibility: 'private',
          description: 'PRIVATE SENTINEL',
          stargazers_count: 125,
          forks_count: 20,
          open_issues_count: 4,
          pushed_at: '2026-08-22T01:02:03Z',
        });
      }),
    );

    await expect(refreshRepositoryTrends({ DB: db }, '2026-08-22T02:00:00Z')).resolves.toEqual({
      succeeded: 0,
      failed: APPROVED_AI_REPOSITORIES.length,
    });
    expect(
      operations.filter(({ sql }) => /^\s*DELETE FROM intelligence_repository_trends/u.test(sql)),
    ).toHaveLength(APPROVED_AI_REPOSITORIES.length);
    expect(
      operations.some(({ sql }) => /INSERT INTO intelligence_repository_trends/u.test(sql)),
    ).toBe(false);
    expect(operations.map(({ params }) => params[0])).toEqual(
      expect.arrayContaining(APPROVED_AI_REPOSITORIES.map(({ id }) => id)),
    );
  });

  it('retains the prior public cache when GitHub transport fails without a visibility result', async () => {
    const operations: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: () => ({
          first: async () => ({ stars: 120 }),
          run: async () => {
            operations.push(sql);
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unavailable');
      }),
    );

    await expect(refreshRepositoryTrends({ DB: db }, '2026-08-22T02:00:00Z')).resolves.toEqual({
      succeeded: 0,
      failed: APPROVED_AI_REPOSITORIES.length,
    });
    expect(operations).toEqual([]);
  });

  it.each([
    { private: false, visibility: 'internal' },
    { private: true, visibility: 'public' },
    { private: false },
    { visibility: 'public' },
  ])('retains the prior public cache for ambiguous visibility metadata: %o', async (visibility) => {
    const operations: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: () => ({
          first: async () => ({ stars: 120 }),
          run: async () => {
            operations.push(sql);
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const fullName = new URL(String(input)).pathname.replace(/^\/repos\//u, '');
        return Response.json({
          full_name: fullName,
          html_url: `https://github.com/${fullName}`,
          description: 'AMBIGUOUS SENTINEL',
          stargazers_count: 125,
          forks_count: 20,
          open_issues_count: 4,
          pushed_at: '2026-08-22T01:02:03Z',
          ...visibility,
        });
      }),
    );

    await expect(refreshRepositoryTrends({ DB: db }, '2026-08-22T02:00:00Z')).resolves.toEqual({
      succeeded: 0,
      failed: APPROVED_AI_REPOSITORIES.length,
    });
    expect(operations).toEqual([]);
  });

  it('rejects a payload that changes the allowlisted repository identity', () => {
    expect(() =>
      parseGitHubRepository(
        APPROVED_AI_REPOSITORIES[0]!,
        {
          full_name: 'attacker/repository',
          html_url: 'https://github.com/attacker/repository',
          stargazers_count: 1,
          forks_count: 0,
          open_issues_count: 0,
          pushed_at: '2026-08-22T01:02:03Z',
        },
        null,
        '2026-08-22T02:00:00Z',
      ),
    ).toThrow(/identity/i);
  });
});
