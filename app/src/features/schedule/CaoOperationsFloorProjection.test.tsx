import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CaoScheduledLearningRuntimeStatus } from '@/features/jarvis-memory/caoScheduledLearningRuntime';
import type {
  CaoScheduledLearningScope,
  CaoScheduledLearningSnapshot,
} from '@/features/jarvis-memory/caoScheduledLearning';
import { CaoOperationsFloorProjection } from './CaoOperationsFloorProjection';

const scope: CaoScheduledLearningScope = {
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  scheduleId: 'schedule-1',
  targetId: 'learning-md',
  scheduleAnchorAt: 1_800_000_000_000,
};

function snapshot(
  overrides: Partial<CaoScheduledLearningSnapshot> = {},
): CaoScheduledLearningSnapshot {
  return {
    schemaVersion: 1,
    revision: 4,
    ...scope,
    lastLearningSeqConsumed: 12,
    scheduledOccurrenceCount: 2,
    lastScheduledDueAt: scope.scheduleAnchorAt + 60_000,
    completions: [
      {
        passId: 'pass-2',
        requestId: 'request-2',
        trigger: 'scheduled',
        fromSeqExclusive: 8,
        throughSeqInclusive: 12,
        requestedAt: scope.scheduleAnchorAt + 60_000,
        scheduledDueAt: scope.scheduleAnchorAt + 60_000,
        completedAt: scope.scheduleAnchorAt + 61_000,
        receiptId: 'receipt-2',
      },
    ],
    ...overrides,
  };
}

describe('CaoOperationsFloorProjection', () => {
  it('hydrates exact scoped durable truth and follows only matching live runtime status', async () => {
    const loadSnapshot = vi.fn(async () => snapshot());
    let publish: ((status: CaoScheduledLearningRuntimeStatus) => void) | undefined;
    const subscribeStatus = vi.fn(
      (listener: (status: CaoScheduledLearningRuntimeStatus) => void) => {
        publish = listener;
        return vi.fn();
      },
    );

    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={loadSnapshot}
        subscribeStatus={subscribeStatus}
      />,
    );

    expect(screen.getByText('Loading operational truth…')).toBeTruthy();
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText('Revision 4')).toBeTruthy();
    expect(screen.getByText('2 scheduled checks')).toBeTruthy();
    expect(screen.getByText('receipt-2')).toBeTruthy();
    expect(screen.getByText('No active blocker')).toBeTruthy();

    act(() =>
      publish?.({
        state: 'running',
        trigger: 'manual_force',
        scope: { ...scope, targetId: 'other-target' },
        updatedAt: scope.scheduleAnchorAt + 70_000,
      }),
    );
    expect(screen.queryByText('Running · Manual force')).toBeNull();

    act(() =>
      publish?.({
        state: 'running',
        trigger: 'manual_force',
        scope,
        updatedAt: scope.scheduleAnchorAt + 80_000,
      }),
    );
    expect(screen.getByText('Running · Manual force')).toBeTruthy();
  });

  it('reloads the durable cursor after a matching terminal runtime update', async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(
        snapshot({
          revision: 5,
          lastLearningSeqConsumed: 16,
          scheduledOccurrenceCount: 3,
        }),
      );
    let publish: ((status: CaoScheduledLearningRuntimeStatus) => void) | undefined;

    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={loadSnapshot}
        subscribeStatus={(listener) => {
          publish = listener;
          return vi.fn();
        }}
      />,
    );
    expect(await screen.findByText('12')).toBeTruthy();

    await act(async () => {
      publish?.({ state: 'completed', trigger: 'manual_force', scope, updatedAt: Date.now() });
    });

    await waitFor(() => expect(screen.getByText('16')).toBeTruthy());
    expect(screen.getByText('Revision 5')).toBeTruthy();
    expect(screen.getByText('3 scheduled checks')).toBeTruthy();
  });

  it('fails closed when durable truth is invalid or unavailable', async () => {
    const { rerender } = render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="paused"
        loadSnapshot={async () => ({ revision: 99 })}
        subscribeStatus={() => vi.fn()}
      />,
    );

    expect(await screen.findByText('Operational truth unavailable')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();

    rerender(
      <CaoOperationsFloorProjection
        scope={{ ...scope, scheduleId: 'schedule-2' }}
        scheduleState="paused"
        loadSnapshot={async () => {
          throw new Error('storage offline');
        }}
        subscribeStatus={() => vi.fn()}
      />,
    );
    expect(await screen.findByText('Operational truth unavailable')).toBeTruthy();
  });

  it('projects a pending durable pass as recovery-required without synthetic progress', async () => {
    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={async () =>
          snapshot({
            pending: {
              passId: 'pass-pending',
              requestId: 'request-pending',
              trigger: 'manual_force',
              fromSeqExclusive: 12,
              throughSeqInclusive: 15,
              requestedAt: scope.scheduleAnchorAt + 90_000,
            },
          })
        }
        subscribeStatus={() => vi.fn()}
      />,
    );

    expect(await screen.findByText('Recovery required')).toBeTruthy();
    expect(screen.getByText('pass-pending')).toBeTruthy();
    expect(screen.queryByText(/%/u)).toBeNull();
  });
});
