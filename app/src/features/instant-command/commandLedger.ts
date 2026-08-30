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
}>;

type ExecutionRecord<T> = Readonly<{ fingerprint: string; result: Promise<T> }>;
type ConfirmationRecord = Readonly<{
  fingerprint: string;
  expiresAtMs: number;
  used: boolean;
}>;

function fingerprint(binding: InstantCommandBinding): string {
  return JSON.stringify([
    binding.accountId,
    binding.workspaceId,
    binding.projectId,
    binding.commandId,
    [...binding.targetIds],
    binding.argumentDigest,
  ]);
}

export class InstantCommandLedger {
  readonly #now: () => number;
  readonly #createToken: () => string;
  readonly #executions = new Map<string, ExecutionRecord<unknown>>();
  readonly #confirmations = new Map<string, ConfirmationRecord>();

  constructor(dependencies: LedgerDependencies = {}) {
    this.#now = dependencies.now ?? Date.now;
    this.#createToken =
      dependencies.createToken ??
      (() => `ic-confirm-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)}`);
  }

  runOnce<T>(
    correlationId: string,
    binding: InstantCommandBinding,
    operation: () => Promise<T>,
  ): Promise<T> {
    const nextFingerprint = fingerprint(binding);
    const existing = this.#executions.get(correlationId);
    if (existing) {
      if (existing.fingerprint !== nextFingerprint) {
        return Promise.reject(new Error('Correlation id was reused with a different command'));
      }
      return existing.result as Promise<T>;
    }
    const result = Promise.resolve().then(operation);
    this.#executions.set(correlationId, { fingerprint: nextFingerprint, result });
    return result;
  }

  issueConfirmation(binding: InstantCommandBinding, ttlMs: number): string {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid confirmation expiry');
    const token = this.#createToken();
    this.#confirmations.set(token, {
      fingerprint: fingerprint(binding),
      expiresAtMs: this.#now() + ttlMs,
      used: false,
    });
    return token;
  }

  consumeConfirmation(token: string, binding: InstantCommandBinding): boolean {
    const record = this.#confirmations.get(token);
    if (!record || record.used || record.expiresAtMs < this.#now()) {
      this.#confirmations.delete(token);
      return false;
    }
    if (record.fingerprint !== fingerprint(binding)) return false;
    this.#confirmations.set(token, { ...record, used: true });
    return true;
  }
}
