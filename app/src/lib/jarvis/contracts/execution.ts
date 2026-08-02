import type { JarvisModelSnapshot } from './capability';
import type { JarvisRequestEnvelope } from './request';
import type { JarvisSourceRef } from './source';

export type JarvisRunStatus =
  | 'queued'
  | 'compiling'
  | 'running'
  | 'awaiting_approval'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export const MAX_JARVIS_SELECTOR_ITEMS = 500 as const;

export type CancellationDelivery =
  | {
      kind: 'queued_tombstoned';
      cancellationRequestId: string;
      ownerId: string;
      queueItemId: string;
    }
  | {
      kind: 'signal_delivered';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'handoff_pending';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'unsupported';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | { kind: 'executor_missing'; cancellationRequestId: string }
  | {
      kind: 'delivery_rejected';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }
  | {
      kind: 'delivery_error';
      cancellationRequestId: string;
      ownerIds: readonly string[];
      safeErrorCategory: string;
    }
  | {
      kind: 'already_terminal';
      terminalStatus: Extract<
        JarvisRunStatus,
        'partial' | 'completed' | 'failed' | 'cancelled' | 'timed_out'
      >;
    };

export type JarvisCancellationAggregate =
  | { kind: 'delivery_pending'; ownerIds: readonly string[] }
  | { kind: 'queued_cancelled'; ownerId: string; queueItemId: string }
  | { kind: 'signal_delivered'; ownerIds: readonly string[] }
  | { kind: 'handoff_pending'; ownerIds: readonly string[] }
  | { kind: 'unsupported'; ownerIds: readonly string[] }
  | { kind: 'executor_missing' }
  | { kind: 'delivery_rejected'; ownerIds: readonly string[] }
  | { kind: 'delivery_error'; ownerIds: readonly string[]; safeErrorCategory: string };

export type JarvisCancellationRequestResult =
  | { kind: 'authority_revoked_before_intent' }
  | Extract<CancellationDelivery, { kind: 'already_terminal' }>
  | {
      kind: 'intent_committed';
      requestState: 'new' | 'already_pending';
      authorityState: 'current' | 'revoked_after_intent';
      cancellationRequestId: string;
      aggregate: JarvisCancellationAggregate;
    };

export type JarvisCancellationOwnerOutcome =
  | { kind: 'queued_tombstoned'; ownerId: string; queueItemId: string }
  | { kind: 'signal_delivered'; ownerId: string; cancellationToken?: string }
  | { kind: 'handoff_pending'; ownerId: string }
  | { kind: 'already_exited'; ownerId: string }
  | { kind: 'unsupported'; ownerId: string }
  | { kind: 'delivery_rejected'; ownerId: string };

export type JarvisPreEffectTransportFailureEvidence = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  providerId: string;
  modelId: string;
  boundary: 'before_first_response_byte';
  responseStarted: false;
  chunkCount: 0;
  actionDispatchCount: 0;
  failureCategory: string;
  evidenceRef: string;
  verifiedAt: number;
}>;

export type JarvisZeroConsequentialEffectEvidenceV1 = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  attemptNumber: number;
  requestId: string;
  assessedAt: number;
  providerBoundary: JarvisPreEffectTransportFailureEvidence;
  effectBarrier: Readonly<{ state: 'open'; version: 0 }>;
  approvals: Readonly<{ count: 0; evidenceRef: string }>;
  artifacts: Readonly<{ count: 0; evidenceRef: string }>;
  executorClaims: Readonly<{ count: 0; throughSeq: number; evidenceRef: string }>;
}>;

