import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type { AgentId } from '@/types/common';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';
import type { StackStepSpec } from './types';
import {
  runStack,
  type HiveFinalTurnBasis,
  type HiveWorkerHandle,
  type HiveWorkerOutcome,
  type RunStackDeps,
  type RunStackInput,
} from './runner';

type FinalTurnInput = Parameters<RunStackDeps['finalizer']['kernel']['runHiveFinalTurn']>[0];

const forbiddenProviderPaths = vi.hoisted(() => ({
  runAgent: vi.fn(async () => {
    throw new Error('runner_must_not_call_runAgent');
  }),
  runHostedStackStep: vi.fn(async () => {
    throw new Error('runner_must_not_call_runHostedStackStep');
  }),
}));

vi.mock('../router', () => ({ runAgent: forbiddenProviderPaths.runAgent }));
vi.mock('./hostedStack', () => ({
  canUseHostedStack: () => false,
  runHostedStackStep: forbiddenProviderPaths.runHostedStackStep,
}));

function baseAgent(): Agent {
  return {
    id: 'agent_hive' as AgentId,
    slug: 'jarvis',
    name: 'Jarvis',
    description: 'Jarvis',
    system_prompt: 'BASE PERSONALITY: preserve this exact prompt.',
    model: { provider: 'openai', model: 'gpt-final' },
    tools_allowed: [],
    memory_scope: 'workspace',
    capabilities: [],
    created_at: 1,
    updated_at: 1,
  };
}

function step(id: string, overrides: Partial<StackStepSpec> = {}): StackStepSpec {
  return {
    id,
    label: `${id} specialist`,
    provider: 'openai',
    model: `${id}-model`,
    systemAppend: `PRIVATE SPECIALIST PROMPT ${id}`,
    temperature: 0.25,
    provider_options: { reasoning_effort: 'high' },
    ...overrides,
  };
}

function finalTurnBasis(parentRunId = 'parent-run'): HiveFinalTurnBasis {
  const model = {
    connectionId: 'connection-final',
    providerId: 'openai',
    modelId: 'gpt-final',
    connectionMode: 'native-api',
    capabilities: { reasoning: true },
    effectiveTemperature: 0.25,
    capturedAt: 101,
  } as const;

  return Object.freeze({
    run: Object.freeze({
      id: parentRunId,
      accountId: 'account-1',
      source: 'hive_final',
      status: 'running',
      agentId: 'agent_hive',
      identityVersion: 1,
      profileRevisionId: 'profile-revision-1',
      model,
      createdAt: 100,
      updatedAt: 101,
    }),
    attempt: Object.freeze({
      kind: 'initial',
      requestId: 'request-final',
      runId: parentRunId,
      attemptNumber: 1,
    }),
    userMessageId: 'message-1',
    interactionMode: 'agent',
    agent: Object.freeze(baseAgent()),
    userText: 'Synthesize the registered Hive outcomes.',
    messageHistory: Object.freeze([
      Object.freeze({ role: 'user' as const, content: 'Original user request' }),
    ]),
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
    context: Object.freeze({}),
    outputContract: Object.freeze({}),
    workingDirectory: 'C:/workspace',
  }) as unknown as HiveFinalTurnBasis;
}

function outcome(
  status: HiveWorkerOutcome['result']['status'],
  index: number,
  overrides: Partial<HiveWorkerOutcome['result']> = {},
): HiveWorkerOutcome {
  return Object.freeze({
    result: Object.freeze({
      status,
      ...(status === 'completed' ? { text: `worker ${index} output` } : {}),
      inputTokens: index + 1,
      outputTokens: (index + 1) * 10,
      costUsd: (index + 1) / 100,
      ...(status === 'failed' ? { errorCategory: 'provider_error' } : {}),
      ...(status === 'cancelled' ? { errorCategory: 'cancelled' } : {}),
      ...overrides,
    }),
  });
}

