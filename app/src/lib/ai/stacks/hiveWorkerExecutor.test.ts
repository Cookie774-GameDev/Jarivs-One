import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type {
  JarvisCanonicalLiveProducerEvidence,
  JarvisCanonicalLiveProducerVerifier,
  JarvisEvent,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';

const runAgent = vi.hoisted(() => vi.fn());

vi.mock('../router', () => ({ runAgent }));

import {
  createJarvisHiveLiveEvidenceVerifier,
  createJarvisHiveWorkerExecutor,
} from './hiveWorkerExecutor';

type HiveSource = Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'hive' }>;

function workerInput() {
  const agent = Object.freeze({
    id: 'agent-researcher',
    slug: 'researcher',
    name: 'Researcher',
    description: 'Research specialist',
    system_prompt: 'Preserve this exact specialist prompt.',
    model: { provider: 'openai', model: 'gpt-test' },
    tools_allowed: [],
    memory_scope: 'none',
    capabilities: [],
    builtin: false,
    created_at: 1,
    updated_at: 1,
  }) as unknown as Agent;
  const messages = Object.freeze([
    Object.freeze({ role: 'user' as const, content: 'Perform the assigned research step.' }),
  ]);
  return {
    agent,
    messages,
    signal: new AbortController().signal,
    connectionId: 'openai-api',
    workingDirectory: 'C:/workspace',
  };
}

describe('JarvisHiveWorkerExecutor', () => {
  it('preserves the runtime-bound specialist identity, prompt, model, and messages', async () => {
    runAgent.mockResolvedValueOnce({
      text: 'Verified worker output',
      usage: { input_tokens: 3, output_tokens: 5, cost_usd: 0.02 },
      provider: 'openai',
      model: 'gpt-test',
    });
    const input = workerInput();

    const result = await createJarvisHiveWorkerExecutor({ now: () => 123 }).execute(input);

    expect(runAgent).toHaveBeenCalledOnce();
    expect(runAgent).toHaveBeenCalledWith({
      agent: input.agent,
      messages: [...input.messages],
      signal: input.signal,
      connectionId: input.connectionId,
      workingDirectory: input.workingDirectory,
    });
    expect(result).toEqual({
      status: 'completed',
      providerId: 'openai',
      modelId: 'gpt-test',
      text: 'Verified worker output',
      inputTokens: 3,
      outputTokens: 5,
      costUsd: 0.02,
      observedAt: 123,
    });
  });

  it('maps aborts to cancelled without fabricating worker text', async () => {
    runAgent.mockRejectedValueOnce(new DOMException('stopped', 'AbortError'));

    await expect(
      createJarvisHiveWorkerExecutor({ now: () => 123 }).execute(workerInput()),
    ).resolves.toEqual({
      status: 'cancelled',
      providerId: 'openai',
      modelId: 'gpt-test',
      errorCategory: 'cancelled',
      observedAt: 123,
    });
  });

  it('maps provider failures to safe metadata without exposing error text', async () => {
    runAgent.mockRejectedValueOnce(new Error('private provider failure detail'));

    const result = await createJarvisHiveWorkerExecutor({ now: () => 123 }).execute(workerInput());

    expect(result).toEqual({
      status: 'failed',
      providerId: 'openai',
      modelId: 'gpt-test',
      errorCategory: 'provider_error',
      observedAt: 123,
    });
    expect(JSON.stringify(result)).not.toContain('private provider failure detail');
  });
});