export type JarvisTransportAttemptV1 = Readonly<{
  schemaVersion: 1;
  attemptNumber: number;
  kind: 'initial' | 'transport_retry';
  requestId: string;
  state: 'provider_in_flight' | 'retryable_failed' | 'completed' | 'effect_uncertain';
  startedEventSeq: number;
  effectBarrier: Readonly<{
    state: 'open' | 'dirty' | 'sealed_for_retry';
    version: number;
    updatedAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
  failureCategory?: string;
  zeroEffectEvidence?: JarvisZeroConsequentialEffectEvidenceV1;
}>;

export interface JarvisScheduledRetrySnapshotV1 {
  schemaVersion: 1;
  accountId: string;
  eventId: string;
  occurrenceId: `jocc_${string}`;
  dueAt: number;
  logicalAttempt: number;
  request: Readonly<Omit<JarvisRequestEnvelope, 'requestId' | 'createdAt'>>;
}

export interface JarvisHiveStackStepV1 {
  schemaVersion: 1;
  stepId: string;
  label: string;
  workerId: string;
  agent: Readonly<{
    id: string;
    slug: string;
    builtin: boolean;
    name: string;
    description: string;
    systemPrompt: string;
    toolsAllowed: readonly string[];
    memoryScope: 'agent' | 'project' | 'workspace';
    capabilities: readonly string[];
    createdAt: number;
    updatedAt: number;
  }>;
  model: Readonly<JarvisModelSnapshot>;
  messages: Readonly<JarvisRequestEnvelope['messageHistory']>;
  workingDirectory?: string;
}

export interface JarvisHiveStackPlanV1 {
  schemaVersion: 1;
  accountId: string;
  parentRunId: string;
  stackId: string;
  steps: readonly Readonly<JarvisHiveStackStepV1>[];
}

export type JarvisExecutionEvidenceV1 = Readonly<{
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  kind: 'consequential_effect_claimed' | 'consequential_effect_completed';
  ownerKind:
    | 'approval'
    | 'artifact'
    | 'action'
    | 'file'
    | 'terminal'
    | 'plugin'
    | 'mcp'
    | 'browser'
    | 'schedule';
  ownerId: string;
  evidenceRef: string;
  observedAt: number;
}>;

type JarvisProducerSourcePhaseV1 =
  | Readonly<{ phase: 'start'; state: 'started' | 'ready' | 'busy' }>
  | Readonly<{
      phase: 'result';
      state: 'completed' | 'degraded';
      resultAuthority?: Readonly<{
        runId: string;
        eventSeq: number;
        evidenceRef: `jresult_${string}`;
      }>;
    }>;

export type JarvisCanonicalResultEvidenceV1 = Readonly<{
  schemaVersion: 1;
  kind: 'kernel_turn_committed' | 'scheduled_transport_settled' | 'hive_child_provider_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  parentRunId?: string;
  stepId?: string;
  state: 'completed' | 'degraded';
  resultRef: `jresult_${string}`;
  observedAt: number;
}>;

export type JarvisLiveProducerKind =
  | 'provider'
  | 'action'
  | 'file_action'
  | 'terminal'
  | 'plugin'
  | 'mcp'
  | 'schedule'
  | 'voice'
  | 'hive';

export type JarvisLiveProducerIdentity =
  | Readonly<{
      producerKind: 'provider';
      providerId: string;
      modelId: string;
      modelSnapshotRef: string;
    }>
  | Readonly<{
      producerKind: 'action';
      actionId: string;
      actionVersion: number;
      executionId: string;
    }>
  | Readonly<{
      producerKind: 'file_action';
      actionId: string;
      actionVersion: number;
      resultId: string;
    }>
  | Readonly<{ producerKind: 'terminal'; sessionId: string; executionId: string }>
  | Readonly<{ producerKind: 'plugin'; pluginId: string; invocationId: string }>
  | Readonly<{
      producerKind: 'mcp';
      serverId: string;
      toolName: string;
      invocationId: string;
    }>
  | Readonly<{ producerKind: 'schedule'; eventId: string; occurrenceId: string }>
  | Readonly<{
      producerKind: 'voice';
      sessionId: string;
      engineKind: 'tts' | 'playback';
      executionId: string;
    }>
  | Readonly<{ producerKind: 'hive'; stackId: string; stepId: string; workerId: string }>;

type JarvisProducerSourceEvidenceFor<K extends JarvisLiveProducerKind> = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  producerKind: K;
  producerIdentity: Extract<JarvisLiveProducerIdentity, { producerKind: K }>;
  resultRef: string;
  observedAt: number;
}> &
  JarvisProducerSourcePhaseV1;

