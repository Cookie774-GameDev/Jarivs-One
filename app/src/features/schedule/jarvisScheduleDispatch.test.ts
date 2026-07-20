import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type {
  JarvisAuthorityBoundResult,
  JarvisCanonicalLiveProducerEvidence,
  JarvisEvent,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
  JarvisTransportAttemptV1,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';

import {
  createJarvisScheduleLiveEvidenceVerifier,
  dispatchScheduledJarvisOccurrence,
  scheduleOccurrenceId,
  scheduleOccurrenceRunId,
  type ScheduledJarvisAttemptResult,
  type ScheduledJarvisDispatchDeps,
} from './jarvisScheduleDispatch';

type ScheduleSource = Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'schedule' }>;

const INPUT = {
  accountId: 'acct_schedule_alpha',
  eventId: 'evt_morning_brief',
  dueAt: 1_789_123_456_789,
};

const TURN_RESULT = Object.freeze({ marker: 'turn-result' }) as unknown as JarvisKernelTurnResult;
const ATTEMPT = Object.freeze({
  schemaVersion: 1,
  attemptNumber: 1,
  kind: 'initial',
  requestId: 'req_fixture',
  state: 'retryable_failed',
}) as unknown as JarvisTransportAttemptV1;
const RUN = Object.freeze({
  id: 'jrun_fixture',
  accountId: INPUT.accountId,
  source: 'schedule',
  status: 'running',
  transportAttempts: [ATTEMPT],
}) as unknown as JarvisRun;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function committed<T>(value: T): JarvisAuthorityBoundResult<T> {
  return { kind: 'committed', value };
}

type HarnessOptions = Readonly<{
  allocationResult?: unknown;
  beginResult?: unknown;
  dispatchResult?: unknown;
  settlementResult?: unknown;
  dispatchError?: Error;
  settlementError?: Error;
}>;

function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const allocation = Object.freeze({ marker: 'allocation' });
  const prepared = Object.freeze({ marker: 'prepared' });
  const handle = Object.freeze({ marker: 'handle' });

  const allocateScheduledOccurrence = vi.fn(async () => {
    calls.push('allocate');
    return options.allocationResult ?? committed(allocation);
  });
  const loadScheduledRun = vi.fn(async () => {
    calls.push('load');
    return committed(undefined);
  });
  const allocateScheduledLogicalRetry = vi.fn(async () => {
    calls.push('logical-retry');
    return committed(allocation);
  });
  const prepareScheduledAttempt = vi.fn(async () => {
    calls.push('prepare');
    return prepared;
  });
  const beginPreparedScheduledAttempt = vi.fn(async () => {
    calls.push('begin');
    return options.beginResult ?? committed(handle);
  });
  const dispatchPreparedScheduledAttempt = vi.fn(async () => {
    calls.push('dispatch');
    if (options.dispatchError) throw options.dispatchError;
    return options.dispatchResult ?? committed({ kind: 'committed', result: TURN_RESULT });
  });
  const settleScheduledTransportFailure = vi.fn(async () => {
    calls.push('settle');
    if (options.settlementError) throw options.settlementError;
    return options.settlementResult ?? committed({ kind: 'retryable', run: RUN });
  });
  const disposeScheduledAttempt = vi.fn(() => {
    calls.push('dispose');
  });

  const deps = {
    kernel: {
      allocateScheduledOccurrence,
      loadScheduledRun,
      allocateScheduledLogicalRetry,
      prepareScheduledAttempt,
      beginPreparedScheduledAttempt,
      dispatchPreparedScheduledAttempt,
      settleScheduledTransportFailure,
      disposeScheduledAttempt,
    },
  } as unknown as ScheduledJarvisDispatchDeps;

  return {
    allocation,
    prepared,
    handle,
    calls,
    deps,
    spies: {
      allocateScheduledOccurrence,
      loadScheduledRun,
      allocateScheduledLogicalRetry,
      prepareScheduledAttempt,
      beginPreparedScheduledAttempt,
      dispatchPreparedScheduledAttempt,
      settleScheduledTransportFailure,
      disposeScheduledAttempt,
    },
  };
}

