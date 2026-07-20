import { describe, expect, it } from 'vitest';
import type {
  JarvisArtifactV1,
  JarvisEvent,
  JarvisLiveEvidenceSnapshot,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import {
  canCancelRun,
  selectCurrentRun,
  selectEvents,
  selectLiveSystems,
  selectOutputs,
  selectRetryAction,
  selectRetryState,
} from './selectors';

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 90,
    },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function event(runId: string, seq: number, title = `event-${seq}`): JarvisEvent {
  return {
    runId,
    seq,
    idempotencyKey: `${runId}-${seq}-${title}`,
    type: 'message',
    title,
    sourceRefs: [],
    artifactIds: [],
    createdAt: 100 + seq,
  };
}

function artifact(runId: string, id: string): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id,
    runId,
    requestId: 'request-1',
    attemptNumber: 1,
    state: 'partial',
    kind: 'text',
    title: id,
    sourceRefs: [],
    createdAt: 110,
  };
}

describe('Command Center selectors', () => {
  it('selects the newest canonical run for the exact account and chat', () => {
    const selected = selectCurrentRun(
      [
        run({ id: 'wrong-account', accountId: 'account-2', createdAt: 500 }),
        run({ id: 'wrong-chat', chatId: 'chat-2', createdAt: 400 }),
        run({ id: 'older', createdAt: 100 }),
        run({ id: 'newer', createdAt: 200 }),
      ],
      'account-1',
      'chat-1',
    );

    expect(selected?.id).toBe('newer');
  });

  it('orders events, removes duplicate run/sequence rows, caps the result, and excludes other runs', () => {
    const rows = [event('run-2', 1), event('run-1', 3), event('run-1', 1), event('run-1', 1)];
    for (let seq = 4; seq <= 505; seq += 1) rows.push(event('run-1', seq));

    const selected = selectEvents(rows, 'run-1', 1_000_000);

    expect(selected).toHaveLength(500);
    expect(selected[0]?.seq).toBe(1);
    expect(selected[1]?.seq).toBe(3);
    expect(selected.at(-1)?.seq).toBe(501);
    expect(selectEvents(rows, 'run-1', 0)).toHaveLength(1);
    expect(selectEvents(rows, 'run-1', 1)).toHaveLength(1);
    expect(selectEvents(rows, 'run-1', 501)).toHaveLength(500);
  });

  it('returns only persisted v1 artifact rows for the current run', () => {
    const rows = [artifact('run-2', 'other'), artifact('run-1', 'partial')];

    expect(selectOutputs(rows, 'run-1')).toEqual([rows[1]]);
    expect(
      selectOutputs([{ ...rows[1]!, schemaVersion: 2 } as unknown as JarvisArtifactV1], 'run-1'),
    ).toEqual([]);
  });

  it('offers transport retry only for the latest retryable failed attempt of a running schedule run', () => {
    const scheduled = run({
      source: 'schedule',
      status: 'running',
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-1',
          state: 'retryable_failed',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: 101 },
          createdAt: 100,
          updatedAt: 101,
        },
        {
          schemaVersion: 1,
          attemptNumber: 2,
          kind: 'transport_retry',
          requestId: 'request-2',
          state: 'provider_in_flight',
          startedEventSeq: 2,
          effectBarrier: { state: 'open', version: 0, updatedAt: 102 },
          createdAt: 102,
          updatedAt: 102,
        },
      ],
    });

    expect(selectRetryState(scheduled)).toEqual({ kind: 'none' });
    expect(
      selectRetryState({
        ...scheduled,
        transportAttempts: [scheduled.transportAttempts![0]!],
      }),
    ).toEqual({ kind: 'scheduled_transport_available', runId: 'run-1', attemptNumber: 1 });
    expect(selectRetryState({ ...scheduled, source: 'typed_chat' })).toEqual({ kind: 'none' });
  });

  it('offers logical retry only for a terminal scheduled run with a valid bound retry snapshot', () => {
    const scheduled = run({
      source: 'schedule',
      status: 'failed',
      scheduledRetrySnapshot: {
        schemaVersion: 1,
        accountId: 'account-1',
        eventId: 'event-1',
        occurrenceId: 'jocc_occurrence-1',
        dueAt: 80,
        logicalAttempt: 1,
        request: {
          accountId: 'account-1',
          runId: 'run-1',
          surface: 'schedule',
        },
      } as never,
    });

    expect(selectRetryState(scheduled)).toEqual({
      kind: 'logical_retry_available',
      previousRunId: 'run-1',
      terminalStatus: 'failed',
    });
    expect(
      selectRetryState({
        ...scheduled,
        scheduledRetrySnapshot: { ...scheduled.scheduledRetrySnapshot!, accountId: 'account-2' },
      }),
    ).toEqual({ kind: 'none' });
    expect(
      selectRetryState({
        ...scheduled,
        scheduledRetrySnapshot: {
          ...scheduled.scheduledRetrySnapshot!,
          request: { ...scheduled.scheduledRetrySnapshot!.request, runId: 'run-2' },
        },
      }),
    ).toEqual({ kind: 'none' });
    expect(selectRetryState({ ...scheduled, status: 'completed' })).toEqual({ kind: 'none' });
  });

  it('accepts only exact authority-read live nodes and never synthesizes planned or unavailable nodes', () => {
    const snapshot: JarvisLiveEvidenceSnapshot = {
      schemaVersion: 1,
      accountId: 'account-1',
      runId: 'run-1',
      capturedAt: 150,
      nodes: [
        {
          kind: 'model',
          id: 'model:registration-1',
          accountId: 'account-1',
          runId: 'run-1',
          state: 'active',
          operations: ['generate'],
          evidenceRef: 'jlive_proof-1',
          verifiedAt: 120,
          providerId: 'provider-1',
          modelId: 'model-1',
          modelSnapshotRef: 'snapshot-1',
        },
      ],
    };

    expect(selectLiveSystems(snapshot, run())).toEqual(snapshot.nodes);
    expect(selectLiveSystems(undefined, run())).toEqual([]);
    expect(
      selectLiveSystems(
        { ...snapshot, nodes: [{ ...snapshot.nodes[0]!, evidenceRef: 'planned' } as never] },
        run(),
      ),
    ).toEqual([]);
  });

  it('allows cancellation only for a nonterminal run with its exact handler and no transport retry', () => {
    const cancelRun = async () => ({ kind: 'authority_revoked_before_intent' as const });
    expect(canCancelRun(run(), { kind: 'none' }, { cancelRun })).toBe(true);
    expect(canCancelRun(run({ status: 'cancelled' }), { kind: 'none' }, { cancelRun })).toBe(false);
    expect(
      canCancelRun(
        run(),
        { kind: 'scheduled_transport_available', runId: 'run-1', attemptNumber: 1 },
        { cancelRun },
      ),
    ).toBe(false);
    expect(canCancelRun(run(), { kind: 'none' }, {})).toBe(false);
  });

  it('selects only the retry handler owned by the exact retry state', () => {
    const retryScheduledTransport = async () => ({ kind: 'account_authority_revoked' as const });
    const retryLogicalRun = async () => ({ kind: 'account_authority_revoked' as const });

    expect(
      selectRetryAction(
        { kind: 'scheduled_transport_available', runId: 'run-1', attemptNumber: 1 },
        { retryScheduledTransport, retryLogicalRun },
      ),
    ).toEqual({ kind: 'retry_transport', handler: retryScheduledTransport });
    expect(
      selectRetryAction(
        {
          kind: 'logical_retry_available',
          previousRunId: 'run-1',
          terminalStatus: 'failed',
        },
        { retryScheduledTransport, retryLogicalRun },
      ),
    ).toEqual({ kind: 'retry_logical_run', handler: retryLogicalRun });
    expect(
      selectRetryAction(
        { kind: 'scheduled_transport_available', runId: 'run-1', attemptNumber: 1 },
        { retryLogicalRun },
      ),
    ).toEqual({ kind: 'none' });
  });
});
