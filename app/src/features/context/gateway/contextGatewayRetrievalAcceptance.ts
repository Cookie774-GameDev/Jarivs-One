import type { ContextRoute, ExecutionIdentity } from './contextGatewayContracts';

export const CONTEXT_RETRIEVAL_MINIMUM_RUNS = 30;
export const FOCUSED_RETRIEVAL_P95_LIMIT_MS = 4_000;
export const DEEP_RETRIEVAL_P95_LIMIT_MS = 8_000;
export const DEEP_RETRIEVAL_HARD_DEADLINE_MS = 10_000;
export const CONTEXT_RETRIEVAL_STAGE_NAMES = [
  'siyuanReady',
  'queueWait',
  'search',
  'evidenceHydration',
  'validationHash',
] as const;
export type ContextRetrievalStageName = (typeof CONTEXT_RETRIEVAL_STAGE_NAMES)[number];

export interface ContextRetrievalSample {
  sampleId: string;
  receiptId: string;
  harnessId: string;
  corpusRevision: string;
  scopeKey: string;
  route: ContextRoute;
  warm: boolean;
  executionIdentity: Readonly<ExecutionIdentity>;
  retrievalMs: number;
  stageTimingsMs: Readonly<Record<ContextRetrievalStageName, number>>;
  rlmSubqueryCount: number;
  candidateCount: number;
  hydratedCount: number;
  qualityCaseId: string;
  qualityRubricRevision: string;
  topResultCorrect: boolean;
  citationsVerified: boolean;
  answerRubricPassed: boolean;
}

export type ContextRetrievalAcceptanceFailure =
  | 'focused-p95'
  | 'deep-p95'
  | 'deep-hard-deadline'
  | 'top-result-accuracy'
  | 'citation-verification'
  | 'answer-rubric';

export interface ContextRetrievalAcceptanceReport {
  route: 'focused' | 'deep';
  sampleCount: number;
  passed: boolean;
  failures: readonly ContextRetrievalAcceptanceFailure[];
  retrievalMs: Readonly<{ p50: number; p95: number; p99: number; max: number }>;
  candidateCount: Readonly<{ p50: number; p95: number; p99: number; max: number }>;
  hydratedCount: Readonly<{ p50: number; p95: number; p99: number; max: number }>;
  stageTimingsMs: Readonly<
    Record<
      ContextRetrievalStageName,
      Readonly<{ p50: number; p95: number; p99: number; max: number }>
    >
  >;
  rlmSubqueryCount: Readonly<{ p50: number; p95: number; p99: number; max: number }>;
  quality: Readonly<{
    topResultAccuracy: number;
    citationVerificationRate: number;
    answerRubricPassRate: number;
  }>;
}

const identityFields: readonly (keyof ExecutionIdentity)[] = [
  'transportConnectionId',
  'transportAdapterId',
  'upstreamProviderId',
  'upstreamModelId',
  'providerQualifiedModelId',
  'authBillingRoute',
  'effort',
  'fastVariant',
  'catalogRevision',
  'observedProviderIdentity',
];

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function identityKey(identity: Readonly<ExecutionIdentity>): string {
  return JSON.stringify(
    identityFields.map((field) => {
      const value = identity[field];
      requireNonEmpty(value ?? '', `executionIdentity.${field}`);
      return value ?? null;
    }),
  );
}

function distribution(values: readonly number[]): {
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (percentile: number): number => sorted[Math.ceil(percentile * sorted.length) - 1];
  return { p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: sorted[sorted.length - 1] };
}

function requireUnique(
  samples: readonly Readonly<ContextRetrievalSample>[],
  field: 'sampleId' | 'receiptId' | 'qualityCaseId',
): void {
  const seen = new Set<string>();
  for (const sample of samples) {
    requireNonEmpty(sample[field], field);
    if (seen.has(sample[field])) throw new Error(`${field} must be unique`);
    seen.add(sample[field]);
  }
}

