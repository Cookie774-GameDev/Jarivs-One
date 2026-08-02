import { describe, expect, it } from 'vitest';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';
import type { EventRow } from '@/types/event';
import type { WorkspaceId } from '@/types/common';
import type { ScheduledJarvisAttemptResult } from './jarvisScheduleDispatch';
import { buildJarvisScheduleEventInput, parseJarvisScheduleMetadata } from './jarvisSchedules';
import { runDueJarvisSchedules, type JarvisScheduleRunnerDeps } from './jarvisScheduleRunner';

const ACCOUNT = 'acct_schedule_retry';
const WORKSPACE = 'wks_schedule_retry' as WorkspaceId;
const NOW = new Date(2026, 6, 9, 12, 0, 0, 0).getTime();

function buildOneShot(suffix: string): EventRow {
  const startAt = NOW - 60_000;
  const input = buildJarvisScheduleEventInput({
    workspaceId: WORKSPACE,
    createdBy: 'usr_local',
    title: 'Retry test',
    prompt: 'Run the retry test action.',
    startAt,
    recurrence: 'once',
    timezone: 'UTC',
    modelSelection: {
      mode: 'single',
      provider: 'google',
      modelId: 'gemini-2.0-flash',
    } as never,
    agentId: 'agent_jarvis',
  });

  return {
    id: `evt_schedule_retry_${suffix}` as EventRow['id'],
    attendees: [],
    created_at: startAt - 1000,
    updated_at: startAt - 1000,
    ...input,
    status: 'scheduled',
  } as EventRow;
}

function completed(runId: string, requestId: string): ScheduledJarvisAttemptResult {
  return {
    kind: 'committed',
    result: {
      response: {
        runId,
        requestId,
        executionState: { status: 'completed' },
        completedAt: NOW,
      },
    } as JarvisKernelTurnResult,
  };
}

function depsFor(
  event: EventRow,
  dispatchScheduledOccurrence: JarvisScheduleRunnerDeps['dispatchScheduledOccurrence'],
): JarvisScheduleRunnerDeps {
  return {
    listEvents: async () => [event],
    updateEvent: async (id, patch) => {
      expect(id).toBe(event.id);
      Object.assign(event, patch);
    },
    createChat: async () => undefined,
    dispatchScheduledOccurrence,
    now: () => NOW,
  };
}

describe('Jarvis schedule canonical retry recovery', () => {
  it('does not advance before the canonical dispatcher claims the exact due occurrence', async () => {
    const event = buildOneShot('claim_order');
    let releaseDispatch!: (outcome: ScheduledJarvisAttemptResult) => void;
    let markDispatchStarted!: () => void;
    let statusDuringDispatch: EventRow['status'] | undefined;
    let nextRunDuringDispatch: number | undefined;
    const pendingOutcome = new Promise<ScheduledJarvisAttemptResult>((resolve) => {
      releaseDispatch = resolve;
    });
    const dispatchStarted = new Promise<void>((resolve) => {
      markDispatchStarted = resolve;
    });
    const deps = depsFor(event, async (input) => {
      expect(input).toEqual({
        accountId: ACCOUNT,
        eventId: String(event.id),
        dueAt: event.start_at,
      });
      statusDuringDispatch = event.status;
      nextRunDuringDispatch = parseJarvisScheduleMetadata(event)!.nextRunAt;
      markDispatchStarted();
      return pendingOutcome;
    });

    const pending = runDueJarvisSchedules(ACCOUNT, WORKSPACE, deps);
    await dispatchStarted;

    expect(statusDuringDispatch).toBe('scheduled');
    expect(nextRunDuringDispatch).toBe(event.start_at);

    releaseDispatch(completed('jrun_claim_order', 'jreq_claim_order'));
    await expect(pending).resolves.toMatchObject({ ran: [String(event.id)] });
    expect(event.status).toBe('done');
  });

  it('claims an occurrence before awaiting dispatch so overlapping polls cannot double-dispatch', async () => {
    const event = buildOneShot('concurrent_claim');
    let releaseDispatch!: (outcome: ScheduledJarvisAttemptResult) => void;
    const pendingOutcome = new Promise<ScheduledJarvisAttemptResult>((resolve) => {
      releaseDispatch = resolve;
    });
    let dispatchAttempts = 0;
    let markDispatchStarted!: () => void;
    const dispatchStarted = new Promise<void>((resolve) => {
      markDispatchStarted = resolve;
    });
    const deps = depsFor(event, async () => {
      dispatchAttempts += 1;
      markDispatchStarted();
      return pendingOutcome;
    });

    const first = runDueJarvisSchedules(ACCOUNT, WORKSPACE, deps);
    await dispatchStarted;
    const duplicate = await runDueJarvisSchedules(ACCOUNT, WORKSPACE, deps);

    expect(duplicate.ran).toEqual([]);
    expect(dispatchAttempts).toBe(1);

    releaseDispatch(completed('jrun_concurrent_claim', 'jreq_concurrent_claim'));
    await first;
  });

  it('scopes in-flight occurrence claims by account without releasing another account claim', async () => {
    const event = buildOneShot('account_scoped_claim');
    const releases: Array<(outcome: ScheduledJarvisAttemptResult) => void> = [];
    let dispatchAttempts = 0;
    const deps = depsFor(
      event,
      () =>
        new Promise<ScheduledJarvisAttemptResult>((resolve) => {
          dispatchAttempts += 1;
          releases.push(resolve);
        }),
    );

    const accountA = runDueJarvisSchedules('acct_a', WORKSPACE, deps);
    for (let index = 0; index < 10 && dispatchAttempts < 1; index += 1) await Promise.resolve();
    const accountB = runDueJarvisSchedules('acct_b', WORKSPACE, deps);
    for (let index = 0; index < 10 && dispatchAttempts < 2; index += 1) await Promise.resolve();

    expect(dispatchAttempts).toBe(2);
    const duplicateA = await runDueJarvisSchedules('acct_a', WORKSPACE, deps);

    expect(duplicateA.ran).toEqual([]);
    expect(dispatchAttempts).toBe(2);

    releases[0]!(completed('jrun_account_a', 'jreq_account_a'));
    releases[1]!(completed('jrun_account_b', 'jreq_account_b'));
    await Promise.all([accountA, accountB]);
  });

  it('releases the claim after a thrown pre-outcome failure and retries without legacy success', async () => {
    const event = buildOneShot('throw_then_retry');
    let attempts = 0;
    const deps = depsFor(event, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('canonical schedule source temporarily unavailable');
      return completed('jrun_retry', 'jreq_retry');
    });

    const first = await runDueJarvisSchedules(ACCOUNT, WORKSPACE, deps);

    expect(first.ran).toEqual([]);
    expect(event.status).toBe('scheduled');
    const failedMetadata = parseJarvisScheduleMetadata(event)!;
    expect(failedMetadata.nextRunAt).toBe(event.start_at);
    expect(failedMetadata.runHistory).toEqual([]);
    expect(failedMetadata.errorHistory.at(-1)?.error).toContain(
      'canonical schedule source temporarily unavailable',
    );

    const second = await runDueJarvisSchedules(ACCOUNT, WORKSPACE, deps);

    expect(second.ran).toEqual([String(event.id)]);
    expect(attempts).toBe(2);
    expect(event.status).toBe('done');
    expect(parseJarvisScheduleMetadata(event)!.runHistory).toEqual([
      {
        schemaVersion: 1,
        at: NOW,
        runId: 'jrun_retry',
        requestId: 'jreq_retry',
        status: 'completed',
      },
    ]);
  });
});
