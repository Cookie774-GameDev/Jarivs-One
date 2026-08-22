import {
  DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS,
  DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS,
  DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS,
  DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT,
  DIRECT_GATEWAY_STAGE_NAMES,
  type DirectGatewayAcceptanceReport,
} from './contextGatewayAcceptanceMetrics';
import {
  CONTEXT_RETRIEVAL_MINIMUM_RUNS,
  DEEP_RETRIEVAL_HARD_DEADLINE_MS,
  DEEP_RETRIEVAL_P95_LIMIT_MS,
  FOCUSED_RETRIEVAL_P95_LIMIT_MS,
  type ContextRetrievalAcceptanceReport,
} from './contextGatewayRetrievalAcceptance';

export const REQUIRED_CONTEXT_GATEWAY_SURFACES = [
  'chat',
  'ade',
  'terminal:codex',
  'terminal:claude',
  'terminal:opencode',
] as const;

export type ContextGatewaySurfaceId = (typeof REQUIRED_CONTEXT_GATEWAY_SURFACES)[number];

export interface NativeSurfaceProof {
  surfaceId: string;
  evidenceId: string;
  recordedAt: string;
  commitSha: string;
  runtimeGeneration: string;
  officialDesktop: boolean;
  productionDispatcherBound: boolean;
  exactExecutionIdentityObserved: boolean;
  contextReceiptVerified: boolean;
  scopeIsolationVerified: boolean;
  cancellationVerified: boolean;
  streamingVerified: boolean;
  noDuplicateDispatchVerified: boolean;
}

export interface ContextGatewayAcceptanceInput {
  build: {
    commitSha: string;
    buildId: string;
    runtimeGeneration: string;
  };
  directReports: Array<{
    surfaceId: string;
    report: Readonly<DirectGatewayAcceptanceReport>;
  }>;
  focusedReport?: Readonly<ContextRetrievalAcceptanceReport>;
  deepReport?: Readonly<ContextRetrievalAcceptanceReport>;
  nativeProofs: NativeSurfaceProof[];
  featureParityPassed: boolean;
  concurrentScopeIsolationPassed: boolean;
  rollbackNotes: string;
  externalBlockers: Array<{ code: string; recovery: string }>;
}

export type ContextGatewayAcceptanceStatus =
  | 'passed'
  | 'failed'
  | 'incomplete'
  | 'blocked-external';

export interface ContextGatewayAcceptanceEvaluation {
  status: ContextGatewayAcceptanceStatus;
  missing: readonly string[];
  failures: readonly string[];
  externalBlockers: readonly string[];
}

const nativeProofFields = [
  'officialDesktop',
  'productionDispatcherBound',
  'exactExecutionIdentityObserved',
  'contextReceiptVerified',
  'scopeIsolationVerified',
  'cancellationVerified',
  'streamingVerified',
  'noDuplicateDispatchVerified',
] as const satisfies readonly (keyof NativeSurfaceProof)[];

function requireKnownUniqueRows<T extends { surfaceId: string }>(
  rows: readonly T[],
  label: string,
): Map<ContextGatewaySurfaceId, T> {
  const known = new Set<string>(REQUIRED_CONTEXT_GATEWAY_SURFACES);
  const result = new Map<ContextGatewaySurfaceId, T>();
  for (const row of rows) {
    if (!known.has(row.surfaceId)) throw new Error(`unknown ${label} surface: ${row.surfaceId}`);
    const surfaceId = row.surfaceId as ContextGatewaySurfaceId;
    if (result.has(surfaceId)) throw new Error(`duplicate ${label} surface: ${surfaceId}`);
    result.set(surfaceId, row);
  }
  return result;
}

function validDistribution(
  distribution: Readonly<{ p50: number; p95: number; p99: number; max?: number }>,
): boolean {
  const max = distribution.max ?? distribution.p99;
  return (
    [distribution.p50, distribution.p95, distribution.p99, max].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
    distribution.p50 <= distribution.p95 &&
    distribution.p95 <= distribution.p99 &&
    distribution.p99 <= max
  );
}

function directReportPasses(report: Readonly<DirectGatewayAcceptanceReport>): boolean {
  const resourcesPass = (side: 'baseline' | 'gateway'): boolean => {
    const metrics = report.resources[side];
    return (
      validDistribution(metrics.cpuPercent) &&
      validDistribution(metrics.workingSetMiB) &&
      metrics.workingSetMiB.p50 > 0 &&
      validDistribution(metrics.processCount) &&
      [metrics.processCount.p50, metrics.processCount.p95, metrics.processCount.p99].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    );
  };
  return (
    report.passed &&
    report.failures.length === 0 &&
    report.sampleCount >= DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS &&
    validDistribution(report.baselineMs) &&
    report.baselineMs.p50 > 0 &&
    validDistribution(report.overheadMs) &&
    validDistribution(report.overheadRatio) &&
    DIRECT_GATEWAY_STAGE_NAMES.every((stage) =>
      validDistribution(report.gatewayStageTimingsMs[stage]),
    ) &&
    resourcesPass('baseline') &&
    resourcesPass('gateway') &&
    report.overheadRatio.p95 <= DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT &&
    report.overheadRatio.p99 <= DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT &&
    report.overheadMs.p95 <= DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS &&
    report.overheadMs.p99 <= DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS
  );
}

