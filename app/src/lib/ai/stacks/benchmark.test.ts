import { describe, expect, it } from 'vitest';
import {
  FABLE_5_BASELINE_SCORE,
  HIVE_SIMULATED_BENCHMARKS,
  benchmarkForPreset,
} from './benchmark';

describe('Hive simulated benchmarks', () => {
  it('keeps the Fable 5 baseline explicit', () => {
    expect(FABLE_5_BASELINE_SCORE).toBe(90.7);
  });

  it('exposes only the Hive Balanced benchmark row', () => {
    expect(HIVE_SIMULATED_BENCHMARKS.map((item) => item.label)).toEqual([
      'Hive Balanced',
    ]);
  });

  it('does not overclaim Balanced as confirmed Fable-beating', () => {
    expect(benchmarkForPreset('balanced')?.beatsFable5).toBe(false);
    expect(HIVE_SIMULATED_BENCHMARKS.every((item) => item.caveat.length > 0)).toBe(true);
  });
});
