import { describe, expect, it } from 'vitest';

import type { DirectGatewayAcceptanceReport } from './contextGatewayAcceptanceMetrics';
import {
  evaluateContextGatewayAcceptance,
  REQUIRED_CONTEXT_GATEWAY_SURFACES,
  type ContextGatewayAcceptanceInput,
  type NativeSurfaceProof,
} from './contextGatewayAcceptanceSuite';
import type { ContextRetrievalAcceptanceReport } from './contextGatewayRetrievalAcceptance';

const directReport: DirectGatewayAcceptanceReport = {
  sampleCount: 30,
  passed: true,
  failures: [],
  baselineMs: { p50: 1_000, p95: 1_100, p99: 1_200 },
  overheadMs: { p50: 100, p95: 120, p99: 130 },
  overheadRatio: { p50: 0.1, p95: 0.11, p99: 0.12 },
  gatewayStageTimingsMs: {
    contextPack: { p50: 20, p95: 20, p99: 20 },
    routeDecision: { p50: 20, p95: 20, p99: 20 },
    queueWait: { p50: 0, p95: 0, p99: 0 },
    dispatch: { p50: 60, p95: 80, p99: 90 },
    adeAdapter: { p50: 0, p95: 0, p99: 0 },
  },
  relativeBudgetsMs: { p95: 220, p99: 240 },
  effectiveBudgetsMs: { p95: 150, p99: 240 },
};

const focusedReport: ContextRetrievalAcceptanceReport = {
  route: 'focused',
  sampleCount: 30,
  passed: true,
  failures: [],
  retrievalMs: { p50: 1_000, p95: 2_000, p99: 2_200, max: 2_300 },
  candidateCount: { p50: 8, p95: 8, p99: 8, max: 8 },
  hydratedCount: { p50: 5, p95: 5, p99: 5, max: 5 },
};

const deepReport: ContextRetrievalAcceptanceReport = {
  ...focusedReport,
  route: 'deep',
  retrievalMs: { p50: 2_000, p95: 5_000, p99: 6_000, max: 7_000 },
};

function nativeProof(surfaceId: string): NativeSurfaceProof {
  return {
    surfaceId,
    evidenceId: `native-proof:${surfaceId}`,
    recordedAt: '2026-08-22T12:00:00.000Z',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    runtimeGeneration: 'generation-42',
    officialDesktop: true,
    productionDispatcherBound: true,
    exactExecutionIdentityObserved: true,
    contextReceiptVerified: true,
    scopeIsolationVerified: true,
    cancellationVerified: true,
    streamingVerified: true,
    noDuplicateDispatchVerified: true,
  };
}

function completeInput(): ContextGatewayAcceptanceInput {
  return {
    build: {
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      buildId: 'vibespace-native-20260822',
      runtimeGeneration: 'generation-42',
    },
    directReports: REQUIRED_CONTEXT_GATEWAY_SURFACES.map((surfaceId) => ({
      surfaceId,
      report: directReport,
    })),
    focusedReport,
    deepReport,
    nativeProofs: REQUIRED_CONTEXT_GATEWAY_SURFACES.map(nativeProof),
    featureParityPassed: true,
    concurrentScopeIsolationPassed: true,
    rollbackNotes: 'Disable the unified route and retain journals and saved data.',
    externalBlockers: [],
  };
}

describe('evaluateContextGatewayAcceptance', () => {
  it('passes only when the entire required proof matrix is present and passing', () => {
    expect(evaluateContextGatewayAcceptance(completeInput())).toEqual({
      status: 'passed',
      missing: [],
      failures: [],
      externalBlockers: [],
    });
  });

  it('keeps a missing ADE direct report explicitly incomplete', () => {
    const input = completeInput();
    input.directReports = input.directReports.filter(({ surfaceId }) => surfaceId !== 'ade');

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['direct:ade'],
    });
  });

  it('fails when an official native proof exposes an unbound ADE dispatcher', () => {
    const input = completeInput();
    input.nativeProofs = input.nativeProofs.map((proof) =>
      proof.surfaceId === 'ade' ? { ...proof, productionDispatcherBound: false } : proof,
    );

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['native:ade:productionDispatcherBound'],
    });
  });

  it('fails native proof captured from a different commit or runtime generation', () => {
    const input = completeInput();
    input.nativeProofs = input.nativeProofs.map((proof) =>
      proof.surfaceId === 'ade'
        ? { ...proof, commitSha: 'abcdef0123456789abcdef0123456789abcdef01' }
        : proof,
    );

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['native:ade:buildBinding'],
    });
  });

  it('reports a genuine external blocker separately after internal gates pass', () => {
    const input = completeInput();
    input.externalBlockers = [
      { code: 'provider-oauth-401', recovery: 'Use the official account reconnect flow.' },
    ];

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'blocked-external',
      missing: [],
      failures: [],
      externalBlockers: ['provider-oauth-401'],
    });
  });

  it('fails passed-looking direct or retrieval rows whose own report is not passing', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: { ...directReport, passed: false, failures: ['p95-absolute'] },
    };
    input.deepReport = { ...deepReport, passed: false, failures: ['deep-p95'] };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat', 'retrieval:deep'],
    });
  });

  it('revalidates passed-looking report measurements instead of trusting the flag', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: { ...directReport, sampleCount: 29 },
    };
    input.focusedReport = {
      ...focusedReport,
      retrievalMs: { ...focusedReport.retrievalMs, p95: 4_001 },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat', 'retrieval:focused'],
    });
  });

  it('keeps missing exact build or rollback evidence incomplete', () => {
    const input = completeInput();
    input.build = { ...input.build, runtimeGeneration: '' };
    input.rollbackNotes = '  ';

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['build:runtimeGeneration', 'rollbackNotes'],
    });
  });

  it('rejects duplicate or unknown surface rows and malformed blocker metadata', () => {
    const duplicate = completeInput();
    duplicate.directReports = [...duplicate.directReports, duplicate.directReports[0]];
    expect(() => evaluateContextGatewayAcceptance(duplicate)).toThrow('duplicate direct');

    const unknown = completeInput();
    unknown.nativeProofs = [...unknown.nativeProofs, nativeProof('terminal:unknown')];
    expect(() => evaluateContextGatewayAcceptance(unknown)).toThrow('unknown native');

    const malformed = completeInput();
    malformed.externalBlockers = [{ code: '', recovery: 'Reconnect.' }];
    expect(() => evaluateContextGatewayAcceptance(malformed)).toThrow('blocker code');

    const duplicateEvidence = completeInput();
    duplicateEvidence.nativeProofs[1] = {
      ...duplicateEvidence.nativeProofs[1],
      evidenceId: duplicateEvidence.nativeProofs[0].evidenceId,
    };
    expect(() => evaluateContextGatewayAcceptance(duplicateEvidence)).toThrow('native evidenceId');
  });
});
