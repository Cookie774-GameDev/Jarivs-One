import { describe, expect, it } from 'vitest';

import type { ExecutionIdentity } from './contextGatewayContracts';
import {
  buildDirectGatewayAcceptanceReport,
  type DirectGatewayPair,
} from './contextGatewayAcceptanceMetrics';

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

function pairs(overrides: Partial<DirectGatewayPair> = {}): DirectGatewayPair[] {
  return Array.from({ length: 30 }, (_, index) => {
    const gatewayOverheadMs = overrides.gatewayOverheadMs ?? 100 + index;
    return {
      pairId: `pair-${index}`,
      baselineId: `baseline-${index}`,
      gatewayReceiptId: `receipt-${index}`,
      harnessId: 'vibespace-chat',
      promptHash: 'sha256:prompt',
      sourceRevision: 'revision-1',
      scopeKey: 'account/workspace/project/worktree',
      route: 'direct' as const,
      warm: true,
      baselineExecutionIdentity: identity,
      gatewayExecutionIdentity: identity,
      baselineResourceMetrics: { cpuPercent: 12, workingSetMiB: 480, processCount: 6 },
      gatewayResourceMetrics: { cpuPercent: 14, workingSetMiB: 500, processCount: 7 },
      baselineMs: 1_000 + index,
      ...overrides,
      gatewayOverheadMs,
      gatewayStageTimingsMs: overrides.gatewayStageTimingsMs ?? {
        contextPack: 0,
        routeDecision: gatewayOverheadMs,
        queueWait: 0,
        dispatch: 0,
        adeAdapter: 0,
      },
    };
  });
}