export type JarvisProducerSourceEvidenceV1 = {
  [K in JarvisLiveProducerKind]: JarvisProducerSourceEvidenceFor<K>;
}[JarvisLiveProducerKind];

export type JarvisLiveCapabilityCategory =
  | 'tool'
  | 'plugin'
  | 'mcp'
  | 'terminal'
  | 'agent'
  | 'entitlement';

type JarvisDurableLiveEvidenceCommon = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  registrationId: string;
  producerKind: JarvisLiveProducerKind;
  producerIdentity: JarvisLiveProducerIdentity;
  transition: 'started' | 'ready' | 'busy' | 'completed' | 'degraded';
  operations: readonly string[];
  resultRef: string;
  resultEventSeq: number;
  observedAt: number;
  previousProofRef?: `jlive_${string}`;
}>;

export type JarvisDurableLiveEvidenceV1 =
  | (JarvisDurableLiveEvidenceCommon &
      Readonly<{
        kind: 'model';
        producerKind: 'provider';
        providerId: string;
        modelId: string;
        modelSnapshotRef: string;
      }>)
  | (JarvisDurableLiveEvidenceCommon &
      Readonly<{
        kind: 'capability';
        category: JarvisLiveCapabilityCategory;
        capabilityId: string;
      }>);

export interface JarvisRun {
  id: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  source: JarvisRequestEnvelope['surface'];
  status: JarvisRunStatus;
  agentId: string;
  identityVersion: number;
  profileRevisionId: string;
  model: JarvisModelSnapshot;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  scheduledRetrySnapshot?: Readonly<JarvisScheduledRetrySnapshotV1>;
  hiveStackPlan?: Readonly<JarvisHiveStackPlanV1>;
  transportAttempts?: readonly JarvisTransportAttemptV1[];
}

export interface JarvisEvent {
  runId: string;
  seq: number;
  idempotencyKey: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  artifactIds: string[];
  createdAt: number;
  executionEvidence?: JarvisExecutionEvidenceV1;
  canonicalResultEvidence?: JarvisCanonicalResultEvidenceV1;
  producerSourceEvidence?: JarvisProducerSourceEvidenceV1;
  liveEvidence?: JarvisDurableLiveEvidenceV1;
}

export type AllocateJarvisRunInput = Omit<
  JarvisRun,
  | 'id'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'
  | 'scheduledRetrySnapshot'
  | 'hiveStackPlan'
  | 'transportAttempts'
> & { id?: string };

export type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

export type TransitionJarvisRunInput = {
  accountId: string;
  runId: string;
  expectedStatus: JarvisRunStatus;
  nextStatus: JarvisRunStatus;
  event: JarvisRunTransitionEventInput;
  completedAt?: number;
};

export interface JarvisExecutionJournal {
  allocateRun(input: AllocateJarvisRunInput): Promise<JarvisRun>;
  getRun(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  appendEvent(
    accountId: string,
    runId: string,
    event: Omit<JarvisEvent, 'runId' | 'seq'>,
  ): Promise<JarvisEvent>;
  transitionRun(input: TransitionJarvisRunInput): Promise<JarvisRun>;
}

declare const jarvisScheduledAttemptLeaseBrand: unique symbol;

export type JarvisScheduledAttemptLease = Readonly<{
  accountId: string;
  runId: string;
  attemptNumber: number;
  requestId: string;
  kind: 'initial' | 'transport_retry';
  [jarvisScheduledAttemptLeaseBrand]: true;
}>;

export interface JarvisConsequentialEffectSafetyAuthority {
  proveZeroConsequentialEffect(input: {
    run: Readonly<JarvisRun>;
    attempt: Readonly<JarvisTransportAttemptV1>;
    providerFailure: JarvisPreEffectTransportFailureEvidence;
  }): Promise<JarvisZeroConsequentialEffectEvidenceV1 | null>;
  revalidateZeroConsequentialEffect(input: {
    run: Readonly<JarvisRun>;
    attempt: Readonly<JarvisTransportAttemptV1>;
    evidence: JarvisZeroConsequentialEffectEvidenceV1;
  }): Promise<JarvisZeroConsequentialEffectEvidenceV1 | null>;
}

export type JarvisAttemptEffectClaimInput = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  ownerKind: JarvisExecutionEvidenceV1['ownerKind'];
  ownerId: string;
  evidenceRef: string;
  claimedAt: number;
}>;

