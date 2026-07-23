import { describe, expect, it } from 'vitest';
import type { JarvisResponseMode } from '@/lib/jarvis/contracts';
import { getJarvisResponsePolicy, JARVIS_RESPONSE_POLICIES } from './modes';

const CANONICAL_MODES = [
  'acknowledgement',
  'direct_answer',
  'status',
  'warning',
  'approval_required',
  'action_running',
  'action_success',
  'action_partial',
  'action_failure',
  'clarification',
  'recommendation',
  'long_form_delivery',
  'sensitive',
] as const satisfies readonly JarvisResponseMode[];

describe('JARVIS response-mode policies', () => {
  it('defines one complete policy for every canonical response mode', () => {
    expect(Object.keys(JARVIS_RESPONSE_POLICIES)).toEqual(CANONICAL_MODES);

    for (const mode of CANONICAL_MODES) {
      expect(getJarvisResponsePolicy(mode)).toEqual({
        maxSentences: expect.toSatisfy(
          (value: unknown) => value === null || Number.isInteger(value),
        ),
        targetWords: expect.toSatisfy(
          (value: unknown) =>
            value === null ||
            (Array.isArray(value) &&
              value.length === 2 &&
              value.every(Number.isInteger) &&
              value[0] > 0 &&
              value[1] >= value[0]),
        ),
        encourageSir: expect.any(Boolean),
        allowHumor: expect.any(Boolean),
        includeNextAction: expect.any(Boolean),
        allowBullets: expect.any(Boolean),
        allowProsePostProcess: expect.any(Boolean),
        ttsDelivery: expect.stringMatching(/^(?:full|summary)$/),
      });
    }
  });

  it('deeply freezes the canonical policy table', () => {
    expect(Object.isFrozen(JARVIS_RESPONSE_POLICIES)).toBe(true);
    for (const mode of CANONICAL_MODES) {
      const policy = getJarvisResponsePolicy(mode);
      expect(Object.isFrozen(policy)).toBe(true);
      if (policy.targetWords) expect(Object.isFrozen(policy.targetWords)).toBe(true);
    }
  });

  it('keeps long-form and sensitive delivery exempt from mechanical length truncation', () => {
    expect(getJarvisResponsePolicy('long_form_delivery')).toMatchObject({
      maxSentences: null,
      targetWords: null,
      allowProsePostProcess: false,
      ttsDelivery: 'summary',
    });
    expect(getJarvisResponsePolicy('sensitive')).toMatchObject({
      maxSentences: null,
      targetWords: null,
      allowHumor: false,
      encourageSir: false,
    });
  });
});
