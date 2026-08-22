import { decideContextPolicy } from './contextGatewayPolicy';
import type {
  ContextEvidence,
  ContextGatewayBackend,
  ContextGatewayBackendResult,
  ContextGatewayRequest,
  ContextReceipt,
  ContextSafeFailure,
  ContextScopeRevision,
  OpenEvidenceRequest,
  OpenEvidenceResult,
  PreparedContextTurn,
  VerifyContextReceiptRequest,
} from './contextGatewayContracts';

interface ContextGatewayDependencies {
  now(): number;
  createId(): string;
  cacheTtlMs?: number;
  receiptTtlMs?: number;
  maxConcurrentPerScope?: number;
}

interface CachedResult {
  expiresAt: number;
  result: Readonly<ContextGatewayBackendResult>;
}

interface InflightResult {
  controller: AbortController;
  consumers: Set<string>;
  promise: Promise<Readonly<QueuedBackendResult>>;
}

interface QueuedBackendResult {
  result: Readonly<ContextGatewayBackendResult>;
  queueDepthAtStart: number;
  queueWaitMs: number;
}

interface ScopeQueueWaiter {
  startedAt: number;
  queueDepthAtStart: number;
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (permit: ScopeQueuePermit) => void;
  reject: (error: DOMException) => void;
}

interface ScopeQueueState {
  active: number;
  waiters: ScopeQueueWaiter[];
}

interface ScopeQueuePermit {
  queueDepthAtStart: number;
  queueWaitMs: number;
  release(): void;
}

interface ActiveRequest {
  controller: AbortController;
  generation: number;
  cacheKey?: string;
}

interface ReceiptEvidence {
  requestId: string;
  expiresAt: number;
  receipt: Readonly<ContextReceipt>;
  scope: Readonly<ContextScopeRevision>;
  evidence: ReadonlyMap<string, Readonly<ContextEvidence>>;
}

const DEFAULT_RECEIPT_TTL_MS = 15 * 60 * 1_000;
const MAX_RECEIPT_TTL_MS = 60 * 60 * 1_000;

function abortError(): DOMException {
  return new DOMException('VibeSpace Context Gateway request was cancelled.', 'AbortError');
}

function sameScope(a: Readonly<ContextScopeRevision>, b: Readonly<ContextScopeRevision>): boolean {
  return (
    a.accountId === b.accountId &&
    a.workspaceId === b.workspaceId &&
    a.projectId === b.projectId &&
    a.worktreeId === b.worktreeId &&
    a.revision === b.revision
  );
}

function safeFailure(error: unknown): ContextSafeFailure {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  const message = error instanceof Error ? error.message : String(error);
  if (/scope|unauthor/i.test(message)) return 'unauthorized-scope';
  if (/stale|revision|generation/i.test(message)) return 'stale-source';
  if (/budget|limit/i.test(message)) return 'budget-exhausted';
  if (/unavailable|not ready/i.test(message)) return 'gateway-unavailable';
  return 'retrieval-failed';
}

function immutableIdentity<T extends object>(value: Readonly<T>): Readonly<T> {
  return Object.freeze({ ...value });
}

export class ContextRequiredUnavailableError extends Error {
  constructor(public readonly receipt: Readonly<ContextReceipt>) {
    super(
      `Required VibeSpace context is unavailable (${receipt.safeFailure ?? 'retrieval-failed'}).`,
    );
    this.name = 'ContextRequiredUnavailableError';
  }
}

export class ContextGatewayRequestConflictError extends Error {
  constructor(public readonly requestId: string) {
    super('A VibeSpace Context Gateway request with this ID is already active.');
    this.name = 'ContextGatewayRequestConflictError';
  }
}

export class ContextGatewayReceiptConflictError extends Error {
  constructor(public readonly receiptId: string) {
    super('A VibeSpace Context Gateway receipt ID is already authoritative.');
    this.name = 'ContextGatewayReceiptConflictError';
  }
}

export class ContextGateway {
  private readonly cache = new Map<string, CachedResult>();
  private readonly inflight = new Map<string, InflightResult>();
  private readonly generations = new Map<string, number>();
  private readonly active = new Map<string, ActiveRequest>();
  private readonly receiptEvidence = new Map<string, ReceiptEvidence>();
  private readonly scopeQueues = new Map<string, ScopeQueueState>();
  private readonly cacheTtlMs: number;
  private readonly receiptTtlMs: number;
  private readonly maxConcurrentPerScope: number;

