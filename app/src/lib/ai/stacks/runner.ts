import { finalizeHiveWithJarvis, type HiveFinalizerDeps } from './hiveFinalizer';
import type { StackRunResult, StackStepResult, StackStepSpec } from './types';

export type HiveRunnerAuthorityBoundResult<T> =
  | { kind: 'committed'; value: T }
  | { kind: 'account_authority_revoked' };

export type HiveWorkerOutcome = Readonly<{
  result: Readonly<{
    status: 'completed' | 'failed' | 'cancelled';
    text?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    errorCategory?: string;
  }>;
}>;

export interface HiveWorkerHandle {
  execute(): Promise<HiveRunnerAuthorityBoundResult<HiveWorkerOutcome>>;
  dispose(): void;
}

export interface HiveRunnerKernelPort {
  openHiveWorker(input: {
    parentRunId: string;
    stepId: string;
  }): Promise<HiveRunnerAuthorityBoundResult<HiveWorkerHandle>>;
}

type HiveFinalizerInput = Parameters<typeof finalizeHiveWithJarvis>[0];

export type HiveFinalTurnBasis = Omit<HiveFinalizerInput, 'workers'>;

export interface RunStackInput {
  parentRunId: string;
  steps: readonly StackStepSpec[];
  finalTurnBasis: HiveFinalTurnBasis;
  onStep?: (step: StackStepResult) => void;
}

export interface RunStackDeps {
  kernel: Pick<HiveRunnerKernelPort, 'openHiveWorker'>;
  finalizer: HiveFinalizerDeps;
}

function mapWorkerOutcome(step: StackStepSpec, outcome: HiveWorkerOutcome): StackStepResult {
  const metadata = outcome.result;
  const mapped = {
    ...step,
    text: metadata.status === 'completed' ? (metadata.text ?? '') : '',
    status: metadata.status === 'completed' ? ('done' as const) : ('error' as const),
    ...(metadata.inputTokens === undefined ? {} : { input_tokens: metadata.inputTokens }),
    ...(metadata.outputTokens === undefined ? {} : { output_tokens: metadata.outputTokens }),
    ...(metadata.costUsd === undefined ? {} : { cost_usd: metadata.costUsd }),
    ...(metadata.status === 'completed' || metadata.errorCategory === undefined
      ? {}
      : { error: metadata.errorCategory }),
  } satisfies Omit<StackStepResult, 'duration_ms'>;

  // The closed worker outcome intentionally carries no clock or duration.
  // Keep the legacy display type until its required duration field is retired.
  return mapped as StackStepResult;
}

async function executeHiveWorker(
  handle: HiveWorkerHandle,
): Promise<HiveRunnerAuthorityBoundResult<HiveWorkerOutcome>> {
  let executed!: HiveRunnerAuthorityBoundResult<HiveWorkerOutcome>;
  let executionFailure: { error: unknown } | undefined;
  try {
    executed = await handle.execute();
  } catch (error) {
    executionFailure = { error };
  } finally {
    try {
      handle.dispose();
    } catch (disposalError) {
      const hasPrimaryOutcome =
        executionFailure !== undefined || executed.kind === 'account_authority_revoked';
      // Cleanup is secondary to the closed executor's error or authority revocation.
      if (!hasPrimaryOutcome) throw disposalError;
    }
  }

  if (executionFailure !== undefined) throw executionFailure.error;
  return executed;
}

export async function runStack(
  { parentRunId, steps, finalTurnBasis, onStep }: RunStackInput,
  deps: RunStackDeps,
): Promise<HiveRunnerAuthorityBoundResult<StackRunResult>> {
  const outcomes: HiveWorkerOutcome[] = [];
  const results: StackStepResult[] = [];
  const usage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

  for (const step of steps) {
    const opened = await deps.kernel.openHiveWorker({
      parentRunId,
      stepId: step.id,
    });
    if (opened.kind === 'account_authority_revoked') return opened;

    const handle = opened.value;
    const executed = await executeHiveWorker(handle);
    if (executed.kind === 'account_authority_revoked') return executed;

    const outcome = executed.value;
    const result = mapWorkerOutcome(step, outcome);
    outcomes.push(outcome);
    results.push(result);
    usage.input_tokens += result.input_tokens ?? 0;
    usage.output_tokens += result.output_tokens ?? 0;
    usage.cost_usd += result.cost_usd ?? 0;
    onStep?.(result);
  }

  const finalized = await finalizeHiveWithJarvis(
    { ...finalTurnBasis, workers: outcomes },
    deps.finalizer,
  );
  if (finalized.kind === 'account_authority_revoked') return finalized;

  return {
    kind: 'committed',
    value: {
      finalText: finalized.value.response.displayText,
      steps: results,
      usage,
    },
  };
}