function retrievalReportPasses(
  report: Readonly<ContextRetrievalAcceptanceReport>,
  route: 'focused' | 'deep',
): boolean {
  if (
    report.route !== route ||
    !report.passed ||
    report.failures.length > 0 ||
    report.sampleCount < CONTEXT_RETRIEVAL_MINIMUM_RUNS ||
    !validDistribution(report.retrievalMs) ||
    !validDistribution(report.candidateCount) ||
    !validDistribution(report.hydratedCount) ||
    report.quality.topResultAccuracy !== 1 ||
    report.quality.citationVerificationRate !== 1 ||
    report.quality.answerRubricPassRate !== 1
  ) {
    return false;
  }
  return route === 'focused'
    ? report.retrievalMs.p95 <= FOCUSED_RETRIEVAL_P95_LIMIT_MS
    : report.retrievalMs.p95 <= DEEP_RETRIEVAL_P95_LIMIT_MS &&
        report.retrievalMs.max <= DEEP_RETRIEVAL_HARD_DEADLINE_MS;
}

export function evaluateContextGatewayAcceptance(
  input: Readonly<ContextGatewayAcceptanceInput>,
): Readonly<ContextGatewayAcceptanceEvaluation> {
  const missing: string[] = [];
  const failures: string[] = [];

  const validBuildCommit = /^[0-9a-f]{40}$/i.test(input.build.commitSha);
  const validRuntimeGeneration = input.build.runtimeGeneration.trim().length > 0;
  if (!validBuildCommit) missing.push('build:commitSha');
  if (input.build.buildId.trim().length === 0) missing.push('build:buildId');
  if (!validRuntimeGeneration) missing.push('build:runtimeGeneration');

  const direct = requireKnownUniqueRows(input.directReports, 'direct');
  const native = requireKnownUniqueRows(input.nativeProofs, 'native');
  const nativeEvidenceIds = new Set<string>();
  for (const proof of input.nativeProofs) {
    if (proof.evidenceId.trim().length === 0)
      throw new Error('native evidenceId must be non-empty');
    if (nativeEvidenceIds.has(proof.evidenceId)) {
      throw new Error(`duplicate native evidenceId: ${proof.evidenceId}`);
    }
    nativeEvidenceIds.add(proof.evidenceId);
    const recordedAt = Date.parse(proof.recordedAt);
    if (!Number.isFinite(recordedAt) || new Date(recordedAt).toISOString() !== proof.recordedAt) {
      throw new Error(`native recordedAt must be a canonical ISO timestamp: ${proof.surfaceId}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(proof.commitSha)) {
      throw new Error(`native commitSha must be a full Git SHA: ${proof.surfaceId}`);
    }
    if (proof.runtimeGeneration.trim().length === 0) {
      throw new Error(`native runtimeGeneration must be non-empty: ${proof.surfaceId}`);
    }
  }
  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const directRow = direct.get(surfaceId);
    if (!directRow) missing.push(`direct:${surfaceId}`);
    else if (!directReportPasses(directRow.report)) failures.push(`direct:${surfaceId}`);
  }

  if (!input.focusedReport) missing.push('retrieval:focused');
  else if (input.focusedReport.route !== 'focused') {
    throw new Error('focusedReport must contain the focused route');
  } else if (!retrievalReportPasses(input.focusedReport, 'focused')) {
    failures.push('retrieval:focused');
  }

  if (!input.deepReport) missing.push('retrieval:deep');
  else if (input.deepReport.route !== 'deep') {
    throw new Error('deepReport must contain the deep route');
  } else if (!retrievalReportPasses(input.deepReport, 'deep')) {
    failures.push('retrieval:deep');
  }

  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const proof = native.get(surfaceId);
    if (!proof) {
      missing.push(`native:${surfaceId}`);
      continue;
    }
    if (
      (validBuildCommit && proof.commitSha.toLowerCase() !== input.build.commitSha.toLowerCase()) ||
      (validRuntimeGeneration && proof.runtimeGeneration !== input.build.runtimeGeneration)
    ) {
      failures.push(`native:${surfaceId}:buildBinding`);
    }
    for (const field of nativeProofFields) {
      if (!proof[field]) failures.push(`native:${surfaceId}:${field}`);
    }
  }

  if (!input.featureParityPassed) failures.push('featureParity');
  if (!input.concurrentScopeIsolationPassed) failures.push('concurrentScopeIsolation');
  if (input.rollbackNotes.trim().length === 0) missing.push('rollbackNotes');

  const blockerCodes = new Set<string>();
  for (const blocker of input.externalBlockers) {
    if (blocker.code.trim().length === 0) throw new Error('blocker code must be non-empty');
    if (blocker.recovery.trim().length === 0) throw new Error('blocker recovery must be non-empty');
    if (blockerCodes.has(blocker.code)) throw new Error(`duplicate blocker code: ${blocker.code}`);
    blockerCodes.add(blocker.code);
  }
  const externalBlockers = [...blockerCodes];

  const status: ContextGatewayAcceptanceStatus =
    failures.length > 0
      ? 'failed'
      : missing.length > 0
        ? 'incomplete'
        : externalBlockers.length > 0
          ? 'blocked-external'
          : 'passed';

  return { status, missing, failures, externalBlockers };
}
