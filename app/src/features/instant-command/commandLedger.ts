export type InstantCommandBinding = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
  commandId: string;
  targetIds: readonly string[];
  argumentDigest: string;
}>;

type LedgerDependencies = Readonly<{
  now?: () => number;
  createToken?: () => string;
  maxExecutions?: number;
  maxConfirmations?: number;
}>;

type ExecutionRecord<T> = { fingerprint: string; result: Promise<T>; settled: boolean };
type ConfirmationRecord = Readonly<{
  fingerprint: string;
  expiresAtMs: number;
}>;

const SAFE_BINDING_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const MAX_CONFIRMATION_TTL_MS = 300_000;

function requireCapacity(label: string, value: number, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid ${label} capacity`);
  }
  return value;
}

function requireBindingValue(label: string, value: string): void {
  if (!SAFE_BINDING_VALUE.test(value)) throw new Error(`Invalid command binding ${label}`);
}

function fingerprint(binding: InstantCommandBinding): string {
  requireBindingValue('account', binding.accountId);
  requireBindingValue('workspace', binding.workspaceId);
  requireBindingValue('project', binding.projectId);
  requireBindingValue('command', binding.commandId);
  requireBindingValue('arguments', binding.argumentDigest);
  if (binding.targetIds.length > 128) throw new Error('Invalid command binding targets');
  binding.targetIds.forEach((target) => requireBindingValue('target', target));
  if (new Set(binding.targetIds).size !== binding.targetIds.length) {
    throw new Error('Duplicate command binding target');
  }
  return JSON.stringify([
    binding.accountId,
    binding.workspaceId,
    binding.projectId,
    binding.commandId,
    [...binding.targetIds].sort(),
    binding.argumentDigest,
  ]);
}

export class InstantCommandLedger {
  readonly #now: () => number;
  readonly #createToken: () => string;
  readonly #maxExecutions: number;
  readonly #maxConfirmations: number;
  readonly #executions = new Map<string, ExecutionRecord<unknown>>();
  readonly #confirmations = new Map<string, ConfirmationRecord>();

  constructor(dependencies: LedgerDependencies = {}) {
    this.#now = dependencies.now ?? Date.now;
    this.#createToken =
      dependencies.createToken ??
      (() => `ic-confirm-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)}`);
    this.#maxExecutions = requireCapacity('execution', dependencies.maxExecutions ?? 4_096, 4_096);
    this.#maxConfirmations = requireCapacity(
      'confirmation',
      dependencies.maxConfirmations ?? 1_024,
      1_024,
    );
  }

  runOnce<T>(
    correlationId: string,
    binding: InstantCommandBinding,
    operation: () => Promise<T>,
  ): Promise<T> {
    requireBindingValue('correlation', correlationId);
    const nextFingerprint = fingerprint(binding);
    const existing = this.#executions.get(correlationId);
    if (existing) {
      if (existing.fingerprint !== nextFingerprint) {
        return Promise.reject(new Error('Correlation id was reused with a different command'));
      }
      return existing.result as Promise<T>;
    }
    if (this.#executions.size >= this.#maxExecutions) {
      for (const [candidateId, candidate] of this.#executions) {
        if (!candidate.settled) continue;
        this.#executions.delete(candidateId);
        break;
      }
    }
    if (this.#executions.size >= this.#maxExecutions) {
      return Promise.reject(new Error('Instant command ledger execution capacity exceeded'));
    }
    const result = Promise.resolve().then(operation);
    const record: ExecutionRecord<T> = {
      fingerprint: nextFingerprint,
      result,
      settled: false,
    };
    this.#executions.set(correlationId, record);
    void result.then(
      () => {
        record.settled = true;
      },
      () => {
        record.settled = true;
      },
    );
    return result;
  }

  issueConfirmation(binding: InstantCommandBinding, ttlMs: number): string {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_CONFIRMATION_TTL_MS) {
      throw new Error('Invalid confirmation expiry');
    }
    const now = this.#now();
    for (const [existingToken, record] of this.#confirmations) {
      if (record.expiresAtMs <= now) this.#confirmations.delete(existingToken);
    }
    if (this.#confirmations.size >= this.#maxConfirmations) {
      throw new Error('Instant command ledger confirmation capacity exceeded');
    }
    const token = this.#createToken();
    requireBindingValue('confirmation token', token);
    const existing = this.#confirmations.get(token);
    if (existing && existing.expiresAtMs > this.#now()) {
      throw new Error('Confirmation token collision');
    }
    this.#confirmations.set(token, {
      fingerprint: fingerprint(binding),
      expiresAtMs: now + ttlMs,
    });
    return token;
  }

  consumeConfirmation(token: string, binding: InstantCommandBinding): boolean {
    if (!SAFE_BINDING_VALUE.test(token)) return false;
    const record = this.#confirmations.get(token);
    if (!record || record.expiresAtMs <= this.#now()) {
      this.#confirmations.delete(token);
      return false;
    }
    if (record.fingerprint !== fingerprint(binding)) return false;
    this.#confirmations.delete(token);
    return true;
  }
}
