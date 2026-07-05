import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part } from '@/types/chat';
import { PermissionRequestCard } from './PermissionRequestCard';
import { useJarvisInteractionStore } from './sessionStore';

const repo = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  messageRepo: repo,
}));

const permissionPart: Extract<Part, { kind: 'permission_request' }> = {
  kind: 'permission_request',
  request: {
    id: 'perm_1',
    title: 'Write Composer mode chip',
    description: 'Jarvis wants to edit Composer.tsx.',
    risk: 'medium',
    action: 'write_file',
    targets: ['app/src/features/chat/Composer.tsx'],
    planId: 'plan_1',
    status: 'pending',
  },
};

describe('PermissionRequestCard', () => {
  beforeEach(() => {
    repo.getById.mockReset();
    repo.update.mockReset();
    window.dispatchEvent = vi.fn();
    useJarvisInteractionStore.setState(useJarvisInteractionStore.getInitialState());
    repo.getById.mockResolvedValue({
      id: 'msg_1',
      chat_id: 'chat_1',
      role: 'assistant',
      parts: [permissionPart],
    });
    repo.update.mockResolvedValue({});
  });

  it('approves a request once and dispatches permission context', async () => {
    render(<PermissionRequestCard part={permissionPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Approve once/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'jarvis:send',
      detail: expect.objectContaining({
        structuredContext: expect.objectContaining({
          kind: 'permission_response',
          payload: expect.objectContaining({ status: 'approved' }),
        }),
      }),
    }));
  });

  it('approves all safe changes for this plan', async () => {
    render(<PermissionRequestCard part={permissionPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Approve all safe changes/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(useJarvisInteractionStore.getState().hasPlanSafeApproval('chat_1' as never)).toBe(true);
  });

  it('denies a request without dispatching execution context', async () => {
    render(<PermissionRequestCard part={permissionPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('adds an edited instruction and dispatches it to Jarvis', async () => {
    render(<PermissionRequestCard part={permissionPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Edit request/i }));
    fireEvent.change(screen.getByPlaceholderText(/Add instruction/i), {
      target: { value: 'Only touch the mode chip.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send instruction/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        text: expect.stringContaining('Only touch the mode chip.'),
      }),
    }));
  });
});
