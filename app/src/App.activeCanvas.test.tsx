import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveCanvas } from './App';
import { useUIStore } from '@/stores/ui';

vi.mock('@/features/terminals/TerminalsPage', () => ({
  TerminalsPage: () => <div data-testid="live-terminal">Live terminal</div>,
}));

vi.mock('@/features/chat', () => ({
  ChatView: () => <div data-testid="chat-view">Chat</div>,
}));

describe('ActiveCanvas terminal preservation', () => {
  beforeEach(() => {
    useUIStore.getState().resetUI();
    useUIStore.getState().setChatMode('chat');
    useUIStore.getState().setRoute('terminal');
  });

  afterEach(() => {
    useUIStore.getState().resetUI();
  });

  it('keeps the same terminal surface mounted through Terminal -> Chat -> Terminal', async () => {
    render(<ActiveCanvas />);
    const originalTerminal = await screen.findByTestId('live-terminal');

    await act(async () => {
      useUIStore.getState().setRoute('chat');
    });

    expect(await screen.findByTestId('chat-view')).toBeTruthy();
    expect(originalTerminal.isConnected).toBe(true);
    expect(
      originalTerminal
        .closest('[data-terminal-route-cache]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');

    await act(async () => {
      useUIStore.getState().setRoute('terminal');
    });

    expect(await screen.findByTestId('live-terminal')).toBe(originalTerminal);
    expect(
      originalTerminal
        .closest('[data-terminal-route-cache]')
        ?.getAttribute('aria-hidden'),
    ).toBe('false');
  });
});