  constructor(
    private readonly backend: Readonly<ContextGatewayBackend>,
    private readonly dependencies: Readonly<ContextGatewayDependencies>,
  ) {
    this.cacheTtlMs = Math.max(0, dependencies.cacheTtlMs ?? 30_000);
    this.receiptTtlMs = Math.min(
      MAX_RECEIPT_TTL_MS,
      Math.max(1, dependencies.receiptTtlMs ?? DEFAULT_RECEIPT_TTL_MS),
    );
    this.maxConcurrentPerScope = Math.max(1, Math.floor(dependencies.maxConcurrentPerScope ?? 4));
  }

  prepareTurn(input: Readonly<ContextGatewayRequest>): Promise<Readonly<PreparedContextTurn>> {
    return this.execute(input);
  }

  ask(input: Readonly<ContextGatewayRequest>): Promise<Readonly<PreparedContextTurn>> {
    return this.execute(input);
  }

  cancel(requestId: string): void {
    const nextGeneration = (this.generations.get(requestId) ?? 0) + 1;
    this.generations.set(requestId, nextGeneration);
    const active = this.active.get(requestId);
    if (!active) return;
    active.controller.abort();
    if (active.cacheKey) {
      const flight = this.inflight.get(active.cacheKey);
      flight?.consumers.delete(requestId);
      if (flight && flight.consumers.size === 0) flight.controller.abort();
    }
    this.active.delete(requestId);
  }

  async openEvidence(input: Readonly<OpenEvidenceRequest>): Promise<OpenEvidenceResult> {
    const record = this.receiptEvidence.get(input.receiptId);
    if (!record || this.receiptExpired(input.receiptId, record)) {
      throw new Error('Context evidence receipt is missing or expired.');
    }
    if (!sameScope(record.scope, input.scope)) {
      throw new Error('Context evidence scope does not match the receipt scope.');
    }
    const evidence = record.evidence.get(input.handle);
    if (!evidence) throw new Error('Context evidence handle was not issued by this receipt.');
    return evidence;
  }

  verifyRequiredReceipt(
    input: Readonly<VerifyContextReceiptRequest>,
  ): Readonly<ContextReceipt> | null {
    const record = this.receiptEvidence.get(input.receiptId);
    if (
      !record ||
      this.receiptExpired(input.receiptId, record) ||
      record.requestId !== input.requestId ||
      !sameScope(record.scope, input.scope)
    )
      return null;
    const receipt = record.receipt;
    if (!receipt.required || receipt.safeFailure !== null) return null;
    if ((this.generations.get(input.requestId) ?? 0) !== receipt.cancellationGeneration)
      return null;
    const strength =
      receipt.route === 'deep'
        ? 2
        : receipt.route === 'focused' || receipt.route === 'exact'
          ? 1
          : 0;
    const minimum = input.minimumRoute === 'deep' ? 2 : 1;
    return strength >= minimum ? receipt : null;
  }

  private receiptExpired(receiptId: string, record: Readonly<ReceiptEvidence>): boolean {
    if (record.expiresAt > this.dependencies.now()) return false;
    this.receiptEvidence.delete(receiptId);
    return true;
  }

  private pruneExpiredReceipts(): void {
    const now = this.dependencies.now();
    for (const [receiptId, record] of this.receiptEvidence) {
      if (record.expiresAt <= now) this.receiptEvidence.delete(receiptId);
    }
  }

  private cacheKey(input: Readonly<ContextGatewayRequest>, route: string): string {
    return JSON.stringify({
      scope: input.scope,
      route,
      question: input.question,
      performance: input.performance,
      activePaths: input.activePaths ?? [],
      exactIdentifiers: input.exactIdentifiers ?? [],
    });
  }

  private scopeQueueKey(scope: Readonly<ContextScopeRevision>): string {
    return JSON.stringify(scope);
  }

  private createScopePermit(
    key: string,
    queueDepthAtStart: number,
    queueWaitMs: number,
  ): ScopeQueuePermit {
    let released = false;
    return {
      queueDepthAtStart,
      queueWaitMs,
      release: () => {
        if (released) return;
        released = true;
        this.releaseScopePermit(key);
      },
    };
  }

