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
}

interface CachedResult {
  expiresAt: number;
  result: Readonly<ContextGatewayBackendResult>;
}

interface InflightResult {
  controller: AbortController;
  consumers: Set<string>;
  promise: Promise<Readonly<ContextGatewayBackendResult>>;
}

interface ActiveRequest {
  controller: AbortController;
  generation: number;
  cacheKey?: string;
}

interface ReceiptEvidence {
  requestId: string;
  receipt: Readonly<ContextReceipt>;
  scope: Readonly<ContextScopeRevision>;
  evidence: ReadonlyMap<string, Readonly<ContextEvidence>>;
}

function abortError(): DOMException {
  return new DOMException('VibeSpace Context Gateway request was cancelled.', 'AbortError');
}

function sameScope(a: Readonly<ContextScopeRevision>, b: Readonly<ContextScopeRevision>): boolean {
  return a.accountId === b.accountId && a.workspaceId === b.workspaceId &&
    a.projectId === b.projectId && a.worktreeId === b.worktreeId && a.revision === b.revision;
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
    super(`Required VibeSpace context is unavailable (${receipt.safeFailure ?? 'retrieval-failed'}).`);
    this.name = 'ContextRequiredUnavailableError';
  }
}

export class ContextGateway {
  private readonly cache = new Map<string, CachedResult>();
  private readonly inflight = new Map<string, InflightResult>();
  private readonly generations = new Map<string, number>();
  private readonly active = new Map<string, ActiveRequest>();
  private readonly receiptEvidence = new Map<string, ReceiptEvidence>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly backend: Readonly<ContextGatewayBackend>,
    private readonly dependencies: Readonly<ContextGatewayDependencies>,
  ) {
    this.cacheTtlMs = Math.max(0, dependencies.cacheTtlMs ?? 30_000);
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
    if (!record) throw new Error('Context evidence receipt is missing or expired.');
    if (!sameScope(record.scope, input.scope)) {
      throw new Error('Context evidence scope does not match the receipt scope.');
    }
    const evidence = record.evidence.get(input.handle);
    if (!evidence) throw new Error('Context evidence handle was not issued by this receipt.');
    return evidence;
  }

  verifyRequiredReceipt(input: Readonly<VerifyContextReceiptRequest>): Readonly<ContextReceipt> | null {
    const record = this.receiptEvidence.get(input.receiptId);
    if (!record || record.requestId !== input.requestId || !sameScope(record.scope, input.scope)) return null;
    const receipt = record.receipt;
    if (!receipt.required || receipt.safeFailure !== null) return null;
    if ((this.generations.get(input.requestId) ?? 0) !== receipt.cancellationGeneration) return null;
    const strength = receipt.route === 'deep' ? 2 : receipt.route === 'focused' || receipt.route === 'exact' ? 1 : 0;
    const minimum = input.minimumRoute === 'deep' ? 2 : 1;
    return strength >= minimum ? receipt : null;
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

  private receipt(
    input: Readonly<ContextGatewayRequest>,
    decision: ReturnType<typeof decideContextPolicy>,
    generation: number,
    cacheStatus: ContextReceipt['cacheStatus'],
    sourceRevisions: ContextReceipt['sourceRevisions'],
    evidenceHandles: readonly string[],
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
      stageTimingsMs: immutableIdentity(stageTimingsMs),
      cancellationGeneration: generation,
      safeFailure: failure,
      executionIdentity: immutableIdentity(input.executionIdentity),
    });
  }

  private async execute(input: Readonly<ContextGatewayRequest>): Promise<Readonly<PreparedContextTurn>> {
    const decisionStartedAt = this.dependencies.now();
    const available = this.backend.available();
    const decision = decideContextPolicy({ ...input, gatewayAvailable: available });
    const generation = this.generations.get(input.requestId) ?? 0;
    const controller = new AbortController();
    this.active.set(input.requestId, { controller, generation });
    const onExternalAbort = () => controller.abort();
    input.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const decisionMs = Math.max(0, this.dependencies.now() - decisionStartedAt);

    try {
      if (controller.signal.aborted || input.signal?.aborted) throw abortError();
      if (decision.decision === 'blocked-context-unavailable') {
        const receipt = this.receipt(
          input, decision, generation, 'not-applicable', [], [], { decision: decisionMs },
          decision.safeFailure,
        );
        throw new ContextRequiredUnavailableError(receipt);
      }
      if (decision.route === 'direct') {
        return Object.freeze({
          promptBlock: '',
          receipt: this.receipt(input, decision, generation, 'not-applicable', [], [], {
            decision: decisionMs,
            total: decisionMs,
          }, null),
        });
      }

      const key = this.cacheKey(input, decision.route);
      const active = this.active.get(input.requestId);
      if (active) active.cacheKey = key;
      let cacheStatus: ContextReceipt['cacheStatus'];
      let backendResult: Readonly<ContextGatewayBackendResult>;
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
          const promise = this.backend.ask({
            route: decision.route,
            question: input.question,
            scope: input.scope,
            performance: input.performance,
            activePaths: input.activePaths,
            exactIdentifiers: input.exactIdentifiers,
            cancellationGeneration: generation,
            signal: flightController.signal,
          }).then((result) => {
            if (flightController.signal.aborted) throw abortError();
            this.cache.set(key, { expiresAt: this.dependencies.now() + this.cacheTtlMs, result });
            return result;
          }).finally(() => this.inflight.delete(key));
          flight = { controller: flightController, consumers: new Set([input.requestId]), promise };
          this.inflight.set(key, flight);
        }
        backendResult = await flight.promise;
      }

      if (
        controller.signal.aborted || input.signal?.aborted ||
        (this.generations.get(input.requestId) ?? 0) !== generation
      ) throw abortError();

      const receipt = this.receipt(
        input,
        decision,
        generation,
        cacheStatus,
        backendResult.sourceRevisions,
        backendResult.evidence.map(({ handle }) => handle),
        { decision: decisionMs, ...backendResult.stageTimingsMs },
        null,
      );
      this.receiptEvidence.set(receipt.receiptId, {
        requestId: input.requestId,
        receipt,
        scope: receipt.scopeRevision,
        evidence: new Map(backendResult.evidence.map((item) => [item.handle, immutableIdentity(item)])),
      });
      return Object.freeze({ promptBlock: backendResult.promptBlock, receipt });
    } catch (error) {
      if (error instanceof ContextRequiredUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const failure = safeFailure(error);
      const failureDecision = decision.required
        ? Object.freeze({ ...decision, decision: 'blocked-context-unavailable' as const, safeFailure: failure })
        : decision;
      const receipt = this.receipt(
        input, failureDecision, generation, 'not-applicable', [], [], { decision: decisionMs }, failure,
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