const HIVE_ACCOUNT_ID = 'acct_hive_alpha';
const HIVE_PARENT_RUN_ID = 'jrun_hive_parent';
const HIVE_CHILD_RUN_ID = 'jrun_hive_child';
const HIVE_REQUEST_ID = 'jreq_hive_child';
const HIVE_START_REF = `jstart_${HIVE_CHILD_RUN_ID}`;
const HIVE_RESULT_REF = 'jresult_hive_child_step_research';
const HIVE_MODEL = Object.freeze({
  providerId: 'openai',
  modelId: 'gpt-test',
  connectionMode: 'native-api' as const,
  capabilities: {},
  capturedAt: 1,
});
const HIVE_IDENTITY = Object.freeze({
  producerKind: 'hive' as const,
  stackId: 'stack-alpha',
  stepId: 'step-research',
  workerId: 'worker-research',
});
const HIVE_STEP = Object.freeze({
  schemaVersion: 1 as const,
  stepId: HIVE_IDENTITY.stepId,
  label: 'Research',
  workerId: HIVE_IDENTITY.workerId,
  agent: {
    id: 'agent-researcher',
    slug: 'researcher',
    builtin: false,
    name: 'Researcher',
    description: 'Research specialist',
    systemPrompt: 'Preserve this exact specialist prompt.',
    toolsAllowed: [],
    memoryScope: 'agent' as const,
    capabilities: [],
    createdAt: 1,
    updatedAt: 1,
  },
  model: HIVE_MODEL,
  messages: [],
});

function hiveParentRun(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: HIVE_PARENT_RUN_ID,
    accountId: HIVE_ACCOUNT_ID,
    source: 'chat',
    status: 'running',
    hiveStackPlan: {
      schemaVersion: 1,
      accountId: HIVE_ACCOUNT_ID,
      parentRunId: HIVE_PARENT_RUN_ID,
      stackId: HIVE_IDENTITY.stackId,
      steps: [HIVE_STEP],
    },
    ...overrides,
  } as unknown as JarvisRun;
}

function hiveChildRun(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: HIVE_CHILD_RUN_ID,
    accountId: HIVE_ACCOUNT_ID,
    parentRunId: HIVE_PARENT_RUN_ID,
    source: 'hive_final',
    status: 'completed',
    agentId: HIVE_STEP.agent.id,
    model: HIVE_MODEL,
    ...overrides,
  } as unknown as JarvisRun;
}

function hiveSource(
  phase: 'start' | 'result',
  overrides: Record<string, unknown> = {},
): HiveSource {
  return {
    schemaVersion: 1,
    accountId: HIVE_ACCOUNT_ID,
    runId: HIVE_PARENT_RUN_ID,
    requestId: HIVE_REQUEST_ID,
    attemptNumber: 1,
    producerKind: 'hive',
    producerIdentity: HIVE_IDENTITY,
    ...(phase === 'start'
      ? {
          resultRef: HIVE_START_REF,
          observedAt: 100,
          phase: 'start' as const,
          state: 'started' as const,
        }
      : {
          resultRef: HIVE_RESULT_REF,
          observedAt: 200,
          phase: 'result' as const,
          state: 'completed' as const,
          resultAuthority: {
            runId: HIVE_CHILD_RUN_ID,
            eventSeq: 2,
            evidenceRef: HIVE_RESULT_REF,
          },
        }),
    ...overrides,
  } as HiveSource;
}

function hiveEvent(runId: string, seq: number, overrides: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId,
    seq,
    idempotencyKey: `hive-fixture:${runId}:${seq}`,
    type: 'model',
    status: 'completed',
    title: 'Safe Hive evidence fixture',
    safeSummary: 'A persisted Hive worker event was observed.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: 200,
    ...overrides,
  };
}

function hiveEvidence(
  phase: 'start' | 'result' = 'result',
  overrides: Partial<JarvisCanonicalLiveProducerEvidence<'hive'>> = {},
): JarvisCanonicalLiveProducerEvidence<'hive'> {
  return {
    schemaVersion: 1,
    producerKind: 'hive',
    producerIdentity: HIVE_IDENTITY,
    accountId: HIVE_ACCOUNT_ID,
    runId: HIVE_PARENT_RUN_ID,
    requestId: HIVE_REQUEST_ID,
    attemptNumber: 1,
    resultRef: phase === 'start' ? HIVE_START_REF : HIVE_RESULT_REF,
    resultEventSeq: phase === 'start' ? 1 : 3,
    state: phase === 'start' ? 'busy' : 'completed',
    verifiedAt: phase === 'start' ? 100 : 200,
    ...overrides,
  };
}