describe('scheduled Jarvis deterministic IDs', () => {
  it('uses exact account-scoped, domain-separated SHA-256 formulas', async () => {
    const occurrence = await scheduleOccurrenceId(INPUT);
    const expectedOccurrence = `jocc_${sha256(
      `schedule-occurrence-v1\u0000${INPUT.accountId}\u0000${INPUT.eventId}\u0000${INPUT.dueAt}`,
    ).slice(0, 32)}`;

    expect(occurrence).toBe(expectedOccurrence);
    expect(await scheduleOccurrenceId(INPUT)).toBe(occurrence);
    expect(await scheduleOccurrenceId({ ...INPUT, accountId: 'acct_schedule_beta' })).not.toBe(
      occurrence,
    );

    const runId = await scheduleOccurrenceRunId({
      accountId: INPUT.accountId,
      occurrenceId: occurrence,
      logicalAttempt: 0,
    });
    const expectedRunId = `jrun_${sha256(
      `schedule-run-v1\u0000${INPUT.accountId}\u0000${occurrence}\u00000`,
    ).slice(0, 32)}`;

    expect(runId).toBe(expectedRunId);
    expect(
      await scheduleOccurrenceRunId({
        accountId: INPUT.accountId,
        occurrenceId: occurrence,
        logicalAttempt: 0,
      }),
    ).toBe(runId);
    expect(
      await scheduleOccurrenceRunId({
        accountId: 'acct_schedule_beta',
        occurrenceId: occurrence,
        logicalAttempt: 0,
      }),
    ).not.toBe(runId);
    expect(
      await scheduleOccurrenceRunId({
        accountId: INPUT.accountId,
        occurrenceId: occurrence,
        logicalAttempt: 1,
      }),
    ).not.toBe(runId);
    expect(runId.replace(/^jrun_/, '')).not.toBe(occurrence.replace(/^jocc_/, ''));
  });
});

