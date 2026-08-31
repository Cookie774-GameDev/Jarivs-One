import { classifyInstantCommandInput } from './parse';
import { executeInstantCommandWithReceipt } from './execute';
import type { InstantCommandReceipt } from './receipt';
import type {
  InstantCommand,
  InstantCommandExecutionContext,
  InstantInputClassification,
} from './types';

export type InstantCommandEntryTrigger = 'typed' | 'phrase_commit' | 'voice_final' | 'retry';
export type InstantCommandEntryInput = Readonly<{
  interactionId: string;
  trigger: InstantCommandEntryTrigger;
  source: string;
  context: InstantCommandExecutionContext;
}>;

export type InstantCommandEntryOutcome =
  | Readonly<{ kind: 'command'; receipt: InstantCommandReceipt }>
  | Readonly<{ kind: 'rejected'; reason: string }>
  | Readonly<{ kind: 'model'; value: unknown }>
  | Readonly<{ kind: 'unmatched' }>;

export type InstantCommandEntryDependencies = Readonly<{
  classify?: (source: string) => InstantInputClassification;
  execute?: (
    command: InstantCommand,
    context: InstantCommandExecutionContext,
  ) => Promise<InstantCommandReceipt>;
  sendToModel?: (source: string) => Promise<unknown>;
}>;

type EntryRecord = {
  readonly binding: string;
  readonly promise: Promise<InstantCommandEntryOutcome>;
  settled: boolean;
};

const SAFE_IDENTITY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const ENTRY_TRIGGERS = new Set<InstantCommandEntryTrigger>([
  'typed',
  'phrase_commit',
  'voice_final',
  'retry',
]);
const UNSAFE_SOURCE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const UNSAFE_REJECTION_CONTROL = /[\u0000-\u001f\u007f]/u;
const MAX_ENTRY_SOURCE_LENGTH = 32_768;
const MAX_ENTRY_RECORDS = 256;
const PROCESSING_FAILURE = 'Instant Command processing failed safely.';

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && SAFE_IDENTITY.test(value);
}

function validateEntryInput(input: InstantCommandEntryInput): string | null {
  if (
    !validIdentity(input.interactionId) ||
    input.context.correlationId !== input.interactionId ||
    !validIdentity(input.context.accountId) ||
    !validIdentity(input.context.workspaceId) ||
    !validIdentity(input.context.projectId)
  ) {
    return 'Invalid interaction identity.';
  }
  if (!ENTRY_TRIGGERS.has(input.trigger)) return 'Invalid interaction trigger.';
  if (
    typeof input.source !== 'string' ||
    !input.source.trim() ||
    input.source.length > MAX_ENTRY_SOURCE_LENGTH ||
    UNSAFE_SOURCE_CONTROL.test(input.source)
  ) {
    return 'Invalid interaction source.';
  }
  return null;
}

function entryBinding(input: InstantCommandEntryInput): string {
  return [
    input.context.accountId,
    input.context.workspaceId,
    input.context.projectId,
    input.source,
  ].join('\u0000');
}

function safeRejectionReason(reason: unknown): string {
  return typeof reason === 'string' &&
    reason.trim() &&
    reason.length <= 200 &&
    !UNSAFE_REJECTION_CONTROL.test(reason)
    ? reason
    : PROCESSING_FAILURE;
}

export class InstantCommandEntryBoundary {
  private readonly inFlight = new Map<string, EntryRecord>();

  constructor(private readonly dependencies: InstantCommandEntryDependencies = {}) {}

  submit(input: InstantCommandEntryInput): Promise<InstantCommandEntryOutcome> {
    const invalid = validateEntryInput(input);
    if (invalid) return Promise.resolve({ kind: 'rejected', reason: invalid });
    const interactionId = input.interactionId;
    const binding = entryBinding(input);
    const prior = this.inFlight.get(interactionId);
    if (prior) {
      return prior.binding === binding
        ? prior.promise
        : Promise.resolve({
            kind: 'rejected',
            reason: 'That interaction identity is already bound to different input.',
          });
    }
    if (this.inFlight.size >= MAX_ENTRY_RECORDS) {
      for (const [candidateId, candidate] of this.inFlight) {
        if (!candidate.settled) continue;
        this.inFlight.delete(candidateId);
        break;
      }
    }
    if (this.inFlight.size >= MAX_ENTRY_RECORDS) {
      return Promise.resolve({
        kind: 'rejected',
        reason: 'Too many Instant Commands are active.',
      });
    }
    const operation = this.run(input);
    const record: EntryRecord = { binding, promise: operation, settled: false };
    this.inFlight.set(interactionId, record);
    void operation.then(
      () => {
        record.settled = true;
      },
      () => {
        record.settled = true;
      },
    );
    return operation;
  }

  clear(interactionId: string): void {
    this.inFlight.delete(interactionId);
  }

  private async run(input: InstantCommandEntryInput): Promise<InstantCommandEntryOutcome> {
    try {
      const classification = (this.dependencies.classify ?? classifyInstantCommandInput)(
        input.source,
      );
      if (classification.status === 'rejected') {
        return { kind: 'rejected', reason: safeRejectionReason(classification.reason) };
      }
      if (classification.status === 'matched') {
        const receipt = await (this.dependencies.execute ?? executeInstantCommandWithReceipt)(
          classification.command,
          input.context,
        );
        return { kind: 'command', receipt };
      }
      if (this.dependencies.sendToModel) {
        return { kind: 'model', value: await this.dependencies.sendToModel(input.source) };
      }
      return { kind: 'unmatched' };
    } catch {
      return { kind: 'rejected', reason: PROCESSING_FAILURE };
    }
  }
}