function canonicalHiveEvents(): JarvisEvent[] {
  return [
    hiveEvent(HIVE_PARENT_RUN_ID, 1, {
      status: 'running',
      createdAt: 100,
      producerSourceEvidence: hiveSource('start'),
    }),
    hiveEvent(HIVE_CHILD_RUN_ID, 2, {
      type: 'run_state',
      canonicalResultEvidence: {
        schemaVersion: 1,
        kind: 'hive_child_provider_result',
        accountId: HIVE_ACCOUNT_ID,
        runId: HIVE_CHILD_RUN_ID,
        requestId: HIVE_REQUEST_ID,
        attemptNumber: 1,
        parentRunId: HIVE_PARENT_RUN_ID,
        stepId: HIVE_IDENTITY.stepId,
        state: 'completed',
        resultRef: HIVE_RESULT_REF,
        observedAt: 200,
      },
    }),
    hiveEvent(HIVE_PARENT_RUN_ID, 3, {
      producerSourceEvidence: hiveSource('result'),
    }),
  ];
}

function createHiveVerifierHarness(input?: {
  parent?: JarvisRun;
  child?: JarvisRun;
  events?: readonly JarvisEvent[];
}) {
  const parent = input?.parent ?? hiveParentRun();
  const child = input?.child ?? hiveChildRun();
  const events = input?.events ?? canonicalHiveEvents();
  const getById = vi.fn(async (_accountId: string, runId: string) =>
    runId === parent.id ? parent : runId === child.id ? child : undefined,
  );
  const getBySeq = vi.fn(async (_accountId: string, runId: string, seq: number) =>
    events.find((event) => event.runId === runId && event.seq === seq),
  );
  const verifier = createJarvisHiveLiveEvidenceVerifier({
    runs: { getById } as unknown as JarvisRunRepository,
    events: { getBySeq } as unknown as JarvisEventRepository,
  });
  return { verifier, getById, getBySeq };
}