export type JarvisAttemptEffectClaimResult =
  | { applied: true; kind: 'barrier_claimed'; run: JarvisRun; event: JarvisEvent }
  | { applied: true; kind: 'not_applicable'; run: JarvisRun }
  | {
      applied: false;
      reason: 'status_conflict' | 'attempt_conflict' | 'attempt_sealed';
      current: JarvisRun;
    };

export interface JarvisAttemptEffectBarrierAuthority {
  claim(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

export interface JarvisTransportAttemptCoordinator {
  beginInitialScheduledAttempt(input: {
    accountId: string;
    runId: string;
    requestId: string;
    snapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    createdAt: number;
  }): Promise<JarvisScheduledAttemptLease>;
  beginScheduledTransportRetry(input: {
    accountId: string;
    runId: string;
    previousAttemptNumber: number;
    requestId: string;
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    createdAt: number;
    revalidatedEvidence: JarvisZeroConsequentialEffectEvidenceV1;
  }): Promise<JarvisScheduledAttemptLease>;
  verifyLease(
    lease: JarvisScheduledAttemptLease,
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>,
  ): Promise<Readonly<JarvisRun>>;
  settleScheduledTransportFailure(input: {
    lease: JarvisScheduledAttemptLease;
    expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
    providerFailure: JarvisPreEffectTransportFailureEvidence;
    zeroEffectEvidence: JarvisZeroConsequentialEffectEvidenceV1 | null;
    settledAt: number;
  }): Promise<{ kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }>;
}

export type JarvisAbortKind =
  | 'provider_stream'
  | 'tts_generation'
  | 'audio_playback'
  | 'terminal'
  | 'native_process'
  | 'network'
  | 'child_run'
  | 'other';

export type JarvisAbortRegistration = {
  accountId: string;
  runId: string;
  registrationId: string;
  kind: JarvisAbortKind;
  parentRunId?: string;
  abort: () => JarvisCancellationOwnerOutcome | Promise<JarvisCancellationOwnerOutcome>;
};

export interface JarvisAbortRegistry {
  registerRunAborter(registration: JarvisAbortRegistration): () => void;
  requestRunCancellation(accountId: string, runId: string): Promise<CancellationDelivery>;
  clearRun(accountId: string, runId: string): void;
}

declare const jarvisPreparedCancellationBrand: unique symbol;

export type JarvisPreparedCancellation = Readonly<{
  accountId: string;
  runId: string;
  cancellationRequestId: string;
  [jarvisPreparedCancellationBrand]: true;
}>;

export type JarvisCancellationPreparation =
  | { kind: 'prepared'; plan: JarvisPreparedCancellation }
  | {
      kind: 'already_pending';
      cancellationRequestId: string;
      currentDelivery: Exclude<CancellationDelivery, { kind: 'already_terminal' }>;
    }
  | Extract<CancellationDelivery, { kind: 'already_terminal' }>;

export interface JarvisAbortRegistrationAuthority {
  registerIssuedOwner(registration: JarvisAbortRegistration): () => void;
}

export type JarvisCancellationWorkflowSeal =
  | Readonly<{
      kind: 'sealed';
      cancellationRequestId: string;
      ownerIds: readonly string[];
    }>
  | Readonly<{
      kind: 'not_quiescent';
      cancellationRequestId: string;
      currentDelivery: Exclude<CancellationDelivery, { kind: 'already_terminal' }>;
    }>;

export interface JarvisCancellationDeliveryAuthority {
  prepare(accountId: string, runId: string): Promise<JarvisCancellationPreparation>;
  deliver(prepared: JarvisPreparedCancellation): Promise<CancellationDelivery>;
  current(
    accountId: string,
    runId: string,
    cancellationRequestId: string,
  ): Promise<Exclude<CancellationDelivery, { kind: 'already_terminal' }>>;
  sealWorkflowQuiescence(
    accountId: string,
    runId: string,
    cancellationRequestId: string,
  ): Promise<JarvisCancellationWorkflowSeal>;
  abandonBeforeDelivery(prepared: JarvisPreparedCancellation): void;
}

export type JarvisCanonicalLiveProducerEvidence<K extends JarvisLiveProducerKind> = Readonly<{
  schemaVersion: 1;
  producerKind: K;
  producerIdentity: Extract<JarvisLiveProducerIdentity, { producerKind: K }>;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  resultEventSeq: number;
  state: JarvisDurableLiveEvidenceV1['transition'];
  verifiedAt: number;
}>;

export interface JarvisCanonicalLiveProducerVerifier<K extends JarvisLiveProducerKind> {
  verify(
    evidence: JarvisCanonicalLiveProducerEvidence<K>,
  ): Promise<JarvisCanonicalLiveProducerEvidence<K> | null>;
}

export type JarvisLiveEvidenceVerifierSlot<K extends JarvisLiveProducerKind> =
  | Readonly<{ state: 'ready'; verifier: JarvisCanonicalLiveProducerVerifier<K> }>
  | Readonly<{
      state: 'unavailable';
      producerKind: K;
      reason: 'producer_task_not_landed';
    }>;

declare const jarvisLiveEvidenceProofBrand: unique symbol;

export type JarvisLiveEvidenceProof = Readonly<{
  proofRef: `jlive_${string}`;
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  registrationId: string;
  producerKind: JarvisLiveProducerKind;
  resultRef: string;
  resultEventSeq: number;
  transition: JarvisDurableLiveEvidenceV1['transition'];
  eventSeq: number;
  [jarvisLiveEvidenceProofBrand]: true;
}>;

export type JarvisLiveSystemNode =
  | Readonly<{
      kind: 'model';
      id: `model:${string}`;
      accountId: string;
      runId: string;
      state: 'active' | 'completed' | 'degraded';
      operations: readonly ('generate' | 'stream' | 'embed')[];
      evidenceRef: `jlive_${string}`;
      verifiedAt: number;
      providerId: string;
      modelId: string;
      modelSnapshotRef: string;
    }>
  | Readonly<{
      kind: 'capability';
      id: `capability:${string}`;
      accountId: string;
      runId: string;
      state: 'ready' | 'busy' | 'completed' | 'degraded';
      operations: readonly ('execute' | 'cancel' | 'inspect')[];
      evidenceRef: `jlive_${string}`;
      verifiedAt: number;
      category: JarvisLiveCapabilityCategory;
      capabilityId: string;
    }>;

export type JarvisLiveEvidenceSnapshot = Readonly<{
  schemaVersion: 1;
  accountId: string;
  runId: string;
  capturedAt: number;
  nodes: readonly JarvisLiveSystemNode[];
}>;

export interface JarvisLiveEvidenceRegistration<K extends JarvisLiveProducerKind> {
  readonly initialProof: JarvisLiveEvidenceProof;
  update(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    state: 'started' | 'ready' | 'busy' | 'degraded';
  }): Promise<JarvisLiveEvidenceProof>;
  complete(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    state: 'completed' | 'degraded';
  }): Promise<JarvisLiveEvidenceProof>;
  dispose(): void;
}

