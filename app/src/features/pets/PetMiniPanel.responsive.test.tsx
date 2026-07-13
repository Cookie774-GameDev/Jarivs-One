import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetMiniPanel } from './PetMiniPanel';
import { usePetPresentationStore } from './petPresentationStore';

vi.mock('./PetChatSurface', () => ({
  PetChatSurface: () => <div data-testid="shared-chat-surface" />,
}));

vi.mock('./PetTerminalSurface', () => ({
  PetTerminalSurface: () => <div data-testid="shared-terminal-surface" />,
}));

vi.mock('./PetVoiceSurface', () => ({
  PetVoiceSurface: () => <div data-testid="shared-voice-surface" />,
}));

vi.mock('./petTauriBridge', () => ({
  hidePetPanel: vi.fn(async () => undefined),
  minimizePetPanel: vi.fn(async () => undefined),
}));

describe('PetMiniPanel responsive shell', () => {
  beforeEach(() => {
    localStorage.clear();
    usePetPresentationStore.setState({
      chats: {},
      terminals: {},
      activity: [],
      activitySeenIds: [],
      unreadActivity: 0,
      panelLifecycle: 'closed',
      panelActiveChatId: null,
      panelActiveTerminalId: null,
      lastLimitMessage: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('collapses to only the active surface and one accessible expand control', () => {
    const { container } = render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    expect(screen.getByTestId('pet-panel-header')).toBeTruthy();
    expect(screen.getByTestId('shared-chat-surface')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel header' }));

    expect(screen.queryByTestId('pet-panel-header')).toBeNull();
    expect(screen.getByTestId('shared-chat-surface')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand panel header' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Minimize pet panel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close pet panel' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Panel sections' })).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(localStorage.getItem('vibespace-pet-panel-header-collapsed')).toBe('1');
  });

  it('restores the collapsed preference and expands back to complete window chrome', () => {
    localStorage.setItem('vibespace-pet-panel-header-collapsed', '1');

    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    expect(screen.queryByTestId('pet-panel-header')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand panel header' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Minimize pet panel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close pet panel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chats' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel header' }));

    expect(screen.getByTestId('pet-panel-header')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimize pet panel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close pet panel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chats' })).toBeTruthy();
    expect(localStorage.getItem('vibespace-pet-panel-header-collapsed')).toBe('0');
  });

  it('derives density from the panel container without scaling the interface', async () => {
    let width = 360;
    let height = 700;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width,
      height,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    const panel = screen.getByRole('dialog', { name: 'Pet mini panel' });
    expect(panel.classList.contains('pet-mini-panel-shell')).toBe(true);
    await waitFor(() => expect(panel.getAttribute('data-pet-panel-density')).toBe('minimum'));

    width = 460;
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(panel.getAttribute('data-pet-panel-density')).toBe('compact'));

    width = 700;
    height = 700;
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(panel.getAttribute('data-pet-panel-density')).toBe('comfortable'));
    expect(panel.getAttribute('style') ?? '').not.toContain('scale(');
  });

  it('keeps minimize and close lifecycle states visible for their bounded transitions', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onMinimize = vi.fn();
    render(<PetMiniPanel open onClose={onClose} onMinimize={onMinimize} />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize pet panel' }));
    expect(
      screen
        .getByRole('dialog', { name: 'Pet mini panel' })
        .getAttribute('data-pet-panel-lifecycle'),
    ).toBe('minimizing');
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(160));
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('expands and collapses safe error activity details without exposing hidden content', () => {
    usePetPresentationStore.setState({
      activity: [
        {
          id: 'error-1',
          kind: 'error',
          summary: 'Terminal task failed',
          target: { type: 'terminal', id: 'terminal-7' },
          createdAt: 1_000,
        },
      ],
    });
    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

    fireEvent.click(screen.getByRole('button', { name: 'Expand error details' }));
    expect(screen.getByText('Target: terminal')).toBeTruthy();
    expect(screen.getByText('Reference: terminal-7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse error details' }));
    expect(screen.queryByText('Reference: terminal-7')).toBeNull();
  });
});
