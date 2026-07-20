import { describe, expect, it } from 'vitest';
import type {
  JarvisCancellationAggregate,
  JarvisCancellationRequestResult,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { ScheduledJarvisAttemptResult } from '@/features/schedule/jarvisScheduleDispatch';
import {
  mapJarvisCancellationAggregate,
  mapJarvisCancellationRequestResult,
  mapScheduledJarvisAttemptResult,
} from './resultMappers';

describe('Command Center result mappers', () => {
  it.each<[JarvisCancellationAggregate, string]>([
    [{ kind: 'delivery_pending', ownerIds: ['owner-1'] }, 'Waiting for the execution owner'],
    [
      { kind: 'queued_cancelled', ownerId: 'owner-1', queueItemId: 'queue-1' },
      'Queued work cancelled',
    ],
    [{ kind: 'signal_delivered', ownerIds: ['owner-1'] }, 'Cancellation requested'],
    [{ kind: 'handoff_pending', ownerIds: ['owner-1'] }, 'Waiting for the execution owner'],
    [
      { kind: 'unsupported', ownerIds: ['owner-1'] },
      'The execution owner does not support cancellation',
    ],
    [{ kind: 'executor_missing' }, 'The execution owner is unavailable; cancellation is pending'],
    [
      { kind: 'delivery_rejected', ownerIds: ['owner-1'] },
      'The execution owner rejected cancellation delivery',
    ],
    [
      { kind: 'delivery_error', ownerIds: ['owner-1'], safeErrorCategory: 'network' },
      'Cancellation delivery failed; the run is not confirmed cancelled',
    ],
  ])('maps aggregate $kind truthfully', (aggregate, expected) => {
    expect(mapJarvisCancellationAggregate(aggregate)).toBe(expected);
  });

  it('maps revoked-before-intent and every canonical terminal status without false inference', () => {
    expect(mapJarvisCancellationRequestResult({ kind: 'authority_revoked_before_intent' })).toBe(
      'Account changed; cancellation was not requested.',
    );

    for (const terminalStatus of [
      'partial',
      'completed',
      'failed',
      'cancelled',
      'timed_out',
    ] as const) {
      expect(
        mapJarvisCancellationRequestResult({ kind: 'already_terminal', terminalStatus }),
      ).toContain(terminalStatus);
    }
  });

  it('always says intent was committed, including authority revoked after intent', () => {
    const result: JarvisCancellationRequestResult = {
      kind: 'intent_committed',
      requestState: 'new',
      authorityState: 'revoked_after_intent',
      cancellationRequestId: 'cancel-1',
      aggregate: { kind: 'handoff_pending', ownerIds: ['owner-1'] },
    };

    expect(mapJarvisCancellationRequestResult(result)).toBe(
      'Cancellation requested. Waiting for the execution owner',
    );
  });

  it.each<[ScheduledJarvisAttemptResult, string]>([
    [{ kind: 'committed', result: {} as never }, 'Scheduled run committed'],
    [
      { kind: 'transport_retry_available', run: {} as JarvisRun, attempt: {} as never },
      'Retry transport is available',
    ],
    [
      { kind: 'terminal_transport_failure', run: { status: 'failed' } as JarvisRun },
      'Transport failed; the run is terminal',
    ],
    [{ kind: 'account_authority_revoked' }, 'Account changed; retry was not started'],
  ])('maps scheduled result $kind exhaustively', (result, expected) => {
    expect(mapScheduledJarvisAttemptResult(result)).toBe(expected);
  });
});
