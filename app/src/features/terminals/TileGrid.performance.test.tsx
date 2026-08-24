import * as React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TileGrid } from './TileGrid';
import { newLeaf } from './paneTree';
import { useTerminalExecutionStore } from './terminalExecutionStore';

const terminalViewRender = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/lib/sfx', () => ({ playUiSound: vi.fn() }));
vi.mock('./TerminalView', () => ({
  TerminalView: () => {
    terminalViewRender();
    return <div data-testid="terminal-view" />;
  },
}));
vi.mock('./AgentRolePicker', () => ({ AgentRolePicker: () => null }));
vi.mock('./ConnectedFilesButton', () => ({ ConnectedFilesButton: () => null }));
vi.mock('./PaneToolbar', () => ({
  nextFontSize: (value: number) => value,
  PaneToolbar: () => null,
}));
vi.mock('./TerminalCompletionIndicator', () => ({ TerminalCompletionIndicator: () => null }));

describe('TileGrid execution-store render isolation', () => {
  beforeEach(() => {
    terminalViewRender.mockReset();
    useTerminalExecutionStore.setState({ executions: {} });
  });

  it('does not rerender mounted terminals for an unrelated execution update', () => {
    render(<TileGrid tree={newLeaf({ id: 'pane-a' })} onChange={vi.fn()} />);
    const initialRenderCount = terminalViewRender.mock.calls.length;
    expect(initialRenderCount).toBeGreaterThan(0);

    act(() => {
      useTerminalExecutionStore.setState({
        executions: {
          unrelated: {
            id: 'unrelated',
            status: 'running',
            updatedAt: 1,
          },
        },
      });
    });

    expect(terminalViewRender).toHaveBeenCalledTimes(initialRenderCount);
  });
});
