import type { StackPresetId } from './types';

export const FABLE_5_BASELINE_SCORE = 90.7;

export interface HiveSimulatedBenchmark {
  preset: Extract<StackPresetId, 'balanced'>;
  label: string;
  vibeScore: number | null;
  beatsFable5: boolean;
  deltaVsFable5: number | null;
  caveat: string;
}

export const HIVE_SIMULATED_BENCHMARKS: readonly HiveSimulatedBenchmark[] = [
  {
    preset: 'balanced',
    label: 'Hive Balanced',
    vibeScore: null,
    beatsFable5: false,
    deltaVsFable5: null,
    caveat: 'Expected stronger than old Balanced, but not confirmed Fable-beating.',
  },
] as const;

export function benchmarkForPreset(
  preset: StackPresetId,
): HiveSimulatedBenchmark | null {
  return HIVE_SIMULATED_BENCHMARKS.find((item) => item.preset === preset) ?? null;
}
