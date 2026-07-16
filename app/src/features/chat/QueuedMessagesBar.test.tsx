import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildQueuedMultitaskCommand,
  QueuedMessagesBar,
  shouldAutoSendQueuedOnRunStatus,
  takeNextQueuedMessage,
  type QueuedChatMessage,
} from './QueuedMessagesBar';

const queued: QueuedChatMessage[] = [
  { id: 'q_1', text: 'First queued request', createdAt: 1 },
];

const longQueued: QueuedChatMessage[] = [
  {
    id: 'q_long',
    text: 'Jarvis make me a file here: "C:\\Users\\viper\\Downloads" okay and write a very long 500 word story about dogs and also cats and also birds so the queued text is extremely long and must not cover the multitask button controls',
    createdAt: 2,
  },
];

describe('QueuedMessagesBar', () => {
  it('shows queued messages with edit, multitask, send now, and delete controls', () => {
    const onEdit = vi.fn();
    const onSendNow = vi.fn();
    const onStartMultitask = vi.fn();
    const onDelete = vi.fn();

    render(
      <QueuedMessagesBar
        messages={queued}
        onEdit={onEdit}
        onSendNow={onSendNow}
        onStartMultitask={onStartMultitask}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByLabelText('Queued messages')).toBeTruthy();
    expect(screen.getByText('1 queued')).toBeTruthy();
    expect(screen.getByText(/First queued request/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Edit queued message/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start multitask for queued message/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send queued message now/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete queued message/i }));

    expect(onEdit).toHaveBeenCalledWith('q_1');
    expect(onStartMultitask).toHaveBeenCalledWith('q_1');
    expect(onSendNow).toHaveBeenCalledWith('q_1');
    expect(onDelete).toHaveBeenCalledWith('q_1');
  });

  it('keeps multitask and action buttons available when the queued text is very long', () => {
    const onStartMultitask = vi.fn();
    render(
      <QueuedMessagesBar
        messages={longQueued}
        onEdit={vi.fn()}
        onSendNow={vi.fn()}
        onStartMultitask={onStartMultitask}
        onDelete={vi.fn()}
      />,
    );

    const multitask = screen.getByRole('button', { name: /Start multitask for queued message/i });
    const edit = screen.getByRole('button', { name: /Edit queued message/i });
    const send = screen.getByRole('button', { name: /Send queued message now/i });
    const del = screen.getByRole('button', { name: /Delete queued message/i });

    expect(multitask).toBeTruthy();
    expect(edit).toBeTruthy();
    expect(send).toBeTruthy();
    expect(del).toBeTruthy();

    // Row uses a fixed actions column so long text cannot remove controls from the tree.
    const row = multitask.closest('.group');
    expect(row?.className).toMatch(/grid-cols-\[minmax\(0,1fr\)_auto\]/);

    fireEvent.click(multitask);
    expect(onStartMultitask).toHaveBeenCalledWith('q_long');
  });
});

describe('buildQueuedMultitaskCommand', () => {
  it('prefixes /multitask and avoids double-prefix', () => {
    expect(buildQueuedMultitaskCommand('make a file in Downloads')).toBe(
      '/multitask make a file in Downloads',
    );
    expect(buildQueuedMultitaskCommand('/multitask already there')).toBe(
      '/multitask already there',
    );
    expect(buildQueuedMultitaskCommand('/subagents review PRs')).toBe(
      '/multitask review PRs',
    );
  });
});

describe('queued auto-send helpers', () => {
  it('only auto-sends after a terminal run status', () => {
    expect(shouldAutoSendQueuedOnRunStatus('running')).toBe(false);
    expect(shouldAutoSendQueuedOnRunStatus('done')).toBe(true);
    expect(shouldAutoSendQueuedOnRunStatus('error')).toBe(true);
    expect(shouldAutoSendQueuedOnRunStatus('cancelled')).toBe(true);
    expect(shouldAutoSendQueuedOnRunStatus(undefined)).toBe(false);
  });

  it('takes the next queued message in FIFO order', () => {
    const queue: QueuedChatMessage[] = [
      { id: 'a', text: 'first', createdAt: 1 },
      { id: 'b', text: 'second', createdAt: 2 },
    ];
    const first = takeNextQueuedMessage(queue);
    expect(first.next?.id).toBe('a');
    expect(first.remaining.map((m) => m.id)).toEqual(['b']);
    const empty = takeNextQueuedMessage([]);
    expect(empty.next).toBeNull();
    expect(empty.remaining).toEqual([]);
  });
});
