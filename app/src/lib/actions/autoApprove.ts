/**
 * Run pending action proposals on a message without user clicks.
 * Used when Jarvis auto-approve mode is on (chat Shift+Tab or voice).
 */
import { messageRepo } from '@/lib/db/repositories';
import { resolveAction, runAction } from './runner';
import type { Part } from '@/types';
import type { MessageId } from '@/types/common';
import {
  beginTaskApprovalStep,
  finishTaskApprovalStep,
} from '@/features/jarvis-runs/approvalBridge';

type ActionPart = Extract<Part, { kind: 'action_proposal' }>;

async function patchActionPart(
  messageId: MessageId,
  callId: string,
  patch: Partial<ActionPart>,
): Promise<void> {
  const msg = await messageRepo.getById(messageId);
  if (!msg) return;
  await messageRepo.update(messageId, {
    parts: msg.parts.map((part) =>
      part.kind === 'action_proposal' && part.call_id === callId ? { ...part, ...patch } : part,
    ),
  });
}

/** Approve and run every pending, resolvable action on a message. */
export async function autoApprovePendingActions(
  messageId: MessageId,
  chatId: string,
): Promise<number> {
  const msg = await messageRepo.getById(messageId);
  if (!msg) return 0;

  const pending = msg.parts.filter(
    (part): part is ActionPart =>
      part.kind === 'action_proposal' && part.status === 'pending' && Boolean(resolveAction(part.action_id)),
  );
  if (pending.length === 0) return 0;

  let executed = 0;
  for (const action of pending) {
    if (!beginTaskApprovalStep(action.call_id)) {
      await patchActionPart(messageId, action.call_id, {
        status: 'error',
        error: 'Task was cancelled before this approval could run.',
      });
      continue;
    }
    executed += 1;
    await patchActionPart(messageId, action.call_id, { status: 'running' });
    const result = await runAction(
      action.action_id,
      action.params,
      {
        source: 'ai',
        chatId,
        messageId,
        callId: action.call_id,
      },
      { emitToast: false },
    );
    const queued = result.ok
      && typeof result.data === 'object'
      && result.data !== null
      && (result.data as { state?: string }).state === 'queued';
    await patchActionPart(
      messageId,
      action.call_id,
      result.ok
        ? { status: queued ? 'queued' : 'success', result: result.data, error: undefined }
        : { status: 'error', error: result.error },
    );
    if (!queued) finishTaskApprovalStep(action.call_id, result);
  }

  return executed;
}
