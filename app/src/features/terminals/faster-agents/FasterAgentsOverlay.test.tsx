import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFasterAgentsStore } from './fasterAgentsStore';

const { enqueueTerminalCommand } = vi.hoisted(() => ({
  enqueueTerminalCommand: vi.fn(),
}));

vi.mock('../terminalCommandQueue', () => ({ enqueueTerminalCommand }));
vi.mock('./fasterAgentsAudio', () => ({
  preloadOpenWhipCracks: vi.fn(),
  playOpenWhipCrack: vi.fn(async () => true),
}));
vi.mock('./WhipCanvas', () => ({
  WhipCanvas: ({ onCrack }: { onCrack: () => void }) => (
    <button type="button" onClick={onCrack}>
      Crack fixture
    </button>
  ),
}));
import { FasterAgentsOverlay } from './FasterAgentsOverlay';

const terminals = [1, 2, 3].map((index) => ({
  ref: { paneId: `pane-${index}`, sessionId: `session-${index}`, command: 'codex' },
  label: `Terminal ${index}`,
  detail: 'codex · live',
}));

describe('FasterAgentsOverlay', () => {
  beforeEach(() => {
    enqueueTerminalCommand.mockReset();
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        play() {
          return Promise.resolve();
        }
        pause() {}
      },
    );
    useFasterAgentsStore.setState({
      open: true,
      phase: 'select',
      selectedRefs: [],
      phrases: ['Move now.'],
      soundEnabled: false,
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lights selected panes and sends only to the exact selected group', async () => {
    const pane1 = document.createElement('div');
    pane1.dataset.terminalDropPaneId = 'pane-1';
    const pane3 = document.createElement('div');
    pane3.dataset.terminalDropPaneId = 'pane-3';
    document.body.append(pane1, pane3);

    render(<FasterAgentsOverlay terminals={terminals} />);
    expect(screen.getByTestId('faster-agents-dimmer').className).toContain('bg-black/70');
    fireEvent.click(screen.getByRole('button', { name: /Terminal 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Terminal 3/ }));
    await waitFor(() => expect(pane1.dataset.fasterAgentsSelected).toBe('true'));
    expect(pane3.dataset.fasterAgentsSelected).toBe('true');
    expect(document.documentElement.dataset.fasterAgentsSelecting).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to whip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crack fixture' }));

    expect(enqueueTerminalCommand).toHaveBeenCalledOnce();
    expect(enqueueTerminalCommand).toHaveBeenCalledWith({
      command: 'Move now.',
      target: 'refs',
      refs: [terminals[0]!.ref, terminals[2]!.ref],
    });
    pane1.remove();
    pane3.remove();
  });

  it('closing from selection sends nothing', () => {
    render(<FasterAgentsOverlay terminals={terminals} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Faster Agents' }));
    expect(useFasterAgentsStore.getState().open).toBe(false);
    expect(enqueueTerminalCommand).not.toHaveBeenCalled();
  });
});