describe('dispatchScheduledJarvisOccurrence', () => {
  it('passes only opaque values through allocate, prepare, begin, and dispatch in order', async () => {
    const harness = createHarness();

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual({
      kind: 'committed',
      result: TURN_RESULT,
    });

    expect(harness.calls).toEqual(['allocate', 'prepare', 'begin', 'dispatch']);
    expect(harness.spies.allocateScheduledOccurrence).toHaveBeenCalledWith(INPUT);
    expect(harness.spies.prepareScheduledAttempt).toHaveBeenCalledWith({
      allocation: harness.allocation,
    });
    expect(harness.spies.beginPreparedScheduledAttempt).toHaveBeenCalledWith({
      prepared: harness.prepared,
    });
    expect(harness.spies.dispatchPreparedScheduledAttempt).toHaveBeenCalledWith({
      prepared: harness.prepared,
      handle: harness.handle,
    });
    expect(harness.spies.loadScheduledRun).not.toHaveBeenCalled();
    expect(harness.spies.allocateScheduledLogicalRetry).not.toHaveBeenCalled();
    expect(harness.spies.settleScheduledTransportFailure).not.toHaveBeenCalled();
    expect(harness.spies.disposeScheduledAttempt).not.toHaveBeenCalled();
  });

  it('maps allocation authority revocation without preparing an attempt', async () => {
    const harness = createHarness({
      allocationResult: { kind: 'account_authority_revoked' },
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual({
      kind: 'account_authority_revoked',
    });
    expect(harness.calls).toEqual(['allocate']);
  });

  it('maps begin authority revocation without dispatching or disposing a nonexistent handle', async () => {
    const harness = createHarness({
      beginResult: { kind: 'account_authority_revoked' },
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual({
      kind: 'account_authority_revoked',
    });
    expect(harness.calls).toEqual(['allocate', 'prepare', 'begin']);
    expect(harness.spies.disposeScheduledAttempt).not.toHaveBeenCalled();
  });

  it('maps dispatch authority revocation and abandons the exact begun handle', async () => {
    const harness = createHarness({
      dispatchResult: { kind: 'account_authority_revoked' },
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual({
      kind: 'account_authority_revoked',
    });
    expect(harness.calls).toEqual(['allocate', 'prepare', 'begin', 'dispatch', 'dispose']);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledWith(harness.handle);
    expect(harness.spies.settleScheduledTransportFailure).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'retryable proof',
      settled: { kind: 'retryable' as const, run: RUN },
      expected: { kind: 'transport_retry_available' as const, run: RUN, attempt: ATTEMPT },
    },
    {
      label: 'terminal proof',
      settled: { kind: 'terminal_failed' as const, run: RUN },
      expected: { kind: 'terminal_transport_failure' as const, run: RUN },
    },
  ])('settles a pre-effect failure exactly once and maps $label', async ({ settled, expected }) => {
    const harness = createHarness({
      dispatchResult: committed({ kind: 'pre_effect_transport_failure' }),
      settlementResult: committed(settled),
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual(expected);
    expect(harness.calls).toEqual(['allocate', 'prepare', 'begin', 'dispatch', 'settle']);
    expect(harness.spies.settleScheduledTransportFailure).toHaveBeenCalledTimes(1);
    expect(harness.spies.settleScheduledTransportFailure).toHaveBeenCalledWith({
      handle: harness.handle,
    });
    expect(harness.spies.disposeScheduledAttempt).not.toHaveBeenCalled();
  });

  it('maps settlement revocation and abandons the exact handle without a second settlement', async () => {
    const harness = createHarness({
      dispatchResult: committed({ kind: 'pre_effect_transport_failure' }),
      settlementResult: { kind: 'account_authority_revoked' },
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).resolves.toEqual({
      kind: 'account_authority_revoked',
    });
    expect(harness.calls).toEqual([
      'allocate',
      'prepare',
      'begin',
      'dispatch',
      'settle',
      'dispose',
    ]);
    expect(harness.spies.settleScheduledTransportFailure).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledWith(harness.handle);
  });

  it('disposes the exact handle when dispatch throws', async () => {
    const failure = new Error('provider dispatch exploded');
    const harness = createHarness({ dispatchError: failure });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).rejects.toBe(failure);
    expect(harness.calls).toEqual(['allocate', 'prepare', 'begin', 'dispatch', 'dispose']);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledWith(harness.handle);
    expect(harness.spies.settleScheduledTransportFailure).not.toHaveBeenCalled();
  });

  it('disposes the exact handle when settlement throws without retrying settlement', async () => {
    const failure = new Error('proof transaction exploded');
    const harness = createHarness({
      dispatchResult: committed({ kind: 'pre_effect_transport_failure' }),
      settlementError: failure,
    });

    await expect(dispatchScheduledJarvisOccurrence(INPUT, harness.deps)).rejects.toBe(failure);
    expect(harness.calls).toEqual([
      'allocate',
      'prepare',
      'begin',
      'dispatch',
      'settle',
      'dispose',
    ]);
    expect(harness.spies.settleScheduledTransportFailure).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledTimes(1);
    expect(harness.spies.disposeScheduledAttempt).toHaveBeenCalledWith(harness.handle);
  });
});

describe('scheduled dispatcher public surface', () => {
  it('has exact caller input, result, and narrow kernel dependency keys', () => {
    type ExpectedKernelKey =
      | 'allocateScheduledOccurrence'
      | 'loadScheduledRun'
      | 'allocateScheduledLogicalRetry'
      | 'prepareScheduledAttempt'
      | 'beginPreparedScheduledAttempt'
      | 'dispatchPreparedScheduledAttempt'
      | 'settleScheduledTransportFailure'
      | 'disposeScheduledAttempt';

    expectTypeOf<Parameters<typeof dispatchScheduledJarvisOccurrence>[0]>().toEqualTypeOf<{
      accountId: string;
      eventId: string;
      dueAt: number;
    }>();
    expectTypeOf<
      Awaited<ReturnType<typeof dispatchScheduledJarvisOccurrence>>
    >().toEqualTypeOf<ScheduledJarvisAttemptResult>();
    expectTypeOf<keyof ScheduledJarvisDispatchDeps>().toEqualTypeOf<'kernel'>();
    expectTypeOf<keyof ScheduledJarvisDispatchDeps['kernel']>().toEqualTypeOf<ExpectedKernelKey>();
    expectTypeOf<
      Awaited<ReturnType<typeof scheduleOccurrenceId>>
    >().toEqualTypeOf<`jocc_${string}`>();
    expectTypeOf<Awaited<ReturnType<typeof scheduleOccurrenceRunId>>>().toEqualTypeOf<string>();
  });

  it('does not import runtime internals or use caller-independent IDs and clocks', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/schedule/jarvisScheduleDispatch.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/executionJournal|kernelRuntime/);
    expect(source).not.toMatch(/JarvisExecutionJournal/);
    expect(source).not.toMatch(/Date\.now|Math\.random|randomUUID|nanoid/);
    expect(source).not.toMatch(/autoApproveActions/);
  });
});

const SCHEDULE_RUN_ID = 'jrun_schedule_fixture';
const SCHEDULE_REQUEST_ID = 'jreq_schedule_fixture';
const SCHEDULE_RESULT_REF = 'jresult_schedule_fixture';
const SCHEDULE_IDENTITY = Object.freeze({
  producerKind: 'schedule' as const,
  eventId: INPUT.eventId,
  occurrenceId: 'jocc_schedule_fixture',
});

function scheduleRun(): JarvisRun {
  return {
    id: SCHEDULE_RUN_ID,
    accountId: INPUT.accountId,
    source: 'schedule',
    status: 'completed',
    scheduledRetrySnapshot: {
      schemaVersion: 1,
      accountId: INPUT.accountId,
      eventId: INPUT.eventId,
      occurrenceId: SCHEDULE_IDENTITY.occurrenceId,
      dueAt: INPUT.dueAt,
      logicalAttempt: 0,
      request: {},
    },
    transportAttempts: [
      {
        schemaVersion: 1,
        attemptNumber: 1,
        kind: 'initial',
        requestId: SCHEDULE_REQUEST_ID,
        state: 'completed',
        startedEventSeq: 2,
        effectBarrier: { state: 'open', version: 0, updatedAt: 100 },
        createdAt: 100,
        updatedAt: 200,
      },
    ],
  } as unknown as JarvisRun;
}

function scheduleSource(
  phase: 'start' | 'result',
  overrides: Record<string, unknown> = {},
): ScheduleSource {
  const common = {
    schemaVersion: 1 as const,
    accountId: INPUT.accountId,
    runId: SCHEDULE_RUN_ID,
    requestId: SCHEDULE_REQUEST_ID,
    attemptNumber: 1,
    producerKind: 'schedule' as const,
    producerIdentity: SCHEDULE_IDENTITY,
  };
  return {
    ...common,
    ...(phase === 'start'
      ? {
          resultRef: 'jstart_schedule_fixture',
          observedAt: 100,
          phase: 'start' as const,
          state: 'started' as const,
        }
      : {
          resultRef: SCHEDULE_RESULT_REF,
          observedAt: 200,
          phase: 'result' as const,
          state: 'completed' as const,
          resultAuthority: {
            runId: SCHEDULE_RUN_ID,
            eventSeq: 3,
            evidenceRef: SCHEDULE_RESULT_REF,
          },
        }),
    ...overrides,
  } as ScheduleSource;
}

function scheduleEvent(seq: number, input: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId: SCHEDULE_RUN_ID,
    seq,
    idempotencyKey: `schedule-fixture:${seq}`,
    type: 'tool',
    status: 'completed',
    title: 'Safe schedule evidence fixture',
    safeSummary: 'A persisted schedule event was observed.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: 200,
    ...input,
  };
}

function scheduleEvidence(
  overrides: Partial<JarvisCanonicalLiveProducerEvidence<'schedule'>> = {},
): JarvisCanonicalLiveProducerEvidence<'schedule'> {
  return {
    schemaVersion: 1,
    producerKind: 'schedule',
    producerIdentity: SCHEDULE_IDENTITY,
    accountId: INPUT.accountId,
    runId: SCHEDULE_RUN_ID,
    requestId: SCHEDULE_REQUEST_ID,
    attemptNumber: 1,
    resultRef: SCHEDULE_RESULT_REF,
    resultEventSeq: 4,
    state: 'completed',
    verifiedAt: 200,
    ...overrides,
  };
}

function createScheduleVerifierHarness(input?: {
  run?: JarvisRun;
  events?: readonly JarvisEvent[];
}) {
  const run = input?.run ?? scheduleRun();
  const events = input?.events ?? [
    scheduleEvent(2, {
      type: 'run_state',
      status: 'running',
      createdAt: 100,
      producerSourceEvidence: scheduleSource('start'),
    }),
    scheduleEvent(3, {
      type: 'run_state',
      canonicalResultEvidence: {
        schemaVersion: 1,
        kind: 'kernel_turn_committed',
        accountId: INPUT.accountId,
        runId: SCHEDULE_RUN_ID,
        requestId: SCHEDULE_REQUEST_ID,
        attemptNumber: 1,
        state: 'completed',
        resultRef: SCHEDULE_RESULT_REF,
        observedAt: 200,
      },
    }),
    scheduleEvent(4, { producerSourceEvidence: scheduleSource('result') }),
  ];
  const getById = vi.fn(async () => run);
  const getBySeq = vi.fn(async (_accountId: string, runId: string, seq: number) =>
    events.find((event) => event.runId === runId && event.seq === seq),
  );
  const verifier = createJarvisScheduleLiveEvidenceVerifier({
    runs: { getById } as unknown as JarvisRunRepository,
    events: { getBySeq } as unknown as JarvisEventRepository,
  });
  return { verifier, getById, getBySeq };
}

describe('createJarvisScheduleLiveEvidenceVerifier', () => {
  it('accepts only the persisted occurrence/attempt start row', async () => {
    const harness = createScheduleVerifierHarness();
    const evidence = scheduleEvidence({
      resultRef: 'jstart_schedule_fixture',
      resultEventSeq: 2,
      state: 'busy',
      verifiedAt: 100,
    });

    await expect(harness.verifier.verify(evidence)).resolves.toEqual(evidence);
    expect(harness.getById).toHaveBeenCalledWith(INPUT.accountId, SCHEDULE_RUN_ID);
    expect(harness.getBySeq).toHaveBeenCalledWith(INPUT.accountId, SCHEDULE_RUN_ID, 2);
  });

  it.each([
    { kind: 'kernel_turn_committed' as const, state: 'completed' as const },
    { kind: 'scheduled_transport_settled' as const, state: 'degraded' as const },
  ])(
    'accepts a $kind result only through its distinct earlier authority',
    async ({ kind, state }) => {
      const resultSource = scheduleSource('result', { state });
      const harness = createScheduleVerifierHarness({
        events: [
          scheduleEvent(2, {
            type: 'run_state',
            status: 'running',
            createdAt: 100,
            producerSourceEvidence: scheduleSource('start'),
          }),
          scheduleEvent(3, {
            type: 'run_state',
            status: state,
            canonicalResultEvidence: {
              schemaVersion: 1,
              kind,
              accountId: INPUT.accountId,
              runId: SCHEDULE_RUN_ID,
              requestId: SCHEDULE_REQUEST_ID,
              attemptNumber: 1,
              state,
              resultRef: SCHEDULE_RESULT_REF,
              observedAt: 200,
            },
          }),
          scheduleEvent(4, { status: state, producerSourceEvidence: resultSource }),
        ],
      });
      const evidence = scheduleEvidence({ state });

      await expect(harness.verifier.verify(evidence)).resolves.toEqual(evidence);
      expect(harness.getBySeq).toHaveBeenNthCalledWith(1, INPUT.accountId, SCHEDULE_RUN_ID, 4);
      expect(harness.getBySeq).toHaveBeenNthCalledWith(2, INPUT.accountId, SCHEDULE_RUN_ID, 3);
    },
  );

  it.each([
    ['ordinary status alone', scheduleEvent(4)],
    [
      'changed source row',
      scheduleEvent(4, {
        producerSourceEvidence: scheduleSource('result', { observedAt: 201 }),
      }),
    ],
    [
      'source with caller-extensible fields',
      scheduleEvent(4, {
        producerSourceEvidence: scheduleSource('result', { callerState: 'completed' }),
      }),
    ],
  ])('rejects %s', async (_label, target) => {
    const harness = createScheduleVerifierHarness({
      events: [
        scheduleEvent(3, {
          type: 'run_state',
          canonicalResultEvidence: {
            schemaVersion: 1,
            kind: 'kernel_turn_committed',
            accountId: INPUT.accountId,
            runId: SCHEDULE_RUN_ID,
            requestId: SCHEDULE_REQUEST_ID,
            attemptNumber: 1,
            state: 'completed',
            resultRef: SCHEDULE_RESULT_REF,
            observedAt: 200,
          },
        }),
        target,
      ],
    });

    await expect(harness.verifier.verify(scheduleEvidence())).resolves.toBeNull();
  });

  it.each([
    ['self', { runId: SCHEDULE_RUN_ID, eventSeq: 4, evidenceRef: SCHEDULE_RESULT_REF }],
    ['forward', { runId: SCHEDULE_RUN_ID, eventSeq: 5, evidenceRef: SCHEDULE_RESULT_REF }],
    ['cross-run', { runId: 'jrun_foreign', eventSeq: 3, evidenceRef: SCHEDULE_RESULT_REF }],
    ['changed ref', { runId: SCHEDULE_RUN_ID, eventSeq: 3, evidenceRef: 'jresult_changed' }],
  ])('rejects a %s result-authority pointer', async (_label, resultAuthority) => {
    const harness = createScheduleVerifierHarness({
      events: [
        scheduleEvent(3, {
          type: 'run_state',
          canonicalResultEvidence: {
            schemaVersion: 1,
            kind: 'kernel_turn_committed',
            accountId: INPUT.accountId,
            runId: SCHEDULE_RUN_ID,
            requestId: SCHEDULE_REQUEST_ID,
            attemptNumber: 1,
            state: 'completed',
            resultRef: SCHEDULE_RESULT_REF,
            observedAt: 200,
          },
        }),
        scheduleEvent(4, {
          producerSourceEvidence: scheduleSource('result', { resultAuthority }),
        }),
      ],
    });

    await expect(harness.verifier.verify(scheduleEvidence())).resolves.toBeNull();
  });

  it.each([
    ['state', { state: 'degraded' as const }],
    ['reference', { resultRef: 'jresult_caller_changed' }],
    ['time', { verifiedAt: 201 }],
    [
      'schedule lineage',
      { producerIdentity: { ...SCHEDULE_IDENTITY, occurrenceId: 'jocc_caller_changed' } },
    ],
  ])('rejects caller-supplied %s that differs from persisted authority', async (_label, change) => {
    const harness = createScheduleVerifierHarness();

    await expect(harness.verifier.verify(scheduleEvidence(change))).resolves.toBeNull();
  });
});
