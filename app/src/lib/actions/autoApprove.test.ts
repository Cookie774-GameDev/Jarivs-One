import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, Part } from '@/types';
import type { ChatId, MessageId } from '@/types/common';
import {
  createJarvisTaskRun,
  useJarvisTaskRunStore,
} from '@/features/jarvis-runs/taskRunStore';
import { createTaskApprovalCallId } from '@/features/jarvis-runs/approvalBridge';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(async () => undefined),
  runAction: vi.fn(async () => ({ ok: true, data: { summary: 'done' } })),
  resolveAction: vi.fn(() => ({ id: 'nav.chat' })),
}));

vi.mock('@/lib/db/repositories', () => ({
  messageRepo: {
    getById: mocks.getById,
    update: mocks.update,
  },
}));

vi.mock('./runner', () => ({
  resolveAction: mocks.resolveAction,
  runAction: mocks.runAction,
}));

import { autoApprovePendingActions } from './autoApprove';

describe('autoApprovePendingActions', () => {
  beforeEach(() => {
    mocks.getById.mockReset();
    mocks.update.mockClear();
    mocks.runAction.mockClear();
    mocks.resolveAction.mockClear();
    useJarvisTaskRunStore.getState().clearForTests();
  });

  it('runs every pending resolvable action', async () => {
    const messageId = 'msg_1' as MessageId;
    const parts: Part[] = [
      {
        kind: 'action_proposal',
        call_id: 'call_1',
        action_id: 'nav.chat',
        params: {},
        status: 'pending',
      },
    ];
    mocks.getById.mockResolvedValue({
      id: messageId,
      chat_id: 'chat_1' as ChatId,
      role: 'assistant',
      parts,
      created_at: 1,
      updated_at: 1,
    } satisfies Message);

    const count = await autoApprovePendingActions(messageId, 'chat_1');
    expect(count).toBe(1);
    expect(mocks.runAction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('does not run an approval that belongs to an already-cancelled task', async () => {
    const messageId = 'msg_cancelled' as MessageId;
    const run = createJarvisTaskRun({
      chatId: 'chat_1',
      goal: 'Do not execute after cancellation.',
      status: 'waiting-for-approval',
      steps: [{
        id: 'step-1',
        action: 'nav.chat',
        label: 'Open chat',
        input: {},
        recoverable: false,
      }],
    });
    useJarvisTaskRunStore.getState().addRun(run);
    useJarvisTaskRunStore.getState().cancelRun(run.id);
    const parts: Part[] = [{
      kind: 'action_proposal',
      call_id: createTaskApprovalCallId(run.id, 'step-1'),
      action_id: 'nav.chat',
      params: {},
      status: 'pending',
    }];
    mocks.getById.mockResolvedValue({
      id: messageId,
      chat_id: 'chat_1' as ChatId,
      role: 'assistant',
      parts,
      created_at: 1,
      updated_at: 1,
    } satisfies Message);

    const count = await autoApprovePendingActions(messageId, 'chat_1');

    expect(count).toBe(0);
    expect(mocks.runAction).not.toHaveBeenCalled();
  });
});
