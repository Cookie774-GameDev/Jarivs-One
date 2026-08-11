import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/nativeFetch', () => ({
  nativeFetch: vi.fn(),
}));

import { nativeFetch } from '@/lib/nativeFetch';
import {
  clearBenchmarkCache,
  fetchBenchmarks,
  normalizeWulong,
  vendorToProvider,
} from './benchmarkData';

const mockedFetch = vi.mocked(nativeFetch);

beforeEach(() => {
  clearBenchmarkCache();
  mockedFetch.mockReset();
});

describe('benchmarkData live sources', () => {
  it('maps Arena vendors to Jarvis provider slugs', () => {
    expect(vendorToProvider('Anthropic')).toBe('anthropic');
    expect(vendorToProvider('OpenAI')).toBe('openai');
    expect(vendorToProvider('Google')).toBe('google');
    expect(vendorToProvider('Z.ai')).toBe('zai');
    expect(vendorToProvider('ByteDance')).toBe('bytedance');
    expect(vendorToProvider('MiniMax')).toBe('minimax');
  });

  it('normalizes Wu Long Arena JSON into benchmark rows', () => {
    const rows = normalizeWulong(
      {
        meta: { fetched_at: '2026-06-22T07:01:02.283089+00:00' },
        models: [
          {
            rank: 1,
            model: 'claude-opus-4-6',
            vendor: 'Anthropic',
            license: 'proprietary',
            score: 1499,
            ci: 4,
            votes: 49596,
          },
          {
            rank: 2,
            model: 'llama-3.1-405b',
            vendor: 'Meta',
            license: 'open',
            score: 1267,
            ci: 7,
            votes: 1000,
          },
        ],
      },
      Date.UTC(2026, 5, 1),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.model).toBe('claude-opus-4-6');
    expect(rows[0]?.provider).toBe('anthropic');
    expect(rows[0]?.arena_score).toBe(1499);
    expect(rows[0]?.ci_low).toBe(1495);
    expect(rows[0]?.ci_high).toBe(1503);
    expect(rows[0]?.source).toBe('lmsys');
    expect(rows[0]?.fetched_at).toBe(Date.parse('2026-06-22T07:01:02.283089+00:00'));
    expect(rows[1]?.open_source).toBe(true);
  });

  it('deduplicates repeated live model rows and keeps the strongest score', () => {
    const rows = normalizeWulong(
      {
        models: [
          { model: 'gemini-3.5-flash-high', vendor: 'Google', score: 1400, ci: 5 },
          { model: 'gemini-3.5-flash-high', vendor: 'Google', score: 1412, ci: 4 },
          { model: 'claude-opus', vendor: 'Anthropic', score: 1390, ci: 3 },
        ],
      },
      Date.UTC(2026, 6, 11),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.model).toBe('gemini-3.5-flash-high');
    expect(rows[0]?.arena_score).toBe(1412);
    expect(rows[1]?.model).toBe('claude-opus');
  });

  it('returns live Wu Long rows when the API succeeds', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { fetched_at: new Date().toISOString() },
          models: Array.from({ length: 50 }, (_, index) => ({
            model: index === 0 ? 'claude-opus-4-6' : `live-model-${index + 1}`,
            vendor: index === 0 ? 'Anthropic' : 'OpenAI',
            score: 1499 - index,
            ci: 4,
            votes: 1,
          })),
        }),
        headers: { get: () => 'application/json' },
      } as unknown as Response);

    const result = await fetchBenchmarks({ force: true });
    expect(result.fromSnapshot).toBe(false);
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]?.model).toBe('claude-opus-4-6');
  });

  it('prefers the hourly Cloudflare benchmark snapshot before direct upstream fallbacks', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        freeOnly: true,
        source: {
          kind: 'independent-preference',
          name: 'Arena',
          url: 'https://arena.ai/leaderboard/text',
        },
        benchmarkDate: '2026-08-10T18:00:00.000Z',
        ingestedAt: '2026-08-10T18:07:00.000Z',
        metric: 'Arena rating',
        rows: Array.from({ length: 20 }, (_, index) => ({
          rank: index + 1,
          model: `worker-model-${index + 1}`,
          vendor: 'OpenAI',
          license: 'proprietary',
          score: 1500 - index,
          ci: 4,
          votes: 500 + index,
        })),
      }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    const result = await fetchBenchmarks({ force: true });

    expect(result.rows).toHaveLength(20);
    expect(result.rows[0]?.model).toBe('worker-model-1');
    expect(String(mockedFetch.mock.calls[0]?.[0])).toBe(
      'https://vibespace-ai-news.vibespace-viper.workers.dev/api/benchmarks',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid structured leaderboard without requiring exactly fifty rows', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        models: Array.from({ length: 20 }, (_, index) => ({
          model: `partial-model-${index + 1}`,
          vendor: 'OpenAI',
          score: 1400 - index,
        })),
      }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    const result = await fetchBenchmarks({ force: true });
    expect(result.fromSnapshot).toBe(false);
    expect(result.rows).toHaveLength(20);
    expect(result.rows[0]?.model).toBe('partial-model-1');
  });

  it('does not invent benchmark rows when every live source fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    const result = await fetchBenchmarks({ force: true });
    expect(result.fromSnapshot).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.reason).toContain('network down');
    expect(result.dataset.metricLabel).toBe('Arena rating');
  });

  it('attempts every structured source before returning an honest unavailable state', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'));
    const result = await fetchBenchmarks();
    expect(result.unavailable).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.dataset.sourceName).toBe('Arena');
    expect(mockedFetch.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps a stale last-known-good live dataset when the hourly refresh fails', async () => {
    const fetchedAt = Date.now() - 2 * 60 * 60 * 1000;
    localStorage.setItem(
      'jarvis-benchmark-cache-v5',
      JSON.stringify({
        fromSnapshot: false,
        cachedAt: fetchedAt,
        rows: Array.from({ length: 50 }, (_, index) => ({
          model: `known-good-${index + 1}`,
          provider: 'openai',
          arena_score: 1500 - index,
          ci_low: 1495 - index,
          ci_high: 1505 - index,
          open_source: false,
          source: 'lmsys',
          fetched_at: fetchedAt,
        })),
      }),
    );
    mockedFetch.mockRejectedValue(new Error('upstream unavailable'));

    const result = await fetchBenchmarks();

    expect(result.fromSnapshot).toBe(false);
    expect(result.cached).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.rows[0]?.model).toBe('known-good-1');
    expect(result.reason).toContain('upstream unavailable');
  });

  it('never writes a synthetic snapshot into the live cache', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'));
    await fetchBenchmarks({ force: true });
    expect(localStorage.getItem('jarvis-benchmark-cache-v5')).toBeNull();
  });
});
