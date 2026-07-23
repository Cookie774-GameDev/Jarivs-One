import type { JarvisResponseMode } from '@/lib/jarvis/contracts';

export interface JarvisResponsePolicy {
  readonly maxSentences: number | null;
  readonly targetWords: readonly [minimum: number, maximum: number] | null;
  readonly encourageSir: boolean;
  readonly allowHumor: boolean;
  readonly includeNextAction: boolean;
  readonly allowBullets: boolean;
  readonly allowProsePostProcess: boolean;
  readonly ttsDelivery: 'full' | 'summary';
}

function definePolicy(
  policy: Omit<JarvisResponsePolicy, 'targetWords'> & {
    targetWords: readonly [minimum: number, maximum: number] | null;
  },
): Readonly<JarvisResponsePolicy> {
  return Object.freeze({
    ...policy,
    targetWords: policy.targetWords
      ? Object.freeze([policy.targetWords[0], policy.targetWords[1]] as const)
      : null,
  });
}

export const JARVIS_RESPONSE_POLICIES: Readonly<
  Record<JarvisResponseMode, Readonly<JarvisResponsePolicy>>
> = Object.freeze({
  acknowledgement: definePolicy({
    maxSentences: 1,
    targetWords: [2, 12],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  direct_answer: definePolicy({
    maxSentences: 3,
    targetWords: [8, 80],
    encourageSir: false,
    allowHumor: true,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  status: definePolicy({
    maxSentences: 2,
    targetWords: [4, 50],
    encourageSir: false,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  warning: definePolicy({
    maxSentences: 3,
    targetWords: [12, 90],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: true,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  approval_required: definePolicy({
    maxSentences: 2,
    targetWords: [6, 50],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  action_running: definePolicy({
    maxSentences: 2,
    targetWords: [4, 50],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  action_success: definePolicy({
    maxSentences: 2,
    targetWords: [4, 50],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  action_partial: definePolicy({
    maxSentences: 3,
    targetWords: [8, 90],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: true,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  action_failure: definePolicy({
    maxSentences: 3,
    targetWords: [8, 90],
    encourageSir: true,
    allowHumor: false,
    includeNextAction: true,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  clarification: definePolicy({
    maxSentences: 2,
    targetWords: [4, 50],
    encourageSir: false,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  recommendation: definePolicy({
    maxSentences: 3,
    targetWords: [8, 90],
    encourageSir: false,
    allowHumor: true,
    includeNextAction: true,
    allowBullets: false,
    allowProsePostProcess: true,
    ttsDelivery: 'full',
  }),
  long_form_delivery: definePolicy({
    maxSentences: null,
    targetWords: null,
    encourageSir: false,
    allowHumor: false,
    includeNextAction: false,
    allowBullets: true,
    allowProsePostProcess: false,
    ttsDelivery: 'summary',
  }),
  sensitive: definePolicy({
    maxSentences: null,
    targetWords: null,
    encourageSir: false,
    allowHumor: false,
    includeNextAction: true,
    allowBullets: true,
    allowProsePostProcess: false,
    ttsDelivery: 'summary',
  }),
});

export function getJarvisResponsePolicy(mode: JarvisResponseMode): Readonly<JarvisResponsePolicy> {
  return JARVIS_RESPONSE_POLICIES[mode];
}
