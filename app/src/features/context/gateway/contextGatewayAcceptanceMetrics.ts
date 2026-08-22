import type { ContextRoute, ExecutionIdentity } from './contextGatewayContracts';

export const DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS = 30;
export const DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT = 0.2;
export const DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS = 150;
export const DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS = 250;

export interface DirectGatewayPair {
  pairId: string;
  baselineId: string;
  gatewayReceiptId: string;
  harnessId: string;
  promptHash: string;
  sourceRevision: string;
  scopeKey: string;
  route: ContextRoute;
  warm: boolean;
  executionIdentity: Readonly<ExecutionIdentity>;
  /** Comparable same-harness/provider time with the VibeSpace Gateway boundary removed. */
  baselineMs: number;
  /** VibeSpace-owned warm overhead only; provider/network/model time must be excluded. */
  gatewayOverheadMs: number;
}

export type DirectGatewayAcceptanceFailure =
  | 'p95-relative'
  | 'p95-absolute'
  | 'p99-relative'
  | 'p99-absolute';

export interface DirectGatewayAcceptanceReport {
  sampleCount: number;
  passed: boolean;
  failures: readonly DirectGatewayAcceptanceFailure[];
  baselineMs: Readonly<{ p50: number; p95: number; p99: number }>;
  overheadMs: Readonly<{ p50: number; p95: number; p99: number }>;
  overheadRatio: Readonly<{ p50: number; p95: number; p99: number }>;
  relativeBudgetsMs: Readonly<{ p95: number; p99: number }>;
  effectiveBudgetsMs: Readonly<{ p95: number; p99: number }>;
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

function executionIdentityKey(identity: Readonly<ExecutionIdentity>): string {
  const values = identityFields.map((field) => {
    const value = identity[field];
    if (field !== 'observedProviderIdentity' || value !== undefined) {
      requireNonEmpty(value ?? '', `executionIdentity.${field}`);
    }
    return value ?? null;
  });
  return JSON.stringify(values);
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function distribution(values: readonly number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
  };
}

function requireUnique(
  pairs: readonly Readonly<DirectGatewayPair>[],
  field: 'pairId' | 'baselineId' | 'gatewayReceiptId',
): void {
  const values = new Set<string>();
  for (const pair of pairs) {
    requireNonEmpty(pair[field], field);
    if (values.has(pair[field])) throw new Error(`${field} must be unique`);
    values.add(pair[field]);
  }
}

function requireComparable(pairs: readonly Readonly<DirectGatewayPair>[]): void {
  if (pairs.length < DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS) {
    throw new Error(`at least ${DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS} paired warm runs are required`);
  }

  requireUnique(pairs, 'pairId');
  requireUnique(pairs, 'baselineId');
  requireUnique(pairs, 'gatewayReceiptId');

  const first = pairs[0];
  const comparableFields = ['harnessId', 'promptHash', 'sourceRevision', 'scopeKey'] as const;
  for (const field of comparableFields) requireNonEmpty(first[field], field);
  const expectedIdentity = executionIdentityKey(first.executionIdentity);

  for (const pair of pairs) {
    if (!pair.warm) throw new Error('warm must be true');
    if (pair.route !== 'direct') throw new Error('route must be direct');
    if (!Number.isFinite(pair.baselineMs) || pair.baselineMs <= 0) {
      throw new Error('baselineMs must be finite and greater than zero');
    }
    if (!Number.isFinite(pair.gatewayOverheadMs) || pair.gatewayOverheadMs < 0) {
      throw new Error('gatewayOverheadMs must be finite and non-negative');
    }
    for (const field of comparableFields) {
      requireNonEmpty(pair[field], field);
      if (pair[field] !== first[field]) throw new Error(`${field} must be identical across pairs`);
    }
    if (executionIdentityKey(pair.executionIdentity) !== expectedIdentity) {
      throw new Error('executionIdentity must be identical across pairs');
    }
  }
}

export function buildDirectGatewayAcceptanceReport(
  pairs: readonly Readonly<DirectGatewayPair>[],
): Readonly<DirectGatewayAcceptanceReport> {
  requireComparable(pairs);

  const baselineMs = distribution(pairs.map((pair) => pair.baselineMs));
  const overheadMs = distribution(pairs.map((pair) => pair.gatewayOverheadMs));
  const overheadRatio = distribution(pairs.map((pair) => pair.gatewayOverheadMs / pair.baselineMs));
  const relativeBudgetsMs = {
    p95: baselineMs.p95 * DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT,
    p99: baselineMs.p99 * DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT,
  };
  const effectiveBudgetsMs = {
    p95: Math.min(relativeBudgetsMs.p95, DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS),
    p99: Math.min(relativeBudgetsMs.p99, DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS),
  };
  const failures: DirectGatewayAcceptanceFailure[] = [];

  if (overheadRatio.p95 > DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT) {
    failures.push('p95-relative');
  }
  if (overheadMs.p95 > DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS) failures.push('p95-absolute');
  if (overheadRatio.p99 > DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT) {
    failures.push('p99-relative');
  }
  if (overheadMs.p99 > DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS) failures.push('p99-absolute');

  return {
    sampleCount: pairs.length,
    passed: failures.length === 0,
    failures,
    baselineMs,
    overheadMs,
    overheadRatio,
    relativeBudgetsMs,
    effectiveBudgetsMs,
  };
}
