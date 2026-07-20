import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type { JarvisAuthorityBoundResult, JarvisRun } from '@/lib/jarvis/contracts/execution';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';
import { finalizeHiveWithJarvis, type HiveFinalizerDeps } from './hiveFinalizer';

type FinalizerInput = Parameters<typeof finalizeHiveWithJarvis>[0];
type KernelFinalTurnInput = Parameters<HiveFinalizerDeps['kernel']['runHiveFinalTurn']>[0];
type FinalizerResult = JarvisAuthorityBoundResult<JarvisKernelTurnResult>;

function createInput(workingDirectory?: string): FinalizerInput {
  const model = {
    connectionId: 'connection-1',
    providerId: 'openai',
    modelId: 'gpt-5.4',
    connectionMode: 'native-api',
    capabilities: { reasoning: true },
    effectiveTemperature: 0.25,
    capturedAt: 101,
  } as const;
  const workers = Object.freeze([
    Object.freeze({ result: Object.freeze({ opaque: 'worker-one' }) }),
    Object.freeze({ result: Object.freeze({ opaque: 'worker-two' }) }),
  ]) as unknown as FinalizerInput['workers'];

  const input: FinalizerInput = {
    run: Object.freeze({
      id: 'run-1',
      accountId: 'account-1',
      source: 'hive_final',
      status: 'running',
      agentId: 'agent-1',
      identityVersion: 1,
      profileRevisionId: 'profile-revision-1',
      model,
      createdAt: 100,
      updatedAt: 101,
    }) satisfies Readonly<JarvisRun>,
    attempt: Object.freeze({
      kind: 'initial',
      requestId: 'request-1',
      runId: 'run-1',
      attemptNumber: 1,
    }),
    userMessageId: 'message-1',
    interactionMode: 'agent',
    agent: Object.freeze({ id: 'agent-1' }) as unknown as Agent,
    userText: 'Synthesize the registered worker results.',
    messageHistory: Object.freeze([
      Object.freeze({ role: 'user' as const, content: 'Original request' }),
    ]),
    workers,
    identity: Object.freeze({
      identityVersion: 1,
      coreHash: 'identity-core-hash',
      responseContractHash: 'response-contract-hash',
    }),
    profile: Object.freeze({
      profileId: 'profile-1',
      revisionId: 'profile-revision-1',
      customInstructions: '',
      memoryScope: 'none',
    }),
    model,
    capabilities: Object.freeze({
      capturedAt: 101,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable' as const, capabilities: [] },
    }),
    context: Object.freeze({}) as FinalizerInput['context'],
    outputContract: Object.freeze({}) as FinalizerInput['outputContract'],
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
  };

  return input;
}

function createDeps(result: FinalizerResult) {
  const runHiveFinalTurn = vi.fn(
    async (_input: KernelFinalTurnInput): Promise<FinalizerResult> => result,
  );
  const deps: HiveFinalizerDeps = { kernel: { runHiveFinalTurn } };
  return { deps, runHiveFinalTurn };
}

describe('finalizeHiveWithJarvis', () => {
  it('calls only the closed kernel final-turn entry point once with the exact allocated basis', async () => {
    const input = createInput('C:/workspace');
    const committed = {
      kind: 'committed',
      value: Object.freeze({ marker: 'kernel-result' }) as unknown as JarvisKernelTurnResult,
    } as const;
    const { deps, runHiveFinalTurn } = createDeps(committed);

    await finalizeHiveWithJarvis(input, deps);

    expect(runHiveFinalTurn).toHaveBeenCalledTimes(1);
    const forwarded = runHiveFinalTurn.mock.calls[0]![0];
    expect(forwarded).toEqual(input);
    expect(forwarded).not.toBe(input);
    expect(forwarded.run).toBe(input.run);
    expect(forwarded.attempt).toBe(input.attempt);
    expect(forwarded.messageHistory).toBe(input.messageHistory);
    expect(forwarded.identity).toBe(input.identity);
    expect(forwarded.profile).toBe(input.profile);
    expect(forwarded.model).toBe(input.model);
    expect(forwarded.capabilities).toBe(input.capabilities);
    expect(forwarded.context).toBe(input.context);
    expect(forwarded.outputContract).toBe(input.outputContract);
    expect(forwarded.workers).toBe(input.workers);
  });

  it('preserves workingDirectory when supplied and omits it when absent', async () => {
    const committed = {
      kind: 'committed',
      value: Object.freeze({}) as JarvisKernelTurnResult,
    } as const;
    const withDirectory = createDeps(committed);
    const withoutDirectory = createDeps(committed);

    await finalizeHiveWithJarvis(createInput('C:/workspace'), withDirectory.deps);
    await finalizeHiveWithJarvis(createInput(), withoutDirectory.deps);

    expect(withDirectory.runHiveFinalTurn.mock.calls[0]![0]).toHaveProperty(
      'workingDirectory',
      'C:/workspace',
    );
    expect(withoutDirectory.runHiveFinalTurn.mock.calls[0]![0]).not.toHaveProperty(
      'workingDirectory',
    );
  });

  it.each<readonly [string, FinalizerResult]>([
    [
      'committed',
      {
        kind: 'committed',
        value: Object.freeze({ marker: 'committed' }) as unknown as JarvisKernelTurnResult,
      },
    ],
    ['account authority revoked', { kind: 'account_authority_revoked' }],
  ])('returns the %s kernel result unchanged', async (_label, kernelResult) => {
    const { deps } = createDeps(kernelResult);

    const result = await finalizeHiveWithJarvis(createInput(), deps);

    expect(result).toBe(kernelResult);
  });

  it('does not accept or forward a caller surface, callbacks, repositories, or journals', async () => {
    expectTypeOf<
      Extract<'surface' | 'onChunk' | 'repository' | 'journal', keyof FinalizerInput>
    >().toEqualTypeOf<never>();
    expectTypeOf<keyof HiveFinalizerDeps>().toEqualTypeOf<'kernel'>();

    const input = Object.assign(createInput(), {
      surface: 'typed_chat',
      onChunk: vi.fn(),
      repository: { unsafe: true },
      journal: { unsafe: true },
    });
    const { deps, runHiveFinalTurn } = createDeps({ kind: 'account_authority_revoked' });

    await finalizeHiveWithJarvis(input, deps);

    const forwarded = runHiveFinalTurn.mock.calls[0]![0];
    expect(forwarded).not.toHaveProperty('surface');
    expect(forwarded).not.toHaveProperty('onChunk');
    expect(forwarded).not.toHaveProperty('repository');
    expect(forwarded).not.toHaveProperty('journal');
  });
});
