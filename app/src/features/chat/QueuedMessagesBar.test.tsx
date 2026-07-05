import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueuedMessagesBar, type QueuedChatMessage } from './QueuedMessagesBar';

const queued: QueuedChatMessage[] = [
  { id: 'q_1', text: 'First queued request', createdAt: 1 },
];

describe('QueuedMessagesBar', () => {
  it('shows queued messages with edit, send now, and delete controls', () => {
    const onEdit = vi.fn();
    const onSendNow = vi.fn();
    const onDelete = vi.fn();

    render(
      <QueuedMessagesBar
        messages={queued}
        onEdit={onEdit}
        onSendNow={onSendNow}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByLabelText('Queued messages')).toBeTruthy();
    expect(screen.getByText('1 queued')).toBeTruthy();
    expect(screen.getByText(/First queued request/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Edit queued message/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send queued message now/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete queued message/i }));

    expect(onEdit).toHaveBeenCalledWith('q_1');
    expect(onSendNow).toHaveBeenCalledWith('q_1');
    expect(onDelete).toHaveBeenCalledWith('q_1');
  });
});
