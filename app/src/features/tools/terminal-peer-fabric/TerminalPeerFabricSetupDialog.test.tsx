// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalPeerFabricSetupDialog } from './TerminalPeerFabricSetupDialog';
import type { TerminalPeerFabricCommandPort } from './terminalPeerFabricTool';

function port(): TerminalPeerFabricCommandPort {
  return {
    capability: vi.fn().mockResolvedValue({ available: true, version: '1.0.0' }),
    connect: vi.fn().mockResolvedValue({
      correlationId: 'corr-1',
      status: 'completed',
      targetIds: ['tty-1', 'tty-2'],
    }),
    command: vi.fn(),
  };
}

describe('TerminalPeerFabricSetupDialog', () => {
  it('requires two stable terminal identities and connects them atomically', async () => {
    const commandPort = port();
    const onOpenChange = vi.fn();
    await act(async () => {
      render(
        <TerminalPeerFabricSetupDialog
          open
          onOpenChange={onOpenChange}
          port={commandPort}
          candidates={[
            { sessionId: 'tty-1', paneId: 'pane-1', label: 'Codex' },
            { sessionId: 'tty-2', paneId: 'pane-2', label: 'OpenCode' },
            { sessionId: 'tty-3', paneId: 'pane-3', label: 'Claude' },
          ]}
          createCorrelationId={() => 'corr-1'}
        />,
      );
    });

    const connect = screen.getByRole('button', { name: /connect selected terminals/i });
    expect(connect.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /codex/i }));
    expect(connect.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /opencode/i }));
    expect(connect.hasAttribute('disabled')).toBe(false);
    fireEvent.click(connect);

    await waitFor(() =>
      expect(commandPort.connect).toHaveBeenCalledWith({
        correlationId: 'corr-1',
        peerIds: ['tty-1', 'tty-2'],
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
