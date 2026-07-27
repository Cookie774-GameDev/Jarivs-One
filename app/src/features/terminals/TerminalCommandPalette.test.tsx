import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalCommandPalette } from './TerminalCommandPalette';

const evidence = {
  promptProtocol: 'osc133',
  atPrompt: true,
  alternateScreen: false,
  interactiveProgram: false,
  localShell: true,
  passwordPrompt: false,
  sshSession: false,
} as const;

describe('TerminalCommandPalette', () => {
  it('renders the complete in-pane top level and filters without touching the PTY', () => {
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'VibeSpace terminal palette' })).toBeTruthy();
    for (const label of [
      'Context Map',
      'Skills',
      'Agents',
      'Project',
      'Notes',
      'Daily Note',
      'Search',
      'Terminals',
      'Status',
      'Help',
    ]) {
      expect(screen.getByRole('option', { name: new RegExp(`^${label}\\b`, 'i') })).toBeTruthy();
    }

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter terminal commands' }), {
      target: { value: 'skill' },
    });
    expect(screen.getByRole('option', { name: /Skills/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Context Map/i })).toBeNull();
  });

  it('supports arrow/Tab selection, Enter navigation, Escape, and mouse status', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <TerminalCommandPalette
        open
        paneId="pane-1"
        sessionId="pty-1"
        projectId="project-1"
        evidence={evidence}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Filter terminal commands' });
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('skills');

    fireEvent.click(screen.getByRole('option', { name: /Status/i }));
    expect(screen.getByText(/Verified local shell prompt/i)).toBeTruthy();
    expect(screen.getByText(/pty-1/i)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Backspace' });
    const returnedInput = screen.getByRole('combobox', { name: 'Filter terminal commands' });

    fireEvent.keyDown(returnedInput, { key: 'ArrowUp' });
    fireEvent.keyDown(returnedInput, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('context');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <TerminalCommandPalette
        open={false}
        paneId="pane-1"
        sessionId={null}
        projectId={null}
        evidence={evidence}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
