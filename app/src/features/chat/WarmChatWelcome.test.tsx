import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarmChatWelcome } from './WarmChatWelcome';

const hookState = vi.hoisted(() => ({ messages: [] as Array<{ id: string }> }));

vi.mock('./hooks', () => ({
  useChatMessages: () => hookState.messages,
}));

describe('WarmChatWelcome', () => {
  afterEach(() => {
    cleanup();
    hookState.messages = [];
  });

  it('renders the approved empty-chat copy and four keyboard-accessible prompt choices', () => {
    render(<WarmChatWelcome chatId="chat-1" />);

    expect(screen.getByRole('heading', { name: 'Start a conversation' })).not.toBeNull();
    expect(
      screen.getByText('Ask anything, explore ideas, or delegate to an agent.'),
    ).not.toBeNull();
    expect(
      screen.getByRole('img', { name: 'Notebook, coffee, and writing tools' }).getAttribute('src'),
    ).toBe('/assets/themes/warm/reference/chat-notebook.png');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    for (const label of [
      'Ask Jarvis anything',
      'Plan a project',
      'Review my code',
      'Research a topic',
    ]) {
      expect(
        (screen.getByRole('button', { name: new RegExp(label, 'i') }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    }
    expect(screen.queryByText('Jarvis session')).toBeNull();
  });

  it('inserts the selected prompt through the existing composer event and targets this chat', () => {
    const listener = vi.fn();
    window.addEventListener('jarvis:composer:insert-text', listener);
    render(<WarmChatWelcome chatId="chat-42" />);

    fireEvent.click(screen.getByRole('button', { name: /plan a project/i }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<{ chatId: string; text: string }>;
    expect(event.detail).toEqual({ chatId: 'chat-42', text: 'Plan a project' });
    window.removeEventListener('jarvis:composer:insert-text', listener);
  });

  it('leaves populated chats untouched', () => {
    hookState.messages = [{ id: 'message-1' }];
    const { container } = render(<WarmChatWelcome chatId="chat-1" />);

    expect(container.innerHTML).toBe('');
  });

  it('marks compact pet welcome for panel scaling and still shows four starters', () => {
    const { container } = render(<WarmChatWelcome chatId="chat-pet" compact />);
    const section = container.querySelector('[data-pet-chat-welcome="true"]');
    expect(section).not.toBeNull();
    expect(section?.className).toContain('warm-chat-welcome--compact');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('img', { name: 'Notebook, coffee, and writing tools' })).not.toBeNull();
  });
});
