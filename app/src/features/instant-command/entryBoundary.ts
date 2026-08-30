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

export class InstantCommandEntryBoundary {
  private readonly inFlight = new Map<string, Promise<InstantCommandEntryOutcome>>();

  constructor(private readonly dependencies: InstantCommandEntryDependencies = {}) {}

  submit(input: InstantCommandEntryInput): Promise<InstantCommandEntryOutcome> {
    const interactionId = input.interactionId.trim();
    if (!interactionId || input.context.correlationId !== interactionId) {
      return Promise.resolve({ kind: 'rejected', reason: 'Invalid interaction identity.' });
    }
    const prior = this.inFlight.get(interactionId);
    if (prior) return prior;
    const operation = this.run(input);
    this.inFlight.set(interactionId, operation);
    if (this.inFlight.size > 256) this.inFlight.delete(this.inFlight.keys().next().value!);
    return operation;
  }

  clear(interactionId: string): void {
    this.inFlight.delete(interactionId);
  }

  private async run(input: InstantCommandEntryInput): Promise<InstantCommandEntryOutcome> {
    const classification = (this.dependencies.classify ?? classifyInstantCommandInput)(
      input.source,
    );
    if (classification.status === 'rejected') {
      return { kind: 'rejected', reason: classification.reason };
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
  }
}