function harness(workerOutcomes: readonly HiveWorkerOutcome[], finalText = 'Jarvis synthesis') {
  const handles = workerOutcomes.map((workerOutcome) => ({
    execute: vi.fn(async () => ({ kind: 'committed' as const, value: workerOutcome })),
    dispose: vi.fn(),
  }));
  let nextHandle = 0;
  const openHiveWorker = vi.fn(async () => ({
    kind: 'committed' as const,
    value: handles[nextHandle++]!,
  }));
  const finalKernelResult = Object.freeze({
    response: Object.freeze({ displayText: finalText }),
  }) as unknown as JarvisKernelTurnResult;
  const runHiveFinalTurn = vi.fn(async (_input: FinalTurnInput) => ({
    kind: 'committed' as const,
    value: finalKernelResult,
  }));
  const deps = {
    kernel: { openHiveWorker },
    finalizer: { kernel: { runHiveFinalTurn } },
  } as RunStackDeps;

  return {
    deps,
    handles,
    openHiveWorker,
    runHiveFinalTurn,
    finalKernelResult,
  };
}

describe('runStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens each persisted step with the exact identity input, executes with no arguments, and finalizes once', async () => {
    const steps = [
      step('draft', { label: 'Research specialist', provider: 'google', model: 'gemini' }),
      step('review', { label: 'Security specialist', provider: 'anthropic', model: 'claude' }),
    ];
    const workerOutcomes = [outcome('completed', 0), outcome('completed', 1)];
    const basis = finalTurnBasis();
    const onStep = vi.fn();
    const testHarness = harness(workerOutcomes);

    const result = await runStack(
      { parentRunId: 'parent-run', steps, finalTurnBasis: basis, onStep },
      testHarness.deps,
    );

    expect(testHarness.openHiveWorker.mock.calls).toEqual([
      [{ parentRunId: 'parent-run', stepId: 'draft' }],
      [{ parentRunId: 'parent-run', stepId: 'review' }],
    ]);
    for (const handle of testHarness.handles) {
      expect(handle.execute).toHaveBeenCalledTimes(1);
      expect(handle.execute).toHaveBeenCalledWith();
      expect(handle.dispose).toHaveBeenCalledTimes(1);
    }
    expect(testHarness.runHiveFinalTurn).toHaveBeenCalledTimes(1);
    const finalInput = testHarness.runHiveFinalTurn.mock.calls[0]![0];
    if (!finalInput) throw new Error('expected final-turn input');
    expect(finalInput.workers).toEqual(workerOutcomes);
    expect(finalInput.workers[0]).toBe(workerOutcomes[0]);
    expect(finalInput.workers[1]).toBe(workerOutcomes[1]);
    expect(finalInput.run).toBe(basis.run);
    expect(finalInput.attempt).toBe(basis.attempt);
    expect(finalInput.agent).toBe(basis.agent);
    expect(finalInput.agent.system_prompt).toBe('BASE PERSONALITY: preserve this exact prompt.');
    expect(finalInput.messageHistory).toBe(basis.messageHistory);
    expect(finalInput.identity).toBe(basis.identity);
    expect(finalInput.profile).toBe(basis.profile);
    expect(finalInput.model).toBe(basis.model);
    expect(finalInput.capabilities).toBe(basis.capabilities);
    expect(finalInput.context).toBe(basis.context);
    expect(finalInput.outputContract).toBe(basis.outputContract);
    expect(finalInput.workingDirectory).toBe(basis.workingDirectory);
    expect(forbiddenProviderPaths.runAgent).not.toHaveBeenCalled();
    expect(forbiddenProviderPaths.runHostedStackStep).not.toHaveBeenCalled();

    expect(result.kind).toBe('committed');
    if (result.kind !== 'committed') throw new Error('expected committed stack result');
    expect(result.value.finalText).toBe('Jarvis synthesis');
    expect(result.value.steps).toEqual([
      expect.objectContaining({
        ...steps[0],
        text: 'worker 0 output',
        status: 'done',
      }),
      expect.objectContaining({
        ...steps[1],
        text: 'worker 1 output',
        status: 'done',
      }),
    ]);
    expect(result.value.steps[0]).not.toHaveProperty('duration_ms');
    expect(result.value.steps[1]).not.toHaveProperty('duration_ms');
    expect(result.value.usage).toEqual({
      input_tokens: 3,
      output_tokens: 30,
      cost_usd: 0.03,
    });
    expect(onStep.mock.calls.map(([mapped]) => mapped)).toEqual(result.value.steps);
  });

  it.each([
    {
      label: 'all-success',
      statuses: ['completed', 'completed'] as const,
      visible: ['done', 'done'],
    },
    {
      label: 'partial',
      statuses: ['completed', 'failed', 'completed'] as const,
      visible: ['done', 'error', 'done'],
    },
    {
      label: 'all-failed',
      statuses: ['failed', 'failed'] as const,
      visible: ['error', 'error'],
    },
    {
      label: 'cancelled',
      statuses: ['completed', 'cancelled'] as const,
      visible: ['done', 'error'],
    },
  ])('preserves $label aggregation and safe worker metadata', async ({ statuses, visible }) => {
    const steps = statuses.map((_status, index) => step(`step-${index}`));
    const workerOutcomes = statuses.map((status, index) =>
      outcome(status, index, status === 'completed' ? {} : { text: 'UNSAFE FAILURE TEXT' }),
    );
    const onStep = vi.fn();
    const testHarness = harness(workerOutcomes);

    const result = await runStack(
      { parentRunId: 'parent-run', steps, finalTurnBasis: finalTurnBasis(), onStep },
      testHarness.deps,
    );

    expect(result.kind).toBe('committed');
    if (result.kind !== 'committed') throw new Error('expected committed stack result');
    expect(result.value.steps.map((mapped) => mapped.status)).toEqual(visible);
    expect(result.value.steps.map((mapped) => mapped.text)).toEqual(
      statuses.map((status, index) => (status === 'completed' ? `worker ${index} output` : '')),
    );
    expect(result.value.steps.map((mapped) => mapped.error)).toEqual(
      statuses.map((status) =>
        status === 'failed' ? 'provider_error' : status === 'cancelled' ? 'cancelled' : undefined,
      ),
    );
    expect(result.value.usage).toEqual({
      input_tokens: statuses.reduce((total, _status, index) => total + index + 1, 0),
      output_tokens: statuses.reduce((total, _status, index) => total + (index + 1) * 10, 0),
      cost_usd: statuses.reduce((total, _status, index) => total + (index + 1) / 100, 0),
    });
    expect(onStep).toHaveBeenCalledTimes(statuses.length);
    expect(testHarness.runHiveFinalTurn).toHaveBeenCalledTimes(1);
    expect(testHarness.runHiveFinalTurn.mock.calls[0]![0].workers).toEqual(workerOutcomes);
  });

  it('disposes the worker handle and rethrows an executor error without fabricating a failed result', async () => {
    const executionError = new Error('closed executor failed');
    const disposalError = new Error('worker disposer failed');
    const handle: HiveWorkerHandle = {
      execute: vi.fn(async () => {
        throw executionError;
      }),
      dispose: vi.fn(() => {
        throw disposalError;
      }),
    };
    const runHiveFinalTurn = vi.fn();
    const deps = {
      kernel: {
        openHiveWorker: vi.fn(async () => ({ kind: 'committed' as const, value: handle })),
      },
      finalizer: { kernel: { runHiveFinalTurn } },
    } as unknown as RunStackDeps;
    const onStep = vi.fn();

    await expect(
      runStack(
        {
          parentRunId: 'parent-run',
          steps: [step('draft')],
          finalTurnBasis: finalTurnBasis(),
          onStep,
        },
        deps,
      ),
    ).rejects.toBe(executionError);

    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
    expect(runHiveFinalTurn).not.toHaveBeenCalled();
  });

  it('disposes the worker handle and passes execute-time account revocation through unchanged', async () => {
    const revoked = Object.freeze({ kind: 'account_authority_revoked' as const });
    const disposalError = new Error('worker disposer failed');
    const handle: HiveWorkerHandle = {
      execute: vi.fn(async () => revoked),
      dispose: vi.fn(() => {
        throw disposalError;
      }),
    };
    const runHiveFinalTurn = vi.fn();
    const deps = {
      kernel: {
        openHiveWorker: vi.fn(async () => ({ kind: 'committed' as const, value: handle })),
      },
      finalizer: { kernel: { runHiveFinalTurn } },
    } as unknown as RunStackDeps;
    const onStep = vi.fn();

    const result = await runStack(
      {
        parentRunId: 'parent-run',
        steps: [step('draft')],
        finalTurnBasis: finalTurnBasis(),
        onStep,
      },
      deps,
    );

    expect(result).toBe(revoked);
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
    expect(runHiveFinalTurn).not.toHaveBeenCalled();
  });

  it('passes open-time and finalizer account revocation through without provider failure mapping', async () => {
    const revoked = Object.freeze({ kind: 'account_authority_revoked' as const });
    const openRevokedDeps = {
      kernel: { openHiveWorker: vi.fn(async () => revoked) },
      finalizer: { kernel: { runHiveFinalTurn: vi.fn() } },
    } as unknown as RunStackDeps;

    const openResult = await runStack(
      {
        parentRunId: 'parent-run',
        steps: [step('draft')],
        finalTurnBasis: finalTurnBasis(),
      },
      openRevokedDeps,
    );

    expect(openResult).toBe(revoked);
    expect(openRevokedDeps.finalizer.kernel.runHiveFinalTurn).not.toHaveBeenCalled();

    const workerOutcome = outcome('completed', 0);
    const handle: HiveWorkerHandle = {
      execute: vi.fn(async () => ({ kind: 'committed' as const, value: workerOutcome })),
      dispose: vi.fn(),
    };
    const finalizerRevokedDeps = {
      kernel: {
        openHiveWorker: vi.fn(async () => ({ kind: 'committed' as const, value: handle })),
      },
      finalizer: { kernel: { runHiveFinalTurn: vi.fn(async () => revoked) } },
    } as unknown as RunStackDeps;

    const finalizerResult = await runStack(
      {
        parentRunId: 'parent-run',
        steps: [step('draft')],
        finalTurnBasis: finalTurnBasis(),
      },
      finalizerRevokedDeps,
    );

    expect(finalizerResult).toBe(revoked);
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(finalizerRevokedDeps.finalizer.kernel.runHiveFinalTurn).toHaveBeenCalledTimes(1);
  });

  it('exposes only the narrow closed runner authority and no caller-supplied provider path', () => {
    expectTypeOf<keyof RunStackDeps['kernel']>().toEqualTypeOf<'openHiveWorker'>();
    expectTypeOf<Parameters<HiveWorkerHandle['execute']>>().toEqualTypeOf<[]>();
    expectTypeOf<
      Extract<
        'agent' | 'userText' | 'history' | 'signal' | 'provider' | 'runAgent' | 'executeWorker',
        keyof RunStackInput
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<
        'stepId' | 'agentId' | 'providerId' | 'modelId' | 'sourceRef' | 'state' | 'observedAt',
        keyof HiveWorkerOutcome['result']
      >
    >().toEqualTypeOf<never>();
  });

  it('does not import provider selection, auth, runtime, persistence, evidence, or clocks', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/ai/stacks/runner.ts'), 'utf8');
    const imports = source.match(/(?:import|export)[\s\S]*?from\s+['"][^'"]+['"];?/g) ?? [];
    const importText = imports.join('\n');

    expect(importText).not.toMatch(/\.\.\/router|hostedStack|stores\/auth/);
    expect(importText).not.toMatch(
      /(?:^|['"/])(?:kernelRuntime|runtime)(?:['"/]|$)|(?:^|['"/])db(?:['"/]|$)|executionJournal|live[-_]?Evidence/i,
    );
    expect(importText).not.toMatch(/repository|journal|effect/i);
    expect(source).not.toMatch(/runAgent|runHostedStackStep|canUseHostedStack|providerHasKey/);
    expect(source).not.toMatch(/Date\.now|Math\.random|randomUUID|nanoid/);
  });
});