export interface JarvisProviderLiveEvidencePort {
  startProvider(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<'provider'>;
    registrationId: string;
    operations: readonly ('generate' | 'stream' | 'embed')[];
  }): Promise<JarvisLiveEvidenceRegistration<'provider'>>;
}

export type JarvisCapabilityLiveProducerKind = Exclude<JarvisLiveProducerKind, 'provider'>;

export interface JarvisCapabilityLiveEvidencePort<K extends JarvisCapabilityLiveProducerKind> {
  startCapability(input: {
    evidence: JarvisCanonicalLiveProducerEvidence<K>;
    registrationId: string;
    category: JarvisLiveCapabilityCategory;
    capabilityId: string;
    operations: readonly ('execute' | 'cancel' | 'inspect')[];
    state: 'ready' | 'busy' | 'degraded';
  }): Promise<JarvisLiveEvidenceRegistration<K>>;
}

export interface JarvisLiveEvidenceAppendCapability {
  append(input: { evidence: JarvisDurableLiveEvidenceV1 }): Promise<JarvisEvent>;
}

export type JarvisLiveEvidenceKernelOwner = Readonly<{
  provider: JarvisProviderLiveEvidencePort;
  action: JarvisCapabilityLiveEvidencePort<'action'>;
  fileAction: JarvisCapabilityLiveEvidencePort<'file_action'>;
  terminal: JarvisCapabilityLiveEvidencePort<'terminal'>;
  plugin: JarvisCapabilityLiveEvidencePort<'plugin'>;
  mcp: JarvisCapabilityLiveEvidencePort<'mcp'>;
  voice: JarvisCapabilityLiveEvidencePort<'voice'>;
  schedule: JarvisCapabilityLiveEvidencePort<'schedule'>;
  hive: JarvisCapabilityLiveEvidencePort<'hive'>;
}>;

