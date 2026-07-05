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

  it('returns live Wu Long rows when the API succeeds', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        meta: { fetched_at: '2026-06-22T07:01:02.283089+00:00' },
        models: [
          { model: 'claude-opus-4-6', vendor: 'Anthropic', score: 1499, ci: 4, votes: 1 },
          { model: 'gpt-4o', vendor: 'OpenAI', score: 1400, ci: 5, votes: 1 },
          { model: 'gemini-pro', vendor: 'Google', score: 1380, ci: 5, votes: 1 },
          { model: 'llama-3', vendor: 'Meta', score: 1300, ci: 6, votes: 1 },
          { model: 'mistral-large', vendor: 'Mistral', score: 1280, ci: 6, votes: 1 },
        ],
      }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    const result = await fetchBenchmarks({ force: true });
    expect(result.fromSnapshot).toBe(false);
    expect(result.rows.length).toBeGreaterThanOrEqual(5);
    expect(result.rows[0]?.model).toBe('claude-opus-4-6');
  });

  it('falls back to snapshot when every live source fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    const result = await fetchBenchmarks({ force: true });
    expect(result.fromSnapshot).toBe(true);
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]?.model).toBe('Claude Fable 5');
    expect(result.rows[0]?.source).toBe('snapshot');
  });

  it('serves curated Top 50 snapshot on default load', async () => {
    const result = await fetchBenchmarks();
    expect(result.fromSnapshot).toBe(true);
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]?.model).toBe('Claude Fable 5');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
