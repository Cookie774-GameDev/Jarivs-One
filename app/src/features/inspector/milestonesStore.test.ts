import { beforeEach, describe, expect, it } from 'vitest';
import { useMilestonesStore } from './milestonesStore';

describe('milestonesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useMilestonesStore.setState({ items: [] });
  });

  it('persists optional milestone description and deadline fields', () => {
    const deadlineAt = Date.UTC(2026, 6, 15, 17, 0);
    const id = useMilestonesStore
      .getState()
      .addMilestone(
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

  it('preserves edits through completion and clears stale completion state when reopened', () => {
    const id = useMilestonesStore.getState().addMilestone('Initial title', 'milestone');
    const deadlineAt = Date.UTC(2026, 11, 31, 17, 0);

    useMilestonesStore.getState().updateMilestone(id, {
      title: 'Launch VibeSpace',
      description: 'Complete the verified release checklist',
      deadlineAt,
    });
    useMilestonesStore.getState().toggleDone(id);

    expect(useMilestonesStore.getState().items[0]).toMatchObject({
      title: 'Launch VibeSpace',
      description: 'Complete the verified release checklist',
      deadlineAt,
      status: 'done',
      completedAt: expect.any(Number),
    });

    useMilestonesStore.getState().toggleDone(id);

    expect(useMilestonesStore.getState().items[0]).toEqual(
      expect.objectContaining({
        id,
        title: 'Launch VibeSpace',
        description: 'Complete the verified release checklist',
        deadlineAt,
        status: 'todo',
        completedAt: undefined,
      }),
    );
    const persisted = JSON.parse(localStorage.getItem('jarvis-inspector-milestones-v1') ?? '{}');
    expect(persisted.state.items[0]).toMatchObject({
      id,
      title: 'Launch VibeSpace',
      description: 'Complete the verified release checklist',
      deadlineAt,
      status: 'todo',
    });
    expect(persisted.state.items[0].completedAt).toBeUndefined();
  });
});