export interface JarvisLiveEvidenceReadPort {
  snapshot(accountId: string, runId: string): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(accountId: string, runId: string, listener: () => void): () => void;
}

export type JarvisLiveEvidenceAttemptScope = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
}>;

export interface JarvisAccountLiveEvidenceReadPort {
  readonly accountId: string;
  snapshot(runId: string): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(runId: string, listener: () => void): () => void;
}

export interface JarvisLiveEvidencePrimaryHostAccountSession {
  readonly accountId: string;
  readonly read: JarvisAccountLiveEvidenceReadPort;
  assertCurrent(): void;
  dispose(): void;
}

export interface JarvisLiveEvidencePrimaryHostLifecycle {
  openAccount(accountId: string): Promise<JarvisLiveEvidencePrimaryHostAccountSession>;
  dispose(): void;
}

export type JarvisLiveEvidenceOwnerMaintenance = Readonly<{
  reconstructAccount(
    accountId: string,
    options?: { runLimit?: number; pageSize?: number; maxEventRowsPerRun?: number },
  ): Promise<void>;
  invalidateRun(accountId: string, runId: string): void;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
}>;

export type JarvisLiveEvidenceKernelComposition = Readonly<{
  bindLifecycle(input: {
    scope: JarvisLiveEvidenceAttemptScope;
    append: JarvisLiveEvidenceAppendCapability;
  }): JarvisLiveEvidenceKernelOwner;
  read: JarvisLiveEvidenceReadPort;
  ownerMaintenance: JarvisLiveEvidenceOwnerMaintenance;
}>;

export interface JarvisLiveEvidenceRegistryInternals {
  applyVerified(proof: JarvisLiveEvidenceProof, row: Readonly<JarvisEvent>): void;
  snapshot(accountId: string, runId: string): JarvisLiveEvidenceSnapshot | undefined;
  subscribe(accountId: string, runId: string, listener: () => void): () => void;
  invalidateRun(accountId: string, runId: string): void;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
}

export type JarvisRecoveryDecision =
  | { kind: 'await_approval'; run: JarvisRun; events: JarvisEvent[]; approvalId: string }
  | {
      kind: 'fail_closed';
      run: JarvisRun;
      reason:
        | 'manual_retry_required'
        | 'approval_missing'
        | 'approval_not_pending'
        | 'approval_consumed'
        | 'approval_expired'
        | 'approval_binding_mismatch'
        | 'scheduled_transport_retry_available'
        | 'ambiguous_executor_state';
    };

export interface JarvisRecoveryScanner {
  scanAccount(
    accountId: string,
    options?: { runLimit?: number; eventLimitPerRun?: number },
  ): Promise<JarvisRecoveryDecision[]>;
}

export interface JarvisRecoveryApprovalVerifier {
  verifyPendingApproval(input: {
    accountId: string;
    run: JarvisRun;
    events: readonly JarvisEvent[];
  }): Promise<
    | { valid: true; approvalId: string }
    | {
        valid: false;
        reason: Exclude<
          Extract<JarvisRecoveryDecision, { kind: 'fail_closed' }>['reason'],
          | 'manual_retry_required'
          | 'scheduled_transport_retry_available'
          | 'ambiguous_executor_state'
        >;
      }
  >;
}

