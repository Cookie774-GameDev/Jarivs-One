import { describe, expect, it } from 'vitest';
import {
  coerceToExposedPreset,
  stepsForPreset,
} from './presets';

describe('Hive presets', () => {
  it('builds Balanced as the 5-step Hive Balance pipeline', () => {
    expect(stepsForPreset('balanced', 'general').map((step) => [step.provider, step.model])).toEqual([
      ['google', 'gemini-3.5-flash-high'],
      ['openrouter', 'minimax/minimax-m3'],
      ['openrouter', 'zhipuai/glm-5.2'],
      ['deepseek', 'deepseek-v4-pro-max'],
      ['openai', 'gpt-5.4-mini'],
    ]);
  });

  it('coerces legacy exposed names to Balanced for UI selection', () => {
    expect(coerceToExposedPreset('fast')).toBe('balanced');
    expect(coerceToExposedPreset('quality')).toBe('balanced');
    expect(coerceToExposedPreset('ultra')).toBe('balanced');
    expect(coerceToExposedPreset('custom')).toBe('balanced');
  });
});