function requireComparable(
  samples: readonly Readonly<ContextRetrievalSample>[],
): 'focused' | 'deep' {
  if (samples.length < CONTEXT_RETRIEVAL_MINIMUM_RUNS) {
    throw new Error(`at least ${CONTEXT_RETRIEVAL_MINIMUM_RUNS} warm runs are required`);
  }
  requireUnique(samples, 'sampleId');
  requireUnique(samples, 'receiptId');
  requireUnique(samples, 'qualityCaseId');

  const first = samples[0];
  if (first.route !== 'focused' && first.route !== 'deep') {
    throw new Error('route must be focused or deep');
  }
  const route = first.route;
  const comparableFields = [
    'harnessId',
    'corpusRevision',
    'scopeKey',
    'qualityRubricRevision',
  ] as const;
  for (const field of comparableFields) requireNonEmpty(first[field], field);
  const expectedIdentity = identityKey(first.executionIdentity);

  for (const sample of samples) {
    if (!sample.warm) throw new Error('warm must be true');
    if (sample.route !== route) throw new Error('route must be identical across samples');
    if (!Number.isFinite(sample.retrievalMs) || sample.retrievalMs < 0) {
      throw new Error('retrievalMs must be finite and non-negative');
    }
    const stageKeys = Object.keys(sample.stageTimingsMs);
    if (
      stageKeys.length !== CONTEXT_RETRIEVAL_STAGE_NAMES.length ||
      CONTEXT_RETRIEVAL_STAGE_NAMES.some((stage) => !stageKeys.includes(stage))
    ) {
      throw new Error('stageTimingsMs must contain exactly the approved retrieval stages');
    }
    let stageTotal = 0;
    for (const stage of CONTEXT_RETRIEVAL_STAGE_NAMES) {
      const timing = sample.stageTimingsMs[stage];
      if (!Number.isFinite(timing) || timing < 0) {
        throw new Error(`stageTimingsMs.${stage} must be finite and non-negative`);
      }
      stageTotal += timing;
    }
    if (Math.abs(stageTotal - sample.retrievalMs) > 0.001) {
      throw new Error('stageTimingsMs must reconcile to retrievalMs');
    }
    if (!Number.isSafeInteger(sample.rlmSubqueryCount) || sample.rlmSubqueryCount < 0) {
      throw new Error('rlmSubqueryCount must be a non-negative safe integer');
    }
    if (route === 'deep' && sample.rlmSubqueryCount < 1) {
      throw new Error('deep retrieval requires at least one RLM subquery');
    }
    for (const field of ['candidateCount', 'hydratedCount'] as const) {
      if (!Number.isSafeInteger(sample[field]) || sample[field] < 0) {
        throw new Error(`${field} must be a non-negative safe integer`);
      }
    }
    if (sample.hydratedCount > sample.candidateCount) {
      throw new Error('hydratedCount cannot exceed candidateCount');
    }
    for (const field of ['topResultCorrect', 'citationsVerified', 'answerRubricPassed'] as const) {
      if (typeof sample[field] !== 'boolean') throw new Error(`${field} must be boolean`);
    }
    for (const field of comparableFields) {
      requireNonEmpty(sample[field], field);
      if (sample[field] !== first[field])
        throw new Error(`${field} must be identical across samples`);
    }
    if (identityKey(sample.executionIdentity) !== expectedIdentity) {
      throw new Error('executionIdentity must be identical across samples');
    }
  }
  return route;
}

export function buildContextRetrievalAcceptanceReport(
  samples: readonly Readonly<ContextRetrievalSample>[],
): Readonly<ContextRetrievalAcceptanceReport> {
  const route = requireComparable(samples);
  const retrievalMs = distribution(samples.map((sample) => sample.retrievalMs));
  const failures: ContextRetrievalAcceptanceFailure[] = [];
  const rate = (field: 'topResultCorrect' | 'citationsVerified' | 'answerRubricPassed'): number =>
    samples.filter((sample) => sample[field]).length / samples.length;
  const quality = {
    topResultAccuracy: rate('topResultCorrect'),
    citationVerificationRate: rate('citationsVerified'),
    answerRubricPassRate: rate('answerRubricPassed'),
  };

  if (route === 'focused' && retrievalMs.p95 > FOCUSED_RETRIEVAL_P95_LIMIT_MS) {
    failures.push('focused-p95');
  }
  if (route === 'deep' && retrievalMs.p95 > DEEP_RETRIEVAL_P95_LIMIT_MS) {
    failures.push('deep-p95');
  }
  if (route === 'deep' && retrievalMs.max > DEEP_RETRIEVAL_HARD_DEADLINE_MS) {
    failures.push('deep-hard-deadline');
  }
  if (quality.topResultAccuracy < 1) failures.push('top-result-accuracy');
  if (quality.citationVerificationRate < 1) failures.push('citation-verification');
  if (quality.answerRubricPassRate < 1) failures.push('answer-rubric');

  return {
    route,
    sampleCount: samples.length,
    passed: failures.length === 0,
    failures,
    retrievalMs,
    candidateCount: distribution(samples.map((sample) => sample.candidateCount)),
    hydratedCount: distribution(samples.map((sample) => sample.hydratedCount)),
    stageTimingsMs: Object.fromEntries(
      CONTEXT_RETRIEVAL_STAGE_NAMES.map((stage) => [
        stage,
        distribution(samples.map((sample) => sample.stageTimingsMs[stage])),
      ]),
    ) as ContextRetrievalAcceptanceReport['stageTimingsMs'],
    rlmSubqueryCount: distribution(samples.map((sample) => sample.rlmSubqueryCount)),
    quality,
  };
}
