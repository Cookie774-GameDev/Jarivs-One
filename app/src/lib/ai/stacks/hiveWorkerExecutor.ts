import type { Agent } from '@/types';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import type {
  JarvisCanonicalLiveProducerEvidence,
  JarvisCanonicalLiveProducerVerifier,
  JarvisCanonicalResultEvidenceV1,
  JarvisEvent,
  JarvisLiveProducerIdentity,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import { canonicalizeJarvisApprovalJson } from '@/lib/jarvis/contracts/execution';
import { runAgent } from '../router';
import type { LLMMessage } from '../types';

type HiveSourceEvidence = Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'hive' }>;
type HiveIdentity = Extract<JarvisLiveProducerIdentity, { producerKind: 'hive' }>;

const HIVE_SOURCE_COMMON_KEYS = [
  'accountId',
  'attemptNumber',
  'observedAt',
  'producerIdentity',
  'producerKind',
  'requestId',
  'resultRef',
  'runId',
  'schemaVersion',
] as const;

function exactKeys(value: object, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function stableIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJarvisApprovalJson(left) === canonicalizeJarvisApprovalJson(right);
  } catch {
    return false;
  }
}

function validHiveIdentity(identity: HiveIdentity): boolean {
  return (
    exactKeys(identity, ['producerKind', 'stackId', 'stepId', 'workerId']) &&
    identity.producerKind === 'hive' &&
    stableIdentifier(identity.stackId) &&
    stableIdentifier(identity.stepId) &&
    stableIdentifier(identity.workerId)
  );
}

function validHiveSource(source: HiveSourceEvidence): boolean {
  const expectedKeys =
    source.phase === 'result'
      ? [...HIVE_SOURCE_COMMON_KEYS, 'phase', 'resultAuthority', 'state']
      : [...HIVE_SOURCE_COMMON_KEYS, 'phase', 'state'];
  const authority = source.phase === 'result' ? source.resultAuthority : undefined;
  return (
    exactKeys(source, expectedKeys) &&
    source.schemaVersion === 1 &&
    source.producerKind === 'hive' &&
    validHiveIdentity(source.producerIdentity) &&
    stableIdentifier(source.accountId) &&
    stableIdentifier(source.runId) &&
    stableIdentifier(source.requestId) &&
    source.attemptNumber === 1 &&
    stableIdentifier(source.resultRef) &&
    Number.isFinite(source.observedAt) &&
    (source.phase === 'start'
      ? source.state === 'started'
      : (source.state === 'completed' || source.state === 'degraded') &&
        source.resultRef.startsWith('jresult_') &&
        authority !== undefined &&
        exactKeys(authority, ['eventSeq', 'evidenceRef', 'runId']) &&
        stableIdentifier(authority.runId) &&
        Number.isSafeInteger(authority.eventSeq) &&
        authority.eventSeq > 0 &&
        stableIdentifier(authority.evidenceRef) &&
        authority.evidenceRef.startsWith('jresult_'))
  );
}

function hiveSourceForEvent(event: JarvisEvent | undefined): HiveSourceEvidence | null {
  const source = event?.producerSourceEvidence;
  if (!source || source.producerKind !== 'hive' || !validHiveSource(source)) return null;
  return source;
}

function validHiveEvidence(evidence: JarvisCanonicalLiveProducerEvidence<'hive'>): boolean {
  return (
    exactKeys(evidence, [
      'accountId',
      'attemptNumber',
      'producerIdentity',
      'producerKind',
      'requestId',
      'resultEventSeq',
      'resultRef',
      'runId',
      'schemaVersion',
      'state',
      'verifiedAt',
    ]) &&
    evidence.schemaVersion === 1 &&
    evidence.producerKind === 'hive' &&
    validHiveIdentity(evidence.producerIdentity) &&
    stableIdentifier(evidence.accountId) &&
    stableIdentifier(evidence.runId) &&
    stableIdentifier(evidence.requestId) &&
    evidence.attemptNumber === 1 &&
    Number.isSafeInteger(evidence.resultEventSeq) &&
    evidence.resultEventSeq > 0 &&
    stableIdentifier(evidence.resultRef) &&
    Number.isFinite(evidence.verifiedAt) &&
    (evidence.state === 'busy' || evidence.state === 'completed' || evidence.state === 'degraded')
  );
}

