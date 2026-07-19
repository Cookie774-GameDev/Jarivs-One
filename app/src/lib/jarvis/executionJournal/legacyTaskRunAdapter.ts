import type {
  JarvisArtifactV1,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisRun,
  JarvisRunStatus,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisTaskRunStatus } from '@/features/jarvis-runs/taskRunStore';

const MAX_PROJECTION_ITEMS = 500;
const RETRY_AVAILABLE_SUMMARY = 'Transport retry available.';

export type JarvisTaskRunProjection = {
  canonical: boolean;
  runId: string;
  chatId?: string;
  status: JarvisTaskRunStatus;
  goal: string;
  userVisibleSummary: string;
  progress: number;
  activeAgents: readonly string[];
  activeTerminals: readonly string[];
  updatedAt: string;
  cancellable: boolean;
  transportRetryAvailable: boolean;
  transportRetryAttemptNumber?: number;
};

function orderedEvents(run: JarvisRun, events: readonly JarvisEvent[]): JarvisEvent[] {
  return events
    .filter((event) => event.runId === run.id)
    .sort((left, right) => left.seq - right.seq || left.createdAt - right.createdAt)
    .slice(-MAX_PROJECTION_ITEMS);
}

function orderedArtifacts(
  run: JarvisRun,
  artifacts: readonly JarvisArtifactV1[],
): JarvisArtifactV1[] {
  return artifacts
    .filter((artifact) => artifact.runId === run.id)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .slice(-MAX_PROJECTION_ITEMS);
}

function safeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function legacyStatus(status: JarvisRunStatus): JarvisTaskRunStatus {
  switch (status) {
    case 'queued':
    case 'compiling':
      return 'planning';
    case 'running':
      return 'running';
    case 'awaiting_approval':
      return 'waiting-for-approval';
    case 'partial':
      return 'waiting-for-input';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'timed_out':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

function defaultSummary(status: JarvisRunStatus): string {
  switch (status) {
    case 'queued':
      return 'Jarvis task queued.';
    case 'compiling':
      return 'Preparing the Jarvis task.';
    case 'running':
      return 'Jarvis task is running.';
    case 'awaiting_approval':
      return 'Approval is required.';
    case 'partial':
      return 'Jarvis task needs input.';
    case 'completed':
      return 'Jarvis task completed.';
    case 'failed':
      return 'Jarvis task failed.';
    case 'timed_out':
      return 'Jarvis task timed out.';
    case 'cancelled':
      return 'Jarvis task cancelled.';
  }
}

function projectionProgress(status: JarvisRunStatus, events: readonly JarvisEvent[]): number {
  if (['partial', 'completed', 'failed', 'cancelled', 'timed_out'].includes(status)) return 100;
  if (status === 'queued' && events.length === 0) return 0;
  const floor = status === 'compiling' ? 10 : status === 'queued' ? 5 : 15;
  const ceiling = status === 'awaiting_approval' ? 90 : 95;
  return Math.min(ceiling, floor + events.length * 8);
}

function activeOwner(
  evidence: JarvisDurableLiveEvidenceV1,
): { collection: 'agents' | 'terminals'; id: string } | undefined {
  const identity = evidence.producerIdentity;
  switch (identity.producerKind) {
    case 'provider':
      return { collection: 'agents', id: `${identity.providerId}:${identity.modelId}` };
    case 'hive':
      return { collection: 'agents', id: identity.workerId };
    case 'terminal':
      return { collection: 'terminals', id: identity.sessionId };
    default:
      return undefined;
  }
}

function collectActiveOwners(
  run: JarvisRun,
  events: readonly JarvisEvent[],
): { activeAgents: readonly string[]; activeTerminals: readonly string[] } {
  const agents = new Map<string, string>();
  const terminals = new Map<string, string>();
  for (const event of events) {
    const evidence = event.liveEvidence;
    if (!evidence || evidence.accountId !== run.accountId || evidence.runId !== run.id) continue;
    const owner = activeOwner(evidence);
    if (!owner) continue;
    const collection = owner.collection === 'agents' ? agents : terminals;
    if (evidence.transition === 'completed' || evidence.transition === 'degraded') {
      collection.delete(owner.id);
    } else {
      collection.set(owner.id, owner.id);
    }
  }
  return {
    activeAgents: Object.freeze([...agents.values()].slice(-MAX_PROJECTION_ITEMS)),
    activeTerminals: Object.freeze([...terminals.values()].slice(-MAX_PROJECTION_ITEMS)),
  };
}

function retryableScheduleAttempt(run: JarvisRun) {
  if (run.status !== 'running' || run.source !== 'schedule') return undefined;
  const attempts = [...(run.transportAttempts ?? [])].sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  );
  const latest = attempts.at(-1);
  return latest?.state === 'retryable_failed' ? latest : undefined;
}

function isoTimestamp(value: number): string {
  return new Date(Number.isFinite(value) ? value : 0).toISOString();
}

export function projectJarvisRunForLegacyUi(input: {
  run: JarvisRun;
  events: readonly JarvisEvent[];
  artifacts: readonly JarvisArtifactV1[];
}): JarvisTaskRunProjection {
  const events = orderedEvents(input.run, input.events);
  const artifacts = orderedArtifacts(input.run, input.artifacts);
  const retryAttempt = retryableScheduleAttempt(input.run);
  const activeOwners = collectActiveOwners(input.run, events);
  const safeCandidates = [
    ...events.map((event) => ({ createdAt: event.createdAt, value: safeText(event.safeSummary) })),
    ...artifacts.map((artifact) => ({
      createdAt: artifact.createdAt,
      value: safeText(artifact.safeSummary),
    })),
  ].filter((candidate): candidate is { createdAt: number; value: string } =>
    Boolean(candidate.value),
  );
  safeCandidates.sort((left, right) => left.createdAt - right.createdAt);
  const goal =
    events.map((event) => safeText(event.safeSummary)).find(Boolean) ??
    artifacts.map((artifact) => safeText(artifact.safeSummary)).find(Boolean) ??
    'Jarvis task';
  const summary = retryAttempt
    ? RETRY_AVAILABLE_SUMMARY
    : (safeCandidates.at(-1)?.value ?? defaultSummary(input.run.status));
  const status = retryAttempt ? 'waiting-for-input' : legacyStatus(input.run.status);
  const cancellable =
    !retryAttempt &&
    ['queued', 'compiling', 'running', 'awaiting_approval'].includes(input.run.status);

  return Object.freeze({
    canonical: true,
    runId: input.run.id,
    ...(input.run.chatId ? { chatId: input.run.chatId } : {}),
    status,
    goal,
    userVisibleSummary: summary,
    progress: projectionProgress(input.run.status, events),
    ...activeOwners,
    updatedAt: isoTimestamp(input.run.updatedAt),
    cancellable,
    transportRetryAvailable: Boolean(retryAttempt),
    ...(retryAttempt ? { transportRetryAttemptNumber: retryAttempt.attemptNumber } : {}),
  });
}
