import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { JarvisTaskProgressCard } from './JarvisTaskProgressCard';
import { createJarvisTaskRun, useJarvisTaskRunStore } from './taskRunStore';

describe('JarvisTaskProgressCard', () => {
  beforeEach(() => {
    localStorage.clear();
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('shows compact, scoped progress and cancels unfinished work', () => {
    const run = createJarvisTaskRun({
      chatId: 'chat-a',
      goal: 'Inspect systems',
      status: 'running',
      steps: [
        { id: 'one', action: 'status.read', label: 'Read status', recoverable: true, status: 'completed' },
        { id: 'two', action: 'agent.wait', label: 'Wait for agent', recoverable: true, status: 'running' },
      ],
    });
    run.activeAgents = ['agent-terminal'];
    run.activeTerminals = ['pane-1'];
    act(() => useJarvisTaskRunStore.getState().addRun(run));

    render(<JarvisTaskProgressCard chatId="chat-a" />);

    expect(screen.getByText('Inspect systems')).not.toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('1 agent')).not.toBeNull();
    expect(screen.getByText('1 terminal')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));
    expect(useJarvisTaskRunStore.getState().runs[run.id]).toMatchObject({ status: 'cancelled' });
    expect(useJarvisTaskRunStore.getState().runs[run.id]?.steps[1]?.status).toBe('cancelled');
  });

  it('does not leak task state across chats', () => {
    act(() => useJarvisTaskRunStore.getState().addRun(createJarvisTaskRun({
      chatId: 'other-chat',
      goal: 'Private other chat task',
      status: 'running',
      steps: [{ id: 'one', action: 'status.read', label: 'Read', recoverable: true }],
    })));

    const { container } = render(<JarvisTaskProgressCard chatId="chat-a" />);
    expect(container.innerHTML).toBe('');
  });
});
