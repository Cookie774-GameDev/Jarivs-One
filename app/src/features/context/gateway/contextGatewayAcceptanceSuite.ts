import type { DirectGatewayAcceptanceReport } from './contextGatewayAcceptanceMetrics';
import type { ContextRetrievalAcceptanceReport } from './contextGatewayRetrievalAcceptance';

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

export function evaluateContextGatewayAcceptance(
  input: Readonly<ContextGatewayAcceptanceInput>,
): Readonly<ContextGatewayAcceptanceEvaluation> {
  const missing: string[] = [];
  const failures: string[] = [];

  if (!/^[0-9a-f]{40}$/i.test(input.build.commitSha)) missing.push('build:commitSha');
  if (input.build.buildId.trim().length === 0) missing.push('build:buildId');
  if (input.build.runtimeGeneration.trim().length === 0) missing.push('build:runtimeGeneration');

  const direct = requireKnownUniqueRows(input.directReports, 'direct');
  const native = requireKnownUniqueRows(input.nativeProofs, 'native');
  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const directRow = direct.get(surfaceId);
    if (!directRow) missing.push(`direct:${surfaceId}`);
    else if (!directRow.report.passed) failures.push(`direct:${surfaceId}`);
  }

  if (!input.focusedReport) missing.push('retrieval:focused');
  else if (input.focusedReport.route !== 'focused') {
    throw new Error('focusedReport must contain the focused route');
  } else if (!input.focusedReport.passed) failures.push('retrieval:focused');

  if (!input.deepReport) missing.push('retrieval:deep');
  else if (input.deepReport.route !== 'deep') {
    throw new Error('deepReport must contain the deep route');
  } else if (!input.deepReport.passed) failures.push('retrieval:deep');

  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const proof = native.get(surfaceId);
    if (!proof) {
      missing.push(`native:${surfaceId}`);
      continue;
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
