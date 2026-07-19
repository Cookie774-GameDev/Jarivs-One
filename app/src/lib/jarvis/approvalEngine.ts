import type {
  ActionResult,
  ActionRunContext,
  RegisteredActionExecutionContext,
} from '@/lib/actions/types';
import type { JarvisApprovalRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import type { JarvisEntitlementSnapshotProvider } from '@/lib/admin';
import type {
  JarvisApprovalV1,
  JarvisAuthorityBoundResult,
  JarvisCancellationRequestResult,
  JarvisCapabilitySnapshot,
  JarvisEntitlementSnapshot,
  JarvisEvent,
  JarvisRecoveryApprovalVerifier,
  JarvisRun,
} from '@/lib/jarvis/contracts';
import type { JarvisLiveEvidenceProof } from '@/lib/jarvis/contracts/execution';
import type { JarvisCapabilitySnapshotProvider } from '@/lib/jarvis/capabilitySnapshot';
import type {
  JarvisActionCatalog,
  JarvisCanonicalActionTarget,
  JarvisRegisteredActionDefinition,
} from '@/lib/jarvis/actions/catalog';
import type { JarvisRequestAttempt } from '@/lib/jarvis/requestEnvelope';
import type { JarvisSecretHandlePort } from '@/lib/jarvis/secretHandlePort';

export interface JarvisApprovalBindingSelectors {
  loadCapabilitySnapshot(accountId: string): Promise<Readonly<JarvisCapabilitySnapshot>>;
  loadEntitlementSnapshot(accountId: string): Promise<Readonly<JarvisEntitlementSnapshot>>;
  deriveTargetSnapshot(input: {
    accountId: string;
    actionId: string;
    actionVersion: number;
    params: Readonly<Record<string, unknown>>;
  }): Promise<JarvisCanonicalActionTarget>;
}

export function createJarvisApprovalBindingSelectors(input: {
  catalog: JarvisActionCatalog;
  capabilitySnapshots: JarvisCapabilitySnapshotProvider;
  entitlementSnapshots: JarvisEntitlementSnapshotProvider;
}): JarvisApprovalBindingSelectors {
  return Object.freeze({
    async loadCapabilitySnapshot(accountId: string) {
      return structuredClone(await input.capabilitySnapshots.getForAccount(accountId));
    },
    async loadEntitlementSnapshot(accountId: string) {
      return structuredClone(await input.entitlementSnapshots.getForAccount(accountId));
    },
    async deriveTargetSnapshot(targetInput: {
      accountId: string;
      actionId: string;
      actionVersion: number;
      params: Readonly<Record<string, unknown>>;
    }) {
      const registration = input.catalog.resolve(targetInput.actionId);
      if (!registration) approvalError('action_unavailable');
      if (registration.version !== targetInput.actionVersion) {
        approvalError('action_version_changed');
      }

      // Both account-scoped providers must still recognize the same account at
      // the target-derivation boundary. Their returned values are intentionally
      // discarded here; the engine hashes fresh detached copies separately.
      await Promise.all([
        input.capabilitySnapshots.getForAccount(targetInput.accountId),
        input.entitlementSnapshots.getForAccount(targetInput.accountId),
      ]);
      return structuredClone(
        registration.deriveTarget({
          accountId: targetInput.accountId,
          params: structuredClone(targetInput.params),
        }),
      );
    },
  });
}

export type JarvisCanonicalActionExecutionResult =
  | { kind: 'settled'; result: ActionResult }
  | {
      kind: 'handoff_pending';
      executorKind: 'terminal';
      ownerId: string;
      result: Extract<ActionResult, { ok: true }>;
    };

export type JarvisApprovalErrorCode =
  | 'run_scope_mismatch'
  | 'action_unavailable'
  | 'action_version_changed'
  | 'invalid_parameters'
  | 'secret_value_rejected'
  | 'params_changed'
  | 'target_changed'
  | 'risk_changed'
  | 'capability_changed'
  | 'entitlement_changed'
  | 'expired'
  | 'not_pending'
  | 'not_approved'
  | 'already_consumed'
  | 'secret_handle_invalid'
  | 'secret_handle_scope_mismatch'
  | 'secret_handle_duplicate_field'
  | 'credential_account_unbound'
  | 'credential_account_mismatch'
  | 'credential_grant_stale'
  | 'credential_grant_unavailable'
  | 'credential_grant_storage_conflict'
  | 'credential_grant_storage_failed'
  | 'caller_secret_resolver_rejected';

export class JarvisApprovalError extends Error {
  readonly code: JarvisApprovalErrorCode;

  constructor(code: JarvisApprovalErrorCode) {
    super(`JARVIS approval rejected: ${code}.`);
    this.name = 'JarvisApprovalError';
    this.code = code;
  }
}

class JarvisApprovalAuthorityRevokedError extends Error {
  readonly code = 'account_authority_revoked' as const;

  constructor() {
    super('JARVIS approval account authority was revoked.');
    this.name = 'JarvisApprovalAuthorityRevokedError';
  }
}

function approvalError(code: JarvisApprovalErrorCode): never {
  throw new JarvisApprovalError(code);
}

export type CreateJarvisApprovalInput = {
  parentRun: JarvisRun;
  attempt: JarvisRequestAttempt;
  actionId: string;
  actionVersion: number;
  params: Record<string, unknown>;
  expiresAt: number;
};

type CreateJarvisApprovalEngineInput = CreateJarvisApprovalInput & {
  secretHandleRefs: readonly { field: string; handleId: string }[];
};

type PreparedJarvisApprovalInput = CreateJarvisApprovalEngineInput & {
  approvalId: `jappr_${string}`;
  paramsHash: string;
  targetSnapshot: JarvisCanonicalActionTarget;
  risk: JarvisApprovalV1['risk'];
  capabilityId: string;
  capabilitySnapshotHash: string;
  expectedEffect: string;
  createdAt: number;
};

export type ExecuteJarvisApprovalInput = {
  parentRun: JarvisRun;
  approvalId: string;
  context: ActionRunContext;
};

export interface JarvisApprovalActionCapability {
  create(input: CreateJarvisApprovalInput): Promise<JarvisApprovalV1>;
  decide(input: {
    parentRun: JarvisRun;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<JarvisApprovalV1>;
  execute(input: ExecuteJarvisApprovalInput): Promise<JarvisCanonicalActionExecutionResult>;
  executeAutoApprovedSafe(
    input: CreateJarvisApprovalInput & { context: ActionRunContext },
  ): Promise<JarvisCanonicalActionExecutionResult>;
}

export const jarvisIssuedApprovalLifecycleBrand: unique symbol = Symbol(
  'jarvis.approval-issued-lifecycle',
);

export interface JarvisIssuedApprovalLifecycle {
  readonly accountId: string;
  readonly runId: string;
  readonly requestId: string;
  readonly attemptNumber: number;
  /** Aborted synchronously by dispose(), including for frozen lifecycle objects. */
  readonly revocationSignal: AbortSignal;
  readonly [jarvisIssuedApprovalLifecycleBrand]: true;
  putPreparedApproval(
    input: CreateJarvisApprovalEngineInput,
  ): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  decidePreparedApproval(input: {
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<JarvisAuthorityBoundResult<JarvisApprovalV1>>;
  claimApprovedExecution(input: {
    approvalId: string;
    producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
    ownerId: string;
    evidenceRef: string;
    startedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>>;
  claimAutoApprovedExecution(input: {
    approval: CreateJarvisApprovalEngineInput;
    producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
    ownerId: string;
    evidenceRef: string;
    startedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisIssuedActionExecution>>;
  dispose(): void;
}

export const jarvisIssuedActionExecutionBrand: unique symbol = Symbol(
  'jarvis.approval-issued-execution',
);
export const jarvisTerminalHandoffReceiptBrand: unique symbol = Symbol(
  'jarvis.approval-terminal-handoff-receipt',
);

export interface JarvisTerminalHandoffReceipt {
  readonly executionId: string;
  readonly ownerId: string;
  readonly [jarvisTerminalHandoffReceiptBrand]: true;
}

export interface JarvisTerminalOwnedExecution {
  recordResult(input: {
    state: 'completed' | 'degraded';
    resultRef: string;
    completedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  recordCancellationVerified(input: {
    cancellationRequestId: string;
    resultRef: string;
    verifiedAt: number;
  }): Promise<JarvisAuthorityBoundResult<Readonly<{ run: JarvisRun; event: JarvisEvent }>>>;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
}

export interface JarvisTerminalExecutionAcceptor {
  acceptIssuedExecution(input: {
    executionId: string;
    ownerId: string;
    execution: JarvisTerminalOwnedExecution;
  }): JarvisTerminalHandoffReceipt;
}

export type JarvisStartedExternalEffect<T> = Readonly<{ completion: Promise<T> }>;

export interface JarvisIssuedActionExecution {
  readonly approval: JarvisApprovalV1;
  readonly producerKind: 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp';
  readonly ownerId: string;
  readonly startEvent: JarvisEvent;
  readonly initialLiveProof: JarvisLiveEvidenceProof;
  readonly [jarvisIssuedActionExecutionBrand]: true;
  beginExternalEffect<T>(
    begin: (signal: AbortSignal) => JarvisStartedExternalEffect<T>,
  ): JarvisAuthorityBoundResult<JarvisStartedExternalEffect<T>>;
  transferTerminalOwnership(input: {
    executionId: string;
    acceptor: JarvisTerminalExecutionAcceptor;
  }): JarvisAuthorityBoundResult<JarvisTerminalHandoffReceipt>;
  recordResult(input: {
    state: 'completed' | 'degraded';
    resultRef: string;
    completedAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisLiveEvidenceProof>>;
  recordCancellationVerified(input: {
    cancellationRequestId: string;
    resultRef: string;
    verifiedAt: number;
  }): Promise<
    JarvisAuthorityBoundResult<
      Readonly<{ run: JarvisRun; event: JarvisEvent; proof: JarvisLiveEvidenceProof }>
    >
  >;
  requestCancellation(): Promise<JarvisCancellationRequestResult>;
  dispose(): void;
}

export type JarvisApprovalActionBinder = (
  lifecycle: JarvisIssuedApprovalLifecycle,
) => JarvisApprovalActionCapability;

export type JarvisRegisteredActionDispatchOutcome =
  | { kind: 'executor_returned'; result: ActionResult }
  | {
      kind: 'terminal_handoff_accepted';
      executorKind: 'terminal';
      result: Extract<ActionResult, { ok: true }>;
      ownerId: string;
      receipt: JarvisTerminalHandoffReceipt;
    };

export interface JarvisApprovalEngine {
  readonly recoveryVerifier: JarvisRecoveryApprovalVerifier;
  bindIssuedLifecycle(lifecycle: JarvisIssuedApprovalLifecycle): JarvisApprovalActionCapability;
}

export type JarvisApprovalEngineDependencies = Readonly<{
  runs: Pick<JarvisRunRepository, 'getById'>;
  approvals: Pick<JarvisApprovalRepository, 'getById' | 'listByRun'>;
  catalog: JarvisActionCatalog;
  bindingSelectors: JarvisApprovalBindingSelectors;
  secretHandles: JarvisSecretHandlePort;
  executeRegisteredAction(input: {
    registration: Readonly<JarvisRegisteredActionDefinition>;
    params: Readonly<Record<string, unknown>>;
    context: RegisteredActionExecutionContext;
    execution: JarvisIssuedActionExecution;
  }): Promise<JarvisRegisteredActionDispatchOutcome>;
  newApprovalId(): `jappr_${string}`;
  now(): number;
  canonicalizeJson(value: unknown): string;
  hashCanonicalJson(value: unknown): Promise<string>;
}>;

const CREDENTIAL_KEY =
  /(?:password|passphrase|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|bearer)/i;
const RAW_SECRET_VALUE =
  /^(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{6,}$|^Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

function assertNoSecretValues(value: unknown, seen = new Set<object>()): void {
  if (typeof value === 'string') {
    if (RAW_SECRET_VALUE.test(value.trim())) approvalError('secret_value_rejected');
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) approvalError('invalid_parameters');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretValues(item, seen);
  } else {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (CREDENTIAL_KEY.test(key)) approvalError('secret_value_rejected');
      assertNoSecretValues(item, seen);
    }
  }
  seen.delete(value);
}

function sameCanonical(
  left: unknown,
  right: unknown,
  canonicalize: (value: unknown) => string,
): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
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

function riskFor(registration: JarvisRegisteredActionDefinition): JarvisApprovalV1['risk'] {
  if (registration.risk === 'read-only') return 'safe';
  if (registration.risk === 'safe-write') return 'confirm';
  return 'dangerous';
}

function producerFor(
  registration: JarvisRegisteredActionDefinition,
): 'action' | 'file_action' | 'terminal' | 'plugin' | 'mcp' {
  if (registration.executor.kind === 'plugin_tool') return 'plugin';
  const id = registration.executor.registryActionId.toLowerCase();
  if (id.startsWith('terminal.') || id.includes('.terminal.')) return 'terminal';
  if (id.startsWith('file.') || id.includes('.file.')) return 'file_action';
  if (id.startsWith('mcp.') || id.includes('.mcp.')) return 'mcp';
  return 'action';
}

function findCapability(snapshot: JarvisCapabilitySnapshot, id: string) {
  return [
    ...snapshot.tools,
    ...snapshot.plugins,
    ...snapshot.mcps,
    ...snapshot.terminals,
    ...snapshot.agents,
  ].find((entry) => entry.id === id);
}

function authorizationSlice(input: {
  registration: JarvisRegisteredActionDefinition;
  capabilitySnapshot: JarvisCapabilitySnapshot;
  entitlementSnapshot: JarvisEntitlementSnapshot;
  target: JarvisCanonicalActionTarget;
  now: number;
}): unknown {
  const capabilities = input.registration.requiredCapabilities.map((id) => {
    const ref = findCapability(input.capabilitySnapshot, id);
    if (!ref || ref.state === 'unavailable' || ref.state === 'planned') {
      approvalError('capability_changed');
    }
    if (!ref.operations.includes('execute')) approvalError('capability_changed');
    return {
      ref: ref.id,
      state: ref.state,
      operations: [...ref.operations].sort(),
      evidence: {
        ...(ref.evidenceRef === undefined ? {} : { evidenceRef: ref.evidenceRef }),
        ...(ref.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: ref.lastVerifiedAt }),
      },
    };
  });

  const entitlement = input.entitlementSnapshot;
  if (
    entitlement.source === 'unavailable' ||
    !Number.isFinite(entitlement.verifiedAt) ||
    !Number.isFinite(entitlement.expiresAt) ||
    entitlement.expiresAt! <= input.now
  ) {
    approvalError('entitlement_changed');
  }
  const granted = new Set(entitlement.capabilities);
  if (input.registration.requiredEntitlements.some((id) => !granted.has(id))) {
    approvalError('entitlement_changed');
  }

  return {
    primaryCapability: input.registration.requiredCapabilities[0],
    capabilities,
    target: input.target,
    entitlements: {
      source: entitlement.source,
      ...(entitlement.planId === undefined ? {} : { planId: entitlement.planId }),
      capabilities: [...entitlement.capabilities].sort(),
      verifiedAt: entitlement.verifiedAt,
      expiresAt: entitlement.expiresAt,
    },
  };
}

function assertLifecycleBinding(
  lifecycle: JarvisIssuedApprovalLifecycle,
  parentRun: JarvisRun,
  attempt?: JarvisRequestAttempt,
): void {
  if (
    lifecycle[jarvisIssuedApprovalLifecycleBrand] !== true ||
    !lifecycle.accountId ||
    lifecycle.accountId !== parentRun.accountId ||
    lifecycle.runId !== parentRun.id ||
    !lifecycle.requestId ||
    !Number.isSafeInteger(lifecycle.attemptNumber) ||
    lifecycle.attemptNumber <= 0 ||
    !lifecycle.revocationSignal ||
    typeof lifecycle.revocationSignal.aborted !== 'boolean'
  ) {
    approvalError('run_scope_mismatch');
  }
  if (
    attempt &&
    (attempt.runId !== parentRun.id ||
      attempt.requestId !== lifecycle.requestId ||
      attempt.attemptNumber !== lifecycle.attemptNumber ||
      !Number.isSafeInteger(attempt.attemptNumber) ||
      attempt.attemptNumber <= 0)
  ) {
    approvalError('run_scope_mismatch');
  }
}

function assertExactOwnKeys(value: object, allowed: readonly string[]): void {
  const accepted = new Set<PropertyKey>(allowed);
  if (Reflect.ownKeys(value).some((key) => !accepted.has(key))) {
    approvalError('caller_secret_resolver_rejected');
  }
}

function createInputOnly(input: CreateJarvisApprovalInput): CreateJarvisApprovalInput {
  return {
    parentRun: input.parentRun,
    attempt: input.attempt,
    actionId: input.actionId,
    actionVersion: input.actionVersion,
    params: input.params,
    expiresAt: input.expiresAt,
  };
}

function assertContextBinding(
  context: ActionRunContext,
  lifecycle: JarvisIssuedApprovalLifecycle,
  approvalId: string,
): RegisteredActionExecutionContext {
  const record = context as unknown as Record<string, unknown>;
  assertExactOwnKeys(record, [
    'source',
    'chatId',
    'messageId',
    'callId',
    'accountId',
    'runId',
    'approvalId',
    'requestId',
    'attemptNumber',
  ]);
  const expected = {
    accountId: lifecycle.accountId,
    runId: lifecycle.runId,
    approvalId,
    requestId: lifecycle.requestId,
    attemptNumber: lifecycle.attemptNumber,
  } as const;
  for (const [key, value] of Object.entries(expected)) {
    if (record[key] !== undefined && record[key] !== value) approvalError('run_scope_mismatch');
  }
  if (context.source !== 'user' && context.source !== 'ai') approvalError('run_scope_mismatch');
  return Object.freeze({
    source: context.source,
    ...(context.chatId === undefined ? {} : { chatId: context.chatId }),
    ...(context.messageId === undefined ? {} : { messageId: context.messageId }),
    ...(context.callId === undefined ? {} : { callId: context.callId }),
    ...expected,
  });
}

function committed<T>(result: JarvisAuthorityBoundResult<T>): T {
  if (result.kind !== 'committed') throw new JarvisApprovalAuthorityRevokedError();
  return result.value;
}

function mapSecretValidationReason(reason: string): JarvisApprovalErrorCode {
  if (
    reason === 'credential_account_unbound' ||
    reason === 'credential_account_mismatch' ||
    reason === 'credential_grant_stale' ||
    reason === 'credential_grant_unavailable' ||
    reason === 'credential_grant_storage_failed'
  ) {
    return reason;
  }
  if (
    reason === 'account_mismatch' ||
    reason === 'action_mismatch' ||
    reason === 'version_mismatch' ||
    reason === 'field_mismatch' ||
    reason === 'boot_mismatch'
  ) {
    return 'secret_handle_scope_mismatch';
  }
  return 'secret_handle_invalid';
}

function exactPendingApprovalEvent(
  events: readonly JarvisEvent[],
  runId: string,
): JarvisEvent | undefined {
  const candidates = events.filter(
    (event) =>
      event.runId === runId &&
      event.type === 'approval' &&
      event.status === 'pending' &&
      event.title === 'Approval required' &&
      event.safeSummary === 'Review the registered action before it runs.',
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function createJarvisApprovalEngine(
  input: JarvisApprovalEngineDependencies,
): JarvisApprovalEngine {
  const lifecycleStates = new WeakMap<
    JarvisIssuedApprovalLifecycle,
    { revocationSignal: AbortSignal }
  >();

  function trackLifecycle(lifecycle: JarvisIssuedApprovalLifecycle): {
    revocationSignal: AbortSignal;
  } {
    const existing = lifecycleStates.get(lifecycle);
    if (existing) return existing;
    const state = { revocationSignal: lifecycle.revocationSignal };
    lifecycleStates.set(lifecycle, state);
    return state;
  }

  function assertLive(state: { revocationSignal: AbortSignal }): void {
    if (state.revocationSignal.aborted) throw new JarvisApprovalAuthorityRevokedError();
  }

  async function loadCanonicalParent(
    lifecycle: JarvisIssuedApprovalLifecycle,
    supplied: JarvisRun,
  ): Promise<JarvisRun> {
    assertLifecycleBinding(lifecycle, supplied);
    const current = await input.runs.getById(lifecycle.accountId, lifecycle.runId);
    if (
      !current ||
      !sameCanonical(
        immutableRunIdentity(current),
        immutableRunIdentity(supplied),
        input.canonicalizeJson,
      )
    ) {
      approvalError('run_scope_mismatch');
    }
    return current;
  }

  function resolveRegistration(actionId: string, actionVersion: number) {
    const registration = input.catalog.resolve(actionId);
    if (!registration) approvalError('action_unavailable');
    if (registration.version !== actionVersion) approvalError('action_version_changed');
    return registration;
  }

  function validateParams(
    registration: JarvisRegisteredActionDefinition,
    params: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    assertNoSecretValues(params);
    try {
      const validated = registration.validateParameters(structuredClone(params));
      assertNoSecretValues(validated);
      return structuredClone(validated);
    } catch (error) {
      if (error instanceof JarvisApprovalError) throw error;
      approvalError('invalid_parameters');
    }
  }

  async function currentAuthorization(inputValue: {
    accountId: string;
    registration: JarvisRegisteredActionDefinition;
    params: Readonly<Record<string, unknown>>;
  }) {
    const [target, capabilitySnapshot, entitlementSnapshot] = await Promise.all([
      input.bindingSelectors.deriveTargetSnapshot({
        accountId: inputValue.accountId,
        actionId: inputValue.registration.id,
        actionVersion: inputValue.registration.version,
        params: inputValue.params,
      }),
      input.bindingSelectors.loadCapabilitySnapshot(inputValue.accountId),
      input.bindingSelectors.loadEntitlementSnapshot(inputValue.accountId),
    ]);
    const slice = authorizationSlice({
      registration: inputValue.registration,
      capabilitySnapshot,
      entitlementSnapshot,
      target,
      now: input.now(),
    });
    return {
      target,
      hash: await input.hashCanonicalJson(slice),
    };
  }

  async function prepare(
    lifecycle: JarvisIssuedApprovalLifecycle,
    state: { revocationSignal: AbortSignal },
    createInput: CreateJarvisApprovalInput,
  ): Promise<PreparedJarvisApprovalInput> {
    assertExactOwnKeys(createInput, [
      'parentRun',
      'attempt',
      'actionId',
      'actionVersion',
      'params',
      'expiresAt',
    ]);
    assertLive(state);
    assertLifecycleBinding(lifecycle, createInput.parentRun, createInput.attempt);
    await loadCanonicalParent(lifecycle, createInput.parentRun);
    assertLive(state);
    const registration = resolveRegistration(createInput.actionId, createInput.actionVersion);
    const params = validateParams(registration, createInput.params);
    if (!Number.isFinite(createInput.expiresAt) || createInput.expiresAt <= input.now()) {
      approvalError('expired');
    }
    const authorization = await currentAuthorization({
      accountId: lifecycle.accountId,
      registration,
      params,
    });
    assertLive(state);
    const expectedEffect = `${registration.expectedEffect} Target: ${input.canonicalizeJson(
      authorization.target,
    )}`;
    return {
      parentRun: structuredClone(createInput.parentRun),
      attempt: structuredClone(createInput.attempt),
      actionId: createInput.actionId,
      actionVersion: createInput.actionVersion,
      params: structuredClone(params),
      expiresAt: createInput.expiresAt,
      secretHandleRefs: [],
      approvalId: input.newApprovalId(),
      paramsHash: await input.hashCanonicalJson(params),
      targetSnapshot: structuredClone(authorization.target),
      risk: riskFor(registration),
      capabilityId: registration.requiredCapabilities[0],
      capabilitySnapshotHash: authorization.hash,
      expectedEffect,
      createdAt: input.now(),
    };
  }

  async function validateStoredApproval(
    lifecycle: Pick<
      JarvisIssuedApprovalLifecycle,
      'accountId' | 'runId' | 'requestId' | 'attemptNumber'
    >,
    approval: JarvisApprovalV1,
  ): Promise<{
    registration: Readonly<JarvisRegisteredActionDefinition>;
    params: Readonly<Record<string, unknown>>;
  }> {
    if (
      approval.schemaVersion !== 1 ||
      approval.runId !== lifecycle.runId ||
      approval.requestId !== lifecycle.requestId ||
      approval.attemptNumber !== lifecycle.attemptNumber
    ) {
      approvalError('run_scope_mismatch');
    }
    if (approval.expiresAt <= input.now()) approvalError('expired');
    const registration = resolveRegistration(approval.actionId, approval.actionVersion);
    if (!approval.params || typeof approval.params !== 'object' || Array.isArray(approval.params)) {
      approvalError('params_changed');
    }
    const params = validateParams(registration, approval.params as Record<string, unknown>);
    if ((await input.hashCanonicalJson(params)) !== approval.paramsHash) {
      approvalError('params_changed');
    }
    const authorization = await currentAuthorization({
      accountId: lifecycle.accountId,
      registration,
      params,
    });
    if (!sameCanonical(authorization.target, approval.targetSnapshot, input.canonicalizeJson)) {
      approvalError('target_changed');
    }
    if (riskFor(registration) !== approval.risk) approvalError('risk_changed');
    if (
      registration.requiredCapabilities[0] !== approval.capabilityId ||
      authorization.hash !== approval.capabilitySnapshotHash
    ) {
      approvalError('capability_changed');
    }
    const expectedEffect = `${registration.expectedEffect} Target: ${input.canonicalizeJson(
      authorization.target,
    )}`;
    if (expectedEffect !== approval.expectedEffect) approvalError('target_changed');

    const expectedFields = new Set(registration.credentialBindings.map((binding) => binding.field));
    const seenFields = new Set<string>();
    for (const reference of approval.secretHandleRefs ?? []) {
      if (seenFields.has(reference.field)) approvalError('secret_handle_duplicate_field');
      seenFields.add(reference.field);
      if (!expectedFields.has(reference.field)) approvalError('secret_handle_scope_mismatch');
      const validation = await input.secretHandles.validate({
        accountId: lifecycle.accountId,
        actionId: approval.actionId,
        actionVersion: approval.actionVersion,
        field: reference.field,
        handleId: reference.handleId,
      });
      if (!validation.valid) approvalError(mapSecretValidationReason(validation.reason));
    }
    if (seenFields.size !== expectedFields.size) approvalError('secret_handle_scope_mismatch');
    return { registration, params };
  }

  async function dispatchClaimed(inputValue: {
    lifecycle: JarvisIssuedApprovalLifecycle;
    state: { revocationSignal: AbortSignal };
    registration: Readonly<JarvisRegisteredActionDefinition>;
    params: Readonly<Record<string, unknown>>;
    context: RegisteredActionExecutionContext;
    execution: JarvisIssuedActionExecution;
  }): Promise<JarvisCanonicalActionExecutionResult> {
    assertLive(inputValue.state);
    let outcome: JarvisRegisteredActionDispatchOutcome;
    try {
      outcome = await input.executeRegisteredAction({
        registration: inputValue.registration,
        params: structuredClone(inputValue.params),
        context: inputValue.context,
        execution: inputValue.execution,
      });
    } catch {
      outcome = {
        kind: 'executor_returned',
        result: { ok: false, error: 'registered_action_failed' },
      };
    }

    if (outcome.kind === 'terminal_handoff_accepted') {
      const isTerminal = producerFor(inputValue.registration) === 'terminal';
      if (
        !isTerminal ||
        outcome.executorKind !== 'terminal' ||
        outcome.ownerId !== inputValue.execution.ownerId ||
        outcome.receipt.ownerId !== outcome.ownerId ||
        outcome.receipt[jarvisTerminalHandoffReceiptBrand] !== true
      ) {
        inputValue.execution.dispose();
        approvalError('run_scope_mismatch');
      }
      return {
        kind: 'handoff_pending',
        executorKind: 'terminal',
        ownerId: outcome.ownerId,
        result: outcome.result,
      };
    }

    try {
      const resultRefHash = await input.hashCanonicalJson({
        approvalId: inputValue.execution.approval.id,
        result: outcome.result,
      });
      committed(
        await inputValue.execution.recordResult({
          state: outcome.result.ok ? 'completed' : 'degraded',
          resultRef: `jresult_${resultRefHash}`,
          completedAt: input.now(),
        }),
      );
      return { kind: 'settled', result: outcome.result };
    } finally {
      inputValue.execution.dispose();
    }
  }

  async function executeApproval(
    lifecycle: JarvisIssuedApprovalLifecycle,
    state: { revocationSignal: AbortSignal },
    executeInput: ExecuteJarvisApprovalInput,
  ): Promise<JarvisCanonicalActionExecutionResult> {
    assertExactOwnKeys(executeInput, ['parentRun', 'approvalId', 'context']);
    const context = assertContextBinding(executeInput.context, lifecycle, executeInput.approvalId);
    assertLive(state);
    await loadCanonicalParent(lifecycle, executeInput.parentRun);
    assertLive(state);
    const approval = await input.approvals.getById(lifecycle.accountId, executeInput.approvalId);
    if (!approval) approvalError('not_approved');
    if (approval.status === 'consumed') approvalError('already_consumed');
    if (approval.status !== 'approved') approvalError('not_approved');
    const validated = await validateStoredApproval(lifecycle, approval);
    assertLive(state);
    const producerKind = producerFor(validated.registration);
    const ownerId = `approval:${approval.id}`;
    const claimed = committed(
      await lifecycle.claimApprovedExecution({
        approvalId: approval.id,
        producerKind,
        ownerId,
        evidenceRef: `approval:${approval.id}:${approval.requestId}:${approval.attemptNumber}`,
        startedAt: input.now(),
      }),
    );
    assertLive(state);
    if (
      claimed[jarvisIssuedActionExecutionBrand] !== true ||
      claimed.approval.id !== approval.id ||
      claimed.ownerId !== ownerId ||
      claimed.producerKind !== producerKind
    ) {
      claimed.dispose();
      approvalError('run_scope_mismatch');
    }
    return dispatchClaimed({
      lifecycle,
      state,
      registration: validated.registration,
      params: validated.params,
      context,
      execution: claimed,
    });
  }

  const recoveryVerifier: JarvisRecoveryApprovalVerifier = Object.freeze({
    async verifyPendingApproval({
      accountId,
      run,
      events,
    }: {
      accountId: string;
      run: JarvisRun;
      events: readonly JarvisEvent[];
    }) {
      if (accountId !== run.accountId || run.status !== 'awaiting_approval') {
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      const event = exactPendingApprovalEvent(events, run.id);
      if (!event) return { valid: false as const, reason: 'approval_missing' as const };
      const latestAttempt = run.transportAttempts?.at(-1);
      if (
        !latestAttempt ||
        latestAttempt.state !== 'provider_in_flight' ||
        !latestAttempt.requestId ||
        !Number.isSafeInteger(latestAttempt.attemptNumber) ||
        latestAttempt.attemptNumber <= 0
      ) {
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      const approvals = await input.approvals.listByRun(accountId, run.id, {
        requestId: latestAttempt.requestId,
        attemptNumber: latestAttempt.attemptNumber,
        limit: 2,
      });
      if (approvals.length !== 1 || approvals[0]!.id !== event.idempotencyKey) {
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      const approval = approvals[0]!;
      if (approval.status === 'consumed') {
        return { valid: false as const, reason: 'approval_consumed' as const };
      }
      if (approval.status !== 'pending') {
        return { valid: false as const, reason: 'approval_not_pending' as const };
      }
      if (approval.expiresAt <= input.now()) {
        return { valid: false as const, reason: 'approval_expired' as const };
      }
      if (
        approval.schemaVersion !== 1 ||
        approval.runId !== run.id ||
        approval.requestId !== latestAttempt.requestId ||
        approval.attemptNumber !== latestAttempt.attemptNumber
      ) {
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      const currentRun = await input.runs.getById(accountId, run.id);
      if (
        !currentRun ||
        !sameCanonical(
          immutableRunIdentity(currentRun),
          immutableRunIdentity(run),
          input.canonicalizeJson,
        )
      ) {
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      try {
        await validateStoredApproval(
          {
            accountId,
            runId: run.id,
            requestId: approval.requestId,
            attemptNumber: approval.attemptNumber,
          },
          approval,
        );
      } catch (error) {
        if (error instanceof JarvisApprovalError && error.code === 'expired') {
          return { valid: false as const, reason: 'approval_expired' as const };
        }
        return { valid: false as const, reason: 'approval_binding_mismatch' as const };
      }
      return { valid: true as const, approvalId: approval.id };
    },
  });

  const engine: JarvisApprovalEngine = Object.freeze({
    recoveryVerifier,
    bindIssuedLifecycle(lifecycle: JarvisIssuedApprovalLifecycle): JarvisApprovalActionCapability {
      assertLifecycleBinding(lifecycle, {
        id: lifecycle.runId,
        accountId: lifecycle.accountId,
      } as JarvisRun);
      const state = trackLifecycle(lifecycle);
      return Object.freeze({
        async create(createInput: CreateJarvisApprovalInput): Promise<JarvisApprovalV1> {
          const prepared = await prepare(lifecycle, state, createInput);
          assertLive(state);
          return committed(await lifecycle.putPreparedApproval(prepared));
        },
        async decide(decideInput: {
          parentRun: JarvisRun;
          approvalId: string;
          decision: 'approve' | 'deny';
        }): Promise<JarvisApprovalV1> {
          assertExactOwnKeys(decideInput, ['parentRun', 'approvalId', 'decision']);
          assertLive(state);
          await loadCanonicalParent(lifecycle, decideInput.parentRun);
          const approval = await input.approvals.getById(
            lifecycle.accountId,
            decideInput.approvalId,
          );
          if (!approval || approval.status !== 'pending') approvalError('not_pending');
          if (approval.expiresAt <= input.now()) approvalError('expired');
          await validateStoredApproval(lifecycle, approval);
          assertLive(state);
          return committed(
            await lifecycle.decidePreparedApproval({
              approvalId: approval.id,
              decision: decideInput.decision,
            }),
          );
        },
        execute(
          executeInput: ExecuteJarvisApprovalInput,
        ): Promise<JarvisCanonicalActionExecutionResult> {
          return executeApproval(lifecycle, state, executeInput);
        },
        async executeAutoApprovedSafe(
          autoInput: CreateJarvisApprovalInput & { context: ActionRunContext },
        ): Promise<JarvisCanonicalActionExecutionResult> {
          assertExactOwnKeys(autoInput, [
            'parentRun',
            'attempt',
            'actionId',
            'actionVersion',
            'params',
            'expiresAt',
            'context',
          ]);
          const context = assertContextBinding(autoInput.context, lifecycle, 'pending');
          const prepared = await prepare(lifecycle, state, createInputOnly(autoInput));
          const registration = resolveRegistration(prepared.actionId, prepared.actionVersion);
          if (registration.risk !== 'read-only' || registration.approval !== 'never') {
            approvalError('not_approved');
          }
          const producerKind = producerFor(registration);
          const ownerId = `approval:${prepared.approvalId}`;
          const boundContext = Object.freeze({ ...context, approvalId: prepared.approvalId });
          assertLive(state);
          const execution = committed(
            await lifecycle.claimAutoApprovedExecution({
              approval: prepared,
              producerKind,
              ownerId,
              evidenceRef: `approval:${prepared.approvalId}:${lifecycle.requestId}:${lifecycle.attemptNumber}`,
              startedAt: input.now(),
            }),
          );
          assertLive(state);
          return dispatchClaimed({
            lifecycle,
            state,
            registration,
            params: prepared.params,
            context: boundContext,
            execution,
          });
        },
      });
    },
  });
  return engine;
}
