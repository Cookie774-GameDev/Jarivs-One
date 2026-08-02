import { parseTaskApprovalCallId } from '@/features/jarvis-runs/approvalBridge';
import {
  isJarvisAutoApprovableRegistration,
  type JarvisActionCatalog,
} from '@/lib/jarvis/actions/catalog';
import type {
  CreateJarvisApprovalInput,
  JarvisKernelActionPort,
} from '@/lib/jarvis/approvalEngine';
import type { MessageId } from '@/types/common';
import type { ActionRunContext } from './types';

/** @internal Pure adapter; production wiring remains owned by Task 16B. */
export function createCanonicalAutoApprovalAdapter(input: {
  actions: Pick<JarvisKernelActionPort, 'executeAutoApprovedSafe'>;
  catalog: Pick<JarvisActionCatalog, 'resolve'>;
}) {
  return Object.freeze({
    async execute(
      request: Readonly<
        CreateJarvisApprovalInput & {
          callId: string;
          context: ActionRunContext;
        }
      >,
    ) {
      const parsed = parseTaskApprovalCallId(request.callId);
      if (!parsed || !('approvalId' in parsed)) {
        return { kind: 'skipped' as const, reason: 'legacy_or_unknown' as const };
      }
      const registration = input.catalog.resolve(request.actionId);
      if (!registration || registration.version !== request.actionVersion) {
        return { kind: 'skipped' as const, reason: 'action_unavailable' as const };
      }
      if (!isJarvisAutoApprovableRegistration(registration)) {
        return { kind: 'skipped' as const, reason: 'approval_required' as const };
      }
      const { callId: _callId, ...execution } = request;
      return await input.actions.executeAutoApprovedSafe(execution);
    },
  });
}

/**
 * Signature-only compatibility entrypoint until Task 16B injects the
 * canonical adapter. It deliberately has no runner or repository authority.
 */
export async function autoApprovePendingActions(
  _messageId: MessageId,
  _chatId: string,
): Promise<number> {
  return 0;
}
