import type {
  JarvisArtifactV1,
  JarvisEvent,
  JarvisLiveCapabilityCategory,
  JarvisLiveEvidenceSnapshot,
  JarvisLiveSystemNode,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisCommandCenterHandlers, JarvisCommandCenterRetryState } from './types';

const MAX_ITEMS = 500;
const LIVE_CATEGORIES = new Set<JarvisLiveCapabilityCategory>([
  'tool',
  'plugin',
  'mcp',
  'terminal',
  'agent',
  'entitlement',
]);
const MODEL_STATES = new Set(['active', 'completed', 'degraded']);
const MODEL_OPERATIONS = new Set(['generate', 'stream', 'embed']);
const CAPABILITY_STATES = new Set(['ready', 'busy', 'completed', 'degraded']);
const CAPABILITY_OPERATIONS = new Set(['execute', 'cancel', 'inspect']);

function boundedLimit(limit: number): number {
  return Math.min(MAX_ITEMS, Math.max(1, limit));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function selectCurrentRun(
  runs: readonly JarvisRun[],
  accountId: string,
  chatId: string,
): JarvisRun | undefined {
  return runs
    .filter((run) => run.accountId === accountId && run.chatId === chatId)
    .reduce<JarvisRun | undefined>((newest, candidate) => {
      if (!newest) return candidate;
      if (candidate.createdAt !== newest.createdAt) {
        return candidate.createdAt > newest.createdAt ? candidate : newest;
      }
      if (candidate.updatedAt !== newest.updatedAt) {
        return candidate.updatedAt > newest.updatedAt ? candidate : newest;
      }
      return candidate.id > newest.id ? candidate : newest;
    }, undefined);
}

export function selectRetryState(run: JarvisRun | undefined): JarvisCommandCenterRetryState {
  if (!run || run.source !== 'schedule') return { kind: 'none' };

  if (run.status === 'running') {
    const latestAttempt = run.transportAttempts?.at(-1);
    if (
      latestAttempt?.schemaVersion === 1 &&
      latestAttempt.state === 'retryable_failed' &&
      Number.isSafeInteger(latestAttempt.attemptNumber) &&
      latestAttempt.attemptNumber > 0
    ) {
      return {
        kind: 'scheduled_transport_available',
        runId: run.id,
        attemptNumber: latestAttempt.attemptNumber,
      };
    }
    return { kind: 'none' };
  }

  if (run.status !== 'failed' && run.status !== 'timed_out' && run.status !== 'cancelled') {
    return { kind: 'none' };
  }
  const retry = run.scheduledRetrySnapshot;
  if (
    !retry ||
    retry.schemaVersion !== 1 ||
    retry.accountId !== run.accountId ||
    retry.request.accountId !== run.accountId ||
    retry.request.runId !== run.id ||
    retry.request.surface !== 'schedule' ||
    !nonEmpty(retry.eventId) ||
    !nonEmpty(retry.occurrenceId) ||
    !Number.isFinite(retry.dueAt) ||
    !Number.isSafeInteger(retry.logicalAttempt) ||
    retry.logicalAttempt < 0
  ) {
    return { kind: 'none' };
  }
  return {
    kind: 'logical_retry_available',
    previousRunId: run.id,
    terminalStatus: run.status,
  };
}

export function canCancelRun(
  run: JarvisRun | undefined,
  retryState: JarvisCommandCenterRetryState,
  handlers: JarvisCommandCenterHandlers,
): boolean {
  return (
    !!run &&
    run.status !== 'partial' &&
    run.status !== 'completed' &&
    run.status !== 'failed' &&
    run.status !== 'cancelled' &&
    run.status !== 'timed_out' &&
    retryState.kind !== 'scheduled_transport_available' &&
    typeof handlers.cancelRun === 'function'
  );
}

export type JarvisCommandCenterRetryAction =
  | { kind: 'none' }
  | {
      kind: 'retry_transport';
      handler: NonNullable<JarvisCommandCenterHandlers['retryScheduledTransport']>;
    }
  | {
      kind: 'retry_logical_run';
      handler: NonNullable<JarvisCommandCenterHandlers['retryLogicalRun']>;
    };

export function selectRetryAction(
  retryState: JarvisCommandCenterRetryState,
  handlers: JarvisCommandCenterHandlers,
): JarvisCommandCenterRetryAction {
  switch (retryState.kind) {
    case 'none':
      return { kind: 'none' };
    case 'scheduled_transport_available':
      return handlers.retryScheduledTransport
        ? { kind: 'retry_transport', handler: handlers.retryScheduledTransport }
        : { kind: 'none' };
    case 'logical_retry_available':
      return handlers.retryLogicalRun
        ? { kind: 'retry_logical_run', handler: handlers.retryLogicalRun }
        : { kind: 'none' };
  }
}

export function selectEvents(
  events: readonly JarvisEvent[],
  runId: string,
  requestedLimit = MAX_ITEMS,
): readonly JarvisEvent[] {
  const bySequence = new Map<number, JarvisEvent>();
  for (const event of events) {
    if (event.runId !== runId || !Number.isSafeInteger(event.seq) || event.seq < 1) continue;
    if (!bySequence.has(event.seq)) bySequence.set(event.seq, event);
  }
  return [...bySequence.values()]
    .sort((left, right) => left.seq - right.seq)
    .slice(0, boundedLimit(requestedLimit));
}

export function selectOutputs(
  artifacts: readonly JarvisArtifactV1[],
  runId: string,
  requestedLimit = MAX_ITEMS,
): readonly JarvisArtifactV1[] {
  return artifacts
    .filter((artifact) => artifact.schemaVersion === 1 && artifact.runId === runId)
    .slice(0, boundedLimit(requestedLimit));
}

function validNode(
  node: JarvisLiveSystemNode,
  snapshot: JarvisLiveEvidenceSnapshot,
  run: JarvisRun,
): boolean {
  if (
    node.accountId !== run.accountId ||
    node.runId !== run.id ||
    !nonEmpty(node.evidenceRef) ||
    !node.evidenceRef.startsWith('jlive_') ||
    node.evidenceRef.length === 'jlive_'.length ||
    !Number.isFinite(node.verifiedAt) ||
    node.verifiedAt < run.createdAt ||
    node.verifiedAt > snapshot.capturedAt ||
    !nonEmpty(node.id)
  ) {
    return false;
  }

  if (node.kind === 'model') {
    return (
      node.id.startsWith('model:') &&
      node.id.length > 'model:'.length &&
      MODEL_STATES.has(node.state) &&
      node.operations.every((operation) => MODEL_OPERATIONS.has(operation)) &&
      nonEmpty(node.providerId) &&
      nonEmpty(node.modelId) &&
      nonEmpty(node.modelSnapshotRef)
    );
  }
  if (node.kind === 'capability') {
    return (
      node.id.startsWith('capability:') &&
      node.id.length > 'capability:'.length &&
      CAPABILITY_STATES.has(node.state) &&
      node.operations.every((operation) => CAPABILITY_OPERATIONS.has(operation)) &&
      LIVE_CATEGORIES.has(node.category) &&
      nonEmpty(node.capabilityId)
    );
  }
  return false;
}

export function isJarvisCommandCenterLiveSnapshotValid(
  snapshot: JarvisLiveEvidenceSnapshot,
  run: JarvisRun,
): boolean {
  return (
    snapshot.schemaVersion === 1 &&
    snapshot.accountId === run.accountId &&
    snapshot.runId === run.id &&
    Number.isFinite(snapshot.capturedAt) &&
    snapshot.capturedAt >= run.createdAt &&
    Array.isArray(snapshot.nodes) &&
    snapshot.nodes.every((node) => validNode(node, snapshot, run))
  );
}

export function selectLiveSystems(
  snapshot: JarvisLiveEvidenceSnapshot | undefined,
  run: JarvisRun,
): readonly JarvisLiveSystemNode[] {
  if (!snapshot || !isJarvisCommandCenterLiveSnapshotValid(snapshot, run)) return [];
  return snapshot.nodes;
}
