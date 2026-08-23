import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTerminalExecutionStore } from './terminalExecutionStore';
import { TerminalCompletionIndicator } from './TerminalCompletionIndicator';

describe('TerminalCompletionIndicator', () => {
  afterEach(() => {
    cleanup();
    useTerminalExecutionStore.getState().clear();
  });

  it.each([
    ['complete', 'Terminal finished'],
    ['failed', 'Terminal failed'],
  ] as const)('marks only the exact %s execution with a non-color status', (status, label) => {
    useTerminalExecutionStore.getState().mark('target', status);
    useTerminalExecutionStore.getState().mark('other', 'running');
    const { container } = render(<TerminalCompletionIndicator executionId="target" />);

    expect(screen.getByRole('status', { name: label })).toBeTruthy();
    expect(container.querySelector('[data-terminal-completion-dot]')).not.toBeNull();
    expect(
      container.querySelector('[data-terminal-completion-state]')?.getAttribute('data-state'),
    ).toBe(status);
  });

  it('stays hidden for running, cancelled, missing, and unrelated executions', () => {
    useTerminalExecutionStore.getState().mark('running', 'running');
    const { container, rerender } = render(<TerminalCompletionIndicator executionId="running" />);
    expect(container.querySelector('[data-terminal-completion-dot]')).toBeNull();

    act(() => useTerminalExecutionStore.getState().mark('running', 'cancelled'));
    rerender(<TerminalCompletionIndicator executionId="running" />);
    expect(container.querySelector('[data-terminal-completion-dot]')).toBeNull();
    rerender(<TerminalCompletionIndicator executionId="missing" />);
    expect(container.querySelector('[data-terminal-completion-dot]')).toBeNull();
  });
});
