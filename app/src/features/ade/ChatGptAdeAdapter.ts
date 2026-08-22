import type { ContextGateway } from '@/features/context/gateway/ContextGateway';
import type {
  ContextGatewayRequest,
  ContextReceipt,
  ContextScopeRevision,
  ExecutionIdentity,
  PreparedContextTurn,
} from '@/features/context/gateway/contextGatewayContracts';
import type {
  ChatGptAdeAuthorizedTerminalLink,
  ChatGptAdeContextProjection,
  ChatGptAdeDispatchRequest,
  ChatGptAdeDispatchResult,
  ChatGptAdeLifecycleEvent,
  ChatGptAdeRunRequest,
  ChatGptAdeRunSnapshot,
  ChatGptAdeRunStatus,
  ChatGptAdeSafeFailure,
  ChatGptAdeTerminalProjection,
} from './adeContracts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_INSTRUCTION_LENGTH = 128 * 1024;
const MAX_OUTPUT_LENGTH = 2 * 1024 * 1024;
const ACCESS_STRENGTH = Object.freeze({ read: 0, write: 1, full: 2 });
const IDENTITY_KEYS = Object.freeze([
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
] as const);

export type ChatGptAdeGateway = Pick<
  ContextGateway,
  'prepareTurn' | 'verifyRequiredReceipt' | 'cancel'
>;

export interface ChatGptAdeDispatcher {
  dispatch(input: Readonly<ChatGptAdeDispatchRequest>): Promise<Readonly<ChatGptAdeDispatchResult>>;
  cancel(runId: string): void;
}

export interface ChatGptAdeAdapterDependencies {
  gateway: ChatGptAdeGateway;
  dispatcher: Readonly<ChatGptAdeDispatcher>;
  authorizeTerminal(
    input: Readonly<{
      identityId: string;
      terminalSessionId: string;
      paneId: string;
      projectId: string;
    }>,
  ): Readonly<ChatGptAdeAuthorizedTerminalLink> | null;
  registerTerminalCancellation?(
    identityId: string,
    requestId: string,
    cancel: () => void,
  ): () => void;
  recordEvent(event: Readonly<ChatGptAdeLifecycleEvent>): void;
  flushEvents?(): Promise<void>;
  now(): number;
}

interface ActiveAdeRun {
  requestId: string;
  controller: AbortController;
}

export type ChatGptAdeRunListener = (snapshot: Readonly<ChatGptAdeRunSnapshot>) => void;

function terminalRunStatus(status: ChatGptAdeRunStatus): boolean {
  return ['completed', 'failed', 'blocked', 'cancelled'].includes(status);
}

function immutableIdentity(identity: Readonly<ExecutionIdentity>): Readonly<ExecutionIdentity> {
  return Object.freeze({ ...identity });
}

function immutableScope(scope: Readonly<ContextScopeRevision>): Readonly<ContextScopeRevision> {
  return Object.freeze({ ...scope });
}

function exactIdentity(
  selected: Readonly<ExecutionIdentity>,
  observed: Readonly<ExecutionIdentity>,
): boolean {
  return IDENTITY_KEYS.every((key) => selected[key] === observed[key]);
}

function exactScope(
  selected: Readonly<ContextScopeRevision>,
  observed: Readonly<ContextScopeRevision>,
): boolean {
  return (
    selected.accountId === observed.accountId &&
    selected.workspaceId === observed.workspaceId &&
    selected.projectId === observed.projectId &&
    selected.worktreeId === observed.worktreeId &&
    selected.revision === observed.revision
  );
}

function validInstruction(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= MAX_INSTRUCTION_LENGTH &&
    !/[\u0000\u007f-\u009f]/u.test(value)
  );
}

function validOutput(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_OUTPUT_LENGTH &&
    !/[\u0000\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)
  );
}

function validScope(scope: Readonly<ContextScopeRevision>): boolean {
  return (
    SAFE_ID.test(scope.accountId) &&
    SAFE_ID.test(scope.workspaceId) &&
    SAFE_ID.test(scope.projectId) &&
    scope.worktreeId.length > 0 &&
    scope.worktreeId.length <= 2_048 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(scope.worktreeId) &&
    SAFE_ID.test(scope.revision)
  );
}