describe('buildDirectGatewayAcceptanceReport', () => {
  it('passes thirty comparable warm direct pairs within both relative and absolute budgets', () => {
    const report = buildDirectGatewayAcceptanceReport(pairs());

    expect(report.sampleCount).toBe(30);
    expect(report.passed).toBe(true);
    expect(report.overheadMs.p95).toBe(128);
    expect(report.overheadMs.p99).toBe(129);
    expect(report.gatewayStageTimingsMs.routeDecision.p95).toBe(128);
    expect(report.resources.gateway.workingSetMiB.p95).toBe(500);
    expect(report.resources.baseline.processCount.p99).toBe(6);
    expect(report.relativeBudgetsMs.p95).toBeCloseTo(205.6);
    expect(report.relativeBudgetsMs.p99).toBeCloseTo(205.8);
    expect(report.effectiveBudgetsMs.p95).toBe(150);
    expect(report.effectiveBudgetsMs.p99).toBeCloseTo(205.8);
  });

  it('fails when the relative p95 budget is exceeded even below the absolute cap', () => {
    const samples = pairs({ baselineMs: 100, gatewayOverheadMs: 21 });
    samples[29] = { ...samples[29], baselineMs: 1_000 };
    const report = buildDirectGatewayAcceptanceReport(samples);

    expect(report.passed).toBe(false);
    expect(report.effectiveBudgetsMs.p95).toBe(20);
    expect(report.failures).toEqual(['p95-relative', 'p99-relative']);
  });

  it('fails the absolute p95 budget even when the relative allowance is larger', () => {
    const report = buildDirectGatewayAcceptanceReport(
      pairs({ baselineMs: 2_000, gatewayOverheadMs: 151 }),
    );

    expect(report.passed).toBe(false);
    expect(report.effectiveBudgetsMs.p95).toBe(150);
    expect(report.failures).toEqual(['p95-absolute']);
  });

  it('uses paired ratios so unrelated slow baselines cannot hide a p99 regression', () => {
    const samples = pairs({ baselineMs: 1_000, gatewayOverheadMs: 0 });
    samples[29] = {
      ...samples[29],
      baselineMs: 1,
      gatewayOverheadMs: 1,
      gatewayStageTimingsMs: { ...samples[29].gatewayStageTimingsMs, routeDecision: 1 },
    };

    const report = buildDirectGatewayAcceptanceReport(samples);

    expect(report.passed).toBe(false);
    expect(report.overheadRatio.p95).toBe(0);
    expect(report.overheadRatio.p99).toBe(1);
    expect(report.failures).toEqual(['p99-relative']);
  });

  it.each([
    ['too few pairs', pairs().slice(0, 29)],
    ['cold samples', pairs({ warm: false })],
    ['non-direct samples', pairs({ route: 'focused' })],
    ['zero baselines', pairs({ baselineMs: 0 })],
    ['negative overhead', pairs({ gatewayOverheadMs: -1 })],
    ['non-finite timings', pairs({ gatewayOverheadMs: Number.NaN })],
    [
      'negative baseline CPU',
      pairs({ baselineResourceMetrics: { cpuPercent: -1, workingSetMiB: 480, processCount: 6 } }),
    ],
    [
      'zero Gateway memory',
      pairs({ gatewayResourceMetrics: { cpuPercent: 14, workingSetMiB: 0, processCount: 7 } }),
    ],
    [
      'fractional process count',
      pairs({ gatewayResourceMetrics: { cpuPercent: 14, workingSetMiB: 500, processCount: 7.5 } }),
    ],
  ])('rejects %s rather than publishing an acceptance result', (_label, samples) => {
    expect(() => buildDirectGatewayAcceptanceReport(samples)).toThrow();
  });

  it('rejects duplicate pair, baseline, or receipt identities', () => {
    for (const field of ['pairId', 'baselineId', 'gatewayReceiptId'] as const) {
      const samples = pairs();
      samples[1] = { ...samples[1], [field]: samples[0][field] };
      expect(() => buildDirectGatewayAcceptanceReport(samples)).toThrow(field);
    }
  });

  it.each([
    ['harnessId', 'terminal-codex'],
    ['promptHash', 'sha256:different'],
    ['sourceRevision', 'revision-2'],
    ['scopeKey', 'other/scope'],
  ] as const)('rejects mixed %s values', (field, value) => {
    const samples = pairs();
    samples[29] = { ...samples[29], [field]: value };
    expect(() => buildDirectGatewayAcceptanceReport(samples)).toThrow(field);
  });

  it('rejects mixed exact execution identities', () => {
    const samples = pairs();
    samples[29] = {
      ...samples[29],
      baselineExecutionIdentity: { ...identity, upstreamModelId: 'different-model' },
      gatewayExecutionIdentity: { ...identity, upstreamModelId: 'different-model' },
    };

    expect(() => buildDirectGatewayAcceptanceReport(samples)).toThrow('baselineExecutionIdentity');
  });

  it('rejects a baseline and Gateway pair whose exact identities disagree', () => {
    expect(() =>
      buildDirectGatewayAcceptanceReport(
        pairs({
          baselineExecutionIdentity: identity,
          gatewayExecutionIdentity: { ...identity, fastVariant: 'standard' },
        }),
      ),
    ).toThrow('baseline and Gateway execution identities');
  });

  it('rejects Gateway overhead that does not reconcile to its local stage timings', () => {
    expect(() =>
      buildDirectGatewayAcceptanceReport(
        pairs({
          gatewayOverheadMs: 100,
          gatewayStageTimingsMs: {
            contextPack: 10,
            routeDecision: 10,
            queueWait: 10,
            dispatch: 10,
            adeAdapter: 10,
          },
        }),
      ),
    ).toThrow('gatewayStageTimingsMs');
  });

  it('rejects acceptance evidence without an observed provider identity', () => {
    expect(() =>
      buildDirectGatewayAcceptanceReport(
        pairs({
          gatewayExecutionIdentity: { ...identity, observedProviderIdentity: undefined },
        }),
      ),
    ).toThrow('gatewayExecutionIdentity.observedProviderIdentity');
  });
});
