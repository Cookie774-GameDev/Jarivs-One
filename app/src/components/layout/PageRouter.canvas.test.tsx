import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageRouter } from './PageRouter';
import { useUIStore } from '@/stores/ui';

vi.mock('@/features/canvas', () => ({
  CanvasPage: () => <div data-testid="canvas-page">Infinite Idea Canvas</div>,
}));

vi.mock('@/features/schedule', () => ({
  SchedulePage: () => <div data-testid="schedule-page">Schedule</div>,
}));

vi.mock('@/features/chat', () => ({
  ChatView: () => <div data-testid="chat-page">Chat</div>,
}));

describe('PageRouter Canvas preservation', () => {
  afterEach(() => {
    act(() => {
      useUIStore.getState().resetUI();
    });
  });

  it('keeps the Canvas mounted while another route is visible', async () => {
    useUIStore.getState().setRoute('canvas');
    const view = render(<PageRouter />);

    expect(await screen.findByTestId('canvas-page')).toBeTruthy();

    await act(async () => {
      useUIStore.getState().setRoute('schedule');
    });

    expect(await screen.findByTestId('schedule-page')).toBeTruthy();
    expect(screen.getByTestId('canvas-page')).toBeTruthy();
    expect(
      screen
        .getByTestId('canvas-page')
        .closest('[data-canvas-route-cache]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');

    await act(async () => {
      useUIStore.getState().setRoute('canvas');
    });

    expect(
      screen
        .getByTestId('canvas-page')
        .closest('[data-canvas-route-cache]')
        ?.getAttribute('aria-hidden'),
    ).toBe('false');

    view.unmount();
  });
});
