import type { HarnessErrorPayload } from './types';

const MAX_MESSAGE_LENGTH = 2_048;
const MAX_REPAIR_LENGTH = 512;
const MAX_DIAGNOSTIC_LENGTH = 2_048;

export class HarnessError extends Error {
  readonly code: HarnessErrorPayload['code'];
  readonly repair: string;
  readonly recoverable: boolean;
  readonly diagnostic?: string;

  constructor(input: HarnessErrorPayload) {
    super(input.message);
    this.name = 'HarnessError';
    this.code = input.code;
    this.repair = input.repair;
    this.recoverable = input.recoverable;
    if (input.diagnostic !== undefined) this.diagnostic = input.diagnostic;
  }
}

export function redactHarnessText(value: string): string {
  return value
    .replace(/\b(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(Bearer|Basic)\s+[^\s]+/gi, '$1 [REDACTED]')
    .replace(
      /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)|api_key|token)\s*=\s*[^\s]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
}

export function toHarnessErrorPayload(error: unknown): HarnessErrorPayload {
  const source =
    error instanceof HarnessError
      ? error
      : new HarnessError({
          code: 'HARNESS_START_FAILED',
          message: error instanceof Error ? error.message : 'Harness operation failed.',
          repair: 'Retry the harness operation.',
          recoverable: true,
        });

  return {
    code: source.code,
    message: redactHarnessText(source.message).slice(0, MAX_MESSAGE_LENGTH),
    repair: redactHarnessText(source.repair).slice(0, MAX_REPAIR_LENGTH),
    ...(source.diagnostic
      ? {
          diagnostic: redactHarnessText(source.diagnostic).slice(0, MAX_DIAGNOSTIC_LENGTH),
        }
      : {}),
    recoverable: source.recoverable,
  };
}
