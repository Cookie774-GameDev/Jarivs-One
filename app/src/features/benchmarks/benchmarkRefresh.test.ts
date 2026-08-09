import { beforeEach, describe, expect, it } from 'vitest';

import type { BenchmarkRow } from './benchmarkData';
import {
  deduplicateBenchmarkRows,
  nextBenchmarkRefreshAt,
  readBenchmarkRefreshConfig,
  shouldRunMissedBenchmarkRefresh,
  writeBenchmarkRefreshConfig,
} from './benchmarkRefresh';

function row(model: string, votes: number, fetchedAt: number): BenchmarkRow {
  return {
    model,
    provider: 'openai',
    arena_score: 100,
    ci_low: 95,
    ci_high: 105,
    open_source: false,
    votes,
    source: 'lmsys',
    fetched_at: fetchedAt,
  };
}

describe('benchmark refresh policy', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to an hourly cadence and schedules from the last successful run', () => {
    expect(readBenchmarkRefreshConfig()).toEqual({ enabled: true, intervalMinutes: 60 });
    const now = new Date(2026, 7, 2, 11, 30);
    const lastRunAt = new Date(2026, 7, 2, 11, 5).getTime();
    const next = nextBenchmarkRefreshAt(now, readBenchmarkRefreshConfig(), lastRunAt);
    expect(next?.getHours()).toBe(12);
    expect(next?.getMinutes()).toBe(5);
    expect(next?.getDate()).toBe(2);
  });

  it('runs immediately when the hourly refresh is missing or overdue', () => {
    writeBenchmarkRefreshConfig({ enabled: true, intervalMinutes: 60 });
    const now = new Date(2026, 7, 2, 10, 0);
    expect(shouldRunMissedBenchmarkRefresh(now, readBenchmarkRefreshConfig(), null)).toBe(true);
    expect(
      shouldRunMissedBenchmarkRefresh(
        now,
        readBenchmarkRefreshConfig(),
        new Date(2026, 7, 2, 8, 59).getTime(),
      ),
    ).toBe(true);
    expect(
      shouldRunMissedBenchmarkRefresh(
        now,
        readBenchmarkRefreshConfig(),
        new Date(2026, 7, 2, 9, 30).getTime(),
      ),
    ).toBe(false);
  });

  it('deduplicates provider/model identities using the strongest evidence', () => {
    const result = deduplicateBenchmarkRows([
      row('GPT-X', 10, 100),
      row(' gpt-x ', 20, 90),
      row('Other', 5, 100),
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(
      result.rows.find((candidate) => candidate.model.trim().toLowerCase() === 'gpt-x')?.votes,
    ).toBe(20);
  });
});