function hiveSourceOwnsEvidence(
  source: HiveSourceEvidence,
  evidence: JarvisCanonicalLiveProducerEvidence<'hive'>,
): boolean {
  return (
    source.accountId === evidence.accountId &&
    source.runId === evidence.runId &&
    source.requestId === evidence.requestId &&
    source.attemptNumber === evidence.attemptNumber &&
    sameCanonicalValue(source.producerIdentity, evidence.producerIdentity)
  );
}

function validHiveCanonicalResult(result: JarvisCanonicalResultEvidenceV1): boolean {
  return (
    exactKeys(result, [
      'accountId',
      'attemptNumber',
      'kind',
      'observedAt',
      'parentRunId',
      'requestId',
      'resultRef',
      'runId',
      'schemaVersion',
      'state',
      'stepId',
    ]) &&
    result.schemaVersion === 1 &&
    result.kind === 'hive_child_provider_result' &&
    stableIdentifier(result.accountId) &&
    stableIdentifier(result.runId) &&
    stableIdentifier(result.requestId) &&
    result.attemptNumber === 1 &&
    stableIdentifier(result.parentRunId) &&
    stableIdentifier(result.stepId) &&
    (result.state === 'completed' || result.state === 'degraded') &&
    stableIdentifier(result.resultRef) &&
    result.resultRef.startsWith('jresult_') &&
    Number.isFinite(result.observedAt)
  );
}

function hivePlanOwnsChild(input: {
  parent: JarvisRun;
  child: JarvisRun;
  identity: HiveIdentity;
  accountId: string;
}): boolean {
  const plan = input.parent.hiveStackPlan;
  if (
    !plan ||
    plan.schemaVersion !== 1 ||
    plan.accountId !== input.accountId ||
    plan.parentRunId !== input.parent.id ||
    plan.stackId !== input.identity.stackId ||
    input.child.accountId !== input.accountId ||
    input.child.parentRunId !== input.parent.id ||
    input.child.source !== 'hive_final'
  ) {
    return false;
  }
  const steps = plan.steps.filter((candidate) => candidate.stepId === input.identity.stepId);
  if (steps.length !== 1) return false;
  const step = steps[0]!;
  return (
    step.schemaVersion === 1 &&
    step.workerId === input.identity.workerId &&
    input.child.agentId === step.agent.id &&
    sameCanonicalValue(input.child.model, step.model)
  );
}

function hiveTerminalStatusOwnsState(status: string | undefined, state: 'completed' | 'degraded') {
  return state === 'completed'
    ? status === 'completed'
    : status === 'failed' || status === 'cancelled';
}

function childRunIdFromHiveStartRef(resultRef: string): string | null {
  if (!resultRef.startsWith('jstart_')) return null;
  const childRunId = resultRef.slice('jstart_'.length);
  return stableIdentifier(childRunId) && childRunId.startsWith('jrun_') ? childRunId : null;
}

