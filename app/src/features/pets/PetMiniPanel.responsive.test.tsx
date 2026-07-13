import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('collapses the complete header without unmounting the active shared surface', () => {
    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    expect(screen.getByTestId('pet-panel-header').getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('shared-chat-surface')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel header' }));

    expect(screen.getByTestId('pet-panel-header').getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByTestId('shared-chat-surface')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand panel header' })).toBeTruthy();
    expect(localStorage.getItem('vibespace-pet-panel-header-collapsed')).toBe('1');
  });

  it('restores the collapsed preference and keeps every essential window control accessible', () => {
    localStorage.setItem('vibespace-pet-panel-header-collapsed', '1');

    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    expect(screen.getByTestId('pet-panel-header').getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Expand panel header' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimize pet panel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close pet panel' })).toBeTruthy();
    expect(screen.getByText('Chats')).toBeTruthy();
  });

  it('exposes container-driven density hooks without scaling the interface', () => {
    render(<PetMiniPanel open onClose={vi.fn()} windowMode />);

    const panel = screen.getByRole('dialog', { name: 'Pet mini panel' });
    expect(panel.classList.contains('pet-mini-panel-shell')).toBe(true);
    expect(panel.hasAttribute('data-pet-panel-density')).toBe(true);
    expect(panel.getAttribute('style') ?? '').not.toContain('scale(');
  });
});
