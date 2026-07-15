import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessagePart } from './MessagePart';

describe('MessagePart active chat commands', () => {
  it('renders /multitask as an in-use command, not plain attached text', () => {
    render(
      <MessagePart
        allParts={[]}
        part={{ kind: 'text', text: '/multitask Review runtime modes' }}
      />,
    );

    const card = screen.getByTestId('active-chat-command');
    expect(card.getAttribute('data-command')).toBe('multitask');
    expect(screen.getByText('/multitask')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
    expect(screen.getByText('Review runtime modes')).toBeTruthy();
    expect(screen.queryByText(/attached/i)).toBeNull();
  });

  it('renders /subagents with distinct in-use styling', () => {
    render(
      <MessagePart
        allParts={[]}
        part={{ kind: 'text', text: '/subagents Audit model dropdowns' }}
      />,
    );

    const card = screen.getByTestId('active-chat-command');
    expect(card.getAttribute('data-command')).toBe('subagents');
    expect(screen.getByText('/subagents')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
    expect(screen.getByText('Audit model dropdowns')).toBeTruthy();
  });

  it('still styles legacy “attached” wording as an active command', () => {
    render(
      <MessagePart
        allParts={[]}
        part={{
          kind: 'text',
          text: 'Slash command /multitask attached: Legacy task',
        }}
      />,
    );

    expect(screen.getByTestId('active-chat-command')).toBeTruthy();
    expect(screen.getByText('Legacy task')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
  });

  it('leaves normal prose unchanged', () => {
    render(
      <MessagePart allParts={[]} part={{ kind: 'text', text: 'Hello from the user' }} />,
    );
    expect(screen.queryByTestId('active-chat-command')).toBeNull();
    expect(screen.getByText('Hello from the user')).toBeTruthy();
  });
});