export interface JarvisApproval {
  id: string;
  runId: string;
  actionId: string;
  actionVersion: number;
  params: unknown;
  secretHandleRefs?: {
    field: string;
    handleId: string;
  }[];
  paramsHash: string;
  targetSnapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  createdAt: number;
  decidedAt?: number;
  consumedAt?: number;
}

export interface JarvisApprovalV1 extends JarvisApproval {
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  capabilityId: string;
  capabilitySnapshotHash: string;
  expectedEffect: string;
  expiresAt: number;
}

export type JarvisAuthorityBoundResult<T> =
  | { kind: 'committed'; value: T }
  | { kind: 'account_authority_revoked' };

const INVALID_CANONICAL_APPROVAL_JSON = 'Invalid canonical approval JSON.';

export function canonicalizeJarvisApprovalJson(value: unknown): string {
  const active = new WeakSet<object>();
  const visit = (entry: unknown): string => {
    if (entry === null) return 'null';
    if (typeof entry === 'string' || typeof entry === 'boolean') return JSON.stringify(entry);
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
      return JSON.stringify(Object.is(entry, -0) ? 0 : entry);
    }
    if (typeof entry !== 'object') throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
    if (active.has(entry)) throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
    active.add(entry);
    try {
      if (Array.isArray(entry)) {
        if (
          Reflect.ownKeys(entry).some(
            (key) => typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key)),
          )
        ) {
          throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
        }
        const items: string[] = [];
        for (let index = 0; index < entry.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(entry, index)) {
            throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
          }
          const descriptor = Object.getOwnPropertyDescriptor(entry, String(index));
          if (!descriptor || !('value' in descriptor)) {
            throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
          }
          items.push(visit(descriptor.value));
        }
        return `[${items.join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
      }
      const keys = Reflect.ownKeys(entry);
      if (keys.some((key) => typeof key !== 'string')) {
        throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
      }
      const properties = (keys as string[]).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError(INVALID_CANONICAL_APPROVAL_JSON);
        }
        return `${JSON.stringify(key)}:${visit(descriptor.value)}`;
      });
      return `{${properties.join(',')}}`;
    } finally {
      active.delete(entry);
    }
  };
  return visit(value);
}

export async function hashCanonicalJarvisApprovalJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeJarvisApprovalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @internal Shared base for the closed v1 artifact contract. */
interface JarvisArtifact {
  id: string;
  runId: string;
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mimeType?: string;
  safeSummary?: string;
  sourceRefs: JarvisSourceRef[];
  createdAt: number;
}

export type JarvisArtifactState = 'ready' | 'partial' | 'quarantined';

export interface JarvisArtifactV1 extends JarvisArtifact {
  schemaVersion: 1;
  requestId: string;
  attemptNumber: number;
  state: JarvisArtifactState;
  contentHash?: string;
  sizeBytes?: number;
  preview?: {
    kind: 'text' | 'image' | 'none';
    text?: string;
    truncated: boolean;
    sizeBytes: number;
  };
  localReference?: {
    kind: 'path' | 'blob_key' | 'message_part';
    value: string;
  };
}

export type JarvisArtifactDraftBacking =
  | { kind: 'uri'; uri: string }
  | {
      kind: 'local_reference';
      localReference: NonNullable<JarvisArtifactV1['localReference']>;
      content?: string | Uint8Array;
    }
  | {
      kind: 'producer_result';
      content?: string | Uint8Array;
    };

export type JarvisArtifactDraft = Readonly<{
  artifact: Omit<
    JarvisArtifactV1,
    | 'id'
    | 'schemaVersion'
    | 'runId'
    | 'requestId'
    | 'attemptNumber'
    | 'state'
    | 'contentHash'
    | 'sizeBytes'
    | 'preview'
    | 'localReference'
    | 'uri'
  > & {
    state?: JarvisArtifactState;
  };
  backing: JarvisArtifactDraftBacking;
}>;