function safeContext(receipt: Readonly<ContextReceipt>): Readonly<ChatGptAdeContextProjection> {
  return Object.freeze({
    receiptId: receipt.receiptId,
    policyVersion: receipt.policyVersion,
    route: receipt.route,
    decision: receipt.decision,
    reasons: Object.freeze([...receipt.decisionReasons]),
    required: receipt.required,
    status: receipt.safeFailure === null ? ('ready' as const) : ('unavailable' as const),
    safeFailure: receipt.safeFailure,
    sources: Object.freeze(
      receipt.sourceRevisions.map((source) =>
        Object.freeze({ sourceId: source.sourceId, revision: source.revision }),
      ),
    ),
    cacheStatus: receipt.cacheStatus,
    queueDepthAtStart: receipt.queueDepthAtStart,
    stageTimingsMs: Object.freeze({ ...receipt.stageTimingsMs }),
  });
}

function terminalProjection(
  identity: Readonly<ChatGptAdeAuthorizedTerminalLink>,
): Readonly<ChatGptAdeTerminalProjection> {
  return Object.freeze({
    terminalSessionId: identity.terminalSessionId,
    paneId: identity.paneId,
    runGeneration: identity.runGeneration,
  });
}

function terminalMatches(
  request: Readonly<ChatGptAdeRunRequest>,
  authorized: Readonly<ChatGptAdeAuthorizedTerminalLink>,
): boolean {
  const link = request.terminalLink;
  return Boolean(
    link &&
    authorized.identityId === link.identityId &&
    authorized.terminalSessionId === link.terminalSessionId &&
    authorized.paneId === link.paneId &&
    authorized.accountId === request.scope.accountId &&
    authorized.workspaceId === request.scope.workspaceId &&
    authorized.projectId === request.scope.projectId &&
    authorized.worktreeId === request.scope.worktreeId &&
    Number.isSafeInteger(authorized.runGeneration) &&
    authorized.runGeneration >= 0 &&
    ACCESS_STRENGTH[authorized.access] >= ACCESS_STRENGTH[request.access],
  );
}

export class ChatGptAdeAdapter {
  private readonly active = new Map<string, ActiveAdeRun>();
  private readonly snapshots = new Map<string, Readonly<ChatGptAdeRunSnapshot>>();
  private readonly listeners = new Map<string, Set<ChatGptAdeRunListener>>();

  constructor(private readonly dependencies: Readonly<ChatGptAdeAdapterDependencies>) {}

  getRun(runId: string): Readonly<ChatGptAdeRunSnapshot> | null {
    return this.snapshots.get(runId) ?? null;
  }

