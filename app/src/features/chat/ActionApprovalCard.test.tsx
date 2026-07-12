import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part } from '@/types/chat';
import { useTerminalCommandQueue } from '@/features/terminals/terminalCommandQueue';
import {
  markTerminalExecution,
  useTerminalExecutionStore,
} from '@/features/terminals/terminalExecutionStore';
import { ActionApprovalCard } from './ActionApprovalCard';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  runAction: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  messageRepo: { getById: mocks.getById, update: mocks.update },
}));

vi.mock('@/lib/actions', () => ({
  resolveAction: vi.fn(() => ({ id: 'terminal.run', label: 'Run command' })),
  runAction: mocks.runAction,
}));

const pendingPart: Extract<Part, { kind: 'action_proposal' }> = {
  kind: 'action_proposal',
  call_id: 'call_1',
  action_id: 'terminal.run',
  params: { command: 'npm test' },
  status: 'pending',
};

function renderCard(part: Extract<Part, { kind: 'action_proposal' }>) {
  return render(
    <ActionApprovalCard
      part={part}
      allParts={[part]}
      messageId={'message_1' as never}
      chatId="chat_1"
    />,
  );
}

describe('ActionApprovalCard terminal lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalCommandQueue.setState({ queue: [] });
    useTerminalExecutionStore.getState().clear();
    mocks.getById.mockResolvedValue({ id: 'message_1', parts: [pendingPart] });
    mocks.update.mockResolvedValue(undefined);
  });

  it('persists queued instead of success when approval only enqueues a command', async () => {
    mocks.runAction.mockResolvedValue({
      ok: true,
      summary: 'Queued.',
      data: { state: 'queued', executionId: 'exec_1' },
    });
    renderCard(pendingPart);

    fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      parts: [expect.objectContaining({
        status: 'queued',
        result: { state: 'queued', executionId: 'exec_1' },
      })],
    }));
  });

  it('renders the live PTY state instead of the stale persisted queue state', () => {
    const queuedPart = {
      ...pendingPart,
      status: 'queued' as const,
      result: { state: 'queued', executionId: 'exec_1' },
    };
    markTerminalExecution('exec_1', 'running', { sessionId: 'pty_1' });

    const { container } = renderCard(queuedPart);

    expect(screen.getByText('Running in Terminal.')).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('data-status')).toBe('running');
  });

  it('cancels only the matching command while it is still queued', async () => {
    const queuedPart = {
      ...pendingPart,
      status: 'queued' as const,
      result: { state: 'queued', executionId: 'exec_1' },
    };
    useTerminalCommandQueue.setState({
      queue: [
        { kind: 'shell', id: 'exec_1', command: 'npm test' },
        { kind: 'shell', id: 'exec_2', command: 'npm run build' },
      ],
    });
    markTerminalExecution('exec_1', 'queued');
    mocks.getById.mockResolvedValue({ id: 'message_1', parts: [queuedPart] });
    renderCard(queuedPart);

    fireEvent.click(screen.getByRole('button', { name: /Cancel command/i }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(useTerminalCommandQueue.getState().queue.map((item) => item.id)).toEqual(['exec_2']);
    expect(useTerminalExecutionStore.getState().executions.exec_1.status).toBe('cancelled');
    expect(mocks.update.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      parts: [expect.objectContaining({ status: 'cancelled' })],
    }));
  });
});
