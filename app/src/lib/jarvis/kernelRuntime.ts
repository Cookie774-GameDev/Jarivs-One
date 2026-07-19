import Dexie from 'dexie';

import { resolveAccountIdentity, type AccountIdentity } from '@/lib/accountIdentity';
import {
  captureSyncQueueOwner,
  getCurrentSyncQueueAuthorityScope,
  subscribeSyncQueueAuthorityScope,
  type SyncQueueAuthorityScope,
  type SyncQueueOwnerSnapshot,
} from '@/lib/cloudSyncQueueOwner';
import type { JarvisDexie } from '@/lib/db';
import {
  fromJarvisArtifactRow,
  fromJarvisEventRow,
  fromJarvisRunRow,
  toJarvisEventRow,
  toJarvisRunRow,
} from '@/lib/db/jarvisMappers';
import {
  claimApprovedExecutionInContext,
  claimSafeAutoExecutionInContext,
  createJarvisRepositories,
  createPendingApprovalInContext,
  decideApprovalInContext,
} from '@/lib/db/jarvisRepositories';
import {
  createKernelTurnTransactionAuthority,
  type KernelApprovalTransactionContext,
  type KernelLifecycleTransactionContext,
} from '@/lib/db/kernelTurnTransactionAuthority';
import { useAuthStore } from '@/stores/auth';
import type { Message } from '@/types';
import type {
  CancellationDelivery,
  JarvisAbortRegistrationAuthority,
  JarvisApprovalV1,
  JarvisArtifactV1,
  JarvisArtifactDraft,
  JarvisAuthorityBoundResult,
  JarvisCanonicalLiveProducerEvidence,
  JarvisCancellationAggregate,
  JarvisCancellationDeliveryAuthority,
  JarvisCancellationOwnerOutcome,
  JarvisCancellationRequestResult,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisExecutionJournal,
  JarvisLiveEvidenceAppendCapability,
  JarvisLiveEvidencePrimaryHostAccountSession,
  JarvisLiveEvidencePrimaryHostLifecycle,
  JarvisLiveEvidenceProof,
  JarvisLiveEvidenceRegistration,
  JarvisLiveEvidenceVerifierSlot,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
  JarvisRunStatus,
  JarvisRunTransitionEventInput,
} from './contracts/execution';
import { canonicalizeJarvisApprovalJson } from './contracts/execution';
import {
  jarvisIssuedActionExecutionBrand,
  jarvisIssuedApprovalLifecycleBrand,
  jarvisTerminalHandoffReceiptBrand,
} from './approvalEngine';
import type {
  JarvisApprovalActionBinder,
  JarvisApprovalActionCapability,
  JarvisIssuedActionExecution,
  JarvisIssuedApprovalLifecycle,
  JarvisKernelActionPort,
} from './approvalEngine';
import type {
  CanonicalArtifactEvidenceAuthorities,
  JarvisArtifactEffectClaimCapability,
} from './artifactProducerAdapters';
import { createJarvisArtifactKernelComposition } from './artifactRuntime';
import { createJarvisLiveEvidenceKernelComposition } from './executionJournal/liveEvidenceAuthority';
import { createJarvisAttemptEffectBarrierAuthority } from './executionJournal/transportAttempts';
import { createKernelTurnCommit } from './kernelTurnCommit';
import {
  runJarvisKernelTurn,
  runJarvisKernelVoiceTurn,
  type JarvisBoundKernelLifecycle,
  type JarvisDeferredVoiceKernelTurnResult,
  type JarvisKernelPrepareProvider,
  type JarvisKernelProcessResponse,
  type JarvisKernelTurnInput,
  type JarvisKernelTurnResult,
  type JarvisProviderStartedReceipt,
} from './kernel';
import type { VoiceResponseReadyCommitResult } from './kernelTurnCommit';

const jarvisKernelAccountBindingBrand: unique symbol = Symbol('jarvis.kernel.account-binding');
const jarvisVoiceTurnHandleBrand: unique symbol = Symbol('jarvis.voice-turn-handle');

/** @internal Issued only by the closed kernel runtime binding authority. */
export interface JarvisKernelAccountBinding {
  readonly identity: Readonly<AccountIdentity>;
  readonly syncOwnerSnapshot: SyncQueueOwnerSnapshot;
  readonly revocationSignal: AbortSignal;
  readonly [jarvisKernelAccountBindingBrand]: true;
  assertCurrent(): void;
  dispose(): void;
}

const preparedJarvisScheduledAttemptBrand: unique symbol = Symbol(
  'jarvis.prepared-scheduled-attempt',
);
const jarvisScheduledKernelHandleBrand: unique symbol = Symbol('jarvis.kernel.schedule-handle');

export type PreparedJarvisScheduledKernelAttempt = Readonly<{
  [preparedJarvisScheduledAttemptBrand]: true;
}>;

export type JarvisScheduledKernelAttemptHandle = Readonly<{
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
  [jarvisScheduledKernelHandleBrand]: true;
}>;

export type JarvisVoicePlaybackCommitResult =
  | { committed: true; run: JarvisRun; event: JarvisEvent }
  | { committed: false; reason: 'status_conflict'; actualStatus: JarvisRunStatus };

export interface JarvisVoiceTurnHandle {
  readonly [jarvisVoiceTurnHandleBrand]: true;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  commitResponseReady(): Promise<JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>>;
  runValidatedPlayback(): Promise<JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>>;
  dispose(): void;
}

export type JarvisVoicePlaybackEngineResult = Readonly<
  | { state: 'completed'; resultRef: string; observedAt: number }
  | {
      state: 'degraded';
      reason: 'unavailable' | 'failed' | 'stopped';
      resultRef: string;
      observedAt: number;
    }
>;

export type JarvisVoicePlaybackAdapterResult = Readonly<{
  tts: JarvisVoicePlaybackEngineResult;
  playback: JarvisVoicePlaybackEngineResult;
  terminalStatus: 'completed' | 'partial';
}>;

export type JarvisVoicePlaybackController = Readonly<{
  receipt: Readonly<{
    sessionId: string;
    engineId: string;
    ttsExecutionId: string;
    playbackExecutionId: string;
    ttsStartedAt: number;
    playbackStartedAt: number;
  }>;
  start(): Promise<JarvisVoicePlaybackAdapterResult>;
  verify(result: JarvisVoicePlaybackAdapterResult): boolean;
  abort():
    | 'signal_delivered'
    | 'handoff_pending'
    | 'already_exited'
    | 'unsupported'
    | 'delivery_rejected';
  dispose(): void;
}>;

export type JarvisVoicePlaybackAdapter = Readonly<{
  prepare(
    input: Readonly<{
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      spokenText: string;
    }>,
  ): JarvisVoicePlaybackController | null;
}>;

export interface JarvisVoiceRecoveryHandle {
  commitRecoveredPartial(): Promise<JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>>;
  dispose(): void;
}

export interface JarvisKernelRuntime {
  readonly actions: JarvisKernelActionPort;
  runInitialTurn(
    input: Readonly<JarvisKernelTurnInput>,
  ): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;
  startVoiceTurn(input: Readonly<JarvisKernelTurnInput> & { surface: 'voice' }): Promise<
    JarvisAuthorityBoundResult<{
      result: JarvisKernelTurnResult;
      handle: JarvisVoiceTurnHandle;
    }>
  >;
  openVoiceRecovery(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisVoiceRecoveryHandle>>;
  requestCancellation(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisCancellationRequestResult>;
  prepareScheduledAttempt(input: unknown): Promise<PreparedJarvisScheduledKernelAttempt>;
  beginPreparedScheduledAttempt(input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
  }): Promise<JarvisAuthorityBoundResult<JarvisScheduledKernelAttemptHandle>>;
  dispatchPreparedScheduledAttempt(input: {
    prepared: PreparedJarvisScheduledKernelAttempt;
    handle: JarvisScheduledKernelAttemptHandle;
  }): Promise<JarvisAuthorityBoundResult<unknown>>;
  settleScheduledTransportFailure(input: {
    handle: JarvisScheduledKernelAttemptHandle;
  }): Promise<JarvisAuthorityBoundResult<unknown>>;
  disposeScheduledAttempt(handle: JarvisScheduledKernelAttemptHandle): void;
}

/** @internal Full composition received only by app/src/lib/ai/runtime.ts. */
export type JarvisKernelRuntimeComposition = Readonly<{
  kernel: JarvisKernelRuntime;
  liveEvidenceHost: JarvisLiveEvidencePrimaryHostLifecycle;
}>;

type VerifierSlots = Readonly<{
  provider: JarvisLiveEvidenceVerifierSlot<'provider'>;
  action: JarvisLiveEvidenceVerifierSlot<'action'>;
  fileAction: JarvisLiveEvidenceVerifierSlot<'file_action'>;
  terminal: JarvisLiveEvidenceVerifierSlot<'terminal'>;
  plugin: JarvisLiveEvidenceVerifierSlot<'plugin'>;
  mcp: JarvisLiveEvidenceVerifierSlot<'mcp'>;
  voice: JarvisLiveEvidenceVerifierSlot<'voice'>;
  schedule: JarvisLiveEvidenceVerifierSlot<'schedule'>;
  hive: JarvisLiveEvidenceVerifierSlot<'hive'>;
}>;

type KernelRuntimeInput = Readonly<{
  db: JarvisDexie;
  artifactEvidenceAuthorities: CanonicalArtifactEvidenceAuthorities;
  journal: Pick<JarvisExecutionJournal, 'allocateRun' | 'getRun'>;
  cancellationDeliveryAuthority: JarvisCancellationDeliveryAuthority;
  abortRegistrationAuthority: JarvisAbortRegistrationAuthority;
  bindKernelActions: JarvisApprovalActionBinder;
  liveEvidenceVerifiers: VerifierSlots;
  voiceLiveEvidenceStartAuthority?: Readonly<{
    authorizeStart(
      source: Readonly<Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'voice' }>>,
    ): () => void;
  }>;
  voicePlaybackAdapter?: JarvisVoicePlaybackAdapter;
  onVoiceTurnHandleIssued?(input: { runId: string; handle: JarvisVoiceTurnHandle }): () => void;
  prepareProvider: JarvisKernelPrepareProvider;
  processResponse: JarvisKernelProcessResponse;
  takeProviderArtifactDrafts(
    raw: Parameters<JarvisKernelProcessResponse>[0],
  ): readonly JarvisArtifactDraft[] | undefined;
  randomUUID: () => string;
  now: () => number;
}>;

function failNotReady(): never {
  throw new Error('kernel_mode_not_ready');
}

async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = canonicalizeJarvisApprovalJson(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameIdentity(
  left: Readonly<AccountIdentity> | null,
  right: Readonly<AccountIdentity> | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.accountId === right.accountId &&
    left.source === right.source
  );
}

function immutableRunIdentity(run: JarvisRun): unknown {
  return {
    id: run.id,
    accountId: run.accountId,
    ...(run.workspaceId === undefined ? {} : { workspaceId: run.workspaceId }),
    ...(run.projectId === undefined ? {} : { projectId: run.projectId }),
    ...(run.chatId === undefined ? {} : { chatId: run.chatId }),
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    source: run.source,
    agentId: run.agentId,
    identityVersion: run.identityVersion,
    profileRevisionId: run.profileRevisionId,
    model: run.model,
    createdAt: run.createdAt,
  };
}

function sameImmutableRun(left: JarvisRun, right: JarvisRun): boolean {
  try {
    return (
      canonicalizeJarvisApprovalJson(immutableRunIdentity(left)) ===
      canonicalizeJarvisApprovalJson(immutableRunIdentity(right))
    );
  } catch {
    return false;
  }
}

function scopeMatchesOwner(
  scope: Readonly<SyncQueueAuthorityScope>,
  owner: Readonly<SyncQueueOwnerSnapshot>,
): boolean {
  return owner.state === 'cloud'
    ? scope.state === 'cloud' && scope.userId === owner.userId
    : scope.state === 'unbound';
}

function terminalEventSequence(last: { seq: number } | undefined): number {
  const next = (last?.seq ?? 0) + 1;
  if (!Number.isSafeInteger(next) || next < 1) {
    throw new Error('kernel_event_sequence_invalid');
  }
  return next;
}

function cancellationAggregate(delivery: CancellationDelivery): JarvisCancellationAggregate {
  switch (delivery.kind) {
    case 'queued_tombstoned':
      return {
        kind: 'queued_cancelled',
        ownerId: delivery.ownerId,
        queueItemId: delivery.queueItemId,
      };
    case 'signal_delivered':
    case 'handoff_pending':
    case 'unsupported':
    case 'delivery_rejected':
      return { kind: delivery.kind, ownerIds: [...delivery.ownerIds] };
    case 'executor_missing':
      return { kind: 'executor_missing' };
    case 'delivery_error':
      return {
        kind: 'delivery_error',
        ownerIds: [...delivery.ownerIds],
        safeErrorCategory: delivery.safeErrorCategory,
      };
    case 'already_terminal':
      return { kind: 'delivery_pending', ownerIds: [] };
  }
}