  private releaseScopePermit(key: string): void {
    const state = this.scopeQueues.get(key);
    if (!state) return;
    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift()!;
      waiter.signal.removeEventListener('abort', waiter.onAbort);
      if (waiter.signal.aborted) continue;
      waiter.resolve(
        this.createScopePermit(
          key,
          waiter.queueDepthAtStart,
          Math.max(0, this.dependencies.now() - waiter.startedAt),
        ),
      );
      return;
    }
    state.active = Math.max(0, state.active - 1);
    if (state.active === 0) this.scopeQueues.delete(key);
  }

  private acquireScopePermit(
    scope: Readonly<ContextScopeRevision>,
    signal: AbortSignal,
  ): Promise<ScopeQueuePermit> {
    if (signal.aborted) return Promise.reject(abortError());
    const key = this.scopeQueueKey(scope);
    const state = this.scopeQueues.get(key) ?? { active: 0, waiters: [] };
    this.scopeQueues.set(key, state);
    if (state.active < this.maxConcurrentPerScope) {
      state.active += 1;
      return Promise.resolve(this.createScopePermit(key, 0, 0));
    }

    const startedAt = this.dependencies.now();
    const queueDepthAtStart = state.waiters.length + 1;
    return new Promise<ScopeQueuePermit>((resolve, reject) => {
      const waiter = {} as ScopeQueueWaiter;
      waiter.startedAt = startedAt;
      waiter.queueDepthAtStart = queueDepthAtStart;
      waiter.signal = signal;
      waiter.resolve = resolve;
      waiter.reject = reject;
      waiter.onAbort = () => {
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) state.waiters.splice(index, 1);
        signal.removeEventListener('abort', waiter.onAbort);
        reject(abortError());
      };
      state.waiters.push(waiter);
      signal.addEventListener('abort', waiter.onAbort, { once: true });
    });
  }

  private async runBackendWithPermit(
    input: Readonly<ContextGatewayRequest>,
    route: Exclude<ReturnType<typeof decideContextPolicy>['route'], 'direct'>,
    generation: number,
    signal: AbortSignal,
  ): Promise<Readonly<QueuedBackendResult>> {
    const permit = await this.acquireScopePermit(input.scope, signal);
    try {
      const result = await this.backend.ask({
        route,
        question: input.question,
        scope: input.scope,
        performance: input.performance,
        activePaths: input.activePaths,
        exactIdentifiers: input.exactIdentifiers,
        cancellationGeneration: generation,
        signal,
      });
      if (signal.aborted) throw abortError();
      return Object.freeze({
        result,
        queueDepthAtStart: permit.queueDepthAtStart,
        queueWaitMs: permit.queueWaitMs,
      });
    } finally {
      permit.release();
    }
  }

  private receipt(
    input: Readonly<ContextGatewayRequest>,
    decision: ReturnType<typeof decideContextPolicy>,
    generation: number,
    cacheStatus: ContextReceipt['cacheStatus'],
    sourceRevisions: ContextReceipt['sourceRevisions'],
    evidenceHandles: readonly string[],
    queueDepthAtStart: number,
    stageTimingsMs: Readonly<Record<string, number>>,
    failure: ContextSafeFailure | null,
  ): Readonly<ContextReceipt> {
    return Object.freeze({
      receiptId: this.dependencies.createId(),
      policyVersion: decision.policyVersion,
      route: decision.route,
      decision: decision.decision,
      required: decision.required,
      decisionReasons: decision.reasons,
      scopeRevision: immutableIdentity(input.scope),
      sourceRevisions: Object.freeze(sourceRevisions.map((item) => immutableIdentity(item))),
      evidenceHandles: Object.freeze([...evidenceHandles]),
      cacheStatus,
      queueDepthAtStart,
      stageTimingsMs: immutableIdentity(stageTimingsMs),
      cancellationGeneration: generation,
      safeFailure: failure,
      executionIdentity: immutableIdentity(input.executionIdentity),
    });
  }

  private async execute(
    input: Readonly<ContextGatewayRequest>,
  ): Promise<Readonly<PreparedContextTurn>> {
    if (this.active.has(input.requestId)) {
      throw new ContextGatewayRequestConflictError(input.requestId);
    }
    this.pruneExpiredReceipts();
    const decisionStartedAt = this.dependencies.now();
    const available = this.backend.available();
    const decision = decideContextPolicy({ ...input, gatewayAvailable: available });
    const generation = this.generations.get(input.requestId) ?? 0;
    const controller = new AbortController();
    this.active.set(input.requestId, { controller, generation });
    const onExternalAbort = () => this.cancel(input.requestId);
    input.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const decisionMs = Math.max(0, this.dependencies.now() - decisionStartedAt);

    try {
      if (controller.signal.aborted || input.signal?.aborted) throw abortError();
      if (decision.decision === 'blocked-context-unavailable') {
        const receipt = this.receipt(
          input,
          decision,
          generation,
          'not-applicable',
          [],
          [],
          0,
          { decision: decisionMs },
          decision.safeFailure,
        );
        throw new ContextRequiredUnavailableError(receipt);
      }
      if (decision.route === 'direct') {
        return Object.freeze({
          promptBlock: '',
          receipt: this.receipt(
            input,
            decision,
            generation,
            'not-applicable',
            [],
            [],
            0,
            {
              decision: decisionMs,
              total: decisionMs,
            },
            null,
          ),
        });
      }

      const key = this.cacheKey(input, decision.route);
      const active = this.active.get(input.requestId);
      if (active) active.cacheKey = key;
      let cacheStatus: ContextReceipt['cacheStatus'];
      let backendResult: Readonly<ContextGatewayBackendResult>;
      let queueDepthAtStart = 0;
      let queueWaitMs = 0;
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt >= this.dependencies.now()) {
        cacheStatus = 'hit';
        backendResult = cached.result;
      } else {
        if (cached) this.cache.delete(key);
        let flight = this.inflight.get(key);
        if (flight) {
          cacheStatus = 'shared';
          flight.consumers.add(input.requestId);
        } else {
          cacheStatus = 'miss';
          const flightController = new AbortController();
          const promise = this.runBackendWithPermit(
            input,
            decision.route,
            generation,
            flightController.signal,
          )
            .then((queued) => {
              if (flightController.signal.aborted) throw abortError();
              this.cache.set(key, {
                expiresAt: this.dependencies.now() + this.cacheTtlMs,
                result: queued.result,
              });
              return queued;
            })
            .finally(() => this.inflight.delete(key));
          flight = { controller: flightController, consumers: new Set([input.requestId]), promise };
          this.inflight.set(key, flight);
        }
        const queued = await flight.promise;
        backendResult = queued.result;
        queueDepthAtStart = queued.queueDepthAtStart;
        queueWaitMs = queued.queueWaitMs;
      }

      if (
        controller.signal.aborted ||
        input.signal?.aborted ||
        (this.generations.get(input.requestId) ?? 0) !== generation
      )
        throw abortError();

      const receipt = this.receipt(
        input,
        decision,
        generation,
        cacheStatus,
        backendResult.sourceRevisions,
        backendResult.evidence.map(({ handle }) => handle),
        queueDepthAtStart,
        { decision: decisionMs, ...backendResult.stageTimingsMs, queueWait: queueWaitMs },
        null,
      );
      if (this.receiptEvidence.has(receipt.receiptId)) {
        throw new ContextGatewayReceiptConflictError(receipt.receiptId);
      }
      this.receiptEvidence.set(receipt.receiptId, {
        requestId: input.requestId,
        expiresAt: this.dependencies.now() + this.receiptTtlMs,
        receipt,
        scope: receipt.scopeRevision,
        evidence: new Map(
          backendResult.evidence.map((item) => [item.handle, immutableIdentity(item)]),
        ),
      });
      return Object.freeze({ promptBlock: backendResult.promptBlock, receipt });
    } catch (error) {
      if (error instanceof ContextRequiredUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const failure = safeFailure(error);
      const failureDecision = decision.required
        ? Object.freeze({
            ...decision,
            decision: 'blocked-context-unavailable' as const,
            safeFailure: failure,
          })
        : decision;
      const receipt = this.receipt(
        input,
        failureDecision,
        generation,
        'not-applicable',
        [],
        [],
        0,
        { decision: decisionMs },
        failure,
      );
      if (decision.required) throw new ContextRequiredUnavailableError(receipt);
      return Object.freeze({ promptBlock: '', receipt });
    } finally {
      input.signal?.removeEventListener('abort', onExternalAbort);
      const current = this.active.get(input.requestId);
      if (current?.generation === generation) this.active.delete(input.requestId);
    }
  }
}