/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisHiveLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): JarvisCanonicalLiveProducerVerifier<'hive'> {
  return Object.freeze({
    async verify(evidence: JarvisCanonicalLiveProducerEvidence<'hive'>) {
      try {
        if (!validHiveEvidence(evidence)) return null;
        const sourceRun = await input.runs.getById(evidence.accountId, evidence.runId);
        if (
          !sourceRun ||
          sourceRun.id !== evidence.runId ||
          sourceRun.accountId !== evidence.accountId
        ) {
          return null;
        }
        const target = await input.events.getBySeq(
          evidence.accountId,
          evidence.runId,
          evidence.resultEventSeq,
        );
        const source = hiveSourceForEvent(target);
        if (
          !target ||
          target.runId !== evidence.runId ||
          !source ||
          !hiveSourceOwnsEvidence(source, evidence) ||
          target.canonicalResultEvidence !== undefined
        ) {
          return null;
        }

        if (evidence.state === 'busy') {
          const childRunId = childRunIdFromHiveStartRef(source.resultRef);
          if (!childRunId) return null;
          const child = await input.runs.getById(evidence.accountId, childRunId);
          if (
            !child ||
            child.id !== childRunId ||
            child.accountId !== evidence.accountId ||
            !hivePlanOwnsChild({
              parent: sourceRun,
              child,
              identity: evidence.producerIdentity,
              accountId: evidence.accountId,
            }) ||
            target.type !== 'model' ||
            target.status !== 'running' ||
            source.phase !== 'start' ||
            source.state !== 'started' ||
            source.resultRef !== evidence.resultRef ||
            source.observedAt !== evidence.verifiedAt
          ) {
            return null;
          }
          return Object.freeze(structuredClone(evidence));
        }

        if (
          target.type !== 'model' ||
          source.phase !== 'result' ||
          source.state !== evidence.state ||
          source.resultRef !== evidence.resultRef ||
          source.observedAt !== evidence.verifiedAt ||
          !hiveTerminalStatusOwnsState(target.status, evidence.state)
        ) {
          return null;
        }
        const authority = source.resultAuthority;
        if (
          !authority ||
          authority.runId === evidence.runId ||
          authority.eventSeq >= evidence.resultEventSeq ||
          authority.evidenceRef !== evidence.resultRef
        ) {
          return null;
        }
        const child = await input.runs.getById(evidence.accountId, authority.runId);
        if (
          !child ||
          child.id !== authority.runId ||
          child.accountId !== evidence.accountId ||
          child.parentRunId !== evidence.runId ||
          !hivePlanOwnsChild({
            parent: sourceRun,
            child,
            identity: evidence.producerIdentity,
            accountId: evidence.accountId,
          })
        ) {
          return null;
        }
        const authorityRow = await input.events.getBySeq(
          evidence.accountId,
          authority.runId,
          authority.eventSeq,
        );
        const canonical = authorityRow?.canonicalResultEvidence;
        if (
          !authorityRow ||
          authorityRow.runId !== authority.runId ||
          authorityRow.seq !== authority.eventSeq ||
          authorityRow.type !== 'run_state' ||
          authorityRow.status !== target.status ||
          authorityRow.producerSourceEvidence !== undefined ||
          !canonical ||
          !validHiveCanonicalResult(canonical) ||
          canonical.accountId !== evidence.accountId ||
          canonical.runId !== child.id ||
          canonical.requestId !== evidence.requestId ||
          canonical.attemptNumber !== evidence.attemptNumber ||
          canonical.parentRunId !== evidence.runId ||
          canonical.stepId !== evidence.producerIdentity.stepId ||
          canonical.state !== evidence.state ||
          canonical.resultRef !== evidence.resultRef ||
          canonical.observedAt !== evidence.verifiedAt
        ) {
          return null;
        }
        return Object.freeze(structuredClone(evidence));
      } catch {
        return null;
      }
    },
  });
}

export type JarvisHiveWorkerNativeResult = Readonly<{
  status: 'completed' | 'failed' | 'cancelled';
  providerId: string;
  modelId: string;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  errorCategory?: string;
  observedAt: number;
}>;

export type JarvisHiveWorkerExecutionInput = Readonly<{
  agent: Agent;
  messages: readonly LLMMessage[];
  signal: AbortSignal;
  connectionId?: string;
  workingDirectory?: string;
}>;

export interface JarvisHiveWorkerExecutor {
  execute(input: JarvisHiveWorkerExecutionInput): Promise<JarvisHiveWorkerNativeResult>;
}

export function createJarvisHiveWorkerExecutor(input?: {
  now?: () => number;
}): JarvisHiveWorkerExecutor {
  const now = input?.now ?? Date.now;
  return Object.freeze({
    async execute(workerInput: JarvisHiveWorkerExecutionInput) {
      const providerId = String(workerInput.agent.model.provider);
      const modelId = workerInput.agent.model.model;
      try {
        const response = await runAgent({
          agent: workerInput.agent,
          messages: [...workerInput.messages],
          signal: workerInput.signal,
          ...(workerInput.connectionId === undefined
            ? {}
            : { connectionId: workerInput.connectionId }),
          ...(workerInput.workingDirectory === undefined
            ? {}
            : { workingDirectory: workerInput.workingDirectory }),
        });
        if (String(response.provider) !== providerId || response.model !== modelId) {
          throw new Error('hive_worker_provider_binding_mismatch');
        }
        return Object.freeze({
          status: 'completed' as const,
          providerId,
          modelId,
          text: response.text,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: response.usage.cost_usd,
          observedAt: now(),
        });
      } catch (error) {
        const cancelled = error instanceof DOMException && error.name === 'AbortError';
        return Object.freeze({
          status: cancelled ? ('cancelled' as const) : ('failed' as const),
          providerId,
          modelId,
          errorCategory: cancelled ? 'cancelled' : 'provider_error',
          observedAt: now(),
        });
      }
    },
  });
}