function isCancellationTerminalStatus(
  status: JarvisRunStatus,
): status is Extract<
  JarvisRunStatus,
  'partial' | 'completed' | 'failed' | 'cancelled' | 'timed_out'
> {
  return (
    status === 'partial' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'timed_out'
  );
}

type CancellationIntentCommitOutcome =
  | Readonly<{ kind: 'intent_committed' }>
  | Readonly<{ kind: 'authority_revoked_before_intent' }>
  | Readonly<{
      kind: 'already_terminal';
      terminalStatus: Extract<
        JarvisRunStatus,
        'partial' | 'completed' | 'failed' | 'cancelled' | 'timed_out'
      >;
    }>;

async function lastEvent(context: KernelLifecycleTransactionContext, runId: string) {
  return context.jarvis_events
    .where('[run_id+seq]')
    .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
    .last();
}

function createPrimaryHostLifecycle(
  liveEvidence: ReturnType<typeof createJarvisLiveEvidenceKernelComposition>,
): JarvisLiveEvidencePrimaryHostLifecycle {
  type SessionState = {
    readonly accountId: string;
    readonly epoch: number;
    readonly subscriptions: Set<() => void>;
    disposed: boolean;
  };

  let disposed = false;
  let nextEpoch = 0;
  let active: SessionState | undefined;
  let serial: Promise<void> = Promise.resolve();

  const assertCurrent = (state: SessionState): void => {
    if (disposed || state.disposed || active !== state) {
      throw new Error('kernel_host_session_stale');
    }
  };

  const revoke = (state: SessionState): void => {
    if (state.disposed) return;
    state.disposed = true;
    for (const unsubscribe of [...state.subscriptions]) unsubscribe();
    state.subscriptions.clear();
    if (active === state) {
      active = undefined;
      liveEvidence.ownerMaintenance.invalidateAccount(state.accountId);
    }
  };

  const openAccount = (accountId: string): Promise<JarvisLiveEvidencePrimaryHostAccountSession> => {
    const operation = serial.then(async () => {
      if (disposed) throw new Error('kernel_host_disposed');
      if (typeof accountId !== 'string' || !accountId || accountId.trim() !== accountId) {
        throw new TypeError('kernel_host_account_invalid');
      }
      if (active) revoke(active);
      const epoch = ++nextEpoch;
      await liveEvidence.ownerMaintenance.reconstructAccount(accountId);
      if (disposed || epoch !== nextEpoch) {
        liveEvidence.ownerMaintenance.invalidateAccount(accountId);
        throw new Error('kernel_host_session_stale');
      }

      const state: SessionState = {
        accountId,
        epoch,
        subscriptions: new Set(),
        disposed: false,
      };
      active = state;
      const read = Object.freeze({
        accountId,
        async snapshot(runId: string) {
          assertCurrent(state);
          const snapshot = await liveEvidence.read.snapshot(accountId, runId);
          assertCurrent(state);
          return snapshot;
        },
        subscribe(runId: string, listener: () => void) {
          assertCurrent(state);
          const unsubscribeSource = liveEvidence.read.subscribe(accountId, runId, () => {
            if (!state.disposed && active === state) listener();
          });
          let subscriptionDisposed = false;
          const unsubscribe = () => {
            if (subscriptionDisposed) return;
            subscriptionDisposed = true;
            state.subscriptions.delete(unsubscribe);
            unsubscribeSource();
          };
          state.subscriptions.add(unsubscribe);
          return unsubscribe;
        },
      });
      return Object.freeze({
        accountId,
        read,
        assertCurrent: () => assertCurrent(state),
        dispose: () => revoke(state),
      });
    });
    serial = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  return Object.freeze({
    openAccount,
    dispose() {
      if (disposed) return;
      disposed = true;
      nextEpoch += 1;
      if (active) revoke(active);
      liveEvidence.ownerMaintenance.invalidateAll();
    },
  });
}

export function createJarvisKernelRuntime(
  input: KernelRuntimeInput,
): JarvisKernelRuntimeComposition {
  const repositories = createJarvisRepositories(input.db);
  const liveEvidence = createJarvisLiveEvidenceKernelComposition({
    runs: repositories.run,
    events: repositories.event,
    verifiers: input.liveEvidenceVerifiers,
    sha256Canonical,
    now: input.now,
  });
  const issuedBindings = new WeakSet<JarvisKernelAccountBinding>();
  const issuedApprovalLifecycles = new WeakSet<JarvisIssuedApprovalLifecycle>();
  const issuedActionExecutions = new WeakSet<JarvisIssuedActionExecution>();
  const issuedVoiceHandles = new WeakSet<JarvisVoiceTurnHandle>();
  const issuedVoiceRecoveryHandles = new WeakSet<JarvisVoiceRecoveryHandle>();
  type VoiceHandlePhase =
    | 'starting'
    | 'response_pending'
    | 'response_commit_in_flight'
    | 'response_ready_committed'
    | 'playback_in_flight'
    | 'disposed';
  type VoiceHandleState = {
    readonly binding: JarvisKernelAccountBinding;
    readonly turnInput: Readonly<JarvisKernelTurnInput> & { surface: 'voice' };
    releaseBinding: (() => void) | undefined;
    releaseExternal: (() => void) | undefined;
    deferred: JarvisDeferredVoiceKernelTurnResult | undefined;
    phase: VoiceHandlePhase;
    disposeRequested: boolean;
    responseCommit: JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult> | undefined;
    responseCommitOperation:
      | Promise<JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>>
      | undefined;
    activeOperations: Set<Promise<unknown>>;
    cancellationRequested: boolean;
    cancellationOperation: Promise<JarvisCancellationRequestResult> | undefined;
    cancellationResult: JarvisCancellationRequestResult | undefined;
    playbackResultSource:
      | Readonly<Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'voice' }>>
      | undefined;
  };
  const voiceHandleStates = new WeakMap<JarvisVoiceTurnHandle, VoiceHandleState>();
  type VoiceRecoverySnapshot = Readonly<{
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    event: JarvisEvent;
    message: Message;
    artifacts: readonly JarvisArtifactV1[];
  }>;
  type VoiceRecoveryHandleState = {
    readonly binding: JarvisKernelAccountBinding;
    readonly snapshot: VoiceRecoverySnapshot;
    releaseBinding: (() => void) | undefined;
    disposed: boolean;
    activeOperation: Promise<unknown> | undefined;
  };
  const voiceRecoveryHandleStates = new WeakMap<
    JarvisVoiceRecoveryHandle,
    VoiceRecoveryHandleState
  >();
  const bindingLeaseStates = new WeakMap<
    JarvisKernelAccountBinding,
    { count: number; rootReleased: boolean; terminate(): void }
  >();
  const transactionAuthority = createKernelTurnTransactionAuthority(input.db);
  const artifactEffectClaims = createJarvisAttemptEffectBarrierAuthority(repositories.run);
  const assertIssuedAccountBinding = (binding: JarvisKernelAccountBinding): void => {
    if (!issuedBindings.has(binding)) throw new Error('kernel_account_binding_invalid');
  };
  const artifacts = createJarvisArtifactKernelComposition({
    randomUUID: input.randomUUID,
    now: input.now,
    authorities: input.artifactEvidenceAuthorities,
    bindKernelCommit: ({ consumeArtifactsForCommit }) =>
      createKernelTurnCommit({
        transactionAuthority,
        assertIssuedAccountBinding,
        consumeArtifactsForCommit,
      }),
  });

  const issueAccountBinding = (accountId: string): JarvisKernelAccountBinding => {
    if (!accountId || accountId.trim() !== accountId) {
      throw new Error('kernel_account_binding_invalid');
    }
    const controller = new AbortController();
    let disposed = false;
    let binding: JarvisKernelAccountBinding | undefined;
    let identity: Readonly<AccountIdentity> | undefined;
    let owner: SyncQueueOwnerSnapshot | undefined;

    const revoke = (reason: string): void => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    const unsubscribeAuth = useAuthStore.subscribe((state) => {
      if (identity && !sameIdentity(resolveAccountIdentity(state), identity)) {
        revoke('account_identity_changed');
      }
    });
    const unsubscribeScope = subscribeSyncQueueAuthorityScope((scope) => {
      if (owner && !scopeMatchesOwner(scope, owner)) revoke('sync_authority_changed');
    });
    const disposeSubscriptions = (): void => {
      unsubscribeAuth();
      unsubscribeScope();
    };

    try {
      const capturedIdentity = resolveAccountIdentity(useAuthStore.getState());
      const capturedOwner = captureSyncQueueOwner(input.now());
      const capturedScope = getCurrentSyncQueueAuthorityScope();
      if (
        !capturedIdentity ||
        capturedIdentity.accountId !== accountId ||
        (capturedIdentity.source === 'supabase'
          ? capturedOwner.state !== 'cloud' || capturedOwner.userId !== accountId
          : capturedOwner.state !== 'unbound') ||
        !scopeMatchesOwner(capturedScope, capturedOwner)
      ) {
        throw new Error('kernel_account_binding_invalid');
      }
      identity = Object.freeze({ ...capturedIdentity });
      owner = capturedOwner;

      const assertCurrent = (): void => {
        if (
          disposed ||
          !binding ||
          !issuedBindings.has(binding) ||
          controller.signal.aborted ||
          !sameIdentity(resolveAccountIdentity(useAuthStore.getState()), identity!) ||
          !scopeMatchesOwner(getCurrentSyncQueueAuthorityScope(), owner!)
        ) {
          throw new Error('kernel_account_authority_revoked');
        }
      };
      const dispose = (): void => {
        const state = binding ? bindingLeaseStates.get(binding) : undefined;
        if (!state || state.rootReleased) return;
        state.rootReleased = true;
        state.count -= 1;
        if (state.count === 0) state.terminate();
      };
      binding = Object.freeze({
        identity,
        syncOwnerSnapshot: owner,
        revocationSignal: controller.signal,
        [jarvisKernelAccountBindingBrand]: true as const,
        assertCurrent,
        dispose,
      });
      issuedBindings.add(binding);
      bindingLeaseStates.set(binding, {
        count: 1,
        rootReleased: false,
        terminate() {
          if (disposed) return;
          disposed = true;
          if (binding) {
            issuedBindings.delete(binding);
            bindingLeaseStates.delete(binding);
          }
          revoke('kernel_account_binding_disposed');
          disposeSubscriptions();
        },
      });
      binding.assertCurrent();
      return binding;
    } catch (error) {
      disposed = true;
      if (binding) {
        issuedBindings.delete(binding);
        bindingLeaseStates.delete(binding);
      }
      revoke('kernel_account_binding_rejected');
      disposeSubscriptions();
      throw error;
    }
  };

  const retainAccountBinding = (binding: JarvisKernelAccountBinding): (() => void) => {
    assertIssuedAccountBinding(binding);
    binding.assertCurrent();
    const state = bindingLeaseStates.get(binding);
    if (!state) throw new Error('kernel_account_binding_invalid');
    state.count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const currentState = bindingLeaseStates.get(binding);
      if (!currentState) return;
      currentState.count -= 1;
      if (currentState.count === 0) currentState.terminate();
    };
  };

  const requestCancellationWithBinding = async (
    binding: JarvisKernelAccountBinding,
    cancelInput: Readonly<{ accountId: string; runId: string }>,
  ): Promise<JarvisCancellationRequestResult> => {
    const current = (): boolean => {
      try {
        binding.assertCurrent();
        return true;
      } catch {
        return false;
      }
    };
    if (!current()) return { kind: 'authority_revoked_before_intent' };
    const preparation = await input.cancellationDeliveryAuthority.prepare(
      cancelInput.accountId,
      cancelInput.runId,
    );
    if (preparation.kind === 'already_terminal') return preparation;
    if (preparation.kind === 'already_pending') {
      return {
        kind: 'intent_committed',
        requestState: 'already_pending',
        authorityState: current() ? 'current' : 'revoked_after_intent',
        cancellationRequestId: preparation.cancellationRequestId,
        aggregate: cancellationAggregate(preparation.currentDelivery),
      };
    }

    const { plan } = preparation;
    if (!current()) {
      input.cancellationDeliveryAuthority.abandonBeforeDelivery(plan);
      return { kind: 'authority_revoked_before_intent' };
    }
    const intent = await (async () => {
      try {
        return await transactionAuthority.lifecycleTransaction<CancellationIntentCommitOutcome>(
          ['jarvis_runs', 'jarvis_events'],
          binding.revocationSignal,
          async (context) => {
            if (!current()) return { kind: 'authority_revoked_before_intent' as const };
            const runRow = await context.jarvis_runs.get(cancelInput.runId);
            if (!runRow || runRow.account_id !== cancelInput.accountId) {
              throw new Error('kernel_cancellation_scope_mismatch');
            }
            const run = fromJarvisRunRow(runRow);
            if (isCancellationTerminalStatus(run.status)) {
              return { kind: 'already_terminal' as const, terminalStatus: run.status };
            }
            const tail = await lastEvent(context, cancelInput.runId);
            if (!current()) return { kind: 'authority_revoked_before_intent' as const };
            const row = toJarvisEventRow({
              runId: cancelInput.runId,
              seq: terminalEventSequence(tail),
              idempotencyKey: plan.cancellationRequestId,
              type: 'warning',
              status: 'cancellation_requested',
              title: 'Cancellation requested',
              safeSummary: 'Cancellation delivery is pending.',
              sourceRefs: [],
              artifactIds: [],
              createdAt: input.now(),
            });
            await context.jarvis_events.add(row);
            return { kind: 'intent_committed' as const };
          },
        );
      } catch (error) {
        input.cancellationDeliveryAuthority.abandonBeforeDelivery(plan);
        throw error;
      }
    })();
    if (intent.kind === 'cancelled' || intent.value.kind === 'authority_revoked_before_intent') {
      input.cancellationDeliveryAuthority.abandonBeforeDelivery(plan);
      return { kind: 'authority_revoked_before_intent' };
    }
    if (intent.value.kind === 'already_terminal') {
      input.cancellationDeliveryAuthority.abandonBeforeDelivery(plan);
      return intent.value;
    }

    let delivery: CancellationDelivery;
    try {
      delivery = await input.cancellationDeliveryAuthority.deliver(plan);
    } catch {
      return {
        kind: 'intent_committed',
        requestState: 'new',
        authorityState: current() ? 'current' : 'revoked_after_intent',
        cancellationRequestId: plan.cancellationRequestId,
        aggregate: {
          kind: 'delivery_error',
          ownerIds: [],
          safeErrorCategory: 'cancellation_delivery_error',
        },
      };
    }
    return {
      kind: 'intent_committed',
      requestState: 'new',
      authorityState: current() ? 'current' : 'revoked_after_intent',
      cancellationRequestId: plan.cancellationRequestId,
      aggregate: cancellationAggregate(delivery),
    };
  };

  type CanonicalActionScope = Readonly<{
    parentRun: JarvisRun;
    requestId: string;
    attemptNumber: number;
  }>;

  const loadCanonicalActionScope = async (
    suppliedParent: JarvisRun,
    suppliedAttempt?: Readonly<{ runId: string; requestId: string; attemptNumber: number }>,
  ): Promise<CanonicalActionScope> => {
    const canonicalParent = await repositories.run.getById(
      suppliedParent.accountId,
      suppliedParent.id,
    );
    if (!canonicalParent || !sameImmutableRun(canonicalParent, suppliedParent)) {
      throw new Error('kernel_action_scope_mismatch');
    }
    const currentAttempt = canonicalParent.transportAttempts?.at(-1);
    if (
      !currentAttempt ||
      currentAttempt.state !== 'provider_in_flight' ||
      !currentAttempt.requestId ||
      !Number.isSafeInteger(currentAttempt.attemptNumber) ||
      currentAttempt.attemptNumber < 1 ||
      (suppliedAttempt !== undefined &&
        (suppliedAttempt.runId !== canonicalParent.id ||
          suppliedAttempt.requestId !== currentAttempt.requestId ||
          suppliedAttempt.attemptNumber !== currentAttempt.attemptNumber))
    ) {
      throw new Error('kernel_action_scope_mismatch');
    }
    return Object.freeze({
      parentRun: canonicalParent,
      requestId: currentAttempt.requestId,
      attemptNumber: currentAttempt.attemptNumber,
    });
  };

  const issueApprovalLifecycle = (
    binding: JarvisKernelAccountBinding,
    scope: CanonicalActionScope,
  ): JarvisIssuedApprovalLifecycle => {
    assertIssuedAccountBinding(binding);
    binding.assertCurrent();
    if (scope.parentRun.accountId !== binding.identity.accountId) {
      throw new Error('kernel_action_scope_mismatch');
    }

    const controller = new AbortController();
    let lifecycle: JarvisIssuedApprovalLifecycle | undefined;
    let disposed = false;
    const onBindingRevoked = (): void => controller.abort(binding.revocationSignal.reason);
    binding.revocationSignal.addEventListener('abort', onBindingRevoked, { once: true });
    if (binding.revocationSignal.aborted) onBindingRevoked();

    const current = (): boolean => {
      try {
        if (
          disposed ||
          !lifecycle ||
          !issuedApprovalLifecycles.has(lifecycle) ||
          controller.signal.aborted
        ) {
          return false;
        }
        binding.assertCurrent();
        return true;
      } catch {
        return false;
      }
    };

    const approvalWrite = async <T>(
      body: (context: KernelApprovalTransactionContext) => Promise<T>,
    ): Promise<JarvisAuthorityBoundResult<T>> => {
      if (!current()) return { kind: 'account_authority_revoked' };
      const transaction = await transactionAuthority.approvalTransaction(
        ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
        controller.signal,
        async (context) => {
          if (!current()) throw new Error('kernel_account_authority_revoked');
          const value = await body(context);
          if (!current()) throw new Error('kernel_account_authority_revoked');
          return value;
        },
      );
      return transaction.kind === 'cancelled'
        ? { kind: 'account_authority_revoked' }
        : { kind: 'committed', value: transaction.value };
    };

    const captureEventTailSeq = async (): Promise<number> => {
      if (!current()) throw new Error('kernel_account_authority_revoked');
      const tail = await input.db.jarvis_events
        .where('[run_id+seq]')
        .between([scope.parentRun.id, Dexie.minKey], [scope.parentRun.id, Dexie.maxKey], true, true)
        .last();
      if (!current()) throw new Error('kernel_account_authority_revoked');
      return tail?.seq ?? 0;
    };

    type PreparedApprovalInput = Parameters<
      JarvisIssuedApprovalLifecycle['putPreparedApproval']
    >[0] & {
      approvalId: string;
      paramsHash: string;
      targetSnapshot: unknown;
      risk: JarvisApprovalV1['risk'];
      capabilityId: string;
      capabilitySnapshotHash: string;
      expectedEffect: string;
      createdAt: number;
    };

    const approvalFromPrepared = (
      preparedInput: Parameters<JarvisIssuedApprovalLifecycle['putPreparedApproval']>[0],
    ): JarvisApprovalV1 => {
      const prepared = preparedInput as PreparedApprovalInput;
      if (
        prepared.parentRun.id !== scope.parentRun.id ||
        prepared.parentRun.accountId !== scope.parentRun.accountId ||
        prepared.attempt.runId !== scope.parentRun.id ||
        prepared.attempt.requestId !== scope.requestId ||
        prepared.attempt.attemptNumber !== scope.attemptNumber
      ) {
        throw new Error('kernel_action_scope_mismatch');
      }
      return {
        id: prepared.approvalId,
        runId: scope.parentRun.id,
        actionId: prepared.actionId,
        actionVersion: prepared.actionVersion,
        params: structuredClone(prepared.params),
        secretHandleRefs: structuredClone([...prepared.secretHandleRefs]),
        paramsHash: prepared.paramsHash,
        targetSnapshot: structuredClone(prepared.targetSnapshot),
        risk: prepared.risk,
        status: 'pending',
        createdAt: prepared.createdAt,
        schemaVersion: 1,
        requestId: scope.requestId,
        attemptNumber: scope.attemptNumber,
        capabilityId: prepared.capabilityId,
        capabilitySnapshotHash: prepared.capabilitySnapshotHash,
        expectedEffect: prepared.expectedEffect,
        expiresAt: prepared.expiresAt,
      };
    };

    type ClaimedApprovalMutation = Awaited<ReturnType<typeof claimApprovedExecutionInContext>>;

    const issueActionExecution = async (
      claimed: ClaimedApprovalMutation,
    ): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>> => {
      const startSource = claimed.startEvent.producerSourceEvidence;
      const startExecution = claimed.startEvent.executionEvidence;
      if (
        !startSource ||
        startSource.phase !== 'start' ||
        !startExecution ||
        startExecution.kind !== 'consequential_effect_claimed' ||
        startSource.accountId !== scope.parentRun.accountId ||
        startSource.runId !== scope.parentRun.id ||
        startSource.requestId !== scope.requestId ||
        startSource.attemptNumber !== scope.attemptNumber ||
        startExecution.requestId !== scope.requestId ||
        startExecution.attemptNumber !== scope.attemptNumber ||
        startSource.resultRef !== startExecution.evidenceRef ||
        startSource.observedAt !== startExecution.observedAt ||
        (startSource.producerKind !== 'action' &&
          startSource.producerKind !== 'file_action' &&
          startSource.producerKind !== 'terminal' &&
          startSource.producerKind !== 'plugin' &&
          startSource.producerKind !== 'mcp')
      ) {
        throw new Error('kernel_action_claim_readback_mismatch');
      }

      let releaseBinding: (() => void) | undefined;
      try {
        releaseBinding = retainAccountBinding(binding);
      } catch {
        return { kind: 'account_authority_revoked' };
      }
      const producerKind = startSource.producerKind;
      const registrationId = `action:${claimed.approval.id}:${startExecution.ownerId}`;
      let disposedExecution = false;
      let transferred = false;
      let effectStarted = false;
      let resultSettled = false;
      let execution: JarvisIssuedActionExecution | undefined;
      let registration: JarvisLiveEvidenceRegistration<typeof producerKind> | undefined;

      const childCurrent = (): boolean => {
        try {
          if (
            disposedExecution ||
            (execution !== undefined && !issuedActionExecutions.has(execution)) ||
            binding.revocationSignal.aborted
          ) {
            return false;
          }
          binding.assertCurrent();
          return true;
        } catch {
          return false;
        }
      };

      const appendChildEvent = async (
        event: Omit<JarvisEvent, 'runId' | 'seq'>,
      ): Promise<JarvisAuthorityBoundResult<JarvisEvent>> => {
        if (!childCurrent()) return { kind: 'account_authority_revoked' };
        const transaction = await transactionAuthority.lifecycleTransaction(
          ['jarvis_runs', 'jarvis_events'],
          binding.revocationSignal,
          async (context) => {
            binding.assertCurrent();
            const runRow = await context.jarvis_runs.get(scope.parentRun.id);
            if (!runRow || runRow.account_id !== scope.parentRun.accountId) {
              throw new Error('kernel_action_scope_mismatch');
            }
            const tail = await lastEvent(context, scope.parentRun.id);
            binding.assertCurrent();
            const row = toJarvisEventRow({
              ...event,
              runId: scope.parentRun.id,
              seq: terminalEventSequence(tail),
            });
            await context.jarvis_events.add(row);
            return fromJarvisEventRow(row);
          },
        );
        return transaction.kind === 'cancelled'
          ? { kind: 'account_authority_revoked' }
          : { kind: 'committed', value: transaction.value };
      };

      const appendLiveEvidence: JarvisLiveEvidenceAppendCapability = Object.freeze({
        async append({ evidence }: { evidence: JarvisDurableLiveEvidenceV1 }) {
          const result = await appendChildEvent({
            idempotencyKey: `kernel-live:${evidence.registrationId}:${evidence.transition}:${evidence.resultRef}`,
            type: 'tool',
            status: evidence.transition,
            title: 'Capability evidence updated',
            safeSummary: 'Verified live execution evidence was updated.',
            sourceRefs: [],
            artifactIds: [],
            createdAt: evidence.observedAt,
            liveEvidence: evidence,
          });
          if (result.kind !== 'committed') throw new Error('kernel_account_authority_revoked');
          return result.value;
        },
      });
      const liveOwner = liveEvidence.bindLifecycle({
        scope: {
          accountId: scope.parentRun.accountId,
          runId: scope.parentRun.id,
          requestId: scope.requestId,
          attemptNumber: scope.attemptNumber,
        },
        append: appendLiveEvidence,
      });
      const initialEvidence = {
        schemaVersion: 1 as const,
        producerKind,
        producerIdentity: structuredClone(startSource.producerIdentity),
        accountId: scope.parentRun.accountId,
        runId: scope.parentRun.id,
        requestId: scope.requestId,
        attemptNumber: scope.attemptNumber,
        resultRef: startSource.resultRef,
        resultEventSeq: claimed.startEvent.seq,
        state: startSource.state,
        verifiedAt: startSource.observedAt,
      } as JarvisCanonicalLiveProducerEvidence<typeof producerKind>;
      const startInput = {
        evidence: initialEvidence,
        registrationId,
        category:
          producerKind === 'plugin'
            ? ('plugin' as const)
            : producerKind === 'mcp'
              ? ('mcp' as const)
              : producerKind === 'terminal'
                ? ('terminal' as const)
                : ('tool' as const),
        capabilityId: claimed.approval.capabilityId,
        operations: ['execute', 'cancel', 'inspect'] as const,
        state: startSource.state as 'ready' | 'busy' | 'degraded',
      };

      try {
        registration = (producerKind === 'action'
          ? await liveOwner.action.startCapability({
              ...startInput,
              evidence: initialEvidence as JarvisCanonicalLiveProducerEvidence<'action'>,
            })
          : producerKind === 'file_action'
            ? await liveOwner.fileAction.startCapability({
                ...startInput,
                evidence: initialEvidence as JarvisCanonicalLiveProducerEvidence<'file_action'>,
              })
            : producerKind === 'terminal'
              ? await liveOwner.terminal.startCapability({
                  ...startInput,
                  evidence: initialEvidence as JarvisCanonicalLiveProducerEvidence<'terminal'>,
                })
              : producerKind === 'plugin'
                ? await liveOwner.plugin.startCapability({
                    ...startInput,
                    evidence: initialEvidence as JarvisCanonicalLiveProducerEvidence<'plugin'>,
                  })
                : await liveOwner.mcp.startCapability({
                    ...startInput,
                    evidence: initialEvidence as JarvisCanonicalLiveProducerEvidence<'mcp'>,
                  })) as unknown as JarvisLiveEvidenceRegistration<typeof producerKind>;
      } catch (error) {
        releaseBinding();
        if (!childCurrent()) return { kind: 'account_authority_revoked' };
        throw error;
      }
      const activeRegistration = registration;
      if (!activeRegistration) throw new Error('kernel_action_live_registration_missing');

      const disposeChild = (): void => {
        if (disposedExecution) return;
        disposedExecution = true;
        if (execution) issuedActionExecutions.delete(execution);
        activeRegistration.dispose();
        releaseBinding?.();
        releaseBinding = undefined;
      };

      const recordResult: JarvisIssuedActionExecution['recordResult'] = async (result) => {
        if (!childCurrent()) return { kind: 'account_authority_revoked' };
        if (resultSettled) throw new Error('kernel_action_result_already_settled');
        resultSettled = true;
        const completed = await appendChildEvent({
          idempotencyKey: `action-result:${claimed.approval.id}:${result.resultRef}`,
          type: 'tool',
          status: result.state,
          title: result.state === 'completed' ? 'Action completed' : 'Action degraded',
          safeSummary: 'The protected action produced a canonical result.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: result.completedAt,
          executionEvidence: {
            schemaVersion: 1,
            requestId: scope.requestId,
            attemptNumber: scope.attemptNumber,
            kind: 'consequential_effect_completed',
            ownerKind: startExecution.ownerKind,
            ownerId: startExecution.ownerId,
            evidenceRef: result.resultRef,
            observedAt: result.completedAt,
          },
          producerSourceEvidence: {
            schemaVersion: 1,
            accountId: scope.parentRun.accountId,
            runId: scope.parentRun.id,
            requestId: scope.requestId,
            attemptNumber: scope.attemptNumber,
            producerKind,
            producerIdentity: structuredClone(startSource.producerIdentity),
            phase: 'result',
            state: result.state,
            resultRef: result.resultRef,
            observedAt: result.completedAt,
          } as JarvisEvent['producerSourceEvidence'],
        });
        if (completed.kind !== 'committed') return completed;
        const proof = await activeRegistration.complete({
          evidence: {
            ...initialEvidence,
            resultRef: result.resultRef,
            resultEventSeq: completed.value.seq,
            state: result.state,
            verifiedAt: result.completedAt,
          },
          state: result.state,
        });
        if (!childCurrent()) return { kind: 'account_authority_revoked' };
        return { kind: 'committed', value: proof };
      };

      const recordCancellationVerified: JarvisIssuedActionExecution['recordCancellationVerified'] =
        async (cancellation) => {
          if (!childCurrent()) return { kind: 'account_authority_revoked' };
          if (producerKind !== 'terminal') throw new Error('kernel_terminal_cancellation_invalid');
          if (
            resultSettled ||
            !cancellation.cancellationRequestId.trim() ||
            !cancellation.resultRef.trim() ||
            !Number.isFinite(cancellation.verifiedAt)
          ) {
            throw new Error('kernel_terminal_cancellation_invalid');
          }
          resultSettled = true;
          const transaction = await transactionAuthority.lifecycleTransaction(
            ['jarvis_runs', 'jarvis_events'],
            binding.revocationSignal,
            async (context) => {
              binding.assertCurrent();
              const runRow = await context.jarvis_runs.get(scope.parentRun.id);
              if (!runRow || runRow.account_id !== scope.parentRun.accountId) {
                throw new Error('kernel_action_scope_mismatch');
              }
              const run = fromJarvisRunRow(runRow);
              const [intent, tail] = await Promise.all([
                context.jarvis_events
                  .where('run_id')
                  .equals(scope.parentRun.id)
                  .filter(
                    (row) =>
                      row.status === 'cancellation_requested' &&
                      row.idempotency_key === cancellation.cancellationRequestId,
                  )
                  .first(),
                lastEvent(context, scope.parentRun.id),
              ]);
              if (!intent || run.status !== 'running' || cancellation.verifiedAt < run.updatedAt) {
                throw new Error('kernel_terminal_cancellation_conflict');
              }
              binding.assertCurrent();
              const resultEvent: JarvisEvent = {
                runId: scope.parentRun.id,
                seq: terminalEventSequence(tail),
                idempotencyKey: `terminal-cancellation-result:${claimed.approval.id}:${cancellation.cancellationRequestId}`,
                type: 'tool',
                status: 'degraded',
                title: 'Terminal cancellation verified',
                safeSummary: 'The native terminal owner verified cancellation.',
                sourceRefs: [],
                artifactIds: [],
                createdAt: cancellation.verifiedAt,
                executionEvidence: {
                  schemaVersion: 1,
                  requestId: scope.requestId,
                  attemptNumber: scope.attemptNumber,
                  kind: 'consequential_effect_completed',
                  ownerKind: startExecution.ownerKind,
                  ownerId: startExecution.ownerId,
                  evidenceRef: cancellation.resultRef,
                  observedAt: cancellation.verifiedAt,
                },
                producerSourceEvidence: {
                  schemaVersion: 1,
                  accountId: scope.parentRun.accountId,
                  runId: scope.parentRun.id,
                  requestId: scope.requestId,
                  attemptNumber: scope.attemptNumber,
                  producerKind,
                  producerIdentity: structuredClone(startSource.producerIdentity),
                  phase: 'result',
                  state: 'degraded',
                  resultRef: cancellation.resultRef,
                  observedAt: cancellation.verifiedAt,
                } as JarvisEvent['producerSourceEvidence'],
              };
              const cancelledRun: JarvisRun = {
                ...run,
                status: 'cancelled',
                updatedAt: cancellation.verifiedAt,
                completedAt: cancellation.verifiedAt,
              };
              const transitionEvent: JarvisEvent = {
                runId: scope.parentRun.id,
                seq: resultEvent.seq + 1,
                idempotencyKey: `terminal-cancelled:${cancellation.cancellationRequestId}`,
                type: 'run_state',
                status: 'cancelled',
                title: 'Terminal run cancelled',
                safeSummary: 'Cancellation was verified by the native terminal owner.',
                sourceRefs: [],
                artifactIds: [],
                createdAt: cancellation.verifiedAt,
              };
              const cancelledRow = toJarvisRunRow(cancelledRun);
              const resultRow = toJarvisEventRow(resultEvent);
              const transitionRow = toJarvisEventRow(transitionEvent);
              await context.jarvis_runs.put(cancelledRow);
              await context.jarvis_events.bulkAdd([resultRow, transitionRow]);
              const [readRun, readResult, readTransition] = await Promise.all([
                context.jarvis_runs.get(cancelledRow.id),
                context.jarvis_events.get([resultRow.run_id, resultRow.seq]),
                context.jarvis_events.get([transitionRow.run_id, transitionRow.seq]),
              ]);
              if (
                !readRun ||
                !readResult ||
                !readTransition ||
                canonicalizeJarvisApprovalJson(readRun) !==
                  canonicalizeJarvisApprovalJson(cancelledRow) ||
                canonicalizeJarvisApprovalJson(readResult) !==
                  canonicalizeJarvisApprovalJson(resultRow) ||
                canonicalizeJarvisApprovalJson(readTransition) !==
                  canonicalizeJarvisApprovalJson(transitionRow)
              ) {
                throw new Error('kernel_terminal_cancellation_readback_mismatch');
              }
              return {
                run: fromJarvisRunRow(readRun),
                resultEvent: fromJarvisEventRow(readResult),
                event: fromJarvisEventRow(readTransition),
              };
            },
          );
          if (transaction.kind === 'cancelled') {
            return { kind: 'account_authority_revoked' };
          }
          const proof = await activeRegistration.complete({
            evidence: {
              ...initialEvidence,
              resultRef: cancellation.resultRef,
              resultEventSeq: transaction.value.resultEvent.seq,
              state: 'degraded',
              verifiedAt: cancellation.verifiedAt,
            },
            state: 'degraded',
          });
          if (!childCurrent()) return { kind: 'account_authority_revoked' };
          return {
            kind: 'committed',
            value: { run: transaction.value.run, event: transaction.value.event, proof },
          };
        };

      const requestChildCancellation = (): Promise<JarvisCancellationRequestResult> => {
        if (!childCurrent()) {
          return Promise.resolve({ kind: 'authority_revoked_before_intent' });
        }
        return requestCancellationWithBinding(binding, {
          accountId: scope.parentRun.accountId,
          runId: scope.parentRun.id,
        });
      };

      execution = Object.freeze({
        approval: structuredClone(claimed.approval),
        producerKind,
        ownerId: startExecution.ownerId,
        startEvent: structuredClone(claimed.startEvent),
        initialLiveProof: activeRegistration.initialProof,
        [jarvisIssuedActionExecutionBrand]: true as const,
        beginExternalEffect<T>(
          begin: (signal: AbortSignal) => Readonly<{ completion: Promise<T> }>,
        ) {
          if (!childCurrent()) return { kind: 'account_authority_revoked' as const };
          if (effectStarted) throw new Error('kernel_action_effect_already_started');
          effectStarted = true;
          return { kind: 'committed' as const, value: begin(binding.revocationSignal) };
        },
        transferTerminalOwnership(
          transfer: Parameters<JarvisIssuedActionExecution['transferTerminalOwnership']>[0],
        ) {
          if (!childCurrent()) return { kind: 'account_authority_revoked' as const };
          if (producerKind !== 'terminal' || transferred) {
            throw new Error('kernel_terminal_handoff_invalid');
          }
          const receipt = transfer.acceptor.acceptIssuedExecution({
            executionId: transfer.executionId,
            ownerId: startExecution.ownerId,
            execution: Object.freeze({
              recordResult,
              recordCancellationVerified,
              requestCancellation: requestChildCancellation,
              dispose: disposeChild,
            }),
          });
          if (
            receipt[jarvisTerminalHandoffReceiptBrand] !== true ||
            receipt.executionId !== transfer.executionId ||
            receipt.ownerId !== startExecution.ownerId
          ) {
            throw new Error('kernel_terminal_handoff_invalid');
          }
          transferred = true;
          return { kind: 'committed' as const, value: receipt };
        },
        recordResult,
        recordCancellationVerified,
        requestCancellation: requestChildCancellation,
        dispose() {
          if (transferred) return;
          disposeChild();
        },
      });
      const issuedExecution = execution;
      if (!issuedExecution) throw new Error('kernel_action_execution_missing');
      issuedActionExecutions.add(issuedExecution);
      if (!childCurrent()) {
        disposeChild();
        return { kind: 'account_authority_revoked' };
      }
      return { kind: 'committed', value: issuedExecution };
    };

    const claimExecution = async (
      claim:
        | Parameters<JarvisIssuedApprovalLifecycle['claimApprovedExecution']>[0]
        | Parameters<JarvisIssuedApprovalLifecycle['claimAutoApprovedExecution']>[0],
    ): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>> => {
      const expectedEventTailSeq = await captureEventTailSeq();
      const mutation =
        'approvalId' in claim
          ? await approvalWrite((context) =>
              claimApprovedExecutionInContext(context, {
                accountId: scope.parentRun.accountId,
                runId: scope.parentRun.id,
                requestId: scope.requestId,
                attemptNumber: scope.attemptNumber,
                approvalId: claim.approvalId,
                producerKind: claim.producerKind,
                ownerId: claim.ownerId,
                evidenceRef: claim.evidenceRef,
                startedAt: claim.startedAt,
                expectedEventTailSeq,
              }),
            )
          : await approvalWrite((context) =>
              claimSafeAutoExecutionInContext(context, {
                accountId: scope.parentRun.accountId,
                approval: approvalFromPrepared(claim.approval),
                producerKind: claim.producerKind,
                ownerId: claim.ownerId,
                evidenceRef: claim.evidenceRef,
                startedAt: claim.startedAt,
                expectedEventTailSeq,
              }),
            );
      if (mutation.kind !== 'committed') return mutation;
      return issueActionExecution(mutation.value);
    };

    lifecycle = Object.freeze({
      accountId: scope.parentRun.accountId,
      runId: scope.parentRun.id,
      requestId: scope.requestId,
      attemptNumber: scope.attemptNumber,
      revocationSignal: controller.signal,
      [jarvisIssuedApprovalLifecycleBrand]: true as const,
      async putPreparedApproval(
        preparedInput: Parameters<JarvisIssuedApprovalLifecycle['putPreparedApproval']>[0],
      ) {
        const approval = approvalFromPrepared(preparedInput);
        const expectedEventTailSeq = await captureEventTailSeq();
        return approvalWrite(async (context) => {
          const result = await createPendingApprovalInContext(context, {
            accountId: scope.parentRun.accountId,
            approval,
            expectedEventTailSeq,
          });
          return result.approval;
        });
      },
      decidePreparedApproval(
        decision: Parameters<JarvisIssuedApprovalLifecycle['decidePreparedApproval']>[0],
      ) {
        return (async () => {
          const expectedEventTailSeq = await captureEventTailSeq();
          return approvalWrite(async (context) => {
            const result = await decideApprovalInContext(context, {
              accountId: scope.parentRun.accountId,
              runId: scope.parentRun.id,
              requestId: scope.requestId,
              attemptNumber: scope.attemptNumber,
              approvalId: decision.approvalId,
              decision: decision.decision,
              decidedAt: input.now(),
              expectedEventTailSeq,
            });
            return result.approval;
          });
        })();
      },
      claimApprovedExecution(
        claim: Parameters<JarvisIssuedApprovalLifecycle['claimApprovedExecution']>[0],
      ) {
        return claimExecution(claim);
      },
      claimAutoApprovedExecution(
        claim: Parameters<JarvisIssuedApprovalLifecycle['claimAutoApprovedExecution']>[0],
      ) {
        return claimExecution(claim);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (lifecycle) issuedApprovalLifecycles.delete(lifecycle);
        binding.revocationSignal.removeEventListener('abort', onBindingRevoked);
        if (!controller.signal.aborted) controller.abort('kernel_action_lifecycle_disposed');
      },
    });
    issuedApprovalLifecycles.add(lifecycle);
    if (!current()) {
      lifecycle.dispose();
      throw new Error('kernel_account_authority_revoked');
    }
    return lifecycle;
  };

  const invokeActionCapability = async <T>(
    scope: CanonicalActionScope,
    invoke: (capability: JarvisApprovalActionCapability, parentRun: JarvisRun) => Promise<T>,
  ): Promise<JarvisAuthorityBoundResult<T>> => {
    let binding: JarvisKernelAccountBinding;
    try {
      binding = issueAccountBinding(scope.parentRun.accountId);
    } catch {
      return { kind: 'account_authority_revoked' };
    }
    let lifecycle: JarvisIssuedApprovalLifecycle | undefined;
    try {
      lifecycle = issueApprovalLifecycle(binding, scope);
      const capability = input.bindKernelActions(lifecycle);
      const value = await invoke(capability, scope.parentRun);
      binding.assertCurrent();
      if (lifecycle.revocationSignal.aborted) {
        return { kind: 'account_authority_revoked' };
      }
      return { kind: 'committed', value };
    } catch (error) {
      let authorityCurrent = false;
      try {
        binding.assertCurrent();
        authorityCurrent = lifecycle !== undefined && !lifecycle.revocationSignal.aborted;
      } catch {
        authorityCurrent = false;
      }
      if (!authorityCurrent) return { kind: 'account_authority_revoked' };
      throw error;
    } finally {
      lifecycle?.dispose();
      binding.dispose();
    }
  };

  const issueLifecycle = (
    binding: JarvisKernelAccountBinding,
    scope: Readonly<{
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
    }>,
  ): JarvisBoundKernelLifecycle => {
    assertIssuedAccountBinding(binding);
    binding.assertCurrent();
    if (scope.accountId !== binding.identity.accountId) {
      throw new Error('kernel_lifecycle_scope_mismatch');
    }
    const frozenScope = Object.freeze({ ...scope });
    let providerRegistration: JarvisLiveEvidenceRegistration<'provider'> | undefined;
    let providerReceipt: JarvisProviderStartedReceipt | undefined;

    const current = (): boolean => {
      try {
        assertIssuedAccountBinding(binding);
        binding.assertCurrent();
        return true;
      } catch {
        return false;
      }
    };

    const appendInTransaction = async (
      event: Omit<JarvisEvent, 'runId' | 'seq'>,
    ): Promise<JarvisAuthorityBoundResult<JarvisEvent>> => {
      if (!current()) return { kind: 'account_authority_revoked' as const };
      const transaction = await transactionAuthority.lifecycleTransaction(
        ['jarvis_runs', 'jarvis_events'],
        binding.revocationSignal,
        async (context) => {
          if (!current()) return { kind: 'account_authority_revoked' as const };
          const runRow = await context.jarvis_runs.get(frozenScope.runId);
          if (!runRow || runRow.account_id !== frozenScope.accountId) {
            throw new Error('kernel_lifecycle_scope_mismatch');
          }
          const tail = await lastEvent(context, frozenScope.runId);
          if (!current()) return { kind: 'account_authority_revoked' as const };
          const row = toJarvisEventRow({
            ...event,
            runId: frozenScope.runId,
            seq: terminalEventSequence(tail),
          });
          await context.jarvis_events.add(row);
          return { kind: 'committed' as const, value: fromJarvisEventRow(row) };
        },
      );
      return transaction.kind === 'cancelled'
        ? { kind: 'account_authority_revoked' as const }
        : transaction.value;
    };

    const appendLiveEvidence: JarvisLiveEvidenceAppendCapability = Object.freeze({
      async append({ evidence }: { evidence: JarvisDurableLiveEvidenceV1 }) {
        const result = await appendInTransaction({
          idempotencyKey: `kernel-live:${evidence.registrationId}:${evidence.transition}:${evidence.resultRef}`,
          type: evidence.kind === 'model' ? 'model' : 'tool',
          status: evidence.transition,
          title:
            evidence.kind === 'model' ? 'Provider evidence updated' : 'Capability evidence updated',
          safeSummary: 'Verified live execution evidence was updated.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: evidence.observedAt,
          liveEvidence: evidence,
        });
        if (result.kind === 'account_authority_revoked') {
          throw new Error('kernel_account_authority_revoked');
        }
        return result.value;
      },
    });
    const liveOwner = liveEvidence.bindLifecycle({
      scope: frozenScope,
      append: appendLiveEvidence,
    });

    const lifecycle: JarvisBoundKernelLifecycle = Object.freeze({
      revocationSignal: binding.revocationSignal,
      assertCurrent() {
        assertIssuedAccountBinding(binding);
        binding.assertCurrent();
      },
      async transition(
        transition: Parameters<JarvisBoundKernelLifecycle['transition']>[0],
      ): ReturnType<JarvisBoundKernelLifecycle['transition']> {
        if (!current()) return { kind: 'account_authority_revoked' as const };
        const transaction = await transactionAuthority.lifecycleTransaction(
          ['jarvis_runs', 'jarvis_events'],
          binding.revocationSignal,
          async (context) => {
            if (!current()) return { kind: 'account_authority_revoked' as const };
            const runRow = await context.jarvis_runs.get(frozenScope.runId);
            if (!runRow || runRow.account_id !== frozenScope.accountId) {
              throw new Error('kernel_lifecycle_scope_mismatch');
            }
            const run = fromJarvisRunRow(runRow);
            if (run.status !== transition.expectedStatus) {
              throw new Error('kernel_lifecycle_status_conflict');
            }
            const tail = await lastEvent(context, frozenScope.runId);
            if (!current()) return { kind: 'account_authority_revoked' as const };
            const updated: JarvisRun = {
              ...run,
              status: transition.nextStatus,
              updatedAt: transition.event.createdAt,
              ...(transition.completedAt === undefined
                ? {}
                : { completedAt: transition.completedAt }),
            };
            const updatedRow = toJarvisRunRow(updated);
            const eventRow = toJarvisEventRow({
              ...transition.event,
              runId: frozenScope.runId,
              seq: terminalEventSequence(tail),
              type: 'run_state',
              status: transition.nextStatus,
            });
            await context.jarvis_runs.put(updatedRow);
            await context.jarvis_events.add(eventRow);
            return {
              kind: 'committed' as const,
              value: {
                run: fromJarvisRunRow(updatedRow),
                event: fromJarvisEventRow(eventRow),
              },
            };
          },
        );
        return transaction.kind === 'cancelled'
          ? { kind: 'account_authority_revoked' as const }
          : transaction.value;
      },
      async recordProviderStarted(
        receipt: Parameters<JarvisBoundKernelLifecycle['recordProviderStarted']>[0],
      ): ReturnType<JarvisBoundKernelLifecycle['recordProviderStarted']> {
        if (!current()) return { kind: 'account_authority_revoked' as const };
        const resultRef = `jprovider_start_${frozenScope.requestId}`;
        const source = {
          schemaVersion: 1 as const,
          accountId: frozenScope.accountId,
          runId: frozenScope.runId,
          requestId: frozenScope.requestId,
          attemptNumber: frozenScope.attemptNumber,
          producerKind: 'provider' as const,
          producerIdentity: {
            producerKind: 'provider' as const,
            providerId: receipt.providerId,
            modelId: receipt.modelId,
            modelSnapshotRef: receipt.modelSnapshotRef,
          },
          resultRef,
          observedAt: receipt.startedAt,
          phase: 'start' as const,
          state: 'started' as const,
        };
        const sourceEvent = await appendInTransaction({
          idempotencyKey: `kernel-provider-start:${frozenScope.requestId}:${frozenScope.attemptNumber}`,
          type: 'model',
          status: 'started',
          title: 'Provider started',
          safeSummary: 'The protected provider dispatch started.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: receipt.startedAt,
          producerSourceEvidence: source,
        });
        if (sourceEvent.kind === 'account_authority_revoked') return sourceEvent;
        const evidence: JarvisCanonicalLiveProducerEvidence<'provider'> = Object.freeze({
          schemaVersion: 1,
          producerKind: 'provider',
          producerIdentity: source.producerIdentity,
          accountId: frozenScope.accountId,
          runId: frozenScope.runId,
          requestId: frozenScope.requestId,
          attemptNumber: frozenScope.attemptNumber,
          resultRef,
          resultEventSeq: sourceEvent.value.seq,
          state: 'started',
          verifiedAt: receipt.startedAt,
        });
        try {
          providerReceipt = receipt;
          providerRegistration = await liveOwner.provider.startProvider({
            evidence,
            registrationId: `${frozenScope.runId}:provider`,
            operations: receipt.operations,
          });
          const registration = providerRegistration;
          return {
            kind: 'committed' as const,
            value: Object.freeze({
              initialProof: registration.initialProof,
              dispose: () => registration.dispose(),
            }),
          };
        } catch (error) {
          if (!current()) return { kind: 'account_authority_revoked' as const };
          throw error;
        }
      },
      async recordProviderResult(
        observation: Parameters<JarvisBoundKernelLifecycle['recordProviderResult']>[0],
      ): ReturnType<JarvisBoundKernelLifecycle['recordProviderResult']> {
        if (!current()) return { kind: 'account_authority_revoked' as const };
        if (!providerRegistration || !providerReceipt) {
          throw new Error('kernel_provider_registration_missing');
        }
        const rows = await repositories.event.listByRun(frozenScope.accountId, frozenScope.runId, {
          limit: 500,
        });
        if (!current()) return { kind: 'account_authority_revoked' as const };
        const resultEvent = [...rows].reverse().find((event) => {
          const source = event.producerSourceEvidence;
          return (
            source?.producerKind === 'provider' &&
            source.phase === 'result' &&
            source.requestId === frozenScope.requestId &&
            source.attemptNumber === frozenScope.attemptNumber &&
            source.resultRef === observation.resultRef &&
            source.state === observation.state
          );
        });
        if (!resultEvent) throw new Error('kernel_provider_result_source_missing');
        const evidence: JarvisCanonicalLiveProducerEvidence<'provider'> = Object.freeze({
          schemaVersion: 1,
          producerKind: 'provider',
          producerIdentity: {
            producerKind: 'provider' as const,
            providerId: providerReceipt.providerId,
            modelId: providerReceipt.modelId,
            modelSnapshotRef: providerReceipt.modelSnapshotRef,
          },
          accountId: frozenScope.accountId,
          runId: frozenScope.runId,
          requestId: frozenScope.requestId,
          attemptNumber: frozenScope.attemptNumber,
          resultRef: observation.resultRef,
          resultEventSeq: resultEvent.seq,
          state: observation.state,
          verifiedAt: observation.observedAt,
        });
        try {
          const proof = await providerRegistration.complete({
            evidence,
            state: observation.state,
          });
          if (!current()) return { kind: 'account_authority_revoked' as const };
          return { kind: 'committed' as const, value: proof as JarvisLiveEvidenceProof };
        } catch (error) {
          if (!current()) return { kind: 'account_authority_revoked' as const };
          throw error;
        }
      },
      registerAbortOwner(
        registration: Parameters<JarvisBoundKernelLifecycle['registerAbortOwner']>[0],
      ): ReturnType<JarvisBoundKernelLifecycle['registerAbortOwner']> {
        assertIssuedAccountBinding(binding);
        binding.assertCurrent();
        return input.abortRegistrationAuthority.registerIssuedOwner({
          accountId: frozenScope.accountId,
          runId: frozenScope.runId,
          registrationId: registration.registrationId,
          kind: registration.kind,
          abort: registration.abort,
        });
      },
    });
    return lifecycle;
  };

  const voiceHandleState = (receiver: JarvisVoiceTurnHandle): VoiceHandleState => {
    const state = voiceHandleStates.get(receiver);
    if (!state) throw new Error('voice_handle_invalid');
    if (state.phase === 'disposed' || !issuedVoiceHandles.has(receiver)) {
      throw new Error('voice_handle_phase_conflict');
    }
    try {
      state.binding.assertCurrent();
    } catch {
      throw new Error('kernel_account_authority_revoked');
    }
    return state;
  };

  const finishVoiceHandleDisposal = (
    handle: JarvisVoiceTurnHandle,
    state: VoiceHandleState,
  ): void => {
    if (state.phase === 'disposed') return;
    if (state.activeOperations.size > 0) {
      state.disposeRequested = true;
      return;
    }
    state.phase = 'disposed';
    issuedVoiceHandles.delete(handle);
    state.deferred?.dispose();
    state.releaseExternal?.();
    state.releaseExternal = undefined;
    state.releaseBinding?.();
    state.releaseBinding = undefined;
  };

  const voiceResponseReadbackMatches = async (
    state: VoiceHandleState,
    committed = state.responseCommit,
  ): Promise<boolean> => {
    if (committed?.kind !== 'committed' || !committed.value.committed || !state.deferred) {
      return false;
    }
    const expected = committed.value;
    const [runRow, message, artifactRows, eventRows] = await Promise.all([
      input.db.jarvis_runs.get(state.turnInput.run.id),
      input.db.messages.get(expected.message.id),
      input.db.jarvis_artifacts.bulkGet(expected.artifacts.map((artifact) => artifact.id)),
      input.db.jarvis_events
        .where('[run_id+seq]')
        .between(
          [state.turnInput.run.id, Dexie.minKey],
          [state.turnInput.run.id, Dexie.maxKey],
          true,
          true,
        )
        .toArray(),
    ]);
    if (!runRow || !message || artifactRows.some((row) => row === undefined)) return false;
    const run = fromJarvisRunRow(runRow);
    const responseEvents = eventRows.filter(
      (row) =>
        row.idempotency_key ===
        `voice-response-ready:${state.turnInput.run.id}:${expected.message.id}`,
    );
    if (
      run.accountId !== state.turnInput.accountId ||
      run.source !== 'voice' ||
      run.status !== 'running' ||
      responseEvents.length !== 1
    ) {
      return false;
    }
    try {
      return (
        canonicalizeJarvisApprovalJson(message) ===
          canonicalizeJarvisApprovalJson(expected.message) &&
        canonicalizeJarvisApprovalJson(artifactRows.map((row) => fromJarvisArtifactRow(row!))) ===
          canonicalizeJarvisApprovalJson(expected.artifacts) &&
        canonicalizeJarvisApprovalJson(fromJarvisEventRow(responseEvents[0]!)) ===
          canonicalizeJarvisApprovalJson(expected.event)
      );
    } catch {
      return false;
    }
  };

  const voiceResponseRetryEvidenceMatches = async (state: VoiceHandleState): Promise<boolean> => {
    const deferred = state.deferred;
    if (!deferred) return false;
    const [runRow, eventRows] = await Promise.all([
      input.db.jarvis_runs.get(state.turnInput.run.id),
      input.db.jarvis_events
        .where('[run_id+seq]')
        .between(
          [state.turnInput.run.id, Dexie.minKey],
          [state.turnInput.run.id, Dexie.maxKey],
          true,
          true,
        )
        .toArray(),
    ]);
    if (!runRow) return false;
    const run = fromJarvisRunRow(runRow);
    if (
      run.accountId !== state.turnInput.accountId ||
      run.source !== 'voice' ||
      run.status !== 'running' ||
      eventRows.some((row) => row.type === 'message' && row.status === 'response_ready')
    ) {
      return false;
    }
    const expected = deferred.providerResultSource;
    const matchingStarts = eventRows.filter((row) => {
      const source = row.producer_source_evidence;
      return (
        source?.producerKind === 'provider' &&
        source.phase === 'start' &&
        source.accountId === expected.accountId &&
        source.runId === expected.runId &&
        source.requestId === expected.requestId &&
        source.attemptNumber === expected.attemptNumber &&
        canonicalizeJarvisApprovalJson(source.producerIdentity) ===
          canonicalizeJarvisApprovalJson(expected.producerIdentity)
      );
    });
    return matchingStarts.length === 1;
  };

  const loadVoiceRecoverySnapshot = async (
    accountId: string,
    runId: string,
  ): Promise<VoiceRecoverySnapshot | null> => {
    const run = await repositories.run.getById(accountId, runId);
    if (!run || run.accountId !== accountId || run.source !== 'voice' || run.status !== 'running') {
      return null;
    }
    const events = await repositories.event.listByRun(accountId, runId, { limit: 500 });
    const responseEvents = events.filter(
      (event) => event.type === 'message' && event.status === 'response_ready',
    );
    if (responseEvents.length !== 1) return null;
    const event = responseEvents[0]!;
    const source = event.producerSourceEvidence;
    const prefix = `voice-response-ready:${runId}:`;
    if (
      !event.idempotencyKey.startsWith(prefix) ||
      !source ||
      source.producerKind !== 'provider' ||
      source.phase !== 'result' ||
      source.accountId !== accountId ||
      source.runId !== runId ||
      source.requestId.length === 0 ||
      source.attemptNumber < 1 ||
      (source.state !== 'completed' && source.state !== 'degraded')
    ) {
      return null;
    }
    const providerStarts = events.filter((candidate) => {
      const candidateSource = candidate.producerSourceEvidence;
      return (
        candidate.seq < event.seq &&
        candidate.type === 'model' &&
        candidate.status === 'started' &&
        candidateSource?.producerKind === 'provider' &&
        candidateSource.phase === 'start'
      );
    });
    const latestProviderStart = providerStarts.at(-1)?.producerSourceEvidence;
    if (
      !latestProviderStart ||
      latestProviderStart.producerKind !== 'provider' ||
      latestProviderStart.accountId !== accountId ||
      latestProviderStart.runId !== runId ||
      latestProviderStart.requestId !== source.requestId ||
      latestProviderStart.attemptNumber !== source.attemptNumber ||
      canonicalizeJarvisApprovalJson(latestProviderStart.producerIdentity) !==
        canonicalizeJarvisApprovalJson(source.producerIdentity)
    ) {
      return null;
    }
    const messageId = event.idempotencyKey.slice(prefix.length);
    if (!messageId || messageId.trim() !== messageId || run.chatId === undefined) return null;
    const [message, artifactRows] = await Promise.all([
      input.db.messages.get(messageId as Message['id']),
      input.db.jarvis_artifacts.bulkGet(event.artifactIds),
    ]);
    if (
      !message ||
      message.role !== 'assistant' ||
      message.chat_id !== run.chatId ||
      artifactRows.some((row) => row === undefined)
    ) {
      return null;
    }
    const artifacts = artifactRows.map((row) => fromJarvisArtifactRow(row!));
    if (
      artifacts.some(
        (artifact) =>
          artifact.runId !== runId ||
          artifact.requestId !== source.requestId ||
          artifact.attemptNumber !== source.attemptNumber,
      )
    ) {
      return null;
    }
    return Object.freeze({
      accountId,
      runId,
      requestId: source.requestId,
      attemptNumber: source.attemptNumber,
      event: Object.freeze(structuredClone(event)),
      message: Object.freeze(structuredClone(message)),
      artifacts: Object.freeze(artifacts.map((artifact) => Object.freeze(artifact))),
    });
  };

  const sameVoiceRecoverySnapshot = (
    left: VoiceRecoverySnapshot,
    right: VoiceRecoverySnapshot | null,
  ): boolean => {
    if (!right) return false;
    try {
      return canonicalizeJarvisApprovalJson(left) === canonicalizeJarvisApprovalJson(right);
    } catch {
      return false;
    }
  };

  const finishVoiceRecoveryDisposal = (
    handle: JarvisVoiceRecoveryHandle,
    state: VoiceRecoveryHandleState,
  ): void => {
    if (state.disposed) return;
    state.disposed = true;
    issuedVoiceRecoveryHandles.delete(handle);
    state.releaseBinding?.();
    state.releaseBinding = undefined;
  };

  const issueVoiceRecoveryHandle = (
    binding: JarvisKernelAccountBinding,
    snapshot: VoiceRecoverySnapshot,
  ): JarvisVoiceRecoveryHandle => {
    const releaseBinding = retainAccountBinding(binding);
    let handle: JarvisVoiceRecoveryHandle;
    handle = Object.freeze({
      async commitRecoveredPartial(
        this: JarvisVoiceRecoveryHandle,
      ): Promise<JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>> {
        const state = voiceRecoveryHandleStates.get(this);
        if (!state || !issuedVoiceRecoveryHandles.has(this)) {
          throw new Error('voice_recovery_handle_invalid');
        }
        if (state.disposed || state.activeOperation) {
          throw new Error('voice_recovery_handle_phase_conflict');
        }
        const operation = (async (): Promise<
          JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>
        > => {
          state.binding.assertCurrent();
          const fresh = await loadVoiceRecoverySnapshot(
            state.snapshot.accountId,
            state.snapshot.runId,
          );
          state.binding.assertCurrent();
          if (!sameVoiceRecoverySnapshot(state.snapshot, fresh)) {
            throw new Error('voice_recovery_evidence_invalid');
          }
          const commit = await artifacts.commitKernelTurn.commitVoicePlayback({
            accountId: state.snapshot.accountId,
            runId: state.snapshot.runId,
            requestId: state.snapshot.requestId,
            attemptNumber: state.snapshot.attemptNumber,
            accountBinding: state.binding,
            terminalStatus: 'partial',
            terminalKind: 'recovery',
            createdAt: input.now(),
          });
          if (!commit.committed && commit.reason === 'account_authority_revoked') {
            return { kind: 'account_authority_revoked' };
          }
          return { kind: 'committed', value: commit };
        })();
        state.activeOperation = operation;
        try {
          return await operation;
        } catch (error) {
          if (state.binding.revocationSignal.aborted) {
            return { kind: 'account_authority_revoked' };
          }
          throw error;
        } finally {
          state.activeOperation = undefined;
          finishVoiceRecoveryDisposal(this, state);
        }
      },
      dispose(this: JarvisVoiceRecoveryHandle) {
        const state = voiceRecoveryHandleStates.get(this);
        if (!state) throw new Error('voice_recovery_handle_invalid');
        if (state.disposed) return;
        if (!issuedVoiceRecoveryHandles.has(this)) {
          throw new Error('voice_recovery_handle_invalid');
        }
        if (state.activeOperation) return;
        finishVoiceRecoveryDisposal(this, state);
      },
    });
    issuedVoiceRecoveryHandles.add(handle);
    voiceRecoveryHandleStates.set(handle, {
      binding,
      snapshot,
      releaseBinding,
      disposed: false,
      activeOperation: undefined,
    });
    return handle;
  };

  const appendVoiceRuntimeEvent = async (
    state: VoiceHandleState,
    event: Omit<JarvisEvent, 'runId' | 'seq'>,
  ): Promise<JarvisEvent> => {
    state.binding.assertCurrent();
    const transaction = await transactionAuthority.lifecycleTransaction(
      ['jarvis_runs', 'jarvis_events'],
      state.binding.revocationSignal,
      async (context) => {
        state.binding.assertCurrent();
        const runRow = await context.jarvis_runs.get(state.turnInput.run.id);
        if (!runRow || runRow.account_id !== state.turnInput.accountId) {
          throw new Error('voice_playback_run_scope_mismatch');
        }
        const run = fromJarvisRunRow(runRow);
        if (run.status !== 'running' || run.source !== 'voice') {
          throw new Error('voice_handle_phase_conflict');
        }
        const tail = await lastEvent(context, state.turnInput.run.id);
        state.binding.assertCurrent();
        const candidate = {
          ...event,
          runId: state.turnInput.run.id,
          seq: terminalEventSequence(tail),
        };
        const row = toJarvisEventRow(candidate);
        await context.jarvis_events.add(row);
        return fromJarvisEventRow(row);
      },
    );
    if (transaction.kind === 'cancelled') {
      throw new Error('kernel_account_authority_revoked');
    }
    return transaction.value;
  };

  const executeConfiguredVoicePlayback = async (
    state: VoiceHandleState,
    spokenText: string,
  ): Promise<JarvisVoicePlaybackAdapterResult | null> => {
    const adapter = input.voicePlaybackAdapter;
    const startAuthority = input.voiceLiveEvidenceStartAuthority;
    if (!adapter || !startAuthority) return null;
    let controller: JarvisVoicePlaybackController | null;
    try {
      controller = adapter.prepare({
        accountId: state.turnInput.accountId,
        runId: state.turnInput.run.id,
        requestId: state.turnInput.attempt.requestId,
        attemptNumber: state.turnInput.attempt.attemptNumber,
        spokenText,
      });
    } catch {
      return null;
    }
    if (!controller) return null;
    const receipt = controller.receipt;
    const stable = (value: string): boolean =>
      value.length > 0 && value.trim() === value && !value.includes('\u0000');
    if (
      !Object.isFrozen(controller) ||
      !Object.isFrozen(receipt) ||
      !stable(receipt.sessionId) ||
      !stable(receipt.engineId) ||
      !stable(receipt.ttsExecutionId) ||
      !stable(receipt.playbackExecutionId) ||
      !Number.isFinite(receipt.ttsStartedAt) ||
      !Number.isFinite(receipt.playbackStartedAt) ||
      receipt.playbackStartedAt < receipt.ttsStartedAt
    ) {
      controller.dispose();
      return null;
    }

    const ownerOutcome = (ownerId: string) => {
      const kind = controller!.abort();
      return kind === 'signal_delivered'
        ? ({ kind, ownerId } as const)
        : kind === 'handoff_pending'
          ? ({ kind, ownerId } as const)
          : kind === 'unsupported'
            ? ({ kind, ownerId } as const)
            : kind === 'delivery_rejected'
              ? ({ kind, ownerId } as const)
              : ({ kind: 'already_exited' as const, ownerId } as const);
    };
    const ttsOwnerId = `${state.turnInput.run.id}:tts`;
    const playbackOwnerId = `${state.turnInput.run.id}:playback`;
    const unregisterTts = input.abortRegistrationAuthority.registerIssuedOwner({
      accountId: state.turnInput.accountId,
      runId: state.turnInput.run.id,
      registrationId: ttsOwnerId,
      kind: 'tts_generation',
      abort: () => ownerOutcome(ttsOwnerId),
    });
    const unregisterPlayback = input.abortRegistrationAuthority.registerIssuedOwner({
      accountId: state.turnInput.accountId,
      runId: state.turnInput.run.id,
      registrationId: playbackOwnerId,
      kind: 'audio_playback',
      abort: () => ownerOutcome(playbackOwnerId),
    });
    const registrations: JarvisLiveEvidenceRegistration<'voice'>[] = [];
    const activeReceiptReleases: Array<() => void> = [];
    try {
      const scope = {
        accountId: state.turnInput.accountId,
        runId: state.turnInput.run.id,
        requestId: state.turnInput.attempt.requestId,
        attemptNumber: state.turnInput.attempt.attemptNumber,
      };
      const liveOwner = liveEvidence.bindLifecycle({
        scope,
        append: Object.freeze({
          async append({ evidence }: { evidence: JarvisDurableLiveEvidenceV1 }) {
            return appendVoiceRuntimeEvent(state, {
              idempotencyKey: `kernel-live:${evidence.registrationId}:${evidence.transition}:${evidence.resultRef}`,
              type: 'tool',
              status: evidence.transition,
              title: 'Voice evidence updated',
              safeSummary: 'Verified voice execution evidence was updated.',
              sourceRefs: [],
              artifactIds: [],
              createdAt: evidence.observedAt,
              liveEvidence: evidence,
            });
          },
        }),
      });

      const startEngine = async (engineKind: 'tts' | 'playback') => {
        const executionId =
          engineKind === 'tts' ? receipt.ttsExecutionId : receipt.playbackExecutionId;
        const observedAt = engineKind === 'tts' ? receipt.ttsStartedAt : receipt.playbackStartedAt;
        const resultRef = `voice-${engineKind}-start:${executionId}`;
        const producerIdentity = {
          producerKind: 'voice' as const,
          sessionId: receipt.sessionId,
          engineKind,
          executionId,
        };
        const source: Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'voice' }> = {
          schemaVersion: 1,
          ...scope,
          producerKind: 'voice',
          producerIdentity,
          resultRef,
          observedAt,
          phase: 'start',
          state: 'started',
        };
        const releaseActiveReceipt = startAuthority.authorizeStart(source);
        activeReceiptReleases.push(releaseActiveReceipt);
        const event = await appendVoiceRuntimeEvent(state, {
          idempotencyKey: `voice-${engineKind}-start:${state.turnInput.run.id}:${executionId}`,
          type: engineKind === 'tts' ? 'model' : 'terminal',
          status: 'running',
          title: engineKind === 'tts' ? 'Voice synthesis started' : 'Voice playback started',
          safeSummary: 'A voice response phase started.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: observedAt,
          producerSourceEvidence: source,
        });
        const evidence: JarvisCanonicalLiveProducerEvidence<'voice'> = Object.freeze({
          schemaVersion: 1,
          producerKind: 'voice',
          producerIdentity,
          ...scope,
          resultRef,
          resultEventSeq: event.seq,
          state: 'busy',
          verifiedAt: observedAt,
        });
        const registration = await liveOwner.voice.startCapability({
          evidence,
          registrationId: `${state.turnInput.run.id}:${engineKind}`,
          category: 'tool',
          capabilityId: `voice.${engineKind}`,
          operations: ['execute', 'cancel', 'inspect'],
          state: 'busy',
        });
        registrations.push(registration);
        return { registration, producerIdentity };
      };

      const tts = await startEngine('tts');
      const playback = await startEngine('playback');
      const result = await controller.start();
      const validEngineResult = (engineResult: JarvisVoicePlaybackEngineResult): boolean =>
        engineResult.state === 'completed'
          ? !('reason' in engineResult)
          : engineResult.reason === 'unavailable' ||
            engineResult.reason === 'failed' ||
            engineResult.reason === 'stopped';
      if (
        !Object.isFrozen(result) ||
        !Object.isFrozen(result.tts) ||
        !Object.isFrozen(result.playback) ||
        !controller.verify(result) ||
        !stable(result.tts.resultRef) ||
        !stable(result.playback.resultRef) ||
        !Number.isFinite(result.tts.observedAt) ||
        !Number.isFinite(result.playback.observedAt) ||
        !validEngineResult(result.tts) ||
        !validEngineResult(result.playback) ||
        result.tts.observedAt < receipt.ttsStartedAt ||
        result.playback.observedAt < receipt.playbackStartedAt ||
        (result.terminalStatus === 'completed' &&
          (result.tts.state !== 'completed' || result.playback.state !== 'completed')) ||
        (result.terminalStatus === 'partial' &&
          result.tts.state === 'completed' &&
          result.playback.state === 'completed')
      ) {
        throw new Error('voice_playback_result_invalid');
      }

      const finishEngine = async (
        engineKind: 'tts' | 'playback',
        engine: typeof tts,
        engineResult: JarvisVoicePlaybackAdapterResult['tts'],
      ): Promise<Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'voice' }>> => {
        const source: Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'voice' }> = {
          schemaVersion: 1,
          ...scope,
          producerKind: 'voice',
          producerIdentity: engine.producerIdentity,
          resultRef: engineResult.resultRef,
          observedAt: engineResult.observedAt,
          phase: 'result',
          state: engineResult.state,
        };
        const event = await appendVoiceRuntimeEvent(state, {
          idempotencyKey: `voice-${engineKind}-result:${state.turnInput.run.id}:${engineResult.resultRef}`,
          type: engineKind === 'tts' ? 'model' : 'terminal',
          status: engineResult.state,
          title:
            engineKind === 'tts'
              ? engineResult.state === 'completed'
                ? 'Voice synthesis completed'
                : 'Voice synthesis degraded'
              : engineResult.state === 'completed'
                ? 'Voice playback completed'
                : 'Voice playback degraded',
          safeSummary: 'A voice response phase reached a verified outcome.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: engineResult.observedAt,
          producerSourceEvidence: source,
        });
        const evidence: JarvisCanonicalLiveProducerEvidence<'voice'> = Object.freeze({
          schemaVersion: 1,
          producerKind: 'voice',
          producerIdentity: engine.producerIdentity,
          ...scope,
          resultRef: engineResult.resultRef,
          resultEventSeq: event.seq,
          state: engineResult.state,
          verifiedAt: engineResult.observedAt,
        });
        await engine.registration.complete({ evidence, state: engineResult.state });
        return Object.freeze(structuredClone(source));
      };
      await finishEngine('tts', tts, result.tts);
      state.playbackResultSource = await finishEngine('playback', playback, result.playback);
      return result;
    } finally {
      for (const registration of registrations) registration.dispose();
      for (const release of activeReceiptReleases) release();
      unregisterPlayback();
      unregisterTts();
      controller.dispose();
    }
  };

  const voicePlaybackCancellationVerified = async (
    state: VoiceHandleState,
    playback: JarvisVoicePlaybackAdapterResult | null,
  ): Promise<boolean> => {
    const cancellation = state.cancellationResult;
    if (
      cancellation?.kind !== 'intent_committed' ||
      cancellation.aggregate.kind !== 'signal_delivered' ||
      !playback ||
      playback.terminalStatus !== 'partial'
    ) {
      return false;
    }
    let currentDelivery: CancellationDelivery;
    try {
      currentDelivery = await input.cancellationDeliveryAuthority.current(
        state.turnInput.accountId,
        state.turnInput.run.id,
        cancellation.cancellationRequestId,
      );
    } catch {
      return false;
    }
    if (cancellationAggregate(currentDelivery).kind !== 'signal_delivered') return false;
    const outcomes = [playback.tts, playback.playback];
    return (
      outcomes.some((outcome) => outcome.state === 'degraded' && outcome.reason === 'stopped') &&
      outcomes.every((outcome) => outcome.state === 'completed' || outcome.reason === 'stopped')
    );
  };

  const issueVoiceHandle = (
    binding: JarvisKernelAccountBinding,
    turnInput: Readonly<JarvisKernelTurnInput> & { surface: 'voice' },
  ): JarvisVoiceTurnHandle => {
    const releaseBinding = retainAccountBinding(binding);
    let handle: JarvisVoiceTurnHandle;
    handle = Object.freeze({
      [jarvisVoiceTurnHandleBrand]: true as const,
      async requestCancellation(
        this: JarvisVoiceTurnHandle,
      ): Promise<JarvisCancellationRequestResult> {
        const state = voiceHandleState(this);
        if (state.cancellationResult) return state.cancellationResult;
        if (state.cancellationOperation) return state.cancellationOperation;
        state.cancellationRequested = true;
        const operation = requestCancellationWithBinding(state.binding, {
          accountId: state.turnInput.accountId,
          runId: state.turnInput.run.id,
        }).then((result) => {
          state.cancellationResult = Object.freeze(result);
          return state.cancellationResult;
        });
        state.cancellationOperation = operation;
        state.activeOperations.add(operation);
        try {
          return await operation;
        } finally {
          if (state.cancellationOperation === operation) state.cancellationOperation = undefined;
          state.activeOperations.delete(operation);
          if (state.disposeRequested && state.activeOperations.size === 0) {
            finishVoiceHandleDisposal(this, state);
          }
        }
      },
      async commitResponseReady(
        this: JarvisVoiceTurnHandle,
      ): Promise<JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>> {
        const state = voiceHandleState(this);
        if (state.phase === 'response_ready_committed' && state.responseCommit) {
          return state.responseCommit;
        }
        if (state.responseCommitOperation) return state.responseCommitOperation;
        if (state.phase !== 'response_pending' || !state.deferred) {
          throw new Error('voice_handle_phase_conflict');
        }
        state.phase = 'response_commit_in_flight';
        const operation = (async (): Promise<
          JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>
        > => {
          const commitDeferred = async (
            deferred: JarvisDeferredVoiceKernelTurnResult,
          ): Promise<JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>> => {
            const commit = await artifacts.commitKernelTurn.commitVoiceResponseReady({
              accountId: state.turnInput.accountId,
              runId: state.turnInput.run.id,
              requestId: state.turnInput.attempt.requestId,
              attemptNumber: state.turnInput.attempt.attemptNumber,
              accountBinding: state.binding,
              assistantMessage: structuredClone(deferred.assistantMessage),
              artifacts: deferred.artifacts,
              providerResultSource: deferred.providerResultSource,
              createdAt: deferred.response.completedAt,
            });
            return !commit.committed && commit.reason === 'account_authority_revoked'
              ? { kind: 'account_authority_revoked' }
              : { kind: 'committed', value: commit };
          };
          let commitOutcome: JarvisAuthorityBoundResult<VoiceResponseReadyCommitResult>;
          try {
            commitOutcome = await commitDeferred(state.deferred!);
          } catch (error) {
            state.binding.assertCurrent();
            if (!(await voiceResponseRetryEvidenceMatches(state))) throw error;
            state.deferred = await state.deferred!.rematerializeForRetry();
            state.binding.assertCurrent();
            commitOutcome = await commitDeferred(state.deferred);
          }
          if (commitOutcome.kind === 'account_authority_revoked') return commitOutcome;
          const commit = commitOutcome.value;
          if (!commit.committed) {
            return { kind: 'committed', value: commit };
          }
          const providerEvidence = await state.deferred!.completeProviderEvidence();
          if (providerEvidence.kind === 'account_authority_revoked') return providerEvidence;
          const result = Object.freeze({ kind: 'committed' as const, value: commit });
          if (!(await voiceResponseReadbackMatches(state, result))) {
            throw new Error('voice_response_ready_readback_mismatch');
          }
          return result;
        })();
        state.responseCommitOperation = operation;
        state.activeOperations.add(operation);
        try {
          const result = await operation;
          if (result.kind === 'committed' && result.value.committed) {
            state.phase = 'response_ready_committed';
            state.responseCommit = Object.freeze(result);
            return state.responseCommit;
          }
          state.disposeRequested = true;
          finishVoiceHandleDisposal(this, state);
          return result;
        } catch (error) {
          const authorityWasRevoked = state.binding.revocationSignal.aborted;
          state.disposeRequested = true;
          finishVoiceHandleDisposal(this, state);
          if (authorityWasRevoked) {
            return { kind: 'account_authority_revoked' };
          }
          throw error;
        } finally {
          if (state.responseCommitOperation === operation) {
            state.responseCommitOperation = undefined;
          }
          state.activeOperations.delete(operation);
          if (state.disposeRequested && state.activeOperations.size === 0) {
            finishVoiceHandleDisposal(this, state);
          }
        }
      },
      async runValidatedPlayback(
        this: JarvisVoiceTurnHandle,
      ): Promise<JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>> {
        const state = voiceHandleState(this);
        if (state.phase !== 'response_ready_committed') {
          throw new Error('voice_handle_phase_conflict');
        }
        state.phase = 'playback_in_flight';
        const operation = (async (): Promise<
          JarvisAuthorityBoundResult<JarvisVoicePlaybackCommitResult>
        > => {
          if (!(await voiceResponseReadbackMatches(state))) {
            throw new Error('voice_handle_phase_conflict');
          }
          if (state.cancellationRequested) {
            if (state.cancellationOperation) await state.cancellationOperation;
            throw new Error('voice_cancellation_unverified');
          }
          state.binding.assertCurrent();
          const spokenText = state.deferred?.response.spokenText;
          const playback =
            typeof spokenText === 'string' && spokenText.trim().length > 0
              ? await executeConfiguredVoicePlayback(state, spokenText)
              : null;
          if (state.cancellationOperation) await state.cancellationOperation;
          const cancellationVerified = await voicePlaybackCancellationVerified(state, playback);
          if (
            state.cancellationRequested &&
            !cancellationVerified &&
            playback?.terminalStatus !== 'completed'
          ) {
            throw new Error('voice_cancellation_unverified');
          }
          const terminalStatus = cancellationVerified
            ? ('cancelled' as const)
            : (playback?.terminalStatus ?? 'partial');
          state.binding.assertCurrent();
          const commit = await artifacts.commitKernelTurn.commitVoicePlayback({
            accountId: state.turnInput.accountId,
            runId: state.turnInput.run.id,
            requestId: state.turnInput.attempt.requestId,
            attemptNumber: state.turnInput.attempt.attemptNumber,
            accountBinding: state.binding,
            terminalStatus,
            ...(state.playbackResultSource === undefined
              ? {}
              : { playbackResultSource: state.playbackResultSource }),
            createdAt: input.now(),
          });
          if (!commit.committed && commit.reason === 'account_authority_revoked') {
            return { kind: 'account_authority_revoked' };
          }
          return { kind: 'committed', value: commit };
        })();
        state.activeOperations.add(operation);
        try {
          return await operation;
        } catch (error) {
          if (state.binding.revocationSignal.aborted) {
            return { kind: 'account_authority_revoked' };
          }
          throw error;
        } finally {
          state.disposeRequested = true;
          state.activeOperations.delete(operation);
          if (state.activeOperations.size === 0) finishVoiceHandleDisposal(this, state);
        }
      },
      dispose(this: JarvisVoiceTurnHandle) {
        const state = voiceHandleStates.get(this);
        if (!state) throw new Error('voice_handle_invalid');
        if (state.phase === 'disposed') return;
        if (!issuedVoiceHandles.has(this)) throw new Error('voice_handle_invalid');
        if (state.activeOperations.size > 0) {
          state.disposeRequested = true;
          return;
        }
        finishVoiceHandleDisposal(this, state);
      },
    });
    issuedVoiceHandles.add(handle);
    const state: VoiceHandleState = {
      binding,
      turnInput,
      releaseBinding,
      releaseExternal: undefined,
      deferred: undefined,
      phase: 'starting',
      disposeRequested: false,
      responseCommit: undefined,
      responseCommitOperation: undefined,
      activeOperations: new Set(),
      cancellationRequested: false,
      cancellationOperation: undefined,
      cancellationResult: undefined,
      playbackResultSource: undefined,
    };
    voiceHandleStates.set(handle, state);
    try {
      state.releaseExternal = input.onVoiceTurnHandleIssued?.({
        runId: turnInput.run.id,
        handle,
      });
    } catch (error) {
      finishVoiceHandleDisposal(handle, state);
      throw error;
    }
    return handle;
  };

  const actions: JarvisKernelActionPort = Object.freeze({
    async create(actionInput: Parameters<JarvisKernelActionPort['create']>[0]) {
      const scope = await loadCanonicalActionScope(actionInput.parentRun, actionInput.attempt);
      return invokeActionCapability(scope, (capability, parentRun) =>
        capability.create({ ...actionInput, parentRun }),
      );
    },
    async decide(actionInput: Parameters<JarvisKernelActionPort['decide']>[0]) {
      const scope = await loadCanonicalActionScope(actionInput.parentRun);
      return invokeActionCapability(scope, (capability, parentRun) =>
        capability.decide({ ...actionInput, parentRun }),
      );
    },
    async execute(actionInput: Parameters<JarvisKernelActionPort['execute']>[0]) {
      const scope = await loadCanonicalActionScope(actionInput.parentRun);
      return invokeActionCapability(scope, (capability, parentRun) =>
        capability.execute({ ...actionInput, parentRun }),
      );
    },
    async executeAutoApprovedSafe(
      actionInput: Parameters<JarvisKernelActionPort['executeAutoApprovedSafe']>[0],
    ) {
      const scope = await loadCanonicalActionScope(actionInput.parentRun, actionInput.attempt);
      return invokeActionCapability(scope, (capability, parentRun) =>
        capability.executeAutoApprovedSafe({ ...actionInput, parentRun }),
      );
    },
  });
  const kernel: JarvisKernelRuntime = Object.freeze({
    actions,
    async openVoiceRecovery(recoveryInput: {
      accountId: string;
      runId: string;
    }): Promise<JarvisAuthorityBoundResult<JarvisVoiceRecoveryHandle>> {
      if (
        !recoveryInput.accountId ||
        recoveryInput.accountId.trim() !== recoveryInput.accountId ||
        !recoveryInput.runId ||
        recoveryInput.runId.trim() !== recoveryInput.runId
      ) {
        throw new TypeError('voice_recovery_scope_invalid');
      }
      let binding: JarvisKernelAccountBinding;
      try {
        binding = issueAccountBinding(recoveryInput.accountId);
      } catch {
        return { kind: 'account_authority_revoked' };
      }
      try {
        const snapshot = await loadVoiceRecoverySnapshot(
          recoveryInput.accountId,
          recoveryInput.runId,
        );
        binding.assertCurrent();
        if (!snapshot) throw new Error('voice_recovery_evidence_invalid');
        return {
          kind: 'committed',
          value: issueVoiceRecoveryHandle(binding, snapshot),
        };
      } catch (error) {
        if (binding.revocationSignal.aborted) {
          return { kind: 'account_authority_revoked' };
        }
        throw error;
      } finally {
        binding.dispose();
      }
    },
    async startVoiceTurn(
      turnInput: Readonly<JarvisKernelTurnInput> & { surface: 'voice' },
    ): Promise<
      JarvisAuthorityBoundResult<{
        result: JarvisKernelTurnResult;
        handle: JarvisVoiceTurnHandle;
      }>
    > {
      if (turnInput.surface !== 'voice' || turnInput.run.source !== 'voice') {
        throw new Error('kernel_voice_turn_scope_mismatch');
      }
      let binding: JarvisKernelAccountBinding;
      try {
        binding = issueAccountBinding(turnInput.accountId);
      } catch {
        return { kind: 'account_authority_revoked' };
      }
      let handle: JarvisVoiceTurnHandle | undefined;
      try {
        handle = issueVoiceHandle(binding, turnInput);
        const boundArtifactEffectClaims: JarvisArtifactEffectClaimCapability = Object.freeze({
          async claim(claim: Parameters<JarvisArtifactEffectClaimCapability['claim']>[0]) {
            binding.assertCurrent();
            if (
              claim.accountId !== turnInput.accountId ||
              claim.runId !== turnInput.run.id ||
              claim.requestId !== turnInput.attempt.requestId ||
              claim.attemptNumber !== turnInput.attempt.attemptNumber
            ) {
              throw new Error('kernel_artifact_effect_scope_mismatch');
            }
            const result = await artifactEffectClaims.claim(claim);
            binding.assertCurrent();
            return result;
          },
        });
        const result = await runJarvisKernelVoiceTurn(turnInput, {
          journal: input.journal,
          issueBoundLifecycle(scope) {
            if (
              scope.accountId !== turnInput.accountId ||
              scope.runId !== turnInput.run.id ||
              scope.requestId !== turnInput.attempt.requestId ||
              scope.attemptNumber !== turnInput.attempt.attemptNumber
            ) {
              throw new Error('kernel_lifecycle_scope_mismatch');
            }
            return issueLifecycle(binding, scope);
          },
          issueBoundArtifactPipeline: artifacts.issueBoundArtifactPipeline,
          artifactEffectClaims: boundArtifactEffectClaims,
          takeProviderArtifactDrafts: input.takeProviderArtifactDrafts,
          commitKernelTurn(commitInput) {
            return artifacts.commitKernelTurn.commitKernelTurn({
              ...commitInput,
              accountBinding: binding,
            });
          },
          prepareProvider: input.prepareProvider,
          processResponse: input.processResponse,
          now: input.now,
        });
        const state = voiceHandleStates.get(handle);
        if (!state) throw new Error('voice_handle_invalid');
        if (result.kind === 'account_authority_revoked') {
          finishVoiceHandleDisposal(handle, state);
          return result;
        }
        state.deferred = result.value;
        state.phase = 'response_pending';
        const { request, compiled, response, messageParts } = result.value;
        return {
          kind: 'committed',
          value: Object.freeze({
            result: Object.freeze({ request, compiled, response, messageParts }),
            handle,
          }),
        };
      } catch (error) {
        const authorityWasRevoked = binding.revocationSignal.aborted;
        if (handle) {
          const state = voiceHandleStates.get(handle);
          if (state) finishVoiceHandleDisposal(handle, state);
        }
        if (authorityWasRevoked) {
          return { kind: 'account_authority_revoked' };
        }
        throw error;
      } finally {
        binding.dispose();
      }
    },
    async runInitialTurn(
      turnInput: Readonly<JarvisKernelTurnInput>,
    ): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>> {
      let binding: JarvisKernelAccountBinding;
      try {
        binding = issueAccountBinding(turnInput.accountId);
      } catch {
        return { kind: 'account_authority_revoked' as const };
      }
      try {
        const boundArtifactEffectClaims: JarvisArtifactEffectClaimCapability = Object.freeze({
          async claim(claim: Parameters<JarvisArtifactEffectClaimCapability['claim']>[0]) {
            binding.assertCurrent();
            if (
              claim.accountId !== turnInput.accountId ||
              claim.runId !== turnInput.run.id ||
              claim.requestId !== turnInput.attempt.requestId ||
              claim.attemptNumber !== turnInput.attempt.attemptNumber
            ) {
              throw new Error('kernel_artifact_effect_scope_mismatch');
            }
            const result = await artifactEffectClaims.claim(claim);
            binding.assertCurrent();
            return result;
          },
        });
        return await runJarvisKernelTurn(turnInput, {
          journal: input.journal,
          issueBoundLifecycle(scope) {
            if (
              scope.accountId !== turnInput.accountId ||
              scope.runId !== turnInput.run.id ||
              scope.requestId !== turnInput.attempt.requestId ||
              scope.attemptNumber !== turnInput.attempt.attemptNumber
            ) {
              throw new Error('kernel_lifecycle_scope_mismatch');
            }
            return issueLifecycle(binding, scope);
          },
          issueBoundArtifactPipeline: artifacts.issueBoundArtifactPipeline,
          artifactEffectClaims: boundArtifactEffectClaims,
          takeProviderArtifactDrafts: input.takeProviderArtifactDrafts,
          commitKernelTurn(commitInput) {
            return artifacts.commitKernelTurn.commitKernelTurn({
              ...commitInput,
              accountBinding: binding,
            });
          },
          prepareProvider: input.prepareProvider,
          processResponse: input.processResponse,
          now: input.now,
        });
      } finally {
        binding.dispose();
      }
    },
    async requestCancellation(cancelInput: {
      accountId: string;
      runId: string;
    }): Promise<JarvisCancellationRequestResult> {
      let binding: JarvisKernelAccountBinding;
      try {
        binding = issueAccountBinding(cancelInput.accountId);
      } catch {
        return { kind: 'authority_revoked_before_intent' };
      }
      try {
        return await requestCancellationWithBinding(binding, cancelInput);
      } finally {
        binding.dispose();
      }
    },
    async prepareScheduledAttempt() {
      return failNotReady();
    },
    async beginPreparedScheduledAttempt() {
      return failNotReady();
    },
    async dispatchPreparedScheduledAttempt() {
      return failNotReady();
    },
    async settleScheduledTransportFailure() {
      return failNotReady();
    },
    disposeScheduledAttempt() {
      failNotReady();
    },
  });

  return Object.freeze({
    kernel,
    liveEvidenceHost: createPrimaryHostLifecycle(liveEvidence),
  });
}
