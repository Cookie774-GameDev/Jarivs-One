import { describe, expect, it } from 'vitest';
import { assessJarvisDryHumor, JARVIS_DRY_HUMOR_POLICY, type JarvisHumorSituation } from './humor';

const ALLOWED_SITUATIONS = [
  'low_risk_planning',
  'routine_technical_inconvenience',
  'ambitious_timeline',
  'overly_complex_plan',
  'minor_recoverable_failure',
  'successful_completion',
] as const satisfies readonly JarvisHumorSituation[];

const PROHIBITED_SITUATIONS = [
  'safety_incident',
  'security_breach',
  'credential_exposure',
  'destructive_operation',
  'health',
  'grief',
  'financial_harm',
  'legal_risk',
  'serious_user_distress',
  'repeated_failures',
  'uncertain_facts',
] as const satisfies readonly JarvisHumorSituation[];

function assessment(overrides: Partial<Parameters<typeof assessJarvisDryHumor>[0]> = {}) {
  return assessJarvisDryHumor({
    situation: 'low_risk_planning',
    humorClauseCount: 1,
    recentReplyCount: 4,
    recentHumorReplyCount: 0,
    clarityPreserved: true,
    ...overrides,
  });
}

describe('JARVIS dry-humor policy', () => {
  it('defines the exact conservative policy without any insertion authority', () => {
    expect(JARVIS_DRY_HUMOR_POLICY).toEqual({
      allowedSituations: ALLOWED_SITUATIONS,
      prohibitedSituations: PROHIBITED_SITUATIONS,
      maxClauses: 1,
      maximumReplyShareExclusive: 0.5,
      randomInsertion: false,
      linterAddsHumor: false,
    });
    expect(Object.isFrozen(JARVIS_DRY_HUMOR_POLICY)).toBe(true);
    expect(Object.isFrozen(JARVIS_DRY_HUMOR_POLICY.allowedSituations)).toBe(true);
    expect(Object.isFrozen(JARVIS_DRY_HUMOR_POLICY.prohibitedSituations)).toBe(true);
  });

  it.each(ALLOWED_SITUATIONS)('allows one clear minority clause for %s', (situation) => {
    expect(assessment({ situation })).toEqual({ allowed: true, reason: 'allowed' });
  });

  it.each(PROHIBITED_SITUATIONS)('rejects humor for %s', (situation) => {
    expect(assessment({ situation })).toEqual({
      allowed: false,
      reason: 'prohibited_situation',
    });
  });

  it('rejects more than one dry clause', () => {
    expect(assessment({ humorClauseCount: 2 })).toEqual({
      allowed: false,
      reason: 'too_many_clauses',
    });
  });

  it('keeps humorous replies strictly below half of the recent reply window', () => {
    expect(
      assessment({
        recentReplyCount: 3,
        recentHumorReplyCount: 1,
      }),
    ).toEqual({
      allowed: false,
      reason: 'not_a_minority',
    });
  });

  it('rejects humor when clarity is not independently preserved', () => {
    expect(assessment({ clarityPreserved: false })).toEqual({
      allowed: false,
      reason: 'clarity_not_preserved',
    });
  });
});
