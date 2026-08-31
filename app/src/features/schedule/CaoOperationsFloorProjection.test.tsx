import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('restores only the exact scoped canonical runtime status after reload', async () => {
    const { rerender } = render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={async () => snapshot()}
        getStatus={() => ({
          state: 'running',
          trigger: 'learning_threshold',
          scope,
          updatedAt: scope.scheduleAnchorAt + 30_000,
        })}
        subscribeStatus={() => vi.fn()}
      />,
    );

    expect(await screen.findByText('Running · Learning threshold')).toBeTruthy();

    rerender(
      <CaoOperationsFloorProjection
        scope={{ ...scope, scheduleId: 'schedule-foreign' }}
        scheduleState="active"
        loadSnapshot={async () => snapshot({ scheduleId: 'schedule-foreign' })}
        getStatus={() => ({
          state: 'running',
          trigger: 'manual_force',
          scope,
          updatedAt: scope.scheduleAnchorAt + 40_000,
        })}
        subscribeStatus={() => vi.fn()}
      />,
    );

    await screen.findByText('Revision 4');
    expect(screen.queryByText('Running · Manual force')).toBeNull();
  });

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

  it('retries canonical hydration from empty and unavailable states', async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage offline'))
      .mockResolvedValueOnce(snapshot({ revision: 6, lastLearningSeqConsumed: 18 }));

    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={loadSnapshot}
        subscribeStatus={() => vi.fn()}
      />,
    );

    expect(await screen.findByText(/No durable learning snapshot yet/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry operational truth' }));
    expect(await screen.findByText('Operational truth unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry operational truth' }));
    expect(await screen.findByText('18')).toBeTruthy();
    expect(screen.getByText('Revision 6')).toBeTruthy();
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });

  it('preserves last verified truth when terminal refresh degrades and recovers on retry', async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error('reload unavailable'))
      .mockResolvedValueOnce(snapshot({ revision: 5, lastLearningSeqConsumed: 16 }));
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

    expect(
      (await screen.findByRole('status', { name: 'CAO operational truth health' })).textContent,
    ).toContain('Operational truth degraded. Showing the last verified snapshot.');
    expect(screen.getByText('12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry operational truth' }));
    expect(await screen.findByText('16')).toBeTruthy();
    expect(screen.getByText('Revision 5')).toBeTruthy();
    expect(screen.queryByText(/Operational truth degraded/u)).toBeNull();
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
    const recoverySummary = screen.getByText('Recovery details');
    expect((recoverySummary.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(recoverySummary);
    expect((recoverySummary.closest('details') as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText('Request: request-pending')).toBeTruthy();
    expect(screen.getByText('Cursor: 12 → 15')).toBeTruthy();
    expect(screen.getByText('Trigger: Manual force')).toBeTruthy();
    expect(screen.queryByText(/%/u)).toBeNull();
  });

  it('renders only the five newest verified completions in newest-first order', async () => {
    const completions = Array.from({ length: 7 }, (_, index) => ({
      passId: `pass-${index + 1}`,
      requestId: `request-${index + 1}`,
      trigger: index === 6 ? ('manual_force' as const) : ('learning_threshold' as const),
      fromSeqExclusive: index,
      throughSeqInclusive: index + 1,
      requestedAt: scope.scheduleAnchorAt + index * 10_000,
      completedAt: scope.scheduleAnchorAt + index * 10_000 + (index === 6 ? 1_500 : 1_000),
      receiptId: `receipt-${index + 1}`,
    }));

    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={async () =>
          snapshot({
            lastLearningSeqConsumed: 7,
            completions,
          })
        }
        subscribeStatus={() => vi.fn()}
      />,
    );

    const historySummary = await screen.findByText('Verified completion history');
    expect((historySummary.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(historySummary);
    expect((historySummary.closest('details') as HTMLDetailsElement).open).toBe(true);
    const history = screen.getByRole('list', { name: 'Verified completion history' });
    const rows = within(history).getAllByRole('listitem');

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('receipt-7'),
      expect.stringContaining('receipt-6'),
      expect.stringContaining('receipt-5'),
      expect.stringContaining('receipt-4'),
      expect.stringContaining('receipt-3'),
    ]);
    expect(rows[0]?.textContent).toContain('Manual force');
    expect(rows[0]?.textContent).toContain('1.5 s');
    expect(rows[0]?.textContent).toContain('pass-7');
    expect(rows[0]?.textContent).toContain('request-7');
    expect(screen.queryByText('receipt-2')).toBeNull();
    expect(screen.queryByText('receipt-1')).toBeNull();
  });

  it('announces matching runtime and durable recovery state without inventing progress', async () => {
    let publish: ((status: CaoScheduledLearningRuntimeStatus) => void) | undefined;
    render(
      <CaoOperationsFloorProjection
        scope={scope}
        scheduleState="active"
        loadSnapshot={async () =>
          snapshot({
            pending: {
              passId: 'pass-recovery',
              requestId: 'request-recovery',
              trigger: 'manual_force',
              fromSeqExclusive: 12,
              throughSeqInclusive: 14,
              requestedAt: scope.scheduleAnchorAt + 90_000,
            },
          })
        }
        subscribeStatus={(listener) => {
          publish = listener;
          return vi.fn();
        }}
      />,
    );

    expect(
      (await screen.findByRole('status', { name: 'CAO durable recovery state' })).textContent,
    ).toContain('Recovery required');

    act(() =>
      publish?.({
        state: 'running',
        trigger: 'manual_force',
        scope,
        updatedAt: scope.scheduleAnchorAt + 100_000,
      }),
    );

    expect(screen.getByRole('status', { name: 'CAO live runtime state' }).textContent).toContain(
      'Running · Manual force',
    );
    expect(screen.queryByText(/%/u)).toBeNull();
  });
});
