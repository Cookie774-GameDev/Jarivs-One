import { beforeEach, describe, expect, it } from 'vitest';
import { useMilestonesStore } from './milestonesStore';

describe('milestonesStore', () => {
  beforeEach(() => {
    useMilestonesStore.setState({ items: [] });
  });

  it('persists optional milestone description and deadline fields', () => {
    const deadlineAt = Date.UTC(2026, 6, 15, 17, 0);
    const id = useMilestonesStore.getState().addMilestone(
      'Ship Jarvis Actions',
      'milestone',
      'Approval-gated commands and clean agent panels',
      deadlineAt,
    );

    expect(useMilestonesStore.getState().items[0]).toMatchObject({
      id,
      description: 'Approval-gated commands and clean agent panels',
      deadlineAt,
    });

    const nextDeadlineAt = Date.UTC(2026, 6, 20, 17, 0);
    useMilestonesStore.getState().updateMilestone(id, {
      description: 'Polished app-control workflow',
      deadlineAt: nextDeadlineAt,
    });

    expect(useMilestonesStore.getState().items[0]).toMatchObject({
      description: 'Polished app-control workflow',
      deadlineAt: nextDeadlineAt,
    });
  });
});
