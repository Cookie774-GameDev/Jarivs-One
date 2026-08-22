import { describe, expect, it } from 'vitest';
import { routeRequest } from './intelligence';
import type { Env } from './runtime';

function healthEnv(): Env {
  const recent = new Date(Date.now() - 60_000).toISOString();
  const db = {
    prepare(sql: string) {
      const first = async (params: unknown[] = []) => {
        if (sql.includes('intelligence_pipeline_runs')) {
          const pipeline = params[0];
          return {
            pipeline,
            completed_at: recent,
            status: 'success',
            fetched_count: 197,
            stored_count: 197,
            succeeded_sources: 1,
            failed_sources: 0,
            duration_ms: 100,
            metadata_json: '{"datasetId":"aa-incomplete"}',
            error_json: '[]',
          };
        }
        if (sql.includes('benchmark_current_v2')) {
          return {
            id: 'aa-incomplete',
            source_observed_at: recent,
            ingested_at: recent,
            row_count: 197,
            metadata_json: '{"api":"v2","validated":true}',
            promoted_at: recent,
          };
        }
        if (sql.includes('intelligence_news_events')) {
          return { item_count: 0, newest_item_at: null, last_write_at: null };
        }
        return null;
      };
      return {
        bind: (...params: unknown[]) => ({
          first: () => first(params),
          all: async () => ({ results: [] }),
        }),
        first: () => first(),
        all: async () => ({ results: [] }),
      };
    },
  } as unknown as D1Database;
  return { DB: db };
}

describe('intelligence health', () => {
  it('reports a recent dataset without page completeness as degraded, not fresh', async () => {
    const response = await routeRequest(
      new Request('https://intelligence.example/health'),
      healthEnv(),
      { waitUntil: () => {} },
    );
    const payload = (await response.json()) as {
      benchmarks: {
        freshness: { state: string };
        currentDataset: { completeness: { state: string } };
        latestRun: { status: string; errors: unknown[] };
      };
    };
    expect(payload.benchmarks.freshness.state).toBe('degraded');
    expect(payload.benchmarks.currentDataset.completeness.state).toBe('unverified');
    expect(payload.benchmarks.latestRun).toMatchObject({ status: 'success', errors: [] });
  });
});