  subscribe(runId: string, listener: ChatGptAdeRunListener): () => void {
    if (!SAFE_ID.test(runId) || typeof listener !== 'function') {
      throw new TypeError('ade_run_subscription_invalid');
    }
    const current = this.snapshots.get(runId);
    if (current) this.notifyListener(listener, current);
    if (current && terminalRunStatus(current.status)) return () => {};
    const listeners = this.listeners.get(runId) ?? new Set<ChatGptAdeRunListener>();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      const activeListeners = this.listeners.get(runId);
      activeListeners?.delete(listener);
      if (activeListeners?.size === 0) this.listeners.delete(runId);
    };
  }

  cancel(runId: string): boolean {
    const active = this.active.get(runId);
    if (!active) return false;
    active.controller.abort();
    this.dependencies.gateway.cancel(active.requestId);
    this.dependencies.dispatcher.cancel(runId);
    const current = this.snapshots.get(runId);
    if (current) this.publish(current, 'cancelled', 'cancelled');
    return true;
  }

  async run(input: Readonly<ChatGptAdeRunRequest>): Promise<Readonly<ChatGptAdeRunSnapshot>> {
    if (this.active.has(input.runId) || this.snapshots.has(input.runId)) {
      throw new TypeError('ade_run_conflict');
    }
    const initial = this.initialSnapshot(input);
    if (!this.validRequest(input)) {
      return this.publish(initial, 'blocked', 'invalid-run');
    }

    let linkedTerminal: Readonly<ChatGptAdeTerminalProjection> | null = null;
    if (input.terminalLink) {
      const authorized = this.dependencies.authorizeTerminal({
        identityId: input.terminalLink.identityId,
        terminalSessionId: input.terminalLink.terminalSessionId,
        paneId: input.terminalLink.paneId,
        projectId: input.scope.projectId,
      });
      if (!authorized || !terminalMatches(input, authorized)) {
        return this.publish(initial, 'blocked', 'terminal-link-unauthorized');
      }
      linkedTerminal = terminalProjection(authorized);
    }

    const controller = new AbortController();
    this.active.set(input.runId, { requestId: input.requestId, controller });
    let unregisterTerminalCancellation = () => {};
    if (input.terminalLink && this.dependencies.registerTerminalCancellation) {
      try {
        unregisterTerminalCancellation = this.dependencies.registerTerminalCancellation(
          input.terminalLink.identityId,
          input.requestId,
          () => this.cancel(input.runId),
        );
      } catch {
        this.active.delete(input.runId);
        return this.publish(
          Object.freeze({ ...initial, terminalLink: linkedTerminal }),
          'blocked',
          'terminal-link-unauthorized',
        );
      }
    }
    let snapshot = this.publish(
      Object.freeze({ ...initial, terminalLink: linkedTerminal }),
      'preparing-context',
      null,
    );

    try {
      const prepared = await this.dependencies.gateway.prepareTurn(
        this.gatewayRequest(input, controller.signal),
      );
      controller.signal.throwIfAborted();
      const context = safeContext(prepared.receipt);
      snapshot = Object.freeze({ ...snapshot, context });

      if (!exactScope(input.scope, prepared.receipt.scopeRevision)) {
        return this.publish(snapshot, 'failed', 'context-scope-mismatch');
      }
      if (!exactIdentity(input.executionIdentity, prepared.receipt.executionIdentity)) {
        return this.publish(snapshot, 'failed', 'execution-identity-mismatch');
      }

      if (!this.requiredReceiptValid(input, prepared)) {
        return this.publish(snapshot, 'blocked', 'required-context-invalid');
      }

      snapshot = this.publish(snapshot, 'dispatching', null);
      try {
        await this.dependencies.flushEvents?.();
      } catch {
        return this.publish(snapshot, 'failed', 'history-unavailable');
      }
      let streamInvalid = false;
      const result = await this.dependencies.dispatcher.dispatch(
        Object.freeze({
          runId: input.runId,
          selectedHarness: input.selectedHarness,
          instruction: input.instruction,
          contextPromptBlock: prepared.promptBlock,
          executionIdentity: immutableIdentity(input.executionIdentity),
          scope: immutableScope(input.scope),
          terminalLink: linkedTerminal,
          signal: controller.signal,
          onOutput: (delta: string) => {
            if (!validOutput(delta)) {
              streamInvalid = true;
              return;
            }
            if (!delta) return;
            const active = this.active.get(input.runId);
            const current = this.snapshots.get(input.runId);
            if (
              active?.controller !== controller ||
              controller.signal.aborted ||
              current?.status !== 'dispatching'
            ) {
              return;
            }
            const output = `${current.output ?? ''}${delta}`;
            if (!validOutput(output)) {
              streamInvalid = true;
              return;
            }
            this.publishOutput(current, output);
          },
        }),
      );
      controller.signal.throwIfAborted();
      const current = this.snapshots.get(input.runId) ?? snapshot;
      if (streamInvalid || !validOutput(result.output)) {
        return this.publish(current, 'failed', 'dispatch-output-invalid');
      }
      if (current.output !== null && current.output !== result.output) {
        return this.publish(current, 'failed', 'dispatch-output-mismatch');
      }
      if (!exactIdentity(input.executionIdentity, result.observedExecutionIdentity)) {
        return this.publish(current, 'failed', 'execution-identity-mismatch');
      }
      if (!exactScope(input.scope, result.observedScope)) {
        return this.publish(current, 'failed', 'context-scope-mismatch');
      }
      return this.publish(Object.freeze({ ...current, output: result.output }), 'completed', null);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        const current = this.snapshots.get(input.runId) ?? snapshot;
        return this.publish(current, 'cancelled', 'cancelled');
      }
      const receipt =
        typeof error === 'object' &&
        error !== null &&
        'receipt' in error &&
        typeof error.receipt === 'object' &&
        error.receipt !== null
          ? (error.receipt as Readonly<ContextReceipt>)
          : null;
      if (receipt) {
        snapshot = Object.freeze({ ...snapshot, context: safeContext(receipt) });
        return this.publish(snapshot, 'blocked', receipt.safeFailure ?? 'required-context-invalid');
      }
      return this.publish(snapshot, 'failed', 'dispatch-failed');
    } finally {
      unregisterTerminalCancellation();
      const current = this.active.get(input.runId);
      if (current?.controller === controller) this.active.delete(input.runId);
    }
  }

  private validRequest(input: Readonly<ChatGptAdeRunRequest>): boolean {
    return (
      SAFE_ID.test(input.runId) &&
      SAFE_ID.test(input.requestId) &&
      input.selectedHarness === 'chatgpt' &&
      validInstruction(input.instruction) &&
      validScope(input.scope)
    );
  }

  private gatewayRequest(
    input: Readonly<ChatGptAdeRunRequest>,
    signal: AbortSignal,
  ): Readonly<ContextGatewayRequest> {
    return Object.freeze({
      requestId: input.requestId,
      question: input.instruction,
      taskKind: input.taskKind,
      access: input.access,
      workingSet: input.workingSet,
      scope: immutableScope(input.scope),
      executionIdentity: immutableIdentity(input.executionIdentity),
      performance: input.performance,
      optionalEnrichmentEnabled: input.optionalEnrichmentEnabled,
      ...(input.activePaths ? { activePaths: Object.freeze([...input.activePaths]) } : {}),
      ...(input.exactIdentifiers
        ? { exactIdentifiers: Object.freeze([...input.exactIdentifiers]) }
        : {}),
      ...(input.userIntent ? { userIntent: Object.freeze({ ...input.userIntent }) } : {}),
      ...(input.historical === undefined ? {} : { historical: input.historical }),
      ...(input.crossSource === undefined ? {} : { crossSource: input.crossSource }),
      ...(input.broadChange === undefined ? {} : { broadChange: input.broadChange }),
      ...(input.ambiguousScope === undefined ? {} : { ambiguousScope: input.ambiguousScope }),
      ...(input.unresolvedContradiction === undefined
        ? {}
        : { unresolvedContradiction: input.unresolvedContradiction }),
      ...(input.riskDomains ? { riskDomains: Object.freeze([...input.riskDomains]) } : {}),
      signal,
    });
  }

  private requiredReceiptValid(
    input: Readonly<ChatGptAdeRunRequest>,
    prepared: Readonly<PreparedContextTurn>,
  ): boolean {
    if (input.taskKind === 'answer' && !prepared.receipt.required) {
      return prepared.receipt.safeFailure === null;
    }
    if (!prepared.receipt.required || prepared.receipt.safeFailure !== null) return false;
    const minimumRoute = prepared.receipt.route === 'deep' ? 'deep' : 'focused';
    return Boolean(
      this.dependencies.gateway.verifyRequiredReceipt({
        receiptId: prepared.receipt.receiptId,
        requestId: input.requestId,
        scope: input.scope,
        minimumRoute,
      }),
    );
  }

  private initialSnapshot(input: Readonly<ChatGptAdeRunRequest>): Readonly<ChatGptAdeRunSnapshot> {
    const now = new Date(this.dependencies.now()).toISOString();
    return Object.freeze({
      runId: input.runId,
      requestId: input.requestId,
      selectedHarness: input.selectedHarness,
      status: 'preparing-context',
      scope: immutableScope(input.scope),
      executionIdentity: immutableIdentity(input.executionIdentity),
      terminalLink: null,
      context: null,
      output: null,
      safeFailure: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    });
  }

  private publish(
    current: Readonly<ChatGptAdeRunSnapshot>,
    status: ChatGptAdeRunStatus,
    safeFailure: ChatGptAdeSafeFailure | null,
  ): Readonly<ChatGptAdeRunSnapshot> {
    if (
      current.status === status &&
      current.safeFailure === safeFailure &&
      this.snapshots.get(current.runId) === current
    ) {
      return current;
    }
    const at = new Date(this.dependencies.now()).toISOString();
    const terminalStatus = terminalRunStatus(status);
    const next = Object.freeze({
      ...current,
      status,
      safeFailure,
      output: status === 'completed' ? current.output : null,
      updatedAt: at,
      completedAt: terminalStatus ? at : null,
    });
    this.snapshots.set(next.runId, next);
    this.dependencies.recordEvent(
      Object.freeze({
        runId: next.runId,
        requestId: next.requestId,
        type: status,
        at,
        receiptId: next.context?.receiptId ?? null,
        terminalSessionId: next.terminalLink?.terminalSessionId ?? null,
        safeFailure,
      }),
    );
    this.notifyRun(next);
    return next;
  }

  private publishOutput(
    current: Readonly<ChatGptAdeRunSnapshot>,
    output: string,
  ): Readonly<ChatGptAdeRunSnapshot> {
    const next = Object.freeze({
      ...current,
      output,
      updatedAt: new Date(this.dependencies.now()).toISOString(),
    });
    this.snapshots.set(next.runId, next);
    this.notifyRun(next);
    return next;
  }

  private notifyRun(snapshot: Readonly<ChatGptAdeRunSnapshot>): void {
    const listeners = this.listeners.get(snapshot.runId);
    if (listeners) {
      for (const listener of [...listeners]) this.notifyListener(listener, snapshot);
    }
    if (terminalRunStatus(snapshot.status)) this.listeners.delete(snapshot.runId);
  }

  private notifyListener(
    listener: ChatGptAdeRunListener,
    snapshot: Readonly<ChatGptAdeRunSnapshot>,
  ): void {
    try {
      listener(snapshot);
    } catch {
      // A presentation listener cannot alter run authority or lifecycle progression.
    }
  }
}
