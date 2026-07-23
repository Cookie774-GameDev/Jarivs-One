export type JarvisHumorSituation =
  | 'low_risk_planning'
  | 'routine_technical_inconvenience'
  | 'ambitious_timeline'
  | 'overly_complex_plan'
  | 'minor_recoverable_failure'
  | 'successful_completion'
  | 'safety_incident'
  | 'security_breach'
  | 'credential_exposure'
  | 'destructive_operation'
  | 'health'
  | 'grief'
  | 'financial_harm'
  | 'legal_risk'
  | 'serious_user_distress'
  | 'repeated_failures'
  | 'uncertain_facts';

export interface JarvisHumorHistory {
  readonly recentReplyCount: number;
  readonly recentHumorReplyCount: number;
}

export interface JarvisDryHumorAssessmentInput extends JarvisHumorHistory {
  readonly situation: JarvisHumorSituation;
  readonly humorClauseCount: number;
  readonly clarityPreserved: boolean;
}

export type JarvisDryHumorAssessment =
  | Readonly<{ allowed: true; reason: 'allowed' }>
  | Readonly<{
      allowed: false;
      reason:
        | 'prohibited_situation'
        | 'too_many_clauses'
        | 'not_a_minority'
        | 'clarity_not_preserved';
    }>;

const allowedSituations = Object.freeze([
  'low_risk_planning',
  'routine_technical_inconvenience',
  'ambitious_timeline',
  'overly_complex_plan',
  'minor_recoverable_failure',
  'successful_completion',
] as const satisfies readonly JarvisHumorSituation[]);

const prohibitedSituations = Object.freeze([
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
] as const satisfies readonly JarvisHumorSituation[]);

export const JARVIS_DRY_HUMOR_POLICY = Object.freeze({
  allowedSituations,
  prohibitedSituations,
  maxClauses: 1,
  maximumReplyShareExclusive: 0.5,
  randomInsertion: false,
  linterAddsHumor: false,
});

function remainsMinority(history: Readonly<JarvisHumorHistory>): boolean {
  const recentReplyCount = Math.max(0, Math.trunc(history.recentReplyCount));
  const recentHumorReplyCount = Math.max(0, Math.trunc(history.recentHumorReplyCount));
  const projectedReplyCount = recentReplyCount + 1;
  const projectedHumorReplyCount = recentHumorReplyCount + 1;
  return projectedHumorReplyCount / projectedReplyCount < 0.5;
}

export function assessJarvisDryHumor(
  input: Readonly<JarvisDryHumorAssessmentInput>,
): JarvisDryHumorAssessment {
  if (
    JARVIS_DRY_HUMOR_POLICY.prohibitedSituations.includes(
      input.situation as (typeof prohibitedSituations)[number],
    )
  ) {
    return Object.freeze({ allowed: false, reason: 'prohibited_situation' });
  }
  if (input.humorClauseCount > JARVIS_DRY_HUMOR_POLICY.maxClauses) {
    return Object.freeze({ allowed: false, reason: 'too_many_clauses' });
  }
  if (!remainsMinority(input)) {
    return Object.freeze({ allowed: false, reason: 'not_a_minority' });
  }
  if (!input.clarityPreserved) {
    return Object.freeze({ allowed: false, reason: 'clarity_not_preserved' });
  }
  return Object.freeze({ allowed: true, reason: 'allowed' });
}
