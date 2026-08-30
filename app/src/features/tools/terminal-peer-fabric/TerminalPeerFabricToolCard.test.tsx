// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalPeerFabricToolCard } from './TerminalPeerFabricToolCard';
import type { TerminalPeerFabricCommandPort } from './terminalPeerFabricTool';

function port(available: boolean): TerminalPeerFabricCommandPort {
  return {
    capability: vi
      .fn()
      .mockResolvedValue(available ? { available: true, version: '1.0.0' } : { available: false }),
    connect: vi.fn(),
    command: vi.fn(),
  };
}

describe('TerminalPeerFabricToolCard', () => {
  it('stays visible and truthfully disabled when native capability is unavailable', async () => {
    await act(async () => {
      render(<TerminalPeerFabricToolCard port={port(false)} eligibleTerminalCount={3} />);
    });

    expect(screen.getByText('Terminal Peer Fabric')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /run terminal peer fabric/i }).hasAttribute('disabled'),
      ).toBe(true),
    );
    expect(await screen.findByText(/not available in this build/i)).toBeTruthy();
  });

  it('requires at least two eligible terminals', async () => {
    await act(async () => {
      render(<TerminalPeerFabricToolCard port={port(true)} eligibleTerminalCount={1} />);
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /run terminal peer fabric/i }).hasAttribute('disabled'),
      ).toBe(true),
    );
    expect(screen.getByText(/needs at least two eligible terminals/i)).toBeTruthy();
  });

  it('opens the local setup surface without installing or downloading anything', async () => {
    const onOpen = vi.fn();
    await act(async () => {
      render(
        <TerminalPeerFabricToolCard port={port(true)} eligibleTerminalCount={2} onOpen={onOpen} />,
      );
    });
    const run = screen.getByRole('button', { name: /run terminal peer fabric/i });
    await waitFor(() => expect(run.hasAttribute('disabled')).toBe(false));
    fireEvent.click(run);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
