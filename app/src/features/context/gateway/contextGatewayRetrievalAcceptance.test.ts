import { describe, expect, it } from 'vitest';

import type { ExecutionIdentity } from './contextGatewayContracts';
import {
  buildContextRetrievalAcceptanceReport,
  type ContextRetrievalSample,
} from './contextGatewayRetrievalAcceptance';

const identity: ExecutionIdentity = {
  transportConnectionId: 'connection-1',
  transportAdapterId: 'opencode-persistent',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-luna',
  providerQualifiedModelId: 'openai/gpt-5.6-luna',
  authBillingRoute: 'subscription',
  effort: 'max',
  fastVariant: 'fast',
  catalogRevision: 'catalog-1',
  observedProviderIdentity: 'openai',
};

function samples(
  route: 'focused' | 'deep',
  overrides: Partial<ContextRetrievalSample> = {},
): ContextRetrievalSample[] {
  return Array.from({ length: 30 }, (_, index) => ({
    sampleId: `sample-${index}`,
    receiptId: `receipt-${index}`,
    harnessId: 'vibespace-chat',
    corpusRevision: 'corpus-1',
    scopeKey: 'account/workspace/project/worktree',
    route,
    warm: true,
    executionIdentity: identity,
    retrievalMs: route === 'focused' ? 1_000 + index : 2_000 + index,
    candidateCount: 8,
    hydratedCount: 5,
    qualityCaseId: `case-${index}`,
    qualityRubricRevision: 'quality-rubric-1',
    topResultCorrect: true,
    citationsVerified: true,
    answerRubricPassed: true,
    ...overrides,
  }));
}

describe('buildContextRetrievalAcceptanceReport', () => {
  it('passes thirty comparable focused runs within the four-second p95 target', () => {
    const report = buildContextRetrievalAcceptanceReport(samples('focused'));

    expect(report).toMatchObject({ route: 'focused', sampleCount: 30, passed: true });
    expect(report.retrievalMs.p95).toBe(1_028);
    expect(report.retrievalMs.max).toBe(1_029);
    expect(report.quality).toEqual({
      topResultAccuracy: 1,
      citationVerificationRate: 1,
      answerRubricPassRate: 1,
    });
    expect(report.failures).toEqual([]);
  });

  it.each([
    ['incorrect top result', { topResultCorrect: false }, 'top-result-accuracy'],
    ['unverified citations', { citationsVerified: false }, 'citation-verification'],
    ['failed answer rubric', { answerRubricPassed: false }, 'answer-rubric'],
  ] as const)('fails quality acceptance for %s', (_label, override, failure) => {
    const report = buildContextRetrievalAcceptanceReport(samples('focused', override));

    expect(report.passed).toBe(false);
    expect(report.failures).toContain(failure);
  });

  it('fails a focused p95 above four seconds', () => {
    const report = buildContextRetrievalAcceptanceReport(
      samples('focused', { retrievalMs: 4_001 }),
    );

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(['focused-p95']);
  });

  it('enforces both the deep p95 target and per-run hard deadline', () => {
    const slowP95 = buildContextRetrievalAcceptanceReport(samples('deep', { retrievalMs: 8_001 }));
    expect(slowP95.failures).toEqual(['deep-p95']);

    const hardDeadline = samples('deep');
    hardDeadline[29] = { ...hardDeadline[29], retrievalMs: 10_001 };
    const deadlineReport = buildContextRetrievalAcceptanceReport(hardDeadline);
    expect(deadlineReport.retrievalMs.p95).toBe(2_028);
    expect(deadlineReport.failures).toEqual(['deep-hard-deadline']);
  });

  it.each([
    ['too few samples', samples('focused').slice(0, 29)],
    ['cold samples', samples('focused', { warm: false })],
    ['direct samples', samples('focused', { route: 'direct' })],
    ['invalid duration', samples('focused', { retrievalMs: Number.NaN })],
    ['negative candidates', samples('focused', { candidateCount: -1 })],
    ['fractional hydration', samples('focused', { hydratedCount: 1.5 })],
    ['over-hydration', samples('focused', { candidateCount: 2, hydratedCount: 3 })],
  ])('rejects %s instead of publishing an acceptance result', (_label, input) => {
    expect(() => buildContextRetrievalAcceptanceReport(input)).toThrow();
  });

  it('rejects duplicate sample or receipt identities', () => {
    for (const field of ['sampleId', 'receiptId', 'qualityCaseId'] as const) {
      const input = samples('focused');
      input[1] = { ...input[1], [field]: input[0][field] };
      expect(() => buildContextRetrievalAcceptanceReport(input)).toThrow(field);
    }
  });

  it.each([
    ['harnessId', 'terminal-codex'],
    ['corpusRevision', 'corpus-2'],
    ['scopeKey', 'other/scope'],
    ['route', 'deep'],
  ] as const)('rejects mixed %s values', (field, value) => {
    const input = samples('focused');
    input[29] = { ...input[29], [field]: value };
    expect(() => buildContextRetrievalAcceptanceReport(input)).toThrow(field);
  });

  it('rejects mixed exact execution identities', () => {
    const input = samples('deep');
    input[29] = {
      ...input[29],
      executionIdentity: { ...identity, effort: 'high' },
    };
    expect(() => buildContextRetrievalAcceptanceReport(input)).toThrow('executionIdentity');
  });

  it('rejects mixed quality rubric revisions', () => {
    const input = samples('focused');
    input[29] = { ...input[29], qualityRubricRevision: 'quality-rubric-2' };
    expect(() => buildContextRetrievalAcceptanceReport(input)).toThrow('qualityRubricRevision');
  });

  it('rejects acceptance evidence without an observed provider identity', () => {
    expect(() =>
      buildContextRetrievalAcceptanceReport(
        samples('focused', {
          executionIdentity: { ...identity, observedProviderIdentity: undefined },
        }),
      ),
    ).toThrow('observedProviderIdentity');
  });
});