describe('createJarvisHiveLiveEvidenceVerifier', () => {
  it('returns the exact closed Hive verifier type', () => {
    expectTypeOf<ReturnType<typeof createJarvisHiveLiveEvidenceVerifier>>().toEqualTypeOf<
      JarvisCanonicalLiveProducerVerifier<'hive'>
    >();
  });

  it('accepts the parent-scoped worker-start row after re-reading child plan lineage', async () => {
    const harness = createHiveVerifierHarness();
    const evidence = hiveEvidence('start');

    await expect(harness.verifier.verify(evidence)).resolves.toEqual(evidence);
    expect(harness.getById).toHaveBeenCalledWith(HIVE_ACCOUNT_ID, HIVE_PARENT_RUN_ID);
    expect(harness.getById).toHaveBeenCalledWith(HIVE_ACCOUNT_ID, HIVE_CHILD_RUN_ID);
    expect(harness.getBySeq).toHaveBeenCalledWith(HIVE_ACCOUNT_ID, HIVE_PARENT_RUN_ID, 1);
  });

  it.each([
    { status: 'completed' as const, state: 'completed' as const },
    { status: 'failed' as const, state: 'degraded' as const },
    { status: 'cancelled' as const, state: 'degraded' as const },
  ])(
    'accepts a $status result only through the earlier child-provider authority',
    async ({ status, state }) => {
      const events = canonicalHiveEvents();
      events[1] = hiveEvent(HIVE_CHILD_RUN_ID, 2, {
        type: 'run_state',
        status,
        canonicalResultEvidence: {
          ...events[1]!.canonicalResultEvidence!,
          state,
        },
      });
      events[2] = hiveEvent(HIVE_PARENT_RUN_ID, 3, {
        status,
        producerSourceEvidence: hiveSource('result', { state }),
      });
      const harness = createHiveVerifierHarness({ events });
      const evidence = hiveEvidence('result', { state });

      await expect(harness.verifier.verify(evidence)).resolves.toEqual(evidence);
      expect(harness.getBySeq).toHaveBeenCalledWith(HIVE_ACCOUNT_ID, HIVE_PARENT_RUN_ID, 3);
      expect(harness.getBySeq).toHaveBeenCalledWith(HIVE_ACCOUNT_ID, HIVE_CHILD_RUN_ID, 2);
    },
  );

  it.each([
    ['ordinary status alone', hiveEvent(HIVE_PARENT_RUN_ID, 3)],
    [
      'changed source row',
      hiveEvent(HIVE_PARENT_RUN_ID, 3, {
        producerSourceEvidence: hiveSource('result', { observedAt: 201 }),
      }),
    ],
    [
      'source with caller-extensible fields',
      hiveEvent(HIVE_PARENT_RUN_ID, 3, {
        producerSourceEvidence: hiveSource('result', { callerResult: HIVE_RESULT_REF }),
      }),
    ],
  ])('rejects %s', async (_label, target) => {
    const harness = createHiveVerifierHarness({
      events: [canonicalHiveEvents()[1]!, target],
    });

    await expect(harness.verifier.verify(hiveEvidence())).resolves.toBeNull();
  });

  it.each([
    ['self', { runId: HIVE_PARENT_RUN_ID, eventSeq: 3, evidenceRef: HIVE_RESULT_REF }],
    ['forward', { runId: HIVE_CHILD_RUN_ID, eventSeq: 4, evidenceRef: HIVE_RESULT_REF }],
    ['cross-run', { runId: 'jrun_foreign', eventSeq: 2, evidenceRef: HIVE_RESULT_REF }],
    ['changed ref', { runId: HIVE_CHILD_RUN_ID, eventSeq: 2, evidenceRef: 'jresult_changed' }],
  ])('rejects a %s child-authority pointer', async (_label, resultAuthority) => {
    const events = canonicalHiveEvents();
    events[2] = hiveEvent(HIVE_PARENT_RUN_ID, 3, {
      producerSourceEvidence: hiveSource('result', { resultAuthority }),
    });
    const harness = createHiveVerifierHarness({ events });

    await expect(harness.verifier.verify(hiveEvidence())).resolves.toBeNull();
  });

  it.each([
    ['state', { state: 'degraded' as const }],
    ['reference', { resultRef: 'jresult_caller_changed' }],
    ['time', { verifiedAt: 201 }],
    ['Hive lineage', { producerIdentity: { ...HIVE_IDENTITY, workerId: 'worker-caller-changed' } }],
  ])('rejects caller-supplied %s that differs from persisted authority', async (_label, change) => {
    const harness = createHiveVerifierHarness();

    await expect(harness.verifier.verify(hiveEvidence('result', change))).resolves.toBeNull();
  });

  it.each([
    ['cross-account child', { child: hiveChildRun({ accountId: 'acct_hive_foreign' }) }],
    [
      'changed provider',
      { child: hiveChildRun({ model: { ...HIVE_MODEL, providerId: 'anthropic' } }) },
    ],
    [
      'changed parent plan',
      {
        parent: hiveParentRun({
          hiveStackPlan: {
            ...hiveParentRun().hiveStackPlan!,
            steps: [{ ...HIVE_STEP, workerId: 'worker-plan-changed' }],
          },
        }),
      },
    ],
  ])('rejects %s lineage after repository re-read', async (_label, change) => {
    const harness = createHiveVerifierHarness(change);

    await expect(harness.verifier.verify(hiveEvidence())).resolves.toBeNull();
  });
});
