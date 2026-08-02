import type { LLMMessage } from '@/lib/ai/types';
import type { Agent } from '@/types';
import type {
  JarvisCapabilitySnapshot,
  JarvisModelSnapshot,
} from '@/lib/jarvis/contracts/capability';
import type { JarvisAuthorityBoundResult, JarvisRun } from '@/lib/jarvis/contracts/execution';
import type { JarvisRequestEnvelope } from '@/lib/jarvis/contracts/request';
import type { JarvisOutputContract } from '@/lib/jarvis/contracts/response';
import type { JarvisContextPack } from '@/lib/jarvis/contracts/source';
import type { JarvisIdentitySnapshot } from '@/lib/jarvis/identity';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';
import type { JarvisProfileSnapshot } from '@/lib/jarvis/profiles/types';
import type { JarvisRequestAttempt } from '@/lib/jarvis/requestEnvelope';

type JarvisHiveWorkerOutcome = Readonly<{
  result: Readonly<object>;
}>;

type HiveFinalTurnInput = {
  run: Readonly<JarvisRun>;
  attempt: JarvisRequestAttempt;
  userMessageId: string;
  interactionMode: JarvisRequestEnvelope['interactionMode'];
  agent: Agent;
  userText: string;
  messageHistory: readonly LLMMessage[];
  workers: readonly JarvisHiveWorkerOutcome[];
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  model: JarvisModelSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  workingDirectory?: string;
};

interface HiveFinalizerKernel {
  runHiveFinalTurn(
    input: Readonly<HiveFinalTurnInput>,
  ): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>>;
}

export interface HiveFinalizerDeps {
  kernel: Pick<HiveFinalizerKernel, 'runHiveFinalTurn'>;
}

export async function finalizeHiveWithJarvis(
  input: HiveFinalTurnInput,
  deps: HiveFinalizerDeps,
): Promise<JarvisAuthorityBoundResult<JarvisKernelTurnResult>> {
  return deps.kernel.runHiveFinalTurn({
    run: input.run,
    attempt: input.attempt,
    userMessageId: input.userMessageId,
    interactionMode: input.interactionMode,
    agent: input.agent,
    userText: input.userText,
    messageHistory: input.messageHistory,
    workers: input.workers,
    identity: input.identity,
    profile: input.profile,
    model: input.model,
    capabilities: input.capabilities,
    context: input.context,
    outputContract: input.outputContract,
    ...(input.workingDirectory === undefined ? {} : { workingDirectory: input.workingDirectory }),
  });
}
