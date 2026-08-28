import { describe, expect, it } from 'vitest';

import { parseContextGatewayAcceptanceInput } from './contextGatewayAcceptanceSchema';

function incompleteEnvelope(): Record<string, unknown> {
  return {
    build: { commitSha: '', buildId: '', runtimeGeneration: '' },
    directReports: [],
    nativeProofs: [],
    featureParityPassed: true,
    concurrentScopeIsolationPassed: true,
    rollbackNotes: '',
    externalBlockers: [],
  };
}

describe('parseContextGatewayAcceptanceInput', () => {
  it('accepts the bounded metadata-only incomplete envelope', () => {
    expect(parseContextGatewayAcceptanceInput(incompleteEnvelope())).toEqual(incompleteEnvelope());
  });

  it('accepts only exact structured rollback proof metadata', () => {
    const input = {
      ...incompleteEnvelope(),
      rollbackProof: {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        runtimeGeneration: 'generation-1',
        oldRouteAvailable: true,
        noShadowProviderDispatch: true,
        userDataPreserved: true,
        runtimePointerRestorable: true,
      },
    };
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        rollbackProof: { ...input.rollbackProof, output: 'private output' },
      }),
    ).toThrow('unknown field');
  });

  it('accepts bounded metadata-only concurrent isolation proof', () => {
    const input = {
      ...incompleteEnvelope(),
      isolationProof: {
        evidenceId: 'isolation-proof-1',
        recordedAt: '2026-08-22T12:00:00.000Z',
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        runtimeGeneration: 'generation-1',
        officialDesktop: true,
        concurrent: true,
        scopes: [
          { surfaceId: 'chat', scopeHash: `sha256:${'1'.repeat(64)}` },
          { surfaceId: 'terminal:codex', scopeHash: `sha256:${'2'.repeat(64)}` },
          { surfaceId: 'terminal:claude', scopeHash: `sha256:${'3'.repeat(64)}` },
        ],
        crossScopeContextBlocked: true,
        crossScopeEvidenceReuseBlocked: true,
        latePostCancelEventBlocked: true,
      },
    };
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);
  });

  it('rejects an unknown top-level prompt field', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        prompt: 'private prompt content',
      }),
    ).toThrow('unknown field');
  });

  it('rejects hidden output inside a direct report row', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: [{ surfaceId: 'chat', report: { output: 'private model output' } }],
      }),
    ).toThrow('unknown field');
  });

  it('rejects hidden credential material inside a native proof row', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        nativeProofs: [
          {
            surfaceId: 'chat',
            evidenceId: 'proof-1',
            recordedAt: '2026-08-22T12:00:00.000Z',
            commitSha: '0123456789abcdef0123456789abcdef01234567',
            runtimeGeneration: 'generation-1',
            officialDesktop: true,
            productionDispatcherBound: true,
            exactExecutionIdentityObserved: true,
            contextReceiptVerified: true,
            scopeIsolationVerified: true,
            cancellationVerified: true,
            streamingVerified: true,
            noDuplicateDispatchVerified: true,
            credential: 'must-not-be-accepted',
          },
        ],
      }),
    ).toThrow('unknown field');
  });

  it('rejects unsafe control text and oversized collections before evaluation', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        rollbackNotes: 'unsafe\u0000text',
      }),
    ).toThrow('bounded safe text');

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: Array.from({ length: 33 }, () => ({})),
      }),
    ).toThrow('bounded array');
  });

  it('rejects fractional run counts before they can satisfy a minimum', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: [
          {
            surfaceId: 'chat',
            report: {
              sampleCount: 30.5,
              passed: true,
              failures: [],
              baselineMs: { p50: 1, p95: 1, p99: 1 },
              overheadMs: { p50: 0, p95: 0, p99: 0 },
              overheadRatio: { p50: 0, p95: 0, p99: 0 },
              gatewayStageTimingsMs: {
                contextPack: { p50: 0, p95: 0, p99: 0 },
                routeDecision: { p50: 0, p95: 0, p99: 0 },
                queueWait: { p50: 0, p95: 0, p99: 0 },
                dispatch: { p50: 0, p95: 0, p99: 0 },
                adeAdapter: { p50: 0, p95: 0, p99: 0 },
              },
              resources: {
                baseline: {
                  cpuPercent: { p50: 10, p95: 10, p99: 10 },
                  workingSetMiB: { p50: 480, p95: 480, p99: 480 },
                  processCount: { p50: 6, p95: 6, p99: 6 },
                },
                gateway: {
                  cpuPercent: { p50: 12, p95: 12, p99: 12 },
                  workingSetMiB: { p50: 500, p95: 500, p99: 500 },
                  processCount: { p50: 7, p95: 7, p99: 7 },
                },
              },
              lifecycle: {
                baseline: {
                  providerAccepted: { p50: 100, p95: 100, p99: 100 },
                  firstOutput: { p50: 300, p95: 300, p99: 300 },
                  firstVisiblePaint: { p50: 320, p95: 320, p99: 320 },
                  completion: { p50: 900, p95: 900, p99: 900 },
                },
                gateway: {
                  providerAccepted: { p50: 120, p95: 120, p99: 120 },
                  firstOutput: { p50: 320, p95: 320, p99: 320 },
                  firstVisiblePaint: { p50: 340, p95: 340, p99: 340 },
                  completion: { p50: 930, p95: 930, p99: 930 },
                },
              },
              relativeBudgetsMs: { p95: 0.2, p99: 0.2 },
              effectiveBudgetsMs: { p95: 0.2, p99: 0.2 },
            },
          },
        ],
      }),
    ).toThrow('safe integer');
  });

  it('accepts bounded retrieval quality rates without raw corpus content', () => {
    const input = {
      ...incompleteEnvelope(),
      focusedReport: {
        route: 'focused',
        sampleCount: 30,
        passed: true,
        failures: [],
        retrievalMs: { p50: 1, p95: 2, p99: 3, max: 4 },
        candidateCount: { p50: 8, p95: 8, p99: 8, max: 8 },
        hydratedCount: { p50: 5, p95: 5, p99: 5, max: 5 },
        stageTimingsMs: {
          siyuanReady: { p50: 0, p95: 0, p99: 0, max: 0 },
          queueWait: { p50: 0, p95: 0, p99: 0, max: 0 },
          search: { p50: 1, p95: 2, p99: 3, max: 4 },
          evidenceHydration: { p50: 0, p95: 0, p99: 0, max: 0 },
          validationHash: { p50: 0, p95: 0, p99: 0, max: 0 },
        },
        rlmSubqueryCount: { p50: 0, p95: 0, p99: 0, max: 0 },
        quality: {
          topResultAccuracy: 1,
          citationVerificationRate: 1,
          answerRubricPassRate: 1,
        },
      },
    };

    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        focusedReport: {
          ...input.focusedReport,
          quality: { ...input.focusedReport.quality, topResultAccuracy: 1.01 },
        },
      }),
    ).toThrow('must be a rate');

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        focusedReport: {
          ...input.focusedReport,
          quality: { ...input.focusedReport.quality, output: 'private answer' },
        },
      }),
    ).toThrow('unknown field');
  });
});
